'use client';

// Nastavení → Předplatné: co podnik má, co může mít a jak za to zaplatit.
// Platba i správa karty běží u Stripe (pokladna a zákaznický portál), tady
// je jen stav, tlačítka, nabídka Max po koupi Pro a affiliate odkaz.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icons';
import { Button, Segmented } from './ui';
import CheckoutModal from './CheckoutModal';
import {
  PLAN_FEATURES, PLAN_NAMES, PRICES, MAX_EXTRAS, MAX_OFFER_PCT, TRIAL_DAYS, REFERRALS_PER_MONTH,
  planLabel, czDays, type PlanInfo, type Interval,
} from '@/lib/plan';
import { okJson, apiMessage } from '@/lib/api';

type Status = {
  configured: boolean;
  plan: PlanInfo;
  subscription: { status: string | null; interval: string | null; price: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; trialEnd: string | null } | null;
  referral: { code: string | null; link: string | null; thisMonth: number; limit: number; total: number; referredCount: number };
};

const czk = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`;
const date = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Icon name="check" size={16} className="text-[#5B7A08]" />;
  if (v === false) return <span className="text-black/25">—</span>;
  return <>{v}</>;
}

export default function Billing() {
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [interval, setInterval_] = useState<Interval>('month');
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const [checkout, setCheckout] = useState<{ plan: 'pro' | 'max'; interval: Interval } | null>(null);

  const load = () => fetch('/api/billing/status').then(okJson)
    .then(d => { if (d?.plan) setSt(d); else setErr(d?.error || 'Nepodařilo se načíst.'); })
    .catch(e => setErr(apiMessage(e, 'Nepodařilo se načíst.')));
  useEffect(() => {
    load();
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('billing') === 'success') setNotice('Díky! Předplatné je nastavené — stav se propíše během chvíle.');
      if (q.get('billing') === 'cancel') setNotice('Pokladna byla zavřená bez platby. Kdykoli to jde zkusit znovu.');
    } catch { /* ignore */ }
  }, []);

  const go = async (path: string, body?: any) => {
    setBusy(path); setErr('');
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Nepodařilo se.'); setBusy(''); return; }
      if (d.url) { window.location.href = d.url; return; }
      setBusy(''); await load();
      if (path.endsWith('/upgrade')) setNotice(d.discounted ? 'Přechod na Max hotový — se slevou 30 % na první platbu.' : 'Přechod na Max hotový.');
    } catch { setErr('Nepodařilo se.'); setBusy(''); }
  };

  const plan = st?.plan;
  const active = !!st?.subscription && ['active', 'trialing', 'past_due'].includes(String(st.subscription.status));
  const canTrial = !!plan && !plan.hadSubscription;
  const offerLeft = useMemo(() => {
    if (!plan?.maxOfferUntil) return 0;
    return Math.max(0, Math.ceil((new Date(plan.maxOfferUntil).getTime() - Date.now()) / 86400000));
  }, [plan?.maxOfferUntil]);

  const copy = async () => {
    if (!st?.referral.link) return;
    try { await navigator.clipboard.writeText(st.referral.link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const priceCard = (p: 'pro' | 'max') => {
    const pr = PRICES[p];
    const isCurrent = plan?.effective === p && active;
    return (
      <div key={p} className={`card p-6 flex flex-col ${p === 'pro' ? 'card-accent' : 'card-info'}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="t-card">{PLAN_NAMES[p]}</h3>
          {isCurrent && <span className="chip chip-sm chip-ok">váš plán</span>}
        </div>
        {interval === 'year' ? (
          <p className="mt-2"><span className="text-3xl font-bold tracking-tight text-[#16181A]">{czk(pr.year)}</span> <span className="text-sm text-black/45">ročně</span>
            <span className="block text-[13px] text-black/45"><s>{czk(pr.yearCompare)}</s> · ušetříte {czk(pr.yearCompare - pr.year)}</span></p>
        ) : (
          <p className="mt-2"><span className="text-3xl font-bold tracking-tight text-[#16181A]">{czk(pr.month)}</span> <span className="text-sm text-black/45">měsíčně</span>
            <span className="block text-[13px] text-black/45">za podnik, kdykoli zrušit</span></p>
        )}
        <p className="mt-3 text-sm text-black/60">
          {p === 'pro' ? 'Neomezený tým, kiosk, odměny, exporty, měsíční přehled a sdílené menu ve vašich barvách.'
            : 'Vše z Pro a k tomu Managero client (věrnost, rezervace, objednávky od stolu), pokladna Storyous a výroba vlastních produktů.'}
        </p>
        <div className="mt-auto pt-5">
          {isCurrent ? (
            <Button variant="secondary" onClick={() => go('/api/billing/portal')} loading={busy === '/api/billing/portal'}>Spravovat předplatné</Button>
          ) : active ? (
            <Button variant={p === 'max' ? 'accent' : 'secondary'} onClick={() => p === 'max' ? go('/api/billing/upgrade') : go('/api/billing/portal')} loading={busy.endsWith(p === 'max' ? '/upgrade' : '/portal')}>
              {p === 'max' ? (offerLeft ? `Přejít na Max se slevou ${MAX_OFFER_PCT} %` : 'Přejít na Max') : 'Změnit na Pro'}
            </Button>
          ) : (
            <Button variant={p === 'pro' ? 'accent' : 'primary'} onClick={() => setCheckout({ plan: p, interval })}>
              {canTrial ? `Vyzkoušet ${TRIAL_DAYS} dní zdarma` : `Předplatit ${PLAN_NAMES[p]}`}
            </Button>
          )}
          {!active && canTrial && <p className="mt-2 text-[11px] text-black/45">Karta se zadá hned, první platba až po {TRIAL_DAYS} dnech. Zrušit jde kdykoli.</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {checkout && (
        <CheckoutModal plan={checkout.plan} interval={checkout.interval} trial={canTrial}
          onClose={() => setCheckout(null)}
          onDone={() => { setCheckout(null); setNotice('Díky! Předplatné je nastavené — stav se propíše během chvíle.'); setTimeout(load, 1500); setTimeout(load, 6000); }} />
      )}
      {notice && <p className="note note-ok">{notice}</p>}
      {err && <p className="note note-danger">{err}</p>}
      {st && !st.configured && <p className="note note-wait">Platby ještě nejsou zapnuté — chybí klíče Stripe v nastavení serveru.</p>}

      {/* Stav */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="t-card">Váš plán</h3>
            <p className="t-meta mt-1">Co váš podnik v Managero aktuálně má.</p>
          </div>
          {plan && (
            <span className={`chip ${plan.effective === 'free' ? 'chip-muted' : plan.effective === 'max' ? 'chip-info' : 'chip-ok'}`}>{planLabel(plan)}</span>
          )}
        </div>
        {plan?.pastDue && (
          <p className="note note-danger mt-4">Poslední platba se nezdařila. Stripe ji zkusí znovu — zkontrolujte kartu přes „Spravovat předplatné“.</p>
        )}
        {plan?.trialing && (
          <p className="note note-ok mt-4">
            Zkušební období končí za <strong>{czDays(plan.trialDaysLeft)}</strong>
            {st?.subscription ? ' — potom se z karty strhne první platba.' : ' — potom se podnik přepne na plán Zdarma, o data nepřijdete.'}
          </p>
        )}
        {plan?.cancelAt && (
          <p className="note note-wait mt-4">Předplatné je zrušené a skončí {date(plan.cancelAt)}. Do té doby vše funguje; obnovit ho jde v portálu.</p>
        )}
        {active && st?.subscription && !plan?.cancelAt && (
          <p className="t-meta mt-4">
            {st.subscription.interval === 'year' ? 'Roční' : 'Měsíční'} platba · další {plan?.trialing ? 'první ' : ''}platba {date(st.subscription.currentPeriodEnd)}.
          </p>
        )}
        {active && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" icon="card" onClick={() => go('/api/billing/portal')} loading={busy === '/api/billing/portal'}>Spravovat předplatné</Button>
            <span className="self-center text-[11px] text-black/45">karta, faktury, změna tarifu, zrušení</span>
          </div>
        )}
        {plan?.effective === 'free' && !plan.trialing && (
          <p className="mt-4 text-sm text-black/60 well px-4 py-3">
            Plán <strong className="text-[#16181A]">Zdarma platí napořád</strong> — směny, uzávěrky, úkoly, chat i sklad bez omezení času, až 3 lidé v týmu.
          </p>
        )}
      </div>

      {/* Nabídka Max po koupi Pro */}
      {plan?.effective === 'pro' && active && offerLeft > 0 && (
        <div className="card card-info p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="t-label text-[#0A5CC0]">Nabídka na {czDays(offerLeft)}</p>
              <h3 className="t-section mt-1">Max se slevou {MAX_OFFER_PCT} % na první platbu</h3>
            </div>
            <span className="chip chip-info">{interval === 'year' ? czk(Math.round(PRICES.max.year * (1 - MAX_OFFER_PCT / 100))) : czk(Math.round(PRICES.max.month * (1 - MAX_OFFER_PCT / 100)))} místo {interval === 'year' ? czk(PRICES.max.year) : czk(PRICES.max.month)}</span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {MAX_EXTRAS.map(x => <li key={x} className="text-sm text-[#16181A] flex items-center gap-2"><Icon name="check" size={15} className="text-[#0A5CC0] shrink-0" />{x}</li>)}
          </ul>
          <div className="mt-4">
            <Button variant="accent" onClick={() => go('/api/billing/upgrade')} loading={busy === '/api/billing/upgrade'}>Přejít na Max se slevou</Button>
          </div>
        </div>
      )}

      {/* Tarify */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="t-section">Tarify</h3>
          <Segmented size="sm" ariaLabel="Období" value={interval} onChange={v => setInterval_(v as Interval)}
            options={[{ id: 'month', label: 'Měsíčně' }, { id: 'year', label: 'Ročně · výhodněji' }]} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{priceCard('pro')}{priceCard('max')}</div>
      </div>

      {/* Affiliate */}
      <div className="card p-6">
        <h3 className="t-card">Doporučte Managero a získejte měsíc zdarma</h3>
        <p className="t-meta mt-1">
          Když se přes váš odkaz zaregistruje podnik a začne platit, odečteme vám cenu jednoho měsíce z další faktury.
          Nejvýš {REFERRALS_PER_MONTH} podniky za měsíc, napořád.
        </p>
        {st?.referral.link ? (
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <input readOnly value={st.referral.link} className="field font-mono text-sm" onFocus={e => e.currentTarget.select()} />
            <Button variant="primary" icon="copy" onClick={copy}>{copied ? 'Zkopírováno' : 'Kopírovat odkaz'}</Button>
          </div>
        ) : <p className="mt-3 text-sm text-black/45">Odkaz se připravuje…</p>}
        {st && (
          <p className="mt-3 text-[13px] text-black/55">
            Tento měsíc {st.referral.thisMonth} / {st.referral.limit} · celkem {st.referral.total} {st.referral.total === 1 ? 'měsíc' : st.referral.total < 5 ? 'měsíce' : 'měsíců'} zdarma · přes váš odkaz se zaregistrovalo {st.referral.referredCount}
          </p>
        )}
      </div>

      {/* Srovnání */}
      <div className="card p-6">
        <h3 className="t-card mb-4">Co je v jakém plánu</h3>
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left t-label">
                <th className="py-2 pr-3">Funkce</th>
                <th className="py-2 px-3 w-24">Zdarma</th>
                <th className="py-2 px-3 w-36 text-[#5B7A08]">Pro</th>
                <th className="py-2 pl-3 w-36 text-[#0A5CC0]">Max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {PLAN_FEATURES.map(f => (
                <tr key={f.label}>
                  <td className="py-2.5 pr-3 text-[#16181A]">{f.label}</td>
                  <td className="py-2.5 px-3 text-black/55"><Cell v={f.free} /></td>
                  <td className="py-2.5 px-3 text-black/70"><Cell v={f.pro} /></td>
                  <td className="py-2.5 pl-3 text-black/70"><Cell v={f.max} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-black/40">Ceny bez DPH. Fakturu se všemi náležitostmi vystaví Stripe a najdete ji v portálu.</p>
      </div>
    </div>
  );
}
