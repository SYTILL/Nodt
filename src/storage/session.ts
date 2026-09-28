import { parseMarkdown } from "../model/markdown";
import { newNote, type Note, type NoteId, type Notes } from "../model/notes";
import { DEFAULT_SETTINGS, makeState, reachable, type Settings, type State, type View } from "../state/store";
import { THEMES } from "../theme/themes";
import type { Backend } from "./backend";
import { parseNote, serializeNote } from "./noteFile";

// 시작할 때 불러오기(boot)와 실시간 저장(Saver). 스펙 7.3, 4.4의 "앱 시작" 복원.

/** 앱 설정 폴더의 config.json. 데이터 폴더 위치는 데이터 폴더 안에 둘 수 없어서 여기에 둔다. */
export interface Config {
  dataDir?: string;
  settings?: Partial<Settings>;
}

/** 창 위치와 크기(물리 픽셀). 창을 보이기 전에 Rust가 되돌린다(src-tauri/src/lib.rs). */
export interface WindowGeom {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

/** 데이터 폴더의 state.json */
interface StoredState {
  version: 1;
  rootId: NoteId;
  open: NoteId[];
  minimized: NoteId[];
  active: NoteId;
  colWidths: Record<number, number>;
  panelHeights: Record<NoteId, number>;
  view: View;
  window?: WindowGeom;
}

function parseJson<T>(text: string | null | undefined): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** 저장된 값 중 올바른 것만 기본값 위에 얹는다 */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const s = { ...DEFAULT_SETTINGS };
  if (r.openMode === "add" || r.openMode === "replace") s.openMode = r.openMode;
  if (typeof r.lines === "boolean") s.lines = r.lines;
  if (THEMES.some((t) => t.id === r.theme)) s.theme = r.theme as Settings["theme"];
  if (r.brightness === "light" || r.brightness === "dark" || r.brightness === "system") s.brightness = r.brightness;
  if (r.windowMode === "normal" || r.windowMode === "onTop" || r.windowMode === "hotkey") s.windowMode = r.windowMode;
  return s;
}

const WELCOME_MD = [
  "생각 하나에서 다음 생각으로 계속 들어가는 노트예요.",
  "",
  "- 더 들어가고 싶은 생각이 생기면 Ctrl+. 을 눌러 새 노트 링크를 만들어요.",
  "- 줄 맨 앞에서 / 를 누르면 명령 메뉴가 떠요.",
  "- Alt+방향키로 패널 사이를 옮겨 다녀요.",
  "- 오른쪽 위 ? 에 단축키가 모두 있어요.",
].join("\n");

export interface Booted {
  state: State;
  dataDir: string;
  config: Config;
  /** 파일에 이미 있는 노트 내용. 바뀌지 않은 노트를 다시 쓰지 않는 데 쓴다. */
  texts: Map<NoteId, string>;
  window?: WindowGeom;
}

export async function boot(backend: Backend): Promise<Booted> {
  const config: Config = parseJson<Config>(await backend.readConfig()) ?? {};
  const dataDir = config.dataDir || (await backend.defaultDataDir());
  const settings = normalizeSettings(config.settings);
  const loaded = await backend.loadAll(dataDir);

  const notes: Notes = {};
  const texts = new Map<NoteId, string>();
  const roots: Note[] = [];
  for (const { id, text } of loaded.notes) {
    const { note, parent } = parseNote(id, text);
    notes[id] = note;
    texts.set(id, text);
    if (!parent) roots.push(note);
  }
  const stored = parseJson<StoredState>(loaded.state);

  // 최상위 노트: 지난번 것 → parent가 빈 노트 중 가장 먼저 만든 것 → 없으면 새로 만든다
  let rootId = stored?.rootId && stored.rootId in notes ? stored.rootId : undefined;
  rootId ??= roots.sort((a, b) => a.created.localeCompare(b.created))[0]?.id;
  if (!rootId) {
    rootId = crypto.randomUUID();
    notes[rootId] = newNote(rootId, "Nodt", parseMarkdown(WELCOME_MD));
  }

  const has = (id: NoteId) => id in notes;
  const base = makeState(notes, rootId, { settings });
  const live = new Set(reachable(base));
  const state = makeState(notes, rootId, {
    settings,
    open: new Set((stored?.open ?? []).filter(has)),
    minimized: new Set((stored?.minimized ?? []).filter(has)),
    active: stored?.active && live.has(stored.active) ? stored.active : rootId,
    colWidths: stored?.colWidths ?? {},
    panelHeights: Object.fromEntries(Object.entries(stored?.panelHeights ?? {}).filter(([k]) => has(k))),
    view: stored?.view ?? { x: 0, y: 0, z: 1 },
  });
  return { state, dataDir, config: { ...config, dataDir }, texts, window: stored?.window };
}

function storedState(s: State, window: WindowGeom | undefined): StoredState {
  return {
    version: 1,
    rootId: s.rootId,
    open: [...s.open],
    minimized: [...s.minimized],
    active: s.active,
    colWidths: s.colWidths,
    panelHeights: s.panelHeights,
    view: s.view,
    ...(window ? { window } : {}),
  };
}

/** 저장 대상 노트의 파일 내용 */
export function noteText(s: State, id: NoteId): string {
  return serializeNote(s.notes[id], s.tree.parent[id]);
}

/**
 * 실시간 저장. 입력이 멈추고 약 1초 뒤에 바뀐 노트만 쓴다. 앱을 닫을 때는 바로 쓴다.
 * 최상위 노트에서 닿는 노트만 저장한다. 되돌리기 알림이 떠 있는 삭제는 알림이 사라질 때(또는 앱을 닫을 때) 파일을 지운다.
 */
export class Saver {
  private texts: Map<NoteId, string>;
  /** 마지막으로 저장할 때 본 노트 객체와 부모. 같으면 직렬화도 건너뛴다. */
  private seen = new Map<NoteId, { note: Note; parent: NoteId | undefined }>();
  private stateText = "";
  private configText = "";
  private latest: State | null = null;
  private timer = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private backend: Backend,
    public dataDir: string,
    private config: Config,
    texts: Map<NoteId, string>,
    public window: WindowGeom | undefined,
    private onError: (message: string) => void,
  ) {
    this.texts = new Map(texts);
    this.configText = JSON.stringify(config);
  }

  schedule(s: State) {
    this.latest = s;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(false), 1000);
  }

  /** final: 앱을 닫을 때. 기다리던 삭제를 확정한다. */
  flush(final: boolean): Promise<void> {
    clearTimeout(this.timer);
    this.chain = this.chain.then(() => this.write(final)).catch((e) => this.onError(String(e)));
    return this.chain;
  }

  private async write(final: boolean) {
    const s = this.latest;
    if (!s) return;
    const b = this.backend;
    const dir = this.dataDir;

    for (const id of reachable(s)) {
      const note = s.notes[id];
      const parent = s.tree.parent[id];
      const prev = this.seen.get(id);
      if (prev && prev.note === note && prev.parent === parent) continue;
      const text = noteText(s, id);
      if (text !== this.texts.get(id)) {
        await b.writeNote(dir, id, text);
        this.texts.set(id, text);
      }
      this.seen.set(id, { note, parent });
    }

    // 상태에서 사라진 노트는 파일도 지운다. 되돌리기를 기다리는 노트는 앱을 닫을 때까지 남긴다.
    const pending = new Set(final ? [] : (s.deleted?.notes ?? []).map((n) => n.id));
    for (const id of [...this.texts.keys()]) {
      if (id in s.notes || pending.has(id)) continue;
      await b.deleteNote(dir, id);
      this.texts.delete(id);
      this.seen.delete(id);
    }

    const stateText = JSON.stringify(storedState(s, this.window));
    if (stateText !== this.stateText) {
      await b.writeState(dir, stateText);
      this.stateText = stateText;
    }

    const configText = JSON.stringify({ ...this.config, dataDir: dir, settings: s.settings });
    if (configText !== this.configText) {
      await b.writeConfig(configText);
      this.configText = configText;
    }
  }

  /** 데이터 폴더를 옮길 때: 지금 노트와 상태를 새 폴더에 모두 쓴다 */
  async copyTo(dir: string) {
    const s = this.latest;
    if (!s) return;
    for (const id of reachable(s)) await this.backend.writeNote(dir, id, noteText(s, id));
    await this.backend.writeState(dir, JSON.stringify(storedState(s, this.window)));
  }

  async setDataDir(dir: string) {
    this.config = { ...this.config, dataDir: dir };
    const s = this.latest;
    const text = JSON.stringify({ ...this.config, settings: s?.settings ?? this.config.settings });
    await this.backend.writeConfig(text);
    this.configText = text;
  }
}
