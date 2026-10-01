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
import { Widget, useVyrizeno, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { obnovOpravneni, useOpravneni } from '../../role/useOpravneni';
import { apiMessage, okJson } from '@/lib/api';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { tg, aktualniJazyk } from '@/lib/i18n/stav';
import { fmtDatum, fmtHM, fmtMesic } from '@/lib/i18n/format';
import { parseDbTime, pragueDayOf, pragueHM, pragueToday } from '@/lib/pragueTime';
import {
  KLIC_DEN, KLIC_DOSTUPNOST, UDALOST_DEN, UDALOST_DOSTUPNOST, UDALOST_ZMENA,
  den, denKratce as denKratceCs, dnySDirou, hm, hodinyLidi, hodinyText, kategorieBarvy, poptavkaTop,
  rozdelBurzu, tymPoDnech, TYP_VOLNA, zadostiVolna,
  type DenSDirou, type NabidkaSmeny, type SmenaNahledu, type SmenaRozvrhu, type ZadostVolna,
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
/** Název měsíce v jazyce uživatele (první pád se hodí za „na" i jako štítek). */
function jmenoMesice(mesic: string): string {
  return fmtMesic(mesic, { jazyk: aktualniJazyk() });
}

/** „2026-09-28" → „pondělí 28. září" v jazyce uživatele. */
const denVetou = (d: string) => fmtDatum(d, { jazyk: aktualniJazyk(), styl: 'denDlouze' });
/** Krátce do štítku: „Dnes", „Zítra", jinak „po 28. 9." — v jazyce uživatele. */
function denKratce(d: string, dnes: string, t: PrekladFn): string {
  const k = denKratceCs(d, dnes);
  return k === 'Dnes' || k === 'Zítra' ? t(k) : fmtDatum(d, { jazyk: aktualniJazyk(), styl: 'denKratce' });
}
/** Rozsah volna: „3. 10. 2026", „3. 10. – 7. 10. 2026", přes rok celé obě. */
function rozsahVolna(od: string, doDne: string): string {
  const jazyk = aktualniJazyk();
  const f = (d: string, rok: boolean) => fmtDatum(d, { jazyk, styl: rok ? 'cislo' : 'kratce' });
  if (!doDne || od === doDne) return f(od, true);
  if (od.slice(0, 4) === doDne.slice(0, 4)) return `${f(od, false)} – ${f(doDne, true)}`;
  return `${f(od, true)} – ${f(doDne, true)}`;
}

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
  const t = useT('widgety');
  return n > 0 ? <p className="t-meta mt-2">{t('…a dalších {n}', { n: cislo(n) })}</p> : null;
}

/** Čas směny: „08:00–16:00". */
const casSmeny = (od: unknown, doCasu: unknown) => (hm(od) ? `${fmtHM(od)}–${fmtHM(doCasu)}` : '');

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
function poleZ(klic: string, chyba: string) {
  return (raw: any): any[] => {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw[klic])) throw new Error(tg(chyba));
    return raw[klic];
  };
}
const vyberRozvrh = poleZ('shifts', 'Rozvrh přišel v nečekaném tvaru.');
const vyberRoster = poleZ('roster', 'Seznam lidí na směně přišel v nečekaném tvaru.');
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
function typZPlanovace(s: any, typy: readonly TypSmeny[], t: PrekladFn): { typ: string | null; kat: number | null } {
  const nalez = typy.find(x => x.name === s.type) ?? typy.find(x => hm(x.startTime) === hm(s.startTime) && hm(x.endTime) === hm(s.endTime));
  if (nalez) return { typ: nalez.name, kat: katBarvy(nalez.color) };
  const stary = STARE_TYPY[String(s.type ?? '')];
  if (stary) return { typ: t(stary.nazev), kat: katBarvy(stary.barva) };
  return { typ: s.type ? String(s.type) : null, kat: null };
}

type StavPrichodu = 'na-smene' | 'po-smene' | 'chybi' | null;
const TOLERANCE_MIN = 5;
/** „08:30" → 510; porovnávat časy jako čísla, ne jako text. */
function minuty(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function DnesniSmeny({ velikost, nastaveni, nahled }: WidgetProps<{ den?: string }>) {
  const t = useT('widgety');
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
        klic: `p-${s.id ?? i}`, employeeId: s.employeeId ?? null, jmeno: s.employeeName ?? t('Bez jména'),
        avatar: s.employeeAvatar ?? null, od: hm(s.startTime), do: hm(s.endTime), ...typZPlanovace(s, typy.data ?? [], t),
      }));
    } else if (zdroj === 'nahled') {
      out = (nahledRozvrhu.data?.smeny ?? []).filter(s => den(s.date) === cilovyDen).map((s, i) => ({
        klic: `n-${s.id ?? i}`, employeeId: s.employeeId ?? null, jmeno: s.employeeName ?? t('Bez jména'),
        avatar: s.employeeAvatar ?? null, od: hm(s.startTime ?? s.start_time), do: hm(s.endTime ?? s.end_time),
        typ: (STARE_TYPY[String(s.typeLabel ?? '')] ? t(STARE_TYPY[String(s.typeLabel ?? '')].nazev) : null) ?? (s.typeLabel ? String(s.typeLabel) : null), kat: katBarvy(s.typeColor),
      }));
    } else if (zdroj === 'tablet' && !zitra) {
      out = (dochazka.data?.roster ?? []).filter(r => r.shiftStart).map(r => ({
        klic: `t-${r.id}`, employeeId: r.id ?? null, jmeno: r.name ?? t('Bez jména'), avatar: r.avatar ?? null,
        od: hm(r.shiftStart), do: hm(r.shiftEnd), typ: null, kat: null,
      }));
    }
    return out.sort((a, b) => a.od.localeCompare(b.od) || a.jmeno.localeCompare(b.jmeno, 'cs'));
  }, [zdroj, planovac.data, typy.data, nahledRozvrhu.data, dochazka.data, cilovyDen, zitra, t]);

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
  const cil = nav.smiPohled('shifts') ? { popisek: t('Rozvrh'), pohled: 'shifts' } : { popisek: t('Moje směny'), pohled: 'my-shifts' };

  // Bez oprávnění ho plocha vůbec nepřipojí; kdyby přece, nesmí tvrdit „nikdo nemá směnu".
  if (!brana) return <Widget prazdno={null} />;
  // Vypnuté dotazy (url null) obal nepočítá, takže stačí dát všechny.
  const chybaOpravneni: StavNacteni = {
    data: null, error: t('Nevím, co smíš vidět — oprávnění se nenačetla.'), loading: false, reload: obnovOpravneni,
  };
  const nacteni: StavNacteni | StavNacteni[] = nacteno ? [planovac, nahledRozvrhu, dochazka] : chybaOpravneni;

  const kdy = zitra ? t('Zítra') : t('Dnes');
  let prazdno: ReactNode | undefined;
  if (nacteno && !zdroj) prazdno = <p className="t-meta">{t('Rozvrh tvoje role nevidí.')}</p>;
  else if (tabletZitra) prazdno = <p className="t-meta text-pretty">{t('S touhle rolí uvidíš jen dnešní směny.')}</p>;
  else if (zdroj === 'nahled' && nahledRozvrhu.data && !nahledRozvrhu.data.zapnuto) prazdno = <p className="t-meta">{t('Rozvrh týmu je v podniku vypnutý.')}</p>;
  else if (smeny.length === 0) prazdno = <p className="t-meta">{zitra ? t('Zítra nemá nikdo naplánovanou směnu.') : t('Dnes nemá nikdo naplánovanou směnu.')}</p>;

  // Jen lidé s dnešní směnou — napíchnutý bez směny do „kolik z plánu je tu" nepatří.
  const naSmene = new Set(smeny.filter(s => prichody.get(s.klic) === 'na-smene').map(s => s.employeeId)).size;
  const pocet = smeny.length.toLocaleString('cs-CZ');

  const chipPrichodu = (klic: string) => {
    const st = prichody.get(klic) ?? null;
    if (st === 'na-smene') return <Chip tone="ok" size="sm">{t('Na směně')}</Chip>;
    if (st === 'po-smene') return <Chip tone="muted" size="sm">{t('Po směně')}</Chip>;
    if (st === 'chybi') return <Chip tone="wait" size="sm">{t('Ještě tu není')}</Chip>;
    return undefined;
  };

  const radky = L ? smeny : smeny.slice(0, 5);
  return (
    <Widget
      titulek={zitra ? t('Zítřejší směny') : undefined}
      nacteni={nacteni}
      // Dnešek limetkově (kolo 71): tónovaný chip, ne plná limetka. Zítřek tlumeně.
      doplnek={!S && smeny.length > 0 ? <Chip tone={zitra ? 'muted' : 'ok'} size="sm">{pocet}</Chip> : undefined}
      odkaz={S ? undefined : cil}
      otevrit={S && !nahled && nav.smiPohled(cil.pohled) ? () => nav.onNavigate(cil.pohled) : undefined}
      prazdno={prazdno}
    >
      {S ? (
        <Stat label={kdy} value={pocet}
          note={chciPrichody ? t('{n, plural, one {# člověk} few {# lidé} other {# lidí}} na směně', { n: naSmene }) : smeny[0] ? t('první od {cas}', { cas: smeny[0].od }) : undefined} />
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
          {!L && smeny.length > 5 && <p className="t-meta mt-2">{t('…a dalších {n}', { n: (smeny.length - 5).toLocaleString('cs-CZ') })}</p>}
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

interface DataDostupnosti { odevzdane: Odevzdani[]; naplanovanoSmen: number }

function vyberOdevzdani(raw: any): DataDostupnosti {
  // Bez dostupnost.zobrazit by API vrátilo jen vlastní záznam (nebo null) —
  // to je jiný tvar, ne „nikdo nezadal".
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.submissions)) throw new Error(tg('Dostupnost týmu přišla v nečekaném tvaru.'));
  // Počet naplánovaných směn měsíce je novější pole odpovědi — bez něj 0,
  // widget se pak jen neminimalizuje (konzervativně).
  return { odevzdane: raw.submissions, naplanovanoSmen: Number(raw.naplanovanoSmen) || 0 };
}
function vyberCleny(raw: any): Clen[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.members)) throw new Error(tg('Seznam lidí přišel v nečekaném tvaru.'));
  // Jako plánovač (ScheduleBuilder, `assignable`): rozvrh se skládá z vedení
  // i zaměstnanců, tablet do něj nepatří. Jinak by widget počítal jinak než Rozvrh.
  return raw.members.filter((m: any) => m && (m.role === 'employee' || m.role === 'employer'));
}

/** Kolik jmen ukázat jako pilulky ve střední velikosti. */
const PILULEK_M = 10;
/** Kolik řádků ukázat ve velké velikosti, než zbytek schová „…a dalších N". */
const RADKU_L = 8;

function DostupnostTymu({ velikost, nastaveni, nahled }: WidgetProps<{ mesic?: string }>) {
  const t = useT('widgety');
  const brana = useBrana(['dostupnost.zobrazit']);
  const smi = useSmi();
  const nav = useNavigace();
  const mesic = nastaveni.mesic === 'tento' ? mesicZa(0) : mesicZa(1);
  const odevzdani = useDataWidgetu(brana ? `/api/availability?month=${mesic}` : null, vyberOdevzdani);
  const clenove = useDataWidgetu(brana ? '/api/teams' : null, vyberCleny);
  const [vseLidi, setVseLidi] = useState(false);

  const { zadali, chybi, blokovano } = useMemo(() => {
    const podle = new Map<number, Odevzdani>();
    for (const o of odevzdani.data?.odevzdane ?? []) podle.set(Number(o.employeeId), o);
    const lide = [...(clenove.data ?? [])].sort((a, b) => String(a.name).localeCompare(String(b.name), 'cs'));
    return {
      zadali: lide.filter(c => podle.has(Number(c.id))),
      chybi: lide.filter(c => !podle.has(Number(c.id))),
      // Jen počet blokovaných dní — poznámky k dostupnosti jsou osobní a do widgetu nepatří.
      blokovano: (id: number) => (Array.isArray(podle.get(id)?.unavailableDates) ? podle.get(id)!.unavailableDates!.length : 0),
    };
  }, [odevzdani.data, clenove.data]);

  const celkem = zadali.length + chybi.length;
  const naMesic = jmenoMesice(mesic);

  // Všichni odevzdali A na měsíc už existují naplánované směny = vyřízeno,
  // plocha widget v klidu minimalizuje (kolo 71). „Zveřejnění" se nikde
  // neukládá (publish jen rozešle upozornění), počet směn je nejbližší
  // poctivá náhrada — nese ho odpověď /api/availability, kterou widget
  // stejně čte. Jen nad načtenými daty, nikdy během načítání.
  useVyrizeno(
    brana && odevzdani.data != null && clenove.data != null && celkem > 0
      && chybi.length === 0 && odevzdani.data.naplanovanoSmen > 0,
    t('Dostupnost na {mesic} odevzdaná · rozvrh naplánovaný', { mesic: naMesic }),
  );

  // Bez oprávnění ho plocha vůbec nepřipojí; kdyby přece, nesmí tvrdit „v týmu nikdo není".
  if (!brana) return <Widget prazdno={null} />;
  const smiSestavit = !nahled && smi('rozvrh.generovat') && nav.smiPohled('shifts');
  // Pole katalogu akce:vyplnit_za_cloveka — okno dostupnosti je v plánovači Rozvrhu.
  const smiVyplnit = !nahled && smi('dostupnost.upravit') && nav.smiPohled('shifts');
  // Náhled zadané dostupnosti stačí dostupnost.zobrazit (hlavní brána widgetu).
  const smiNahlednout = !nahled && nav.smiPohled('shifts');
  const sestavit = smiSestavit ? (
    <Button variant="secondary" size="sm" icon="calendar" onClick={() => nav.onNavigate('shifts')}>{t('Sestavit rozvrh')}</Button>
  ) : null;
  const shrnuti = <p className="t-meta">{t('Na {mesic} zadalo {zadali} z {celkem}.', { mesic: naMesic, zadali: zadali.length.toLocaleString('cs-CZ'), celkem: celkem.toLocaleString('cs-CZ') })}</p>;
  const vsichni = chybi.length === 0 && celkem > 0 ? (
    <p className="note note-ok">{smiSestavit ? t('Všichni zadali dostupnost na {mesic} — můžeš sestavit rozvrh.', { mesic: naMesic }) : t('Všichni zadali dostupnost na {mesic}.', { mesic: naMesic })}</p>
  ) : null;

  let telo: ReactNode;
  if (velikost === 'S') {
    telo = (
      <Stat label={naMesic} value={zadali.length.toLocaleString('cs-CZ')} unit={t('z {celkem}', { celkem: celkem.toLocaleString('cs-CZ') })}
        note={chybi.length === 0 ? t('všichni zadali') : t('{n, plural, one {zbývá # člověk} few {zbývají # lidé} other {zbývá # lidí}}', { n: chybi.length })} />
    );
  } else if (velikost === 'M') {
    telo = (
      <div className="space-y-3">
        {vsichni ?? (
          <>
            {shrnuti}
            <ul className="flex flex-wrap gap-2" aria-label={t('Kdo ještě nezadal')}>
              {chybi.slice(0, PILULEK_M).map(c => (
                <li key={c.id} className="min-w-0 max-w-full"><PersonChip name={c.name} avatar={c.avatar} /></li>
              ))}
            </ul>
            {chybi.length > PILULEK_M && <p className="t-meta">{t('…a dalších {n}', { n: (chybi.length - PILULEK_M).toLocaleString('cs-CZ') })}</p>}
          </>
        )}
        {sestavit}
      </div>
    );
  } else {
    // Nejdřív ti, kdo chybí; strop řádků, aby widget nad plánovačem nevypsal celý tým
    // a hlavní nástroj stránky nezačínal až po obrazovce jmen (DP §5.1, §5.8).
    const poradi = [...chybi, ...zadali];
    const radky = vseLidi ? poradi : poradi.slice(0, RADKU_L);
    telo = (
      <div className="space-y-3">
        {vsichni ?? shrnuti}
        <ul className="list">
          {radky.map(c => {
            const zadal = !chybi.includes(c);
            const dnu = blokovano(Number(c.id));
            // Stav jde do meta, ne do `right`, a řádek je bez chevronu (klikací je celý):
            // na telefonu se ocas ListRow láme na celou šířku, takže chip i chevron by
            // osiřely na vlastním řádku a každý člověk by zabral tři řádky.
            const obsah = {
              chevron: false,
              lead: <Avatar emoji={c.avatar} size="sm" />,
              title: c.name,
              meta: !zadal
                ? <Chip tone="wait" size="sm">{t('Chybí')}</Chip>
                // Limetková tečka u splněných řádků — bez záře (stav, ne akce, DP T3).
                : <>
                  <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-ok align-middle mr-1.5" />
                  {dnu === 0 ? t('zadáno · bez omezení') : t('zadáno · nemůže {n, plural, one {# den} few {# dny} other {# dní}}', { n: dnu })}
                </>,
            };
            // Klepnutí otevře okno dostupnosti v plánovači: s dostupnost.upravit k úpravě,
            // jinak jen ke čtení (dny, preference, max. směn, poznámka pro vedení).
            // U toho, kdo nezadal, je co ukázat jen tomu, kdo může vyplnit za něj.
            const klik = smiVyplnit || (smiNahlednout && zadal);
            // Klikací řádek: vlastní <li> + ListRow as="div", jinak .list ztratí linku (DP §3.6).
            return klik
              ? <li key={c.id}><ListRow as="div" {...obsah} onClick={() => predejNastroji(nav, UDALOST_DOSTUPNOST, KLIC_DOSTUPNOST, `${c.id}|${mesic}`)} /></li>
              : <ListRow key={c.id} {...obsah} />;
          })}
        </ul>
        {poradi.length > RADKU_L && (
          <Button variant="ghost" size="sm" icon={vseLidi ? 'chevron' : 'chevronRight'} aria-expanded={vseLidi} onClick={() => setVseLidi(v => !v)}>
            {vseLidi ? t('Ukázat méně') : t('…a dalších {n}', { n: cislo(poradi.length - RADKU_L) })}
          </Button>
        )}
        {sestavit}
      </div>
    );
  }

  return (
    <Widget
      nacteni={[odevzdani, clenove]}
      doplnek={velikost !== 'S' && chybi.length > 0 ? <Chip tone="wait" size="sm">{chybi.length.toLocaleString('cs-CZ')}</Chip> : undefined}
      otevrit={velikost === 'S' && !nahled && nav.smiPohled('shifts') ? () => nav.onNavigate('shifts') : undefined}
      prazdno={celkem === 0 ? (velikost === 'S' ? <p className="t-meta">{t('V týmu zatím nikdo není.')}</p> : (
        <EmptyState compact icon="users" title={t('V týmu zatím nikdo není')}
          hint={t('Až pozveš lidi, uvidíš tu, kdo zadal dostupnost.')}
          action={!nahled && nav.smiPohled('team-settings')
            ? <Button variant="secondary" size="sm" icon="plus" onClick={() => nav.onNavigate('team-settings')}>{t('Pozvat lidi')}</Button>
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
  throw new Error(tg('Dostupnost přišla v nečekaném tvaru.'));
}

function PripominkaDostupnosti({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
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
      odkaz={!S && odeslano ? { popisek: t('Upravit'), pohled } : undefined}
      otevrit={S && muze ? () => nav.onNavigate(pohled) : undefined}
    >
      {S ? (
        <div className="space-y-1.5">
          <p className="t-label">{naMesic}</p>
          {odeslano ? <Chip tone="ok" icon="check">{t('Odesláno')}</Chip> : <Chip tone="wait">{t('Nezadáno')}</Chip>}
        </div>
      ) : odeslano ? (
        <p className="t-meta">{t('Dostupnost na {mesic} máš odeslanou.', { mesic: naMesic })}</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-[15px] font-medium leading-snug text-[#16181A] text-pretty">{t('Dostupnost na {mesic} ještě nemáš zadanou.', { mesic: naMesic })}</p>
            <p className="t-meta mt-1 text-pretty">{t('Dej vedení vědět, kdy nemůžeš — podle toho sestaví rozvrh.')}</p>
          </div>
          {muze && <Button variant="primary" size="sm" icon="calendar" onClick={() => nav.onNavigate(pohled)}>{t('Zadat dostupnost')}</Button>}
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
  gaps: { date: string; from: string; to: string; uroven?: 'povinna' | 'zadouci' }[];
  understaffed: { date: string; shiftTypeName: string }[];
  demand: Record<string, { reservations?: number; guests?: number }>;
}
/** /api/schedule?month → shifts, gaps, understaffed, demand (jeden dotaz pro Díry, Hodiny, Poptávku i plánovač). */
function vyberDataRozvrhu(raw: any): DataRozvrhu {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.shifts)) throw new Error(tg('Rozvrh přišel v nečekaném tvaru.'));
  return {
    smeny: raw.shifts,
    gaps: Array.isArray(raw.gaps) ? raw.gaps : [],
    understaffed: Array.isArray(raw.understaffed) ? raw.understaffed : [],
    demand: raw.demand && typeof raw.demand === 'object' ? raw.demand : {},
  };
}
const mesicZVolby = (v: unknown) => (v === 'pristi' ? mesicZa(1) : mesicZa(0));

/** Věta o díře (jako popisDiry v lib/rozvrhPrehled, jen přeložená): „Nikdo 14:00–16:00 · neobsazeno Odpolední". */
function popisDiry(d: DenSDirou, t: PrekladFn): string {
  const casti: string[] = [];
  if (d.mezery.length) casti.push(t('nikdo {casy}', { casy: d.mezery.map(g => `${g.od}–${g.do}`).join(', ') }));
  if (d.neobsazeno.length) casti.push(t('neobsazeno {typy}', { typy: d.neobsazeno.join(', ') }));
  const v = casti.join(' · ');
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function Diry({ velikost, nastaveni, nahled }: WidgetProps<{ mesic?: string }>) {
  const t = useT('widgety');
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
      // Červeně jen, když někde nikdo neotevře; chybějící druhý člověk je mírnější.
      doplnek={!S && dny.length > 0 ? <Chip tone={dny.some(d => d.povinna) ? 'bad' : 'wait'} size="sm">{cislo(dny.length)}</Chip> : undefined}
      otevrit={S && smiDoplnit && dny[0] ? () => otevriDen(dny[0].den) : undefined}
      prazdno={dny.length === 0 ? <p className="t-meta text-pretty">{t('Na {mesic} je obsazeno — bez děr.', { mesic: naMesic })}</p> : undefined}
    >
      {S ? (
        <Stat label={naMesic} value={cislo(dny.length)} note={t('{n, plural, one {den} few {dny} other {dní}} s dírou · první {kdy}', { n: dny.length, kdy: denKratce(dny[0]?.den ?? dnes, dnes, t).toLowerCase() })} />
      ) : (
        <>
          <ul className="list">
            {dny.slice(0, 5).map(d => {
              // Povinná díra (nikdo neotevře) výrazně, žádoucí (chybí druhý) mírně.
              const obsah = {
                title: <span className="cz-sentence">{denVetou(d.den)}</span>, meta: popisDiry(d, t),
                right: <Chip tone={d.povinna ? 'bad' : 'wait'} size="sm">{d.povinna ? t('neotevře se') : t('chybí druhý')}</Chip>,
              };
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
  const t = useT('widgety');
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
      prazdno={dny.length === 0 ? <p className="t-meta text-pretty">{t('Na {mesic} zatím nikdo nerezervoval.', { mesic: jmenoMesice(mesic) })}</p> : undefined}
    >
      <ul className="list">
        {dny.map(d => {
          const obsah = {
            title: <span className="cz-sentence">{denVetou(d.den)}</span>,
            meta: t('{n, plural, one {# rezervace} few {# rezervace} other {# rezervací}}', { n: d.rezervaci }),
            value: cislo(d.hostu),
            valueMeta: t('{n, plural, one {host} few {hosté} other {hostů}}', { n: d.hostu }),
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
  if (!raw || typeof raw !== 'object') throw new Error(tg('Pravidla přišla v nečekaném tvaru.'));
  return { teamMaxHours: raw.teamMaxHours ?? null, members: Array.isArray(raw.members) ? raw.members : [] };
}

function HodinyLidi({ velikost, nastaveni }: WidgetProps<{ mesic?: string }>) {
  const t = useT('widgety');
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
    if (c.podil > 1) return <Chip tone="bad" size="sm">{t('Nad limitem')}</Chip>;
    if (c.podil >= 0.9) return <Chip tone="wait" size="sm">{t('U limitu')}</Chip>;
    return undefined;
  };
  const prvni = lide[0];

  return (
    <Widget
      nacteni={data}
      prazdno={lide.length === 0 ? <p className="t-meta text-pretty">{t('Na {mesic} zatím nikdo nemá směnu.', { mesic: naMesic })}</p> : undefined}
    >
      {prvni && (S ? (
        <Stat label={prvni.podil != null ? t('Nejblíž limitu') : t('Nejvíc hodin')} value={hodinyText(prvni.hodiny)} unit={t('h')}
          note={<span className="block truncate">{prvni.jmeno}{prvni.limit ? ` · ${t('z {limit} h', { limit: hodinyText(prvni.limit) })}` : ''}</span>} />
      ) : (
        <>
          {pravidla.error && <p className="note note-wait text-sm mb-2">{t('Limity hodin se nenačetly — ukazuju jen naplánované hodiny.')}</p>}
          <ul className="list">
            {(L ? lide : lide.slice(0, 5)).map(c => (
              <ListRow key={c.employeeId}
                lead={<Avatar emoji={c.avatar} size="sm" />}
                title={c.jmeno}
                meta={t('{n, plural, one {# směna} few {# směny} other {# směn}}', { n: c.smen })}
                value={`${hodinyText(c.hodiny)} ${t('h')}`}
                valueMeta={c.limit ? t('z {limit} h', { limit: hodinyText(c.limit) }) : undefined}
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
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.requests)) throw new Error(tg('Žádosti o volno přišly v nečekaném tvaru.'));
  return raw.requests;
}

function ZadostiVolna({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const CHYBA_ZAPISU = t('Nepodařilo se to uložit — zkus to znovu.');
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
    if (failed.length) { setChyba(failed.length === ids.length ? CHYBA_ZAPISU : t('{n} z {celkem} se neuložilo — zkus to znovu.', { n: failed.length, celkem: ids.length })); return; }
    sel.exit();
  };
  const ulozTermin = async () => {
    if (!upravit) return;
    if (!upravit.od || !upravit.do || upravit.od > upravit.do) { setChyba(t('Konec volna nesmí být před začátkem.')); return; }
    s(upravit.z.id, true); setChyba(null);
    try { await patch({ id: upravit.z.id, fromDate: upravit.od, toDate: upravit.do }); hotovo(); setUpravit(null); }
    catch (e) { setChyba(apiMessage(e, CHYBA_ZAPISU)); }
    s(upravit.z.id, false);
  };
  const zrusVolno = async () => {
    if (!zrusit) return;
    s(zrusit.id, true); setChyba(null);
    try { await zapis({ method: 'DELETE' }, `${URL_VOLNO}?id=${zrusit.id}`); hotovo(); setZrusit(null); }
    catch (e) { setChyba(apiMessage(e, t('Volno se nezrušilo — zkus to znovu.'))); }
    s(zrusit.id, false);
  };

  const kdo = (z: ZadostVolna) => z.employeeName || t('Zaměstnanec');
  const meta = (z: ZadostVolna) => <><span className="tabular-nums">{rozsahVolna(den(z.fromDate), den(z.toDate))}</span> · {t(TYP_VOLNA[z.type] ?? 'Jiné')}{z.note ? ` · ${z.note}` : ''}</>;
  const limit = L ? Infinity : 5;
  const cek = cekajici.slice(0, limit);
  const sch = schvalene.slice(0, Math.max(0, (L ? Infinity : 5) - cek.length));
  const akce: MenuItem[] | undefined = smiRozhodnout && !S && cekajici.length > 1 && !sel.selecting
    ? [{ label: t('Vybrat víc'), icon: 'check', onClick: sel.start, hint: t('Schválit nebo zamítnout několik žádostí naráz.') }]
    : undefined;

  return (
    <Widget
      nacteni={data}
      akce={akce}
      doplnek={!S && cekajici.length > 0 ? <Chip tone="wait" size="sm">{cislo(cekajici.length)}</Chip> : undefined}
      prazdno={cekajici.length === 0 && schvalene.length === 0 && (!L || vyrizene.length === 0)
        ? <p className="t-meta">{t('Žádná žádost o volno nečeká.')}</p> : undefined}
    >
      {S ? (
        // V malé velikosti jen počet: typ volna (nemoc) je citlivý údaj a do dlaždice nepatří.
        <Stat label={t('Čeká')} value={cislo(cekajici.length)}
          note={cekajici.length ? t('{n, plural, one {žádost} few {žádosti} other {žádostí}}', { n: cekajici.length }) : t('{n} schválených', { n: cislo(schvalene.length) })} />
      ) : (
        <div className="space-y-3">
          {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
          {cek.length > 0 && (
            <ul className="list" aria-label={t('Čekající žádosti')}>
              {cek.map(z => (
                <ListRow key={z.id}
                  lead={sel.selecting
                    ? <SelectBox checked={sel.has(z.id)} onChange={() => sel.toggle(z.id)} label={t('Vybrat žádost — {kdo}', { kdo: kdo(z) })} />
                    : <Avatar emoji={z.employeeAvatar} size="sm" />}
                  title={kdo(z)}
                  meta={meta(z)}
                  actions={smiRozhodnout && !sel.selecting ? (
                    <>
                      <Button variant="primary" size="sm" loading={pracuji.has(z.id)} onClick={() => rozhodni(z, 'approved')}>{t('Schválit')}</Button>
                      <Button variant="danger" size="sm" disabled={pracuji.has(z.id)} onClick={() => rozhodni(z, 'rejected')}>{t('Zamítnout')}</Button>
                    </>
                  ) : undefined}
                  right={!smiRozhodnout ? <Chip tone="wait" size="sm">{t('Čeká')}</Chip> : undefined}
                />
              ))}
            </ul>
          )}
          {sch.length > 0 && (
            <div>
              <p className="t-label mb-1">{t('Schválené volno')}</p>
              <ul className="list">
                {sch.map(z => (
                  <ListRow key={z.id}
                    lead={<Avatar emoji={z.employeeAvatar} size="sm" />}
                    title={kdo(z)}
                    meta={meta(z)}
                    actions={smiRozhodnout ? (
                      <Menu size="sm" label={t('Další akce s volnem — {kdo}', { kdo: kdo(z) })} items={[
                        { label: t('Upravit termín…'), icon: 'pencil', onClick: () => setUpravit({ z, od: den(z.fromDate), do: den(z.toDate) }) },
                        { label: t('Zrušit volno…'), icon: 'trash', danger: true, hint: t('Dotyčný dostane upozornění.'), onClick: () => setZrusit(z) },
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
                {historie ? t('Skrýt vyřízené') : t('Vyřízené ({n})', { n: cislo(vyrizene.length) })}
              </Button>
              {historie && (
                <ul className="list mt-1">
                  {vyrizene.map(z => (
                    <ListRow key={z.id} title={kdo(z)} meta={meta(z)}
                      right={z.status === 'approved' ? <Chip tone="ok" size="sm">{t('Schváleno')}</Chip> : <Chip tone="bad" size="sm">{t('Zamítnuto')}</Chip>} />
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
          totalLabel={t('Vybrat vše ({n})', { n: cislo(cekajici.length) })}
          onSelectAll={() => sel.selectAll(cekajici.map(z => z.id))}
          onExit={() => { sel.exit(); setChyba(null); }}
          note={chyba}
          actions={[
            { label: t('Schválit'), primary: true, disabled: pracuji.size > 0, onClick: () => rozhodniVic('approved') },
            { label: t('Zamítnout'), danger: true, disabled: pracuji.size > 0, onClick: () => rozhodniVic('rejected') },
          ]}
        />
      )}
      {upravit && (
        <Modal open onClose={() => setUpravit(null)} size="sm" title={t('Upravit termín volna')} subtitle={kdo(upravit.z)}
          footer={<>
            <Button variant="secondary" onClick={() => setUpravit(null)}>{t('Zrušit', undefined, 'dialog')}</Button>
            <Button variant="primary" loading={pracuji.has(upravit.z.id)} onClick={ulozTermin}>{t('Uložit')}</Button>
          </>}>
          <div className="grid grid-cols-2 gap-3">
            <Field id="volno-od" label={t('Od')}><Input id="volno-od" type="date" value={upravit.od} onChange={e => setUpravit(u => u && { ...u, od: e.target.value })} /></Field>
            <Field id="volno-do" label={t('Do')}><Input id="volno-do" type="date" value={upravit.do} onChange={e => setUpravit(u => u && { ...u, do: e.target.value })} /></Field>
          </div>
          {chyba && <p className="note note-danger text-sm mt-3" role="alert">{chyba}</p>}
        </Modal>
      )}
      {zrusit && (
        <Modal open onClose={() => setZrusit(null)} size="sm" title={t('Zrušit schválené volno?')}
          subtitle={`${kdo(zrusit)} · ${rozsahVolna(den(zrusit.fromDate), den(zrusit.toDate))}`}
          footer={<>
            <Button variant="secondary" onClick={() => setZrusit(null)}>{t('Nechat')}</Button>
            <Button variant="danger-solid" icon="trash" loading={pracuji.has(zrusit.id)} onClick={zrusVolno}>{t('Zrušit volno')}</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">{t('Volno zmizí z rozvrhu a dotyčný dostane upozornění. Generátor ho na ty dny zase může naplánovat.')}</p>
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
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.offers)) throw new Error(tg('Burza přišla v nečekaném tvaru.'));
  return { nabidky: raw.offers, meId: typeof raw.meId === 'number' ? raw.meId : null };
}

type RadekBurzy = { o: NabidkaSmeny; druh: 'schvalit' | 'volna' | 'beru' | 'moje' };

function Vymeny({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const CHYBA_ZAPISU = t('Nepodařilo se to uložit — zkus to znovu.');
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
    if (failed.length) { setChyba(failed.length === ids.length ? CHYBA_ZAPISU : t('{n} z {celkem} se neuložilo — zkus to znovu.', { n: failed.length, celkem: ids.length })); return; }
    sel.exit();
  };

  const kdy = (o: NabidkaSmeny) => <span className="cz-sentence">{denKratce(den(o.date), dnes, t)} · <span className="tabular-nums">{casSmeny(o.startTime, o.endTime)}</span></span>;
  const obsahRadku = ({ o, druh }: RadekBurzy) => {
    const od = o.offeredByName ?? t('Kolega');
    const bere = o.claimedByName ?? t('kolega');
    switch (druh) {
      case 'schvalit': return {
        lead: sel.selecting ? <SelectBox checked={sel.has(o.id)} onChange={() => sel.toggle(o.id)} label={t('Vybrat výměnu — {od}', { od })} /> : <Avatar emoji={o.claimedByAvatar} size="sm" />,
        meta: t('Předává {od}, bere {bere}', { od, bere }),
        actions: piseSe && !sel.selecting ? <>
          <Button variant="primary" size="sm" loading={pracuji.has(o.id)} onClick={() => akceRadku(o.id, 'approve')}>{t('Schválit')}</Button>
          <Button variant="danger" size="sm" disabled={pracuji.has(o.id)} onClick={() => akceRadku(o.id, 'reject')}>{t('Zamítnout')}</Button>
        </> : undefined,
        right: !piseSe ? <Chip tone="wait" size="sm">{t('Ke schválení')}</Chip> : undefined,
      };
      case 'volna': return {
        lead: <Avatar emoji={o.offeredByAvatar} size="sm" />,
        meta: <>{t('Nabízí {od}', { od })}{o.note ? <> · „{o.note}"</> : null}</>,
        actions: piseSe ? <Button variant="primary" size="sm" loading={pracuji.has(o.id)} onClick={() => akceRadku(o.id, 'claim')}>{t('Převzít')}</Button> : undefined,
      };
      case 'beru': return {
        lead: <Avatar emoji={o.offeredByAvatar} size="sm" />,
        meta: t('Bereš si od {od} — čeká na vedení', { od }),
        right: <Chip tone="wait" size="sm">{t('Ke schválení')}</Chip>,
      };
      default: return {
        lead: <Avatar emoji={o.offeredByAvatar} size="sm" />,
        meta: o.status === 'claimed' ? t('Bere si ji {bere} — čeká na vedení', { bere }) : t('Tvoje nabídka — čeká na zájemce'),
        actions: piseSe ? <Button variant="ghost" size="sm" disabled={pracuji.has(o.id)} onClick={() => akceRadku(o.id, 'cancel')}>{t('Stáhnout', undefined, 'widgety')}</Button> : undefined,
      };
    }
  };

  const ukaz = L ? radky : radky.slice(0, 5);
  const keSchvaleni = smiSchvalit ? b.keSchvaleni.length : 0;
  const akce: MenuItem[] | undefined = piseSe && !S && keSchvaleni > 1 && !sel.selecting
    ? [{ label: t('Vybrat víc'), icon: 'check', onClick: sel.start, hint: t('Schválit nebo zamítnout několik výměn naráz.') }]
    : undefined;

  return (
    <Widget
      nacteni={data}
      akce={akce}
      doplnek={!S && radky.length > 0 ? <Chip tone={keSchvaleni ? 'wait' : 'muted'} size="sm">{cislo(keSchvaleni || radky.length)}</Chip> : undefined}
      prazdno={radky.length === 0 ? (
        <p className="t-meta text-pretty">
          {t('V burze teď nic není.')}{smiBurza && !smiSchvalit ? ` ${t('Svou směnu nabídneš v seznamu nadcházejících směn.')}` : ''}
        </p>
      ) : undefined}
    >
      {S ? (
        smiSchvalit
          ? <Stat label={t('Ke schválení')} value={cislo(keSchvaleni)} note={t('{n, plural, one {výměna} few {výměny} other {výměn}}', { n: keSchvaleni })} />
          : <Stat label={t('Volné směny')} value={cislo(b.volne.length)} note={b.moje.length ? t('{n} tvoje v burze', { n: cislo(b.moje.length) }) : t('k převzetí')} />
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
          totalLabel={t('Vybrat vše ({n})', { n: cislo(keSchvaleni) })}
          onSelectAll={() => sel.selectAll(b.keSchvaleni.map(o => o.id))}
          onExit={() => { sel.exit(); setChyba(null); }}
          note={chyba}
          actions={[
            { label: t('Schválit výměny'), primary: true, disabled: pracuji.size > 0, onClick: () => schvalVic('approve') },
            { label: t('Zamítnout'), danger: true, disabled: pracuji.size > 0, onClick: () => schvalVic('reject') },
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
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.shifts)) throw new Error(tg('Rozvrh týmu přišel v nečekaném tvaru.'));
  return { zapnuto: true, smeny: raw.shifts };
}

/** Kolik dní se směnami ukáže střední velikost; zbytek rozsahu jen počtem. */
const DNU_M = 3;

function TymNahled({ velikost, nastaveni }: WidgetProps<{ rozsah?: string }>) {
  const t = useT('widgety');
  const brana = useBrana(['rozvrh.nahled']);
  const dnes = pragueToday();
  // Rozsah platí v obou velikostech (Dnes / Týden / 14 dní). M jen ukáže první dny
  // a zbytek přizná „…a další N dní" (DP §3.6) — dřív M tiše ořízl týden na dva dny.
  const dni = nastaveni.rozsah === 'dnes' ? 1 : nastaveni.rozsah === 'dva_tydny' ? 14 : 7;
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
  if (prvni.data && !prvni.data.zapnuto) prazdno = <p className="t-meta">{t('Rozvrh týmu je v podniku vypnutý.')}</p>;
  else if (dnyTymu.length === 0) prazdno = <p className="t-meta text-pretty">{dni === 1 ? t('Dnes nemá nikdo naplánovanou směnu.') : t('Na nejbližší dny zatím není rozvrh.')}</p>;

  return (
    <Widget nacteni={[prvni, druhy]} prazdno={prazdno}>
      <ul className="list">
        {(velikost === 'L' ? dnyTymu : dnyTymu.slice(0, DNU_M)).map(({ den: d, smeny }) => (
          <li key={d} className="py-3 first:pt-0 last:pb-0">
            <p className="t-label mb-2 cz-sentence">{denKratce(d, dnes, t)}</p>
            <ul className="flex flex-wrap gap-1.5" aria-label={t('Směny {kdy}', { kdy: denKratce(d, dnes, t).toLowerCase() })}>
              {smeny.map(s => (
                <li key={s.id} className="min-w-0 max-w-full">
                  <PersonChip size="sm" name={s.isMine ? t('Ty') : (s.employeeName ?? t('Kolega'))} avatar={s.employeeAvatar}
                    tone={s.isMine ? 'ok' : 'muted'} meta={<span className="tabular-nums">{casSmeny(s.startTime, s.endTime)}</span>} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {velikost !== 'L' && dnyTymu.length > DNU_M && (
        <p className="t-meta mt-2">{t('{n, plural, one {…a další # den} few {…a další # dny} other {…a dalších # dní}}', { n: dnyTymu.length - DNU_M })}</p>
      )}
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
