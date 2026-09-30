import { flushSync } from "react-dom";
import type { Action, State } from "../state/store";

// 패널이 열리고 닫힐 때 부드럽게 움직인다(FLIP).
// 바뀌기 전 패널 위치를 재고, 상태를 바꾼 뒤, 실제 패널을 옛 자리에서 새 자리로 옮긴다.
// 스냅샷이 아니라 실제 요소가 움직이므로 애니메이션 중에도 바로 누를 수 있다.

const DURATION = 300;
const EXIT_DURATION = 200;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** 애니메이션이 끝나면 보내는 이벤트. 연결선을 다시 그린다. */
export const RELAYOUT_EVENT = "nodt:relayout";
/** 패널이 열리고 닫히는 애니메이션이 모두 끝났을 때. 선택한 패널이 화면 밖으로 밀려났으면 데려온다. */
export const SETTLED_EVENT = "nodt:settled";
/** 모든 패널이 창 안에 들어오게 화면을 맞추라는 신호(빈 곳 우클릭 메뉴의 [전체 보기]) */
export const FIT_ALL_EVENT = "nodt:fitall";

const LAYOUT_ACTIONS = new Set<Action["type"]>([
  "toggleLink",
  "close",
  "closeActive",
  "createRoot",
  "addChild",
  "toggleMinimize",
  "delete",
  "undo",
  "redo",
  "expandAll",
  "collapseAll",
  "reorder",
  "fixBroken",
]);

/** 패널 끌기 중에 임시로 옮겨 둔 패널 표시. 전환 직전에 걷어낸다. */
export const DRAG_SHIFT_ATTR = "data-drag-shift";

function clearDragOffsets() {
  document.querySelectorAll<HTMLElement>(`[${DRAG_SHIFT_ATTR}]`).forEach((el) => {
    el.classList.remove("dragging", "shifting");
    el.style.transform = "";
    el.removeAttribute(DRAG_SHIFT_ATTR);
  });
}

/** 패널 배치가 바뀌는 동작인지. Esc는 메뉴, 오버레이, 모드를 닫을 때가 아니라 패널을 닫을 때만 해당한다. */
export function changesLayout(a: Action, s: State): boolean {
  if (a.type === "escape") return !s.menu && !s.overlay && !s.moveOrigin;
  return LAYOUT_ACTIONS.has(a.type);
}

/** 막힌 쪽으로 나간 거리 중 따라오는 비율 */
export const RESIST = 0.3;

/** 허용 구간 [lo, hi] 밖으로 나간 만큼은 RESIST 비율로만 따라온다 */
export function resist(v: number, lo: number, hi: number): number {
  if (v < lo) return lo + (v - lo) * RESIST;
  if (v > hi) return hi + (v - hi) * RESIST;
  return v;
}

/** 화면에 보이는 크기와 실제 크기의 비율. 확대·축소와 패널이동모드 축소가 반영된다. */
export function scaleOf(el: HTMLElement): number {
  return el.getBoundingClientRect().width / el.offsetWidth || 1;
}

/** rect는 화면 좌표, s는 그 패널의 확대율. 애니메이션 값은 화면 거리를 s로 나눠 쓴다. */
type Snap = Map<string, { el: HTMLElement; rect: DOMRect; s: number }>;

function snapshot(): Snap {
  const m: Snap = new Map();
  document.querySelectorAll<HTMLElement>(".panel[data-id]").forEach((el) => {
    m.set(el.dataset.id!, { el, rect: el.getBoundingClientRect(), s: scaleOf(el) });
  });
  return m;
}

/** 닫혀서 DOM에서 빠진 패널을 옛 자리에 잠깐 다시 띄워 사라지게 한다 */
function exitLayer(): HTMLElement {
  let layer = document.getElementById("exit-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "exit-layer";
    document.body.appendChild(layer);
  }
  return layer;
}

/** 애니메이션 안에서 또 애니메이션을 부르면(예: 링크를 넣는 에디터 명령이 다시 dispatch) 바깥 것 하나로 묶는다 */
let running = false;

export function withTransition(update: () => void) {
  if (running) {
    update();
    return;
  }
  running = true;
  try {
    runTransition(update);
  } finally {
    running = false;
  }
}

function runTransition(update: () => void) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    clearDragOffsets();
    update();
    return;
  }
  const opts: KeyframeAnimationOptions = { duration: DURATION, easing: EASE, fill: "backwards" };
  // 끌던 패널은 놓인 자리(보이는 위치)에서 출발한다
  const before = snapshot();
  clearDragOffsets();
  flushSync(update);
  const after = snapshot();
  const anims: Animation[] = [];

  // 1. 높이가 바뀐 패널(최소화, 복원)은 높이를 옛 값에서 새 값으로. 아래 패널은 레이아웃을 따라 같이 움직인다.
  for (const [id, a] of after) {
    const b = before.get(id);
    if (b && Math.abs(b.rect.height - a.rect.height) > 1) {
      anims.push(
        a.el.animate(
          [
            { height: `${b.rect.height / a.s}px`, minHeight: "0px" },
            { height: `${a.rect.height / a.s}px`, minHeight: "0px" },
          ],
          opts,
        ),
      );
    }
  }

  // 2. 높이 애니메이션이 걸린 상태에서 다시 재고, 남은 위치 차이는 이동으로 메운다. 새 패널은 나타난다.
  const start = snapshot();
  for (const [id, s] of start) {
    const b = before.get(id);
    if (!b) {
      anims.push(
        s.el.animate(
          [
            { opacity: 0, transform: "translateX(-16px)" },
            { opacity: 1, transform: "none" },
          ],
          opts,
        ),
      );
      continue;
    }
    const dx = (b.rect.left - s.rect.left) / s.s;
    const dy = (b.rect.top - s.rect.top) / s.s;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      anims.push(s.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], opts));
    }
  }

  // 3. 닫힌 패널은 옛 자리에서 왼쪽으로 사라진다
  const layer = exitLayer();
  for (const [id, b] of before) {
    if (after.has(id)) continue;
    const el = b.el;
    Object.assign(el.style, {
      position: "fixed",
      left: `${b.rect.left}px`,
      top: `${b.rect.top}px`,
      width: `${b.rect.width / b.s}px`,
      height: `${b.rect.height / b.s}px`,
      margin: "0",
      transformOrigin: "0 0",
    });
    layer.appendChild(el);
    const out = el.animate(
      [
        { opacity: 1, transform: `scale(${b.s})` },
        { opacity: 0, transform: `translateX(-16px) scale(${b.s})` },
      ],
      { duration: EXIT_DURATION, easing: "ease-in", fill: "forwards" },
    );
    out.finished.finally(() => el.remove()).catch(() => {});
    anims.push(out);
  }

  followWhileRunning(anims);
}

/** 애니메이션이 도는 동안 매 프레임 연결선을 다시 그리게 알린다 */
export function followWhileRunning(anims: Animation[]) {
  let running = true;
  const tick = () => {
    window.dispatchEvent(new Event(RELAYOUT_EVENT));
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  void Promise.allSettled(anims.map((a) => a.finished)).then(() => {
    running = false;
    window.dispatchEvent(new Event(RELAYOUT_EVENT));
    window.dispatchEvent(new Event(SETTLED_EVENT));
  });
}
