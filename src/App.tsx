import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { cancelCut, pendingCut } from "./editor/clipboard";
import { slashStore } from "./editor/slash";
import { applyWindowMode } from "./platform";
import { reducer, siblingsOf, type Action, type Dir, type State } from "./state/store";
import { applyTheme, type Mode } from "./theme/themes";
import { AppContext, type AppApi } from "./ui/appContext";
import { OverlayView } from "./ui/Overlays";
import { PanelMenu } from "./ui/PanelMenu";
import { TOAST_EVENT, type Session } from "./ui/session";
import { SlashMenu } from "./ui/SlashMenu";
import { TitleBar } from "./ui/TitleBar";
import { changesLayout, withTransition } from "./ui/transition";
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

interface Props {
  initial: State;
  /** 상태가 바뀔 때마다(저장용) */
  onState?: (s: State) => void;
  session: Session;
}

export default function App({ initial, onState, session }: Props) {
  const [state, raw] = useReducer(reducer, initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const animate = useCallback((fn: () => void) => withTransition(fn), []);
  // 패널 배치가 바뀌는 동작은 애니메이션으로 감싼다
  const dispatch = useCallback(
    (a: Action) => (changesLayout(a, stateRef.current) ? withTransition(() => raw(a)) : raw(a)),
    [],
  );
  const api = useMemo<AppApi>(() => ({ state, dispatch, raw, animate }), [state, dispatch, animate]);

  useEffect(() => onState?.(state), [state, onState]);

  // React 밖(저장 실패 등)에서 온 알림
  useEffect(() => {
    const on = (e: Event) => dispatch({ type: "toast", message: String((e as CustomEvent).detail) });
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, [dispatch]);

  const systemMode = useSystemMode();
  const { theme, brightness } = state.settings;
  const mode = brightness === "system" ? systemMode : brightness;
  useLayoutEffect(() => applyTheme(document.documentElement, theme, mode), [theme, mode]);
  const { windowMode } = state.settings;
  useEffect(() => void applyWindowMode(windowMode), [windowMode]);

  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: "toast", message: null }), state.toast.undo ? UNDO_MS : TOAST_MS);
    return () => clearTimeout(t);
  }, [state.toast, dispatch]);

  useEffect(() => {
    // 앱 전체 단축키. 에디터보다 먼저 받아야 하는 키는 capture 단계에서 처리한다.
    function onKeyCapture(e: KeyboardEvent) {
      const s = stateRef.current;
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      // Esc: 슬래시 메뉴는 에디터가 닫는다. 그 밖에는 잘라내기 박스 → 메뉴·오버레이·모드 → 패널 순으로 닫는다.
      // (ProseMirror는 Esc를 늘 처리한 것으로 표시하므로 bubble 단계에서는 누가 썼는지 알 수 없다)
      if (e.key === "Escape") {
        if (slashStore.get() || e.isComposing) return;
        stop();
        if (pendingCut() && !s.overlay && !s.menu) cancelCut();
        else dispatch({ type: "escape" });
        return;
      }
      // Ctrl+N: 새 노트. 선택한 패널이 없으면 최상위 노트, 있으면 그 노트의 하위 노트 링크.
      // 본문에서는 에디터가 커서 자리에 링크를 넣는다(extensions.ts). 제목이나 패널만 선택한 상태면 본문 끝에 붙인다.
      // Ctrl+W: 선택한 패널 닫기, 최상위 노트는 최소화.
      // 한글 입력 상태에서도 되도록 글자 대신 키 위치(code)로 본다. 브라우저 기본 동작(새 창, 탭 닫기)은 늘 막는다.
      const plainCtrl = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
      if (plainCtrl && (e.code === "KeyN" || e.code === "KeyW")) {
        const inEditor = !!(e.target as HTMLElement | null)?.closest?.(".ProseMirror");
        if (e.code === "KeyN" && inEditor && !s.overlay && !s.menu && !s.moveOrigin) return;
        stop();
        if (s.overlay || s.menu || s.moveOrigin || e.repeat) return;
        if (e.code === "KeyW") dispatch({ type: "closeActive" });
        else if (s.active) dispatch({ type: "addChild", parent: s.active, id: crypto.randomUUID() });
        else dispatch({ type: "createRoot", id: crypto.randomUUID() });
        return;
      }
      if (s.overlay || s.menu) return;
      // 되돌리기 알림이 떠 있는 동안 Ctrl+Z는 삭제를 되돌린다
      if (e.ctrlKey && !e.shiftKey && (e.key.toLowerCase() === "z" || e.code === "KeyZ") && s.deleted) {
        stop();
        dispatch({ type: "undoDelete" });
        return;
      }
      if (e.ctrlKey && e.key === "Tab") {
        stop();
        if (s.moveOrigin) {
          dispatch({ type: "moveEnd", cancel: false });
        } else {
          // 방향키가 글을 움직이지 않게 에디터에서 초점을 뺀다
          (document.activeElement as HTMLElement | null)?.blur();
          dispatch({ type: "moveStart" });
        }
        return;
      }
      const dir = ARROWS[e.key];
      if (s.moveOrigin) {
        if (dir) {
          stop();
          dispatch({ type: "nav", dir });
        } else if (e.key === "Enter") {
          stop();
          dispatch({ type: "moveEnd", cancel: false });
        }
        return;
      }
      // Alt+Shift+↑/↓: 같은 부모 안에서 선택한 패널의 순서를 바꾼다
      if (e.altKey && e.shiftKey && (dir === "up" || dir === "down")) {
        stop();
        if (!s.active) return;
        const index = siblingsOf(s, s.active).indexOf(s.active) + (dir === "up" ? -1 : 1);
        dispatch({ type: "reorder", id: s.active, index });
        return;
      }
      if (e.altKey && !e.ctrlKey && dir) {
        stop();
        dispatch({ type: "nav", dir });
      }
    }
    window.addEventListener("keydown", onKeyCapture, true);
    return () => window.removeEventListener("keydown", onKeyCapture, true);
  }, [dispatch]);

  return (
    <AppContext.Provider value={api}>
      <div className="app">
        <TitleBar warn={state.warn} dispatch={dispatch} />
        {/* 초기화하면 화면(캔버스 위치, 에디터)을 새로 만든다 */}
        <Workspace key={state.epoch} state={state} dispatch={dispatch} />
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
        <SlashMenu />
        {state.menu && <PanelMenu menu={state.menu} state={state} dispatch={dispatch} />}
        {state.overlay && <OverlayView overlay={state.overlay} settings={state.settings} dispatch={dispatch} session={session} />}
      </div>
    </AppContext.Provider>
  );
}
