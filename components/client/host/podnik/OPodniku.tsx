'use client';

// „O podniku“ (směr A): popis podniku a seznam na skle — adresa s Navigovat, telefon,
// otevírací doba jako tabulka (dnešek tučně, stejné dny za sebou sloučené) a „Mám poukaz
// nebo kód“, který rozbalí ověření poukazu přímo v řádku.

import { useState } from 'react';
import { Icon } from '../../../Icons';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDenVTydnu } from '@/lib/i18n/format';
import { dayKey } from '@/lib/clientSlots';
import { NadpisSekce, Seznam } from '../../penezenka';
import MamPoukaz from '../../MamPoukaz';
import { mapaOdkaz, telOdkaz } from './util';

function Hodiny({ hours, today }: { hours: any; today: string }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const dnes = Number(dayKey(today));
  const txt = (i: number) => {
    const day = hours?.[String(i)];
    return !day ? t('neuvedeno') : day.closed || !day.open ? t('zavřeno') : `${day.open}–${day.close}`;
  };
  // Sloučit po sobě jdoucí dny se stejnou dobou; dnešek vždy zvlášť.
  const radky: { od: number; do: number; txt: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const x = txt(i); const posl = radky[radky.length - 1];
    if (posl && posl.txt === x && i !== dnes && posl.do !== dnes) posl.do = i;
    else radky.push({ od: i, do: i, txt: x });
  }
  const den = (i: number) => { const x = fmtDenVTydnu(i, { jazyk }); return x.charAt(0).toLocaleUpperCase(jazyk) + x.slice(1); };
  return (
    <table className="hpp-hodiny">
      <tbody>
        {radky.map(r => {
          const jeDnes = r.od === dnes && r.do === dnes;
          return (
            <tr key={r.od} className={jeDnes ? 'hpp-dnes' : ''}>
              <th scope="row">{r.od === r.do ? den(r.od) : `${den(r.od)}–${den(r.do)}`}{jeDnes ? ` · ${t('dnes')}` : ''}</th>
              <td>{r.txt}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function OPodniku({ b, today, signedIn, poukazOtevreny = false, galerie = false, jenGalerie = false }: {
  b: any; today: string; signedIn: boolean; poukazOtevreny?: boolean; galerie?: boolean;
  /** Jen fotky (počítač: zbytek O podniku je ve sloupci vlevo pod kartou). */
  jenGalerie?: boolean;
}) {
  const t = useT('klient-host');
  const [poukaz, setPoukaz] = useState(poukazOtevreny);
  const mapa = mapaOdkaz(b.name, b.address);
  const tel = telOdkaz(b.phone);
  const fotky: string[] = galerie ? (b.gallery ?? []) : [];
  if (jenGalerie) {
    if (!fotky.length) return null;
    return (
      <section aria-labelledby="h-fotky" className="scroll-mt-24">
        <NadpisSekce id="h-fotky" titulek={t('Fotky z podniku')} />
        <ul aria-label={t('Fotky z podniku')} className="flex gap-2.5 overflow-x-auto scrollbar-thin snap-x">
          {fotky.slice(0, 8).map((g, i) => (
            <li key={g} className={`shrink-0 snap-start rounded-[22px] overflow-hidden ${i === 0 ? 'w-64 aspect-[4/3]' : 'w-40 aspect-square'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g} alt="" loading="lazy" className="h-full w-full object-cover" />
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section aria-labelledby="h-info" className="scroll-mt-24" id="o-podniku">
      <NadpisSekce id="h-info" titulek={t('O podniku')} />
      {fotky.length > 0 && (
        <ul aria-label={t('Fotky z podniku')} className="-mx-5 md:mx-0 mb-4 flex gap-2.5 overflow-x-auto px-5 md:px-0 scrollbar-thin snap-x">
          {fotky.slice(0, 8).map((g, i) => (
            <li key={g} className={`shrink-0 snap-start rounded-[22px] overflow-hidden ${i === 0 ? 'w-64 aspect-[4/3]' : 'w-40 aspect-square'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g} alt="" loading="lazy" className="h-full w-full object-cover" />
            </li>
          ))}
        </ul>
      )}
      {b.description && <p className="hp-text mb-3.5 text-pretty">{b.description}</p>}
      <Seznam>
        {b.address && (
          <li>
            <div className="hp-radek">
              <span className="hp-jamka" aria-hidden><Icon name="location" size={18} strokeWidth={1.6} /></span>
              <span className="hp-radek-telo"><span className="hp-silny block">{b.address}</span>{b.tagline && <span className="hp-meta block mt-0.5">{b.tagline}</span>}</span>
              {mapa && <a href={mapa} target="_blank" rel="noopener noreferrer" className="shrink-0 tap-target hp-meta !font-semibold !text-[var(--hp-fg)]">{t('Navigovat')}</a>}
            </div>
          </li>
        )}
        {tel && (
          <li>
            <a href={tel} className="hp-radek">
              <span className="hp-jamka" aria-hidden><Icon name="phone" size={18} strokeWidth={1.6} /></span>
              <span className="hp-radek-telo"><span className="hp-silny hp-num block">{b.phone}</span><span className="hp-meta block mt-0.5">{t('Zavolat')}</span></span>
              <span className="hp-sipka" aria-hidden><Icon name="chevronRight" size={18} strokeWidth={1.6} /></span>
            </a>
          </li>
        )}
        <li>
          <div className="hp-radek !items-start">
            <span className="hp-jamka" aria-hidden><Icon name="clock" size={18} strokeWidth={1.6} /></span>
            <div className="hp-radek-telo"><p className="hp-silny">{t('Otevírací doba')}</p><Hodiny hours={b.hours} today={today} /></div>
          </div>
        </li>
        <li>
          <button type="button" className="hp-radek" aria-expanded={poukaz} aria-controls="poukaz-podniku" onClick={() => setPoukaz(x => !x)}>
            <span className="hp-jamka" aria-hidden><Icon name="tag" size={18} strokeWidth={1.6} /></span>
            <span className="hp-radek-telo"><span className="hp-silny block">{t('Mám poukaz nebo kód')}</span><span className="hp-meta block mt-0.5">{t('Ověříme zůstatek a platnost')}</span></span>
            <span className={`hp-sipka transition-transform ${poukaz ? 'rotate-90' : ''}`} aria-hidden><Icon name="chevronRight" size={18} strokeWidth={1.6} /></span>
          </button>
          {poukaz && (
            <div id="poukaz-podniku" className="px-4 pb-4">
              <MamPoukaz slug={b.slug} prihlasen={signedIn} />
            </div>
          )}
        </li>
      </Seznam>
    </section>
  );
}
