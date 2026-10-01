'use client';

import Link from 'next/link';
import { LogoMark } from '@/components/Icons';
import Zkusit from '../Zkusit';
import PravniOdkazy from '@/components/pravni/PravniOdkazy';
import JazykMenu from '@/components/ui/JazykMenu';
import { useT } from '@/lib/i18n/client';
import { NAVIGACE, PATICKA } from '../obsah';


// Patička. Kdo dojel až sem a nekoupil, hledá buď funkci, kterou přehlédl, nebo
// cestu dovnitř. Tlačítko je tu světlé: nad patičkou je závěrečná výzva
// a dvě limetky nad sebou by si konkurovaly.
export default function Paticka() {
  const t = useT('landing');
  return (
    <footer className="border-t border-[color:var(--ld-linka)]">
      <div className="ld-obsah py-16">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-16 gap-y-10">
          <div>
            <div className="flex items-center gap-2.5">
              <LogoMark size={28} />
              <span className="text-base font-bold tracking-tight">Managero</span>
            </div>
            <p className="ld-meta mt-4 max-w-[36ch]">{t(PATICKA.popis)}</p>
            <div className="mt-6">
              <Zkusit tichy />
            </div>
          </div>
          <nav aria-label={t('Patička')}>
            <h2 className="text-sm font-semibold text-[color:var(--ld-text-3)]">{t(PATICKA.naStrance)}</h2>
            <ul className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-[0.9375rem] list-none">
              {NAVIGACE.map(o => (
                <li key={o.id}><a href={`#${o.id}`} className="tap-target-sm inline-flex items-center text-[color:var(--ld-text-2)] hover:text-[color:var(--ld-papir)] transition-colors">{t(o.dlouze ?? o.label)}</a></li>
              ))}
              <li><Link href="/login" className="tap-target-sm inline-flex items-center text-[color:var(--ld-text-2)] hover:text-[color:var(--ld-papir)] transition-colors">{t('Přihlášení')}</Link></li>
            </ul>
          </nav>
        </div>
        {/* Jazyk je dole, ne v liště: lišta nese jen sekce a dvě akce. Volba platí
            pro celou aplikaci (cookie), stejně se nabízí na přihlášení a registraci. */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <PravniOdkazy className="text-sm text-[color:var(--ld-text-3)]" />
          <span className="ld-jazyk"><JazykMenu align="right" /></span>
        </div>
        <p className="mt-6 pt-6 border-t border-[color:var(--ld-linka)] text-xs text-[color:var(--ld-text-3)] max-w-2xl text-pretty">{t(PATICKA.poctivost)}</p>
      </div>
    </footer>
  );
}
