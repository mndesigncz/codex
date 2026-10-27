'use client';

// Karta podniku hosta (koncept B, 10a; barvy v paletě Managera 2026-10-27): bílá karta s linkou,
// dlaždice loga, JEDNO hlavní číslo (razítka X / N, nebo body), stav „Připraveno“ v limetce
// a jedna věta, co dál. Tatáž komponenta je živý náhled karty ve správě (Věrnost, Stránka
// podniku, čtečka u kasy) — SPRÁVA ji importuje odsud, takže co podnik nastaví, to host uvidí.
// Čistě prezentační: žádná data, žádné fetch.
//
// Barva značky podniku je JEN na dlaždici loga (LogoPodniku) — kartu nevyplňuje. Jediná
// inkoustová plocha domova je Moje karta s QR; karty podniků pod ní jsou střídmé, ať QR zůstane
// nejvýraznější. Čitelnost iniciály na barvě značky hlídá onAccent (lib/floorplan).

import Link from 'next/link';
import { onAccent } from '@/lib/floorplan';
import { Icon } from '../../Icons';

export const BARVA_BEZ_ZNACKY = '#2B2F33';

/** Barva dlaždice loga a písma na ní (bez barvy podniku grafit). */
export function barvyKarty(accent?: string | null): { bg: string; ink: string } {
  const bg = /^#[0-9a-fA-F]{6}$/.test(String(accent ?? '').trim()) ? String(accent).trim() : BARVA_BEZ_ZNACKY;
  return { bg, ink: onAccent(bg) };
}

/** Dlaždice loga — jediné místo, kde má host barvu značky podniku. Logo na bílé; bez loga
 *  první písmeno názvu na barvě podniku (`barva`; null = grafit, bez parametru = inkoust na bílé). */
export function LogoPodniku({ nazev, logoUrl, velikost = 36, barva, className = '' }: { nazev: string; logoUrl?: string | null; velikost?: number; /** Barva značky podniku (#RRGGBB). */ barva?: string | null; className?: string }) {
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
  /** Barva značky podniku (#RRGGBB) — jen na dlaždici loga. */
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
        <LogoPodniku nazev={p.nazev} logoUrl={p.logoUrl} barva={p.barva ?? null} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] truncate">{p.nazev}</p>
          {p.podtitul && <p className="h-karta-tlume text-[13px] leading-snug mt-0.5 truncate">{p.podtitul}</p>}
        </div>
        {p.qr && <span className="shrink-0">{p.qr}</span>}
      </div>
      <div className="mt-4 flex items-end gap-3 min-w-0">
        <p className="flex items-baseline gap-1.5 min-w-0 flex-1">
          <span className="text-[2.125rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{p.cislo}</span>
          {p.jednotka && <span className="h-karta-tlume text-[15px] font-medium truncate">{p.jednotka}</span>}
        </p>
        {p.pripraveno && <span className="h-pripraveno shrink-0"><Icon name="check" size={13} strokeWidth={2.2} />{p.pripraveno}</span>}
      </div>
      {p.prahy && p.prahy.prahy.length > 0 && <LisaBodu body={p.prahy.body} prahy={p.prahy.prahy} />}
      {p.veta && <p className="h-karta-tlume mt-2.5 text-[13px] leading-snug text-pretty">{p.veta}</p>}
      {p.children}
    </>
  );
  const cls = `h-karta block ${p.className ?? ''}`;
  if (p.href) return <Link href={p.href} className={`${cls} active:scale-[0.99] transition`} aria-label={p.ariaLabel}>{obsah}</Link>;
  if (p.onClick) return <button type="button" onClick={p.onClick} className={`${cls} w-full text-left active:scale-[0.99] transition`} aria-label={p.ariaLabel}>{obsah}</button>;
  return <section className={cls} aria-label={p.ariaLabel}>{obsah}</section>;
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
          <span key={x.at} className="absolute -top-1 h-4 w-0.5 rounded-full h-karta-ryska" style={{ left: `calc(${(x.at / max) * 100}% - 1px)` }} />
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
