use image::imageops::FilterType;
use image::ImageFormat;
use std::io::Cursor;
use xcap::{Monitor, Window};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SourceItem {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub thumb: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

const THUMB_W: u32 = 320;
const THUMB_H: u32 = 180;

pub fn list_sources_internal() -> Vec<SourceItem> {
    let mut sources = Vec::new();

    if let Ok(monitors) = Monitor::all() {
        for (idx, monitor) in monitors.into_iter().enumerate() {
            let name = monitor.name().unwrap_or_else(|_| format!("Экран {}", idx + 1));
            let mon_id = monitor.id().unwrap_or(idx as u32);
            let id = format!("screen:{}", mon_id);
            let thumb = if let Ok(img) = monitor.capture_image() {
                let resized = image::imageops::resize(&img, THUMB_W, THUMB_H, FilterType::Triangle);
                let mut buf = Vec::new();
                let mut cursor = Cursor::new(&mut buf);
                if resized.write_to(&mut cursor, ImageFormat::Jpeg).is_ok() {
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
                    format!("data:image/jpeg;base64,{}", b64)
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            sources.push(SourceItem {
                id,
                name,
                kind: "screen".to_string(),
                url: Some(thumb.clone()),
                thumb,
            });
        }
    }

    if let Ok(windows) = Window::all() {
        for (w_idx, window) in windows.into_iter().enumerate() {
            if window.is_minimized().unwrap_or(false) {
                continue;
            }

            let title = window.title().unwrap_or_default().trim().to_string();
            if title.is_empty() {
                continue;
            }

            let lower = title.to_lowercase();
            if lower.contains("program manager")
                || lower.contains("диспетчер программ")
                || lower.contains("windows input")
                || lower.contains("интерфейс ввода")
                || lower.contains("cortana")
                || lower.contains("settings")
                || lower.contains("параметры")
            {
                continue;
            }

            let win_id = window.id().unwrap_or(w_idx as u32);
            let id = format!("window:{}", win_id);
            let thumb = if let Ok(img) = window.capture_image() {
                if img.width() <= 10 || img.height() <= 10 {
                    continue;
                }
                let resized = image::imageops::resize(&img, THUMB_W, THUMB_H, FilterType::Triangle);
                let mut buf = Vec::new();
                let mut cursor = Cursor::new(&mut buf);
                if resized.write_to(&mut cursor, ImageFormat::Jpeg).is_ok() {
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
                    format!("data:image/jpeg;base64,{}", b64)
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            sources.push(SourceItem {
                id,
                name: title,
                kind: "window".to_string(),
                url: Some(thumb.clone()),
                thumb,
            });
        }
    }

    sources
}

#[tauri::command]
pub fn list_sources() -> Vec<SourceItem> {
    list_sources_internal()
}
