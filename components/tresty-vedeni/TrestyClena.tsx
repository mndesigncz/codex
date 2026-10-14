'use client';

// Sekce „Tresty" v profilu člena (kolo 10, balík V): tento měsíc „2 · −30 b", poslední
// tři tresty s chipem stavu a akcemi (sporný: Trest platí dál / Zrušit; platný „···")
// a „Dát trest" s předvyplněným člověkem. Jen s tresty.zobrazit_tym — bez něj by server
// vrátil tresty diváka, ne člověka z profilu; proto přísná brána (načteno && má).
// Okna jdou nad profil (vlastní okno Modal lg), proto `nadOkny`.

import React, { useState } from 'react';
import { souhrnTrestu, urlTresty } from '@/lib/tresty';
import { useT } from '@/lib/i18n/client';
import { pragueToday } from '@/lib/pragueTime';
import { Button, Chip, Skeleton } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { useOpravneni } from '../role/useOpravneni';
import { useTresty } from './data';
import { DatTrest } from './DatTrest';
import { TrestRadek } from './TrestRadek';
import { useAkceTrestu } from './AkceTrestu';

export function TrestyClena({ clovek, onZmena }: { clovek: { id: number; jmeno: string }; onZmena?: () => void }) {
  const t = useT('widgety');
  const money = useMoney();
  const { nacteno, ma } = useOpravneni();
  const smiTym = nacteno && ma('tresty.zobrazit_tym');
  const smiUdelit = nacteno && ma('tresty.udelit');
  const mesic = pragueToday().slice(0, 7);
  const data = useTresty(smiTym ? urlTresty({ scope: 'team', userId: clovek.id }) : null);
  const [davam, setDavam] = useState(false);
  const akce = useAkceTrestu({ nadOkny: true, onZmena });
  if (!smiTym) return null;
  const items = data.data?.items ?? [];
  const s = souhrnTrestu(items, mesic);
  const posledni = items.slice(0, 3);
  return (
    <section aria-labelledby="profil-tresty" data-tresty-clena>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="profil-tresty" className="t-label">{t('Tresty')}</h3>
        {smiUdelit && <Button variant="secondary" size="sm" icon="warning" onClick={() => setDavam(true)}>{t('Dát trest')}</Button>}
      </div>
      {data.error ? (
        <p className="note note-wait text-sm">{data.error}</p>
      ) : data.loading ? (
        <Skeleton className="h-12" />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" data-tresty-clena-souhrn>
            <Chip tone="muted" size="sm">{t('Tento měsíc: {n}', { n: s.pocet })}</Chip>
            {s.body > 0 && <Chip tone="muted" size="sm">{t('−{n} b', { n: s.body })}</Chip>}
            {s.kraceni > 0 && <Chip tone="muted" size="sm">{t('krácení {castka}', { castka: money(s.kraceni) })}</Chip>}
            {s.sporu > 0 && <Chip tone="wait" size="sm">{t('Nesouhlasí: {n}', { n: s.sporu })}</Chip>}
          </div>
          {posledni.length === 0 ? (
            <p className="t-meta mt-2">{t('Žádné tresty za poslední tři měsíce.')}</p>
          ) : (
            <ul className="list mt-1">
              {posledni.map(x => (
                <TrestRadek key={x.id} x={x} bezJmena smiUdelit={smiUdelit} pracuji={akce.pracuji === x.id}
                  onPlatiDal={akce.platiDal} onZrusit={akce.zrusit} onUpravit={akce.upravit} />
              ))}
            </ul>
          )}
        </>
      )}
      <DatTrest open={davam} nadOkny predvolby={{ userId: clovek.id, jmeno: clovek.jmeno }} onClose={() => setDavam(false)} onUlozeno={() => onZmena?.()} />
      {akce.okna}
    </section>
  );
}

export default TrestyClena;
