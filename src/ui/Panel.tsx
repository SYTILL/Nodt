import { useRef, type CSSProperties, type Dispatch, type PointerEvent, type ReactNode } from "react";
import type { NoteId } from "../model/notes";
import type { Action, State } from "../state/store";
import { IconMinimize, IconRestore, IconX } from "./icons";
import { NoteBody } from "./NoteBody";

const MIN_HEIGHT = 96;
/** 패널 테두리에 섞는 강조색 비율(%) */
const BORDER_MIX = 55;

interface Props {
  id: NoteId;
  state: State;
  dispatch: Dispatch<Action>;
  /** 계보 진하기. 0~1 */
  strength: number;
}

export function Panel({ id, state, dispatch, strength }: Props) {
  const note = state.notes[id];
  const isRoot = id === state.rootId;
  const isActive = state.active === id;
  const warn = isRoot && state.warn;
  const minimized = state.minimized.has(id);

  const style: CSSProperties = {};
  const height = state.panelHeights[id];
  if (height && !minimized) style.height = height;
  if (!isActive) style.borderColor = `color-mix(in srgb, var(--accent) ${(BORDER_MIX * strength).toFixed(1)}%, var(--line))`;
  // 패널 맨 위 굵은 선의 색. 선택한 패널은 강조색 그대로라 채워진 링크 칩과 같은 색이다.
  (style as Record<string, string>)["--kin"] = `color-mix(in srgb, var(--accent) ${(100 * strength).toFixed(1)}%, var(--panel))`;

  function onClick() {
    if (state.moveOrigin || !isActive || state.warn) dispatch({ type: "select", id });
  }

  return (
    <div
      className={"panel" + (isActive ? " active" : "") + (warn ? " warn" : "") + (minimized ? " min" : "")}
      data-id={id}
      style={style}
      onClick={onClick}
    >
      <div
        className="phead"
        onContextMenu={(e) => {
          e.preventDefault();
          dispatch({ type: "menu", menu: { id, x: e.clientX, y: e.clientY } });
        }}
      >
        <div className={"ptitle" + (note.title ? "" : " empty")}>{note.title || "제목 없음"}</div>
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
            <NoteBody body={note.body} notes={state.notes} open={state.open} dispatch={dispatch} />
          </div>
          <HeightGrip onCommit={(h) => dispatch({ type: "panelHeight", id, height: h })} />
        </>
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
  const drag = useRef<{ y: number; h: number; panel: HTMLElement; last: number } | null>(null);

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
        drag.current = { y: e.clientY, h: panel.offsetHeight, panel, last: panel.offsetHeight };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.classList.add("drag");
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.last = Math.max(MIN_HEIGHT, Math.round(d.h + e.clientY - d.y));
        d.panel.style.height = d.last + "px";
      }}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}
