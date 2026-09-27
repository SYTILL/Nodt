import type { Dispatch, PointerEvent } from "react";
import type { NoteId } from "../model/notes";
import { visibleKids, type Action, type State } from "../state/store";
import { DRAG_SHIFT_ATTR, RELAYOUT_EVENT, resist, scaleOf } from "./transition";

// 패널 상단바를 끌어 같은 부모의 형제 패널 사이에서 순서를 바꾼다.
// 패널은 어디로든 끌리지만, 순서를 바꿀 수 있는 곳(자기 컬럼 안, 형제 패널 구간) 밖으로 나가면 저항이 걸린다.
// 다른 형제 패널은 비켜주고, 놓으면 부모 본문의 링크 순서가 바뀌며 새 자리로 들어간다(reorder).

/** 이만큼 움직여야 끌기로 친다. 그 전에 놓으면 그냥 클릭이다. */
const THRESHOLD = 4;
export function startPanelDrag(e: PointerEvent<HTMLElement>, id: NoteId, state: State, dispatch: Dispatch<Action>) {
  if (e.button !== 0 || (e.target as HTMLElement).closest("button") || state.moveOrigin) return;
  const parent = state.tree.parent[id];
  if (!parent) return;
  const sibIds = visibleKids(state, parent);
  const from = sibIds.indexOf(id);
  const panelOf = (k: NoteId) => document.querySelector<HTMLElement>(`.ws .panel[data-id="${k}"]`);
  const els = sibIds.map(panelOf);
  if (from < 0 || els.some((el) => !el)) return;
  // 거리는 모두 화면 좌표로 재고, transform에 넣을 때만 확대율로 나눈다
  const sibs = els.map((el) => ({ el: el!, rect: el!.getBoundingClientRect() }));
  const me = sibs[from];
  const scale = scaleOf(me.el);
  const gap = sibs.length > 1 ? sibs[1].rect.top - sibs[0].rect.bottom : 0;
  const minDy = sibs[0].rect.top - me.rect.top;
  const maxDy = sibs[sibs.length - 1].rect.bottom - me.rect.bottom;
  const startX = e.clientX;
  const startY = e.clientY;
  let started = false;
  let index = from;

  function move(ev: globalThis.PointerEvent) {
    const rawX = ev.clientX - startX;
    const rawY = ev.clientY - startY;
    if (!started) {
      if (Math.hypot(rawX, rawY) < THRESHOLD) return;
      started = true;
      me.el.classList.add("dragging");
      me.el.setAttribute(DRAG_SHIFT_ATTR, "");
      document.body.classList.add("panel-dragging");
    }
    const dx = resist(rawX, 0, 0);
    const dy = resist(rawY, minDy, maxDy);
    me.el.style.transform = `translate(${dx / scale}px, ${dy / scale}px)`;

    // 새 자리: 상단바를 잡고 끄므로 패널 윗변이 움직인 거리로 정한다.
    // 옆 형제 자리(높이 + 간격)의 절반을 넘게 가면 그 자리로 간다. 위아래 같고, 높이가 달라도 같다.
    const moved = Math.max(minDy, Math.min(maxDy, dy));
    index = from;
    let acc = 0;
    for (let i = from + 1; i < sibs.length && moved > 0; i++) {
      const slot = sibs[i].rect.height + gap;
      if (moved <= acc + slot / 2) break;
      index = i;
      acc += slot;
    }
    acc = 0;
    for (let i = from - 1; i >= 0 && moved < 0; i--) {
      const slot = sibs[i].rect.height + gap;
      if (-moved <= acc + slot / 2) break;
      index = i;
      acc += slot;
    }
    const shift = (me.rect.height + gap) / scale;
    sibs.forEach((s, i) => {
      if (i === from) return;
      let off = 0;
      if (from < index && i > from && i <= index) off = -shift;
      if (index < from && i >= index && i < from) off = shift;
      s.el.classList.add("shifting");
      s.el.setAttribute(DRAG_SHIFT_ATTR, "");
      s.el.style.transform = off ? `translateY(${off}px)` : "";
    });
    window.dispatchEvent(new Event(RELAYOUT_EVENT));
  }

  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    if (!started) return;
    document.body.classList.remove("panel-dragging");
    // 자리가 같아도 보내서, 놓인 자리에서 제자리로 부드럽게 돌아가게 한다
    dispatch({ type: "reorder", id, index });
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}
