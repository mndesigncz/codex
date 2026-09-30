'use client';

import { useState } from 'react';

// Zákaznický portál Stripe z obrazovky pozastaveného podniku. Pozastavení
// vypíná aplikaci, ne fakturaci: kdo má běžící předplatné, musí ho umět
// zrušit nebo opravit kartu, jinak mu Stripe dál účtuje a jediná cesta je
// psát podpoře.
export default function SpravovatPredplatneButton() {
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const otevri = async () => {
    setBusy(true); setChyba('');
    try {
      const r = await fetch('/api/billing/portal', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) { setChyba(d?.error || 'Portál se nepodařilo otevřít.'); setBusy(false); return; }
      window.location.href = d.url;
    } catch {
      setChyba('Nepodařilo se spojit se serverem.'); setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={otevri} disabled={busy}>
        {busy ? 'Otevírám…' : 'Spravovat předplatné'}
      </button>
      {chyba && <p role="alert" className="note note-danger w-full text-sm">{chyba}</p>}
    </>
  );
}
