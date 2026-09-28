import type { BackupInfo } from "../storage/backend";

// 저장소와 관련해 화면이 알아야 하는 것(설정 창의 데이터 폴더 등)과, React 밖에서 알림을 띄우는 통로.

export interface Session {
  kind: "tauri" | "browser" | "sample";
  dataDir: string;
  /** 데이터 폴더를 바꾼다. 앱이 새로 뜬다. Tauri에서만 된다. */
  changeDataDir?: (dir: string) => Promise<void>;
  /** 초기화 직전: 지금 노트를 저장하고 backups/reset에 한 벌 남긴다 */
  beforeReset?: () => Promise<void>;
  /** 백업 목록과 되돌리기. Tauri에서만 된다. 되돌리면 앱이 새로 뜬다. */
  listBackups?: () => Promise<BackupInfo[]>;
  restoreBackup?: (id: string) => Promise<void>;
}

export const TOAST_EVENT = "nodt:toast";

/** React 밖(저장 실패 등)에서 오류 알림을 띄운다. 닫을 때까지 남는다. */
export function showToast(message: string) {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message }));
}
