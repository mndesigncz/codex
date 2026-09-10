'use client';

import React from 'react';

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
  // Tužka a koš — dosud to byly znaky ✎ a ✕ ve stejné řadě jako kreslené
  // ikony. Jeden tah, jedna sada, jeden dojem.
  pencil: (
    <>
      <path d="M4 20.5h4L19.5 9a2.6 2.6 0 0 0-3.7-3.7L4.5 16.5z" />
      <path d="M14.5 6.5 18 10" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7.5 7.4 19a1.7 1.7 0 0 0 1.7 1.5h5.8a1.7 1.7 0 0 0 1.7-1.5L17.5 7.5" />
      <path d="M10.5 11v6M13.5 11v6" />
    </>
  ),
  close: (
    <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
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
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="5.5" ry="3" />
      <path d="M3.5 7v5c0 1.66 2.46 3 5.5 3s5.5-1.34 5.5-3V7" />
      <path d="M3.5 12v5c0 1.66 2.46 3 5.5 3s5.5-1.34 5.5-3v-5" />
      <path d="M17.5 9.5c1.8.4 3 1.3 3 2.5v5c0 1.4-1.8 2.6-4.2 2.9" />
    </>
  ),
  receipt: (
    <>
      <path d="M6.5 3h11v17.5l-2.2-1.6-2.05 1.6L11.2 18.9l-2.05 1.6L6.5 18.9V3Z" />
      <path d="M9.5 8h5M9.5 11.5h3.5" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.3l1.4-2h6.6l1.4 2H19a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V8.5Z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 13.5 7 21l5-2.5L17 21l-1.5-7.5" />
    </>
  ),
  // ---- Kreslené náhrady za emoji. Emoji vypadá na každém telefonu jinak a
  // v systému ikon s jednou tloušťkou linky působí jako cizí těleso. ----
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.47 1.2h8.9a1.5 1.5 0 0 0 1.45-1.1L21 8H6" />
      <circle cx="9.5" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" />
    </>
  ),
  download: <path d="M12 4v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  upload: <path d="M12 15V4m0 0 4 4m-4-4-4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <rect x="7" y="14" width="10" height="6" rx="1.5" />
    </>
  ),
  pin: <path d="M12 21v-6m-4-4 1.3-6.5h5.4L16 11a4 4 0 0 1 2 3H6a4 4 0 0 1 2-3Z" />,
  location: (
    <>
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  gift: (
    <>
      <path d="M4 11h16v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20v-9ZM3 7.5h18V11H3z M12 7.5v14" />
      <path d="M12 7.5c-1.2-2.4-3.6-3.8-5-2.5s0 2.5 5 2.5Zm0 0c1.2-2.4 3.6-3.8 5-2.5s0 2.5-5 2.5Z" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8L12 3.5Z" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m3.5 7.5 8.5 6 8.5-6" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="3" />
      <path d="M3 10h18M7 14.5h4" />
    </>
  ),
  chart: <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c.9-3.6 3.8-5.5 7.5-5.5s6.6 1.9 7.5 5.5" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.5V5a1.5 1.5 0 0 1 1.5-1.5h7.5l8 8-9 9-8-8Z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8.5v.5" />
    </>
  ),
  refresh: <path d="M20 12a8 8 0 0 1-14.4 4.8M4 12a8 8 0 0 1 14.4-4.8M18 4v4h-4M6 20v-4h4" />,
  external: <path d="M14 4h6v6m0-6-9 9M19 14v5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V7a1.5 1.5 0 0 1 1.5-1.5H10" />,
  inbox: <path d="M4 13V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V13m-16 0v4.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V13m-16 0h4.5l1.5 2.5h4L16 13H20" />,
  handover: <path d="M4 8h12l-3-3m7 11H8l3 3" />,
  archive: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1.5" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
    </>
  ),
  fire: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3 2-5.3 3.4-7 .3 1.4 1.1 2.4 2.1 2.9-.3-2.9.9-5.4 3.2-7.2-.2 2.3.7 3.6 2 5 1.5 1.6 2.3 3.4 2.3 5.5C18.5 18.4 15.9 21 12 21Z" />,
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12.5 20 3.5m-3 3 2.5 2.5M14.5 9l2.5 2.5" />
    </>
  ),
  cup: (
    <>
      <path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M6 4.5c0 1 1 1 1 2s-1 1-1 2M10 4.5c0 1 1 1 1 2s-1 1-1 2" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l11-2v12" />
      <circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" />
    </>
  ),
  tent: <path d="M3 20h18M12 4 3 20M12 4l9 16M12 4v16M8.5 20 12 13l3.5 7" />,
};

export type IconName = keyof typeof paths;

/** Motion an icon can carry. Used sparingly — an icon moves to say something
 *  ("this is now active", "there's something new", "this finished"), never for
 *  decoration. */
export type IconMotion = 'draw' | 'pop' | 'ring' | 'pulse' | 'lead';

/** Every shape gets pathLength="1", so one CSS rule draws any icon regardless
 *  of how long its real outline happens to be. */
function normalized(node: React.ReactNode): React.ReactNode {
  return React.Children.map(node, (child) => {
    if (!React.isValidElement(child)) return child;
    const el = child as React.ReactElement<any>;
    const kids = el.props?.children ? normalized(el.props.children) : el.props?.children;
    return React.cloneElement(el, { pathLength: 1, ...(kids ? { children: kids } : {}) });
  });
}

export function Icon({ name, size = 22, strokeWidth = 1.7, className = '', motion, title }: {
  name: string; size?: number; strokeWidth?: number; className?: string;
  motion?: IconMotion; title?: string;
}) {
  const body = paths[name] ?? null;
  const motionCls = motion ? ` i-${motion}` : '';
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
      className={className + motionCls}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
    >
      {title ? <title>{title}</title> : null}
      {motion === 'draw' ? normalized(body) : body}
    </svg>
  );
}

// Managero brand mark — glossy 3D squircle with a lime→emerald gradient and a
// centered glass bookmark. Matches the app icon / favicon.
let logoSeq = 0;
export function LogoMark({ size = 40 }: { size?: number }) {
  const u = 'lm' + (logoSeq++);
  const bm = 'M44 38 Q44 34 48 34 H72 Q76 34 76 38 V86.5 Q76 89 73.6 87.5 L60 79 L46.4 87.5 Q44 89 44 86.5 Z';
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-label="Managero" className="flex-shrink-0">
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
