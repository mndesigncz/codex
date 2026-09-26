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

import type { DenPokladny, OsobaPokladny, PolozkaPokladny, TonRady } from '@/lib/financeWidgety';

// Výběr dat z /api/pos/daily a období jsou čistá logika v lib/financeWidgety (testuje se v Node);
// odsud se jen znovu vyvážejí, ať widgety tržeb berou všechno z jednoho místa.
export { obdobiPokladny, vyberDenniPokladnu, type DenniPokladna, type DenPokladny } from '@/lib/financeWidgety';
export type TonPoznamky = TonRady;

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

