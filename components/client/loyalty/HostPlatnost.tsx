'use client';

// Hostovská strana: platnost kuponu („vyprší za 3 dny“) a doba na dokončení razítkové karty.
// Čísla počítá lib/hostPrehled.ts (platí pro server i klienta); tady jsou jen věty v jazyce hosta.

import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { platnostKuponu, platnostKarty } from '@/lib/hostPrehled';

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

/** Doba na dokončení razítkové karty: do kdy přidat další razítko, aby se karta nevynulovala. */
export function DobaKarty({ cp, today }: { cp: { stamps: number; daysToFinish?: number; lastStampDay?: string | null }; today: string }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const dny = Math.trunc(Number(cp.daysToFinish)) || 0;
  if (dny <= 0) return null;
  const p = platnostKarty(cp.lastStampDay, dny, cp.stamps, today);
  if (p.stav === 'bez') {
    // Karta ještě nemá razítka: jen upozornění na limit, ať host ví, do čeho jde.
    return <p className="mt-1 text-xs text-black/55">{t('Mezi razítky smí uplynout nejvýš {n, plural, one {# den} few {# dny} other {# dní}}.', { n: dny })}</p>;
  }
  const datum = p.do ? fmtDatum(p.do, { jazyk, styl: 'denKratce' }) : '';
  if (p.stav === 'vyprsela') return <p className="mt-1 text-xs text-bad-ink">{t('Karta mezitím vypršela. Další razítko začne novou.')}</p>;
  if (p.stav === 'dnes') return <p className="mt-1 text-xs font-semibold text-wait-ink">{t('Další razítko přidej dnes, jinak se karta vynuluje.')}</p>;
  return (
    <p className={`mt-1 text-xs ${p.stav === 'brzy' ? 'font-semibold text-wait-ink' : 'text-black/55'}`}>
      {t('Další razítko přidej do {datum}, jinak se karta vynuluje.', { datum })}
    </p>
  );
}
