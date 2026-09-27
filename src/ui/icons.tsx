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

export const IconArrowRight = () => (
  <Svg width={1.7}>
    <path d="M2.5 8h10.5M9.5 4.5 13 8l-3.5 3.5" />
  </Svg>
);

export const IconArrowLeft = () => (
  <Svg width={1.7}>
    <path d="M13.5 8H3M6.5 4.5 3 8l3.5 3.5" />
  </Svg>
);

export const IconBroken = () => (
  <Svg width={1.7}>
    <path d="M2.5 8h3M10 8h3M10.5 5l2.5 3-2.5 3M6.5 11l2.5-6" />
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

export const IconGear = () => (
  <Svg width={1.5}>
    <circle cx="8" cy="8" r="2.3" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
  </Svg>
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
