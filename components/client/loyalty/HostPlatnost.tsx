'use client';

// Hostovská strana: platnost kuponu („vyprší za 3 dny“). Kdy vyprší razítková karta, říká KartaRazitek.
// Čísla počítá lib/hostPrehled.ts (platí pro server i klienta); tady jsou jen věty v jazyce hosta.

import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { platnostKuponu } from '@/lib/hostPrehled';

/** Věta o platnosti kuponu; bez data platnosti nic. Brzy končící jsou tučně inkoustem (jako lístek
 *  v Odměnách: „Končí za 3 dny · do 9. 11.“) — jantar ani červená do aplikace hosta nepatří. */
export function PlatnostKuponu({ validUntil, today, className = '' }: { validUntil: unknown; today: string; className?: string }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const p = platnostKuponu(validUntil, today);
  if (p.stav === 'bez' || !p.do) return null;
  const datum = fmtDatum(p.do, { jazyk, styl: 'kratce' });
  if (p.stav === 'dnes' || p.stav === 'brzy') {
    return (
      <span className={className}>
        <b className="font-semibold text-[color:var(--hp-fg)]">{p.stav === 'dnes' ? t('Končí dnes') : t('Končí za {n, plural, one {# den} few {# dny} other {# dní}}', { n: p.dni ?? 0 })}</b>
        {' · '}{t('do {datum}', { datum })}
      </span>
    );
  }
  const text = p.stav === 'vyprsel' ? t('Platnost skončila {datum}', { datum }) : t('Platí do {datum}', { datum });
  return <span className={`text-[color:var(--hp-muted)] ${className}`}>{text}</span>;
}
