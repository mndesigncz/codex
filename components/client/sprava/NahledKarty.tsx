'use client';

// Náhled karty hosta ve správě (kolo 92) — DOČASNÁ kopie.
//
// Komponentu karty vlastní HOST (components/client/karta/KartaPodniku.tsx a RazitkaMrizka.tsx na
// větvi client-host). Dokud není ve stejném stromu, kreslí správa tuhle kopii se STEJNÝM rozhraním
// (props KartaPodnikuProps / RazitkaMrizkaProps, jen podmnožina). Správa ji importuje jen odsud:
// po sloučení větví stačí tenhle soubor nahradit dvěma řádky
//   export { default as KartaPodniku } from '../karta/KartaPodniku';
//   export { default as RazitkaMrizka } from '../karta/RazitkaMrizka';
// a náhled ve Věrnosti, ve Vzhledu i ve čtečce bude tatáž karta, jakou vidí host.
//
// Barva podniku jen na kartě (koncept B), čitelnost přes onAccent; bez barvy grafit.

import { onAccent } from '@/lib/floorplan';
import { Icon } from '../../Icons';

const BEZ_ZNACKY = '#2B2F33';
export function barvyKarty(accent?: string | null): { bg: string; ink: string } {
  const bg = /^#[0-9a-fA-F]{6}$/.test(String(accent ?? '').trim()) ? String(accent).trim() : BEZ_ZNACKY;
  return { bg, ink: onAccent(bg) };
}

export function LogoPodniku({ nazev, logoUrl, velikost = 36, barva }: { nazev: string; logoUrl?: string | null; velikost?: number; barva?: string | null }) {
  const pismeno = (String(nazev || '').trim()[0] ?? '·').toUpperCase();
  const { bg } = barvyKarty(barva);
  return (
    <span aria-hidden className="grid place-items-center bg-white font-bold shrink-0 overflow-hidden"
      style={{ width: velikost, height: velikost, borderRadius: Math.round(velikost * 0.28), fontSize: Math.round(velikost * 0.42), color: bg }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" /> : pismeno}
    </span>
  );
}

export interface KartaPodnikuProps {
  nazev: string;
  logoUrl?: string | null;
  barva?: string | null;
  podtitul?: string;
  cislo: string | number;
  jednotka?: string;
  pripraveno?: string | null;
  veta?: string;
  ariaLabel?: string;
  className?: string;
  children?: React.ReactNode;
}

export function KartaPodniku(p: KartaPodnikuProps) {
  const { bg, ink } = barvyKarty(p.barva);
  const tlume = { color: `color-mix(in srgb, ${ink} 74%, transparent)` };
  return (
    <section className={`relative overflow-hidden rounded-[var(--r-lg)] p-4 sm:p-5 ${p.className ?? ''}`} style={{ background: bg, color: ink }} aria-label={p.ariaLabel}>
      <div className="flex items-start gap-3 min-w-0">
        <LogoPodniku nazev={p.nazev} logoUrl={p.logoUrl} barva={p.barva} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] truncate">{p.nazev}</p>
          {p.podtitul && <p className="text-[13px] leading-snug mt-0.5 truncate" style={tlume}>{p.podtitul}</p>}
        </div>
        {p.pripraveno && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#C8F542] px-2.5 h-7 text-[12px] font-semibold text-[#16181A]">
            <Icon name="check" size={13} />{p.pripraveno}
          </span>
        )}
      </div>
      <p className="mt-4 flex items-baseline gap-1.5 min-w-0">
        <span className="text-[2.125rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{p.cislo}</span>
        {p.jednotka && <span className="text-[15px] font-medium truncate" style={tlume}>{p.jednotka}</span>}
      </p>
      {p.veta && <p className="mt-2.5 text-[13px] leading-snug text-pretty" style={tlume}>{p.veta}</p>}
      {p.children}
    </section>
  );
}

export interface RazitkaMrizkaProps { pocet: number; cil: number; popis: string; sloupcu?: number; barva?: string | null; noveOd?: number | null }

/** Razítka jako kolečka na barvě podniku: plné s fajfkou, prázdné čárkované, poslední = odměna (limetkový obrys). */
export function RazitkaMrizka({ pocet, cil, popis, sloupcu, barva, noveOd = null }: RazitkaMrizkaProps) {
  const { ink } = barvyKarty(barva);
  const n = Math.max(1, Math.min(cil, 20));
  const plnych = Math.max(0, Math.min(pocet, n));
  const cols = sloupcu ?? (n <= 6 ? n : n <= 10 ? 5 : 6);
  return (
    <div role="img" aria-label={popis} className="grid gap-2 mt-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 3rem))` }}>
      {Array.from({ length: n }).map((_, i) => {
        const plne = i < plnych;
        const odmena = i === n - 1;
        const nove = noveOd != null && plne && i >= noveOd;
        return (
          <span key={i} className={`aspect-square rounded-full grid place-items-center ${nove ? 'ring-2 ring-[#C8F542]' : ''}`}
            style={plne
              ? { background: ink, color: barvyKarty(barva).bg }
              : { border: `1.5px ${odmena ? 'solid' : 'dashed'} ${odmena ? '#C8F542' : `color-mix(in srgb, ${ink} 45%, transparent)`}`, color: odmena ? '#C8F542' : ink }}>
            {plne ? <Icon name="check" size={13} /> : odmena ? <Icon name="gift" size={15} /> : null}
          </span>
        );
      })}
    </div>
  );
}

/** Rám telefonu kolem náhledu (Věrnost, Vzhled): jen tvar, ne skutečné zařízení. */
export function RamTelefonu({ children, popisek }: { children: React.ReactNode; popisek?: string }) {
  return (
    <div className="mx-auto w-full max-w-[19rem] rounded-[2.25rem] bg-[#16181A] p-2.5 shadow-[shadow:var(--shadow-float)]" role="group" aria-label={popisek ?? 'Náhled v telefonu hosta'}>
      <div className="rounded-[1.75rem] bg-[#F6F7F3] overflow-hidden min-h-[30rem] text-[#16181A]">{children}</div>
    </div>
  );
}
