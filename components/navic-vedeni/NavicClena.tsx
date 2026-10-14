'use client';

// Sekce „Navíc" v profilu člena (kolo 9, balík V): tento měsíc „3 uznáno · 60 b",
// poslední tři zápisy s chipem; čekající jde uznat nebo odmítnout rovnou odsud
// (stejné okno UznatNavic). Jen s navic.zobrazit_tym — bez něj by server vrátil
// zápisy diváka, ne člověka z profilu; proto přísná brána (načteno && má).

import React, { useState } from 'react';
import { souhrnNavic, urlNavic, type Navic } from '@/lib/navic';
import { useT } from '@/lib/i18n/client';
import { pragueToday } from '@/lib/pragueTime';
import { Button, Chip, Skeleton, Toast } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { useOpravneni } from '../role/useOpravneni';
import { useNavic } from './data';
import { NavicRadek, textOdmeny } from './NavicRadek';
import { UznatNavic, type AkceNavic } from './UznatNavic';
import { ZapsatZaClena } from './ZapsatZaClena';

export function NavicClena({ clovek, onZmena }: { clovek: { id: number; jmeno: string }; onZmena?: () => void }) {
  const t = useT('widgety');
  const money = useMoney();
  const { nacteno, ma } = useOpravneni();
  const smiTym = nacteno && ma('navic.zobrazit_tym');
  const smiUznat = nacteno && ma('navic.uznat');
  const dnes = pragueToday();
  const mesic = dnes.slice(0, 7);
  const data = useNavic(smiTym ? urlNavic({ scope: 'team', userId: clovek.id }) : null);
  const [rozhoduji, setRozhoduji] = useState<{ z: Navic; akce: AkceNavic } | null>(null);
  const [zapisuji, setZapisuji] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  if (!smiTym) return null;
  const items = data.data?.items ?? [];
  const s = souhrnNavic(items, mesic);
  const posledni = items.slice(0, 3);
  const hotovo = (item: Navic, akce: AkceNavic) => {
    setToast(akce === 'uznat' ? t('Uznáno: {odmena}', { odmena: textOdmeny(t, item, money) }) : t('Odmítnuto.'));
    onZmena?.();
  };
  return (
    <section aria-labelledby="profil-navic" data-navic-clena>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="profil-navic" className="t-label">{t('Navíc')}</h3>
        {smiUznat && <Button variant="secondary" size="sm" icon="star" onClick={() => setZapisuji(true)}>{t('Zapsat navíc')}</Button>}
      </div>
      {data.error ? (
        <p className="note note-wait text-sm">{data.error}</p>
      ) : data.loading ? (
        <Skeleton className="h-12" />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="muted" size="sm">{t('Tento měsíc: {n} uznáno', { n: s.uznano })}</Chip>
            {s.body > 0 && <Chip tone="ok" size="sm">{t('{n} b', { n: s.body })}</Chip>}
            {s.premie > 0 && <Chip tone="ok" size="sm">{money(s.premie)}</Chip>}
            {s.ceka > 0 && <Chip tone="wait" size="sm">{t('{n, plural, one {# čeká} few {# čekají} other {# čeká}}', { n: s.ceka })}</Chip>}
          </div>
          {posledni.length === 0 ? (
            <p className="t-meta mt-2">{t('Zatím nic navíc nezapsáno.')}</p>
          ) : (
            <ul className="list mt-1">
              {posledni.map(z => (
                <NavicRadek key={z.id} z={z} bezJmena smiUznat={smiUznat}
                  onUznat={x => setRozhoduji({ z: x, akce: 'uznat' })} onOdmitnout={x => setRozhoduji({ z: x, akce: 'odmitnout' })} />
              ))}
            </ul>
          )}
        </>
      )}
      {rozhoduji && <UznatNavic zapis={rozhoduji.z} akce={rozhoduji.akce} nadOkny onClose={() => setRozhoduji(null)} onHotovo={hotovo} />}
      {zapisuji && (
        <ZapsatZaClena nabidka={data.data?.nabidka ?? []} clovek={clovek} onClose={() => setZapisuji(false)}
          onHotovo={item => { setToast(t('Zapsáno a uznáno: {odmena}', { odmena: textOdmeny(t, item, money) })); onZmena?.(); }} />
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </section>
  );
}

export default NavicClena;
