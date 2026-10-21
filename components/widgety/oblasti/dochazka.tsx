'use client';

// Widgety oblasti „Docházka" — komponenty (kolo 68, spec §2.5, §6.1).
//
// Vlastník v kole 69: balík B2 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/dochazka.ts;
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — hlídá to test AK-20 v scripts/testy/k68-widgety.ts.
//
// Kontrakt (spec §2.6): komponenta dostane WidgetProps (instance, velikost, nastaveni,
// nahled), kreslí se vždy v obalu <Widget> z ../Widget, data bere jen přes useDataWidgetu
// (URL null, dokud neplatí brána z registru a useSmi pro pole), navigaci přes useNavigace.
// Soubor se stahuje líně, až když je widget oblasti na ploše (registr.ts).
//
// Co tu je (kolo 68):
//  - dochazka.moje_pichacky — nástupce ClockWidget: příchod i odchod jako `primary`
//    (ne limetka, ne červená výplň), stav chipem, zapomenutý odchod `.note note-wait`,
//    žádná tónovaná karta ani kolečko s limetkou;
//  - dochazka.prave_na_smene — nástupce bloku „Právě na směně" z Přehledu: bez
//    animate-ping a limetkové karty, lidé jako PersonChip s časem příchodu, odkaz
//    „Docházka"; ve velké velikosti stopky a „Ukončit" (jen s dochazka.upravit) se stejným
//    oknem jako Otevřené příchody — navrhne plánovaný konec, ne „teď";
//  - dochazka.moje_odpracovano — jedno číslo „Odpracováno" místo dvou různých, která
//    Domů zaměstnance ukazovalo naráz (audit: 433 h proti 225 h). Zapomenutý příchod
//    se nepřičítá, ale přizná chipem.
//
// Kolo 69 (balík B2) přidalo zbytek oblasti — výpočty jsou v lib/dochazkaPrehled,
// aby Docházka, Domů i profil člena počítaly hodiny stejně (zapomenutý odchod
// ani záznam nad 24 h se nepočítá):
//  - dochazka.mzdy_za_obdobi — mzdové náklady a podíl na tržbách proti cíli
//    (StatRow místo dvou dlaždic s ručními štítky); podíl jen s finance.trzby
//    a uzaverky.zobrazit_vse (bez něj by tržby byly jen z vlastních uzávěrek);
//  - dochazka.souhrn_hodin — hodiny po lidech v jedné kartě s .list (dřív mřížka
//    karet); Kč a řazení podle mzdy jen s finance.mzdy;
//  - dochazka.dlouhe_prichody — kdo je napíchnutý déle než plán, s „Ukončit"
//    (jen dochazka.upravit), které nabídne čas odchodu, ne „teď";
//  - dochazka.dnes_v_podniku — plán proti skutečnosti, „Bez příchodu" oranžově;
//  - moje.vydelek — hodiny × vlastní sazba (sazbu API pošle jen s oprávněním).
// Widgety s obdobím „Podle stránky" čtou přepínač Docházky přes ObdobiStrankyDochazky.
//
// Kolo 7 (R7-2): Píchačky ukážou dnešní směnu z rozvrhu a zpoždění, Souhrn hodin plán
// a počet pozdních příchodů, „Ukončit" má nepovinný důvod a nový widget
// dochazka.moje_zaznamy („Moje docházka") ukáže zaměstnanci jeho dny před výplatou —
// ze stejné adresy jako Odpracováno a Můj výdělek.
//
// Kolo 8 (R8-1, Výplaty): „Moje výplata dnes" z uzávěrky se nikde neodečítala a majitel na konci měsíce
// vyplatil dvakrát. Nový widget dochazka.vyplatni_listina (tabulka po lidech na počítači, karty na telefonu,
// CSV pro účetní, Vyplaceno, Uzavřít období, Pravidla výplat: dýško, příplatky, smlouvy), Souhrn hodin
// a Můj výdělek čtou GET /api/payroll (z kasy, vyplaceno, zámky, pravidla); Píchačky umí Pauzu
// (POST /api/attendance/pauza) a při odchodu po 6 h bez pauzy se zeptají.
//
// Všechny berou /api/attendance a tam, kde stačí jeden den, stejnou adresu —
// sdílená mezipaměť useDataWidgetu pak pošle jediný dotaz za celou plochu a odpíchnutí
// v Píchačkách se hned ukáže i v „Právě na směně". Nástroj Docházky čte tutéž
// mezipaměť (stejná adresa jako widgety „Podle stránky"), takže se po úpravě
// záznamu obnoví obojí najednou (obnovDochazku).

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { Avatar, BulkBar, Button, CasovyGraf, Chip, Field, Input, ListRow, Menu, Modal, ObdobiLista, PersonChip, Segmented, Select, SelectBox, Sloupec, Stat, StatRow, SwitchRow, Textarea, Well, runBulk, useSelection, type MenuItem } from '../../ui';
import { usePlan, UpgradeModal } from '../../Pro';
import { ulozSoubor } from '@/lib/stahni';
import type { Jazyk } from '@/lib/i18n/config';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { Widget, useVyrizeno, useWidget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { premieZaNavic } from '../../navic/logika';
import { textNavrhu } from '@/lib/tresty';
import { infoPolohyPotvrzeno, potvrdInfoPolohy, zjistiPolohu, type Poloha } from '@/lib/geoPichani';
import { useNavrhyTrestu } from '../../tresty-vedeni/data';
import { DatTrest } from '../../tresty-vedeni/DatTrest';
import { pozdniKTrestu, type PozdniPrichod, type PredvolbyTrestu } from '../../tresty-vedeni/logika';
import { useOpravneni } from '../../role/useOpravneni';
import { useCurrency, useMoney, useSymbol } from '../../CurrencyProvider';
import { usePersonProfile } from '../../employer/ProfileLinkProvider';
import { apiMessage, okJson } from '@/lib/api';
import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum, fmtHM, fmtMesic } from '@/lib/i18n/format';
import { dbTimeDayHM, dbTimeHM, dayPlus, parseDbTime, pragueDayOf, pragueToday } from '@/lib/pragueTime';
import { agreguj, hrubostProRozmezi, obdobiZPresetu, platneRozmezi, pocetDni, predchoziRozmezi, zmenaPct, type Slot } from '@/lib/obdobi';
import { useObdobi } from '@/lib/useObdobi';
import { useUlozeno } from '@/lib/useUlozeno';
import {
  ZAPOMENUTY_MS, dnesVPodniku, konecSmeny, navrhOdchodu as navrhOdchoduPlan, hodinyMinuty, mujMesic, mzdyZaObdobi, obdobiDni, obdobiMesice, mojeUpravyMesice, otevrenePrichody, podilMezd,
  sazbyZRosteru, seradSouhrn, souhrnHodin, spropitneZaObdobi, trzbyZaObdobi, hodinyPoDnech, zaznamyVRozmezi, upravyVRozmezi, upravyPoLidech, zpozdeniPichacek,
  radkyMojeDochazky, orizniSeznam, odchylkyZaznamu,
  vyplatniListina, seradListinu, soucetListiny, csvVyplatniListiny, csvText, hMM, obdobiZamceno, mesiceVyplat, stavPauzy, priplatkyZaznamu, priplatkyVypnute,
  normalizujPravidlaDyska, normalizujPravidlaPriplatku, stavLimituHodin, nadHraniciOdvodu, nazevSmlouvy, TYPY_SMLUV, LIMIT_DPP_HODIN, PAUZA_MIN,
  type OtevrenyPrichod, type RadekDne, type RazeniSouhrnu, type UpravaMzdy, type UzaverkaSpropitne, type UzaverkaTrzby, type VolbaMesice,
  type PravidlaDyska, type PravidlaPriplatku, type RadekVyplaty, type RazeniListiny, type PayrollClovek, type Vyplata, type ZamekObdobi, type TypSmlouvy, type MetodaDyska, type ZaznamDochazky as ZaznamDochazkyLib,
} from '@/lib/dochazkaPrehled';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface ClenRosteru {
  id: number;
  name?: string;
  avatar?: string | null;
  /** Otevřený příchod (čas z databáze bez zóny — vždy přes parseDbTime). */
  openSince?: string | null;
  openEntryId?: number | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  /** Den směny (jen vlastní řádek zaměstnance, kolo 7): včerejšek u noční, která ještě běží. Vedení má dnešek. */
  shiftDate?: string | null;
}

interface ZaznamDochazky {
  id?: number;
  employeeId?: number;
  clockIn: string;
  clockOut: string | null;
  /** Moje docházka (kolo 7): „ručně" u source 'manual' nebo u záznamu, který vedení upravilo; note jako detail. */
  source?: string;
  note?: string | null;
  updatedBy?: number | null;
  breakAfter?: number | null;
}

interface Dochazka {
  roster: ClenRosteru[]; entries: ZaznamDochazky[]; /** Prémie a srážky (jen s finance.mzdy, jinak prázdné). */ adjustments: UpravaMzdy[];
  /** Podnik ověřuje polohu příchodu z telefonu (spuštění, balík P) — Píchačky ji při příchodu přibalí. */
  poloha?: boolean;
}

/**
 * Jeden den docházky. S dochazka.zobrazit / dochazka.tablet vrací API celý
 * dnešní roster, ostatním jen vlastní záznamy a `roster: [{ id: já, openSince }]`
 * — Píchačkám stačí obojí, a tak mají s „Právě na směně" jednu adresu.
 */
const URL_DNES = '/api/attendance?days=1';

/** Odpověď bez rosteru je nečekaný tvar (chyba widgetu), ne „nikdo není na směně". */
function vyberDochazku(raw: any, t: PrekladFn): Dochazka {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.roster)) throw new Error(t('Docházka přišla v nečekaném tvaru.'));
  return { roster: raw.roster, entries: Array.isArray(raw.entries) ? raw.entries : [], adjustments: Array.isArray(raw.adjustments) ? raw.adjustments : [], poloha: raw.pichaniPoloha === true };
}

// Hranice zapomenutého odchodu (16 h) je v lib/dochazkaPrehled — jedna pro widgety i nástroj.

// ---------------------------------------------------------------------------
// Pomocníci (záměrně v souboru: oblast je samostatný líný kus a v kole 69 má
// jediného vlastníka — sdílený modul by svázal balíky, které se nemají potkat)
// ---------------------------------------------------------------------------

/**
 * Hlavní brána widgetu (spec §1.5): s načtenými oprávněními přísně podle klíčů
 * z registru. Když /api/teams/mine selhal, rozhodl za nás server — plocha
 * widget připojila jen proto, že ho vrátil v `dostupne`.
 */
function useBrana(klice: readonly string[]): boolean {
  const { nacteno, chyba, ma } = useOpravneni();
  return nacteno ? ma(klice) : chyba;
}

const RELACE_NACITA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

/**
 * Id přihlášeného. Kontrakt widgetu (instance, velikost, nastavení) uživatele
 * nenese a vlastní data se v odpovědi vedení (celý roster, záznamy týmu)
 * hledají právě podle id. `stav` drží widget na kostře, dokud se relace načítá.
 */
function useJa(): { id: number | null; stav: StavNacteni | null } {
  const t = useT('widgety');
  const { data, status, update } = useSession();
  if (status === 'loading') return { id: null, stav: RELACE_NACITA };
  const id = Number((data?.user as { id?: unknown } | undefined)?.id);
  if (Number.isFinite(id) && id > 0) return { id, stav: null };
  return { id: null, stav: { data: null, error: t('Nevím, kdo je přihlášený — obnov stránku.'), loading: false, reload: () => { void update(); } } };
}

/** „Teď", které se obnovuje, jen dokud něco běží — stopky nemají tikat na ploše, kde nic neběží. */
function useTed(bezi: boolean, ms: number): number {
  const [ted, setTed] = useState(() => Date.now());
  useEffect(() => {
    if (!bezi) return;
    setTed(Date.now());
    const t = setInterval(() => setTed(Date.now()), ms);
    return () => clearInterval(t);
  }, [bezi, ms]);
  return ted;
}

/** Běžící čas jako stopky: „2:14:05" (nebo „2:14" tam, kde se sekundy nevejdou). */
function stopky(ms: number, sekundy: boolean): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  return sekundy ? `${h}:${m}:${String(s % 60).padStart(2, '0')}` : `${h}:${m}`;
}

/** „3 h 12 min", „45 min", „2 dny a 3 h" — délka slovy pro řádek a upozornění. */
function delkaSlovy(t: PrekladFn, ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(min / 60);
  if (h >= 24) {
    const dnu = Math.floor(h / 24);
    return t('{dnu, plural, one {# den} few {# dny} other {# dní}} a {h} h', { dnu, h: h - dnu * 24 });
  }
  return h > 0 ? t('{h} h {min} min', { h, min: String(min % 60).padStart(2, '0') }) : t('{min} min', { min });
}

/** Od kdy: dnešek jen časem, starší příchod i s datem (zapomenutý odchod z minula). */
function odKdy(v: string | null | undefined): string {
  const d = parseDbTime(v);
  if (!d) return '—';
  return pragueDayOf(d) === pragueToday() ? dbTimeHM(d) : dbTimeDayHM(d);
}

const hm = (t: string | null | undefined) => String(t ?? '').slice(0, 5);
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

// ---------------------------------------------------------------------------
// Píchačky
// ---------------------------------------------------------------------------

function Pichacky({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const ja = useJa();
  const smi = useSmi();
  const data = useDataWidgetu<Dochazka>(ja.id != null ? URL_DNES : null, raw => vyberDochazku(raw, t));
  const [pise, setPise] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pripomenUzaverku, setPripomenUzaverku] = useState(false);

  const muj = ja.id != null ? data.data?.roster.find(r => Number(r.id) === ja.id) : undefined;
  const openSince = muj?.openSince ?? null;
  const zacatek = parseDbTime(openSince);
  const naSmene = !!zacatek;
  const S = velikost === 'S';
  // Dnešní směna z rozvrhu (kolo 7): API ji pošle na vlastním řádku rosteru — zaměstnanci
  // i s dnem (noční ze včerejška), vedení dnešní. „Začíná za…" se musí posouvat i bez
  // příchodu, proto stopky tikají po minutě i tehdy, když je v rozvrhu směna.
  const planOd = muj?.shiftStart ? hm(muj.shiftStart) : null;
  const planDo = muj?.shiftEnd ? hm(muj.shiftEnd) : null;
  // Sekundy ukazuje jen střední velikost; malá má hodiny a minuty, stačí jí obnova po čtvrt minutě.
  // Stopky tikají i na pauze (stav pauzy se čte až níž — tady stačí „je dnes otevřená pauza v datech").
  const pauzaVDatech = !!data.data?.entries.some(e => e.source === 'break' && !!e.clockOut && e.clockOut === e.clockIn && Number(e.employeeId) === ja.id);
  const ted = useTed(naSmene || pauzaVDatech || (!S && !!planOd), S ? 15_000 : naSmene || pauzaVDatech ? 1000 : 60_000);
  const bezi = zacatek ? Math.max(0, ted - zacatek.getTime()) : 0;
  const zapomenuty = naSmene && bezi > ZAPOMENUTY_MS;
  const vuciPlanu = planOd ? zpozdeniPichacek(muj?.shiftDate || pragueToday(), planOd, openSince, ted) : null;
  // Pauza (kolo 8): běžící pauza = dnešní záznam 'break' s odchodem rovným příchodu; po 6 h bez pauzy se odchod zeptá.
  const pauza = useMemo(() => (ja.id != null && data.data ? stavPauzy(data.data.entries as ZaznamDochazkyLib[], ja.id, pragueToday(), ted) : null), [data.data, ja.id, ted]);
  const naPauze = !!pauza?.naPauze && !naSmene;
  const [ptamSe, setPtamSe] = useState(false);
  // Odchod se potvrzuje (audit 2026-10 B7, vzor Homebase „Clock out?"): jedno klepnutí
  // omylem dřív ukončilo směnu bez možnosti vrátit. Příchod jde dál na jedno klepnutí.
  const [potvrditOdchod, setPotvrditOdchod] = useState<'smena' | 'pauza' | null>(null);
  // Poloha při příchodu (spuštění, balík P): jen když ji podnik ověřuje; před prvním použitím informace.
  const [infoPolohy, setInfoPolohy] = useState(false);
  const [zjistujiPolohu, setZjistujiPolohu] = useState(false);

  const poOdchodu = (d: any) => {
    const zaklad = data.data;
    if (zaklad && ja.id != null) data.set({ ...zaklad, roster: zaklad.roster.map(r => (Number(r.id) === ja.id ? { ...r, openSince: null } : r)) });
    if (d?.closingDone === false && smi('uzaverky.vytvorit')) setPripomenUzaverku(true);
  };
  const pauzuj = async (action: 'start' | 'end' | 'odchod' | 'doplnit' | 'bez_pauzy') => {
    if (nahled || ja.id == null || pise) return;
    setPise(true); setChyba(null); setPripomenUzaverku(false); setPtamSe(false);
    try {
      const d = await fetch('/api/attendance/pauza', { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify({ action, minuty: PAUZA_MIN }) }).then(okJson);
      if (action === 'odchod' || action === 'doplnit' || action === 'bez_pauzy') poOdchodu(d);
      if (action === 'start') { const zaklad = data.data; if (zaklad) data.set({ ...zaklad, roster: zaklad.roster.map(r => (Number(r.id) === ja.id ? { ...r, openSince: null } : r)) }); }
      data.reload(); obnovDochazku();
    } catch (e) {
      setChyba(apiMessage(e, t('Pauzu se nepodařilo zapsat. Zkus to znovu.')));
    } finally {
      setPise(false);
    }
  };

  const pichni = async (poInfu = false, potvrzeno = false) => {
    if (nahled || ja.id == null || pise) return;
    const akce = naSmene ? 'out' : 'in';
    // Odchod po víc než 6 h bez pauzy: nejdřív otázka, pak teprve zápis (zákoník: 30 min nejdéle po 6 h).
    // Otázka sama je potvrzení — druhé okno by bylo navíc.
    if (akce === 'out' && pauza?.zeptatSe) { setPtamSe(true); return; }
    if (akce === 'out' && !potvrzeno) { setPotvrditOdchod('smena'); return; }
    setPotvrditOdchod(null);
    // Příchod u podniku, který ověřuje vzdálenost: poprvé na zařízení nejdřív věta, co se ukládá.
    const sPolohou = akce === 'in' && data.data?.poloha === true;
    if (sPolohou && !poInfu && !infoPolohyPotvrzeno(typeof window !== 'undefined' ? window.localStorage : null)) { setInfoPolohy(true); return; }
    setInfoPolohy(false);
    setPise(true); setChyba(null); setPripomenUzaverku(false);
    try {
      // Bez polohy (odmítnutá, vypnutá GPS, 8 s nic) píchnutí projde — server zapíše stav „bez polohy".
      let poloha: Poloha | null = null;
      if (sPolohou) {
        setZjistujiPolohu(true);
        poloha = await zjistiPolohu(typeof navigator !== 'undefined' ? navigator.geolocation : null);
        setZjistujiPolohu(false);
      }
      const d = await fetch('/api/attendance', {
        method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify({ employeeId: ja.id, action: akce, ...(poloha ? { poloha } : {}) }),
      }).then(okJson);
      // Stav hned podle odpovědi, ať tlačítko neukazuje půl vteřiny starý stav;
      // obnova pak srovná i „Právě na směně", které čte stejnou adresu.
      const zaklad = data.data;
      if (zaklad) {
        const noveOd = akce === 'in' ? (d?.entry?.clockIn ?? new Date().toISOString()) : null;
        data.set({ ...zaklad, roster: zaklad.roster.map(r => (Number(r.id) === ja.id ? { ...r, openSince: noveOd } : r)) });
      }
      if (akce === 'out' && d?.closingDone === false && smi('uzaverky.vytvorit')) setPripomenUzaverku(true);
      data.reload();
    } catch (e) {
      setChyba(apiMessage(e, t('Píchnutí se nepovedlo. Zkus to znovu.')));
    } finally {
      setPise(false);
      setZjistujiPolohu(false);
    }
  };
  const souhlasPolohy = () => {
    potvrdInfoPolohy(typeof window !== 'undefined' ? window.localStorage : null);
    void pichni(true);
  };

  // Na směně dvě tlačítka vedle sebe (Odchod primary, Pauza secondary); na pauze „Konec pauzy" a tiché „Odchod".
  // v4 (V16, P12, P17): akce jsou PATKA widgetu — L→R × 44 na konci karty (pár ½ + ½), v každé velikosti.
  // Dřív „Odpíchnout příchod" na monitoru obsahová pilulka 172 px vlevo (block je přes šířku jen na telefonu).
  const tlacitko = naPauze ? (
    <>
      <Button variant="primary" icon="play" loading={pise} onClick={() => { void pauzuj('end'); }}>{t('Konec pauzy')}</Button>
      <Button variant="secondary" icon="logout" disabled={pise} onClick={() => { if (!nahled) setPotvrditOdchod('pauza'); }} aria-label={t('Odpíchnout odchod')}>{t('Odchod')}</Button>
    </>
  ) : naSmene ? (
    <>
      <Button variant="primary" icon="logout" loading={pise} onClick={() => { void pichni(); }} aria-label={t('Odpíchnout odchod')}>{t('Odchod')}</Button>
      <Button variant="secondary" icon="cup" disabled={pise} onClick={() => { void pauzuj('start'); }} aria-label={t('Začít pauzu')}>{t('Pauza')}</Button>
    </>
  ) : (
    <Button variant="primary" icon="clock" loading={pise} onClick={() => { void pichni(); }} aria-label={t('Odpíchnout příchod')}>
      {S ? t('Příchod') : t('Odpíchnout příchod')}
    </Button>
  );
  // Informace před prvním příchodem s ověřením polohy (pamatuje se v zařízení).
  const oknoPolohy = infoPolohy ? (
    <Modal open onClose={() => setInfoPolohy(false)} size="sm" title={t('Ověření vzdálenosti')}
      footer={<>
        <Button variant="secondary" onClick={() => setInfoPolohy(false)}>{t('Zrušit')}</Button>
        <Button variant="primary" icon="clock" loading={pise} onClick={souhlasPolohy}>{t('Rozumím, píchnout')}</Button>
      </>}>
      <div className="space-y-2" data-info-polohy>
        <p className="text-sm text-black/70 text-pretty">{t('Podnik při píchnutí ověřuje vzdálenost od provozovny. Ukládá se jen vzdálenost, ne poloha.')}</p>
        <p className="t-meta text-pretty">{t('Telefon se může zeptat na povolení polohy. Když ho nedáš, příchod se zapíše i tak, jen bez ověření.')}</p>
      </div>
    </Modal>
  ) : null;
  // „Měl/a jsi pauzu?" — po víc než 6 h bez zapsané pauzy; „Ano" rozdělí směnu s 30 min mezerou, „Ne" dá vědět vedoucímu.
  const otazkaPauzy = ptamSe ? (
    <Modal open onClose={() => setPtamSe(false)} size="sm" title={t('Měl/a jsi pauzu?')}
      subtitle={t('Jsi na směně {delka} a pauza není zapsaná. Zákoník chce 30 minut nejdéle po 6 hodinách.', { delka: delkaSlovy(t, bezi) })}
      footer={<>
        <Button variant="ghost" onClick={() => setPtamSe(false)}>{t('Zpět')}</Button>
        <Button variant="secondary" onClick={() => { void pauzuj('bez_pauzy'); }}>{t('Ne, nestihl/a jsem')}</Button>
        <Button variant="primary" icon="check" loading={pise} onClick={() => { void pauzuj('doplnit'); }}>{t('Ano, 30 min (doplnit)')}</Button>
      </>}>
      <p className="text-sm text-black/70 text-pretty">{t('„Ano" zapíše 30 minut pauzy doprostřed směny a odpíchne odchod. „Ne" odpíchne odchod a vedoucí dostane poznámku.')}</p>
    </Modal>
  ) : null;
  // Potvrzení odchodu: kdy a kolik — člověk vidí, co odpíchne, a „Zpět" nic nezapíše.
  const casTed = dbTimeHM(new Date(ted));
  const oknoOdchodu = potvrditOdchod ? (
    <Modal open onClose={() => setPotvrditOdchod(null)} size="sm" title={t('Odpíchnout odchod?')}
      subtitle={potvrditOdchod === 'pauza'
        ? t('Pauza skončí a odchod se zapíše na {cas}. Dnes odpracováno {delka}.', { cas: casTed, delka: delkaSlovy(t, pauza?.dnesMs ?? 0) })
        : t('Odchod se zapíše na {cas}. Na směně od {od}, to je {delka}.', { cas: casTed, od: odKdy(openSince), delka: delkaSlovy(t, bezi) })}
      footer={<>
        <Button variant="secondary" onClick={() => setPotvrditOdchod(null)}>{t('Zpět')}</Button>
        <Button variant="primary" icon="logout" loading={pise}
          onClick={() => { if (potvrditOdchod === 'pauza') { setPotvrditOdchod(null); void pauzuj('odchod'); } else void pichni(false, true); }}>{t('Potvrdit odchod')}</Button>
      </>}>
      <p className="t-meta text-pretty">{t('Když jsi klepl/a omylem, dej Zpět — nic se nezapíše.')}</p>
    </Modal>
  ) : null;
  const hlaseni = (
    <>
      {chyba && <p className="note note-danger !px-3 !py-2 text-[13px]" role="alert">{chyba}</p>}
      {zjistujiPolohu && <p className="t-meta" role="status">{t('Ověřuji vzdálenost od podniku…')}</p>}
      {pripomenUzaverku && <p className="t-meta" role="status">{t('Směna skončila. Nezapomeň vyplnit uzávěrku.')}</p>}
    </>
  );
  // Řádek rozvrhu pod číslem (jen M): kdy směna podle rozvrhu je, a buď „začíná za…"
  // (před příchodem, nejvýš 3 h předem), nebo zpoždění po příchodu nad 10 min. Zalamuje
  // se jako celek (flex-wrap), ne oddělovačem uprostřed — na 390 px chip sjede pod text.
  const rozvrh = data.data ? (
    <p className="t-meta flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{planOd ? t('Dnes podle rozvrhu {od}–{do}', { od: fmtHM(planOd), do: fmtHM(planDo) }) : t('Dnes nemáš směnu v rozvrhu')}</span>
      {vuciPlanu?.druh === 'pozde' && <Chip tone="wait" size="sm">{t('+{n} min po začátku', { n: vuciPlanu.min })}</Chip>}
      {vuciPlanu?.druh === 'zacina' && <Chip tone="muted" size="sm">{t('Směna začíná za {delka}', { delka: delkaSlovy(t, vuciPlanu.min * 60_000) })}</Chip>}
    </p>
  ) : null;

  return (
    <Widget
      nacteni={ja.stav ?? data}
      // V malém se chip vedle titulku nevejde (titulek by se zkrátil) — stav tam nese tělo.
      doplnek={S ? undefined : zapomenuty ? <Chip tone="wait" size="sm">{t('Zapomenutý odchod')}</Chip>
        : naPauze ? <Chip tone="info" size="sm">{t('Na pauze')}</Chip>
        : naSmene ? <Chip tone="ok" size="sm">{t('Na směně')}</Chip> : undefined}
      patka={tlacitko}
    >
      {S ? (
        <Sloupec mezera={2}>
          {zapomenuty ? (
            <p className="note note-wait !px-3 !py-2 text-[13px]">{t('Běží od {cas}', { cas: odKdy(openSince) })}</p>
          ) : naPauze ? (
            <Stat label={t('Pauza od {cas}', { cas: dbTimeHM(pauza?.pauzaOd) })} value={stopky(pauza?.pauzaOd ? ted - pauza.pauzaOd.getTime() : 0, false)} />
          ) : naSmene ? (
            <Stat label={t('Příchod {cas}', { cas: dbTimeHM(openSince) })} value={stopky(bezi, false)} />
          ) : (
            <p className="t-meta">{t('Teď nejsi na směně.')}</p>
          )}
          {hlaseni}
        </Sloupec>
      ) : (
        <Sloupec mezera={3}>
          {zapomenuty ? (
            <p className="note note-wait">
              {t('Příchod běží od {cas} — to je {delka}. Odpíchni odchod, ať docházka sedí.', { cas: odKdy(openSince), delka: delkaSlovy(t, bezi) })}
            </p>
          ) : naPauze ? (
            <Stat label={t('Pauza od {cas}', { cas: dbTimeHM(pauza?.pauzaOd) })} value={stopky(pauza?.pauzaOd ? ted - pauza.pauzaOd.getTime() : 0, true)} note={t('dnes odpracováno {delka}', { delka: delkaSlovy(t, pauza?.dnesMs ?? 0) })} />
          ) : naSmene ? (
            // „Na směně" už říká chip u titulku — štítek čísla nese čas příchodu.
            <Stat label={t('Příchod {cas}', { cas: dbTimeHM(openSince) })} value={stopky(bezi, true)} />
          ) : planOd ? null : (
            <p className="t-meta text-pretty">{t('Odpíchni si příchod, až začneš pracovat — čas se začne počítat hned.')}</p>
          )}
          {!zapomenuty && !naPauze && rozvrh}
          {hlaseni}
        </Sloupec>
      )}
      {otazkaPauzy}
      {oknoOdchodu}
      {oknoPolohy}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Právě na směně
// ---------------------------------------------------------------------------

/** Kolik lidí ukázat jako pilulky ve střední velikosti; zbytek řekne „…a dalších N". */
const PILULEK_M = 8;

function PraveNaSmene({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const brana = useBrana(['dochazka.zobrazit', 'dochazka.tablet']);
  const smi = useSmi();
  const nav = useNavigace();
  const data = useDataWidgetu<Dochazka>(brana ? URL_DNES : null, raw => vyberDochazku(raw, t));
  const [ukoncit, setUkoncit] = useState<ClenRosteru | null>(null);
  // Na samotné Docházce odkaz „Docházka“ nikam nevede — stránka dá období přes kontext.
  const naDochazce = useContext(ObdobiStrankyDochazky) != null;

  const lide = useMemo(() => (data.data?.roster ?? [])
    .map(r => ({ r, od: parseDbTime(r.openSince) }))
    .filter((x): x is { r: ClenRosteru; od: Date } => !!x.od)
    .sort((a, b) => a.od.getTime() - b.od.getTime()), [data.data]);
  const L = velikost === 'L';
  const ted = useTed(L && lide.length > 0, 30_000);
  // Ukončit patří k části widgetu s vlastním klíčem (katalog: akce:ukoncit).
  const smiUkoncit = !nahled && smi('dochazka.upravit');

  // Bez oprávnění ho plocha vůbec nepřipojí; kdyby přece, nesmí tvrdit „nikdo tu není".
  if (!brana) return <Widget prazdno={null} />;

  const n = lide.length;
  const pocet = n.toLocaleString('cs-CZ');
  const jeZapomenuty = (od: Date) => Date.now() - od.getTime() > ZAPOMENUTY_MS;

  let telo: ReactNode;
  if (velikost === 'S') {
    telo = (
      <Stat label={t('Teď')} value={pocet} note={
        <span className="inline-flex items-center align-middle">
          <span className="flex -space-x-1.5" aria-hidden>
            {lide.slice(0, 4).map(({ r }) => (
              <Avatar key={r.id} emoji={r.avatar} size="xs" ring={false} className="ring-2 ring-[var(--surface)]" />
            ))}
          </span>
          {n > 4 && <span className="ml-1.5 tabular-nums">+{(n - 4).toLocaleString('cs-CZ')}</span>}
          <span className="sr-only">{lide.map(({ r }) => r.name).join(', ')}</span>
        </span>
      } />
    );
  } else if (!L) {
    telo = (
      // v4 (P2, P15): lidé jako řádky přes šířku (avatar + jméno vlevo, „od 14:03" jako hodnota na R),
      // ne pilulky podle délky jména — jedna pilulka vlevo vypadala jako zapomenutá, víc se lámalo zubatě.
      <Sloupec mezera={3}>
        <ul className="sloupec sloupec-2" aria-label={t('Kdo je na směně')}>
          {lide.slice(0, PILULEK_M).map(({ r, od }) => (
            <li key={r.id} className="flex min-w-0 items-center gap-3">
              <Avatar emoji={r.avatar} name={r.name} size="xs" />
              <span className="min-w-0 flex-1 truncate text-[15px] leading-snug text-[#16181A]">{r.name ?? t('Bez jména')}</span>
              <span className={`shrink-0 text-right text-[13px] tabular-nums ${jeZapomenuty(od) ? 'font-semibold text-wait-ink' : 'text-black/55'}`}>{t('od {cas}', { cas: odKdy(r.openSince) })}</span>
            </li>
          ))}
        </ul>
        {n > PILULEK_M && <p className="t-meta">{aDalsich(t, n - PILULEK_M)}</p>}
      </Sloupec>
    );
  } else {
    telo = (
      <ul className="list">
        {lide.map(({ r, od }) => {
          const zapomenuty = ted - od.getTime() > ZAPOMENUTY_MS;
          const smena = r.shiftStart ? t('směna {cas}', { cas: `${fmtHM(r.shiftStart)}–${fmtHM(r.shiftEnd)}` }) : t('bez plánované směny');
          return (
            <ListRow key={r.id}
              lead={<Avatar emoji={r.avatar} size="sm" />}
              title={r.name ?? t('Bez jména')}
              meta={t('příchod {cas} · {smena}', { cas: odKdy(r.openSince), smena })}
              value={zapomenuty ? undefined : delkaSlovy(t, ted - od.getTime())}
              right={zapomenuty ? <Chip tone="wait" size="sm">{t('Zapomenutý odchod?')}</Chip> : undefined}
              actions={smiUkoncit && r.openEntryId ? (
                <Button variant="secondary" size="sm" onClick={() => setUkoncit(r)}
                  aria-label={t('Ukončit směnu: {jmeno}', { jmeno: r.name ?? t('bez jména') })}>
                  {t('Ukončit')}
                </Button>
              ) : undefined}
            />
          );
        })}
      </ul>
    );
  }

  return (
    <>
      <Widget
        nacteni={data}
        doplnek={velikost !== 'S' && n > 0 ? <Chip tone="muted" size="sm">{pocet}</Chip> : undefined}
        odkaz={velikost === 'S' || naDochazce ? undefined : { popisek: t('Docházka'), pohled: 'attendance' }}
        otevrit={velikost === 'S' && !nahled && nav.smiPohled('attendance') ? () => nav.onNavigate('attendance') : undefined}
        prazdno={n === 0 ? <p className="t-meta">{t('Teď není nikdo napíchnutý.')}</p> : undefined}
      >
        {telo}
      </Widget>
      {/* Stejné okno jako Otevřené příchody: „Ukončit" nesmí zapsat odchod
          natvrdo na teď — kdo odešel v 16:00 a vedoucí to zavírá v 19:00, měl
          by ve mzdě tři hodiny navíc. Navrhne plánovaný konec směny (bez plánu
          teď) a po uložení obnoví všechna období, ať nástroj Docházky, Souhrn
          i Mzdy neukazují záznam dál jako běžící. */}
      {ukoncit?.openEntryId && (() => {
        const od = parseDbTime(ukoncit.openSince);
        const plan = od ? navrhOdchodu(od, konecSmeny(pragueToday(), ukoncit.shiftStart, ukoncit.shiftEnd)) : { cas: new Date(), zPlanu: false };
        return (
          <OknoUkonceni jmeno={ukoncit.name ?? t('Bez jména')} entryId={ukoncit.openEntryId} navrh={plan.cas} zPlanu={plan.zPlanu}
            onZavrit={() => setUkoncit(null)} onHotovo={() => { setUkoncit(null); obnovDochazku(); }} />
        );
      })()}
    </>
  );
}


// ---------------------------------------------------------------------------
// Společné pro widgety s obdobím a zápisem (kolo 69)
// ---------------------------------------------------------------------------

/**
 * Období stránky Docházka (7/30/90 dní z přepínače v hlavičce). Stránka ho
 * sem dá přes Provider; widgety s volbou „Podle stránky" ho následují, ať
 * Mzdy a Souhrn neukazují 30 dní pod přepínačem nastaveným na týden. Mimo
 * Docházku (Finance) je null a platí 30 dní.
 */
export const ObdobiStrankyDochazky = createContext<number | null>(null);

const DNI_VOLBY: Record<string, number> = { '7_dni': 7, '30_dni': 30, '90_dni': 90 };
const VYCHOZI_DNI = 30;

function useDniWidgetu(volba: unknown): { dni: number; naStrance: boolean } {
  const stranka = useContext(ObdobiStrankyDochazky);
  const dni = typeof volba === 'string' && DNI_VOLBY[volba] ? DNI_VOLBY[volba] : stranka ?? VYCHOZI_DNI;
  return { dni, naStrance: stranka != null };
}

const urlDni = (dni: number) => `/api/attendance?days=${dni}`;

/**
 * Po zápisu (Ukončit, úprava v nástroji) obnovit všechno, co docházku
 * ukazuje: widgety i nástroj stránky čtou různé délky období a každá je
 * v mezipaměti zvlášť. obnovDataWidgetu posílá dotaz jen tam, kde je na
 * obrazovce někdo, kdo ho čte — ostatní jen zneplatní.
 */
export function obnovDochazku(): void {
  const dnuMesice = Number(pragueToday().slice(8, 10)) + 1;
  // Stránka Docházky si volí libovolné rozmezí, takže se obnoví i délky, které si v téhle relaci někdo vyžádal.
  for (const d of new Set([1, 7, 30, 90, dnuMesice, ...POUZITE_DNI])) obnovDataWidgetu(urlDni(d));
}

/** Délky období (ve dnech), které si stránka Docházky vyžádala — `obnovDochazku` je po zápisu obnoví taky. */
const POUZITE_DNI = new Set<number>();
export function zapamatujDniDochazky(dni: number): void { POUZITE_DNI.add(dni); }

const aDalsich = (t: PrekladFn, n: number) => t('…a {n, plural, one {# další} few {# další} other {# dalších}}', { n });

/** Datum na vstup datetime-local v místním čase prohlížeče. */
function doVstupu(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Návrh času odchodu (sdílená logika v lib/dochazkaPrehled — používá ji i nástroj Docházky). */
function navrhOdchodu(od: Date, konec: Date | null): { cas: Date; zPlanu: boolean } {
  return navrhOdchoduPlan(od, konec, Date.now());
}

/**
 * Okno „Ukončit příchod" s časem odchodu. Zapomenutý odchod se nemá
 * zavírat na „teď" — směna od osmi do teď by byla dvanáct hodin práce
 * navíc ve mzdě. Předvyplní se plánovaný konec směny, bez plánu teď.
 */
function OknoUkonceni({ jmeno, entryId, navrh, zPlanu, onHotovo, onZavrit }: {
  jmeno: string; entryId: number; navrh: Date; zPlanu: boolean; onHotovo: () => void; onZavrit: () => void;
}) {
  const t = useT('widgety');
  const [cas, setCas] = useState(() => doVstupu(navrh));
  const [duvod, setDuvod] = useState('');
  const [pise, setPise] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const idPole = `ukoncit-${entryId}`;
  const uloz = async () => {
    const d = new Date(cas);
    if (!cas || Number.isNaN(d.getTime())) { setChyba(t('Vyplň čas odchodu.')); return; }
    setPise(true); setChyba(null);
    try {
      // Prázdný důvod = beze změny (případná poznámka záznamu zůstane), vyplněný se uloží s tím, kdo ukončil.
      await fetch('/api/attendance', { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ id: entryId, clockOut: d.toISOString(), note: duvod.trim() || undefined }) }).then(okJson);
      onHotovo();
    } catch (e) {
      setChyba(apiMessage(e, t('Příchod se nepodařilo ukončit.')));
    } finally {
      setPise(false);
    }
  };
  if (typeof document === 'undefined') return null;
  // Přes portál: karta widgetu může mít transformaci a `fixed` by se kreslilo do ní.
  return createPortal(
    <Modal open onClose={onZavrit} size="sm" title={t('Ukončit příchod')} subtitle={jmeno}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>{t('Zrušit')}</Button>
        <Button variant="primary" loading={pise} onClick={uloz}>{t('Uložit odchod')}</Button>
      </>}>
      <div className="space-y-3">
        <Field id={idPole} label={t('Odchod')} hint={zPlanu ? t('Předvyplněný je plánovaný konec směny. Uprav ho, jestli odešel jindy.') : t('Plánovanou směnu nemá, předvyplněný je aktuální čas. Uprav ho, jestli odešel dřív.')}>
          <Input id={idPole} type="datetime-local" value={cas} onChange={e => setCas(e.target.value)} />
        </Field>
        <Field id={`${idPole}-duvod`} label={t('Důvod (nepovinné)')}>
          <Textarea id={`${idPole}-duvod`} rows={2} maxLength={300} value={duvod} placeholder={t('Např. zapomněl se odpíchnout')} onChange={e => setDuvod(e.target.value)} />
        </Field>
        {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
      </div>
    </Modal>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Odpracováno a Můj výdělek (vlastní měsíc)
// ---------------------------------------------------------------------------

/**
 * Vlastní záznamy za tento měsíc. S dochazka.zobrazit vrací API záznamy
 * CELÉHO týmu za tolik dní, kolik se řekne (vlastní se z nich vyberou podle
 * id); bez něj vlastní záznamy za 60 dní a počet dní ignoruje — pak stačí
 * sdílená denní adresa. Při výpadku oprávnění se bere delší okno: je
 * správné pro obě větve. Jen tabletové oprávnění dostane roster bez
 * záznamů — hodiny z toho nespočítáme (`bezZaznamu`).
 */
function useMujMesic(zapnuto: boolean, volba: VolbaMesice = 'tento') {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const ja = useJa();
  const { nacteno, ma } = useOpravneni();
  const dnes = pragueToday();
  // Kolo 5: i minulý měsíc — na začátku měsíce se člověk dívá, kolik mu přijde (vzor Homebase „last pay period").
  const { mesic, dni: dnuMesice } = obdobiMesice(dnes, volba);
  const tymova = nacteno ? ma('dochazka.zobrazit') : true;
  const bezZaznamu = nacteno && !ma('dochazka.zobrazit') && ma('dochazka.tablet');
  const url = !zapnuto || ja.id == null || bezZaznamu ? null : tymova ? urlDni(dnuMesice) : URL_DNES;
  const data = useDataWidgetu<Dochazka>(url, raw => vyberDochazku(raw, t));
  const vlastni = useMemo(() => (data.data?.entries ?? []).filter(e => ja.id != null && Number(e.employeeId) === ja.id), [data.data, ja.id]);
  const ted = useTed(vlastni.some(e => !e.clockOut), 60_000);
  const sazbaRaw = ja.id != null ? (data.data?.roster.find(r => Number(r.id) === ja.id) as ClenRosteruB2 | undefined)?.hourlyRate : undefined;
  const sazba = Number(sazbaRaw) > 0 ? Number(sazbaRaw) : null;
  const s = useMemo(() => mujMesic(vlastni, ja.id ?? -1, mesic, ted, sazba, data.data?.adjustments ?? []), [vlastni, ja.id, mesic, ted, sazba, data.data?.adjustments]);
  const m = Number(mesic.slice(5, 7));
  const nazevMesice = fmtMesic(m, { jazyk });
  const upravy = useMemo(() => mojeUpravyMesice(data.data?.adjustments ?? [], ja.id ?? -1, mesic), [data.data?.adjustments, ja.id, mesic]);
  return { ja, data, s, sazba, sazbaZnama: sazbaRaw !== undefined && sazbaRaw !== null, bezZaznamu, nazevMesice, mesic, upravy, vlastni, ted };
}

type ClenRosteruB2 = ClenRosteru & { hourlyRate?: number | null };

function Odpracovano(_: WidgetProps) {
  const t = useT('widgety');
  const { ja, data, s, bezZaznamu, nazevMesice } = useMujMesic(true);
  const minut = Math.floor(s.ms / 60000);
  const h = Math.floor(minut / 60);
  const min = minut % 60;
  const poznamka = s.zapomenuty ? <Chip tone="wait" size="sm">{t('Zapomenutý odchod')}</Chip>
    : s.vynechano > 0 ? t('bez {n, plural, one {# záznamu} few {# záznamů} other {# záznamů}} nad 24 h', { n: s.vynechano })
    : s.bezi ? t('včetně běžící směny') : t('podle píchaček');

  return (
    <Widget
      nacteni={ja.stav ?? data}
      prazdno={bezZaznamu ? <p className="t-meta text-pretty">{t('S touhle rolí se hodiny z píchaček nedají spočítat.')}</p> : undefined}
    >
      <Stat label={nazevMesice} value={h.toLocaleString('cs-CZ')} unit={min > 0 ? t('h {min} min', { min }) : t('h', undefined, 'hodiny')} note={poznamka} />
    </Widget>
  );
}

/**
 * Můj výdělek — hodiny tohoto měsíce × vlastní sazba, zaokrouhleno po
 * záznamu jako ve mzdách (lib/wages). Sazbu posílá /api/attendance na
 * vlastním řádku rosteru jen s finance.moje_mzda (nebo finance.mzdy);
 * bez oprávnění ho plocha nepřipojí a dotaz neodejde.
 */
function MujVydelek({ velikost, nastaveni }: WidgetProps<{ mesic?: VolbaMesice }>) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const brana = useBrana(['finance.moje_mzda', 'finance.mzdy']);
  const money = useMoney();
  // Měsíc podle nastavení; pás měsíců (L) ho přepne na tento / minulý (starší měsíce API zaměstnance neposílá).
  const vychoziVolba: VolbaMesice = nastaveni.mesic === 'minuly' ? 'minuly' : 'tento';
  const [volba, setVolba] = useState<VolbaMesice>(vychoziVolba);
  useEffect(() => { setVolba(vychoziVolba); }, [vychoziVolba]);
  const { ja, data, s, sazba, sazbaZnama, bezZaznamu, nazevMesice, upravy, mesic, vlastni, ted } = useMujMesic(brana, volba);
  // Kolo 8: co o výplatě ví jen server — z kasy, označené výplaty, zámky, pravidla příplatků a (když to podnik zapnul)
  // podíl na dýšku. Vlastní adresa na měsíc; chyba tohohle dotazu widget neshodí, výdělek z hodin se ukáže i tak.
  const dnes = pragueToday();
  const od = `${mesic}-01`;
  const [rr, mm] = [Number(mesic.slice(0, 4)), Number(mesic.slice(5, 7))];
  const konecMesice = dayPlus(`${mm === 12 ? rr + 1 : rr}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}-01`, -1);
  const doD = konecMesice < dnes ? konecMesice : dnes;
  const urlJa = urlPayrollJa(od, doD);
  if (brana) POUZITE_PAYROLL.add(urlJa);
  const vyplaty = useDataWidgetu<PayrollJa>(brana && ja.id != null && !bezZaznamu ? urlJa : null, raw => vyberPayrollJa(raw, t));
  const pj = vyplaty.data;
  const priplatky = useMemo(() => {
    if (!pj || !sazba || priplatkyVypnute(pj.pravidla.priplatky)) return null;
    const sum = { vikend: 0, noc: 0, svatek: 0, castka: 0 };
    for (const e of vlastni) {
      const z = parseDbTime(e.clockIn);
      if (!z || pragueDayOf(z).slice(0, 7) !== mesic) continue;
      const x = priplatkyZaznamu(e, ted, sazba, pj.pravidla.priplatky);
      sum.castka += x.castka; sum.vikend += x.vikendMs; sum.noc += x.nocMs; sum.svatek += x.svatekMs;
    }
    return sum;
  }, [pj, sazba, vlastni, mesic, ted]);
  const mesice = useMemo(() => (pj ? mesiceVyplat(dnes, pj.ja.vyplaty, pj.zamky, 4) : []), [pj, dnes]);
  const [oknoDysko, setOknoDysko] = useState(false);
  if (!brana) return <Widget prazdno={null} />;
  const minut = Math.floor(s.ms / 60000);
  const hodiny = minut % 60 > 0 ? t('{h} h {min} min', { h: Math.floor(minut / 60), min: minut % 60 }) : t('{h} h', { h: Math.floor(minut / 60) });
  const prazdno = bezZaznamu ? <p className="t-meta text-pretty">{t('S touhle rolí se hodiny z píchaček nedají spočítat.')}</p>
    : sazbaZnama && sazba == null ? <p className="t-meta text-pretty">{t('Hodinovou sazbu ti zatím nikdo nenastavil.')}</p>
    : undefined;
  const tentoMesic = mesice.find(m => m.mesic === mesic);
  const vyplacenoMesic = tentoMesic?.vyplaceno ?? 0;
  const zKasy = pj?.ja.zKasy ?? 0;
  const spropitne = pj?.ja.spropitne ?? null;
  // Hrubý výdělek (mzda + příplatky + prémie) a co z něj ještě přijde: po odečtení dýška už dostaného z kasy a označených výplat.
  // Kolo 9 (N1): prémie za uznané „navíc" (wage_adjustments source 'navic') jsou v s.upravy; tady se jen pojmenují.
  const navicPremie = useMemo(() => premieZaNavic(upravy), [upravy]);
  const celkem = (s.mzda ?? 0) + (priplatky?.castka ?? 0) + s.upravy;
  const kVyplate = Math.round(celkem + (spropitne ?? 0) - zKasy - vyplacenoMesic);
  const datum = (d: string) => fmtDatum(d, { jazyk, styl: 'kratce' });
  if (velikost === 'S') {
    return (
      <Widget nacteni={ja.stav ?? data} prazdno={prazdno}>
        <Stat label={nazevMesice} value={money(kVyplate)}
          note={s.zapomenuty ? <Chip tone="wait" size="sm">{t('Zapomenutý odchod')}</Chip>
            : zKasy > 0 ? t('zbývá · z kasy už {castka}', { castka: money(zKasy) })
            : `${hodiny}${s.bezi ? ` · ${t('běží')}` : ''}${s.upravy > 0 ? ` · ${t('prémie {castka}', { castka: sZnamenkem(s.upravy, money) })}` : s.upravy < 0 ? ` · ${t('srážka {castka}', { castka: sZnamenkem(s.upravy, money) })}` : ''}`} />
      </Widget>
    );
  }
  // M/L (kolo 5, vzor Homebase / 7shifts „Earnings"): rozpad výdělku — hodiny × sazba, prémie a srážky,
  // ve velkém i jejich seznam. Kolo 8: dlaždice Spropitné (podíl podle pravidel podniku, klepnutí = rozpad po
  // dnech), řádky Příplatky a „Z kasy jsi dostal/a", stav výplaty a v L pás měsíců s tím, co bylo vyplacené.
  const denText = (d: string) => fmtDatum(d, { jazyk, styl: 'kratce' });
  const poznamkaMesice = s.zapomenuty ? <Chip tone="wait" size="sm">{t('Zapomenutý odchod')}</Chip>
    : zKasy > 0 || vyplacenoMesic > 0 ? t('zbývá k výplatě') : s.bezi ? t('včetně běžící směny') : t('hrubého, k výplatě');
  return (
    <Widget nacteni={ja.stav ?? data} prazdno={prazdno}
      doplnek={tentoMesic?.zamceno ? <Chip tone="muted" size="sm" icon="lock">{t('Uzavřeno')}</Chip> : undefined}>
      <StatRow podleKarty>
        <Stat label={nazevMesice} value={money(kVyplate)} note={poznamkaMesice} />
        <Stat label={t('Odpracováno')} value={hodiny} note={sazba ? t('× {sazba}/h', { sazba: money(sazba) }) : t('bez sazby')} />
        {spropitne != null && (
          <button type="button" onClick={() => setOknoDysko(true)} className="block w-full min-w-0 text-left rounded-xl tap-target" aria-label={t('Spropitné po dnech')}>
            <Stat label={t('Spropitné')} value={money(spropitne)} note={t('podíl podle hodin · po dnech')} />
          </button>
        )}
        <Stat label={t('Prémie a srážky')} value={upravy.length ? sZnamenkem(s.upravy, money) : '—'} tone={s.upravy > 0 ? 'ok' : s.upravy < 0 ? 'bad' : 'muted'}
          note={upravy.length ? t('{n, plural, one {# zápis} few {# zápisy} other {# zápisů}}', { n: upravy.length }) : t('zatím nic')} />
      </StatRow>
      {(priplatky?.castka ?? 0) > 0 || zKasy > 0 || (tentoMesic?.vyplaty.length ?? 0) > 0 || (navicPremie.castka > 0 && velikost !== 'L') ? (
        <ul className="list mt-3">
          {priplatky && priplatky.castka > 0 && <ListRow title={t('Příplatky')} meta={priplatkySlovy(t, jazyk, priplatky)} value={`+${money(priplatky.castka)}`} />}
          {zKasy > 0 && (
            <ListRow title={t('Z kasy jsi dostal/a {castka}', { castka: money(zKasy) })} meta={t('{n, plural, one {# uzávěrka} few {# uzávěrky} other {# uzávěrek}} · zbývá {zbyva}', { n: pj?.ja.zKasyPocet ?? 0, zbyva: money(kVyplate) })}
              value={`−${money(zKasy)}`} />
          )}
          {tentoMesic?.vyplaty.map(v => (
            <ListRow key={v.id} title={t('Vyplaceno {datum}', { datum: datum(v.paidAt) })} meta={`${v.method === 'ucet' ? t('na účet') : t('hotově')}${v.note ? ` · ${v.note}` : ''}`} value={`−${money(v.amount)}`} />
          ))}
          {navicPremie.castka > 0 && velikost !== 'L' && (
            <ListRow title={t('Navíc')} meta={t('{n, plural, one {# uznaný zápis} few {# uznané zápisy} other {# uznaných zápisů}} s prémií', { n: navicPremie.pocet })} value={`+${money(navicPremie.castka)}`} />
          )}
        </ul>
      ) : null}
      {velikost === 'L' && upravy.length > 0 && (
        <ul className="list mt-3">
          {upravy.slice(0, 6).map(u => (
            <ListRow key={u.id} title={u.note || (Number(u.amount) > 0 ? t('Prémie') : t('Srážka'))}
              meta={`${denText(String(u.day).slice(0, 10))}${u.source === 'reward' ? ` · ${t('z odměny')}` : u.source === 'navic' ? ` · ${t('za navíc')}` : u.source === 'trest' ? ` · ${t('krácení prémie (trest)')}` : ''}`}
              value={<span className={Number(u.amount) > 0 ? 'text-ok-ink' : 'text-bad-ink'}>{sZnamenkem(Number(u.amount), money)}</span>} />
          ))}
        </ul>
      )}
      {velikost === 'L' && upravy.length > 6 && <p className="t-meta mt-2">{t('…a {n, plural, one {# další} few {# další} other {# dalších}}', { n: upravy.length - 6 })}</p>}
      {velikost === 'L' && mesice.length > 0 && (
        <div className="mt-4">
          <p className="t-label mb-1">{t('Výplaty po měsících')}</p>
          <ul className="list" data-mesice-vyplat>
            {mesice.map((m, i) => {
              const nazev = `${fmtMesic(m.mesic, { jazyk })} ${m.mesic.slice(0, 4)}`;
              const prepnutelny = i === 0 || i === 1;
              const radek = {
                title: <span className="cz-sentence">{nazev}</span>,
                meta: m.bezi ? t('běží') : m.vyplaceno > 0 ? t('Vyplaceno {datum}', { datum: datum(m.vyplaty[0].paidAt) }) : m.zamceno ? t('uzavřeno, čeká na výplatu') : t('čeká'),
                value: m.vyplaceno > 0 ? money(m.vyplaceno) : m.mesic === mesic ? money(kVyplate) : '—',
                valueMeta: m.vyplaceno > 0 ? t('vyplaceno') : m.mesic === mesic ? t('zbývá') : undefined,
                right: m.zamceno ? <Chip tone="muted" size="sm" icon="lock">{t('Uzavřeno')}</Chip> : m.mesic === mesic ? <Chip tone="ink" size="sm">{t('zobrazeno')}</Chip> : undefined,
              };
              return prepnutelny
                ? <li key={m.mesic}><ListRow as="div" {...radek} onClick={() => setVolba(i === 0 ? 'tento' : 'minuly')} /></li>
                : <ListRow key={m.mesic} {...radek} />;
            })}
          </ul>
        </div>
      )}
      {oknoDysko && pj && (
        <Modal open onClose={() => setOknoDysko(false)} size="sm" title={t('Spropitné')} subtitle={`${nazevMesice} · ${money(spropitne ?? 0)}`}>
          {pj.ja.spropitnePoDnech.length === 0 ? <p className="t-meta">{t('V tomhle měsíci zatím žádné dýško k rozdělení.')}</p> : (
            <ul className="list">
              {pj.ja.spropitnePoDnech.map(d => (
                <ListRow key={d.den} title={<span className="cz-sentence">{fmtDatum(d.den, { jazyk, styl: 'denKratce' })}</span>}
                  meta={t('{moje} z {smena}', { moje: hodinyMinuty(d.mojeMs), smena: hodinyMinuty(d.smenaMs) })} value={money(d.castka)} />
              ))}
            </ul>
          )}
          <p className="t-meta mt-3 text-pretty">{t('Dýško z uzávěrky se dělí mezi lidi na směně podle pravidel podniku.')}</p>
        </Modal>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Mzdy za období
// ---------------------------------------------------------------------------

const nazevDni = (t: PrekladFn, dni: number) => t('{n, plural, one {# den} few {# dny} other {# dní}}', { n: dni });

function vyberUzaverky(raw: any, t: PrekladFn): UzaverkaTrzby[] {
  if (!raw || !Array.isArray(raw.closings)) throw new Error(t('Uzávěrky přišly v nečekaném tvaru.'));
  return raw.closings;
}

function MzdyZaObdobi({ velikost, nastaveni }: WidgetProps<{ obdobi?: string }>) {
  const t = useT('widgety');
  const brana = useBranaVse(['dochazka.zobrazit', 'finance.mzdy']);
  const smi = useSmi();
  const money = useMoney();
  const { laborTargetPct } = useCurrency();
  const { dni, naStrance } = useDniWidgetu(nastaveni.obdobi);
  const M = velikost !== 'S';
  // Podíl jen s celými tržbami: bez uzaverky.zobrazit_vse vrátí /api/closings
  // jen vlastní uzávěrky (bez příznaku trzbaSkryta) a 2 z 30 uzávěrek by
  // udělaly z 25 % „240 % · Nad cílem".
  const podil = M && smi('finance.trzby') && smi('uzaverky.zobrazit_vse');
  const data = useDataWidgetu<Dochazka>(brana ? urlDni(dni) : null, raw => vyberDochazku(raw, t));
  const trzbyData = useDataWidgetu<UzaverkaTrzby[]>(brana && podil ? '/api/closings' : null, raw => vyberUzaverky(raw, t));
  const ted = useTed(!!data.data?.entries.some(e => !e.clockOut), 60_000);
  const mzdy = useMemo(() => data.data ? mzdyZaObdobi(data.data.entries, ted, sazbyZRosteru(data.data.roster as ClenRosteruB2[]), data.data.adjustments) : null, [data.data, ted]);
  const trzby = useMemo(() => {
    if (!trzbyData.data) return null;
    const o = obdobiDni(dni, pragueToday());
    return trzbyZaObdobi(trzbyData.data, o.od, o.do);
  }, [trzbyData.data, dni]);
  if (!brana) return <Widget prazdno={null} />;

  const pct = mzdy && trzby && !trzby.skryto ? podilMezd(mzdy.celkem, trzby.trzby) : null;
  const nad = pct != null && laborTargetPct != null && pct > laborTargetPct;
  const poznamkaMezd = [
    mzdy && mzdy.bezSazby > 0 ? t('bez sazby: {n, plural, one {# člověk} few {# lidé} other {# lidí}}', { n: mzdy.bezSazby }) : null,
    mzdy && mzdy.upravy !== 0 ? t('vč. prémií a srážek {castka}', { castka: sZnamenkem(mzdy.upravy, money) }) : null,
  ].filter(Boolean).join(' · ') || t('za {n, plural, one {# den} few {# dny} other {# dní}}', { n: dni });
  return (
    <Widget nacteni={[data, trzbyData]}
      odkaz={naStrance ? undefined : { popisek: t('Docházka'), pohled: 'attendance' }}>
      {!M ? (
        <Stat label={t('Mzdy · {obdobi}', { obdobi: nazevDni(t, dni) })} value={money(mzdy?.celkem ?? 0)} note={mzdy && mzdy.bezSazby > 0 ? poznamkaMezd : undefined} />
      ) : (
        <StatRow>
          <Stat label={t('Mzdové náklady')} value={money(mzdy?.celkem ?? 0)} note={poznamkaMezd} />
          {podil && (
            <Stat label={t('Podíl na tržbách')}
              value={pct != null ? pct.toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) : '—'} unit={pct != null ? '%' : undefined}
              note={pct == null ? (trzby?.skryto ? t('tržby nevidíš celé') : t('za období nejsou tržby'))
                : laborTargetPct != null ? <Chip tone={nad ? 'bad' : 'ok'} size="sm">{nad ? t('Nad cílem') : t('V cíli')} {laborTargetPct.toLocaleString('cs-CZ')} %</Chip>
                : t('z tržeb za období')} />
          )}
        </StatRow>
      )}
    </Widget>
  );
}

/** Všechny klíče najednou (opravneni.vse) — přísně podle načtených oprávnění. */
function useBranaVse(klice: readonly string[]): boolean {
  const { nacteno, chyba, ma } = useOpravneni();
  return nacteno ? klice.every(k => ma(k)) : chyba;
}

// ---------------------------------------------------------------------------
// Souhrn hodin
// ---------------------------------------------------------------------------

const RADKU_M = 5;

function SouhrnHodin({ velikost, nastaveni, nahled }: WidgetProps<{ obdobi?: string; razeni?: RazeniSouhrnu }>) {
  const t = useT('widgety');
  const brana = useBranaVse(['dochazka.zobrazit']);
  const smi = useSmi();
  const money = useMoney();
  const otevriProfil = usePersonProfile();
  const { instance } = useWidget();
  const { dni } = useDniWidgetu(nastaveni.obdobi);
  const L = velikost === 'L';
  const vidiMzdy = smi('finance.mzdy');
  const vychoziRazeni: RazeniSouhrnu = nastaveni.razeni === 'mzda' && !vidiMzdy ? 'hodiny' : nastaveni.razeni ?? 'hodiny';
  const [razeni, setRazeni] = useState<RazeniSouhrnu>(vychoziRazeni);
  useEffect(() => { setRazeni(vychoziRazeni); }, [vychoziRazeni]);

  // Velká varianta: období si člověk volí tlačítkem (rychlé volby, od–do, dny v týdnu) a nad lidmi je graf hodin po dnech.
  // Server vrací nejvýš 180 dní zpět, takže volby i srovnání se jím omezují.
  const dnes = pragueToday();
  const pocatek = useMemo(() => obdobiZPresetu(dni === 7 ? '7_dni' : dni === 30 ? '30_dni' : dni === 90 ? '90_dni' : 'mesic', dnes), [dni, dnes]);
  const { obdobi, nastav } = useObdobi(`dochazka_souhrn-${instance}`, pocatek);
  const [porovnat, setPorovnat] = useUlozeno<boolean>('dochazka-porovnat-2', true);
  const nejdrive = dayPlus(dnes, -179);
  const rHrube = platneRozmezi(obdobi, dnes);
  const r = { od: rHrube.od < nejdrive ? nejdrive : rHrube.od, do: rHrube.do };
  const pred = predchoziRozmezi(r.od, r.do);
  const chcePorovnani = L && porovnat && pred.od >= nejdrive;
  const dniNacist = L ? pocetDni(chcePorovnani ? pred.od : r.od, dnes) : dni;
  const data = useDataWidgetu<Dochazka>(brana ? urlDni(dniNacist) : null, raw => vyberDochazku(raw, t));
  const ted = useTed(!!data.data?.entries.some(e => !e.clockOut), 60_000);
  const entriesObdobi = useMemo(() => (data.data ? (L ? zaznamyVRozmezi(data.data.entries, r.od, r.do, obdobi.dnyTydne) : data.data.entries) : []), [data.data, L, r.od, r.do, obdobi.dnyTydne]);
  // Spropitné z uzávěrek rozpočítané podle hodin na směně (jako tip pool v 7shifts / Toast) — velká podoba a jen s celými
  // tržbami (bez uzaverky.zobrazit_vse přijdou jen vlastní uzávěrky a podíl by lhal). Chyba uzávěrek widget neshodí: dýška
  // jsou doplněk k hodinám.
  const vidiDyska = L && smi('finance.trzby') && smi('uzaverky.zobrazit_vse');
  const uzaverky = useDataWidgetu<UzaverkaSpropitne[]>(brana && vidiDyska ? '/api/closings' : null, raw => vyberUzaverky(raw, t) as UzaverkaSpropitne[]);
  // Kolo 8: z kasy, vyplaceno a pravidla (dýško, příplatky) z /api/payroll — ve velké podobě s finance.mzdy; stejná adresa
  // jako Výplatní listina, takže jeden dotaz za plochu. Chyba tohohle dotazu hodiny neshodí.
  const urlP = L && vidiMzdy ? urlPayroll(r.od, r.do) : null;
  if (urlP && brana) POUZITE_PAYROLL.add(urlP);
  const payroll = useDataWidgetu<Payroll>(brana && urlP ? urlP : null, raw => vyberPayroll(raw, t));
  const pravidla = payroll.data?.pravidla ?? null;
  const pozice = useMemo(() => new Map((payroll.data?.lide ?? []).filter(l => l.jobTitle).map(l => [String(l.id), String(l.jobTitle)])), [payroll.data]);
  const dyska = useMemo(() => (vidiDyska && uzaverky.data ? spropitneZaObdobi(uzaverky.data, entriesObdobi, ted, r.od, r.do, obdobi.dnyTydne, pravidla ? { pravidla: pravidla.dysko, pozice } : null) : null),
    [vidiDyska, uzaverky.data, entriesObdobi, ted, r.od, r.do, obdobi.dnyTydne, pravidla, pozice]);
  // Prémie a srážky období (API je posílá jen s finance.mzdy) — do řádků, do součtu a do okna „Prémie a srážky".
  const upravyObdobi = useMemo(() => (data.data && vidiMzdy ? (L ? upravyVRozmezi(data.data.adjustments, r.od, r.do, obdobi.dnyTydne) : data.data.adjustments) : []),
    [data.data, vidiMzdy, L, r.od, r.do, obdobi.dnyTydne]);
  const radky = useMemo(() => {
    if (!data.data) return [];
    // Sazby jen s finance.mzdy — server je bez něj posílá jako null, ale
    // widget se na to nespoléhá (pole katalogu: Kč u člověka).
    const sazby = vidiMzdy ? sazbyZRosteru(data.data.roster as ClenRosteruB2[]) : new Map<string, number>();
    const lide = new Map(data.data.roster.map(m => [String(m.id), { jmeno: m.name ?? '', avatar: m.avatar ?? null }]));
    // Kolo 7: i plán (součet délek plánovaných směn) a pozdní příchody — API je posílá u záznamů (planStart/planEnd).
    return seradSouhrn(souhrnHodin(entriesObdobi, ted, sazby, { spropitne: dyska && !dyska.skryto ? dyska.poLidech : null, upravy: upravyPoLidech(upravyObdobi), lide, plan: true, priplatky: pravidla && !priplatkyVypnute(pravidla.priplatky) ? pravidla.priplatky : null }), razeni);
  }, [data.data, entriesObdobi, ted, razeni, vidiMzdy, dyska, upravyObdobi, pravidla]);
  const mzdyCelkem = useMemo(() => radky.reduce((a, x) => a + (x.vyplata ?? 0), 0), [radky]);
  // Už vyplaceno z kasy a označené výplaty po lidech (kolo 8) — „Doplatit" místo toho, aby se vyplácelo dvakrát.
  const zKasyPodle = useMemo(() => new Map((payroll.data?.lide ?? []).map(l => [String(l.id), { zKasy: Number(l.zKasy) || 0, pocet: Number(l.zKasyPocet) || 0, vyplaceno: Number(l.vyplaceno) || 0 }])), [payroll.data]);
  const zKasyCelkem = useMemo(() => [...zKasyPodle.values()].reduce((a, x) => a + x.zKasy, 0), [zKasyPodle]);
  const zKasyPocet = useMemo(() => [...zKasyPodle.values()].reduce((a, x) => a + x.pocet, 0), [zKasyPodle]);
  const vyplacenoCelkem = useMemo(() => [...zKasyPodle.values()].reduce((a, x) => a + x.vyplaceno, 0), [zKasyPodle]);
  const doplatitCelkem = Math.round(mzdyCelkem + (dyska && !dyska.skryto ? dyska.celkem - dyska.nerozdeleno : 0) - zKasyCelkem - vyplacenoCelkem);
  const upravyCelkem = useMemo(() => radky.reduce((a, x) => a + x.upravy, 0), [radky]);
  const bezSazby = useMemo(() => radky.filter(x => x.mzda == null && x.ms > 0).length, [radky]);
  // Prémii / srážku přidá, kdo smí měnit sazby (zápis mzdy); okno nese i seznam už zapsaných s košem.
  const smiPremie = L && !nahled && smi('finance.sazby_upravit');
  const [okno, setOkno] = useState<{ id: string; jmeno: string; druh: 'premie' | 'srazka' } | null>(null);
  // Kolo 10: u člověka s pozdním příchodem „Dát trest za pozdní příchod" (tresty.udelit) — nejnovější nevyřízený
  // příchod z období (klíč návrhu `pozde:<id záznamu>`, takže návrh ve widgetu Tresty v týmu zmizí).
  const smiTrest = !nahled && smi('tresty.udelit');
  const navrhyTrestu = useNavrhyTrestu(brana && smiTrest);
  const [trest, setTrest] = useState<PredvolbyTrestu | null>(null);
  const pozdniPrichody = useMemo<PozdniPrichod[]>(() => {
    if (!smiTrest) return [];
    const plany = odchylkyZaznamu(entriesObdobi, ted);
    const out: PozdniPrichod[] = [];
    for (const e of entriesObdobi) {
      const p = plany.get(String(e.id ?? ''));
      const od = parseDbTime(e.clockIn);
      if (!p || p.pozdeMin == null || e.id == null || e.employeeId == null || !od) continue;
      // Den směny (planDate z API — přes půlnoc patří směna včerejšku), bez něj den příchodu.
      const denSmeny = (e as ZaznamDochazkyLib).planDate;
      out.push({ id: e.id, userId: e.employeeId, den: denSmeny && /^\d{4}-\d{2}-\d{2}$/.test(denSmeny) ? denSmeny : pragueDayOf(od), minuty: p.pozdeMin });
    }
    return out;
  }, [smiTrest, entriesObdobi, ted]);
  const navrhyKlice = useMemo(() => (navrhyTrestu.data ? new Set(navrhyTrestu.data.map(n => n.klic)) : null), [navrhyTrestu.data]);
  const trestZaPozde = (r: { id: string; jmeno: string; pozde: number }): PredvolbyTrestu | null => {
    if (!smiTrest || r.pozde <= 0) return null;
    const k = pozdniKTrestu(pozdniPrichody, r.id, dnes, navrhyKlice);
    return k ? {
      userId: Number(r.id), jmeno: r.jmeno, day: k.den, sourceKey: `pozde:${k.id}`, druhNavrhu: 'pozde',
      text: textNavrhu({ druh: 'pozde', minuty: k.minuty, castka: null, poznamka: null }, money),
    } : null;
  };

  const hr = hrubostProRozmezi(obdobi, pocetDni(r.od, r.do));
  const hodnoty = useMemo(() => (L && data.data ? hodinyPoDnech(data.data.entries, ted, r.od, r.do) : []), [L, data.data, ted, r.od, r.do]);
  const hodnotyPred = useMemo(() => (chcePorovnani && data.data ? hodinyPoDnech(data.data.entries, ted, pred.od, pred.do) : null), [chcePorovnani, data.data, ted, pred.od, pred.do]);
  const sloty: Slot[] = useMemo(() => agreguj(hodnoty, r.od, r.do, hr, obdobi.dnyTydne), [hodnoty, r.od, r.do, hr, obdobi.dnyTydne]);
  const slotyPred: Slot[] | null = useMemo(() => (hodnotyPred ? agreguj(hodnotyPred, pred.od, pred.do, hr, obdobi.dnyTydne) : null), [hodnotyPred, pred.od, pred.do, hr, obdobi.dnyTydne]);
  const sumHodin = useMemo(() => sloty.reduce((s2, x) => s2 + x.hodnota, 0), [sloty]);
  const sumPred = useMemo(() => (slotyPred ? slotyPred.reduce((s2, x) => s2 + x.hodnota, 0) : null), [slotyPred]);
  const zmena = sumPred != null ? zmenaPct(sumHodin, sumPred) : null;
  const loc = useJazyk().jazyk;
  const kratceDatum = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { day: 'numeric', month: 'numeric' });
  const pismeno = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { weekday: 'short' });
  const jmenoSlotu = (sl: Slot) => hr === 'den' ? `${pismeno(sl.klic)} ${kratceDatum(sl.klic)}` : hr === 'tyden' ? `${kratceDatum(sl.od)} – ${kratceDatum(sl.do)}`
    : new Date(`${sl.klic}-01T12:00:00`).toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  const popisekOsy = (sl: Slot) => hr === 'den' ? (sloty.length <= 10 ? pismeno(sl.klic) : String(Number(sl.klic.slice(8)))) : hr === 'tyden' ? kratceDatum(sl.od)
    : new Date(`${sl.klic}-01T12:00:00`).toLocaleDateString(loc, { month: 'short' });
  const dnesKlic = hr === 'den' ? dnes : hr === 'tyden' ? obdobiZPresetu('tyden', dnes).od : dnes.slice(0, 7);
  const hodinyText = (h: number) => `${(Math.round(h * 10) / 10).toLocaleString(loc)} h`;
  if (!brana) return <Widget prazdno={null} />;

  const profil = !nahled && !!otevriProfil && smi('tym.profil');
  const zobrazene = L ? radky : radky.slice(0, RADKU_M);
  // „Kdo chodí pozdě" (kolo 7) jako řazení, jen když v období někdo pozdě přišel.
  const nekdoPozde = radky.some(r => r.pozde > 0);
  const moznosti = [
    { id: 'hodiny' as const, label: t('Hodiny', undefined, 'widgety') },
    ...(vidiMzdy ? [{ id: 'mzda' as const, label: t('Mzda') }] : []),
    ...(nekdoPozde || razeni === 'pozde' ? [{ id: 'pozde' as const, label: t('Pozdě') }] : []),
    { id: 'jmeno' as const, label: t('Jméno') },
  ];
  const planText = (ms: number) => t('plán {h} h', { h: (Math.round(ms / 360_000) / 10).toLocaleString(loc) });
  return (
    <Widget nacteni={data}
      doplnek={!L && radky.length > 0 ? <Chip tone="muted" size="sm">{nazevDni(t, dni)}</Chip> : undefined}
      prazdno={!L && radky.length === 0 ? <p className="t-meta">{t('Za {n, plural, one {# den} few {# dny} other {# dní}} nikdo nic neodpíchl.', { n: dni })}</p> : undefined}>
      {/* v4 (V14, V07): skupiny období → čísla → graf → (řazení + seznam) pod sebou 24; řazení stojí přes
          celou šířku těsně nad seznamem, který řadí (12), „…a další" 8 pod seznamem. */}
      <Sloupec mezera={6}>
      {L && (
        <>
          <ObdobiLista value={obdobi} onChange={nastav} volby={['dnes', 'vcera', 'tyden', '7_dni', '30_dni', 'mesic', 'minuly_mesic', '90_dni', '180_dni']} porovnat={porovnat} onPorovnat={setPorovnat} />
          <Sloupec mezera={2}>
            {/* Hodiny, mzdy a spropitné za období vedle sebe — co člověk hledá v „kdo kolik odpracoval a kolik to stálo".
                Mzdy jen s finance.mzdy, spropitné jen s celými tržbami. */}
            <StatRow podleKarty>
              <Stat label={t('Odpracováno')} value={hodinyText(sumHodin)} note={t('{n, plural, one {# směna} few {# směny} other {# směn}}', { n: radky.reduce((a, x) => a + x.pocet, 0) })} />
              {vidiMzdy && (
                <Stat label={t('Mzdy')} value={money(mzdyCelkem)}
                  note={[
                    bezSazby > 0 ? t('bez sazby: {n, plural, one {# člověk} few {# lidé} other {# lidí}}', { n: bezSazby }) : null,
                    upravyCelkem !== 0 ? t('vč. prémií a srážek {castka}', { castka: sZnamenkem(upravyCelkem, money) }) : null,
                  ].filter(Boolean).join(' · ') || t('hodiny × sazba')} />
              )}
              {dyska && !dyska.skryto && (
                <Stat label={t('Spropitné')} value={money(dyska.celkem)}
                  note={dyska.nerozdeleno > 0 ? t('{castka} bez směny', { castka: money(dyska.nerozdeleno) }) : t('z uzávěrek, podle hodin na směně')} />
              )}
              {vidiMzdy && payroll.data && (zKasyCelkem > 0 || payroll.data.payDailyCash) && (
                <Stat label={t('Z kasy')} value={`−${money(zKasyCelkem)}`} note={t('už vyplaceno · {n}× v uzávěrkách', { n: zKasyPocet.toLocaleString(loc) })} />
              )}
              {vidiMzdy && payroll.data && (
                <Stat label={t('Doplatit')} value={money(doplatitCelkem)} tone="ok" note={vyplacenoCelkem > 0 ? t('vyplaceno {castka}', { castka: money(vyplacenoCelkem) }) : t('mzdy a dýško po odečtení z kasy')} />
              )}
            </StatRow>
            {zmena != null && (
              <p className="t-meta text-pretty">
                <Chip tone={zmena >= 0 ? 'ok' : 'wait'} size="sm">{zmena > 0 ? '+' : ''}{zmena} %</Chip> {t('proti předchozímu období')} ({hodinyText(sumPred!)})
              </p>
            )}
          </Sloupec>
          <CasovyGraf sloty={sloty} porovnani={slotyPred} druh="sloupce" vyska={170} format={hodinyText} kratce={v => String(Math.round(v))}
            jmenoSlotu={jmenoSlotu} popisekOsy={popisekOsy} zvyraznit={dnesKlic} popisekPorovnani={t('předchozí období')}
            label={t('Odpracované hodiny: {obdobi}', { obdobi: `${kratceDatum(r.od)} – ${kratceDatum(r.do)}` })} />
        </>
      )}
      <Sloupec mezera={L ? 3 : 2}>
      {L && radky.length > 2 && (
        <Segmented size="sm" ariaLabel={t('Řadit souhrn')} value={razeni} onChange={v => setRazeni(v)} options={moznosti} />
      )}
      <ul className="list">
        {zobrazene.map(r => {
          const meta = [
            r.pocet > 0 ? t('{n, plural, one {# směna} few {# směny} other {# směn}}', { n: r.pocet }) : t('bez směny'), r.bezi ? t('právě běží') : null,
            r.vynechano > 0 ? t('{n}× bez odchodu', { n: r.vynechano.toLocaleString('cs-CZ') }) : null,
            r.spropitne != null && r.spropitne > 0 ? t('spropitné {castka}', { castka: money(Math.round(r.spropitne)) }) : null,
            r.upravy > 0 ? t('prémie {castka}', { castka: sZnamenkem(r.upravy, money) }) : r.upravy < 0 ? t('srážka {castka}', { castka: sZnamenkem(r.upravy, money) }) : null,
          ].filter(Boolean).join(' · ');
          const pocetUprav = upravyObdobi.filter(u => String(u.userId) === r.id).length;
          // Pod hodinami plán (Homebase/7shifts „Scheduled") a výplata; počet pozdních příchodů chipem vpravo.
          const sMzdou = vidiMzdy && r.vyplata != null;
          const radek = {
            lead: <Avatar emoji={r.avatar} size="sm" />,
            title: r.jmeno,
            meta,
            value: hodinyMinuty(r.ms),
            valueMeta: r.planMs > 0 || sMzdou ? (
              <>
                {r.planMs > 0 && <span className="block">{planText(r.planMs)}</span>}
                {sMzdou && (() => {
                  const z = zKasyPodle.get(r.id);
                  const odecist = (z?.zKasy ?? 0) + (z?.vyplaceno ?? 0);
                  return <span className="block">{odecist > 0 ? t('doplatit {castka}', { castka: money(Math.round(r.vyplata! + (r.spropitne ?? 0) - odecist)) }) : money(r.vyplata!)}</span>;
                })()}
              </>
            ) : undefined,
            // Na počítači ve sloupci pevné šířky (aside, i prázdný), ať hodiny drží svislici; pod lg vpravo v ocase.
            aside: nekdoPozde ? (r.pozde > 0 ? <Chip tone="wait" size="sm">{t('{n}× pozdě', { n: r.pozde.toLocaleString(loc) })}</Chip> : '') : undefined,
            right: nekdoPozde ? <span className="lg:hidden">{r.pozde > 0 && <Chip tone="wait" size="sm">{t('{n}× pozdě', { n: r.pozde.toLocaleString(loc) })}</Chip>}</span> : undefined,
          };
          const zaPozde = trestZaPozde(r);
          if (smiPremie || zaPozde) {
            // Řádek nese „···" (prémie / srážka, trest za pozdní příchod), takže celý klikací být nemůže — profil otevře jméno.
            const polozky: MenuItem[] = [
              ...(smiPremie ? [
                { label: t('Přidat prémii'), icon: 'plus', onClick: () => setOkno({ id: r.id, jmeno: r.jmeno, druh: 'premie' }) },
                { label: t('Přidat srážku'), icon: 'minus', onClick: () => setOkno({ id: r.id, jmeno: r.jmeno, druh: 'srazka' }) },
                ...(pocetUprav > 0 ? [{ label: t('Prémie a srážky ({n})', { n: pocetUprav }), icon: 'coins', onClick: () => setOkno({ id: r.id, jmeno: r.jmeno, druh: 'premie' }) }] : []),
              ] : []),
              ...(zaPozde ? [{ label: t('Dát trest za pozdní příchod'), icon: 'warning', hint: zaPozde.text, onClick: () => setTrest(zaPozde) }] : []),
            ];
            return (
              <ListRow key={r.id} {...radek}
                title={profil && otevriProfil
                  ? <button type="button" onClick={() => otevriProfil(Number(r.id))} aria-label={`Profil: ${r.jmeno}`} className="max-w-full truncate text-left rounded-sm hover:underline decoration-black/25 underline-offset-2">{r.jmeno}</button>
                  : r.jmeno}
                actions={<Menu size="sm" label={smiPremie ? t('Prémie a srážky: {jmeno}', { jmeno: r.jmeno }) : t('Akce: {jmeno}', { jmeno: r.jmeno })} items={polozky} />} />
            );
          }
          return profil && otevriProfil ? (
            <li key={r.id}><ListRow as="div" {...radek} onClick={() => otevriProfil(Number(r.id))} /></li>
          ) : <ListRow key={r.id} {...radek} />;
        })}
      </ul>
      {!L && radky.length > RADKU_M && <p className="t-meta">{aDalsich(t, radky.length - RADKU_M)}</p>}
      </Sloupec>
      </Sloupec>
      {okno && (
        <UpravaMzdyOkno clovek={okno} rozmezi={r} upravy={upravyObdobi.filter(u => String(u.userId) === okno.id)} onClose={() => setOkno(null)} />
      )}
      {smiTrest && <DatTrest open={!!trest} predvolby={trest} onClose={() => setTrest(null)} />}
    </Widget>
  );
}

/** „+500 Kč" / „−200 Kč" — částka se znaménkem (mínus typograficky). */
function sZnamenkem(castka: number, money: (n: number) => string): string {
  return castka >= 0 ? `+${money(castka)}` : `−${money(Math.abs(castka))}`;
}

/**
 * Okno Prémie / srážka: částka ke dni a člověku s poznámkou, pod tím už zapsané úpravy období s košem.
 * Vzor Homebase / 7shifts („Add bonus / deduction" u výplaty). Zápis jde na /api/wage-adjustments,
 * po uložení se obnoví docházka (stejná adresa pro hodiny i úpravy), takže souhrn i Mzdy se přepočítají.
 */
function UpravaMzdyOkno({ clovek, rozmezi, upravy, onClose }: {
  clovek: { id: string; jmeno: string; druh: 'premie' | 'srazka' };
  rozmezi: { od: string; do: string };
  upravy: UpravaMzdy[];
  onClose: () => void;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const symbol = useSymbol();
  const { jazyk } = useJazyk();
  const dnes = pragueToday();
  const [druh, setDruh] = useState<'premie' | 'srazka'>(clovek.druh);
  // Typ prémie (spuštění, balík P): tresty smí krátit jen nenárokovou prémii (§ 346b ZP).
  const [typPremie, setTypPremie] = useState<'premie' | 'mzda'>('premie');
  const [castka, setCastka] = useState('');
  const [den, setDen] = useState(dnes >= rozmezi.od && dnes <= rozmezi.do ? dnes : rozmezi.do);
  const [poznamka, setPoznamka] = useState('');
  const [ukladam, setUkladam] = useState(false);
  const [mazu, setMazu] = useState<number | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const cislo = Math.round(Number(castka.replace(',', '.')));
  const jde = Number.isFinite(cislo) && cislo > 0 && /^\d{4}-\d{2}-\d{2}$/.test(den);
  const uloz = async () => {
    if (!jde || ukladam) return;
    setUkladam(true); setChyba(null);
    try {
      await fetch('/api/wage-adjustments', {
        method: 'POST', headers: JSON_HLAVICKA,
        body: JSON.stringify({ userId: Number(clovek.id), day: den, amount: druh === 'premie' ? cislo : -cislo, druh: druh === 'premie' ? typPremie : undefined, note: poznamka.trim() || undefined }),
      }).then(okJson);
      obnovDochazku();
      onClose();
    } catch (e) {
      setChyba(apiMessage(e, t('Zápis se nepodařilo uložit.')));
    } finally {
      setUkladam(false);
    }
  };
  const smaz = async (id: number) => {
    setMazu(id); setChyba(null);
    try {
      await fetch(`/api/wage-adjustments?id=${id}`, { method: 'DELETE' }).then(okJson);
      obnovDochazku();
    } catch (e) {
      setChyba(apiMessage(e, t('Smazání se nepodařilo.')));
    } finally {
      setMazu(null);
    }
  };
  const denText = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(jazyk, { day: 'numeric', month: 'numeric' });
  return (
    <Modal open onClose={onClose} size="sm" title={t('Prémie a srážky')} subtitle={clovek.jmeno}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zavřít')}</Button>
        <Button variant="primary" icon="check" onClick={uloz} loading={ukladam} disabled={!jde}>{druh === 'premie' ? t('Přidat prémii') : t('Přidat srážku')}</Button>
      </>}>
      <div className="space-y-4">
        <Segmented ariaLabel={t('Druh')} value={druh} onChange={setDruh} options={[{ id: 'premie', label: t('Prémie') }, { id: 'srazka', label: t('Srážka') }]} />
        {druh === 'premie' && (
          <div className="space-y-1.5" data-typ-premie>
            <p className="field-label">{t('Typ prémie')}</p>
            <Segmented ariaLabel={t('Typ prémie')} value={typPremie} onChange={setTypPremie}
              options={[{ id: 'premie', label: t('Nenároková prémie') }, { id: 'mzda', label: t('Mzda / ostatní') }]} />
            <p className="t-meta text-pretty">{typPremie === 'premie'
              ? t('Dobrovolná prémie nad mzdu. Jen z ní jde krátit při trestu.')
              : t('Část mzdy, na kterou má člověk nárok (smlouva, mzdový výměr). Trest ji krátit nesmí.')}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field id="uprava-castka" label={t('Částka')}>
            <div className="relative">
              <Input id="uprava-castka" type="number" inputMode="numeric" min={1} value={castka} onChange={e => setCastka(e.target.value)} className="tabular-nums pr-10" autoFocus />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
            </div>
          </Field>
          <Field id="uprava-den" label={t('Den')}>
            <Input id="uprava-den" type="date" value={den} min={rozmezi.od} max={dnes} onChange={e => setDen(e.target.value)} />
          </Field>
        </div>
        <Field id="uprava-poznamka" label={t('Poznámka')} hint={t('Za co — uvidí ji i člověk v oznámení.')}>
          <Input id="uprava-poznamka" value={poznamka} onChange={e => setPoznamka(e.target.value)} maxLength={200} placeholder={druh === 'premie' ? t('Např. víkendová akce') : t('Např. manko v kase')} />
        </Field>
        {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
        {upravy.length > 0 && (
          <div>
            <p className="t-label mb-1">{t('Zapsané v období')}</p>
            <ul className="list">
              {upravy.map(u => (
                <ListRow key={u.id} title={u.note || (u.amount > 0 ? t('Prémie') : t('Srážka'))}
                  meta={`${denText(String(u.day).slice(0, 10))}${u.source === 'reward' ? ` · ${t('z odměny')}` : u.source === 'navic' ? ` · ${t('za navíc')}` : u.source === 'trest' ? ` · ${t('krácení prémie (trest)')}` : u.source === 'premie' ? ` · ${t('nenároková prémie')}` : ''}`}
                  value={<span className={u.amount > 0 ? 'text-ok-ink' : 'text-bad-ink'}>{sZnamenkem(Number(u.amount), money)}</span>}
                  actions={<Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={t('Smazat zápis')} loading={mazu === u.id} onClick={() => { void smaz(u.id); }} />} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Otevřené příchody
// ---------------------------------------------------------------------------

function DlouhePrichody({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const brana = useBranaVse(['dochazka.zobrazit']);
  const smi = useSmi();
  const data = useDataWidgetu<Dochazka>(brana ? URL_DNES : null, raw => vyberDochazku(raw, t));
  const ted = useTed(brana, 60_000);
  const [ukoncit, setUkoncit] = useState<OtevrenyPrichod | null>(null);
  const seznam = useMemo(() => (data.data ? otevrenePrichody(data.data.roster, ted, pragueToday()) : []), [data.data, ted]);
  // Nikdo napíchnutý déle = vyřízeno: plocha kartu v klidu složí na nízký řádek s fajfkou (V10).
  // Dřív stála prázdná malá karta sama v řádku 136 px vysoká s jednou větou u dna. Jen nad
  // načtenými daty — během načítání nebo po chybě se neví, jestli je co ukončit.
  useVyrizeno(brana && data.data != null && !data.error && seznam.length === 0, t('Nikdo není napíchnutý déle, než měl'));
  if (!brana) return <Widget prazdno={null} />;

  const smiUkoncit = !nahled && smi('dochazka.upravit');
  const n = seznam.length;
  return (
    <>
      <Widget nacteni={data}
        doplnek={velikost !== 'S' && n > 0 ? <Chip tone="wait" size="sm">{n.toLocaleString('cs-CZ')}</Chip> : undefined}
        prazdno={n === 0 ? <p className="t-meta text-pretty">{t('Nikdo není napíchnutý déle, než měl.')}</p> : undefined}>
        {velikost === 'S' ? (
          <Stat label={t('Déle než plán')} value={n.toLocaleString('cs-CZ')} note={t('nejdéle o {delka}', { delka: delkaSlovy(t, seznam[0]?.pres ?? 0) })} />
        ) : (
          <>
            <ul className="list">
              {seznam.slice(0, RADKU_M).map(o => (
                <ListRow key={o.id}
                  lead={<Avatar emoji={o.avatar} size="sm" />}
                  title={o.jmeno}
                  meta={t('příchod {cas} · {smena}', { cas: odKdy(o.od.toISOString()), smena: o.planDo ? t('plán do {cas}', { cas: o.planDo }) : t('bez plánované směny') })}
                  right={<Chip tone="wait" size="sm">+{delkaSlovy(t, o.pres)}</Chip>}
                  actions={smiUkoncit && o.openEntryId ? (
                    <Button variant="secondary" size="sm" onClick={() => setUkoncit(o)} aria-label={t('Ukončit příchod: {jmeno}', { jmeno: o.jmeno })}>{t('Ukončit')}</Button>
                  ) : undefined}
                />
              ))}
            </ul>
            {n > RADKU_M && <p className="t-meta mt-2">{aDalsich(t, n - RADKU_M)}</p>}
          </>
        )}
      </Widget>
      {ukoncit?.openEntryId && (() => { const plan = navrhOdchodu(ukoncit.od, ukoncit.planKonec); return (
        <OknoUkonceni jmeno={ukoncit.jmeno} entryId={ukoncit.openEntryId} navrh={plan.cas} zPlanu={plan.zPlanu}
          onZavrit={() => setUkoncit(null)} onHotovo={() => { setUkoncit(null); obnovDochazku(); }} />
      ); })()}
    </>
  );
}

// ---------------------------------------------------------------------------
// Dnes v podniku
// ---------------------------------------------------------------------------

const RADKU_DNES = 6;

function chipDne(r: RadekDne, t: PrekladFn): ReactNode {
  const od = r.prichod ? dbTimeHM(r.prichod) : null;
  switch (r.stav) {
    case 'na_smene': return <Chip tone="ok" size="sm">{t('od {cas}', { cas: od })}</Chip>;
    case 'bez_planu': return <Chip tone="info" size="sm">{t('od {cas} · bez plánu', { cas: od })}</Chip>;
    case 'nedorazil': return <Chip tone="wait" size="sm">{t('Bez příchodu')}</Chip>;
    case 'ceka': return <Chip tone="muted" size="sm">{t('Začíná {cas}', { cas: r.plan?.slice(0, 5) })}</Chip>;
    case 'odesel': return <Chip tone="muted" size="sm">{t('Odpíchnuto')}</Chip>;
    default: return <Chip tone="muted" size="sm">{t('Po směně')}</Chip>;
  }
}

function DnesVPodniku(_: WidgetProps) {
  const t = useT('widgety');
  const brana = useBrana(['dochazka.zobrazit', 'dochazka.tablet']);
  const smi = useSmi();
  const data = useDataWidgetu<Dochazka>(brana ? URL_DNES : null, raw => vyberDochazku(raw, t));
  const ted = useTed(brana, 60_000);
  // Dnešní záznamy (kdo už odešel) má jen dochazka.zobrazit; tablet ne.
  const seZaznamy = smi('dochazka.zobrazit');
  const radky = useMemo(() => (data.data ? dnesVPodniku(data.data.roster, seZaznamy ? data.data.entries : null, ted, pragueToday()) : []), [data.data, seZaznamy, ted]);
  if (!brana) return <Widget prazdno={null} />;
  const chybi = radky.filter(r => r.stav === 'nedorazil').length;
  return (
    <Widget nacteni={data}
      doplnek={chybi > 0 ? <Chip tone="wait" size="sm">{t('{n} bez příchodu', { n: chybi.toLocaleString('cs-CZ') })}</Chip> : undefined}
      prazdno={radky.length === 0 ? <p className="t-meta">{t('Dnes nemá nikdo naplánovanou směnu.')}</p> : undefined}>
      {/* v4 (V4): chip stavu na ose textu, ne pod avatarem. */}
      <ul className="list">
        {radky.slice(0, RADKU_DNES).map(r => (
          <ListRow key={r.id} lead={<Avatar emoji={r.avatar} size="sm" />} title={r.jmeno}
            meta={r.plan ? t('směna {cas}', { cas: r.plan }) : t('bez plánované směny')} right={chipDne(r, t)} />
        ))}
      </ul>
      {radky.length > RADKU_DNES && <p className="t-meta mt-2">{aDalsich(t, radky.length - RADKU_DNES)}</p>}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Moje docházka (kolo 7)
// ---------------------------------------------------------------------------

/** Ve střední velikosti nejnovějších pět dní (DESIGN „Ořezané seznamy"), velká ukáže celý měsíc. */
const DNU_M = 5;

/**
 * Vlastní příchody a odchody po dnech za tento nebo minulý měsíc — barista si před výplatou
 * zkontroluje, který den přišel a odešel, kde má zapomenutý odchod a co mu vedení opravilo
 * („ručně"). Stejná adresa i výpočet jako Odpracováno a Můj výdělek (useMujMesic,
 * lib/dochazkaPrehled.radkyMojeDochazky), takže součet v hlavičce sedí s Odpracováno.
 * Plán u minulých dnů záměrně není: API ho zaměstnanci posílá jen pro dnešek (Píchačky).
 */
function MojeDochazka({ velikost, nastaveni }: WidgetProps<{ mesic?: VolbaMesice }>) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const volba: VolbaMesice = nastaveni.mesic === 'minuly' ? 'minuly' : 'tento';
  const { ja, data, bezZaznamu, nazevMesice, mesic, vlastni, ted } = useMujMesic(true, volba);
  const md = useMemo(() => radkyMojeDochazky(vlastni, ja.id ?? -1, mesic, ted), [vlastni, ja.id, mesic, ted]);
  const { zobrazene, dalsich } = orizniSeznam(md.dny, velikost === 'L' ? Infinity : DNU_M);
  const chipDne = (d: (typeof md.dny)[number]) => d.zapomenuty ? <Chip tone="wait" size="sm">{t('Zapomenutý odchod?')}</Chip>
    : d.dlouhy ? <Chip tone="wait" size="sm">{t('Nad 24 h')}</Chip>
    : d.rucne ? <Chip tone="muted" size="sm">{t('ručně')}</Chip> : null;
  // Chipy na počítači ve sloupci pevné šířky (aside) u všech řádků, ať hodiny drží svislici; pod lg vpravo v ocase.
  const sChipy = zobrazene.some(d => chipDne(d) != null);
  const prazdno = bezZaznamu ? <p className="t-meta text-pretty">{t('S touhle rolí se hodiny z píchaček nedají spočítat.')}</p>
    : md.dny.length === 0 ? <p className="t-meta text-pretty">{volba === 'minuly' ? t('Minulý měsíc nic neodpíchnuto.') : t('Tento měsíc zatím nic neodpíchnuto.')}</p>
    : undefined;
  return (
    <Widget nacteni={ja.stav ?? data} prazdno={prazdno}
      // Součet měsíce vedle titulku; název měsíce jen u minulého (tento je zřejmý) — na 390 px by jinak titulek zalomil.
      doplnek={md.dny.length > 0 ? <Chip tone="muted" size="sm">{volba === 'minuly' ? `${nazevMesice} · ${hodinyMinuty(md.ms)}` : hodinyMinuty(md.ms)}</Chip> : undefined}>
      <ul className="list">
        {zobrazene.map(d => (
          <ListRow key={d.den}
            title={fmtDatum(d.den, { jazyk, styl: 'denKratce' })}
            meta={`${d.useky.map(u => `${dbTimeHM(u.od)} – ${u.do ? dbTimeHM(u.do) : '…'}`).join(', ')}${d.pauzyMs > 0 ? ` · ${t('pauza {delka}', { delka: hodinyMinuty(d.pauzyMs) })}` : ''}`}
            detail={d.poznamky.length ? d.poznamky.join(' · ') : undefined}
            value={d.zapomenuty && d.ms === 0 ? undefined : d.bezi ? t('běží {cas}', { cas: hodinyMinuty(d.ms) }) : hodinyMinuty(d.ms)}
            aside={sChipy ? chipDne(d) ?? '' : undefined}
            right={sChipy ? <span className="lg:hidden">{chipDne(d)}</span> : undefined} />
        ))}
      </ul>
      {dalsich > 0 && <p className="t-meta mt-2">{t('…a {n, plural, one {# další den} few {# další dny} other {# dalších dní}}', { n: dalsich })}</p>}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Výplaty (kolo 8, R8-1): co ví jen server — z kasy, vyplaceno, zámky, smlouvy, pravidla
// ---------------------------------------------------------------------------

interface PravidlaPayrollu { dysko: PravidlaDyska; priplatky: PravidlaPriplatku; showTipsToStaff: boolean; hraniceOdvodu: number | null }
interface Payroll { od: string; do: string; lide: PayrollClovek[]; zamky: ZamekObdobi[]; vidiMzdy: boolean; payDailyCash: boolean; pravidla: PravidlaPayrollu }
interface PayrollJa {
  od: string; do: string;
  ja: { zKasy: number; zKasyPocet: number; uzaverky: { id: number; den: string; castka: number; kdo?: string | null }[]; vyplaty: Vyplata[]; spropitne: number | null; spropitnePoDnech: { den: string; castka: number; mojeMs: number; smenaMs: number }[] };
  zamky: ZamekObdobi[];
  pravidla: { priplatky: PravidlaPriplatku; showTipsToStaff: boolean };
}

const urlPayroll = (od: string, doD: string) => `/api/payroll?od=${od}&do=${doD}`;
const urlPayrollJa = (od: string, doD: string) => `/api/payroll?od=${od}&do=${doD}&ja=1`;
/** Adresy výplat, které si někdo v téhle relaci vyžádal — po zápisu (vyplaceno, zámek, pravidla) se obnoví všechny. */
const POUZITE_PAYROLL = new Set<string>();
function obnovVyplaty(): void {
  for (const u of POUZITE_PAYROLL) obnovDataWidgetu(u);
  obnovDataWidgetu('/api/closings');
}

function vyberPayroll(raw: any, t: PrekladFn): Payroll {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.lide) || !raw.pravidla) throw new Error(t('Výplaty přišly v nečekaném tvaru.'));
  return {
    od: String(raw.od), do: String(raw.do), lide: raw.lide, zamky: Array.isArray(raw.zamky) ? raw.zamky : [], vidiMzdy: raw.vidiMzdy === true, payDailyCash: raw.payDailyCash === true,
    pravidla: { dysko: normalizujPravidlaDyska(raw.pravidla.dysko), priplatky: normalizujPravidlaPriplatku(raw.pravidla.priplatky), showTipsToStaff: raw.pravidla.showTipsToStaff === true, hraniceOdvodu: Number(raw.pravidla.hraniceOdvodu) > 0 ? Number(raw.pravidla.hraniceOdvodu) : null },
  };
}

function vyberPayrollJa(raw: any, t: PrekladFn): PayrollJa {
  if (!raw || typeof raw !== 'object' || !raw.ja || typeof raw.ja !== 'object') throw new Error(t('Výplaty přišly v nečekaném tvaru.'));
  const j = raw.ja;
  return {
    od: String(raw.od), do: String(raw.do),
    ja: { zKasy: Number(j.zKasy) || 0, zKasyPocet: Number(j.zKasyPocet) || 0, uzaverky: Array.isArray(j.uzaverky) ? j.uzaverky : [], vyplaty: Array.isArray(j.vyplaty) ? j.vyplaty : [], spropitne: j.spropitne == null ? null : Number(j.spropitne) || 0, spropitnePoDnech: Array.isArray(j.spropitnePoDnech) ? j.spropitnePoDnech : [] },
    zamky: Array.isArray(raw.zamky) ? raw.zamky : [],
    pravidla: { priplatky: normalizujPravidlaPriplatku(raw.pravidla?.priplatky), showTipsToStaff: raw.pravidla?.showTipsToStaff === true },
  };
}

/** Rozpad příplatků slovy: „So/Ne 14 h · noc 3 h · svátek 8 h". */
function priplatkySlovy(t: PrekladFn, loc: string, ms: { vikend: number; noc: number; svatek: number }): string {
  const h = (x: number) => `${(Math.round(x / 360_000) / 10).toLocaleString(loc)} h`;
  return [ms.vikend > 0 ? t('So/Ne {h}', { h: h(ms.vikend) }) : null, ms.noc > 0 ? t('noc {h}', { h: h(ms.noc) }) : null, ms.svatek > 0 ? t('svátek {h}', { h: h(ms.svatek) }) : null].filter(Boolean).join(' · ');
}

/** „Vyplaceno 15. 10." / „Čeká" / nic — stav řádku listiny chipem. */
function ChipStavu({ r, jazyk }: { r: RadekVyplaty; jazyk: Jazyk }) {
  const t = useT('widgety');
  if (r.stav === 'vyplaceno') return <Chip tone="ok" size="sm">{t('Vyplaceno {datum}', { datum: fmtDatum(r.vyplaty[0]?.paidAt ?? '', { jazyk, styl: 'kratce' }) })}</Chip>;
  if (r.stav === 'ceka') return <Chip tone="wait" size="sm">{t('Čeká')}</Chip>;
  return null;
}

function ChipSmlouvy({ r, hranice }: { r: RadekVyplaty; hranice: number | null }) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  if (!r.smlouva) return null;
  const limit = stavLimituHodin(r.hodinyLetosMs, r.limitHodin);
  const nad = nadHraniciOdvodu(r.hruba, hranice, r.smlouva);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Chip tone={limit ? limit.ton : 'muted'} size="sm">{nazevSmlouvy(r.smlouva)}{limit ? ` · ${t('letos {h} / {limit} h', { h: limit.odpracovanoH.toLocaleString(jazyk), limit: limit.limitH })}` : ''}</Chip>
      {nad && <Chip tone="wait" size="sm">{t('nad hranicí odvodů')}</Chip>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Výplatní listina
// ---------------------------------------------------------------------------

const SLOUPCE = ['smeny', 'hodiny', 'plan', 'sazba', 'mzda', 'priplatky', 'spropitne', 'upravy', 'zKasy', 'doplatit', 'smlouva', 'stav'] as const;
type Sloupec = (typeof SLOUPCE)[number];
/** Sloupce, které se dají schovat tlačítkem „Sloupce" (Člověk, Doplatit a Stav zůstávají vždy). */
const VOLITELNE: readonly Sloupec[] = ['smeny', 'hodiny', 'plan', 'sazba', 'mzda', 'priplatky', 'spropitne', 'upravy', 'zKasy', 'smlouva'];
/** Plán, sazba a smlouva jsou ve výchozím stavu schované: na 1280 px má karta ~920 px a čísla se nesmí zkracovat. */
const VYCHOZI_SKRYTE = 'plan,sazba,smlouva';
/** Šířky sloupců v % šířky tabulky (table-fixed): součet viditelných výchozích ≈ 100, zapnuté navíc se úměrně stlačí. */
const SIRKA: Record<Sloupec, number> = { smeny: 6, hodiny: 8, plan: 8, sazba: 8, mzda: 9, priplatky: 8, spropitne: 8, upravy: 8, zKasy: 9, doplatit: 10, smlouva: 13, stav: 14 };

/**
 * Výplatní listina (kolo 8, R8-1; vzor 7shifts „Worked Hours & Wages", Lightspeed „Labor report"): řádek na člověka
 * — směny, hodiny, plán, sazba, mzda, příplatky, dýško, prémie a srážky, co už odešlo z kasy, kolik doplatit a stav.
 * Na počítači tabulka (řazení klikem na hlavičku, řádek Celkem, „Sloupce" skryje nepotřebné), na telefonu karta
 * na člověka s velkým „Doplatit" a oknem zdola s rozpadem — nikdy vodorovný posuv. „CSV pro účetní" = jeden řádek
 * na člověka. Hodiny, mzda a dýško se počítají stejně jako v Souhrnu hodin (lib/dochazkaPrehled); z kasy,
 * vyplaceno, smlouvy a pravidla dodává GET /api/payroll.
 */
function VyplatniListina({ nahled }: WidgetProps) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const brana = useBranaVse(['dochazka.zobrazit']);
  const smi = useSmi();
  const money = useMoney();
  const symbol = useSymbol();
  const { instance } = useWidget();
  const { pro } = usePlan();
  const [upgrade, setUpgrade] = useState(false);
  const vidiMzdy = smi('finance.mzdy');
  const vidiDyska = smi('finance.trzby') && smi('uzaverky.zobrazit_vse');
  const smiExport = smi('dochazka.exportovat');
  const smiZapis = !nahled && smi('finance.sazby_upravit');
  const dnes = pragueToday();
  // Výplata je za kalendářní měsíc (7shifts „pay period"), proto výchozí „Tento měsíc"; období si člověk přepne tlačítkem.
  const { obdobi, nastav } = useObdobi(`dochazka_vyplaty-${instance}`, obdobiZPresetu('mesic', dnes));
  const nejdrive = dayPlus(dnes, -179);
  const rHrube = platneRozmezi(obdobi, dnes);
  const r = { od: rHrube.od < nejdrive ? nejdrive : rHrube.od, do: rHrube.do > dnes ? dnes : rHrube.do };
  const dniNacist = pocetDni(r.od, dnes);
  const data = useDataWidgetu<Dochazka>(brana ? urlDni(dniNacist) : null, raw => vyberDochazku(raw, t));
  const uzaverky = useDataWidgetu<UzaverkaSpropitne[]>(brana && vidiDyska ? '/api/closings' : null, raw => vyberUzaverky(raw, t) as UzaverkaSpropitne[]);
  const urlP = urlPayroll(r.od, r.do);
  POUZITE_PAYROLL.add(urlP);
  const payroll = useDataWidgetu<Payroll>(brana ? urlP : null, raw => vyberPayroll(raw, t));
  const ted = useTed(!!data.data?.entries.some(e => !e.clockOut), 60_000);
  const [razeni, setRazeni] = useState<{ klic: RazeniListiny; sestupne: boolean }>({ klic: 'doplatit', sestupne: true });
  const [skryteRaw, setSkryte] = useUlozeno<string>('vyplatni-listina-skryte', VYCHOZI_SKRYTE);
  const skryte = useMemo(() => new Set(skryteRaw.split(',').filter(Boolean) as Sloupec[]), [skryteRaw]);
  const vyber = useSelection<string>();
  const [okno, setOkno] = useState<
    | { druh: 'detail'; id: string } | { druh: 'vyplaceno'; ids: string[] } | { druh: 'pravidla' } | { druh: 'smlouva'; id: string } | { druh: 'uzavrit' } | null
  >(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pise, setPise] = useState(false);

  const entriesObdobi = useMemo(() => (data.data ? zaznamyVRozmezi(data.data.entries, r.od, r.do, obdobi.dnyTydne) : []), [data.data, r.od, r.do, obdobi.dnyTydne]);
  const pravidla = payroll.data?.pravidla ?? null;
  const pozice = useMemo(() => new Map((payroll.data?.lide ?? []).filter(l => l.jobTitle).map(l => [String(l.id), String(l.jobTitle)])), [payroll.data]);
  const dyska = useMemo(() => (vidiDyska && uzaverky.data
    ? spropitneZaObdobi(uzaverky.data, entriesObdobi, ted, r.od, r.do, obdobi.dnyTydne, pravidla ? { pravidla: pravidla.dysko, pozice } : null) : null),
    [vidiDyska, uzaverky.data, entriesObdobi, ted, r.od, r.do, obdobi.dnyTydne, pravidla, pozice]);
  const upravyObdobi = useMemo(() => (data.data && vidiMzdy ? upravyVRozmezi(data.data.adjustments, r.od, r.do, obdobi.dnyTydne) : []), [data.data, vidiMzdy, r.od, r.do, obdobi.dnyTydne]);
  const sazby = useMemo(() => (data.data && vidiMzdy ? sazbyZRosteru(data.data.roster as ClenRosteruB2[]) : new Map<string, number>()), [data.data, vidiMzdy]);
  const sPriplatky = !!pravidla && !priplatkyVypnute(pravidla.priplatky);
  const radky = useMemo(() => {
    if (!data.data) return [];
    const lide = new Map(data.data.roster.map(m => [String(m.id), { jmeno: m.name ?? '', avatar: m.avatar ?? null }]));
    const souhrn = souhrnHodin(entriesObdobi, ted, sazby, { spropitne: dyska && !dyska.skryto ? dyska.poLidech : null, upravy: upravyPoLidech(upravyObdobi), lide, plan: true, priplatky: sPriplatky ? pravidla!.priplatky : null });
    return seradListinu(vyplatniListina(souhrn, payroll.data?.lide ?? []), razeni.klic, razeni.sestupne);
  }, [data.data, entriesObdobi, ted, sazby, dyska, upravyObdobi, payroll.data, razeni, sPriplatky, pravidla]);
  const soucet = useMemo(() => soucetListiny(radky), [radky]);
  const zamek = payroll.data ? obdobiZamceno(payroll.data.zamky, r.od, r.do) : null;
  const sDyskem = !!dyska && !dyska.skryto;
  const sSmlouvami = radky.some(x => x.smlouva);
  const loc = jazyk;
  const hodinyText = (ms: number) => hodinyMinuty(ms);
  const datum = (d: string) => fmtDatum(d, { jazyk, styl: 'kratce' });
  if (!brana) return <Widget prazdno={null} />;

  const sloupecVidet = (s: Sloupec): boolean => {
    if (skryte.has(s)) return false;
    if (['sazba', 'mzda', 'upravy', 'zKasy', 'doplatit', 'stav'].includes(s)) return vidiMzdy;
    if (s === 'priplatky') return vidiMzdy && sPriplatky;
    if (s === 'spropitne') return sDyskem;
    if (s === 'smlouva') return sSmlouvami || smiZapis;
    return true;
  };
  const nazvy: Record<Sloupec, string> = {
    smeny: t('Směny'), hodiny: t('Hodiny', undefined, 'widgety'), plan: t('Plán'), sazba: t('Sazba'), mzda: t('Mzda'), priplatky: t('Příplatky'), spropitne: t('Dýško'),
    upravy: t('Prémie / srážky'), zKasy: t('Z kasy'), doplatit: t('Doplatit'), smlouva: t('Smlouva'), stav: t('Stav'),
  };
  /** Krátké hlavičky do tabulky (plný název je v `title` a v nabídce Sloupce). */
  const kratce: Partial<Record<Sloupec, string>> = { upravy: t('Prémie'), priplatky: t('Příplatky') };
  const RAZENI_SLOUPCE: Partial<Record<Sloupec, RazeniListiny>> = { smeny: 'pocet', hodiny: 'hodiny', mzda: 'mzda', spropitne: 'spropitne', zKasy: 'zKasy', doplatit: 'doplatit' };
  const prepniRazeni = (k: RazeniListiny) => setRazeni(x => ({ klic: k, sestupne: x.klic === k ? !x.sestupne : k !== 'jmeno' }));
  const prepniSloupec = (s: Sloupec) => { const n = new Set(skryte); if (n.has(s)) n.delete(s); else n.add(s); setSkryte([...n].join(',')); };

  const csv = () => {
    if (!pro) { setUpgrade(true); return; }
    const radkyCsv = csvVyplatniListiny(radky, { od: r.od, do: r.do, symbol, sazby, priplatky: sPriplatky, spropitne: sDyskem, smlouvy: sSmlouvami });
    void ulozSoubor(`vyplaty-${r.od}_${r.do}.csv`, csvText(radkyCsv), 'text/csv;charset=utf-8');
  };
  const zamkni = async (odemknout: boolean) => {
    setPise(true); setChyba(null);
    try {
      if (odemknout && zamek) await fetch(`/api/payroll/locks?id=${zamek.id}`, { method: 'DELETE' }).then(okJson);
      else await fetch('/api/payroll/locks', { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify({ od: r.od, do: r.do }) }).then(okJson);
      obnovVyplaty(); setOkno(null);
    } catch (e) { setChyba(apiMessage(e, t('Období se nepodařilo uzavřít.'))); } finally { setPise(false); }
  };

  const akce: MenuItem[] = [
    ...(smiZapis ? [{ label: t('Pravidla výplat…'), icon: 'settings', onClick: () => setOkno({ druh: 'pravidla' }) }] : []),
    ...(smiZapis ? [zamek
      ? { label: t('Otevřít období'), icon: 'key', hint: t('Zamčené od {od} do {do}', { od: datum(zamek.od), do: datum(zamek.do) }), onClick: () => { void zamkni(true); } }
      : { label: t('Uzavřít období…'), icon: 'lock', hint: t('Záznamy za období už se nemají měnit.'), onClick: () => setOkno({ druh: 'uzavrit' }) }] : []),
    ...(smiZapis && radky.length > 1 && !vyber.selecting ? [{ label: t('Vybrat víc'), icon: 'check', hint: t('Označit vyplacené hromadně'), onClick: vyber.start }] : []),
    ...(smiExport && radky.length > 0 ? [{ label: t('CSV pro účetní'), icon: 'download', onClick: csv }] : []),
  ];
  const vybrane = radky.filter(x => vyber.has(x.id) && x.doplatit > 0);
  const radekPodle = (id: string) => radky.find(x => x.id === id);
  // Čísla v tabulce: 12 px, bez zalomení; šířky sloupců jsou spočítané tak, aby se „−2 400 Kč" vešlo bez „…" (DESIGN: číslo se nezkracuje).
  const cisloBunky = 'px-1.5 py-2 text-right tabular-nums whitespace-nowrap text-[12px]';

  return (
    <>
      <Widget nacteni={[data, payroll, uzaverky]}
        doplnek={zamek ? <Chip tone="ok" size="sm" icon="lock">{t('Uzavřeno')}</Chip> : undefined}
        akce={akce.length ? akce : undefined}
        bezZkraceni
        prazdno={radky.length === 0 ? <p className="t-meta">{t('V období nikdo nic neodpíchl.')}</p> : undefined}>
        <div className="space-y-4">
          <ObdobiLista value={obdobi} onChange={nastav} volby={['tyden', '7_dni', '30_dni', 'mesic', 'minuly_mesic', '90_dni']} hrubost={false} />
          <StatRow podleKarty>
            <Stat label={t('Odpracováno')} value={hodinyText(soucet.ms)} note={t('{n, plural, one {# směna} few {# směny} other {# směn}}', { n: soucet.pocet })} />
            {vidiMzdy && (
              <Stat label={t('Mzdy')} value={money(soucet.mzda + soucet.priplatky + soucet.upravy)}
                note={[soucet.bezSazby > 0 ? t('bez sazby: {n, plural, one {# člověk} few {# lidé} other {# lidí}}', { n: soucet.bezSazby }) : null, soucet.priplatky > 0 ? t('vč. příplatků {castka}', { castka: money(soucet.priplatky) }) : null, soucet.upravy !== 0 ? t('vč. prémií a srážek {castka}', { castka: sZnamenkem(soucet.upravy, money) }) : null].filter(Boolean).join(' · ') || t('hodiny × sazba')} />
            )}
            {sDyskem && <Stat label={t('Spropitné')} value={money(Math.round(soucet.spropitne))} note={t('z uzávěrek')} />}
            {vidiMzdy && (soucet.zKasy > 0 || payroll.data?.payDailyCash) && (
              <Stat label={t('Z kasy')} value={`−${money(soucet.zKasy)}`} note={t('už vyplaceno · {n}× v uzávěrkách', { n: radky.reduce((a, x) => a + x.zKasyPocet, 0).toLocaleString(loc) })} />
            )}
            {vidiMzdy && <Stat label={t('Doplatit')} value={money(soucet.doplatit)} tone="ok" note={soucet.vyplaceno > 0 ? t('vyplaceno {castka}', { castka: money(soucet.vyplaceno) }) : t('po odečtení z kasy')} />}
          </StatRow>
          {dyska?.skryto && <p className="t-meta">{t('Dýško nejde rozdělit — tržby nevidíš celé.')}</p>}
          {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Na telefonu karty: řadit jde přepínačem, hlavička tabulky tam není. */}
            <Segmented size="sm" ariaLabel={t('Řadit listinu')} className="lg:hidden" value={razeni.klic === 'jmeno' ? 'jmeno' : razeni.klic === 'hodiny' ? 'hodiny' : 'doplatit'}
              onChange={v => setRazeni({ klic: v as RazeniListiny, sestupne: v !== 'jmeno' })}
              options={[...(vidiMzdy ? [{ id: 'doplatit', label: t('Doplatit') }] : []), { id: 'hodiny', label: t('Hodiny', undefined, 'widgety') }, { id: 'jmeno', label: t('Jméno') }]} />
            <div className="hidden lg:flex items-center gap-1.5">
              <span className="t-meta" aria-hidden>{t('Sloupce')}</span>
              <Menu size="sm" icon="grid" label={t('Sloupce')} items={VOLITELNE.filter(s => sloupecVidet(s) || skryte.has(s)).map(s => ({ label: `${skryte.has(s) ? '○' : '●'} ${nazvy[s]}`, onClick: () => prepniSloupec(s) }))} />
            </div>
          </div>

          {/* Počítač: tabulka s pevnými sloupci (nic nejede do strany), řazení klikem na hlavičku, Celkem dole. */}
          <div className="hidden lg:block rounded-2xl border border-black/[0.08] overflow-hidden">
            <table className="w-full table-fixed border-collapse text-[13px]">
              <colgroup>
                {vyber.selecting && <col style={{ width: '2.5rem' }} />}
                <col style={{ width: '20%' }} />
                {SLOUPCE.filter(sloupecVidet).map(s => <col key={s} style={{ width: `${SIRKA[s]}%` }} />)}
              </colgroup>
              <thead>
                <tr className="text-black/45 bg-black/[0.03]">
                  {vyber.selecting && <th scope="col" className="px-2 py-2"><span className="sr-only">{t('Vybrat')}</span></th>}
                  <th scope="col" className="text-left font-medium px-3 py-2 truncate" aria-sort={razeni.klic === 'jmeno' ? (razeni.sestupne ? 'descending' : 'ascending') : 'none'}>
                    <button type="button" className="hover:underline underline-offset-2 truncate max-w-full" onClick={() => prepniRazeni('jmeno')}>{t('Člověk')}{razeni.klic === 'jmeno' ? (razeni.sestupne ? ' ↓' : ' ↑') : ''}</button>
                  </th>
                  {SLOUPCE.filter(sloupecVidet).map(s => {
                    const k = RAZENI_SLOUPCE[s];
                    const aktivni = k && razeni.klic === k;
                    return (
                      <th key={s} scope="col" title={nazvy[s]} className={`font-medium px-1.5 py-2 truncate text-[12px] ${s === 'smlouva' || s === 'stav' ? 'text-left' : 'text-right'}`} aria-sort={aktivni ? (razeni.sestupne ? 'descending' : 'ascending') : k ? 'none' : undefined}>
                        {k ? <button type="button" className="hover:underline underline-offset-2 truncate max-w-full" onClick={() => prepniRazeni(k)}>{kratce[s] ?? nazvy[s]}{aktivni ? (razeni.sestupne ? ' ↓' : ' ↑') : ''}</button> : kratce[s] ?? nazvy[s]}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {radky.map(x => (
                  <tr key={x.id} className="border-t border-black/[0.06]" data-radek-listiny={x.id}>
                    {vyber.selecting && <td className="px-2 py-1.5"><SelectBox checked={vyber.has(x.id)} onChange={() => vyber.toggle(x.id)} label={t('Vybrat: {jmeno}', { jmeno: x.jmeno })} /></td>}
                    <th scope="row" className="text-left font-medium px-3 py-1.5 min-w-0">
                      <button type="button" onClick={() => setOkno({ druh: 'detail', id: x.id })} className="flex items-center gap-2 min-w-0 max-w-full rounded-sm text-left hover:underline decoration-black/25 underline-offset-2" aria-label={t('Rozpad výplaty: {jmeno}', { jmeno: x.jmeno })}>
                        <Avatar emoji={x.avatar} name={x.jmeno} size="xs" ring={false} />
                        <span className="min-w-0">
                          <span className="block truncate text-[#16181A]">{x.jmeno}</span>
                          {x.pozice && <span className="block truncate text-[11px] text-black/45 font-normal">{x.pozice}</span>}
                        </span>
                      </button>
                    </th>
                    {sloupecVidet('smeny') && <td className={cisloBunky}>{x.pocet.toLocaleString(loc)}{x.vynechano > 0 ? <span className="text-wait-ink"> ({x.vynechano}×)</span> : ''}</td>}
                    {sloupecVidet('hodiny') && <td className={cisloBunky} title={`${hodinyText(x.ms)}${x.bezi ? ` · ${t('právě běží')}` : ''}`}>{hMM(x.ms)}</td>}
                    {sloupecVidet('plan') && <td className={cisloBunky}>{x.planMs > 0 ? hMM(x.planMs) : '—'}</td>}
                    {sloupecVidet('sazba') && <td className={cisloBunky}>{sazby.get(x.id) ? money(sazby.get(x.id)!) : '—'}</td>}
                    {sloupecVidet('mzda') && <td className={cisloBunky}>{x.mzda != null ? money(x.mzda) : '—'}</td>}
                    {sloupecVidet('priplatky') && <td className={cisloBunky} title={priplatkySlovy(t, loc, x.priplatkyMs) || undefined}>{x.priplatky > 0 ? `+${money(x.priplatky)}` : '—'}</td>}
                    {sloupecVidet('spropitne') && <td className={cisloBunky}>{x.spropitne ? money(Math.round(x.spropitne)) : '—'}</td>}
                    {sloupecVidet('upravy') && <td className={`${cisloBunky} ${x.upravy > 0 ? 'text-ok-ink' : x.upravy < 0 ? 'text-bad-ink' : ''}`}>{x.upravy ? sZnamenkem(x.upravy, money) : '—'}</td>}
                    {sloupecVidet('zKasy') && <td className={cisloBunky}>{x.zKasy > 0 ? `−${money(x.zKasy)}` : '—'}</td>}
                    {sloupecVidet('doplatit') && <td className={`${cisloBunky} font-bold text-[#16181A]`}>{money(x.doplatit)}</td>}
                    {sloupecVidet('smlouva') && <td className="px-1.5 py-1.5 text-left">
                      {smiZapis ? <button type="button" className="rounded-sm text-left" onClick={() => setOkno({ druh: 'smlouva', id: x.id })} aria-label={t('Smlouva: {jmeno}', { jmeno: x.jmeno })}>{x.smlouva ? <ChipSmlouvy r={x} hranice={pravidla?.hraniceOdvodu ?? null} /> : <Chip tone="muted" size="sm">{t('nastavit')}</Chip>}</button> : <ChipSmlouvy r={x} hranice={pravidla?.hraniceOdvodu ?? null} />}
                    </td>}
                    {sloupecVidet('stav') && <td className="px-1.5 py-1.5 text-left">
                      {/* v4 (P2): chip stavu a „Vyplaceno…" pod sebou přes šířku buňky — dřív se tlačítko
                          zalomilo samo na řádek obsahovou šířkou (skladba: „osamělé", audit 2026-10). */}
                      <span className="flex flex-col items-stretch gap-1.5">
                        <span className="self-start empty:hidden"><ChipStavu r={x} jazyk={jazyk} /></span>
                        {smiZapis && !vyber.selecting && x.doplatit > 0 && <Button variant="secondary" size="sm" className="w-full" onClick={() => setOkno({ druh: 'vyplaceno', ids: [x.id] })} aria-label={t('Vyplaceno: {jmeno}', { jmeno: x.jmeno })}>{t('Vyplaceno…')}</Button>}
                      </span>
                    </td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-black/[0.12] font-semibold text-[#16181A]">
                  {vyber.selecting && <td />}
                  <td className="px-3 py-2">{t('Celkem')}</td>
                  {sloupecVidet('smeny') && <td className={cisloBunky}>{soucet.pocet.toLocaleString(loc)}</td>}
                  {sloupecVidet('hodiny') && <td className={cisloBunky} title={hodinyText(soucet.ms)}>{hMM(soucet.ms)}</td>}
                  {sloupecVidet('plan') && <td className={cisloBunky}>{soucet.planMs > 0 ? hMM(soucet.planMs) : '—'}</td>}
                  {sloupecVidet('sazba') && <td />}
                  {sloupecVidet('mzda') && <td className={cisloBunky}>{money(soucet.mzda)}</td>}
                  {sloupecVidet('priplatky') && <td className={cisloBunky}>{soucet.priplatky > 0 ? `+${money(soucet.priplatky)}` : '—'}</td>}
                  {sloupecVidet('spropitne') && <td className={cisloBunky}>{money(Math.round(soucet.spropitne))}</td>}
                  {sloupecVidet('upravy') && <td className={cisloBunky}>{soucet.upravy ? sZnamenkem(soucet.upravy, money) : '—'}</td>}
                  {sloupecVidet('zKasy') && <td className={cisloBunky}>{soucet.zKasy > 0 ? `−${money(soucet.zKasy)}` : '—'}</td>}
                  {sloupecVidet('doplatit') && <td className={cisloBunky}>{money(soucet.doplatit)}</td>}
                  {sloupecVidet('smlouva') && <td />}
                  {sloupecVidet('stav') && <td className="px-1.5 py-2 text-[12px] font-normal text-black/55">{soucet.vyplaceno > 0 ? t('vyplaceno {castka}', { castka: money(soucet.vyplaceno) }) : ''}</td>}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Telefon a tablet: karta na člověka — jméno, velké Doplatit, pod tím dva řádky čísel; klepnutí otevře rozpad zdola. */}
          <ul className="list lg:hidden">
            {radky.map(x => {
              const radek1 = [t('{n, plural, one {# směna} few {# směny} other {# směn}}', { n: x.pocet }), hodinyText(x.ms), x.smlouva ? nazevSmlouvy(x.smlouva) : null].filter(Boolean).join(' · ');
              const radek2 = vidiMzdy ? [x.mzda != null ? t('mzda {castka}', { castka: money(x.mzda + x.priplatky) }) : null, x.spropitne ? t('dýško {castka}', { castka: money(Math.round(x.spropitne)) }) : null, x.upravy ? sZnamenkem(x.upravy, money) : null, x.zKasy > 0 ? t('z kasy −{castka}', { castka: money(x.zKasy) }) : null].filter(Boolean).join(' · ') : undefined;
              const spolecne = {
                lead: vyber.selecting ? <SelectBox checked={vyber.has(x.id)} onChange={() => vyber.toggle(x.id)} label={t('Vybrat: {jmeno}', { jmeno: x.jmeno })} /> : <Avatar emoji={x.avatar} name={x.jmeno} size="sm" />,
                title: x.jmeno, meta: radek1, detail: radek2,
                value: vidiMzdy ? money(x.doplatit) : hodinyText(x.ms),
                valueMeta: vidiMzdy ? t('doplatit') : undefined,
                right: <ChipStavu r={x} jazyk={jazyk} />,
              };
              return vyber.selecting
                ? <ListRow key={x.id} {...spolecne} />
                : <li key={x.id}><ListRow as="div" {...spolecne} onClick={() => setOkno({ druh: 'detail', id: x.id })} /></li>;
            })}
            <ListRow title={<span className="font-semibold">{t('Celkem')}</span>} meta={`${t('{n, plural, one {# směna} few {# směny} other {# směn}}', { n: soucet.pocet })} · ${hodinyText(soucet.ms)}`}
              value={vidiMzdy ? money(soucet.doplatit) : undefined} valueMeta={vidiMzdy && soucet.zKasy > 0 ? t('z kasy −{castka}', { castka: money(soucet.zKasy) }) : undefined} />
          </ul>
        </div>
      </Widget>

      {vyber.selecting && (
        <BulkBar count={vyber.count} totalLabel={t('Vybrat vše ({n})', { n: radky.length })} onSelectAll={() => vyber.selectAll(radky.map(x => x.id))} onExit={vyber.exit}
          actions={[{ label: t('Označit jako vyplacené'), primary: true, icon: 'check', disabled: vybrane.length === 0, onClick: () => setOkno({ druh: 'vyplaceno', ids: vybrane.map(x => x.id) }) }]}
          note={vyber.count > 0 && vybrane.length < vyber.count ? t('{n, plural, one {# vybraný nemá co doplatit} few {# vybraní nemají co doplatit} other {# vybraných nemá co doplatit}}', { n: vyber.count - vybrane.length }) : undefined} />
      )}
      {okno?.druh === 'detail' && radekPodle(okno.id) && (
        <DetailVyplatyOkno r={radekPodle(okno.id)!} od={r.od} do={r.do} sazba={sazby.get(okno.id) ?? null} vidiMzdy={vidiMzdy} hranice={pravidla?.hraniceOdvodu ?? null}
          smiZapis={smiZapis} onVyplaceno={() => setOkno({ druh: 'vyplaceno', ids: [okno.id] })} onSmlouva={() => setOkno({ druh: 'smlouva', id: okno.id })} onClose={() => setOkno(null)} />
      )}
      {okno?.druh === 'vyplaceno' && (
        <VyplacenoOkno lide={okno.ids.map(radekPodle).filter((x): x is RadekVyplaty => !!x)} od={r.od} do={r.do}
          onClose={() => setOkno(null)} onHotovo={() => { setOkno(null); vyber.exit(); obnovVyplaty(); }} />
      )}
      {okno?.druh === 'pravidla' && payroll.data && (
        <PravidlaVyplatOkno pravidla={payroll.data.pravidla} pozice={[...new Set(radky.map(x => x.pozice).filter((p): p is string => !!p))]}
          nahled={{ uzaverky: uzaverky.data ?? [], entries: entriesObdobi, ted, od: r.od, do: r.do, pozice, jmena: new Map(radky.map(x => [x.id, x.jmeno])) }}
          onClose={() => setOkno(null)} onHotovo={() => { setOkno(null); obnovVyplaty(); }} />
      )}
      {okno?.druh === 'smlouva' && radekPodle(okno.id) && (
        <SmlouvaOkno r={radekPodle(okno.id)!} onClose={() => setOkno(null)} onHotovo={() => { setOkno(null); obnovVyplaty(); }} />
      )}
      {okno?.druh === 'uzavrit' && (
        <Modal open onClose={() => setOkno(null)} size="sm" title={t('Uzavřít období')} subtitle={`${datum(r.od)} – ${datum(r.do)}`}
          footer={<>
            <Button variant="secondary" onClick={() => setOkno(null)}>{t('Zrušit')}</Button>
            <Button variant="primary" icon="lock" loading={pise} onClick={() => { void zamkni(false); }}>{t('Uzavřít období')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{t('Záznamy docházky za tohle období už se nemají měnit — kdo by je v Docházce upravoval, uvidí zámek. Odemknout jde kdykoli z nabídky listiny.')}</p>
          {chyba && <p className="note note-danger text-sm mt-3" role="alert">{chyba}</p>}
        </Modal>
      )}
      {upgrade && <UpgradeModal feature="Export CSV" onClose={() => setUpgrade(false)} />}
    </>
  );
}

/** Rozpad výplaty jednoho člověka: mzda, příplatky, dýško, prémie, z kasy (po uzávěrkách), vyplaceno, doplatit; akce Vyplaceno a Smlouva. */
function DetailVyplatyOkno({ r, od, do: doD, sazba, vidiMzdy, hranice, smiZapis, onVyplaceno, onSmlouva, onClose }: {
  r: RadekVyplaty; od: string; do: string; sazba: number | null; vidiMzdy: boolean; hranice: number | null; smiZapis: boolean;
  onVyplaceno: () => void; onSmlouva: () => void; onClose: () => void;
}) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const money = useMoney();
  const nav = useNavigace();
  const datum = (d: string) => fmtDatum(d, { jazyk, styl: 'kratce' });
  const limit = stavLimituHodin(r.hodinyLetosMs, r.limitHodin);
  return (
    <Modal open onClose={onClose} size="md" title={r.jmeno} subtitle={`${datum(od)} – ${datum(doD)}${r.pozice ? ` · ${r.pozice}` : ''}`}
      footer={smiZapis ? <>
        <Button variant="secondary" icon="user" onClick={onSmlouva}>{t('Smlouva…')}</Button>
        {r.doplatit > 0 && <Button variant="primary" icon="check" onClick={onVyplaceno}>{t('Vyplaceno…')}</Button>}
      </> : undefined}>
      <div className="space-y-4">
        {vidiMzdy && (
          <StatRow>
            <Stat label={t('Doplatit')} value={money(r.doplatit)} tone="ok" note={r.stav !== 'nic' ? <ChipStavu r={r} jazyk={jazyk} /> : undefined} />
            <Stat label={t('Odpracováno')} value={hodinyMinuty(r.ms)} note={sazba ? t('× {sazba}/h', { sazba: money(sazba) }) : t('bez sazby')} />
          </StatRow>
        )}
        <ul className="list">
          <ListRow title={t('Směny')} meta={r.vynechano > 0 ? t('{n}× bez odchodu', { n: r.vynechano.toLocaleString(jazyk) }) : undefined} value={r.pocet.toLocaleString(jazyk)} />
          {r.planMs > 0 && <ListRow title={t('Plán')} value={hodinyMinuty(r.planMs)} valueMeta={r.pozde > 0 ? t('{n}× pozdě', { n: r.pozde.toLocaleString(jazyk) }) : undefined} />}
          {vidiMzdy && <ListRow title={t('Mzda')} meta={t('hodiny × sazba')} value={r.mzda != null ? money(r.mzda) : '—'} />}
          {vidiMzdy && r.priplatky > 0 && <ListRow title={t('Příplatky')} meta={priplatkySlovy(t, jazyk, r.priplatkyMs)} value={`+${money(r.priplatky)}`} />}
          {r.spropitne != null && <ListRow title={t('Spropitné')} meta={t('podíl podle pravidel podniku')} value={money(Math.round(r.spropitne))} />}
          {vidiMzdy && r.upravy !== 0 && <ListRow title={t('Prémie a srážky')} value={<span className={r.upravy > 0 ? 'text-ok-ink' : 'text-bad-ink'}>{sZnamenkem(r.upravy, money)}</span>} />}
          {vidiMzdy && r.zKasy > 0 && (
            <ListRow title={t('Už vyplaceno z kasy')} value={`−${money(r.zKasy)}`}
              detail={r.uzaverky.map(u => `${datum(u.den)} ${money(u.castka)}${u.kdo ? ` (${u.kdo})` : ''}`).join(' · ')}
              actions={nav.smiPohled('reports') ? <Button variant="ghost" size="sm" iconAfter="chevronRight" onClick={() => nav.onNavigate('reports')}>{t('Uzávěrky')}</Button> : undefined} />
          )}
          {vidiMzdy && r.vyplaty.map(v => (
            <ListRow key={v.id} title={t('Vyplaceno {datum}', { datum: datum(v.paidAt) })} meta={`${v.method === 'ucet' ? t('na účet') : t('hotově')}${v.note ? ` · ${v.note}` : ''}`} value={`−${money(v.amount)}`} />
          ))}
          {r.smlouva && (
            <ListRow title={t('Smlouva')} meta={limit ? t('letos {h} / {limit} h', { h: limit.odpracovanoH.toLocaleString(jazyk), limit: limit.limitH }) : undefined} right={<ChipSmlouvy r={r} hranice={hranice} />} />
          )}
        </ul>
      </div>
    </Modal>
  );
}

/** „Vyplaceno…": částka (předvyplněné Doplatit), způsob, den — pro jednoho, nebo hromadně pro vybrané (každému jeho Doplatit). */
function VyplacenoOkno({ lide, od, do: doD, onClose, onHotovo }: { lide: RadekVyplaty[]; od: string; do: string; onClose: () => void; onHotovo: () => void }) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const money = useMoney();
  const symbol = useSymbol();
  const dnes = pragueToday();
  const jeden = lide.length === 1 ? lide[0] : null;
  const [castka, setCastka] = useState(jeden ? String(Math.max(0, jeden.doplatit)) : '');
  const [zpusob, setZpusob] = useState<'hotove' | 'ucet'>('hotove');
  const [den, setDen] = useState(dnes);
  const [poznamka, setPoznamka] = useState('');
  const [pise, setPise] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const cislo = Math.round(Number(castka.replace(',', '.')));
  const jde = (jeden ? Number.isFinite(cislo) && cislo > 0 : lide.length > 0) && /^\d{4}-\d{2}-\d{2}$/.test(den);
  const datum = (d: string) => fmtDatum(d, { jazyk, styl: 'kratce' });
  const uloz = async () => {
    if (!jde || pise) return;
    setPise(true); setChyba(null);
    const telo = (userId: string, amount: number) => ({ userId: Number(userId), od, do: doD, amount, method: zpusob, paidAt: den, note: poznamka.trim() || undefined });
    const { failed } = await runBulk(lide.map(x => x.id), id => {
      const x = lide.find(y => y.id === id)!;
      return fetch('/api/payroll/payments', { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify(telo(id, jeden ? cislo : x.doplatit)) }).then(okJson);
    });
    setPise(false);
    if (failed.length) { setChyba(t('{n} z {celkem} se neuložilo. Zkus to znovu.', { n: failed.length, celkem: lide.length })); obnovVyplaty(); return; }
    onHotovo();
  };
  return (
    <Modal open onClose={onClose} size="sm" title={t('Označit jako vyplacené')} subtitle={jeden ? `${jeden.jmeno} · ${datum(od)} – ${datum(doD)}` : t('{n, plural, one {# člověk} few {# lidé} other {# lidí}} · {od} – {do}', { n: lide.length, od: datum(od), do: datum(doD) })}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
        <Button variant="primary" icon="check" loading={pise} disabled={!jde} onClick={uloz}>{t('Vyplaceno')}</Button>
      </>}>
      <div className="space-y-4">
        {jeden ? (
          <Field id="vyplaceno-castka" label={t('Částka')} hint={jeden.zKasy > 0 ? t('Doplatit po odečtení {castka} z kasy.', { castka: money(jeden.zKasy) }) : undefined}>
            <div className="relative">
              <Input id="vyplaceno-castka" type="number" inputMode="numeric" min={1} value={castka} onChange={e => setCastka(e.target.value)} className="tabular-nums pr-10" autoFocus />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
            </div>
          </Field>
        ) : (
          <ul className="list">
            {lide.map(x => <ListRow key={x.id} title={x.jmeno} value={money(x.doplatit)} />)}
          </ul>
        )}
        <Segmented ariaLabel={t('Způsob výplaty')} value={zpusob} onChange={setZpusob} options={[{ id: 'hotove', label: t('Hotově') }, { id: 'ucet', label: t('Na účet') }]} />
        <Field id="vyplaceno-den" label={t('Den výplaty')}>
          <Input id="vyplaceno-den" type="date" value={den} max={dnes} onChange={e => setDen(e.target.value)} />
        </Field>
        <Field id="vyplaceno-poznamka" label={t('Poznámka (nepovinné)')}>
          <Input id="vyplaceno-poznamka" value={poznamka} maxLength={200} onChange={e => setPoznamka(e.target.value)} placeholder={t('Např. záloha na účet, zbytek hotově')} />
        </Field>
        {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
      </div>
    </Modal>
  );
}

/** Typ smlouvy (HPP / DPČ / DPP / OSVČ) a roční limit hodin u člena. */
function SmlouvaOkno({ r, onClose, onHotovo }: { r: RadekVyplaty; onClose: () => void; onHotovo: () => void }) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const [typ, setTyp] = useState<TypSmlouvy | ''>(r.smlouva ?? '');
  const [limit, setLimit] = useState(r.limitHodin ? String(r.limitHodin) : r.smlouva === 'DPP' ? String(LIMIT_DPP_HODIN) : '');
  const [pise, setPise] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const uloz = async () => {
    setPise(true); setChyba(null);
    try {
      await fetch('/api/payroll/smlouva', { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ userId: Number(r.id), contractType: typ || null, contractHoursYear: limit.trim() === '' ? null : Number(limit) }) }).then(okJson);
      onHotovo();
    } catch (e) { setChyba(apiMessage(e, t('Smlouvu se nepodařilo uložit.'))); } finally { setPise(false); }
  };
  const vyberTyp = (v: string) => { const n = v as TypSmlouvy | ''; setTyp(n); if (n === 'DPP' && !limit) setLimit(String(LIMIT_DPP_HODIN)); };
  return (
    <Modal open onClose={onClose} size="sm" title={t('Smlouva')} subtitle={r.jmeno}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
        <Button variant="primary" icon="check" loading={pise} onClick={uloz}>{t('Uložit')}</Button>
      </>}>
      <div className="space-y-4">
        <Field id="smlouva-typ" label={t('Typ smlouvy')}>
          <Select id="smlouva-typ" value={typ} onChange={e => vyberTyp(e.target.value)}>
            <option value="">{t('Nenastaveno')}</option>
            {TYPY_SMLUV.map(x => <option key={x} value={x}>{nazevSmlouvy(x)}</option>)}
          </Select>
        </Field>
        <Field id="smlouva-limit" label={t('Limit hodin za rok')} hint={typ === 'DPP' ? t('U DPP je to 300 h u jednoho zaměstnavatele; od 85 % listina upozorní.') : t('Nepovinné — jen když chceš hlídat strop.')}>
          <Input id="smlouva-limit" type="number" inputMode="numeric" min={0} max={5000} value={limit} onChange={e => setLimit(e.target.value)} className="tabular-nums" />
        </Field>
        <p className="t-meta">{t('Letos odpracováno {h} h.', { h: (Math.round(r.hodinyLetosMs / 360_000) / 10).toLocaleString(jazyk) })}</p>
        {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
      </div>
    </Modal>
  );
}

/** Řádek příplatku v Pravidlech výplat: přepínač a procento vedle sebe (mimo okno, ať pole při psaní neztrácí fokus). */
function RadekProcent({ id, label, zap, pct, onZap, onPct, hint }: { id: string; label: string; zap: boolean; pct: number; onZap: (v: boolean) => void; onPct: (v: number) => void; hint?: string }) {
  const t = useT('widgety');
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <SwitchRow as="div" className="min-w-0 flex-1 !py-0 !min-h-0" title={label} hint={hint} checked={zap} onChange={onZap} />
      <div className="relative w-24 shrink-0">
        <Input id={id} type="number" inputMode="numeric" min={0} max={300} value={pct} disabled={!zap} aria-label={t('{nazev} v procentech', { nazev: label })}
          onChange={e => { const n = Math.round(Number(e.target.value)); onPct(Number.isFinite(n) ? n : pct); }} className="tabular-nums !pr-8" />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">%</span>
      </div>
    </li>
  );
}

/**
 * Pravidla výplat podniku: dýško (metoda, váhy pozic, dělit i s vedením, platí od, náhled na poslední uzávěrce),
 * příplatky za víkend / noc / svátek, hranice odvodů z DPP a „Ukázat lidem jejich dýško". Ukládá PUT /api/payroll/rules.
 */
function PravidlaVyplatOkno({ pravidla, pozice, nahled, onClose, onHotovo }: {
  pravidla: PravidlaPayrollu; pozice: string[];
  nahled: { uzaverky: readonly UzaverkaSpropitne[]; entries: readonly ZaznamDochazky[]; ted: number; od: string; do: string; pozice: ReadonlyMap<string, string>; jmena: ReadonlyMap<string, string> };
  onClose: () => void; onHotovo: () => void;
}) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const money = useMoney();
  const symbol = useSymbol();
  const dnes = pragueToday();
  const [metoda, setMetoda] = useState<MetodaDyska>(pravidla.dysko.metoda);
  const [vahy, setVahy] = useState<Record<string, string>>(() => Object.fromEntries(pozice.map(p => [p, String(pravidla.dysko.vahy[p] ?? 1)])));
  const [sVedenim, setSVedenim] = useState(pravidla.dysko.sVedenim);
  const [platiOd, setPlatiOd] = useState(pravidla.dysko.platiOd ?? dnes);
  const [pr, setPr] = useState<PravidlaPriplatku>(pravidla.priplatky);
  const [hranice, setHranice] = useState(pravidla.hraniceOdvodu ? String(pravidla.hraniceOdvodu) : '');
  const [dyskoLidem, setDyskoLidem] = useState(pravidla.showTipsToStaff);
  const [pise, setPise] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const cislo = (v: string, vychozi: number) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : vychozi; };
  // Náhled: jak by se podle rozepsaných pravidel rozdělila poslední uzávěrka s dýškem v období.
  const navrh = useMemo((): PravidlaDyska => ({ metoda, vahy: Object.fromEntries(Object.entries(vahy).map(([k, v]) => [k, cislo(v, 1)])), sVedenim, platiOd: null, vylouceni: sVedenim ? [] : pravidla.dysko.vylouceni }), [metoda, vahy, sVedenim, pravidla.dysko.vylouceni]);
  const ukazka = useMemo(() => {
    const posledni = [...nahled.uzaverky].filter(c => (Number(c.tips) || 0) > 0 && c.covered_by == null && !c.trzbaSkryta).sort((a, b) => String(b.shift_date ?? b.date).localeCompare(String(a.shift_date ?? a.date)))[0];
    if (!posledni) return null;
    const den = String(posledni.shift_date ?? posledni.date).slice(0, 10);
    const sp = spropitneZaObdobi([posledni], nahled.entries, nahled.ted, den, den, [], { pravidla: navrh, pozice: nahled.pozice });
    return { den, tips: Number(posledni.tips) || 0, podily: [...sp.poLidech].map(([id, c]) => ({ jmeno: nahled.jmena.get(id) ?? `#${id}`, castka: Math.round(c) })).sort((a, b) => b.castka - a.castka), nerozdeleno: sp.nerozdeleno };
  }, [nahled, navrh]);
  const uloz = async () => {
    setPise(true); setChyba(null);
    try {
      await fetch('/api/payroll/rules', {
        method: 'PUT', headers: JSON_HLAVICKA,
        body: JSON.stringify({
          dysko: { metoda, vahy: navrh.vahy, sVedenim, platiOd },
          priplatky: pr, hraniceOdvodu: hranice.trim() === '' ? null : Math.round(cislo(hranice, 0)), showTipsToStaff: dyskoLidem,
        }),
      }).then(okJson);
      onHotovo();
    } catch (e) { setChyba(apiMessage(e, t('Pravidla se nepodařilo uložit.'))); } finally { setPise(false); }
  };
  return (
    <Modal open onClose={onClose} size="md" title={t('Pravidla výplat')} subtitle={t('Jak se dělí dýško, příplatky a hranice odvodů — platí pro celý podnik.')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
        <Button variant="primary" icon="check" loading={pise} onClick={uloz}>{t('Uložit pravidla')}</Button>
      </>}>
      <div className="space-y-6">
        <section aria-labelledby="pravidla-dysko" className="space-y-3">
          <h4 id="pravidla-dysko" className="t-label">{t('Dýško')}</h4>
          <Segmented ariaLabel={t('Jak dělit dýško')} value={metoda} onChange={setMetoda}
            options={[{ id: 'hodiny', label: t('Podle hodin') }, { id: 'rovne', label: t('Rovným dílem') }, { id: 'vaha', label: t('Hodiny × váha pozice') }]} />
          {metoda === 'vaha' && (
            pozice.length === 0 ? <p className="t-meta">{t('Lidé zatím nemají pozice — doplň je v Týmu, pak jde dát kuchyni jiný podíl než baru.')}</p> : (
              <ul className="list">
                {pozice.map(p => (
                  <li key={p} className="flex items-center justify-between gap-3 py-2.5">
                    <label htmlFor={`vaha-${p}`} className="min-w-0 flex-1 truncate text-sm font-medium text-[#16181A]">{p}</label>
                    <Input id={`vaha-${p}`} inputMode="decimal" value={vahy[p] ?? '1'} onChange={e => setVahy(v => ({ ...v, [p]: e.target.value }))} className="!w-24 tabular-nums" />
                  </li>
                ))}
              </ul>
            )
          )}
          <ul className="list">
            <SwitchRow title={t('Dělit i s vedením')} hint={t('Vypnuto: vlastník a vedení se o dýško nedělí, i když jsou na směně.')} checked={sVedenim} onChange={setSVedenim} />
          </ul>
          <Field id="pravidla-od" label={t('Platí od')} hint={t('Starší uzávěrky se dělí postaru — minulé měsíce se nepřepočítají potichu.')}>
            <Input id="pravidla-od" type="date" value={platiOd} onChange={e => setPlatiOd(e.target.value)} className="!w-full sm:!w-48" />
          </Field>
          {ukazka && (
            <Well className="t-meta">
              {ukazka.podily.length
                ? t('Na uzávěrce z {den} ({tips}) by dostali: {rozpis}', { den: fmtDatum(ukazka.den, { jazyk, styl: 'kratce' }), tips: money(ukazka.tips), rozpis: ukazka.podily.map(p => `${p.jmeno} ${money(p.castka)}`).join(', ') })
                : t('Na uzávěrce z {den} ({tips}) by nedostal nikdo — všichni na směně jsou vyloučení.', { den: fmtDatum(ukazka.den, { jazyk, styl: 'kratce' }), tips: money(ukazka.tips) })}
            </Well>
          )}
          <ul className="list">
            <SwitchRow title={t('Ukázat lidem jejich dýško')} hint={t('Zaměstnanec uvidí svůj podíl v Mém výdělku; bez toho dlaždice není.')} checked={dyskoLidem} onChange={setDyskoLidem} />
          </ul>
        </section>
        <section aria-labelledby="pravidla-priplatky" className="space-y-2">
          <h4 id="pravidla-priplatky" className="t-label">{t('Příplatky')}</h4>
          <ul className="list">
            <RadekProcent id="pr-vikend" label={t('Sobota a neděle')} zap={pr.vikend} pct={pr.vikendPct} onZap={v => setPr(p => ({ ...p, vikend: v }))} onPct={v => setPr(p => ({ ...p, vikendPct: v }))} />
            <RadekProcent id="pr-noc" label={t('Noc')} hint={t('{od}–{do}', { od: fmtHM(pr.nocOd), do: fmtHM(pr.nocDo) })} zap={pr.noc} pct={pr.nocPct} onZap={v => setPr(p => ({ ...p, noc: v }))} onPct={v => setPr(p => ({ ...p, nocPct: v }))} />
            <li className="grid grid-cols-2 gap-3 py-2">
              <Field id="pr-noc-od" label={t('Noc od')}><Input id="pr-noc-od" type="time" value={pr.nocOd} onChange={e => setPr(p => ({ ...p, nocOd: e.target.value || p.nocOd }))} /></Field>
              <Field id="pr-noc-do" label={t('Noc do')}><Input id="pr-noc-do" type="time" value={pr.nocDo} onChange={e => setPr(p => ({ ...p, nocDo: e.target.value || p.nocDo }))} /></Field>
            </li>
            <RadekProcent id="pr-svatek" label={t('Státní svátek')} hint={t('České svátky včetně Velikonoc počítá aplikace sama.')} zap={pr.svatek} pct={pr.svatekPct} onZap={v => setPr(p => ({ ...p, svatek: v }))} onPct={v => setPr(p => ({ ...p, svatekPct: v }))} />
          </ul>
          <p className="t-meta text-pretty">{t('Výchozí podle zákoníku práce: víkend a noc +10 %, svátek +100 %. Platí i pro DPP a DPČ.')}</p>
        </section>
        <section aria-labelledby="pravidla-odvody" className="space-y-2">
          <h4 id="pravidla-odvody" className="t-label">{t('Smlouvy')}</h4>
          <Field id="pr-hranice" label={t('Hranice výdělku z DPP pro odvody')} hint={t('Měsíční hrubá mzda, od které se z DPP odvádí pojištění; mění se každý rok, proto ji zadáváš sám. Prázdné = nehlídat.')}>
            <div className="relative sm:w-48">
              <Input id="pr-hranice" type="number" inputMode="numeric" min={0} value={hranice} onChange={e => setHranice(e.target.value)} className="tabular-nums !pr-10" />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
            </div>
          </Field>
        </section>
        {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
      </div>
    </Modal>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'dochazka.moje_pichacky': Pichacky,
  'dochazka.prave_na_smene': PraveNaSmene,
  'dochazka.moje_odpracovano': Odpracovano,
  'dochazka.mzdy_za_obdobi': MzdyZaObdobi,
  'dochazka.souhrn_hodin': SouhrnHodin,
  'dochazka.dlouhe_prichody': DlouhePrichody,
  'dochazka.dnes_v_podniku': DnesVPodniku,
  'moje.vydelek': MujVydelek,
  'dochazka.moje_zaznamy': MojeDochazka,
  'dochazka.vyplatni_listina': VyplatniListina,
};
