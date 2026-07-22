'use client';

// SF-Symbols-style stroke icons — monochrome, inherit currentColor
const paths: Record<string, React.ReactNode> = {
  overview: (
    <>
      <rect x="3" y="12" width="4.5" height="9" rx="1.5" />
      <rect x="9.75" y="7" width="4.5" height="14" rx="1.5" />
      <rect x="16.5" y="3" width="4.5" height="18" rx="1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  box: (
    <>
      <path d="M21 8.5v9a1.5 1.5 0 0 1-.85 1.35l-7.5 3.6a1.5 1.5 0 0 1-1.3 0l-7.5-3.6A1.5 1.5 0 0 1 3 17.5v-9a1.5 1.5 0 0 1 .85-1.35l7.5-3.6a1.5 1.5 0 0 1 1.3 0l7.5 3.6A1.5 1.5 0 0 1 21 8.5Z" />
      <path d="M3.3 7.6 12 11.8l8.7-4.2M12 11.8V22" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 5.6M18.6 15.4c1.6.8 2.6 2.3 2.9 4.6" />
    </>
  ),
  chat: (
    <>
      <path d="M21 11.5c0 4.4-4 8-9 8-1 0-2-.15-2.9-.42L4 20.5l1.3-3.9C4.5 15.2 4 13.4 4 11.5c0-4.4 4-8 8.5-8S21 7.1 21 11.5Z" />
    </>
  ),
  kanban: (
    <>
      <rect x="3" y="3" width="5.5" height="18" rx="1.5" />
      <rect x="9.25" y="3" width="5.5" height="12" rx="1.5" />
      <rect x="15.5" y="3" width="5.5" height="8" rx="1.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5Z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20M8 7.5h8M8 11h5" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17.5 9.5 11l4 4L21 7" />
      <path d="M15.5 7H21v5.5" />
    </>
  ),
  swap: (
    <>
      <path d="M7 4 3.5 7.5 7 11" />
      <path d="M3.5 7.5H17a3.5 3.5 0 0 1 3.5 3.5" />
      <path d="M17 20l3.5-3.5L17 13" />
      <path d="M20.5 16.5H7A3.5 3.5 0 0 1 3.5 13" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.7 2.7L16.5 9" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  menu: (
    <path d="M4 7h16M4 12h16M4 17h10" />
  ),
  logout: (
    <>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 4c-9 0-15 4.5-15 11.5 0 2.5 1.5 4.5 4 4.5C16 20 20 12 20 4Z" />
      <path d="M5.5 19.5C8 14 12 9.5 17 7" />
    </>
  ),
  send: (
    <path d="m4 12 16-8-4.5 16-4-6.5L4 12Zm7.5 1.5L20 4" />
  ),
  plus: (
    <path d="M12 5v14M5 12h14" />
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.45 1 1.15 1.1 1.9l.1.8h4.8l.1-.8c.1-.75.5-1.45 1.1-1.9A6 6 0 0 0 12 3Z" />
    </>
  ),
  calendarCheck: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="m9 15.5 2 2 4-4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.8-3.8" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.5 22 20H2L12 3.5Z" />
      <path d="M12 9.5v4.5M12 17.2v.3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12h2.5M19 12h2.5M4.2 19.8l1.8-1.8M18 6l1.8-1.8" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  clipboard: (
    <>
      <rect x="6" y="4.5" width="12" height="17" rx="2.5" />
      <path d="M9 4.5a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 4.5v1.2a.8.8 0 0 1-.8.8H9.8a.8.8 0 0 1-.8-.8Z" />
      <path d="m8.8 12.2 1.7 1.7 3.2-3.4" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 10 4.2a6.5 6.5 0 0 0 10 10.3Z" />,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, strokeWidth = 1.7, className = '' }: { name: string; size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name] ?? null}
    </svg>
  );
}

// Pangea brand mark — glossy 3D squircle with a lime→emerald gradient and a
// centered glass bookmark. Matches the app icon / favicon.
let logoSeq = 0;
export function LogoMark({ size = 40 }: { size?: number }) {
  const u = 'lm' + (logoSeq++);
  const bm = 'M44 38 Q44 34 48 34 H72 Q76 34 76 38 V86.5 Q76 89 73.6 87.5 L60 79 L46.4 87.5 Q44 89 44 86.5 Z';
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-label="Pangea" className="flex-shrink-0">
      <defs>
        <linearGradient id={`${u}g`} x1="34" y1="8" x2="86" y2="112" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EEFFB4" /><stop offset="0.38" stopColor="#C8F542" />
          <stop offset="0.72" stopColor="#79D06B" /><stop offset="1" stopColor="#2FA968" />
        </linearGradient>
        <linearGradient id={`${u}m`} x1="60" y1="34" x2="60" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" /><stop offset="1" stopColor="#EDF3F6" />
        </linearGradient>
        <linearGradient id={`${u}s`} x1="44" y1="34" x2="70" y2="82" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.9" /><stop offset="0.5" stopColor="#ffffff" stopOpacity="0.16" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${u}t`} cx="50" cy="20" r="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.5" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${u}c`}><rect x="10" y="10" width="100" height="100" rx="27" /></clipPath>
        <clipPath id={`${u}mc`}><path d={bm} /></clipPath>
        <filter id={`${u}ms`} x="-40%" y="-40%" width="180%" height="200%">
          <feDropShadow dx="0" dy="2.4" stdDeviation="2.2" floodColor="#0c2b16" floodOpacity="0.3" />
        </filter>
      </defs>
      <rect x="10" y="10" width="100" height="100" rx="27" fill="#17181B" />
      <rect x="10" y="10" width="100" height="100" rx="27" fill={`url(#${u}g)`} />
      <g clipPath={`url(#${u}c)`}>
        <rect x="10" y="10" width="100" height="100" fill={`url(#${u}t)`} />
        <rect x="10.8" y="10.8" width="98.4" height="98.4" rx="26.3" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.1" />
      </g>
      <g filter={`url(#${u}ms)`}>
        <path d={bm} fill={`url(#${u}m)`} fillOpacity="0.96" />
        <g clipPath={`url(#${u}mc)`}>
          <path d="M44 34 H64 L50 62 V90 H44 Z" fill={`url(#${u}s)`} />
          <rect x="40" y="34" width="40" height="13" fill="#ffffff" fillOpacity="0.55" />
        </g>
        <path d="M49 35.4 H71" stroke="#ffffff" strokeOpacity="0.95" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}
