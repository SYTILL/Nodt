import {
  buildTree,
  descendants,
  isInSubtree,
  moveLink,
  removeLink,
  replaceBroken,
  type Note,
  type NoteId,
  type Notes,
  type Tree,
} from "../model/notes";
import { createSampleNotes } from "../model/sample";
import { loadSettings } from "./persist";
import type { ThemeId } from "../theme/themes";

/** 하위 전체 펼치기에서 이보다 많이 열리면 확인 창을 띄운다 */
const EXPAND_CONFIRM_OVER = 30;
/** 계보를 따라 한 칸 갈 때마다 옅어지는 정도 */
const LINEAGE_STEP = 0.3;

export type Brightness = "light" | "dark" | "system";

export interface Settings {
  openMode: "add" | "replace";
  lines: boolean;
  theme: ThemeId;
  /** 기본값은 미결 사항이다. 일단 시스템 설정을 따른다. */
  brightness: Brightness;
}

export type Dir = "left" | "right" | "up" | "down";

export type Overlay =
  | { kind: "help" }
  | { kind: "settings" }
  | { kind: "confirm"; message: string; confirmLabel: string; action: Action };

/** 삭제를 되돌리는 데 필요한 것. 되돌리기 알림이 사라지면 버린다. */
export interface Deleted {
  parent: NoteId;
  /** 부모 본문에서 링크를 뺀 위치와 뺀 문자열 */
  index: number;
  removed: string;
  notes: Note[];
  open: NoteId[];
  minimized: NoteId[];
  panelHeights: Record<NoteId, number>;
  active: NoteId;
}

export interface State {
  notes: Notes;
  tree: Tree;
  rootId: NoteId;
  /** 열린 노트. 조상이 닫혀 화면에 없는 노트도 남아 있어서, 다시 열면 그대로 펼쳐진다. */
  open: ReadonlySet<NoteId>;
  /** 제목줄만 남기고 접은 패널. 하위 패널도 화면에서 빠지지만 열림 상태는 그대로 기억한다. */
  minimized: ReadonlySet<NoteId>;
  /** 드롭다운 메뉴. 패널 상단바 우클릭, 또는 깨진 링크 클릭(parent 본문의 n번째 깨진 링크) */
  menu:
    | { kind: "panel"; id: NoteId; x: number; y: number }
    | { kind: "broken"; parent: NoteId; n: number; x: number; y: number }
    | null;
  active: NoteId;
  /** 최상위 노트에서 Esc를 눌렀을 때의 경고 */
  warn: boolean;
  /** 패널이동모드일 때 들어오기 전의 패널. 모드가 아니면 null */
  moveOrigin: NoteId | null;
  overlay: Overlay | null;
  /** undo가 true면 되돌리기 버튼이 붙은 삭제 알림이다 */
  toast: { message: string; seq: number; undo?: boolean } | null;
  deleted: Deleted | null;
  colWidths: Record<number, number>;
  panelHeights: Record<NoteId, number>;
  settings: Settings;
}

export type Action =
  | { type: "select"; id: NoteId }
  | { type: "toggleLink"; id: NoteId }
  | { type: "close"; id: NoteId }
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
  | { type: "toast"; message: string | null }
  | { type: "colWidth"; depth: number; width: number }
  | { type: "panelHeight"; id: NoteId; height: number }
  | { type: "settings"; patch: Partial<Settings> };

export function initState(): State {
  const { notes, rootId, ids } = createSampleNotes();
  return {
    notes,
    tree: buildTree(notes),
    rootId,
    open: new Set([ids.cs, ids.comp, ids.mid, ids.parser, ids.app]),
    minimized: new Set(),
    menu: null,
    active: ids.comp,
    warn: false,
    moveOrigin: null,
    overlay: null,
    toast: null,
    deleted: null,
    colWidths: {},
    panelHeights: {},
    settings: loadSettings(),
  };
}

/** 화면에 보이는 패널을 깊이별 컬럼으로. 컬럼 안 순서는 트리 순서다. */
export function columns(s: Pick<State, "tree" | "open" | "rootId" | "minimized">): NoteId[][] {
  const cols: NoteId[][] = [];
  const walk = (id: NoteId, d: number) => {
    (cols[d] ??= []).push(id);
    for (const k of visibleKids(s, id)) walk(k, d + 1);
  };
  walk(s.rootId, 0);
  return cols;
}

/** 화면에 보이는 자식. 열려 있어야 하고, 부모가 최소화돼 있지 않아야 한다. */
export function visibleKids(s: Pick<State, "tree" | "open" | "minimized">, id: NoteId): NoteId[] {
  if (s.minimized.has(id)) return [];
  return (s.tree.kids[id] ?? []).filter((k) => s.open.has(k));
}

/** 선택한 패널에서 위로만 또는 아래로만 센 거리. 계보 밖의 패널은 들어 있지 않다. */
export function lineage(s: Pick<State, "tree" | "open" | "minimized" | "active">): Map<NoteId, number> {
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

function closeNote(s: State, id: NoteId): State {
  if (id === s.rootId) return { ...s, warn: true };
  const open = new Set(s.open);
  open.delete(id);
  const active = isInSubtree(s.tree, id, s.active) ? s.tree.parent[id]! : s.active;
  return { ...s, open, active, warn: false };
}

/** 부모 본문에서 링크를 빼고 노트와 서브트리를 지운다. 되돌리기 알림이 떠 있는 동안은 되돌릴 수 있다. */
function deleteNote(s: State, id: NoteId): State {
  const parent = s.tree.parent[id];
  const cut = parent && removeLink(s.notes[parent].body, id);
  if (!parent || !cut) return s;

  const ids = [id, ...descendants(s.tree, id)];
  const notes: Notes = { ...s.notes, [parent]: { ...s.notes[parent], body: cut.body } };
  const open = new Set(s.open);
  const minimized = new Set(s.minimized);
  const panelHeights = { ...s.panelHeights };
  for (const k of ids) {
    delete notes[k];
    open.delete(k);
    minimized.delete(k);
    delete panelHeights[k];
  }

  const title = s.notes[id].title || "제목 없음";
  const more = ids.length - 1;
  return {
    ...s,
    notes,
    tree: buildTree(notes),
    open,
    minimized,
    panelHeights,
    active: ids.includes(s.active) ? parent : s.active,
    warn: false,
    deleted: {
      parent,
      index: cut.index,
      removed: cut.removed,
      notes: ids.map((k) => s.notes[k]),
      open: ids.filter((k) => s.open.has(k)),
      minimized: ids.filter((k) => s.minimized.has(k)),
      panelHeights: Object.fromEntries(ids.filter((k) => k in s.panelHeights).map((k) => [k, s.panelHeights[k]])),
      active: s.active,
    },
    toast: {
      message: `‘${title}’ 삭제됨` + (more ? ` · 하위 노트 ${more}개 포함` : ""),
      seq: (s.toast?.seq ?? 0) + 1,
      undo: true,
    },
  };
}

function nav(s: State, dir: Dir): State {
  const cols = columns(s);
  const c = cols.findIndex((ids) => ids.includes(s.active));
  if (c < 0) return { ...s, active: s.rootId, warn: false };
  const r = cols[c].indexOf(s.active);
  let next = s.active;
  if (dir === "left") next = s.tree.parent[s.active] ?? next;
  if (dir === "right") next = visibleKids(s, s.active)[0] ?? next;
  if (dir === "up" && r > 0) next = cols[c][r - 1];
  if (dir === "down" && r < cols[c].length - 1) next = cols[c][r + 1];
  return { ...s, active: next, warn: false };
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

    case "toggleMinimize": {
      const minimized = new Set(s.minimized);
      if (!minimized.delete(a.id)) minimized.add(a.id);
      return { ...s, minimized, active: a.id, warn: false };
    }

    case "delete":
      return deleteNote(s, a.id);

    case "undoDelete": {
      const d = s.deleted;
      const parent = d && s.notes[d.parent];
      if (!d || !parent) return s;
      const i = Math.min(d.index, parent.body.length);
      const notes: Notes = { ...s.notes, [d.parent]: { ...parent, body: parent.body.slice(0, i) + d.removed + parent.body.slice(i) } };
      for (const n of d.notes) notes[n.id] = n;
      return {
        ...s,
        notes,
        tree: buildTree(notes),
        open: new Set([...s.open, ...d.open]),
        minimized: new Set([...s.minimized, ...d.minimized]),
        panelHeights: { ...s.panelHeights, ...d.panelHeights },
        active: d.active in notes ? d.active : s.active,
        deleted: null,
        toast: null,
      };
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

    case "moveStart":
      return { ...s, moveOrigin: s.moveOrigin ?? s.active, overlay: null, warn: false };

    case "moveEnd":
      if (!s.moveOrigin) return s;
      return { ...s, active: a.cancel ? s.moveOrigin : s.active, moveOrigin: null };

    case "reorder": {
      const parent = s.tree.parent[a.id];
      if (!parent) return s;
      const sibs = visibleKids(s, parent);
      const from = sibs.indexOf(a.id);
      const index = Math.max(0, Math.min(sibs.length - 1, a.index));
      if (from < 0 || index === from) return s;
      const body = moveLink(s.notes[parent].body, a.id, sibs[index], index > from ? "after" : "before");
      const notes: Notes = { ...s.notes, [parent]: { ...s.notes[parent], body } };
      return { ...s, notes, tree: buildTree(notes) };
    }

    case "menu": {
      const active = !a.menu ? s.active : a.menu.kind === "panel" ? a.menu.id : a.menu.parent;
      return { ...s, menu: a.menu, active, warn: false };
    }

    case "fixBroken": {
      // 깨진 링크 자리에 빈 새 노트를 만들어 잇고 연다
      const id = crypto.randomUUID();
      const body = replaceBroken(s.notes[a.parent]?.body ?? "", s.notes, a.n, `[>](nodt:${id})`);
      if (body === null) return s;
      const notes: Notes = { ...s.notes, [a.parent]: { ...s.notes[a.parent], body }, [id]: { id, title: "", body: "" } };
      return { ...s, notes, tree: buildTree(notes), open: new Set([...s.open, id]), active: id, warn: false };
    }

    case "removeBroken": {
      const body = replaceBroken(s.notes[a.parent]?.body ?? "", s.notes, a.n, null);
      if (body === null) return s;
      const notes: Notes = { ...s.notes, [a.parent]: { ...s.notes[a.parent], body } };
      return { ...s, notes, tree: buildTree(notes) };
    }

    case "escape":
      // 메뉴, 오버레이, 모드가 떠 있으면 그것부터 닫는다
      if (s.menu) return { ...s, menu: null };
      if (s.overlay) return { ...s, overlay: null };
      if (s.moveOrigin) return reducer(s, { type: "moveEnd", cancel: true });
      return closeNote(s, s.active);

    case "overlay":
      return { ...s, overlay: a.overlay };

    case "toast":
      // 되돌리기 알림이 사라지거나 다른 알림으로 바뀌면 삭제가 확정된다
      return {
        ...s,
        toast: a.message ? { message: a.message, seq: (s.toast?.seq ?? 0) + 1 } : null,
        deleted: null,
      };

    case "colWidth":
      return { ...s, colWidths: { ...s.colWidths, [a.depth]: a.width } };

    case "panelHeight":
      return { ...s, panelHeights: { ...s.panelHeights, [a.id]: a.height } };

    case "settings":
      return { ...s, settings: { ...s.settings, ...a.patch } };
  }
}
