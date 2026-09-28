import type { Dispatch } from "react";
import type { NoteId } from "../model/notes";
import type { Action, State } from "../state/store";

/** 에디터 한 개가 앱과 주고받는 것. 에디터 확장들은 만들어질 때 한 번 받으므로 늘 최신 값을 돌려주는 함수로 넘긴다. */
export interface EditorApi {
  noteId: NoteId;
  getState(): State;
  /** 애니메이션 없이 바로 */
  raw: Dispatch<Action>;
  /** fn 안의 변화를 한 번의 애니메이션으로 묶는다 */
  animate(fn: () => void): void;
  focusTitle(): void;
}

export type GetApi = () => EditorApi;
