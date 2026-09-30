'use client';

// Doporučení ve Financích — tělo widgetu „Doporučení" (finance.doporuceni).
//
// Přehled čísel říká, kolik se vydělalo; tohle říká, co s tím. Každá rada má
// tři patra: co se stalo, co to znamená a co udělat. Kde jde spočítat cena
// toho, co se neděje, je u rady i částka — „slabý čtvrtek stojí 12 400 Kč
// měsíčně" se čte jinak než „čtvrtky jsou slabší".
//
// Kolo 69 (B5b): dřív samostatný blok Financí s vlastním fetch, jednou
// glass-card na skupinu a tónovanými kartičkami uvnitř (karta v kartě),
// nadpisem skupiny h4 ručně, šipkou „→" napsanou znakem, ručními pilulkami
// filtru a textem „Počítám doporučení…" místo kostry. Data si teď načítá
// widget (useDataWidgetu) a tady je jen kreslení: skupiny se štítkem t-label,
// rady jako řádky seznamu s tónovanou ikonou v jamce, filtr skupin přes
// Segmented a slepá místa jako věty v jamce.

import { useMemo, useState } from 'react';
import { useMoney } from '../CurrencyProvider';
import { Chip, Segmented, Well } from '../ui';
import { RadyJakoSeznam, type TonPoznamky } from './LiveRevenue';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { useLocale } from './jazyk';

export type SkupinaRady = 'revenue' | 'products' | 'people' | 'stock' | 'guests';

export interface Rada {
  group: SkupinaRady;
  tone: TonPoznamky;
  icon: string;
  title: string;
  text: string;
  action?: string;
  impact?: number;
  evidence?: string;
}

export interface Doporuceni { rady: Rada[]; slepa: string[] }

export const SKUPINY: { id: SkupinaRady; label: string }[] = [
  { id: 'revenue', label: 'Tržby' }, // i18n-ok
  { id: 'products', label: 'Co se prodává' }, // i18n-ok
  { id: 'people', label: 'Provoz a lidé' }, // i18n-ok
  { id: 'stock', label: 'Nákup a sklad' }, // i18n-ok
  { id: 'guests', label: 'Hosté a věrnost' }, // i18n-ok
];

/** Název skupiny v jazyce uživatele (SKUPINY.label zůstává česky pro widgety, které se překládají později). */
export const nazevSkupiny = (t: PrekladFn, id: SkupinaRady): string => ({
  revenue: t('Tržby'),
  products: t('Co se prodává'),
  people: t('Provoz a lidé'),
  stock: t('Nákup a sklad'),
  guests: t('Hosté a věrnost'),
})[id];

const SKUPINA_IDS = new Set<string>(SKUPINY.map(s => s.id));

/** Z /api/finance/advice vybere rady známých skupin a tónů; neznámý tvar je chyba widgetu. */
export function vyberDoporuceni(raw: any): Doporuceni {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.advice)) throw new Error('Doporučení přišla v nečekaném tvaru.'); // i18n-ok
  return {
    rady: raw.advice
      .filter((a: any) => a && SKUPINA_IDS.has(a.group) && typeof a.title === 'string')
      .map((a: any) => ({
        group: a.group,
        tone: a.tone === 'good' || a.tone === 'warn' ? a.tone : 'info',
        icon: typeof a.icon === 'string' ? a.icon : 'bulb',
        title: a.title,
        text: typeof a.text === 'string' ? a.text : '',
        action: typeof a.action === 'string' && a.action.trim() ? a.action.trim() : undefined,
        impact: Number.isFinite(Number(a.impact)) && Number(a.impact) > 0 ? Number(a.impact) : undefined,
        evidence: typeof a.evidence === 'string' && a.evidence.trim() ? a.evidence.trim() : undefined,
      })),
    slepa: Array.isArray(raw.blind) ? raw.blind.filter((b: unknown) => typeof b === 'string' && b.trim()) : [],
  };
}

/** Rada jako řádek: co se stalo, pod tím co udělat; částka „jde o …" a důkaz v chipech vpravo. */
function useRadky() {
  const t = useT('sprava');
  const money = useMoney();
  return (rady: Rada[]) => rady.map(a => ({
    tone: a.tone,
    ikona: a.icon,
    title: a.title,
    text: [a.text, a.action && t('Co udělat: {akce}', { akce: a.action })].filter(Boolean).join(' '),
    doplnek: a.impact != null || a.evidence ? (
      <span className="flex flex-col items-end gap-1">
        {a.impact != null && <Chip tone="muted" size="sm"><span className="tabular-nums">{t('jde o {castka}', { castka: money(a.impact) })}</span></Chip>}
        {a.evidence && <Chip tone="muted" size="sm">{a.evidence}</Chip>}
      </span>
    ) : undefined,
  }));
}

/** Střední velikost: první tři rady (API je řadí tak, aby nahoře bylo to, co stojí nejvíc peněz). */
export function PrvniRady({ d, pocet = 3 }: { d: Doporuceni; pocet?: number }) {
  const radky = useRadky();
  return <RadyJakoSeznam rady={radky(d.rady)} limit={pocet} />;
}

/**
 * Velká velikost: všechny skupiny pod sebou (doporučení, které si člověk musí
 * najít, nikdo nečte), filtr skupin je jen zúžení. Součet vyčíslitelných rad
 * neříká „tolik vyděláš" — říká, o kolik peněz se v nich mluví.
 */
export function SkupinyDoporuceni({ d }: { d: Doporuceni }) {
  const t = useT('sprava');
  const loc = useLocale();
  const money = useMoney();
  const radky = useRadky();
  const [jen, setJen] = useState<SkupinaRady | 'vse'>('vse');
  const podleSkupin = useMemo(() => {
    const m = new Map<SkupinaRady, Rada[]>();
    for (const s of SKUPINY) m.set(s.id, []);
    for (const a of d.rady) m.get(a.group)?.push(a);
    return m;
  }, [d.rady]);
  const celkem = d.rady.reduce((s, a) => s + (a.impact ?? 0), 0);
  const moznosti = [
    { id: 'vse' as const, label: t('Vše'), count: d.rady.length },
    ...SKUPINY.filter(s => (podleSkupin.get(s.id)?.length ?? 0) > 0).map(s => ({ id: s.id, label: nazevSkupiny(t, s.id), count: podleSkupin.get(s.id)!.length })),
  ];
  return (
    <div className="space-y-4">
      <p className="t-meta">
        {t('{n} pozorování z čísel měsíce', { n: d.rady.length.toLocaleString(loc) })}
        {celkem > 0 && <> · {t('dohromady se tu mluví o')} <span className="font-semibold text-[#16181A] tabular-nums">{money(celkem)}</span></>}
      </p>
      {moznosti.length > 2 && (
        <Segmented size="sm" ariaLabel={t('Skupina doporučení')} options={moznosti} value={jen} onChange={setJen} />
      )}
      {SKUPINY.filter(s => jen === 'vse' || s.id === jen).map(s => {
        const list = podleSkupin.get(s.id) ?? [];
        if (!list.length) return null;
        return (
          <div key={s.id}>
            <p className="t-label mb-1">{nazevSkupiny(t, s.id)}</p>
            <RadyJakoSeznam rady={radky(list)} />
          </div>
        );
      })}
      {/* Slepá místa: když se něco nedá spočítat, je to informace, ne mlčení. */}
      {d.slepa.length > 0 && (
        <Well>
          <p className="t-label mb-1.5">{t('Co se nepodařilo spočítat')}</p>
          <ul className="space-y-1">
            {d.slepa.map((b, i) => <li key={i} className="t-meta">{b}</li>)}
          </ul>
        </Well>
      )}
    </div>
  );
}
