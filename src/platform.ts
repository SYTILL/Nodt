import { invoke } from "@tauri-apps/api/core";
import { currentMonitor, getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import type { Backdrop } from "./state/store";

// Tauri 창 밖(브라우저에서 npm run dev)에서도 화면은 뜨도록 실패를 삼킨다.

/** 창 배경 효과(Mica, Acrylic)를 깐다. 깔았으면 true. 효과나 밝기가 바뀌면 다시 부른다. */
export async function applyBackdrop(kind: Backdrop, dark: boolean): Promise<boolean> {
  try {
    return await invoke<boolean>("set_backdrop", { kind, dark });
  } catch {
    return false; // Tauri 밖
  }
}

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

/**
 * 창을 dw, dh(논리 픽셀)만큼 키운다. 모니터 작업 영역을 넘지 않고, 키웠으면 가운데로 옮긴다.
 * 사용법 노트가 창보다 클 때 쓴다. 최대화돼 있으면 그대로 둔다. 키웠으면 true.
 */
export async function growWindow(dw: number, dh: number): Promise<boolean> {
  try {
    const win = getCurrentWindow();
    if (await win.isMaximized()) return false;
    const cur = (await win.innerSize()).toLogical(await win.scaleFactor());
    let w = cur.width + dw;
    let h = cur.height + dh;
    const mon = await currentMonitor();
    if (mon) {
      const area = mon.workArea.size.toLogical(mon.scaleFactor);
      w = Math.min(w, area.width - 16);
      h = Math.min(h, area.height - 16);
    }
    if (w <= cur.width && h <= cur.height) return false;
    await win.setSize(new LogicalSize(Math.ceil(Math.max(w, cur.width)), Math.ceil(Math.max(h, cur.height))));
    await win.center();
    return true;
  } catch {
    return false; // Tauri 밖
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
