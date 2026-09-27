import { useLayoutEffect, useRef, useState, type Dispatch, type KeyboardEvent } from "react";
import { descendants } from "../model/notes";
import type { Action, State } from "../state/store";

// 패널 상단바 우클릭 메뉴. 방향키로 항목을 옮기고 Enter로 고른다. Esc나 바깥 클릭으로 닫힌다.

interface Props {
  menu: NonNullable<State["menu"]>;
  state: State;
  dispatch: Dispatch<Action>;
}

export function PanelMenu({ menu, state, dispatch }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });

  // 창 밖으로 나가지 않게 위치를 맞추고 첫 항목에 포커스를 둔다
  useLayoutEffect(() => {
    const el = ref.current!;
    const pad = 8;
    setPos({
      left: Math.min(menu.x, window.innerWidth - el.offsetWidth - pad),
      top: Math.min(menu.y, window.innerHeight - el.offsetHeight - pad),
    });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [menu]);

  const id = menu.id;
  const isRoot = id === state.rootId;
  const desc = descendants(state.tree, id);
  const close = () => dispatch({ type: "menu", menu: null });
  const run = (a: Action) => {
    close();
    dispatch(a);
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...ref.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div
      className="cmenu-layer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="cmenu" ref={ref} role="menu" style={pos} onKeyDown={onKeyDown}>
        <button type="button" role="menuitem" disabled={desc.length === 0} onClick={() => run({ type: "expandAll", id })}>
          하위 전체 펼치기
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!desc.some((k) => state.open.has(k))}
          onClick={() => run({ type: "collapseAll", id })}
        >
          하위 전체 접기
        </button>
        {/* 최상위 노트는 삭제할 수 없다 */}
        {!isRoot && (
          <>
            <div className="sep" role="separator" />
            <button type="button" role="menuitem" className="danger" onClick={() => run({ type: "delete", id })}>
              노트 삭제
            </button>
          </>
        )}
      </div>
    </div>
  );
}
