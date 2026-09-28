mod storage;

use std::path::PathBuf;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize};

// 프론트엔드가 부르는 파일 처리 명령. 실제 일은 storage.rs가 한다.

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// 앱 설정 파일(데이터 폴더 위치와 설정). 데이터 폴더 밖, 앱 설정 폴더에 둔다.
/// 개발·자동 테스트용으로 NODT_CONFIG_DIR 환경변수가 있으면 그 폴더를 쓴다.
fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = match std::env::var_os("NODT_CONFIG_DIR") {
        Some(d) => PathBuf::from(d),
        None => app.path().app_config_dir().map_err(err)?,
    };
    Ok(dir.join("config.json"))
}

/// 기본 데이터 폴더: 문서\Nodt. 개발·자동 테스트용으로 NODT_DATA_DIR 환경변수가 있으면 그 폴더를 쓴다.
#[tauri::command]
fn default_data_dir(app: AppHandle) -> Result<String, String> {
    if let Some(d) = std::env::var_os("NODT_DATA_DIR") {
        return Ok(PathBuf::from(d).to_string_lossy().into_owned());
    }
    Ok(app.path().document_dir().map_err(err)?.join("Nodt").to_string_lossy().into_owned())
}

#[tauri::command]
fn read_config(app: AppHandle) -> Result<Option<String>, String> {
    Ok(std::fs::read_to_string(config_path(&app)?).ok())
}

#[tauri::command]
fn write_config(app: AppHandle, text: String) -> Result<(), String> {
    storage::write_atomic(&config_path(&app)?, &text).map_err(err)
}

#[tauri::command]
fn load_all(data_dir: String) -> Result<storage::Loaded, String> {
    storage::load_all(data_dir.as_ref()).map_err(err)
}

#[tauri::command]
fn has_notes(data_dir: String) -> bool {
    storage::has_notes(data_dir.as_ref())
}

#[tauri::command]
fn write_note(data_dir: String, id: String, text: String) -> Result<(), String> {
    storage::write_note(data_dir.as_ref(), &id, &text).map_err(err)
}

#[tauri::command]
fn delete_note(data_dir: String, id: String) -> Result<(), String> {
    storage::delete_note(data_dir.as_ref(), &id).map_err(err)
}

#[tauri::command]
fn write_state(data_dir: String, text: String) -> Result<(), String> {
    storage::write_state(data_dir.as_ref(), &text).map_err(err)
}

#[tauri::command]
fn backup_tick(data_dir: String) -> Result<Vec<String>, String> {
    storage::backup_tick(data_dir.as_ref(), storage::now_secs()).map_err(err)
}

/// 초기화 직전에 지금 노트를 backups/reset에 한 벌 남긴다
#[tauri::command]
fn backup_before_reset(data_dir: String) -> Result<Option<String>, String> {
    storage::backup_now(data_dir.as_ref(), "reset", storage::now_secs()).map_err(err)
}

/// 되돌릴 수 있는 백업 목록(최신 것부터)
#[tauri::command]
fn list_backups(data_dir: String) -> Vec<storage::BackupInfo> {
    storage::list_backups(data_dir.as_ref())
}

/// 백업으로 되돌린다. 지금 상태는 backups/restore에 남긴다. 프론트엔드는 이어서 새로 불러온다.
#[tauri::command]
fn restore_backup(data_dir: String, id: String) -> Result<(), String> {
    storage::restore_backup(data_dir.as_ref(), &id, storage::now_secs()).map_err(err)
}

/// Windows 11(빌드 22000 이상)에서 창 배경에 Mica를 깐다. 앱의 밝기에 맞춰 밝은/어두운 Mica를 고른다.
/// 적용했으면 true. false면 프론트엔드는 배경을 불투명하게 그린다(Windows 10 등).
#[tauri::command]
fn set_mica(window: tauri::WebviewWindow, dark: bool) -> bool {
    #[cfg(windows)]
    {
        use tauri::window::{Effect, EffectsBuilder};
        if windows_version::OsVersion::current().build < 22000 {
            return false;
        }
        let effect = if dark { Effect::MicaDark } else { Effect::MicaLight };
        window.set_effects(EffectsBuilder::new().effect(effect).build()).is_ok()
    }
    #[cfg(not(windows))]
    {
        let _ = (window, dark);
        false
    }
}

/// 창을 보이기 전에 지난번 위치와 크기로 되돌린다. 저장된 위치가 어느 모니터에도 없으면 가운데에 둔다.
fn restore_window(app: &AppHandle) {
    let Some(win) = app.get_webview_window("main") else { return };
    let saved = (|| {
        let config: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(config_path(app).ok()?).ok()?).ok()?;
        let data_dir = config.get("dataDir")?.as_str()?.to_string();
        let state: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(PathBuf::from(data_dir).join("state.json")).ok()?).ok()?;
        state.get("window").cloned()
    })();
    if let Some(w) = saved {
        let num = |k: &str| w.get(k).and_then(|v| v.as_f64());
        if let (Some(x), Some(y), Some(width), Some(height)) = (num("x"), num("y"), num("width"), num("height")) {
            let (x, y) = (x as i32, y as i32);
            let on_screen = win.available_monitors().unwrap_or_default().iter().any(|m| {
                let p = m.position();
                let s = m.size();
                // 창 위쪽 가운데 부근이 모니터 안에 있으면 잡을 수 있다
                let (cx, cy) = (x + 100, y + 16);
                cx >= p.x && cy >= p.y && cx < p.x + s.width as i32 && cy < p.y + s.height as i32
            });
            if on_screen && width >= 300.0 && height >= 200.0 {
                let (w, h) = (width as i64, height as i64);
                let _ = win.set_size(PhysicalSize::new(w as u32, h as u32));
                // 테두리 없는 창은 처음 set_size 때만 안쪽 크기가 제목 표시줄 높이만큼 어긋난다. 어긋났으면 한 번 더 넣는다.
                if let Ok(actual) = win.inner_size() {
                    if actual.width as i64 != w || actual.height as i64 != h {
                        let _ = win.set_size(PhysicalSize::new(w as u32, h as u32));
                    }
                }
                let _ = win.set_position(PhysicalPosition::new(x, y));
            }
        }
        if w.get("maximized").and_then(|v| v.as_bool()) == Some(true) {
            let _ = win.maximize();
        }
    }
    let _ = win.show();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            default_data_dir,
            read_config,
            write_config,
            load_all,
            has_notes,
            write_note,
            delete_note,
            write_state,
            backup_tick,
            backup_before_reset,
            list_backups,
            restore_backup,
            set_mica
        ])
        .setup(|app| {
            restore_window(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
