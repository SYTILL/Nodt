import type { Dispatch, ReactNode } from "react";
import type { NoteId, Notes } from "../model/notes";
import type { Action } from "../state/store";
import { IconChevronLeft, IconChevronRight, IconX } from "./icons";

// v0.1-a 임시 렌더러. 본문 md를 읽기 전용으로 그린다. v0.1-b에서 Tiptap으로 바뀐다.

type Block = { kind: "h" | "li" | "todo" | "p"; text: string; done?: boolean };

function parseBlocks(md: string): Block[] {
  const out: Block[] = [];
  for (const line of md.split("\n")) {
    if (!line.trim()) continue;
    let m: RegExpExecArray | null;
    if ((m = /^##\s+(.*)$/.exec(line))) out.push({ kind: "h", text: m[1] });
    else if ((m = /^- \[( |x)\]\s+(.*)$/.exec(line))) out.push({ kind: "todo", done: m[1] === "x", text: m[2] });
    else if ((m = /^-\s+(.*)$/.exec(line))) out.push({ kind: "li", text: m[1] });
    else out.push({ kind: "p", text: line });
  }
  return out;
}

interface Ctx {
  /** 이 본문의 노트 */
  noteId: NoteId;
  notes: Notes;
  open: ReadonlySet<NoteId>;
  dispatch: Dispatch<Action>;
  /** 그리는 동안 깨진 링크 순서를 센다 */
  brokenSeq: { n: number };
}

const INLINE_RE = /\*\*(.+?)\*\*|~~(.+?)~~|\[>\]\(nodt:([^)\s]+)\)/g;

function renderInline(text: string, ctx: Ctx): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = m.index;
    if (m[1] !== undefined) out.push(<b key={key}>{renderInline(m[1], ctx)}</b>);
    else if (m[2] !== undefined) out.push(<s key={key}>{renderInline(m[2], ctx)}</s>);
    else out.push(<LinkChip key={key} target={m[3]} ctx={ctx} brokenIndex={m[3] in ctx.notes ? -1 : ctx.brokenSeq.n++} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** brokenIndex: 이 본문에서 몇 번째 깨진 링크인지. 깨진 링크를 고칠 때 자리를 찾는 데 쓴다 */
function LinkChip({ target, ctx, brokenIndex }: { target: string; ctx: Ctx; brokenIndex: number }) {
  const note = ctx.notes[target];
  if (!note) {
    return (
      <button
        type="button"
        className="lnk broken"
        aria-label="깨진 링크"
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          ctx.dispatch({
            type: "menu",
            menu: { kind: "broken", parent: ctx.noteId, n: brokenIndex, x: r.left, y: r.bottom + 4 },
          });
        }}
      >
        <IconX />
      </button>
    );
  }
  const open = ctx.open.has(target);
  return (
    <button
      type="button"
      className={"lnk" + (open ? " open" : "")}
      data-link={target}
      aria-label={`${note.title} ${open ? "닫기" : "열기"}`}
      onClick={(e) => {
        e.stopPropagation();
        ctx.dispatch({ type: "toggleLink", id: target });
      }}
    >
      {/* 닫힘 >: 누르면 오른쪽으로 열린다. 열림 <: 누르면 닫힌다. */}
      {open ? <IconChevronLeft /> : <IconChevronRight />}
    </button>
  );
}

export function NoteBody(props: { body: string } & Omit<Ctx, "brokenSeq">) {
  const { body, ...rest } = props;
  const ctx: Ctx = { ...rest, brokenSeq: { n: 0 } };
  return (
    <>
      {parseBlocks(body).map((b, i) => {
        const inline = renderInline(b.text, ctx);
        if (b.kind === "todo") {
          return (
            <div key={i} className={"blk-todo" + (b.done ? " done" : "")}>
              <span className={"cb" + (b.done ? " on" : "")} />
              <span className="txt">{inline}</span>
            </div>
          );
        }
        return (
          <div key={i} className={`blk-${b.kind}`}>
            {inline}
          </div>
        );
      })}
    </>
  );
}
