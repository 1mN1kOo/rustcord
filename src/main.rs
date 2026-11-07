#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod dpi_bypass;
mod updater;
mod windows_capture;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

fn handle_native_ipc(
    app: &tauri::AppHandle,
    action: &str,
    url_param: Option<String>,
    enabled_param: Option<bool>,
) {
    match action {
        "check-update" => {
            let h = app.clone();
            std::thread::spawn(move || {
                if let Some(info) = updater::fetch_version_info() {
                    if let Some(w) = h.get_webview_window("main") {
                        let json = serde_json::to_string(&info).unwrap_or_default();
                        let _ = w.eval(&format!(
                            "if (window.__RUSTCORD_HANDLE_UPDATE_CHECK__) window.__RUSTCORD_HANDLE_UPDATE_CHECK__({}, false);",
                            json
                        ));
                    }
                }
            });
        }
        "download-and-apply" => {
            let h = app.clone();
            std::thread::spawn(move || {
                if let Some(w) = h.get_webview_window("main") {
                    let w_prog = w.clone();
                    let res = updater::download_and_apply_update(url_param, move |current, total, speed| {
                        let percent = (current as f64 / total as f64 * 100.0).min(100.0);
                        let _ = w_prog.eval(&format!(
                            "if (window.__RUSTCORD_UPDATE_PROGRESS__) window.__RUSTCORD_UPDATE_PROGRESS__({{ downloaded: {}, total: {}, percent: {:.1}, speed: {:.2} }});",
                            current, total, percent, speed
                        ));
                    });
                    if let Err(e) = res {
                        let _ = w.eval(&format!(
                            "if (window.__RUSTCORD_UPDATE_ERROR__) window.__RUSTCORD_UPDATE_ERROR__('{}');",
                            e.replace('\'', "\\'")
                        ));
                    }
                }
            });
        }
        "set-auto-update" => {
            if let Some(enabled) = enabled_param {
                updater::set_auto_update(enabled);
            }
        }
        "set-dpi-bypass" => {
            if let Some(enabled) = enabled_param {
                let mut s = updater::load_settings();
                s.dpi_bypass = enabled;
                updater::save_settings(&s);
                if let Some(w) = app.get_webview_window("main") {
                    let msg = if enabled {
                        "Обход блокировок (DPI) включен. Перезапустите приложение для применения."
                    } else {
                        "Обход блокировок (DPI) выключен. Перезапустите приложение для применения."
                    };
                    let _ = w.eval(&format!(
                        "if (window.__RUSTCORD_TOAST__) window.__RUSTCORD_TOAST__('{}');",
                        msg
                    ));
                }
            }
        }
        "get-settings" => {
            let s = updater::load_settings();
            if let Some(w) = app.get_webview_window("main") {
                let json = serde_json::to_string(&s).unwrap_or_default();
                let _ = w.eval(&format!(
                    "if (window.__RUSTCORD_INIT_SETTINGS__) window.__RUSTCORD_INIT_SETTINGS__({});",
                    json
                ));
            }
        }
        _ => {}
    }
}

fn main() {
    let settings = updater::load_settings();
    if settings.dpi_bypass {
        dpi_bypass::start_dpi_proxy();
    }

    let mut browser_args = String::from(
        "--default-background-color=0xFF1E1F22 \
         --use-fake-ui-for-media-stream \
         --enable-usermedia-screen-capturing \
         --autoplay-policy=no-user-gesture-required \
         --disable-background-timer-throttling \
         --disable-renderer-backgrounding \
         --disable-features=Translate,OptimizationHints,MediaRouter,CalculateNativeWinOcclusion \
         --disable-component-update \
         --disable-domain-reliability \
         --no-default-browser-check \
         --no-first-run \
         --disable-breakpad",
    );

    if settings.dpi_bypass {
        browser_args.push_str(&format!(
            " --proxy-server=socks5://127.0.0.1:{}",
            dpi_bypass::DPI_PROXY_PORT
        ));
    }

    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", &browser_args);

    let script = include_str!("inject.js");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .setup(move |app| {
            let app_handle = app.handle().clone();

            let window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External("https://discord.com/app".parse().unwrap()),
            )
            .title("Rustcord")
            .inner_size(1280.0, 800.0)
            .min_inner_size(800.0, 500.0)
            .visible(false)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
            .initialization_script(script)
            .on_document_title_changed({
                let title_app = app_handle.clone();
                move |_w, title| {
                    if let Some(rest) = title.strip_prefix("__RC_IPC__:") {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(rest) {
                            let action = val.get("action").and_then(|a| a.as_str()).unwrap_or_default();
                            let params = val.get("params");
                            let url_param = params.and_then(|p| p.get("url")).and_then(|u| u.as_str()).map(|s| s.to_string());
                            let enabled_param = params.and_then(|p| p.get("enabled")).and_then(|e| e.as_bool());
                            handle_native_ipc(&title_app, action, url_param, enabled_param);
                        }
                    }
                }
            })
            .on_navigation({
                let nav_app = app_handle.clone();
                move |url| {
                    if url.scheme() == "https" && url.host_str() == Some("rustcord.local") {
                        let action = url.path().trim_start_matches('/');
                        let mut url_param = None;
                        let mut enabled_param = None;
                        for (k, v) in url.query_pairs() {
                            if k == "url" && !v.is_empty() {
                                url_param = Some(v.into_owned());
                            } else if k == "enabled" {
                                enabled_param = Some(v == "true" || v == "1");
                            }
                        }
                        handle_native_ipc(&nav_app, action, url_param, enabled_param);
                        return false;
                    }
                    true
                }
            })
            .build()?;

            let settings = updater::load_settings();
            let ver_i = MenuItem::with_id(app, "ver", "Rustcord v1.1.5", false, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Показать Rustcord", true, None::<&str>)?;
            let reload_i = MenuItem::with_id(app, "reload", "Перезагрузить", true, None::<&str>)?;
            let update_i = MenuItem::with_id(app, "update", "Проверить обновления", true, None::<&str>)?;
            let auto_update_i = CheckMenuItem::with_id(
                app,
                "auto_update",
                "Автообновление",
                true,
                settings.auto_update,
                None::<&str>,
            )?;
            let dpi_i = CheckMenuItem::with_id(
                app,
                "dpi_bypass",
                "Обход блокировок (DPI)",
                true,
                settings.dpi_bypass,
                None::<&str>,
            )?;
            let quit_i = MenuItem::with_id(app, "quit", "Выйти из Rustcord", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[&ver_i, &show_i, &reload_i, &update_i, &auto_update_i, &dpi_i, &quit_i],
            )?;

            if let Some(icon) = app.default_window_icon() {
                let _ = window.set_icon(icon.clone());
                let auto_update_check = auto_update_i.clone();
                let dpi_check = dpi_i.clone();

                let _tray = TrayIconBuilder::new()
                    .icon(icon.clone())
                    .tooltip("Rustcord v1.1.5")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(move |app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                        "reload" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.eval("window.location.reload()");
                            }
                        }
                        "update" => {
                            let h = app.clone();
                            std::thread::spawn(move || {
                                if let Some(info) = updater::fetch_version_info() {
                                    if let Some(w) = h.get_webview_window("main") {
                                        let json = serde_json::to_string(&info).unwrap_or_default();
                                        let _ = w.eval(&format!(
                                            "if (window.__RUSTCORD_HANDLE_UPDATE_CHECK__) window.__RUSTCORD_HANDLE_UPDATE_CHECK__({}, true);",
                                            json
                                        ));
                                    }
                                }
                            });
                        }
                        "auto_update" => {
                            let enabled = updater::toggle_auto_update();
                            let _ = auto_update_check.set_checked(enabled);
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.eval(&format!(
                                    "if (window.__RUSTCORD_SET_AUTOUPDATE__) window.__RUSTCORD_SET_AUTOUPDATE__({});",
                                    enabled
                                ));
                            }
                        }
                        "dpi_bypass" => {
                            let mut s = updater::load_settings();
                            s.dpi_bypass = !s.dpi_bypass;
                            updater::save_settings(&s);
                            let _ = dpi_check.set_checked(s.dpi_bypass);
                            if let Some(w) = app.get_webview_window("main") {
                                let msg = if s.dpi_bypass {
                                    "Обход блокировок (DPI) включен. Перезапустите Rustcord для применения."
                                } else {
                                    "Обход блокировок (DPI) выключен. Перезапустите Rustcord для применения."
                                };
                                let _ = w.eval(&format!(
                                    "if (window.__RUSTCORD_TOAST__) window.__RUSTCORD_TOAST__('{}');",
                                    msg
                                ));
                            }
                        }
                        "quit" => {
                            std::process::exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(w) = tray.app_handle().get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            let w_reveal = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(60));
                let _ = w_reveal.show();
                let _ = w_reveal.set_focus();
            });

            let w_sources = window.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_millis(1500));
                let sources = windows_capture::get_desktop_sources();
                if let Ok(json) = serde_json::to_string(&sources) {
                    let _ = w_sources.eval(&format!(
                        "window.__RUSTCORD_SOURCES__ = {}; if (window.__UPDATE_RUSTCORD_SOURCES__) window.__UPDATE_RUSTCORD_SOURCES__();",
                        json
                    ));
                }
            });

            let w_updater = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(5));
                loop {
                    let s = updater::load_settings();
                    if s.auto_update {
                        if let Some(info) = updater::fetch_version_info() {
                            if info.has_update {
                                let json = serde_json::to_string(&info).unwrap_or_default();
                                let _ = w_updater.eval(&format!(
                                    "if (window.__RUSTCORD_HANDLE_UPDATE_CHECK__) window.__RUSTCORD_HANDLE_UPDATE_CHECK__({}, false);",
                                    json
                                ));
                            }
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_secs(s.check_interval_mins.max(5) * 60));
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
