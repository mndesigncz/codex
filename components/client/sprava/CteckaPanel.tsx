'use client';

// Provoz → Čtečka u kasy (kolo 92): čtečka je konečně v navigaci správy (dřív jen „Režim čtečky"
// uvnitř Věrnosti a zvláštní trasa /employer/ctecka). Stejná CteckaKasa jako na celé obrazovce;
// celoobrazovkový režim pro terminál u kasy zůstává jako vedlejší akce.

import { Button, PageHeader } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { otevriVeSystemu } from '@/lib/stahni';
import CteckaKasa from '../CteckaKasa';

export default function CteckaPanel() {
  const { role } = useOpravneni();
  const trasa = role?.typ === 'zamestnanec' || role?.typ === 'kiosk' ? '/employee/ctecka' : '/employer/ctecka';
  return (
    <div className="px-4 min-[360px]:px-5 pt-3 pb-4 sm:p-6 space-y-5 max-w-2xl">
      <PageHeader hintId="clientadmin-ctecka" title="Čtečka u kasy" subtitle="Načti kartu hosta, kupon nebo poukaz. Kdo to je, co má a co si vybral."
        secondary={<Button variant="secondary" icon="expand" onClick={() => otevriVeSystemu(trasa)}>Celá obrazovka</Button>}
        menuMobile={[{ label: 'Celá obrazovka', icon: 'expand', onClick: () => otevriVeSystemu(trasa) }]} />
      <CteckaKasa />
    </div>
  );
}
