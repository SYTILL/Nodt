import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import type { EditorApi } from "../editor/api";
import { clipboardProps, KEEP_META } from "../editor/clipboard";
import { buildExtensions } from "../editor/extensions";
import { docLinks, type Note } from "../model/notes";
import { useApp } from "./appContext";

interface Props {
  note: Note;
  onReady: (editor: Editor | null) => void;
  focusTitle: () => void;
}

/**
 * 패널 본문 에디터. 에디터에서 바뀐 문서를 상태로 올린다(editDoc).
 * 메뉴 삭제, 순서 바꾸기처럼 밖에서 문서가 바뀌면 에디터 내용을 새로 맞춘다.
 */
export function NoteEditor({ note, onReady, focusTitle }: Props) {
  const app = useApp();
  const api = useRef<EditorApi>(null!);
  api.current = {
    noteId: note.id,
    getState: () => app.state,
    raw: app.raw,
    animate: app.animate,
    focusTitle,
  };
  // 이 에디터가 마지막으로 올린(또는 받은) 문서. 상태의 문서와 다르면 밖에서 바뀐 것이다.
  const lastDoc = useRef(note.doc);

  const editor = useEditor(
    {
      extensions: buildExtensions(() => api.current),
      content: note.doc,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: clipboardProps(() => api.current),
      onUpdate: ({ editor, transaction }) => {
        const doc = editor.getJSON();
        const prev = lastDoc.current;
        lastDoc.current = doc;
        const action = { type: "editDoc" as const, id: note.id, doc, keep: !!transaction.getMeta(KEEP_META) };
        // 링크가 생기거나 없어지면 패널이 열리고 닫히므로 애니메이션으로 감싼다
        const linksChanged = docLinks(prev).join() !== docLinks(doc).join();
        if (linksChanged) api.current.animate(() => api.current.raw(action));
        else api.current.raw(action);
      },
    },
    [],
  );

  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  // 밖에서 문서가 바뀌었으면 에디터에 반영하고 커서 자리를 지킨다
  useEffect(() => {
    if (!editor || note.doc === lastDoc.current) return;
    const doc = note.doc;
    lastDoc.current = doc;
    // 링크 칩(React 노드 뷰)을 새로 그리는 일이 React 렌더 도중에 일어나지 않게 한 박자 미룬다
    queueMicrotask(() => {
      if (editor.isDestroyed || lastDoc.current !== doc) return;
      const { from, to } = editor.state.selection;
      editor.commands.setContent(doc, { emitUpdate: false });
      const max = editor.state.doc.content.size;
      try {
        editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
      } catch {
        // 자리가 없어졌으면 그대로 둔다
      }
    });
  }, [editor, note.doc]);

  return <EditorContent editor={editor} className="editor" />;
}
