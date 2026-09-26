'use client';

// Widgety oblasti „Rozvrh" — komponenty (kolo 68, spec §2.5, §6.1).
//
// Vlastník v kole 69: balík B1 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/rozvrh.ts;
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — hlídá to test AK-20 v scripts/testy/k68-widgety.ts.
//
// Kontrakt (spec §2.6): komponenta dostane WidgetProps (instance, velikost, nastaveni,
// nahled), kreslí se vždy v obalu <Widget> z ../Widget, data bere jen přes useDataWidgetu
// (URL null, dokud neplatí brána z registru a useSmi pro pole), navigaci přes useNavigace.
// Soubor se stahuje líně, až když je widget oblasti na ploše (registr.ts).
//
// Co tu je (kolo 68):
//  - rozvrh.dnesni_smeny — N5: dřív bral /api/shifts, které jména nevrací, a u každého
//    stálo „Zaměstnanec". Teď podle toho, na co divák má: plánovač /api/schedule,
//    náhled /api/shifts?team=1, tablet roster docházky. Seznam `.list` místo jamek,
//    typ směny tečkou `cat-dot-*` (ne stavovou barvou), příchod chipem;
//  - rozvrh.dostupnost_tymu — N11: dřív hlídal jen smi('shifts'), takže role s náhledem
//    rozvrhu viděla „1 z 10 zadalo" (server jí vrátil jen vlastní záznam). Teď brána
//    dostupnost.zobrazit, lidé jako PersonChip, „Sestavit rozvrh" `secondary`
//    (druhá limetka na Přehledu pryč) a jen s rozvrh.generovat;
//  - rozvrh.pripominka_dostupnosti — výzva místo limetkové karty s vykáním.
//
// Kolo 69 (balík B1) — bloky, které visely natvrdo nad plánovačem a pod ním:
//  - rozvrh.diry — dřív červená tónovaná karta s řádky jako bílé jamky nad mřížkou
//    (druhá tónovaná plocha na obrazovce). Teď seznam dnů; klepnutí otevře den
//    v plánovači (událost UDALOST_DEN), jinde přejde na Rozvrh;
//  - rozvrh.zadosti_volno — dřív TimeOffApprovals pod rozvrhem: limetka „Schválit"
//    v každém řádku, řádky jako jamky, „✎ Upravit", confirm() při rušení. Teď
//    `primary` Schválit a `danger` Zamítnout (DP §3.1), schválené volno s nabídkou
//    „···" a okna <Modal>; hromadně přes „Vybrat víc" v nabídce widgetu;
//  - rozvrh.vymeny — dřív dvě komponenty (ShiftSwapApprovals s modrou tónovanou
//    kartou a limetkou, ShiftSwap s kartou na každou nabídku). Teď jedna burza:
//    ke schválení (vedení), volné směny kolegů, moje nabídky;
//  - rozvrh.hodiny_lidi, rozvrh.poptavka — nové z dat, která API už vracelo;
//  - rozvrh.tym_nahled — dřív TeamSchedule v Mých směnách s ručními limetkovými
//    pilulkami; teď PersonChip (vlastní směna tónem ok, jméno „Ty").
//
// Widget, který mění rozvrh (schválená výměna, schválené volno), pošle UDALOST_ZMENA —
// plánovač se znovu načte, aby nenabízel člověka na den, kdy má dovolenou.

import { useMemo, useState, type ReactNode } from 'react';
import {
  Avatar, BulkBar, Button, Chip, EmptyState, Field, Input, ListRow, Menu, Modal, PersonChip, SelectBox, Stat,
  runBulk, useSelection, type MenuItem,
} from '../../ui';
import type { KomponentaWidgetu, Navigace, WidgetProps } from '@/lib/widgety/typy';
import { Widget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { obnovOpravneni, useOpravneni } from '../../role/useOpravneni';
import { apiMessage, okJson } from '@/lib/api';
import { czCount, czForm, czVerb, DEN, SMENA } from '@/lib/czech';
import { parseDbTime, pragueDayOf, pragueHM, pragueToday } from '@/lib/pragueTime';
import {
  KLIC_DEN, KLIC_DOSTUPNOST, UDALOST_DEN, UDALOST_DOSTUPNOST, UDALOST_ZMENA,
  den, denKratce, denVetou, dnySDirou, hm, hodinyLidi, hodinyText, kategorieBarvy, popisDiry, poptavkaTop,
  rozdelBurzu, rozsahVolna, tymPoDnech, TYP_VOLNA, zadostiVolna,
  type NabidkaSmeny, type SmenaNahledu, type SmenaRozvrhu, type ZadostVolna,
} from '@/lib/rozvrhPrehled';

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

/** „RRRR-MM" posunutý o měsíce — z pražského dne, ne z hodin serveru. */
function mesicZa(o: number): string {
  const [r, m] = pragueToday().split('-').map(Number);
  const d = new Date(r, m - 1 + o, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** „říjen" — první pád se hodí za „na" i jako štítek (t-label ho dá verzálkami). */
function jmenoMesice(mesic: string): string {
  const [r, m] = mesic.split('-').map(Number);
  return new Date(r, m - 1, 1).toLocaleDateString('cs-CZ', { month: 'long' });
}

const LIDE = { one: 'člověk', few: 'lidé', many: 'lidí' };
const HOST = { one: 'host', few: 'hosté', many: 'hostů' };
const REZERVACE = { one: 'rezervace', few: 'rezervace', many: 'rezervací' };
const ZADOST = { one: 'žádost', few: 'žádosti', many: 'žádostí' };
const VYMENA = { one: 'výměna', few: 'výměny', many: 'výměn' };
const cislo = (n: number) => n.toLocaleString('cs-CZ');

/**
 * Widget žádá nástroj stránky Rozvrh (otevřít den, vyplnit dostupnost). Na
 * stránce ho plánovač slyší hned; jinde si žádost počká v sessionStorage
 * a widget přejde na Rozvrh (layout argument pohledu nepředává).
 */
function predejNastroji(nav: Navigace, udalost: string, klic: string, hodnota: string): void {
  const detail = { hodnota, prijato: false };
  window.dispatchEvent(new CustomEvent(udalost, { detail }));
  if (detail.prijato || !nav.smiPohled('shifts')) return;
  try { sessionStorage.setItem(klic, hodnota); } catch { /* soukromé okno: Rozvrh se otevře bez předvyplnění */ }
  nav.onNavigate('shifts');
}

/** Po zápisu, který mění rozvrh: plánovač a Moje směny se znovu načtou. */
const oznamZmenu = () => window.dispatchEvent(new CustomEvent(UDALOST_ZMENA));

/** „…a dalších N" pod useknutým seznamem (DP §3.6: tichý strop seznamu je zakázaný). */
function ADalsich({ n }: { n: number }) {
  return n > 0 ? <p className="t-meta mt-2">…a dalších {cislo(n)}</p> : null;
}

/** Čas směny: „08:00–16:00". */
const casSmeny = (od: unknown, doCasu: unknown) => (hm(od) ? `${hm(od)}–${hm(doCasu)}` : '');

// Typ směny nese kategorie (cat-dot-1…6), ne stavová barva (lib/rozvrhPrehled).
const katBarvy = kategorieBarvy;
// Staré typy bez nastavení (API /api/shifts má stejný převod).
const STARE_TYPY: Record<string, { nazev: string; barva: string | null }> = {
  morning: { nazev: 'Ranní', barva: '#C8F542' },
  afternoon: { nazev: 'Odpolední', barva: '#3B82F6' },
  flexible: { nazev: 'Vlastní', barva: null },
  // Směna založená příchodem bez plánu (/api/attendance → ensureShift).
  auto: { nazev: 'Mimo rozvrh', barva: null },
  custom: { nazev: 'Směna', barva: null },
};

function TeckaTypu({ kat }: { kat: number | null }) {
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full align-middle mr-1.5 ${kat ? `cat-dot-${kat}` : 'bg-black/15'}`} />;
}

// ---------------------------------------------------------------------------
// Dnešní směny
// ---------------------------------------------------------------------------

interface TypSmeny { name: string; startTime?: string | null; endTime?: string | null; color?: string | null }

interface SmenaNaPloše {
  klic: string;
  employeeId: number | null;
  jmeno: string;
  avatar: string | null;
  od: string;
  do: string;
  typ: string | null;
  kat: number | null;
}

type ZdrojSmen = 'planovac' | 'nahled' | 'tablet';

const POLE_PRICHODY = ['dochazka.zobrazit', 'dochazka.tablet'];
const URL_DOCHAZKA = '/api/attendance?days=1';

/** Pole ze známého klíče odpovědi; jiný tvar je chyba widgetu, ne prázdný rozvrh. */
function poleZ(klic: string, popis: string) {
  return (raw: any): any[] => {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw[klic])) throw new Error(`${popis} přišel v nečekaném tvaru.`);
    return raw[klic];
  };
}
const vyberRozvrh = poleZ('shifts', 'Rozvrh');
const vyberRoster = poleZ('roster', 'Seznam lidí na směně');
function vyberNahled(raw: any): { zapnuto: boolean; smeny: any[] } {
  // Bez rozvrh.nahled vrací API tvar „vypnuto" (enabled: false), ne 403.
  if (raw && typeof raw === 'object' && raw.enabled === false) return { zapnuto: false, smeny: [] };
  return { zapnuto: true, smeny: vyberRozvrh(raw) };
}
const vyberTypy = (raw: any): TypSmeny[] => (Array.isArray(raw?.shiftTypes) ? raw.shiftTypes : []);
function vyberPrichody(raw: any): { roster: any[]; entries: any[] } {
  return { roster: vyberRoster(raw), entries: Array.isArray(raw?.entries) ? raw.entries : [] };
}

/** Typ směny z plánovače: podle názvu, pak podle časů (jako typeResolver v API), pak staré typy. */
function typZPlanovace(s: any, typy: readonly TypSmeny[]): { typ: string | null; kat: number | null } {
  const t = typy.find(x => x.name === s.type) ?? typy.find(x => hm(x.startTime) === hm(s.startTime) && hm(x.endTime) === hm(s.endTime));
  if (t) return { typ: t.name, kat: katBarvy(t.color) };
  const stary = STARE_TYPY[String(s.type ?? '')];
  if (stary) return { typ: stary.nazev, kat: katBarvy(stary.barva) };
  return { typ: s.type ? String(s.type) : null, kat: null };
}

const CHYBA_OPRAVNENI: StavNacteni = {
  data: null, error: 'Nevím, co smíš vidět — oprávnění se nenačetla.', loading: false, reload: obnovOpravneni,
};

type StavPrichodu = 'na-smene' | 'po-smene' | 'chybi' | null;
const TOLERANCE_MIN = 5;
/** „08:30" → 510; porovnávat časy jako čísla, ne jako text. */
function minuty(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function DnesniSmeny({ velikost, nastaveni, nahled }: WidgetProps<{ den?: string }>) {
  const brana = useBrana(['rozvrh.zobrazit', 'rozvrh.nahled', 'dochazka.tablet', 'dochazka.zobrazit']);
  const { nacteno } = useOpravneni();
  const smi = useSmi();
  const nav = useNavigace();
  const zitra = nastaveni.den === 'zitra';
  const cilovyDen = pragueToday(zitra ? 1 : 0);
  const mesic = cilovyDen.slice(0, 7);

  // Zdroj podle toho, na co divák má (pole v katalogu: planovac / nahled / prichody).
  const zdroj: ZdrojSmen | null = smi('rozvrh.zobrazit') ? 'planovac' : smi('rozvrh.nahled') ? 'nahled'
    : smi(POLE_PRICHODY) ? 'tablet' : null;
  // Tablet vidí jen dnešní plán (roster nese směnu jen na dnešek).
  const tabletZitra = zdroj === 'tablet' && zitra;
  const chciPrichody = !zitra && smi(POLE_PRICHODY);

  const planovac = useDataWidgetu(brana && zdroj === 'planovac' ? `/api/schedule?month=${mesic}` : null, vyberRozvrh);
  // Typy jen kvůli barvě tečky — jejich výpadek widget neshodí (není v `nacteni`).
  const typy = useDataWidgetu(brana && zdroj === 'planovac' ? '/api/shift-types' : null, vyberTypy);
  const nahledRozvrhu = useDataWidgetu(brana && zdroj === 'nahled' ? `/api/shifts?team=1&month=${mesic}` : null, vyberNahled);
  const dochazka = useDataWidgetu(brana && (chciPrichody || (zdroj === 'tablet' && !zitra)) ? URL_DOCHAZKA : null, vyberPrichody);

  const smeny = useMemo<SmenaNaPloše[]>(() => {
    let out: SmenaNaPloše[] = [];
    if (zdroj === 'planovac') {
      out = (planovac.data ?? []).filter(s => den(s.date) === cilovyDen).map((s, i) => ({
        klic: `p-${s.id ?? i}`, employeeId: s.employeeId ?? null, jmeno: s.employeeName ?? 'Bez jména',
        avatar: s.employeeAvatar ?? null, od: hm(s.startTime), do: hm(s.endTime), ...typZPlanovace(s, typy.data ?? []),
      }));
    } else if (zdroj === 'nahled') {
      out = (nahledRozvrhu.data?.smeny ?? []).filter(s => den(s.date) === cilovyDen).map((s, i) => ({
        klic: `n-${s.id ?? i}`, employeeId: s.employeeId ?? null, jmeno: s.employeeName ?? 'Bez jména',
        avatar: s.employeeAvatar ?? null, od: hm(s.startTime ?? s.start_time), do: hm(s.endTime ?? s.end_time),
        typ: STARE_TYPY[String(s.typeLabel ?? '')]?.nazev ?? (s.typeLabel ? String(s.typeLabel) : null), kat: katBarvy(s.typeColor),
      }));
    } else if (zdroj === 'tablet' && !zitra) {
      out = (dochazka.data?.roster ?? []).filter(r => r.shiftStart).map(r => ({
        klic: `t-${r.id}`, employeeId: r.id ?? null, jmeno: r.name ?? 'Bez jména', avatar: r.avatar ?? null,
        od: hm(r.shiftStart), do: hm(r.shiftEnd), typ: null, kat: null,
      }));
    }
    return out.sort((a, b) => a.od.localeCompare(b.od) || a.jmeno.localeCompare(b.jmeno, 'cs'));
  }, [zdroj, planovac.data, typy.data, nahledRozvrhu.data, dochazka.data, cilovyDen, zitra]);

  // Stav příchodu jen dnes a jen s docházkou, po řádcích (člověk může mít dvě
  // směny za den): otevřený příchod = na směně. „Po směně" a „ještě tu není"
  // jen se záznamy (dochazka.zobrazit) — tablet vidí jen otevřené příchody
  // a člověka, který přišel a odešel dřív, by označil jako chybějícího.
  const znamZaznamy = smi('dochazka.zobrazit');
  const prichody = useMemo(() => {
    const m = new Map<string, StavPrichodu>();
    if (!chciPrichody || !dochazka.data) return m;
    const dnes = pragueToday();
    const otevreno = new Set<number>();
    for (const r of dochazka.data.roster) if (parseDbTime(r.openSince)) otevreno.add(Number(r.id));
    const dnesPrisli = new Set<number>();
    for (const e of dochazka.data.entries) {
      const od = parseDbTime(e.clockIn);
      if (od && pragueDayOf(od) === dnes) dnesPrisli.add(Number(e.employeeId));
    }
    const nyni = minuty(pragueHM());
    for (const s of smeny) {
      if (s.employeeId == null) continue;
      if (otevreno.has(s.employeeId)) { m.set(s.klic, 'na-smene'); continue; }
      if (!znamZaznamy || !s.od) continue;
      const od = minuty(s.od);
      const konec = s.do ? minuty(s.do) : null;
      const zacala = nyni >= od;
      const bezi = zacala && (konec == null || konec < od /* přes půlnoc */ || nyni < konec);
      if (zacala && dnesPrisli.has(s.employeeId)) m.set(s.klic, 'po-smene');
      // Pět minut tolerance: kdo si píchá v 8:02 na směnu od 8:00, nechybí.
      else if (bezi && nyni >= od + TOLERANCE_MIN) m.set(s.klic, 'chybi');
    }
    return m;
  }, [chciPrichody, znamZaznamy, dochazka.data, smeny]);

  const S = velikost === 'S';
  const L = velikost === 'L';
  const cil = nav.smiPohled('shifts') ? { popisek: 'Rozvrh', pohled: 'shifts' } : { popisek: 'Moje směny', pohled: 'my-shifts' };

  // Bez oprávnění ho plocha vůbec nepřipojí; kdyby přece, nesmí tvrdit „nikdo nemá směnu".
  if (!brana) return <Widget prazdno={null} />;
  // Vypnuté dotazy (url null) obal nepočítá, takže stačí dát všechny.
  const nacteni: StavNacteni | StavNacteni[] = nacteno ? [planovac, nahledRozvrhu, dochazka] : CHYBA_OPRAVNENI;

  const kdy = zitra ? 'Zítra' : 'Dnes';
  let prazdno: ReactNode | undefined;
  if (nacteno && !zdroj) prazdno = <p className="t-meta">Rozvrh tvoje role nevidí.</p>;
  else if (tabletZitra) prazdno = <p className="t-meta text-pretty">S touhle rolí uvidíš jen dnešní směny.</p>;
  else if (zdroj === 'nahled' && nahledRozvrhu.data && !nahledRozvrhu.data.zapnuto) prazdno = <p className="t-meta">Rozvrh týmu je v podniku vypnutý.</p>;
  else if (smeny.length === 0) prazdno = <p className="t-meta">{kdy} nemá nikdo naplánovanou směnu.</p>;

  // Jen lidé s dnešní směnou — napíchnutý bez směny do „kolik z plánu je tu" nepatří.
  const naSmene = new Set(smeny.filter(s => prichody.get(s.klic) === 'na-smene').map(s => s.employeeId)).size;
  const pocet = smeny.length.toLocaleString('cs-CZ');

  const chipPrichodu = (klic: string) => {
    const st = prichody.get(klic) ?? null;
    if (st === 'na-smene') return <Chip tone="ok" size="sm">Na směně</Chip>;
    if (st === 'po-smene') return <Chip tone="muted" size="sm">Po směně</Chip>;
    if (st === 'chybi') return <Chip tone="wait" size="sm">Ještě tu není</Chip>;
    return undefined;
  };

  const radky = L ? smeny : smeny.slice(0, 5);
  return (
    <Widget
      titulek={zitra ? 'Zítřejší směny' : undefined}
      nacteni={nacteni}
      doplnek={!S && smeny.length > 0 ? <Chip tone="muted" size="sm">{pocet}</Chip> : undefined}
      odkaz={S ? undefined : cil}
      otevrit={S && !nahled && nav.smiPohled(cil.pohled) ? () => nav.onNavigate(cil.pohled) : undefined}
      prazdno={prazdno}
    >
      {S ? (
        <Stat label={kdy} value={pocet}
          note={chciPrichody ? `${czCount(naSmene, LIDE)} na směně` : smeny[0] ? `první od ${smeny[0].od}` : undefined} />
      ) : (
        <>
          <ul className="list">
            {radky.map(s => (
              <ListRow key={s.klic}
                lead={<Avatar emoji={s.avatar} size="sm" />}
                title={s.jmeno}
                meta={s.typ ? <><TeckaTypu kat={s.kat} />{s.typ}</> : undefined}
                value={s.od ? `${s.od}–${s.do}` : undefined}
                right={chipPrichodu(s.klic)}
              />
            ))}
          </ul>
          {!L && smeny.length > 5 && <p className="t-meta mt-2">…a dalších {(smeny.length - 5).toLocaleString('cs-CZ')}</p>}
        </>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Dostupnost týmu
// ---------------------------------------------------------------------------

interface Odevzdani { employeeId: number; unavailableDates?: unknown[] }
interface Clen { id: number; name: string; avatar?: string | null; role?: string }

function vyberOdevzdani(raw: any): Odevzdani[] {
  // Bez dostupnost.zobrazit by API vrátilo jen vlastní záznam (nebo null) —
  // to je jiný tvar, ne „nikdo nezadal".
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.submissions)) throw new Error('Dostupnost týmu přišla v nečekaném tvaru.');
  return raw.submissions;
}
function vyberCleny(raw: any): Clen[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.members)) throw new Error('Seznam lidí přišel v nečekaném tvaru.');
  // Jako plánovač (ScheduleBuilder, `assignable`): rozvrh se skládá z vedení
  // i zaměstnanců, tablet do něj nepatří. Jinak by widget počítal jinak než Rozvrh.
  return raw.members.filter((m: any) => m && (m.role === 'employee' || m.role === 'employer'));
}

/** Kolik jmen ukázat jako pilulky ve střední velikosti. */
const PILULEK_M = 10;

function DostupnostTymu({ velikost, nastaveni, nahled }: WidgetProps<{ mesic?: string }>) {
  const brana = useBrana(['dostupnost.zobrazit']);
  const smi = useSmi();
  const nav = useNavigace();
  const mesic = nastaveni.mesic === 'tento' ? mesicZa(0) : mesicZa(1);
  const odevzdani = useDataWidgetu(brana ? `/api/availability?month=${mesic}` : null, vyberOdevzdani);
  const clenove = useDataWidgetu(brana ? '/api/teams' : null, vyberCleny);

  const { zadali, chybi, blokovano } = useMemo(() => {
    const podle = new Map<number, Odevzdani>();
    for (const o of odevzdani.data ?? []) podle.set(Number(o.employeeId), o);
    const lide = [...(clenove.data ?? [])].sort((a, b) => String(a.name).localeCompare(String(b.name), 'cs'));
    return {
      zadali: lide.filter(c => podle.has(Number(c.id))),
      chybi: lide.filter(c => !podle.has(Number(c.id))),
      // Jen počet blokovaných dní — poznámky k dostupnosti jsou osobní a do widgetu nepatří.
      blokovano: (id: number) => (Array.isArray(podle.get(id)?.unavailableDates) ? podle.get(id)!.unavailableDates!.length : 0),
    };
  }, [odevzdani.data, clenove.data]);

  // Bez oprávnění ho plocha vůbec nepřipojí; kdyby přece, nesmí tvrdit „v týmu nikdo není".
  if (!brana) return <Widget prazdno={null} />;

  const celkem = zadali.length + chybi.length;
  const naMesic = jmenoMesice(mesic);
  const smiSestavit = !nahled && smi('rozvrh.generovat') && nav.smiPohled('shifts');
  // Pole katalogu akce:vyplnit_za_cloveka — okno dostupnosti je v plánovači Rozvrhu.
  const smiVyplnit = !nahled && smi('dostupnost.upravit') && nav.smiPohled('shifts');
  const sestavit = smiSestavit ? (
    <Button variant="secondary" size="sm" icon="calendar" onClick={() => nav.onNavigate('shifts')}>Sestavit rozvrh</Button>
  ) : null;
  const shrnuti = <p className="t-meta">Na {naMesic} zadalo {zadali.length.toLocaleString('cs-CZ')} z {celkem.toLocaleString('cs-CZ')}.</p>;
  const vsichni = chybi.length === 0 && celkem > 0 ? (
    <p className="note note-ok">Všichni zadali dostupnost na {naMesic}{smiSestavit ? ' — můžeš sestavit rozvrh.' : '.'}</p>
  ) : null;

  let telo: ReactNode;
  if (velikost === 'S') {
    telo = (
      <Stat label={naMesic} value={zadali.length.toLocaleString('cs-CZ')} unit={`z ${celkem.toLocaleString('cs-CZ')}`}
        note={chybi.length === 0 ? 'všichni zadali' : `${czVerb(chybi.length, 'zbývá', 'zbývají')} ${czCount(chybi.length, LIDE)}`} />
    );
  } else if (velikost === 'M') {
    telo = (
      <div className="space-y-3">
        {vsichni ?? (
          <>
            {shrnuti}
            <ul className="flex flex-wrap gap-2" aria-label="Kdo ještě nezadal">
              {chybi.slice(0, PILULEK_M).map(c => (
                <li key={c.id} className="min-w-0 max-w-full"><PersonChip name={c.name} avatar={c.avatar} /></li>
              ))}
            </ul>
            {chybi.length > PILULEK_M && <p className="t-meta">…a dalších {(chybi.length - PILULEK_M).toLocaleString('cs-CZ')}</p>}
          </>
        )}
        {sestavit}
      </div>
    );
  } else {
    telo = (
      <div className="space-y-3">
        {vsichni ?? shrnuti}
        <ul className="list">
          {[...chybi, ...zadali].map(c => {
            const zadal = !chybi.includes(c);
            const dnu = blokovano(Number(c.id));
            const obsah = {
              lead: <Avatar emoji={c.avatar} size="sm" />,
              title: c.name,
              meta: !zadal ? 'ještě nezadáno' : dnu === 0 ? 'bez omezení' : `nemůže ${czCount(dnu, DEN)}`,
              right: zadal ? <Chip tone="ok" size="sm">Zadáno</Chip> : <Chip tone="wait" size="sm">Chybí</Chip>,
            };
            // Klepnutí otevře okno dostupnosti toho člověka v plánovači (vyplnit za něj / opravit).
            // Klikací řádek: vlastní <li> + ListRow as="div", jinak .list ztratí linku (DP §3.6).
            return smiVyplnit
              ? <li key={c.id}><ListRow as="div" {...obsah} onClick={() => predejNastroji(nav, UDALOST_DOSTUPNOST, KLIC_DOSTUPNOST, `${c.id}|${mesic}`)} /></li>
              : <ListRow key={c.id} {...obsah} />;
          })}
        </ul>
        {sestavit}
      </div>
    );
  }

  return (
    <Widget
      nacteni={[odevzdani, clenove]}
      doplnek={velikost !== 'S' && chybi.length > 0 ? <Chip tone="wait" size="sm">{chybi.length.toLocaleString('cs-CZ')}</Chip> : undefined}
      otevrit={velikost === 'S' && !nahled && nav.smiPohled('shifts') ? () => nav.onNavigate('shifts') : undefined}
      prazdno={celkem === 0 ? (velikost === 'S' ? <p className="t-meta">V týmu zatím nikdo není.</p> : (
        <EmptyState compact icon="users" title="V týmu zatím nikdo není"
          hint="Až pozveš lidi, uvidíš tu, kdo zadal dostupnost."
          action={!nahled && nav.smiPohled('team-settings')
            ? <Button variant="secondary" size="sm" icon="plus" onClick={() => nav.onNavigate('team-settings')}>Pozvat lidi</Button>
            : undefined} />
      )) : undefined}
    >
      {telo}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Zadej dostupnost
// ---------------------------------------------------------------------------

/** `?mine=1`: vlastní záznam i pro vedení, kterému by API jinak vrátilo celý tým. */
function vyberVlastni(raw: any): { odeslano: boolean } {
  if (raw === null) return { odeslano: false };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { odeslano: true };
  throw new Error('Dostupnost přišla v nečekaném tvaru.');
}

function PripominkaDostupnosti({ velikost, nahled }: WidgetProps) {
  const nav = useNavigace();
  const mesic = mesicZa(1);
  const data = useDataWidgetu(`/api/availability?month=${mesic}&mine=1`, vyberVlastni);
  const odeslano = data.data?.odeslano === true;
  const naMesic = jmenoMesice(mesic);
  // Zaměstnanec má vlastní záložku Dostupnost, vedení ji má v Mých směnách.
  const pohled = nav.smiPohled('availability') ? 'availability' : 'my-shifts';
  const muze = !nahled && nav.smiPohled(pohled);
  const S = velikost === 'S';

  return (
    <Widget
      nacteni={data}
      odkaz={!S && odeslano ? { popisek: 'Upravit', pohled } : undefined}
      otevrit={S && muze ? () => nav.onNavigate(pohled) : undefined}
    >
      {S ? (
        <div className="space-y-1.5">
          <p className="t-label">{naMesic}</p>
          {odeslano ? <Chip tone="ok" icon="check">Odesláno</Chip> : <Chip tone="wait">Nezadáno</Chip>}
        </div>
      ) : odeslano ? (
        <p className="t-meta">Dostupnost na {naMesic} máš odeslanou.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-[15px] font-medium leading-snug text-[#16181A] text-pretty">Dostupnost na {naMesic} ještě nemáš zadanou.</p>
            <p className="t-meta mt-1 text-pretty">Dej vedení vědět, kdy nemůžeš — podle toho sestaví rozvrh.</p>
          </div>
          {muze && <Button variant="primary" size="sm" icon="calendar" onClick={() => nav.onNavigate(pohled)}>Zadat dostupnost</Button>}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Díry v obsazení
// ---------------------------------------------------------------------------

interface DataRozvrhu {
  smeny: SmenaRozvrhu[];
  gaps: { date: string; from: string; to: string }[];
  understaffed: { date: string; shiftTypeName: string }[];
  demand: Record<string, { reservations?: number; guests?: number }>;
}
/** /api/schedule?month → shifts, gaps, understaffed, demand (jeden dotaz pro Díry, Hodiny, Poptávku i plánovač). */
function vyberDataRozvrhu(raw: any): DataRozvrhu {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.shifts)) throw new Error('Rozvrh přišel v nečekaném tvaru.');
  return {
    smeny: raw.shifts,
    gaps: Array.isArray(raw.gaps) ? raw.gaps : [],
    understaffed: Array.isArray(raw.understaffed) ? raw.understaffed : [],
    demand: raw.demand && typeof raw.demand === 'object' ? raw.demand : {},
  };
}
const mesicZVolby = (v: unknown) => (v === 'pristi' ? mesicZa(1) : mesicZa(0));

function Diry({ velikost, nastaveni, nahled }: WidgetProps<{ mesic?: string }>) {
  const brana = useBrana(['rozvrh.zobrazit']);
  const smi = useSmi();
  const nav = useNavigace();
  const mesic = mesicZVolby(nastaveni.mesic);
  const data = useDataWidgetu(brana ? `/api/schedule?month=${mesic}` : null, vyberDataRozvrhu);
  const dnes = pragueToday();
  const dny = useMemo(() => (data.data ? dnySDirou(data.data.gaps, data.data.understaffed, dnes) : []), [data.data, dnes]);

  if (!brana) return <Widget prazdno={null} />;
  // Doplnit směnu (pole akce:doplnit_smenu): den se otevře v plánovači.
  const smiDoplnit = !nahled && smi('rozvrh.upravit') && nav.smiPohled('shifts');
  const otevriDen = (d: string) => predejNastroji(nav, UDALOST_DEN, KLIC_DEN, d);
  const S = velikost === 'S';
  const naMesic = jmenoMesice(mesic);

  return (
    <Widget
      nacteni={data}
      doplnek={!S && dny.length > 0 ? <Chip tone="bad" size="sm">{cislo(dny.length)}</Chip> : undefined}
      otevrit={S && smiDoplnit && dny[0] ? () => otevriDen(dny[0].den) : undefined}
      prazdno={dny.length === 0 ? <p className="t-meta text-pretty">Na {naMesic} je obsazeno — bez děr.</p> : undefined}
    >
      {S ? (
        <Stat label={naMesic} value={cislo(dny.length)} note={`${czForm(dny.length, DEN)} s dírou · první ${denKratce(dny[0]?.den ?? dnes, dnes).toLowerCase()}`} />
      ) : (
        <>
          <ul className="list">
            {dny.slice(0, 5).map(d => {
              const obsah = { title: <span className="cz-sentence">{denVetou(d.den)}</span>, meta: popisDiry(d) };
              return smiDoplnit
                ? <li key={d.den}><ListRow as="div" {...obsah} onClick={() => otevriDen(d.den)} /></li>
                : <ListRow key={d.den} {...obsah} />;
            })}
          </ul>
          <ADalsich n={dny.length - 5} />
        </>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Poptávka z rezervací
// ---------------------------------------------------------------------------

function Poptavka({ nastaveni, nahled }: WidgetProps<{ mesic?: string }>) {
  const brana = useBrana(['rozvrh.zobrazit']);
  const nav = useNavigace();
  const mesic = mesicZVolby(nastaveni.mesic);
  const data = useDataWidgetu(brana ? `/api/schedule?month=${mesic}` : null, vyberDataRozvrhu);
  const dnes = pragueToday();
  const dny = useMemo(() => poptavkaTop(data.data?.demand, dnes, 5), [data.data, dnes]);

  if (!brana) return <Widget prazdno={null} />;
  const muze = !nahled && nav.smiPohled('shifts');

  return (
    <Widget
      nacteni={data}
      prazdno={dny.length === 0 ? <p className="t-meta text-pretty">Na {jmenoMesice(mesic)} zatím nikdo nerezervoval.</p> : undefined}
    >
      <ul className="list">
        {dny.map(d => {
          const obsah = {
            title: <span className="cz-sentence">{denVetou(d.den)}</span>,
            meta: czCount(d.rezervaci, REZERVACE),
            value: cislo(d.hostu),
            valueMeta: czForm(d.hostu, HOST),
          };
          return muze
            ? <li key={d.den}><ListRow as="div" {...obsah} onClick={() => predejNastroji(nav, UDALOST_DEN, KLIC_DEN, d.den)} /></li>
            : <ListRow key={d.den} {...obsah} />;
        })}
      </ul>
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Naplánované hodiny
// ---------------------------------------------------------------------------

function vyberPravidla(raw: any): { teamMaxHours: number | null; members: { id: number; maxHours?: number | null }[] } {
  if (!raw || typeof raw !== 'object') throw new Error('Pravidla přišla v nečekaném tvaru.');
  return { teamMaxHours: raw.teamMaxHours ?? null, members: Array.isArray(raw.members) ? raw.members : [] };
}

function HodinyLidi({ velikost, nastaveni }: WidgetProps<{ mesic?: string }>) {
  const brana = useBrana(['rozvrh.zobrazit']);
  const smi = useSmi();
  const mesic = mesicZVolby(nastaveni.mesic);
  const data = useDataWidgetu(brana ? `/api/schedule?month=${mesic}` : null, vyberDataRozvrhu);
  // Limit hodin (pole limit_hodin) jen s rozvrh.nastaveni; jeho výpadek widget neshodí —
  // hodiny platí i bez stropu, jen se neukáže, kdo se k němu blíží.
  const pravidla = useDataWidgetu(brana && smi('rozvrh.nastaveni') ? '/api/schedule/rules' : null, vyberPravidla);
  const lide = useMemo(() => (data.data ? hodinyLidi(data.data.smeny, mesic, pravidla.data) : []), [data.data, pravidla.data, mesic]);

  if (!brana) return <Widget prazdno={null} />;
  const S = velikost === 'S';
  const L = velikost === 'L';
  const naMesic = jmenoMesice(mesic);
  const stav = (c: (typeof lide)[number]) => {
    if (c.podil == null) return undefined;
    if (c.podil > 1) return <Chip tone="bad" size="sm">Nad limitem</Chip>;
    if (c.podil >= 0.9) return <Chip tone="wait" size="sm">U limitu</Chip>;
    return undefined;
  };
  const prvni = lide[0];

  return (
    <Widget
      nacteni={data}
      prazdno={lide.length === 0 ? <p className="t-meta text-pretty">Na {naMesic} zatím nikdo nemá směnu.</p> : undefined}
    >
      {prvni && (S ? (
        <Stat label={prvni.podil != null ? 'Nejblíž limitu' : 'Nejvíc hodin'} value={hodinyText(prvni.hodiny)} unit="h"
          note={<span className="block truncate">{prvni.jmeno}{prvni.limit ? ` · z ${hodinyText(prvni.limit)} h` : ''}</span>} />
      ) : (
        <>
          {pravidla.error && <p className="note note-wait text-sm mb-2">Limity hodin se nenačetly — ukazuju jen naplánované hodiny.</p>}
          <ul className="list">
            {(L ? lide : lide.slice(0, 5)).map(c => (
              <ListRow key={c.employeeId}
                lead={<Avatar emoji={c.avatar} size="sm" />}
                title={c.jmeno}
                meta={czCount(c.smen, SMENA)}
                value={`${hodinyText(c.hodiny)} h`}
                valueMeta={c.limit ? `z ${hodinyText(c.limit)} h` : undefined}
                right={stav(c)}
              />
            ))}
          </ul>
          {!L && <ADalsich n={lide.length - 5} />}
        </>
      ))}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Žádosti o volno (vedení)
// ---------------------------------------------------------------------------

const URL_VOLNO = '/api/timeoff';
function vyberZadosti(raw: any): ZadostVolna[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.requests)) throw new Error('Žádosti o volno přišly v nečekaném tvaru.');
  return raw.requests;
}
const CHYBA_ZAPISU = 'Nepodařilo se to uložit — zkus to znovu.';

function ZadostiVolna({ velikost, nahled }: WidgetProps) {
  const brana = useBrana(['volno.zobrazit']);
  const smi = useSmi();
  const data = useDataWidgetu(brana ? URL_VOLNO : null, vyberZadosti);
  const dnes = pragueToday();
  const { cekajici, schvalene, vyrizene } = useMemo(() => zadostiVolna(data.data ?? [], dnes), [data.data, dnes]);
  const sel = useSelection<number>();
  const [pracuji, setPracuji] = useState<Set<number>>(new Set());
  const [chyba, setChyba] = useState<string | null>(null);
  const [upravit, setUpravit] = useState<{ z: ZadostVolna; od: string; do: string } | null>(null);
  const [zrusit, setZrusit] = useState<ZadostVolna | null>(null);
  const [historie, setHistorie] = useState(false);

  if (!brana) return <Widget prazdno={null} />;
  const smiRozhodnout = !nahled && smi('volno.schvalovat');
  const S = velikost === 'S';
  const L = velikost === 'L';

  const zapis = async (init: RequestInit, url = URL_VOLNO) => {
    const res = await fetch(url, init);
    await okJson(res);
  };
  const patch = (body: object) => zapis({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const hotovo = () => { obnovDataWidgetu(URL_VOLNO); oznamZmenu(); };
  const s = (id: number, on: boolean) => setPracuji(p => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });

  const rozhodni = async (z: ZadostVolna, status: 'approved' | 'rejected') => {
    s(z.id, true); setChyba(null);
    try { await patch({ id: z.id, status }); hotovo(); } catch (e) { setChyba(apiMessage(e, CHYBA_ZAPISU)); }
    s(z.id, false);
  };
  // Po sezóně dovolených leží ve frontě dvacet žádostí — pustí je naráz a řekne, kolik prošlo.
  const rozhodniVic = async (status: 'approved' | 'rejected') => {
    const ids = Array.from(sel.selected);
    if (!ids.length) return;
    setChyba(null);
    setPracuji(new Set(ids));
    const { failed } = await runBulk(ids, id => patch({ id, status }));
    setPracuji(new Set());
    hotovo();
    if (failed.length) { setChyba(failed.length === ids.length ? CHYBA_ZAPISU : `${failed.length} z ${ids.length} se neuložilo — zkus to znovu.`); return; }
    sel.exit();
  };
  const ulozTermin = async () => {
    if (!upravit) return;
    if (!upravit.od || !upravit.do || upravit.od > upravit.do) { setChyba('Konec volna nesmí být před začátkem.'); return; }
    s(upravit.z.id, true); setChyba(null);
    try { await patch({ id: upravit.z.id, fromDate: upravit.od, toDate: upravit.do }); hotovo(); setUpravit(null); }
    catch (e) { setChyba(apiMessage(e, CHYBA_ZAPISU)); }
    s(upravit.z.id, false);
  };
  const zrusVolno = async () => {
    if (!zrusit) return;
    s(zrusit.id, true); setChyba(null);
    try { await zapis({ method: 'DELETE' }, `${URL_VOLNO}?id=${zrusit.id}`); hotovo(); setZrusit(null); }
    catch (e) { setChyba(apiMessage(e, 'Volno se nezrušilo — zkus to znovu.')); }
    s(zrusit.id, false);
  };

  const kdo = (z: ZadostVolna) => z.employeeName || 'Zaměstnanec';
  const meta = (z: ZadostVolna) => <><span className="tabular-nums">{rozsahVolna(den(z.fromDate), den(z.toDate))}</span> · {TYP_VOLNA[z.type] ?? 'Jiné'}{z.note ? ` · ${z.note}` : ''}</>;
  const limit = L ? Infinity : 5;
  const cek = cekajici.slice(0, limit);
  const sch = schvalene.slice(0, Math.max(0, (L ? Infinity : 5) - cek.length));
  const akce: MenuItem[] | undefined = smiRozhodnout && !S && cekajici.length > 1 && !sel.selecting
    ? [{ label: 'Vybrat víc', icon: 'check', onClick: sel.start, hint: 'Schválit nebo zamítnout několik žádostí naráz.' }]
    : undefined;

  return (
    <Widget
      nacteni={data}
      akce={akce}
      doplnek={!S && cekajici.length > 0 ? <Chip tone="wait" size="sm">{cislo(cekajici.length)}</Chip> : undefined}
      prazdno={cekajici.length === 0 && schvalene.length === 0 && (!L || vyrizene.length === 0)
        ? <p className="t-meta">Žádná žádost o volno nečeká.</p> : undefined}
    >
      {S ? (
        // V malé velikosti jen počet: typ volna (nemoc) je citlivý údaj a do dlaždice nepatří.
        <Stat label="Čeká" value={cislo(cekajici.length)}
          note={cekajici.length ? czForm(cekajici.length, ZADOST) : `${cislo(schvalene.length)} schválených`} />
      ) : (
        <div className="space-y-3">
          {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
          {cek.length > 0 && (
            <ul className="list" aria-label="Čekající žádosti">
              {cek.map(z => (
                <ListRow key={z.id}
                  lead={sel.selecting
                    ? <SelectBox checked={sel.has(z.id)} onChange={() => sel.toggle(z.id)} label={`Vybrat žádost — ${kdo(z)}`} />
                    : <Avatar emoji={z.employeeAvatar} size="sm" />}
                  title={kdo(z)}
                  meta={meta(z)}
                  actions={smiRozhodnout && !sel.selecting ? (
                    <>
                      <Button variant="primary" size="sm" loading={pracuji.has(z.id)} onClick={() => rozhodni(z, 'approved')}>Schválit</Button>
                      <Button variant="danger" size="sm" disabled={pracuji.has(z.id)} onClick={() => rozhodni(z, 'rejected')}>Zamítnout</Button>
                    </>
                  ) : undefined}
                  right={!smiRozhodnout ? <Chip tone="wait" size="sm">Čeká</Chip> : undefined}
                />
              ))}
            </ul>
          )}
          {sch.length > 0 && (
            <div>
              <p className="t-label mb-1">Schválené volno</p>
              <ul className="list">
                {sch.map(z => (
                  <ListRow key={z.id}
                    lead={<Avatar emoji={z.employeeAvatar} size="sm" />}
                    title={kdo(z)}
                    meta={meta(z)}
                    actions={smiRozhodnout ? (
                      <Menu size="sm" label={`Další akce s volnem — ${kdo(z)}`} items={[
                        { label: 'Upravit termín…', icon: 'pencil', onClick: () => setUpravit({ z, od: den(z.fromDate), do: den(z.toDate) }) },
                        { label: 'Zrušit volno…', icon: 'trash', danger: true, hint: 'Dotyčný dostane upozornění.', onClick: () => setZrusit(z) },
                      ]} />
                    ) : undefined}
                  />
                ))}
              </ul>
            </div>
          )}
          {!L && <ADalsich n={cekajici.length + schvalene.length - cek.length - sch.length} />}
          {L && vyrizene.length > 0 && (
            <div>
              <Button variant="ghost" size="sm" icon={historie ? 'chevron' : 'chevronRight'} onClick={() => setHistorie(h => !h)} aria-expanded={historie}>
                {historie ? 'Skrýt vyřízené' : `Vyřízené (${cislo(vyrizene.length)})`}
              </Button>
              {historie && (
                <ul className="list mt-1">
                  {vyrizene.map(z => (
                    <ListRow key={z.id} title={kdo(z)} meta={meta(z)}
                      right={z.status === 'approved' ? <Chip tone="ok" size="sm">Schváleno</Chip> : <Chip tone="bad" size="sm">Zamítnuto</Chip>} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {sel.selecting && (
        <BulkBar
          count={sel.count}
          totalLabel={`Vybrat vše (${cislo(cekajici.length)})`}
          onSelectAll={() => sel.selectAll(cekajici.map(z => z.id))}
          onExit={() => { sel.exit(); setChyba(null); }}
          note={chyba}
          actions={[
            { label: 'Schválit', primary: true, disabled: pracuji.size > 0, onClick: () => rozhodniVic('approved') },
            { label: 'Zamítnout', danger: true, disabled: pracuji.size > 0, onClick: () => rozhodniVic('rejected') },
          ]}
        />
      )}
      {upravit && (
        <Modal open onClose={() => setUpravit(null)} size="sm" title="Upravit termín volna" subtitle={kdo(upravit.z)}
          footer={<>
            <Button variant="secondary" onClick={() => setUpravit(null)}>Zrušit</Button>
            <Button variant="primary" loading={pracuji.has(upravit.z.id)} onClick={ulozTermin}>Uložit</Button>
          </>}>
          <div className="grid grid-cols-2 gap-3">
            <Field id="volno-od" label="Od"><Input id="volno-od" type="date" value={upravit.od} onChange={e => setUpravit(u => u && { ...u, od: e.target.value })} /></Field>
            <Field id="volno-do" label="Do"><Input id="volno-do" type="date" value={upravit.do} onChange={e => setUpravit(u => u && { ...u, do: e.target.value })} /></Field>
          </div>
          {chyba && <p className="note note-danger text-sm mt-3" role="alert">{chyba}</p>}
        </Modal>
      )}
      {zrusit && (
        <Modal open onClose={() => setZrusit(null)} size="sm" title="Zrušit schválené volno?"
          subtitle={`${kdo(zrusit)} · ${rozsahVolna(den(zrusit.fromDate), den(zrusit.toDate))}`}
          footer={<>
            <Button variant="secondary" onClick={() => setZrusit(null)}>Nechat</Button>
            <Button variant="danger-solid" icon="trash" loading={pracuji.has(zrusit.id)} onClick={zrusVolno}>Zrušit volno</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">Volno zmizí z rozvrhu a dotyčný dostane upozornění. Generátor ho na ty dny zase může naplánovat.</p>
          {chyba && <p className="note note-danger text-sm mt-3" role="alert">{chyba}</p>}
        </Modal>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Výměny směn (burza)
// ---------------------------------------------------------------------------

const URL_BURZA = '/api/shifts/offers';
function vyberBurzu(raw: any): { nabidky: NabidkaSmeny[]; meId: number | null } {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.offers)) throw new Error('Burza přišla v nečekaném tvaru.');
  return { nabidky: raw.offers, meId: typeof raw.meId === 'number' ? raw.meId : null };
}

type RadekBurzy = { o: NabidkaSmeny; druh: 'schvalit' | 'volna' | 'beru' | 'moje' };

function Vymeny({ velikost, nahled }: WidgetProps) {
  const brana = useBrana(['rozvrh.burza', 'rozvrh.vymeny_schvalovat']);
  const smi = useSmi();
  const data = useDataWidgetu(brana ? URL_BURZA : null, vyberBurzu);
  const dnes = pragueToday();
  const smiSchvalit = smi('rozvrh.vymeny_schvalovat');
  const smiBurza = smi('rozvrh.burza');
  const b = useMemo(() => rozdelBurzu(data.data?.nabidky ?? [], data.data?.meId ?? null, dnes), [data.data, dnes]);
  const sel = useSelection<number>();
  const [pracuji, setPracuji] = useState<Set<number>>(new Set());
  const [chyba, setChyba] = useState<string | null>(null);

  if (!brana) return <Widget prazdno={null} />;
  const S = velikost === 'S';
  const L = velikost === 'L';
  const piseSe = !nahled;

  const radky: RadekBurzy[] = [
    ...(smiSchvalit ? b.keSchvaleni.map(o => ({ o, druh: 'schvalit' as const })) : []),
    ...(smiBurza ? b.volne.map(o => ({ o, druh: 'volna' as const })) : []),
    ...(smiBurza ? b.beru.filter(o => !smiSchvalit).map(o => ({ o, druh: 'beru' as const })) : []),
    ...(smiBurza ? b.moje.filter(o => !(smiSchvalit && o.status === 'claimed')).map(o => ({ o, druh: 'moje' as const })) : []),
  ];

  const s = (id: number, on: boolean) => setPracuji(p => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const patch = async (id: number, action: 'approve' | 'reject' | 'claim' | 'cancel') => {
    const res = await fetch(URL_BURZA, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
    await okJson(res);
  };
  const akceRadku = async (id: number, action: 'approve' | 'reject' | 'claim' | 'cancel') => {
    s(id, true); setChyba(null);
    try {
      await patch(id, action);
      obnovDataWidgetu(URL_BURZA);
      // Schválená výměna přepsala směnu — plánovač a Moje směny se znovu načtou.
      if (action === 'approve') oznamZmenu();
    } catch (e) { setChyba(apiMessage(e, CHYBA_ZAPISU)); }
    s(id, false);
  };
  const schvalVic = async (action: 'approve' | 'reject') => {
    const ids = Array.from(sel.selected);
    if (!ids.length) return;
    setChyba(null); setPracuji(new Set(ids));
    const { failed } = await runBulk(ids, id => patch(id, action));
    setPracuji(new Set());
    obnovDataWidgetu(URL_BURZA);
    if (action === 'approve') oznamZmenu();
    if (failed.length) { setChyba(failed.length === ids.length ? CHYBA_ZAPISU : `${failed.length} z ${ids.length} se neuložilo — zkus to znovu.`); return; }
    sel.exit();
  };

  const kdy = (o: NabidkaSmeny) => <span className="cz-sentence">{denKratce(den(o.date), dnes)} · <span className="tabular-nums">{casSmeny(o.startTime, o.endTime)}</span></span>;
  const obsahRadku = ({ o, druh }: RadekBurzy) => {
    const od = o.offeredByName ?? 'Kolega';
    const bere = o.claimedByName ?? 'kolega';
    switch (druh) {
      case 'schvalit': return {
        lead: sel.selecting ? <SelectBox checked={sel.has(o.id)} onChange={() => sel.toggle(o.id)} label={`Vybrat výměnu — ${od}`} /> : <Avatar emoji={o.claimedByAvatar} size="sm" />,
        meta: `Předává ${od}, bere ${bere}`,
        actions: piseSe && !sel.selecting ? <>
          <Button variant="primary" size="sm" loading={pracuji.has(o.id)} onClick={() => akceRadku(o.id, 'approve')}>Schválit</Button>
          <Button variant="danger" size="sm" disabled={pracuji.has(o.id)} onClick={() => akceRadku(o.id, 'reject')}>Zamítnout</Button>
        </> : undefined,
        right: !piseSe ? <Chip tone="wait" size="sm">Ke schválení</Chip> : undefined,
      };
      case 'volna': return {
        lead: <Avatar emoji={o.offeredByAvatar} size="sm" />,
        meta: <>Nabízí {od}{o.note ? <> · „{o.note}"</> : null}</>,
        actions: piseSe ? <Button variant="primary" size="sm" loading={pracuji.has(o.id)} onClick={() => akceRadku(o.id, 'claim')}>Převzít</Button> : undefined,
      };
      case 'beru': return {
        lead: <Avatar emoji={o.offeredByAvatar} size="sm" />,
        meta: `Bereš si od ${od} — čeká na vedení`,
        right: <Chip tone="wait" size="sm">Ke schválení</Chip>,
      };
      default: return {
        lead: <Avatar emoji={o.offeredByAvatar} size="sm" />,
        meta: o.status === 'claimed' ? `Bere si ji ${bere} — čeká na vedení` : 'Tvoje nabídka — čeká na zájemce',
        actions: piseSe ? <Button variant="ghost" size="sm" disabled={pracuji.has(o.id)} onClick={() => akceRadku(o.id, 'cancel')}>Stáhnout</Button> : undefined,
      };
    }
  };

  const ukaz = L ? radky : radky.slice(0, 5);
  const keSchvaleni = smiSchvalit ? b.keSchvaleni.length : 0;
  const akce: MenuItem[] | undefined = piseSe && !S && keSchvaleni > 1 && !sel.selecting
    ? [{ label: 'Vybrat víc', icon: 'check', onClick: sel.start, hint: 'Schválit nebo zamítnout několik výměn naráz.' }]
    : undefined;

  return (
    <Widget
      nacteni={data}
      akce={akce}
      doplnek={!S && radky.length > 0 ? <Chip tone={keSchvaleni ? 'wait' : 'muted'} size="sm">{cislo(keSchvaleni || radky.length)}</Chip> : undefined}
      prazdno={radky.length === 0 ? (
        <p className="t-meta text-pretty">
          V burze teď nic není.{smiBurza && !smiSchvalit ? ' Svou směnu nabídneš v seznamu nadcházejících směn.' : ''}
        </p>
      ) : undefined}
    >
      {S ? (
        smiSchvalit
          ? <Stat label="Ke schválení" value={cislo(keSchvaleni)} note={czForm(keSchvaleni, VYMENA)} />
          : <Stat label="Volné směny" value={cislo(b.volne.length)} note={b.moje.length ? `${cislo(b.moje.length)} tvoje v burze` : 'k převzetí'} />
      ) : (
        <>
          {chyba && <p className="note note-danger text-sm mb-2" role="alert">{chyba}</p>}
          <ul className="list">
            {ukaz.map(r => <ListRow key={`${r.druh}-${r.o.id}`} title={kdy(r.o)} {...obsahRadku(r)} />)}
          </ul>
          {!L && <ADalsich n={radky.length - ukaz.length} />}
        </>
      )}
      {sel.selecting && (
        <BulkBar
          count={sel.count}
          totalLabel={`Vybrat vše (${cislo(keSchvaleni)})`}
          onSelectAll={() => sel.selectAll(b.keSchvaleni.map(o => o.id))}
          onExit={() => { sel.exit(); setChyba(null); }}
          note={chyba}
          actions={[
            { label: 'Schválit výměny', primary: true, disabled: pracuji.size > 0, onClick: () => schvalVic('approve') },
            { label: 'Zamítnout', danger: true, disabled: pracuji.size > 0, onClick: () => schvalVic('reject') },
          ]}
        />
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Kdo má směnu (náhled rozvrhu týmu)
// ---------------------------------------------------------------------------

function vyberNahledTymu(raw: any): { zapnuto: boolean; smeny: SmenaNahledu[] } {
  if (raw && typeof raw === 'object' && raw.enabled === false) return { zapnuto: false, smeny: [] };
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.shifts)) throw new Error('Rozvrh týmu přišel v nečekaném tvaru.');
  return { zapnuto: true, smeny: raw.shifts };
}

function TymNahled({ velikost, nastaveni }: WidgetProps<{ rozsah?: string }>) {
  const brana = useBrana(['rozvrh.nahled']);
  const dnes = pragueToday();
  // M = dnes a zítra, L = týden (katalog); volba „Dnes" zúží obojí na dnešek.
  const dni = nastaveni.rozsah === 'dnes' ? 1 : velikost === 'L' ? 7 : 2;
  const posledni = pragueToday(dni - 1);
  const m1 = dnes.slice(0, 7);
  const m2 = posledni.slice(0, 7);
  const prvni = useDataWidgetu(brana ? `/api/shifts?team=1&month=${m1}` : null, vyberNahledTymu);
  // Týden přes přelom měsíce potřebuje i další měsíc (API vrací po měsících).
  const druhy = useDataWidgetu(brana && m2 !== m1 ? `/api/shifts?team=1&month=${m2}` : null, vyberNahledTymu);
  const dnyTymu = useMemo(
    () => tymPoDnech([...(prvni.data?.smeny ?? []), ...(druhy.data?.smeny ?? [])], dnes, dni),
    [prvni.data, druhy.data, dnes, dni],
  );

  if (!brana) return <Widget prazdno={null} />;
  let prazdno: ReactNode | undefined;
  if (prvni.data && !prvni.data.zapnuto) prazdno = <p className="t-meta">Rozvrh týmu je v podniku vypnutý.</p>;
  else if (dnyTymu.length === 0) prazdno = <p className="t-meta text-pretty">{dni === 1 ? 'Dnes nemá nikdo naplánovanou směnu.' : 'Na nejbližší dny zatím není rozvrh.'}</p>;

  return (
    <Widget nacteni={[prvni, druhy]} prazdno={prazdno}>
      <ul className="list">
        {dnyTymu.map(({ den: d, smeny }) => (
          <li key={d} className="py-3 first:pt-0 last:pb-0">
            <p className="t-label mb-2 cz-sentence">{denKratce(d, dnes)}</p>
            <ul className="flex flex-wrap gap-1.5" aria-label={`Směny ${denKratce(d, dnes).toLowerCase()}`}>
              {smeny.map(s => (
                <li key={s.id} className="min-w-0 max-w-full">
                  <PersonChip size="sm" name={s.isMine ? 'Ty' : (s.employeeName ?? 'Kolega')} avatar={s.employeeAvatar}
                    tone={s.isMine ? 'ok' : 'muted'} meta={<span className="tabular-nums">{casSmeny(s.startTime, s.endTime)}</span>} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'rozvrh.dnesni_smeny': DnesniSmeny,
  'rozvrh.dostupnost_tymu': DostupnostTymu,
  'rozvrh.pripominka_dostupnosti': PripominkaDostupnosti,
  'rozvrh.diry': Diry,
  'rozvrh.poptavka': Poptavka,
  'rozvrh.hodiny_lidi': HodinyLidi,
  'rozvrh.zadosti_volno': ZadostiVolna,
  'rozvrh.vymeny': Vymeny,
  'rozvrh.tym_nahled': TymNahled,
};
