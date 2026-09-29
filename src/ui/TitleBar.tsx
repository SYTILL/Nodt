import { useEffect, useState, type Dispatch } from "react";
import { t } from "../i18n";
import { minimizeWindow, quitApp, toggleMaximizeWindow, watchMaximized } from "../platform";
import type { Action } from "../state/store";
import { IconGear, IconHelp, IconReset, IconLogo, IconWinClose, IconWinMaximize, IconWinMinimize, IconWinRestore } from "./icons";

// 테두리 없는 창의 자체 상단바. 빈 곳을 끌면 창이 움직이고, 두 번 누르면 최대화된다.

interface Props {
  /** 최상위 노트에서 Esc를 눌렀을 때 닫기 버튼을 빛낸다 */
  warn: boolean;
  dispatch: Dispatch<Action>;
}

export function TitleBar({ warn, dispatch }: Props) {
  const [maximized, setMaximized] = useState(false);
  const T = t().titleBar;

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
      <span className="brand">
        <IconLogo />
        Nodt
      </span>
      <div className="tbar-acts">
        <button
          type="button"
          className="ib"
          title={T.reset}
          aria-label={T.reset}
          onClick={() => dispatch({ type: "overlay", overlay: { kind: "reset" } })}
        >
          <IconReset />
        </button>
        <button
          type="button"
          className="ib"
          title={T.settings}
          aria-label={T.settings}
          onClick={() => dispatch({ type: "overlay", overlay: { kind: "settings" } })}
        >
          <IconGear />
        </button>
        <button
          type="button"
          className="ib"
          title={T.help}
          aria-label={T.help}
          onClick={() => dispatch({ type: "overlay", overlay: { kind: "help" } })}
        >
          <IconHelp />
        </button>
      </div>
      <div className="wctl">
        <button type="button" title={T.minimize} aria-label={T.minimize} onClick={() => void minimizeWindow()}>
          <IconWinMinimize />
        </button>
        <button
          type="button"
          title={maximized ? T.unmaximize : T.maximize}
          aria-label={maximized ? T.unmaximize : T.maximize}
          onClick={() => void toggleMaximizeWindow()}
        >
          {maximized ? <IconWinRestore /> : <IconWinMaximize />}
        </button>
        <button
          type="button"
          className={"close" + (warn ? " warn" : "")}
          title={T.close}
          aria-label={T.close}
          onClick={() => void quitApp()}
        >
          <IconWinClose />
        </button>
      </div>
    </div>
  );
}
