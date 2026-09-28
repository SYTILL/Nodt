import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type Dispatch, type PointerEvent, type ReactNode } from "react";
import type { NoteId } from "../model/notes";
import type { Action, State } from "../state/store";
import { IconMinimize, IconRestore, IconX } from "./icons";
import { NoteEditor } from "./NoteEditor";
import { scaleOf } from "./transition";

const MIN_HEIGHT = 96;
/** 맨 위 계보 선의 최저 밝기. 계보 밖 패널도 이 색이다 */
const KIN_MIN = 0.1;
/** 패널 테두리에 섞는 강조색 비율(%) */
const BORDER_MIX = 55;

interface Props {
  id: NoteId;
  state: State;
  dispatch: Dispatch<Action>;
  /** 계보 진하기. 0~1 */
  strength: number;
  /** 상단바를 눌렀을 때. 끌어서 순서를 바꾸는 데 쓴다 */
  onHeadPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  /** 오른쪽 가장자리를 끌어 컬럼 너비를 바꿨을 때. 연결선 여유분을 뺀 너비 */
  onWidthCommit: (width: number) => void;
  /** 연결선을 켰을 때 컬럼에 더해지는 폭 */
  extra: number;
}

export function Panel({ id, state, dispatch, strength, onHeadPointerDown, onWidthCommit, extra }: Props) {
  const note = state.notes[id];
  const isRoot = !state.tree.parent[id];
  const isActive = state.active === id;
  const warn = isRoot && isActive && state.warn;
  const minimized = state.minimized.has(id);

  const style: CSSProperties = {};
  const height = state.panelHeights[id];
  if (height && !minimized) style.height = height;
  if (!isActive) style.borderColor = `color-mix(in srgb, var(--accent) ${(BORDER_MIX * strength).toFixed(1)}%, var(--line))`;
  // 패널 맨 위 굵은 선의 색. 선택한 패널은 강조색 그대로라 채워진 링크 칩과 같은 색이다.
  // 계보 밖도 흰 띠로 보이지 않게 최저 밝기를 둔다.
  const kin = Math.max(KIN_MIN, strength);
  (style as Record<string, string>)["--kin"] = `color-mix(in srgb, var(--accent) ${(100 * kin).toFixed(1)}%, var(--panel))`;

  function onClick() {
    if (state.moveOrigin || !isActive || state.warn) dispatch({ type: "select", id });
  }

  // ───── 키보드 초점 ─────
  const titleRef = useRef<HTMLInputElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const focusTitle = useCallback(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);
  const focusBody = (where: "start" | null) => {
    if (editor && !editor.isDestroyed) {
      // Tiptap의 focus는 한 프레임 뒤에 초점을 옮기므로, 그 사이에 친 글자가 제목으로 가지 않게 바로 옮겨 둔다
      editor.view.focus();
      editor.commands.focus(where ?? undefined);
    } else titleRef.current?.focus();
  };
  // 초점 요청(새 노트 → 제목, 키보드로 패널 이동 → 마지막 커서 자리)을 한 번씩 처리한다
  const handledFocus = useRef(0);
  const focus = state.focus;
  useEffect(() => {
    if (!focus || focus.id !== id || handledFocus.current === focus.seq) return;
    if (focus.where !== "title" && !editor && !minimized) return; // 에디터가 준비되면 다시 온다
    handledFocus.current = focus.seq;
    if (focus.where === "title") focusTitle();
    else focusBody(focus.where === "body" ? "start" : null);
  });

  return (
    <div
      className={"panel" + (isActive ? " active" : "") + (warn ? " warn" : "") + (minimized ? " min" : "")}
      data-id={id}
      style={style}
      onClick={onClick}
    >
      <div
        className="phead"
        onPointerDown={onHeadPointerDown}
        // 제목은 두 번 눌러야 고칠 수 있다(한 번 누르기와 끌기는 상단바 동작). 커서는 제목 끝에 둔다.
        onDoubleClick={(e) => {
          const input = titleRef.current;
          if (!input || document.activeElement === input || (e.target as HTMLElement).closest("button")) return;
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          dispatch({ type: "menu", menu: { kind: "panel", id, x: e.clientX, y: e.clientY } });
        }}
      >
        <input
          ref={titleRef}
          className="ptitle"
          value={note.title}
          placeholder={isRoot ? "제목 없음" : ""}
          spellCheck={false}
          aria-label="제목"
          onChange={(e) => dispatch({ type: "setTitle", id, title: e.target.value })}
          onKeyDown={(e) => {
            // 제목에서 Tab, Enter, ↓ → 본문으로. 한글 조합 중 Enter는 조합을 끝내는 키라 건드리지 않는다.
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" || e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
              e.preventDefault();
              if (!minimized) focusBody("start");
            }
          }}
        />
        <IconButton title={minimized ? "복원" : "최소화"} onClick={() => dispatch({ type: "toggleMinimize", id })}>
          {minimized ? <IconRestore /> : <IconMinimize />}
        </IconButton>
        {/* 최상위 노트는 닫을 수 없다. 삭제는 상단바 우클릭 메뉴에 있다. */}
        {!isRoot && (
          <IconButton className="x" title="닫기" onClick={() => dispatch({ type: "close", id })}>
            <IconX />
          </IconButton>
        )}
      </div>
      {!minimized && (
        <>
          <div className="pbody">
            <NoteEditor note={note} onReady={setEditor} focusTitle={focusTitle} />
          </div>
          <HeightGrip onCommit={(h) => dispatch({ type: "panelHeight", id, height: h })} />
        </>
      )}
      <WidthGrip extra={extra} onCommit={onWidthCommit} />
      {!minimized && (
        <CornerGrip
          extra={extra}
          onCommit={(w, h) => {
            onWidthCommit(w);
            dispatch({ type: "panelHeight", id, height: h });
          }}
        />
      )}
    </div>
  );
}

function IconButton(props: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={"ib" + (props.className ? " " + props.className : "")}
      title={props.title}
      aria-label={props.title}
      disabled={props.disabled}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
    >
      {props.children}
    </button>
  );
}

/** 패널 아래 가장자리를 위아래로 끌어 높이를 조절한다. 끄는 동안은 DOM만 바꾸고, 놓을 때 상태에 넣는다. */
function HeightGrip({ onCommit }: { onCommit: (height: number) => void }) {
  const drag = useRef<{ y: number; h: number; s: number; panel: HTMLElement; last: number } | null>(null);

  function end(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    e.currentTarget.classList.remove("drag");
    drag.current = null;
    onCommit(d.last);
  }

  return (
    <div
      className="hgrip"
      title="높이 조절"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        const panel = e.currentTarget.parentElement!;
        drag.current = { y: e.clientY, h: panel.offsetHeight, s: scaleOf(panel), panel, last: panel.offsetHeight };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.classList.add("drag");
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.last = Math.max(MIN_HEIGHT, Math.round(d.h + (e.clientY - d.y) / d.s));
        d.panel.style.height = d.last + "px";
      }}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}

const COL_MIN = 160;
const COL_MAX = 480;

/**
 * 패널 오른쪽 가장자리를 좌우로 끌어 컬럼 너비를 조절한다. 같은 컬럼의 패널은 너비를 공유하므로 전부 같이 바뀐다.
 * 끄는 동안은 컬럼 DOM만 바꾸고, 놓을 때 상태에 넣는다.
 */
function WidthGrip({ extra, onCommit }: { extra: number; onCommit: (width: number) => void }) {
  const drag = useRef<{ x: number; w: number; s: number; col: HTMLElement; last: number } | null>(null);

  function end(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    e.currentTarget.classList.remove("drag");
    d.col.classList.remove("resizing");
    drag.current = null;
    onCommit(d.last - extra);
  }

  return (
    <div
      className="wgrip"
      title="너비 조절"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        const col = e.currentTarget.closest<HTMLElement>(".col")!;
        drag.current = { x: e.clientX, w: col.offsetWidth, s: scaleOf(col), col, last: col.offsetWidth };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.classList.add("drag");
        col.classList.add("resizing");
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const w = d.w + (e.clientX - d.x) / d.s;
        d.last = Math.max(COL_MIN + extra, Math.min(COL_MAX + extra, Math.round(w)));
        d.col.style.width = d.last + "px";
      }}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}

/** 패널 오른쪽 아래 모서리를 끌어 높이와 컬럼 너비를 한 번에 조절한다 */
function CornerGrip({ extra, onCommit }: { extra: number; onCommit: (width: number, height: number) => void }) {
  const drag = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
    s: number;
    col: HTMLElement;
    panel: HTMLElement;
    lastW: number;
    lastH: number;
  } | null>(null);

  function end(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    e.currentTarget.classList.remove("drag");
    d.col.classList.remove("resizing");
    drag.current = null;
    onCommit(d.lastW - extra, d.lastH);
  }

  return (
    <div
      className="cgrip"
      title="크기 조절"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        const panel = e.currentTarget.parentElement!;
        const col = panel.closest<HTMLElement>(".col")!;
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          w: col.offsetWidth,
          h: panel.offsetHeight,
          s: scaleOf(panel),
          col,
          panel,
          lastW: col.offsetWidth,
          lastH: panel.offsetHeight,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.classList.add("drag");
        col.classList.add("resizing");
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.lastW = Math.max(COL_MIN + extra, Math.min(COL_MAX + extra, Math.round(d.w + (e.clientX - d.x) / d.s)));
        d.lastH = Math.max(MIN_HEIGHT, Math.round(d.h + (e.clientY - d.y) / d.s));
        d.col.style.width = d.lastW + "px";
        d.panel.style.height = d.lastH + "px";
      }}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}
