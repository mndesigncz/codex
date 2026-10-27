'use client';

// Věrnost → Kupony a poukazy (kolo 92): co host uplatní a co drží v ruce.
//  - Kupony a kódy: kupony se slevou, X+Y, za body, promo kódy na leták (dřív Věrnost → Kupony a kódy);
//  - Dárkové poukazy: peněžní hodnota, zůstatky, uplatnění po částech (dřív Věrnost → Poukazy);
//  - Plastové karty: dávky k tisku, přiřazení u kasy, blokace (dřív samostatná záložka Kartičky).
// Každá část jen s vlastním klíčem, jako dřív.

import { useEffect, useState } from 'react';
import { PageHeader, Segmented } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import Kupony from '../loyalty/Kupony';
import Poukazy from '../Poukazy';
import KartickySprava from '../KartickySprava';

export type CastKuponu = 'kupony' | 'poukazy' | 'karty';
const CASTI: { id: CastKuponu; label: string; klice: readonly string[]; popis: string }[] = [
  { id: 'kupony', label: 'Kupony a kódy', klice: ['kupony.spravovat', 'kupony.uplatnit'], popis: 'Kupony, které si host vezme nebo dostane, a promo kódy na leták nebo účtenku.' }, // i18n-ok: překlad v textyCasti
  { id: 'poukazy', label: 'Dárkové poukazy', klice: ['poukazy.zobrazit', 'poukazy.uplatnit'], popis: 'Poukazy s hodnotou v penězích. Uplatňují se po částech u kasy.' }, // i18n-ok
  { id: 'karty', label: 'Plastové karty', klice: ['vernost.zobrazit'], popis: 'Karty pro hosty bez aplikace. Vytiskni dávku a u kasy kartu přiřaď hostovi.' }, // i18n-ok
];
function textyCasti(t: PrekladFn, id: CastKuponu): { label: string; popis: string } {
  if (id === 'kupony') return { label: t('Kupony a kódy'), popis: t('Kupony, které si host vezme nebo dostane, a promo kódy na leták nebo účtenku.') };
  if (id === 'poukazy') return { label: t('Dárkové poukazy'), popis: t('Poukazy s hodnotou v penězích. Uplatňují se po částech u kasy.') };
  return { label: t('Plastové karty'), popis: t('Karty pro hosty bez aplikace. Vytiskni dávku a u kasy kartu přiřaď hostovi.') };
}

export default function KuponyAPoukazy({ oznam, promos, otevriCast }: {
  oznam: (text: string, ton?: 'ok' | 'bad') => void;
  promos: React.ReactNode;
  otevriCast: { id: CastKuponu; n: number } | null;
}) {
  const { ma } = useOpravneni();
  const t = useT('sprava');
  const casti = CASTI.filter(c => ma(c.klice));
  const [volba, setVolba] = useState<CastKuponu>(otevriCast?.id ?? 'kupony');
  useEffect(() => { if (otevriCast) setVolba(otevriCast.id); }, [otevriCast]);
  const cast = casti.find(c => c.id === volba) ?? casti[0] ?? null;
  return (
    <div className="px-4 min-[360px]:px-5 pt-3 pb-4 sm:p-6 space-y-5">
      <PageHeader hintId="clientadmin-kupony" title={t('Kupony a poukazy')} subtitle={cast ? textyCasti(t, cast.id).popis : undefined} />
      {casti.length > 1 && cast && (
        <Segmented options={casti.map(c => ({ id: c.id, label: textyCasti(t, c.id).label }))} value={cast.id} onChange={setVolba} ariaLabel={t('Části kuponů a poukazů')} />
      )}
      {cast?.id === 'kupony' && <div className="space-y-4"><Kupony toast={x => oznam(x)} />{promos}</div>}
      {cast?.id === 'poukazy' && <Poukazy toast={x => oznam(x)} />}
      {cast?.id === 'karty' && <KartickySprava oznam={oznam} vlozene />}
    </div>
  );
}
