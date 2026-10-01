'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icons';
import { useT } from '@/lib/i18n/client';
import { TRIAL_DAYS } from '@/lib/plan';
import { ZKUSIT_ZDARMA } from './obsah';

// Hlavní akce stránky. Plná limetka patří jen jí a v jednom výřezu je nejvýš
// jedna (hlídá sonda k75): v liště, v kartě Pro a v závěru, které jsou od sebe
// daleko. Kde by se dvě potkaly, dostane tlačítko světlou podobu (`tichy`).
// Na telefonu přes celou šířku (DESIGN.md: pilulka v 79 % šířky zanechá prázdný pruh).
export default function Zkusit({ className = '', tichy = false }: { className?: string; tichy?: boolean }) {
  const t = useT('landing');
  return (
    <Link href="/register"
      className={tichy
        ? `ld-btn ld-btn-svetle w-full sm:w-auto ${className}`
        : `pressable btn btn-accent btn-lg w-full sm:w-auto inline-flex items-center justify-center gap-2 active:scale-[0.97] ${className}`}>
      {t(ZKUSIT_ZDARMA, { n: TRIAL_DAYS })} <Icon name="chevron" size={15} className="ld-sipka -rotate-90" aria-hidden />
    </Link>
  );
}
