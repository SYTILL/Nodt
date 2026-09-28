import { Extension, type Editor } from "@tiptap/core";
import { Suggestion } from "@tiptap/suggestion";
import type { EditorApi, GetApi } from "./api";
import { insertNewLink } from "./commands";

// `/` 명령 메뉴. 줄 맨 앞이나 공백 뒤에서만 뜬다.
// Esc를 누르거나 맞는 항목이 없으면 그냥 `/` 글자로 남는다.

export interface SlashItem {
  id: string;
  label: string;
  hint?: string;
  danger?: boolean;
  keywords: string[];
  run: (editor: Editor, api: EditorApi) => void;
}

function allItems(api: EditorApi): SlashItem[] {
  const items: SlashItem[] = [
    {
      id: "link",
      label: "새 노트 링크",
      hint: "Ctrl+.",
      keywords: ["link", "note", "링크", "노트", "새"],
      run: (e, a) => insertNewLink(e, a),
    },
    {
      id: "heading",
      label: "부제목",
      hint: "##",
      keywords: ["heading", "h", "title", "부제목", "제목"],
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: "bullet",
      label: "글머리 목록",
      hint: "-",
      keywords: ["bullet", "list", "ul", "목록", "글머리"],
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      id: "task",
      label: "체크 목록",
      hint: "[ ]",
      keywords: ["todo", "task", "check", "체크", "할일", "할 일"],
      run: (e) => e.chain().focus().toggleTaskList().run(),
    },
  ];
  // 최상위 노트는 지울 수 없다
  if (api.noteId !== api.getState().rootId) {
    items.push({
      id: "delete",
      label: "이 노트 삭제",
      danger: true,
      keywords: ["delete", "remove", "삭제", "지우기"],
      run: (_e, a) => a.animate(() => a.raw({ type: "delete", id: a.noteId })),
    });
  }
  return items;
}

function filterItems(api: EditorApi, query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return allItems(api);
  return allItems(api).filter((it) => it.label.toLowerCase().includes(q) || it.keywords.some((k) => k.startsWith(q)));
}

// ───── 메뉴 표시 상태(App의 SlashMenu가 그린다) ─────

export interface SlashView {
  items: SlashItem[];
  index: number;
  rect: DOMRect | null;
  pick: (item: SlashItem) => void;
}

let view: SlashView | null = null;
const listeners = new Set<() => void>();

function set(v: SlashView | null) {
  view = v;
  listeners.forEach((l) => l());
}

export const slashStore = {
  get: () => view,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  pick(i: number) {
    if (view?.items[i]) view.pick(view.items[i]);
  },
};

export function SlashCommand(getApi: GetApi) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          char: "/",
          allowedPrefixes: [" "],
          items: ({ query }) => filterItems(getApi(), query),
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            props.run(editor, getApi());
          },
          render: () => {
            const show = (p: { items: SlashItem[]; clientRect?: (() => DOMRect | null) | null; command: (i: SlashItem) => void }) =>
              set(
                p.items.length
                  ? {
                      items: p.items,
                      index: Math.min(view?.index ?? 0, p.items.length - 1),
                      rect: p.clientRect?.() ?? null,
                      pick: p.command,
                    }
                  : null,
              );
            return {
              onStart: (p) => {
                view = null;
                show(p);
              },
              onUpdate: show,
              onExit: () => set(null),
              onKeyDown: ({ event }) => {
                if (!view || !view.items.length) return false;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  const n = view.items.length;
                  const index = (view.index + (event.key === "ArrowDown" ? 1 : n - 1)) % n;
                  set({ ...view, index });
                  return true;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  if (event.isComposing) return false;
                  view.pick(view.items[view.index]);
                  return true;
                }
                return false;
              },
            };
          },
        }),
      ];
    },
  });
}
