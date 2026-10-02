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
// Všechny berou /api/attendance a tam, kde stačí jeden den, stejnou adresu —
// sdílená mezipaměť useDataWidgetu pak pošle jediný dotaz za celou plochu a odpíchnutí
// v Píchačkách se hned ukáže i v „Právě na směně". Nástroj Docházky čte tutéž
// mezipaměť (stejná adresa jako widgety „Podle stránky"), takže se po úpravě
// záznamu obnoví obojí najednou (obnovDochazku).

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { Avatar, Button, Chip, Field, Input, ListRow, Modal, PersonChip, Segmented, Stat, StatRow } from '../../ui';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { Widget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { useOpravneni } from '../../role/useOpravneni';
import { useCurrency, useMoney } from '../../CurrencyProvider';
import { usePersonProfile } from '../../employer/ProfileLinkProvider';
import { apiMessage, okJson } from '@/lib/api';
import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtHM, fmtMesic } from '@/lib/i18n/format';
import { dbTimeDayHM, dbTimeHM, parseDbTime, pragueDayOf, pragueToday } from '@/lib/pragueTime';
import {
  ZAPOMENUTY_MS, dnesVPodniku, konecSmeny, navrhOdchodu as navrhOdchoduPlan, hodinyMinuty, mujMesic, mzdyZaObdobi, obdobiDni, otevrenePrichody, podilMezd,
  sazbyZRosteru, seradSouhrn, souhrnHodin, trzbyZaObdobi,
  type OtevrenyPrichod, type RadekDne, type RazeniSouhrnu, type UzaverkaTrzby,
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
}

interface ZaznamDochazky {
  id?: number;
  employeeId?: number;
  clockIn: string;
  clockOut: string | null;
}

interface Dochazka { roster: ClenRosteru[]; entries: ZaznamDochazky[] }

/**
 * Jeden den docházky. S dochazka.zobrazit / dochazka.tablet vrací API celý
 * dnešní roster, ostatním jen vlastní záznamy a `roster: [{ id: já, openSince }]`
 * — Píchačkám stačí obojí, a tak mají s „Právě na směně" jednu adresu.
 */
const URL_DNES = '/api/attendance?days=1';

/** Odpověď bez rosteru je nečekaný tvar (chyba widgetu), ne „nikdo není na směně". */
function vyberDochazku(raw: any, t: PrekladFn): Dochazka {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.roster)) throw new Error(t('Docházka přišla v nečekaném tvaru.'));
  return { roster: raw.roster, entries: Array.isArray(raw.entries) ? raw.entries : [] };
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

  const openSince = ja.id != null ? data.data?.roster.find(r => Number(r.id) === ja.id)?.openSince ?? null : null;
  const zacatek = parseDbTime(openSince);
  const naSmene = !!zacatek;
  const S = velikost === 'S';
  // Sekundy ukazuje jen střední velikost; malá má hodiny a minuty, stačí jí obnova po čtvrt minutě.
  const ted = useTed(naSmene, S ? 15_000 : 1000);
  const bezi = zacatek ? Math.max(0, ted - zacatek.getTime()) : 0;
  const zapomenuty = naSmene && bezi > ZAPOMENUTY_MS;

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
          ) : (
            <p className="t-meta text-pretty">{t('Odpíchni si příchod, až začneš pracovat — čas se začne počítat hned.')}</p>
          )}
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
  for (const d of new Set([1, 7, 30, 90, dnuMesice])) obnovDataWidgetu(urlDni(d));
}

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
  const [pise, setPise] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const idPole = `ukoncit-${entryId}`;
  const uloz = async () => {
    const d = new Date(cas);
    if (!cas || Number.isNaN(d.getTime())) { setChyba(t('Vyplň čas odchodu.')); return; }
    setPise(true); setChyba(null);
    try {
      await fetch('/api/attendance', { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ id: entryId, clockOut: d.toISOString() }) }).then(okJson);
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
      <Field id={idPole} label={t('Odchod')} hint={zPlanu ? t('Předvyplněný je plánovaný konec směny. Uprav ho, jestli odešel jindy.') : t('Plánovanou směnu nemá, předvyplněný je aktuální čas. Uprav ho, jestli odešel dřív.')} error={chyba}>
        <Input id={idPole} type="datetime-local" value={cas} onChange={e => setCas(e.target.value)} />
      </Field>
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
function useMujMesic(zapnuto: boolean) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const ja = useJa();
  const { nacteno, ma } = useOpravneni();
  const dnes = pragueToday();
  const mesic = dnes.slice(0, 7);
  const tymova = nacteno ? ma('dochazka.zobrazit') : true;
  const bezZaznamu = nacteno && !ma('dochazka.zobrazit') && ma('dochazka.tablet');
  const dnuMesice = Number(dnes.slice(8, 10)) + 1;
  const url = !zapnuto || ja.id == null || bezZaznamu ? null : tymova ? urlDni(dnuMesice) : URL_DNES;
  const data = useDataWidgetu<Dochazka>(url, raw => vyberDochazku(raw, t));
  const vlastni = useMemo(() => (data.data?.entries ?? []).filter(e => ja.id != null && Number(e.employeeId) === ja.id), [data.data, ja.id]);
  const ted = useTed(vlastni.some(e => !e.clockOut), 60_000);
  const sazbaRaw = ja.id != null ? (data.data?.roster.find(r => Number(r.id) === ja.id) as ClenRosteruB2 | undefined)?.hourlyRate : undefined;
  const sazba = Number(sazbaRaw) > 0 ? Number(sazbaRaw) : null;
  const s = useMemo(() => mujMesic(vlastni, ja.id ?? -1, mesic, ted, sazba), [vlastni, ja.id, mesic, ted, sazba]);
  const m = Number(mesic.slice(5, 7));
  const nazevMesice = fmtMesic(m, { jazyk });
  return { ja, data, s, sazba, sazbaZnama: sazbaRaw !== undefined && sazbaRaw !== null, bezZaznamu, nazevMesice };
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
function MujVydelek(_: WidgetProps) {
  const t = useT('widgety');
  const brana = useBrana(['finance.moje_mzda', 'finance.mzdy']);
  const money = useMoney();
  const { ja, data, s, sazba, sazbaZnama, bezZaznamu, nazevMesice } = useMujMesic(brana);
  if (!brana) return <Widget prazdno={null} />;
  const minut = Math.floor(s.ms / 60000);
  const hodiny = minut % 60 > 0 ? t('{h} h {min} min', { h: Math.floor(minut / 60), min: minut % 60 }) : t('{h} h', { h: Math.floor(minut / 60) });
  const prazdno = bezZaznamu ? <p className="t-meta text-pretty">{t('S touhle rolí se hodiny z píchaček nedají spočítat.')}</p>
    : sazbaZnama && sazba == null ? <p className="t-meta text-pretty">{t('Hodinovou sazbu ti zatím nikdo nenastavil.')}</p>
    : undefined;
  return (
    <Widget nacteni={ja.stav ?? data} prazdno={prazdno}>
      <Stat label={nazevMesice} value={money(s.mzda ?? 0)}
        note={s.zapomenuty ? <Chip tone="wait" size="sm">{t('Zapomenutý odchod')}</Chip> : `${hodiny}${s.bezi ? ` · ${t('běží')}` : ''}`} />
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
  const mzdy = useMemo(() => data.data ? mzdyZaObdobi(data.data.entries, ted, sazbyZRosteru(data.data.roster as ClenRosteruB2[])) : null, [data.data, ted]);
  const trzby = useMemo(() => {
    if (!trzbyData.data) return null;
    const o = obdobiDni(dni, pragueToday());
    return trzbyZaObdobi(trzbyData.data, o.od, o.do);
  }, [trzbyData.data, dni]);
  if (!brana) return <Widget prazdno={null} />;

  const pct = mzdy && trzby && !trzby.skryto ? podilMezd(mzdy.celkem, trzby.trzby) : null;
  const nad = pct != null && laborTargetPct != null && pct > laborTargetPct;
  const poznamkaMezd = mzdy && mzdy.bezSazby > 0
    ? t('bez sazby: {n, plural, one {# člověk} few {# lidé} other {# lidí}}', { n: mzdy.bezSazby })
    : t('za {n, plural, one {# den} few {# dny} other {# dní}}', { n: dni });
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
  const { dni } = useDniWidgetu(nastaveni.obdobi);
  const L = velikost === 'L';
  const vidiMzdy = smi('finance.mzdy');
  const vychoziRazeni: RazeniSouhrnu = nastaveni.razeni === 'mzda' && !vidiMzdy ? 'hodiny' : nastaveni.razeni ?? 'hodiny';
  const [razeni, setRazeni] = useState<RazeniSouhrnu>(vychoziRazeni);
  useEffect(() => { setRazeni(vychoziRazeni); }, [vychoziRazeni]);
  const data = useDataWidgetu<Dochazka>(brana ? urlDni(dni) : null, raw => vyberDochazku(raw, t));
  const ted = useTed(!!data.data?.entries.some(e => !e.clockOut), 60_000);
  const radky = useMemo(() => {
    if (!data.data) return [];
    // Sazby jen s finance.mzdy — server je bez něj posílá jako null, ale
    // widget se na to nespoléhá (pole katalogu: Kč u člověka).
    const sazby = vidiMzdy ? sazbyZRosteru(data.data.roster as ClenRosteruB2[]) : new Map<string, number>();
    return seradSouhrn(souhrnHodin(data.data.entries, ted, sazby), razeni);
  }, [data.data, ted, razeni, vidiMzdy]);
  if (!brana) return <Widget prazdno={null} />;

  const profil = !nahled && !!otevriProfil && smi('tym.profil');
  const zobrazene = L ? radky : radky.slice(0, RADKU_M);
  const moznosti = [
    { id: 'hodiny' as const, label: t('Hodiny', undefined, 'widgety') },
    ...(vidiMzdy ? [{ id: 'mzda' as const, label: t('Mzda') }] : []),
    { id: 'jmeno' as const, label: t('Jméno') },
  ];
  return (
    <Widget nacteni={data}
      doplnek={radky.length > 0 ? <Chip tone="muted" size="sm">{nazevDni(t, dni)}</Chip> : undefined}
      prazdno={radky.length === 0 ? <p className="t-meta">{t('Za {n, plural, one {# den} few {# dny} other {# dní}} nikdo nic neodpíchl.', { n: dni })}</p> : undefined}>
      {L && radky.length > 2 && (
        <Segmented size="sm" ariaLabel={t('Řadit souhrn')} value={razeni} onChange={v => setRazeni(v)} options={moznosti} className="mb-2" />
      )}
      <ul className="list">
        {zobrazene.map(r => {
          const meta = [t('{n, plural, one {# směna} few {# směny} other {# směn}}', { n: r.pocet }), r.bezi ? t('právě běží') : null, r.vynechano > 0 ? t('{n}× bez odchodu', { n: r.vynechano.toLocaleString('cs-CZ') }) : null].filter(Boolean).join(' · ');
          const radek = {
            lead: <Avatar emoji={r.avatar} size="sm" />,
            title: r.jmeno,
            meta,
            value: hodinyMinuty(r.ms),
            valueMeta: vidiMzdy && r.mzda != null ? money(r.mzda) : undefined,
          };
          return profil && otevriProfil ? (
            <li key={r.id}><ListRow as="div" {...radek} onClick={() => otevriProfil(Number(r.id))} /></li>
          ) : <ListRow key={r.id} {...radek} />;
        })}
      </ul>
      {!L && radky.length > RADKU_M && <p className="t-meta mt-2">{aDalsich(t, radky.length - RADKU_M)}</p>}
    </Widget>
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

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'dochazka.moje_pichacky': Pichacky,
  'dochazka.prave_na_smene': PraveNaSmene,
  'dochazka.moje_odpracovano': Odpracovano,
  'dochazka.mzdy_za_obdobi': MzdyZaObdobi,
  'dochazka.souhrn_hodin': SouhrnHodin,
  'dochazka.dlouhe_prichody': DlouhePrichody,
  'dochazka.dnes_v_podniku': DnesVPodniku,
  'moje.vydelek': MujVydelek,
};
