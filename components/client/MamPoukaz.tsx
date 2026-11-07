'use client';

// „Mám poukaz“ pro hosta: opíše kód z dárkového poukazu a uvidí zůstatek a platnost. Jen čtení — poukaz se
// uplatňuje u kasy (obsluha), tady se nic neodečítá. Kód se nedá hádat: server omezuje pokusy podle IP a podniku
// a všechny chyby hlásí stejnou větou (neexistuje / zrušený / vyčerpaný / propadlý).
// Použito na stránce podniku (BusinessPage) i v Moje (MyPage, s výběrem podniku).

import { useState } from 'react';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { formatMoney } from '@/lib/money';
import { formatujPriPsani } from '@/lib/poukazy';

interface Nalez { balance: number; value: number; currency: string; validUntil: string | null }

export default function MamPoukaz({ slug, podniky, prihlasen = false, onPridano }: { slug?: string; podniky?: { slug: string; name: string }[]; prihlasen?: boolean; onPridano?: () => void }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const [vybrany, setVybrany] = useState(slug ?? podniky?.[0]?.slug ?? '');
  const [kod, setKod] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [nalez, setNalez] = useState<Nalez | null>(null);
  const [pridavam, setPridavam] = useState(false);
  const [pridano, setPridano] = useState(false);

  const over = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kod.trim() || !vybrany) return;
    setBusy(true); setErr(''); setNalez(null); setPridano(false);
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(vybrany)}/voucher`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: kod }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error ? t(d.error) : t('Poukaz nenalezen nebo neplatí')); return; }
      setNalez({ balance: Number(d.balance), value: Number(d.value), currency: String(d.currency), validUntil: d.validUntil ?? null });
    } catch {
      setErr(t('Poukaz se teď nepodařilo ověřit. Zkus to za chvíli.'));
    } finally {
      setBusy(false);
    }
  };

  // Přidání do aplikace: poukaz se pak ukáže v Moje i bez opisování kódu. Stejný kód jde přidat opakovaně.
  const pridej = async () => {
    setPridavam(true); setErr('');
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(vybrany)}/voucher`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: kod, claim: true }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error ? t(d.error) : t('Poukaz se nepodařilo přidat. Zkus to za chvíli.')); return; }
      setPridano(true); onPridano?.();
    } catch {
      setErr(t('Poukaz se nepodařilo přidat. Zkus to za chvíli.'));
    } finally {
      setPridavam(false);
    }
  };

  return (
    <form onSubmit={over} className="space-y-2" aria-label={t('Mám poukaz')}>
      <label htmlFor={`poukaz-${slug ?? 'moje'}`} className="hp-pole-popis">{t('Mám poukaz')}</label>
      {podniky && podniky.length > 1 && (
        <select aria-label={t('Podnik')} className="hp-pole w-full" value={vybrany} onChange={e => { setVybrany(e.target.value); setNalez(null); setErr(''); }}>
          {podniky.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>
      )}
      <div className="hp-pole">
        <input id={`poukaz-${slug ?? 'moje'}`} value={kod} onChange={e => { setKod(formatujPriPsani(e.target.value)); setNalez(null); setErr(''); }}
          placeholder={t('Kód z poukazu')} autoComplete="off" autoCapitalize="characters" spellCheck={false}
          className="hp-kod uppercase placeholder:tracking-normal placeholder:normal-case" />
        <button type="submit" disabled={busy || !kod.trim()} className="tap-target shrink-0 hp-btn hp-btn-inkoust hp-btn-male disabled:opacity-40">{busy ? '…' : t('Zkontrolovat')}</button>
      </div>
      {err && <p role="alert" className="text-sm text-bad-ink">{err}</p>}
      {nalez && (
        <div role="status" className="rounded-[14px] bg-[var(--hp-well)] px-4 py-3.5 text-[var(--hp-fg)]">
          <p className="text-[1.75rem] font-semibold tracking-[-0.02em] tabular-nums leading-tight">{t('Zůstatek {castka}', { castka: formatMoney(nalez.balance, nalez.currency) })}</p>
          <p className="hp-meta mt-0.5">
            {nalez.balance !== nalez.value ? `${t('z {castka}', { castka: formatMoney(nalez.value, nalez.currency) })} · ` : ''}
            {nalez.validUntil ? t('platí do {datum}', { datum: fmtDatum(nalez.validUntil, { jazyk, styl: 'cislo' }) }) : t('bez omezení platnosti')}
          </p>
          <p className="hp-meta !text-[12px] mt-1.5">{t('Poukaz uplatní obsluha u kasy: ukaž jí kód.')}</p>
          {prihlasen && !pridano && (
            <button type="button" onClick={pridej} disabled={pridavam} className="tap-target mt-3 hp-btn hp-btn-inkoust hp-btn-male disabled:opacity-50">{pridavam ? '…' : t('Přidat do mé aplikace')}</button>
          )}
          {pridano && <p role="status" className="hp-meta !font-semibold !text-[var(--hp-fg)] mt-2">{t('Poukaz je v tvé aplikaci, najdeš ho v Moje.')}</p>}
        </div>
      )}
    </form>
  );
}
