'use client';

// „Moje poukazy“ na stránce Moje: dárkové poukazy přiřazené hostovi (podnikem, nebo si je přidal sám kódem).
// U každého je kód velkým písmem (obsluha ho opíše), QR kód (rozbalí se až na žádost), zůstatek a platnost.
// Vyčerpaný a propadlý poukaz zůstává vidět se stavem, ať host ví, proč už nejde použít. Z aplikace se dá poukaz
// odebrat (po potvrzení); zůstane platný, jen přestane být „jeho“. Hostovská část → vše přes t().

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../Icons';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { formatMoney } from '@/lib/money';
import { sablona } from '@/lib/poukazySablony';
import type { PoukazHosta } from '@/lib/poukazyHostDb';

type Poukaz = Pick<PoukazHosta, 'id' | 'code' | 'balance' | 'value' | 'currency' | 'validUntil' | 'stav' | 'design' | 'business'>;

/** QR kód s kódem poukazu: knihovna se načte až při rozbalení. */
function Qr({ kod, popisek }: { kod: string; popisek: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [chyba, setChyba] = useState(false);
  useEffect(() => {
    let zije = true;
    import('qrcode').then(m => m.default.toString(kod, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }))
      .then(x => { if (zije) setSvg(x); }).catch(() => { if (zije) setChyba(true); });
    return () => { zije = false; };
  }, [kod]);
  if (chyba) return <p className="text-xs text-black/55">{kod}</p>;
  // eslint-disable-next-line react/no-danger -- SVG vyrobila knihovna qrcode z našeho kódu, žádný text od uživatele
  return <div role="img" aria-label={popisek} className="rounded-2xl bg-white p-3 w-40 h-40 mx-auto [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />;
}

function Karta({ p, onOdebrano }: { p: Poukaz; onOdebrano: (id: number) => void }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const [ptam, setPtam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const v = sablona(p.design);
  const platny = p.stav === 'active';
  const stav = p.stav === 'active' ? null : p.stav === 'used' ? t('Vyčerpaný') : t('Propadlý');

  const odeber = async () => {
    setBusy(true); setChyba('');
    try {
      const r = await fetch('/api/client/me/poukazy', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) });
      if (!r.ok) throw new Error('x');
      onOdebrano(p.id);
    } catch {
      setChyba(t('Poukaz se nepodařilo odebrat. Zkus to za chvíli.'));
      setBusy(false); setPtam(false);
    }
  };

  return (
    <li className="rounded-2xl border-2 px-4 py-3" style={{ borderColor: platny ? v.barva : undefined, background: platny ? v.podklad : undefined, opacity: platny ? 1 : 0.75 }}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-black/55 truncate">{p.business}</p>
          <p className="text-lg font-bold tabular-nums leading-tight">{t('Zůstatek {castka}', { castka: formatMoney(p.balance, p.currency) })}</p>
          <p className="text-xs text-black/55">
            {p.balance !== p.value ? `${t('z {castka}', { castka: formatMoney(p.value, p.currency) })} · ` : ''}
            {p.validUntil ? t('platí do {datum}', { datum: fmtDatum(p.validUntil, { jazyk, styl: 'cislo' }) }) : t('bez omezení platnosti')}
          </p>
          {stav && <p role="status" className="mt-1 inline-block rounded-full bg-black/[0.07] px-2 py-0.5 text-[11px] font-semibold text-black/60">{stav}</p>}
        </div>
        <p className="font-mono font-bold tracking-widest text-base shrink-0 break-all text-right max-w-[9rem]">{p.code}</p>
      </div>
      {platny && (
        <details className="mt-2 group/qr">
          <summary className="tap-target-sm inline-flex items-center gap-1.5 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none">
            <Icon name="chevron" size={15} className="transition-transform group-open/qr:rotate-180" />{t('Ukázat QR kód')}
          </summary>
          <div className="mt-2"><Qr kod={p.code} popisek={t('QR kód poukazu {kod}', { kod: p.code })} /></div>
        </details>
      )}
      {chyba && <p role="alert" className="mt-2 text-sm text-bad-ink">{chyba}</p>}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {!ptam ? (
          <button type="button" onClick={() => setPtam(true)} className="tap-target-sm text-sm font-semibold text-black/55 hover:text-black px-1">{t('Odebrat z aplikace')}</button>
        ) : (
          <div role="group" aria-label={t('Odebrat poukaz z aplikace?')} className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-black/70">{t('Poukaz zůstane platný, jen ho tu přestaneš vidět. Znovu ho přidáš kódem.')}</p>
            <button type="button" disabled={busy} onClick={odeber} className="tap-target-sm btn btn-primary text-sm disabled:opacity-50">{busy ? '…' : t('Odebrat')}</button>
            <button type="button" disabled={busy} onClick={() => setPtam(false)} className="tap-target-sm text-sm font-semibold text-black/60 hover:text-black px-2">{t('Ponechat')}</button>
          </div>
        )}
      </div>
    </li>
  );
}

/** Seznam poukazů hosta (z odpovědi /api/client/me). Bez poukazů se oddíl neukáže (na přidání je „Mám poukaz“ níž). */
export default function HostPoukazy({ poukazy }: { poukazy: Poukaz[] }) {
  const t = useT('klient-host');
  const [seznam, setSeznam] = useState(poukazy);
  const prvni = useRef(true);
  // Po obnovení dat (přidání poukazu kódem) se seznam vezme znovu ze serveru.
  useEffect(() => { if (prvni.current) { prvni.current = false; return; } setSeznam(poukazy); }, [poukazy]);
  if (seznam.length === 0) return null;
  return (
    <section aria-labelledby="h-poukazy" className="max-w-md">
      <h2 id="h-poukazy" className="text-lg font-bold tracking-tight">{t('Moje poukazy')}</h2>
      <p className="text-sm text-black/55 mt-1 mb-3">{t('Kód ukaž obsluze u kasy.')}</p>
      <ul className="space-y-2">{seznam.map(p => <Karta key={p.id} p={p} onOdebrano={id => setSeznam(s => s.filter(x => x.id !== id))} />)}</ul>
    </section>
  );
}
