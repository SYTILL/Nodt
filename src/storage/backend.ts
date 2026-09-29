import { invoke } from "@tauri-apps/api/core";
import { t } from "../i18n";

// 파일 처리는 Tauri의 Rust 쪽(src-tauri/src/storage.rs)이 한다.
// 브라우저에서 화면만 띄울 때(npm run dev)는 localStorage로 흉내 낸다.

/** 되돌릴 수 있는 백업 하나 (src-tauri/src/storage.rs의 BackupInfo) */
export interface BackupInfo {
  /** "5min/20260927-141500Z" 꼴 */
  id: string;
  /** 5min, 2h, 1d, 1w, 1m, reset(초기화 직전), restore(되돌리기 직전) */
  tier: string;
  /** 유닉스 초 */
  secs: number;
  notes: number;
}

export interface Loaded {
  notes: { id: string; text: string }[];
  state: string | null;
}

export interface Backend {
  kind: "tauri" | "browser";
  defaultDataDir(): Promise<string>;
  readConfig(): Promise<string | null>;
  writeConfig(text: string): Promise<void>;
  loadAll(dir: string): Promise<Loaded>;
  hasNotes(dir: string): Promise<boolean>;
  writeNote(dir: string, id: string, text: string): Promise<void>;
  deleteNote(dir: string, id: string): Promise<void>;
  writeState(dir: string, text: string): Promise<void>;
  backupTick(dir: string): Promise<string[]>;
  /** 초기화 직전에 지금 노트를 backups/reset에 남긴다 */
  backupBeforeReset(dir: string): Promise<string | null>;
  listBackups(dir: string): Promise<BackupInfo[]>;
  /** 백업으로 되돌린다. 지금 상태는 backups/restore에 남는다. 이어서 앱을 새로 불러야 한다. */
  restoreBackup(dir: string, id: string): Promise<void>;
}

export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

const tauriBackend: Backend = {
  kind: "tauri",
  defaultDataDir: () => invoke("default_data_dir"),
  readConfig: () => invoke("read_config"),
  writeConfig: (text) => invoke("write_config", { text }),
  loadAll: (dataDir) => invoke("load_all", { dataDir }),
  hasNotes: (dataDir) => invoke("has_notes", { dataDir }),
  writeNote: (dataDir, id, text) => invoke("write_note", { dataDir, id, text }),
  deleteNote: (dataDir, id) => invoke("delete_note", { dataDir, id }),
  writeState: (dataDir, text) => invoke("write_state", { dataDir, text }),
  backupTick: (dataDir) => invoke("backup_tick", { dataDir }),
  backupBeforeReset: (dataDir) => invoke("backup_before_reset", { dataDir }),
  listBackups: (dataDir) => invoke("list_backups", { dataDir }),
  restoreBackup: (dataDir, id) => invoke("restore_backup", { dataDir, id }),
};

// 브라우저용. 키: nodt.config, nodt.fs:<폴더>:note:<id>, nodt.fs:<폴더>:state
const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // 저장소를 못 쓰면 이번 실행 동안만 유지된다
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // 무시
    }
  },
  keys: (): string[] => {
    try {
      return Object.keys(localStorage);
    } catch {
      return [];
    }
  },
};

const browserBackend: Backend = {
  kind: "browser",
  // localStorage 키에도 쓰이므로 언어와 상관없이 고정한다
  defaultDataDir: async () => "Documents\\Nodt",
  readConfig: async () => ls.get("nodt.config"),
  writeConfig: async (text) => ls.set("nodt.config", text),
  loadAll: async (dir) => {
    const prefix = `nodt.fs:${dir}:note:`;
    const notes = ls
      .keys()
      .filter((k) => k.startsWith(prefix))
      .map((k) => ({ id: k.slice(prefix.length), text: ls.get(k) ?? "" }));
    return { notes, state: ls.get(`nodt.fs:${dir}:state`) };
  },
  hasNotes: async (dir) => ls.keys().some((k) => k.startsWith(`nodt.fs:${dir}:note:`)),
  writeNote: async (dir, id, text) => ls.set(`nodt.fs:${dir}:note:${id}`, text),
  deleteNote: async (dir, id) => ls.del(`nodt.fs:${dir}:note:${id}`),
  writeState: async (dir, text) => ls.set(`nodt.fs:${dir}:state`, text),
  backupTick: async () => [],
  backupBeforeReset: async () => null,
  listBackups: async () => [],
  restoreBackup: async () => {
    throw new Error(t().noBackupsInBrowser);
  },
};

export function getBackend(): Backend {
  return isTauri() ? tauriBackend : browserBackend;
}
