#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod dpi_bypass;
mod updater;
mod windows_capture;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

fn main() {
    let settings = updater::load_settings();
    if settings.dpi_bypass {
        dpi_bypass::start_dpi_proxy();
    }

    // Force native desktop app flags in Microsoft Edge WebView2:
    // 1. --use-fake-ui-for-media-stream: Auto-grants mic, camera & screen share without permission prompts!
    // 2. --enable-usermedia-screen-capturing: Enables native-level screen sharing with audio.
    // 3. --autoplay-policy=no-user-gesture-required: Auto-plays calls and media without requiring user clicks.
    // 4. --disable-background-timer-throttling & --disable-renderer-backgrounding: Never throttles in background while gaming!
    // 5. --default-background-color=0xFF1E1F22: Kills initial white flashbang.
    // 6. Disable browser UI bloat (PDF, Translator, SmartScreen popups).
    // 7. --proxy-server: routes traffic through built-in pure-Rust DPI bypass proxy if enabled.
    let mut browser_args = String::from(
        "--default-background-color=0xFF1E1F22 \
         --enable-gpu-rasterization \
         --enable-zero-copy \
         --ignore-gpu-blocklist \
         --enable-features=VaapiVideoDecoder,CanvasOopRasterization,WebRTCPipeWireCapturer,ScreenCapture \
         --use-fake-ui-for-media-stream \
         --enable-usermedia-screen-capturing \
         --autoplay-policy=no-user-gesture-required \
         --disable-features=msWebOOUI,msPdf,msSmartScreenProtection,Translate \
         --disable-component-update \
         --disable-background-timer-throttling \
         --disable-backgrounding-occluded-windows \
         --disable-renderer-backgrounding",
    );

    if settings.dpi_bypass {
        browser_args.push_str(&format!(
            " --proxy-server=socks5://127.0.0.1:{}",
            dpi_bypass::DPI_PROXY_PORT
        ));
    }

    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", browser_args);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Create window with initialization_script (runs at document_start before any page script!)
            let script = include_str!("inject.js");
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
            .on_navigation({
                let nav_app = app_handle.clone();
                move |url| {
                    if url.scheme() == "https" && url.host_str() == Some("rustcord.local") {
                        let path = url.path().trim_start_matches('/');
                        match path {
                            "check-update" => {
                                let h = nav_app.clone();
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
                                let mut download_url = None;
                                for (k, v) in url.query_pairs() {
                                    if k == "url" && !v.is_empty() {
                                        download_url = Some(v.into_owned());
                                    }
                                }
                                let h = nav_app.clone();
                                std::thread::spawn(move || {
                                    if let Err(e) = updater::download_and_apply_update(download_url) {
                                        if let Some(w) = h.get_webview_window("main") {
                                            let _ = w.eval(&format!(
                                                "if (window.__RUSTCORD_UPDATE_ERROR__) window.__RUSTCORD_UPDATE_ERROR__('{}');",
                                                e.replace('\'', "\\'")
                                            ));
                                        }
                                    }
                                });
                            }
                            "set-auto-update" => {
                                for (k, v) in url.query_pairs() {
                                    if k == "enabled" {
                                        let enabled = v == "true" || v == "1";
                                        updater::set_auto_update(enabled);
                                    }
                                }
                            }
                            "set-dpi-bypass" => {
                                for (k, v) in url.query_pairs() {
                                    if k == "enabled" {
                                        let enabled = v == "true" || v == "1";
                                        let mut s = updater::load_settings();
                                        s.dpi_bypass = enabled;
                                        updater::save_settings(&s);
                                        if let Some(w) = nav_app.get_webview_window("main") {
                                            let msg = if enabled {
                                                "✓ Обход блокировок (DPI) включен. Перезапустите приложение для применения."
                                            } else {
                                                "⚠️ Обход блокировок (DPI) выключен. Перезапустите приложение для применения."
                                            };
                                            let _ = w.eval(&format!("if (window.__RUSTCORD_TOAST__) window.__RUSTCORD_TOAST__('{}');", msg));
                                        }
                                    }
                                }
                            }
                            "get-settings" => {
                                let s = updater::load_settings();
                                if let Some(w) = nav_app.get_webview_window("main") {
                                    let json = serde_json::to_string(&s).unwrap_or_default();
                                    let _ = w.eval(&format!(
                                        "if (window.__RUSTCORD_INIT_SETTINGS__) window.__RUSTCORD_INIT_SETTINGS__({});",
                                        json
                                    ));
                                }
                            }
                            _ => {}
                        }
                        return false;
                    }
                    true
                }
            })
            .build()?;

            // Build Tray Context Menu
            let settings = updater::load_settings();
            let ver_i = MenuItem::with_id(app, "ver", "Rustcord v1.1.4", false, None::<&str>)?;
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

            // Set window and taskbar icon explicitly
            if let Some(icon) = app.default_window_icon() {
                let _ = window.set_icon(icon.clone());
                let auto_update_check = auto_update_i.clone();
                let dpi_check = dpi_i.clone();

                let _tray = TrayIconBuilder::new()
                    .icon(icon.clone())
                    .tooltip("Rustcord v1.1.4")
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
                                    "✓ Обход блокировок (DPI) включен. Перезапустите Rustcord для применения."
                                } else {
                                    "⚠️ Обход блокировок (DPI) выключен. Перезапустите Rustcord для применения."
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
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                if w.is_visible().unwrap_or(false) {
                                    let _ = w.hide();
                                } else {
                                    let _ = w.show();
                                    let _ = w.unminimize();
                                    let _ = w.set_focus();
                                }
                            }
                        }
                    })
                    .build(app)?;
            }

            // Smoothly reveal window after dark background initialization (ZERO white flash!)
            let w_show = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(300));
                let _ = w_show.show();
                let _ = w_show.set_focus();
            });

            // Periodically update desktop sources for the in-app screen capture modal
            let w_sources = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(3000));
                loop {
                    let sources = windows_capture::get_desktop_sources();
                    if let Ok(json) = serde_json::to_string(&sources) {
                        let script = format!("window.__RUSTCORD_SOURCES__ = {}; if (window.__UPDATE_RUSTCORD_SOURCES__) window.__UPDATE_RUSTCORD_SOURCES__();", json);
                        let _ = w_sources.eval(&script);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                }
            });

            // Background Auto-Update Check Thread
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

            // When user closes the window, fully terminate the application and its background processes!
            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { .. } = event {
                    std::process::exit(0);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
