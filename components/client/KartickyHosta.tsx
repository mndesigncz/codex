'use client';

// Plastové karty hosta (Moje → pod kartičkou): které plastové karty od podniků má host
// připojené a formulář „Mám plastovou kartu“. Host opíše kód z karty; nová karta se mu
// přiřadí, karta, kterou dostal u kasy bez aplikace, se převezme i s body a razítky.
// Server: /api/client/cards/moje (lib/kartyFyzickeDb.ts, pripojKartu).

import { useCallback, useEffect, useState } from 'react';
import { Button, Input } from '../ui';
import { okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';

interface Karta { id: number; kod: string; podnik: string }

const formatuj = (raw: string) => { const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c; };

export default function KartickyHosta() {
  const t = useT('klient-host');
  const [karty, setKarty] = useState<Karta[]>([]);
  const [otevreno, setOtevreno] = useState(false);
  const [kod, setKod] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hotovo, setHotovo] = useState('');

  const nacti = useCallback(() => {
    fetch('/api/client/cards/moje').then(okJson).then(x => setKarty(Array.isArray(x?.karty) ? x.karty : [])).catch(() => setKarty([]));
  }, []);
  useEffect(() => { nacti(); }, [nacti]);
  useEffect(() => { if (hotovo) { const id = setTimeout(() => setHotovo(''), 6000); return () => clearTimeout(id); } }, [hotovo]);

  const pripoj = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kod.replace(/[^A-Z0-9]/g, '').length !== 8) { setErr(t('Kód karty má osm znaků, třeba ABCD-EFGH.')); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/client/cards/moje', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kod }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(typeof x.error === 'string' && x.error ? t(x.error) : t('Kartu se teď nepodařilo připojit. Zkus to za chvíli.')); setBusy(false); return; }
      if (Array.isArray(x.karty)) setKarty(x.karty);
      setHotovo(x.stav === 'prevzata' ? t('Karta je připojená a body z ní jsou teď na tvém účtu.')
        : x.stav === 'uz_tvoje' ? t('Tahle karta už je tvoje.')
        : t('Karta je připojená. U kasy teď funguje stejně jako karta v aplikaci.'));
      setKod(''); setOtevreno(false);
    } catch { setErr(t('Kartu se teď nepodařilo připojit. Zkus to za chvíli.')); }
    setBusy(false);
  };

  return (
    <section aria-labelledby="h-plastove" className="space-y-3" data-testid="plastove-karty">
      {karty.length > 0 && (
        <div className="card p-4 sm:p-5">
          <h2 id="h-plastove" className="t-card">{t('Plastové karty')}</h2>
          <p className="t-meta mt-0.5">{t('U kasy fungují stejně jako karta v aplikaci.')}</p>
          <ul className="list mt-2">
            {karty.map(k => (
              <li key={k.id} className="list-row">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-[15px] leading-snug truncate">{k.podnik}</span>
                  <span className="block font-mono text-[13px] tracking-wider text-black/60">{k.kod}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {karty.length === 0 && <h2 id="h-plastove" className="sr-only">{t('Plastové karty')}</h2>}

      {!otevreno ? (
        <Button variant="secondary" icon="card" className="w-full" aria-expanded={false} onClick={() => { setOtevreno(true); setErr(''); }}>{t('Mám plastovou kartu')}</Button>
      ) : (
        <form onSubmit={pripoj} className="card p-4 sm:p-5 space-y-3 max-w-xl" noValidate>
          <div>
            <label htmlFor="pk-kod" className="field-label">{t('Kód z plastové karty')}</label>
            <Input id="pk-kod" value={kod} onChange={e => setKod(formatuj(e.target.value))} placeholder="ABCD-EFGH" autoComplete="off" autoCapitalize="characters"
              spellCheck={false} inputMode="text" maxLength={9} className="font-mono tracking-[0.2em] uppercase" aria-describedby="pk-napoveda" />
            <p id="pk-napoveda" className="t-meta mt-1 text-pretty">{t('Kód je na kartě vedle QR. Body a razítka, které jsi na kartu nasbíral, se připíšou na tvůj účet.')}</p>
          </div>
          {err && <p role="alert" className="note note-danger text-sm">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" loading={busy} className="w-full sm:w-auto justify-center">{t('Připojit kartu')}</Button>
            <Button type="button" variant="ghost" onClick={() => { setOtevreno(false); setErr(''); setKod(''); }} className="w-full sm:w-auto justify-center">{t('Zrušit')}</Button>
          </div>
        </form>
      )}
      {hotovo && <p role="status" className="note note-ok text-sm">{hotovo}</p>}
    </section>
  );
}
