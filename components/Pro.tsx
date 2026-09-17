'use client';

// Freemium building blocks: know the team's plan, badge Pro features, and
// lock them kindly — the locked state SELLS the feature, it never hides it.

import { createContext, useContext, useEffect, useState } from 'react';
import { planInfoOf, isPro, isMax, PRO_PRICE, PRICES, MAX_EXTRAS, type PlanInfo } from '@/lib/plan';
import { Icon } from './Icons';
import { useModal } from '@/lib/useModal';

const PlanCtx = createContext<{ plan: PlanInfo | null; loaded: boolean }>({ plan: null, loaded: false });

/** Fetches the team's plan once and shares it below. Until loaded, everything
 *  behaves as Pro — flashing a lock at someone who paid would be worse. */
export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch('/api/teams').then(r => r.json())
      .then(d => { setPlan(d?.planInfo ?? planInfoOf(null)); setLoaded(true); })
      .catch(() => { setPlan(planInfoOf(null)); setLoaded(true); });
  }, []);
  return <PlanCtx.Provider value={{ plan, loaded }}>{children}</PlanCtx.Provider>;
}

export function usePlan(): { plan: PlanInfo | null; pro: boolean; max: boolean; loaded: boolean } {
  const { plan, loaded } = useContext(PlanCtx);
  return { plan, pro: !loaded || isPro(plan), max: !loaded || isMax(plan), loaded };
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
          <a href="/employer/overview?view=settings" onClick={e => { e.preventDefault(); window.location.href = '/employer/overview?view=settings'; }}
            className="btn btn-primary">Zjistit víc o Max <Icon name="chevron" size={14} className="-rotate-90" /></a>
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
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C8F542]/15 text-[#4F6A07]"><Icon name="lock" size={24} /></div>
        <div className="flex items-center justify-center gap-2">
          <h3 className="t-card">{feature}</h3>
          <ProBadge />
        </div>
        <p className="text-sm text-black/55">
          {benefit ?? 'Tahle funkce patří do plánu Pro.'}
        </p>
        {employer ? (
          <a href="/employer/overview?view=settings" onClick={e => {
            // Same-shell navigation when we're already in the app.
            e.preventDefault();
            window.location.href = '/employer/overview?view=settings';
          }}
            className="inline-flex items-center gap-2 rounded-full bg-[#C8F542] on-accent font-semibold px-6 py-3 text-sm hover:brightness-105 shadow-[0_6px_18px_rgba(200,245,66,0.35)] transition">
            Zjistit víc o Pro <Icon name="chevron" size={14} className="-rotate-90" />
          </a>
        ) : (
          <p className="text-xs text-black/40">Řekni vedení — Pro se zapíná v Nastavení → Předplatné.</p>
        )}
        <p className="text-[11px] text-black/35">Pro stojí {PRO_PRICE.monthly} {PRO_PRICE.currency} {PRO_PRICE.per}.</p>
      </div>
    </div>
  );
}

/** Small modal for inline locked actions (e.g. a CSV button on Free). */
export function UpgradeModal({ feature, onClose }: { feature: string; onClose: () => void }) {
  const m = useModal(true, onClose, 'Přejít na Pro');
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center modal-overlay p-4" onClick={onClose}>
      <div ref={m.ref} {...m.dialogProps} className="modal-sheet rounded-3xl p-6 max-w-sm w-full text-center space-y-3" onClick={e => e.stopPropagation()}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C8F542]/15 text-[#4F6A07]"><Icon name="lock" size={20} /></div>
        <div className="flex items-center justify-center gap-2">
          <h3 className="t-card">{feature}</h3>
          <ProBadge />
        </div>
        <p className="text-sm text-black/55">Tuhle funkci odemyká plán Pro ({PRO_PRICE.monthly} {PRO_PRICE.currency} {PRO_PRICE.per}).</p>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn btn-secondary flex-1">Zavřít</button>
          <button onClick={() => { window.location.href = '/employer/overview?view=settings'; }}
            className="flex-1 rounded-full bg-[#C8F542] on-accent font-semibold px-5 py-3 text-sm hover:brightness-105 transition">
            Zjistit víc
          </button>
        </div>
      </div>
    </div>
  );
}
