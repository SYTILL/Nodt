import { Extension } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { t } from "../i18n";
import type { GetApi } from "./api";
import { cutPlugin } from "./clipboard";
import { arrowUpToTitle, insertNewLink, toggleLinkBeforeCursor } from "./commands";
import { NodtLink } from "./LinkNode";
import { SlashCommand } from "./slash";

// 스펙 6장: 굵게, 취소선, 글머리 목록, 체크박스, 부제목(한 단계)만 쓴다.
// 기울임, 여러 단계 헤딩, 표, 이미지, 임베드는 쓰지 않는다.

function NodtKeys(getApi: GetApi) {
  return Extension.create({
    name: "nodtKeys",
    // 목록의 Tab(들여쓰기)이 먼저 처리되도록 우선순위를 낮춘다
    priority: 50,
    addKeyboardShortcuts() {
      return {
        "Mod-Enter": () => toggleLinkBeforeCursor(this.editor, getApi()),
        // 제목이나 패널만 선택한 상태의 Ctrl+N은 App이 받는다
        "Mod-n": () => insertNewLink(this.editor, getApi()),
        ArrowUp: () => arrowUpToTitle(this.editor, getApi()),
        // 목록 밖에서는 Tab이 초점을 다른 곳으로 옮기지 않게 막는다
        Tab: () => true,
        "Shift-Tab": () => true,
      };
    },
    addProseMirrorPlugins() {
      return [cutPlugin()];
    },
  });
}

export function buildExtensions(getApi: GetApi) {
  return [
    StarterKit.configure({
      heading: { levels: [2] },
      blockquote: false,
      code: false,
      codeBlock: false,
      hardBreak: false,
      horizontalRule: false,
      italic: false,
      link: false,
      orderedList: false,
      underline: false,
      trailingNode: false,
      dropcursor: false,
      // 되돌리기는 앱 전체 기록 하나로 한다(state/store.ts의 전역 되돌리기). 에디터마다 따로 두지 않는다.
      undoRedo: false,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    // 안내 글은 최상위 노트에만 보인다. 하위 노트는 새로 열렸을 때 깔끔하게 비워 둔다.
    Placeholder.configure({
      placeholder: () => {
        const api = getApi();
        return api.getState().tree.parent[api.noteId] ? "" : t().bodyPlaceholder;
      },
      showOnlyCurrent: true,
    }),
    NodtLink,
    NodtKeys(getApi),
    SlashCommand(getApi),
  ];
}
