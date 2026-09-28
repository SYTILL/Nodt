import type { JSONContent } from "@tiptap/core";
import { LINK_NODE } from "./markdown";

export type NoteId = string;

export interface Note {
  id: NoteId;
  title: string;
  /** 본문. 에디터(Tiptap) 문서 JSON이다. 파일에는 md로 저장한다(model/markdown.ts). */
  doc: JSONContent;
  /** ISO 시각(시간대 포함) */
  created: string;
  updated: string;
}

export type Notes = Record<NoteId, Note>;

/** 트리의 기준은 부모 본문 안의 링크다. kids는 링크가 나오는 순서를 따른다. */
export interface Tree {
  kids: Record<NoteId, NoteId[]>;
  parent: Record<NoteId, NoteId | undefined>;
}

/** 깨진 링크 표기. 미결 사항이라 임시 값이다. */
export const BROKEN_TARGET = "broken";

export function nowIso(): string {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const local = new Date(d.getTime() + off * 60000).toISOString().slice(0, 19);
  return `${local}${off >= 0 ? "+" : "-"}${pad(off / 60)}:${pad(off % 60)}`;
}

export function emptyDoc(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function newNote(id: NoteId, title = "", doc: JSONContent = emptyDoc()): Note {
  const t = nowIso();
  return { id, title, doc, created: t, updated: t };
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

type Visit = (node: JSONContent, path: number[]) => void;

function walk(node: JSONContent, visit: Visit, path: number[] = []) {
  visit(node, path);
  node.content?.forEach((c, i) => walk(c, visit, [...path, i]));
}

/** 문서 안 링크 대상을 나오는 순서대로 */
export function docLinks(doc: JSONContent): string[] {
  const out: string[] = [];
  walk(doc, (n) => {
    if (n.type === LINK_NODE) out.push(String(n.attrs?.id ?? BROKEN_TARGET));
  });
  return out;
}

export function buildTree(notes: Notes): Tree {
  const kids: Tree["kids"] = {};
  const parent: Tree["parent"] = {};
  for (const note of Object.values(notes)) {
    kids[note.id] = [];
    for (const t of docLinks(note.doc)) {
      // 같은 노트를 두 곳에서 가리키면 먼저 나온 링크만 인정한다(부모는 하나)
      if (t in notes && !(t in parent) && t !== note.id) {
        kids[note.id].push(t);
        parent[t] = note.id;
      }
    }
  }
  return { kids, parent };
}

export function descendants(tree: Tree, id: NoteId): NoteId[] {
  const out: NoteId[] = [];
  const rec = (n: NoteId) => {
    for (const k of tree.kids[n] ?? []) {
      out.push(k);
      rec(k);
    }
  };
  rec(id);
  return out;
}

/** id가 root 자신이거나 root의 하위 노트인지 */
export function isInSubtree(tree: Tree, root: NoteId, id: NoteId): boolean {
  for (let n: NoteId | undefined = id; n; n = tree.parent[n]) {
    if (n === root) return true;
  }
  return false;
}

/** 경로의 노드. 없으면 undefined */
function at(doc: JSONContent, path: number[]): JSONContent | undefined {
  let n: JSONContent | undefined = doc;
  for (const i of path) n = n?.content?.[i];
  return n;
}

/** 링크 노드의 경로들. 링크마다 하나씩 */
export function linkPaths(doc: JSONContent): { id: string; path: number[] }[] {
  const out: { id: string; path: number[] }[] = [];
  walk(doc, (n, path) => {
    if (n.type === LINK_NODE) out.push({ id: String(n.attrs?.id), path });
  });
  return out;
}

/** 링크 노드를 빼고, 링크 앞 글이 공백으로 끝나며 링크가 줄 끝이었으면 그 공백 하나도 뺀다 */
function removeAt(doc: JSONContent, path: number[]) {
  const parent = at(doc, path.slice(0, -1))!;
  const i = path[path.length - 1];
  const list = parent.content!;
  list.splice(i, 1);
  const prev = list[i - 1];
  if (prev?.type === "text" && prev.text?.endsWith(" ") && i >= list.length) {
    prev.text = prev.text.slice(0, -1);
    if (!prev.text) list.splice(i - 1, 1);
  }
  if (!list.length) delete parent.content;
}

/** ids로 가는 링크를 뺀 문서와, 뺀 링크들의 원래 경로 */
export function removeLinks(doc: JSONContent, ids: ReadonlySet<string>): { doc: JSONContent; paths: Record<string, number[]> } {
  const next = clone(doc);
  const paths: Record<string, number[]> = {};
  const found = linkPaths(doc).filter((l) => ids.has(l.id));
  for (const l of found) paths[l.id] ??= l.path;
  // 뒤에서부터 빼야 앞 경로가 흐트러지지 않는다
  for (const l of [...found].reverse()) removeAt(next, l.path);
  return { doc: next, paths };
}

/** 링크를 원래 경로에 다시 넣는다. 그 자리가 없어졌으면 가장 가까운 곳이나 문서 끝에 넣는다 */
export function insertLinkAt(doc: JSONContent, id: string, path: number[]): JSONContent {
  const next = clone(doc);
  const link: JSONContent = { type: LINK_NODE, attrs: { id } };
  const parent = at(next, path.slice(0, -1));
  const isTextBlock = parent && (parent.type === "paragraph" || parent.type === "heading");
  if (isTextBlock) {
    parent.content ??= [];
    parent.content.splice(Math.min(path[path.length - 1], parent.content.length), 0, link);
  } else {
    next.content ??= [];
    next.content.push({ type: "paragraph", content: [link] });
  }
  return next;
}

/**
 * 본문 끝에 새 줄로 링크를 붙인다. 마지막 줄이 비어 있으면 그 줄에 넣고,
 * 마지막 블록이 목록이면 목록 항목을 하나 더 만든다(Enter를 친 것처럼).
 */
export function appendLink(doc: JSONContent, id: string): JSONContent {
  const next = clone(doc);
  const link: JSONContent = { type: LINK_NODE, attrs: { id } };
  const blocks = (next.content ??= []);
  const last = blocks[blocks.length - 1];
  const line = (): JSONContent => ({ type: "paragraph", content: [link] });
  if (last?.type === "paragraph" && !last.content?.length) last.content = [link];
  else if (last?.type === "bulletList") (last.content ??= []).push({ type: "listItem", content: [line()] });
  else if (last?.type === "taskList") (last.content ??= []).push({ type: "taskItem", attrs: { checked: false }, content: [line()] });
  else blocks.push(line());
  return next;
}

/** 링크가 속한 옮길 단위: 가장 가까운 목록 항목, 없으면 최상위 블록 */
function unitPath(doc: JSONContent, linkPath: number[]): number[] {
  for (let len = linkPath.length - 1; len > 0; len--) {
    const n = at(doc, linkPath.slice(0, len));
    if (n?.type === "listItem" || n?.type === "taskItem") return linkPath.slice(0, len);
  }
  return linkPath.slice(0, 1);
}

/**
 * 본문에서 id 링크를 target 링크의 앞이나 뒤로 옮긴다. 자식 순서를 바꾸는 방법이다.
 * 링크가 든 목록 항목(하위 항목 포함)이나 최상위 블록을 통째로 옮긴다.
 * 두 단위가 같은 곳에 놓일 수 없거나 한 블록에 링크가 여럿이면 링크 기호만 옮긴다.
 */
export function moveLink(doc: JSONContent, id: string, target: string, where: "before" | "after"): JSONContent {
  const links = linkPaths(doc);
  const from = links.find((l) => l.id === id);
  const to = links.find((l) => l.id === target);
  if (!from || !to) return doc;
  const next = clone(doc);
  const fu = unitPath(doc, from.path);
  const tu = unitPath(doc, to.path);
  const fNode = at(doc, fu)!;
  const tNode = at(doc, tu)!;
  const linksIn = (p: number[]) => links.filter((l) => l.path.length > p.length && p.every((v, i) => l.path[i] === v));
  const sameKind = fNode.type === tNode.type || (fu.length === 1 && tu.length === 1);
  // 링크가 혼자 든 단위만 통째로 옮긴다. 다른 링크까지 딸려 가면 다른 패널 순서도 바뀌기 때문이다.
  const alone = linksIn(fu).length === 1 && !linksIn(tu).some((l) => l.id === id);
  if (sameKind && alone && fu.join() !== tu.join()) {
    // 단위를 빼고, 빠진 뒤의 target 단위 위치를 다시 찾아 넣는다
    const fParent = at(next, fu.slice(0, -1))!;
    const [unit] = fParent.content!.splice(fu[fu.length - 1], 1);
    const tAfter = linkPaths(next).find((l) => l.id === target)!;
    const tu2 = unitPath(next, tAfter.path);
    const tParent = at(next, tu2.slice(0, -1))!;
    tParent.content!.splice(tu2[tu2.length - 1] + (where === "after" ? 1 : 0), 0, unit);
    return next;
  }
  // 링크 기호만 옮긴다
  removeAt(next, from.path);
  const tAfter = linkPaths(next).find((l) => l.id === target)!;
  const tParent = at(next, tAfter.path.slice(0, -1))!;
  const i = tAfter.path[tAfter.path.length - 1] + (where === "after" ? 1 : 0);
  tParent.content!.splice(i, 0, { type: LINK_NODE, attrs: { id } });
  return next;
}

/**
 * 본문의 n번째 깨진 링크(가리키는 노트가 없는 링크)를 다른 노트로 가는 링크로 바꾸거나(replacement), 지운다(null).
 * 못 찾으면 null.
 */
export function replaceBroken(doc: JSONContent, notes: Notes, n: number, replacement: string | null): JSONContent | null {
  const broken = linkPaths(doc).filter((l) => !(l.id in notes));
  const hit = broken[n];
  if (!hit) return null;
  const next = clone(doc);
  if (replacement === null) removeAt(next, hit.path);
  else at(next, hit.path)!.attrs = { id: replacement };
  return next;
}

/** 링크 대상을 바꾼다(복제할 때). fn이 돌려준 값으로 바꾼다 */
export function mapLinks(doc: JSONContent, fn: (id: string) => string): JSONContent {
  const next = clone(doc);
  walk(next, (n) => {
    if (n.type === LINK_NODE) n.attrs = { id: fn(String(n.attrs?.id)) };
  });
  return next;
}
