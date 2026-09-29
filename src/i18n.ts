import type { ThemeId } from "./theme/themes";

// 화면에 보이는 글. 영어가 기본이고 설정에서 한국어로 바꿀 수 있다.
// 사용자가 쓴 노트는 번역하지 않는다. 사용법 노트는 만들 때의 언어로 만든다(model/tutorial.ts).
// 지금 언어는 App이 그릴 때마다 setLang으로 맞추고, 어디서든 t()로 읽는다(리듀서의 알림 글 등).

export type Lang = "en" | "ko";

/** 설정 화면에 보이는 언어 이름. 각 언어 자신의 이름으로 쓴다. */
export const LANGUAGES: [Lang, string][] = [
  ["en", "English"],
  ["ko", "한국어"],
];

type HelpGroup = [string, [string, string][]];

const en = {
  untitled: "Untitled",
  titleLabel: "Title",
  bodyPlaceholder: "/ for commands",
  close: "Close",
  cancel: "Cancel",
  minimize: "Minimize",
  unminimize: "Restore",
  resizeHeight: "Resize height",
  resizeWidth: "Resize width",
  resize: "Resize",
  brokenLink: "Broken link",
  toggleNote: (title: string, open: boolean) => `${open ? "Close" : "Open"} ${title}`,
  moveMode: "Move mode · Arrow keys to move · Enter to select · Esc to cancel",
  undo: "Undo",
  emptyHint: "to create a note",
  deleted: (targets: string[], more: number) =>
    (targets.length === 1 ? `Deleted ‘${targets[0]}’` : `Deleted ${targets.length} notes`) +
    (more ? ` · including ${more} sub-note${more > 1 ? "s" : ""}` : ""),
  expandConfirm: (n: number) => `Open all ${n} sub-notes?`,
  expandConfirmOk: "Open all",
  cannotMoveIntoSelf: "Can't move a note into its own sub-notes",
  saveFailed: (m: string) => `Couldn't save · ${m}`,
  sampleDir: "(sample, not saved)",
  noBackupsInBrowser: "No backups in the browser",

  titleBar: {
    reset: "Reset",
    settings: "Settings",
    help: "Keyboard shortcuts",
    minimize: "Minimize",
    maximize: "Maximize",
    unmaximize: "Restore down",
    close: "Close",
  },

  menu: {
    makeNote: "Create note",
    remove: "Delete",
    expandAll: "Expand all",
    collapseAll: "Collapse all",
    deleteNote: "Delete note",
  },

  slash: {
    link: "New note link",
    heading: "Heading",
    bullet: "Bulleted list",
    task: "Checklist",
    del: "Delete this note",
  },

  help: {
    title: "Keyboard shortcuts",
    groups: [
      [
        "Notes and links",
        [
          ["Ctrl+N", "New note link · from the title, at the end of the body · with no panel selected, a new top-level note"],
          ["/", "Command menu (at the start of a line or after a space)"],
          ["Ctrl+Enter", "Open/close the link right before the cursor · turns a broken link into a new note"],
          ["Tab / Enter", "From the title to the body"],
          ["↑", "From the first line of the body to the title"],
          ["Tab / Shift+Tab", "Indent / outdent a list"],
          ["Backspace", "Right after a broken link, delete it"],
        ],
      ],
      [
        "Panels",
        [
          ["Esc", "Clear the selection (menus and modes close first)"],
          ["Ctrl+W", "Close the selected panel · minimize / restore a top-level note"],
          ["Click empty space", "Clear the selection"],
          ["Alt+← / Alt+→", "To the parent / the first open child panel"],
          ["Alt+↑ / Alt+↓", "To the panel above / below in the same column"],
          ["Alt+Shift+↑ / Alt+Shift+↓", "Reorder within the same parent"],
          ["Ctrl+Tab", "Move mode (arrow keys to move, Enter to select, Esc to cancel)"],
        ],
      ],
      [
        "View",
        [
          ["Drag empty space", "Move the view"],
          ["Wheel", "Zoom in / out"],
          ["Ctrl+0", "Back to the start, 100%"],
        ],
      ],
      [
        "Copy and move",
        [
          ["Ctrl+C → Ctrl+V", "Links are pasted as broken links"],
          ["Ctrl+C → Ctrl+Shift+V", "Paste a copy including sub-notes"],
          ["Ctrl+X → Ctrl+V", "Move (change the parent) · Esc to cancel"],
          ["Ctrl+Z", "Undo anything: typing, opening and closing panels, deleting…"],
          ["Ctrl+Shift+Z / Ctrl+Y", "Redo"],
        ],
      ],
      [
        "Formatting",
        [
          ["Ctrl+B", "Bold"],
          ["Ctrl+Shift+S", "Strikethrough"],
          ["## + Space", "Heading"],
          ["- + Space", "Bulleted list"],
          ["[ ] + Space", "Checklist"],
        ],
      ],
    ] as HelpGroup[],
  },

  reset: {
    title: "Reset?",
    msg: "All notes and the layout will be cleared. Settings stay as they are.",
    all: "Full reset",
    allNote: "start from an empty screen",
    tutorial: "Back to the guide",
    tutorialNote: "like the first launch",
    backupNote: ["A copy of your notes is kept in ", " in the data folder."] as [string, string],
    ok: "Reset",
    failed: (e: string) => `Couldn't reset · ${e}`,
  },

  restore: {
    title: "Restore from backup",
    tiers: {
      "5min": "every 5 minutes",
      "2h": "every 2 hours",
      "1d": "daily",
      "1w": "weekly",
      "1m": "monthly",
      reset: "before reset",
      restore: "before restore",
    } as Record<string, string>,
    today: (hm: string) => `Today ${hm}`,
    yesterday: (hm: string) => `Yesterday ${hm}`,
    date: (d: Date, hm: string, withYear: boolean) =>
      `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) })} ${hm}`,
    notes: (n: number) => `${n} note${n === 1 ? "" : "s"}`,
    confirm: (when: string) => `Restore the backup from ${when}?`,
    confirmMsg: (n: number) => `Notes and the layout go back to that point. ${n} note${n === 1 ? "" : "s"}.`,
    keepNote: ["Your current notes are kept in ", " in the data folder, so you can undo this too."] as [string, string],
    ok: "Restore",
    loading: "Looking for backups…",
    none: "No backups yet. While the app is open, one is saved every 5 minutes when something changed.",
    listFailed: (e: string) => `Couldn't read the backups · ${e}`,
    failed: (e: string) => `Couldn't restore · ${e}`,
  },

  settings: {
    title: "Settings",
    language: "Language",
    openMode: "Opening panels",
    openAdd: "Add: keep several sibling notes open",
    openReplace: "Replace: close other notes of the same parent",
    lines: "Connecting lines",
    on: "On",
    off: "Off",
    theme: "Theme",
    brightness: "Brightness",
    light: "Light",
    dark: "Dark",
    system: "Follow system",
    backdrop: "Background effect",
    backdropNote: "Mica softly tints the background with your wallpaper; Acrylic blurs the windows behind it.",
    transparency: "Background transparency",
    transparencyNote: "How much shows through the window background and the title bar. Panels stay opaque.",
    dataDir: "Data folder",
    dataDirPath: "Data folder path",
    change: "Change",
    pick: "Choose folder",
    pickTitle: "Choose a data folder",
    backupsNote: "Backups are kept in backups in this folder: every 5 minutes, 2 hours, day, week and month.",
    restore: "Restore from backup",
    fullPath: "Enter a full path, like C:\\...",
    changeFailed: (e: string) => `Couldn't change the data folder · ${e}`,
    pickFailed: (e: string) => `Couldn't open the folder picker · ${e}`,
    folderHasNotes: "This folder already has notes. Load them?\nThe notes in the current folder stay where they are.",
    load: "Load",
  },

  themes: {
    cobalt: "Cobalt",
    indigo: "Indigo",
    teal: "Teal",
    orange: "Orange",
    rose: "Rose",
    graphite: "Graphite",
  } as Record<ThemeId, string>,
};

export type Strings = typeof en;

const ko: Strings = {
  untitled: "제목 없음",
  titleLabel: "제목",
  bodyPlaceholder: "/로 명령",
  close: "닫기",
  cancel: "취소",
  minimize: "최소화",
  unminimize: "복원",
  resizeHeight: "높이 조절",
  resizeWidth: "너비 조절",
  resize: "크기 조절",
  brokenLink: "깨진 링크",
  toggleNote: (title, open) => `${title} ${open ? "닫기" : "열기"}`,
  moveMode: "패널이동모드 · 방향키로 이동 · Enter 선택 · Esc 취소",
  undo: "되돌리기",
  emptyHint: "으로 새 노트",
  deleted: (targets, more) =>
    (targets.length === 1 ? `‘${targets[0]}’ 삭제됨` : `노트 ${targets.length}개 삭제됨`) + (more ? ` · 하위 노트 ${more}개 포함` : ""),
  expandConfirm: (n) => `하위 노트 ${n}개를 모두 열까요?`,
  expandConfirmOk: "모두 열기",
  cannotMoveIntoSelf: "자기 하위 노트 안으로는 옮길 수 없음",
  saveFailed: (m) => `저장하지 못했어요 · ${m}`,
  sampleDir: "(샘플, 저장 안 함)",
  noBackupsInBrowser: "브라우저에서는 백업이 없어요",

  titleBar: {
    reset: "초기화",
    settings: "설정",
    help: "단축키 도움말",
    minimize: "최소화",
    maximize: "최대화",
    unmaximize: "이전 크기로",
    close: "닫기",
  },

  menu: {
    makeNote: "새 노트로 만들기",
    remove: "삭제",
    expandAll: "하위 전체 펼치기",
    collapseAll: "하위 전체 접기",
    deleteNote: "노트 삭제",
  },

  slash: {
    link: "새 노트 링크",
    heading: "부제목",
    bullet: "글머리 목록",
    task: "체크 목록",
    del: "이 노트 삭제",
  },

  help: {
    title: "단축키",
    groups: [
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
          ["Esc", "선택 풀기 (메뉴·모드가 떠 있으면 그것부터)"],
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
          ["Ctrl+Z", "무엇이든 되돌리기: 글, 패널 열고 닫기, 삭제…"],
          ["Ctrl+Shift+Z / Ctrl+Y", "다시 실행"],
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
    ],
  },

  reset: {
    title: "초기화할까요?",
    msg: "모든 노트와 화면 배치가 지워져요. 설정은 그대로예요.",
    all: "완전 초기화",
    allNote: "빈 화면에서 시작",
    tutorial: "사용법 노트로",
    tutorialNote: "처음 켰을 때처럼",
    backupNote: ["지우기 직전의 노트는 데이터 폴더의 ", "에 한 벌 남겨 둬요."],
    ok: "초기화",
    failed: (e) => `초기화하지 못했어요 · ${e}`,
  },

  restore: {
    title: "백업에서 되돌리기",
    tiers: {
      "5min": "5분 단위",
      "2h": "2시간 단위",
      "1d": "하루 단위",
      "1w": "일주일 단위",
      "1m": "한 달 단위",
      reset: "초기화 직전",
      restore: "되돌리기 직전",
    },
    today: (hm) => `오늘 ${hm}`,
    yesterday: (hm) => `어제 ${hm}`,
    date: (d, hm, withYear) => `${withYear ? `${d.getFullYear()}년 ` : ""}${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`,
    notes: (n) => `노트 ${n}개`,
    confirm: (when) => `${when} 백업으로 되돌릴까요?`,
    confirmMsg: (n) => `노트와 화면 배치가 그때로 돌아가요. 노트 ${n}개.`,
    keepNote: ["지금 노트는 데이터 폴더의 ", "에 남겨 두니, 되돌린 것도 다시 되돌릴 수 있어요."],
    ok: "되돌리기",
    loading: "백업을 찾는 중…",
    none: "아직 백업이 없어요. 앱을 켜 두면 5분마다 바뀐 게 있을 때 남아요.",
    listFailed: (e) => `백업 목록을 읽지 못했어요 · ${e}`,
    failed: (e) => `되돌리지 못했어요 · ${e}`,
  },

  settings: {
    title: "설정",
    language: "언어",
    openMode: "패널 열기 방식",
    openAdd: "추가: 형제 노트를 여러 개 열어둠",
    openReplace: "교체: 같은 부모의 다른 노트는 닫음",
    lines: "연결선",
    on: "켜기",
    off: "끄기",
    theme: "테마",
    brightness: "밝기",
    light: "라이트",
    dark: "다크",
    system: "시스템 설정 따르기",
    backdrop: "배경 효과",
    backdropNote: "Mica는 바탕화면 색이 은은하게, Acrylic은 뒤에 있는 창까지 뿌옇게 비쳐요.",
    transparency: "배경 투명도",
    transparencyNote: "창 배경과 상단바에 바탕화면 색이 비치는 정도예요. 패널은 그대로예요.",
    dataDir: "데이터 폴더",
    dataDirPath: "데이터 폴더 경로",
    change: "바꾸기",
    pick: "폴더 고르기",
    pickTitle: "데이터 폴더 고르기",
    backupsNote: "백업은 이 폴더의 backups에 5분·2시간·1일·1주·1달 단위로 남아요.",
    restore: "백업에서 되돌리기",
    fullPath: "C:\\... 처럼 전체 경로로 적어 주세요",
    changeFailed: (e) => `데이터 폴더를 바꾸지 못했어요 · ${e}`,
    pickFailed: (e) => `폴더 고르기 창을 열지 못했어요 · ${e}`,
    folderHasNotes: "이 폴더에 이미 노트가 있어요. 그 노트를 불러올까요?\n지금 폴더의 노트는 그대로 남아요.",
    load: "불러오기",
  },

  themes: {
    cobalt: "코발트",
    indigo: "인디고",
    teal: "청록",
    orange: "오렌지",
    rose: "로즈",
    graphite: "그라파이트",
  },
};

const STRINGS: Record<Lang, Strings> = { en, ko };

let current: Lang = "en";

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "ko";
}

/** 지금 언어를 바꾼다. App이 그릴 때마다 설정에 맞춰 부른다. */
export function setLang(lang: Lang) {
  current = lang;
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

export function getLang(): Lang {
  return current;
}

/** 지금 언어의 글 */
export function t(): Strings {
  return STRINGS[current];
}
