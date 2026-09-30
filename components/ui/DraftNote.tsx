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
/** Věta „Vrátili jsme ti … z minula." Známé podoby mají vlastní překlad (pády a rody se v cizích jazycích liší). */
function vetaKonceptu(co: string, t: ReturnType<typeof useT>): string {
  switch (co) {
    case 'rozepsané': return t('Vrátili jsme ti rozepsané z minula.');
    case 'rozepsanou žádost': return t('Vrátili jsme ti rozepsanou žádost z minula.');
    case 'rozepsané oznámení': return t('Vrátili jsme ti rozepsané oznámení z minula.');
    case 'rozepsaný úkol': return t('Vrátili jsme ti rozepsaný úkol z minula.');
    case 'rozepsanou akci': return t('Vrátili jsme ti rozepsanou akci z minula.');
    case 'rozepsané rozeslání': return t('Vrátili jsme ti rozepsané rozeslání z minula.');
    default: return t('Vrátili jsme ti {co} z minula.', { co: t(co) });
  }
}

export function DraftNote({ koncept, co = 'rozepsané' }: {
  koncept: Koncept;
  /** Čeho se koncept týká, v prvním pádě jednoslovně. */
  co?: string;
}) {
  const t = useT('spolecne');
  if (!koncept.obnoveno) return null;
  return (
    <div className="note note-info flex flex-wrap items-center justify-between gap-2" role="status">
      <span className="inline-flex items-center gap-2 min-w-0">
        <Icon name="refresh" size={14} className="shrink-0" />
        {vetaKonceptu(co, t)}
      </span>
      <button type="button" onClick={koncept.zahodit}
        className="tap-target-sm shrink-0 font-semibold underline underline-offset-2">
        {t('Zahodit a začít znovu')}
      </button>
    </div>
  );
}

export default DraftNote;
