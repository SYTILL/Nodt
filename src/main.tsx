import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-sans-kr/400.css";
import "@fontsource/ibm-plex-sans-kr/600.css";
import "./styles.css";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
// 처음부터 불러 둔다. 필요할 때 불러오면 개발 서버가 의존성을 다시 묶는 사이 옛 주소를 찾다가 실패한다.
import { confirm } from "@tauri-apps/plugin-dialog";
import App from "./App";
import { createSampleNotes } from "./model/sample";
import { DEFAULT_SETTINGS, makeState } from "./state/store";
import { getBackend, isTauri, type Backend } from "./storage/backend";
import { boot, Saver, type WindowGeom } from "./storage/session";
import { showToast, type Session } from "./ui/session";

/** 개발용 샘플 모드(주소에 ?sample). 저장하지 않는다. 자동 테스트가 이 모드로 돈다. */
function sampleState() {
  const { notes, rootId, ids } = createSampleNotes();
  return makeState(notes, [rootId], {
    open: new Set([ids.cs, ids.comp, ids.mid, ids.parser, ids.app]),
    active: ids.comp,
    settings: DEFAULT_SETTINGS,
  });
}

/** 닫을 때 창 위치와 크기. 최대화 상태면 이전 크기를 지킨다. */
async function readGeom(win: Window, prev: WindowGeom | undefined): Promise<WindowGeom | undefined> {
  if (await win.isMinimized()) return prev;
  if (await win.isMaximized()) return prev ? { ...prev, maximized: true } : undefined;
  const pos = await win.outerPosition();
  const size = await win.innerSize();
  return { x: pos.x, y: pos.y, width: size.width, height: size.height, maximized: false };
}

async function changeDataDir(saver: Saver, backend: Backend, dir: string) {
  await saver.flush(false);
  if (await backend.hasNotes(dir)) {
    const ok = await confirm("이 폴더에 이미 노트가 있어요. 그 노트를 불러올까요?\n지금 폴더의 노트는 그대로 남아요.", {
      title: "데이터 폴더",
      okLabel: "불러오기",
      cancelLabel: "취소",
    });
    if (!ok) return;
  } else {
    // 빈 폴더면 지금 노트를 그대로 옮겨 쓴다
    await saver.copyTo(dir);
  }
  await saver.setDataDir(dir);
  location.reload();
}

async function start() {
  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

  if (new URLSearchParams(location.search).has("sample")) {
    root.render(
      <React.StrictMode>
        <App initial={sampleState()} session={{ kind: "sample", dataDir: "(샘플, 저장 안 함)" }} />
      </React.StrictMode>,
    );
    return;
  }

  const backend = getBackend();
  const booted = await boot(backend);
  const saver = new Saver(backend, booted.dataDir, booted.config, booted.texts, booted.window, (m) =>
    showToast(`저장하지 못했어요 · ${m}`),
  );
  const session: Session = {
    kind: backend.kind,
    dataDir: booted.dataDir,
    changeDataDir: backend.kind === "tauri" ? (dir) => changeDataDir(saver, backend, dir) : undefined,
    beforeReset: async () => {
      await saver.flush(false);
      await backend.backupBeforeReset(saver.dataDir);
    },
    listBackups: backend.kind === "tauri" ? () => backend.listBackups(saver.dataDir) : undefined,
    restoreBackup: async (id) => {
      await saver.stop();
      try {
        await backend.restoreBackup(saver.dataDir, id);
      } catch (e) {
        // 되돌리지 못했으면 지금 노트를 계속 저장한다
        saver.resume();
        throw e;
      }
      location.reload();
    },
  };
  root.render(
    <React.StrictMode>
      <App initial={booted.state} onState={(s) => saver.schedule(s)} session={session} />
    </React.StrictMode>,
  );

  if (isTauri()) {
    const win = getCurrentWindow();
    // 닫기 전에 창 위치를 적고 저장을 마친다. 기다리던 삭제도 이때 확정된다.
    await win.onCloseRequested(async (event) => {
      event.preventDefault();
      try {
        saver.window = await readGeom(win, saver.window);
        await saver.flush(true);
      } finally {
        await win.destroy();
      }
    });
    // 백업 스냅샷: 시작할 때 한 번, 그 뒤로 1분마다 주기가 된 단계만
    const tick = () => backend.backupTick(saver.dataDir).catch((e) => console.error("백업 실패", e));
    setTimeout(tick, 5000);
    setInterval(tick, 60_000);
  }
}

void start();
