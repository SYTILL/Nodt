import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
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

// 가장 작은 창: 기본 크기 패널 하나에, 사방으로 화면 이동 저항이 걸리기 시작하는 거리(컬럼 간격)만큼 여백.
// 패널 244×200, 프로그램 상단바 32, 간격은 12(연결선 켜면 34). Workspace.tsx, styles.css의 값과 맞춘다.
const PANEL_W = 244;
const PANEL_H = 200;
const CHROME_H = 32;
/** 프로그램 상단바(로고, 초기화·설정·도움말, 창 버튼 셋)가 잘리지 않는 가장 좁은 너비 */
const CHROME_MIN_W = 286;

/** 가장 작은 창 크기를 연결선 설정(간격)에 맞춘다 */
export async function applyMinSize(lines: boolean) {
  const gap = lines ? 34 : 12;
  try {
    await getCurrentWindow().setMinSize(new LogicalSize(Math.max(PANEL_W + gap * 2, CHROME_MIN_W), CHROME_H + PANEL_H + gap * 2));
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
