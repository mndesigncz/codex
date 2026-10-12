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
// Všechny berou /api/attendance a tam, kde stačí jeden den, stejnou adresu —
// sdílená mezipaměť useDataWidgetu pak pošle jediný dotaz za celou plochu a odpíchnutí
// v Píchačkách se hned ukáže i v „Právě na směně". Nástroj Docházky čte tutéž
// mezipaměť (stejná adresa jako widgety „Podle stránky"), takže se po úpravě
// záznamu obnoví obojí najednou (obnovDochazku).

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { Avatar, Button, CasovyGraf, Chip, Field, Input, ListRow, Menu, Modal, ObdobiLista, PersonChip, Segmented, Stat, StatRow, Textarea } from '../../ui';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { Widget, useVyrizeno, useWidget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
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
  radkyMojeDochazky, orizniSeznam,
  type OtevrenyPrichod, type RadekDne, type RazeniSouhrnu, type UpravaMzdy, type UzaverkaSpropitne, type UzaverkaTrzby, type VolbaMesice,
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
}

interface Dochazka { roster: ClenRosteru[]; entries: ZaznamDochazky[]; /** Prémie a srážky (jen s finance.mzdy, jinak prázdné). */ adjustments: UpravaMzdy[] }

/**
 * Jeden den docházky. S dochazka.zobrazit / dochazka.tablet vrací API celý
 * dnešní roster, ostatním jen vlastní záznamy a `roster: [{ id: já, openSince }]`
 * — Píchačkám stačí obojí, a tak mají s „Právě na směně" jednu adresu.
 */
const URL_DNES = '/api/attendance?days=1';

/** Odpověď bez rosteru je nečekaný tvar (chyba widgetu), ne „nikdo není na směně". */
function vyberDochazku(raw: any, t: PrekladFn): Dochazka {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.roster)) throw new Error(t('Docházka přišla v nečekaném tvaru.'));
  return { roster: raw.roster, entries: Array.isArray(raw.entries) ? raw.entries : [], adjustments: Array.isArray(raw.adjustments) ? raw.adjustments : [] };
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
  const ted = useTed(naSmene || (!S && !!planOd), S ? 15_000 : naSmene ? 1000 : 60_000);
  const bezi = zacatek ? Math.max(0, ted - zacatek.getTime()) : 0;
  const zapomenuty = naSmene && bezi > ZAPOMENUTY_MS;
  const vuciPlanu = planOd ? zpozdeniPichacek(muj?.shiftDate || pragueToday(), planOd, openSince, ted) : null;

  const pichni = async () => {
    if (nahled || ja.id == null || pise) return;
    const akce = naSmene ? 'out' : 'in';
    setPise(true); setChyba(null); setPripomenUzaverku(false);
    try {
      const d = await fetch('/api/attendance', {
        method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify({ employeeId: ja.id, action: akce }),
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
    }
  };

  const tlacitko = (
    <Button variant="primary" size="sm" block icon={naSmene ? 'logout' : 'clock'} loading={pise} onClick={pichni}
      aria-label={naSmene ? t('Odpíchnout odchod') : t('Odpíchnout příchod')}>
      {S ? (naSmene ? t('Odchod') : t('Příchod')) : naSmene ? t('Odpíchnout odchod') : t('Odpíchnout příchod')}
    </Button>
  );
  const hlaseni = (
    <>
      {chyba && <p className="note note-danger !px-3 !py-2 text-[13px]" role="alert">{chyba}</p>}
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
        : naSmene ? <Chip tone="ok" size="sm">{t('Na směně')}</Chip> : undefined}
    >
      {S ? (
        <div className="space-y-2.5">
          {zapomenuty ? (
            <p className="note note-wait !px-3 !py-2 text-[13px]">{t('Běží od {cas}', { cas: odKdy(openSince) })}</p>
          ) : naSmene ? (
            <Stat label={t('Příchod {cas}', { cas: dbTimeHM(openSince) })} value={stopky(bezi, false)} />
          ) : (
            <p className="t-meta">{t('Teď nejsi na směně.')}</p>
          )}
          {hlaseni}
          {tlacitko}
        </div>
      ) : (
        <div className="space-y-3">
          {zapomenuty ? (
            <p className="note note-wait">
              {t('Příchod běží od {cas} — to je {delka}. Odpíchni odchod, ať docházka sedí.', { cas: odKdy(openSince), delka: delkaSlovy(t, bezi) })}
            </p>
          ) : naSmene ? (
            // „Na směně" už říká chip u titulku — štítek čísla nese čas příchodu.
            <Stat label={t('Příchod {cas}', { cas: dbTimeHM(openSince) })} value={stopky(bezi, true)} />
          ) : planOd ? null : (
            <p className="t-meta text-pretty">{t('Odpíchni si příchod, až začneš pracovat — čas se začne počítat hned.')}</p>
          )}
          {!zapomenuty && rozvrh}
          {hlaseni}
          {tlacitko}
        </div>
      )}
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
      <>
        <ul className="flex flex-wrap gap-2" aria-label={t('Kdo je na směně')}>
          {lide.slice(0, PILULEK_M).map(({ r, od }) => (
            <li key={r.id} className="min-w-0 max-w-full">
              <PersonChip name={r.name ?? t('Bez jména')} avatar={r.avatar} tone={jeZapomenuty(od) ? 'wait' : 'ok'} meta={t('od {cas}', { cas: odKdy(r.openSince) })} />
            </li>
          ))}
        </ul>
        {n > PILULEK_M && <p className="t-meta mt-3">{aDalsich(t, n - PILULEK_M)}</p>}
      </>
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
  const volba: VolbaMesice = nastaveni.mesic === 'minuly' ? 'minuly' : 'tento';
  const { ja, data, s, sazba, sazbaZnama, bezZaznamu, nazevMesice, upravy } = useMujMesic(brana, volba);
  if (!brana) return <Widget prazdno={null} />;
  const minut = Math.floor(s.ms / 60000);
  const hodiny = minut % 60 > 0 ? t('{h} h {min} min', { h: Math.floor(minut / 60), min: minut % 60 }) : t('{h} h', { h: Math.floor(minut / 60) });
  const prazdno = bezZaznamu ? <p className="t-meta text-pretty">{t('S touhle rolí se hodiny z píchaček nedají spočítat.')}</p>
    : sazbaZnama && sazba == null ? <p className="t-meta text-pretty">{t('Hodinovou sazbu ti zatím nikdo nenastavil.')}</p>
    : undefined;
  const celkem = (s.mzda ?? 0) + s.upravy;
  if (velikost === 'S') {
    return (
      <Widget nacteni={ja.stav ?? data} prazdno={prazdno}>
        <Stat label={nazevMesice} value={money(celkem)}
          note={s.zapomenuty ? <Chip tone="wait" size="sm">{t('Zapomenutý odchod')}</Chip>
            : `${hodiny}${s.bezi ? ` · ${t('běží')}` : ''}${s.upravy > 0 ? ` · ${t('prémie {castka}', { castka: sZnamenkem(s.upravy, money) })}` : s.upravy < 0 ? ` · ${t('srážka {castka}', { castka: sZnamenkem(s.upravy, money) })}` : ''}`} />
      </Widget>
    );
  }
  // M/L (kolo 5, vzor Homebase / 7shifts „Earnings"): rozpad výdělku — hodiny × sazba, prémie a srážky,
  // ve velkém i jejich seznam. Měsíc podle nastavení (tento / minulý).
  const denText = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(jazyk, { day: 'numeric', month: 'numeric' });
  return (
    <Widget nacteni={ja.stav ?? data} prazdno={prazdno}>
      <StatRow podleKarty>
        <Stat label={nazevMesice} value={money(celkem)} note={s.zapomenuty ? <Chip tone="wait" size="sm">{t('Zapomenutý odchod')}</Chip> : s.bezi ? t('včetně běžící směny') : t('hrubého, k výplatě')} />
        <Stat label={t('Odpracováno')} value={hodiny} note={sazba ? t('× {sazba}/h', { sazba: money(sazba) }) : t('bez sazby')} />
        <Stat label={t('Prémie a srážky')} value={upravy.length ? sZnamenkem(s.upravy, money) : '—'} tone={s.upravy > 0 ? 'ok' : s.upravy < 0 ? 'bad' : 'muted'}
          note={upravy.length ? t('{n, plural, one {# zápis} few {# zápisy} other {# zápisů}}', { n: upravy.length }) : t('zatím nic')} />
      </StatRow>
      {velikost === 'L' && upravy.length > 0 && (
        <ul className="list mt-3">
          {upravy.slice(0, 6).map(u => (
            <ListRow key={u.id} title={u.note || (Number(u.amount) > 0 ? t('Prémie') : t('Srážka'))}
              meta={`${denText(String(u.day).slice(0, 10))}${u.source === 'reward' ? ` · ${t('z odměny')}` : ''}`}
              value={<span className={Number(u.amount) > 0 ? 'text-ok-ink' : 'text-bad-ink'}>{sZnamenkem(Number(u.amount), money)}</span>} />
          ))}
        </ul>
      )}
      {velikost === 'L' && upravy.length > 6 && <p className="t-meta mt-2">{t('…a {n, plural, one {# další} few {# další} other {# dalších}}', { n: upravy.length - 6 })}</p>}
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
  const dyska = useMemo(() => (vidiDyska && uzaverky.data ? spropitneZaObdobi(uzaverky.data, entriesObdobi, ted, r.od, r.do, obdobi.dnyTydne) : null),
    [vidiDyska, uzaverky.data, entriesObdobi, ted, r.od, r.do, obdobi.dnyTydne]);
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
    return seradSouhrn(souhrnHodin(entriesObdobi, ted, sazby, { spropitne: dyska && !dyska.skryto ? dyska.poLidech : null, upravy: upravyPoLidech(upravyObdobi), lide, plan: true }), razeni);
  }, [data.data, entriesObdobi, ted, razeni, vidiMzdy, dyska, upravyObdobi]);
  const mzdyCelkem = useMemo(() => radky.reduce((a, x) => a + (x.vyplata ?? 0), 0), [radky]);
  const upravyCelkem = useMemo(() => radky.reduce((a, x) => a + x.upravy, 0), [radky]);
  const bezSazby = useMemo(() => radky.filter(x => x.mzda == null && x.ms > 0).length, [radky]);
  // Prémii / srážku přidá, kdo smí měnit sazby (zápis mzdy); okno nese i seznam už zapsaných s košem.
  const smiPremie = L && !nahled && smi('finance.sazby_upravit');
  const [okno, setOkno] = useState<{ id: string; jmeno: string; druh: 'premie' | 'srazka' } | null>(null);

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
      {L && (
        <div className="mb-4 space-y-4">
          <ObdobiLista value={obdobi} onChange={nastav} volby={['dnes', 'vcera', 'tyden', '7_dni', '30_dni', 'mesic', 'minuly_mesic', '90_dni', '180_dni']} porovnat={porovnat} onPorovnat={setPorovnat} />
          <div>
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
            </StatRow>
            {zmena != null && (
              <p className="t-meta mt-2 text-pretty">
                <Chip tone={zmena >= 0 ? 'ok' : 'wait'} size="sm">{zmena > 0 ? '+' : ''}{zmena} %</Chip> {t('proti předchozímu období')} ({hodinyText(sumPred!)})
              </p>
            )}
          </div>
          <CasovyGraf sloty={sloty} porovnani={slotyPred} druh="sloupce" vyska={170} format={hodinyText} kratce={v => String(Math.round(v))}
            jmenoSlotu={jmenoSlotu} popisekOsy={popisekOsy} zvyraznit={dnesKlic} popisekPorovnani={t('předchozí období')}
            label={t('Odpracované hodiny: {obdobi}', { obdobi: `${kratceDatum(r.od)} – ${kratceDatum(r.do)}` })} />
        </div>
      )}
      {L && radky.length > 2 && (
        <Segmented size="sm" ariaLabel={t('Řadit souhrn')} value={razeni} onChange={v => setRazeni(v)} options={moznosti} className="mb-2" />
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
                {sMzdou && <span className="block">{money(r.vyplata!)}</span>}
              </>
            ) : undefined,
            // Na počítači ve sloupci pevné šířky (aside, i prázdný), ať hodiny drží svislici; pod lg vpravo v ocase.
            aside: nekdoPozde ? (r.pozde > 0 ? <Chip tone="wait" size="sm">{t('{n}× pozdě', { n: r.pozde.toLocaleString(loc) })}</Chip> : '') : undefined,
            right: nekdoPozde ? <span className="lg:hidden">{r.pozde > 0 && <Chip tone="wait" size="sm">{t('{n}× pozdě', { n: r.pozde.toLocaleString(loc) })}</Chip>}</span> : undefined,
          };
          if (smiPremie) {
            // Řádek nese „···" (prémie / srážka), takže celý klikací být nemůže — profil otevře jméno.
            const polozky = [
              { label: t('Přidat prémii'), icon: 'plus', onClick: () => setOkno({ id: r.id, jmeno: r.jmeno, druh: 'premie' }) },
              { label: t('Přidat srážku'), icon: 'minus', onClick: () => setOkno({ id: r.id, jmeno: r.jmeno, druh: 'srazka' }) },
              ...(pocetUprav > 0 ? [{ label: t('Prémie a srážky ({n})', { n: pocetUprav }), icon: 'coins', onClick: () => setOkno({ id: r.id, jmeno: r.jmeno, druh: 'premie' }) }] : []),
            ];
            return (
              <ListRow key={r.id} {...radek}
                title={profil && otevriProfil
                  ? <button type="button" onClick={() => otevriProfil(Number(r.id))} aria-label={`Profil: ${r.jmeno}`} className="max-w-full truncate text-left rounded-sm hover:underline decoration-black/25 underline-offset-2">{r.jmeno}</button>
                  : r.jmeno}
                actions={<Menu size="sm" label={t('Prémie a srážky: {jmeno}', { jmeno: r.jmeno })} items={polozky} />} />
            );
          }
          return profil && otevriProfil ? (
            <li key={r.id}><ListRow as="div" {...radek} onClick={() => otevriProfil(Number(r.id))} /></li>
          ) : <ListRow key={r.id} {...radek} />;
        })}
      </ul>
      {okno && (
        <UpravaMzdyOkno clovek={okno} rozmezi={r} upravy={upravyObdobi.filter(u => String(u.userId) === okno.id)} onClose={() => setOkno(null)} />
      )}
      {!L && radky.length > RADKU_M && <p className="t-meta mt-2">{aDalsich(t, radky.length - RADKU_M)}</p>}
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
        body: JSON.stringify({ userId: Number(clovek.id), day: den, amount: druh === 'premie' ? cislo : -cislo, note: poznamka.trim() || undefined }),
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
                  meta={`${denText(String(u.day).slice(0, 10))}${u.source === 'reward' ? ` · ${t('z odměny')}` : ''}`}
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
            meta={d.useky.map(u => `${dbTimeHM(u.od)} – ${u.do ? dbTimeHM(u.do) : '…'}`).join(', ')}
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
};
