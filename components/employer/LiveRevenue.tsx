'use client';

// Živě z pokladny — části, ze kterých se skládá widget „Živě z pokladny"
// (pokladna.zive) a menší widgety tržeb (kolo 69, balík B5b).
//
// Dřív to byl samostatný panel na Financích s vlastním fetch, vlastními
// předvolbami období (ruční pilulky), poli data s přepsaným .field, kolečkem
// při načítání a sedmi ručně psanými štítky. Na ploše si data načítá widget
// přes useDataWidgetu (sdílená mezipaměť: Živě z pokladny, Platby a Top
// produkty za stejné období pošlou jeden dotaz) a období vybírá v nastavení
// widgetu. Tady zůstalo jen kreslení — každá část je jedna věc (čísla,
// poznámky, hodiny, produkty, obsluha, dny) a widget si vybere, kolik jich
// se do jeho velikosti vejde.
//
// Číslo bez vysvětlení je horší než žádné, protože se podle něj rozhoduje:
// proto poznámky (chybějící ceny, refundace, nesesynchronizované účtenky)
// zůstávají u čísel i ve střední velikosti.

import { useState, type ReactNode } from 'react';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import { BarSpark, Chip, ListRow } from '../ui';
import { czCount, type CzNoun } from '@/lib/czech';
import { pragueToday } from '@/lib/pragueTime';

export type TonPoznamky = 'good' | 'warn' | 'info';
export interface PoznamkaPokladny { tone: TonPoznamky; title: string; text: string }
export interface DenPokladny {
  day: string; bills: number; cash: number; card: number; other: number; total: number;
  tips: number; refundCount: number; refundTotal: number;
  closings: number; declared: number | null; diff: number | null;
}
export interface PolozkaPokladny { productId: string; name: string; category: string | null; qty: number; revenue: number | null }
export interface OsobaPokladny { name: string; total: number; bills: number }
export interface SouctyPokladny {
  bills: number; total: number; cash: number; card: number; other: number; tips: number;
  tipsCash: number; tipsCard: number; refundCount: number; refundTotal: number;
  avgBill: number; soldQty: number; productRevenue: number;
  methods: { id: string; label: string; amount: number }[];
}

/** Odpověď /api/pos/daily vybraná pro widgety. Obal (nikdy null), aby „nepropojeno" nebylo „načítám". */
export interface DenniPokladna {
  propojeno: boolean;
  from: string; to: string;
  misto: string | null;
  posledniSynchronizace: string | null;
  soucty: SouctyPokladny;
  dny: DenPokladny[];
  hodiny: number[];
  obsluha: OsobaPokladny[];
  polozky: PolozkaPokladny[];
  poznamky: PoznamkaPokladny[];
  poznamka: string;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** Vybere z /api/pos/daily jen to, co widgety kreslí; nečekaný tvar je chyba widgetu, ne prázdno. */
export function vyberDenniPokladnu(raw: any): DenniPokladna {
  if (!raw || typeof raw !== 'object') throw new Error('Pokladna odpověděla v nečekaném tvaru.');
  const t = raw.totals ?? {};
  return {
    propojeno: raw.connected === true && !!raw.totals,
    from: text(raw.from), to: text(raw.to),
    misto: text(raw.placeName).trim() || null,
    posledniSynchronizace: typeof raw.lastSyncAt === 'string' ? raw.lastSyncAt : null,
    soucty: {
      bills: n(t.bills), total: n(t.total), cash: n(t.cash), card: n(t.card), other: n(t.other), tips: n(t.tips),
      tipsCash: n(t.tipsCash), tipsCard: n(t.tipsCard), refundCount: n(t.refundCount), refundTotal: n(t.refundTotal),
      avgBill: n(t.avgBill), soldQty: n(t.soldQty), productRevenue: n(t.productRevenue),
      methods: Array.isArray(t.methods) ? t.methods.map((m: any) => ({ id: text(m?.id), label: text(m?.label) || text(m?.id), amount: n(m?.amount) })) : [],
    },
    dny: Array.isArray(raw.days) ? raw.days.map((d: any) => ({
      day: text(d?.day), bills: n(d?.bills), cash: n(d?.cash), card: n(d?.card), other: n(d?.other), total: n(d?.total),
      tips: n(d?.tips), refundCount: n(d?.refundCount), refundTotal: n(d?.refundTotal),
      closings: n(d?.closings), declared: d?.declared == null ? null : n(d.declared), diff: d?.diff == null ? null : n(d.diff),
    })) : [],
    hodiny: Array.isArray(raw.hours) ? raw.hours.map(n) : [],
    obsluha: Array.isArray(raw.byPerson) ? raw.byPerson.map((p: any) => ({ name: text(p?.name) || 'Bez jména', total: n(p?.total), bills: n(p?.bills) })) : [],
    polozky: Array.isArray(raw.items) ? raw.items.map((i: any) => ({
      productId: text(i?.productId) || text(i?.name), name: text(i?.name) || 'Bez názvu', category: text(i?.category) || null,
      qty: n(i?.qty), revenue: i?.revenue == null ? null : n(i.revenue),
    })) : [],
    poznamky: Array.isArray(raw.notes) ? raw.notes
      .filter((x: any) => x && (x.tone === 'good' || x.tone === 'warn' || x.tone === 'info'))
      .map((x: any) => ({ tone: x.tone, title: text(x.title), text: text(x.text) })) : [],
    poznamka: text(raw.note),
  };
}

/** Období widgetu tržeb → dny od–do v pražském čase. `mesic` = od prvního dne měsíce do dneška. */
export function obdobiPokladny(id: unknown): { from: string; to: string; popis: string } {
  const dnes = pragueToday();
  switch (id) {
    case 'vcera': return { from: pragueToday(-1), to: pragueToday(-1), popis: 'Včera' };
    case '7_dni': return { from: pragueToday(-6), to: dnes, popis: 'Posledních 7 dní' };
    case '14_dni': return { from: pragueToday(-13), to: dnes, popis: 'Posledních 14 dní' };
    case '30_dni': return { from: pragueToday(-29), to: dnes, popis: 'Posledních 30 dní' };
    case 'mesic':
    case 'tento_mesic': return { from: `${dnes.slice(0, 7)}-01`, to: dnes, popis: 'Tento měsíc' };
    default: return { from: dnes, to: dnes, popis: 'Dnes' };
  }
}

export const UCTENKA: CzNoun = { one: 'účtenka', few: 'účtenky', many: 'účtenek' };
export const KUS: CzNoun = { one: 'kus', few: 'kusy', many: 'kusů' };

const PISMENA_DNU = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
/** „Po" z „2026-09-21" — poledne UTC, ať se den nepřehoupne podle pásma zařízení. */
export const pismenoDne = (d: string) => PISMENA_DNU[new Date(`${d}T12:00:00Z`).getUTCDay()] ?? '';
/** „21. 9." */
export const kratkeDatum = (d: string) => {
  const [, m, dd] = d.split('-').map(Number);
  return m && dd ? `${dd}. ${m}.` : d;
};

const TON_IKONA: Record<TonPoznamky, { ikona: string; barva: string }> = {
  good: { ikona: 'check', barva: 'text-ok-ink' },
  warn: { ikona: 'warning', barva: 'text-wait-ink' },
  info: { ikona: 'info', barva: 'text-info-ink' },
};

/**
 * Poctivé poznámky k číslům (a rady jiných widgetů financí) jako řádky
 * seznamu s tónovanou ikonou v jamce. Dřív každá poznámka byla vlastní
 * tónovaný box (třetí kopie téže mapy tónů) — na ploše s osmi widgety by
 * tónovaná plocha přerostla limit DP T4.
 */
export function RadyJakoSeznam({ rady, limit = Infinity }: {
  rady: { tone: TonPoznamky; title: string; text?: string; ikona?: string; doplnek?: ReactNode }[];
  limit?: number;
}) {
  const vidim = rady.slice(0, limit);
  return (
    <>
      <ul className="list">
        {vidim.map((r, i) => {
          const t = TON_IKONA[r.tone];
          return (
            <ListRow key={`${i}-${r.title}`}
              lead={(
                <span aria-hidden className="well grid h-9 w-9 shrink-0 place-items-center">
                  <Icon name={r.ikona ?? t.ikona} size={16} className={t.barva} />
                </span>
              )}
              title={<span className="block whitespace-normal text-pretty">{r.title}</span>}
              meta={r.text ? <span className="block whitespace-normal text-pretty">{r.text}</span> : undefined}
              right={r.doplnek}
            />
          );
        })}
      </ul>
      {rady.length > vidim.length && <p className="t-meta mt-2">…a dalších {(rady.length - vidim.length).toLocaleString('cs-CZ')}</p>}
    </>
  );
}

/** Tržba po hodinách: sloupky 0–23, nejsilnější hodina zvýrazněná, popisek každé tři hodiny. */
export function HodinyPokladny({ hodiny, vyska = 56 }: { hodiny: number[]; vyska?: number }) {
  const money = useMoney();
  const max = hodiny.reduce((m, v) => Math.max(m, v), 0);
  const spicka = max > 0 ? hodiny.indexOf(max) : undefined;
  return (
    <BarSpark height={vyska} showLabels highlight={spicka} label="Tržba po hodinách"
      data={hodiny.map((v, h) => ({ value: v, label: h % 3 === 0 ? String(h) : '', tip: `${h}:00 — ${money(v)}` }))} />
  );
}

/** Co se prodalo: řádek na produkt, kusy vlevo pod názvem, tržba v pravém sloupci. */
export function ProdanoPokladny({ polozky, limit, razeni = 'kusy' }: { polozky: PolozkaPokladny[]; limit: number; razeni?: 'kusy' | 'trzba' }) {
  const money = useMoney();
  const serazene = [...polozky].sort((a, b) => (razeni === 'trzba' ? (b.revenue ?? 0) - (a.revenue ?? 0) : b.qty - a.qty));
  const vidim = serazene.slice(0, limit);
  return (
    <>
      <ul className="list">
        {vidim.map(i => (
          <ListRow key={i.productId} title={i.name}
            meta={`${czCount(Math.round(i.qty), KUS)}${i.category ? ` · ${i.category}` : ''}`}
            value={<span className="tabular-nums">{i.revenue != null ? money(i.revenue) : '—'}</span>}
            valueMeta={i.revenue == null ? 'bez ceny' : undefined} />
        ))}
      </ul>
      {serazene.length > vidim.length && <p className="t-meta mt-2">…a dalších {(serazene.length - vidim.length).toLocaleString('cs-CZ')}</p>}
    </>
  );
}

/** Kdo kolik namarkoval: tržba a podíl v pravém sloupci, počet účtenek v meta řádku. */
export function ObsluhaPokladny({ obsluha, celkem, limit }: { obsluha: OsobaPokladny[]; celkem: number; limit: number }) {
  const money = useMoney();
  const vidim = obsluha.slice(0, limit);
  return (
    <>
      <ul className="list">
        {vidim.map(p => (
          <ListRow key={p.name} title={p.name} meta={czCount(p.bills, UCTENKA)}
            value={<span className="tabular-nums">{money(p.total)}</span>}
            valueMeta={celkem > 0 ? `${Math.round((p.total / celkem) * 100)} %` : undefined} />
        ))}
      </ul>
      {obsluha.length > vidim.length && <p className="t-meta mt-2">…a dalších {(obsluha.length - vidim.length).toLocaleString('cs-CZ')}</p>}
    </>
  );
}

/**
 * Den po dni proti uzávěrkám — rozbalovací, protože u třiceti dnů by jinak
 * přebil zbytek widgetu. Rozdíl nad práh je chip „wait", sedící den „ok".
 */
export function DnyPokladny({ dny, prah = 50 }: { dny: DenPokladny[]; prah?: number }) {
  const money = useMoney();
  const [otevreno, setOtevreno] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOtevreno(o => !o)} aria-expanded={otevreno}
        className="tap-target-sm inline-flex items-center gap-1.5 text-sm font-semibold text-[#16181A] hover:text-black">
        Den po dni ({dny.length.toLocaleString('cs-CZ')})
        <Icon name="chevron" size={15} className={`text-black/40 transition-transform ${otevreno ? 'rotate-180' : ''}`} />
      </button>
      {otevreno && (
        <ul className="list mt-2">
          {dny.map(d => (
            <ListRow key={d.day}
              title={<span className="tabular-nums">{pismenoDne(d.day)} {kratkeDatum(d.day)}</span>}
              meta={`${czCount(d.bills, UCTENKA)} · hotově ${money(d.cash)} · kartou ${money(d.card)}`}
              value={<span className="tabular-nums">{money(d.total)}</span>}
              right={d.diff == null ? undefined
                : Math.abs(d.diff) <= prah
                  ? <Chip tone="ok" size="sm" icon="check">sedí</Chip>
                  : <Chip tone="wait" size="sm">{d.diff > 0 ? '+' : '−'}{money(Math.abs(d.diff))}</Chip>} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Popisek součtu účtenek: „128 účtenek · ⌀ 164 Kč". */
export function popisUctenek(bills: number, prumer: number, money: (n: number) => string): string {
  return `${czCount(bills, UCTENKA)}${bills > 0 ? ` · průměr ${money(prumer)}` : ''}`;
}

