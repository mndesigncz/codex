'use client';

// Widgety oblasti „Finance" — komponenty (kolo 69, balík B5b; spec §2.5, §2.6, §6.3).
//
// Vlastník v kole 69: balík B5b (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/finance.ts;
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — hlídá to test AK-20 v scripts/testy/k68-widgety.ts.
//
// Kontrakt (spec §2.6): komponenta dostane WidgetProps (instance, velikost, nastaveni,
// nahled), kreslí se vždy v obalu <Widget> z ../Widget, data bere jen přes useDataWidgetu
// (URL null, dokud neplatí brána z registru a useSmi pro pole), navigaci přes useNavigace.
// Soubor se stahuje líně, až když je widget oblasti na ploše (registr.ts).
//
// Co nahrazuje (audit Financí, audit-provoz-kontrola.txt):
//  - čtyři souhrnné karty s tmavou „Tržby" a rozmazanou skvrnou mimo systém, ručními
//    štítky 11 px verzálkami a číslem 20 px → Souhrn měsíce: Stat/StatRow, a na
//    Financích (stránka s `inkoust`) jediná inkoustová plocha podle DP §2.10;
//  - dlaždice Mzdy „0 Kč · z denních výplat" a Hrubý výsledek bez mezd pro roli bez
//    finance.mzdy (API posílalo `mzdySkryte`, FinanceView ho nečetl) → mzdy „skryto"
//    a výsledek „bez mezd";
//  - Kam šly peníze se stavovými barvami na kategoriích (bg-wait pro výdaje) → pruhy
//    v barvách kategorií (cat-dot), pod nimi co nejvíc leží ve skladu (N8, stockTop);
//  - Hosté a věrnost v jamkách se dvouřádkovými štítky → StatRow;
//  - Co vydělává (tabulka s ruční hlavičkou a vnitřním posuvníkem, rady v tónovaných
//    boxech) → Marže: řádky seznamu, rady s tónovanou ikonou;
//  - Doporučení, Ztráty a manka a Účtenky jako widgety místo bloků po obrazovkách.
//
// Měsíc: volba „Tento" = měsíc stránky. Finance ho mění přepínačem v hlavičce a dávají
// ho sem přes MesicStrankyFinanci; jinde (Přehled, TO GO) je to dnešní pražský měsíc
// (mesicZVolby v katalogu). Tentýž měsíc = tatáž URL = jeden dotaz na /api/finance
// pro souhrn, podíl mezd, Kam šly peníze, hosty, postřehy i knihu výdajů na stránce.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { mesicZVolby } from '@/lib/widgety/katalog/finance';
import {
  kamSlyPenize, mzdyMesice, podilMezd, urlFinanci, vyberFinance, zmenaProti as zmena, type FinanceMesice,
} from '@/lib/financeWidgety';
import { useT } from '@/lib/i18n/client';
import { aktualniJazyk } from '@/lib/i18n/stav';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';
import { pragueDaySafe, pragueToday } from '@/lib/pragueTime';
import { useMoney } from '../../CurrencyProvider';
import { Button, Chip, ListRow, Modal, Stat, StatRow } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { Widget, useWidget, type StavNacteni } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { RadyJakoSeznam, type TonPoznamky } from '../../employer/LiveRevenue';
import { PrvniRady, SkupinyDoporuceni, vyberDoporuceni } from '../../employer/FinanceAdvice';
import { NovaUctenka, SeznamUctenek, URL_UCTENEK, vyberUctenky } from '../../employer/ReceiptsPanel';

// ---------------------------------------------------------------------------
// Měsíc stránky a data /api/finance (sdílí je i FinanceView)
// ---------------------------------------------------------------------------

/** Měsíc z přepínače v hlavičce Financí („RRRR-MM"); mimo Finance null = dnešní měsíc. */
export const MesicStrankyFinanci = createContext<string | null>(null);

/** Widget stojí přímo na Financích — odkaz „Finance ›" by vedl na stránku, kde už je. */
export function useNaFinancich(): boolean {
  return useContext(MesicStrankyFinanci) != null;
}

function useMesic(volba: unknown): string {
  const zaklad = useContext(MesicStrankyFinanci) ?? pragueToday().slice(0, 7);
  return mesicZVolby(volba, zaklad);
}

// Výběr dat z /api/finance a výpočty (podíl mezd, Kam šly peníze) jsou čistá logika
// v lib/financeWidgety — testuje se v Node a sdílí ji i kniha výdajů ve FinanceView.

// ---------------------------------------------------------------------------
// Společné drobnosti
// ---------------------------------------------------------------------------

const cis = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Brána widgetu (spec §1.5): přísně `nacteno && ma()`; po chybě /api/teams/mine rozhodl server. */
function useBrana(id: string, zaloha: string[]): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  const d = widget(id);
  const vse = d ? d.opravneni.vse : zaloha;
  const nektere = d ? d.opravneni.nektere : [];
  const splni = (vse.length === 0 || vse.every(k => ma(k))) && (nektere.length === 0 || ma(nektere));
  return { ok: nacteno ? splni : chyba, ceka: !nacteno && !chyba };
}

const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

/** „září 2026" pro meta řádek (velké písmeno dodá cz-sentence). */
function nazevMesice(m: string): string {
  const [y, mm] = m.split('-').map(Number);
  if (!y || !mm) return m;
  return new Date(Date.UTC(y, mm - 1, 15)).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const sZnamenkem = (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)} %`;

/** Věta s údajem, který se kreslí zvlášť (tučně): překlad se rozdělí na text před a za ním. */
const KOTVA = '\u0001';
function rozdelVetu(t: ReturnType<typeof useT>, klic: string, nazev: string): [string, string] {
  const [pred, po = ''] = t(klic, { [nazev]: KOTVA }).split(KOTVA);
  return [pred, po];
}

/** Inkoustový údaj (DP §2.10): štítek white/55, číslo bíle; `velke` = 40 px (jen hlavní číslo). */
function InkoustoveCislo({ stitek, hodnota, poznamka, velke = false }: { stitek: string; hodnota: ReactNode; poznamka?: ReactNode; velke?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="t-label !text-white/55 truncate">{stitek}</p>
      <p className={velke
        ? 'mt-1.5 text-[2.5rem] leading-none font-bold tracking-tight tabular-nums text-white'
        : 'mt-1 text-[15px] font-semibold tabular-nums text-white truncate'}>{hodnota}</p>
      {poznamka && <p className="mt-1 text-[13px] text-white/60 truncate">{poznamka}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Souhrn měsíce
// ---------------------------------------------------------------------------

type Metrika = 'trzby' | 'nakupy' | 'mzdy' | 'vysledek';

function SouhrnMesice({ velikost, nastaveni }: WidgetProps<{ mesic: string; metrika: Metrika }>) {
  const t = useT('widgety');
  const money = useMoney();
  const { inkoust } = useWidget();
  const { ok, ceka } = useBrana('finance.souhrn_mesice', ['finance.zobrazit']);
  const mesic = useMesic(nastaveni.mesic);
  const data = useDataWidgetu(ok ? urlFinanci(mesic) : null, vyberFinance);
  const f = data.data;
  const naFinancich = useNaFinancich();

  let obsah: ReactNode = null;
  if (f) {
    const s = f.souhrn;
    const trend = zmena(s.revenue, s.prevRevenue);
    const pozTrzby = trend != null ? t('{zmena} proti minulému měsíci', { zmena: sZnamenkem(trend) }) : t('{n, plural, one {# uzávěrka} few {# uzávěrky} other {# uzávěrek}}', { n: s.closingsCount });
    // Bez finance.mzdy API mzdy nepošle a hrubý výsledek je bez nich — nula by lhala.
    const mzdy = s.mzdySkryte ? t('skryto') : money(mzdyMesice(f));
    const pozMzdy = s.mzdySkryte ? t('mzdy vidí jen role s oprávněním') : s.wagesWorked > 0 ? t('z docházky × sazby') : t('z denních výplat');
    const pozVysledek = s.mzdySkryte ? t('tržby − nákupy, bez mezd') : t('tržby − nákupy − mzdy');
    const polozky: Record<Metrika, { stitek: string; hodnota: string; poznamka: string }> = {
      trzby: { stitek: t('Tržby'), hodnota: money(s.revenue), poznamka: pozTrzby },
      nakupy: { stitek: t('Nákupy a výdaje'), hodnota: money(s.purchases), poznamka: t('účtenky, objednávky, kasa') },
      mzdy: { stitek: t('Mzdy'), hodnota: mzdy, poznamka: pozMzdy },
      vysledek: { stitek: t('Hrubý výsledek'), hodnota: money(s.gross), poznamka: pozVysledek },
    };
    const ostatni: Metrika[] = velikost === 'L' ? ['nakupy', 'mzdy', 'vysledek'] : ['vysledek'];
    if (velikost === 'S') {
      const m = polozky[nastaveni.metrika] ?? polozky.trzby;
      obsah = <Stat label={m.stitek} value={m.hodnota} note={m.poznamka} />;
    } else if (inkoust) {
      obsah = (
        <div className="min-w-0">
          <InkoustoveCislo velke stitek={t('Tržby')} hodnota={money(s.revenue)} poznamka={pozTrzby} />
          {/* Tři údaje se na telefonu nevejdou vedle sebe bez uříznutých štítků — dvě a dvě. */}
          <dl className={`mt-4 grid gap-3 border-t border-white/10 pt-3 ${ostatni.length === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'}`}>
            {ostatni.map(k => (
              <div key={k} className="min-w-0">
                <dt className="t-label !text-white/55 truncate">{polozky[k].stitek}</dt>
                <dd className="mt-1 text-[15px] font-semibold tabular-nums text-white truncate">{polozky[k].hodnota}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    } else {
      obsah = (
        <StatRow>
          {(['trzby', ...ostatni] as Metrika[]).map(k => <Stat key={k} label={polozky[k].stitek} value={polozky[k].hodnota} note={polozky[k].poznamka} />)}
        </StatRow>
      );
    }
  }

  return (
    <Widget nacteni={ceka ? CEKA : data} kostra="cislo"
      odkaz={velikost === 'S' || naFinancich ? undefined : { popisek: t('Finance'), pohled: 'finance' }}>
      {f && (
        <div className="space-y-3">
          {velikost !== 'S' && <p className={`t-meta cz-sentence ${inkoust ? '!text-white/60' : ''}`}>{nazevMesice(f.mesic || mesic)}</p>}
          {obsah}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Tržby vs. mzdy
// ---------------------------------------------------------------------------

function TrzbyVsMzdy({ velikost, nastaveni }: WidgetProps<{ mesic: string }>) {
  const t = useT('widgety');
  const money = useMoney();
  const { ok, ceka } = useBrana('finance.trzby_vs_mzdy', ['finance.zobrazit', 'finance.mzdy']);
  const mesic = useMesic(nastaveni.mesic);
  const data = useDataWidgetu(ok ? urlFinanci(mesic) : null, vyberFinance);
  const f = data.data;
  const s = f?.souhrn;
  const mzdy = f ? mzdyMesice(f) : 0;
  const pm = f ? podilMezd(f) : null;
  const podil = pm?.podil ?? null;
  const cil = pm?.cil ?? null;
  const nad = pm?.nadCilem === true;
  const trend = s ? zmena(s.revenue, s.prevRevenue) : null;

  let prazdno: ReactNode | undefined;
  if (f && s?.mzdySkryte) prazdno = <p className="t-meta">{t('Mzdy vidí jen role s oprávněním na mzdy.')}</p>;
  else if (f && podil == null) prazdno = <p className="t-meta">{t('Tenhle měsíc zatím nejsou tržby z uzávěrek.')}</p>;

  return (
    <Widget nacteni={ceka ? CEKA : data} kostra={velikost === 'S' ? 'cislo' : 'seznam'} prazdno={prazdno}
      doplnek={podil != null && cil != null ? <Chip tone={nad ? 'bad' : 'ok'} size="sm">{nad ? t('nad cílem') : t('v cíli')}</Chip> : undefined}>
      {s && podil != null && (velikost === 'S' ? (
        <Stat label={t('Mzdy z tržeb')} value={`${podil} %`} note={cil != null ? t('cíl {cil} %', { cil }) : t('cíl podniku není nastavený')} />
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[1.75rem] leading-none font-bold tracking-tight tabular-nums text-[#16181A]">{podil} %</p>
              <p className="t-meta">{cil != null ? t('cíl {cil} %', { cil }) : t('cíl podniku není nastavený')}</p>
            </div>
            {/* Pruh podílu s ryskou cíle; barva je stav (pod cílem ok, nad cílem bad). */}
            <div className="relative mt-3 h-2.5 rounded-full bg-black/[0.05]" role="img"
              aria-label={cil != null ? t('Mzdy tvoří {podil} % tržeb, cíl je {cil} %', { podil, cil }) : t('Mzdy tvoří {podil} % tržeb', { podil })}>
              <div className={`h-full rounded-full ${nad ? 'bg-bad' : 'bg-ok'}`} style={{ width: `${Math.min(100, podil)}%` }} />
              {cil != null && <span aria-hidden className="absolute -top-1 bottom-[-4px] w-0.5 rounded-full bg-[#16181A]" style={{ left: `${Math.min(100, cil)}%` }} />}
            </div>
          </div>
          <StatRow>
            <Stat label={t('Tržby')} value={money(s.revenue)} note={trend != null ? t('{zmena} proti minulému', { zmena: sZnamenkem(trend) }) : undefined} />
            <Stat label={t('Mzdy')} value={money(mzdy)} note={s.wagesWorked > 0 ? t('z docházky × sazby') : t('z denních výplat')} />
          </StatRow>
        </div>
      ))}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Kam šly peníze
// ---------------------------------------------------------------------------

function KamSlyPenize({ nastaveni }: WidgetProps<{ mesic: string }>) {
  const t = useT('widgety');
  const money = useMoney();
  const { ok, ceka } = useBrana('finance.kam_sly_penize', ['finance.zobrazit']);
  const mesic = useMesic(nastaveni.mesic);
  const data = useDataWidgetu(ok ? urlFinanci(mesic) : null, vyberFinance);
  const f = data.data;

  const radky = useMemo(() => {
    if (!f) return [];
    // Řádek mezd jen s finance.mzdy (pole `radek_mzdy`); API bez klíče mzdy vůbec nepošle.
    const popis = { nakupy: { stitek: t('Nákupy a účtenky'), barva: 'cat-dot-2' }, kasa: { stitek: t('Výdaje z kasy'), barva: 'cat-dot-5' }, mzdy: { stitek: t('Mzdy'), barva: 'cat-dot-3' } } as const;
    return kamSlyPenize(f).map(x => ({ ...x, ...popis[x.klic] }));
  }, [f, t]);

  return (
    <Widget nacteni={ceka ? CEKA : data}
      prazdno={f && radky.length === 0 ? <p className="t-meta">{t('Tenhle měsíc zatím žádné výdaje.')}</p> : undefined}>
      {f && radky.length > 0 && (
        <div className="space-y-3">
          <p className="t-meta cz-sentence">{nazevMesice(f.mesic || mesic)}</p>
          <ul className="space-y-3">
            {radky.map(x => (
              <li key={x.stitek}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-[#16181A] truncate">{x.stitek}</span>
                  <span className="font-semibold tabular-nums text-[#16181A]">{money(x.castka)}</span>
                </div>
                <div className="mt-1.5 h-2.5 rounded-full bg-black/[0.05] overflow-hidden" aria-hidden>
                  <div className={`h-full rounded-full ${x.barva}`} style={{ width: `${x.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {f.souhrn.mzdySkryte && <p className="t-meta">{t('Mzdy tu nejsou — vidí je jen role s oprávněním na mzdy.')}</p>}
          {f.souhrn.stockValue > 0 && (() => {
            const [pred, po] = rozdelVetu(t, 'Ve skladu leží zboží za {castka}', 'castka');
            return (
              <p className="t-meta text-pretty">
                {pred}<span className="font-semibold text-[#16181A] tabular-nums">{money(f.souhrn.stockValue)}</span>{po}
                {f.souhrn.stockTop.length > 0 && <> — {t('nejvíc {polozky}', { polozky: f.souhrn.stockTop.slice(0, 3).map(i => i.name).join(', ') })}</>}.
              </p>
            );
          })()}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Marže
// ---------------------------------------------------------------------------

interface PolozkaMarze { id: string; name: string; qty: number; revenue: number | null; cost: number | null; marginPct: number | null }
interface Marze {
  stav: 'ok' | 'nepropojeno' | 'plni';
  hlaska: string | null;
  marginPct: number | null; margin: number; noRecipe: number;
  polozky: PolozkaMarze[];
  rady: { icon: string; title: string; text: string; tone: TonPoznamky }[];
}

function vyberMarze(raw: any): Marze {
  if (!raw || typeof raw !== 'object') throw new Error('Marže přišly v nečekaném tvaru.');
  const t = raw.totals ?? {};
  return {
    stav: raw.connected !== true ? 'nepropojeno' : raw.ready === false ? 'plni' : 'ok',
    hlaska: typeof raw.error === 'string' ? raw.error : typeof raw.menuError === 'string' ? raw.menuError : null,
    marginPct: t.marginPct == null ? null : Number(t.marginPct),
    margin: cis(t.margin), noRecipe: cis(t.noRecipe),
    polozky: Array.isArray(raw.items) ? raw.items.map((i: any) => ({
      id: String(i?.productId ?? i?.name ?? ''), name: String(i?.name ?? ''), qty: cis(i?.qty),
      revenue: i?.revenue == null ? null : cis(i.revenue), cost: i?.cost == null ? null : cis(i.cost),
      marginPct: i?.marginPct == null ? null : Number(i.marginPct),
    })) : [],
    rady: Array.isArray(raw.insights) ? raw.insights.filter((i: any) => i && typeof i.title === 'string')
      .map((i: any) => ({ icon: typeof i.icon === 'string' ? i.icon : 'bulb', title: i.title, text: String(i.text ?? ''), tone: i.tone === 'good' || i.tone === 'warn' ? i.tone : 'info' })) : [],
  };
}

function MarzeWidget({ velikost, nastaveni }: WidgetProps<{ mesic: string; razeni: string }>) {
  const t = useT('widgety');
  const money = useMoney();
  const { ok, ceka } = useBrana('finance.marze', ['finance.marze']);
  const mesic = useMesic(nastaveni.mesic);
  const data = useDataWidgetu(ok ? `/api/pos/margins?month=${mesic}` : null, vyberMarze);
  const m = data.data;
  const sMarzi = (m?.polozky ?? []).filter(p => p.marginPct != null);

  let prazdno: ReactNode | undefined;
  if (m?.stav === 'nepropojeno') prazdno = <p className="t-meta">{t('Marže se počítá z prodejů v pokladně — pokladna není propojená.')}</p>;
  else if (m?.stav === 'plni') prazdno = <p className="t-meta text-pretty">{m.hlaska ?? t('Zrcadlo pokladny se teprve plní.')}</p>;
  else if (m && sMarzi.length === 0) prazdno = <p className="t-meta text-pretty">{t('Marže se počítá jen u položek s recepturou — žádná prodaná položka ji zatím nemá.')}</p>;

  const radek = (p: PolozkaMarze) => (
    <ListRow key={p.id} title={p.name || t('Bez názvu')}
      meta={`${t('{n, plural, one {# kus} few {# kusy} other {# kusů}}', { n: Math.round(p.qty) })}${p.cost != null ? ` · ${t('suroviny {castka}', { castka: money(p.cost * p.qty) })}` : ''}`}
      value={<span className="tabular-nums">{p.marginPct} %</span>}
      valueMeta={p.revenue != null ? money(p.revenue) : undefined} />
  );

  let obsah: ReactNode = null;
  if (m && sMarzi.length > 0) {
    if (velikost === 'S') {
      obsah = <Stat label={t('Marže')} value={m.marginPct != null ? `${m.marginPct} %` : '—'} note={t('na položkách s recepturou')} />;
    } else if (velikost === 'M') {
      const [pred, po] = rozdelVetu(t, 'Marže {pct} na položkách s recepturou', 'pct');
      const podleMarze = [...sMarzi].sort((a, b) => (b.marginPct ?? 0) - (a.marginPct ?? 0));
      obsah = (
        <div className="space-y-3">
          <p className="t-meta">{pred}<span className="font-semibold text-[#16181A] tabular-nums">{m.marginPct} %</span>{po}</p>
          <div>
            <p className="t-label mb-1">{t('Vydělává nejvíc')}</p>
            <ul className="list">{podleMarze.slice(0, 3).map(radek)}</ul>
          </div>
          {podleMarze.length > 3 && (
            <div>
              <p className="t-label mb-1">{t('Vydělává nejmíň')}</p>
              <ul className="list">{podleMarze.slice(-Math.min(3, podleMarze.length - 3)).reverse().map(radek)}</ul>
            </div>
          )}
        </div>
      );
    } else {
      const k = nastaveni.razeni;
      const serazene = [...m.polozky].sort((a, b) => (k === 'marze' ? (b.marginPct ?? -1) - (a.marginPct ?? -1)
        : k === 'kusy' ? b.qty - a.qty : (b.revenue ?? 0) - (a.revenue ?? 0)));
      obsah = (
        <div className="space-y-4">
          <StatRow>
            <Stat label={t('Marže')} value={m.marginPct != null ? `${m.marginPct} %` : '—'} note={t('na položkách s recepturou')} />
            <Stat label={t('Vydělaly')} value={money(m.margin)} note={t('tržba − suroviny')} />
            <Stat label={t('Bez receptury')} value={m.noRecipe.toLocaleString('cs-CZ')} note={t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: m.noRecipe })} />
          </StatRow>
          {m.rady.length > 0 && <RadyJakoSeznam rady={m.rady.map(r => ({ ...r, ikona: r.icon }))} />}
          <ul className="list">
            {serazene.slice(0, 20).map(p => (p.marginPct != null ? radek(p) : (
              <ListRow key={p.id} title={p.name || t('Bez názvu')} meta={`${t('{n, plural, one {# kus} few {# kusy} other {# kusů}}', { n: Math.round(p.qty) })} · ${t('bez receptury')}`}
                value={<span className="tabular-nums text-black/45">—</span>} valueMeta={p.revenue != null ? money(p.revenue) : undefined} />
            )))}
          </ul>
          {serazene.length > 20 && <p className="t-meta">{t('…a dalších {n}', { n: (serazene.length - 20).toLocaleString('cs-CZ') })}</p>}
        </div>
      );
    }
  }

  return (
    <Widget nacteni={ceka ? CEKA : data} kostra={velikost === 'S' ? 'cislo' : 'seznam'} prazdno={prazdno}
      odkaz={velikost === 'S' ? undefined : { popisek: t('Receptury'), pohled: 'recipes' }}>
      {obsah}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Hosté ve financích
// ---------------------------------------------------------------------------

function HosteVernost({ velikost, nastaveni }: WidgetProps<{ mesic: string }>) {
  const t = useT('widgety');
  const money = useMoney();
  const { ok, ceka } = useBrana('finance.hoste_vernost', ['finance.zobrazit']);
  const mesic = useMesic(nastaveni.mesic);
  const data = useDataWidgetu(ok ? urlFinanci(mesic) : null, vyberFinance);
  const g = data.data?.hoste;
  const nic = g && g.orders === 0 && g.members === 0 && g.couponsRedeemed === 0;

  return (
    <Widget nacteni={ceka ? CEKA : data}
      prazdno={nic ? <p className="t-meta">{t('Tenhle měsíc žádné objednávky od stolu ani členové věrnosti.')}</p> : undefined}>
      {g && !nic && (
        <div className="space-y-4">
          <StatRow>
            <Stat label={t('Od stolu')} value={g.orders.toLocaleString('cs-CZ')} note={t('{castka} celkem', { castka: money(g.total) })} />
            <Stat label={t('Mimo pokladnu')} value={g.offPos.toLocaleString('cs-CZ')} note={g.offPos > 0 ? t('{castka} chybí v tržbách', { castka: money(g.offPosTotal) }) : t('vše dorazilo do kasy')} />
            <Stat label={t('Členové')} value={g.members.toLocaleString('cs-CZ')} note={t('{n} nových', { n: g.newMembers.toLocaleString('cs-CZ') })} />
            <Stat label={t('Kupony')} value={g.couponsRedeemed.toLocaleString('cs-CZ')} note={t('uplatněno')} />
          </StatRow>
          {velikost === 'L' && g.offPos > 0 && (
            <p className="note note-wait text-[13px]">
              {t('Objednávky mimo pokladnu se nepropsaly do Storyous. Doúčtuj je u kasy, nebo v Managero client zapni automatické odesílání.')}
            </p>
          )}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Doporučení a postřehy
// ---------------------------------------------------------------------------

function Doporuceni({ velikost, nastaveni }: WidgetProps<{ mesic: string }>) {
  const t = useT('widgety');
  const { ok, ceka } = useBrana('finance.doporuceni', ['finance.analyza']);
  const mesic = useMesic(nastaveni.mesic);
  const data = useDataWidgetu(ok ? `/api/finance/advice?month=${mesic}` : null, vyberDoporuceni);
  const d = data.data;
  return (
    <Widget nacteni={ceka ? CEKA : data}
      prazdno={d && d.rady.length === 0 ? <p className="t-meta text-pretty">{t('Za tenhle měsíc zatím není dost dat na doporučení. Přibudou z uzávěrek, docházky a prodejů v pokladně.')}</p> : undefined}>
      {d && d.rady.length > 0 && (velikost === 'L' ? <SkupinyDoporuceni d={d} /> : <PrvniRady d={d} />)}
    </Widget>
  );
}

function Postrehy({ velikost, nastaveni }: WidgetProps<{ mesic: string }>) {
  const t = useT('widgety');
  const { ok, ceka } = useBrana('finance.postrehy', ['finance.zobrazit']);
  const mesic = useMesic(nastaveni.mesic);
  const data = useDataWidgetu(ok ? urlFinanci(mesic) : null, vyberFinance);
  const p = data.data?.postrehy;
  return (
    <Widget nacteni={ceka ? CEKA : data}
      prazdno={p && p.length === 0 ? <p className="t-meta">{t('Tenhle měsíc zatím nic, co by stálo za řeč.')}</p> : undefined}>
      {p && p.length > 0 && <RadyJakoSeznam rady={p.map(x => ({ ...x, ikona: x.icon }))} limit={velikost === 'L' ? Infinity : 3} />}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Ztráty a manka
// ---------------------------------------------------------------------------

interface RadekZtraty { id: number; name: string; diff: number; unit: string; value: number | null; lossPct: number | null }
interface Ztraty {
  pripraveno: boolean;
  duvod: string | null;
  kdy: string | null;
  ztrata: number; prebytek: number; chybi: number; prebyva: number;
  radky: RadekZtraty[];
  rady: { icon: string; title: string; text: string; tone: TonPoznamky }[];
}

function vyberZtraty(raw: any): Ztraty {
  if (!raw || typeof raw !== 'object') throw new Error('Ztráty přišly v nečekaném tvaru.');
  const t = raw.totals ?? {};
  return {
    pripraveno: raw.ready === true,
    duvod: typeof raw.reason === 'string' ? raw.reason : null,
    kdy: raw.stocktake?.completedAt ? pragueDaySafe(raw.stocktake.completedAt) : null,
    ztrata: Math.abs(cis(t.lostValue)), prebytek: cis(t.surplusValue), chybi: cis(t.missing), prebyva: cis(t.surplus),
    radky: Array.isArray(raw.rows) ? raw.rows.map((r: any) => ({
      id: Number(r?.itemId), name: String(r?.name ?? ''), diff: cis(r?.diff), unit: String(r?.diffUnit ?? r?.unit ?? 'ks'),
      value: r?.value == null ? null : cis(r.value), lossPct: r?.lossPct == null ? null : Number(r.lossPct),
    })) : [],
    rady: Array.isArray(raw.insights) ? raw.insights.filter((i: any) => i && typeof i.title === 'string')
      .map((i: any) => ({ icon: typeof i.icon === 'string' ? i.icon : 'bulb', title: i.title, text: String(i.text ?? ''), tone: i.tone === 'good' || i.tone === 'warn' ? i.tone : 'info' })) : [],
  };
}

const denVetou = (d: string) => {
  const [, m, dd] = d.split('-').map(Number);
  return m && dd ? `${dd}. ${m}.` : d;
};

function ZtratyWidget({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const money = useMoney();
  const { ok, ceka } = useBrana('finance.ztraty', ['finance.ztraty']);
  const data = useDataWidgetu(ok ? '/api/inventory/shrinkage' : null, vyberZtraty);
  const z = data.data;
  const chybejici = (z?.radky ?? []).filter(r => r.diff < 0);

  let prazdno: ReactNode | undefined;
  if (z && !z.pripraveno) prazdno = <p className="t-meta text-pretty">{z.duvod === 'notMigrated' ? t('Inventury ještě nejsou zapnuté.') : t('Ztráty se spočítají po první dokončené inventuře.')}</p>;
  else if (z && z.radky.length === 0) prazdno = <p className="t-meta">{t('Poslední inventura sedí — nic nechybí ani nepřebývá.')}</p>;

  const radek = (r: RadekZtraty) => (
    <ListRow key={r.id} title={r.name}
      meta={`${r.diff > 0 ? '+' : '−'}${Math.abs(r.diff).toLocaleString(LOCALE_PRO_JAZYK[aktualniJazyk()], { maximumFractionDigits: 3 })} ${r.unit}${r.lossPct != null ? ` · ${t('{pct} % z prodaného', { pct: r.lossPct })}` : ''}`}
      value={r.value != null ? <span className="tabular-nums">{r.value > 0 ? '+' : '−'}{money(Math.abs(r.value))}</span> : <span className="text-black/45">{t('bez ceny')}</span>} />
  );

  return (
    <Widget nacteni={ceka ? CEKA : data} kostra={velikost === 'S' ? 'cislo' : 'seznam'} prazdno={prazdno}
      odkaz={velikost === 'S' ? undefined : { popisek: t('Sklad'), pohled: 'inventory' }}>
      {z?.pripraveno && z.radky.length > 0 && (velikost === 'S' ? (
        <Stat label={t('Chybí za')} value={money(z.ztrata)} note={z.kdy ? t('inventura {datum}', { datum: denVetou(z.kdy) }) : undefined} />
      ) : (
        <div className="space-y-3">
          <p className="t-meta">{z.kdy ? t('Inventura {datum}', { datum: denVetou(z.kdy) }) : t('Poslední inventura')}</p>
          <StatRow>
            <Stat label={t('Chybí')} value={money(z.ztrata)} note={t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: z.chybi })} />
            <Stat label={t('Přebývá')} value={money(z.prebytek)} note={t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: z.prebyva })} />
          </StatRow>
          {velikost === 'L' && z.rady.length > 0 && <RadyJakoSeznam rady={z.rady.map(r => ({ ...r, ikona: r.icon }))} />}
          {chybejici.length > 0 && (
            <div>
              <p className="t-label mb-1">{t('Nejdražší ztráty')}</p>
              <ul className="list">{(velikost === 'L' ? z.radky : chybejici).slice(0, velikost === 'L' ? 30 : 5).map(radek)}</ul>
              {velikost === 'M' && chybejici.length > 5 && <p className="t-meta mt-2">{t('…a dalších {n}', { n: (chybejici.length - 5).toLocaleString('cs-CZ') })}</p>}
            </div>
          )}
        </div>
      ))}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Účtenky z nákupů
// ---------------------------------------------------------------------------

function Uctenky({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const money = useMoney();
  const smi = useSmi();
  const nav = useNavigace();
  const { ok, ceka } = useBrana('finance.uctenky', []);
  const data = useDataWidgetu(ok ? URL_UCTENEK : null, vyberUctenky);
  const [nova, setNova] = useState(false);
  const naFinancich = useNaFinancich();
  const u = data.data;
  const smiPridat = ok && smi('finance.uctenky_pridat') && !nahled;
  const tentoMesic = pragueToday().slice(0, 7);
  const mesicni = (u ?? []).filter(r => pragueDaySafe(r.createdAt).startsWith(tentoMesic));
  const soucet = mesicni.reduce((s, r) => s + (r.amount ?? 0), 0);
  const [pred, po] = rozdelVetu(t, 'Tento měsíc {castka}', 'castka');
  const nafotit = smiPridat ? (
    <Button variant={velikost === 'S' ? 'primary' : 'secondary'} size="sm" icon="camera" onClick={() => setNova(true)}>{t('Nafotit')}</Button>
  ) : null;

  return (
    <>
      <Widget nacteni={ceka ? CEKA : data} kostra={velikost === 'S' ? 'cislo' : 'seznam'}
        odkaz={velikost !== 'S' && !naFinancich && nav.smiPohled('finance') && smi('finance.zobrazit') ? { popisek: t('Finance'), pohled: 'finance' } : undefined}
        prazdno={u && u.length === 0 ? (
          <div className="space-y-3">
            <p className="t-meta text-pretty">{smiPridat ? t('Zatím žádná účtenka. Nafoť ji hned po nákupu — do Financí se propíše sama.') : t('Zatím žádná účtenka.')}</p>
            {nafotit}
          </div>
        ) : undefined}>
        {u && u.length > 0 && (velikost === 'S' ? (
          <div className="space-y-3">
            <Stat label={t('Tento měsíc')} value={money(soucet)} note={t('{n, plural, one {# účtenka} few {# účtenky} other {# účtenek}}', { n: mesicni.length })} />
            {nafotit}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="t-meta">{pred}<span className="font-semibold text-[#16181A] tabular-nums">{money(soucet)}</span>{po} · {t('{n, plural, one {# účtenka} few {# účtenky} other {# účtenek}}', { n: mesicni.length })}</p>
            <SeznamUctenek uctenky={u} limit={velikost === 'M' ? 5 : 30} sFotkou={velikost === 'L'}
              smiMazat={velikost === 'L' && !nahled && smi('finance.uctenky_upravit')} />
            {nafotit}
          </div>
        ))}
      </Widget>
      {smiPridat && (
        <Modal open={nova} onClose={() => setNova(false)} size="md" title={t('Nová účtenka')} subtitle={t('Vyfoť ji a připiš, kde a za kolik')}>
          <NovaUctenka onUlozeno={() => setNova(false)} />
        </Modal>
      )}
    </>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'finance.souhrn_mesice': SouhrnMesice,
  'finance.trzby_vs_mzdy': TrzbyVsMzdy,
  'finance.kam_sly_penize': KamSlyPenize,
  'finance.marze': MarzeWidget,
  'finance.hoste_vernost': HosteVernost,
  'finance.doporuceni': Doporuceni,
  'finance.postrehy': Postrehy,
  'finance.ztraty': ZtratyWidget,
  'finance.uctenky': Uctenky,
};
