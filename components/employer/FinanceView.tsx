'use client';

// Finance — kam jdou peníze (kolo 69, balík B5b: stránka → plocha s widgety).
//
// Dřív jedna obrazovka se sedmi bloky psanými ručně: tmavá dlaždice Tržby
// s rozmazanou skvrnou (FinanceView.tsx:223), kolečko uprostřed místo kostry
// (:215), štítek t-label jako nadpis sekce (:391), ruční přepínač měsíce
// a filtr, ručně skládaná okna. Teď:
//  - hlavička je PageHeader s jedinou limetkou „Export pro účetní" (jen na
//    monitoru — kolo 81, V12: stáhnout CSV do telefonu není hlavní akce, na
//    telefonu je export v „···" a hlavička je v řádku bez limetky) a výběrem
//    období (kolo 8, R8-4: místo ‹ měsíc › jedno tlačítko jako ObdobiLista —
//    Tento měsíc, Minulý, Čtvrtletí, Od začátku roku, Loňský rok, Vlastní od–do,
//    a „Srovnat s: předchozí období / stejné období loni", jako Square a Toast);
//    období jde přes MesicStrankyFinanci i do widgetů, takže souhrn nahoře
//    a kniha výdajů dole ukazují vždycky tentýž rozsah (a jednu URL);
//  - „···" nese „Pravidelné náklady…" (nájem, energie → výsledek měsíce po nich,
//    components/settings/PevneNaklady) a přepnutí knihy „Podle dodavatele";
//  - bloky jsou widgety (components/widgety/oblasti/finance.tsx a trzby.tsx),
//    každý se svým oprávněním — Finance dřív nečetla ma() vůbec a spoléhala
//    na 403 nebo prázdná data (audit „Finance – oprávnění");
//  - nástrojem stránky je kniha výdajů: Section (h2), hledání, Segmented
//    filtr, jedna karta s .list, detail účtenky a export v <Modal>.
//
// CSV pro účetní se skládá v prohlížeči ze stejného /api/finance, jaký kreslí
// obrazovka, takže čísla v souboru sedí s tím, co vedení vidí.

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Icon } from '../Icons';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { usePlan, UpgradeModal } from '../Pro';
import { ulozSoubor, ulozZAdresy, jeObalKlient } from '@/lib/stahni';
import {
  Button, Card, EmptyState, ErrorState, Field, Input, ListRow, Modal, SearchField, Section,
  Segmented, Select, Skeleton, SwitchRow, Toast, Well, nazevMesice, type MenuItem,
} from '../ui';
import { aktualniJazyk } from '@/lib/i18n/stav';
import { apiMessage, okJson } from '@/lib/api';
import { otevriDen } from '@/lib/denUdalost';
import { URL_UCTENEK, popiskyKategorii, volbyKategorii } from './ReceiptsPanel';
import PevneNaklady from '../settings/PevneNaklady';
import { obnovDataWidgetu } from '../widgety/useDataWidgetu';
import { obsahuje } from '@/lib/hledani';
import { pragueToday } from '@/lib/pragueTime';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import { useOpravneni } from '../role/useOpravneni';
import { MesicStrankyFinanci, SrovnaniStrankyFinanci } from '../widgety/oblasti/finance';
import {
  urlFinanci, vyberFinance, KATEGORIE_UCTENEK, POPISKY_KATEGORII_CS, VYCHOZI_KATEGORIE_UCTENKY, poctyKategorii, podleDodavatele,
  PRESETY_OBDOBI_FINANCI, obdobiZRozsahu, pocetMesicuRozsahu, posunMesice, rozsahMesicu, rozsahSrovnani, rozsahZVolby,
  type FinanceMesice, type KategorieUctenky, type PresetObdobiFinanci, type RadekKnihy, type SrovnaniFinanci,
} from '@/lib/financeWidgety';
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
    // Kolo 81: sloupec „Kategorie" (jen účtenky) až na konci, ať účetní šablony na první pět sloupců dál sedí.
    rows.push(['Datum', 'Typ', 'Popis', `Částka (${symbol})`, 'Poznámka', 'Kategorie']); // i18n-ok (CSV)
    for (const r of (raw.ledger ?? []) as RadekKnihy[]) {
      rows.push([r.date, DRUHY[r.kind]?.label ?? r.kind, r.label, String(r.amount), r.note ?? '', r.kind === 'receipt' && r.category ? POPISKY_KATEGORII_CS[r.category] : '']);
    }
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

/** Sestavitelný export: od kdy do kdy (předvyplněné z období stránky) a co v souboru bude. */
function ExportDialog({ obdobi, onClose }: { obdobi: string; onClose: () => void }) {
  const t = useT('sprava');
  const symbol = useSymbol();
  const rozsah = rozsahMesicu(obdobi);
  const [od, setOd] = useState(rozsah.od);
  const [doMesice, setDoMesice] = useState(rozsah.do);
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
// Období stránky: měsíc, čtvrtletí, rok, vlastní od–do + srovnání (kolo 8)
// ---------------------------------------------------------------------------

/** Rozsah pro lidi: „září 2026", nebo „červenec 2026 – září 2026". */
function nazevRozsahu(od: string, doM: string): string {
  const jazyk = aktualniJazyk();
  return od === doM ? nazevMesice(od, jazyk) : `${nazevMesice(od, jazyk)} – ${nazevMesice(doM, jazyk)}`;
}

/**
 * Jedno tlačítko v hlavičce („Tento měsíc · říjen 2026 ▾") a okno s rychlými volbami, vlastním
 * od–do po měsících a přepínačem srovnání — stejná stavba jako ObdobiLista u grafů (ta pracuje
 * se dny; Finance se počítají po měsících, proto vlastní kus se stejným vzhledem). Na telefonu
 * okno vyjede zdola (Modal).
 */
function ObdobiFinanci({ preset, obdobi, srovnani, onZmena, onSrovnani }: {
  preset: PresetObdobiFinanci; obdobi: string; srovnani: SrovnaniFinanci;
  onZmena: (preset: PresetObdobiFinanci, obdobi: string) => void; onSrovnani: (s: SrovnaniFinanci) => void;
}) {
  const t = useT('sprava');
  const [otevreno, setOtevreno] = useState(false);
  const dnes = pragueToday();
  const r = rozsahMesicu(obdobi, dnes);
  const popisky: Record<PresetObdobiFinanci, string> = {
    tento_mesic: t('Tento měsíc'), minuly_mesic: t('Minulý měsíc'), ctvrtleti: t('Čtvrtletí'),
    od_zacatku_roku: t('Od začátku roku'), lonsky_rok: t('Loňský rok'), vlastni: t('Vlastní'),
  };
  const zvol = (id: PresetObdobiFinanci) => {
    if (id === 'vlastni') { onZmena('vlastni', obdobi); return; }
    const x = rozsahZVolby(id, dnes);
    onZmena(id, obdobiZRozsahu(x.od, x.do));
    setOtevreno(false);
  };
  const vlastni = (od: string, doM: string) => {
    if (!od || !doM) return;
    const [a, b] = doM < od ? [doM, od] : [od, doM];
    onZmena('vlastni', obdobiZRozsahu(a, b));
  };
  const nazev = nazevRozsahu(r.od, r.do);
  const srov = rozsahMesicu(rozsahSrovnani(obdobi, srovnani), dnes);
  // Šipky ‹ › jako u MonthNav: krok o celé období zpět a vpřed (měsíc → minulý měsíc, čtvrtletí → předchozí
  // čtvrtletí); dopředu jen po dnešní měsíc. Jeden měsíc dostane zpět jméno rychlé volby, jinak je to „Vlastní".
  const jedenMesic = r.od === r.do;
  const tentoMesic = dnes.slice(0, 7);
  const naKonci = r.do >= tentoMesic;
  const krok = (smer: -1 | 1) => {
    if (smer === 1 && naKonci) return;
    const n = pocetMesicuRozsahu(r.od, r.do);
    let od = posunMesice(r.od, smer * n), doM = posunMesice(r.do, smer * n);
    if (doM > tentoMesic) { doM = tentoMesic; od = posunMesice(doM, -(n - 1)); }
    const p: PresetObdobiFinanci = od === doM ? (od === tentoMesic ? 'tento_mesic' : od === posunMesice(tentoMesic, -1) ? 'minuly_mesic' : 'vlastni') : 'vlastni';
    onZmena(p, obdobiZRozsahu(od, doM));
  };
  const zamcena = 'aria-disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:active:scale-100';

  return (
    <div className="flex items-center gap-1 glass rounded-full p-1 min-w-0 w-full sm:w-fit" role="group" aria-label={t('Období')}>
      <button type="button" onClick={() => krok(-1)} aria-label={jedenMesic ? t('Předchozí měsíc') : t('Předchozí období')} className={`tap-target btn-icon ${zamcena}`}>
        <Icon name="chevronRight" size={16} className="rotate-180" />
      </button>
      <button type="button" aria-haspopup="dialog" aria-expanded={otevreno} onClick={() => setOtevreno(true)}
        className="tap-target inline-flex flex-1 max-w-full min-w-0 items-center justify-center gap-2 rounded-full py-1.5 px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542]">
        <Icon name="calendar" size={16} className="shrink-0 text-black/55" />
        <span aria-live="polite" className="min-w-0 truncate text-sm">
          {preset !== 'vlastni' && <span className="font-semibold text-[#16181A]">{popisky[preset]}</span>}
          {preset !== 'vlastni' && <span className="text-black/50">{' · '}</span>}
          <span className={`cz-sentence ${preset !== 'vlastni' ? 'text-black/50' : 'font-semibold text-[#16181A]'}`}>{nazev}</span>
        </span>
        <Icon name="chevron" size={14} className="shrink-0 text-black/45" />
      </button>
      <button type="button" onClick={() => krok(1)} aria-disabled={naKonci || undefined} aria-label={jedenMesic ? t('Další měsíc') : t('Další období')} className={`tap-target btn-icon ${zamcena}`}>
        <Icon name="chevronRight" size={16} />
      </button>
      <Modal open={otevreno} onClose={() => setOtevreno(false)} size="sm" title={t('Období')}
        subtitle={<span className="cz-sentence">{nazev}</span>}
        footer={<Button variant="primary" onClick={() => setOtevreno(false)}>{t('Hotovo')}</Button>}>
        <div className="space-y-5">
          <div role="group" aria-label={t('Rychlá volba období')} className="grid grid-cols-2 gap-2">
            {PRESETY_OBDOBI_FINANCI.map(id => (
              <button key={id} type="button" aria-pressed={preset === id} onClick={() => zvol(id)}
                className={`filter-pill tap-target justify-center ${preset === id ? 'seg-on' : 'seg-off glass'}`}>{popisky[id]}</button>
            ))}
          </div>
          <div className="space-y-2">
            <p className="t-label">{t('Vlastní rozmezí')}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field id="fin-od" label={t('Od měsíce')}>
                <Input id="fin-od" type="month" value={r.od} max={r.do} onChange={e => vlastni(e.target.value, r.do)} />
              </Field>
              <Field id="fin-do" label={t('Do měsíce')}>
                <Input id="fin-do" type="month" value={r.do} min={r.od} max={dnes.slice(0, 7)} onChange={e => vlastni(r.od, e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="t-label">{t('Srovnat s')}</p>
            <Segmented size="sm" ariaLabel={t('Srovnat s')} value={srovnani} onChange={onSrovnani}
              options={[{ id: 'predchozi', label: t('Předchozí období') }, { id: 'loni', label: t('Stejné období loni') }]} />
            <p className="t-meta cz-sentence">{nazevRozsahu(srov.od, srov.do)}</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nástroj: kniha výdajů
// ---------------------------------------------------------------------------

/** Pás pilulek kategorií účtenek (DP §Filtrovací pás): počty, druhý klik ruší, na telefonu jede do strany. */
function PasKategorii({ pocty, vybrana, onZmena }: { pocty: Record<KategorieUctenky, number>; vybrana: KategorieUctenky | null; onZmena: (k: KategorieUctenky | null) => void }) {
  const t = useT('sprava');
  const popisky = popiskyKategorii(t);
  const sPocty = KATEGORIE_UCTENEK.filter(k => pocty[k] > 0);
  if (sPocty.length === 0) return null;
  return (
    <div role="group" aria-label={t('Kategorie účtenky')} className="flex gap-2 overflow-x-auto scrollbar-thin scroll-fade-x py-1 items-center">
      {sPocty.map(k => {
        const on = vybrana === k;
        // Jako filtrovací pás v Návodech: počet ztlumeně za popiskem, žádný vlastní odznak.
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => onZmena(on ? null : k)}
            className={`filter-pill tap-target whitespace-nowrap shrink-0 ${on ? 'seg-on' : 'seg-off glass'}`}>
            {popisky[k]} <span className="tabular-nums opacity-60">{pocty[k]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Detail účtenky: fotka, poznámka; datum nákupu a kategorie jdou opravit (finance.uctenky_upravit), jinak jen čtení. */
function DetailUctenky({ r, mesic, smiUpravit, onHlaska }: { r: RadekKnihy; mesic: string; smiUpravit: boolean; onHlaska: (text: string, ton?: 'bad') => void }) {
  const t = useT('sprava');
  const loc = useLocale();
  const popisky = popiskyKategorii(t);
  const dnes = pragueToday();
  const [datum, setDatum] = useState(r.date);
  const [kategorie, setKategorie] = useState<KategorieUctenky>(r.category ?? VYCHOZI_KATEGORIE_UCTENKY);
  const [ukladam, setUkladam] = useState(false);
  const zmeneno = datum !== r.date || kategorie !== (r.category ?? VYCHOZI_KATEGORIE_UCTENKY);

  const ulozit = async () => {
    if (r.receiptId == null) return;
    setUkladam(true);
    try {
      await fetch(URL_UCTENEK, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.receiptId, purchaseDate: datum, category: kategorie }),
      }).then(okJson);
      // Jiné datum může účtenku přesunout do jiného měsíce — kniha i seznam účtenek se načtou znovu.
      obnovDataWidgetu(urlFinanci(mesic));
      obnovDataWidgetu(URL_UCTENEK);
      onHlaska(t('Účtenka upravena: {datum} · {kategorie}.', { datum: dlouze(datum, loc), kategorie: popisky[kategorie] }));
    } catch (e) {
      onHlaska(apiMessage(e, t('Účtenku se nepodařilo upravit.')), 'bad');
    } finally { setUkladam(false); }
  };

  return (
    <div className="space-y-3">
      {r.note && <Well><p className="text-sm text-[#16181A]">{r.note}</p></Well>}
      {smiUpravit ? (
        <div className="space-y-3">
          <Field id="uct-datum" label={t('Datum nákupu')}>
            <Input id="uct-datum" type="date" value={datum} max={dnes} onChange={e => setDatum(e.target.value)} />
          </Field>
          <div>
            <p className="t-label mb-1.5">{t('Kategorie')}</p>
            <Segmented size="sm" ariaLabel={t('Kategorie účtenky')} value={kategorie} onChange={setKategorie} options={volbyKategorii(t)} />
          </div>
          {zmeneno && (
            <div className="flex justify-end">
              <Button variant="secondary" loading={ukladam} disabled={!datum || datum > dnes} onClick={ulozit}>{t('Uložit změnu')}</Button>
            </div>
          )}
        </div>
      ) : (
        <p className="t-meta">{t('Nákup {datum}', { datum: dlouze(r.date, loc) })} · {r.category ? popisky[r.category] : t('bez kategorie', undefined, 'uctenka')}</p>
      )}
      {r.photoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={r.photoUrl} alt={t('Účtenka {nazev}', { nazev: r.label })} className="w-full rounded-2xl border border-[var(--surface-line)]" />
        : <p className="t-meta">{t('Účtenka je bez fotky.')}</p>}
    </div>
  );
}

/** Detail objednávky dodavateli: položky a kdo objednal (kolo 81 — dřív šla rozkliknout jen účtenka). */
function DetailObjednavky({ r }: { r: RadekKnihy }) {
  const t = useT('sprava');
  const loc = useLocale();
  const polozky = r.items ?? [];
  return (
    <div className="space-y-3">
      {r.orderedBy && <p className="t-meta">{t('objednal {jmeno}', { jmeno: r.orderedBy })}</p>}
      {polozky.length === 0 ? (
        <p className="t-meta">{t('Objednávka bez rozpisu položek.')}</p>
      ) : (
        <ul className="list">
          {polozky.map((p, i) => (
            <ListRow key={`${p.name}-${i}`} title={p.name}
              value={<span className="tabular-nums">{p.qty.toLocaleString(loc)}{p.unit ? ` ${p.unit}` : ''}</span>} />
          ))}
        </ul>
      )}
    </div>
  );
}

function KnihaVydaju({ mesic, podleDodavatelu, onZrusitDodavatele }: { mesic: string; podleDodavatelu: boolean; onZrusitDodavatele: () => void }) {
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
  const smiUpravitUctenky = smi('finance.uctenky_upravit');
  const data = useDataWidgetu<FinanceMesice>(smiFinance ? urlFinanci(mesic) : null, vyberFinance);
  const [filtr, setFiltrStav] = useState<Filtr>('all');
  // Kategorie účtenek (kolo 81): druhý pás jen u druhu Účtenka; přepnutí druhu ji zruší.
  const [kategorie, setKategorie] = useState<KategorieUctenky | null>(null);
  const setFiltr = (f: Filtr) => { setFiltrStav(f); if (f !== 'receipt') setKategorie(null); };
  // Účetní se ptá „kolik jsme loni dali Moninu" — klikat se přes celý měsíc je zdlouhavé.
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<RadekKnihy | null>(null);
  const [toast, setToast] = useState<{ text: string; ton?: 'bad'; id: number } | null>(null);
  const hlaska = (text: string, ton?: 'bad') => setToast({ text, ton, id: Date.now() });
  const kniha = data.data?.kniha ?? [];
  const pocty = useMemo(() => {
    const m: Record<string, number> = { all: kniha.length };
    for (const r of kniha) m[r.kind] = (m[r.kind] ?? 0) + 1;
    return m;
  }, [kniha]);
  const poctyKat = useMemo(() => poctyKategorii(kniha), [kniha]);
  const dodavatele = useMemo(() => podleDodavatele(kniha), [kniha]);
  const jehla = q.trim();
  const vybrane = kniha
    .filter(r => filtr === 'all' || r.kind === filtr)
    .filter(r => !kategorie || (r.kind === 'receipt' && (r.category ?? 'jine') === kategorie))
    .filter(r => obsahuje(`${r.label} ${r.note ?? ''}`, jehla));
  const soucet = vybrane.reduce((a, r) => a + r.amount, 0);
  const popiskyKat = popiskyKategorii(t);
  // Víc měsíců (kolo 8): řádky po měsících, nejnovější první — v knize za čtvrtletí jinak splývají.
  const mesicu = data.data?.mesicu ?? 1;
  const poMesicich = useMemo(() => {
    if (mesicu <= 1) return null;
    const m = new Map<string, RadekKnihy[]>();
    for (const r of vybrane) { const k = r.date.slice(0, 7); m.set(k, [...(m.get(k) ?? []), r]); }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kniha, filtr, kategorie, jehla, mesicu]);

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

  // Podle dodavatele (kolo 81): účtenky a objednávky seskupené; klepnutí zúží seznam hledáním na jméno.
  const vybratDodavatele = (nazev: string) => { setQ(nazev); setFiltr('all'); onZrusitDodavatele(); };
  const radekKnihy = (r: RadekKnihy, i: number) => {
    const druh = druhyVydaju(t)[r.kind] ?? { label: r.kind, tecka: 'cat-dot-6' };
    // Vlastní <li>: klikací ListRow se jinak kreslí jako <li class="contents">
    // a `.list > * + *` na něm linku nad řádkem nenakreslí. Šipka žádná —
    // měla by ji jen účtenka a odsunula by jí částku ze sloupce čísel;
    // detail se otevírá klepnutím na celý řádek (účtenka i objednávka; výdaj z kasy otevře den).
    const maDetail = r.kind === 'receipt' || r.kind === 'order';
    return (
      <li key={`${r.date}-${i}`}>
        <ListRow as="div" chevron={false}
          lead={<span aria-hidden className={`h-2.5 w-2.5 rounded-full ${druh.tecka}`} />}
          title={r.label}
          meta={[kratce(r.date), druh.label, r.kind === 'receipt' && r.category ? popiskyKat[r.category] : null, r.note, r.photoUrl ? t('s fotkou') : null].filter(Boolean).join(' · ')}
          value={<span className="tabular-nums">−{money(r.amount)}</span>}
          // Výdaj z kasy patří k uzávěrce dne: klepnutí otevře celý den (Finance dne) jako řádek
          // v widgetech. Tlačítko v řádku by odsunulo částku ze sloupce čísel (sonda k69-b5b).
          onClick={r.kind === 'expense' ? () => otevriDen(r.date, 'finance') : maDetail ? () => setDetail(r) : undefined} />
      </li>
    );
  };
  const hintSekce = !data.data ? undefined
    : podleDodavatelu
      ? `${t('{n, plural, one {# dodavatel} few {# dodavatelé} other {# dodavatelů}}', { n: dodavatele.length })} · ${t('celkem {castka}', { castka: money(dodavatele.reduce((a, d) => a + d.castka, 0)) })}`
      : `${vybrane.length.toLocaleString(loc)}${vybrane.length !== kniha.length ? ` ${t('z {n}', { n: kniha.length.toLocaleString(loc) })}` : ''} · ${t('celkem {castka}', { castka: money(soucet) })}`;

  return (
    <Section id="finance-vydaje" title={podleDodavatelu ? t('Výdaje podle dodavatele') : t('Výdaje')} hint={hintSekce}>
      {!podleDodavatelu && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
          <SearchField className="min-w-0 sm:w-64" value={q} onChange={setQ}
            placeholder={t('Hledat v popisu')} ariaLabel={t('Hledat ve výdajích')} storageKey="finance" />
          <Segmented size="sm" ariaLabel={t('Druh výdaje')} value={filtr} onChange={setFiltr}
            options={filtryVydaju(t).map(f => ({ id: f.id, label: f.label, count: pocty[f.id] ?? 0 }))} />
        </div>
      )}
      {!podleDodavatelu && filtr === 'receipt' && <PasKategorii pocty={poctyKat} vybrana={kategorie} onZmena={setKategorie} />}
      {data.error ? (
        <ErrorState title={t('Výdaje se nenačetly')} detail={data.error} onRetry={data.reload} />
      ) : data.loading ? (
        <Card aria-busy><div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className={`h-12 ${i === 3 ? 'w-2/3' : ''}`} />)}</div></Card>
      ) : podleDodavatelu ? (
        dodavatele.length === 0 ? (
          <Card><EmptyState compact icon="box" title={mesicu > 1 ? t('V tomhle období žádné účtenky ani objednávky') : t('V tomhle měsíci žádné účtenky ani objednávky')}
            hint={t('Dodavatelé se seskupí z účtenek a objednávek, jakmile nějaké budou.')} /></Card>
        ) : (
          <Card pad="none" className="px-5">
            <ul className="list">
              {dodavatele.map(d => (
                <li key={d.klic || '—'}>
                  <ListRow as="div" title={d.nazev || t('Bez dodavatele')}
                    meta={`${t('{n, plural, one {# doklad} few {# doklady} other {# dokladů}}', { n: d.dokladu })} · ${t('{pct} % výdajů', { pct: d.pct })}`}
                    value={<span className="tabular-nums">−{money(d.castka)}</span>}
                    onClick={d.nazev ? () => vybratDodavatele(d.nazev) : undefined} />
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : vybrane.length === 0 ? (
        <Card><EmptyState compact icon="book" title={kniha.length ? t('Nic neodpovídá hledání') : mesicu > 1 ? t('V tomhle období žádné výdaje') : t('V tomhle měsíci žádné výdaje')}
          hint={kniha.length ? t('Zkus jiný druh nebo kratší slovo.') : t('Účtenky, objednávky a výdaje z kasy se sem propíšou samy.')} /></Card>
      ) : poMesicich ? (
        <div className="space-y-4">
          {poMesicich.map(([m, radky]) => (
            <section key={m} aria-label={nazevMesice(m, aktualniJazyk())}>
              <p className="t-label cz-sentence mb-1">{nazevMesice(m, aktualniJazyk())} · {money(radky.reduce((a, r) => a + r.amount, 0))}</p>
              <Card pad="none" className="px-5">
                <ul className="list">{radky.map((r, i) => radekKnihy(r, i))}</ul>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <Card pad="none" className="px-5">
          <ul className="list">
            {vybrane.map((r, i) => radekKnihy(r, i))}
          </ul>
        </Card>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} size="md"
        title={detail?.label ?? (detail?.kind === 'order' ? t('Objednávka') : t('Účtenka'))}
        subtitle={detail ? `${dlouze(detail.date, loc)} · ${money(detail.amount)}` : undefined}
        footer={detail?.kind === 'receipt' && detail.photoUrl ? (
          // V obalu `download` z odkazu nic neudělá: fotka jde přes lib/stahni (sdílecí list).
          <a href={detail.photoUrl} download={`uctenka-${detail.date}.jpg`} className="btn btn-primary"
            onClick={ev => { if (jeObalKlient()) { ev.preventDefault(); void ulozZAdresy(detail.photoUrl!, `uctenka-${detail.date}.jpg`); } }}>
            <Icon name="download" size={18} />  {t('Stáhnout fotku')}
          </a>
        ) : undefined}>
        {detail?.kind === 'order' && <DetailObjednavky r={detail} />}
        {detail?.kind === 'receipt' && <DetailUctenky key={detail.receiptId ?? detail.date} r={detail} mesic={mesic} smiUpravit={smiUpravitUctenky} onHlaska={hlaska} />}
      </Modal>
      {toast && <Toast key={toast.id} id={toast.id} message={toast.text} tone={toast.ton} onClose={() => setToast(null)} />}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Stránka
// ---------------------------------------------------------------------------

/** Monitor (od `md`, kde PageHeader ukazuje vedlejší akce)? Na serveru „ne" — hydratace pak sedí s telefonem. */
const DOTAZ_MONITOR = '(min-width: 768px)';
function useMonitor(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(DOTAZ_MONITOR);
      if (!mq) return () => {};
      mq.addEventListener?.('change', cb);
      return () => mq.removeEventListener?.('change', cb);
    },
    () => window.matchMedia?.(DOTAZ_MONITOR).matches ?? false,
    () => false,
  );
}

export default function FinanceView() {
  const t = useT('sprava');
  const smi = useSmi();
  const { pro } = usePlan();
  const dnes = pragueToday().slice(0, 7);
  // Období stránky (kolo 8): rychlá volba + rozsah měsíců „RRRR-MM" nebo „RRRR-MM:RRRR-MM", a s čím srovnávat.
  const [preset, setPreset] = useState<PresetObdobiFinanci>('tento_mesic');
  const [mesic, setMesic] = useState(dnes);
  const [srovnani, setSrovnani] = useState<SrovnaniFinanci>('predchozi');
  const zmenObdobi = (p: PresetObdobiFinanci, o: string) => { setPreset(p); setMesic(o); };
  const [exportuji, setExportuji] = useState(false);
  const [pevne, setPevne] = useState(false);
  const [podleDodavatelu, setPodleDodavatelu] = useState(false);
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const monitor = useMonitor();

  // Export jen s finance.exportovat (a knihou výdajů, ze které se skládá).
  const smiExport = smi('finance.exportovat') && smi('finance.zobrazit');
  const smiPevne = smi('finance.nastaveni');
  const exportovat = () => (pro ? setExportuji(true) : setUpgrade(t('Export pro účetní')));
  const menu: MenuItem[] = [
    // Na telefonu je export v „···" (stažení CSV do telefonu není hlavní akce — V12); na monitoru je limetkou.
    ...(smiExport && !monitor ? [{ label: t('Export pro účetní'), icon: 'download', onClick: exportovat }] : []),
    ...(smiPevne ? [{ label: t('Pravidelné náklady…'), icon: 'coins', hint: t('Nájem, energie — výsledek měsíce je po nich'), onClick: () => setPevne(true) }] : []),
    // Seskupení knihy výdajů — jako položka menu, ne druhý Segmented vedle druhů.
    ...(smi('finance.zobrazit') ? [podleDodavatelu
      ? { label: t('Podle řádků'), icon: 'book', onClick: () => setPodleDodavatelu(false) }
      : { label: t('Podle dodavatele'), icon: 'box', hint: t('Účtenky a objednávky sečtené za dodavatele'), onClick: () => setPodleDodavatelu(true) }] : []),
  ];
  // Po uložení pevných nákladů se výsledek zobrazeného (a srovnávaného) období přepočítá na serveru.
  const poUlozeniPevnych = () => { obnovDataWidgetu(urlFinanci(mesic)); obnovDataWidgetu(urlFinanci(rozsahSrovnani(mesic, srovnani))); };
  return (
    <MesicStrankyFinanci.Provider value={mesic}>
    <SrovnaniStrankyFinanci.Provider value={srovnani}>
      <PlochaWidgetu
        stranka="vedeni.finance"
        hlavicka={{
          title: t('Finance'),
          subtitle: t('Tržby, nákupy a mzdy měsíce pohromadě.'),
          hintId: 'financeview',
          primary: smiExport && monitor ? (
            <Button variant="accent" icon="download" onClick={exportovat}>{t('Export pro účetní')}</Button>
          ) : undefined,
          menu: menu.length ? menu : undefined,
          // Období a srovnání v jednom tlačítku; budoucí měsíce nejdou zvolit (nemají co ukázat).
          aside: <ObdobiFinanci preset={preset} obdobi={mesic} srovnani={srovnani} onZmena={zmenObdobi} onSrovnani={setSrovnani} />,
        }}
        nastroj={<KnihaVydaju mesic={mesic} podleDodavatelu={podleDodavatelu} onZrusitDodavatele={() => setPodleDodavatelu(false)} />}
      />
      {exportuji && <ExportDialog obdobi={mesic} onClose={() => setExportuji(false)} />}
      {/* Bez podtitulu: vysvětlení nese PevneNaklady sama (kreslí se i v Nastavení › Podnik). */}
      <Modal open={pevne} onClose={() => setPevne(false)} size="md" title={t('Pravidelné náklady')}>
        {pevne && <PevneNaklady onUlozeno={poUlozeniPevnych} />}
      </Modal>
      {upgrade && <UpgradeModal feature={upgrade} onClose={() => setUpgrade(null)} />}
    </SrovnaniStrankyFinanci.Provider>
    </MesicStrankyFinanci.Provider>
  );
}
