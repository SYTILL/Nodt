// 목업(docs/design/nodt-mockup.html)의 PALS, DANGER와 같은 값이다.

export type ThemeId = "cobalt" | "indigo" | "teal" | "orange" | "rose" | "graphite";
export type Mode = "light" | "dark";

type Tokens = Record<
  "bg" | "chrome" | "panel" | "text" | "muted" | "line" | "hover" | "accent" | "accent-ink" | "accent-soft",
  string
>;

export interface Theme {
  id: ThemeId;
  light: Tokens;
  dark: Tokens;
}

const DANGER: Record<Mode, Record<string, string>> = {
  light: { danger: "#E5484D", "danger-soft": "#FCEAEA", glow: "rgba(229,72,77,.32)", shadow: "0 1px 2px rgba(20,30,50,.06)" },
  dark: { danger: "#FF6369", "danger-soft": "#3A1C1F", glow: "rgba(255,99,105,.35)", shadow: "none" },
};

export const THEMES: Theme[] = [
  {
    id: "cobalt",
    light: { bg: "#F3F5F8", chrome: "#EBEEF2", panel: "#FFFFFF", text: "#1B2230", muted: "#6A7383", line: "#DFE3E9", hover: "#EEF1F5", accent: "#3056D3", "accent-ink": "#FFFFFF", "accent-soft": "#E3E9FB" },
    dark: { bg: "#121519", chrome: "#0E1114", panel: "#1A1E24", text: "#E4E8EE", muted: "#8A93A1", line: "#2A3039", hover: "#232830", accent: "#7B98FF", "accent-ink": "#0E1222", "accent-soft": "#1F2946" },
  },
  {
    id: "indigo",
    light: { bg: "#F4F3F8", chrome: "#ECEAF3", panel: "#FFFFFF", text: "#1F1B2E", muted: "#6E6982", line: "#E2DFEB", hover: "#F0EEF6", accent: "#5B4BD6", "accent-ink": "#FFFFFF", "accent-soft": "#E9E6FB" },
    dark: { bg: "#141219", chrome: "#0F0E14", panel: "#1C1A24", text: "#E7E4EF", muted: "#928CA3", line: "#2D2A38", hover: "#25222F", accent: "#9D8FFF", "accent-ink": "#15112A", "accent-soft": "#2A2548" },
  },
  {
    id: "teal",
    light: { bg: "#F1F6F5", chrome: "#E7EFEE", panel: "#FFFFFF", text: "#16211F", muted: "#5F706C", line: "#DAE5E3", hover: "#ECF3F2", accent: "#0E7C72", "accent-ink": "#FFFFFF", "accent-soft": "#DDF0ED" },
    dark: { bg: "#0F1515", chrome: "#0B1010", panel: "#161D1D", text: "#E0EAE8", muted: "#869794", line: "#253131", hover: "#1D2727", accent: "#3CC4B4", "accent-ink": "#06201D", "accent-soft": "#143432" },
  },
  {
    id: "orange",
    light: { bg: "#F5F4F2", chrome: "#EDEBE8", panel: "#FFFFFF", text: "#221E1B", muted: "#736C66", line: "#E4E0DB", hover: "#F1EEEB", accent: "#D9571E", "accent-ink": "#FFFFFF", "accent-soft": "#FBE7DC" },
    dark: { bg: "#151312", chrome: "#100E0D", panel: "#1D1A18", text: "#EDE8E4", muted: "#9A918A", line: "#2F2A27", hover: "#262220", accent: "#FF8A4C", "accent-ink": "#2A1105", "accent-soft": "#3A2417" },
  },
  {
    id: "rose",
    light: { bg: "#F7F3F5", chrome: "#F0EAED", panel: "#FFFFFF", text: "#251A20", muted: "#77676F", line: "#E8DEE3", hover: "#F3EDF0", accent: "#C92A6B", "accent-ink": "#FFFFFF", "accent-soft": "#F8E1EB" },
    dark: { bg: "#161114", chrome: "#110D0F", panel: "#1F181C", text: "#EFE5EA", muted: "#9C8C94", line: "#33292E", hover: "#292126", accent: "#FF74A8", "accent-ink": "#2B0C18", "accent-soft": "#3D1D2A" },
  },
  {
    id: "graphite",
    light: { bg: "#F4F4F5", chrome: "#ECECEE", panel: "#FFFFFF", text: "#18181B", muted: "#6B6B72", line: "#E1E1E5", hover: "#EFEFF1", accent: "#27272A", "accent-ink": "#FFFFFF", "accent-soft": "#E4E4E7" },
    dark: { bg: "#111113", chrome: "#0C0C0E", panel: "#1A1A1D", text: "#E8E8EA", muted: "#8D8D94", line: "#2B2B30", hover: "#242428", accent: "#E8E8EA", "accent-ink": "#111113", "accent-soft": "#2E2E33" },
  },
];

export function applyTheme(el: HTMLElement, themeId: ThemeId, mode: Mode) {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[2];
  for (const [k, v] of Object.entries({ ...theme[mode], ...DANGER[mode] })) {
    el.style.setProperty(`--${k}`, v);
  }
  el.style.colorScheme = mode;
}
