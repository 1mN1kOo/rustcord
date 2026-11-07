use std::io::Cursor;
use image::{ImageFormat, RgbaImage};
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, SetStretchBltMode, StretchBlt, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, HGDIOBJ, SRCCOPY, STRETCH_HALFTONE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetSystemMetrics, GetWindowLongPtrW, GetWindowRect, GetWindowTextLengthW,
    GetWindowTextW, IsWindowVisible, GWL_EXSTYLE, SM_CXSCREEN, SM_CYSCREEN, WS_EX_TOOLWINDOW,
};

#[derive(serde::Serialize, Clone, Debug)]
pub struct CaptureSource {
    pub id: String,
    pub name: String,
    pub url: String,
    pub icon: Option<String>,
}

const THUMB_W: u32 = 320;
const THUMB_H: u32 = 180;

pub fn get_desktop_sources() -> Vec<CaptureSource> {
    let mut sources = Vec::new();

    // 1. Primary Screen: REAL desktop screenshot
    let screen_thumb = capture_screen_thumbnail(THUMB_W, THUMB_H)
        .unwrap_or_else(|| create_fallback_svg("Весь экран", "🖥️"));

    sources.push(CaptureSource {
        id: "screen:0:0".to_string(),
        name: "Весь экран".to_string(),
        url: screen_thumb,
        icon: None,
    });

    // 2. Enumerate visible desktop windows
    struct WindowEnumData {
        windows: Vec<(HWND, String)>,
    }

    unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam.0 as *mut WindowEnumData);

        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        if (ex_style & WS_EX_TOOLWINDOW.0) != 0 {
            return BOOL(1);
        }

        let mut rect = RECT::default();
        let _ = GetWindowRect(hwnd, &mut rect);
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width < 150 || height < 100 {
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
                && !lower.contains("windows input experience")
                && !lower.contains("settings")
                && !lower.contains("setup")
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

    // Capture real live screenshot for each window
    for (hwnd, title) in data.windows {
        let thumb = capture_window_thumbnail(hwnd, THUMB_W, THUMB_H)
            .unwrap_or_else(|| create_fallback_svg(&title, "🗔"));

        sources.push(CaptureSource {
            id: format!("window:{}:0", hwnd.0 as isize),
            name: title,
            url: thumb,
            icon: None,
        });
    }

    sources
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

        SetStretchBltMode(hdc_mem, STRETCH_HALFTONE);
        let _ = StretchBlt(
            hdc_mem, 0, 0, target_w as i32, target_h as i32,
            Some(hdc_screen), rect.left, rect.top, src_w, src_h,
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

fn create_fallback_svg(title: &str, emoji: &str) -> String {
    let escaped_title = title
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;");

    let display_title = if escaped_title.chars().count() > 24 {
        let s: String = escaped_title.chars().take(22).collect();
        format!("{}...", s)
    } else {
        escaped_title
    };

    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <rect width="100%" height="100%" rx="6" fill="#1e1f22" />
  <rect x="2" y="2" width="316" height="176" rx="5" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1.5" />
  <text x="160" y="85" font-family="'Segoe UI Emoji', sans-serif" font-size="32" text-anchor="middle">{emoji}</text>
  <text x="160" y="125" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600" fill="#949ba4" text-anchor="middle">{display_title}</text>
</svg>"##,
        emoji = emoji,
        display_title = display_title
    );

    format!("data:image/svg+xml;charset=utf-8,{}", urlencoding::encode(&svg))
}
