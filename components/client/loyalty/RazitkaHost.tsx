'use client';

// Co host u razítkové kartičky ještě potřebuje vědět: kdy vyprší, že už vypršela,
// kdy se razítka dávají a kolikrát jde kartu dokončit. Hostovská část → vše přes t().

import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum, fmtDenVTydnu } from '@/lib/i18n/format';

export interface PoznamkyKarty {
  stamps?: number; completed?: number;
  expiresAt?: string | null; expiredCount?: number; expiredAt?: string | null;
  maxCompletions?: number; oneTime?: boolean;
  daysOfWeek?: number[]; hourFrom?: string | null; hourTill?: string | null;
}

/** „po–pá" / „po, st" z ISO dnů (1 = pondělí) v jazyce hosta. */
function dnyVJazyce(dny: number[], jazyk: any): string {
  const d = Array.from(new Set(dny)).filter(x => x >= 1 && x <= 7).sort((a, b) => a - b);
  if (!d.length || d.length === 7) return '';
  const souvisle = d.length > 2 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const jmeno = (x: number) => fmtDenVTydnu(x - 1, { jazyk });
  return souvisle ? `${jmeno(d[0])}–${jmeno(d[d.length - 1])}` : d.map(jmeno).join(', ');
}

export default function RazitkaPoznamky({ cp }: { cp: PoznamkyKarty }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const dny = dnyVJazyce(cp.daysOfWeek ?? [], jazyk);
  const hodiny = cp.hourFrom && cp.hourTill ? `${cp.hourFrom}–${cp.hourTill}` : '';
  const kdy = [dny, hodiny].filter(Boolean).join(', ');
  const limit = cp.oneTime ? 1 : Number(cp.maxCompletions) || 0;
  const radky: { klic: string; text: string; tone?: 'bad' }[] = [];
  if ((cp.expiredCount ?? 0) > 0) {
    radky.push({ klic: 'vyprsela', tone: 'bad', text: t('Karta vypršela a razítka propadla ({n}). Začínáš znovu.', { n: cp.expiredCount }) });
  }
  if (cp.expiresAt && (cp.stamps ?? 0) > 0) {
    radky.push({ klic: 'do', text: t('Dosbírej do {datum}, pak karta vyprší.', { datum: fmtDatum(cp.expiresAt, { jazyk, styl: 'kratce' }) }) });
  }
  if (kdy) radky.push({ klic: 'kdy', text: t('Razítko dostaneš jen {kdy}.', { kdy }) });
  if (limit > 0) {
    radky.push({
      klic: 'limit',
      text: (cp.completed ?? 0) >= limit
        ? t('Limit karet je splněný ({n}×).', { n: limit })
        : limit === 1 ? t('Tuhle kartu jde dokončit jen jednou.') : t('Tuhle kartu jde dokončit nejvýš {n}×.', { n: limit }),
    });
  }
  if (!radky.length) return null;
  return (
    <ul className="mt-1.5 space-y-0.5">
      {radky.map(r => (
        <li key={r.klic} className={`text-xs ${r.tone === 'bad' ? 'text-bad-ink' : 'text-black/55'}`} role={r.tone === 'bad' ? 'status' : undefined}>{r.text}</li>
      ))}
    </ul>
  );
}
