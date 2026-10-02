'use client';

// Výběr šablony vzhledu dárkového poukazu s náhledem: nadpis, barvy a pruh. Šablona se použije při tisku
// a v e-mailu obdarovanému; hodnota, kód a QR jsou v každé stejné. Komponenta správy: texty česky natvrdo.

import { Field, Select } from '../../ui';
import { SABLONY_SEZNAM, sablona } from '@/lib/poukazySablony';

/** Zmenšená karta: nadpis a pruh v barvách šablony, ukázková hodnota. */
export function MiniKarta({ design, hodnota }: { design: string | null | undefined; hodnota: string }) {
  const v = sablona(design);
  return (
    <div className="rounded-2xl border-2 px-4 py-3 text-center max-w-xs" style={{ borderColor: v.barva, background: v.podklad, color: v.barva }} aria-hidden>
      <div className="mx-auto h-1.5 w-20 rounded-full mb-2" style={{ background: v.akcent }} />
      <p className="text-sm font-extrabold leading-tight">{v.nadpis}</p>
      <p className="text-xl font-extrabold tabular-nums leading-tight mt-0.5">{hodnota}</p>
      <p className="font-mono text-xs tracking-[0.18em] mt-1 opacity-80">DP-ABCD-2345</p>
    </div>
  );
}

export default function VyberVzhledu({ id, value, onChange, hodnota, disabled }: {
  id: string; value: string; onChange: (v: string) => void; hodnota: string; disabled?: boolean;
}) {
  const v = sablona(value);
  return (
    <div className="space-y-2">
      <Field id={id} label="Vzhled poukazu" hint={v.popis}>
        <Select id={id} value={v.id} disabled={disabled} onChange={e => onChange(e.target.value)}>
          {SABLONY_SEZNAM.map(s => <option key={s.id} value={s.id}>{s.nazev}</option>)}
        </Select>
      </Field>
      <MiniKarta design={value} hodnota={hodnota} />
    </div>
  );
}
