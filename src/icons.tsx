import type { ReactNode } from "react";

// Minimal 24×24 stroke icon set (no emoji, no external icon fonts).
function I({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconList = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M8.5 6h12M8.5 12h12M8.5 18h12" />
    <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </I>
);

export const IconTag = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M4 4h7.6a1 1 0 0 1 .7.3l8.4 8.4a1 1 0 0 1 0 1.4l-6.6 6.6a1 1 0 0 1-1.4 0L4.3 12.3a1 1 0 0 1-.3-.7V4z" />
    <path d="M8.3 8.3h.01" />
  </I>
);

export const IconRoute = ({ size }: { size?: number }) => (
  <I size={size}>
    <circle cx="6" cy="19" r="2.5" />
    <circle cx="18" cy="5" r="2.5" />
    <path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5" />
  </I>
);

export const IconBell = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M6.2 8.5a5.8 5.8 0 0 1 11.6 0c0 6 2.2 7.5 2.2 7.5H4s2.2-1.5 2.2-7.5z" />
    <path d="M10.4 20a1.8 1.8 0 0 0 3.2 0" />
  </I>
);

export const IconSliders = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M4 8h8.5M17.5 8H20M4 16h2.5M11.5 16H20" />
    <circle cx="15" cy="8" r="2.2" />
    <circle cx="9" cy="16" r="2.2" />
  </I>
);

export const IconMic = ({ size }: { size?: number }) => (
  <I size={size}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </I>
);

export const IconX = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M6 6l12 12M18 6L6 18" />
  </I>
);

export const IconStar = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5z" />
  </I>
);

export const IconTrash = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M4.5 7h15M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7" />
    <path d="M6.5 7l.8 12a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9l.8-12" />
    <path d="M10 11v5.5M14 11v5.5" />
  </I>
);

export const IconDownload = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M12 3v11M8 10.5l4 4 4-4M4.5 20.5h15" />
  </I>
);

export const IconUpload = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M12 14V3M8 6.5l4-4 4 4M4.5 20.5h15" />
  </I>
);

export const IconPin = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </I>
);

export const IconPot = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M4 10h16v4a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-4z" />
    <path d="M20 11.5h1.5a1.5 1.5 0 0 1 0 3H20M4 11.5H2.5a1.5 1.5 0 0 0 0 3H4" />
    <path d="M9 6.5c0-1 1-1.5 1-2.5M14 6.5c0-1 1-1.5 1-2.5" />
  </I>
);

export const IconTrend = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M3.5 20.5h17" />
    <path d="M6 17l4.5-5 3.5 3 5-7" />
    <path d="M15.5 8.5H19v3.5" />
  </I>
);

export const IconSync = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M20 11a8 8 0 0 0-13.7-5.3L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 13.7 5.3L20 16" />
    <path d="M20 20v-4h-4" />
  </I>
);

export const IconBack = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M14.5 5.5L8 12l6.5 6.5" />
  </I>
);
