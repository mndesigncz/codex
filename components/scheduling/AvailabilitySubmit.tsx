'use client';

// Dostupnost — kdy člověk může příští měsíc pracovat (kolo 69, balík B1).
//
// Zaměstnanec ji má jako samostatnou stránku: plocha s widgety
// (zamestnanec.dostupnost) a kalendář dostupnosti jako hlavní nástroj.
// Vedení ji vyplňuje v Mých směnách pod plochou (EmployerLayout, jiný balík,
// ji tam připojuje s `headingLevel="h2"`) — tam je jen sekcí bez plochy,
// protože plocha Mých směn už na stránce je.
//
// Kolo 69: nástroj je jedna karta (kroky oddělené linkou, ne dvě karty vedle
// sebe), přepínač měsíce sdílený MonthNav (dřív vlastní šipky s `disabled`,
// které odfokusovaly klávesnici), preference Segmented (vybráno = inkoust,
// ne limetka), legenda tečkami místo rámečků `rounded-md` a v podtitulku
// čárky místo šipek „→". Limetka zůstává jediná — „Odeslat dostupnost".
// Po odeslání se obnoví widget „Zadej dostupnost" (stejná URL).

import { useState, useEffect, useMemo } from 'react';
import { zkratkyDnu, odsazeniMesice, zacatekTydne } from '@/lib/week';
import { useCurrency } from '@/components/CurrencyProvider';

import { Button, Card, Chip, ErrorState, Field, Input, MonthNav, PageHeader, Segmented, Skeleton, Textarea } from '../ui';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu } from '../widgety/useDataWidgetu';
import { okJson } from '@/lib/api';
interface Props {
  user: { id?: string; name?: string | null; avatar?: string; role?: string };
  /**
   * Úroveň nadpisu. Samostatná obrazovka má `h1`; uvnitř Mých směn, kde
   * `h1` už patří jim, musí být `h2` — dva `h1` na stránce znamenají, že
   * kdo se pohybuje po nadpisech, nepozná, která je ta hlavní.
   */
  headingLevel?: 'h1' | 'h2';
}

type DayState = string; // 'available' | 'off' | legacy 'morning'/'afternoon' | 'type:<id>'

const SHIFTS = [
  { id: 'morning', label: 'Ranní' },
  { id: 'afternoon', label: 'Odpolední' },
  { id: 'flexible', label: 'Flexibilní' },
];

// One tone per shift type, cycled by position — the day choices mirror the
// team's OWN shift types, nothing is hard-coded to "ranní/odpolední".
// Kategoriální paleta z globals.css — tytéž odstíny jako v Rozvrhu, ať
// „druhý typ směny" vypadá na obou obrazovkách stejně.
const TYPE_TONES = [
  { cls: 'cat-1', dot: 'cat-dot-1 ring-1 ring-black/10' },
  { cls: 'cat-2', dot: 'cat-dot-2 ring-1 ring-black/10' },
  { cls: 'cat-3', dot: 'cat-dot-3 ring-1 ring-black/10' },
  { cls: 'cat-4', dot: 'cat-dot-4 ring-1 ring-black/10' },
  { cls: 'cat-5', dot: 'cat-dot-5 ring-1 ring-black/10' },
];
const AVAILABLE_META = {
  label: 'Dostupný',
  cls: 'bg-black/[0.03] border-black/10 text-[#16181A] hover:bg-black/[0.06]',
  dot: 'bg-black/15 ring-1 ring-black/20 dark:ring-white/25',
};
const OFF_META = {
  label: 'Nemůžu',
  cls: 'bg-bad/20 border-bad/40 text-bad-ink line-through hover:bg-bad/30',
  dot: 'bg-bad ring-1 ring-bad/50',
};

function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function buildGrid(month: string, zacatek: 0 | 1) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = odsazeniMesice(first, zacatek);
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function AvailabilitySubmit({ user, headingLevel = 'h1' }: Props) {
  const now = new Date();
  const currentMonth = ym(now);
  const nextMonth = ym(new Date(now.getFullYear(), now.getMonth() + 1, 1));

  const [month, setMonth] = useState(nextMonth);
  const [dayStates, setDayStates] = useState<Record<string, DayState>>({});
  const [preferredShift, setPreferredShift] = useState<string>('flexible');
  const [maxShifts, setMaxShifts] = useState<string>('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [existing, setExisting] = useState(false);
  // Načtení uložené dostupnosti selhalo.
  //
  // Bez tohohle příznaku byl tichý `catch` ztrátou dat, ne jen prázdnou
  // obrazovkou: mřížka zůstala prázdná, což znamená „můžu všechny dny",
  // a odeslání tím přepsalo dřív poslanou dostupnost. Člověk si myslel,
  // že jen potvrzuje, co už poslal.
  const [loadFailed, setLoadFailed] = useState(false);
  /** Zvýšením se načtení pustí znovu — `setMonth(m => m)` by efekt nespustil. */
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  const [types, setTypes] = useState<{ id: number; name: string }[]>([]);
  const [typesErr, setTypesErr] = useState(false);
  useEffect(() => {
    fetch('/api/shift-types').then(okJson)
      .then((d) => { setTypes((d.shiftTypes ?? []).map((t: any) => ({ id: t.id, name: t.name }))); setTypesErr(false); })
      // Bez typů směn se klepání přepne na starý „ráno / odpoledne" — což je
      // správný stav jen když je tým opravdu nemá, ne když vypadla síť.
      .catch(() => setTypesErr(true));
  }, []);
  // The tap cycle follows the team's shift types; legacy binary only when none exist.
  const stateList: DayState[] = useMemo(
    () => (types.length
      ? ['available', ...types.map((t) => `type:${t.id}`), 'off']
      : ['available', 'morning', 'afternoon', 'off']),
    [types],
  );
  const metaOf = (st: DayState) => {
    if (st === 'available') return AVAILABLE_META;
    if (st === 'off') return OFF_META;
    if (st === 'morning') return { ...TYPE_TONES[0], label: 'Jen ranní' };
    if (st === 'afternoon') return { ...TYPE_TONES[1], label: 'Jen odpolední' };
    const id = parseInt(st.slice(5));
    const idx = types.findIndex((t) => t.id === id);
    return {
      ...TYPE_TONES[(idx < 0 ? 0 : idx) % TYPE_TONES.length],
      label: `Jen ${types.find((t) => t.id === id)?.name ?? 'směna'}`,
    };
  };

  // Začátek týdne si volí podnik; dřív tu bylo pondělí natvrdo.
  const zacatek = zacatekTydne(useCurrency().weekStart);
  const grid = useMemo(() => buildGrid(month, zacatek), [month, zacatek]);
  const todayStr = ym(now) === month ? `${month}-${String(now.getDate()).padStart(2, '0')}` : null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setConfirmed(false);
    setLoadFailed(false);
    fetch(`/api/availability?mine=1&month=${month}`)
      .then((r) => {
        // Bez tohohle je odpověď 500 k nerozeznání od „ještě jsi nic
        // neposlal" — a právě ta záměna přepisovala odeslanou dostupnost.
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data) => {
        if (!active) return;
        if (data && data.id) {
          setExisting(true);
          const map: Record<string, DayState> = {};
          const dp = (data.dayPreferences ?? {}) as Record<string, string>;
          Object.entries(dp).forEach(([date, v]) => {
            if (v === 'morning' || v === 'afternoon' || v === 'off' || /^type:\d+$/.test(v)) map[date] = v;
          });
          (data.unavailableDates ?? []).forEach((date: string) => {
            if (!map[date]) map[date] = 'off';
          });
          setDayStates(map);
          setPreferredShift(data.preferredShift ?? 'flexible');
          setMaxShifts(data.maxShifts != null ? String(data.maxShifts) : '');
          setNote(data.note ?? '');
        } else {
          setExisting(false);
          setDayStates({});
          setPreferredShift('flexible');
          setMaxShifts('');
          setNote('');
        }
      })
      .catch(() => { if (active) setLoadFailed(true); })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month, reloadKey]);

  const stateOf = (date: string): DayState => dayStates[date] ?? 'available';

  const cycleDay = (date: string) => {
    setConfirmed(false);
    setDayStates((prev) => {
      const cur = prev[date] ?? 'available';
      const i = stateList.indexOf(cur);
      const next = stateList[(i < 0 ? 0 : i + 1) % stateList.length];
      const copy = { ...prev };
      if (next === 'available') delete copy[date];
      else copy[date] = next;
      return copy;
    });
  };

  const submit = async () => {
    setSaving(true); setErr('');
    try {
      // day_preferences: full map of non-default states
      const dayPreferences: Record<string, string> = { ...dayStates };
      const unavailableDates = Object.entries(dayStates)
        .filter(([, v]) => v === 'off')
        .map(([d]) => d)
        .sort();
      const res = await fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          unavailableDates,
          dayPreferences,
          preferredShift,
          maxShifts: maxShifts === '' ? null : parseInt(maxShifts),
          note: note.trim() || null,
        }),
      });
      if (res.ok) {
        setExisting(true);
        setConfirmed(true);
        // Připomínka „Zadej dostupnost" (Domů, Moje směny) čte tutéž URL.
        obnovDataWidgetu(`/api/availability?month=${month}&mine=1`);
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || 'Dostupnost se nepodařilo odeslat.');
      }
    } catch {
      setErr('Nepodařilo se spojit se serverem.');
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    grid.forEach((cell) => {
      if (!cell) return;
      const st = dayStates[cell] ?? 'available';
      c.set(st, (c.get(st) ?? 0) + 1);
    });
    return c;
  }, [grid, dayStates]);

  const popisCyklu = stateList.map((st) => metaOf(st).label.toLowerCase()).join(', ');
  const nastroj = (
    <Card as="section" aria-labelledby="dostupnost-kalendar" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="dostupnost-kalendar" className="t-card">Kalendář dostupnosti</h2>
        {/* Do minulosti nejde — dostupnost na uplynulý měsíc nemá smysl. */}
        <MonthNav value={month} onChange={setMonth} min={currentMonth} />
      </div>

      {typesErr && (
        <p className="note note-wait cz-sentence">
          Typy směn se nenačetly, takže klepání zatím nabízí jen ráno a odpoledne.
          Jestli si tým vede vlastní typy, načti stránku znovu — ať vybíráš z těch svých.
        </p>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy>
          <Skeleton className="h-8 w-2/3 rounded-full" />
          <Skeleton className="h-64" />
        </div>
      ) : loadFailed ? (
        // Raději nic než prázdná mřížka, která vypadá jako „můžu všechny dny".
        <ErrorState
          compact
          title="Dostupnost se nenačetla"
          hint="Dokud nevíme, co jsi poslal/a dřív, nejde to odeslat znovu — přepsalo by to původní dostupnost prázdnou."
          onRetry={() => setReloadKey(k => k + 1)}
        />
      ) : (
        <>
          <div>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 t-meta mb-2" aria-label="Legenda">
              {stateList.map((st) => (
                <li key={st} className="flex items-center gap-1.5">
                  <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${metaOf(st).dot}`} /> {metaOf(st).label}
                </li>
              ))}
            </ul>
            <p className="t-meta mb-3 text-pretty">
              Klepnutím na den přepínáš: {popisCyklu}. Denní volby jsou závazné — „Jen …" a „Nemůžu" generátor vždy dodrží.
            </p>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
              {zkratkyDnu(zacatek).map((d) => (
                <div key={d} className="text-center text-[11px] font-medium text-black/35 py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {grid.map((cell, i) => {
                if (!cell) return <div key={i} />;
                const day = parseInt(cell.split('-')[2]);
                const s = stateOf(cell);
                const meta = metaOf(s);
                const isToday = cell === todayStr;
                return (
                  <button
                    key={cell}
                    type="button"
                    onClick={() => cycleDay(cell)}
                    title={meta.label}
                    aria-label={`${day}. — ${meta.label}`}
                    className={`tap-target-sm aspect-square rounded-xl text-sm font-medium flex items-center justify-center transition-colors duration-200 border ${meta.cls} ${
                      isToday ? 'ring-2 ring-black/30 dark:ring-white/40' : ''
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="t-meta mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {stateList.map((st) => (
                <span key={st}>
                  {metaOf(st).label}: <span className="text-black/70 font-medium tabular-nums">{counts.get(st) ?? (st === 'available' ? grid.filter(Boolean).length - Array.from(counts.values()).reduce((a, b) => a + b, 0) : 0)}</span>
                </span>
              ))}
            </p>
          </div>

          <div className="space-y-4 pt-4 border-t border-black/[0.06]">
            {/* Segmented nemá pole, ke kterému by šel <label> — jméno nese role="group" s aria-label. */}
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-black/70" aria-hidden>Preferovaná směna</p>
              <Segmented ariaLabel="Preferovaná směna" value={preferredShift} onChange={(v) => { setPreferredShift(v); setConfirmed(false); }}
                options={SHIFTS.map(s => ({ id: s.id, label: s.label }))} />
              <p className="text-xs text-black/50">Obecně a nezávazně — denní volby v kalendáři mají přednost.</p>
            </div>

            <Field id="dostupnost-max-smen" label="Maximální počet směn" hint="Nepovinné.">
              <Input
                id="dostupnost-max-smen"
                type="number" inputMode="numeric"
                min={0}
                value={maxShifts}
                onChange={(e) => { setMaxShifts(e.target.value); setConfirmed(false); }}
                className="!w-full sm:!w-40"
              />
            </Field>

            <Field id="dostupnost-poznamka" label="Poznámka pro vedení" hint="Nepovinné — třeba víkendy ano, ve středu škola.">
              <Textarea
                id="dostupnost-poznamka"
                value={note}
                onChange={(e) => { setNote(e.target.value); setConfirmed(false); }}
                rows={3}
                className="resize-none"
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-black/[0.06]">
            {err && <p className="w-full note note-danger text-sm" role="alert">{err}</p>}
            <Button variant="accent" icon="send" block loading={saving} disabled={loadFailed} onClick={submit}
              title={loadFailed ? 'Nejdřív je potřeba načíst, co jsi poslal/a dřív.' : undefined}>
              {existing ? 'Aktualizovat dostupnost' : 'Odeslat dostupnost'}
            </Button>
            {confirmed && <Chip tone="ok" icon="check">Uloženo</Chip>}
            {existing && !confirmed && <span className="t-meta">Dostupnost už jsi odeslal/a — můžeš ji upravit.</span>}
          </div>
        </>
      )}
    </Card>
  );

  // Samostatná stránka zaměstnance = plocha s widgety; v Mých směnách vedení jen sekce.
  if (headingLevel === 'h1') {
    return (
      <PlochaWidgetu
        stranka="zamestnanec.dostupnost"
        hlavicka={{ title: 'Dostupnost', subtitle: 'Dej vedení vědět, kdy můžeš pracovat — podle toho sestaví rozvrh.', hintId: 'availabilitysubmit' }}
        nastroj={nastroj}
      />
    );
  }
  return (
    // Bez max-w-3xl: sekce stojí v Mých směnách vedení pod plochou, která jde přes celou
    // šířku — užší sloupec by na desktopu nesedl na okraje karet nad ním.
    <section className="p-4 sm:p-6 space-y-6 w-full">
      <PageHeader as="h2" title="Dostupnost" subtitle="Kdy můžeš pracovat — podle toho se skládá rozvrh." />
      {nastroj}
    </section>
  );
}
