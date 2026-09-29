import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState, type Dispatch, type KeyboardEvent, type ReactNode } from "react";
import type { BackupInfo } from "../storage/backend";
import { emptyState, freshState } from "../storage/session";
import type { Action, Overlay, Settings } from "../state/store";
import { LANGUAGES, t } from "../i18n";
import { THEMES } from "../theme/themes";
import { IconX } from "./icons";
import type { Session } from "./session";

interface Props {
  overlay: Overlay;
  settings: Settings;
  dispatch: Dispatch<Action>;
  session: Session;
}

export function OverlayView({ overlay, settings, dispatch, session }: Props) {
  const close = () => dispatch({ type: "overlay", overlay: null });
  const T = t();
  return (
    <div
      className="ovl"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {overlay.kind === "help" && (
        <Sheet title={T.help.title} onClose={close} wide>
          {T.help.groups.map(([group, rows]) => (
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
              {T.cancel}
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
  const T = t();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"tutorial" | "all">("all");
  async function reset() {
    setBusy(true);
    try {
      await session.beforeReset?.();
      dispatch({ type: "hydrate", state: kind === "tutorial" ? freshState(settings) : emptyState(settings) });
    } catch (e) {
      setBusy(false);
      dispatch({ type: "toast", message: T.reset.failed(String(e)), error: true });
    }
  }
  return (
    <div className="sheet" role="alertdialog" aria-label={T.reset.ok}>
      <h4>{T.reset.title}</h4>
      <p className="msg">{T.reset.msg}</p>
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
                <strong>{T.reset.all}</strong> · {T.reset.allNote}
              </span>,
            ],
            [
              "tutorial",
              <span>
                <strong>{T.reset.tutorial}</strong> · {T.reset.tutorialNote}
              </span>,
            ],
          ]}
        />
      </div>
      <p className="note">
        {T.reset.backupNote[0]}
        <code>{"backups\\reset"}</code>
        {T.reset.backupNote[1]}
      </p>
      <div className="acts">
        <button type="button" className="sbtn" autoFocus onClick={onClose} disabled={busy}>
          {T.cancel}
        </button>
        <button type="button" className="sbtn danger" onClick={() => void reset()} disabled={busy}>
          {T.reset.ok}
        </button>
      </div>
    </div>
  );
}

/** 백업 시각을 "Today 14:05", "Yesterday 09:30", "Sep 25 14:05"처럼(한국어: 오늘, 어제, 9월 25일) */
function backupWhen(secs: number): string {
  const R = t().restore;
  const d = new Date(secs * 1000);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86_400_000);
  if (diff === 0) return R.today(hm);
  if (diff === 1) return R.yesterday(hm);
  return R.date(d, hm, d.getFullYear() !== new Date().getFullYear());
}

/**
 * 백업에서 되돌리기. 목록에서 고르면 확인을 한 번 더 받는다.
 * 되돌리기 직전 상태는 backups\restore에 남으므로 되돌린 것도 다시 되돌릴 수 있다.
 */
function RestoreSheet({ dispatch, onClose, session }: { dispatch: Dispatch<Action>; onClose: () => void; session: Session }) {
  const R = t().restore;
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
        dispatch({ type: "toast", message: t().restore.listFailed(String(e)), error: true });
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
      dispatch({ type: "toast", message: R.failed(String(e)), error: true });
    }
  }

  if (pick) {
    return (
      <div className="sheet" role="alertdialog" aria-label={R.title}>
        <h4>{R.confirm(backupWhen(pick.secs))}</h4>
        <p className="msg">{R.confirmMsg(pick.notes)}</p>
        <p className="note">
          {R.keepNote[0]}
          <code>{"backups\\restore"}</code>
          {R.keepNote[1]}
        </p>
        <div className="acts">
          <button type="button" className="sbtn" autoFocus onClick={() => setPick(null)} disabled={busy}>
            {t().cancel}
          </button>
          <button type="button" className="sbtn danger" onClick={() => void restore(pick)} disabled={busy}>
            {R.ok}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Sheet title={R.title} onClose={onClose} focusClose={!list?.length}>
      {list === null ? (
        <p className="msg">{R.loading}</p>
      ) : list.length === 0 ? (
        <p className="msg">{R.none}</p>
      ) : (
        <div className="backup-list" ref={listRef} onKeyDown={onListKey}>
          {list.map((b) => (
            <button type="button" key={b.id} onClick={() => setPick(b)}>
              <span className="when">{backupWhen(b.secs)}</span>
              <span className="meta">
                {R.tiers[b.tier] ?? b.tier} · {R.notes(b.notes)}
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
        <button type="button" className="ib" title={t().close} aria-label={t().close} autoFocus={focusClose} onClick={onClose}>
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
  const S = t().settings;
  const [dir, setDir] = useState(session.dataDir);
  const edited = dir.trim() !== session.dataDir;

  /** 폴더를 바꾼다. 실패하면 알림으로 알린다(전에는 조용히 실패해서 아무 반응이 없어 보였다). */
  async function apply(next: string) {
    // 끝의 구분자는 떼되, 드라이브 루트(C:\)는 그대로 둔다
    const target = next.trim().replace(/(?<!:)[\\/]+$/, "");
    if (!target || target === session.dataDir) return;
    if (!/^([A-Za-z]:[\\/]|\\\\)/.test(target)) {
      dispatch({ type: "toast", message: S.fullPath });
      return;
    }
    try {
      await session.changeDataDir?.(target);
    } catch (e) {
      dispatch({ type: "toast", message: S.changeFailed(String(e)), error: true });
    }
  }

  async function pickFolder() {
    try {
      const picked = await open({ directory: true, title: S.pickTitle, defaultPath: session.dataDir });
      if (typeof picked === "string") {
        setDir(picked);
        await apply(picked);
      }
    } catch (e) {
      dispatch({ type: "toast", message: S.pickFailed(String(e)), error: true });
    }
  }

  return (
    <Sheet title={S.title} onClose={onClose}>
      <div className="opt">
        <span className="lbl">{S.language}</span>
        <Radios name="lang" value={settings.lang} onChange={(lang) => set({ lang })} options={LANGUAGES} />
      </div>
      <div className="opt">
        <span className="lbl">{S.openMode}</span>
        <Radios
          name="openMode"
          column
          value={settings.openMode}
          onChange={(openMode) => set({ openMode })}
          options={[
            ["add", S.openAdd],
            ["replace", S.openReplace],
          ]}
        />
      </div>
      <div className="opt">
        <span className="lbl">{S.lines}</span>
        <Radios
          name="lines"
          value={settings.lines ? "on" : "off"}
          onChange={(v) => set({ lines: v === "on" })}
          options={[
            ["on", S.on],
            ["off", S.off],
          ]}
        />
      </div>
      <div className="opt">
        <span className="lbl">{S.theme}</span>
        <Radios
          name="theme"
          grid
          value={settings.theme}
          onChange={(theme) => set({ theme })}
          options={THEMES.map((th) => [
            th.id,
            <>
              <span className="swatch" style={{ background: th.light.accent }} />
              {t().themes[th.id]}
            </>,
          ])}
        />
      </div>
      <div className="opt">
        <span className="lbl">{S.brightness}</span>
        <Radios
          name="brightness"
          value={settings.brightness}
          onChange={(brightness) => set({ brightness })}
          options={[
            ["light", S.light],
            ["dark", S.dark],
            ["system", S.system],
          ]}
        />
      </div>
      <div className="opt">
        <span className="lbl">{S.backdrop}</span>
        <Radios
          name="backdrop"
          value={settings.backdrop}
          onChange={(backdrop) => set({ backdrop })}
          options={[
            ["none", S.off],
            ["mica", "Mica"],
            ["acrylic", "Acrylic"],
          ]}
        />
        <span className="note">{S.backdropNote}</span>
      </div>
      {settings.backdrop !== "none" && (
        <div className="opt">
          <span className="lbl">{S.transparency}</span>
          <div className="slider">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={settings.transparency}
              aria-label={S.transparency}
              onChange={(e) => set({ transparency: Number(e.target.value) })}
            />
            <output>{settings.transparency}%</output>
          </div>
          <span className="note">{S.transparencyNote}</span>
        </div>
      )}
      <div className="opt">
        <span className="lbl">{S.dataDir}</span>
        <div className="folder">
          <input
            className="path"
            value={dir}
            spellCheck={false}
            readOnly={!session.changeDataDir}
            aria-label={S.dataDirPath}
            onChange={(e) => setDir(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void apply(dir);
            }}
          />
          {session.changeDataDir &&
            (edited ? (
              <button type="button" className="sbtn primary" onClick={() => void apply(dir)}>
                {S.change}
              </button>
            ) : (
              <button type="button" className="sbtn" onClick={() => void pickFolder()}>
                {S.pick}
              </button>
            ))}
        </div>
        <span className="note">{S.backupsNote}</span>
        {session.listBackups && (
          <div>
            <button
              type="button"
              className="sbtn"
              onClick={() => dispatch({ type: "overlay", overlay: { kind: "restore" } })}
            >
              {S.restore}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
