'use client';

// Freemium building blocks: know the team's plan, badge Pro features, and
// lock them kindly — the locked state SELLS the feature, it never hides it.

import { createContext, useContext, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { planInfoOf, isPro, isMax, PRO_PRICE, PRICES, PLAN_NAMES, TRIAL_DAYS, priceLabel, MAX_EXTRAS, type PlanInfo } from '@/lib/plan';
import { Icon } from './Icons';
import { Modal, Button } from './ui';

// Pokladna se stahuje, až když má vyskočit — zamčená funkce ji většinou
// nikdy nepotřebuje.
const CheckoutModal = dynamic(() => import('./CheckoutModal'), { ssr: false });

const PlanCtx = createContext<{ plan: PlanInfo | null; loaded: boolean }>({ plan: null, loaded: false });

/** Fetches the team's plan once and shares it below. Until loaded, everything
 *  behaves as Pro — flashing a lock at someone who paid would be worse. */
export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = (attempt = 0) => {
      fetch('/api/teams').then(r => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
        .then(d => { if (alive) { setPlan(d?.planInfo ?? planInfoOf(null)); setLoaded(true); } })
        .catch(() => {
          // Výpadek sítě nesmí znamenat „nemáš Pro".
          //
          // Dřív se při chybě nastavil volný tarif a `loaded = true`, takže
          // zaplacenému podniku vyskočila na tabletu zeď „Kiosk režim patří
          // do plánu Pro" — bez tlačítka, bez rady, jen kvůli vypadlé wifi.
          // Dokud nevíme, co má zaplaceno, radši to necháme nenačtené:
          // `usePlan` pak vrací `pro: true` a nic se nezamkne.
          if (!alive) return;
          if (attempt < 4) setTimeout(() => load(attempt + 1), 2000 * (attempt + 1));
        });
    };
    load();
    return () => { alive = false; };
  }, []);
  return <PlanCtx.Provider value={{ plan, loaded }}>{children}</PlanCtx.Provider>;
}

export function usePlan(): { plan: PlanInfo | null; pro: boolean; max: boolean; loaded: boolean } {
  const { plan, loaded } = useContext(PlanCtx);
  return { plan, pro: !loaded || isPro(plan), max: !loaded || isMax(plan), loaded };
}

/**
 * Tlačítko, které zamčenou funkci opravdu odemkne.
 *
 * Dřív všechny zámky vedly do Nastavení → Předplatné. Člověk, který klikl
 * na Managero client, se tím ocitl na úplně jiné obrazovce a musel si
 * dohledat, co vlastně chtěl. Tady se rovnou otevře to, co dává smysl:
 *
 *  - podnik bez předplatného → pokladna Stripe s vybraným tarifem
 *    (`/api/billing/checkout`, {TRIAL_DAYS} dní zdarma a karta rovnou),
 *  - podnik s běžícím Pro, který chce Max → změna tarifu na stávajícím
 *    předplatném (`/api/billing/upgrade`), protože pokladna by v tom
 *    případě skončila chybou „podnik už předplatné má".
 *
 * Na serveru jsou to dvě různé cesty a splést je znamená ukázat chybu
 * místo nabídky.
 */
export function OdemknoutButton({ plan, className = '' }: { plan: 'pro' | 'max'; className?: string }) {
  const { plan: info } = usePlan();
  const [pokladna, setPokladna] = useState(false);
  const [prechod, setPrechod] = useState<'ne' | 'bezi' | 'hotovo'>('ne');
  const [chyba, setChyba] = useState('');

  const bezici = !!info && info.plan !== 'free'
    && ['active', 'trialing', 'past_due'].includes(String(info.subscriptionStatus));
  // Změna tarifu se dělá jen na běžícím předplatném a jen směrem k Max.
  const zmenaTarifu = bezici && plan === 'max';

  const prejit = async () => {
    setPrechod('bezi'); setChyba('');
    try {
      const r = await fetch('/api/billing/upgrade', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      // Bez téhle kontroly by se oslavilo i to, co server odmítl.
      if (!r.ok) throw new Error(d?.error || 'Přechod se nepodařil.');
      setPrechod('hotovo');
      window.location.reload();
    } catch (e: any) {
      setChyba(String(e?.message ?? 'Přechod se nepodařil.'));
      setPrechod('ne');
    }
  };

  return (
    <>
      <Button
        variant={plan === 'max' ? 'primary' : 'accent'}
        icon="sparkle"
        loading={prechod === 'bezi'}
        onClick={() => (zmenaTarifu ? prejit() : setPokladna(true))}
        className={className}
      >
        {zmenaTarifu
          ? `Přejít na ${PLAN_NAMES[plan]}${info?.maxOfferUntil ? ' −30 %' : ''}`
          : `Odemknout ${PLAN_NAMES[plan]}`}
      </Button>
      {chyba && <p className="text-bad-ink text-xs mt-2">{chyba}</p>}
      {pokladna && (
        <CheckoutModal
          plan={plan}
          interval={info?.interval ?? 'month'}
          trial={!info?.hadSubscription}
          onClose={() => setPokladna(false)}
          onDone={() => window.location.reload()}
        />
      )}
    </>
  );
}

export function MaxBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-[#0A5CC0] text-white px-2 py-0.5 text-[11px] font-bold tracking-wide ${className}`}>
      MAX
    </span>
  );
}

/** Zámek pro funkce Max (Managero client, pokladna, výroba) — prodává, neschovává. */
export function MaxGate({ feature, children, benefit, employer = true }: {
  feature: string; benefit?: string; employer?: boolean; children: React.ReactNode;
}) {
  const { max } = usePlan();
  if (max) return <>{children}</>;
  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto">
      <div className="card p-8 text-center space-y-3">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0A84FF]/10 text-[#0A5CC0]"><Icon name="lock" size={24} /></div>
        <div className="flex items-center justify-center gap-2">
          <h3 className="t-card">{feature}</h3>
          <MaxBadge />
        </div>
        <p className="text-sm text-black/55">{benefit ?? 'Tahle funkce patří do plánu Max.'}</p>
        <ul className="text-left text-sm text-black/60 space-y-1 max-w-xs mx-auto">
          {MAX_EXTRAS.map(x => <li key={x} className="flex items-start gap-2"><Icon name="check" size={15} className="text-[#0A5CC0] shrink-0 mt-0.5" />{x}</li>)}
        </ul>
        {employer ? (
          <div className="flex justify-center"><OdemknoutButton plan="max" /></div>
        ) : (
          <p className="text-xs text-black/40">Řekni vedení — Max se zapíná v Nastavení → Předplatné.</p>
        )}
        <p className="text-[11px] text-black/35">Max stojí {PRICES.max.month} Kč měsíčně za podnik.</p>
      </div>
    </div>
  );
}

export function ProBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-[#16181A] text-[#C8F542] px-2 py-0.5 text-[11px] font-bold tracking-wide ${className}`}>
      PRO
    </span>
  );
}

/** Full-card lock: shows what the feature does and how to get it. */
export function ProGate({ feature, children, benefit, employer = true }: {
  feature: string;
  benefit?: string;
  /** false = the viewer can't upgrade themselves (employee) */
  employer?: boolean;
  children: React.ReactNode;
}) {
  const { pro } = usePlan();
  if (pro) return <>{children}</>;
  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto">
      <div className="glass-card p-8 text-center space-y-3">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C8F542]/15 text-[#5B7A08]"><Icon name="lock" size={24} /></div>
        <div className="flex items-center justify-center gap-2">
          <h3 className="t-card">{feature}</h3>
          <ProBadge />
        </div>
        <p className="text-sm text-black/55">
          {benefit ?? 'Tahle funkce patří do plánu Pro.'}
        </p>
        {employer ? (
          <div className="flex justify-center"><OdemknoutButton plan="pro" /></div>
        ) : (
          <p className="text-xs text-black/40">Řekni vedení — Pro se zapíná v Nastavení → Předplatné.</p>
        )}
        <p className="text-[11px] text-black/35">Pro stojí {PRO_PRICE.monthly} {PRO_PRICE.currency} {PRO_PRICE.per}.</p>
      </div>
    </div>
  );
}

/** Okno pro zamčenou akci v řádku (třeba Export CSV na tarifu Zdarma). */
export function UpgradeModal({ feature, plan = 'pro', onClose }: { feature: string; plan?: 'pro' | 'max'; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} size="sm"
      title={<span className="flex items-center gap-2">{feature} {plan === 'max' ? <MaxBadge /> : <ProBadge />}</span>}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Zavřít</Button>
        <OdemknoutButton plan={plan} />
      </>}>
      <div className="text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C8F542]/15 text-[#5B7A08]"><Icon name="lock" size={20} /></div>
        <p className="text-sm text-black/55">Tuhle funkci odemyká plán {PLAN_NAMES[plan]} ({priceLabel(plan, 'month')}).</p>
        <p className="text-xs text-black/40">{TRIAL_DAYS} dní zdarma, zrušit jde kdykoliv.</p>
      </div>
    </Modal>
  );
}
