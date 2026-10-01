'use client';

import Zkusit from '../Zkusit';
import { useT } from '@/lib/i18n/client';
import { LIMITS } from '@/lib/plan';
import { ZAVER, ZDARMA_VETA } from '../obsah';

// Závěrečná výzva: stejné jeviště jako nahoře, jen bez aplikace, ta už byla
// vidět. Velká věta, jedno limetkové tlačítko a pod ním, co to stojí na začátku.
export default function ZaverecneCta() {
  const t = useT('landing');
  return (
    <section className="ld-sekce pb-[var(--ld-rytmus)]" aria-labelledby="nadpis-cta">
      <div className="ld-obsah relative text-center">
        <div className="ld-svetlo !top-[-10%]" aria-hidden />
        <h2 id="nadpis-cta" className="ld-h1 mx-auto max-w-[13em]">{t(ZAVER.nadpis)}</h2>
        <p className="ld-perex mx-auto mt-6 max-w-[42ch]">{t(ZAVER.perex)}</p>
        <div className="mt-10 flex justify-center">
          <Zkusit />
        </div>
        <p className="ld-meta mx-auto mt-5 max-w-[46ch]">{t(ZDARMA_VETA, { n: LIMITS.free.members ?? 0 })}</p>
      </div>
    </section>
  );
}
