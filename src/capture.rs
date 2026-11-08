use image::{ImageFormat, RgbaImage};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::ipc::{Channel, InvokeResponseBody};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, SetBrushOrgEx, SetStretchBltMode, StretchBlt, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ, SRCCOPY, STRETCH_HALFTONE,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, IsIconic, IsWindow, IsWindowVisible};
use xcap::{Monitor, Window};

static CURRENT_SESSION_ID: AtomicU64 = AtomicU64::new(0);
static IS_CAPTURING: AtomicBool = AtomicBool::new(false);

fn capture_window_hwnd(hwnd: HWND) -> Option<RgbaImage> {
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() || !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return None;
        }

        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return None;
        }

        let width = (rect.right - rect.left).max(1) as u32;
        let height = (rect.bottom - rect.top).max(1) as u32;

        if width <= 10 || height <= 10 {
            return None;
        }

        let hdc_screen = GetDC(None);
        if hdc_screen.is_invalid() {
            return None;
        }

        let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
        let hbm = CreateCompatibleBitmap(hdc_screen, width as i32, height as i32);
        let old_bm = SelectObject(hdc_mem, HGDIOBJ(hbm.0));

        let mut print_ok = PrintWindow(hwnd, hdc_mem, PRINT_WINDOW_FLAGS(2)).as_bool();
        if !print_ok {
            print_ok = PrintWindow(hwnd, hdc_mem, PRINT_WINDOW_FLAGS(0)).as_bool();
        }

        if !print_ok {
            SetStretchBltMode(hdc_mem, STRETCH_HALFTONE);
            let _ = SetBrushOrgEx(hdc_mem, 0, 0, None);
            let _ = StretchBlt(
                hdc_mem, 0, 0, width as i32, height as i32,
                Some(hdc_screen), rect.left, rect.top, width as i32, height as i32,
                SRCCOPY,
            );
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut raw_pixels = vec![0u8; (width * height * 4) as usize];
        let lines = GetDIBits(
            hdc_mem,
            hbm,
            0,
            height,
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

        RgbaImage::from_raw(width, height, raw_pixels)
    }
}

#[tauri::command]
pub fn start_capture(
    id: String,
    fps: Option<u32>,
    width: Option<u32>,
    height: Option<u32>,
    on_frame: Channel<InvokeResponseBody>,
) {
    let session_id = CURRENT_SESSION_ID.fetch_add(1, Ordering::SeqCst) + 1;
    IS_CAPTURING.store(true, Ordering::SeqCst);

    let target_fps = fps.unwrap_or(30).clamp(10, 60);
    let max_width = width.unwrap_or(1920).clamp(640, 3840);
    let max_height = height.unwrap_or(1080).clamp(360, 2160);
    let frame_interval = Duration::from_millis(1000 / target_fps as u64);

    std::thread::spawn(move || {
        let is_window = id.starts_with("window:");
        let target_raw_id: Option<u32> = id
            .split(':')
            .nth(1)
            .and_then(|s| s.parse::<i64>().ok().map(|v| (v as usize) as u32));

        let cached_window = if is_window {
            if let Some(target_id) = target_raw_id {
                Window::all().ok().and_then(|wins| {
                    wins.into_iter().find(|w| w.id().unwrap_or(0) == target_id)
                })
            } else {
                None
            }
        } else {
            None
        };

        let mut cached_monitor = if !is_window {
            if let Some(target_id) = target_raw_id {
                Monitor::all().ok().and_then(|mons| {
                    mons.into_iter().find(|m| m.id().unwrap_or(0) == target_id)
                })
            } else {
                Monitor::all().ok().and_then(|mut mons| mons.pop())
            }
        } else {
            None
        };

        while IS_CAPTURING.load(Ordering::SeqCst)
            && CURRENT_SESSION_ID.load(Ordering::SeqCst) == session_id
        {
            let loop_start = Instant::now();

            let maybe_img = if is_window {
                let mut img = None;
                if let Some(ref w) = cached_window {
                    if !w.is_minimized().unwrap_or(false) {
                        img = w.capture_image().ok();
                    }
                }
                if img.is_none() {
                    if let Some(target_id) = target_raw_id {
                        let hwnd = HWND((target_id as i32 as isize) as *mut _);
                        img = capture_window_hwnd(hwnd);
                    }
                }
                img
            } else {
                let mut img = None;
                if let Some(ref m) = cached_monitor {
                    img = m.capture_image().ok();
                } else if let Ok(mut mons) = Monitor::all() {
                    if let Some(m) = mons.pop() {
                        img = m.capture_image().ok();
                        cached_monitor = Some(m);
                    }
                }
                img
            };

            if let Some(img) = maybe_img {
                let (target_w, target_h) = if img.width() > max_width || img.height() > max_height {
                    let ratio = (max_width as f32 / img.width() as f32)
                        .min(max_height as f32 / img.height() as f32);
                    ((img.width() as f32 * ratio) as u32, (img.height() as f32 * ratio) as u32)
                } else {
                    (img.width(), img.height())
                };

                let final_img = if target_w != img.width() || target_h != img.height() {
                    image::imageops::resize(&img, target_w, target_h, image::imageops::FilterType::Nearest)
                } else {
                    img
                };

                let mut jpeg_bytes = Vec::new();
                let mut cursor = Cursor::new(&mut jpeg_bytes);
                if final_img.write_to(&mut cursor, ImageFormat::Jpeg).is_ok() {
                    if on_frame.send(InvokeResponseBody::Raw(jpeg_bytes)).is_err() {
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
