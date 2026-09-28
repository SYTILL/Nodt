import { invoke } from "@tauri-apps/api/core";

// 파일 처리는 Tauri의 Rust 쪽(src-tauri/src/storage.rs)이 한다.
// 브라우저에서 화면만 띄울 때(npm run dev)는 localStorage로 흉내 낸다.

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
  defaultDataDir: async () => "문서\\Nodt",
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
};

export function getBackend(): Backend {
  return isTauri() ? tauriBackend : browserBackend;
}
