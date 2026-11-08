use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub const CURRENT_VERSION: &str = "1.1.8";
pub const VERSION_CHECK_URL: &str = "https://rustcord.mollra.xyz/version.json";
pub const DEFAULT_INSTALLER_URL: &str = "https://rustcord.mollra.xyz/RustcordSetup.exe";

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const DETACHED_PROCESS: u32 = 0x0000_0008;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
const SETUP_MARKER_PREFIX: &[u8] = b"RUSTCORD_SETUP_VERSION=";
const MIN_INSTALLER_SIZE: u64 = 1_000_000;


#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Settings {
    pub auto_update: bool,
    pub check_interval_mins: u64,
    #[serde(default = "default_true")]
    pub dpi_bypass: bool,
    #[serde(default)]
    pub pending_version: Option<String>,
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
            pending_version: None,
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


fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn log_path() -> PathBuf {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(local).join("Rustcord").join("update.log")
}

pub fn log_line(msg: &str) {
    use std::io::Write;
    let path = log_path();
    if let Some(p) = path.parent() {
        let _ = fs::create_dir_all(p);
    }
    if fs::metadata(&path).map(|m| m.len() > 262_144).unwrap_or(false) {
        let _ = fs::remove_file(&path);
    }
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "[{}] app {}: {}", now_secs(), CURRENT_VERSION, msg);
    }
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
    pub sha256: Option<String>,
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

fn curl() -> Command {
    let mut c = Command::new("curl.exe");
    c.creation_flags(CREATE_NO_WINDOW);
    c
}

fn with_cache_bust(url: &str) -> String {
    let sep = if url.contains('?') { '&' } else { '?' };
    format!("{}{}t={}", url, sep, now_secs())
}

pub fn fetch_version_info() -> Option<UpdateInfo> {
    let url = with_cache_bust(VERSION_CHECK_URL);
    let output = curl()
        .args([
            "-s",
            "-L",
            "--fail",
            "--max-time",
            "8",
            "-H",
            "Cache-Control: no-cache",
            "-H",
            "Pragma: no-cache",
            url.as_str(),
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8(output.stdout).ok()?;
    let text = text.trim_start_matches('\u{feff}');
    let mut info: UpdateInfo = serde_json::from_str(text).ok()?;
    info.has_update = is_newer_version(&info.version, CURRENT_VERSION);
    Some(info)
}


fn find_setup_version(bytes: &[u8]) -> Option<String> {
    let p = SETUP_MARKER_PREFIX;
    let pos = bytes.windows(p.len()).position(|w| w == p)?;
    let rest = &bytes[pos + p.len()..];
    let end = rest
        .iter()
        .position(|b| !(b.is_ascii_digit() || *b == b'.'))
        .unwrap_or(rest.len().min(16));
    let v = std::str::from_utf8(&rest[..end]).ok()?.to_string();
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

fn verify_installer(
    bytes: &[u8],
    head_len: Option<u64>,
    info: Option<&UpdateInfo>,
) -> Result<(), String> {
    if (bytes.len() as u64) < MIN_INSTALLER_SIZE {
        return Err("Загруженный файл повреждён или слишком мал".to_string());
    }
    if &bytes[..2] != b"MZ" {
        return Err(
            "Загруженный файл не является .exe (возможно, сервер вернул страницу ошибки)"
                .to_string(),
        );
    }
    if let Some(h) = head_len {
        if (bytes.len() as u64) < h {
            return Err(format!(
                "Файл скачан не полностью ({} из {} байт)",
                bytes.len(),
                h
            ));
        }
    }
    if let Some(info) = info {
        let expected_hash = info
            .sha256
            .as_deref()
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty());
        if let Some(expected_hash) = expected_hash {
            let digest = Sha256::digest(bytes);
            let actual: String = digest.iter().map(|b| format!("{:02x}", b)).collect();
            if actual != expected_hash {
                return Err(
                    "Контрольная сумма не совпала: на сервере лежит не тот установщик \
                     (кэш CDN или не выложили новый RustcordSetup.exe)"
                        .to_string(),
                );
            }
        }
        match find_setup_version(bytes) {
            Some(found) if is_newer_version(&info.version, &found) => {
                return Err(format!(
                    "На сервере лежит установщик v{}, а version.json объявляет v{}. \
                     Выложите свежий RustcordSetup.exe",
                    found, info.version
                ));
            }
            Some(found) => log_line(&format!("verify: установщик v{} ок", found)),
            None => log_line("verify: в установщике нет маркера версии (старая сборка), пропускаю"),
        }
    }
    Ok(())
}

fn cleanup_old_installers(dir: &Path) {
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with("RustcordSetup") && (name.ends_with(".exe") || name.ends_with(".part")) {
                let _ = fs::remove_file(e.path());
            }
        }
    }
}


pub fn download_and_apply_update<F>(
    download_url: Option<String>,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u64, u64, f64),
{
    log_line("download: старт");

    let info = fetch_version_info();
    let expected = info.as_ref().map(|i| i.version.clone());

    let base_url = download_url
        .filter(|u| !u.trim().is_empty())
        .or_else(|| info.as_ref().and_then(|i| i.download_url.clone()))
        .unwrap_or_else(|| DEFAULT_INSTALLER_URL.to_string());
    let target_url = with_cache_bust(&base_url);
    log_line(&format!(
        "download: url={} ожидаем v{}",
        target_url,
        expected.as_deref().unwrap_or("?")
    ));

    let temp_dir = PathBuf::from(std::env::var("TEMP").unwrap_or_else(|_| "C:\\Windows\\Temp".to_string()));
    cleanup_old_installers(&temp_dir);
    let tag: String = expected
        .clone()
        .unwrap_or_else(|| "x".to_string())
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '.')
        .collect();
    let stamp = now_secs();
    let installer_path = temp_dir.join(format!("RustcordSetup-{}-{}.exe", tag, stamp));
    let part_path = temp_dir.join(format!("RustcordSetup-{}-{}.part", tag, stamp));

    let mut total_size: u64 = info.as_ref().and_then(|i| i.size).unwrap_or(0);
    let mut head_len: Option<u64> = None;
    if let Ok(head) = curl()
        .args([
            "-sIL",
            "--max-time",
            "5",
            "-H",
            "Cache-Control: no-cache",
            target_url.as_str(),
        ])
        .output()
    {
        if let Ok(head_str) = String::from_utf8(head.stdout) {
            for line in head_str.lines() {
                if line.to_lowercase().starts_with("content-length:") {
                    if let Some(num) = line.split(':').nth(1).and_then(|v| v.trim().parse::<u64>().ok()) {
                        if num > 100_000 {
                            total_size = num;
                            head_len = Some(num);
                        }
                    }
                }
            }
        }
    }
    if total_size == 0 {
        total_size = 6_155_264;
    }

    let mut child = curl()
        .args([
            "-sS",
            "--fail",
            "-L",
            "--retry",
            "2",
            "--connect-timeout",
            "10",
            "--max-time",
            "300",
            "-H",
            "Cache-Control: no-cache",
            "-H",
            "Pragma: no-cache",
            "-o",
        ])
        .arg(&part_path)
        .arg(&target_url)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Не удалось запустить загрузку: {}", e))?;

    let mut last_bytes = 0u64;
    let mut last_time = Instant::now();
    let mut speed_mb = 0.0f64;
    loop {
        std::thread::sleep(Duration::from_millis(150));
        let current = fs::metadata(&part_path).map(|m| m.len()).unwrap_or(0);
        let now = Instant::now();
        let dt = (now - last_time).as_secs_f64();
        if dt >= 0.5 {
            let inst = (current.saturating_sub(last_bytes) as f64 / 1_048_576.0) / dt;
            speed_mb = if speed_mb == 0.0 { inst } else { speed_mb * 0.6 + inst * 0.4 };
            last_bytes = current;
            last_time = now;
        }
        let total = if total_size > current { total_size } else { current + 1024 };
        on_progress(current, total, speed_mb);

        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    let mut err = String::new();
                    if let Some(mut se) = child.stderr.take() {
                        let _ = se.read_to_string(&mut err);
                    }
                    let _ = fs::remove_file(&part_path);
                    let msg = format!("curl завершился с кодом {:?}: {}", status.code(), err.trim());
                    log_line(&msg);
                    return Err(msg);
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

    let bytes = fs::read(&part_path)
        .map_err(|e| format!("Не удалось прочитать загруженный файл: {}", e))?;
    if let Err(e) = verify_installer(&bytes, head_len, info.as_ref()) {
        let _ = fs::remove_file(&part_path);
        log_line(&format!("verify FAIL: {}", e));
        return Err(e);
    }
    let len = bytes.len() as u64;
    drop(bytes);

    fs::rename(&part_path, &installer_path)
        .map_err(|e| format!("Не удалось сохранить установщик: {}", e))?;
    on_progress(len, len, 0.0);

    if let Some(v) = expected.clone() {
        let mut s = load_settings();
        s.pending_version = Some(v);
        save_settings(&s);
    }

    let cur_exe = std::env::current_exe()
        .map_err(|e| format!("Не удалось определить путь приложения: {}", e))?;
    let dir = cur_exe
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "Не удалось определить папку приложения".to_string())?;

    log_line(&format!(
        "launch: {} --update --wait-pid {} --dir {}",
        installer_path.display(),
        std::process::id(),
        dir.display()
    ));
    Command::new(&installer_path)
        .arg("--update")
        .arg("--wait-pid")
        .arg(std::process::id().to_string())
        .arg("--dir")
        .arg(&dir)
        .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
        .spawn()
        .map_err(|e| format!("Не удалось запустить установщик: {}", e))?;

    std::thread::sleep(Duration::from_millis(500));
    std::process::exit(0);
}


#[allow(dead_code)]
pub enum UpdateOutcome {
    NoUpdate,
    Applied(String),
    Failed { expected: String, running: &'static str },
}

pub fn check_last_update() -> UpdateOutcome {
    let mut s = load_settings();
    let pending = match s.pending_version.take() {
        Some(p) => p,
        None => return UpdateOutcome::NoUpdate,
    };
    save_settings(&s);
    if is_newer_version(&pending, CURRENT_VERSION) {
        log_line(&format!("итог: ожидали v{}, запущена v{} — НЕ обновилось", pending, CURRENT_VERSION));
        UpdateOutcome::Failed {
            expected: pending,
            running: CURRENT_VERSION,
        }
    } else {
        log_line(&format!("итог: обновление до v{} применено", CURRENT_VERSION));
        UpdateOutcome::Applied(CURRENT_VERSION.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_semver() {
        assert_eq!(parse_semver("1.1.8"), vec![1, 1, 8]);
        assert_eq!(parse_semver("v1.1.8"), vec![1, 1, 8]);
        assert_eq!(parse_semver("1.2.0-beta"), vec![1, 2, 0]);
        assert_eq!(parse_semver(""), vec![0]);
    }

    #[test]
    fn test_is_newer_version() {
        assert!(is_newer_version("1.1.9", "1.1.8"));
        assert!(is_newer_version("1.2.0", "1.1.8"));
        assert!(is_newer_version("2.0.0", "1.1.8"));
        assert!(!is_newer_version("1.1.8", "1.1.8"));
        assert!(!is_newer_version("1.1.7", "1.1.8"));
        assert!(!is_newer_version("1.0.9", "1.1.8"));
    }

    #[test]
    fn test_find_setup_version() {
        let dummy = b"SOME_DATA_BEFORE_RUSTCORD_SETUP_VERSION=1.1.8;SOME_DATA_AFTER";
        assert_eq!(find_setup_version(dummy), Some("1.1.8".to_string()));

        let dummy_no_marker = b"SOME_DATA_WITHOUT_ANY_MARKER";
        assert_eq!(find_setup_version(dummy_no_marker), None);

        let dummy_invalid = b"RUSTCORD_SETUP_VERSION=";
        assert_eq!(find_setup_version(dummy_invalid), None);
    }
}

