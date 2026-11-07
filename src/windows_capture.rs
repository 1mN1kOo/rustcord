use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowLongPtrW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
    IsWindowVisible, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
};

#[derive(serde::Serialize, Clone, Debug)]
pub struct CaptureSource {
    pub id: String,
    pub name: String,
    pub url: String,
    pub icon: Option<String>,
}

pub fn get_desktop_sources() -> Vec<CaptureSource> {
    let mut sources = Vec::new();

    // 1. Add Primary Screen
    let screen_svg = format!(
        "data:image/svg+xml;charset=utf-8,{}",
        urlencoding::encode(&create_thumbnail_svg("Весь экран", "#5865F2", "#4752C4", "🖥️"))
    );
    sources.push(CaptureSource {
        id: "screen:0:0".to_string(),
        name: "Весь экран".to_string(),
        url: screen_svg,
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

        // Skip tooltips, tray popups, invisible utility windows
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
            // Filter out system windows that users never want to stream
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

    // Color palettes for visual distinction
    let colors = [
        ("#23A55A", "#1C8B4C", "🎮"),
        ("#F0B232", "#C69022", "⚡"),
        ("#EB459E", "#BA317A", "✨"),
        ("#5865F2", "#3C45A5", "💬"),
        ("#57F287", "#3CA75E", "🚀"),
        ("#ED4245", "#BA2C30", "🎯"),
    ];

    for (idx, (hwnd, title)) in data.windows.into_iter().enumerate() {
        let (c1, c2, emoji) = colors[idx % colors.len()];
        let thumb = format!(
            "data:image/svg+xml;charset=utf-8,{}",
            urlencoding::encode(&create_thumbnail_svg(&title, c1, c2, emoji))
        );

        sources.push(CaptureSource {
            id: format!("window:{}:0", hwnd.0 as isize),
            name: title,
            url: thumb,
            icon: None,
        });
    }

    sources
}

fn create_thumbnail_svg(title: &str, bg1: &str, bg2: &str, emoji: &str) -> String {
    // Escape XML special chars
    let escaped_title = title
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;");

    // Truncate long titles for thumbnail display
    let display_title = if escaped_title.chars().count() > 24 {
        let s: String = escaped_title.chars().take(22).collect();
        format!("{}...", s)
    } else {
        escaped_title
    };

    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{bg1}" stop-opacity="0.9" />
      <stop offset="100%" stop-color="{bg2}" stop-opacity="0.95" />
    </linearGradient>
    <linearGradient id="overlay" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.6" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="10" fill="url(#bg)" />
  <rect width="100%" height="100%" rx="10" fill="url(#overlay)" />
  <rect x="2" y="2" width="296" height="176" rx="8" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" />
  <circle cx="150" cy="72" r="32" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" />
  <text x="150" y="80" font-family="'Segoe UI Emoji', 'Apple Color Emoji', 'Segoe UI', sans-serif" font-size="28" text-anchor="middle">{emoji}</text>
  <text x="150" y="138" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">{display_title}</text>
</svg>"##,
        bg1 = bg1,
        bg2 = bg2,
        emoji = emoji,
        display_title = display_title
    )
}
