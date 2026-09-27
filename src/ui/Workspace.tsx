import { useEffect, useLayoutEffect, useRef, type Dispatch, type PointerEvent } from "react";
import { columns, lineage, lineageStrength, type Action, type State } from "../state/store";
import { Panel } from "./Panel";

// 패널 영역. 창과 분리해 두어서 v0.2 플로팅 모드에서 창 배경만 투명하게 바꿀 수 있게 한다.

const COL_MIN = 160;
const COL_MAX = 480;
/** 연결선을 켜면 컬럼 사이 간격이 12px에서 34px로 넓어진다 */
const LINES_EXTRA = 22;

interface Props {
  state: State;
  dispatch: Dispatch<Action>;
}

export function Workspace({ state, dispatch }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const cols = columns(state);
  const dist = lineage(state);
  const extra = state.settings.lines ? LINES_EXTRA : 0;

  // 연결선: 렌더 후, 스크롤, 크기 변화, 패널이동모드 축소 애니메이션 때마다 다시 그린다
  const frame = useRef(0);
  const scheduleWires = useRef(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (rootRef.current && svgRef.current) drawWires(rootRef.current, svgRef.current, stateRef.current);
    });
  }).current;

  useLayoutEffect(() => {
    scheduleWires();
    const root = rootRef.current!;
    const ro = new ResizeObserver(scheduleWires);
    root.querySelectorAll(".panel").forEach((p) => ro.observe(p));
    return () => ro.disconnect();
  });

  useEffect(() => {
    const root = rootRef.current!;
    root.addEventListener("scroll", scheduleWires, true);
    root.addEventListener("transitionend", scheduleWires);
    window.addEventListener("resize", scheduleWires);
    return () => {
      root.removeEventListener("scroll", scheduleWires, true);
      root.removeEventListener("transitionend", scheduleWires);
      window.removeEventListener("resize", scheduleWires);
      cancelAnimationFrame(frame.current);
    };
  }, [scheduleWires]);

  // 선택한 패널이 화면 밖이면 보이게 스크롤한다
  useEffect(() => {
    rootRef.current
      ?.querySelector(`.panel[data-id="${state.active}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [state.active]);

  return (
    <div
      ref={rootRef}
      className={"ws" + (state.moveOrigin ? " move" : "")}
      data-rel={state.settings.lines ? "lines" : "grad"}
    >
      <div className="cols">
        <svg ref={svgRef} className="wires" aria-hidden="true" />
        {cols.map((ids, d) => {
          const w = state.colWidths[d];
          return (
            <div
              key={d}
              className="col"
              style={{ width: w ? w + extra : `calc(max(${COL_MIN}px, 20vw) + ${extra}px)` }}
            >
              <div className="col-inner">
                {ids.map((id) => (
                  <Panel key={id} id={id} state={state} dispatch={dispatch} strength={lineageStrength(dist.get(id))} />
                ))}
              </div>
              <ColGrip extra={extra} onCommit={(width) => dispatch({ type: "colWidth", depth: d, width })} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 컬럼 오른쪽 가장자리를 끌어 너비를 조절한다. 끄는 동안은 DOM만 바꾸고, 놓을 때 상태에 넣는다. */
function ColGrip({ extra, onCommit }: { extra: number; onCommit: (width: number) => void }) {
  const drag = useRef<{ x: number; w: number; col: HTMLElement; last: number } | null>(null);

  function end(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    e.currentTarget.classList.remove("drag");
    drag.current = null;
    onCommit(d.last - extra);
  }

  return (
    <div
      className="grip"
      title="너비 조절"
      onPointerDown={(e) => {
        const col = e.currentTarget.parentElement!;
        drag.current = { x: e.clientX, w: col.offsetWidth, col, last: col.offsetWidth };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.classList.add("drag");
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.last = Math.max(COL_MIN + extra, Math.min(COL_MAX + extra, Math.round(d.w + e.clientX - d.x)));
        d.col.style.width = d.last + "px";
      }}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}

/** 부모 패널의 링크 줄에서 자식 패널 제목 높이까지 곡선을 긋는다. 선택한 노트의 계보는 강조색이다. */
function drawWires(root: HTMLElement, svg: SVGSVGElement, s: State) {
  if (!s.settings.lines) {
    svg.innerHTML = "";
    return;
  }
  const colsEl = root.querySelector<HTMLElement>(".cols")!;
  const cr = colsEl.getBoundingClientRect();
  const scale = cr.width / colsEl.offsetWidth || 1;
  const X = (v: number) => (v - cr.left) / scale + colsEl.scrollLeft;
  const Y = (v: number) => (v - cr.top) / scale + colsEl.scrollTop;
  svg.setAttribute("width", String(colsEl.scrollWidth));
  svg.setAttribute("height", String(colsEl.clientHeight));

  const kin = lineage(s);
  const panelOf = (id: string) => root.querySelector<HTMLElement>(`.panel[data-id="${id}"]`);
  let out = "";
  for (const [child, parent] of Object.entries(s.tree.parent)) {
    if (!parent) continue;
    const cp = panelOf(child);
    const pp = panelOf(parent);
    if (!cp || !pp) continue;
    const chip = pp.querySelector<HTMLElement>(`.lnk[data-link="${child}"]`);
    const pr = pp.getBoundingClientRect();
    const qr = cp.getBoundingClientRect();
    const pv = pp.parentElement!.getBoundingClientRect();
    const qv = cp.parentElement!.getBoundingClientRect();
    const top1 = Math.max(pr.top, pv.top) + 10;
    const bot1 = Math.min(pr.bottom, pv.bottom) - 10;
    let y1 = chip ? chip.getBoundingClientRect().top + (chip.offsetHeight * scale) / 2 : pr.top + 18;
    y1 = Math.min(Math.max(y1, top1), Math.max(top1, bot1));
    const y2 = Math.min(Math.max(qr.top + 18 * scale, qv.top + 8), qv.bottom - 8);
    const x1 = X(pr.right);
    const x2 = X(qr.left);
    const a = Y(y1);
    const b = Y(y2);
    const dx = (x2 - x1) * 0.55;
    const on = kin.has(child) && kin.has(parent);
    out +=
      `<g class="${on ? "kin" : ""}"><path d="M${x1} ${a} C${x1 + dx} ${a},${x2 - dx} ${b},${x2} ${b}"/>` +
      `<circle cx="${x1}" cy="${a}" r="2.5"/><circle cx="${x2}" cy="${b}" r="2.5"/></g>`;
  }
  svg.innerHTML = out;
}
