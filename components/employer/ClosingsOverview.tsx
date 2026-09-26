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
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, ListRow, Skeleton } from '../ui';
import { usePlan, UpgradeModal } from '../Pro';
import { diffReasonLabel, expectedCash, cashDifference, cashLeft, type ShiftPerson } from '@/lib/closing';
import { useMoney } from '../CurrencyProvider';
import CashClosing from '../employee/CashClosing';
import ClosingDetail from './ClosingDetail';
import { okJson } from '@/lib/api';
import { czCount } from '@/lib/czech';
import { pragueToday } from '@/lib/pragueTime';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import {
  KLIC_DEN, KLIC_VYPLNIT, UDALOST_DEN, UDALOST_VYPLNIT,
  denUzaverky, jeHlavni, rozdilUzaverky, type RadekUzaverky,
} from '@/lib/uzaverkyPrehled';

const URL_SEZNAM = '/api/closings';
const UZAVERKA = { one: 'uzávěrka', few: 'uzávěrky', many: 'uzávěrek' };

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
    : [{ id: c.created_by, name: c.author_name ?? 'Neznámý', avatar: c.author_avatar ?? null }];

const denVetou = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
const denKratce = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' });
const nazevMesice = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

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
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = jmeno;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ClosingsOverview() {
  const money = useMoney();
  const smi = useSmi();
  const { pro } = usePlan();
  const [upgradeFor, setUpgradeFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingDate, setCreatingDate] = useState<string | undefined>(undefined);
  // Rozklik uzávěrky otevře plný detail — do řádku se toho vejde jen zlomek.
  const [detailId, setDetailId] = useState<number | null>(null);
  const [month, setMonth] = useState<string>('all'); // 'all' | 'YYYY-MM'
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const data = useDataWidgetu<Seznam>(URL_SEZNAM, raw => {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.closings)) throw new Error('Uzávěrky přišly v nečekaném tvaru.');
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

  // Měsíce v datech, nejnovější první.
  const months = useMemo(
    () => Array.from(new Set(allClosings.map(c => denUzaverky(c).slice(0, 7)).filter(Boolean))).sort().reverse(),
    [allClosings],
  );
  // Exporty jdou za filtrem měsíce; seznam se navíc zúží na den z kalendáře.
  const closings = month === 'all' ? allClosings : allClosings.filter(c => denUzaverky(c).slice(0, 7) === month);
  const listed = selectedDate ? allClosings.filter(c => denUzaverky(c) === selectedDate) : closings;
  const topLevel = listed.filter(jeHlavni);
  const coveredBy = (parentId: number) => allClosings.filter(c => c.covered_by === parentId);

  // ---- Exporty ----
  // Tržbová pole API roli bez finance.trzby maže; export bez nich by byl
  // tabulka prázdných buněk, proto ho taková role nedostane vůbec.
  const smiExport = smi('uzaverky.exportovat') && smi('finance.trzby');
  const v = (x: unknown) => (x == null ? '' : Number(x) || 0);

  const exportCsv = () => {
    if (!pro) { setUpgradeFor('Export CSV'); return; }
    const head = ['Datum', 'Směna', 'Vyplnil/a', 'Na směně', 'Kasa na začátku', 'Tržba hotově', 'Tržba kartou', 'Spropitné', 'Spropitné v kase', 'Výdaje', 'Odloženo', 'Výplata', 'Kasa na konci', 'Očekávaná kasa', 'Rozdíl', 'Odvod na konci', 'Zůstalo v kase', 'Zákazníků', 'Poznámka'];
    const rows = closings.map(c => [
      denUzaverky(c), c.shift_label ?? '', c.author_name ?? '', crewOf(c).map(p => p.name).join(', '),
      v(c.opening_cash), v(c.cash_revenue), v(c.card_revenue), v(c.tips), c.tips_in_drawer ? 'ano' : 'ne', v(c.expenses),
      v(c.cash_removed), v(c.self_payout), v(c.closing_cash),
      jeHlavni(c) ? expectedCash(c) : '', jeHlavni(c) ? cashDifference(c) : '',
      Number(c.final_removal) || 0, cashLeft(c),
      v(c.customers), (c.notes ?? '').replace(/\n/g, ' '),
    ]);
    stahniCsv([head, ...rows], `uzaverky${month === 'all' ? '' : '-' + month}.csv`);
  };

  // Podklad pro účetní: řádky po dnech a souhrn. Souhrn nákladů bere stejný
  // zdroj jako Finance (/api/finance) — dřív si ho počítal sám z docházky
  // a přijatých objednávek a vycházel jinak než obrazovka Finance.
  const exportAccountant = async () => {
    if (!pro) { setUpgradeFor('Export pro účetní'); return; }
    const head = ['Datum', 'Tržba hotově', 'Tržba kartou', 'Tržba celkem', 'Spropitné', 'Výdaje z kasy', 'Odvedeno', 'Vyplaceno hotově'];
    const byDay = new Map<string, { cash: number; card: number; tips: number; exp: number; rem: number; pay: number }>();
    closings.forEach(c => {
      const d = byDay.get(denUzaverky(c)) ?? { cash: 0, card: 0, tips: 0, exp: 0, rem: 0, pay: 0 };
      d.cash += Number(c.cash_revenue) || 0; d.card += Number(c.card_revenue) || 0; d.tips += Number(c.tips) || 0;
      d.exp += Number(c.expenses) || 0; d.rem += (Number(c.cash_removed) || 0) + (Number(c.final_removal) || 0); d.pay += Number(c.self_payout) || 0;
      byDay.set(denUzaverky(c), d);
    });
    const rows = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => [date, d.cash, d.card, d.cash + d.card, d.tips, d.exp, d.rem, d.pay]);
    const trzby = rows.reduce((s, r) => s + Number(r[3]), 0);
    const summary: (string | number)[][] = [[], ['SOUHRN OBDOBÍ', month === 'all' ? 'vše' : month], ['Tržby celkem', trzby]];
    if (month !== 'all' && smi('finance.zobrazit')) {
      try {
        const f = await fetch(`/api/finance?month=${month}`).then(okJson);
        const s = f?.summary ?? {};
        if (!s.mzdySkryte) summary.push(['Mzdové náklady', Math.max(Number(s.wagesWorked) || 0, Number(s.wagesCash) || 0)]);
        summary.push(['Nákupy (účtenky, objednávky, výdaje z kasy)', Number(s.purchases) || 0]);
        if (!s.mzdySkryte) summary.push(['Provozní výsledek (orientační)', Number(s.gross) || 0]);
      } catch { summary.push(['Náklady', 'nepodařilo se načíst — viz Finance']); }
    }
    stahniCsv([head, ...rows, ...summary], `ucetni-podklad${month === 'all' ? '' : '-' + month}.csv`);
  };

  // Vedení vyplňuje uzávěrku samo (např. za den, kdy ji nikdo neudělal).
  if (creating) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Button variant="secondary" size="sm" onClick={() => { setCreating(false); setCreatingDate(undefined); }}>Zpět na uzávěrky</Button>
        <CashClosing user={{ id: 0, name: 'Vedení' }} hideHistory initialDate={creatingDate}
          onSubmitted={() => { setCreating(false); obnov(creatingDate); setCreatingDate(undefined); }} />
      </div>
    );
  }

  const menu = smiExport && topLevel.length > 0 ? [
    { label: 'Export CSV', icon: 'download', onClick: exportCsv },
    { label: 'Pro účetní', icon: 'receipt', hint: 'Tržby po dnech a souhrn nákladů.', onClick: () => { void exportAccountant(); } },
  ] : undefined;

  const nastroj = (
    <Card pad="none" aria-labelledby="uzaverky-seznam-t">
      <div ref={listRef} className="scroll-mt-4 px-5 pt-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="uzaverky-seznam-t" className="t-card flex items-center gap-2">
            Seznam uzávěrek
            {data.data && <Chip tone="muted" size="sm">{topLevel.length.toLocaleString('cs-CZ')}</Chip>}
          </h2>
        </div>
        {selectedDate ? (
          <div className="well flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <p className="text-sm font-medium text-[#16181A] cz-sentence min-w-0">
              {denVetou(selectedDate)}
              <span className="font-normal text-black/55"> · {topLevel.length === 0 ? 'bez uzávěrky' : czCount(topLevel.length, UZAVERKA)}</span>
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {topLevel.length === 0 && smiVytvorit && (
                <Button variant="secondary" size="sm" icon="plus" onClick={() => openCreate(selectedDate)}>Vyplnit</Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => vyber(null)}>Zrušit výběr</Button>
            </div>
          </div>
        ) : months.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-1" role="group" aria-label="Měsíc">
            {(['all', ...months] as string[]).map(m => (
              <button key={m} type="button" aria-pressed={month === m} onClick={() => setMonth(m)}
                className={`filter-pill tap-target-sm ${m === 'all' ? '' : 'cz-sentence'} ${month === m ? 'seg-on' : 'seg-off glass'}`}>
                {m === 'all' ? 'Vše' : nazevMesice(m)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pb-2">
        {data.loading ? (
          <div className="space-y-2 py-3" aria-busy>
            <Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12 w-2/3" />
          </div>
        ) : data.error ? (
          <ErrorState compact title="Uzávěrky se nenačetly" onRetry={data.reload} detail={data.error} className="!py-6" />
        ) : topLevel.length === 0 ? (
          selectedDate
            ? <EmptyState compact icon="receipt" title="Za tento den není uzávěrka" hint="Buď se ten den nepracovalo, nebo na ni někdo zapomněl." />
            : <EmptyState compact illustration="uzaverka" title="Zatím žádné uzávěrky" hint="Zaměstnanci je vyplňují po směně v aplikaci nebo na tabletu. Tady je uvidíš a schválíš." />
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
                <li key={c.id}>
                  <ListRow as="div"
                    lead={<Avatar emoji={c.author_avatar} size="sm" />}
                    title={<span className="cz-sentence">{denKratce(denUzaverky(c))}{c.shift_label ? ` · ${c.shift_label}` : ''}</span>}
                    meta={`Směna: ${crew}${trzba != null ? ` · tržba ${money(trzba)}` : ''}`}
                    right={<>
                      {c.event_title && <Chip tone="info" size="sm" icon="calendarCheck" className="hidden sm:inline-flex">{c.event_title}</Chip>}
                      {covered.length > 0 && <Chip tone="muted" size="sm" icon="users" className="hidden sm:inline-flex">+{covered.length}</Chip>}
                      {c.approved === false && <Chip tone="wait" size="sm">Čeká na schválení</Chip>}
                      {d != null && (
                        <Chip tone={d === 0 ? 'ok' : d > 0 ? 'info' : 'bad'} size="sm">
                          {d === 0 ? 'Sedí' : `${d > 0 ? '+' : ''}${money(d)}`}
                          {duvod && <span className="hidden sm:inline font-normal"> · {duvod}</span>}
                        </Chip>
                      )}
                    </>}
                    onClick={() => setDetailId(c.id)} />
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
          title: 'Uzávěrky',
          subtitle: 'Denní tržby, rozdíly proti kase a co čeká na schválení.',
          hintId: 'closingsoverview',
          primary: smiVytvorit ? <Button variant="accent" icon="plus" onClick={() => openCreate()}>Nová uzávěrka</Button> : undefined,
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
