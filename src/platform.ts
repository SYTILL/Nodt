import { documentDir, join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";

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

export async function defaultDataFolder(): Promise<string> {
  try {
    return await join(await documentDir(), "Nodt");
  } catch {
    return "문서\\Nodt";
  }
}
