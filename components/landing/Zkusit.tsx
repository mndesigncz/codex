import Link from 'next/link';
import { Icon } from '@/components/Icons';
import { ZKUSIT_ZDARMA } from './obsah';

// Jediná plná limetka na stránce patří téhle akci. V jednom výřezu je nejvýš
// jedna: hlavní tlačítko v hero, karta Pro v ceníku a závěrečná výzva jsou od
// sebe dost daleko; patička proto dostává inkoustové tlačítko (`tichy`), ať
// u závěrečné výzvy nesvítí dvě limetky nad sebou.
// Na telefonu přes celou šířku (DESIGN.md: pilulka v 79 % šířky zanechá prázdný pruh).
export default function Zkusit({ className = '', tichy = false }: { className?: string; tichy?: boolean }) {
  return (
    <Link href="/register"
      className={`pressable w-full sm:w-auto btn ${tichy ? 'btn-primary' : 'btn-accent'} btn-lg active:scale-[0.97] inline-flex items-center justify-center gap-2 ${className}`}>
      {ZKUSIT_ZDARMA} <Icon name="chevron" size={15} className="ld-sipka -rotate-90" />
    </Link>
  );
}
