'use client';

import { useEffect, useRef } from 'react';
import type { ModalGuard } from '@/lib/useModal';

// Otázka místo tichého zahození.
//
// Zavřít okno uklepnutím — Escapem nebo kliknutím vedle — je nejčastější
// omyl, jaký v aplikaci jde udělat, a do téhle chvíle byl neodvolatelný:
// rozepsané oznámení pro celý tým nebo směrnice na půl stránky zmizely bez
// jediného slova. `useModal` takové zavření zastaví a `asking` přepne na
// true; tahle vrstva se ptá.
//
// Není to nové okno, jen vrstva: druhý dialog by měl vlastní zámek posuvu,
// vlastní past na fokus a vlastní Escape — a ten Escape by zavřel to pod
// ním, tedy přesně to, co se tu snažíme neztratit. Proto je otázka jen
// překryv, vykreslený uvnitř panelu, ale posazený `fixed`: panely oken se
// uvnitř posouvají, takže vrstva ukotvená k panelu by u odrolovaného
// formuláře zůstala kdesi nahoře mimo obraz.
export function DiscardGuard({ guard, what = 'Co jsi rozepsal, se neuloží.' }: {
  guard: ModalGuard;
  /** Čeho se zahození týká, jednou větou. */
  what?: string;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  const { asking, keep } = guard;

  // Fokus na bezpečnou volbu. Kdo se sem dostal omylem, zmáčkne mezerník
  // nebo Enter a vrátí se k rozepsanému — ne ho zahodí.
  useEffect(() => {
    if (!asking) return;
    const t = setTimeout(() => backRef.current?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(t);
  }, [asking]);

  if (!asking) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 discard-guard modal-overlay">
      <div role="alertdialog" aria-label="Zahodit rozepsané?" aria-modal={false}
        className="modal-sheet w-full max-w-[19rem] rounded-3xl p-5 text-center">
        <p className="t-card">Zahodit rozepsané?</p>
        <p className="t-meta mt-1 text-pretty">{what}</p>
        <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2">
          <button type="button" onClick={guard.discard}
            className="btn btn-ghost flex-1 text-[color:var(--bad)]">Zahodit</button>
          <button type="button" ref={backRef} onClick={keep}
            className="btn btn-primary flex-1">Zpět k úpravám</button>
        </div>
      </div>
    </div>
  );
}

export default DiscardGuard;
