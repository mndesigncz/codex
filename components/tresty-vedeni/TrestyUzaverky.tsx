'use client';

// Tresty v detailu uzávěrky (kolo 10, balík V):
//  - sekce „Tresty na směně": tresty svázané s uzávěrkou nebo ze dne uzávěrky u lidí
//    z její osádky (trestyKUzaverce, GET scope=team&day=), s akcemi jako ve widgetu;
//    prázdno = tichý řádek, bez tresty.zobrazit_tym se nekreslí nic;
//  - `TrestTlacitko`: tlačítko „Dát trest" s oknem a předvolbami pro místa mimo seznamy
//    trestů — manko v detailu uzávěrky, výtka v hodnocení směny. Jen s tresty.udelit.
// Okna jdou nad vlastní překryv detailu (z-80), proto `nadOkny`.

import React, { useState } from 'react';
import { trestyKUzaverce, urlTresty } from '@/lib/tresty';
import { useT } from '@/lib/i18n/client';
import { Button, Skeleton } from '../ui';
import { useOpravneni } from '../role/useOpravneni';
import { useTresty } from './data';
import { DatTrest } from './DatTrest';
import { TrestRadek } from './TrestRadek';
import { useAkceTrestu } from './AkceTrestu';
import type { PredvolbyTrestu } from './logika';

export function TrestyUzaverky({ uzaverka, onZmena }: {
  uzaverka: { id: number; day: string; lide: readonly number[] };
  onZmena?: () => void;
}) {
  const t = useT('widgety');
  const { nacteno, ma } = useOpravneni();
  const smiTym = nacteno && ma('tresty.zobrazit_tym');
  const smiUdelit = nacteno && ma('tresty.udelit');
  const data = useTresty(smiTym && uzaverka.day ? urlTresty({ scope: 'team', day: uzaverka.day }) : null);
  const akce = useAkceTrestu({ nadOkny: true, onZmena });
  if (!smiTym) return null;
  const tresty = data.data ? trestyKUzaverce(data.data.items, uzaverka) : [];
  return (
    <section className="pt-5" data-tresty-uzaverky>
      <h3 className="t-label mb-2.5">{t('Tresty na směně')}</h3>
      {data.error ? (
        <p className="note note-wait text-sm">{data.error}</p>
      ) : data.loading ? (
        <Skeleton className="h-10" />
      ) : tresty.length === 0 ? (
        <p className="text-sm text-black/45">{t('Na téhle směně nikdo trest nedostal.')}</p>
      ) : (
        <ul className="list">
          {tresty.map(x => (
            <TrestRadek key={x.id} x={x} smiUdelit={smiUdelit} pracuji={akce.pracuji === x.id}
              onPlatiDal={akce.platiDal} onZrusit={akce.zrusit} onUpravit={akce.upravit} />
          ))}
        </ul>
      )}
      {akce.okna}
    </section>
  );
}

/**
 * Tlačítko „Dát trest" s předvyplněným oknem (manko, výtka). Bez tresty.udelit se nekreslí.
 * S `vyrizeno` (den a klíč návrhu) zmizí, když za totéž už platný trest je — server by druhý
 * odmítl („Za tohle už trest je."). Čte stejnou adresu jako sekce Tresty na směně (jedna mezipaměť).
 */
export function TrestTlacitko({ predvolby, popisek, nadOkny = true, onUlozeno, vyrizeno, className = '' }: {
  /** Předvolby se čtou až při klepnutí (návrh klíče výtky se mohl mezitím dohledat). */
  predvolby: PredvolbyTrestu | (() => PredvolbyTrestu);
  popisek?: string;
  nadOkny?: boolean;
  onUlozeno?: () => void;
  vyrizeno?: { day: string; sourceKey: string };
  className?: string;
}) {
  const t = useT('widgety');
  const { nacteno, ma } = useOpravneni();
  const [okno, setOkno] = useState<PredvolbyTrestu | null>(null);
  const smi = nacteno && ma('tresty.udelit');
  const dne = useTresty(smi && vyrizeno && ma('tresty.zobrazit_tym') ? urlTresty({ scope: 'team', day: vyrizeno.day }) : null);
  const uzJe = !!vyrizeno && (dne.data?.items ?? []).some(x => x.sourceKey === vyrizeno.sourceKey && x.status === 'plati');
  if (!smi) return null;
  // Okno zůstává připojené i po udělení (tlačítko zmizí): drží toast „Trest udělen".
  return (
    <>
      {!uzJe && (
        <Button variant="secondary" size="sm" icon="warning" className={`tap-target ${className}`}
          onClick={() => setOkno(typeof predvolby === 'function' ? predvolby() : predvolby)}>{popisek ?? t('Dát trest')}</Button>
      )}
      <DatTrest open={!!okno} predvolby={okno} nadOkny={nadOkny} onClose={() => setOkno(null)} onUlozeno={() => onUlozeno?.()} />
    </>
  );
}

export default TrestyUzaverky;
