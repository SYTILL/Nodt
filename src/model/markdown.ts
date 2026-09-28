import type { JSONContent } from "@tiptap/core";

// 노트 본문의 md(GFM 부분집합) ↔ 에디터 문서(Tiptap JSON) 변환.
// 파일을 읽고 쓸 때만 쓴다. 앱 안에서는 에디터 문서를 그대로 들고 다닌다.
//
// 지원: 문단, 부제목(##), 글머리 목록(-), 체크 목록(- [ ] / - [x]), 들여쓰기 2칸마다 한 단계, **굵게**, ~~취소선~~,
//       링크 [>](nodt:<id>).
// 빈 문단은 빈 줄 개수로 나타낸다. 블록 사이 빈 줄 하나는 구분선이고, 그보다 많은 빈 줄 하나마다 빈 문단 하나다.

export const LINK_NODE = "nodtLink";

// ───── md → 문서 ─────

type Line =
  | { blank: true }
  | { blank: false; depth: number; kind: "bullet" | "task" | "heading" | "para"; checked?: boolean; text: string };

function classify(raw: string): Line {
  if (!raw.trim()) return { blank: true };
  const indent = raw.match(/^ */)![0].length;
  const depth = Math.floor(indent / 2);
  const s = raw.slice(indent);
  let m: RegExpExecArray | null;
  if ((m = /^[-*+] \[( |x|X)\](?: (.*))?$/.exec(s))) {
    return { blank: false, depth, kind: "task", checked: m[1] !== " ", text: m[2] ?? "" };
  }
  if ((m = /^[-*+](?: (.*))?$/.exec(s))) return { blank: false, depth, kind: "bullet", text: m[1] ?? "" };
  if ((m = /^#{1,6}(?: (.*))?$/.exec(s))) return { blank: false, depth, kind: "heading", text: m[1] ?? "" };
  return { blank: false, depth, kind: "para", text: s };
}

const INLINE_RE = /\\([\\*~[\]#>+-])|\*\*(.+?)\*\*|~~(.+?)~~|\[>\]\(nodt:([^)\s]+)\)/g;

type Mark = { type: "bold" | "strike" };

export function parseInline(text: string, marks: Mark[] = []): JSONContent[] {
  const out: JSONContent[] = [];
  let buf = "";
  let last = 0;
  const flush = () => {
    if (buf) out.push(marks.length ? { type: "text", text: buf, marks: [...marks] } : { type: "text", text: buf });
    buf = "";
  };
  for (const m of text.matchAll(INLINE_RE)) {
    buf += text.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      buf += m[1];
      continue;
    }
    flush();
    if (m[2] !== undefined) out.push(...parseInline(m[2], [...marks, { type: "bold" }]));
    else if (m[3] !== undefined) out.push(...parseInline(m[3], [...marks, { type: "strike" }]));
    else out.push({ type: LINK_NODE, attrs: { id: m[4] } });
  }
  buf += text.slice(last);
  flush();
  return out;
}

function textBlock(type: "paragraph" | "heading", text: string): JSONContent {
  const content = parseInline(text);
  const node: JSONContent = type === "heading" ? { type, attrs: { level: 2 } } : { type };
  if (content.length) node.content = content;
  return node;
}

export function parseMarkdown(md: string): JSONContent {
  const lines = md.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map(classify);
  const root: JSONContent[] = [];
  // 열린 목록 항목들. 더 깊이 들여쓴 줄은 가장 가까운 얕은 항목 안으로 들어간다.
  let stack: { depth: number; item: JSONContent }[] = [];
  let blanks = 0;
  let newList = false;
  const containerFor = (depth: number): JSONContent[] => {
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    return stack.length ? stack[stack.length - 1].item.content! : root;
  };

  for (const l of lines) {
    if (l.blank) {
      blanks++;
      continue;
    }
    if (blanks > 0) {
      // 빈 줄은 목록을 끝낸다. 구분선 하나를 넘는 빈 줄은 빈 문단이다.
      stack = [];
      newList = true;
      for (let i = 0; i < blanks - 1; i++) root.push({ type: "paragraph" });
      blanks = 0;
    }
    if (l.kind === "bullet" || l.kind === "task") {
      const target = containerFor(l.depth);
      const listType = l.kind === "task" ? "taskList" : "bulletList";
      let list = target[target.length - 1];
      if (!list || list.type !== listType || (newList && target === root)) {
        list = { type: listType, content: [] };
        target.push(list);
      }
      const item: JSONContent =
        l.kind === "task"
          ? { type: "taskItem", attrs: { checked: !!l.checked }, content: [textBlock("paragraph", l.text)] }
          : { type: "listItem", content: [textBlock("paragraph", l.text)] };
      list.content!.push(item);
      stack.push({ depth: l.depth, item });
    } else {
      containerFor(l.depth).push(textBlock(l.kind === "heading" ? "heading" : "paragraph", l.text));
    }
    newList = false;
  }
  // 끝에 남은 빈 줄은 하나하나가 빈 문단이다
  for (let i = 0; i < blanks; i++) root.push({ type: "paragraph" });
  if (!root.length) root.push({ type: "paragraph" });
  return { type: "doc", content: root };
}

// ───── 문서 → md ─────

function escapeText(t: string): string {
  return t.replace(/[\\*~]/g, "\\$&").replace(/\[>\]/g, "\\[>]");
}

export function serializeInline(nodes: JSONContent[] | undefined): string {
  let s = "";
  for (const n of nodes ?? []) {
    if (n.type === "text") {
      const names = (n.marks ?? []).map((m) => m.type);
      let t = escapeText(n.text ?? "");
      if (names.includes("strike")) t = `~~${t}~~`;
      if (names.includes("bold")) t = `**${t}**`;
      s += t;
    } else if (n.type === LINK_NODE) {
      s += `[>](nodt:${n.attrs?.id})`;
    }
  }
  return s;
}

/** 문단이 목록(- , * , + )이나 부제목(#)으로 읽히지 않게 막는다. **굵게**로 시작하는 문단은 그대로 둔다. */
function guardLineStart(s: string): string {
  return /^([-*+](?: |$)|#)/.test(s) ? "\\" + s : s;
}

function isEmptyParagraph(b: JSONContent): boolean {
  return b.type === "paragraph" && !(b.content ?? []).length;
}

/** 목록 항목 안이나 들여쓴 블록. 빈 줄 없이 이어 쓴다 */
function serializeNested(blocks: JSONContent[] | undefined, depth: number, out: string[]) {
  const pad = "  ".repeat(depth);
  for (const b of blocks ?? []) {
    if (b.type === "paragraph") {
      if (!isEmptyParagraph(b)) out.push(pad + guardLineStart(serializeInline(b.content)));
    } else if (b.type === "heading") {
      out.push(pad + "## " + serializeInline(b.content));
    } else if (b.type === "bulletList" || b.type === "taskList") {
      for (const item of b.content ?? []) {
        const [first, ...rest] = item.content ?? [];
        const marker = item.type === "taskItem" ? `- [${item.attrs?.checked ? "x" : " "}] ` : "- ";
        out.push(pad + marker + serializeInline(first?.content));
        serializeNested(rest, depth + 1, out);
      }
    }
  }
}

export function serializeMarkdown(doc: JSONContent): string {
  const out: string[] = [];
  (doc.content ?? []).forEach((b, i) => {
    if (isEmptyParagraph(b)) {
      out.push("");
      return;
    }
    if (i > 0) out.push("");
    serializeNested([b], 0, out);
  });
  return out.join("\n") + "\n";
}
