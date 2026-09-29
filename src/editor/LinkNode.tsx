import { Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { t } from "../i18n";
import { LINK_NODE } from "../model/markdown";
import { BROKEN_TARGET } from "../model/notes";
import { useApp } from "../ui/appContext";
import { IconChevronLeft, IconChevronRight, IconX } from "../ui/icons";

// 본문 안의 링크 기호. 라벨이 없는 인라인 원자 노드이고, 자식 노트 하나를 가리킨다.
// 가리키는 노트가 없으면 깨진 링크다.

export const NodtLink = Node.create({
  name: LINK_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: BROKEN_TARGET,
        parseHTML: (el) => el.getAttribute("data-nodt-link") ?? BROKEN_TARGET,
        renderHTML: (attrs) => ({ "data-nodt-link": attrs.id }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-nodt-link]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes];
  },

  // 앱 밖으로 복사할 때 글에는 남기지 않는다
  renderText: () => "",

  // 링크 칩은 글자가 아니라서 글 선택(Shift+방향키, 끌기)에 들어가도 선택 배경이 칠해지지 않는다.
  // 선택 범위 안의 링크에 표시를 달아 CSS로 선택된 모습을 그린다.
  addProseMirrorPlugins() {
    const type = this.type;
    return [
      new Plugin({
        key: new PluginKey("nodtLinkSelection"),
        props: {
          decorations(state) {
            const { from, to, empty } = state.selection;
            if (empty) return null;
            const decos: Decoration[] = [];
            state.doc.nodesBetween(from, to, (n, pos) => {
              if (n.type === type && pos >= from && pos + n.nodeSize <= to) {
                decos.push(Decoration.node(pos, pos + n.nodeSize, { class: "in-selection" }));
              }
            });
            return decos.length ? DecorationSet.create(state.doc, decos) : null;
          },
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LinkChipView, { as: "span", className: "lnk-wrap" });
  },
});

function LinkChipView({ node, editor, getPos }: ReactNodeViewProps) {
  const { state, raw, animate } = useApp();
  const id = String(node.attrs.id);
  const note = state.notes[id];

  if (!note) {
    return (
      <NodeViewWrapper as="span" className="lnk-wrap">
        <button
          type="button"
          className="lnk broken"
          aria-label={t().brokenLink}
          contentEditable={false}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            // 이 본문에서 몇 번째 깨진 링크인지 세어 메뉴에 넘긴다
            const pos = getPos();
            if (typeof pos !== "number") return;
            let n = 0;
            editor.state.doc.nodesBetween(0, pos, (child) => {
              if (child.type.name === LINK_NODE && !(String(child.attrs.id) in state.notes)) n++;
            });
            const parent = (e.currentTarget.closest(".panel") as HTMLElement | null)?.dataset.id;
            if (!parent) return;
            const r = e.currentTarget.getBoundingClientRect();
            raw({ type: "menu", menu: { kind: "broken", parent, n, x: r.left, y: r.bottom + 4 } });
          }}
        >
          <IconX />
        </button>
      </NodeViewWrapper>
    );
  }

  const open = state.open.has(id);
  return (
    <NodeViewWrapper as="span" className="lnk-wrap">
      <button
        type="button"
        className={"lnk" + (open ? " open" : "")}
        data-link={id}
        aria-label={t().toggleNote(note.title || t().untitled, open)}
        contentEditable={false}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          animate(() => raw({ type: "toggleLink", id }));
        }}
      >
        {/* 닫힘 >: 누르면 오른쪽으로 열린다. 열림 <: 누르면 닫힌다. */}
        {open ? <IconChevronLeft /> : <IconChevronRight />}
      </button>
    </NodeViewWrapper>
  );
}
