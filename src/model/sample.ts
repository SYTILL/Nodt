import { parseMarkdown } from "./markdown";
import { BROKEN_TARGET, newNote, type NoteId, type Notes } from "./notes";

// 개발용 샘플 데이터. Tauri 밖(브라우저에서 npm run dev)에서 저장소 없이 띄울 때 쓴다.
// {{key}}는 해당 노트로 가는 링크, {{x}}는 깨진 링크다.
const SAMPLE: Record<string, { title: string; body: string }> = {
  root: {
    title: "오늘",
    body: "## 이번 주\n- CS 142A 프로젝트 {{cs}}\n- [ ] 운동 30분\n- [x] 장보기\n- 앱 개발 {{app}}\n\n예전 메모 {{x}}",
  },
  cs: {
    title: "CS 142A",
    body: "마감 10/14 (화) 23:59\n\n- Compiler Project {{comp}}\n- 중간고사 범위 {{mid}}",
  },
  app: {
    title: "앱 개발",
    body: "- Nodt {{nodt}}\n- ~~Bad Morning 리팩터링~~\n\n주말에 몰아서 하기",
  },
  comp: {
    title: "Compiler Project",
    body: "## 단계\n- [x] Lexer\n- [ ] Parser 구현 {{parser}}\n- [ ] Type System\n- [ ] Codegen",
  },
  mid: {
    title: "중간고사 범위",
    body: "- Lexical analysis\n- LL(1), FIRST / FOLLOW\n- **SDD** 예제 다시 풀기",
  },
  nodt: {
    title: "Nodt",
    body: "- [x] SPEC.md 정리\n- [ ] 색상 조합 정하기\n\nTauri + React + Tiptap",
  },
  parser: {
    title: "Parser 구현",
    body: "재귀 하강 파서로 시작\n\n- precedence climbing\n- 에러 복구는 나중에\n\n## 메모\n\nAST 노드는 **불변**으로",
  },
};

export function createSampleNotes(): { notes: Notes; rootId: NoteId; ids: Record<string, NoteId> } {
  const ids: Record<string, NoteId> = {};
  for (const key of Object.keys(SAMPLE)) ids[key] = crypto.randomUUID();

  const notes: Notes = {};
  for (const [key, { title, body }] of Object.entries(SAMPLE)) {
    const md = body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => `[>](nodt:${ids[k] ?? BROKEN_TARGET})`);
    notes[ids[key]] = newNote(ids[key], title, parseMarkdown(md));
  }
  return { notes, rootId: ids.root, ids };
}
