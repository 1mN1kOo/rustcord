use image::imageops::FilterType;
use image::{ImageFormat, RgbaImage};
use std::io::Cursor;
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, SetStretchBltMode, StretchBlt, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, HGDIOBJ, SRCCOPY, STRETCH_HALFTONE, SetBrushOrgEx,
};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetSystemMetrics, GetWindowLongPtrW, GetWindowRect, GetWindowTextLengthW,
    GetWindowTextW, IsIconic, IsWindowVisible, GWL_EXSTYLE, SM_CXSCREEN, SM_CYSCREEN,
    WS_EX_TOOLWINDOW,
};
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

    if sources.is_empty() {
        let screen_thumb = capture_screen_thumbnail(THUMB_W, THUMB_H).unwrap_or_default();
        sources.push(SourceItem {
            id: "screen:0".to_string(),
            name: "Экран 1".to_string(),
            kind: "screen".to_string(),
            url: Some(screen_thumb.clone()),
            thumb: screen_thumb,
        });
    }

    let mut found_windows = false;
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
            found_windows = true;
        }
    }

    if !found_windows {
        for (hwnd, title) in enumerate_fallback_windows() {
            let win_id = (hwnd.0 as usize) as u32;
            let id = format!("window:{}", win_id);
            let thumb = capture_window_thumbnail(hwnd, THUMB_W, THUMB_H).unwrap_or_default();
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

fn enumerate_fallback_windows() -> Vec<(HWND, String)> {
    struct WindowEnumData {
        windows: Vec<(HWND, String)>,
    }

    unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam.0 as *mut WindowEnumData);

        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return BOOL(1);
        }

        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        if (ex_style & WS_EX_TOOLWINDOW.0) != 0 {
            return BOOL(1);
        }

        let mut cloaked: u32 = 0;
        let hr = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut _ as *mut std::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
        if hr.is_ok() && cloaked != 0 {
            return BOOL(1);
        }

        let mut rect = RECT::default();
        let _ = GetWindowRect(hwnd, &mut rect);
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 150 || height <= 100 {
            return BOOL(1);
        }

        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return BOOL(1);
        }

        let mut buf = vec![0u16; (len + 1) as usize];
        let copied = GetWindowTextW(hwnd, &mut buf);
        if copied > 0 {
            let title = String::from_utf16_lossy(&buf[..copied as usize]).trim().to_string();
            let lower = title.to_lowercase();
            if !title.is_empty()
                && !lower.contains("program manager")
                && !lower.contains("диспетчер программ")
                && !lower.contains("windows input")
                && !lower.contains("интерфейс ввода")
                && !lower.contains("cortana")
                && !lower.contains("settings")
                && !lower.contains("параметры")
            {
                data.windows.push((hwnd, title));
            }
        }

        BOOL(1)
    }

    let mut data = WindowEnumData { windows: Vec::new() };
    unsafe {
        let _ = EnumWindows(Some(enum_windows_callback), LPARAM(&mut data as *mut _ as isize));
    }
    data.windows
}

fn capture_screen_thumbnail(target_w: u32, target_h: u32) -> Option<String> {
    unsafe {
        let screen_w = GetSystemMetrics(SM_CXSCREEN);
        let screen_h = GetSystemMetrics(SM_CYSCREEN);
        if screen_w <= 0 || screen_h <= 0 {
            return None;
        }

        let hdc_screen = GetDC(None);
        if hdc_screen.is_invalid() {
            return None;
        }

        let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
        let hbm = CreateCompatibleBitmap(hdc_screen, target_w as i32, target_h as i32);
        let old_bm = SelectObject(hdc_mem, HGDIOBJ(hbm.0));

        SetStretchBltMode(hdc_mem, STRETCH_HALFTONE);
        let _ = SetBrushOrgEx(hdc_mem, 0, 0, None);
        let _ = StretchBlt(
            hdc_mem, 0, 0, target_w as i32, target_h as i32,
            Some(hdc_screen), 0, 0, screen_w, screen_h,
            SRCCOPY,
        );

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: target_w as i32,
                biHeight: -(target_h as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut raw_pixels = vec![0u8; (target_w * target_h * 4) as usize];
        let lines = GetDIBits(
            hdc_mem,
            hbm,
            0,
            target_h,
            Some(raw_pixels.as_mut_ptr() as _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old_bm);
        let _ = DeleteObject(HGDIOBJ(hbm.0));
        let _ = DeleteDC(hdc_mem);
        ReleaseDC(None, hdc_screen);

        if lines == 0 {
            return None;
        }

        for chunk in raw_pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2);
            chunk[3] = 255;
        }

        if let Some(img) = RgbaImage::from_raw(target_w, target_h, raw_pixels) {
            let mut jpeg_bytes = Vec::new();
            let mut cursor = Cursor::new(&mut jpeg_bytes);
            if img.write_to(&mut cursor, ImageFormat::Jpeg).is_ok() {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes);
                return Some(format!("data:image/jpeg;base64,{}", b64));
            }
        }

        None
    }
}

fn capture_window_thumbnail(hwnd: HWND, target_w: u32, target_h: u32) -> Option<String> {
    unsafe {
        let mut rect = RECT::default();
        let _ = GetWindowRect(hwnd, &mut rect);
        let src_w = (rect.right - rect.left).max(1);
        let src_h = (rect.bottom - rect.top).max(1);

        let hdc_screen = GetDC(None);
        if hdc_screen.is_invalid() {
            return None;
        }

        let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
        let hbm = CreateCompatibleBitmap(hdc_screen, target_w as i32, target_h as i32);
        let old_bm = SelectObject(hdc_mem, HGDIOBJ(hbm.0));

        let mut print_ok = PrintWindow(hwnd, hdc_mem, PRINT_WINDOW_FLAGS(2)).as_bool();
        if !print_ok {
            print_ok = PrintWindow(hwnd, hdc_mem, PRINT_WINDOW_FLAGS(0)).as_bool();
        }

        if !print_ok {
            SetStretchBltMode(hdc_mem, STRETCH_HALFTONE);
            let _ = SetBrushOrgEx(hdc_mem, 0, 0, None);
            let _ = StretchBlt(
                hdc_mem, 0, 0, target_w as i32, target_h as i32,
                Some(hdc_screen), rect.left, rect.top, src_w, src_h,
                SRCCOPY,
            );
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: target_w as i32,
                biHeight: -(target_h as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut raw_pixels = vec![0u8; (target_w * target_h * 4) as usize];
        let lines = GetDIBits(
            hdc_mem,
            hbm,
            0,
            target_h,
            Some(raw_pixels.as_mut_ptr() as _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old_bm);
        let _ = DeleteObject(HGDIOBJ(hbm.0));
        let _ = DeleteDC(hdc_mem);
        ReleaseDC(None, hdc_screen);

        if lines == 0 {
            return None;
        }

        for chunk in raw_pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2);
            chunk[3] = 255;
        }

        if let Some(img) = RgbaImage::from_raw(target_w, target_h, raw_pixels) {
            let mut jpeg_bytes = Vec::new();
            let mut cursor = Cursor::new(&mut jpeg_bytes);
            if img.write_to(&mut cursor, ImageFormat::Jpeg).is_ok() {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes);
                return Some(format!("data:image/jpeg;base64,{}", b64));
            }
        }

        None
    }
}
