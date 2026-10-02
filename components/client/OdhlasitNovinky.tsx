'use client';

// Odhlášení z e-mailů od podniků odkazem z e-mailu. Bez přihlášení; podpis je v odkazu.
// Změna se dělá až klepnutím na tlačítko (ne samotným otevřením odkazu), aby ji nespustil
// skener odkazů v poště. Jde i vrátit zpět.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/client';
import { tg } from '@/lib/i18n/stav';
import { okJson } from '@/lib/api';

type Stav = 'nacitam' | 'prihlasen' | 'odhlasen' | 'neplatny';

export default function OdhlasitNovinky({ token }: { token: string }) {
  const t = useT('klient-host');
  const [stav, setStav] = useState<Stav>('nacitam');
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const url = `/api/client/odhlasit?t=${encodeURIComponent(token)}`;

  useEffect(() => {
    let zije = true;
    fetch(url).then(okJson)
      .then(d => { if (zije) setStav(d.odhlasen ? 'odhlasen' : 'prihlasen'); })
      .catch(() => { if (zije) setStav('neplatny'); });
    return () => { zije = false; };
  }, [url]);

  const zmen = async (zpet: boolean) => {
    setBusy(true); setChyba('');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zpet }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ? tg(d.error) : t('Nepodařilo se to uložit. Zkus to znovu.'));
      setStav(d.odhlasen ? 'odhlasen' : 'prihlasen');
    } catch (e: any) { setChyba(e?.message || t('Nepodařilo se to uložit. Zkus to znovu.')); }
    setBusy(false);
  };

  return (
    <div className="card p-6 sm:p-8 max-w-md w-full mx-auto text-center">
      {stav === 'nacitam' && <div className="spinner mx-auto" role="status" aria-label={t('Načítám…')} />}
      {stav === 'neplatny' && (
        <>
          <h1 className="t-page">{t('Odkaz nefunguje')}</h1>
          <p className="t-meta mt-3 text-pretty">{t('Odkaz je neúplný nebo se nepodařilo ho ověřit. E-maily od podniků vypneš v profilu, v části Oznámení a soukromí.')}</p>
          <Link href="/client/me#ucet" className="btn btn-secondary mt-6 tap-target">{t('Otevřít profil')}</Link>
        </>
      )}
      {stav === 'prihlasen' && (
        <>
          <h1 className="t-page">{t('Odhlásit se z e-mailů?')}</h1>
          <p className="t-meta mt-3 text-pretty">{t('Přestaneme ti posílat e-maily od podniků, kde jsi členem. Oznámení v aplikaci zůstanou, ta vypneš v profilu.')}</p>
          <button type="button" className="btn btn-primary mt-6 tap-target" disabled={busy} onClick={() => { void zmen(false); }}>
            {busy ? t('Ukládám…') : t('Odhlásit se z e-mailů')}
          </button>
        </>
      )}
      {stav === 'odhlasen' && (
        <>
          <h1 className="t-page">{t('Odhlášeno')}</h1>
          <p className="t-meta mt-3 text-pretty">{t('E-maily od podniků ti už nepřijdou. Kdybys to chtěl(a) vrátit, klepni níže.')}</p>
          <button type="button" className="btn btn-secondary mt-6 tap-target" disabled={busy} onClick={() => { void zmen(true); }}>
            {busy ? t('Ukládám…') : t('Vrátit zpět')}
          </button>
        </>
      )}
      {chyba && <p className="note note-bad mt-4 text-sm" role="alert">{chyba}</p>}
    </div>
  );
}
