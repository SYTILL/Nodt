//! 노트 파일 저장과 백업 스냅샷 (스펙 7장)
//!
//! 문서\Nodt\
//! ├── notes\<uuid>.md   노트 하나 = 파일 하나 (평평한 구조)
//! ├── state.json         화면 상태
//! └── backups\5min\ 2h\ 1d\ 1w\ 1m\<시각>\

use serde::Serialize;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
pub struct NoteText {
    pub id: String,
    pub text: String,
}

#[derive(Serialize)]
pub struct Loaded {
    pub notes: Vec<NoteText>,
    pub state: Option<String>,
}

/// 파일 이름으로 쓰는 노트 ID. 폴더 밖을 가리키지 못하게 글자를 제한한다.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn invalid(msg: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, msg.to_string())
}

pub fn notes_dir(data: &Path) -> PathBuf {
    data.join("notes")
}

/// 임시 파일에 먼저 쓰고 원래 파일과 바꿔치기한다. 쓰는 도중 앱이 꺼져도 원래 파일은 깨지지 않는다.
pub fn write_atomic(path: &Path, text: &str) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(text.as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)
}

pub fn has_notes(data: &Path) -> bool {
    fs::read_dir(notes_dir(data))
        .map(|rd| rd.flatten().any(|e| e.path().extension().is_some_and(|x| x == "md")))
        .unwrap_or(false)
}

pub fn load_all(data: &Path) -> io::Result<Loaded> {
    let mut notes = Vec::new();
    let dir = notes_dir(data);
    if dir.is_dir() {
        for entry in fs::read_dir(&dir)? {
            let path = entry?.path();
            if path.extension().and_then(|x| x.to_str()) != Some("md") {
                continue;
            }
            let Some(id) = path.file_stem().and_then(|s| s.to_str()) else { continue };
            if !valid_id(id) {
                continue;
            }
            notes.push(NoteText { id: id.to_string(), text: fs::read_to_string(&path)? });
        }
    }
    let state = fs::read_to_string(data.join("state.json")).ok();
    Ok(Loaded { notes, state })
}

pub fn write_note(data: &Path, id: &str, text: &str) -> io::Result<()> {
    if !valid_id(id) {
        return Err(invalid("잘못된 노트 ID"));
    }
    write_atomic(&notes_dir(data).join(format!("{id}.md")), text)
}

pub fn delete_note(data: &Path, id: &str) -> io::Result<()> {
    if !valid_id(id) {
        return Err(invalid("잘못된 노트 ID"));
    }
    let path = notes_dir(data).join(format!("{id}.md"));
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn write_state(data: &Path, text: &str) -> io::Result<()> {
    write_atomic(&data.join("state.json"), text)
}

// ───── 백업 스냅샷 ─────

/// (폴더 이름, 주기(초), 보관 개수)
const TIERS: [(&str, u64, usize); 5] = [
    ("5min", 5 * 60, 12),
    ("2h", 2 * 60 * 60, 12),
    ("1d", 24 * 60 * 60, 7),
    ("1w", 7 * 24 * 60 * 60, 5),
    ("1m", 30 * 24 * 60 * 60, 12),
];

pub fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// 유닉스 초 → "YYYYMMDD-HHMMSSZ" (UTC). 폴더 이름으로 쓰고 이름 순서가 시간 순서다.
pub fn stamp(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    // 1970-01-01부터 지난 날 수 → 연월일 (Howard Hinnant의 civil_from_days)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}{m:02}{d:02}-{:02}{:02}{:02}Z", rem / 3600, rem / 60 % 60, rem % 60)
}

fn parse_stamp(name: &str) -> Option<u64> {
    let b = name.as_bytes();
    if b.len() != 16 || b[8] != b'-' || b[15] != b'Z' {
        return None;
    }
    let n = |s: &str| s.parse::<i64>().ok();
    let (y, m, d) = (n(&name[0..4])?, n(&name[4..6])?, n(&name[6..8])?);
    let (hh, mm, ss) = (n(&name[9..11])?, n(&name[11..13])?, n(&name[13..15])?);
    // 연월일 → 1970-01-01부터 지난 날 수 (days_from_civil)
    let y2 = if m <= 2 { y - 1 } else { y };
    let era = y2.div_euclid(400);
    let yoe = y2 - era * 400;
    let mp = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    u64::try_from(days * 86400 + hh * 3600 + mm * 60 + ss).ok()
}

/// 노트 파일 내용의 해시(FNV-1a). 바뀐 게 없으면 스냅샷을 건너뛰는 데 쓴다.
fn notes_hash(data: &Path) -> io::Result<u64> {
    let mut files: Vec<PathBuf> = fs::read_dir(notes_dir(data))?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "md"))
        .collect();
    files.sort();
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for f in files {
        let name = f.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        for byte in name.bytes().chain([0u8]).chain(fs::read(&f)?).chain([0u8]) {
            h ^= u64::from(byte);
            h = h.wrapping_mul(0x0100_0000_01b3);
        }
    }
    Ok(h)
}

fn snapshots(tier: &Path) -> Vec<(u64, PathBuf)> {
    let mut out: Vec<(u64, PathBuf)> = fs::read_dir(tier)
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| {
                    let t = parse_stamp(&e.file_name().to_string_lossy())?;
                    e.path().is_dir().then(|| (t, e.path()))
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort();
    out
}

fn copy_snapshot(data: &Path, dest: &Path, hash: u64) -> io::Result<()> {
    let notes_dest = dest.join("notes");
    fs::create_dir_all(&notes_dest)?;
    for entry in fs::read_dir(notes_dir(data))?.flatten() {
        let p = entry.path();
        if p.extension().is_some_and(|x| x == "md") {
            fs::copy(&p, notes_dest.join(entry.file_name()))?;
        }
    }
    let state = data.join("state.json");
    if state.exists() {
        fs::copy(state, dest.join("state.json"))?;
    }
    fs::write(dest.join(".hash"), hash.to_string())
}

/// 주기가 된 단계마다 스냅샷을 남긴다. 가장 오래된 것부터 지워 보관 개수를 지킨다.
/// 마지막 스냅샷과 노트 내용이 같으면 건너뛴다(미결 사항, 임시 결정).
/// 만든 스냅샷 이름("5min/20260927-141500Z" 꼴)을 돌려준다.
pub fn backup_tick(data: &Path, now: u64) -> io::Result<Vec<String>> {
    if !notes_dir(data).is_dir() {
        return Ok(Vec::new());
    }
    let hash = notes_hash(data)?;
    let mut made = Vec::new();
    for (name, every, keep) in TIERS {
        let tier = data.join("backups").join(name);
        let mut snaps = snapshots(&tier);
        if let Some((last_t, last_p)) = snaps.last() {
            if now < last_t + every {
                continue;
            }
            let last_hash = fs::read_to_string(last_p.join(".hash")).ok();
            if last_hash.as_deref() == Some(hash.to_string().as_str()) {
                continue;
            }
        }
        let label = stamp(now);
        let dest = tier.join(&label);
        if dest.exists() {
            continue;
        }
        copy_snapshot(data, &dest, hash)?;
        made.push(format!("{name}/{label}"));
        snaps.push((now, dest));
        while snaps.len() > keep {
            let (_, old) = snaps.remove(0);
            fs::remove_dir_all(old)?;
        }
    }
    Ok(made)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nodt-test-{name}-{}", now_secs()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn stamp_roundtrip() {
        for secs in [0u64, 951_782_400, 1_790_000_000, 4_102_444_799] {
            assert_eq!(parse_stamp(&stamp(secs)), Some(secs), "{}", stamp(secs));
        }
        assert_eq!(stamp(1_790_000_000), "20260921-141320Z");
    }

    #[test]
    fn ids_are_restricted() {
        assert!(valid_id("3f2a9c1e-0000-4000-8000-000000000000"));
        assert!(!valid_id("../secret"));
        assert!(!valid_id("a/b"));
        assert!(!valid_id(""));
    }

    #[test]
    fn write_load_delete() {
        let d = temp_dir("rw");
        write_note(&d, "abc", "hello").unwrap();
        write_state(&d, "{}").unwrap();
        let l = load_all(&d).unwrap();
        assert_eq!(l.notes.len(), 1);
        assert_eq!(l.notes[0].text, "hello");
        assert_eq!(l.state.as_deref(), Some("{}"));
        assert!(has_notes(&d));
        // 임시 파일이 남지 않는다
        assert!(!notes_dir(&d).join("abc.tmp").exists());
        delete_note(&d, "abc").unwrap();
        assert!(!has_notes(&d));
        assert!(write_note(&d, "../x", "no").is_err());
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn backups_rotate_and_skip_unchanged() {
        let d = temp_dir("bk");
        write_note(&d, "a", "1").unwrap();
        let t0 = 1_790_000_000;
        // 처음에는 모든 단계에 하나씩
        assert_eq!(backup_tick(&d, t0).unwrap().len(), 5);
        // 주기가 안 됐으면 없음
        assert!(backup_tick(&d, t0 + 60).unwrap().is_empty());
        // 주기가 됐어도 내용이 같으면 건너뜀
        assert!(backup_tick(&d, t0 + 300).unwrap().is_empty());
        // 바뀌면 5분 단계만
        write_note(&d, "a", "2").unwrap();
        assert_eq!(backup_tick(&d, t0 + 300).unwrap(), vec![format!("5min/{}", stamp(t0 + 300))]);
        // 5분 단계는 12개까지만 남는다
        for i in 2..20u64 {
            write_note(&d, "a", &i.to_string()).unwrap();
            backup_tick(&d, t0 + 300 * i).unwrap();
        }
        assert_eq!(snapshots(&d.join("backups").join("5min")).len(), 12);
        // 스냅샷 안에 노트가 들어 있다
        let (_, newest) = snapshots(&d.join("backups").join("5min")).pop().unwrap();
        assert_eq!(fs::read_to_string(newest.join("notes").join("a.md")).unwrap(), "19");
        fs::remove_dir_all(d).unwrap();
    }
}
