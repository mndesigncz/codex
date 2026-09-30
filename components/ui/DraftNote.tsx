'use client';

import type { Koncept } from '@/lib/useDraft';
import { Icon } from '../Icons';
import { useT } from '@/lib/i18n/client';

// „Tohle sis rozepsal minule." — obnovený koncept se musí přiznat.
//
// Formulář, který se sám předvyplní a mlčí, je vlastní malá lež: uživatel
// nepozná, jestli to napsal on, nebo se to vzalo odjinud, a při odeslání
// ho to překvapí. Proto jeden řádek nad formulářem a tlačítko, kterým se
// koncept zahodí.
// Celé věty, ne skládání z fragmentů: skloňování a slovosled cizích jazyků
// nejde složit z českého 4. pádu. Neznámý druh spadne na původní českou větu.
function veta(t: (k: string) => string, co: string): string {
  switch (co) {
    case 'rozepsané': return t('Vrátili jsme ti rozepsané z minula.');
    case 'rozepsanou žádost': return t('Vrátili jsme ti rozepsanou žádost z minula.');
    case 'rozepsané oznámení': return t('Vrátili jsme ti rozepsané oznámení z minula.');
    case 'rozepsaný úkol': return t('Vrátili jsme ti rozepsaný úkol z minula.');
    case 'rozepsanou akci': return t('Vrátili jsme ti rozepsanou akci z minula.');
    case 'rozepsané rozeslání': return t('Vrátili jsme ti rozepsané rozeslání z minula.');
    default: return `Vrátili jsme ti ${co} z minula.`;
  }
}

export function DraftNote({ koncept, co = 'rozepsané', druh }: {
  koncept: Koncept;
  /** Druh konceptu bez českého textu (zatím jen 'zadost'); má přednost před `co`. */
  druh?: 'zadost';
  /** Čeho se koncept týká (česky, ve 4. pádu); pro překlad se mapuje na celou větu. */
  co?: string;
}) {
  const t = useT();
  if (!koncept.obnoveno) return null;
  return (
    <div className="note note-info flex flex-wrap items-center justify-between gap-2" role="status">
      <span className="inline-flex items-center gap-2 min-w-0">
        <Icon name="refresh" size={14} className="shrink-0" />
        {veta(t, druh === 'zadost' ? 'rozepsanou žádost' : co)}
      </span>
      <button type="button" onClick={koncept.zahodit}
        className="tap-target-sm shrink-0 font-semibold underline underline-offset-2">
        {t('Zahodit a začít znovu')}
      </button>
    </div>
  );
}

export default DraftNote;
