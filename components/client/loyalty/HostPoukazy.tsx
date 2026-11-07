'use client';

// „Moje poukazy“ v Odměnách (směr A): dárkový poukaz jako zasunutá inkoustová karta v peněžence —
// monogram podniku na krému, „Dárkový poukaz“, „podnik · kód“ a zůstatek vpravo tabulárními číslicemi.
// Pod hlavičkou platnost a akce: QR kód se rozbalí až na žádost, odebrání z aplikace se nejdřív zeptá
// (poukaz zůstane platný, jen přestane být „jeho“). Vyčerpaný a propadlý poukaz zůstává vidět tlumeně
// se stavem, ať host ví, proč už nejde použít. Barva ani šablona poukazu podniku se tu neukazuje.
// Hostovská část → vše přes t().

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../../Icons';
import { Monogram, NadpisSekce, tvarPodniku } from '../penezenka';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { formatMoney } from '@/lib/money';
import type { PoukazHosta } from '@/lib/poukazyHostDb';

type Poukaz = Pick<PoukazHosta, 'id' | 'code' | 'balance' | 'value' | 'currency' | 'validUntil' | 'stav' | 'design' | 'business'> & { slug?: string | null };

/** QR kód s kódem poukazu: knihovna se načte až při rozbalení. */
function Qr({ kod, popisek }: { kod: string; popisek: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [chyba, setChyba] = useState(false);
  useEffect(() => {
    let zije = true;
    import('qrcode').then(m => m.default.toString(kod, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#16181A', light: '#00000000' } }))
      .then(x => { if (zije) setSvg(x); }).catch(() => { if (zije) setChyba(true); });
    return () => { zije = false; };
  }, [kod]);
  if (chyba) return <p className="hp-kod text-center">{kod}</p>;
  // eslint-disable-next-line react/no-danger -- SVG vyrobila knihovna qrcode z našeho kódu, žádný text od uživatele
  return <div role="img" aria-label={popisek} className="h-qr-pole mx-auto w-40 h-40 p-3 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />;
}

/** Tlačítko na inkoustové kartě: tlumené sklo na inkoustu, ohnisko limetkou. */
const NA_KARTE = 'hp-btn hp-btn-male hp-kruh-obalka tap-target';

function Karta({ p, onOdebrano }: { p: Poukaz; onOdebrano: (id: number) => void }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const qrId = useId();
  const [qr, setQr] = useState(false);
  const [ptam, setPtam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const platny = p.stav === 'active';
  const stav = p.stav === 'active' ? null : p.stav === 'used' ? t('Vyčerpaný') : t('Propadlý');
  const tvar = tvarPodniku(p.slug || p.business);

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

  const meta = [
    p.balance !== p.value ? t('z {castka}', { castka: formatMoney(p.value, p.currency) }) : '',
    p.validUntil ? t('platí do {datum}', { datum: fmtDatum(p.validUntil, { jazyk, styl: 'cislo' }) }) : t('bez omezení platnosti'),
  ].filter(Boolean).join(' · ');

  return (
    <li>
      <div className={`hp-karta hp-karta-zasunuta ${platny ? '' : 'opacity-70'}`} role="group" aria-label={t('Dárkový poukaz {podnik}', { podnik: p.business })}>
        <span className={`hp-tex hp-tex-${tvar}`} aria-hidden />
        <span className="hp-karta-hlava">
          <Monogram nazev={p.business} klic={p.slug ?? null} />
          <span className="hp-karta-jmeno">
            <b>{t('Dárkový poukaz')}</b>
            <span>{p.business} · <span className="hp-kod !tracking-[0.06em]">{p.code}</span></span>
          </span>
          {stav
            ? <span className="hp-karta-hodnota !text-[13px]" role="status">{stav}</span>
            : <span className="hp-karta-hodnota hp-num">{formatMoney(p.balance, p.currency)}</span>}
        </span>
        <p className="mt-3 text-[12px] leading-snug text-[color:var(--hp-karta-tlume)] hp-num">
          {stav && <>{t('Zůstatek {castka}', { castka: formatMoney(p.balance, p.currency) })} · </>}{meta}
        </p>
        {!ptam && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {platny && (
              <button type="button" onClick={() => setQr(v => !v)} aria-expanded={qr} aria-controls={qrId} className={NA_KARTE}>
                <Icon name="qr" size={15} strokeWidth={1.6} />{qr ? t('Skrýt QR kód') : t('Ukázat QR kód')}
              </button>
            )}
            <button type="button" onClick={() => setPtam(true)} className={NA_KARTE}>{t('Odebrat z aplikace')}</button>
          </div>
        )}
        {platny && qr && (
          <div id={qrId} className="mt-4 mb-1">
            <Qr kod={p.code} popisek={t('QR kód poukazu {kod}', { kod: p.code })} />
            <p className="mt-2.5 text-center text-[12px] text-[color:var(--hp-karta-tlume)]">{t('Kód ukaž obsluze u kasy.')}</p>
          </div>
        )}
        {ptam && (
          <div role="group" aria-label={t('Odebrat poukaz z aplikace?')} className="mt-3.5 border-t border-[rgba(244,241,232,0.12)] pt-3.5">
            <p className="text-[13px] leading-snug text-[color:var(--hp-karta-stredni)]">{t('Poukaz zůstane platný, jen ho tu přestaneš vidět. Znovu ho přidáš kódem.')}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy} onClick={odeber} className="hp-btn hp-btn-male tap-target bg-[var(--hp-paper)] text-[#16181A] focus-visible:!outline-[var(--hp-lime)] disabled:opacity-60">{busy ? '…' : t('Odebrat')}</button>
              <button type="button" disabled={busy} onClick={() => setPtam(false)} className={NA_KARTE}>{t('Ponechat')}</button>
            </div>
          </div>
        )}
      </div>
      {chyba && <p role="alert" className="mt-2 text-sm text-bad-ink">{chyba}</p>}
    </li>
  );
}

/** Seznam poukazů hosta (z odpovědi /api/client/me). Bez poukazů se oddíl neukáže (přidává se polem „Mám kód“ nahoře). */
export default function HostPoukazy({ poukazy }: { poukazy: Poukaz[] }) {
  const t = useT('klient-host');
  const [seznam, setSeznam] = useState(poukazy);
  const prvni = useRef(true);
  // Po obnovení dat (přidání poukazu kódem) se seznam vezme znovu ze serveru.
  useEffect(() => { if (prvni.current) { prvni.current = false; return; } setSeznam(poukazy); }, [poukazy]);
  if (seznam.length === 0) return null;
  return (
    <section aria-labelledby="h-poukazy">
      <NadpisSekce id="h-poukazy" titulek={t('Moje poukazy')} />
      <ul className="flex flex-col gap-2.5">{seznam.map(p => <Karta key={p.id} p={p} onOdebrano={id => setSeznam(s => s.filter(x => x.id !== id))} />)}</ul>
    </section>
  );
}
