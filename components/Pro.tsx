'use client';

// Freemium building blocks: know the team's plan, badge Pro features, and
// lock them kindly — the locked state SELLS the feature, it never hides it.

import { createContext, useContext, useEffect, useState } from 'react';
import { planInfoOf, isPro, PRO_PRICE, type PlanInfo } from '@/lib/plan';
import { Icon } from './Icons';

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

export function usePlan(): { plan: PlanInfo | null; pro: boolean; loaded: boolean } {
  const { plan, loaded } = useContext(PlanCtx);
  return { plan, pro: !loaded || isPro(plan), loaded };
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
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C8F542]/15 text-2xl">🔒</div>
        <div className="flex items-center justify-center gap-2">
          <h3 className="text-lg font-bold tracking-tight text-[#16181A]">{feature}</h3>
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
            className="inline-flex items-center gap-2 rounded-full bg-[#16181A] text-white font-semibold px-6 py-3 text-sm hover:bg-black transition">
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
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center modal-overlay p-4" onClick={onClose}>
      <div className="modal-sheet rounded-3xl p-6 max-w-sm w-full text-center space-y-3" onClick={e => e.stopPropagation()}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C8F542]/15 text-xl">🔒</div>
        <div className="flex items-center justify-center gap-2">
          <h3 className="text-lg font-bold tracking-tight text-[#16181A]">{feature}</h3>
          <ProBadge />
        </div>
        <p className="text-sm text-black/55">Tuhle funkci odemyká plán Pro ({PRO_PRICE.monthly} {PRO_PRICE.currency} {PRO_PRICE.per}).</p>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-full bg-black/[0.05] text-[#16181A] font-semibold px-5 py-3 text-sm hover:bg-black/[0.08] transition">Zavřít</button>
          <button onClick={() => { window.location.href = '/employer/overview?view=settings'; }}
            className="flex-1 rounded-full bg-[#16181A] text-white font-semibold px-5 py-3 text-sm hover:bg-black transition">
            Zjistit víc
          </button>
        </div>
      </div>
    </div>
  );
}
