import { parseMarkdown, serializeMarkdown } from "../model/markdown";
import { nowIso, type Note, type NoteId } from "../model/notes";

// 노트 파일 하나 = frontmatter + md 본문 (스펙 7.2)
//
// ---
// id: 3f2a9c1e-...
// title: "Compiler Project"
// parent: 9b1c4d7a-...
// created: 2026-09-27T14:05:00+09:00
// updated: 2026-09-27T15:12:00+09:00
// ---
// ## 단계
// - [ ] Parser 구현 [>](nodt:5e8f...)
//
// 트리의 기준은 부모 본문 안의 링크다. parent는 빠른 조회와 무결성 확인용이다.

export function serializeNote(note: Note, parent: NoteId | undefined): string {
  return [
    "---",
    `id: ${note.id}`,
    // 따옴표로 감싼 JSON 문자열은 YAML에서도 그대로 읽힌다
    `title: ${JSON.stringify(note.title)}`,
    `parent: ${parent ?? ""}`,
    `created: ${note.created}`,
    `updated: ${note.updated}`,
    "---",
    serializeMarkdown(note.doc),
  ].join("\n");
}

export interface ParsedNote {
  note: Note;
  /** frontmatter의 parent. 최상위 노트는 비어 있다. */
  parent: string;
}

/** 파일 이름의 id를 믿는다. frontmatter가 없거나 깨져 있으면 본문 전체를 md로 읽는다. */
export function parseNote(id: NoteId, text: string): ParsedNote {
  const src = text.replace(/\r\n?/g, "\n");
  const meta: Record<string, string> = {};
  let body = src;
  if (src.startsWith("---\n")) {
    const end = src.indexOf("\n---\n", 4);
    const endAtEof = src.endsWith("\n---") ? src.length - 4 : -1;
    const cut = end >= 0 ? end : endAtEof;
    if (cut >= 0) {
      for (const line of src.slice(4, cut).split("\n")) {
        const m = /^([A-Za-z]+):\s?(.*)$/.exec(line);
        if (m) meta[m[1]] = m[2].trim();
      }
      body = src.slice(cut + 5);
    }
  }
  let title = meta.title ?? "";
  if (title.startsWith('"')) {
    try {
      title = JSON.parse(title);
    } catch {
      title = title.slice(1, -1);
    }
  }
  const t = nowIso();
  return {
    note: { id, title, doc: parseMarkdown(body), created: meta.created || t, updated: meta.updated || t },
    parent: meta.parent ?? "",
  };
}
