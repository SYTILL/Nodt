import { useEffect, useState, type Dispatch } from "react";
import { minimizeWindow, quitApp, toggleMaximizeWindow, watchMaximized } from "../platform";
import type { Action } from "../state/store";
import { IconGear, IconHelp, IconWinClose, IconWinMaximize, IconWinMinimize, IconWinRestore } from "./icons";

// 테두리 없는 창의 자체 상단바. 빈 곳을 끌면 창이 움직이고, 두 번 누르면 최대화된다.

interface Props {
  /** 최상위 노트에서 Esc를 눌렀을 때 닫기 버튼을 빛낸다 */
  warn: boolean;
  dispatch: Dispatch<Action>;
}

export function TitleBar({ warn, dispatch }: Props) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let off: (() => void) | undefined;
    let gone = false;
    void watchMaximized(setMaximized).then((f) => (gone ? f() : (off = f)));
    return () => {
      gone = true;
      off?.();
    };
  }, []);

  return (
    <div className="tbar" data-tauri-drag-region>
      <span className="brand">Nodt</span>
      <div className="tbar-acts">
        <button
          type="button"
          className="ib"
          title="설정"
          aria-label="설정"
          onClick={() => dispatch({ type: "overlay", overlay: { kind: "settings" } })}
        >
          <IconGear />
        </button>
        <button
          type="button"
          className="ib"
          title="단축키 도움말"
          aria-label="단축키 도움말"
          onClick={() => dispatch({ type: "overlay", overlay: { kind: "help" } })}
        >
          <IconHelp />
        </button>
      </div>
      <div className="wctl">
        <button type="button" title="최소화" aria-label="최소화" onClick={() => void minimizeWindow()}>
          <IconWinMinimize />
        </button>
        <button
          type="button"
          title={maximized ? "이전 크기로" : "최대화"}
          aria-label={maximized ? "이전 크기로" : "최대화"}
          onClick={() => void toggleMaximizeWindow()}
        >
          {maximized ? <IconWinRestore /> : <IconWinMaximize />}
        </button>
        <button
          type="button"
          className={"close" + (warn ? " warn" : "")}
          title="닫기"
          aria-label="닫기"
          onClick={() => void quitApp()}
        >
          <IconWinClose />
        </button>
      </div>
    </div>
  );
}
