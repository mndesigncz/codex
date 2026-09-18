'use client';

// Poslední záchytná síť: chyba v kořenovém rozvržení, kterou `app/error.tsx`
// už nezachytí, protože spadlo to, co ho obklopuje. Proto si tahle stránka
// kreslí celé `<html>` a `<body>` sama a nespoléhá na nic z aplikace —
// ani na CSS třídy, které se v takové chvíli nemusely načíst.

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="cs">
      <body style={{
        margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center',
        background: '#F1F3ED', color: '#16181A',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        <main style={{ maxWidth: '26rem', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.4rem', margin: '0 0 .5rem', letterSpacing: '-0.01em' }}>
            Aplikace se nenačetla
          </h1>
          <p style={{ color: 'rgba(22,24,26,0.62)', lineHeight: 1.5, margin: '0 0 1.5rem' }}>
            Zkus to znovu. Když se to bude opakovat, pomůže obnovit stránku
            nebo se vrátit na úvod — data to neovlivní.
          </p>
          <button type="button" onClick={reset} style={{
            appearance: 'none', border: 0, cursor: 'pointer',
            background: '#C8F542', color: '#16181A', fontWeight: 700,
            padding: '.75rem 1.5rem', borderRadius: '999px', fontSize: '1rem',
            minHeight: '44px',
          }}>Zkusit znovu</button>
          {error.digest && (
            <p style={{ marginTop: '1.5rem', fontSize: '11px', color: 'rgba(22,24,26,0.45)', fontFamily: 'monospace' }}>
              {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
