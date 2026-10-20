'use client';

// Uzávěrky (vedení) — plocha s widgety a seznam uzávěrek jako hlavní nástroj
// (kolo 69, balík B5a, spec §6.2).
//
// Do kola 68 tu bylo 885 řádků: červená karta „Chybí uzávěrka", žlutá fronta
// ke schválení s limetkou v každém řádku, čtyři dlaždice s ručními štítky,
// sbalovací „Přehledy a trendy" (trendy, měsíc v číslech, pokladna, graf)
// a kalendář — všechno natvrdo nad seznamem a všechno z jednoho velkého
// načtení (uzávěrky + docházka za 180 dní + objednávky), i když to člověk
// neotevřel. Bloky jsou teď widgety (components/widgety/oblasti/uzaverky.tsx
// a trzby.tsx), každý se svým dotazem za svým oprávněním; kdo je nechce,
// odebere je. Tady zůstal jen seznam uzávěrek s filtrem měsíce, detailem,
// novou uzávěrkou a exporty.
//
// Seznam bere /api/closings přes useDataWidgetu, ne vlastním fetchem: widget
// „Ke schválení" po schválení obnoví tutéž URL a seznam se srovná sám (a na
// stránku to je jeden dotaz, ne dva).
//
// Widgety s nástrojem mluví událostmi (lib/uzaverkyPrehled.ts): „Vyplnit"
// v Chybějících uzávěrkách otevře formulář na ten den, klepnutí na den
// v kalendáři zúží seznam. EmployerLayout (jiný balík) argument pohledu
// Uzávěrkám nepředává, proto z jiné stránky žádost počká v sessionStorage.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, MonthNav, SearchField, Segmented, Select, Skeleton } from '../ui';
import { usePlan, UpgradeModal } from '../Pro';
import { ulozSoubor } from '@/lib/stahni';
import { diffReasonLabel, expectedCash, cashDifference, cashLeft, type ShiftPerson } from '@/lib/closing';
import { useMoney } from '../CurrencyProvider';
import CashClosing from '../employee/CashClosing';
import ClosingDetail from './ClosingDetail';
import { okJson } from '@/lib/api';
import { pragueToday } from '@/lib/pragueTime';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import {
  KLIC_DEN, KLIC_VYPLNIT, UDALOST_DEN, UDALOST_VYPLNIT,
  denUzaverky, hosteUzaverky, jeHlavni, rozdilUzaverky, type RadekUzaverky,
} from '@/lib/uzaverkyPrehled';
import { filtrujUzaverky, jmenaZUzaverek, nazevExportuUzaverek, pocetFiltru, popisObdobiExportu, PRAZDNY_FILTR, stitkySmen, type FiltrUzaverek, type Razeni } from '@/lib/uzaverkyFiltr';
import { otevriDen } from '@/lib/denUdalost';
import { useT } from '@/lib/i18n/client';
import { useLocale } from './jazyk';

const URL_SEZNAM = '/api/closings';

type Person = { id: number; name: string; avatar?: string | null };

interface Seznam {
  radky: RadekUzaverky[];
  payDailyCash: boolean;
  scheduledByDate: Record<string, Person[]>;
}

// Všichni, komu uzávěrka patří. Nové řádky nesou celou směnu, starší jen autora.
const crewOf = (c: RadekUzaverky): ShiftPerson[] =>
  c.shiftEmployees && c.shiftEmployees.length
    ? c.shiftEmployees
    : [{ id: c.created_by, name: c.author_name ?? 'Neznámý' /* i18n-ok */, avatar: c.author_avatar ?? null }];

const denVetou = (d: string, loc: string) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
const denKratce = (d: string, loc: string) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'long' });

/** Přečte a smaže žádost, která čekala na připojení nástroje (z jiné stránky). */
function vezmiZadost(klic: string): string | null {
  try {
    const v = sessionStorage.getItem(klic);
    if (v != null) sessionStorage.removeItem(klic);
    return v || null;
  } catch { return null; }
}

function stahniCsv(radky: (string | number)[][], jmeno: string) {
  const csv = radky.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  void ulozSoubor(jmeno, '﻿' + csv, 'text/csv;charset=utf-8');
}

export default function ClosingsOverview() {
  const t = useT('sprava');
  const loc = useLocale();
  const money = useMoney();
  const smi = useSmi();
  const { pro } = usePlan();
  const [upgradeFor, setUpgradeFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingDate, setCreatingDate] = useState<string | undefined>(undefined);
  // Rozklik uzávěrky otevře plný detail — do řádku se toho vejde jen zlomek.
  const [detailId, setDetailId] = useState<number | null>(null);
  // Období seznamu: null = Vše, jinak „RRRR-MM" z MonthNav. Od/Do ve Filtrech ho dál jen zužují.
  const [month, setMonth] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filtr, setFiltr] = useState<FiltrUzaverek>(PRAZDNY_FILTR);
  const [dalsiFiltry, setDalsiFiltry] = useState(false);
  const nastav = (zmena: Partial<FiltrUzaverek>) => setFiltr(f => ({ ...f, ...zmena }));
  const listRef = useRef<HTMLDivElement>(null);

  const data = useDataWidgetu<Seznam>(URL_SEZNAM, raw => {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.closings)) throw new Error(t('Uzávěrky přišly v nečekaném tvaru.'));
    return {
      radky: raw.closings,
      payDailyCash: raw.payDailyCash === true,
      scheduledByDate: raw.scheduledByDate && typeof raw.scheduledByDate === 'object' ? raw.scheduledByDate : {},
    };
  });
  const allClosings = useMemo(() => data.data?.radky ?? [], [data.data]);
  const payDailyCash = data.data?.payDailyCash === true;
  const smiVytvorit = smi('uzaverky.vytvorit');

  const openCreate = useCallback((date?: string) => { setCreatingDate(date); setCreating(true); }, []);

  // Den z kalendáře zužuje seznam; kalendář (widget) se dozví, co je vybráno,
  // aby vybraný den orámoval i po přechodu z jiné stránky.
  const vyber = useCallback((d: string | null) => {
    setSelectedDate(d);
    window.dispatchEvent(new CustomEvent(`${UDALOST_DEN}:stav`, { detail: { hodnota: d ?? '' } }));
    if (d) requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);

  // Žádosti z widgetů: na stránce hned (událost), z jiné stránky po připojení.
  useEffect(() => {
    const naVyplnit = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!smiVytvorit || !d) return;
      d.prijato = true;
      openCreate(d.hodnota || undefined);
    };
    const naDen = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d) return;
      d.prijato = true;
      vyber(d.hodnota || null);
    };
    window.addEventListener(UDALOST_VYPLNIT, naVyplnit);
    window.addEventListener(UDALOST_DEN, naDen);
    const vyplnit = vezmiZadost(KLIC_VYPLNIT);
    if (vyplnit && smiVytvorit) openCreate(vyplnit);
    const denZ = vezmiZadost(KLIC_DEN);
    if (denZ) vyber(denZ);
    return () => {
      window.removeEventListener(UDALOST_VYPLNIT, naVyplnit);
      window.removeEventListener(UDALOST_DEN, naDen);
    };
  }, [smiVytvorit, openCreate, vyber]);

  /** Po zápisu (nová uzávěrka, smazání v detailu) obnovit seznam i widgety na stejné URL. */
  const obnov = useCallback((den?: string) => {
    obnovDataWidgetu(URL_SEZNAM);
    obnovDataWidgetu('/api/closings/handover');
    const mesice = new Set([pragueToday().slice(0, 7), ...(den ? [den.slice(0, 7)] : [])]);
    mesice.forEach(m => obnovDataWidgetu(`/api/closings/calendar?month=${m}`));
  }, []);

  // Měsíce v datech, nejnovější první. MonthNav jde od nejstaršího do tohoto měsíce.
  const months = useMemo(
    () => Array.from(new Set(allClosings.map(c => denUzaverky(c).slice(0, 7)).filter(Boolean))).sort().reverse(),
    [allClosings],
  );
  const tentoMesic = pragueToday().slice(0, 7);
  const nejstarsi = months.length ? months[months.length - 1] : tentoMesic;
  const closings = month == null ? allClosings : allClosings.filter(c => denUzaverky(c).slice(0, 7) === month);
  const listed = selectedDate ? allClosings.filter(c => denUzaverky(c) === selectedDate) : closings;
  // Filtry (hledání, stav, kasa, směna, rozmezí dnů) a řazení platí na seznam i na exporty:
  // stáhne se přesně to, co je vidět (dřív export sledoval jen měsíc a filtry ignoroval).
  const zakladSeznamu = listed.filter(jeHlavni);
  const topLevel = filtrujUzaverky(zakladSeznamu, filtr);
  const nFiltru = pocetFiltru(filtr);
  const stitky = useMemo(() => stitkySmen(allClosings), [allClosings]);
  const jmena = useMemo(() => jmenaZUzaverek(allClosings), [allClosings]);
  const kCekani = zakladSeznamu.filter(c => c.approved === false).length;
  const coveredBy = (parentId: number) => allClosings.filter(c => c.covered_by === parentId);

  // ---- Exporty ----
  // Tržbová pole API roli bez finance.trzby maže; export bez nich by byl
  // tabulka prázdných buněk, proto ho taková role nedostane vůbec.
  const smiExport = smi('uzaverky.exportovat') && smi('finance.trzby');
  const v = (x: unknown) => (x == null ? '' : Number(x) || 0);

  // Co je vidět: hlavní řádky po filtrech a za každým jeho pomocné řádky (kolega, za kterého se
  // zavřelo — jeho výplata a odvod z kasy opravdu odešly, účetní je v podkladu potřebuje).
  const vybrane = topLevel.flatMap(c => [c, ...coveredBy(c.id)]);
  // Den z kalendáře je rozmezí jednoho dne; jinak měsíc z MonthNav zúžený Od/Do.
  const obdobiExportu: [string | null, string, string] = selectedDate ? [null, selectedDate, selectedDate] : [month, filtr.od, filtr.do];

  const exportCsv = () => {
    if (!pro) { setUpgradeFor('Export CSV'); return; } // i18n-ok (název funkce)
    const head = ['Datum', 'Směna', 'Vyplnil/a', 'Na směně', 'Kasa na začátku', 'Tržba hotově', 'Tržba kartou', 'Spropitné', 'Spropitné v kase', 'Výdaje', 'Odloženo', 'Výplata', 'Kasa na konci', 'Očekávaná kasa', 'Rozdíl', 'Odvod na konci', 'Zůstalo v kase', 'Zákazníků', 'Poznámka']; // i18n-ok (CSV pro účetní zůstává česky)
    const rows = vybrane.map(c => [
      denUzaverky(c), c.shift_label ?? '', c.author_name ?? '', crewOf(c).map(p => p.name).join(', '),
      v(c.opening_cash), v(c.cash_revenue), v(c.card_revenue), v(c.tips), c.tips_in_drawer ? 'ano' : 'ne', v(c.expenses),
      v(c.cash_removed), v(c.self_payout), v(c.closing_cash),
      jeHlavni(c) ? expectedCash(c) : '', jeHlavni(c) ? cashDifference(c) : '',
      Number(c.final_removal) || 0, cashLeft(c),
      v(c.customers), (c.notes ?? '').replace(/\n/g, ' '),
    ]);
    stahniCsv([head, ...rows], nazevExportuUzaverek('uzaverky', ...obdobiExportu));
  };

  // Podklad pro účetní: řádky po dnech a souhrn. Souhrn nákladů bere stejný
  // zdroj jako Finance (/api/finance) — dřív si ho počítal sám z docházky
  // a přijatých objednávek a vycházel jinak než obrazovka Finance.
  const exportAccountant = async () => {
    if (!pro) { setUpgradeFor(t('Export pro účetní')); return; }
    const head = ['Datum', 'Tržba hotově', 'Tržba kartou', 'Tržba celkem', 'Spropitné', 'Výdaje z kasy', 'Odvedeno', 'Vyplaceno hotově']; // i18n-ok (CSV pro účetní zůstává česky)
    const byDay = new Map<string, { cash: number; card: number; tips: number; exp: number; rem: number; pay: number }>();
    vybrane.forEach(c => {
      const d = byDay.get(denUzaverky(c)) ?? { cash: 0, card: 0, tips: 0, exp: 0, rem: 0, pay: 0 };
      d.cash += Number(c.cash_revenue) || 0; d.card += Number(c.card_revenue) || 0; d.tips += Number(c.tips) || 0;
      d.exp += Number(c.expenses) || 0; d.rem += (Number(c.cash_removed) || 0) + (Number(c.final_removal) || 0); d.pay += Number(c.self_payout) || 0;
      byDay.set(denUzaverky(c), d);
    });
    const rows = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => [date, d.cash, d.card, d.cash + d.card, d.tips, d.exp, d.rem, d.pay]);
    const trzby = rows.reduce((s, r) => s + Number(r[3]), 0);
    const summary: (string | number)[][] = [[], ['SOUHRN OBDOBÍ', popisObdobiExportu(...obdobiExportu)], ['Tržby celkem', trzby]]; // i18n-ok (CSV pro účetní zůstává česky)
    // Náklady z Financí jsou za celý měsíc — k zúženému rozmezí dnů by nepatřily.
    if (month != null && !selectedDate && !filtr.od && !filtr.do && smi('finance.zobrazit')) {
      try {
        const f = await fetch(`/api/finance?month=${month}`).then(okJson);
        const s = f?.summary ?? {};
        if (!s.mzdySkryte) summary.push(['Mzdové náklady', Math.max(Number(s.wagesWorked) || 0, Number(s.wagesCash) || 0)]); // i18n-ok (CSV pro účetní zůstává česky)
        summary.push(['Nákupy (účtenky, objednávky, výdaje z kasy)', Number(s.purchases) || 0]); // i18n-ok (CSV pro účetní zůstává česky)
        if (!s.mzdySkryte) summary.push(['Provozní výsledek (orientační)', Number(s.gross) || 0]); // i18n-ok (CSV pro účetní zůstává česky)
      } catch { summary.push(['Náklady', 'nepodařilo se načíst — viz Finance']); } // i18n-ok (CSV pro účetní zůstává česky)
    }
    stahniCsv([head, ...rows, ...summary], nazevExportuUzaverek('ucetni-podklad', ...obdobiExportu));
  };

  // Vedení vyplňuje uzávěrku samo (např. za den, kdy ji nikdo neudělal).
  if (creating) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Button variant="secondary" size="sm" onClick={() => { setCreating(false); setCreatingDate(undefined); }}>{t('Zpět na uzávěrky')}</Button>
        <CashClosing user={{ id: 0, name: 'Vedení' }} hideHistory initialDate={creatingDate} // i18n-ok (jméno autora pro vedení)
          onSubmitted={() => { setCreating(false); obnov(creatingDate); setCreatingDate(undefined); }} />
      </div>
    );
  }

  const menu = smiExport && topLevel.length > 0 ? [
    { label: t('Export CSV'), icon: 'download', onClick: exportCsv },
    { label: t('Pro účetní'), icon: 'receipt', hint: t('Tržby po dnech a souhrn nákladů.'), onClick: () => { void exportAccountant(); } },
  ] : undefined;

  const nastroj = (
    <Card pad="none" aria-labelledby="uzaverky-seznam-t">
      <div ref={listRef} className="scroll-mt-4 px-5 pt-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="uzaverky-seznam-t" className="t-card flex items-center gap-2">
            {t('Seznam uzávěrek')}
            {data.data && <Chip tone="muted" size="sm">{topLevel.length.toLocaleString(loc)}</Chip>}
          </h2>
          {!selectedDate && (months.length > 1 || month != null) && (
            // Jediný výběr období (jako Finance): Vše, nebo jeden měsíc šipkami. Dřív tu byl pás pilulek
            // za každý měsíc v datech, který po půl roce provozu jel na telefonu za pravý okraj.
            // Na telefonu vlastní řádek; MonthNav vyplní zbytek, a když by na název měsíce zbylo
            // méně než 12rem (320 px, polské „Wszystko"), zalomí se pod přepínač přes celou šířku.
            <div className="flex flex-wrap items-center gap-2 min-w-0 w-full sm:w-auto sm:flex-nowrap">
              <Segmented size="sm" className="shrink-0" ariaLabel={t('Období')} value={month == null ? 'vse' : 'mesic'}
                onChange={v => setMonth(v === 'vse' ? null : (months[0] ?? tentoMesic))}
                options={[{ id: 'vse', label: t('Vše') }, { id: 'mesic', label: t('Měsíc') }]} />
              {month != null && (
                <MonthNav value={month} onChange={setMonth} min={nejstarsi < month ? nejstarsi : month}
                  max={tentoMesic > month ? tentoMesic : month} className="flex-[1_1_12rem] sm:flex-none" />
              )}
            </div>
          )}
        </div>
        {selectedDate ? (
          <div className="well flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <p className="text-sm font-medium text-[#16181A] cz-sentence min-w-0">
              {denVetou(selectedDate, loc)}
              <span className="font-normal text-black/55"> · {topLevel.length === 0 ? t('bez uzávěrky') : t('{n, plural, one {# uzávěrka} few {# uzávěrky} other {# uzávěrek}}', { n: topLevel.length })}</span>
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="secondary" size="sm" icon="calendar" onClick={() => otevriDen(selectedDate, 'uzaverky')}>{t('Celý den')}</Button>
              {topLevel.length === 0 && smiVytvorit && (
                <Button variant="secondary" size="sm" icon="plus" onClick={() => openCreate(selectedDate)}>{t('Vyplnit')}</Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => vyber(null)}>{t('Zrušit výběr')}</Button>
            </div>
          </div>
        ) : null}
        {allClosings.length > 0 && (
          <div className="space-y-2" role="search" aria-label={t('Filtry uzávěrek')}>
            {/* v3: nad seznamem jedna řada — hledání a „Filtry". Stav (Vše / Ke schválení / Schválené)
                je v panelu: dřív tu vedle hledání stál ještě segment stavu a pod titulkem segment období,
                tři přepínače nad sebou. Frontu ke schválení drží widget „Uzávěrky ke schválení"
                a zapnutý stav prozradí řádek „Zobrazeno N z M" se Zrušit filtry. */}
            <div className="flex gap-2 items-center">
              <SearchField className="flex-1 min-w-0" value={filtr.hledej} onChange={v => nastav({ hledej: v })}
                placeholder={t('Hledat podle dne, směny, jména nebo poznámky…')} ariaLabel={t('Hledat v uzávěrkách')} storageKey="uzaverky"
                suggestions={[
                  ...jmena.map(j => ({ label: j, hint: t('na směně') })),
                  ...stitky.map(x => ({ label: x, hint: t('směna') })),
                ]} />
              <Button variant="secondary" size="sm" aria-expanded={dalsiFiltry} onClick={() => setDalsiFiltry(v => !v)}
                className="shrink-0">
                {t('Filtry')}{nFiltru > 0 ? ` · ${nFiltru}` : ''}
              </Button>
            </div>
            {dalsiFiltry && (
              <div className="well px-4 py-3 space-y-3">
                <div className="space-y-1.5">
                  <p className="t-label">{t('Stav')}</p>
                  <Segmented size="sm" ariaLabel={t('Stav uzávěrky')} value={filtr.stav} onChange={v => nastav({ stav: v })}
                    options={[
                      { id: 'vse', label: t('Vše') },
                      { id: 'ceka', label: t('Ke schválení'), count: kCekani || undefined },
                      { id: 'schvaleno', label: t('Schválené') },
                    ]} />
                </div>
                <div className="space-y-1.5">
                  <p className="t-label">{t('Kasa')}</p>
                  <Segmented size="sm" ariaLabel={t('Rozdíl v kase')} value={filtr.kasa} onChange={v => nastav({ kasa: v })}
                    options={[
                      { id: 'vse', label: t('Vše') },
                      { id: 'sedi', label: t('Sedí') },
                      { id: 'manko', label: t('Manko') },
                      { id: 'prebytek', label: t('Přebytek') },
                    ]} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="uz-od" label={t('Od dne')}><Input id="uz-od" type="date" value={filtr.od} max={filtr.do || undefined} onChange={e => nastav({ od: e.target.value })} /></Field>
                  <Field id="uz-do" label={t('Do dne')}><Input id="uz-do" type="date" value={filtr.do} min={filtr.od || undefined} onChange={e => nastav({ do: e.target.value })} /></Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {stitky.length > 1 && (
                    <Field id="uz-smena" label={t('Směna')}>
                      <Select id="uz-smena" value={filtr.smena} onChange={e => nastav({ smena: e.target.value })}>
                        <option value="">{t('Všechny směny')}</option>
                        {stitky.map(x => <option key={x} value={x}>{x}</option>)}
                      </Select>
                    </Field>
                  )}
                  <Field id="uz-razeni" label={t('Řadit')}>
                    <Select id="uz-razeni" value={filtr.razeni} onChange={e => nastav({ razeni: e.target.value as Razeni })}>
                      <option value="nejnovejsi">{t('Od nejnovější')}</option>
                      <option value="nejstarsi">{t('Od nejstarší')}</option>
                      <option value="trzba">{t('Podle tržby')}</option>
                      <option value="rozdil">{t('Podle rozdílu v kase')}</option>
                    </Select>
                  </Field>
                </div>
              </div>
            )}
            {nFiltru > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2" role="status">
                <p className="t-meta">{t('Zobrazeno {n} z {celkem}', { n: topLevel.length, celkem: zakladSeznamu.length })}</p>
                <Button variant="ghost" size="sm" onClick={() => setFiltr(f => ({ ...PRAZDNY_FILTR, razeni: f.razeni }))}>{t('Zrušit filtry')}</Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-5 pb-2">
        {data.loading ? (
          <div className="space-y-2 py-3" aria-busy>
            <Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12 w-2/3" />
          </div>
        ) : data.error ? (
          <ErrorState compact title={t('Uzávěrky se nenačetly')} onRetry={data.reload} detail={data.error} className="!py-6" />
        ) : topLevel.length === 0 && nFiltru > 0 ? (
          <EmptyState compact icon="search" title={t('Žádná uzávěrka neodpovídá filtrům')} hint={t('Zkus jiné slovo, jiný stav nebo rozmezí dnů.')}
            action={<Button variant="secondary" size="sm" onClick={() => setFiltr(f => ({ ...PRAZDNY_FILTR, razeni: f.razeni }))}>{t('Zrušit filtry')}</Button>} />
        ) : topLevel.length === 0 ? (
          selectedDate
            ? <EmptyState compact icon="receipt" title={t('Za tento den není uzávěrka')} hint={t('Buď se ten den nepracovalo, nebo na ni někdo zapomněl.')} />
            : <EmptyState compact illustration="uzaverka" title={t('Zatím žádné uzávěrky')} hint={t('Zaměstnanci je vyplňují po směně v aplikaci nebo na tabletu. Tady je uvidíš a schválíš.')} />
        ) : (
          <ul className="list">
            {topLevel.map(c => {
              const d = rozdilUzaverky(c);
              const covered = coveredBy(c.id);
              // Uzávěrka patří celé směně; autor ji jen vyplnil.
              const crew = crewOf(c).map(p => p.name).join(' + ');
              const trzba = c.trzbaSkryta ? null : (Number(c.cash_revenue) || 0) + (Number(c.card_revenue) || 0);
              const duvod = d != null && d !== 0 ? diffReasonLabel(c.diff_reason) : null;
              return (
                <li key={c.id} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                  <ListRow as="div"
                    lead={<Avatar emoji={c.author_avatar} size="sm" />}
                    title={<span className="cz-sentence">{denKratce(denUzaverky(c), loc)}{c.shift_label ? ` · ${c.shift_label}` : ''}</span>}
                    // Posádka na vlastním řádku, nejvýš na dva (V04): v jednom řádku s tržbou se utínala
                    // na „Směna: Jakub Kolář + Petra Mar…". Tržba je číslo řádku — pevný sloupec
                    // s tabulkovými číslicemi na monitoru, na telefonu vlevo pod jménem a rozdíl kasy vedle ní.
                    detail={<span className="line-clamp-2 break-words">{t('Směna: {crew}', { crew })}</span>}
                    value={trzba != null ? <><span className="sr-only">{t('tržba {castka}', { castka: money(trzba) })}</span><span aria-hidden>{money(trzba)}</span></> : undefined}
                    // Hosté, když je tým v uzávěrce vyplnil — pod tržbou ve stejném sloupci (číslo k číslu),
                    // ne za posádkou, kde by je dlouhá směna uřízla na druhém řádku.
                    valueMeta={hosteUzaverky(c) != null ? t('{n, plural, one {# host} few {# hosté} other {# hostů}}', { n: hosteUzaverky(c)! }) : undefined}
                    // Štítky mají na monitoru jednotnou minimální šířku, ať tržby vlevo od nich stojí v jednom
                    // svislém sloupci (jinak „Sedí" a „Čeká na schválení −200 Kč" posouvaly číslo o 150 px).
                    right={<span className="flex flex-wrap items-center justify-end gap-2 lg:min-w-[16rem]">
                      {c.event_title && <Chip tone="info" size="sm" icon="calendarCheck" className="hidden sm:inline-flex">{c.event_title}</Chip>}
                      {covered.length > 0 && <Chip tone="muted" size="sm" icon="users" className="hidden sm:inline-flex">+{covered.length}</Chip>}
                      {c.approved === false && <Chip tone="wait" size="sm">{t('Čeká na schválení')}</Chip>}
                      {d != null && (
                        <Chip tone={d === 0 ? 'ok' : d > 0 ? 'info' : 'bad'} size="sm">
                          {d === 0 ? t('Sedí') : `${d > 0 ? '+' : ''}${money(d)}`}
                          {duvod && <span className="hidden sm:inline font-normal"> · {duvod}</span>}
                        </Chip>
                      )}
                    </span>}
                    onClick={() => setDetailId(c.id)} />
                  </div>
                  {/* Celý den: tržba, otevřené účty, výdaje, směny — vedle řádku, ne v něm (v klikacím řádku už je tlačítko). */}
                  <Button variant="ghost" size="sm" iconOnly icon="calendar" className="shrink-0"
                    aria-label={t('Celý den {den}', { den: denKratce(denUzaverky(c), loc) })}
                    onClick={() => otevriDen(denUzaverky(c), 'uzaverky')} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );

  return (
    <>
      <PlochaWidgetu
        stranka="vedeni.uzaverky"
        hlavicka={{
          title: t('Uzávěrky'),
          subtitle: t('Denní tržby, rozdíly proti kase a co čeká na schválení.'),
          hintId: 'closingsoverview',
          primary: smiVytvorit ? <Button variant="accent" icon="plus" onClick={() => openCreate()}>{t('Nová uzávěrka')}</Button> : undefined,
          // Na telefonu majitel uzávěrky kontroluje a schvaluje, vyplňuje je tým po směně. „Nová uzávěrka"
          // tam jde do „···": hlavička se složí do jednoho řádku a seznam uzávěrek vyjede o 68 px výš (V04).
          primaryTelefon: null,
          menuTelefon: smiVytvorit ? [{ label: t('Nová uzávěrka'), icon: 'plus', onClick: () => openCreate() }] : undefined,
          menu,
        }}
        nastroj={nastroj}
      />
      {upgradeFor && <UpgradeModal feature={upgradeFor} onClose={() => setUpgradeFor(null)} />}
      {detailId != null && (
        <ClosingDetail id={detailId} payDailyCash={payDailyCash}
          onClose={() => setDetailId(null)} onChanged={() => obnov()} />
      )}
    </>
  );
}
