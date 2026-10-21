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

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { mesicZVolby } from '@/lib/widgety/katalog/finance';
import {
  KVADRANTY, kamSlyPenize, kcNaHodinuPoDnech, maticeMenu, mzdyDnes, mzdyMesice, podilMezd, podilNakladu, rozsahMesicu, rozsahSrovnani,
  trzbaNaHodinu, urlFinanci, vyberDochazkuDnes, vyberFinance, zmenaProti as zmena, zmenySouhrnu,
  type FinanceMesice, type Kvadrant, type PolozkaMatice, type SrovnaniFinanci,
} from '@/lib/financeWidgety';
import { useUlozeno } from '@/lib/useUlozeno';
import { fmtDenVTydnu } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/client';
import { aktualniJazyk } from '@/lib/i18n/stav';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';
import { pragueDaySafe, pragueToday } from '@/lib/pragueTime';
import { useMoney } from '../../CurrencyProvider';
import { Icon } from '../../Icons';
import { Avatar, BarSpark, Button, Chip, ListRow, Modal, Segmented, Sloupec, Stat, StatRow, type ChipTone } from '../../ui';
import { zmenaZtrat, type ZtrataInventury } from '@/lib/skladPrehled';
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

/**
 * Období z hlavičky Financí: měsíc „RRRR-MM", nebo od kola 8 rozsah měsíců „RRRR-MM:RRRR-MM"
 * (čtvrtletí, od začátku roku…); mimo Finance null = dnešní měsíc.
 */
export const MesicStrankyFinanci = createContext<string | null>(null);
/** S čím Finance srovnávají (předchozí období / stejné období loni); mimo Finance null = srovnání ze serveru (minulý měsíc). */
export const SrovnaniStrankyFinanci = createContext<SrovnaniFinanci | null>(null);

/** Widget stojí přímo na Financích — odkaz „Finance ›" by vedl na stránku, kde už je. */
export function useNaFinancich(): boolean {
  return useContext(MesicStrankyFinanci) != null;
}

function useMesic(volba: unknown): string {
  const zaklad = useContext(MesicStrankyFinanci) ?? pragueToday().slice(0, 7);
  return mesicZVolby(volba, zaklad);
}

/**
 * Jeden měsíc pro API, která rozsah neumějí (/api/pos/margins, /api/finance/advice): u rozsahu jeho
 * poslední měsíc; `vice` říká widgetu, ať to v meta řádku přizná („za říjen 2026").
 */
function useJedenMesic(volba: unknown): { mesic: string; vice: boolean } {
  const obdobi = useMesic(volba);
  const r = rozsahMesicu(obdobi);
  return { mesic: r.do, vice: r.od !== r.do };
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

/** Monitor (od `md`)? Na serveru „ne" — hydratace pak sedí s telefonem. Sdílí i oblast tržeb (heat mapa). */
const DOTAZ_SIROKA = '(min-width: 768px)';
export function useSiroka(): boolean {
  return useSyncExternalStore(
    (cb) => { const mq = window.matchMedia?.(DOTAZ_SIROKA); if (!mq) return () => {}; mq.addEventListener?.('change', cb); return () => mq.removeEventListener?.('change', cb); },
    () => window.matchMedia?.(DOTAZ_SIROKA).matches ?? false,
    () => false,
  );
}

/** „září 2026" pro meta řádek (velké písmeno dodá cz-sentence). */
function nazevMesice(m: string): string {
  const [y, mm] = m.split('-').map(Number);
  if (!y || !mm) return m;
  return new Date(Date.UTC(y, mm - 1, 15)).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const sZnamenkem = (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)} %`;

/** „září 2026", nebo u rozsahu „červenec 2026 – září 2026" (kolo 8). */
const nazevObdobi = (f: Pick<FinanceMesice, 'od' | 'do' | 'mesicu' | 'mesic'>): string =>
  (f.mesicu > 1 ? `${nazevMesice(f.od)} – ${nazevMesice(f.do)}` : nazevMesice(f.mesic || f.od));

/** Změna v procentech jako tónovaný text (zelená růst, oranžová pokles); null = nic. */
function Zmena({ pct, inkoust = false }: { pct: number | null; inkoust?: boolean }) {
  if (pct == null) return null;
  const barva = inkoust ? (pct >= 0 ? 'text-[#C8F542]' : 'text-bad-lift') : (pct >= 0 ? 'text-ok-ink' : 'text-wait-ink');
  return <span className={`tabular-nums font-medium ${barva}`}>{sZnamenkem(pct)}</span>;
}

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

type Metrika = 'trzby' | 'nakupy' | 'mzdy' | 'spropitne' | 'pevne' | 'vysledek';

function SouhrnMesice({ velikost, nastaveni }: WidgetProps<{ mesic: string; metrika: Metrika }>) {
  const t = useT('widgety');
  const money = useMoney();
  const { inkoust } = useWidget();
  const { ok, ceka } = useBrana('finance.souhrn_mesice', ['finance.zobrazit']);
  const mesic = useMesic(nastaveni.mesic);
  const data = useDataWidgetu(ok ? urlFinanci(mesic) : null, vyberFinance);
  const f = data.data;
  const naFinancich = useNaFinancich();
  // Srovnání (kolo 8): na Financích podle přepínače v hlavičce (předchozí období / loni) — druhý dotaz na
  // srovnávané období dá změnu všem čtyřem číslům. Jinde stačí prevRevenue ze serveru.
  const srovnani = useContext(SrovnaniStrankyFinanci);
  const pred = useDataWidgetu(ok && srovnani ? urlFinanci(rozsahSrovnani(mesic, srovnani)) : null, vyberFinance);
  const zmeny = useMemo(() => (f ? zmenySouhrnu(f, srovnani ? pred.data : null) : null), [f, pred.data, srovnani]);
  const vice = (f?.mesicu ?? 1) > 1;
  const protiCemu = srovnani === 'loni' ? t('proti stejnému období loni') : srovnani === 'predchozi' || vice ? t('proti předchozímu období') : t('proti minulému měsíci');

  let obsah: ReactNode = null;
  if (f && zmeny) {
    const s = f.souhrn;
    const trend = zmeny.trzby;
    // „z uzávěrek": Tržba po dnech vedle ukazuje číslo z pokladny za jiné období — bez zdroje to vypadalo jako chyba (V12).
    const pozTrzby = `${t('z uzávěrek')} · ${trend != null ? `${sZnamenkem(trend)} ${protiCemu}` : t('{n, plural, one {# uzávěrka} few {# uzávěrky} other {# uzávěrek}}', { n: s.closingsCount })}`;
    // Bez finance.mzdy API mzdy nepošle a hrubý výsledek je bez nich — nula by lhala.
    const mzdy = s.mzdySkryte ? t('skryto') : money(mzdyMesice(f));
    const pozMzdy = s.mzdySkryte ? t('mzdy vidí jen role s oprávněním') : s.wagesWorked > 0 ? t('z docházky × sazby') : t('z denních výplat');
    // Pevné náklady (kolo 81): v L samostatný údaj jen tam, kde mřížka zůstane sudá (bez spropitného);
    // se spropitným jde částka do poznámky výsledku. Bez vyplněných nákladů výsledek řekne, že je bez nájmu.
    const zaklad: Metrika[] = ['nakupy', 'mzdy', ...(s.tips > 0 ? ['spropitne' as const] : [])];
    const sPevnymi = velikost === 'L' && s.fixedCostsSet && zaklad.length % 2 === 0;
    const pozVysledek = !s.fixedCostsSet
      ? t('bez nájmu a energií — doplň ve Financích › ··· › Pravidelné náklady')
      : sPevnymi ? t('po nájmu a energiích') : t('po nájmu a energiích ({castka})', { castka: money(s.fixedCosts) });
    // Změna v % u čtyř čísel (jen se srovnávaným obdobím): v poznámce Statu, na inkoustu vedle čísla.
    const sProcentem = (poznamka: string, pct: number | null) => (pct != null ? `${sZnamenkem(pct)} ${protiCemu} · ${poznamka}` : poznamka);
    const polozky: Record<Metrika, { stitek: string; hodnota: string; poznamka: string; zmena: number | null }> = {
      trzby: { stitek: t('Tržby'), hodnota: money(s.revenue), poznamka: pozTrzby, zmena: zmeny.trzby },
      nakupy: { stitek: t('Nákupy a výdaje'), hodnota: money(s.purchases), poznamka: sProcentem(t('účtenky, objednávky, kasa'), zmeny.nakupy), zmena: zmeny.nakupy },
      mzdy: { stitek: t('Mzdy'), hodnota: mzdy, poznamka: sProcentem(pozMzdy, zmeny.mzdy), zmena: zmeny.mzdy },
      // Spropitné není tržba podniku, ale majitel ho chce vidět vedle ní (Toast, Square): kolik tým za měsíc dostal.
      spropitne: { stitek: t('Spropitné'), hodnota: money(s.tips), poznamka: t('z uzávěrek, mimo tržbu'), zmena: null },
      // Nevyplněné pevné náklady nejsou „0 Kč" (malá S karta s touhle metrikou by tvrdila, že nájem nic nestojí).
      pevne: s.fixedCostsSet
        ? { stitek: t('Pevné náklady'), hodnota: money(s.fixedCosts), poznamka: vice ? t('nájem, energie — za {n, plural, one {# měsíc} few {# měsíce} other {# měsíců}}', { n: f.mesicu }) : t('nájem, energie — každý měsíc'), zmena: null }
        : { stitek: t('Pevné náklady'), hodnota: '—', poznamka: t('zatím nevyplněné — doplň ve Financích › ··· › Pravidelné náklady'), zmena: null },
      vysledek: { stitek: t('Výsledek'), hodnota: money(s.net), poznamka: sProcentem(pozVysledek, zmeny.vysledek), zmena: zmeny.vysledek },
    };
    const ostatni: Metrika[] = velikost === 'L' ? [...zaklad, ...(sPevnymi ? ['pevne' as const] : []), 'vysledek'] : ['vysledek'];
    if (velikost === 'S') {
      const m = polozky[nastaveni.metrika] ?? polozky.trzby;
      obsah = <Stat label={m.stitek} value={m.hodnota} note={m.poznamka} />;
    } else if (inkoust) {
      obsah = (
        <div className="min-w-0">
          <InkoustoveCislo velke stitek={t('Tržby')} hodnota={money(s.revenue)} poznamka={pozTrzby} />
          {/* Tři údaje se na telefonu nevejdou vedle sebe bez uříznutých štítků — dvě a dvě. */}
          <dl className={`mt-4 grid gap-3 border-t border-white/10 pt-3 ${ostatni.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : ostatni.length === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'}`}>
            {ostatni.map(k => (
              <div key={k} className="min-w-0">
                <dt className="t-label !text-white/55 truncate">{polozky[k].stitek}</dt>
                <dd className="mt-1 text-[15px] font-semibold tabular-nums text-white truncate">{polozky[k].hodnota}</dd>
                {polozky[k].zmena != null && <dd className="mt-0.5 text-[12px] truncate"><Zmena pct={polozky[k].zmena} inkoust /></dd>}
              </div>
            ))}
          </dl>
          {/* Inkoust kreslí údaje bez poznámek — u výsledku je ale poznámka to hlavní: po nájmu, nebo bez něj. */}
          <p className="mt-3 text-[13px] text-white/60 text-pretty">{t('Výsledek')}: {pozVysledek}</p>
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
    // Rozsah měsíců (kolo 8): karta se jmenuje „Souhrn období" a v meta řádku nese od–do a počet měsíců.
    <Widget nacteni={ceka ? CEKA : data} kostra="cislo" titulek={vice ? t('Souhrn období') : undefined}
      odkaz={velikost === 'S' || naFinancich ? undefined : { popisek: t('Finance'), pohled: 'finance' }}>
      {f && (
        <div className="space-y-3">
          {velikost !== 'S' && (
            <p className={`t-meta cz-sentence ${inkoust ? '!text-white/60' : ''}`}>
              {nazevObdobi(f)}{vice ? ` · ${t('{n, plural, one {# měsíc} few {# měsíce} other {# měsíců}}', { n: f.mesicu })}` : ''}
            </p>
          )}
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
  // Tržba na hodinu práce (kolo 8, R8-4): SPLH jako Toast a 7shifts. Podíl mezd skáče se sazbami, Kč/h říká,
  // jestli je obsluhy moc. Šipka proti minulému měsíci; po dnech v týdnu ve střední kartě.
  const kcH = s && !s.mzdySkryte ? trzbaNaHodinu(s.revenue, s.wagesHours) : null;
  const kcHMinule = s && !s.mzdySkryte ? trzbaNaHodinu(s.prevRevenue, s.prevWagesHours) : null;
  const zmenaKcH = kcH != null && kcHMinule != null && kcHMinule > 0 ? zmena(kcH, kcHMinule) : null;
  const poDnech = useMemo(() => (f ? kcNaHodinuPoDnech(f) : []), [f]);
  const jazyk = aktualniJazyk();
  const nejslabsi = poDnech.find(d => d.nejslabsi) ?? null;
  const radekKcH = kcH != null ? (
    <p className="t-meta mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span><span className="font-semibold tabular-nums text-[#16181A]">{money(kcH)}</span> {t('na hodinu práce')}</span>
      {zmenaKcH != null && (
        <span className={`tabular-nums font-medium ${zmenaKcH >= 0 ? 'text-ok-ink' : 'text-wait-ink'}`} aria-label={t('{zmena} proti minulému měsíci', { zmena: sZnamenkem(zmenaKcH) })}>
          {zmenaKcH >= 0 ? '↑' : '↓'} {sZnamenkem(zmenaKcH)}
        </span>
      )}
    </p>
  ) : null;

  let prazdno: ReactNode | undefined;
  if (f && s?.mzdySkryte) prazdno = <p className="t-meta">{t('Mzdy vidí jen role s oprávněním na mzdy.')}</p>;
  else if (f && podil == null) prazdno = <p className="t-meta">{f.mesicu > 1 ? t('Za tohle období nejsou tržby z uzávěrek.') : t('Tenhle měsíc zatím nejsou tržby z uzávěrek.')}</p>;

  return (
    // v3: stav proti cíli („v cíli" / „nad cílem") je v těle u čísla, ne v titulku — v titulku malé
    // karty (171 px) lámal název na dva řádky a soupeřil s ním o pozornost.
    <Widget nacteni={ceka ? CEKA : data} kostra={velikost === 'S' ? 'cislo' : 'seznam'} prazdno={prazdno}>
      {s && podil != null && (velikost === 'S' ? (
        <div>
          <Stat label={t('Mzdy z tržeb')} value={`${podil} %`} note={cil != null ? t('cíl {cil} %', { cil }) : t('cíl podniku není nastavený')} />
          {cil != null && <div className="mt-2"><ChipCile nad={nad} /></div>}
          {radekKcH}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[1.75rem] leading-none font-bold tracking-tight tabular-nums text-[#16181A]">{podil} %</p>
              <p className="t-meta flex items-center gap-1.5">{cil != null && <ChipCile nad={nad} />}{cil != null ? t('cíl {cil} %', { cil }) : t('cíl podniku není nastavený')}</p>
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
          {kcH != null && (
            <div>
              <p className="t-label">{t('Tržba na hodinu práce')}</p>
              {radekKcH}
              {poDnech.some(d => d.kcH != null) && (
                <div className="mt-2">
                  {/* Po–Ne průměr tržby na hodinu; nejslabší den zvýrazněný — tam je obsluhy nejvíc na tržbu. */}
                  <BarSpark height={44} showLabels highlight={nejslabsi ? nejslabsi.poradi : undefined}
                    label={t('Tržba na hodinu práce po dnech v týdnu')}
                    data={poDnech.map(d => ({ value: d.kcH, label: fmtDenVTydnu(d.poradi, { jazyk }), tip: `${fmtDenVTydnu(d.poradi, { jazyk, styl: 'dlouhy' })}: ${d.kcH != null ? money(d.kcH) : '—'}` }))} />
                  {nejslabsi && nejslabsi.kcH != null && (
                    <p className="t-meta mt-1 cz-sentence">{t('nejslabší {den} · {castka} na hodinu', { den: fmtDenVTydnu(nejslabsi.poradi, { jazyk, styl: 'dlouhy' }), castka: money(nejslabsi.kcH) })}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </Widget>
  );
}

/** Stav podílu mezd proti cíli podniku — chip v těle widgetu u čísla. */
function ChipCile({ nad }: { nad: boolean }) {
  const t = useT('widgety');
  return <Chip tone={nad ? 'bad' : 'ok'} size="sm">{nad ? t('nad cílem') : t('v cíli')}</Chip>;
}

// ---------------------------------------------------------------------------
// Mzdy dnes (kolo 8, R8-4): náklad směny proti dnešní tržbě, živě
// ---------------------------------------------------------------------------

const URL_DOCHAZKY_DNES = '/api/attendance?days=1';

/** Dnešní tržba z /api/pos/summary; propojená pokladna bez čísel (bills null) nemá co ukázat. */
function vyberTrzbuDne(raw: any): { propojeno: boolean; trzba: number } {
  return { propojeno: raw?.connected === true && raw?.bills != null, trzba: Number(raw?.total) || 0 };
}

function MzdyDnesWidget({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const money = useMoney();
  const smi = useSmi();
  const { ok, ceka } = useBrana('finance.mzdy_dnes', ['finance.mzdy', 'finance.trzby']);
  const dnes = pragueToday();
  const doch = useDataWidgetu(ok ? URL_DOCHAZKY_DNES : null, vyberDochazkuDnes);
  const pokladna = useDataWidgetu(ok ? `/api/pos/summary?date=${dnes}` : null, vyberTrzbuDne);
  // Cíl podílu mezd nese /api/finance (pole `cil_podniku`): bez finance.zobrazit se Chip nekreslí, dotaz neodejde.
  const finance = useDataWidgetu(ok && smi('finance.zobrazit') ? urlFinanci(dnes.slice(0, 7)) : null, vyberFinance);
  // „Teď" se posouvá s obnovou po 2 minutách (jako Pokladna dnes): běžící směna roste i bez nové odpovědi.
  const [ted, setTed] = useState(() => Date.now());
  const { reload: obnovDoch } = doch;
  const { reload: obnovPokladnu } = pokladna;
  useEffect(() => {
    if (!ok || nahled) return;
    const i = setInterval(() => { setTed(Date.now()); obnovDoch(); obnovPokladnu(); }, 120_000);
    return () => clearInterval(i);
  }, [ok, nahled, obnovDoch, obnovPokladnu]);

  const m = useMemo(() => (doch.data ? mzdyDnes(doch.data, ted, dnes) : null), [doch.data, ted, dnes]);
  const trzba = pokladna.data?.propojeno ? pokladna.data.trzba : null;
  const podil = m && trzba != null ? podilNakladu(m.naklad, trzba) : null;
  const cil = finance.data?.souhrn.laborTargetPct ?? null;
  const nad = podil != null && cil != null && podil > cil;
  const cas = (d: Date) => d.toLocaleTimeString(LOCALE_PRO_JAZYK[aktualniJazyk()], { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' });
  const nic = m && m.naklad === 0 && m.lide.length === 0 && m.doKonce === 0;

  // Poznámka pod číslem: podíl z tržby (S krátce, M i s částkou tržby), nebo proč podíl není.
  const pozTrzby = podil != null
    ? velikost === 'S' ? t('{podil} % z tržby', { podil }) : t('{podil} % z dnešní tržby {castka}', { podil, castka: money(trzba ?? 0) })
    : pokladna.data && !pokladna.data.propojeno ? t('pokladna není propojená') : t('dnes zatím bez tržby');
  const pozKonec = m && m.doKonce > 0 ? t('do konce plánu ještě ~{castka}', { castka: money(m.doKonce) }) : null;

  return (
    <Widget nacteni={ceka ? CEKA : [doch, pokladna]} kostra="cislo"
      odkaz={velikost === 'S' ? undefined : { popisek: t('Docházka'), pohled: 'attendance' }}
      prazdno={nic ? <p className="t-meta">{t('Dnes zatím nikdo nebyl na směně.')}</p> : undefined}>
      {/* v3: „v cíli" pod číslem, ne v titulku (viz Mzdy za období). */}
      {m && !nic && (velikost === 'S' ? (
        // Malá karta: jedno číslo a krátká poznámka; odhad do konce plánu na vlastním řádku (poznámka Statu se zkracuje).
        <div>
          <Stat label={t('Náklad do teď')} value={money(m.naklad)} note={pozTrzby} />
          {pozKonec && <p className="t-meta mt-1 text-pretty">{pozKonec}</p>}
          {podil != null && cil != null && <div className="mt-2"><ChipCile nad={nad} /></div>}
        </div>
      ) : (
        <div className="space-y-4">
          {podil != null && cil != null && <ChipCile nad={nad} />}
          <StatRow podleKarty>
            <Stat label={t('Náklad do teď')} value={money(m.naklad)} note={pozTrzby} />
            <Stat label={t('Do konce plánu')} value={m.doKonce > 0 ? `~${money(m.doKonce)}` : '—'} note={m.doKonce > 0 ? t('zbytek směn podle rozvrhu') : t('nikdo už nemá přijít')} />
          </StatRow>
          {m.lide.length > 0 && (
            <div>
              <p className="t-label mb-1">{t('{n, plural, one {# člověk na směně} few {# lidé na směně} other {# lidí na směně}}', { n: m.lide.length })}</p>
              <ul className="list">
                {m.lide.map(l => (
                  <ListRow key={l.id} lead={<Avatar emoji={l.avatar} name={l.jmeno} size="sm" />} title={l.jmeno}
                    meta={[t('od {cas}', { cas: cas(l.od) }), l.planDo ? t('do {cas}', { cas: l.planDo }) : null, l.sazba != null ? t('{castka}/h', { castka: money(l.sazba) }) : t('bez sazby')].filter(Boolean).join(' · ')}
                    value={l.sazba != null ? <span className="tabular-nums">{money(l.naklad)}</span> : <span className="text-black/45">—</span>} />
                ))}
              </ul>
            </div>
          )}
          {m.bezSazby > 0 && <p className="t-meta">{t('{n, plural, one {# člověk bez sazby} few {# lidé bez sazby} other {# lidí bez sazby}} — jejich náklad v součtu chybí.', { n: m.bezSazby })}</p>}
          {!m.sHotovymi && <p className="t-meta">{t('Jen běžící směny — hotové dnešní směny vidí role s oprávněním na docházku.')}</p>}
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
      prazdno={f && radky.length === 0 ? <p className="t-meta">{f.mesicu > 1 ? t('Za tohle období žádné výdaje.') : t('Tenhle měsíc zatím žádné výdaje.')}</p> : undefined}>
      {f && radky.length > 0 && (
        <div className="space-y-3">
          <p className="t-meta cz-sentence">{nazevObdobi(f)}</p>
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
  /** Cílová marže, kterou si podnik nastavil (Nastavení › Profil podniku); null = nenastavil. */
  cil: number | null;
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
    cil: raw.target?.nastaveno === true && Number.isFinite(Number(raw.target?.pct)) ? Number(raw.target.pct) : null,
    polozky: Array.isArray(raw.items) ? raw.items.map((i: any) => ({
      id: String(i?.productId ?? i?.name ?? ''), name: String(i?.name ?? ''), qty: cis(i?.qty),
      revenue: i?.revenue == null ? null : cis(i.revenue), cost: i?.cost == null ? null : cis(i.cost),
      marginPct: i?.marginPct == null ? null : Number(i.marginPct),
    })) : [],
    rady: Array.isArray(raw.insights) ? raw.insights.filter((i: any) => i && typeof i.title === 'string')
      .map((i: any) => ({ icon: typeof i.icon === 'string' ? i.icon : 'bulb', title: i.title, text: String(i.text ?? ''), tone: i.tone === 'good' || i.tone === 'warn' ? i.tone : 'info' })) : [],
  };
}

/** Tón a popis kvadrantu: hvězdy držet, tahouni zvážit cenu, hádanky propagovat, psi zvážit vyřazení. */
function popisKvadrantu(t: ReturnType<typeof useT>): Record<Kvadrant, { nazev: string; akce: string; ton: ChipTone; kdo: string }> {
  return {
    hvezdy: { nazev: t('Hvězdy'), akce: t('držet'), ton: 'ok', kdo: t('oblíbené a s vysokou marží') },
    tahouni: { nazev: t('Tahouni'), akce: t('zvážit cenu'), ton: 'info', kdo: t('oblíbené, ale s nízkou marží') },
    hadanky: { nazev: t('Hádanky'), akce: t('propagovat'), ton: 'wait', kdo: t('vysoká marže, málo se prodávají') },
    psi: { nazev: t('Psi'), akce: t('zvážit vyřazení'), ton: 'bad', kdo: t('málo se prodávají a málo vydělají') },
  };
}

/** Body grafu v inkoustových odstínech stavových tokenů (na bílé kartě je světlá limetka nečitelná). */
const BARVA_KVADRANTU: Record<Kvadrant, string> = { hvezdy: 'var(--ok-ink)', tahouni: 'var(--info-ink)', hadanky: 'var(--wait-ink)', psi: 'var(--bad-ink)' };

/**
 * Matice menu (kolo 8, R8-4): na monitoru bodový graf (x = prodané kusy, y = marže v %) s čarami průměrů
 * a čtyřmi kvadranty, pod ním Chipy s počty, které filtrují seznam; na telefonu místo grafu čtyři
 * sbalitelné sekce se seznamy. Klepnutí na položku otevře její recepturu.
 */
function MaticeMenu({ polozky, nahled }: { polozky: PolozkaMarze[]; nahled: boolean }) {
  const t = useT('widgety');
  const money = useMoney();
  const nav = useNavigace();
  const siroka = useSiroka();
  const m = useMemo(() => maticeMenu(polozky), [polozky]);
  const popisy = popisKvadrantu(t);
  const [filtr, setFiltr] = useState<Kvadrant | null>(null);
  const [rozbalene, setRozbalene] = useState<Record<Kvadrant, boolean>>({ hvezdy: true, tahouni: false, hadanky: false, psi: false });
  const smiReceptury = !nahled && nav.smiPohled('recipes');
  const otevri = (p: PolozkaMatice) => { if (smiReceptury) nav.onNavigate('recipes', p.id); };
  const radek = (p: PolozkaMatice) => (
    <ListRow key={p.id} title={p.name}
      meta={`${t('{n, plural, one {# kus} few {# kusy} other {# kusů}}', { n: Math.round(p.qty) })}${p.revenue != null ? ` · ${money(p.revenue)}` : ''}`}
      value={<span className="tabular-nums">{p.marginPct} %</span>}
      onClick={smiReceptury ? () => otevri(p) : undefined} />
  );
  if (m.polozky.length === 0) return <p className="t-meta">{t('Matice potřebuje aspoň jednu prodanou položku s recepturou.')}</p>;

  // Graf: osy s rezervou, body podle kvadrantu, čáry průměrů; popisky kvadrantů v rozích. Souřadnice v „pixelech"
  // karty L (600 × 260, strop výšky), ať se písmo a body neškálují s šířkou monitoru.
  const maxKusy = Math.max(1, ...m.polozky.map(p => p.qty)) * 1.08;
  const W = 600, H = 260, PX = 36, PY = 28;
  const x = (q: number) => PX + (q / maxKusy) * (W - PX - 12);
  const y = (pct: number) => H - PY - (Math.max(0, Math.min(100, pct)) / 100) * (H - PY - 14);
  const graf = (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Matice menu: prodané kusy proti marži, čáry průměrů dělí hvězdy, tahouny, hádanky a psy')} className="w-full h-auto max-h-[260px] block text-[#16181A]">
        <line x1={PX} y1={H - PY} x2={W - 12} y2={H - PY} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
        <line x1={PX} y1={12} x2={PX} y2={H - PY} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
        <line x1={x(m.prumerKusy)} y1={12} x2={x(m.prumerKusy)} y2={H - PY} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="4 4" />
        <line x1={PX} y1={y(m.prumerMarze)} x2={W - 12} y2={y(m.prumerMarze)} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="4 4" />
        {([['hadanky', PX + 8, 24], ['hvezdy', W - 16, 24], ['psi', PX + 8, H - PY - 8], ['tahouni', W - 16, H - PY - 8]] as [Kvadrant, number, number][]).map(([k, kx, ky]) => (
          <text key={k} x={kx} y={ky} fontSize="12" fontWeight="600" fill="currentColor" fillOpacity="0.45" textAnchor={kx > W / 2 ? 'end' : 'start'}>{popisy[k].nazev}</text>
        ))}
        {m.polozky.map(p => (
          <g key={p.id} className={smiReceptury ? 'cursor-pointer' : undefined} onClick={() => otevri(p)} opacity={filtr && filtr !== p.kvadrant ? 0.25 : 1}>
            <title>{`${p.name}: ${t('{n, plural, one {# kus} few {# kusy} other {# kusů}}', { n: Math.round(p.qty) })}, ${p.marginPct} %`}</title>
            <circle cx={x(p.qty)} cy={y(p.marginPct)} r="7" fill={BARVA_KVADRANTU[p.kvadrant]} stroke="white" strokeWidth="2" />
            {/* Jméno u bodu: na monitoru je místo, v grafu se tak nemusí hledat kurzorem. */}
            <text x={x(p.qty) + (x(p.qty) > W * 0.8 ? -11 : 11)} y={y(p.marginPct) + 4} fontSize="11" fill="currentColor" fillOpacity="0.8" textAnchor={x(p.qty) > W * 0.8 ? 'end' : 'start'}>{p.name}</text>
          </g>
        ))}
        <text x={W - 12} y={H - 8} fontSize="11" fill="currentColor" fillOpacity="0.45" textAnchor="end">{t('prodané kusy →')}</text>
        <text x={12} y={H - PY} fontSize="11" fill="currentColor" fillOpacity="0.45" textAnchor="start" transform={`rotate(-90 12 ${H - PY})`}>{t('marže % →')}</text>
      </svg>
      <p className="t-meta">{t('Vlevo nahoře hádanky, vpravo nahoře hvězdy, vlevo dole psi, vpravo dole tahouni · průměr {kusy} kusů a {marze} %', { kusy: Math.round(m.prumerKusy), marze: Math.round(m.prumerMarze) })}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {siroka ? (
        <>
          {graf}
          <div role="group" aria-label={t('Kvadranty')} className="flex flex-wrap gap-2">
            {KVADRANTY.map(k => (
              <button key={k} type="button" aria-pressed={filtr === k} onClick={() => setFiltr(filtr === k ? null : k)}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542]" title={popisy[k].kdo}>
                <Chip tone={popisy[k].ton} className={filtr && filtr !== k ? 'opacity-50' : ''}>{popisy[k].nazev} — {popisy[k].akce} <span className="tabular-nums opacity-70">{m.pocty[k]}</span></Chip>
              </button>
            ))}
          </div>
          <ul className="list">{m.polozky.filter(p => !filtr || p.kvadrant === filtr).slice(0, 30).map(radek)}</ul>
        </>
      ) : (
        // Telefon: čtyři sbalitelné sekce — graf by na 390 px neuměl ukázat jména.
        <div className="space-y-2">
          {KVADRANTY.map(k => {
            const seznam = m.polozky.filter(p => p.kvadrant === k);
            const otevreno = rozbalene[k];
            return (
              <section key={k} aria-label={popisy[k].nazev}>
                <button type="button" aria-expanded={otevreno} onClick={() => setRozbalene(r => ({ ...r, [k]: !r[k] }))}
                  className="tap-target flex w-full items-center justify-between gap-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] rounded-lg">
                  <span className="flex min-w-0 items-center gap-2">
                    <Chip tone={popisy[k].ton} size="sm">{popisy[k].nazev} <span className="tabular-nums opacity-70">{m.pocty[k]}</span></Chip>
                    <span className="t-meta truncate">{popisy[k].akce}</span>
                  </span>
                  <Icon name={otevreno ? 'chevronUp' : 'chevron'} size={15} className="shrink-0 text-black/45" />
                </button>
                {otevreno && (seznam.length === 0 ? <p className="t-meta pb-2">{t('Nic — {kdo}.', { kdo: popisy[k].kdo })}</p> : <ul className="list">{seznam.slice(0, 15).map(radek)}</ul>)}
              </section>
            );
          })}
        </div>
      )}
      {m.bezReceptury > 0 && <p className="t-meta">{t('{n, plural, one {# položka bez receptury} few {# položky bez receptury} other {# položek bez receptury}} — bez nákladu nejde do matice.', { n: m.bezReceptury })}</p>}
    </div>
  );
}

function MarzeWidget({ velikost, nastaveni, nahled }: WidgetProps<{ mesic: string; razeni: string }>) {
  const t = useT('widgety');
  const money = useMoney();
  const { ok, ceka } = useBrana('finance.marze', ['finance.marze']);
  // Velká karta: Seznam, nebo Matice (oblíbenost × marže) — volba se pamatuje v prohlížeči.
  const [pohled, setPohled] = useUlozeno<'seznam' | 'matice'>('marze-pohled', 'seznam', ['seznam', 'matice']);
  const { mesic, vice } = useJedenMesic(nastaveni.mesic);
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
    // Poznámka s cílem podniku, když ho nastavil („na položkách s recepturou · cíl 60 %").
    const sCilem = (veta: string) => (m.cil != null ? `${veta} · ${t('cíl {n} %', { n: m.cil })}` : veta);
    // Marže se počítá po měsících: u rozsahu stránky (čtvrtletí) je to poslední měsíc a karta to řekne.
    const zaMesic = vice ? <p className="t-meta cz-sentence">{t('za {mesic}', { mesic: nazevMesice(mesic) })}</p> : null;
    if (velikost === 'S') {
      obsah = <Stat label={t('Marže')} value={m.marginPct != null ? `${m.marginPct} %` : '—'} note={sCilem(vice ? t('za {mesic}', { mesic: nazevMesice(mesic) }) : t('na položkách s recepturou'))} />;
    } else if (velikost === 'M') {
      const [pred, po] = rozdelVetu(t, 'Marže {pct} na položkách s recepturou', 'pct');
      const podleMarze = [...sMarzi].sort((a, b) => (b.marginPct ?? 0) - (a.marginPct ?? 0));
      obsah = (
        <div className="space-y-3">
          {zaMesic}
          <p className="t-meta">{pred}<span className="font-semibold text-[#16181A] tabular-nums">{m.marginPct} %</span>{po}{m.cil != null ? ` · ${t('cíl {n} %', { n: m.cil })}` : ''}</p>
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
          {zaMesic}
          <StatRow>
            <Stat label={t('Marže')} value={m.marginPct != null ? `${m.marginPct} %` : '—'} note={sCilem(t('na položkách s recepturou'))} />
            <Stat label={t('Vydělaly')} value={money(m.margin)} note={t('tržba − suroviny')} />
            <Stat label={t('Bez receptury')} value={m.noRecipe.toLocaleString('cs-CZ')} note={t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: m.noRecipe })} />
          </StatRow>
          <Segmented size="sm" ariaLabel={t('Pohled na marže')} value={pohled} onChange={setPohled}
            options={[{ id: 'seznam', label: t('Seznam') }, { id: 'matice', label: t('Matice') }]} />
          {pohled === 'matice' ? (
            <MaticeMenu polozky={m.polozky} nahled={nahled} />
          ) : (
            <>
              {m.rady.length > 0 && <RadyJakoSeznam rady={m.rady.map(r => ({ ...r, ikona: r.icon }))} />}
              <ul className="list">
                {serazene.slice(0, 20).map(p => (p.marginPct != null ? radek(p) : (
                  <ListRow key={p.id} title={p.name || t('Bez názvu')} meta={`${t('{n, plural, one {# kus} few {# kusy} other {# kusů}}', { n: Math.round(p.qty) })} · ${t('bez receptury')}`}
                    value={<span className="tabular-nums text-black/45">—</span>} valueMeta={p.revenue != null ? money(p.revenue) : undefined} />
                )))}
              </ul>
              {serazene.length > 20 && <p className="t-meta">{t('…a dalších {n}', { n: (serazene.length - 20).toLocaleString('cs-CZ') })}</p>}
            </>
          )}
        </div>
      );
    }
  }

  return (
    // Matice se nezkracuje: graf s kvadranty a sekcemi musí být vidět celý (zkrácený seznam by schoval psy).
    <Widget nacteni={ceka ? CEKA : data} kostra={velikost === 'S' ? 'cislo' : 'seznam'} prazdno={prazdno} bezZkraceni={velikost === 'L' && pohled === 'matice'}
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
  // Rady se počítají za jeden měsíc: u rozsahu stránky za jeho poslední měsíc (a karta to řekne).
  const { mesic, vice } = useJedenMesic(nastaveni.mesic);
  const data = useDataWidgetu(ok ? `/api/finance/advice?month=${mesic}` : null, vyberDoporuceni);
  const d = data.data;
  return (
    <Widget nacteni={ceka ? CEKA : data}
      prazdno={d && d.rady.length === 0 ? <p className="t-meta text-pretty">{t('Za tenhle měsíc zatím není dost dat na doporučení. Přibudou z uzávěrek, docházky a prodejů v pokladně.')}</p> : undefined}>
      {d && d.rady.length > 0 && (
        <div className="space-y-3">
          {vice && <p className="t-meta cz-sentence">{t('za {mesic}', { mesic: nazevMesice(mesic) })}</p>}
          {velikost === 'L' ? <SkupinyDoporuceni d={d} /> : <PrvniRady d={d} />}
        </div>
      )}
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
  /** Posledních až šest dokončených inventur, od nejstarší (GET ?history=1). */
  historie: ZtrataInventury[];
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
    historie: Array.isArray(raw.history) ? raw.history
      .filter((h: any) => h && h.id != null && typeof h.completedAt === 'string')
      .map((h: any) => ({ id: Number(h.id), completedAt: h.completedAt, netValue: cis(h.netValue), lostValue: cis(h.lostValue) })) : [],
  };
}

/** Ztráty z widgetu i řada posledních inventur v jednom dotazu (stejná URL pro všechny velikosti). */
const URL_ZTRAT = '/api/inventory/shrinkage?history=1';

const denVetou = (d: string) => {
  const [, m, dd] = d.split('-').map(Number);
  return m && dd ? `${dd}. ${m}.` : d;
};

function ZtratyWidget({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const money = useMoney();
  const { ok, ceka } = useBrana('finance.ztraty', ['finance.ztraty']);
  const data = useDataWidgetu(ok ? URL_ZTRAT : null, vyberZtraty);
  const z = data.data;
  const chybejici = (z?.radky ?? []).filter(r => r.diff < 0);
  // Vývoj: čistý rozdíl poslední inventury proti předchozí (záporný = ztráty narostly).
  const zmena = z ? zmenaZtrat(z.historie) : null;
  const chipZmeny = zmena ? (
    <Chip tone={zmena.rozdil === 0 ? 'muted' : zmena.horsi ? 'bad' : 'ok'} size="sm">
      {zmena.rozdil === 0 ? t('stejně jako minule')
        : zmena.horsi ? t('ztráty o {castka} vyšší než minule', { castka: money(Math.abs(zmena.rozdil)) })
          : t('ztráty o {castka} nižší než minule', { castka: money(Math.abs(zmena.rozdil)) })}
    </Chip>
  ) : null;

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
          <p className="t-meta flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{z.kdy ? t('Inventura {datum}', { datum: denVetou(z.kdy) }) : t('Poslední inventura')}</span>
            {chipZmeny}
          </p>
          <StatRow>
            <Stat label={t('Chybí')} value={money(z.ztrata)} note={t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: z.chybi })} />
            <Stat label={t('Přebývá')} value={money(z.prebytek)} note={t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: z.prebyva })} />
          </StatRow>
          {/* Vývoj v L: sloupek = ztráta inventury (čistý rozdíl, přebytek je nula), nejnovější zvýrazněná. */}
          {velikost === 'L' && z.historie.length >= 2 && (
            <div>
              <BarSpark height={40} highlight={z.historie.length - 1}
                label={t('Vývoj ztrát: {n, plural, one {poslední inventura} few {poslední # inventury} other {posledních # inventur}}', { n: z.historie.length })}
                data={z.historie.map(h => ({
                  value: Math.max(0, -h.netValue),
                  tip: `${denVetou(pragueDaySafe(h.completedAt))}: ${h.netValue > 0 ? '+' : h.netValue < 0 ? '−' : ''}${money(Math.abs(h.netValue))}`,
                }))} />
              <p className="t-meta mt-1">{t('{n, plural, one {poslední inventura} few {poslední # inventury} other {posledních # inventur}}', { n: z.historie.length })}</p>
            </div>
          )}
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
  // Měsíc podle data nákupu, když ho účtenka má (kolo 81), jinak podle dne nafocení — jako /api/finance.
  const mesicni = (u ?? []).filter(r => (r.purchaseDate ?? pragueDaySafe(r.createdAt)).startsWith(tentoMesic));
  const soucet = mesicni.reduce((s, r) => s + (r.amount ?? 0), 0);
  const [pred, po] = rozdelVetu(t, 'Tento měsíc {castka}', 'castka');
  const nafotit = smiPridat ? (
    <Button variant={velikost === 'S' ? 'primary' : 'secondary'} icon="camera" onClick={() => setNova(true)}>{t('Nafotit')}</Button>
  ) : null;

  return (
    <>
      <Widget nacteni={ceka ? CEKA : data} kostra={velikost === 'S' ? 'cislo' : 'seznam'}
        odkaz={velikost !== 'S' && !naFinancich && nav.smiPohled('finance') && smi('finance.zobrazit') ? { popisek: t('Finance'), pohled: 'finance' } : undefined}
        prazdno={u && u.length === 0 ? (
          <Sloupec mezera={4}>
            <p className="t-meta text-pretty">{smiPridat ? t('Zatím žádná účtenka. Nafoť ji hned po nákupu — do Financí se propíše sama.') : t('Zatím žádná účtenka.')}</p>
            {nafotit && <div className="rada rada-rovne rada-m">{nafotit}</div>}
          </Sloupec>
        ) : undefined}
        // v4 (V16, P17): „Nafotit" je akce widgetu — patka L→R × 44 na konci karty; součet měsíce je souhrn nad seznamem.
        souhrn={u && u.length > 0 && velikost !== 'S' ? <>{pred}<span className="font-semibold text-[#16181A] tabular-nums">{money(soucet)}</span>{po} · {t('{n, plural, one {# účtenka} few {# účtenky} other {# účtenek}}', { n: mesicni.length })}</> : undefined}
        patka={nafotit ?? undefined}>
        {u && u.length > 0 && (velikost === 'S' ? (
          <Stat label={t('Tento měsíc')} value={money(soucet)} note={t('{n, plural, one {# účtenka} few {# účtenky} other {# účtenek}}', { n: mesicni.length })} />
        ) : (
          <SeznamUctenek uctenky={u} limit={velikost === 'M' ? 5 : 30} sFotkou={velikost === 'L'}
            smiMazat={velikost === 'L' && !nahled && smi('finance.uctenky_upravit')} />
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
  'finance.mzdy_dnes': MzdyDnesWidget,
  'finance.kam_sly_penize': KamSlyPenize,
  'finance.marze': MarzeWidget,
  'finance.hoste_vernost': HosteVernost,
  'finance.doporuceni': Doporuceni,
  'finance.postrehy': Postrehy,
  'finance.ztraty': ZtratyWidget,
  'finance.uctenky': Uctenky,
};
