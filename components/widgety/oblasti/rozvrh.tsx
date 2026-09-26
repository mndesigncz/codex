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

import { useMemo, type ReactNode } from 'react';
import { Avatar, Button, Chip, EmptyState, ListRow, PersonChip, Stat } from '../../ui';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { Widget, type StavNacteni } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { obnovOpravneni, useOpravneni } from '../../role/useOpravneni';
import { czCount, czVerb, DEN } from '@/lib/czech';
import { parseDbTime, pragueDayOf, pragueHM, pragueToday } from '@/lib/pragueTime';

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

/** Den z databáze nebo JSONu: „2026-09-26" i „2026-09-26T00:00:00.000Z" → „2026-09-26". */
const den = (v: unknown): string => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : '');
const hm = (t: unknown) => String(t ?? '').slice(0, 5);
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

// Typ směny nese kategorie (cat-dot-1…6), ne stavová barva: „ranní" není
// „v pořádku" a „odpolední" není „info". Barvy, které si podnik u typu směny
// vybírá (ScheduleBuilder, COLORS), se mapují na nejbližší kategorii.
const KATEGORIE_BARVY: Record<string, number> = {
  '#c8f542': 1, '#3b82f6': 2, '#0a84ff': 2, '#8b5cf6': 3, '#f59e0b': 4, '#14b8a6': 5, '#ec4899': 6, '#f43f5e': 6,
};
const katBarvy = (barva: unknown): number | null => KATEGORIE_BARVY[String(barva ?? '').toLowerCase()] ?? null;
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
            return (
              <ListRow key={c.id}
                lead={<Avatar emoji={c.avatar} size="sm" />}
                title={c.name}
                meta={!zadal ? 'ještě nezadáno' : dnu === 0 ? 'bez omezení' : `nemůže ${czCount(dnu, DEN)}`}
                right={zadal ? <Chip tone="ok" size="sm">Zadáno</Chip> : <Chip tone="wait" size="sm">Chybí</Chip>}
              />
            );
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

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'rozvrh.dnesni_smeny': DnesniSmeny,
  'rozvrh.dostupnost_tymu': DostupnostTymu,
  'rozvrh.pripominka_dostupnosti': PripominkaDostupnosti,
};
