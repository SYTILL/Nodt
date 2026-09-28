import { getCurrentWindow } from "@tauri-apps/api/window";
import type { WindowMode } from "./state/store";
import { isTauri } from "./storage/backend";
import { showToast } from "./ui/session";

// Tauri 창 밖(브라우저에서 npm run dev)에서도 화면은 뜨도록 실패를 삼킨다.

export async function quitApp() {
  try {
    await getCurrentWindow().close();
  } catch {
    // Tauri 밖
  }
}

export async function minimizeWindow() {
  try {
    await getCurrentWindow().minimize();
  } catch {
    // Tauri 밖
  }
}

export async function toggleMaximizeWindow() {
  try {
    await getCurrentWindow().toggleMaximize();
  } catch {
    // Tauri 밖
  }
}

/** 창이 최대화됐는지 지금 한 번, 그리고 크기가 바뀔 때마다 알려준다. 돌려준 함수로 구독을 끊는다. */
export async function watchMaximized(onChange: (maximized: boolean) => void): Promise<() => void> {
  try {
    const win = getCurrentWindow();
    onChange(await win.isMaximized());
    return await win.onResized(async () => onChange(await win.isMaximized()));
  } catch {
    return () => {};
  }
}

// ───── 창 모드 (스펙 8.1) ─────

/** 전역 단축키. 스펙에 정해진 키가 없어 임시로 정했다(미결 사항). */
export const HOTKEY = "CommandOrControl+Alt+N";
export const HOTKEY_LABEL = "Ctrl+Alt+N";

/** 보이고 앞에 있으면 숨기고, 아니면 불러온다 */
async function toggleWindow() {
  const win = getCurrentWindow();
  const shown = (await win.isVisible()) && !(await win.isMinimized()) && (await win.isFocused());
  if (shown) {
    await win.hide();
  } else {
    await win.show();
    await win.unminimize();
    await win.setFocus();
  }
}

let applying: Promise<void> = Promise.resolve();

/** 일반 창 / 항상 위 / 단축키로 불러오기·숨기기 */
export function applyWindowMode(mode: WindowMode): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  // 설정을 빠르게 바꿔도 등록과 해제가 뒤섞이지 않게 차례로 한다
  applying = applying.then(async () => {
    const win = getCurrentWindow();
    await win.setAlwaysOnTop(mode === "onTop").catch(() => {});
    const gs = await import("@tauri-apps/plugin-global-shortcut");
    try {
      const registered = await gs.isRegistered(HOTKEY);
      if (mode === "hotkey" && !registered) {
        await gs.register(HOTKEY, (e) => {
          if (e.state === "Pressed") void toggleWindow();
        });
      } else if (mode !== "hotkey" && registered) {
        await gs.unregister(HOTKEY);
      }
    } catch {
      showToast(`${HOTKEY_LABEL} 단축키를 쓸 수 없어요 · 다른 프로그램이 쓰고 있을 수 있어요`);
    }
  });
  return applying;
}
