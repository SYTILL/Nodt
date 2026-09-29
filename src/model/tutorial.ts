import type { Lang } from "../i18n";
import { parseMarkdown } from "./markdown";
import { BROKEN_TARGET, newNote, type NoteId, type Notes } from "./notes";

// 처음 켤 때(또는 "사용법 노트로" 초기화했을 때) 보여주는 노트.
// 최상위 노트는 셋이다: 사용법(파트별 하위 노트), 실제로 쓰는 모습을 보여주는 예제 둘.
// 처음에는 "시작하기"(와 연습장)를 펼치고 "링크와 새 노트"는 최소화해서 열어 둔다. 나머지 파트는 닫혀 있다.
// 예제는 최소화해 두고, 복원하면 하위 노트가 몇 단계 펼쳐진 모습이 보이게 열림 상태를 기억시켜 둔다.
// {{key}}는 해당 노트로 가는 링크, {{x}}는 깨진 링크 예시다.
// 영어(기본)와 한국어 두 벌이 있고 구조(키, 링크)는 같다. 만들 때의 언어로 만든다.

type Entry = { title: string; body: string };

const TUTORIAL_KO = {
  root: {
    title: "Nodt 사용법",
    body: [
      "생각 하나에서 다음 생각으로 계속 들어가는 노트예요.",
      "링크(>)를 누르면 옆에 하위 노트가 열리고, 다시 누르면(<) 닫혀요.",
      "",
      "## 파트",
      "- 시작하기 {{start}}",
      "- 링크와 새 노트 {{links}}",
      "- 패널 다루기 {{panels}}",
      "- 화면 옮기기 {{canvas}}",
      "- 복사와 이동 {{clip}}",
      "- 저장과 설정 {{save}}",
      "- 서식 {{format}}",
    ].join("\n"),
  },
  start: {
    title: "시작하기",
    body: [
      "- 이 노트들은 마음대로 고치거나 지워도 돼요.",
      "- 설정 왼쪽의 초기화 버튼으로 언제든 이 상태로 돌아올 수 있어요.",
      "- 제목은 두 번 눌러 고쳐요. 제목에서 Enter를 누르면 본문으로 내려가요.",
      "- 아래 예제 노트들은 — 로 접혀 있어요. □ 를 누르면 펼쳐져요.",
      "- Ctrl+Z 는 무엇이든 되돌려요. 글, 패널 열고 닫기, 삭제까지요. Ctrl+Shift+Z 로 다시 실행해요.",
      "",
      "직접 써 보기 {{practice}}",
    ].join("\n"),
  },
  practice: {
    title: "연습장",
    body: ["- [x] 체크 목록은 이렇게 생겼어요", "- [ ] 눌러서 체크해 보세요", "", "여기에 마음대로 써 보세요."].join("\n"),
  },
  links: {
    title: "링크와 새 노트",
    body: [
      "- 글을 쓰다가 Ctrl+N 을 누르면 새 노트 링크가 생기고 옆에 열려요. 제목에서 누르면 본문 끝에 생겨요.",
      "- 빈 곳을 누르면 선택이 풀려요. 그 상태에서 Ctrl+N 을 누르면 새 최상위 노트가 생겨요. 최상위 노트는 여러 개 둘 수 있어요.",
      "- 줄 맨 앞이나 공백 뒤에서 / 를 누르면 명령 메뉴가 떠요.",
      "- 커서를 링크 바로 뒤에 두고 Ctrl+Enter 로 열고 닫아요.",
      "- 링크를 지우면 그 노트와 하위 노트도 지워져요. 아래에 뜨는 알림이나 Ctrl+Z 로 되돌려요.",
      "- 빨간 x는 가리키는 노트가 없는 깨진 링크예요. 눌러서 새 노트로 만들 수 있어요 {{x}}",
    ].join("\n"),
  },
  panels: {
    title: "패널 다루기",
    body: [
      "- Alt+방향키로 패널 사이를 옮겨 다녀요.",
      "- Ctrl+W 로 선택한 패널을 닫아요. 하위 패널도 같이 닫히고, 다시 열면 그대로 돌아와요.",
      "- Esc 는 빈 곳을 누른 것처럼 선택을 풀어요.",
      "- 최상위 노트는 닫히지 않아요. Ctrl+W 로 접었다 폈다 해요.",
      "- 상단바를 위아래로 끌면 순서가 바뀌어요.",
      "- 오른쪽 가장자리는 너비, 아래 가장자리는 높이, 모서리는 둘 다 바꿔요.",
      "- 상단바의 — 로 접고, 상단바를 우클릭하면 하위 전체 펼치기·접기·삭제가 있어요.",
      "- Ctrl+Tab 은 패널이동모드예요. 방향키로 고르고 Enter.",
    ].join("\n"),
  },
  canvas: {
    title: "화면 옮기기",
    body: ["- 패널 밖 빈 곳을 끌면 화면이 움직여요.", "- 휠로 확대·축소해요.", "- Ctrl+0 으로 원래 위치, 100%로 돌아와요."].join(
      "\n",
    ),
  },
  clip: {
    title: "복사와 이동",
    body: [
      "- Ctrl+C → Ctrl+V: 링크는 깨진 링크로 붙어요. 노트 하나는 한 곳에만 있을 수 있거든요.",
      "- Ctrl+C → Ctrl+Shift+V: 하위 노트까지 통째로 복제해서 붙여요.",
      "- Ctrl+X → Ctrl+V: 노트를 다른 곳으로 옮겨요. 잘라낸 곳은 붙이기 전까지 박스로 표시돼요.",
    ].join("\n"),
  },
  format: {
    title: "서식",
    body: [
      "- **굵게**는 Ctrl+B, ~~취소선~~은 Ctrl+Shift+S",
      "- 줄 맨 앞에 ## 과 공백 → 부제목",
      "- 줄 맨 앞에 - 와 공백 → 글머리 목록, [ ] 와 공백 → 체크 목록",
      "- 목록에서 Tab / Shift+Tab 으로 들여쓰기 / 내어쓰기",
    ].join("\n"),
  },
  save: {
    title: "저장과 설정",
    body: [
      "- 쓰는 대로 저장돼요. 노트 하나가 md 파일 하나예요.",
      "- 5분부터 1달까지 백업이 남아요.",
      "- 설정(톱니바퀴)에서 테마, 밝기, 연결선, 데이터 폴더를 바꿔요.",
      "- 모든 단축키는 ? 에 있어요.",
    ].join("\n"),
  },

  // ───── 예제 1: 이번 주 할 일 ─────
  ex1: {
    title: "예제 1: 이번 주 할 일",
    body: [
      "할 일을 적다가, 길어지는 일은 하위 노트로 빼요.",
      "",
      "## 이번 주",
      "- [ ] 장보기 {{ex1shop}}",
      "- [ ] 발표 자료 만들기 {{ex1talk}}",
      "- [x] 병원 예약",
      "- [ ] 방 정리 {{ex1room}}",
    ].join("\n"),
  },
  ex1shop: {
    title: "장보기",
    body: ["- [x] 우유", "- [ ] 계란", "- [ ] 두부", "- [ ] 휴지"].join("\n"),
  },
  ex1talk: {
    title: "발표 자료 만들기",
    body: ["- [x] 목차 정하기", "- [ ] 자료 조사 {{ex1research}}", "- [ ] 슬라이드 만들기", "- [ ] 리허설"].join("\n"),
  },
  ex1research: {
    title: "자료 조사",
    body: ["참고할 것", "", "- 지난번 발표 자료", "- 관련 기사 2~3개", "", "**금요일까지**"].join("\n"),
  },
  ex1room: {
    title: "방 정리",
    body: ["- 옷장", "- 책상", "- ~~창문 닦기~~ 다음 주에"].join("\n"),
  },

  // ───── 예제 2: 독서 기록 ─────
  ex2: {
    title: "예제 2: 독서 기록",
    body: [
      "책마다 하위 노트를 만들고, 남기고 싶은 부분은 또 하위 노트로 나눠요.",
      "",
      "## 올해 읽은 책",
      "- 어린 왕자 {{ex2prince}}",
      "- 데미안 {{ex2demian}}",
      "",
      "## 다음에",
      "- 읽고 싶은 책 {{ex2wish}}",
    ].join("\n"),
  },
  ex2prince: {
    title: "어린 왕자",
    body: ["- 다 읽음: 3월", "- 한 줄 평: 다시 읽을 때마다 다르게 읽힌다", "", "마음에 남은 문장 {{ex2quote}}"].join("\n"),
  },
  ex2quote: {
    title: "마음에 남은 문장",
    body: ["- 가장 중요한 것은 눈에 보이지 않아.", "- 네 장미를 그토록 소중하게 만든 건 네가 장미에게 들인 시간이야."].join("\n"),
  },
  ex2demian: {
    title: "데미안",
    body: ["- 읽는 중 (120쪽)", "- 싱클레어가 데미안을 처음 만나는 장면까지"].join("\n"),
  },
  ex2wish: {
    title: "읽고 싶은 책",
    body: ["- [ ] 사피엔스", "- [ ] 코스모스", "- [ ] 참을 수 없는 존재의 가벼움"].join("\n"),
  },
} satisfies Record<string, Entry>;

type Key = keyof typeof TUTORIAL_KO;

const TUTORIAL_EN: Record<Key, Entry> = {
  root: {
    title: "How to use Nodt",
    body: [
      "A note app where one thought leads into the next.",
      "Click a link (>) to open its sub-note beside it, and click it again (<) to close it.",
      "",
      "## Parts",
      "- Getting started {{start}}",
      "- Links and new notes {{links}}",
      "- Working with panels {{panels}}",
      "- Moving around {{canvas}}",
      "- Copy and move {{clip}}",
      "- Saving and settings {{save}}",
      "- Formatting {{format}}",
    ].join("\n"),
  },
  start: {
    title: "Getting started",
    body: [
      "- Feel free to edit or delete these notes.",
      "- You can always come back here with the reset button left of Settings.",
      "- Double-click a title to edit it. Press Enter in the title to move to the body.",
      "- The example notes below are folded with —. Click □ to unfold them.",
      "- Ctrl+Z undoes anything: typing, opening and closing panels, even deleting. Ctrl+Shift+Z redoes.",
      "",
      "Try it yourself {{practice}}",
    ].join("\n"),
  },
  practice: {
    title: "Scratchpad",
    body: ["- [x] This is what a checklist looks like", "- [ ] Click to check it off", "", "Write anything here."].join("\n"),
  },
  links: {
    title: "Links and new notes",
    body: [
      "- While writing, press Ctrl+N to add a link to a new note, which opens beside it. From the title, the link goes at the end of the body.",
      "- Click empty space to clear the selection. Then Ctrl+N creates a new top-level note. You can have as many top-level notes as you like.",
      "- Type / at the start of a line or after a space for the command menu.",
      "- With the cursor right after a link, Ctrl+Enter opens and closes it.",
      "- Deleting a link deletes its note and sub-notes too. Undo with the notice at the bottom or Ctrl+Z.",
      "- A red x is a broken link that points to no note. Click it to turn it into a new note {{x}}",
    ].join("\n"),
  },
  panels: {
    title: "Working with panels",
    body: [
      "- Alt+arrow keys move between panels.",
      "- Ctrl+W closes the selected panel. Its sub-panels close too, and come back as they were when you reopen it.",
      "- Esc clears the selection, just like clicking empty space.",
      "- Top-level notes don't close. Ctrl+W folds and unfolds them.",
      "- Drag a title bar up or down to reorder panels.",
      "- Drag the right edge for width, the bottom edge for height, and the corner for both.",
      "- Fold a panel with — in its title bar. Right-click the title bar to expand all, collapse all, or delete.",
      "- Ctrl+Tab is move mode. Pick a panel with the arrow keys and press Enter.",
    ].join("\n"),
  },
  canvas: {
    title: "Moving around",
    body: [
      "- Drag empty space outside the panels to move the view.",
      "- Use the mouse wheel to zoom in and out.",
      "- Ctrl+0 goes back to the start at 100%.",
    ].join("\n"),
  },
  clip: {
    title: "Copy and move",
    body: [
      "- Ctrl+C → Ctrl+V: links are pasted as broken links, because a note can only live in one place.",
      "- Ctrl+C → Ctrl+Shift+V: pastes a full copy, sub-notes included.",
      "- Ctrl+X → Ctrl+V: moves a note somewhere else. What you cut stays boxed until you paste.",
    ].join("\n"),
  },
  format: {
    title: "Formatting",
    body: [
      "- **Bold** with Ctrl+B, ~~strikethrough~~ with Ctrl+Shift+S",
      "- Two # and a space at the start of a line → heading",
      "- A dash and a space at the start of a line → bulleted list, [ ] and a space → checklist",
      "- In a list, Tab / Shift+Tab to indent / outdent",
    ].join("\n"),
  },
  save: {
    title: "Saving and settings",
    body: [
      "- Everything is saved as you type. Each note is one md file.",
      "- Backups are kept, from every 5 minutes up to monthly.",
      "- Change the theme, brightness, lines and data folder in Settings (the gear).",
      "- All keyboard shortcuts are under ?.",
    ].join("\n"),
  },

  // ───── Example 1: This week's to-dos ─────
  ex1: {
    title: "Example 1: This week's to-dos",
    body: [
      "Write down your to-dos, and move the bigger ones into sub-notes.",
      "",
      "## This week",
      "- [ ] Groceries {{ex1shop}}",
      "- [ ] Make presentation slides {{ex1talk}}",
      "- [x] Book a doctor's appointment",
      "- [ ] Tidy up my room {{ex1room}}",
    ].join("\n"),
  },
  ex1shop: {
    title: "Groceries",
    body: ["- [x] Milk", "- [ ] Eggs", "- [ ] Bread", "- [ ] Paper towels"].join("\n"),
  },
  ex1talk: {
    title: "Make presentation slides",
    body: ["- [x] Outline", "- [ ] Research {{ex1research}}", "- [ ] Build the slides", "- [ ] Rehearse"].join("\n"),
  },
  ex1research: {
    title: "Research",
    body: ["Things to look at", "", "- Last presentation's slides", "- 2–3 related articles", "", "**By Friday**"].join("\n"),
  },
  ex1room: {
    title: "Tidy up my room",
    body: ["- Closet", "- Desk", "- ~~Clean the windows~~ next week"].join("\n"),
  },

  // ───── Example 2: Reading log ─────
  ex2: {
    title: "Example 2: Reading log",
    body: [
      "Make a sub-note for each book, and another for the parts you want to keep.",
      "",
      "## Read this year",
      "- The Little Prince {{ex2prince}}",
      "- Demian {{ex2demian}}",
      "",
      "## Next",
      "- Books to read {{ex2wish}}",
    ].join("\n"),
  },
  ex2prince: {
    title: "The Little Prince",
    body: ["- Finished: March", "- In one line: it reads differently every time", "", "Lines I loved {{ex2quote}}"].join("\n"),
  },
  ex2quote: {
    title: "Lines I loved",
    body: [
      "- What is essential is invisible to the eye.",
      "- It is the time you have spent on your rose that makes your rose so important.",
    ].join("\n"),
  },
  ex2demian: {
    title: "Demian",
    body: ["- Reading (page 120)", "- Up to where Sinclair first meets Demian"].join("\n"),
  },
  ex2wish: {
    title: "Books to read",
    body: ["- [ ] Sapiens", "- [ ] Cosmos", "- [ ] The Unbearable Lightness of Being"].join("\n"),
  },
};

export interface Tutorial {
  notes: Notes;
  /** 최상위 노트들, 위에서부터 */
  roots: NoteId[];
  open: Set<NoteId>;
  minimized: Set<NoteId>;
  active: NoteId;
  /** 처음 보일 때 내용에 맞춰 높이를 정할 패널 */
  fit: Set<NoteId>;
}

export function createTutorial(lang: Lang): Tutorial {
  const text: Record<Key, Entry> = lang === "ko" ? TUTORIAL_KO : TUTORIAL_EN;
  const ids: Record<string, NoteId> = {};
  for (const key of Object.keys(text)) ids[key] = crypto.randomUUID();
  const notes: Notes = {};
  for (const [key, { title, body }] of Object.entries(text)) {
    const md = body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => `[>](nodt:${ids[k] ?? BROKEN_TARGET})`);
    notes[ids[key]] = newNote(ids[key], title, parseMarkdown(md));
  }
  const keys = (list: string[]) => list.map((k) => ids[k]);
  return {
    notes,
    roots: keys(["root", "ex1", "ex2"]),
    // 예제는 복원했을 때 발표 자료 → 자료 조사, 어린 왕자 → 문장까지 펼쳐져 보이게 열림 상태를 기억해 둔다
    open: new Set(
      keys(["start", "practice", "links", "ex1shop", "ex1talk", "ex1research", "ex2prince", "ex2quote", "ex2wish"]),
    ),
    minimized: new Set(keys(["links", "ex1", "ex2"])),
    active: ids.start,
    // 높이는 정해 두지 않고, 처음 보일 때 내용이 다 보이게 잰다(글꼴, 배율이 달라도 잘리지 않게)
    fit: new Set(Object.values(ids)),
  };
}
