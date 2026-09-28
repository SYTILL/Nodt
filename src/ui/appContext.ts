import { createContext, useContext, type Dispatch } from "react";
import type { Action, State } from "../state/store";

// 에디터 안(링크 칩, 슬래시 메뉴)에서도 앱 상태와 동작을 쓰기 위한 컨텍스트.

export interface AppApi {
  state: State;
  /** 패널 배치가 바뀌는 동작은 애니메이션으로 감싼다 */
  dispatch: Dispatch<Action>;
  /** 애니메이션 없이 바로 */
  raw: Dispatch<Action>;
  /** fn 안의 변화(여러 dispatch, 에디터 명령)를 한 번의 애니메이션으로 묶는다. fn 안에서는 raw를 쓴다. */
  animate: (fn: () => void) => void;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const api = useContext(AppContext);
  if (!api) throw new Error("AppContext 밖에서 useApp을 불렀다");
  return api;
}
