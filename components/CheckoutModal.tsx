'use client';

// Platební okno: pokladna Stripe vložená do naší aplikace. Vlevo (nahoře na
// mobilu) shrnutí tarifu v našem designu, uvnitř rám Stripe s kartou, Apple
// Pay / Google Pay, DIČ a promo kódem. Karta nikdy neprojde naším kódem.
//
// Bez veřejného klíče (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) se okno rovnou
// přepne na přesměrování do pokladny Stripe, aby platba šla vždycky.

import { useEffect, useRef, useState } from 'react';
import { loadStripe, type Stripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js';
import { Icon } from './Icons';
import { useModal } from '@/lib/useModal';
import { PLAN_NAMES, PRICES, TRIAL_DAYS, MAX_EXTRAS, type Interval } from '@/lib/plan';
import { DiscardGuard } from './ui/DiscardGuard';

let stripePromise: Promise<Stripe | null> | null = null;
function stripeJs(): Promise<Stripe | null> | null {
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!pk) return null;
  if (!stripePromise) stripePromise = loadStripe(pk, { locale: 'cs' });
  return stripePromise;
}

const czk = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`;

const PRO_POINTS = ['Neomezený tým', 'Kiosk pro tablet na prodejně', 'Odměny, úrovně a hodnocení směn', 'CSV exporty a měsíční přehled', 'Sdílené menu ve vašich barvách'];

export default function CheckoutModal({ plan, interval, trial, onClose, onDone }: {
  plan: 'pro' | 'max';
  interval: Interval;
  /** Podnik ještě trial neměl → první platba až po 30 dnech. */
  trial: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const m = useModal(true, onClose, `Předplatit ${PLAN_NAMES[plan]}`);
  const frame = useRef<HTMLDivElement>(null);
  const checkout = useRef<StripeEmbeddedCheckout | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'redirecting' | 'error'>('loading');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const js = stripeJs();
    (async () => {
      try {
        const res = await fetch('/api/billing/checkout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan, interval, embedded: !!js }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Pokladnu se nepodařilo otevřít.');
        if (!alive) return;
        // Bez veřejného klíče: přesměrování na Stripe.
        if (!js || !d.clientSecret) {
          if (d.url) { setState('redirecting'); window.location.href = d.url; return; }
          throw new Error('Pokladnu se nepodařilo otevřít.');
        }
        const stripe = await js;
        if (!stripe) throw new Error('Stripe se nepodařilo načíst.');
        if (!alive) return;
        const ec = await stripe.createEmbeddedCheckoutPage({
          clientSecret: d.clientSecret,
          onComplete: () => { onDone(); },
        });
        if (!alive) { ec.destroy(); return; }
        checkout.current = ec;
        if (frame.current) ec.mount(frame.current);
        setState('ready');
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message ?? 'Pokladnu se nepodařilo otevřít.'));
        setState('error');
      }
    })();
    return () => {
      alive = false;
      try { checkout.current?.destroy(); } catch { /* ignore */ }
      checkout.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, interval]);

  const pr = PRICES[plan];
  const amount = interval === 'year' ? pr.year : pr.month;
  const points = plan === 'max' ? [...PRO_POINTS.slice(0, 2), ...MAX_EXTRAS] : PRO_POINTS;

  return (
    <div className="fixed inset-0 modal-overlay z-[80] flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div ref={m.ref} {...m.dialogProps} onClick={e => e.stopPropagation()}
        className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full sm:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <DiscardGuard guard={m.guard} />
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <div className="min-w-0">
            <h3 className="t-section truncate">{trial ? `Vyzkoušet ${PLAN_NAMES[plan]} na ${TRIAL_DAYS} dní zdarma` : `Předplatit ${PLAN_NAMES[plan]}`}</h3>
            <p className="t-meta">{trial ? `Karta se zadá teď, první platba ${czk(amount)} až po ${TRIAL_DAYS} dnech.` : `${czk(amount)} ${interval === 'year' ? 'ročně' : 'měsíčně'} za podnik.`}</p>
          </div>
          <button onClick={m.guard.attemptClose} className="shrink-0 btn-icon" aria-label="Zavřít"><Icon name="close" size={15} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin grid grid-cols-1 md:grid-cols-[260px_1fr]">
          {/* Shrnutí v našem designu */}
          <aside className="px-6 pb-4 md:pb-6 md:pr-4">
            <div className={`card p-5 ${plan === 'pro' ? 'card-accent' : 'card-info'}`}>
              <p className="t-label">{PLAN_NAMES[plan]}</p>
              <p className="mt-1"><span className="text-3xl font-bold tracking-tight text-[#16181A]">{czk(amount)}</span> <span className="text-sm text-black/45">{interval === 'year' ? 'ročně' : 'měsíčně'}</span></p>
              {interval === 'year' && <p className="text-[13px] text-black/45"><s>{czk(pr.yearCompare)}</s> · ušetříte {czk(pr.yearCompare - pr.year)}</p>}
              <ul className="mt-4 space-y-1.5">
                {points.map(p => <li key={p} className="text-[13px] text-[#16181A] flex items-start gap-2"><Icon name="check" size={14} className={`shrink-0 mt-0.5 ${plan === 'pro' ? 'text-[#5B7A08]' : 'text-[#0A5CC0]'}`} />{p}</li>)}
              </ul>
              <p className="mt-4 text-[11px] text-black/45">
                {trial ? 'Zrušit jde kdykoli během zkušební doby, nic se nestrhne.' : 'Kdykoli zrušit, platí do konce zaplaceného období.'} Ceny bez DPH, fakturu pošle Stripe.
              </p>
            </div>
          </aside>

          {/* Pokladna Stripe */}
          <section className="px-6 pb-6 md:pl-0 min-h-[420px]">
            {state === 'loading' && (
              <div className="h-full min-h-[420px] rounded-2xl well flex flex-col items-center justify-center gap-3">
                <div className="spinner" />
                <p className="text-sm text-black/45">Připravujeme bezpečnou platbu…</p>
              </div>
            )}
            {state === 'redirecting' && (
              <div className="h-full min-h-[420px] rounded-2xl well flex items-center justify-center">
                <p className="text-sm text-black/45">Přesměrováváme do pokladny Stripe…</p>
              </div>
            )}
            {state === 'error' && (
              <div className="h-full min-h-[420px] rounded-2xl well flex flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="note note-danger">{err}</p>
                <button onClick={onClose} className="btn btn-secondary">Zavřít</button>
              </div>
            )}
            <div ref={frame} className={`rounded-2xl overflow-hidden ${state === 'ready' ? '' : 'hidden'}`} />
          </section>
        </div>
      </div>
    </div>
  );
}
