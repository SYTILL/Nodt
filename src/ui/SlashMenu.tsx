import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { slashStore } from "../editor/slash";

/** `/` 명령 메뉴. 커서 바로 아래에 뜬다. 키보드는 에디터 쪽(editor/slash.ts)이 받는다. */
export function SlashMenu() {
  const view = useSyncExternalStore(slashStore.subscribe, slashStore.get);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!view?.rect || !ref.current) return;
    const el = ref.current;
    const pad = 8;
    let top = view.rect.bottom + 4;
    // 아래가 모자라면 커서 위로 띄운다
    if (top + el.offsetHeight > window.innerHeight - pad) top = view.rect.top - el.offsetHeight - 4;
    setPos({ left: Math.min(view.rect.left, window.innerWidth - el.offsetWidth - pad), top });
  }, [view]);

  if (!view) return null;
  return (
    <div className="cmenu slash" ref={ref} role="listbox" style={pos}>
      {view.items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          role="option"
          aria-selected={i === view.index}
          className={(i === view.index ? "on" : "") + (it.danger ? " danger" : "")}
          // 에디터 초점을 빼앗지 않는다
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => slashStore.pick(i)}
        >
          <span>{it.label}</span>
          {it.hint && <span className="hint">{it.hint}</span>}
        </button>
      ))}
    </div>
  );
}
