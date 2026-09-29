import { buildTree, type Note, type NoteId, type Notes } from "../model/notes";
import { isLang, setLang, type Lang } from "../i18n";
import { createTutorial } from "../model/tutorial";
import { DEFAULT_SETTINGS, makeState, reachable, rootsOf, type Settings, type State, type View } from "../state/store";
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

/** 데이터 폴더의 state.json. v1은 최상위 노트가 하나(rootId)였다. */
interface StoredState {
  version: 1 | 2;
  /** v2: 최상위 노트들, 위에서부터 */
  roots?: NoteId[];
  /** v1 */
  rootId?: NoteId;
  open: NoteId[];
  minimized: NoteId[];
  active: NoteId | null;
  colWidths: Record<number, number>;
  panelHeights: Record<NoteId, number>;
  /** 아직 내용에 맞춰 높이를 재지 않은 패널 */
  fit?: NoteId[];
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
  if (isLang(r.lang)) s.lang = r.lang;
  if (r.openMode === "add" || r.openMode === "replace") s.openMode = r.openMode;
  if (typeof r.lines === "boolean") s.lines = r.lines;
  if (THEMES.some((t) => t.id === r.theme)) s.theme = r.theme as Settings["theme"];
  if (r.brightness === "light" || r.brightness === "dark" || r.brightness === "system") s.brightness = r.brightness;
  if (r.backdrop === "mica" || r.backdrop === "acrylic" || r.backdrop === "none") s.backdrop = r.backdrop;
  if (typeof r.transparency === "number" && Number.isFinite(r.transparency)) s.transparency = Math.max(0, Math.min(100, Math.round(r.transparency)));
  return s;
}

/** 사용법 노트로 된 처음 상태(처음 켤 때, 초기화할 때). 설정은 넘겨받은 그대로 둔다. */
export function freshState(settings: Settings): State {
  const t = createTutorial(settings.lang);
  return makeState(t.notes, t.roots, {
    settings,
    open: t.open,
    minimized: t.minimized,
    active: t.active,
    fit: t.fit,
    fresh: true,
  });
}

/** 완전 초기화: 노트가 하나도 없는 빈 화면. 설정은 앱 전체 것이라 그대로 둔다. */
export function emptyState(settings: Settings): State {
  return makeState({}, [], { settings });
}

export interface Booted {
  state: State;
  dataDir: string;
  config: Config;
  /** 파일에 이미 있는 노트 내용. 바뀌지 않은 노트를 다시 쓰지 않는 데 쓴다. */
  texts: Map<NoteId, string>;
  window?: WindowGeom;
}

/** lang: 저장된 설정 대신 쓸 언어(주소의 ?lang=, 개발·테스트용) */
export async function boot(backend: Backend, lang?: Lang): Promise<Booted> {
  const config: Config = parseJson<Config>(await backend.readConfig()) ?? {};
  const settings = normalizeSettings(config.settings);
  if (lang) settings.lang = lang;
  setLang(settings.lang);
  const dataDir = config.dataDir || (await backend.defaultDataDir());
  const loaded = await backend.loadAll(dataDir);

  const notes: Notes = {};
  const texts = new Map<NoteId, string>();
  const parentless: Note[] = [];
  for (const { id, text } of loaded.notes) {
    const { note, parent } = parseNote(id, text);
    notes[id] = note;
    texts.set(id, text);
    if (!parent) parentless.push(note);
  }
  const stored = parseJson<StoredState>(loaded.state);

  // 최상위 노트: 지난번 순서 → 목록에 없어도 parent가 빈 노트(밖에서 넣은 파일 등)는 만든 순서로 뒤에 붙인다
  const tree = buildTree(notes);
  const isTop = (id: NoteId) => id in notes && !tree.parent[id];
  const roots = [...new Set((stored?.roots ?? (stored?.rootId ? [stored.rootId] : [])).filter(isTop))];
  parentless.sort((a, b) => a.created.localeCompare(b.created));
  for (const n of parentless) if (isTop(n.id) && !roots.includes(n.id)) roots.push(n.id);
  // 노트가 하나도 없으면 사용법 노트로 시작한다. 완전 초기화한 뒤(v2 상태 파일이 있음)는 빈 화면 그대로다.
  if (!roots.length && stored?.version !== 2) {
    return { state: freshState(settings), dataDir, config: { ...config, dataDir }, texts, window: stored?.window };
  }

  const has = (id: NoteId) => id in notes;
  const base = makeState(notes, roots, { settings });
  const live = new Set(reachable(base));
  const state = makeState(notes, roots, {
    settings,
    open: new Set((stored?.open ?? []).filter(has)),
    minimized: new Set((stored?.minimized ?? []).filter(has)),
    active: stored?.active && live.has(stored.active) ? stored.active : stored?.version === 2 ? null : (roots[0] ?? null),
    colWidths: stored?.colWidths ?? {},
    panelHeights: Object.fromEntries(Object.entries(stored?.panelHeights ?? {}).filter(([k]) => has(k))),
    fit: new Set((stored?.fit ?? []).filter(has)),
    view: stored?.view ?? { x: 0, y: 0, z: 1 },
  });
  return { state, dataDir, config: { ...config, dataDir }, texts, window: stored?.window };
}

function storedState(s: State, window: WindowGeom | undefined): StoredState {
  return {
    version: 2,
    roots: rootsOf(s),
    open: [...s.open],
    minimized: [...s.minimized],
    active: s.active,
    colWidths: s.colWidths,
    panelHeights: s.panelHeights,
    ...(s.fit.size ? { fit: [...s.fit] } : {}),
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
 * 최상위 노트에서 닿는 노트만 저장한다. 상태에서 사라진 노트는 파일도 지운다(되돌리면 다시 쓴다. 앱을 끈 뒤에는 백업으로 살린다).
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

  /** 백업으로 되돌리는 중에는 더 쓰지 않는다(되돌린 파일을 옛 상태로 덮어쓰지 않게) */
  private stopped = false;

  /** 기다리던 저장을 마치고, 그 뒤로는 쓰지 않는다 */
  async stop() {
    await this.flush(false);
    this.stopped = true;
    clearTimeout(this.timer);
  }

  resume() {
    this.stopped = false;
  }

  schedule(s: State) {
    if (this.stopped) return;
    this.latest = s;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(false), 1000);
  }

  /** 기다리지 않고 바로 쓴다. _final(앱을 닫을 때인지)은 예전 호출 모양을 지키려고 남겨 둔다. */
  flush(_final = false): Promise<void> {
    clearTimeout(this.timer);
    this.chain = this.chain.then(() => this.write()).catch((e) => this.onError(String(e)));
    return this.chain;
  }

  private async write() {
    const s = this.latest;
    if (!s || this.stopped) return;
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

    // 상태에서 사라진 노트는 파일도 지운다
    for (const id of [...this.texts.keys()]) {
      if (id in s.notes) continue;
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
