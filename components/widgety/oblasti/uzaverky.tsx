'use client';

// Widgety oblasti „Uzávěrky" — komponenty (kolo 68, spec §2.5, §6.1).
//
// Vlastník v kole 69: balík B5a (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/uzaverky.ts;
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — hlídá to test AK-20 v scripts/testy/k68-widgety.ts.
//
// Kontrakt (spec §2.6): komponenta dostane WidgetProps (instance, velikost, nastaveni,
// nahled), kreslí se vždy v obalu <Widget> z ../Widget, data bere jen přes useDataWidgetu
// (URL null, dokud neplatí brána z registru a useSmi pro pole), navigaci přes useNavigace.
// Soubor se stahuje líně, až když je widget oblasti na ploše (registr.ts).
//
// Co tu je (kolo 68):
//  - uzaverky.predavka — nástupce modré tónované karty z Domů zaměstnance (štítek
//    psaný ručně verzálkami, text black/70): tři řádky `.list` + ListRow s ikonou
//    v jamce, autor a den v meta řádku, bez tónu;
//  - uzaverky.moje_uzaverka — nástupce limetkové karty s inkoustovým kolečkem
//    (a její šedé průhledné dvojnice, když nic nechybělo): výzva a jedno `primary sm`
//    „Vyplnit", neuzavřené směny jako řádky seznamu.

import { useMemo, type ReactNode } from 'react';
import { Button, ListRow, Stat } from '../../ui';
import { Icon } from '../../Icons';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { Widget } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';
import { useNavigace } from '../NavigaceKontext';
import { useOpravneni } from '../../role/useOpravneni';
import { czCount, czForm } from '@/lib/czech';
import { pragueDaySafe, pragueToday } from '@/lib/pragueTime';

// ---------------------------------------------------------------------------
// Pomocníci (záměrně v souboru — oblast je samostatný líný kus s jedním vlastníkem)
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

/** Den z databáze: „2026-09-26" i ISO s časem; jinak pražský den z časové značky. */
const den = (v: unknown): string => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : pragueDaySafe(v));
const hm = (t: unknown) => String(t ?? '').slice(0, 5);
const denVetou = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
function kdyVetou(d: string): string {
  if (d === pragueToday()) return 'dnes';
  if (d === pragueToday(-1)) return 'včera';
  return denVetou(d);
}

/** Ikona v jamce 36 px jako `lead` řádku (DP §3.6). */
function Jamka({ ikona }: { ikona: string }) {
  return (
    <span aria-hidden className="well grid h-9 w-9 shrink-0 place-items-center">
      <Icon name={ikona} size={16} className="text-black/55" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Předávka
// ---------------------------------------------------------------------------

interface Predavka {
  todo: string | null;
  runningOut: string | null;
  message: string | null;
  den: string;
  autor: string | null;
}

function vyberPredavku(raw: any): Predavka | null {
  if (!raw || typeof raw !== 'object' || !('handover' in raw)) throw new Error('Předávka přišla v nečekaném tvaru.');
  const h = raw.handover;
  if (!h || typeof h !== 'object') return null;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const p = { todo: text(h.todo), runningOut: text(h.runningOut), message: text(h.message) };
  if (!p.todo && !p.runningOut && !p.message) return null;
  return { ...p, den: den(raw.date), autor: text(raw.authorName) };
}

/** Pořadí řádků: co udělat, co dokoupit, pak vzkaz — tak, jak je formulář uzávěrky vyplňuje. */
const RADKY_PREDAVKY: { klic: 'todo' | 'runningOut' | 'message'; ikona: string; popisek: string }[] = [
  { klic: 'todo', ikona: 'check', popisek: 'Co dodělat' },
  { klic: 'runningOut', ikona: 'box', popisek: 'Co dochází' },
  { klic: 'message', ikona: 'chat', popisek: 'Vzkaz' },
];

function PredavkaWidget({ velikost }: WidgetProps) {
  const brana = useBrana(['uzaverky.predavka']);
  // „Žádná předávka" (handover: null) je platná odpověď, ne načítání: useDataWidgetu
  // čte data === null jako „ještě nedorazilo", proto obal { p }.
  const data = useDataWidgetu<{ p: Predavka | null }>(brana ? '/api/closings/handover' : null, raw => ({ p: vyberPredavku(raw) }));
  const p = data.data?.p ?? null;

  // Bez oprávnění ho plocha vůbec nepřipojí; kdyby přece, nesmí tvrdit „nic nepředala".
  if (!brana) return <Widget prazdno={null} />;

  const od = p ? [p.autor && `Od: ${p.autor}`, p.den && kdyVetou(p.den)].filter(Boolean).join(' · ') : '';
  return (
    <Widget nacteni={data} prazdno={p ? undefined : <p className="t-meta">Minulá směna nic nepředala.</p>}>
      {p && (
        <>
          {od && <p className="t-meta cz-sentence">{od}</p>}
          <ul className="list mt-1">
            {RADKY_PREDAVKY.filter(r => p[r.klic]).map(r => (
              <ListRow key={r.klic}
                lead={<Jamka ikona={r.ikona} />}
                // Text předávky se zalamuje (ListRow jinak řádek zkracuje) — ve střední
                // velikosti nejvýš na čtyři řádky, ve velké celý.
                title={<span className={`whitespace-normal text-pretty ${velikost === 'L' ? '' : 'line-clamp-4'}`}>{p[r.klic]}</span>}
                meta={r.popisek}
              />
            ))}
          </ul>
        </>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Moje uzávěrka
// ---------------------------------------------------------------------------

interface NeuzavrenaSmena { id: number; den: string; od: string; do: string }

function vyberNeuzavrene(raw: any): { smeny: NeuzavrenaSmena[]; zaJineho: boolean } {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.eligibleShifts)) throw new Error('Uzávěrky přišly v nečekaném tvaru.');
  return {
    smeny: raw.eligibleShifts.map((s: any, i: number) => ({ id: Number(s.id ?? i), den: den(s.date), od: hm(s.startTime), do: hm(s.endTime) })),
    // `isEmployer` = smí zavírat za jiné s volným datem; takovému API vlastní seznam nevrací.
    zaJineho: raw.isEmployer === true,
  };
}

const SMENA_NEUZAVRENA = { one: 'neuzavřená směna', few: 'neuzavřené směny', many: 'neuzavřených směn' };

function MojeUzaverka({ velikost, nahled }: WidgetProps) {
  const brana = useBrana(['uzaverky.vytvorit']);
  const { nacteno, ma } = useOpravneni();
  const nav = useNavigace();
  // Kdo smí zavírat za jiné (typicky vedení), vybírá den i směnu sám a API mu
  // seznam vlastních neuzavřených směn nevrací (eligibleShifts = []). Ptát se
  // by stálo celou historii uzávěrek a „všechno máš hotové" by byla lež —
  // widget je pak jen rychlý vstup do vyplnění. Když oprávnění nevíme, řekne to odpověď.
  const zaJinehoPredem = nacteno && ma('uzaverky.za_jineho');
  const data = useDataWidgetu(brana && !zaJinehoPredem ? '/api/closings' : null, vyberNeuzavrene);
  const zaJineho = zaJinehoPredem || data.data?.zaJineho === true;
  // Nejnovější nahoře (jako v API a ve formuláři uzávěrky) — ta se vyplňuje nejspíš teď.
  const smeny = useMemo(() => [...(data.data?.smeny ?? [])].sort((a, b) => b.den.localeCompare(a.den)), [data.data]);

  if (!brana) return <Widget prazdno={null} />;

  // Zaměstnanec vyplňuje na své záložce Uzávěrka, vedení v přehledu uzávěrek („Nová uzávěrka").
  const pohled = nav.smiPohled('closing') ? 'closing' : 'reports';
  const muze = !nahled && nav.smiPohled(pohled);
  const vyplnit = muze ? (
    <Button variant="primary" size="sm" icon="trend" onClick={() => nav.onNavigate(pohled)}>Vyplnit</Button>
  ) : null;
  const S = velikost === 'S';
  const n = smeny.length;

  let telo: ReactNode = null;
  let prazdno: ReactNode | undefined;
  if (zaJineho) {
    telo = S ? (
      <p className="t-meta text-pretty">Uzávěrku vyplníš za kteroukoli směnu.</p>
    ) : (
      <div className="space-y-3">
        <p className="t-meta text-pretty">Uzávěrku vyplníš za kteroukoli směnu a den — i za kolegu.</p>
        {vyplnit}
      </div>
    );
  } else if (n === 0) {
    prazdno = <p className="t-meta text-pretty">{S ? 'Uzávěrky máš hotové.' : 'Uzávěrky máš hotové. Na konci směny ji vyplníš tady.'}</p>;
  } else if (S) {
    telo = <Stat label="Chybí" value={n.toLocaleString('cs-CZ')} note={czForm(n, SMENA_NEUZAVRENA)} />;
  } else {
    telo = (
      <div className="space-y-3">
        <p className="text-[15px] font-medium leading-snug text-[#16181A] text-pretty">
          {n === 1 ? 'Vyplň uzávěrku ze své směny.' : `Máš ${czCount(n, SMENA_NEUZAVRENA)}.`}
        </p>
        <ul className="list">
          {smeny.slice(0, 5).map(s => (
            <ListRow key={`${s.id}-${s.den}`} title={<span className="cz-sentence block truncate">{denVetou(s.den)}</span>}
              value={s.od ? `${s.od}–${s.do}` : undefined} />
          ))}
        </ul>
        {n > 5 && <p className="t-meta">…a dalších {(n - 5).toLocaleString('cs-CZ')}</p>}
        {vyplnit}
      </div>
    );
  }

  return (
    <Widget
      nacteni={data}
      otevrit={S && muze ? () => nav.onNavigate(pohled) : undefined}
      prazdno={prazdno}
    >
      {telo}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'uzaverky.predavka': PredavkaWidget,
  'uzaverky.moje_uzaverka': MojeUzaverka,
};
