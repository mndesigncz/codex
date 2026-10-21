'use client';

// Karta podniku hosta (koncept B, 10a): plná barva značky podniku, logo v bílém čtverci, JEDNO
// hlavní číslo (razítka X / N, nebo body), stav „Připraveno“ v limetce a jedna věta, co dál.
// Tatáž komponenta je živý náhled karty ve správě (Věrnost) — SPRÁVA ji importuje odsud,
// takže co podnik nastaví, to host uvidí. Čistě prezentační: žádná data, žádné fetch.
//
// Čitelnost na barvě značky hlídá onAccent (lib/floorplan): text je inkoust nebo bílá podle
// skutečného kontrastu. Bez barvy podniku je karta grafitová (ne limetková — limetka patří
// jen hlavní akci a stavu „připraveno“).

import Link from 'next/link';
import { onAccent } from '@/lib/floorplan';
import { Icon } from '../../Icons';

export const BARVA_BEZ_ZNACKY = '#2B2F33';

/** Barva karty a písma na ní. */
export function barvyKarty(accent?: string | null): { bg: string; ink: string } {
  const bg = /^#[0-9a-fA-F]{6}$/.test(String(accent ?? '').trim()) ? String(accent).trim() : BARVA_BEZ_ZNACKY;
  return { bg, ink: onAccent(bg) };
}

export function stylKarty(accent?: string | null): React.CSSProperties {
  const { bg, ink } = barvyKarty(accent);
  return { ['--k-bg' as any]: bg, ['--k-ink' as any]: ink };
}

/** Logo podniku v bílém čtverci; bez loga první písmeno názvu v barvě podniku. */
export function LogoPodniku({ nazev, logoUrl, velikost = 36, barva, className = '' }: { nazev: string; logoUrl?: string | null; velikost?: number; /** Plná barva podniku (mimo kartu: seznamy, poukaz). */ barva?: string | null; className?: string }) {
  const pismeno = (String(nazev || '').trim()[0] ?? '·').toUpperCase();
  const plna = barva !== undefined && !logoUrl ? barvyKarty(barva) : null;
  return (
    <span className={`h-logo ${className}`} style={{ width: velikost, height: velikost, borderRadius: Math.round(velikost * 0.28), fontSize: Math.round(velikost * 0.42), ...(plna ? { background: plna.bg, color: plna.ink } : {}) }} aria-hidden>
      {logoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
        : pismeno}
    </span>
  );
}

export interface PrahBodu { at: number; nazev: string }

export interface KartaPodnikuProps {
  nazev: string;
  logoUrl?: string | null;
  /** Barva značky podniku (#RRGGBB). */
  barva?: string | null;
  /** Druhý řádek hlavičky („razítka · Stříbrný host“). */
  podtitul?: string;
  /** Hlavní číslo karty. */
  cislo: string | number;
  /** Za číslem menším písmem („/ 8 razítek“, „b.“). */
  jednotka?: string;
  /** Text štítku „Připraveno“ (odměna k uplatnění); nic = bez štítku. */
  pripraveno?: string | null;
  /** Jedna věta pod číslem („Ještě 2 kávy a další je od nás.“). */
  veta?: string;
  /** Lišta bodů s prahy odměn (body místo razítek). */
  prahy?: { body: number; prahy: PrahBodu[]; popisHotovo?: string } | null;
  /** Mini QR vpravo nahoře (karta na domově). */
  qr?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  /** Celá věta pro odečítač (jinak název + číslo + věta). */
  ariaLabel?: string;
  className?: string;
  children?: React.ReactNode;
}

export default function KartaPodniku(p: KartaPodnikuProps) {
  const obsah = (
    <>
      <div className="flex items-start gap-3 min-w-0">
        <LogoPodniku nazev={p.nazev} logoUrl={p.logoUrl} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] truncate">{p.nazev}</p>
          {p.podtitul && <p className="h-karta-tlume text-[13px] leading-snug mt-0.5 truncate">{p.podtitul}</p>}
        </div>
        {p.pripraveno && <span className="h-pripraveno shrink-0"><Icon name="check" size={13} strokeWidth={2.2} />{p.pripraveno}</span>}
        {!p.pripraveno && p.qr && <span className="shrink-0">{p.qr}</span>}
      </div>
      <p className="mt-4 flex items-baseline gap-1.5 min-w-0">
        <span className="text-[2.125rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{p.cislo}</span>
        {p.jednotka && <span className="h-karta-tlume text-[15px] font-medium truncate">{p.jednotka}</span>}
      </p>
      {p.prahy && p.prahy.prahy.length > 0 && <LisaBodu body={p.prahy.body} prahy={p.prahy.prahy} />}
      {p.veta && <p className="h-karta-tlume mt-2.5 text-[13px] leading-snug text-pretty">{p.veta}</p>}
      {p.children}
    </>
  );
  const cls = `h-karta block ${p.className ?? ''}`;
  const styl = stylKarty(p.barva);
  if (p.href) return <Link href={p.href} className={`${cls} active:scale-[0.99] transition`} style={styl} aria-label={p.ariaLabel}>{obsah}</Link>;
  if (p.onClick) return <button type="button" onClick={p.onClick} className={`${cls} w-full text-left active:scale-[0.99] transition`} style={styl} aria-label={p.ariaLabel}>{obsah}</button>;
  return <section className={cls} style={styl} aria-label={p.ariaLabel}>{obsah}</section>;
}

/** Lišta bodů s ryskami prahů odměn; popisky prahů pod ní (zkrácené, ať se vejdou na 390). */
function LisaBodu({ body, prahy }: { body: number; prahy: PrahBodu[] }) {
  const max = Math.max(...prahy.map(x => x.at), 1);
  const podil = Math.max(0, Math.min(1, body / max));
  return (
    <div className="mt-3" aria-hidden>
      <div className="relative h-2 rounded-full h-karta-linka">
        <span className="absolute inset-y-0 left-0 rounded-full h-karta-plna" style={{ width: `${podil * 100}%` }} />
        {prahy.map(x => (
          <span key={x.at} className="absolute -top-1 h-4 w-0.5 rounded-full h-karta-plna opacity-70" style={{ left: `calc(${(x.at / max) * 100}% - 1px)` }} />
        ))}
      </div>
      <div className="mt-2 grid gap-2 text-[11px] leading-tight h-karta-tlume" style={{ gridTemplateColumns: `repeat(${prahy.length}, minmax(0, 1fr))` }}>
        {prahy.map((x, i) => (
          <span key={x.at} className={`truncate tabular-nums ${i === prahy.length - 1 ? 'text-right' : i === 0 ? '' : 'text-center'}`}>
            {x.at} {x.nazev}{body >= x.at ? ' ✓' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
