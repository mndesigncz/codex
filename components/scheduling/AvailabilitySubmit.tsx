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
//
// Audit kola 6 (Z7): „Nemůžu" stálo tři klepnutí na den (cyklus Dostupný →
// Jen ranní → Jen odpolední → Nemůžu; týden dovolené = 21 klepnutí) a odeslání
// leželo 1,5 obrazovky pod ohybem. Teď je „Nemůžu" v cyklu hned druhé
// (jedno klepnutí), legenda je zároveň „štětec" — vybraný stav nastaví každý
// klepnutý den jedním klepnutím (druhé ho vrátí na Dostupný) — a s rozepsanou
// změnou je odeslání v plovoucí liště nad dokem (jen samostatná stránka;
// v Mých směnách vedení má limetku „Hotovo" úprav).

import { useState, useEffect, useMemo, useRef } from 'react';
import { odsazeniMesice, zacatekTydne } from '@/lib/week';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDenVTydnu } from '@/lib/i18n/format';
import { useCurrency } from '@/components/CurrencyProvider';

import { Button, Card, Chip, ErrorState, Field, Input, MonthNav, PageHeader, PlovouciLista, Segmented, Skeleton, Textarea } from '../ui';
import { useSkrytyNastroj } from '@/lib/useSkrytyNastroj';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu } from '../widgety/useDataWidgetu';
import { okJson } from '@/lib/api';
import { Icon } from '../Icons';
import { pragueToday } from '@/lib/pragueTime';
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

const SHIFTS = [{ id: 'morning' }, { id: 'afternoon' }, { id: 'flexible' }];

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
  cls: 'bg-black/[0.03] border-black/10 text-[#16181A] hover:bg-black/[0.06]',
  dot: 'bg-black/15 ring-1 ring-black/20 dark:ring-white/25',
};
const OFF_META = {
  cls: 'bg-bad/20 border-bad/40 text-bad-ink line-through hover:bg-bad/30',
  dot: 'bg-bad ring-1 ring-bad/50',
};

/** Následující měsíc k `RRRR-MM` (bez času zařízení, ať přechod roku nedělá potíže). */
function dalsiMesic(month: string) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
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
  const t = useT('zamestnanec');
  const { jazyk } = useJazyk();
  // „Dnes“ a „tento měsíc“ podle Prahy, ne podle hodin zařízení: tablet v UTC
  // nebo telefon na cestách by po pražské půlnoci nabízel jiný měsíc než
  // Rozvrh a Moje směny (ty jedou přes pragueToday).
  const dnes = pragueToday();
  const currentMonth = dnes.slice(0, 7);
  const nextMonth = dalsiMesic(currentMonth);

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
  // Něco se od načtení (nebo odeslání) změnilo — pak je odeslání v plovoucí liště.
  const [zmeneno, setZmeneno] = useState(false);
  const zmena = () => { setConfirmed(false); setZmeneno(true); };
  // „Štětec": null = klepnutí cyklí stavy, jinak nastaví tenhle stav.
  const [stetec, setStetec] = useState<DayState | null>(null);
  const korenRef = useRef<HTMLSpanElement>(null);
  const schovany = useSkrytyNastroj(korenRef);

  const [types, setTypes] = useState<{ id: number; name: string }[]>([]);
  const [typesErr, setTypesErr] = useState(false);
  useEffect(() => {
    fetch('/api/shift-types').then(okJson)
      .then((d) => { setTypes((d.shiftTypes ?? []).map((ty: any) => ({ id: ty.id, name: ty.name }))); setTypesErr(false); })
      // Bez typů směn se klepání přepne na starý „ráno / odpoledne" — což je
      // správný stav jen když je tým opravdu nemá, ne když vypadla síť.
      .catch(() => setTypesErr(true));
  }, []);
  // The tap cycle follows the team's shift types; legacy binary only when none exist.
  // „Nemůžu" hned za „Dostupný": nejčastější volba je jedno klepnutí, ne poslední v cyklu.
  const stateList: DayState[] = useMemo(
    () => (types.length
      ? ['available', 'off', ...types.map((ty) => `type:${ty.id}`)]
      : ['available', 'off', 'morning', 'afternoon']),
    [types],
  );
  // Štětec z jiného seznamu typů (po načtení) by nastavoval stav, který už neexistuje.
  useEffect(() => { if (stetec && !stateList.includes(stetec)) setStetec(null); }, [stateList, stetec]);
  const metaOf = (st: DayState) => {
    if (st === 'available') return { ...AVAILABLE_META, label: t('Dostupný') };
    if (st === 'off') return { ...OFF_META, label: t('Nemůžu') };
    if (st === 'morning') return { ...TYPE_TONES[0], label: t('Jen ranní') };
    if (st === 'afternoon') return { ...TYPE_TONES[1], label: t('Jen odpolední') };
    const id = parseInt(st.slice(5));
    const idx = types.findIndex((ty) => ty.id === id);
    return {
      ...TYPE_TONES[(idx < 0 ? 0 : idx) % TYPE_TONES.length],
      label: t('Jen {nazev}', { nazev: types.find((ty) => ty.id === id)?.name ?? t('směna') }),
    };
  };

  // Začátek týdne si volí podnik; dřív tu bylo pondělí natvrdo.
  const zacatek = zacatekTydne(useCurrency().weekStart);
  const grid = useMemo(() => buildGrid(month, zacatek), [month, zacatek]);
  const todayStr = currentMonth === month ? dnes : null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setConfirmed(false);
    setZmeneno(false);
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
    zmena();
    setDayStates((prev) => {
      const cur = prev[date] ?? 'available';
      const i = stateList.indexOf(cur);
      // Se štětcem: nastavit vybraný stav, a když už ho den má, vrátit na Dostupný.
      const next = stetec ? (cur === stetec ? 'available' : stetec) : stateList[(i < 0 ? 0 : i + 1) % stateList.length];
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
          // 0 by generátor četl jako „žádná směna“, přehled jako „bez limitu“ — prázdné = bez limitu.
          maxShifts: maxShifts === '' || !(parseInt(maxShifts) > 0) ? null : parseInt(maxShifts),
          note: note.trim() || null,
        }),
      });
      if (res.ok) {
        setExisting(true);
        setConfirmed(true);
        setZmeneno(false);
        // Připomínka „Zadej dostupnost" (Domů, Moje směny) čte tutéž URL.
        obnovDataWidgetu(`/api/availability?month=${month}&mine=1`);
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || t('Dostupnost se nepodařilo odeslat.'));
      }
    } catch {
      setErr(t('Nepodařilo se spojit se serverem.'));
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
  // Odeslání nad dokem: jen samostatná stránka, s rozepsanou změnou a když je co odeslat.
  const listaOdeslani = headingLevel === 'h1' && zmeneno && !loading && !loadFailed && !schovany;
  const nastroj = (
    <Card as="section" aria-labelledby="dostupnost-kalendar" className="space-y-5">
      <span ref={korenRef} aria-hidden className="hidden" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="dostupnost-kalendar" className="t-card">{t('Kalendář dostupnosti')}</h2>
        {/* Do minulosti nejde — dostupnost na uplynulý měsíc nemá smysl. */}
        <MonthNav value={month} onChange={setMonth} min={currentMonth} />
      </div>

      {typesErr && (
        <p className="note note-wait cz-sentence">
          {t('Typy směn se nenačetly, takže klepání zatím nabízí jen ráno a odpoledne. Jestli si tým vede vlastní typy, načti stránku znovu — ať vybíráš z těch svých.')}
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
          title={t('Dostupnost se nenačetla')}
          hint={t('Dokud nevíme, co jsi poslal/a dřív, nejde to odeslat znovu — přepsalo by to původní dostupnost prázdnou.')}
          onRetry={() => setReloadKey(k => k + 1)}
        />
      ) : (
        <>
          <div>
            {/* Legenda je zároveň štětec: vybraný stav nastaví klepnutý den, „Přepínat" cyklí. */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2" role="radiogroup" aria-label={t('Co nastaví klepnutí na den')}>
              <button type="button" role="radio" aria-checked={stetec === null} onClick={() => setStetec(null)}
                className={`filter-pill tap-target-sm ${stetec === null ? 'seg-on' : 'seg-off glass'}`}>
                {t('Přepínat')}
              </button>
              {stateList.map((st) => (
                <button key={st} type="button" role="radio" aria-checked={stetec === st} onClick={() => setStetec(st)}
                  className={`filter-pill tap-target-sm inline-flex items-center gap-1.5 ${stetec === st ? 'seg-on' : 'seg-off glass'}`}>
                  <span aria-hidden className={`h-2.5 w-2.5 rounded-full shrink-0 ${metaOf(st).dot}`} /> {metaOf(st).label}
                </button>
              ))}
            </div>
            <p className="t-meta mb-3 text-pretty">
              {stetec === null
                ? t('Klepnutím na den přepínáš: {popis}. Denní volby jsou závazné — „Jen …" a „Nemůžu" generátor vždy dodrží.', { popis: popisCyklu })
                : t('Klepnutím na den nastavíš „{stav}", druhým klepnutím ho vrátíš na Dostupný. Denní volby jsou závazné — „Jen …" a „Nemůžu" generátor vždy dodrží.', { stav: metaOf(stetec).label })}
            </p>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
              {(zacatek === 0 ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]).map((i) => { const z = fmtDenVTydnu(i, { jazyk }); return z.charAt(0).toLocaleUpperCase() + z.slice(1); }).map((d) => (
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
                    aria-label={t('{den}. — {stav}', { den: day, stav: meta.label })}
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
              <p className="text-[13px] font-medium text-black/70" aria-hidden>{t('Preferovaná směna')}</p>
              <Segmented ariaLabel={t('Preferovaná směna')} value={preferredShift} onChange={(v) => { setPreferredShift(v); zmena(); }}
                options={SHIFTS.map(s => ({ id: s.id, label: s.id === 'morning' ? t('Ranní') : s.id === 'afternoon' ? t('Odpolední') : t('Flexibilní') }))} />
              <p className="text-xs text-black/50">{t('Obecně a nezávazně — denní volby v kalendáři mají přednost.')}</p>
            </div>

            <Field id="dostupnost-max-smen" label={t('Maximální počet směn')} hint={t('Nepovinné — prázdné pole znamená bez limitu.')}>
              <Input
                id="dostupnost-max-smen"
                type="number" inputMode="numeric"
                min={1}
                value={maxShifts}
                onChange={(e) => { setMaxShifts(e.target.value); zmena(); }}
                className="!w-full sm:!w-40"
              />
            </Field>

            <Field id="dostupnost-poznamka" label={t('Poznámka pro vedení')} hint={t('Nepovinné — třeba víkendy ano, ve středu škola.')}>
              <Textarea
                id="dostupnost-poznamka"
                value={note}
                onChange={(e) => { setNote(e.target.value); zmena(); }}
                rows={3}
                className="resize-none"
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-black/[0.06]">
            {err && <p className="w-full note note-danger text-sm" role="alert">{err}</p>}
            {/* Jako sekce pod plochou Mých směn vedení (h2) není hlavní akcí
                obrazovky — limetku tam má „Hotovo“ v úpravách. Tmavá. Tmavá
                je i tehdy, když limetku nese plovoucí lišta s rozepsanou změnou. */}
            <Button variant={headingLevel === 'h2' || listaOdeslani ? 'primary' : 'accent'} icon="send" block loading={saving} disabled={loadFailed} onClick={submit}
              title={loadFailed ? t('Nejdřív je potřeba načíst, co jsi poslal/a dřív.') : undefined}>
              {existing ? t('Aktualizovat dostupnost') : t('Odeslat dostupnost')}
            </Button>
            {confirmed && <Chip tone="ok" icon="check">{t('Uloženo')}</Chip>}
            {existing && !confirmed && <span className="t-meta">{t('Dostupnost už jsi odeslal/a — můžeš ji upravit.')}</span>}
          </div>
          {/* Místo pod lištou, ať nezakryje konec karty. */}
          {listaOdeslani && <div aria-hidden className="h-12" />}
        </>
      )}
      {listaOdeslani && (
        <PlovouciLista label={t('Neodeslaná dostupnost')}>
          <span className="text-sm font-semibold whitespace-nowrap px-1">{t('Neodesláno')}</span>
          <button type="button" onClick={() => { void submit(); }} disabled={saving} aria-busy={saving || undefined}
            className="btn btn-accent btn-sm tap-target whitespace-nowrap disabled:opacity-60">
            <Icon name="send" size={14} className="inline -mt-0.5 mr-1" />{existing ? t('Aktualizovat dostupnost') : t('Odeslat dostupnost')}
          </button>
        </PlovouciLista>
      )}
    </Card>
  );

  // Samostatná stránka zaměstnance = plocha s widgety; v Mých směnách vedení jen sekce.
  if (headingLevel === 'h1') {
    return (
      <PlochaWidgetu
        stranka="zamestnanec.dostupnost"
        hlavicka={{ title: t('Dostupnost'), subtitle: t('Dej vedení vědět, kdy můžeš pracovat — podle toho sestaví rozvrh.'), hintId: 'availabilitysubmit' }}
        nastroj={nastroj}
      />
    );
  }
  return (
    // Bez max-w-3xl: sekce stojí v Mých směnách vedení pod plochou, která jde přes celou
    // šířku — užší sloupec by na desktopu nesedl na okraje karet nad ním.
    <section className="p-4 sm:p-6 space-y-6 w-full">
      <PageHeader as="h2" title={t('Dostupnost')} subtitle={t('Kdy můžeš pracovat — podle toho se skládá rozvrh.')} />
      {nastroj}
    </section>
  );
}
