'use client';

// Věrnost → Kupony a poukazy (kolo 92): co host uplatní a co drží v ruce.
//  - Kupony a kódy: kupony se slevou, X+Y, za body, promo kódy na leták (dřív Věrnost → Kupony a kódy);
//  - Dárkové poukazy: peněžní hodnota, zůstatky, uplatnění po částech (dřív Věrnost → Poukazy);
//  - Plastové karty: dávky k tisku, přiřazení u kasy, blokace (dřív samostatná záložka Kartičky).
// Každá část jen s vlastním klíčem, jako dřív.

import { useEffect, useState } from 'react';
import { PageHeader, Segmented } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import Kupony from '../loyalty/Kupony';
import Poukazy from '../Poukazy';
import KartickySprava from '../KartickySprava';

export type CastKuponu = 'kupony' | 'poukazy' | 'karty';
const CASTI: { id: CastKuponu; label: string; klice: readonly string[]; popis: string }[] = [
  { id: 'kupony', label: 'Kupony a kódy', klice: ['kupony.spravovat', 'kupony.uplatnit'], popis: 'Kupony, které si host vezme nebo dostane, a promo kódy na leták nebo účtenku.' },
  { id: 'poukazy', label: 'Dárkové poukazy', klice: ['poukazy.zobrazit', 'poukazy.uplatnit'], popis: 'Poukazy s hodnotou v penězích. Uplatňují se po částech u kasy.' },
  { id: 'karty', label: 'Plastové karty', klice: ['vernost.zobrazit'], popis: 'Karty pro hosty bez aplikace. Vytiskni dávku a u kasy kartu přiřaď hostovi.' },
];

export default function KuponyAPoukazy({ oznam, promos, otevriCast }: {
  oznam: (text: string, ton?: 'ok' | 'bad') => void;
  promos: React.ReactNode;
  otevriCast: { id: CastKuponu; n: number } | null;
}) {
  const { ma } = useOpravneni();
  const casti = CASTI.filter(c => ma(c.klice));
  const [volba, setVolba] = useState<CastKuponu>(otevriCast?.id ?? 'kupony');
  useEffect(() => { if (otevriCast) setVolba(otevriCast.id); }, [otevriCast]);
  const cast = casti.find(c => c.id === volba) ?? casti[0] ?? null;
  return (
    <div className="px-4 min-[360px]:px-5 pt-3 pb-4 sm:p-6 space-y-5">
      <PageHeader hintId="clientadmin-kupony" title="Kupony a poukazy" subtitle={cast?.popis} />
      {casti.length > 1 && cast && (
        <Segmented options={casti.map(c => ({ id: c.id, label: c.label }))} value={cast.id} onChange={setVolba} ariaLabel="Části kuponů a poukazů" />
      )}
      {cast?.id === 'kupony' && <div className="space-y-4"><Kupony toast={t => oznam(t)} />{promos}</div>}
      {cast?.id === 'poukazy' && <Poukazy toast={t => oznam(t)} />}
      {cast?.id === 'karty' && <KartickySprava oznam={oznam} vlozene />}
    </div>
  );
}
