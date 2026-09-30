'use client';

import { EmptyState, Button } from '../ui';
import { useT } from '@/lib/i18n/client';

// Obrazovka, na kterou člověk v tomhle podniku nemá oprávnění (kolo 67).
//
// Dostane se na ni odkazem z oznámení, starou záložkou nebo dlaždicí
// přehledu, která vede jinam, než smí. Bílá plocha nebo věčné načítání
// by vypadaly jako chyba aplikace; tohle říká pravdu a co s tím.
export default function BezOpravneni({ onZpet, co }: { onZpet?: () => void; co?: string }) {
  const t = useT('sprava');
  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto w-full">
      <div className="glass-card">
        <EmptyState icon="lock"
          title={t('Na tohle nemáš v tomto podniku oprávnění')}
          hint={co ? t('{co} tvoje role nezahrnuje. Když to k práci potřebuješ, požádej vedení podniku, ať ti oprávnění přidá do role.', { co }) : t('Když to k práci potřebuješ, požádej vedení podniku, ať ti oprávnění přidá do role.')}
          action={onZpet ? <Button variant="secondary" icon="overview" onClick={onZpet}>{t('Zpět na přehled')}</Button> : undefined} />
      </div>
    </div>
  );
}
