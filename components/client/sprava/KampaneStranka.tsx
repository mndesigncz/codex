'use client';

// Kampaně (kolo 92): všechno, čím podnik hostům sám něco řekne, na jednom místě.
//  - Zprávy: nová kampaň ve třech krocích (Komu · Co · Kontrola) s živým počtem publika
//    a výsledky odeslaných z reálných dat (kolik příjemců přišlo do 7 dní, srovnání s týdnem předtím).
//  - Automatizace: hotové recepty (uvítání, narozeniny, „Chybíš nám"…), všechny vypnuté, dokud je
//    podnik nezapne (Martinovo pravidlo).
//  - Bannery: obrázek nebo akce na stránce podniku — kanál kampaně, dřív schovaný ve Vzhledu.
// Dřív: Zákazníci → Zprávy členům, Zákazníci → Automatizace, Vzhled → Bannery.

import { useEffect, useState } from 'react';
import { Button, PageHeader, Segmented } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import type { Hlaska } from '../import/typy';
import Automatizace from '../loyalty/Automatizace';
import BanneryEditor from '../loyalty/BanneryEditor';
import { uploadImage } from '../BrandTab';
import Kampane from './Kampane';

export type CastKampani = 'zpravy' | 'automatizace' | 'bannery';
export const CASTI_KAMPANI: { id: CastKampani; label: string; klic: string }[] = [
  { id: 'zpravy', label: 'Zprávy', klic: 'zakaznici.zpravy' },
  { id: 'automatizace', label: 'Automatizace', klic: 'zakaznici.zpravy' },
  { id: 'bannery', label: 'Bannery', klic: 'klient.vzhled' },
];

const POPIS: Record<CastKampani, string> = {
  zpravy: 'Novinka nebo nabídka pro vybrané hosty. Výsledek měříme návštěvami, ne otevřením.',
  automatizace: 'Zprávy, které odejdou samy. Všechny jsou vypnuté, dokud je nezapneš.',
  bannery: 'Obrázek nebo akce nahoře na stránce podniku.',
};

// Náhled banneru je v paletě Managera (barva značky podniku na stránce hosta jen na dlaždici loga),
// takže editor nepotřebuje profil podniku.
function Bannery({ oznam }: { oznam: Hlaska }) {
  return <BanneryEditor toast={t => oznam(t)} upload={uploadImage} />;
}

export default function KampaneStranka({ oznam, castKampani }: { oznam: Hlaska; castKampani: { id: CastKampani; n: number } | null }) {
  const { ma } = useOpravneni();
  const casti = CASTI_KAMPANI.filter(c => ma(c.klic));
  const [volba, setVolba] = useState<CastKampani>(castKampani?.id ?? 'zpravy');
  useEffect(() => { if (castKampani) setVolba(castKampani.id); }, [castKampani]);
  const cast = casti.find(c => c.id === volba) ?? casti[0] ?? null;
  // „Nová kampaň" je hlavní akce stránky jen na Zprávách; průvodce se otevírá v okně.
  const [nova, setNova] = useState(0);
  return (
    <div className="px-4 min-[360px]:px-5 pt-3 pb-4 sm:p-6 space-y-5">
      <PageHeader hintId="clientadmin-kampane" title="Kampaně" subtitle={cast ? POPIS[cast.id] : undefined}
        primary={cast?.id === 'zpravy' ? <Button variant="accent" icon="plus" onClick={() => setNova(n => n + 1)}>Nová kampaň</Button> : undefined} />
      {casti.length > 1 && cast && (
        <Segmented options={casti.map(c => ({ id: c.id, label: c.label }))} value={cast.id} onChange={setVolba} ariaLabel="Části kampaní" />
      )}
      {cast?.id === 'zpravy' && <Kampane oznam={oznam} otevritNovou={nova} />}
      {cast?.id === 'automatizace' && <Automatizace oznam={oznam} />}
      {cast?.id === 'bannery' && <Bannery oznam={oznam} />}
    </div>
  );
}
