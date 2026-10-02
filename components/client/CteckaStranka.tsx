'use client';

// Samostatná stránka „Čtečka" (/employer/ctecka, /employee/ctecka): celá obrazovka
// pro terminál u kasy, kde čtečka kódů píše jako klávesnice. Bez postranního panelu,
// jen hlavička se zpětným odkazem a CteckaKasa.

import Link from 'next/link';
import { Icon } from '../Icons';
import { CurrencyProvider } from '../CurrencyProvider';
import { useOpravneni } from '../role/useOpravneni';
import CteckaKasa from './CteckaKasa';

export default function CteckaStranka() {
  const { role } = useOpravneni();
  const zpet = role?.typ === 'zamestnanec' || role?.typ === 'kiosk' ? '/employee/shifts' : '/employer/overview';
  return (
    <CurrencyProvider>
      <main className="mx-auto w-full max-w-2xl px-4 py-4 sm:py-6 space-y-3 min-w-0">
        <div className="flex items-center gap-2">
          <Link href={zpet} className="tap-target-sm inline-flex items-center gap-1 text-sm font-semibold text-black/60 hover:text-black">
            <Icon name="chevron" size={14} className="rotate-90" />Zpět do aplikace
          </Link>
        </div>
        <h1 className="t-page">Čtečka u kasy</h1>
        <CteckaKasa />
      </main>
    </CurrencyProvider>
  );
}
