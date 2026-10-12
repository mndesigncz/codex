'use client';

// Docházka (vedení) — plocha s widgety (kolo 69, balík B2, spec §6.2).
//
// Dřív jedna dlouhá stránka: „Právě na směně" v limetkových kartách, dvě
// dlaždice mezd s ručními štítky, mřížka karet „Souhrn hodin" a pod tím
// záznamy. Teď jsou bloky widgety (Právě na směně, Mzdy za období, Souhrn
// hodin, Otevřené příchody, Chybí sazba) a tahle komponenta nese jen
// hlavičku a nástroj: záznamy po dnech s hledáním, úpravou, přidáním
// a exportem — v jedné kartě s .list (DP §4 B), ne karta na den.
//
// Období 7/30/90 v hlavičce řídí nástroj i widgety s volbou „Podle stránky"
// (ObdobiStrankyDochazky). Nástroj čte záznamy přes useDataWidgetu na téže
// adrese jako tyto widgety, takže plocha pošle jediný dotaz a po úpravě
// záznamu (obnovDochazku) se překreslí obojí najednou.
//
// Kolo 7 (R7-2): u záznamu plán směny a odchylka („+12 min pozdě", „odešel o 25 min
// dřív"; lib/dochazkaPrehled.odchylkyZaznamu — přestávka nehlásí pozdní příchod), ruční
// oprava a přidání nesou důvod (Textarea do 300 znaků) a v řádku „upraveno (Martin)"
// s chipem Upraveno; CSV pro účetní má Plán od/do, Odchylku, Poznámku a kdo upravil.
//
// Oprávnění (kolo 67, katalog): přidat a opravit čas jen s dochazka.upravit,
// smazat s dochazka.mazat, export s dochazka.exportovat (sloupec Mzda jen
// s finance.mzdy). Dřív se tlačítka ukazovala všem, kdo docházku vidí,
// a končila 403.

import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Card, Chip, ErrorState, Field, Input, ListRow, Modal, ObdobiLista, SearchField, Select, Skeleton, Textarea } from '../ui';
import { usePersonProfile } from './ProfileLinkProvider';
import { useSymbol } from '../CurrencyProvider';
import { usePlan, UpgradeModal } from '../Pro';
import { ulozSoubor } from '@/lib/stahni';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useOpravneni } from '../role/useOpravneni';
import { ObdobiStrankyDochazky, obnovDochazku, zapamatujDniDochazky } from '../widgety/oblasti/dochazka';
import { dbTimeHM, parseDbTime, pragueDayOf, pragueToday } from '@/lib/pragueTime';
import { earnedFor } from '@/lib/wages';
import { apiMessage, okJson } from '@/lib/api';
import { obsahuje } from '@/lib/hledani';
import { csvPlanAUprava, hodinyMinuty, konecSmeny, navrhOdchodu, odchylkyZaznamu, rozeberZaznam, sazbyZRosteru, spropitneZaObdobi, upravyVRozmezi, zaznamyVRozmezi, type ClenRosteru, type UpravaMzdy, type UzaverkaSpropitne, type ZaznamDochazky } from '@/lib/dochazkaPrehled';
import { fmtHM } from '@/lib/i18n/format';
import { obdobiZPresetu, platneRozmezi, pocetDni } from '@/lib/obdobi';
import { useObdobi } from '@/lib/useObdobi';
import { dayPlus } from '@/lib/pragueTime';
import { useT } from '@/lib/i18n/client';
import { useLocale } from './jazyk';

type Zaznam = ZaznamDochazky & { id: number | string; employeeId: number | string };
interface Data { roster: ClenRosteru[]; entries: Zaznam[]; adjustments: UpravaMzdy[] }

function vyberData(raw: any): Data {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.roster)) throw new Error('Docházka přišla v nečekaném tvaru.'); // i18n-ok
  return { roster: raw.roster, entries: Array.isArray(raw.entries) ? raw.entries : [], adjustments: Array.isArray(raw.adjustments) ? raw.adjustments : [] };
}
function vyberUzaverky(raw: any): UzaverkaSpropitne[] {
  if (!raw || !Array.isArray(raw.closings)) throw new Error('Uzávěrky přišly v nečekaném tvaru.'); // i18n-ok
  return raw.closings;
}

/** Server vrací docházku nejvýš 180 dní zpět. */
const NEJDALE_DNI = 180;
/** Nejdelší důvod ruční opravy — stejný strop jako server (app/api/attendance). */
const MAX_DUVOD = 300;
/** Křestní jméno do řádku („upraveno (Martin)"); celé jméno nese CSV a title. */
const krestni = (jmeno: string | null | undefined) => String(jmeno ?? '').trim().split(/\s+/)[0] ?? '';
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

/** Datum na vstup datetime-local v místním čase prohlížeče. */
function doVstupu(v: string | Date | null | undefined): string {
  const d = v instanceof Date ? v : parseDbTime(v ?? null);
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** „H:MM" pro CSV (účetní sčítá sloupec). */
function hMM(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

const ZDROJ: Record<string, string> = { kiosk: 'tablet', closing: 'z uzávěrky', self: 'sám', manual: 'ručně' }; // i18n-ok (CSV pro účetní zůstává česky)

export default function Attendance({ user: _user }: { user: { id?: string | number } }) {
  const t = useT('sprava');
  const zdrojText = (s?: string | null) => s === 'kiosk' ? t('tablet') : s === 'closing' ? t('z uzávěrky') : s === 'self' ? t('sám') : t('ručně');
  const loc = useLocale();
  // Akce stránky podle `ma` (před načtením oprávnění a u staršího serveru ANO —
  // rozhoduje server), ne přísné useSmi widgetů: tlačítko se nesmí schovat
  // navždy jen proto, že /api/teams/mine oprávnění nepošle.
  const { ma: smi, nacteno } = useOpravneni();
  const smiUpravit = smi('dochazka.upravit');
  const smiMazat = smi('dochazka.mazat');
  const smiExport = smi('dochazka.exportovat');
  const vidiMzdy = smi('finance.mzdy');
  // Profil člena jen s tym.profil (přísně, jako widgety a Tým) — jinak by
  // okno profilu skončilo 403.
  const otevriProfil = usePersonProfile();
  const smiProfil = !!otevriProfil && nacteno && smi('tym.profil');
  const symbol = useSymbol();
  const { pro } = usePlan();
  const [upgradeFor, setUpgradeFor] = useState<string | null>(null);

  // Období je libovolné rozmezí (rychlé volby i od–do), ne jen 7 / 30 / 90 dní. Server ale umí nejvýš 180 dní zpět,
  // takže se načte od nejstaršího zvoleného dne a záznamy se pak zúží na rozmezí.
  const dnesDen = pragueToday();
  const { obdobi, nastav: nastavObdobi } = useObdobi('dochazka-stranka', obdobiZPresetu('30_dni', dnesDen));
  const rHrube = platneRozmezi(obdobi, dnesDen);
  const nejdrive = dayPlus(dnesDen, -(NEJDALE_DNI - 1));
  const r = { od: rHrube.od < nejdrive ? nejdrive : rHrube.od, do: rHrube.do };
  const dni = pocetDni(r.od, dnesDen);
  zapamatujDniDochazky(dni);
  const data = useDataWidgetu<Data>(`/api/attendance?days=${dni}`, vyberData);
  const entries = useMemo(() => zaznamyVRozmezi(data.data?.entries ?? [], r.od, r.do), [data.data, r.od, r.do]);
  const roster = data.data?.roster ?? [];
  // Hledání zúží patnáct lidí krát devadesát dní (přes tisíc řádků) na jednoho člověka.
  const [q, setQ] = useState('');

  // Běžící směny tikají po půl minutě — sekundy v seznamu nikdo nečte a
  // překreslovat tisíc řádků každou vteřinu je zbytečné.
  const [ted, setTed] = useState(() => Date.now());
  const nekdoBezi = entries.some(e => !e.clockOut);
  useEffect(() => {
    if (!nekdoBezi) return;
    const t = setInterval(() => setTed(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [nekdoBezi]);

  const sazby = useMemo(() => sazbyZRosteru(roster), [roster]);
  // Plán proti skutečnosti po záznamech (kolo 7) — počítá se ze všech záznamů období, ne jen
  // z vyhledaných: přestávka (dva záznamy na směnu) se posuzuje jako jedna směna.
  const plany = useMemo(() => odchylkyZaznamu(entries, ted), [entries, ted]);
  // Spropitné do exportu: z uzávěrek, rozpočítané podle hodin na směně (lib/dochazkaPrehled.spropitneZaObdobi) — jen
  // s celými tržbami, jinak by podíl lhal. Stejná adresa jako widgety, takže dotaz se sdílí.
  const vidiDyska = vidiMzdy && smi('finance.trzby') && smi('uzaverky.zobrazit_vse');
  const uzaverky = useDataWidgetu<UzaverkaSpropitne[]>(vidiDyska ? '/api/closings' : null, vyberUzaverky);
  const zobrazene = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? entries.filter(e => obsahuje(e.employeeName, n)) : entries;
  }, [entries, q]);
  // Po dnech podle pražského dne příchodu (API řadí od nejnovějšího).
  const dny = useMemo(() => {
    const m = new Map<string, Zaznam[]>();
    for (const e of zobrazene) {
      const d = parseDbTime(e.clockIn);
      const k = d ? pragueDayOf(d) : '';
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()].map(([den, list]) => ({
      den,
      nazev: den ? new Date(`${den}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }) : t('Bez data'),
      list,
    }));
  }, [zobrazene, loc, t]);

  // ---- Úprava a ukončení ----
  const [uprava, setUprava] = useState<{ e: Zaznam; od: string; do: string; duvod: string; zPlanu?: boolean } | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [chybaUpravy, setChybaUpravy] = useState<string | null>(null);
  // „Ukončit" zapomenutého odchodu nesmí předvyplnit teď: kdo odešel v 16:00 a vedoucí
  // to zavírá v 19:00, dostal by tři hodiny navíc ve mzdě. Stejně jako widgety
  // Právě na směně a Otevřené příchody navrhne plánovaný konec směny; bez plánu
  // (nebo u staršího dne, kam dnešní plán nepatří) teď.
  const otevriUpravu = (e: Zaznam, ukoncit = false) => {
    setChybaUpravy(null);
    let odchod = doVstupu(e.clockOut);
    let zPlanu = false;
    if (ukoncit) {
      const od = parseDbTime(e.clockIn);
      const clen = roster.find(m => String(m.id) === String(e.employeeId));
      const konec = konecSmeny(pragueToday(), clen?.shiftStart, clen?.shiftEnd);
      const n = od ? navrhOdchodu(od, konec, Date.now()) : null;
      odchod = doVstupu(n?.cas ?? new Date());
      zPlanu = !!n?.zPlanu;
    }
    // Důvod předvyplní dosavadní poznámku — kdo ji nechá, nic nezmění; kdo ji smaže, smaže ji.
    setUprava({ e, od: doVstupu(e.clockIn), do: odchod, duvod: e.note ?? '', zPlanu });
  };
  const ulozUpravu = async () => {
    if (!uprava) return;
    setUkladam(true); setChybaUpravy(null);
    try {
      await fetch('/api/attendance', {
        method: 'PATCH', headers: JSON_HLAVICKA,
        body: JSON.stringify({
          id: uprava.e.id,
          clockIn: uprava.od ? new Date(uprava.od).toISOString() : undefined,
          clockOut: uprava.do ? new Date(uprava.do).toISOString() : null,
          note: uprava.duvod.trim(),
        }),
      }).then(okJson);
      setUprava(null);
      obnovDochazku();
    } catch (err) {
      setChybaUpravy(apiMessage(err, t('Změnu se nepodařilo uložit.')));
    } finally {
      setUkladam(false);
    }
  };

  // ---- Přidání záznamu (někdo se zapomněl odpíchnout úplně) ----
  const [pridat, setPridat] = useState(false);
  const [novy, setNovy] = useState<{ kdo: string; od: string; do: string; duvod: string }>({ kdo: '', od: '', do: '', duvod: '' });
  const [pridavam, setPridavam] = useState(false);
  const [chybaPridani, setChybaPridani] = useState<string | null>(null);
  const ulozNovy = async () => {
    if (!novy.kdo || !novy.od || !novy.do) { setChybaPridani(t('Vyplň člověka i oba časy.')); return; }
    setPridavam(true); setChybaPridani(null);
    try {
      await fetch('/api/attendance', {
        method: 'POST', headers: JSON_HLAVICKA,
        body: JSON.stringify({ employeeId: Number(novy.kdo), clockIn: new Date(novy.od).toISOString(), clockOut: new Date(novy.do).toISOString(), note: novy.duvod.trim() || undefined }),
      }).then(okJson);
      setPridat(false);
      setNovy({ kdo: '', od: '', do: '', duvod: '' });
      obnovDochazku();
    } catch (err) {
      setChybaPridani(apiMessage(err, t('Záznam se nepodařilo přidat.')));
    } finally {
      setPridavam(false);
    }
  };

  // ---- Smazání (potvrzení v okně, ne confirm()) ----
  const [smazat, setSmazat] = useState<Zaznam | null>(null);
  const [mazu, setMazu] = useState(false);
  const [chybaSmazani, setChybaSmazani] = useState<string | null>(null);
  const potvrdSmazani = async () => {
    if (!smazat) return;
    setMazu(true); setChybaSmazani(null);
    try {
      await fetch(`/api/attendance?id=${smazat.id}`, { method: 'DELETE' }).then(okJson);
      data.set(d => ({ roster: d?.roster ?? [], entries: (d?.entries ?? []).filter(x => x.id !== smazat.id), adjustments: d?.adjustments ?? [] }));
      setSmazat(null);
      obnovDochazku();
    } catch (err) {
      setChybaSmazani(apiMessage(err, t('Záznam se nepodařilo smazat.')));
    } finally {
      setMazu(false);
    }
  };

  const exportCsv = () => {
    if (!pro) { setUpgradeFor('Export CSV'); return; } // i18n-ok (název funkce)
    const dyska = vidiDyska && uzaverky.data ? spropitneZaObdobi(uzaverky.data, entries, Date.now(), r.od, r.do) : null;
    const sDyskem = !!dyska && !dyska.skryto;
    // Plán, odchylka a stopa ruční opravy (kolo 7) stojí hned za Zdrojem: účetní chce vidět, co je z tabletu, co opravené a proč.
    const hlava = ['Datum', 'Zaměstnanec', 'Příchod', 'Odchod', 'Odpracováno', 'Zdroj', 'Plán od', 'Plán do', 'Odchylka (min)', 'Poznámka', 'Upravil', ...(vidiMzdy ? [`Mzda (${symbol})`] : []), ...(sDyskem ? [`Spropitné podíl (${symbol})`] : [])]; // i18n-ok (CSV pro účetní zůstává česky)
    // Podíl na spropitném je za den a člověka — v CSV ho nese první záznam toho dne, ať se nesčítá dvakrát.
    const dyskoVyplneno = new Set<string>();
    const radky = entries.map(e => {
      const od = parseDbTime(e.clockIn);
      const z = rozeberZaznam(e, Date.now());
      const sazba = sazby.get(String(e.employeeId));
      const klicDne = `${od ? pragueDayOf(od) : ''}|${e.employeeId}`;
      const dysko = sDyskem && !dyskoVyplneno.has(klicDne) ? dyska!.poDnech.get(klicDne) ?? 0 : 0;
      if (sDyskem) dyskoVyplneno.add(klicDne);
      return [
        od ? od.toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague' }) : '',
        e.employeeName ?? 'Neznámý', // i18n-ok
        dbTimeHM(e.clockIn),
        e.clockOut ? dbTimeHM(e.clockOut) : '',
        hMM(z.delka),
        ZDROJ[e.source ?? ''] ?? 'ručně', // i18n-ok
        ...csvPlanAUprava(e, plany.get(String(e.id))),
        // Stejné pravidlo jako součty (lib/wages): mzda po záznamu, záznam nad 24 h 0.
        ...(vidiMzdy ? [sazba ? String(earnedFor(z.ms, sazba)) : ''] : []),
        ...(sDyskem ? [dysko > 0 ? String(Math.round(dysko)) : ''] : []),
      ];
    });
    // Prémie a srážky jako vlastní řádky (den, člověk, částka ve sloupci Mzda) — účetní je sečte se mzdou.
    const upravy = vidiMzdy ? upravyVRozmezi(data.data?.adjustments ?? [], r.od, r.do).map(u => {
      const kdo = roster.find(m => String(m.id) === String(u.userId));
      return [
        String(u.day).slice(0, 10).split('-').reverse().map(Number).join('. '), // „12. 10. 2026" bez locale — CSV je pro účetní
        kdo?.name ?? 'Neznámý', '', '', '', // i18n-ok
        `${u.amount > 0 ? 'prémie' : 'srážka'}${u.note ? `: ${u.note}` : ''}`, // i18n-ok
        '', '', '', '', '',
        String(u.amount),
        ...(sDyskem ? [''] : []),
      ];
    }) : [];
    const csv = [hlava, ...radky, ...upravy].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    void ulozSoubor(`dochazka-${r.od}_${r.do}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
  };

  const pocet = zobrazene.length;
  const nastroj = (
    <Card pad="none" aria-labelledby="dochazka-zaznamy-t">
      <div className="px-5 pt-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="dochazka-zaznamy-t" className="t-card flex items-center gap-2">
            
            {t('Záznamy docházky')}
            {data.data && (
              <Chip tone="muted" size="sm">{q.trim() && pocet !== entries.length ? t('{a} z {b}', { a: pocet.toLocaleString(loc), b: entries.length.toLocaleString(loc) }) : pocet.toLocaleString(loc)}</Chip>
            )}
          </h2>
        </div>
        {entries.length > 10 && (
          <SearchField value={q} onChange={setQ} storageKey="dochazka" placeholder={t('Hledat člověka…')} ariaLabel={t('Hledat člověka v docházce')} />
        )}
      </div>
      <div className="px-5 pb-3 pt-2">
        {data.loading ? (
          <div className="space-y-2 pb-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.error ? (
          <ErrorState compact title={t('Záznamy se nenačetly')} detail={data.error} onRetry={data.reload} />
        ) : entries.length === 0 ? (
          <p className="t-meta py-4">{t('V tomto období nejsou žádné záznamy docházky.')}</p>
        ) : pocet === 0 ? (
          <p className="t-meta py-4">{t('Nikdo takový za tohle období nic neodpíchl.')}</p>
        ) : dny.map(d => (
          <section key={d.den} aria-label={d.nazev} className="pt-2">
            <p className="t-label cz-sentence pt-2">{d.nazev}</p>
            <ul className="list">
              {d.list.map(e => {
                const z = rozeberZaznam(e, ted);
                const bezi = z.druh === 'bezi';
                const zapomenuty = z.druh === 'zapomenuty';
                const cas = `${dbTimeHM(e.clockIn)} – ${e.clockOut ? dbTimeHM(e.clockOut) : '…'}`;
                const upraveno = e.updatedBy != null && e.updatedBy !== '';
                const kdoUpravil = krestni(e.updatedByName);
                // Meta se na úzkém displeji zkracuje — nejdřív čas a plán, pak zdroj a kdo upravil.
                // Důvod (poznámka) jde do `detail`, který se zalamuje: věta na 300 znaků by v meta zmizela.
                const meta = [
                  cas,
                  e.planStart ? t('plán {od}–{do}', { od: fmtHM(e.planStart), do: fmtHM(e.planEnd) }) : null,
                  zdrojText(e.source),
                  upraveno ? (kdoUpravil ? t('upraveno ({kdo})', { kdo: kdoUpravil }) : t('upraveno')) : null,
                ].filter(Boolean).join(' · ');
                const o = plany.get(String(e.id));
                const pozde = o?.pozdeMin != null ? t('+{n} min pozdě', { n: o.pozdeMin }) : null;
                const driv = o?.drivMin != null ? t('odešel o {n} min dřív', { n: o.drivMin }) : null;
                // Pravý slot: zapomenutý odchod má přednost, pak odchylka od plánu (při obojím chip
                // pozdě a v title obojí), pak poznámka ze samoobsluhy k ověření. „Upraveno" vedle.
                const stav = zapomenuty ? <Chip tone="wait" size="sm" icon="warning">{t('Zapomenutý odchod?')}</Chip>
                  : pozde ? <span title={driv ? `${pozde} · ${driv}` : undefined} className="inline-flex"><Chip tone="wait" size="sm">{pozde}</Chip>{driv && <span className="sr-only">{` · ${driv}`}</span>}</span>
                  : driv ? <Chip tone="wait" size="sm">{driv}</Chip>
                  : e.note && !upraveno ? <Chip tone="wait" size="sm">{t('Zkontrolovat')}</Chip>
                  : z.druh === 'dlouhy' ? <Chip tone="wait" size="sm">{t('Nad 24 h')}</Chip> : null;
                const chipy = stav || upraveno ? (
                  <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                    {stav}
                    {upraveno && <span title={e.updatedByName ? t('Upravil(a) {kdo}', { kdo: e.updatedByName }) : undefined} className="inline-flex"><Chip tone="muted" size="sm">{t('Upraveno', undefined, 'zaznam')}</Chip></span>}
                  </span>
                ) : null;
                // Tužka a koš mají na telefonu 44 px (palec), na počítači zůstávají drobné v hustém seznamu.
                const akce = (
                  <>
                    {smiUpravit && (zapomenuty
                      ? <Button variant="secondary" size="sm" className="max-sm:!h-11" onClick={() => otevriUpravu(e, true)} aria-label={t('Ukončit příchod: {jmeno}', { jmeno: e.employeeName ?? '' })}>{t('Ukončit')}</Button>
                      : <Button variant="ghost" size="sm" iconOnly icon="pencil" className="max-sm:!h-11 max-sm:!w-11" onClick={() => otevriUpravu(e)} aria-label={t('Upravit čas: {jmeno}', { jmeno: e.employeeName ?? '' })} />)}
                    {smiMazat && (
                      <Button variant="ghost" size="sm" iconOnly icon="trash" className="max-sm:!h-11 max-sm:!w-11" onClick={() => { setChybaSmazani(null); setSmazat(e); }} aria-label={t('Smazat záznam: {jmeno}', { jmeno: e.employeeName ?? '' })} />
                    )}
                  </>
                );
                return (
                  <ListRow key={e.id}
                    lead={<Avatar emoji={e.employeeAvatar} size="sm" />}
                    // Odkaz na profil nese jméno, ne avatar (ten je aria-hidden):
                    // odečítač tak přečte „Profil: Petra", ne jen „Zobrazit profil".
                    // Celý řádek klikací být nemůže — uvnitř jsou Upravit a Smazat.
                    title={smiProfil && otevriProfil ? (
                      <button type="button" onClick={() => otevriProfil(Number(e.employeeId))} aria-label={`Profil: ${e.employeeName ?? t('Neznámý')}`}
                        className="max-w-full truncate text-left rounded-sm hover:underline decoration-black/25 underline-offset-2">
                        {e.employeeName ?? t('Neznámý')}
                      </button>
                    ) : (e.employeeName ?? t('Neznámý'))}
                    meta={meta}
                    detail={e.note || undefined}
                    value={zapomenuty ? undefined : bezi ? t('běží {cas}', { cas: hodinyMinuty(z.delka) }) : hodinyMinuty(z.delka)}
                    // Chipy na počítači (lg+) ve sloupci pevné šířky `aside` — u každého řádku, i prázdný —
                    // ať hodiny stojí v jedné svislici, i když má jen každý třetí řádek „+12 min pozdě".
                    // Pod lg je doplněk skrytý a chipy jdou do `right`, který ocas zalomí pod jméno. `right`
                    // dostane každý řádek (na lg+ prázdný), jinak by mezera navíc posunula čísla o 12 px.
                    aside={chipy ?? ''}
                    right={<span className="lg:hidden">{chipy}</span>}
                    actions={smiUpravit || smiMazat ? akce : undefined}
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );

  return (
    <ObdobiStrankyDochazky.Provider value={dni}>
      <PlochaWidgetu
        stranka="vedeni.dochazka"
        hlavicka={{
          title: t('Docházka'),
          subtitle: t('Kdo je na směně, odpracované hodiny a mzdy za období.'),
          hintId: 'attendance',
          primary: smiUpravit ? (
            <Button variant="accent" icon="plus" onClick={() => { setChybaPridani(null); setPridat(true); }}>{t('Přidat záznam')}</Button>
          ) : undefined,
          secondary: smiExport && entries.length > 0 ? <Button variant="secondary" icon="download" onClick={exportCsv}>{t('Export CSV')}</Button> : undefined,
          // Vedlejší akce se na telefonu schovají (DP §3.4) — Export proto i v „···".
          menu: smiExport && entries.length > 0 ? [{ label: t('Export CSV'), icon: 'download', onClick: exportCsv }] : undefined,
          aside: (
            <ObdobiLista value={obdobi} onChange={nastavObdobi} dnyTydne={false} hrubost={false}
              volby={['dnes', 'vcera', 'tyden', '7_dni', '30_dni', 'mesic', 'minuly_mesic', '90_dni', '180_dni']} />
          ),
        }}
        nastroj={nastroj}
      />

      {pridat && (
        <Modal open onClose={() => setPridat(false)} size="sm" title={t('Přidat záznam docházky')} subtitle={t('Když se někdo zapomněl odpíchnout úplně.')}
          footer={<>
            <Button variant="secondary" onClick={() => setPridat(false)}>{t('Zrušit')}</Button>
            <Button variant="primary" icon="plus" loading={pridavam} onClick={ulozNovy}>{t('Přidat záznam')}</Button>
          </>}>
          <div className="space-y-3">
            <Field id="dochazka-novy-kdo" label={t('Kdo')}>
              <Select id="dochazka-novy-kdo" value={novy.kdo} onChange={e => setNovy(n => ({ ...n, kdo: e.target.value }))}>
                <option value="">{t('Vyber člověka')}</option>
                {roster.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
              </Select>
            </Field>
            <Field id="dochazka-novy-od" label={t('Příchod')}>
              <Input id="dochazka-novy-od" type="datetime-local" value={novy.od} onChange={e => setNovy(n => ({ ...n, od: e.target.value }))} />
            </Field>
            <Field id="dochazka-novy-do" label={t('Odchod')}>
              <Input id="dochazka-novy-do" type="datetime-local" value={novy.do} onChange={e => setNovy(n => ({ ...n, do: e.target.value }))} />
            </Field>
            <Field id="dochazka-novy-duvod" label={t('Důvod (nepovinné)')} hint={t('Uvidí ho účetní v exportu.')}>
              <Textarea id="dochazka-novy-duvod" rows={2} maxLength={MAX_DUVOD} value={novy.duvod} placeholder={t('Např. zapomněl se odpíchnout')}
                onChange={e => setNovy(n => ({ ...n, duvod: e.target.value }))} />
            </Field>
            {chybaPridani && <p className="note note-danger text-sm" role="alert">{chybaPridani}</p>}
          </div>
        </Modal>
      )}

      {uprava && (
        <Modal open onClose={() => setUprava(null)} size="sm" title={t('Upravit čas na směně')} subtitle={uprava.e.employeeName ?? undefined}
          footer={<>
            <Button variant="secondary" onClick={() => setUprava(null)}>{t('Zrušit')}</Button>
            <Button variant="primary" icon="check" loading={ukladam} onClick={ulozUpravu}>{t('Uložit')}</Button>
          </>}>
          <div className="space-y-3">
            <Field id="dochazka-uprava-od" label={t('Příchod')}>
              <Input id="dochazka-uprava-od" type="datetime-local" value={uprava.od} onChange={e => setUprava(u => (u ? { ...u, od: e.target.value } : u))} />
            </Field>
            <Field id="dochazka-uprava-do" label={t('Odchod')} hint={uprava.zPlanu ? t('Předvyplněný je plánovaný konec směny. Uprav ho, jestli odešel jindy.') : t('Prázdné pole = pořád na směně.')}>
              <Input id="dochazka-uprava-do" type="datetime-local" value={uprava.do} onChange={e => setUprava(u => (u ? { ...u, do: e.target.value } : u))} />
            </Field>
            <Field id="dochazka-uprava-duvod" label={t('Důvod (nepovinné)')} hint={t('Uvidí ho i člověk v oznámení o změně a účetní v exportu.')}>
              <Textarea id="dochazka-uprava-duvod" rows={2} maxLength={MAX_DUVOD} value={uprava.duvod} placeholder={t('Např. zapomněl se odpíchnout')}
                onChange={e => setUprava(u => (u ? { ...u, duvod: e.target.value } : u))} />
            </Field>
            {chybaUpravy && <p className="note note-danger text-sm" role="alert">{chybaUpravy}</p>}
          </div>
        </Modal>
      )}

      {smazat && (
        <Modal open onClose={() => setSmazat(null)} size="sm" title={t('Smazat záznam?')}
          subtitle={`${smazat.employeeName ?? t('Neznámý')} · ${dbTimeHM(smazat.clockIn)} – ${smazat.clockOut ? dbTimeHM(smazat.clockOut) : '…'}`}
          footer={<>
            <Button variant="secondary" onClick={() => setSmazat(null)}>{t('Zrušit')}</Button>
            <Button variant="danger-solid" loading={mazu} onClick={potvrdSmazani}>{t('Smazat')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{t('Odpracované hodiny ze záznamu zmizí i ze mzdy. Vrátit to nejde.')}</p>
          {chybaSmazani && <p className="note note-danger mt-3" role="alert">{chybaSmazani}</p>}
        </Modal>
      )}

      {upgradeFor && <UpgradeModal feature={upgradeFor} onClose={() => setUpgradeFor(null)} />}
    </ObdobiStrankyDochazky.Provider>
  );
}
