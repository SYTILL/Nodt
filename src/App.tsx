import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { saveSettings } from "./state/persist";
import { initState, reducer, visibleKids, type Action, type Dir } from "./state/store";
import { changesLayout, withTransition } from "./ui/transition";
import { applyTheme, type Mode } from "./theme/themes";
import { OverlayView } from "./ui/Overlays";
import { PanelMenu } from "./ui/PanelMenu";
import { TitleBar } from "./ui/TitleBar";
import { Workspace } from "./ui/Workspace";

const TOAST_MS = 2600;
/** 삭제 되돌리기 알림은 더 오래 띄운다. 사라지면 삭제가 확정된다. */
const UNDO_MS = 8000;

const ARROWS: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

function useSystemMode(): Mode {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark ? "dark" : "light";
}

export default function App() {
  const [state, rawDispatch] = useReducer(reducer, undefined, initState);
  const stateRef = useRef(state);
  stateRef.current = state;
  // 패널 배치가 바뀌는 동작은 애니메이션으로 감싼다
  const dispatch = useCallback(
    (a: Action) => (changesLayout(a, stateRef.current) ? withTransition(() => rawDispatch(a)) : rawDispatch(a)),
    [],
  );

  const systemMode = useSystemMode();
  const { theme, brightness } = state.settings;
  const mode = brightness === "system" ? systemMode : brightness;
  useLayoutEffect(() => applyTheme(document.documentElement, theme, mode), [theme, mode]);
  useEffect(() => saveSettings(state.settings), [state.settings]);

  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: "toast", message: null }), state.toast.undo ? UNDO_MS : TOAST_MS);
    return () => clearTimeout(t);
  }, [state.toast, dispatch]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const s = stateRef.current;
      if (e.key === "Escape") {
        e.preventDefault();
        dispatch({ type: "escape" });
        return;
      }
      if (s.overlay || s.menu) return;
      // 되돌리기 알림이 떠 있는 동안 Ctrl+Z는 삭제를 되돌린다
      if (e.ctrlKey && e.key.toLowerCase() === "z" && s.deleted) {
        e.preventDefault();
        dispatch({ type: "undoDelete" });
        return;
      }
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        dispatch(s.moveOrigin ? { type: "moveEnd", cancel: false } : { type: "moveStart" });
        return;
      }
      const dir = ARROWS[e.key];
      if (s.moveOrigin) {
        if (dir) {
          e.preventDefault();
          dispatch({ type: "nav", dir });
        } else if (e.key === "Enter") {
          e.preventDefault();
          dispatch({ type: "moveEnd", cancel: false });
        }
        return;
      }
      // Alt+Shift+↑/↓: 같은 부모 안에서 선택한 패널의 순서를 바꾼다
      if (e.altKey && e.shiftKey && (dir === "up" || dir === "down")) {
        e.preventDefault();
        const parent = s.tree.parent[s.active];
        if (!parent) return;
        const index = visibleKids(s, parent).indexOf(s.active) + (dir === "up" ? -1 : 1);
        dispatch({ type: "reorder", id: s.active, index });
        return;
      }
      if (e.altKey && dir) {
        e.preventDefault();
        dispatch({ type: "nav", dir });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  return (
    <div className="app">
      <TitleBar warn={state.warn} dispatch={dispatch} />
      <Workspace state={state} dispatch={dispatch} />
      {state.moveOrigin && <div className="movebar">패널이동모드 · 방향키로 이동 · Enter 선택 · Esc 취소</div>}
      {state.toast && (
        <div className="toast" role="status" key={state.toast.seq}>
          {state.toast.message}
          {state.toast.undo && (
            <button type="button" className="toast-act" onClick={() => dispatch({ type: "undoDelete" })}>
              되돌리기 <span className="hint">Ctrl+Z</span>
            </button>
          )}
        </div>
      )}
      {state.menu && <PanelMenu menu={state.menu} state={state} dispatch={dispatch} />}
      {state.overlay && <OverlayView overlay={state.overlay} settings={state.settings} dispatch={dispatch} />}
    </div>
  );
}
