use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn get_themes_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|p| p.join("themes"))
}

pub fn read_user_theme(themes_dir: &Path) -> Option<String> {
    if !themes_dir.exists() {
        let _ = fs::create_dir_all(themes_dir);
        return None;
    }

    if let Ok(entries) = fs::read_dir(themes_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("css") {
                if let Ok(content) = fs::read_to_string(&path) {
                    return Some(content);
                }
            }
        }
    }
    None
}

pub fn apply_theme(app: &AppHandle, css: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let json_css = serde_json::to_string(css).unwrap_or_else(|_| "\"\"".to_string());
        let js = format!(
            r#"(function() {{
                try {{
                    let style = document.getElementById("user-theme");
                    if (!style) {{
                        style = document.createElement("style");
                        style.id = "user-theme";
                        (document.head || document.documentElement).appendChild(style);
                    }}
                    style.textContent = {json_css};
                    window.dispatchEvent(new CustomEvent("theme-changed", {{ detail: {json_css} }}));
                }} catch (e) {{}}
            }})();"#,
            json_css = json_css
        );
        let _ = window.eval(&js);
    }
}

pub fn init_theme_manager(app: AppHandle) {
    std::thread::spawn(move || {
        let themes_dir = match get_themes_dir(&app) {
            Some(dir) => dir,
            None => return,
        };

        if !themes_dir.exists() {
            let _ = fs::create_dir_all(&themes_dir);
        }

        if let Some(css) = read_user_theme(&themes_dir) {
            apply_theme(&app, &css);
        }

        let app_watcher = app.clone();
        let watch_dir = themes_dir.clone();

        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default(),
        ) {
            Ok(w) => w,
            Err(_) => return,
        };

        if watcher.watch(&themes_dir, RecursiveMode::NonRecursive).is_err() {
            return;
        }

        while let Ok(Ok(_event)) = rx.recv() {
            std::thread::sleep(std::time::Duration::from_millis(100));
            while rx.try_recv().is_ok() {}

            if let Some(css) = read_user_theme(&watch_dir) {
                apply_theme(&app_watcher, &css);
            } else {
                apply_theme(&app_watcher, "");
            }
        }
    });
}
