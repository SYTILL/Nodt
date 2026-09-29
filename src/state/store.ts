import type { JSONContent } from "@tiptap/core";
import {
  appendLink,
  buildTree,
  descendants,
  docLinks,
  isInSubtree,
  moveLink,
  newNote,
  nowIso,
  removeLinks,
  replaceBroken,
  type Note,
  type NoteId,
  type Notes,
  type Tree,
} from "../model/notes";
import { t, type Lang } from "../i18n";
import type { ThemeId } from "../theme/themes";

/** 하위 전체 펼치기에서 이보다 많이 열리면 확인 창을 띄운다 */
const EXPAND_CONFIRM_OVER = 30;
/** 계보를 따라 한 칸 갈 때마다 옅어지는 정도 */
const LINEAGE_STEP = 0.3;

export type Brightness = "light" | "dark" | "system";
/** 창 배경 효과(Windows). none이면 불투명한 배경 */
export type Backdrop = "mica" | "acrylic" | "none";

export interface Settings {
  /** 화면 글의 언어. 영어가 기본이다. */
  lang: Lang;
  openMode: "add" | "replace";
  lines: boolean;
  theme: ThemeId;
  brightness: Brightness;
  backdrop: Backdrop;
  /** 창 배경 투명도(0~100). 배경 효과가 깔렸을 때만 보인다. 100이면 효과만 남는다. */
  transparency: number;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: "en",
  openMode: "add",
  lines: true,
  theme: "teal",
  brightness: "system",
  backdrop: "mica",
  transparency: 45,
};

export type Dir = "left" | "right" | "up" | "down";

export type Overlay =
  | { kind: "help" }
  | { kind: "settings" }
  /** 초기화 확인 */
  | { kind: "reset" }
  /** 백업에서 되돌리기 */
  | { kind: "restore" }
  | { kind: "confirm"; message: string; confirmLabel: string; action: Action };

export type View = { x: number; y: number; z: number };

/**
 * 되돌리기 기록 하나. 바뀌기 전의 노트 구조(노트 내용, 최상위 노트 순서, 열림, 최소화)와 그때 선택한 패널.
 * 앱 전체에서 한 줄로 쌓인다(전역 되돌리기). 저장하지 않고, 앱을 끄면 사라진다.
 */
export interface HistoryEntry {
  notes: Notes;
  roots: NoteId[];
  open: ReadonlySet<NoteId>;
  minimized: ReadonlySet<NoteId>;
  active: NoteId | null;
  /** 이어서 친 글을 한 단계로 묶는 데 쓴다 */
  group: { kind: "text" | "title"; id: NoteId } | null;
  /** 이 단계가 시작된 때와 마지막으로 합쳐진 때(ms) */
  start: number;
  last: number;
  /** 같은 순간(한 번의 동작 안)에 온 변화는 한 단계로 합친다 */
  tick: number;
}

/** 패널에 키보드 초점을 옮기라는 요청. seq가 바뀔 때마다 한 번 처리한다. */
export interface FocusRequest {
  id: NoteId;
  /** restore: 마지막 커서 자리로 */
  where: "title" | "body" | "restore";
  seq: number;
}

export interface State {
  notes: Notes;
  tree: Tree;
  /** 최상위 노트들. 첫 컬럼에 위에서부터 이 순서로 놓인다. */
  roots: NoteId[];
  /** 열린 노트. 조상이 닫혀 화면에 없는 노트도 남아 있어서, 다시 열면 그대로 펼쳐진다. */
  open: ReadonlySet<NoteId>;
  /** 제목줄만 남기고 접은 패널. 하위 패널도 화면에서 빠지지만 열림 상태는 그대로 기억한다. */
  minimized: ReadonlySet<NoteId>;
  /** 드롭다운 메뉴. 패널 상단바 우클릭, 또는 깨진 링크 클릭(parent 본문의 n번째 깨진 링크) */
  menu:
    | { kind: "panel"; id: NoteId; x: number; y: number }
    | { kind: "broken"; parent: NoteId; n: number; x: number; y: number }
    | null;
  /** 선택한 패널. 빈 곳을 누르면 아무것도 선택하지 않은 상태(null)가 된다. */
  active: NoteId | null;
  /** 최상위 노트에서 Esc를 눌렀을 때의 경고 */
  warn: boolean;
  /** 패널이동모드일 때 들어오기 전의 패널. 모드가 아니면 null */
  moveOrigin: NoteId | null;
  overlay: Overlay | null;
  /** undo가 true면 되돌리기 버튼이 붙은 삭제 알림이다. error면 닫을 때까지 남는 오류 알림이다. */
  toast: { message: string; seq: number; undo?: boolean; error?: boolean } | null;
  /** 되돌리기(Ctrl+Z)와 다시 실행(Ctrl+Shift+Z, Ctrl+Y). 나중 것이 뒤 */
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** 되돌리기·다시 실행할 때마다 1씩 는다. 에디터가 바뀐 자리로 커서를 옮기는 데 쓴다. */
  undoSeq: number;
  focus: FocusRequest | null;
  colWidths: Record<number, number>;
  panelHeights: Record<NoteId, number>;
  /** 처음 화면에 나올 때 내용에 맞춰 높이를 정할 패널(사용법 노트). 한 번 맞추면 panelHeights로 옮긴다. */
  fit: ReadonlySet<NoteId>;
  /** 사용법 노트를 막 만들었다(처음 켤 때, 초기화). 화면에 전체가 보이게 창을 키우거나 축소한다. 저장하지 않는다. */
  fresh: boolean;
  /** 캔버스 이동과 확대. Workspace가 끌기를 마칠 때 넣는다(저장용). */
  view: View;
  settings: Settings;
  /** 상태를 통째로 바꿀 때(초기화)마다 1씩 는다. 화면(캔버스 위치, 에디터)을 새로 만드는 데 쓴다. */
  epoch: number;
}

export type Action =
  | { type: "select"; id: NoteId | null }
  | { type: "toggleLink"; id: NoteId }
  | { type: "close"; id: NoteId }
  /** Ctrl+W: 선택한 패널을 닫는다. 최상위 노트는 최소화(복원)한다. */
  | { type: "closeActive" }
  | { type: "toggleMinimize"; id: NoteId }
  | { type: "delete"; id: NoteId }
  /** 전역 되돌리기(Ctrl+Z), 다시 실행(Ctrl+Shift+Z, Ctrl+Y) */
  | { type: "undo" }
  | { type: "redo" }
  | { type: "menu"; menu: State["menu"] }
  | { type: "fixBroken"; parent: NoteId; n: number }
  | { type: "removeBroken"; parent: NoteId; n: number }
  /** 같은 부모의 보이는 형제 패널 사이에서 순서를 바꾼다. index는 보이는 형제 중 새 자리 */
  | { type: "reorder"; id: NoteId; index: number }
  | { type: "expandAll"; id: NoteId; confirmed?: boolean }
  | { type: "collapseAll"; id: NoteId }
  | { type: "nav"; dir: Dir }
  | { type: "moveStart" }
  | { type: "moveEnd"; cancel: boolean }
  | { type: "escape" }
  | { type: "overlay"; overlay: Overlay | null }
  | { type: "toast"; message: string | null; error?: boolean }
  | { type: "colWidth"; depth: number; width: number }
  | { type: "panelHeight"; id: NoteId; height: number }
  /** 내용에 맞춰 잰 높이(fit). 기본 높이로 충분했던 패널은 heights에 없이 ids에만 들어 있다. */
  | { type: "fitted"; ids: NoteId[]; heights: Record<NoteId, number> }
  | { type: "freshDone" }
  | { type: "settings"; patch: Partial<Settings> }
  /** 에디터에서 본문이 바뀌었다. keep이면 사라진 링크를 삭제로 보지 않는다(잘라내서 옮기는 중). */
  | { type: "editDoc"; id: NoteId; doc: JSONContent; keep?: boolean }
  | { type: "setTitle"; id: NoteId; title: string }
  /** 빈 노트를 만들어 열고 제목에 초점을 둔다. 링크는 에디터가 바로 이어서 넣는다. */
  | { type: "createNote"; id: NoteId }
  /** 새 최상위 노트를 맨 아래에 만들고 제목에 초점을 둔다 */
  | { type: "createRoot"; id: NoteId }
  /** 부모 본문 끝에 새 노트 링크를 붙여 열고 제목에 초점을 둔다(에디터 밖에서 Ctrl+N) */
  | { type: "addChild"; parent: NoteId; id: NoteId }
  /** 복제한 노트들을 더한다(하위 노트까지 붙여넣기) */
  | { type: "addNotes"; notes: Note[] }
  | { type: "focus"; id: NoteId; where: FocusRequest["where"] }
  | { type: "view"; view: View }
  /** 저장소에서 읽어 온 상태로 통째로 바꾼다 */
  | { type: "hydrate"; state: State };

export function makeState(notes: Notes, roots: NoteId[], patch: Partial<State> = {}): State {
  return {
    notes,
    tree: buildTree(notes),
    roots,
    open: new Set(),
    minimized: new Set(),
    menu: null,
    active: roots[0] ?? null,
    warn: false,
    moveOrigin: null,
    overlay: null,
    toast: null,
    past: [],
    future: [],
    undoSeq: 0,
    focus: null,
    colWidths: {},
    panelHeights: {},
    fit: new Set(),
    fresh: false,
    view: { x: 0, y: 0, z: 1 },
    settings: DEFAULT_SETTINGS,
    epoch: 0,
    ...patch,
  };
}

/** 실제로 있는 최상위 노트들. 다른 노트에 링크된 노트는 하위 노트라서 뺀다. */
export function rootsOf(s: Pick<State, "roots" | "notes" | "tree">): NoteId[] {
  return s.roots.filter((id) => id in s.notes && !s.tree.parent[id]);
}

/** 화면에 보이는 패널을 깊이별 컬럼으로. 컬럼 안 순서는 트리 순서다(최상위 노트끼리는 roots 순서). */
export function columns(s: Pick<State, "tree" | "open" | "roots" | "notes" | "minimized">): NoteId[][] {
  const cols: NoteId[][] = [];
  const walk = (id: NoteId, d: number) => {
    (cols[d] ??= []).push(id);
    for (const k of visibleKids(s, id)) walk(k, d + 1);
  };
  for (const r of rootsOf(s)) walk(r, 0);
  return cols;
}

/** 같은 컬럼에서 순서를 바꿀 수 있는 형제들. 최상위 노트는 최상위 노트끼리 */
export function siblingsOf(s: Pick<State, "tree" | "open" | "roots" | "notes" | "minimized">, id: NoteId): NoteId[] {
  const parent = s.tree.parent[id];
  return parent ? visibleKids(s, parent) : rootsOf(s);
}

/** 화면에 보이는 자식. 열려 있어야 하고, 부모가 최소화돼 있지 않아야 한다. */
export function visibleKids(s: Pick<State, "tree" | "open" | "minimized">, id: NoteId): NoteId[] {
  if (s.minimized.has(id)) return [];
  return (s.tree.kids[id] ?? []).filter((k) => s.open.has(k));
}

/** 최상위 노트들에서 닿는 노트들(저장할 노트) */
export function reachable(s: Pick<State, "tree" | "roots" | "notes">): NoteId[] {
  return rootsOf(s).flatMap((r) => [r, ...descendants(s.tree, r)]);
}

/** 선택한 패널에서 위로만 또는 아래로만 센 거리. 계보 밖의 패널은 들어 있지 않다. */
export function lineage(s: Pick<State, "tree" | "open" | "minimized" | "active">): Map<NoteId, number> {
  if (!s.active) return new Map();
  const dist = new Map<NoteId, number>([[s.active, 0]]);
  let n = 1;
  for (let p = s.tree.parent[s.active]; p; p = s.tree.parent[p]) dist.set(p, n++);
  const down = (id: NoteId, d: number) => {
    for (const k of visibleKids(s, id)) {
      dist.set(k, d);
      down(k, d + 1);
    }
  };
  down(s.active, 1);
  return dist;
}

export function lineageStrength(dist: number | undefined): number {
  return dist === undefined ? 0 : Math.max(0, 1 - LINEAGE_STEP * dist);
}

/** 제목도 본문도 비어 있는 노트(막 만들고 아무것도 안 쓴 노트) */
function isBlank(s: State, id: NoteId): boolean {
  const n = s.notes[id];
  if (!n || n.title.trim() || (s.tree.kids[id] ?? []).length) return false;
  const c = n.doc.content ?? [];
  return c.length === 0 || (c.length === 1 && c[0].type === "paragraph" && !c[0].content?.length);
}

/**
 * 빈 노트를 없었던 일로 한다(Esc, Ctrl+W). 부모 본문에서 링크를 빼고 노트를 지운다. 되돌리기 알림은 없다.
 * 부모가 있으면 부모로 초점을 돌려 링크가 있던 자리에서 이어 쓰게 한다.
 */
function discardBlank(s: State, id: NoteId): State {
  const parent = s.tree.parent[id];
  const notes: Notes = { ...s.notes };
  delete notes[id];
  if (parent) notes[parent] = { ...s.notes[parent], doc: removeLinks(s.notes[parent].doc, new Set([id])).doc, updated: nowIso() };
  const open = new Set(s.open);
  open.delete(id);
  const minimized = new Set(s.minimized);
  minimized.delete(id);
  const panelHeights = { ...s.panelHeights };
  delete panelHeights[id];
  const next: State = {
    ...setNotes(s, notes),
    roots: s.roots.filter((r) => r !== id),
    open,
    minimized,
    panelHeights,
    active: parent ?? null,
    warn: false,
  };
  // 최상위 노트면 선택 없음(패널이 사라지며 입력 초점도 빠진다)
  return parent ? withFocus(next, parent, "restore") : next;
}

function withFocus(s: State, id: NoteId, where: FocusRequest["where"]): State {
  return { ...s, focus: { id, where, seq: (s.focus?.seq ?? 0) + 1 } };
}

function setNotes(s: State, notes: Notes): State {
  return { ...s, notes, tree: buildTree(notes) };
}

function closeNote(s: State, id: NoteId): State {
  const parent = s.tree.parent[id];
  // 최상위 노트는 닫지 않고 경고만 한다
  if (!parent) return { ...s, warn: true };
  const open = new Set(s.open);
  open.delete(id);
  const active = s.active && isInSubtree(s.tree, id, s.active) ? parent : s.active;
  return { ...s, open, active, warn: false };
}

/**
 * 링크가 지워진 노트(targets)와 하위 노트를 지운다. 부모 문서는 이미 링크가 빠진 상태여야 한다.
 * parent가 null이면 최상위 노트를 지운다(links 없음). 하위 노트는 지우기 전 트리(tree)로 찾는다.
 * 되돌리기는 전역 기록(Ctrl+Z)이 한다. 알림에는 되돌리기 버튼을 붙인다.
 */
function deleteSubtrees(s: State, parent: NoteId | null, targets: NoteId[], tree: Tree): State {
  const ids = [...new Set(targets.flatMap((r) => [r, ...descendants(tree, r)]))].filter((k) => k in s.notes);
  const notes: Notes = { ...s.notes };
  const open = new Set(s.open);
  const minimized = new Set(s.minimized);
  const panelHeights = { ...s.panelHeights };
  for (const k of ids) {
    delete notes[k];
    open.delete(k);
    minimized.delete(k);
    delete panelHeights[k];
  }
  const title = (id: NoteId) => s.notes[id]?.title || t().untitled;
  const message = t().deleted(targets.map(title), ids.length - targets.length);
  return {
    ...setNotes(s, notes),
    roots: parent ? s.roots : s.roots.filter((r) => !targets.includes(r)),
    open,
    minimized,
    panelHeights,
    active: s.active && ids.includes(s.active) ? parent : s.active,
    warn: false,
    toast: { message, seq: (s.toast?.seq ?? 0) + 1, undo: true },
  };
}

/** 메뉴로 노트를 지운다. 부모 본문에서 링크를 빼고 노트와 서브트리를 지운다. 최상위 노트면 목록에서 뺀다. */
function deleteNote(s: State, id: NoteId): State {
  const parent = s.tree.parent[id];
  if (!parent) return s.roots.includes(id) ? deleteSubtrees(s, null, [id], s.tree) : s;
  const before = s.notes[parent].doc;
  const { doc: after } = removeLinks(before, new Set([id]));
  const notes: Notes = { ...s.notes, [parent]: { ...s.notes[parent], doc: after, updated: nowIso() } };
  return deleteSubtrees(setNotes(s, notes), parent, [id], s.tree);
}

function nav(s: State, dir: Dir): State {
  const cols = columns(s);
  const c = s.active ? cols.findIndex((ids) => ids.includes(s.active!)) : -1;
  if (!s.active || c < 0) {
    // 아무것도 선택하지 않았으면 맨 위 최상위 노트부터
    const first = cols[0]?.[0];
    if (!first) return s;
    const picked = { ...s, active: first, warn: false };
    return s.moveOrigin ? picked : withFocus(picked, first, "restore");
  }
  const r = cols[c].indexOf(s.active);
  let next = s.active;
  if (dir === "left") next = s.tree.parent[s.active] ?? next;
  if (dir === "right") next = visibleKids(s, s.active)[0] ?? next;
  if (dir === "up" && r > 0) next = cols[c][r - 1];
  if (dir === "down" && r < cols[c].length - 1) next = cols[c][r + 1];
  const moved = { ...s, active: next, warn: false };
  // 패널이동모드에서는 에디터에 초점을 두지 않는다(방향키가 모드 이동에 쓰인다)
  return s.moveOrigin ? moved : withFocus(moved, next, "restore");
}

function apply(s: State, a: Action): State {
  switch (a.type) {
    case "select":
      return { ...s, active: a.id, warn: false, moveOrigin: null };

    case "toggleLink": {
      const parent = s.tree.parent[a.id];
      if (!parent) return s;
      if (s.open.has(a.id)) return { ...closeNote(s, a.id), active: parent };
      const open = new Set(s.open);
      if (s.settings.openMode === "replace") {
        for (const k of s.tree.kids[parent] ?? []) if (k !== a.id) open.delete(k);
      }
      open.add(a.id);
      return { ...s, open, active: a.id, warn: false };
    }

    case "close":
      return closeNote(s, a.id);

    case "closeActive": {
      if (!s.active || s.menu || s.overlay || s.moveOrigin) return s;
      // 막 만들고 아무것도 안 쓴 노트는 없었던 일로
      if (isBlank(s, s.active)) return discardBlank(s, s.active);
      // 최상위 노트는 닫는 대신 최소화한다(다시 누르면 복원)
      if (!s.tree.parent[s.active]) return withFocus(apply(s, { type: "toggleMinimize", id: s.active }), s.active, "restore");
      const closed = closeNote(s, s.active);
      return closed.active ? withFocus(closed, closed.active, "restore") : closed;
    }

    case "toggleMinimize": {
      const minimized = new Set(s.minimized);
      if (!minimized.delete(a.id)) minimized.add(a.id);
      return { ...s, minimized, active: a.id, warn: false };
    }

    case "delete":
      return deleteNote(s, a.id);

    case "expandAll": {
      const toOpen = descendants(s.tree, a.id).filter((k) => !s.open.has(k));
      if (!a.confirmed && toOpen.length > EXPAND_CONFIRM_OVER) {
        return {
          ...s,
          overlay: {
            kind: "confirm",
            message: t().expandConfirm(toOpen.length),
            confirmLabel: t().expandConfirmOk,
            action: { ...a, confirmed: true },
          },
        };
      }
      // 최소화된 패널이면 펼치면서 복원한다
      const minimized = new Set(s.minimized);
      minimized.delete(a.id);
      return { ...s, open: new Set([...s.open, ...toOpen]), minimized, active: a.id, warn: false };
    }

    case "collapseAll": {
      // 닫으면서 열림 상태 기억도 지운다
      const open = new Set(s.open);
      for (const k of descendants(s.tree, a.id)) open.delete(k);
      return { ...s, open, active: a.id, warn: false };
    }

    case "nav":
      return nav(s, a.dir);

    case "moveStart": {
      // 아무것도 선택하지 않았으면 맨 위 최상위 노트에서 시작한다
      const from = s.moveOrigin ?? s.active ?? columns(s)[0]?.[0];
      if (!from) return s;
      return { ...s, active: s.active ?? from, moveOrigin: from, overlay: null, warn: false };
    }

    case "moveEnd": {
      if (!s.moveOrigin) return s;
      const active = a.cancel ? s.moveOrigin : (s.active ?? s.moveOrigin);
      return withFocus({ ...s, active, moveOrigin: null }, active, "restore");
    }

    case "reorder": {
      const parent = s.tree.parent[a.id];
      const sibs = siblingsOf(s, a.id);
      const from = sibs.indexOf(a.id);
      const index = Math.max(0, Math.min(sibs.length - 1, a.index));
      if (from < 0 || index === from) return s;
      if (!parent) {
        // 최상위 노트끼리는 roots 순서를 바꾼다
        const roots = sibs.filter((r) => r !== a.id);
        roots.splice(index, 0, a.id);
        return { ...s, roots };
      }
      const doc = moveLink(s.notes[parent].doc, a.id, sibs[index], index > from ? "after" : "before");
      return setNotes(s, { ...s.notes, [parent]: { ...s.notes[parent], doc, updated: nowIso() } });
    }

    case "menu": {
      const active = !a.menu ? s.active : a.menu.kind === "panel" ? a.menu.id : a.menu.parent;
      return { ...s, menu: a.menu, active, warn: false };
    }

    case "fixBroken": {
      // 깨진 링크 자리에 빈 새 노트를 만들어 잇고 연다
      const id = crypto.randomUUID();
      const doc = replaceBroken(s.notes[a.parent]?.doc ?? {}, s.notes, a.n, id);
      if (!doc) return s;
      const notes: Notes = {
        ...s.notes,
        [a.parent]: { ...s.notes[a.parent], doc, updated: nowIso() },
        [id]: newNote(id),
      };
      return withFocus({ ...setNotes(s, notes), open: new Set([...s.open, id]), active: id, warn: false }, id, "title");
    }

    case "removeBroken": {
      const doc = replaceBroken(s.notes[a.parent]?.doc ?? {}, s.notes, a.n, null);
      if (!doc) return s;
      return setNotes(s, { ...s.notes, [a.parent]: { ...s.notes[a.parent], doc, updated: nowIso() } });
    }

    case "escape": {
      // 오류 알림, 메뉴, 오버레이, 모드가 떠 있으면 그것부터 닫는다
      if (s.toast?.error) return { ...s, toast: null };
      if (s.menu) return { ...s, menu: null };
      if (s.overlay) return { ...s, overlay: null };
      if (s.moveOrigin) return apply(s, { type: "moveEnd", cancel: true });
      if (!s.active) return s;
      // 그 밖에는 어디서든 빈 곳을 누른 것처럼 선택만 푼다(글 입력 초점은 App이 뺀다). 패널은 닫지 않는다.
      // 막 만들고 아무것도 안 쓴 노트는 없었던 일로 하고 선택도 푼다.
      const base = isBlank(s, s.active) ? discardBlank(s, s.active) : s;
      return { ...base, active: null, warn: false, focus: s.focus };
    }

    case "overlay":
      return { ...s, overlay: a.overlay };

    case "toast":
      return { ...s, toast: a.message ? { message: a.message, seq: (s.toast?.seq ?? 0) + 1, error: a.error } : null };

    case "colWidth":
      return { ...s, colWidths: { ...s.colWidths, [a.depth]: a.width } };

    case "panelHeight":
      return { ...s, panelHeights: { ...s.panelHeights, [a.id]: a.height } };

    case "fitted": {
      const fit = new Set(s.fit);
      for (const id of a.ids) fit.delete(id);
      return { ...s, fit, panelHeights: { ...s.panelHeights, ...a.heights } };
    }

    case "freshDone":
      return s.fresh ? { ...s, fresh: false } : s;

    case "settings":
      return { ...s, settings: { ...s.settings, ...a.patch } };

    case "editDoc": {
      const prev = s.notes[a.id];
      if (!prev) return s;
      let next = setNotes(s, { ...s.notes, [a.id]: { ...prev, doc: a.doc, updated: nowIso() } });
      if (a.keep) return next;
      // 링크가 지워졌으면 그 노트와 하위 노트를 지운다(되돌리기 알림)
      const after = new Set(docLinks(a.doc));
      const removed = docLinks(prev.doc).filter((id) => !after.has(id) && s.tree.parent[id] === a.id);
      if (removed.length) next = deleteSubtrees(next, a.id, [...new Set(removed)], s.tree);
      return next;
    }

    case "setTitle": {
      const note = s.notes[a.id];
      if (!note || note.title === a.title) return s;
      return { ...s, notes: { ...s.notes, [a.id]: { ...note, title: a.title, updated: nowIso() } } };
    }

    case "createNote": {
      const notes: Notes = { ...s.notes, [a.id]: newNote(a.id) };
      return withFocus({ ...setNotes(s, notes), open: new Set([...s.open, a.id]), active: a.id, warn: false }, a.id, "title");
    }

    case "createRoot": {
      const notes: Notes = { ...s.notes, [a.id]: newNote(a.id) };
      return withFocus({ ...setNotes(s, notes), roots: [...rootsOf(s), a.id], active: a.id, warn: false }, a.id, "title");
    }

    case "addChild": {
      const parent = s.notes[a.parent];
      if (!parent) return s;
      const notes: Notes = {
        ...s.notes,
        [a.parent]: { ...parent, doc: appendLink(parent.doc, a.id), updated: nowIso() },
        [a.id]: newNote(a.id),
      };
      // 부모가 최소화돼 있으면 새 노트가 보이게 복원한다
      const minimized = new Set(s.minimized);
      minimized.delete(a.parent);
      const next = { ...setNotes(s, notes), open: new Set([...s.open, a.id]), minimized, active: a.id, warn: false };
      return withFocus(next, a.id, "title");
    }

    case "addNotes": {
      const notes: Notes = { ...s.notes };
      for (const n of a.notes) notes[n.id] = n;
      return setNotes(s, notes);
    }

    case "focus":
      return withFocus(s, a.id, a.where);

    case "view":
      return { ...s, view: a.view };

    case "hydrate":
      return { ...a.state, epoch: s.epoch + 1 };

    case "undo":
    case "redo":
      return s; // reducer가 처리한다
  }
}

// ───── 전역 되돌리기 ─────
// 노트 구조(노트 내용, 최상위 노트 순서, 열림, 최소화)를 바꾸는 동작은 바뀌기 전 모습을 기록에 쌓는다.
// 설정, 화면 이동·확대, 패널 크기, 선택 이동은 기록하지 않는다.

/** 기록은 이만큼만 남긴다 */
const HISTORY_MAX = 300;
/** 이어서 친 글은 이 간격 안이면 한 단계로 묶는다 */
const TYPING_GAP = 1000;
/** 한 단계로 묶는 글의 최대 길이(시간) */
const TYPING_SPAN = 5000;

const UNDOABLE = new Set<Action["type"]>([
  "toggleLink",
  "close",
  "closeActive",
  "toggleMinimize",
  "delete",
  "fixBroken",
  "removeBroken",
  "reorder",
  "expandAll",
  "collapseAll",
  "escape",
  "editDoc",
  "setTitle",
  "createNote",
  "createRoot",
  "addChild",
  "addNotes",
]);

// 같은 순간에 잇달아 온 동작(예: 새 노트 만들기 + 링크 넣기, 잘라낸 것 빼기 + 붙이기)을 한 단계로 묶기 위한 번호.
// 동기 코드가 끝나면(마이크로태스크) 다음 번호로 넘어간다.
let tickNo = 0;
let tickPending = false;
function currentTick(): number {
  if (!tickPending) {
    tickPending = true;
    queueMicrotask(() => {
      tickNo++;
      tickPending = false;
    });
  }
  return tickNo;
}

function structureChanged(a: State, b: State): boolean {
  return a.notes !== b.notes || a.roots !== b.roots || a.open !== b.open || a.minimized !== b.minimized;
}

/** 이 동작이 이어 친 글이면 무엇의 글인지. 링크가 생기거나 없어진 편집은 따로 한 단계로 둔다. */
function typingGroup(s: State, a: Action): HistoryEntry["group"] {
  if (a.type === "setTitle") return { kind: "title", id: a.id };
  if (a.type === "editDoc" && !a.keep) {
    const prev = s.notes[a.id];
    if (prev && docLinks(prev.doc).join() === docLinks(a.doc).join()) return { kind: "text", id: a.id };
  }
  return null;
}

function entryOf(s: State, group: HistoryEntry["group"], now: number, tick: number): HistoryEntry {
  return { notes: s.notes, roots: s.roots, open: s.open, minimized: s.minimized, active: s.active, group, start: now, last: now, tick };
}

/** 기록의 모습으로 되돌리고, 그때 선택한 패널을 다시 고른다 */
function restoreEntry(s: State, e: HistoryEntry): State {
  const next = setNotes({ ...s, roots: e.roots, open: e.open, minimized: e.minimized, warn: false }, e.notes);
  const active = e.active && e.active in e.notes ? e.active : null;
  const restored = { ...next, active, undoSeq: s.undoSeq + 1, toast: s.toast?.undo ? null : s.toast };
  return active ? withFocus(restored, active, "restore") : restored;
}

export function reducer(s: State, a: Action): State {
  if (a.type === "undo" || a.type === "redo") {
    const from = a.type === "undo" ? s.past : s.future;
    if (!from.length) return s;
    const e = from[from.length - 1];
    const back = entryOf(s, null, 0, -1);
    const next = restoreEntry(s, e);
    return a.type === "undo"
      ? { ...next, past: s.past.slice(0, -1), future: [...s.future, back] }
      : { ...next, future: s.future.slice(0, -1), past: [...s.past, back] };
  }
  const next = apply(s, a);
  if (!UNDOABLE.has(a.type) || !structureChanged(s, next)) return next;
  const now = Date.now();
  const tick = currentTick();
  const group = typingGroup(s, a);
  const last = s.past[s.past.length - 1];
  const merge =
    last &&
    (last.tick === tick ||
      (group &&
        last.group?.kind === group.kind &&
        last.group.id === group.id &&
        now - last.last < TYPING_GAP &&
        now - last.start < TYPING_SPAN));
  const past = merge
    ? [...s.past.slice(0, -1), { ...last, last: now, tick }]
    : [...s.past, entryOf(s, group, now, tick)].slice(-HISTORY_MAX);
  // 새 동작이 쌓였으니 예전 삭제 알림의 되돌리기 버튼은 더 이상 그 삭제를 가리키지 않는다
  const staleToast = !merge && next.toast?.undo && next.toast === s.toast;
  return { ...next, past, future: [], toast: staleToast ? { ...next.toast!, undo: false } : next.toast };
}
