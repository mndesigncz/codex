'use client';

import type { Koncept } from '@/lib/useDraft';
import { Icon } from '../Icons';

// „Tohle sis rozepsal minule." — obnovený koncept se musí přiznat.
//
// Formulář, který se sám předvyplní a mlčí, je vlastní malá lež: uživatel
// nepozná, jestli to napsal on, nebo se to vzalo odjinud, a při odeslání
// ho to překvapí. Proto jeden řádek nad formulářem a tlačítko, kterým se
// koncept zahodí.
export function DraftNote({ koncept, co = 'rozepsané' }: {
  koncept: Koncept;
  /** Čeho se koncept týká, v prvním pádě jednoslovně. */
  co?: string;
}) {
  if (!koncept.obnoveno) return null;
  return (
    <div className="note note-info flex flex-wrap items-center justify-between gap-2" role="status">
      <span className="inline-flex items-center gap-2 min-w-0">
        <Icon name="refresh" size={14} className="shrink-0" />
        Vrátili jsme ti {co} z minula.
      </span>
      <button type="button" onClick={koncept.zahodit}
        className="tap-target-sm shrink-0 font-semibold underline underline-offset-2">
        Zahodit a začít znovu
      </button>
    </div>
  );
}

export default DraftNote;
