import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState, type Dispatch, type KeyboardEvent, type ReactNode } from "react";
import type { BackupInfo } from "../storage/backend";
import { emptyState, freshState } from "../storage/session";
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
      {overlay.kind === "restore" && <RestoreSheet dispatch={dispatch} onClose={close} session={session} />}
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
 * - 사용법 노트로: 모든 노트와 화면 배치를 지우고 처음 켰을 때의 사용법 노트로.
 * - 완전 초기화: 노트를 모두 지우고 빈 화면에서 시작한다(기본 선택).
 * 설정은 앱 전체 것이라 어느 쪽이든 그대로 둔다.
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
  const [kind, setKind] = useState<"tutorial" | "all">("all");
  async function reset() {
    setBusy(true);
    try {
      await session.beforeReset?.();
      dispatch({ type: "hydrate", state: kind === "tutorial" ? freshState(settings) : emptyState(settings) });
    } catch (e) {
      setBusy(false);
      dispatch({ type: "toast", message: `초기화하지 못했어요 · ${String(e)}`, error: true });
    }
  }
  return (
    <div className="sheet" role="alertdialog" aria-label="초기화">
      <h4>초기화할까요?</h4>
      <p className="msg">모든 노트와 화면 배치가 지워져요. 설정은 그대로예요.</p>
      <div className="opt">
        <Radios
          name="resetKind"
          column
          value={kind}
          onChange={setKind}
          options={[
            [
              "all",
              <span>
                <strong>완전 초기화</strong> · 빈 화면에서 시작
              </span>,
            ],
            [
              "tutorial",
              <span>
                <strong>사용법 노트로</strong> · 처음 켰을 때처럼
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

const TIER_LABEL: Record<string, string> = {
  "5min": "5분 단위",
  "2h": "2시간 단위",
  "1d": "하루 단위",
  "1w": "일주일 단위",
  "1m": "한 달 단위",
  reset: "초기화 직전",
  restore: "되돌리기 직전",
};

/** 백업 시각을 "오늘 14:05", "어제 09:30", "9월 25일 14:05"처럼 */
function backupWhen(secs: number): string {
  const d = new Date(secs * 1000);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86_400_000);
  if (diff === 0) return `오늘 ${hm}`;
  if (diff === 1) return `어제 ${hm}`;
  const year = d.getFullYear() === new Date().getFullYear() ? "" : `${d.getFullYear()}년 `;
  return `${year}${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`;
}

/**
 * 백업에서 되돌리기. 목록에서 고르면 확인을 한 번 더 받는다.
 * 되돌리기 직전 상태는 backups\restore에 남으므로 되돌린 것도 다시 되돌릴 수 있다.
 */
function RestoreSheet({ dispatch, onClose, session }: { dispatch: Dispatch<Action>; onClose: () => void; session: Session }) {
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [pick, setPick] = useState<BackupInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    (session.listBackups?.() ?? Promise.resolve([]))
      .then((l) => live && setList(l))
      .catch((e) => {
        if (!live) return;
        setList([]);
        dispatch({ type: "toast", message: `백업 목록을 읽지 못했어요 · ${String(e)}`, error: true });
      });
    return () => {
      live = false;
    };
  }, [session, dispatch]);

  // 목록이 뜨면 첫 항목에 초점. 방향키로 옮기고 Enter로 고른다.
  useEffect(() => {
    if (list?.length && !pick) listRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [list, pick]);
  function onListKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = [...listRef.current!.querySelectorAll<HTMLButtonElement>("button")];
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? Math.min(els.length - 1, i + 1) : Math.max(0, i - 1);
    els[next]?.focus();
  }

  async function restore(b: BackupInfo) {
    setBusy(true);
    try {
      await session.restoreBackup?.(b.id);
    } catch (e) {
      setBusy(false);
      dispatch({ type: "toast", message: `되돌리지 못했어요 · ${String(e)}`, error: true });
    }
  }

  if (pick) {
    return (
      <div className="sheet" role="alertdialog" aria-label="백업에서 되돌리기">
        <h4>{backupWhen(pick.secs)} 백업으로 되돌릴까요?</h4>
        <p className="msg">노트와 화면 배치가 그때로 돌아가요. 노트 {pick.notes}개.</p>
        <p className="note">
          지금 노트는 데이터 폴더의 <code>{"backups\\restore"}</code>에 남겨 두니, 되돌린 것도 다시 되돌릴 수 있어요.
        </p>
        <div className="acts">
          <button type="button" className="sbtn" autoFocus onClick={() => setPick(null)} disabled={busy}>
            취소
          </button>
          <button type="button" className="sbtn danger" onClick={() => void restore(pick)} disabled={busy}>
            되돌리기
          </button>
        </div>
      </div>
    );
  }

  return (
    <Sheet title="백업에서 되돌리기" onClose={onClose} focusClose={!list?.length}>
      {list === null ? (
        <p className="msg">백업을 찾는 중…</p>
      ) : list.length === 0 ? (
        <p className="msg">아직 백업이 없어요. 앱을 켜 두면 5분마다 바뀐 게 있을 때 남아요.</p>
      ) : (
        <div className="backup-list" ref={listRef} onKeyDown={onListKey}>
          {list.map((b) => (
            <button type="button" key={b.id} onClick={() => setPick(b)}>
              <span className="when">{backupWhen(b.secs)}</span>
              <span className="meta">
                {TIER_LABEL[b.tier] ?? b.tier} · 노트 {b.notes}개
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function Sheet({
  title,
  onClose,
  children,
  wide,
  focusClose = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** 열릴 때 닫기 버튼에 초점을 둔다(안에서 초점을 따로 잡으면 false) */
  focusClose?: boolean;
}) {
  return (
    <div className={"sheet" + (wide ? " wide" : "")} role="dialog" aria-label={title}>
      <h4>
        {title}
        <button type="button" className="ib" title="닫기" aria-label="닫기" autoFocus={focusClose} onClick={onClose}>
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
  grid,
}: {
  name: string;
  value: T;
  options: [T, ReactNode][];
  onChange: (v: T) => void;
  column?: boolean;
  /** 3칸 격자 */
  grid?: boolean;
}) {
  return (
    <div className={column ? "col-opts" : grid ? "grid-opts" : "row"}>
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
  const [dir, setDir] = useState(session.dataDir);
  const edited = dir.trim() !== session.dataDir;

  /** 폴더를 바꾼다. 실패하면 알림으로 알린다(전에는 조용히 실패해서 아무 반응이 없어 보였다). */
  async function apply(next: string) {
    // 끝의 구분자는 떼되, 드라이브 루트(C:\)는 그대로 둔다
    const target = next.trim().replace(/(?<!:)[\\/]+$/, "");
    if (!target || target === session.dataDir) return;
    if (!/^([A-Za-z]:[\\/]|\\\\)/.test(target)) {
      dispatch({ type: "toast", message: "C:\\... 처럼 전체 경로로 적어 주세요" });
      return;
    }
    try {
      await session.changeDataDir?.(target);
    } catch (e) {
      dispatch({ type: "toast", message: `데이터 폴더를 바꾸지 못했어요 · ${String(e)}`, error: true });
    }
  }

  async function pickFolder() {
    try {
      const picked = await open({ directory: true, title: "데이터 폴더 고르기", defaultPath: session.dataDir });
      if (typeof picked === "string") {
        setDir(picked);
        await apply(picked);
      }
    } catch (e) {
      dispatch({ type: "toast", message: `폴더 고르기 창을 열지 못했어요 · ${String(e)}`, error: true });
    }
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
            ["on", "켜기"],
            ["off", "끄기"],
          ]}
        />
      </div>
      <div className="opt">
        <span className="lbl">테마</span>
        <Radios
          name="theme"
          grid
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
        <span className="lbl">데이터 폴더</span>
        <div className="folder">
          <input
            className="path"
            value={dir}
            spellCheck={false}
            readOnly={!session.changeDataDir}
            aria-label="데이터 폴더 경로"
            onChange={(e) => setDir(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void apply(dir);
            }}
          />
          {session.changeDataDir &&
            (edited ? (
              <button type="button" className="sbtn primary" onClick={() => void apply(dir)}>
                바꾸기
              </button>
            ) : (
              <button type="button" className="sbtn" onClick={() => void pickFolder()}>
                폴더 고르기
              </button>
            ))}
        </div>
        <span className="note">백업은 이 폴더의 backups에 5분·2시간·1일·1주·1달 단위로 남아요.</span>
        {session.listBackups && (
          <div>
            <button
              type="button"
              className="sbtn"
              onClick={() => dispatch({ type: "overlay", overlay: { kind: "restore" } })}
            >
              백업에서 되돌리기
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
