'use client';

import { useState } from 'react';
import { Segmented } from '@/components/ui';
import { useT } from '@/lib/i18n/client';
import { DNY_DLOUHE, PREDVOLBY_DOBY, dobaZPredvolby, minuty, vychoziDoba, type IdPredvolbyDoby } from '@/lib/pruvodce/predvolby';
import type { Doba as DobaTyp } from '@/lib/pruvodce/typy';
import type { KrokProps } from './spolecne';

// Otevírací doba: předvolba na jedno klepnutí a sedm řádků na doladění.
// Ukládá se přesně tvar PUT /api/opening-hours (klíče "0".."6", 0 = pondělí).
// Zavírání po půlnoci (bar do 02:00) projde: řádek jen upozorní, že konec
// patří dalšímu dni.

export default function Doba({ odp, zmen, chybaPole }: KrokProps) {
  const t = useT('pruvodce');
  const doba: DobaTyp = odp.doba ?? vychoziDoba(odp.typ);
  const [predvolba, setPredvolba] = useState<IdPredvolbyDoby | null>(odp.doba ? null : 'typ');
  // Změna předvolby přehraje řádky (klíč = počet přepnutí), ať je vidět, co se stalo.
  const [verze, setVerze] = useState(0);

  const pouzijPredvolbu = (id: IdPredvolbyDoby) => {
    setPredvolba(id);
    setVerze(v => v + 1);
    zmen({ doba: dobaZPredvolby(id, odp.typ) });
  };
  const zmenDen = (klic: string, patch: Partial<DobaTyp[string]>) => {
    setPredvolba(null);
    zmen({ doba: { ...doba, [klic]: { ...doba[klic], ...patch } } });
  };

  return (
    <div>
      <p className="field-label">{t('Předvolba')}</p>
      <Segmented ariaLabel={t('Předvolba otevírací doby')} size="sm" value={predvolba ?? ('vlastni' as IdPredvolbyDoby)}
        options={[...PREDVOLBY_DOBY.map(p => ({ id: p.id, label: t(p.nazev) })), ...(predvolba === null ? [{ id: 'vlastni' as IdPredvolbyDoby, label: t('Vlastní') }] : [])]}
        onChange={id => { if ((id as string) !== 'vlastni') pouzijPredvolbu(id); }} />
      <p className="t-meta mt-2">{predvolba ? t(PREDVOLBY_DOBY.find(p => p.id === predvolba)?.popis ?? '') : t('Upravené ručně po dnech.')}</p>

      <ul key={verze} className="list stagger mt-4" aria-label={t('Otevírací doba po dnech')}>
        {DNY_DLOUHE.map((den, i) => {
          const klic = String(i);
          const denT = t(den);
          const d = doba[klic];
          const po = minuty(d.close) <= minuty(d.open);
          return (
            <li key={klic} className="list-row flex-wrap !items-center gap-x-3 gap-y-2">
              <span className="min-w-0 flex-1 text-[15px] font-medium text-[#16181A] sm:w-[5.5rem] sm:flex-none">{denT}</span>
              {/* Na telefonu jsou časy na vlastním řádku pod dnem (dvě pole a „až" se vedle názvu dne nevejdou). */}
              <span className={`order-last flex basis-full items-center gap-2 sm:order-none sm:basis-auto sm:flex-1 ${d.closed ? 'opacity-50' : ''}`}>
                <label htmlFor={`pv-od-${i}`} className="sr-only">{t('{den} otevíráme v', { den: denT })}</label>
                <input id={`pv-od-${i}`} type="time" value={d.open} disabled={d.closed} onChange={e => zmenDen(klic, { open: e.target.value })}
                  className="field !h-10 !w-[7.25rem] !px-2.5 text-center text-sm tabular-nums" />
                <span aria-hidden className="text-black/40">{t('až')}</span>
                <label htmlFor={`pv-do-${i}`} className="sr-only">{t('{den} zavíráme v', { den: denT })}</label>
                <input id={`pv-do-${i}`} type="time" value={d.close} disabled={d.closed} onChange={e => zmenDen(klic, { close: e.target.value })}
                  className="field !h-10 !w-[7.25rem] !px-2.5 text-center text-sm tabular-nums" />
              </span>
              <button type="button" aria-pressed={d.closed} onClick={() => zmenDen(klic, { closed: !d.closed })}
                className={`tap-target-sm shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${d.closed ? 'seg-on' : 'seg-off glass'}`}>
                {t('Zavřeno')}<span className="sr-only">: {denT}</span>
              </button>
              {po && !d.closed && <span className="basis-full text-xs text-black/50">{t('Zavíráte po půlnoci, konec patří dalšímu dni.')}</span>}
            </li>
          );
        })}
      </ul>
      {chybaPole?.pole === 'doba' && <p role="alert" className="mt-2 text-xs text-[var(--bad-ink)]">{chybaPole.text}</p>}
    </div>
  );
}
