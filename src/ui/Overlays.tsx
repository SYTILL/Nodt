import { useEffect, useState, type Dispatch, type ReactNode } from "react";
import { defaultDataFolder } from "../platform";
import type { Action, Overlay, Settings } from "../state/store";
import { THEMES } from "../theme/themes";
import { IconX } from "./icons";

const HELP_ROWS: [string, string][] = [
  ["Ctrl+Enter", "링크 열기/닫기 (커서가 링크 바로 뒤)"],
  ["Ctrl+.", "새 노트 링크 만들기"],
  ["/", "명령 메뉴"],
  ["Tab / Enter", "제목에서 본문으로"],
  ["Esc", "선택한 패널 닫기"],
  ["Alt+방향키", "패널 이동"],
  ["Ctrl+Tab", "패널이동모드"],
  ["Ctrl+X → Ctrl+V", "링크 이동 (부모 변경)"],
  ["Ctrl+V", "복사한 링크를 깨진 링크로"],
  ["Ctrl+Shift+V", "하위 노트까지 복사"],
];

interface Props {
  overlay: Overlay;
  settings: Settings;
  dispatch: Dispatch<Action>;
}

export function OverlayView({ overlay, settings, dispatch }: Props) {
  const close = () => dispatch({ type: "overlay", overlay: null });
  return (
    <div
      className="ovl"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {overlay.kind === "help" && (
        <Sheet title="단축키" onClose={close}>
          <table>
            <tbody>
              {HELP_ROWS.map(([keys, desc]) => (
                <tr key={keys}>
                  <td>
                    {keys.split(" / ").map((k, i) => (
                      <span key={k}>
                        {i > 0 && " / "}
                        <kbd>{k}</kbd>
                      </span>
                    ))}
                  </td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sheet>
      )}
      {overlay.kind === "settings" && <SettingsSheet settings={settings} dispatch={dispatch} onClose={close} />}
      {overlay.kind === "confirm" && (
        <div className="sheet" role="alertdialog" aria-label={overlay.message}>
          <p className="msg">{overlay.message}</p>
          <div className="acts">
            <button type="button" className="sbtn" onClick={close}>
              취소
            </button>
            <button
              type="button"
              className="sbtn primary"
              autoFocus
              onClick={() => {
                close();
                dispatch(overlay.action);
              }}
            >
              {overlay.confirmLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet" role="dialog" aria-label={title}>
      <h4>
        {title}
        <button type="button" className="ib" title="닫기" aria-label="닫기" autoFocus onClick={onClose}>
          <IconX />
        </button>
      </h4>
      {children}
    </div>
  );
}

function SettingsSheet({
  settings,
  dispatch,
  onClose,
}: {
  settings: Settings;
  dispatch: Dispatch<Action>;
  onClose: () => void;
}) {
  const [folder, setFolder] = useState("");
  useEffect(() => {
    void defaultDataFolder().then(setFolder);
  }, []);
  const set = (patch: Partial<Settings>) => dispatch({ type: "settings", patch });

  return (
    <Sheet title="설정" onClose={onClose}>
      <div className="opt">
        <span className="lbl">패널 열기 방식</span>
        <label>
          <input type="radio" name="openMode" checked={settings.openMode === "add"} onChange={() => set({ openMode: "add" })} />
          추가: 형제 노트를 여러 개 열어둠
        </label>
        <label>
          <input
            type="radio"
            name="openMode"
            checked={settings.openMode === "replace"}
            onChange={() => set({ openMode: "replace" })}
          />
          교체: 같은 부모의 다른 노트는 닫음
        </label>
      </div>
      <div className="opt">
        <span className="lbl">연결선</span>
        <div className="row">
          <label>
            <input type="radio" name="lines" checked={!settings.lines} onChange={() => set({ lines: false })} />
            끄기
          </label>
          <label>
            <input type="radio" name="lines" checked={settings.lines} onChange={() => set({ lines: true })} />
            켜기
          </label>
        </div>
      </div>
      <div className="opt">
        <span className="lbl">테마</span>
        <div className="row">
          {THEMES.map((t) => (
            <label key={t.id}>
              <input type="radio" name="theme" checked={settings.theme === t.id} onChange={() => set({ theme: t.id })} />
              <span className="swatch" style={{ background: t.light.accent }} />
              {t.name}
            </label>
          ))}
        </div>
      </div>
      <div className="opt">
        <span className="lbl">밝기</span>
        <div className="row">
          {(
            [
              ["light", "라이트"],
              ["dark", "다크"],
              ["system", "시스템 설정 따르기"],
            ] as const
          ).map(([v, label]) => (
            <label key={v}>
              <input type="radio" name="brightness" checked={settings.brightness === v} onChange={() => set({ brightness: v })} />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="opt">
        <span className="lbl">데이터 폴더</span>
        <span className="path">{folder}</span>
      </div>
    </Sheet>
  );
}
