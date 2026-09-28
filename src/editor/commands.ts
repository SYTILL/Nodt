import type { Editor, JSONContent } from "@tiptap/core";
import { LINK_NODE } from "../model/markdown";
import type { EditorApi } from "./api";

/** 커서 자리에 새 노트 링크를 넣는다. 빈 노트가 생겨 옆 컬럼에 열리고, 초점은 새 노트 제목으로 간다. */
export function insertNewLink(editor: Editor, api: EditorApi): boolean {
  const id = crypto.randomUUID();
  const { $from } = editor.state.selection;
  const before = $from.nodeBefore;
  // 글 바로 뒤면 한 칸 띄운다
  const needSpace = before?.isText && !/\s$/.test(before.text ?? "");
  const content: JSONContent[] = [{ type: LINK_NODE, attrs: { id } }];
  if (needSpace) content.unshift({ type: "text", text: " " });
  api.animate(() => {
    api.raw({ type: "createNote", id });
    editor.chain().insertContent(content).run();
  });
  return true;
}

/** 커서 바로 앞의 링크를 열거나 닫는다. 깨진 링크면 새 노트로 만든다. */
export function toggleLinkBeforeCursor(editor: Editor, api: EditorApi): boolean {
  const { selection } = editor.state;
  if (!selection.empty) return false;
  const node = selection.$from.nodeBefore;
  if (!node || node.type.name !== LINK_NODE) return false;
  const id = String(node.attrs.id);
  if (id in api.getState().notes) {
    api.animate(() => api.raw({ type: "toggleLink", id }));
    return true;
  }
  const pos = selection.from - node.nodeSize;
  const newId = crypto.randomUUID();
  api.animate(() => {
    api.raw({ type: "createNote", id: newId });
    editor
      .chain()
      .command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, { id: newId });
        return true;
      })
      .run();
  });
  return true;
}

/** 커서가 본문 첫 줄에 있으면 제목으로 올라간다 */
export function arrowUpToTitle(editor: Editor, api: EditorApi): boolean {
  const { selection, doc } = editor.state;
  if (!selection.empty) return false;
  let firstStart = -1;
  doc.descendants((n, pos) => {
    if (firstStart >= 0) return false;
    if (n.isTextblock) {
      firstStart = pos + 1;
      return false;
    }
    return true;
  });
  if (selection.$from.start() !== firstStart) return false;
  if (!editor.view.endOfTextblock("up")) return false;
  api.focusTitle();
  return true;
}
