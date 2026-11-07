use std::{
    fs,
    os::windows::process::CommandExt,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

pub const CURRENT_VERSION: &str = "1.1.5";
pub const VERSION_CHECK_URL: &str = "https://rustcord.mollra.xyz/version.json";
pub const DEFAULT_INSTALLER_URL: &str = "https://rustcord.mollra.xyz/RustcordSetup.exe";
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Settings {
    pub auto_update: bool,
    pub check_interval_mins: u64,
    #[serde(default = "default_true")]
    pub dpi_bypass: bool,
}

fn default_true() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            auto_update: true,
            check_interval_mins: 30,
            dpi_bypass: true,
        }
    }
}

pub fn get_settings_path() -> PathBuf {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(local).join("Rustcord").join("settings.json")
}

pub fn load_settings() -> Settings {
    let path = get_settings_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(s) = serde_json::from_str::<Settings>(&content) {
            return s;
        }
    }
    let default = Settings::default();
    save_settings(&default);
    default
}

pub fn save_settings(settings: &Settings) {
    let path = get_settings_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(&path, json);
    }
}

pub fn toggle_auto_update() -> bool {
    let mut s = load_settings();
    s.auto_update = !s.auto_update;
    save_settings(&s);
    s.auto_update
}

pub fn set_auto_update(val: bool) {
    let mut s = load_settings();
    s.auto_update = val;
    save_settings(&s);
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct UpdateInfo {
    pub version: String,
    pub name: Option<String>,
    pub notes: Option<String>,
    #[serde(rename = "downloadUrl")]
    pub download_url: Option<String>,
    pub size: Option<u64>,
    #[serde(default)]
    pub has_update: bool,
}

pub fn parse_semver(v: &str) -> Vec<u64> {
    let clean = v.trim().trim_start_matches('v');
    let base = clean.split('-').next().unwrap_or(clean);
    base.split('.')
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect()
}

pub fn is_newer_version(remote: &str, current: &str) -> bool {
    let r = parse_semver(remote);
    let c = parse_semver(current);

    let max_len = r.len().max(c.len());
    for i in 0..max_len {
        let r_val = r.get(i).copied().unwrap_or(0);
        let c_val = c.get(i).copied().unwrap_or(0);
        if r_val > c_val {
            return true;
        } else if r_val < c_val {
            return false;
        }
    }
    false
}

pub fn fetch_version_info() -> Option<UpdateInfo> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let url = format!("{}?t={}", VERSION_CHECK_URL, ts);

    let output = Command::new("curl.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args(&[
            "-s",
            "-L",
            "--max-time",
            "8",
            "-H",
            "Cache-Control: no-cache",
            &url,
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8(output.stdout).ok()?;
    let mut info: UpdateInfo = serde_json::from_str(&text).ok()?;
    info.has_update = is_newer_version(&info.version, CURRENT_VERSION);
    Some(info)
}

pub fn download_and_apply_update<F>(
    download_url: Option<String>,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u64, u64, f64),
{
    let target_url = download_url.unwrap_or_else(|| DEFAULT_INSTALLER_URL.to_string());
    let temp_dir = std::env::var("TEMP").unwrap_or_else(|_| "C:\\Windows\\Temp".to_string());
    let installer_path = PathBuf::from(&temp_dir).join("RustcordSetup.exe");
    let part_path = PathBuf::from(&temp_dir).join("RustcordSetup.exe.part");

    let _ = fs::remove_file(&installer_path);
    let _ = fs::remove_file(&part_path);

    let mut total_size: u64 = 6_155_264;
    if let Ok(head) = Command::new("curl.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args(&["-sI", "-L", "--max-time", "4", &target_url])
        .output()
    {
        if let Ok(head_str) = String::from_utf8(head.stdout) {
            for line in head_str.lines() {
                let lower = line.to_lowercase();
                if lower.starts_with("content-length:") {
                    if let Some(val) = line.split(':').nth(1) {
                        if let Ok(num) = val.trim().parse::<u64>() {
                            if num > 100_000 {
                                total_size = num;
                            }
                        }
                    }
                }
            }
        }
    }

    let mut child = Command::new("curl.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args(&[
            "-s",
            "-L",
            "--max-time",
            "180",
            "-o",
            part_path.to_str().unwrap_or("RustcordSetup.exe.part"),
            &target_url,
        ])
        .spawn()
        .map_err(|e| format!("Не удалось запустить загрузку: {}", e))?;

    let start_time = std::time::Instant::now();
    let mut last_bytes = 0u64;
    let mut last_time = start_time;
    let mut speed_mb = 0.0f64;

    loop {
        std::thread::sleep(std::time::Duration::from_millis(150));

        let current_bytes = fs::metadata(&part_path).map(|m| m.len()).unwrap_or(0);
        let now = std::time::Instant::now();
        let dt = (now - last_time).as_secs_f64();
        if dt >= 0.25 {
            let db = current_bytes.saturating_sub(last_bytes);
            speed_mb = (db as f64 / (1024.0 * 1024.0)) / dt;
            last_bytes = current_bytes;
            last_time = now;
        }

        let effective_total = if total_size > current_bytes {
            total_size
        } else {
            current_bytes + 1024
        };
        on_progress(current_bytes, effective_total, speed_mb);

        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    let _ = fs::remove_file(&part_path);
                    return Err(format!("curl завершился с кодом: {:?}", status.code()));
                }
                break;
            }
            Ok(None) => {}
            Err(e) => {
                let _ = fs::remove_file(&part_path);
                return Err(format!("Ошибка ожидания процесса загрузки: {}", e));
            }
        }
    }

    let meta = fs::metadata(&part_path)
        .map_err(|e| format!("Не удалось прочитать загруженный файл: {}", e))?;
    if meta.len() < 1_000_000 {
        let _ = fs::remove_file(&part_path);
        return Err("Загруженный файл поврежден или слишком мал".to_string());
    }

    let _ = fs::rename(&part_path, &installer_path);
    on_progress(meta.len(), meta.len(), 0.0);

    Command::new(&installer_path)
        .arg("--silent")
        .spawn()
        .map_err(|e| format!("Не удалось запустить установщик: {}", e))?;

    std::process::exit(0);
}
