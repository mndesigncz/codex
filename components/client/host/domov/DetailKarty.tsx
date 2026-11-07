'use client';

// Otevřená karta podniku (směr A, předloha 03): inkoustová karta s koly razítek a šipkou na stránku
// podniku, pod ní věta, kolik zbývá do odměny, a skleněný panel s bílým QR, kódem karty a trojicí
// Body · úroveň a sleva · kolik návštěv do další úrovně. Na telefonu uvnitř okna přes celou obrazovku
// (OtevrenaKarta), na počítači vpravo vedle balíčku. Panel s QR sdílí i „U kasy“.

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../Icons';
import { InkoustovaKarta } from '../../penezenka';
import { useT } from '@/lib/i18n/client';
import type { KartaHosta } from '../model';
import { formatMoney } from '@/lib/money';

type T = (cs: string, p?: any) => string;

/** Bílý QR karty hosta, kód pod ním a věta; volitelně trojice čísel. Skleněný panel `.lgx.hp-sklo`. */
export function PanelKodu({ karta, napoveda, trojice, children, className = '' }: {
  karta: { data: any; chyba: string };
  napoveda: React.ReactNode;
  trojice?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = useT('klient-host');
  const kod: string = karta.data?.code ?? '';
  return (
    <div className={`lgx hp-sklo px-5 pt-[18px] pb-4 text-center ${className}`}>
      <div className="h-qr-pole mx-auto aspect-square w-full max-w-[188px] p-3 shadow-[0_0_0_1px_rgba(22,24,26,0.06)]">
        {karta.data?.svg
          ? <span dangerouslySetInnerHTML={{ __html: karta.data.svg }} className="block h-full w-full" role="img" aria-label={t('QR kód karty {kod}', { kod })} />
          : kod
            ? <p className="hp-kod break-all text-center text-[17px]" style={{ color: '#16181A' }}>{kod}</p>
            : karta.chyba
              ? <p className="px-2 text-center text-[13px]" style={{ color: 'rgba(22,24,26,0.72)' }}>{t('QR se nenačetlo. Řekni obsluze kód níž.')}</p>
              : <span className="block h-full w-full animate-pulse rounded-xl bg-black/[0.06]" aria-hidden />}
      </div>
      <p className="hp-kod mt-3.5 text-[19px] [overflow-wrap:anywhere]" aria-label={kod ? t('Kód karty {kod}', { kod }) : undefined}>{kod || (karta.chyba ? t('Nenačetla se') : ' ')}</p>
      <p className="hp-meta mt-1.5 text-pretty">{napoveda}</p>
      {trojice}
      {children}
    </div>
  );
}

/** Body · úroveň a sleva · kolik zbývá do další úrovně (pod QR otevřené karty). */
export function TrojiceKarty({ k, t }: { k: KartaHosta; t: T }) {
  const u = k.uroven;
  const dalsi = u.zbyva != null && u.dalsi
    ? { hodnota: u.jednotka === 'spend' ? formatMoney(u.zbyva, u.mena) : t('{n, plural, one {# návštěva} few {# návštěvy} other {# návštěv}}', { n: u.zbyva }), popis: t('do další úrovně') }
    : { hodnota: t('Nejvyšší'), popis: t('úroveň') };
  const bunky = [
    { hodnota: `${k.body} ${t('b.')}`, popis: t('Body'), num: true },
    { hodnota: u.nazev, popis: u.sleva > 0 ? t('Sleva {n} %', { n: u.sleva }) : t('Bez slevy'), num: false },
    { hodnota: dalsi.hodnota, popis: dalsi.popis, num: true },
  ];
  return (
    <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-[color:var(--hp-line)] pt-3 text-left">
      {bunky.map((b, i) => (
        <div key={i} className="min-w-0">
          <p className={`hp-silny [overflow-wrap:anywhere] ${b.num ? 'hp-num' : ''}`}>{b.hodnota}</p>
          <p className="hp-meta [overflow-wrap:anywhere]">{b.popis}</p>
        </div>
      ))}
    </div>
  );
}

/** Kolik razítek tu bylo naposledy: když jich přibude (obsluha načetla kód), nová kolečka docvaknou. */
export function useNoveOd(slug: string, pocet: number | null): number | null {
  const pred = useRef<{ slug: string; pocet: number | null }>({ slug, pocet });
  const [noveOd, setNoveOd] = useState<number | null>(null);
  useEffect(() => {
    const p = pred.current;
    if (p.slug !== slug) setNoveOd(null);
    else if (pocet != null && p.pocet != null && pocet > p.pocet) setNoveOd(p.pocet);
    pred.current = { slug, pocet };
  }, [slug, pocet]);
  return noveOd;
}

/** Otevřená karta + věta + panel s QR. `odezva` je řádek živé odezvy (role=status je na něm). */
export default function DetailKarty({ k, karta, hrefPodniku, odezva, dole, idNadpisu }: {
  k: KartaHosta;
  karta: { data: any; chyba: string };
  hrefPodniku: string;
  odezva?: React.ReactNode;
  /** Pod panelem (ukázka načtení). */
  dole?: React.ReactNode;
  idNadpisu?: string;
}) {
  const t = useT('klient-host');
  const noveOd = useNoveOd(k.slug, k.razitka?.pocet ?? null);
  return (
    <div className="min-w-0">
      <h2 id={idNadpisu} className="sr-only">{k.nazev}</h2>
      <InkoustovaKarta varianta="otevrena" nazev={k.nazev} klic={k.klic} logoUrl={k.logoUrl} popis={k.popis}
        vpravo={<span className="shrink-0 text-[color:var(--hp-karta-tlume)]" aria-hidden><Icon name="chevronRight" size={18} strokeWidth={1.6} /></span>}
        cislo={k.cislo} z={k.z} stitek={k.stitekOtevrena}
        razitka={k.razitka ? { ...k.razitka, noveOd } : null} postup={k.postup}
        href={hrefPodniku} ariaLabel={t('{karta}. Stránka podniku', { karta: k.aria || k.nazev })} />
      <div className="mx-0.5 mt-3 mb-3.5 min-h-[20px]" role="status" aria-live="polite">
        {odezva ?? (k.veta ? <p className="hp-silny text-pretty">{k.veta}</p> : null)}
      </div>
      <PanelKodu karta={karta} napoveda={t('Ukaž kód obsluze. Razítko i body se připíšou samy.')} trojice={<TrojiceKarty k={k} t={t} />} />
      {dole}
    </div>
  );
}
