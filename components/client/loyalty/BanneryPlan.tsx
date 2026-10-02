'use client';

// Bannery: plán s dny a hodinami (opakování). Banner se hostům ukáže jen v zadané dny v týdnu a hodiny,
// v rámci „Platí od / do“: třeba „po–pá 8:00–11:00“ pro snídaňové menu, nebo „pá, so 16:00–02:00“ pro večerní akci.
// Prázdné dny = každý den, prázdné hodiny = celý den. Hodiny přes půlnoc jsou v pořádku. Čas je pražský.
// Pravidla hlídá lib/banneryPlan.ts na serveru i tady. Komponenta správy: texty česky natvrdo.

import { Field, Input } from '../../ui';
import { popisPlanu, validujPlan } from '@/lib/banneryPlan';

const DNY = [{ d: 1, l: 'Po' }, { d: 2, l: 'Út' }, { d: 3, l: 'St' }, { d: 4, l: 'Čt' }, { d: 5, l: 'Pá' }, { d: 6, l: 'So' }, { d: 7, l: 'Ne' }];

export interface PlanDraft { days_of_week: number[]; hour_from: string; hour_till: string }

export default function BanneryPlan({ value, onChange }: { value: PlanDraft; onChange: (v: PlanDraft) => void }) {
  const prepni = (d: number) => onChange({ ...value, days_of_week: value.days_of_week.includes(d) ? value.days_of_week.filter(x => x !== d) : [...value.days_of_week, d].sort((a, b) => a - b) });
  const v = validujPlan({ days_of_week: value.days_of_week, hour_from: value.hour_from, hour_till: value.hour_till });
  const veta = v.ok ? popisPlanu(v.plan) : '';
  return (
    <fieldset className="space-y-3 border-0 p-0 m-0 min-w-0">
      <legend className="field-label">Kdy se ukazuje (nepovinné)</legend>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dny v týdnu">
        {DNY.map(x => (
          <button key={x.d} type="button" aria-pressed={value.days_of_week.includes(x.d)} onClick={() => prepni(x.d)}
            className={`filter-pill tap-target-sm ${value.days_of_week.includes(x.d) ? 'seg-on' : 'seg-off glass'}`}>{x.l}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <Field id="bn-hod-od" label="Od hodiny"><Input id="bn-hod-od" type="time" value={value.hour_from} onChange={e => onChange({ ...value, hour_from: e.target.value })} /></Field>
        <Field id="bn-hod-do" label="Do hodiny"><Input id="bn-hod-do" type="time" value={value.hour_till} onChange={e => onChange({ ...value, hour_till: e.target.value })} /></Field>
      </div>
      <p className="t-meta" role={v.ok ? undefined : 'alert'}>
        {!v.ok ? v.chyba
          : veta ? `Banner se ukáže: ${veta}, v pražském čase.`
          : 'Bez omezení: banner se ukazuje každý den celý den (v rámci data „Platí od / do“).'}
        {v.ok && veta && value.hour_from > value.hour_till ? ' Hodiny přes půlnoc patří ke dni, ve kterém začaly.' : ''}
      </p>
    </fieldset>
  );
}
