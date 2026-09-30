'use client';

import { Chip, Well } from '@/components/ui';
import { Icon } from '@/components/Icons';
import { TRIAL_DAYS } from '@/lib/plan';
import { CILE_PODLE_TYPU } from '@/lib/pruvodce/predvolby';
import { CILE, type Cil } from '@/lib/pruvodce/typy';
import type { KrokProps } from './spolecne';

// Cíle: vícenásobná volba toho, co chce mít člověk pod kontrolou. Podle ní
// se poskládá Přehled. Zaostření (najetí, klepnutí, klávesnice) mění
// ukázku vedle karty: na počítači živou aplikaci, na telefonu fotku. Pod
// dlaždicemi stojí jedna věta o tom, co vybraná věc umí — text z prodejní
// stránky, ne nový marketing.
//
// Vybrané jsou inkoustové (aria-pressed), žádná limetka. Štítek tarifu říká
// pravdu o ceně a nic nenutí: „Vyzkoušíš zdarma 30 dní".

export function vybraneCile(odp: KrokProps['odp']): Cil[] {
  return odp.cile ?? CILE_PODLE_TYPU[odp.typ ?? 'jine'];
}

export default function Cile({ odp, zmen, fokus, naFokus }: KrokProps & { fokus: Cil | null; naFokus: (c: Cil | null) => void }) {
  const vybrane = vybraneCile(odp);
  const prepni = (c: Cil) => {
    naFokus(c);
    zmen({ cile: vybrane.includes(c) ? vybrane.filter(x => x !== c) : [...vybrane, c] });
  };
  const ukazany = CILE.find(c => c.id === fokus) ?? CILE.find(c => vybrane.includes(c.id)) ?? CILE[0];

  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Co chceš mít pod kontrolou">
        {CILE.map(c => {
          const on = vybrane.includes(c.id);
          return (
            <li key={c.id} className="min-w-0">
              <button type="button" aria-pressed={on} data-cil={c.id}
                onClick={() => prepni(c.id)} onFocus={() => naFokus(c.id)} onMouseEnter={() => naFokus(c.id)}
                className="pv-dlazdice tap-target flex h-full items-start gap-3 p-3.5">
                <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${on ? 'bg-[var(--pv-ink)] text-[var(--surface)]' : 'bg-black/[0.05] text-[#16181A]'}`}>
                  <Icon name={on ? 'check' : c.ikona} size={18} strokeWidth={on ? 2.4 : 1.7} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-card block">{c.nazev}</span>
                  <span className="t-meta mt-0.5 block text-pretty">{c.veta}</span>
                  {c.tarif !== 'zdarma' && (
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Chip tone="muted" size="sm">{c.tarif === 'max' ? 'Max' : 'Pro'}</Chip>
                      <span className="text-[11px] text-black/50">Vyzkoušíš zdarma {TRIAL_DAYS} dní</span>
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Well className="mt-4" aria-live="polite" data-ukazka-cile={ukazany.id}>
        <p className="t-label">Ukázka · {ukazany.nazev}</p>
        <p className="mt-1.5 text-[14px] leading-snug text-[#16181A] text-pretty">{ukazany.ukazka}</p>
      </Well>
    </div>
  );
}
