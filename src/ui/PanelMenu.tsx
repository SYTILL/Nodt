import { Fragment, useLayoutEffect, useRef, useState, type Dispatch, type KeyboardEvent } from "react";
import { t } from "../i18n";
import { descendants } from "../model/notes";
import type { Action, State } from "../state/store";

// 드롭다운 메뉴. 방향키로 항목을 옮기고 Enter로 고른다. Esc나 바깥 클릭으로 닫힌다.

interface Item {
  label: string;
  action: Action;
  disabled?: boolean;
  danger?: boolean;
  /** 이 항목 위에 구분선 */
  separated?: boolean;
}

function Dropdown({ x, y, items, dispatch }: { x: number; y: number; items: Item[]; dispatch: Dispatch<Action> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // 창 밖으로 나가지 않게 위치를 맞추고 첫 항목에 포커스를 둔다
  useLayoutEffect(() => {
    const el = ref.current!;
    const pad = 8;
    setPos({
      left: Math.min(x, window.innerWidth - el.offsetWidth - pad),
      top: Math.min(y, window.innerHeight - el.offsetHeight - pad),
    });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);

  const close = () => dispatch({ type: "menu", menu: null });

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = [...ref.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
    els[next]?.focus();
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
        {items.map((it) => (
          <Fragment key={it.label}>
            {it.separated && <div className="sep" role="separator" />}
            <button
              type="button"
              role="menuitem"
              className={it.danger ? "danger" : undefined}
              disabled={it.disabled}
              onClick={() => {
                close();
                dispatch(it.action);
              }}
            >
              {it.label}
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** 패널 상단바 우클릭 메뉴, 깨진 링크 클릭 메뉴 */
export function PanelMenu({
  menu,
  state,
  dispatch,
}: {
  menu: NonNullable<State["menu"]>;
  state: State;
  dispatch: Dispatch<Action>;
}) {
  if (menu.kind === "broken") {
    const { parent, n } = menu;
    return (
      <Dropdown
        x={menu.x}
        y={menu.y}
        dispatch={dispatch}
        items={[
          { label: t().menu.makeNote, action: { type: "fixBroken", parent, n } },
          { label: t().menu.remove, action: { type: "removeBroken", parent, n }, danger: true, separated: true },
        ]}
      />
    );
  }
  const id = menu.id;
  const desc = descendants(state.tree, id);
  const items: Item[] = [
    { label: t().menu.expandAll, action: { type: "expandAll", id }, disabled: desc.length === 0 },
    { label: t().menu.collapseAll, action: { type: "collapseAll", id }, disabled: !desc.some((k) => state.open.has(k)) },
    { label: t().menu.deleteNote, action: { type: "delete", id }, danger: true, separated: true },
  ];
  return <Dropdown x={menu.x} y={menu.y} items={items} dispatch={dispatch} />;
}
