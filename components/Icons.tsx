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

// Pangea brand mark — charcoal squircle with an iridescent lime "supercontinent"
// globe and a small spark, echoing the reference app-icon vibe.
export function LogoMark({ size = 40 }: { size?: number }) {
  const r = Math.round(size * 0.28);
  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 shadow-[0_4px_14px_rgba(20,24,10,0.28)]"
      style={{ width: size, height: size, background: '#16181A', borderRadius: r }}
      aria-label="Pangea"
    >
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 32 32" fill="none">
        <defs>
          <linearGradient id="pangeaG" x1="4" y1="6" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#DFFF8A" />
            <stop offset="0.45" stopColor="#C8F542" />
            <stop offset="1" stopColor="#8FD9C4" />
          </linearGradient>
        </defs>
        {/* globe */}
        <circle cx="15" cy="17" r="10.5" fill="url(#pangeaG)" />
        {/* abstract landmass carved out in charcoal */}
        <path
          d="M9 13.5c2.2-.6 3.3.8 5 .6 1.6-.2 2.1-1.8 3.9-1.5 1.7.3 2 1.9 3.7 2.2M8.5 19c1.9.2 2.6-1 4.2-.7 1.8.3 1.9 2.1 3.7 2.1 1.5 0 2.2-1.1 3.9-.8"
          stroke="#16181A" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.85"
        />
        {/* spark */}
        <path d="M25 7.5c.15 1.6.7 2.1 2.3 2.3-1.6.15-2.15.7-2.3 2.3-.15-1.6-.7-2.15-2.3-2.3 1.6-.2 2.15-.7 2.3-2.3Z" fill="#fff" />
      </svg>
    </span>
  );
}
