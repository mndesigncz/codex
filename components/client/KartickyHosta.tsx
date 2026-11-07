'use client';

// Plastové karty hosta (Moje → pod kartičkou): které plastové karty od podniků má host
// připojené a formulář „Mám plastovou kartu“. Host opíše kód z karty; nová karta se mu
// přiřadí, karta, kterou dostal u kasy bez aplikace, se převezme i s body a razítky.
// Server: /api/client/cards/moje (lib/kartyFyzickeDb.ts, pripojKartu). V ukázce (`demo`) se nic nevolá.

import { useCallback, useEffect, useState } from 'react';
import { NadpisSekce, Seznam, Radek } from './penezenka';
import Pole from './host/ucet/Pole';
import { useJeDemo } from './host/cesty';
import { okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';

interface Karta { id: number; kod: string; podnik: string }

const formatuj = (raw: string) => { const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c; };

export default function KartickyHosta() {
  const t = useT('klient-host');
  const demo = useJeDemo();
  const [karty, setKarty] = useState<Karta[]>([]);
  const [otevreno, setOtevreno] = useState(false);
  const [kod, setKod] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hotovo, setHotovo] = useState('');

  const nacti = useCallback(() => {
    // Ukázka nemá účet ani databázi: seznam zůstane prázdný a nic se nenačítá.
    if (demo) { setKarty([]); return; }
    fetch('/api/client/cards/moje').then(okJson).then(x => setKarty(Array.isArray(x?.karty) ? x.karty : [])).catch(() => setKarty([]));
  }, [demo]);
  useEffect(() => { nacti(); }, [nacti]);
  useEffect(() => { if (hotovo) { const id = setTimeout(() => setHotovo(''), 6000); return () => clearTimeout(id); } }, [hotovo]);

  const pripoj = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kod.replace(/[^A-Z0-9]/g, '').length !== 8) { setErr(t('Kód karty má osm znaků, třeba ABCD-EFGH.')); return; }
    if (demo) { setErr(t('V ukázce se karta nepřipojí. Přihlas se a zkus to na svém účtu.')); return; }
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

  // Směr A: nadpis sekce, karty jako řádky na skle (podnik, kód prostrkaný) a poslední řádek
  // „Mám plastovou kartu“; bez karet zůstane jen ten tichý řádek. Formulář se otevře místo něj.
  return (
    <section aria-labelledby="h-plastove" data-testid="plastove-karty">
      <NadpisSekce id="h-plastove" titulek={t('Plastové karty')} />
      {!otevreno ? (
        <Seznam>
          {karty.map(k => (
            <Radek key={k.id} ikona="card" titulek={k.podnik} popis={<span className="hp-kod">{k.kod}</span>} />
          ))}
          <Radek ikona={karty.length ? 'plus' : 'card'} titulek={t('Mám plastovou kartu')}
            popis={t('U kasy fungují stejně jako karta v aplikaci.')} onClick={() => { setOtevreno(true); setErr(''); }} />
        </Seznam>
      ) : (
        <>
          {karty.length > 0 && (
            <Seznam className="mb-3">
              {karty.map(k => <Radek key={k.id} ikona="card" titulek={k.podnik} popis={<span className="hp-kod">{k.kod}</span>} />)}
            </Seznam>
          )}
          <form onSubmit={pripoj} className="lgx hp-sklo p-4 sm:p-5 grid gap-3" noValidate>
            <Pole id="pk-kod" popis={t('Kód z plastové karty')} ikona="card"
              napoveda={t('Kód je na kartě vedle QR. Body a razítka, které jsi na kartu nasbíral, se připíšou na tvůj účet.')}>
              <input id="pk-kod" value={kod} onChange={e => setKod(formatuj(e.target.value))} placeholder="ABCD-EFGH" autoComplete="off" autoCapitalize="characters"
                spellCheck={false} inputMode="text" maxLength={9} className="hp-kod uppercase" aria-describedby="pk-kod-napoveda" autoFocus />
            </Pole>
            {err && <p role="alert" className="note note-danger text-sm">{err}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setOtevreno(false); setErr(''); setKod(''); }} className="hp-btn lgx hp-btn-sklo hp-btn-stredni min-w-0">{t('Zrušit')}</button>
              <button type="submit" disabled={busy} aria-busy={busy} className="hp-btn hp-btn-inkoust hp-btn-stredni min-w-0">{busy ? '…' : t('Připojit kartu')}</button>
            </div>
          </form>
        </>
      )}
      {hotovo && <p role="status" className="note note-ok text-sm mt-3">{hotovo}</p>}
    </section>
  );
}
