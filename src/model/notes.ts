export type NoteId = string;

export interface Note {
  id: NoteId;
  title: string;
  /** 본문 md(GFM). 링크는 `[>](nodt:<uuid>)` */
  body: string;
}

export type Notes = Record<NoteId, Note>;

/** 트리의 기준은 부모 본문 안의 링크다. kids는 링크가 나오는 순서를 따른다. */
export interface Tree {
  kids: Record<NoteId, NoteId[]>;
  parent: Record<NoteId, NoteId | undefined>;
}

/** 깨진 링크 표기. 미결 사항이라 임시 값이다. */
export const BROKEN_TARGET = "broken";

export const LINK_RE = /\[>\]\(nodt:([^)\s]+)\)/g;

export function linkTargets(body: string): string[] {
  return Array.from(body.matchAll(LINK_RE), (m) => m[1]);
}

/** 본문에서 id로 가는 링크를 뺀다. 링크 앞의 공백 하나도 같이 뺀다. 되돌릴 때는 index에 removed를 다시 넣는다. */
export function removeLink(body: string, id: NoteId): { body: string; index: number; removed: string } | null {
  const token = `[>](nodt:${id})`;
  let index = body.indexOf(token);
  if (index < 0) return null;
  let removed = token;
  if (body[index - 1] === " ") {
    index--;
    removed = " " + token;
  }
  return { body: body.slice(0, index) + body.slice(index + removed.length), index, removed };
}

/**
 * 본문에서 id 링크를 target 링크의 앞이나 뒤로 옮긴다. 자식 순서를 바꾸는 방법이다.
 * 링크가 줄에 혼자 있으면 줄째 옮기고(예: 리스트 항목), 한 줄에 링크가 여럿이면 기호만 옮긴다.
 * 들여쓴 하위 줄은 따라가지 않는다. v0.1-b에서 에디터 블록 단위로 다시 본다.
 */
export function moveLink(body: string, id: NoteId, target: NoteId, where: "before" | "after"): string {
  const tok = (x: NoteId) => `[>](nodt:${x})`;
  const lines = body.split("\n");
  const from = lines.findIndex((l) => l.includes(tok(id)));
  const to = lines.findIndex((l) => l.includes(tok(target)));
  if (from < 0 || to < 0) return body;
  if (from !== to && linkTargets(lines[from]).length === 1 && linkTargets(lines[to]).length === 1) {
    const [line] = lines.splice(from, 1);
    const t = lines.findIndex((l) => l.includes(tok(target)));
    lines.splice(where === "before" ? t : t + 1, 0, line);
    return lines.join("\n");
  }
  const cut = removeLink(body, id);
  if (!cut) return body;
  const at = cut.body.indexOf(tok(target)) + (where === "after" ? tok(target).length : 0);
  const ins = where === "before" ? `${tok(id)} ` : ` ${tok(id)}`;
  return cut.body.slice(0, at) + ins + cut.body.slice(at);
}

export function buildTree(notes: Notes): Tree {
  const kids: Tree["kids"] = {};
  const parent: Tree["parent"] = {};
  for (const note of Object.values(notes)) {
    kids[note.id] = linkTargets(note.body).filter((t) => t in notes);
    for (const k of kids[note.id]) parent[k] = note.id;
  }
  return { kids, parent };
}

export function descendants(tree: Tree, id: NoteId): NoteId[] {
  const out: NoteId[] = [];
  const walk = (n: NoteId) => {
    for (const k of tree.kids[n] ?? []) {
      out.push(k);
      walk(k);
    }
  };
  walk(id);
  return out;
}

/** id가 root 자신이거나 root의 하위 노트인지 */
export function isInSubtree(tree: Tree, root: NoteId, id: NoteId): boolean {
  for (let n: NoteId | undefined = id; n; n = tree.parent[n]) {
    if (n === root) return true;
  }
  return false;
}
