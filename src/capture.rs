use base64::Engine;
use image::ImageFormat;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use xcap::{Monitor, Window};

static CURRENT_SESSION_ID: AtomicU64 = AtomicU64::new(0);
static IS_CAPTURING: AtomicBool = AtomicBool::new(false);

#[derive(serde::Serialize, Clone, Debug)]
pub struct FramePayload {
    pub data: String,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub fn start_capture(id: String, fps: Option<u32>, on_frame: Channel<FramePayload>) {
    let session_id = CURRENT_SESSION_ID.fetch_add(1, Ordering::SeqCst) + 1;
    IS_CAPTURING.store(true, Ordering::SeqCst);

    let target_fps = fps.unwrap_or(30).clamp(10, 60);
    let frame_interval = Duration::from_millis(1000 / target_fps as u64);

    std::thread::spawn(move || {
        let is_window = id.starts_with("window:");
        let target_raw_id: Option<u32> = id
            .split(':')
            .nth(1)
            .and_then(|s| s.parse::<u32>().ok());

        while IS_CAPTURING.load(Ordering::SeqCst)
            && CURRENT_SESSION_ID.load(Ordering::SeqCst) == session_id
        {
            let loop_start = Instant::now();

            let maybe_img = if is_window {
                let windows = Window::all().unwrap_or_default();
                let found = if let Some(target_id) = target_raw_id {
                    windows.into_iter().find(|w| w.id().unwrap_or(0) == target_id)
                } else {
                    windows.into_iter().next()
                };

                if let Some(w) = found {
                    if w.is_minimized().unwrap_or(false) {
                        None
                    } else {
                        w.capture_image().ok()
                    }
                } else {
                    None
                }
            } else {
                let monitors = Monitor::all().unwrap_or_default();
                let found = if let Some(target_id) = target_raw_id {
                    monitors.into_iter().find(|m| m.id().unwrap_or(0) == target_id)
                } else {
                    monitors.into_iter().next()
                };

                if let Some(m) = found {
                    m.capture_image().ok()
                } else {
                    None
                }
            };

            if let Some(img) = maybe_img {
                let width = img.width();
                let height = img.height();

                let mut jpeg_bytes = Vec::new();
                let mut cursor = Cursor::new(&mut jpeg_bytes);
                if img.write_to(&mut cursor, ImageFormat::Jpeg).is_ok() {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes);
                    let payload = FramePayload {
                        data: format!("data:image/jpeg;base64,{}", b64),
                        width,
                        height,
                    };
                    if on_frame.send(payload).is_err() {
                        break;
                    }
                }
            }

            let elapsed = loop_start.elapsed();
            if elapsed < frame_interval {
                std::thread::sleep(frame_interval - elapsed);
            }
        }
    });
}

#[tauri::command]
pub fn stop_capture() {
    IS_CAPTURING.store(false, Ordering::SeqCst);
    CURRENT_SESSION_ID.fetch_add(1, Ordering::SeqCst);
}
