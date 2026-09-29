import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type PointerEvent } from "react";
import { flushSync } from "react-dom";
import { t } from "../i18n";
import { growWindow } from "../platform";
import { columns, lineage, lineageStrength, type Action, type State, type View } from "../state/store";
import { Panel } from "./Panel";
import { startPanelDrag } from "./panelDrag";
import { followWhileRunning, RELAYOUT_EVENT, resist, scaleOf, SETTLED_EVENT } from "./transition";

// 패널 영역. 창과 분리해 두어서 v0.2 플로팅 모드에서 창 배경만 투명하게 바꿀 수 있게 한다.
// 스크롤 대신 캔버스처럼 쓴다. 빈 곳을 끌면 전체가 움직이고, 휠로 확대·축소한다.

/** 기본 컬럼 너비. 창 크기를 바꿔도 변하지 않는다(기본 창 1280px의 1/5) */
const COL_DEFAULT = 256;
/** 연결선을 켜면 컬럼 사이 간격이 12px에서 34px로 넓어진다 */
const LINES_EXTRA = 22;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2;
/** 휠 한 칸(deltaY 100)에 약 10% 확대·축소 */
const ZOOM_SPEED = 0.001;
/** 화면 밖으로 나간 선택 패널을 데려올 때 가장자리 여백 */
const EDGE = 24;
const GLIDE = "transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)";
/** 경계를 넘었다가 튕겨 돌아올 때. 살짝 지나쳤다가 돌아온다 */
const BOUNCE = "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)";
/** 관성: 한 프레임(약 16.7ms)마다 속도에 곱하는 값. 작을수록 빨리 멈춘다 */
const FRICTION = 0.9;
/** 관성 중 경계를 넘었을 때 한 프레임마다 속도에 곱하는 값 */
const OUT_FRICTION = 0.5;
/** 이 속도(px/ms)보다 느리면 관성을 멈춘다 */
const MIN_SPEED = 0.02;
/** 놓기 직전 이 시간(ms) 동안의 움직임으로 속도를 잰다 */
const VELOCITY_WINDOW = 80;
/** 빈 곳을 이만큼(px) 안에서 눌렀다 떼면 끌기가 아니라 클릭이다 */
const CLICK_SLOP = 4;
/** 기본 패널 높이(styles.css의 --ph). 내용에 맞출 때 이보다 작게 줄이지는 않는다 */
const PANEL_H = 200;
/** 내용에 맞출 때 가장 큰 높이 */
const FIT_MAX = 480;
/** 앱을 열 때 패널이 하나씩 나타나는 간격(ms)과, 패널이 많을 때 전체가 넘지 않을 시간 */
const INTRO_STEP = 70;
const INTRO_TOTAL = 700;
const INTRO_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Props {
  state: State;
  dispatch: Dispatch<Action>;
}

export function Workspace({ state, dispatch }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const cols = columns(state);
  const dist = lineage(state);
  const extra = state.settings.lines ? LINES_EXTRA : 0;

  // ───── 화면 이동과 확대 ─────
  // 매 움직임마다 React를 다시 그리지 않도록 캔버스 transform을 직접 바꾼다.
  // 지난번 화면 위치로 시작하고, 움직임이 멈추면 잠시 뒤 상태에 넣는다(저장용)
  const view = useRef<View>(state.view);
  const commitTimer = useRef(0);
  const applyView = useRef((transition: string | false = false) => {
    const c = canvasRef.current;
    if (!c) return;
    const { x, y, z } = view.current;
    c.style.transition = transition || "";
    c.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => dispatch({ type: "view", view: { ...view.current } }), 600);
  }).current;
  useLayoutEffect(() => applyView(), [applyView]);

  // 캔버스를 저항 없이 옮길 수 있는 범위. 스크롤 끝처럼 동작한다.
  // 가장자리 패널과 화면 끝 사이가 컬럼 간격(가로 간격)을 넘으면 저항이 걸린다. 세로도 같은 간격을 쓴다.
  // .cols 안쪽 여백이 12px이므로 기본은 내용 상자가 화면 끝을 넘는 순간이 경계다.
  // 연결선을 켜면 컬럼 간격이 34px로 넓어지므로 가로세로 모두 그만큼(22px) 더 여유를 준다.
  const bounds = (z: number) => {
    const root = rootRef.current!;
    const cols = canvasRef.current!.firstElementChild as HTMLElement;
    const range = (view: number, content: number, slack: number) => ({
      lo: Math.min(view - content, 0) - slack,
      hi: slack,
    });
    // 마지막 컬럼의 오른쪽 여백(다음 컬럼과의 간격 자리)은 내용에서 뺀다
    const last = cols.lastElementChild as HTMLElement | null;
    const tail = last ? parseFloat(getComputedStyle(last).paddingRight) || 0 : 0;
    // 연결선을 켜든 끄든 경계는 연결선이 있을 때의 간격(34px)으로 고정한다(설정에 따라 바뀌면 헷갈린다)
    const slack = LINES_EXTRA * z;
    const x = range(root.clientWidth, (cols.offsetWidth - tail) * z, slack);
    const y = range(root.clientHeight, cols.offsetHeight * z, slack);
    return { minX: x.lo, maxX: x.hi, minY: y.lo, maxY: y.hi };
  };

  // 관성: 놓은 뒤 살짝 미끄러지다 멈춘다. 경계를 넘으면 빨리 줄고, 멈추면 경계로 돌아온다.
  const inertia = useRef(0);
  const stopInertia = () => cancelAnimationFrame(inertia.current);
  const startInertia = (vx: number, vy: number) => {
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const v = view.current;
      const b = bounds(v.z);
      const x = v.x + vx * dt;
      const y = v.y + vy * dt;
      const k = dt / 16.7;
      vx *= Math.pow(x < b.minX || x > b.maxX ? OUT_FRICTION : FRICTION, k);
      vy *= Math.pow(y < b.minY || y > b.maxY ? OUT_FRICTION : FRICTION, k);
      view.current = { ...v, x, y };
      applyView();
      if (Math.hypot(vx, vy) > MIN_SPEED) inertia.current = requestAnimationFrame(step);
      else settle.current();
    };
    inertia.current = requestAnimationFrame(step);
  };
  /** 넘어 있으면 경계로 튕겨 돌아온다 */
  const settle = useRef((_transition?: string) => {});
  settle.current = (transition: string = BOUNCE) => {
    const v = view.current;
    const b = bounds(v.z);
    const x = Math.min(b.maxX, Math.max(b.minX, v.x));
    const y = Math.min(b.maxY, Math.max(b.minY, v.y));
    if (x === v.x && y === v.y) return;
    view.current = { ...v, x, y };
    applyView(transition);
  };

  // 휠: 본문이 스크롤되는 패널 위면 본문을 스크롤하고, 아니면 커서 위치를 기준으로 확대·축소한다
  useEffect(() => {
    const root = rootRef.current!;
    function onWheel(e: WheelEvent) {
      const body = (e.target as HTMLElement).closest<HTMLElement>(".pbody");
      if (body && body.scrollHeight > body.clientHeight) return;
      e.preventDefault();
      stopInertia();
      const v = view.current;
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.z * Math.exp(-e.deltaY * ZOOM_SPEED)));
      const r = root.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      view.current = { x: cx - ((cx - v.x) * z) / v.z, y: cy - ((cy - v.y) * z) / v.z, z };
      applyView();
      // 휠을 멈추면 넘어 있던 만큼 돌아온다
      clearTimeout(wheelEnd);
      wheelEnd = setTimeout(() => settle.current(), 200);
    }
    let wheelEnd = 0;
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", onWheel);
      clearTimeout(wheelEnd);
    };
  }, [applyView]);

  // Ctrl+0: 원래 위치, 100%로
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey || e.key !== "0" || stateRef.current.overlay) return;
      e.preventDefault();
      stopInertia();
      view.current = { x: 0, y: 0, z: 1 };
      applyView(GLIDE);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyView]);

  // 빈 곳을 끌면 전체가 따라 움직인다
  const pan = useRef<{ px: number; py: number; x: number; y: number; trail: { t: number; x: number; y: number }[] } | null>(
    null,
  );

  function onPanStart(e: PointerEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (e.button !== 0 || !t.matches(".ws, .canvas, .cols, .col, .col-inner")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add("panning");
    stopInertia();
    pan.current = { px: e.clientX, py: e.clientY, x: view.current.x, y: view.current.y, trail: [] };
  }

  function onPanMove(e: PointerEvent<HTMLDivElement>) {
    const p = pan.current;
    if (!p) return;
    // 경계를 넘은 만큼은 저항이 걸린다
    const b = bounds(view.current.z);
    view.current = {
      ...view.current,
      x: resist(p.x + e.clientX - p.px, b.minX, b.maxX),
      y: resist(p.y + e.clientY - p.py, b.minY, b.maxY),
    };
    applyView();
    // 관성 속도를 재기 위해 최근 움직임을 남긴다
    const now = performance.now();
    p.trail.push({ t: now, x: e.clientX, y: e.clientY });
    while (p.trail.length > 2 && now - p.trail[0].t > VELOCITY_WINDOW) p.trail.shift();
  }

  function onPanEnd(e: PointerEvent<HTMLDivElement>) {
    const p = pan.current;
    if (!p) return;
    pan.current = null;
    e.currentTarget.classList.remove("panning");
    // 끌지 않고 누르기만 했으면 선택을 푼다. 글 입력 초점도 뺀다.
    if (Math.hypot(e.clientX - p.px, e.clientY - p.py) < CLICK_SLOP && !stateRef.current.moveOrigin) {
      (document.activeElement as HTMLElement | null)?.blur();
      if (stateRef.current.active) dispatch({ type: "select", id: null });
    }
    // 놓기 직전 속도로 관성을 준다. 멈춰 있다가 놓았으면 바로 경계 확인
    const now = performance.now();
    const first = p.trail[0];
    const lastPt = p.trail[p.trail.length - 1];
    if (first && lastPt && now - lastPt.t < 50 && lastPt.t > first.t) {
      const dt = lastPt.t - first.t;
      startInertia((lastPt.x - first.x) / dt, (lastPt.y - first.y) / dt);
    } else {
      settle.current();
    }
  }

  // 선택한 패널이 화면 밖으로 나가 있으면 부드럽게 끌어와 보여준다.
  // 선택이 바뀔 때, 그리고 패널 배치 애니메이션이 끝났을 때(순서 바꾸기, 새 노트 등으로 밀려났을 수 있다) 확인한다.
  // 목표 위치는 끌기 저항이 걸리는 경계 안으로 맞춘다. 경계 밖에 두면 다음에 끌 때 처음부터 저항이 걸려
  // 경계가 달라진 것처럼 느껴진다. 선택이 없거나 패널이 닫혀 내용이 줄었을 때도 경계 밖이면 안으로 옮긴다.
  const follow = useRef(() => {});
  follow.current = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const active = stateRef.current.active;
    if (!root || !canvas || pan.current) return;
    const el = active ? root.querySelector<HTMLElement>(`.panel[data-id="${active}"]`) : null;
    if (!el) {
      settle.current(GLIDE);
      return;
    }
    // 화면 이동 애니메이션이 도는 중일 수 있으므로, 캔버스 안 위치에서 목표 화면 위치를 계산한다
    const w = root.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    const s = scaleOf(canvas);
    const { x, y, z } = view.current;
    const left = x + ((e.left - c.left) / s) * z;
    const top = y + ((e.top - c.top) / s) * z;
    const right = left + (e.width / s) * z;
    const bottom = top + (e.height / s) * z;
    const W = w.width;
    const H = w.height;
    let dx = 0;
    let dy = 0;
    if (right > W) dx = W - EDGE - right;
    if (left + dx < 0) dx = EDGE - left;
    if (bottom > H) dy = H - EDGE - bottom;
    if (top + dy < 0) dy = EDGE - top;
    const b = bounds(z);
    const tx = Math.min(b.maxX, Math.max(b.minX, x + dx));
    const ty = Math.min(b.maxY, Math.max(b.minY, y + dy));
    if (tx === x && ty === y) return;
    stopInertia();
    view.current = { ...view.current, x: tx, y: ty };
    applyView(GLIDE);
  };
  useEffect(() => follow.current(), [state.active]);
  // 창 크기가 바뀌면 경계도 바뀐다. 멈춘 뒤 경계 밖이면 안으로 옮긴다.
  useEffect(() => {
    let t = 0;
    const on = () => {
      clearTimeout(t);
      t = window.setTimeout(() => settle.current(GLIDE), 150);
    };
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("resize", on);
      clearTimeout(t);
    };
  }, []);
  useEffect(() => {
    const on = () => follow.current();
    window.addEventListener(SETTLED_EVENT, on);
    return () => window.removeEventListener(SETTLED_EVENT, on);
  }, []);

  // ───── 내용에 맞춘 높이 (사용법 노트) ─────
  // fit에 든 패널이 화면에 보이면 내용 높이를 재서 panelHeights로 옮긴다. 기본 높이보다 작게 줄이지는 않는다.
  // 높이 애니메이션(최소화 복원 등)이 도는 중이면 건너뛰고, 애니메이션이 끝났을 때(SETTLED) 다시 잰다.
  const fitNow = useRef(() => {});
  fitNow.current = () => {
    const root = rootRef.current;
    const s = stateRef.current;
    if (!root || !s.fit.size) return;
    const ids: string[] = [];
    const heights: Record<string, number> = {};
    for (const id of s.fit) {
      const el = root.querySelector<HTMLElement>(`.panel[data-id="${id}"]`);
      if (!el || el.classList.contains("min") || el.getAnimations().length) continue;
      const prev = el.style.height;
      el.style.height = "auto";
      const h = Math.ceil(el.offsetHeight);
      el.style.height = prev;
      ids.push(id);
      if (h > PANEL_H) heights[id] = Math.min(FIT_MAX, h);
    }
    if (ids.length) flushSync(() => dispatch({ type: "fitted", ids, heights }));
  };
  useEffect(() => {
    const on = () => fitNow.current();
    window.addEventListener(SETTLED_EVENT, on);
    return () => window.removeEventListener(SETTLED_EVENT, on);
  }, []);

  // 사용법 노트를 막 만들었으면 전체가 한 화면에 보이게 한다: 창이 작으면 키우고, 그래도 넘치면 축소한다.
  async function showWhole() {
    const root = rootRef.current;
    const cols = canvasRef.current?.firstElementChild as HTMLElement | null;
    if (!root || !cols) return;
    const needW = cols.offsetWidth;
    const needH = cols.offsetHeight;
    const dw = needW - root.clientWidth;
    const dh = needH - root.clientHeight;
    if (dw > 0 || dh > 0) {
      // 창 크기가 실제로 바뀔 때까지(resize) 기다린다. 너무 오래 걸리면 그냥 넘어간다.
      const resized = new Promise<void>((r) => window.addEventListener("resize", () => r(), { once: true }));
      if (await growWindow(Math.max(0, dw), Math.max(0, dh))) await Promise.race([resized.then(nextFrame), wait(800)]);
    }
    // 창이 작던 동안 선택한 패널을 따라 화면이 밀렸을 수 있으므로 처음 자리에서 보여준다
    const z = Math.min(1, root.clientWidth / needW, root.clientHeight / needH);
    stopInertia();
    view.current = { x: 0, y: 0, z: Math.max(ZOOM_MIN, Math.floor(z * 100) / 100) };
    applyView();
  }

  // ───── 앱을 열 때 ─────
  // 글꼴이 준비되면 높이를 맞추고, 패널이 왼쪽 컬럼부터 하나씩 나타난다. 그때까지 패널은 숨겨 둔다(.intro).
  // 초기화로 화면을 새로 만들 때도 같다.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    let live = true;
    void (async () => {
      await Promise.race([document.fonts.ready, wait(800)]);
      await nextFrame();
      if (!live) return;
      fitNow.current();
      if (stateRef.current.fresh) {
        await showWhole();
        dispatch({ type: "freshDone" });
      }
      if (!live) return;
      const root = rootRef.current;
      if (root && !reducedMotion()) {
        const els = [...root.querySelectorAll<HTMLElement>(".cols .panel")];
        const step = Math.min(INTRO_STEP, INTRO_TOTAL / Math.max(1, els.length));
        const anims = els.map((el, i) =>
          el.animate(
            [
              { opacity: 0, transform: "translateX(-16px)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 300, delay: i * step, easing: INTRO_EASE, fill: "backwards" },
          ),
        );
        // 연결선은 마지막 패널이 거의 자리 잡을 즈음 나타난다
        const svg = svgRef.current;
        if (svg) {
          anims.push(svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: Math.max(0, els.length - 1) * step + 200, fill: "backwards" }));
        }
        followWhileRunning(anims);
      }
      setIntro(false);
    })();
    return () => {
      live = false;
    };
    // 처음 한 번만(초기화하면 Workspace를 새로 만든다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ───── 연결선 ─────
  // 렌더 후, 본문 스크롤, 크기 변화, 패널이동모드 축소 애니메이션 때마다 다시 그린다
  const frame = useRef(0);
  const drawNow = useRef(() => {
    if (rootRef.current && svgRef.current) drawWires(rootRef.current, svgRef.current, stateRef.current);
  }).current;
  const scheduleWires = useRef(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(drawNow);
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
    // 애니메이션 중에는 매 프레임 이 신호가 오므로 미루지 않고 바로 그린다
    window.addEventListener(RELAYOUT_EVENT, drawNow);
    return () => {
      root.removeEventListener("scroll", scheduleWires, true);
      root.removeEventListener("transitionend", scheduleWires);
      window.removeEventListener(RELAYOUT_EVENT, drawNow);
      cancelAnimationFrame(frame.current);
    };
  }, [scheduleWires, drawNow]);

  return (
    <div
      ref={rootRef}
      className={"ws" + (state.moveOrigin ? " move" : "") + (intro ? " intro" : "")}
      data-rel={state.settings.lines ? "lines" : "grad"}
      onPointerDown={onPanStart}
      onPointerMove={onPanMove}
      onPointerUp={onPanEnd}
      onPointerCancel={onPanEnd}
    >
      <div ref={canvasRef} className="canvas">
        <div className="cols">
          <svg ref={svgRef} className="wires" aria-hidden="true" />
          {cols.map((ids, d) => {
            const w = state.colWidths[d];
            return (
              <div key={d} className="col" style={{ width: (w ?? COL_DEFAULT) + extra }}>
                <div className="col-inner">
                  {ids.map((id) => (
                    <Panel
                      key={id}
                      id={id}
                      state={state}
                      dispatch={dispatch}
                      strength={lineageStrength(dist.get(id))}
                      onHeadPointerDown={(e) => startPanelDrag(e, id, state, dispatch)}
                      extra={extra}
                      onWidthCommit={(width) => dispatch({ type: "colWidth", depth: d, width })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {cols.length === 0 && (
        <div className="empty-hint">
          <kbd>Ctrl+N</kbd> {t().emptyHint}
        </div>
      )}
    </div>
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
  const scale = scaleOf(colsEl);
  const X = (v: number) => (v - cr.left) / scale;
  const Y = (v: number) => (v - cr.top) / scale;
  svg.setAttribute("width", String(colsEl.scrollWidth));
  svg.setAttribute("height", String(colsEl.scrollHeight));

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
    // 링크가 본문 스크롤로 가려져 있으면 패널 안쪽 끝에 붙인다
    const top1 = pr.top + 10;
    const bot1 = pr.bottom - 10;
    let y1 = chip ? chip.getBoundingClientRect().top + (chip.offsetHeight * scale) / 2 : pr.top + 18 * scale;
    y1 = Math.min(Math.max(y1, top1), Math.max(top1, bot1));
    // 끝점은 자식 패널 제목의 가운데 높이
    const tr = cp.querySelector(".ptitle")!.getBoundingClientRect();
    const y2 = tr.top + tr.height / 2;
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
