'use client';

// Platební okno „Vyzkoušet Pro / Předplatit“ — celé v designu Manageru. Vlevo (nahoře na
// mobilu) shrnutí tarifu, vpravo vlastní pokladna (components/pokladna/VlastniPokladna.tsx):
// Stripe Checkout Sessions v režimu `elements`, kde Stripe kreslí jen platební pole (karta,
// Apple Pay / Google Pay, Klarna…) a všechno ostatní je naše. Karta nikdy neprojde naším kódem.
// Tlačítko platby je v patičce okna, ať je na telefonu vždycky po ruce.
//
// Bez veřejného klíče (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY), nebo když se Stripe.js nenačte
// (blokátor), se okno přepne na přesměrování do hostované pokladny Stripe, aby platba šla vždycky.

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Icon } from './Icons';
import { Button } from './ui/Button';
import { useModal } from '@/lib/useModal';
import { PLAN_NAMES, PRICES, TRIAL_DAYS, MAX_EXTRAS, type Interval } from '@/lib/plan';
import { DiscardGuard } from './ui/DiscardGuard';
import { useJazyk, useT } from '@/lib/i18n/client';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';
import { tg } from '@/lib/i18n/stav';
import { cestaDokumentu } from '@/lib/pravni/odkazy';
import VlastniPokladna, { type DataPokladny, type PokladnaHandle, type StavPaticky } from './pokladna/VlastniPokladna';

const stripePromise = new Map<string, Promise<Stripe | null>>();
function stripeJs(jazyk: string): Promise<Stripe | null> | null {
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!pk) return null;
  // Platební pole i hlášky Stripe mluví jazykem aplikace (cs, en, de, sk, pl).
  let p = stripePromise.get(jazyk);
  if (!p) { p = loadStripe(pk, { locale: jazyk as 'cs' }).catch(() => null); stripePromise.set(jazyk, p); }
  return p;
}

async function otevriPokladnu(body: object, chybaVychozi: string): Promise<any> {
  const res = await fetch('/api/billing/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ? tg(d.error) : chybaVychozi);
  return d;
}

export default function CheckoutModal({ plan, interval, trial, onClose, onDone }: {
  plan: 'pro' | 'max';
  interval: Interval;
  /** Podnik ještě trial neměl → první platba až po 30 dnech. */
  trial: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT('predplatne');
  const { jazyk } = useJazyk();
  const tRef = useRef(t);
  tRef.current = t;
  const czk = (n: number) => `${n.toLocaleString(LOCALE_PRO_JAZYK[jazyk])} Kč`;
  const proBody = [t('Neomezený tým'), t('Kiosk pro tablet na prodejně'), t('Odměny, úrovně a hodnocení směn'), t('CSV exporty a měsíční přehled'), t('Sdílené menu ve vašich barvách')];
  // Během platby (3D Secure, potvrzení) okno nejde zavřít: zavření by zahodilo rozjetou platbu.
  const placeniRef = useRef(false);
  const zavrit = useCallback(() => { if (!placeniRef.current) onClose(); }, [onClose]);
  const m = useModal(true, zavrit, t('Předplatit {plan}', { plan: PLAN_NAMES[plan] }));
  const [state, setState] = useState<'loading' | 'ready' | 'redirecting' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [stripeObj, setStripeObj] = useState<Stripe | null>(null);
  const [data, setData] = useState<DataPokladny | null>(null);
  const pokladna = useRef<PokladnaHandle>(null);
  const [paticka, setPaticka] = useState<StavPaticky>({ pripraveno: false, placeni: false, text: '' });
  const onStav = useCallback((s: StavPaticky) => { placeniRef.current = s.placeni; setPaticka(s); }, []);
  const chybaNacteni = useCallback((zprava: string) => { setErr(zprava); setState('error'); }, []);

  useEffect(() => {
    let alive = true;
    const t = tRef.current;
    const js = stripeJs(jazyk);
    const vychozi = t('Pokladnu se nepodařilo otevřít.');
    const presmeruj = (url?: string) => {
      if (!url) throw new Error(vychozi);
      setState('redirecting'); window.location.href = url;
    };
    (async () => {
      try {
        // Bez veřejného klíče: rovnou hostovaná pokladna Stripe.
        if (!js) { const d = await otevriPokladnu({ plan, interval }, vychozi); if (alive) presmeruj(d.url); return; }
        const [d, stripe] = await Promise.all([otevriPokladnu({ plan, interval, ui: 'elements' }, vychozi), js]);
        if (!alive) return;
        // Stripe.js se nenačetl (blokátor, síť): platba přesto jde, přes hostovanou pokladnu.
        if (!stripe || d.ui !== 'elements' || !d.clientSecret) {
          const h = await otevriPokladnu({ plan, interval }, vychozi);
          if (alive) presmeruj(h.url);
          return;
        }
        setStripeObj(stripe);
        setData({ clientSecret: String(d.clientSecret), ico: d.ico ?? null, firma: String(d.firma ?? ''), souhlas: !!d.souhlas, trial: !!d.trial });
        setState('ready');
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message ?? vychozi));
        setState('error');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, interval]);

  const pr = PRICES[plan];
  const amount = interval === 'year' ? pr.year : pr.month;
  const points = plan === 'max' ? [...proBody.slice(0, 2), ...MAX_EXTRAS.map(x => t(x))] : proBody;

  return (
    <div className="fixed inset-0 modal-overlay z-[80] flex items-end sm:items-center justify-center sm:p-4" onClick={zavrit}>
      <div ref={m.ref} {...m.dialogProps} onClick={e => e.stopPropagation()}
        className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full sm:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <DiscardGuard guard={m.guard} />
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <div className="min-w-0">
            <h3 className="t-section truncate">{trial ? t('Vyzkoušet {plan} na {n} dní zdarma', { plan: PLAN_NAMES[plan], n: TRIAL_DAYS }) : t('Předplatit {plan}', { plan: PLAN_NAMES[plan] })}</h3>
            <p className="t-meta">{trial ? t('Karta se zadá teď, první platba {castka} až po {n} dnech.', { castka: czk(amount), n: TRIAL_DAYS }) : (interval === 'year' ? t('{castka} ročně za podnik.', { castka: czk(amount) }) : t('{castka} měsíčně za podnik.', { castka: czk(amount) }))}</p>
          </div>
          <button onClick={m.guard.attemptClose} disabled={paticka.placeni} className="shrink-0 btn-icon" aria-label={t('Zavřít')}><Icon name="close" size={15} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin grid grid-cols-1 md:grid-cols-[260px_1fr]">
          {/* Shrnutí tarifu */}
          <aside className="px-6 pb-4 md:pb-6 md:pr-4">
            <div className={`card p-5 ${plan === 'pro' ? 'card-accent' : 'card-info'}`}>
              <p className="t-label">{PLAN_NAMES[plan]}</p>
              <p className="mt-1"><span className="text-3xl font-bold tracking-tight text-[#16181A]">{czk(amount)}</span> <span className="text-sm text-black/45">{interval === 'year' ? t('ročně') : t('měsíčně')}</span></p>
              {/* Úspora se počítá (12 × měsíční cena − roční), jako na landingu (Pricing.tsx). Dřív tu stála
                  přeškrtnutá „srovnávací“ cena (PRICES.*.yearCompare), kterou nikdo nikdy neúčtoval —
                  klamavá referenční cena (§ 4 a 5 zákona o ochraně spotřebitele). */}
              {interval === 'year' && <p className="text-[13px] text-black/55">{t('Ušetříte {castka} oproti měsíčnímu placení, vychází na {mesicne} měsíčně.', { castka: czk(12 * pr.month - pr.year), mesicne: czk(Math.round(pr.year / 12)) })}</p>}
              <ul className="mt-4 space-y-1.5">
                {points.map(p => <li key={p} className="text-[13px] text-[#16181A] flex items-start gap-2"><Icon name="check" size={14} className={`shrink-0 mt-0.5 ${plan === 'pro' ? 'text-[#5B7A08]' : 'text-[#0A5CC0]'}`} />{p}</li>)}
              </ul>
              <p className="mt-4 text-[11px] text-black/45">
                {trial ? t('Zrušit jde kdykoli během zkušební doby, nic se nestrhne.') : t('Kdykoli zrušit, platí do konce zaplaceného období.')} {t('Ceny jsou konečné (neplátce DPH), předplatné se obnovuje automaticky, fakturu pošle Stripe.')}
              </p>
              {/* Podmínky placeného tarifu po ruce před platbou (Stripe checklist, OP čl. 6, 7 a 10); nová záložka nezavře pokladnu. */}
              <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-black/55">
                <Link href={cestaDokumentu('obchodni-podminky', jazyk === 'cs' ? 'cs' : 'en')} target="_blank" rel="noopener noreferrer" className="tap-target-sm inline-flex items-center underline underline-offset-2">{t('Obchodní podmínky')}</Link>
                <Link href={cestaDokumentu('zruseni-predplatneho', jazyk === 'cs' ? 'cs' : 'en')} target="_blank" rel="noopener noreferrer" className="tap-target-sm inline-flex items-center underline underline-offset-2">{t('Zrušení předplatného a vrácení peněz')}</Link>
              </p>
            </div>
          </aside>

          {/* Pokladna */}
          <section className="px-6 pb-6 md:pl-0 min-h-[420px] min-w-0" aria-label={t('Platba')}>
            {state === 'loading' && (
              <div className="h-full min-h-[420px] rounded-2xl well flex flex-col items-center justify-center gap-3">
                <div className="spinner" />
                <p className="text-sm text-black/45">{t('Připravujeme bezpečnou platbu…')}</p>
              </div>
            )}
            {state === 'redirecting' && (
              <div className="h-full min-h-[420px] rounded-2xl well flex items-center justify-center">
                <p className="text-sm text-black/45">{t('Přesměrováváme do pokladny Stripe…')}</p>
              </div>
            )}
            {state === 'error' && (
              <div className="h-full min-h-[420px] rounded-2xl well flex flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="note note-danger">{err}</p>
                <button onClick={onClose} className="btn btn-secondary">{t('Zavřít')}</button>
              </div>
            )}
            {state === 'ready' && stripeObj && data && (
              <VlastniPokladna ref={pokladna} stripe={stripeObj} data={data} onStav={onStav} onHotovo={onDone} onChybaNacteni={chybaNacteni} />
            )}
          </section>
        </div>

        {/* Patička: hlavní akce okna (52, přes šířku na telefonu, pod pokladnou na monitoru). */}
        {state === 'ready' && (
          <div className="border-t border-[var(--surface-line)] pt-3 pb-4 md:grid md:grid-cols-[260px_1fr]">
            <div className="hidden md:block" />
            <div className="px-6 md:pl-0">
              <Button variant="accent" size="lg" className="w-full" data-zaplatit
                disabled={!paticka.pripraveno} loading={paticka.placeni}
                onClick={() => pokladna.current?.zaplatit()}>
                {paticka.text || t('Zaplatit')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
