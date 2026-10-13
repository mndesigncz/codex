'use client';

// Sekce „Navíc na směně" v detailu uzávěrky (kolo 9, balík V): zápisy svázané
// s uzávěrkou nebo ze dne uzávěrky od lidí z její osádky (zapisyKUzaverce), s inline
// Uznat / Odmítnout. Prázdno = tichý řádek. Bez navic.zobrazit_tym se nekreslí nic.
// Okno rozhodnutí jde nad vlastní překryv detailu (z-80), proto `nadOkny`.

import React, { useState } from 'react';
import { urlNavic, zapisyKUzaverce, type Navic } from '@/lib/navic';
import { useT } from '@/lib/i18n/client';
import { Skeleton, Toast } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { useOpravneni } from '../role/useOpravneni';
import { useNavic } from './data';
import { NavicRadek, textOdmeny } from './NavicRadek';
import { UznatNavic, type AkceNavic } from './UznatNavic';

export function NavicUzaverky({ uzaverka, onZmena }: {
  uzaverka: { id: number; day: string; lide: readonly number[] };
  onZmena?: () => void;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const { nacteno, ma } = useOpravneni();
  const smiTym = nacteno && ma('navic.zobrazit_tym');
  const smiUznat = nacteno && ma('navic.uznat');
  const data = useNavic(smiTym && uzaverka.day ? urlNavic({ scope: 'team', day: uzaverka.day }) : null);
  const [rozhoduji, setRozhoduji] = useState<{ z: Navic; akce: AkceNavic } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  if (!smiTym) return null;
  const zapisy = data.data ? zapisyKUzaverce(data.data.items, uzaverka) : [];
  return (
    <section className="pt-5" data-navic-uzaverky>
      <h3 className="t-label mb-2.5">{t('Navíc na směně')}</h3>
      {data.error ? (
        <p className="note note-wait text-sm">{data.error}</p>
      ) : data.loading ? (
        <Skeleton className="h-10" />
      ) : zapisy.length === 0 ? (
        <p className="text-sm text-black/45">{t('Nikdo nic navíc nezapsal.')}</p>
      ) : (
        <ul className="list">
          {zapisy.map(z => (
            <NavicRadek key={z.id} z={z} smiUznat={smiUznat}
              onUznat={x => setRozhoduji({ z: x, akce: 'uznat' })} onOdmitnout={x => setRozhoduji({ z: x, akce: 'odmitnout' })} />
          ))}
        </ul>
      )}
      {rozhoduji && (
        <UznatNavic zapis={rozhoduji.z} akce={rozhoduji.akce} nadOkny onClose={() => setRozhoduji(null)}
          onHotovo={(item, akce) => { setToast(akce === 'uznat' ? t('Uznáno: {odmena}', { odmena: textOdmeny(t, item, money) }) : t('Odmítnuto.')); onZmena?.(); }} />
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </section>
  );
}

export default NavicUzaverky;
