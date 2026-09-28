import type { ReactNode } from "react";

function Svg({ width, children }: { width: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** 링크 칩(닫힘): 누르면 오른쪽으로 열린다 */
export const IconChevronRight = () => (
  <Svg width={1.8}>
    <path d="M6.5 4 10.5 8l-4 4" />
  </Svg>
);

/** 링크 칩(열림): 누르면 닫힌다 */
export const IconChevronLeft = () => (
  <Svg width={1.8}>
    <path d="M9.5 4 5.5 8l4 4" />
  </Svg>
);

export const IconX = () => (
  <Svg width={1.7}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
);

export const IconMinimize = () => (
  <Svg width={1.7}>
    <path d="M4 8h8" />
  </Svg>
);

export const IconRestore = () => (
  <Svg width={1.5}>
    <rect x="4" y="4" width="8" height="8" rx="1.2" />
  </Svg>
);

// 톱니가 몸통에 붙은 톱니바퀴. 떨어진 막대로 그리면 작은 크기에서 해처럼 보인다.
// 모양은 Lucide 아이콘(ISC 라이선스)의 settings를 따랐다.
export const IconGear = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconHelp = () => (
  <Svg width={1.5}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4" />
    <circle cx="8" cy="11.6" r=".4" fill="currentColor" />
  </Svg>
);

// 프로그램 상단바의 창 버튼. Windows 11처럼 가는 선으로 그린다.
function WinSvg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1} aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconWinMinimize = () => (
  <WinSvg>
    <path d="M0 5.5h10" />
  </WinSvg>
);

export const IconWinMaximize = () => (
  <WinSvg>
    <rect x=".5" y=".5" width="9" height="9" rx="1" />
  </WinSvg>
);

export const IconWinRestore = () => (
  <WinSvg>
    <rect x=".5" y="2.5" width="7" height="7" rx="1" />
    <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
  </WinSvg>
);

export const IconWinClose = () => (
  <WinSvg>
    <path d="M.5.5l9 9M9.5.5l-9 9" />
  </WinSvg>
);
