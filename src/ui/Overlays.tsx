import { useState, type Dispatch, type ReactNode } from "react";
import { emptyState, freshState } from "../storage/session";
import { HOTKEY_LABEL } from "../platform";
import type { Action, Overlay, Settings } from "../state/store";
import { THEMES } from "../theme/themes";
import { IconX } from "./icons";
import type { Session } from "./session";

// 단축키 도움말 (스펙 5장). [키, 설명] 묶음별
const HELP: [string, [string, string][]][] = [
  [
    "노트와 링크",
    [
      ["Ctrl+N", "새 노트 링크 만들기 · 제목에 있으면 본문 끝에 · 선택한 패널이 없으면 새 최상위 노트"],
      ["/", "명령 메뉴 (줄 맨 앞이나 공백 뒤)"],
      ["Ctrl+Enter", "커서 바로 앞 링크 열기/닫기 · 깨진 링크면 새 노트로"],
      ["Tab / Enter", "제목에서 본문으로"],
      ["↑", "본문 첫 줄에서 제목으로"],
      ["Tab / Shift+Tab", "목록 들여쓰기 / 내어쓰기"],
      ["Backspace", "깨진 링크 바로 뒤에서 지우기"],
    ],
  ],
  [
    "패널",
    [
      ["Esc", "선택한 패널 닫기 (메뉴·모드가 떠 있으면 그것부터)"],
      ["Ctrl+W", "선택한 패널 닫기 · 최상위 노트는 최소화 / 복원"],
      ["빈 곳 클릭", "선택 풀기"],
      ["Alt+← / Alt+→", "부모 / 첫 번째로 열린 자식 패널로"],
      ["Alt+↑ / Alt+↓", "같은 컬럼의 위 / 아래 패널로"],
      ["Alt+Shift+↑ / Alt+Shift+↓", "같은 부모 안에서 순서 바꾸기"],
      ["Ctrl+Tab", "패널이동모드 (방향키 이동, Enter 선택, Esc 취소)"],
    ],
  ],
  [
    "화면",
    [
      ["빈 곳 끌기", "화면 옮기기"],
      ["휠", "확대 / 축소"],
      ["Ctrl+0", "원래 위치, 100%로"],
    ],
  ],
  [
    "복사와 이동",
    [
      ["Ctrl+C → Ctrl+V", "링크는 깨진 링크로 붙음"],
      ["Ctrl+C → Ctrl+Shift+V", "하위 노트까지 복제해서 붙이기"],
      ["Ctrl+X → Ctrl+V", "옮기기 (부모 바꾸기) · Esc로 취소"],
      ["Ctrl+Z", "삭제 알림이 떠 있으면 삭제 되돌리기"],
    ],
  ],
  [
    "서식",
    [
      ["Ctrl+B", "굵게"],
      ["Ctrl+Shift+S", "취소선"],
      ["## + 공백", "부제목"],
      ["- + 공백", "글머리 목록"],
      ["[ ] + 공백", "체크 목록"],
    ],
  ],
];

interface Props {
  overlay: Overlay;
  settings: Settings;
  dispatch: Dispatch<Action>;
  session: Session;
}

export function OverlayView({ overlay, settings, dispatch, session }: Props) {
  const close = () => dispatch({ type: "overlay", overlay: null });
  return (
    <div
      className="ovl"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {overlay.kind === "help" && (
        <Sheet title="단축키" onClose={close} wide>
          {HELP.map(([group, rows]) => (
            <div key={group} className="help-group">
              <span className="lbl">{group}</span>
              <table>
                <tbody>
                  {rows.map(([keys, desc]) => (
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
            </div>
          ))}
        </Sheet>
      )}
      {overlay.kind === "settings" && (
        <SettingsSheet settings={settings} dispatch={dispatch} onClose={close} session={session} />
      )}
      {overlay.kind === "reset" && (
        <ResetSheet settings={settings} dispatch={dispatch} onClose={close} session={session} />
      )}
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

/**
 * 초기화 확인. 두 가지 중 고른다.
 * - 사용법 노트로: 모든 노트와 화면 배치를 지우고 처음 켰을 때의 사용법 노트로. 설정은 그대로.
 * - 완전 초기화: 노트를 모두 지우고 설정도 기본값으로. 빈 화면에서 시작한다(데이터 폴더 위치는 그대로).
 */
function ResetSheet({
  settings,
  dispatch,
  onClose,
  session,
}: {
  settings: Settings;
  dispatch: Dispatch<Action>;
  onClose: () => void;
  session: Session;
}) {
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"tutorial" | "all">("tutorial");
  async function reset() {
    setBusy(true);
    try {
      await session.beforeReset?.();
      dispatch({ type: "hydrate", state: kind === "tutorial" ? freshState(settings) : emptyState() });
    } catch (e) {
      setBusy(false);
      dispatch({ type: "toast", message: `초기화하지 못했어요 · ${String(e)}` });
    }
  }
  return (
    <div className="sheet" role="alertdialog" aria-label="초기화">
      <h4>초기화할까요?</h4>
      <p className="msg">모든 노트와 화면 배치가 지워져요.</p>
      <div className="opt">
        <Radios
          name="resetKind"
          column
          value={kind}
          onChange={setKind}
          options={[
            [
              "tutorial",
              <span>
                <strong>사용법 노트로</strong> · 처음 켰을 때처럼. 설정은 그대로
              </span>,
            ],
            [
              "all",
              <span>
                <strong>완전 초기화</strong> · 빈 화면에서 시작. 설정도 처음 값으로
              </span>,
            ],
          ]}
        />
      </div>
      <p className="note">
        지우기 직전의 노트는 데이터 폴더의 <code>{"backups\\reset"}</code>에 한 벌 남겨 둬요.
      </p>
      <div className="acts">
        <button type="button" className="sbtn" autoFocus onClick={onClose} disabled={busy}>
          취소
        </button>
        <button type="button" className="sbtn danger" onClick={() => void reset()} disabled={busy}>
          초기화
        </button>
      </div>
    </div>
  );
}

function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className={"sheet" + (wide ? " wide" : "")} role="dialog" aria-label={title}>
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

function Radios<T extends string>({
  name,
  value,
  options,
  onChange,
  column,
}: {
  name: string;
  value: T;
  options: [T, ReactNode][];
  onChange: (v: T) => void;
  column?: boolean;
}) {
  return (
    <div className={column ? "col-opts" : "row"}>
      {options.map(([v, label]) => (
        <label key={v}>
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
          {label}
        </label>
      ))}
    </div>
  );
}

function SettingsSheet({
  settings,
  dispatch,
  onClose,
  session,
}: {
  settings: Settings;
  dispatch: Dispatch<Action>;
  onClose: () => void;
  session: Session;
}) {
  const set = (patch: Partial<Settings>) => dispatch({ type: "settings", patch });

  async function pickFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true, title: "데이터 폴더 고르기", defaultPath: session.dataDir });
    if (typeof dir === "string" && dir !== session.dataDir) await session.changeDataDir?.(dir);
  }

  return (
    <Sheet title="설정" onClose={onClose}>
      <div className="opt">
        <span className="lbl">패널 열기 방식</span>
        <Radios
          name="openMode"
          column
          value={settings.openMode}
          onChange={(openMode) => set({ openMode })}
          options={[
            ["add", "추가: 형제 노트를 여러 개 열어둠"],
            ["replace", "교체: 같은 부모의 다른 노트는 닫음"],
          ]}
        />
      </div>
      <div className="opt">
        <span className="lbl">연결선</span>
        <Radios
          name="lines"
          value={settings.lines ? "on" : "off"}
          onChange={(v) => set({ lines: v === "on" })}
          options={[
            ["off", "끄기"],
            ["on", "켜기"],
          ]}
        />
      </div>
      <div className="opt">
        <span className="lbl">테마</span>
        <Radios
          name="theme"
          value={settings.theme}
          onChange={(theme) => set({ theme })}
          options={THEMES.map((t) => [
            t.id,
            <>
              <span className="swatch" style={{ background: t.light.accent }} />
              {t.name}
            </>,
          ])}
        />
      </div>
      <div className="opt">
        <span className="lbl">밝기</span>
        <Radios
          name="brightness"
          value={settings.brightness}
          onChange={(brightness) => set({ brightness })}
          options={[
            ["light", "라이트"],
            ["dark", "다크"],
            ["system", "시스템 설정 따르기"],
          ]}
        />
      </div>
      <div className="opt">
        <span className="lbl">창 모드</span>
        <Radios
          name="windowMode"
          column
          value={settings.windowMode}
          onChange={(windowMode) => set({ windowMode })}
          options={[
            ["normal", "일반 창: 다른 프로그램을 누르면 그 뒤로 가려짐"],
            ["onTop", "항상 위"],
            [
              "hotkey",
              <>
                단축키로 불러오기·숨기기 <kbd>{HOTKEY_LABEL}</kbd>
              </>,
            ],
          ]}
        />
      </div>
      <div className="opt">
        <span className="lbl">데이터 폴더</span>
        <div className="folder">
          <span className="path">{session.dataDir}</span>
          {session.changeDataDir && (
            <button type="button" className="sbtn" onClick={() => void pickFolder()}>
              바꾸기
            </button>
          )}
        </div>
        <span className="note">백업은 이 폴더의 backups에 5분·2시간·1일·1주·1달 단위로 남아요.</span>
      </div>
    </Sheet>
  );
}
