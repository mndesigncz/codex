'use client';

// Další nastavení razítkové kartičky (balík W1): kdy platí, limity, vyloučené
// položky, stav — a náhled karty očima hosta. Editor v LoyaltyTabs si bere jen
// pole z `razitkaZRadku` a vykreslí `<RazitkaDalsiNastaveni>` a `<RazitkaNahled>`.

import type { ReactNode } from 'react';
import { Chip, Field, Input, Segmented, Well } from '../../ui';
import { useMoney } from '../../CurrencyProvider';
import { czCount, type CzNoun } from '@/lib/czech';
import { dnyTextem, type Stav } from '@/lib/stampsPlan';

export interface DalsiPole {
  status: Stav;
  maxCompletions: number;
  dailyCap: number;
  daysOfWeek: number[];
  hourFrom: string;
  hourTill: string;
  excludedItems: { itemId: number; name: string }[];
}

export const RAZITKA_DEFAULTY: DalsiPole = {
  status: 'active', maxCompletions: 0, dailyCap: 0, daysOfWeek: [], hourFrom: '', hourTill: '', excludedItems: [],
};

/** Nová pole editoru z řádku kampaně (GET /api/client/admin/stamps). */
export function razitkaZRadku(c: any): DalsiPole {
  return {
    status: (['active', 'draft', 'paused', 'archived'].includes(c.status) ? c.status : (c.active === false ? 'paused' : 'active')) as Stav,
    maxCompletions: Number(c.max_completions) || 0,
    dailyCap: Number(c.daily_cap) || 0,
    daysOfWeek: Array.isArray(c.days_of_week) ? c.days_of_week.map(Number) : [],
    hourFrom: c.hour_from ?? '', hourTill: c.hour_till ?? '',
    excludedItems: c.excludedItems ?? [],
  };
}

export const STAV_NAZEV: Record<Stav, string> = { active: 'Běží', draft: 'Koncept', paused: 'Pozastavená', archived: 'Archiv' };
const STAV_OPTS: { id: Stav; label: string }[] = [
  { id: 'active', label: 'Běží' }, { id: 'draft', label: 'Koncept' }, { id: 'paused', label: 'Pozastavená' }, { id: 'archived', label: 'Archiv' },
];
const STAV_POPIS: Record<Stav, string> = {
  active: 'Hosté kartičku vidí a razítka se připisují.',
  draft: 'Rozpracovaná — hosté ji nevidí a razítka se nepřipisují. Spustíš ji, až bude hotová.',
  paused: 'Hosté ji nevidí a razítka se nepřipisují. Nasbíraná razítka zůstávají.',
  archived: 'Skrytá ze seznamu. Nasbíraná razítka a statistika zůstávají, kartičku můžeš kdykoli obnovit.',
};
const DNY = [{ d: 1, l: 'Po' }, { d: 2, l: 'Út' }, { d: 3, l: 'St' }, { d: 4, l: 'Čt' }, { d: 5, l: 'Pá' }, { d: 6, l: 'So' }, { d: 7, l: 'Ne' }];
const RAZITKO: CzNoun = { one: 'razítko', few: 'razítka', many: 'razítek' };
const KARTA: CzNoun = { one: 'karta', few: 'karty', many: 'karet' };

const cislo = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));

export function RazitkaDalsiNastaveni<F extends DalsiPole & { ruleType: string }>({ f, set, vylouceno }: {
  f: F; set: (patch: Partial<DalsiPole>) => void;
  /** Výběr vyloučených položek (ItemPicker z LoyaltyTabs) — jen u pravidla „za útratu". */
  vylouceno?: ReactNode;
}) {
  const prepniDen = (d: number) => set({ daysOfWeek: f.daysOfWeek.includes(d) ? f.daysOfWeek.filter(x => x !== d) : [...f.daysOfWeek, d].sort((a, b) => a - b) });
  const hodinyNeuplne = !!f.hourFrom !== !!f.hourTill;
  return (
    <div className="border-t border-black/[0.06] pt-4 space-y-5">
      <div>
        <p className="field-label">Kdy se razítko dává</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dny v týdnu">
          {DNY.map(x => (
            <button key={x.d} type="button" aria-pressed={f.daysOfWeek.includes(x.d)} onClick={() => prepniDen(x.d)}
              className={`filter-pill tap-target-sm ${f.daysOfWeek.includes(x.d) ? 'seg-on' : 'seg-off glass'}`}>{x.l}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 max-w-sm mt-3">
          <Field id="sc-hod-od" label="Od hodiny"><Input id="sc-hod-od" type="time" value={f.hourFrom} onChange={e => set({ hourFrom: e.target.value })} /></Field>
          <Field id="sc-hod-do" label="Do hodiny"><Input id="sc-hod-do" type="time" value={f.hourTill} onChange={e => set({ hourTill: e.target.value })} /></Field>
        </div>
        <p className={`t-meta mt-1.5 ${hodinyNeuplne ? '!text-bad-ink' : ''}`}>
          {hodinyNeuplne ? 'Vyplň obě hodiny, nebo žádnou.' : 'Nic nevybráno = razítko jde dát kdykoli. Hodiny přes půlnoc (22:00–02:00) fungují. Platí pražský čas.'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <Field id="sc-max" label="Nejvýš karet na hosta" hint="0 = bez limitu. Po limitu host další kartu nesbírá.">
          <Input id="sc-max" type="number" inputMode="numeric" min={0} max={1000} value={f.maxCompletions} onChange={e => set({ maxCompletions: cislo(e.target.value, 0, 1000) })} />
        </Field>
        <Field id="sc-cap" label="Razítek denně na hosta" hint="0 = bez limitu. Chrání před zneužitím.">
          <Input id="sc-cap" type="number" inputMode="numeric" min={0} max={50} value={f.dailyCap} onChange={e => set({ dailyCap: cislo(e.target.value, 0, 50) })} />
        </Field>
      </div>
      {f.ruleType === 'min_value' && vylouceno}
      <div>
        <p className="field-label">Stav kartičky</p>
        <Segmented options={STAV_OPTS} value={f.status} onChange={v => set({ status: v })} size="sm" ariaLabel="Stav kartičky" />
        <p className="t-meta mt-1.5">{STAV_POPIS[f.status]}</p>
      </div>
    </div>
  );
}

/** Náhled: jak kartičku uvidí host (a co se pod ní píše). Bez vymyšleného průběhu — jen prázdná políčka. */
export function RazitkaNahled({ f }: {
  f: DalsiPole & {
    name: string; description: string; requiredStamps: number; rewardTitle: string; ruleType: string;
    minValue: string; stampItems: { itemId: number; name: string }[]; daysToFinish: number; repeatMode: string;
    validSince: string; validTill: string;
  };
}) {
  const money = useMoney();
  const n = Math.max(1, Math.min(50, Number(f.requiredStamps) || 1));
  const kdy = [f.daysOfWeek.length ? dnyTextem(f.daysOfWeek) : '', f.hourFrom && f.hourTill ? `${f.hourFrom}–${f.hourTill}` : ''].filter(Boolean).join(', ');
  const limit = f.repeatMode === 'one_time' ? 1 : f.maxCompletions;
  const pravidlo = f.ruleType === 'visit' ? 'Razítko za každou návštěvu.'
    : f.ruleType === 'products' ? `Razítko za každý kus${f.stampItems.length ? `: ${f.stampItems.map(x => x.name).join(', ')}` : ''}.`
    : `Razítko za útratu od ${f.minValue ? money(Number(f.minValue)) : '…'}.`;
  const poznamky = [
    pravidlo,
    f.daysToFinish > 0 ? `Dosbírej do ${f.daysToFinish} dnů od prvního razítka.` : '',
    kdy ? `Razítko dostaneš jen ${kdy}.` : '',
    f.dailyCap > 0 ? `Nejvýš ${czCount(f.dailyCap, RAZITKO)} za den.` : '',
    limit > 0 ? (limit === 1 ? 'Tuhle kartu jde dokončit jen jednou.' : `Tuhle kartu jde dokončit nejvýš ${czCount(limit, KARTA)}.`) : '',
    f.validTill ? `Platí do ${f.validTill.split('-').reverse().join('. ')}.` : '',
  ].filter(Boolean);
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <p className="field-label !mb-0">Náhled pro hosta</p>
        {f.status !== 'active' && <Chip tone="wait" size="sm">{f.status === 'draft' ? 'Zatím neviditelná' : f.status === 'paused' ? 'Teď neviditelná' : 'V archivu'}</Chip>}
      </div>
      <Well className="space-y-2" aria-label="Náhled kartičky">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold min-w-0 truncate">{f.name || 'Název kartičky'}</p>
          <p className="text-sm font-semibold tabular-nums shrink-0">0 / {n}</p>
        </div>
        {f.description && <p className="text-xs text-black/55">{f.description}</p>}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(n, 10)}, minmax(0, 1fr))` }} aria-hidden>
          {Array.from({ length: Math.min(n, 20) }).map((_, i) => <span key={i} className="h-8 rounded-lg border bg-white/60 border-black/[0.08]" />)}
        </div>
        <p className="text-xs text-black/55">Za plnou kartu: <strong className="text-black/80">{f.rewardTitle || 'odměna'}</strong></p>
        <ul className="space-y-0.5">
          {poznamky.map((p, i) => <li key={i} className="text-xs text-black/55">{p}</li>)}
        </ul>
      </Well>
    </div>
  );
}
