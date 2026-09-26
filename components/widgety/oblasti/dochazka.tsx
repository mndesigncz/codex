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
//    „Docházka"; ve velké velikosti stopky a „Ukončit" (jen s dochazka.upravit);
//  - dochazka.moje_odpracovano — jedno číslo „Odpracováno" místo dvou různých, která
//    Domů zaměstnance ukazovalo naráz (audit: 433 h proti 225 h). Zapomenutý příchod
//    se nepřičítá, ale přizná chipem.
//
// Všechny tři berou /api/attendance a tam, kde stačí jeden den, stejnou adresu —
// sdílená mezipaměť useDataWidgetu pak pošle jediný dotaz za celou plochu a odpíchnutí
// v Píchačkách se hned ukáže i v „Právě na směně".

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { Avatar, Button, Chip, ListRow, Modal, PersonChip, Stat } from '../../ui';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { Widget, type StavNacteni } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { useOpravneni } from '../../role/useOpravneni';
import { apiMessage, okJson } from '@/lib/api';
import { czCount, czForm, DEN } from '@/lib/czech';
import { dbTimeDayHM, dbTimeHM, parseDbTime, pragueDayOf, pragueHM, pragueToday } from '@/lib/pragueTime';
import { MAX_SHIFT_HOURS } from '@/lib/wages';

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
function vyberDochazku(raw: any): Dochazka {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.roster)) throw new Error('Docházka přišla v nečekaném tvaru.');
  return { roster: raw.roster, entries: Array.isArray(raw.entries) ? raw.entries : [] };
}

/**
 * Otevřený příchod delší než tohle je zapomenutý odchod, ne běžící směna —
 * stejná hranice jako měl ClockWidget. Časovač „304:15:12" by jinak tvrdil,
 * že člověk pracuje dvanáct dní v kuse.
 */
const ZAPOMENUTY_MS = 16 * 3600 * 1000;

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
  const { data, status, update } = useSession();
  if (status === 'loading') return { id: null, stav: RELACE_NACITA };
  const id = Number((data?.user as { id?: unknown } | undefined)?.id);
  if (Number.isFinite(id) && id > 0) return { id, stav: null };
  return { id: null, stav: { data: null, error: 'Nevím, kdo je přihlášený — obnov stránku.', loading: false, reload: () => { void update(); } } };
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
function delkaSlovy(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(min / 60);
  if (h >= 24) {
    const dnu = Math.floor(h / 24);
    return `${czCount(dnu, DEN)} a ${h - dnu * 24} h`;
  }
  return h > 0 ? `${h} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`;
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
  const ja = useJa();
  const smi = useSmi();
  const data = useDataWidgetu<Dochazka>(ja.id != null ? URL_DNES : null, vyberDochazku);
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
      setChyba(apiMessage(e, 'Píchnutí se nepovedlo. Zkus to znovu.'));
    } finally {
      setPise(false);
    }
  };

  const tlacitko = (
    <Button variant="primary" size="sm" block icon={naSmene ? 'logout' : 'clock'} loading={pise} onClick={pichni}
      aria-label={naSmene ? 'Odpíchnout odchod' : 'Odpíchnout příchod'}>
      {S ? (naSmene ? 'Odchod' : 'Příchod') : naSmene ? 'Odpíchnout odchod' : 'Odpíchnout příchod'}
    </Button>
  );
  const hlaseni = (
    <>
      {chyba && <p className="note note-danger !px-3 !py-2 text-[13px]" role="alert">{chyba}</p>}
      {pripomenUzaverku && <p className="t-meta" role="status">Směna skončila. Nezapomeň vyplnit uzávěrku.</p>}
    </>
  );

  return (
    <Widget
      nacteni={ja.stav ?? data}
      // V malém se chip vedle titulku nevejde (titulek by se zkrátil) — stav tam nese tělo.
      doplnek={S ? undefined : zapomenuty ? <Chip tone="wait" size="sm">Zapomenutý odchod</Chip>
        : naSmene ? <Chip tone="ok" size="sm">Na směně</Chip> : undefined}
    >
      {S ? (
        <div className="space-y-2.5">
          {zapomenuty ? (
            <p className="note note-wait !px-3 !py-2 text-[13px]">Běží od {odKdy(openSince)}</p>
          ) : naSmene ? (
            <Stat label={`Příchod ${dbTimeHM(openSince)}`} value={stopky(bezi, false)} />
          ) : (
            <p className="t-meta">Teď nejsi na směně.</p>
          )}
          {hlaseni}
          {tlacitko}
        </div>
      ) : (
        <div className="space-y-3">
          {zapomenuty ? (
            <p className="note note-wait">
              Příchod běží od {odKdy(openSince)} — to je {delkaSlovy(bezi)}. Odpíchni odchod, ať docházka sedí.
            </p>
          ) : naSmene ? (
            // „Na směně" už říká chip u titulku — štítek čísla nese čas příchodu.
            <Stat label={`Příchod ${dbTimeHM(openSince)}`} value={stopky(bezi, true)} />
          ) : (
            <p className="t-meta text-pretty">Odpíchni si příchod, až začneš pracovat — čas se začne počítat hned.</p>
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
  const brana = useBrana(['dochazka.zobrazit', 'dochazka.tablet']);
  const smi = useSmi();
  const nav = useNavigace();
  const data = useDataWidgetu<Dochazka>(brana ? URL_DNES : null, vyberDochazku);
  const [ukoncit, setUkoncit] = useState<ClenRosteru | null>(null);
  const [ukoncuji, setUkoncuji] = useState(false);
  const [chybaUkonceni, setChybaUkonceni] = useState<string | null>(null);

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

  const potvrdUkonceni = async () => {
    if (!ukoncit?.openEntryId || ukoncuji) return;
    setUkoncuji(true); setChybaUkonceni(null);
    try {
      // PATCH jen s id = „Ukončit": odchod se zapíše na teď (API /api/attendance).
      await fetch('/api/attendance', {
        method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ id: ukoncit.openEntryId }),
      }).then(okJson);
      setUkoncit(null);
      data.reload();
    } catch (e) {
      setChybaUkonceni(apiMessage(e, 'Směnu se nepodařilo ukončit.'));
    } finally {
      setUkoncuji(false);
    }
  };

  const n = lide.length;
  const pocet = n.toLocaleString('cs-CZ');
  const jeZapomenuty = (od: Date) => Date.now() - od.getTime() > ZAPOMENUTY_MS;

  let telo: ReactNode;
  if (velikost === 'S') {
    telo = (
      <Stat label="Teď" value={pocet} note={
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
        <ul className="flex flex-wrap gap-2" aria-label="Kdo je na směně">
          {lide.slice(0, PILULEK_M).map(({ r, od }) => (
            <li key={r.id} className="min-w-0 max-w-full">
              <PersonChip name={r.name ?? 'Bez jména'} avatar={r.avatar} tone={jeZapomenuty(od) ? 'wait' : 'ok'} meta={`od ${odKdy(r.openSince)}`} />
            </li>
          ))}
        </ul>
        {n > PILULEK_M && <p className="t-meta mt-3">…a dalších {(n - PILULEK_M).toLocaleString('cs-CZ')}</p>}
      </>
    );
  } else {
    telo = (
      <ul className="list">
        {lide.map(({ r, od }) => {
          const zapomenuty = ted - od.getTime() > ZAPOMENUTY_MS;
          const smena = r.shiftStart ? `směna ${hm(r.shiftStart)}–${hm(r.shiftEnd)}` : 'bez plánované směny';
          return (
            <ListRow key={r.id}
              lead={<Avatar emoji={r.avatar} size="sm" />}
              title={r.name ?? 'Bez jména'}
              meta={`příchod ${odKdy(r.openSince)} · ${smena}`}
              value={zapomenuty ? undefined : delkaSlovy(ted - od.getTime())}
              right={zapomenuty ? <Chip tone="wait" size="sm">Zapomenutý odchod?</Chip> : undefined}
              actions={smiUkoncit && r.openEntryId ? (
                <Button variant="secondary" size="sm" onClick={() => { setChybaUkonceni(null); setUkoncit(r); }}
                  aria-label={`Ukončit směnu: ${r.name ?? 'bez jména'}`}>
                  Ukončit
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
        odkaz={velikost === 'S' ? undefined : { popisek: 'Docházka', pohled: 'attendance' }}
        otevrit={velikost === 'S' && !nahled && nav.smiPohled('attendance') ? () => nav.onNavigate('attendance') : undefined}
        prazdno={n === 0 ? <p className="t-meta">Teď není nikdo napíchnutý.</p> : undefined}
      >
        {telo}
      </Widget>
      {/* Okno přes portál: karta widgetu může mít transformaci (FLIP, promáčknutí)
          a `fixed` uvnitř transformovaného předka by se kreslilo do karty. */}
      {ukoncit && typeof document !== 'undefined' && createPortal(
        <Modal open onClose={() => setUkoncit(null)} size="sm" title="Ukončit směnu" subtitle={ukoncit.name}
          footer={<>
            <Button variant="secondary" onClick={() => setUkoncit(null)}>Zrušit</Button>
            <Button variant="primary" loading={ukoncuji} onClick={potvrdUkonceni}>Ukončit směnu</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">
            Odchod se zapíše na teď ({pragueHM()}).
            {nav.smiPohled('attendance') ? ' Jiný čas pak opravíš v Docházce.' : ''}
          </p>
          {chybaUkonceni && <p className="note note-danger mt-3" role="alert">{chybaUkonceni}</p>}
        </Modal>,
        document.body,
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Odpracováno
// ---------------------------------------------------------------------------

const ZAZNAMU_BEZ: { one: string; few: string; many: string } = { one: 'záznamu', few: 'záznamů', many: 'záznamů' };

function Odpracovano(_: WidgetProps) {
  const ja = useJa();
  const { nacteno, ma } = useOpravneni();
  const dnes = pragueToday();
  const mesic = dnes.slice(0, 7);
  // S dochazka.zobrazit vrací API záznamy CELÉHO týmu za tolik dní, kolik se
  // řekne (vlastní se z nich vyberou podle id); bez něj vlastní záznamy za
  // 60 dní a počet dní ignoruje — pak stačí sdílená denní adresa. Při výpadku
  // oprávnění se bere delší okno: je správné pro obě větve.
  const tymova = nacteno ? ma('dochazka.zobrazit') : true;
  // Jen tabletové oprávnění dostane roster bez záznamů — hodiny z toho nespočítáme.
  const bezZaznamu = nacteno && !ma('dochazka.zobrazit') && ma('dochazka.tablet');
  const dnuMesice = Number(dnes.slice(8, 10)) + 1;
  const url = ja.id == null || bezZaznamu ? null : tymova ? `/api/attendance?days=${dnuMesice}` : URL_DNES;
  const data = useDataWidgetu<Dochazka>(url, vyberDochazku);

  const moje = useMemo(() => (data.data?.entries ?? []).filter(e => ja.id != null && Number(e.employeeId) === ja.id), [data.data, ja.id]);
  const maOtevreny = moje.some(e => !e.clockOut);
  const ted = useTed(maOtevreny, 60_000);

  const soucet = useMemo(() => {
    let ms = 0, bezi = false, zapomenuty = false, vynechano = 0;
    for (const e of moje) {
      const od = parseDbTime(e.clockIn);
      if (!od || pragueDayOf(od).slice(0, 7) !== mesic) continue;
      if (!e.clockOut) {
        // Běžící směna se počítá do teď; zapomenutý odchod se nepřičítá, jen přizná.
        const d = ted - od.getTime();
        if (d > ZAPOMENUTY_MS) zapomenuty = true;
        else if (d > 0) { ms += d; bezi = true; }
        continue;
      }
      const konec = parseDbTime(e.clockOut);
      if (!konec) continue;
      const d = konec.getTime() - od.getTime();
      if (d <= 0) continue;
      // Stejné pravidlo jako mzdy (lib/wages): záznam delší než den je zapomenuté odpíchnutí.
      if (d >= MAX_SHIFT_HOURS * 3600 * 1000) { vynechano += 1; continue; }
      ms += d;
    }
    return { ms, bezi, zapomenuty, vynechano };
  }, [moje, mesic, ted]);

  const minut = Math.floor(soucet.ms / 60000);
  const h = Math.floor(minut / 60);
  const min = minut % 60;
  const [r, m] = mesic.split('-').map(Number);
  const nazevMesice = new Date(r, m - 1, 1).toLocaleDateString('cs-CZ', { month: 'long' });

  const poznamka = soucet.zapomenuty ? <Chip tone="wait" size="sm">Zapomenutý odchod</Chip>
    : soucet.vynechano > 0 ? `bez ${soucet.vynechano.toLocaleString('cs-CZ')} ${czForm(soucet.vynechano, ZAZNAMU_BEZ)} nad 24 h`
    : soucet.bezi ? 'včetně běžící směny' : 'podle píchaček';

  return (
    <Widget
      nacteni={ja.stav ?? data}
      prazdno={bezZaznamu ? <p className="t-meta text-pretty">S touhle rolí se hodiny z píchaček nedají spočítat.</p> : undefined}
    >
      <Stat label={nazevMesice} value={h.toLocaleString('cs-CZ')} unit={min > 0 ? `h ${min} min` : 'h'} note={poznamka} />
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'dochazka.moje_pichacky': Pichacky,
  'dochazka.prave_na_smene': PraveNaSmene,
  'dochazka.moje_odpracovano': Odpracovano,
};
