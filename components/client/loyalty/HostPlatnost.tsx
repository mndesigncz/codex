'use client';

// Hostovská strana: platnost kuponu („vyprší za 3 dny“). Kdy vyprší razítková karta, říká KartaRazitek.
// Čísla počítá lib/hostPrehled.ts (platí pro server i klienta); tady jsou jen věty v jazyce hosta.

import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { platnostKuponu } from '@/lib/hostPrehled';

/** Věta o platnosti kuponu; bez data platnosti nic. Brzy končící a prošlé jsou výraznější. */
export function PlatnostKuponu({ validUntil, today, className = '' }: { validUntil: unknown; today: string; className?: string }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const p = platnostKuponu(validUntil, today);
  if (p.stav === 'bez' || !p.do) return null;
  const datum = fmtDatum(p.do, { jazyk, styl: 'denKratce' });
  const tone = p.stav === 'vyprsel' ? 'text-bad-ink' : p.stav === 'brzy' || p.stav === 'dnes' ? 'text-wait-ink font-semibold' : 'text-black/45';
  const text = p.stav === 'vyprsel' ? t('Platnost skončila {datum}', { datum })
    : p.stav === 'dnes' ? t('Vyprší dnes')
    : p.stav === 'brzy' ? t('Vyprší za {n, plural, one {# den} few {# dny} other {# dní}} ({datum})', { n: p.dni ?? 0, datum })
    : t('Platí do {datum}', { datum });
  return <span className={`${tone} ${className}`}>{text}</span>;
}
