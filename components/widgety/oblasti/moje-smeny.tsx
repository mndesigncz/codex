'use client';

// Widgety oblasti „Moje směny" — komponenty (kolo 68, spec §2.5, §6.1).
//
// Vlastník v kole 69: balík B1 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/moje-smeny.ts;
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — hlídá to test AK-20 v scripts/testy/k68-widgety.ts.
//
// Kontrakt (spec §2.6): komponenta dostane WidgetProps (instance, velikost, nastaveni,
// nahled), kreslí se vždy v obalu <Widget> z ../Widget, data bere jen přes useDataWidgetu
// (URL null, dokud neplatí brána z registru a useSmi pro pole), navigaci přes useNavigace.
// Soubor se stahuje líně, až když je widget oblasti na ploše (registr.ts).
//
// Co tu je (kolo 68):
//  - moje.nejblizsi_smena — nástupce dlaždice z Domů zaměstnance, která byla
//    <button glass-card> (průhledná, šedá), s ikonou v limetkovém kolečku, datem
//    30 px a prázdnem jen textem. Teď bílá karta widgetu, čas jako Stat (28 px)
//    a den větou; malá velikost je celá proklik do Mých směn.

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Stat } from '../../ui';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { Widget, type StavNacteni } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';
import { useNavigace } from '../NavigaceKontext';
import { pragueHM, pragueToday } from '@/lib/pragueTime';

// ---------------------------------------------------------------------------
// Pomocníci (záměrně v souboru — oblast je samostatný líný kus s jedním vlastníkem)
// ---------------------------------------------------------------------------

const RELACE_NACITA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

/**
 * Id přihlášeného. Kontrakt widgetu uživatele nenese a vlastní směny se
 * berou přes `?employeeId=` — jen tahle větev /api/shifts filtruje podnik
 * (bez parametru by zaměstnanec dostal směny ze všech podniků a vedení celý tým).
 */
function useJa(): { id: number | null; stav: StavNacteni | null } {
  const { data, status, update } = useSession();
  if (status === 'loading') return { id: null, stav: RELACE_NACITA };
  const id = Number((data?.user as { id?: unknown } | undefined)?.id);
  if (Number.isFinite(id) && id > 0) return { id, stav: null };
  return { id: null, stav: { data: null, error: 'Nevím, kdo je přihlášený — obnov stránku.', loading: false, reload: () => { void update(); } } };
}

const den = (v: unknown): string => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : '');
const hm = (t: unknown) => String(t ?? '').slice(0, 5);

/** „2026-09-28" → „pondělí 28. září" (poledne, ať den neuteče přes letní čas). */
const denVetou = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
/** Krátce do štítku: „Dnes", „Zítra", jinak „po 28. 9.". */
function denKratce(d: string): string {
  if (d === pragueToday()) return 'Dnes';
  if (d === pragueToday(1)) return 'Zítra';
  return new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

// Typ směny nese kategorie, ne stavová barva (ScheduleBuilder, COLORS → cat-dot).
const KATEGORIE_BARVY: Record<string, number> = {
  '#c8f542': 1, '#3b82f6': 2, '#0a84ff': 2, '#8b5cf6': 3, '#f59e0b': 4, '#14b8a6': 5, '#ec4899': 6, '#f43f5e': 6,
};
// API vrací u směny bez typu jeho surovou hodnotu; tyhle dvě do věty nepatří.
const POPISEK_TYPU: Record<string, string> = { auto: 'Mimo rozvrh', custom: 'Směna' };

interface MojeSmena { date: string; startTime?: string; endTime?: string; start_time?: string; end_time?: string; typeLabel?: string; typeColor?: string }

function vyberSmeny(raw: any): MojeSmena[] {
  if (!Array.isArray(raw)) throw new Error('Směny přišly v nečekaném tvaru.');
  return raw;
}

// ---------------------------------------------------------------------------
// Nejbližší směna
// ---------------------------------------------------------------------------

function NejblizsiSmena({ velikost, nahled }: WidgetProps) {
  const ja = useJa();
  const nav = useNavigace();
  const data = useDataWidgetu(ja.id != null ? `/api/shifts?employeeId=${ja.id}` : null, vyberSmeny);

  const { prvni, dalsi, probiha } = useMemo(() => {
    const dnes = pragueToday();
    const ted = pragueHM();
    const nadchazejici = (data.data ?? [])
      .map(s => ({ den: den(s.date), od: hm(s.startTime ?? s.start_time), do: hm(s.endTime ?? s.end_time), s }))
      .filter(x => {
        if (!x.den || x.den < dnes) return false;
        if (x.den > dnes) return true;
        // Dnešní směna, která už skončila, „nejbližší" není; přes půlnoc (konec < začátek) ještě běží.
        return !x.do || x.do > ted || x.do < x.od;
      })
      .sort((a, b) => a.den.localeCompare(b.den) || a.od.localeCompare(b.od));
    const p = nadchazejici[0] ?? null;
    return {
      prvni: p,
      dalsi: nadchazejici[1] ?? null,
      probiha: !!p && p.den === dnes && !!p.od && p.od <= ted,
    };
  }, [data.data]);

  const S = velikost === 'S';
  const muze = !nahled && nav.smiPohled('my-shifts');
  const typ = prvni ? POPISEK_TYPU[String(prvni.s.typeLabel ?? '')] ?? prvni.s.typeLabel ?? null : null;
  const kat = prvni ? KATEGORIE_BARVY[String(prvni.s.typeColor ?? '').toLowerCase()] ?? null : null;
  const cas = prvni ? (prvni.do ? `${prvni.od}–${prvni.do}` : prvni.od) : '';

  return (
    <Widget
      nacteni={ja.stav ?? data}
      odkaz={S ? undefined : { popisek: 'Moje směny', pohled: 'my-shifts' }}
      otevrit={S && muze ? () => nav.onNavigate('my-shifts') : undefined}
      prazdno={prvni ? undefined : <p className="t-meta">Další směnu v rozvrhu zatím nemáš.</p>}
    >
      {prvni && (S ? (
        // Malá karta má na telefonu ~140 px: celé „08:00–16:00" v 28 px by přeteklo,
        // proto velký jen začátek a konec v poznámce.
        <Stat label={probiha ? 'Právě probíhá' : denKratce(prvni.den)} value={prvni.od || '—'}
          note={[prvni.do && `do ${prvni.do}`, typ].filter(Boolean).join(' · ') || undefined} />
      ) : (
        <div className="space-y-2">
          <Stat label={probiha ? 'Právě probíhá' : denKratce(prvni.den)} value={cas || '—'}
            // ::first-letter (cz-sentence) funguje jen na blokovém prvku — řádek bez typu začíná dnem.
            note={<span className="block truncate cz-sentence">
              {typ && <><span aria-hidden className={`inline-block h-2 w-2 rounded-full align-middle mr-1.5 ${kat ? `cat-dot-${kat}` : 'bg-black/15'}`} />{typ} · </>}
              {denVetou(prvni.den)}
            </span>} />
          {dalsi && (
            <p className="t-meta">
              Potom <span className="tabular-nums">{denVetou(dalsi.den)}{dalsi.od ? `, ${dalsi.od}${dalsi.do ? `–${dalsi.do}` : ''}` : ''}</span>
            </p>
          )}
        </div>
      ))}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'moje.nejblizsi_smena': NejblizsiSmena,
};
