import { THEMES } from "../theme/themes";
import type { Settings } from "./store";

// 설정을 앱 저장소(WebView2 localStorage)에 둔다. 앱을 껐다 켜도 남는다.
// v0.1-c에서 데이터 폴더의 파일 저장으로 옮긴다.

const KEY = "nodt.settings";

export const DEFAULT_SETTINGS: Settings = { openMode: "add", lines: false, theme: "teal", brightness: "system" };

/** 저장된 값 중 올바른 것만 기본값 위에 얹는다. 저장소를 못 쓰면 기본값이다. */
export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const s = { ...DEFAULT_SETTINGS };
    if (raw.openMode === "add" || raw.openMode === "replace") s.openMode = raw.openMode;
    if (typeof raw.lines === "boolean") s.lines = raw.lines;
    if (THEMES.some((t) => t.id === raw.theme)) s.theme = raw.theme;
    if (["light", "dark", "system"].includes(raw.brightness)) s.brightness = raw.brightness;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 저장소를 못 쓰면 이번 실행 동안만 유지된다
  }
}
