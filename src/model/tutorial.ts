import { parseMarkdown } from "./markdown";
import { BROKEN_TARGET, newNote, type NoteId, type Notes } from "./notes";

// 처음 켤 때(또는 초기화했을 때) 보여주는 사용법 노트.
// 최상위 노트 아래에 파트별 하위 노트가 있고, "시작하기"만 하위까지 펼쳐 두고 나머지 파트는 최소화해 둔다.
// {{key}}는 해당 노트로 가는 링크, {{x}}는 깨진 링크 예시다.

const TUTORIAL: Record<string, { title: string; body: string }> = {
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
    ].join("\n"),
  },
  start: {
    title: "시작하기",
    body: [
      "- 이 노트들은 마음대로 고치거나 지워도 돼요.",
      "- 설정 왼쪽의 초기화 버튼으로 언제든 이 상태로 돌아올 수 있어요.",
      "- 제목은 패널 맨 위에서 바로 고쳐요. 제목에서 Enter를 누르면 본문으로 내려가요.",
      "",
      "## 서식",
      "- **굵게**는 Ctrl+B, ~~취소선~~은 Ctrl+Shift+S",
      "- 줄 맨 앞에 ## 과 공백 → 부제목",
      "- 줄 맨 앞에 - 와 공백 → 글머리 목록, [ ] 와 공백 → 체크 목록",
      "- 목록에서 Tab / Shift+Tab 으로 들여쓰기 / 내어쓰기",
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
      "- Ctrl+W 나 Esc 로 선택한 패널을 닫아요. 하위 패널도 같이 닫히고, 다시 열면 그대로 돌아와요.",
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
  save: {
    title: "저장과 설정",
    body: [
      "- 쓰는 대로 저장돼요. 노트 하나가 md 파일 하나예요.",
      "- 5분부터 1달까지 백업이 남아요.",
      "- 설정(톱니바퀴)에서 테마, 밝기, 창 모드, 데이터 폴더를 바꿔요.",
      "- 모든 단축키는 ? 에 있어요.",
    ].join("\n"),
  },
};

export interface Tutorial {
  notes: Notes;
  rootId: NoteId;
  open: Set<NoteId>;
  minimized: Set<NoteId>;
  active: NoteId;
  panelHeights: Record<NoteId, number>;
}

export function createTutorial(): Tutorial {
  const ids: Record<string, NoteId> = {};
  for (const key of Object.keys(TUTORIAL)) ids[key] = crypto.randomUUID();
  const notes: Notes = {};
  for (const [key, { title, body }] of Object.entries(TUTORIAL)) {
    const md = body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => `[>](nodt:${ids[k] ?? BROKEN_TARGET})`);
    notes[ids[key]] = newNote(ids[key], title, parseMarkdown(md));
  }
  const parts = ["start", "links", "panels", "canvas", "clip", "save"];
  return {
    notes,
    rootId: ids.root,
    // 파트는 모두 열어 두되 "시작하기"만 펼치고 나머지는 제목줄만
    open: new Set([...parts, "practice"].map((k) => ids[k])),
    minimized: new Set(parts.filter((k) => k !== "start").map((k) => ids[k])),
    active: ids.start,
    // 처음 보는 두 패널은 내용이 다 보이게 기본 높이보다 크게
    panelHeights: { [ids.root]: 330, [ids.start]: 400 },
  };
}
