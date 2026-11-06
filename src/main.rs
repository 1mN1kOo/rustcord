#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

fn main() {
    // 1. Force dark background and GPU acceleration in Microsoft Edge WebView2
    // --default-background-color=0xFF1E1F22 prevents the initial white flashbang!
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--default-background-color=0xFF1E1F22 --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist --enable-features=VaapiVideoDecoder,CanvasOopRasterization",
    );

    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // Inject script to block telemetry and enhance performance
                let script = include_str!("inject.js");
                let _ = window.eval(script);

                // Build Tray Context Menu
                let show_i = MenuItem::with_id(app, "show", "Show Rustcord", true, None::<&str>)?;
                let reload_i = MenuItem::with_id(app, "reload", "Reload", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Quit Rustcord", true, None::<&str>)?;

                let menu = Menu::with_items(app, &[&show_i, &reload_i, &quit_i])?;

                // Build System Tray Icon
                if let Some(icon) = app.default_window_icon() {
                    let _tray = TrayIconBuilder::new()
                        .icon(icon.clone())
                        .tooltip("Rustcord")
                        .menu(&menu)
                        .show_menu_on_left_click(false)
                        .on_menu_event(|app, event| match event.id.as_ref() {
                            "show" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                            "reload" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.eval("window.location.reload()");
                                }
                            }
                            "quit" => {
                                app.exit(0);
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
                                let app = tray.app_handle();
                                if let Some(w) = app.get_webview_window("main") {
                                    if w.is_visible().unwrap_or(false) {
                                        let _ = w.hide();
                                    } else {
                                        let _ = w.show();
                                        let _ = w.set_focus();
                                    }
                                }
                            }
                        })
                        .build(app)?;
                }

                // Smoothly reveal window after dark background initialization (ZERO white flash!)
                let w_show = window.clone();
                tauri::async_runtime::spawn(async move {
                    std::thread::sleep(std::time::Duration::from_millis(300));
                    let _ = w_show.show();
                    let _ = w_show.set_focus();
                });

                // Close button hides window to system tray instead of exiting
                let w_close = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w_close.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
