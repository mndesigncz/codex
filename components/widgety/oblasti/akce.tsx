'use client';

// Widgety oblasti „Akce" — komponenty (kolo 68, spec §2.5, §2.6 a §6.1).
//
// Vlastník v kole 69: balík B8 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/akce.ts,
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — test AK-20 (scripts/testy/k68-widgety.ts) klíče čte z textu, proto bez spreadu.
//
// Nejbližší akce opravuje dřívější blok Přehledu (audit Přehledu vedení a Domů
// zaměstnance): modrá ručně tónovaná karta se surovým hexem a info tónem
// použitým pro kategorii je pryč — widget je bílá karta jako každý jiný. Lidé
// v obsluze jsou PersonChip s avatarem místo emoji vlepeného do textu, odkaz
// dál je „Akce" v hlavičce (ghost s chevronem) místo modrého „Akce →"
// a „Jsi na akci" je Chip, ne ručně psaná limetková pilulka.
//
// Kolo 69 (B8) přidalo Přípravu akce (checklist nejbližší akce k odškrtání,
// jen s akce.checklist) a Výsledek akce (tržba − náklady poslední proběhlé,
// jen s akce.finance — bez něj API čísla vůbec nepošle).
//
// Data jen přes useDataWidgetu (sdílená mezipaměť — všechny tři widgety
// i nástroj stránky Akce čtou tutéž /api/events), dotaz až při
// `nacteno && ma('akce.zobrazit')` (spec §1.5); v náhledu se nic nenaviguje
// ani nezapisuje.

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { dayPlus, pragueToday } from '@/lib/pragueTime';
import { apiMessage } from '@/lib/api';
import { czCount, type CzNoun } from '@/lib/czech';
import { akceKPriprave, posledniProbehla, prepniBod, vyberAkceSouhrn, vysledekAkce } from '@/lib/klientPrehled';
import { useMoney } from '../../CurrencyProvider';
import { Chip, ListRow, PersonChip, Stat, StatRow } from '../../ui';
import { Icon } from '../../Icons';
import { useOpravneni } from '../../role/useOpravneni';
import { Widget, useWidget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';

type Klic = string | readonly string[];

const seznam = (x: unknown): any[] => (Array.isArray(x) ? x : []);

/**
 * Brána widgetu (spec §1.5): přísně `nacteno && ma()` — `ma()` před načtením
 * oprávnění vrací ANO a dotaz by odešel dřív, než víme, jestli na akce divák
 * má. Když /api/teams/mine selže, rozhodl už server seznamem v rozložení.
 */
function useBrana(klic: Klic): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  return { ok: nacteno ? ma(klic) : chyba, ceka: !nacteno && !chyba };
}

/** „Ještě nevíme, jestli smí": kostra a žádný dotaz. */
const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

// ---------------------------------------------------------------------------
// Nejbližší akce
// ---------------------------------------------------------------------------

interface Clovek { id: number; name: string; avatar: string | null }

interface Akce {
  id: number;
  title: string;
  description: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  status: string;
  crew: number[];
  crewPeople: Clovek[];
}

const hhmm = (t: unknown) => (typeof t === 'string' && t ? t.slice(0, 5) : null);

function vyberAkce(raw: any): Akce[] {
  return seznam(raw?.events).map((e: any) => ({
    id: Number(e.id),
    title: String(e.title ?? 'Akce'),
    description: typeof e.description === 'string' && e.description.trim() ? e.description.trim() : null,
    date: String(e.date ?? '').slice(0, 10),
    startTime: hhmm(e.startTime),
    endTime: hhmm(e.endTime),
    location: typeof e.location === 'string' && e.location.trim() ? e.location.trim() : null,
    status: String(e.status ?? 'planned'),
    crew: seznam(e.crew).map(Number).filter(Number.isFinite),
    crewPeople: seznam(e.crewPeople).map((p: any) => ({
      id: Number(p.id),
      name: String(p.name ?? 'Neznámý'),
      // Server za chybějící avatar posílá 👤 — Avatar pak kreslí vlastní siluetu (DP §3.18).
      avatar: typeof p.avatar === 'string' && p.avatar !== '👤' ? p.avatar : null,
    })),
  }));
}

/** Datum akce větou: „dnes", „zítra", jinak „čtvrtek 2. října" (malým — velké dodá cz-sentence). */
function denAkce(datum: string, dnes: string): string {
  if (datum === dnes) return 'dnes';
  if (datum === dayPlus(dnes, 1)) return 'zítra';
  // Poledne, ne půlnoc: datum bez času se tak nepřehoupne do vedlejšího dne v žádné zóně.
  const d = new Date(`${datum}T12:00:00`);
  return Number.isNaN(d.getTime()) ? datum : d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
}

function kdyAKde(a: Akce, dnes: string): string {
  const cas = a.startTime ? (a.endTime ? `${a.startTime}–${a.endTime}` : a.startTime) : null;
  return [denAkce(a.date, dnes), cas, a.location].filter(Boolean).join(' · ');
}

/** První písmeno velké — pro meta řádek seznamu, kam se cz-sentence nedá dát bez rozbití ořezu. */
const sVelkym = (s: string) => s.charAt(0).toLocaleUpperCase('cs-CZ') + s.slice(1);

function NejblizsiAkce({ velikost, nastaveni }: WidgetProps<{ pocet?: unknown }>) {
  const { data: session } = useSession();
  const { role } = useOpravneni();
  const { ok, ceka } = useBrana(widget('akce.nejblizsi')?.opravneni.vse ?? ['akce.zobrazit']);
  const data = useDataWidgetu(ok ? '/api/events' : null, vyberAkce);
  const dnes = pragueToday();
  const kolik = nastaveni.pocet === '3' ? 3 : 1;
  // „Jsi v obsluze" jen osobnímu účtu; tablet za barem je sdílený a „já" nemá.
  const meId = role?.typ === 'kiosk' ? null : Number((session?.user as { id?: string } | undefined)?.id) || null;
  const nadchazejici = (data.data ?? [])
    .filter(a => a.date >= dnes && a.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    .slice(0, kolik);
  const jsem = (a: Akce) => meId != null && a.crew.includes(meId);

  return (
    <Widget nacteni={ceka ? CEKA : data} odkaz={{ popisek: 'Akce', pohled: 'events' }}
      // Tři akce jsou seznam i ve střední velikosti — kostra má mít tvar toho, co přijde.
      kostra={kolik === 3 ? 'seznam' : undefined}
      prazdno={nadchazejici.length === 0 ? <p className="t-meta">Žádná akce v plánu.</p> : undefined}>
      {kolik === 1 && nadchazejici[0] ? (() => {
        const a = nadchazejici[0];
        return (
          <div className="min-w-0 space-y-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug text-[#16181A] text-balance">{a.title}</p>
              <p className="t-meta mt-0.5 cz-sentence">{kdyAKde(a, dnes)}</p>
              {velikost === 'L' && a.description && <p className="mt-2 text-sm text-black/70 line-clamp-2 text-pretty">{a.description}</p>}
            </div>
            {/* Chip nezalamuje — krátká věta, ať se na telefonu vejde. */}
            {jsem(a) && <Chip tone="ok" size="sm" icon="check">Jsi v obsluze</Chip>}
            {a.crewPeople.length > 0 && (
              <div>
                <p className="t-label">Obsluha</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {a.crewPeople.map(p => (
                    <PersonChip key={p.id} name={p.name} avatar={p.avatar} size="sm" tone={meId === p.id ? 'ok' : 'muted'} />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })() : (
        <ul className="list">
          {nadchazejici.map(a => (
            <ListRow key={a.id} title={a.title} meta={sVelkym(kdyAKde(a, dnes))}
              right={jsem(a)
                ? <Chip tone="ok" size="sm">Jsi v obsluze</Chip>
                : a.crewPeople.length > 0 ? <Chip tone="muted" size="sm">{a.crewPeople.length} v obsluze</Chip> : undefined} />
          ))}
        </ul>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Příprava akce
// ---------------------------------------------------------------------------

const ID_CHECKLIST = 'akce.checklist';
const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };

function PripravaAkce(_: WidgetProps) {
  const smi = useSmi();
  const { nahled } = useWidget();
  const { ok, ceka } = useBrana(widget(ID_CHECKLIST)?.opravneni.vse ?? ['akce.zobrazit']);
  const data = useDataWidgetu(ok ? '/api/events' : null, vyberAkceSouhrn);
  const { reload } = data;
  const klic = widget(ID_CHECKLIST)?.opravneni.pole?.['akce:odskrtnout'] ?? 'akce.checklist';
  const odskrta = !nahled && smi(klic);
  const dnes = pragueToday();
  const akce = akceKPriprave(data.data ?? [], dnes);
  // Odškrtnutí se ukáže hned; server ho potvrdí a při chybě se vrátí.
  const [mistni, setMistni] = useState<{ id: number; body: boolean[] } | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  useEffect(() => { setMistni(null); }, [data.data]);
  const body = akce ? akce.checklist.map((c, i) => ({ ...c, done: mistni?.id === akce.id ? mistni.body[i] ?? c.done : c.done })) : [];
  const zbyva = body.filter(c => !c.done).length;

  const prepni = async (i: number) => {
    if (!akce || !odskrta) return;
    const novy = prepniBod(body, i);
    setMistni({ id: akce.id, body: novy.map(c => c.done) });
    setChyba(null);
    try {
      const res = await fetch(`/api/events/${akce.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklist: novy }),
      });
      if (!res.ok) { const x = await res.json().catch(() => ({})); throw new Error(typeof x?.error === 'string' ? x.error : 'Uložení se nepodařilo.'); }
    } catch (e) {
      setMistni(null);
      setChyba(apiMessage(e, 'Spojení se serverem selhalo.'));
    } finally {
      reload();
      obnovDataWidgetu('/api/events');
    }
  };

  return (
    <Widget nacteni={ceka ? CEKA : data} odkaz={{ popisek: 'Akce', pohled: 'events' }}
      doplnek={akce && zbyva > 0 ? <Chip tone="muted" size="sm">{zbyva}</Chip> : undefined}
      prazdno={data.data && !akce ? <p className="t-meta">Žádná nadcházející akce s přípravou.</p> : undefined}>
      {akce && (
        <div className="space-y-3">
          <p className="t-meta cz-sentence">{akce.nazev} · {denAkce(akce.datum, dnes)}{akce.zacatek ? ` v ${akce.zacatek}` : ''}</p>
          {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
          {zbyva === 0 && <p className="note note-ok" role="status">Všechno připravené.</p>}
          <ul className="list" aria-label={`Příprava: ${akce.nazev}`}>
            {body.map((c, i) => (
              <li key={i} className="list-row">
                <label className={`flex min-w-0 flex-1 items-start gap-3 ${odskrta ? 'cursor-pointer' : ''}`}>
                  <input type="checkbox" checked={c.done} disabled={!odskrta} onChange={() => { void prepni(i); }}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[#8FB811]" />
                  <span className={`min-w-0 text-[15px] leading-snug text-pretty ${c.done ? 'text-black/45' : 'text-[#16181A]'}`}>{c.text}</span>
                </label>
              </li>
            ))}
          </ul>
          {!odskrta && !nahled && zbyva > 0 && <p className="t-meta">Zbývá {czCount(zbyva, BOD)}. Odškrtávat může, kdo má přípravu akcí na starosti.</p>}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Výsledek akce
// ---------------------------------------------------------------------------

const ID_VYSLEDEK = 'akce.vysledek';
/** Druhý pád po „z“: z 1 uzávěrky, ze 3 uzávěrek. */
const Z_UZAVEREK: CzNoun = { one: 'uzávěrky', few: 'uzávěrek', many: 'uzávěrek' };

function VysledekAkce({ velikost }: WidgetProps) {
  const money = useMoney();
  const nav = useNavigace();
  const { ok, ceka } = useBrana(widget(ID_VYSLEDEK)?.opravneni.vse ?? ['akce.zobrazit', 'akce.finance']);
  const data = useDataWidgetu(ok ? '/api/events' : null, vyberAkceSouhrn);
  const dnes = pragueToday();
  const a = posledniProbehla(data.data ?? [], dnes);
  const vysledek = a ? vysledekAkce(a) : null;
  const prazdno = data.data && !a ? <p className="t-meta">Zatím žádná proběhlá akce s tržbou nebo náklady.</p> : undefined;
  const tonVysledku = vysledek == null ? undefined : vysledek >= 0 ? 'text-ok-ink' : 'text-bad-ink';
  const castka = vysledek == null ? '–' : `${vysledek > 0 ? '+' : ''}${money(vysledek)}`;

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} prazdno={prazdno}
        otevrit={nav.smiPohled('events') ? () => nav.onNavigate('events') : undefined}>
        {a && <Stat label="Výsledek" value={<span className={tonVysledku}>{castka}</span>} note={a.nazev} />}
      </Widget>
    );
  }
  return (
    <Widget nacteni={ceka ? CEKA : data} prazdno={prazdno} odkaz={{ popisek: 'Akce', pohled: 'events' }}>
      {a && (
        <div className="space-y-3">
          <p className="t-meta cz-sentence">{a.nazev} · {denAkce(a.datum, dnes)}</p>
          <StatRow>
            <Stat label="Tržba" value={a.trzba == null ? '–' : money(a.trzba)}
              note={a.uzaverek > 0 ? `${a.uzaverek >= 2 && a.uzaverek <= 4 ? 'ze' : 'z'} ${czCount(a.uzaverek, Z_UZAVEREK)}` : 'zapsaná ručně'} />
            <Stat label="Náklady" value={a.naklady == null ? '–' : money(a.naklady)} />
            <Stat label="Výsledek" value={<span className={tonVysledku}>{castka}</span>}
              note={vysledek == null ? undefined : <span className="inline-flex items-center gap-1"><Icon name="trend" size={13} className={vysledek < 0 ? 'rotate-180' : ''} />{vysledek >= 0 ? 'v plusu' : 've ztrátě'}</span>} />
          </StatRow>
        </div>
      )}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'akce.nejblizsi': NejblizsiAkce,
  'akce.checklist': PripravaAkce,
  'akce.vysledek': VysledekAkce,
};
