import type { JSONContent } from "@tiptap/core";
import { Fragment, Slice, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { t } from "../i18n";
import { LINK_NODE } from "../model/markdown";
import { BROKEN_TARGET, isInSubtree, mapLinks, nowIso, type Note, type NoteId } from "../model/notes";
import type { GetApi } from "./api";

// 복사, 잘라내기, 붙여넣기 (스펙 3.5)
// Ctrl+C → Ctrl+V: 링크는 깨진 링크로 붙는다(부모는 하나뿐).
// Ctrl+C → Ctrl+Shift+V: 하위 노트까지 새 ID로 복제해서 붙인다.
// Ctrl+X → Ctrl+V: 이동. 잘라낸 곳은 바로 지우지 않고 박스로 표시했다가, 붙이는 순간 옮긴다.

/** 트랜잭션에 이 표시가 있으면 사라진 링크를 삭제로 보지 않는다(옮기는 중) */
export const KEEP_META = "nodtKeep";

// ───── 잘라내기 박스 ─────

export const cutKey = new PluginKey<{ from: number; to: number } | null>("nodtCut");

let cut: { view: EditorView; noteId: NoteId } | null = null;

/** 잘라낸 박스가 아직 살아 있으면 돌려준다. 박스 안이 편집돼 풀렸으면 null. */
export function pendingCut() {
  if (cut && (cut.view.isDestroyed || !cutKey.getState(cut.view.state))) cut = null;
  return cut;
}

export function cancelCut(): boolean {
  const c = pendingCut();
  cut = null;
  if (!c) return false;
  c.view.dispatch(c.view.state.tr.setMeta(cutKey, null));
  return true;
}

/** 제목 칸에 붙여넣기. 붙일 수 없으면 알림 글을 돌려주고, 붙일 수 있으면 null.
 *  제목은 글 한 줄뿐이라 링크나 여러 줄은 받지 않는다. 잘라낸 글이면 원래 자리에서 지운다. */
export function pasteIntoTitle(text: string): string | null {
  const c = pendingCut();
  const range = c && cutKey.getState(c.view.state);
  if (c && range && linkIds(c.view.state.doc.slice(range.from, range.to).content).length) return t().titleNoLinks;
  if (text.trim().includes("\n")) return t().titleOneLine;
  if (c && range) {
    cut = null;
    c.view.dispatch(removeCut(c.view.state.tr, range.from, range.to).setMeta(cutKey, null));
  }
  return null;
}

/** 잘라낸 자리를 지운다. 줄을 통째로 잘랐으면 빈 줄(빈 글머리표 포함)도 남기지 않는다. */
function removeCut(tr: Transaction, from: number, to: number): Transaction {
  const $from = tr.doc.resolve(from);
  const $to = tr.doc.resolve(to);
  const whole = $from.parentOffset === 0 && $to.parentOffset === $to.parent.content.size;
  tr.delete(from, to);
  if (!whole) return tr;
  const $p = tr.doc.resolve(tr.mapping.slice(tr.steps.length - 1).map(from));
  if (!$p.parent.isTextblock || $p.parent.content.size) return tr;
  // 빈 줄만 들어 있는 바깥 블록(목록 항목, 목록)까지 함께 지운다
  let d = $p.depth;
  while (d > 1 && $p.node(d - 1).childCount === 1) d--;
  const parent = $p.node(d - 1);
  const i = $p.index(d - 1);
  if (parent.childCount > 1 && parent.canReplace(i, i + 1)) tr.delete($p.before(d), $p.after(d));
  return tr;
}

function startCut(view: EditorView, noteId: NoteId, from: number, to: number) {
  cancelCut();
  cut = { view, noteId };
  view.dispatch(view.state.tr.setMeta(cutKey, { from, to }));
}

/** 잘라낸 범위를 표시하고, 편집에 따라 범위를 옮긴다. 박스 안이 편집되면 풀린다. */
export function cutPlugin() {
  return new Plugin<{ from: number; to: number } | null>({
    key: cutKey,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(cutKey);
        if (meta !== undefined) return meta;
        if (!value || !tr.docChanged) return value;
        let { from, to } = value;
        let touched = false;
        for (const map of tr.mapping.maps) {
          map.forEach((start, end) => {
            if (end > from && start < to) touched = true;
          });
          from = map.map(from, 1);
          to = map.map(to, -1);
        }
        return touched || from >= to ? null : { from, to };
      },
    },
    props: {
      decorations(state) {
        const v = cutKey.getState(state);
        return v ? DecorationSet.create(state.doc, [Decoration.inline(v.from, v.to, { class: "cut-box" })]) : null;
      },
    },
  });
}

// ───── 앱 안 클립보드 ─────
// 링크 ID를 온전히 가진 복사본. Ctrl+Shift+V는 브라우저가 글만 넘겨 주므로, 글이 같으면 이 복사본으로 복제한다.

let internal: { slice: ReturnType<Slice["toJSON"]>; text: string } | null = null;

export function clipboardText(slice: Slice): string {
  return slice.content.textBetween(0, slice.content.size, "\n", "");
}

// ───── 에디터 설정 ─────

function linkIds(fragment: Fragment): string[] {
  const out: string[] = [];
  fragment.descendants((n) => {
    if (n.type.name === LINK_NODE) out.push(String(n.attrs.id));
  });
  return out;
}

function mapFragment(fragment: Fragment, fn: (n: PMNode) => PMNode): Fragment {
  const out: PMNode[] = [];
  fragment.forEach((n) => out.push(fn(n.copy(mapFragment(n.content, fn)))));
  return Fragment.from(out);
}

/** 붙여넣은 링크는 깨진 링크가 된다. 같은 노트를 두 곳에 둘 수 없기 때문이다. */
function breakLinks(slice: Slice, schema: Schema): Slice {
  const type = schema.nodes[LINK_NODE];
  const content = mapFragment(slice.content, (n) => (n.type === type ? type.create({ id: BROKEN_TARGET }) : n));
  return new Slice(content, slice.openStart, slice.openEnd);
}

function remapJSON(json: JSONContent, fn: (id: string) => string): JSONContent {
  return mapLinks(json, fn);
}

/** 잘라 둔 것을 지금 커서 자리로 옮긴다 */
function moveCut(view: EditorView, getApi: GetApi): boolean {
  const c = pendingCut();
  const range = c && cutKey.getState(c.view.state);
  if (!c || !range) return false;
  const api = getApi();
  const s = api.getState();
  const src = c.view;
  const slice = src.state.doc.slice(range.from, range.to);
  // 자기 자신이나 자기 하위 노트 안으로는 옮길 수 없다(순환)
  const moving = linkIds(slice.content).filter((id) => id in s.notes);
  if (moving.some((id) => isInSubtree(s.tree, id, api.noteId))) {
    cancelCut();
    api.raw({ type: "toast", message: t().cannotMoveIntoSelf });
    return true;
  }
  cut = null;
  api.animate(() => {
    if (src === view) {
      const { from, to } = view.state.selection;
      if (from >= range.from && to <= range.to) {
        view.dispatch(view.state.tr.setMeta(cutKey, null));
        return;
      }
      const tr = view.state.tr.replaceSelection(slice);
      const a = tr.mapping.map(range.from);
      const b = tr.mapping.map(range.to);
      removeCut(tr, a, b).setMeta(cutKey, null).setMeta(KEEP_META, true).scrollIntoView();
      view.dispatch(tr);
    } else {
      // 먼저 원래 자리에서 빼고(삭제 아님), 새 자리에 넣는다
      src.dispatch(removeCut(src.state.tr, range.from, range.to).setMeta(cutKey, null).setMeta(KEEP_META, true));
      // 에디터마다 스키마 객체가 따로라서, 다른 에디터의 조각은 이 에디터 스키마로 다시 만들어야 들어간다
      const here = Slice.fromJSON(view.state.schema, slice.toJSON());
      view.dispatch(view.state.tr.replaceSelection(here).scrollIntoView());
    }
  });
  return true;
}

/** 앱 안 복사본을 하위 노트까지 새 ID로 복제해서 붙인다 */
function deepPaste(view: EditorView, getApi: GetApi): boolean {
  if (!internal) return false;
  const api = getApi();
  const s = api.getState();
  const slice = Slice.fromJSON(view.state.schema, internal.slice);
  const idMap = new Map<string, string>();
  const cloneRec = (id: string) => {
    if (idMap.has(id)) return;
    idMap.set(id, crypto.randomUUID());
    for (const k of s.tree.kids[id] ?? []) cloneRec(k);
  };
  for (const id of linkIds(slice.content)) if (id in s.notes) cloneRec(id);
  const toNew = (id: string) => idMap.get(id) ?? BROKEN_TARGET;
  const t = nowIso();
  const clones: Note[] = [...idMap].map(([old, id]) => ({
    id,
    title: s.notes[old].title,
    doc: mapLinks(s.notes[old].doc, toNew),
    created: t,
    updated: t,
  }));
  const json = slice.toJSON() ?? { content: [] };
  const remapped = Slice.fromJSON(view.state.schema, {
    ...json,
    content: remapJSON({ type: "doc", content: json.content }, toNew).content,
  });
  api.animate(() => {
    api.raw({ type: "addNotes", notes: clones });
    view.dispatch(view.state.tr.replaceSelection(remapped).scrollIntoView());
  });
  return true;
}

/** 방금 누른 게 Ctrl+Shift+V인지. 붙여넣기 이벤트에는 Shift 여부가 없어서 키 입력 때 적어 둔다. */
let plainPaste = false;

export function clipboardProps(getApi: GetApi) {
  return {
    clipboardTextSerializer: clipboardText,
    transformPasted: (slice: Slice, view: EditorView) => breakLinks(slice, view.state.schema),
    handleKeyDown(_view: EditorView, event: KeyboardEvent) {
      plainPaste = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "v";
      return false;
    },
    handlePaste(view: EditorView, event: ClipboardEvent) {
      if (pendingCut()) return moveCut(view, getApi);
      if (plainPaste) {
        plainPaste = false;
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (internal && internal.text === text) return deepPaste(view, getApi);
      }
      return false;
    },
    handleDOMEvents: {
      copy(view: EditorView) {
        cancelCut();
        const slice = view.state.selection.content();
        internal = { slice: slice.toJSON(), text: clipboardText(slice) };
        return false;
      },
      cut(view: EditorView, event: ClipboardEvent) {
        const { from, to, empty } = view.state.selection;
        if (empty) return false;
        event.preventDefault();
        const slice = view.state.selection.content();
        event.clipboardData?.setData("text/plain", clipboardText(slice));
        internal = null;
        startCut(view, getApi().noteId, from, to);
        return true;
      },
    },
  };
}
