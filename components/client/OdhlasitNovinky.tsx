'use client';

// Odhlášení z e-mailů od podniků odkazem z e-mailu. Bez přihlášení; podpis je v odkazu.
// Změna se dělá až klepnutím na tlačítko (ne samotným otevřením odkazu), aby ji nespustil
// skener odkazů v poště. Jde i vrátit zpět.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../Icons';
import { PrazdnyStav } from './penezenka';
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

  // Směr A: prostá skleněná karta na plátně; neplatný odkaz jako prázdný stav s vějířem karet.
  return (
    <div className="mx-auto w-full max-w-[420px] pt-2 md:pt-12">
      {stav === 'nacitam' && <div className="lgx hp-sklo grid place-items-center py-16"><div className="spinner" role="status" aria-label={t('Načítám…')} /></div>}
      {stav === 'neplatny' && (
        <>
          <h1 className="sr-only">{t('Odkaz nefunguje')}</h1>
          <div className="lgx hp-sklo px-5 pb-6">
            <PrazdnyStav titulek={t('Odkaz nefunguje')}
              text={t('Odkaz je neúplný nebo se nepodařilo ho ověřit. E-maily od podniků vypneš v profilu, v části Oznámení a soukromí.')}
              akce={<Link href="/client/me/profil#ucet" className="hp-btn lgx hp-btn-sklo hp-btn-stredni">{t('Otevřít profil')}</Link>} />
          </div>
        </>
      )}
      {stav === 'prihlasen' && (
        <div className="lgx hp-sklo p-6 sm:p-7">
          <span className="hp-jamka" aria-hidden><Icon name="mail" size={18} strokeWidth={1.6} /></span>
          <h1 className="hp-titulek mt-4 !text-[28px]">{t('Odhlásit se z e-mailů?')}</h1>
          <p className="hp-text mt-2.5 text-[color:var(--hp-muted)] text-pretty">{t('Přestaneme ti posílat e-maily od podniků, kde jsi členem. Oznámení v aplikaci zůstanou, ta vypneš v profilu.')}</p>
          <button type="button" className="hp-btn hp-btn-limetka hp-btn-blok mt-6" disabled={busy} onClick={() => { void zmen(false); }}>
            {busy ? t('Ukládám…') : t('Odhlásit se z e-mailů')}
          </button>
        </div>
      )}
      {stav === 'odhlasen' && (
        <div className="lgx hp-sklo p-6 sm:p-7">
          <span className="hp-jamka" aria-hidden><Icon name="check" size={18} strokeWidth={1.6} /></span>
          <h1 className="hp-titulek mt-4 !text-[28px]">{t('Odhlášeno')}</h1>
          <p className="hp-text mt-2.5 text-[color:var(--hp-muted)] text-pretty">{t('E-maily od podniků ti už nepřijdou. Kdybys to chtěl(a) vrátit, klepni níže.')}</p>
          <button type="button" className="hp-btn lgx hp-btn-sklo hp-btn-blok mt-6" disabled={busy} onClick={() => { void zmen(true); }}>
            {busy ? t('Ukládám…') : t('Vrátit zpět')}
          </button>
        </div>
      )}
      {chyba && <p className="note note-bad mt-4 text-sm" role="alert">{chyba}</p>}
    </div>
  );
}
