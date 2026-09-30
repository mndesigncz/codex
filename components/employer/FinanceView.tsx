'use client';

// Finance — kam jdou peníze (kolo 69, balík B5b: stránka → plocha s widgety).
//
// Dřív jedna obrazovka se sedmi bloky psanými ručně: tmavá dlaždice Tržby
// s rozmazanou skvrnou (FinanceView.tsx:223), kolečko uprostřed místo kostry
// (:215), štítek t-label jako nadpis sekce (:391), ruční přepínač měsíce
// a filtr, ručně skládaná okna. Teď:
//  - hlavička je PageHeader s jedinou limetkou „Export pro účetní" a sdíleným
//    MonthNav; měsíc jde přes MesicStrankyFinanci i do widgetů, takže souhrn
//    nahoře a kniha výdajů dole ukazují vždycky tentýž měsíc;
//  - bloky jsou widgety (components/widgety/oblasti/finance.tsx a trzby.tsx),
//    každý se svým oprávněním — Finance dřív nečetla ma() vůbec a spoléhala
//    na 403 nebo prázdná data (audit „Finance – oprávnění");
//  - nástrojem stránky je kniha výdajů: Section (h2), hledání, Segmented
//    filtr, jedna karta s .list, detail účtenky a export v <Modal>.
//
// CSV pro účetní se skládá v prohlížeči ze stejného /api/finance, jaký kreslí
// obrazovka, takže čísla v souboru sedí s tím, co vedení vidí.

import { useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { usePlan, UpgradeModal } from '../Pro';
import { ulozSoubor, ulozZAdresy, jeObalKlient } from '@/lib/stahni';
import {
  Button, Card, EmptyState, ErrorState, Field, Input, ListRow, Modal, MonthNav, SearchField, Section,
  Segmented, Select, Skeleton, SwitchRow, Well,
} from '../ui';
import { okJson } from '@/lib/api';
import { obsahuje } from '@/lib/hledani';
import { pragueToday } from '@/lib/pragueTime';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import { useOpravneni } from '../role/useOpravneni';
import { MesicStrankyFinanci } from '../widgety/oblasti/finance';
import { urlFinanci, vyberFinance, type FinanceMesice, type RadekKnihy } from '@/lib/financeWidgety';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { useLocale } from './jazyk';

/** Druhy výdajů: kategorie (cat-dot), ne stav — stavové barvy patří stavu (DP §2.1). */
const DRUHY: Record<string, { label: string; tecka: string }> = { // i18n-ok (popisky pro CSV pro účetní zůstávají česky, na obrazovce je překládá druhyVydaju)
  receipt: { label: 'Účtenka', tecka: 'cat-dot-2' }, // i18n-ok
  order: { label: 'Objednávka', tecka: 'cat-dot-3' }, // i18n-ok
  expense: { label: 'Výdaj z kasy', tecka: 'cat-dot-5' }, // i18n-ok
  wage: { label: 'Výplata', tecka: 'cat-dot-4' }, // i18n-ok
  removal: { label: 'Odvod', tecka: 'cat-dot-6' }, // i18n-ok
};
const druhyVydaju = (t: PrekladFn): Record<string, { label: string; tecka: string }> => ({
  receipt: { label: t('Účtenka'), tecka: 'cat-dot-2' },
  order: { label: t('Objednávka'), tecka: 'cat-dot-3' },
  expense: { label: t('Výdaj z kasy'), tecka: 'cat-dot-5' },
  wage: { label: t('Výplata'), tecka: 'cat-dot-4' },
  removal: { label: t('Odvod'), tecka: 'cat-dot-6' },
});

type Filtr = 'all' | 'receipt' | 'order' | 'expense' | 'wage';
const filtryVydaju = (t: PrekladFn): { id: Filtr; label: string }[] => [
  { id: 'all', label: t('Vše') }, { id: 'receipt', label: t('Účtenky') }, { id: 'order', label: t('Objednávky') },
  { id: 'expense', label: t('Z kasy') }, { id: 'wage', label: t('Výplaty') },
];

/** „26. 9." z „2026-09-26" — datum z databáze je už pražský den. */
const kratce = (d: string) => { const [, m, dd] = d.split('-').map(Number); return m && dd ? `${dd}. ${m}.` : d; };
const dlouze = (d: string, loc: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// ---------------------------------------------------------------------------
// CSV pro účetní
// ---------------------------------------------------------------------------

interface VolbyExportu { from: string; to: string; items: boolean; summary: boolean; guest: boolean; sep: string }

/** Řádky CSV za jeden měsíc (stejné sloupce jako dřív, ať účetní šablony dál sedí). */
function radkyCsv(mo: string, raw: any, o: VolbyExportu, symbol: string): string[][] {
  const rows: string[][] = [];
  if (o.items) {
    rows.push([`Položky ${mo}`, '', '', '', '']); // i18n-ok (CSV)
    rows.push(['Datum', 'Typ', 'Popis', `Částka (${symbol})`, 'Poznámka']); // i18n-ok (CSV)
    for (const r of (raw.ledger ?? []) as RadekKnihy[]) rows.push([r.date, DRUHY[r.kind]?.label ?? r.kind, r.label, String(r.amount), r.note ?? '']);
    rows.push([]);
  }
  if (o.summary) {
    const q = raw.summary ?? {};
    rows.push([`Souhrn ${mo}`, '', '', '', '']); // i18n-ok (CSV)
    for (const [lb, v] of [['Tržby celkem', q.revenue], ['— hotovost', q.cash], ['— karty', q.card], ['Spropitné', q.tips], // i18n-ok (CSV)
      ['Nákupy a výdaje', q.purchases], ['Mzdy (odpracováno × sazba)', q.wagesWorked], ['Výplaty hotově z kasy', q.wagesCash], // i18n-ok
      ['Hodnota skladu', q.stockValue], ['Rozdíly v kase', q.diffSum], ['Hrubý výsledek', q.gross]] as [string, unknown][]) { // i18n-ok
      rows.push(['', lb, '', String(Math.round(Number(v) || 0)), '']);
    }
    rows.push([]);
  }
  if (o.guest && raw.guest) {
    rows.push([`Hosté ${mo}`, '', '', '', '']); // i18n-ok (CSV)
    for (const [lb, v] of [['Objednávek od stolu', raw.guest.orders], ['Tržba z objednávek', raw.guest.total], // i18n-ok (CSV)
      ['Z toho mimo pokladnu', raw.guest.offPosTotal], ['Členů věrnosti', raw.guest.members], // i18n-ok
      ['Nových členů', raw.guest.newMembers], ['Uplatněných kuponů', raw.guest.couponsRedeemed]] as [string, unknown][]) { // i18n-ok
      rows.push(['', lb, '', String(Math.round(Number(v) || 0)), '']);
    }
    rows.push([]);
  }
  return rows;
}

function mesiceOdDo(od: string, doMesice: string): string[] {
  const out: string[] = [];
  let [y, m] = od.split('-').map(Number);
  const [ty, tm] = doMesice.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
    if (out.length > 36) break;
  }
  return out;
}

/** Sestavitelný export: od kdy do kdy a co v souboru bude. */
function ExportDialog({ mesic, onClose }: { mesic: string; onClose: () => void }) {
  const t = useT('sprava');
  const symbol = useSymbol();
  const [od, setOd] = useState(mesic);
  const [doMesice, setDoMesice] = useState(mesic);
  const [polozky, setPolozky] = useState(true);
  const [souhrn, setSouhrn] = useState(true);
  const [hoste, setHoste] = useState(false);
  const [sep, setSep] = useState(';');
  const [bezi, setBezi] = useState(false);
  const [chyba, setChyba] = useState('');

  const stahni = async () => {
    const o: VolbyExportu = { from: od, to: doMesice < od ? od : doMesice, items: polozky, summary: souhrn, guest: hoste, sep };
    setBezi(true); setChyba('');
    try {
      const mesice = mesiceOdDo(o.from, o.to);
      const rows: string[][] = [];
      for (const mo of mesice) rows.push(...radkyCsv(mo, await fetch(urlFinanci(mo)).then(okJson), o, symbol));
      const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(o.sep)).join('\n');
      const nazev = mesice.length === 1 ? `finance-${mesice[0]}.csv` : `finance-${mesice[0]}-az-${mesice[mesice.length - 1]}.csv`;
      await ulozSoubor(nazev, '﻿' + csv, 'text/csv;charset=utf-8');
      onClose();
    } catch {
      setChyba(t('Data pro export se nepodařilo načíst. Zkus to znovu.'));
    }
    setBezi(false);
  };

  return (
    <Modal open onClose={onClose} size="md" title={t('Export pro účetní')}
      subtitle={t('Stáhne se jeden soubor CSV, který otevře Excel i účetní program.')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
        <Button variant="primary" icon="download" loading={bezi} disabled={!polozky && !souhrn && !hoste} onClick={stahni}>{t('Stáhnout')}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field id="ex-od" label={t('Od měsíce')}><Input id="ex-od" type="month" value={od} onChange={e => setOd(e.target.value)} /></Field>
          <Field id="ex-do" label={t('Do měsíce')}><Input id="ex-do" type="month" value={doMesice} onChange={e => setDoMesice(e.target.value)} /></Field>
        </div>
        <div>
          <p className="t-label mb-1">{t('Co zahrnout')}</p>
          <ul className="list">
            <SwitchRow title={t('Jednotlivé výdaje')} checked={polozky} onChange={setPolozky} />
            <SwitchRow title={t('Souhrn měsíce')} checked={souhrn} onChange={setSouhrn} />
            <SwitchRow title={t('Hosté a věrnost')} checked={hoste} onChange={setHoste} />
          </ul>
        </div>
        <Field id="ex-sep" label={t('Oddělovač')}>
          <Select id="ex-sep" value={sep} onChange={e => setSep(e.target.value)}>
            <option value=";">{t('Středník — pro český Excel')}</option>
            <option value=",">{t('Čárka — pro účetní programy a Google Tabulky')}</option>
          </Select>
        </Field>
        {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Nástroj: kniha výdajů
// ---------------------------------------------------------------------------

function KnihaVydaju({ mesic }: { mesic: string }) {
  const t = useT('sprava');
  const loc = useLocale();
  const money = useMoney();
  const smi = useSmi();
  // useSmi() před načtením oprávnění vrací „ne" — kniha by pak majiteli s plnými
  // právy na okamžik ukázala zámek „požádej majitele". Tři stavy jako useBrana
  // ve widgetech: nevíme → kostra, víme a nesmí → zámek, smí → data.
  const { nacteno, chyba } = useOpravneni();
  const ceka = !nacteno && !chyba;
  const smiFinance = smi('finance.zobrazit');
  const data = useDataWidgetu<FinanceMesice>(smiFinance ? urlFinanci(mesic) : null, vyberFinance);
  const [filtr, setFiltr] = useState<Filtr>('all');
  // Účetní se ptá „kolik jsme loni dali Moninu" — klikat se přes celý měsíc je zdlouhavé.
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<RadekKnihy | null>(null);
  const kniha = data.data?.kniha ?? [];
  const pocty = useMemo(() => {
    const m: Record<string, number> = { all: kniha.length };
    for (const r of kniha) m[r.kind] = (m[r.kind] ?? 0) + 1;
    return m;
  }, [kniha]);
  const jehla = q.trim();
  const vybrane = kniha.filter(r => filtr === 'all' || r.kind === filtr).filter(r => obsahuje(`${r.label} ${r.note ?? ''}`, jehla));
  const soucet = vybrane.reduce((a, r) => a + r.amount, 0);

  if (ceka) {
    return (
      <Section id="finance-vydaje" title={t('Výdaje')}>
        <Card aria-busy><div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className={`h-12 ${i === 3 ? 'w-2/3' : ''}`} />)}</div></Card>
      </Section>
    );
  }

  if (!smiFinance) {
    return (
      <Card>
        <EmptyState compact icon="lock" title={t('Knihu výdajů vidí jen role s přístupem k financím')}
          hint={t('Tržby z pokladny máš ve widgetech nad tímhle. O přístup k výdajům požádej majitele.')} />
      </Card>
    );
  }

  return (
    <Section id="finance-vydaje" title={t('Výdaje')}
      hint={data.data ? `${vybrane.length.toLocaleString(loc)}${vybrane.length !== kniha.length ? ` ${t('z {n}', { n: kniha.length.toLocaleString(loc) })}` : ''} · ${t('celkem {castka}', { castka: money(soucet) })}` : undefined}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
        <SearchField className="min-w-0 sm:w-64" value={q} onChange={setQ}
          placeholder={t('Hledat v popisu')} ariaLabel={t('Hledat ve výdajích')} storageKey="finance" />
        <Segmented size="sm" ariaLabel={t('Druh výdaje')} value={filtr} onChange={setFiltr}
          options={filtryVydaju(t).map(f => ({ id: f.id, label: f.label, count: pocty[f.id] ?? 0 }))} />
      </div>
      {data.error ? (
        <ErrorState title={t('Výdaje se nenačetly')} detail={data.error} onRetry={data.reload} />
      ) : data.loading ? (
        <Card aria-busy><div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className={`h-12 ${i === 3 ? 'w-2/3' : ''}`} />)}</div></Card>
      ) : vybrane.length === 0 ? (
        <Card><EmptyState compact icon="book" title={kniha.length ? t('Nic neodpovídá hledání') : t('V tomhle měsíci žádné výdaje')}
          hint={kniha.length ? t('Zkus jiný druh nebo kratší slovo.') : t('Účtenky, objednávky a výdaje z kasy se sem propíšou samy.')} /></Card>
      ) : (
        <Card pad="none" className="px-5">
          <ul className="list">
            {vybrane.map((r, i) => {
              const druh = druhyVydaju(t)[r.kind] ?? { label: r.kind, tecka: 'cat-dot-6' };
              // Vlastní <li>: klikací ListRow se jinak kreslí jako <li class="contents">
              // a `.list > * + *` na něm linku nad řádkem nenakreslí. Šipka žádná —
              // měla by ji jen účtenka a odsunula by jí částku ze sloupce čísel;
              // detail se otevírá klepnutím na celý řádek.
              return (
                <li key={`${r.date}-${i}`}>
                  <ListRow as="div" chevron={false}
                    lead={<span aria-hidden className={`h-2.5 w-2.5 rounded-full ${druh.tecka}`} />}
                    title={r.label}
                    meta={[kratce(r.date), druh.label, r.note, r.photoUrl ? t('s fotkou') : null].filter(Boolean).join(' · ')}
                    value={<span className="tabular-nums">−{money(r.amount)}</span>}
                    onClick={r.kind === 'receipt' ? () => setDetail(r) : undefined} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} size="md" title={detail?.label ?? t('Účtenka')}
        subtitle={detail ? `${dlouze(detail.date, loc)} · ${money(detail.amount)}` : undefined}
        footer={detail?.photoUrl ? (
          // V obalu `download` z odkazu nic neudělá: fotka jde přes lib/stahni (sdílecí list).
          <a href={detail.photoUrl} download={`uctenka-${detail.date}.jpg`} className="btn btn-primary"
            onClick={ev => { if (jeObalKlient()) { ev.preventDefault(); void ulozZAdresy(detail.photoUrl!, `uctenka-${detail.date}.jpg`); } }}>
            <Icon name="download" size={18} />  {t('Stáhnout fotku')}
          </a>
        ) : undefined}>
        {detail && (
          <div className="space-y-3">
            {detail.note && <Well><p className="text-sm text-[#16181A]">{detail.note}</p></Well>}
            {detail.photoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={detail.photoUrl} alt={t('Účtenka {nazev}', { nazev: detail.label })} className="w-full rounded-2xl border border-[var(--surface-line)]" />
              : <p className="t-meta">{t('Účtenka je bez fotky.')}</p>}
          </div>
        )}
      </Modal>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Stránka
// ---------------------------------------------------------------------------

export default function FinanceView() {
  const t = useT('sprava');
  const smi = useSmi();
  const { pro } = usePlan();
  const dnes = pragueToday().slice(0, 7);
  const [mesic, setMesic] = useState(dnes);
  const [exportuji, setExportuji] = useState(false);
  const [upgrade, setUpgrade] = useState<string | null>(null);

  // Export jen s finance.exportovat (a knihou výdajů, ze které se skládá).
  const smiExport = smi('finance.exportovat') && smi('finance.zobrazit');
  return (
    <MesicStrankyFinanci.Provider value={mesic}>
      <PlochaWidgetu
        stranka="vedeni.finance"
        hlavicka={{
          title: t('Finance'),
          subtitle: t('Tržby, nákupy a mzdy měsíce pohromadě.'),
          hintId: 'financeview',
          primary: smiExport ? (
            <Button variant="accent" icon="download" onClick={() => (pro ? setExportuji(true) : setUpgrade(t('Export pro účetní')))}>{t('Export pro účetní')}</Button>
          ) : undefined,
          // Budoucí měsíc nemá co ukázat — šipka dopředu se na dnešku zastaví.
          aside: <MonthNav value={mesic} onChange={setMesic} max={dnes} />,
        }}
        nastroj={<KnihaVydaju mesic={mesic} />}
      />
      {exportuji && <ExportDialog mesic={mesic} onClose={() => setExportuji(false)} />}
      {upgrade && <UpgradeModal feature={upgrade} onClose={() => setUpgrade(null)} />}
    </MesicStrankyFinanci.Provider>
  );
}
