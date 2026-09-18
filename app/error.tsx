'use client';

// Když něco spadne za běhu.
//
// Bez tohohle souboru ukazoval Next.js vlastní anglickou obrazovku s tím,
// že došlo k chybě — tedy přesně to, co aplikace jinde nedělá: mluvila
// cizím jazykem a nenabídla nic než obnovení stránky rukou.
//
// Dvě věci, na kterých tu záleží. Zaprvé tlačítko, které to zkusí znovu:
// `reset()` znovu vykreslí tu část stránky, která spadla, bez ztráty
// zbytku. Zadruhé poctivost — chyba se nezamlčí, ale technický detail
// patří pod rozklikávátko, ne do první věty.

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Do konzole patří celá chyba; na obrazovku jen to, co člověku pomůže.
    console.error('[chyba stránky]', error);
  }, [error]);

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-8 text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-[#E4572E]/10 text-[#B23A15] grid place-items-center">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 9v4" /><path d="M12 17h.01" />
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </div>
        <h1 className="t-page mt-5">Tady se něco pokazilo</h1>
        <p className="t-meta mt-2.5 text-pretty">
          Data jsou v pořádku — spadlo vykreslení téhle stránky. Zkus to znovu;
          když to bude opakovat, dej vědět a pošli s tím kód níž.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <button type="button" onClick={reset} className="btn btn-accent">Zkusit znovu</button>
          <a href="/" className="btn btn-secondary">Na úvod</a>
        </div>
        {error.digest && (
          <details className="mt-6 text-left">
            <summary className="text-[11px] uppercase tracking-wider text-black/35 cursor-pointer select-none">
              Technický detail
            </summary>
            <p className="mt-2 text-[11px] text-black/45 font-mono break-all">{error.digest}</p>
          </details>
        )}
      </div>
    </main>
  );
}
