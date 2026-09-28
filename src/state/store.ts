import type { JSONContent } from "@tiptap/core";
import {
  appendLink,
  buildTree,
  descendants,
  docLinks,
  insertLinkAt,
  isInSubtree,
  linkPaths,
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
import type { ThemeId } from "../theme/themes";

/** 하위 전체 펼치기에서 이보다 많이 열리면 확인 창을 띄운다 */
const EXPAND_CONFIRM_OVER = 30;
/** 계보를 따라 한 칸 갈 때마다 옅어지는 정도 */
const LINEAGE_STEP = 0.3;

export type Brightness = "light" | "dark" | "system";
/** 창 배경 효과(Windows). none이면 불투명한 배경 */
export type Backdrop = "mica" | "acrylic" | "none";

export interface Settings {
  openMode: "add" | "replace";
  lines: boolean;
  theme: ThemeId;
  brightness: Brightness;
  backdrop: Backdrop;
  /** 창 배경 투명도(0~100). 배경 효과가 깔렸을 때만 보인다. 100이면 효과만 남는다. */
  transparency: number;
}

export const DEFAULT_SETTINGS: Settings = {
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

/** 삭제를 되돌리는 데 필요한 것. 되돌리기 알림이 사라지면 버린다. */
export interface Deleted {
  /** 링크가 있던 부모. 최상위 노트를 지웠으면 null */
  parent: NoteId | null;
  /** 부모 본문의 삭제 전후 문서. 그 뒤로 편집이 없었으면 삭제 전 문서로 돌아간다. */
  docBefore?: JSONContent;
  docAfter?: JSONContent;
  /** 뺀 링크의 삭제 전 경로. 그 뒤로 편집이 있었으면 이 자리에 다시 넣는다. */
  paths: Record<NoteId, number[]>;
  /** 링크가 지워진 노트들(최상위 노트를 지웠으면 그 노트). 하위 노트는 notes에만 있다. */
  targets: NoteId[];
  /** 최상위 노트를 지웠을 때 원래 순서 */
  rootIndex?: number;
  notes: Note[];
  open: NoteId[];
  minimized: NoteId[];
  panelHeights: Record<NoteId, number>;
  active: NoteId | null;
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
  deleted: Deleted | null;
  focus: FocusRequest | null;
  colWidths: Record<number, number>;
  panelHeights: Record<NoteId, number>;
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
  | { type: "undoDelete" }
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
    deleted: null,
    focus: null,
    colWidths: {},
    panelHeights: {},
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
 * parent가 null이면 최상위 노트를 지운다(links 없음).
 * 되돌리기 알림이 떠 있는 동안은 되돌릴 수 있다. 하위 노트는 지우기 전 트리(tree)로 찾는다.
 */
function deleteSubtrees(
  s: State,
  parent: NoteId | null,
  targets: NoteId[],
  tree: Tree,
  docs?: { before: JSONContent; after: JSONContent },
): State {
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
  const paths: Record<NoteId, number[]> = {};
  if (docs) for (const l of linkPaths(docs.before)) if (targets.includes(l.id)) paths[l.id] ??= l.path;

  const title = (id: NoteId) => s.notes[id]?.title || "제목 없음";
  const more = ids.length - targets.length;
  const message =
    targets.length === 1
      ? `‘${title(targets[0])}’ 삭제됨` + (more ? ` · 하위 노트 ${more}개 포함` : "")
      : `노트 ${targets.length}개 삭제됨` + (more ? ` · 하위 노트 ${more}개 포함` : "");
  return {
    ...setNotes(s, notes),
    roots: parent ? s.roots : s.roots.filter((r) => !targets.includes(r)),
    open,
    minimized,
    panelHeights,
    active: s.active && ids.includes(s.active) ? parent : s.active,
    warn: false,
    deleted: {
      parent,
      docBefore: docs?.before,
      docAfter: docs?.after,
      paths,
      targets,
      rootIndex: parent ? undefined : s.roots.indexOf(targets[0]),
      notes: ids.map((k) => s.notes[k]),
      open: ids.filter((k) => s.open.has(k)),
      minimized: ids.filter((k) => s.minimized.has(k)),
      panelHeights: Object.fromEntries(ids.filter((k) => k in s.panelHeights).map((k) => [k, s.panelHeights[k]])),
      active: s.active,
    },
    toast: { message, seq: (s.toast?.seq ?? 0) + 1, undo: true },
  };
}

/** 삭제를 되돌린다. touchDoc이면 부모 문서에도 링크를 되돌린다(에디터가 이미 되돌렸으면 false). */
function restoreDeleted(s: State, d: Deleted, touchDoc: boolean): State {
  const notes: Notes = { ...s.notes };
  for (const n of d.notes) notes[n.id] = n;
  const cur = d.parent ? notes[d.parent] : undefined;
  if (touchDoc && d.parent && cur) {
    let doc: JSONContent;
    if (cur.doc === d.docAfter && d.docBefore) {
      doc = d.docBefore;
    } else {
      doc = cur.doc;
      const present = new Set(docLinks(doc));
      for (const r of d.targets) if (!present.has(r)) doc = insertLinkAt(doc, r, d.paths[r] ?? [0, 0]);
    }
    notes[d.parent] = { ...cur, doc, updated: nowIso() };
  }
  let roots = s.roots;
  if (!d.parent) {
    roots = s.roots.filter((r) => !d.targets.includes(r));
    roots.splice(Math.max(0, Math.min(d.rootIndex ?? roots.length, roots.length)), 0, ...d.targets);
  }
  return {
    ...setNotes(s, notes),
    roots,
    open: new Set([...s.open, ...d.open]),
    minimized: new Set([...s.minimized, ...d.minimized]),
    panelHeights: { ...s.panelHeights, ...d.panelHeights },
    active: d.active && d.active in notes ? d.active : s.active,
    deleted: null,
    toast: null,
  };
}

/** 메뉴로 노트를 지운다. 부모 본문에서 링크를 빼고 노트와 서브트리를 지운다. 최상위 노트면 목록에서 뺀다. */
function deleteNote(s: State, id: NoteId): State {
  const parent = s.tree.parent[id];
  if (!parent) return s.roots.includes(id) ? deleteSubtrees(s, null, [id], s.tree) : s;
  const before = s.notes[parent].doc;
  const { doc: after } = removeLinks(before, new Set([id]));
  const notes: Notes = { ...s.notes, [parent]: { ...s.notes[parent], doc: after, updated: nowIso() } };
  return deleteSubtrees(setNotes(s, notes), parent, [id], s.tree, { before, after });
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

export function reducer(s: State, a: Action): State {
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
      // 최상위 노트는 닫는 대신 최소화한다(다시 누르면 복원)
      if (!s.tree.parent[s.active]) return withFocus(reducer(s, { type: "toggleMinimize", id: s.active }), s.active, "restore");
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

    case "undoDelete": {
      const d = s.deleted;
      return d && (d.parent === null || d.parent in s.notes) ? restoreDeleted(s, d, true) : s;
    }

    case "expandAll": {
      const toOpen = descendants(s.tree, a.id).filter((k) => !s.open.has(k));
      if (!a.confirmed && toOpen.length > EXPAND_CONFIRM_OVER) {
        return {
          ...s,
          overlay: {
            kind: "confirm",
            message: `하위 노트 ${toOpen.length}개를 모두 열까요?`,
            confirmLabel: "모두 열기",
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
      if (s.moveOrigin) return reducer(s, { type: "moveEnd", cancel: true });
      if (!s.active) return s;
      const closed = closeNote(s, s.active);
      return closed.active && closed.active !== s.active ? withFocus(closed, closed.active, "restore") : closed;
    }

    case "overlay":
      return { ...s, overlay: a.overlay };

    case "toast":
      // 되돌리기 알림이 사라지거나 다른 알림으로 바뀌면 삭제가 확정된다
      return {
        ...s,
        toast: a.message ? { message: a.message, seq: (s.toast?.seq ?? 0) + 1, error: a.error } : null,
        deleted: null,
      };

    case "colWidth":
      return { ...s, colWidths: { ...s.colWidths, [a.depth]: a.width } };

    case "panelHeight":
      return { ...s, panelHeights: { ...s.panelHeights, [a.id]: a.height } };

    case "settings":
      return { ...s, settings: { ...s.settings, ...a.patch } };

    case "editDoc": {
      const prev = s.notes[a.id];
      if (!prev) return s;
      let next = setNotes(s, { ...s.notes, [a.id]: { ...prev, doc: a.doc, updated: nowIso() } });
      const before = new Set(docLinks(prev.doc));
      const after = new Set(docLinks(a.doc));
      // 삭제 대기 중인 노트로 가는 링크가 다시 생기면(에디터의 되돌리기) 노트를 되살린다
      const d = next.deleted;
      if (d && d.targets.some((r) => after.has(r) && !before.has(r))) next = restoreDeleted(next, d, false);
      if (a.keep) return next;
      // 링크가 지워졌으면 그 노트와 하위 노트를 지운다(되돌리기 알림)
      const removed = [...before].filter((id) => !after.has(id) && s.tree.parent[id] === a.id);
      if (removed.length) next = deleteSubtrees(next, a.id, removed, s.tree, { before: prev.doc, after: a.doc });
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
  }
}
