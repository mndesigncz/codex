import Link from 'next/link';
import { LogoMark } from '@/components/Icons';
import Zkusit from '../Zkusit';
import { PATICKA_POCTIVOST } from '../obsah';

const ODKAZY: { href: string; label: string }[] = [
  { href: '#ukazka-okno', label: 'Ukázka' },
  { href: '#funkce', label: 'Funkce' },
  { href: '#den', label: 'Jeden den s Managerem' },
  { href: '#zacatek', label: 'Jak začít' },
  { href: '#cenik', label: 'Ceník' },
  { href: '#otazky', label: 'Časté otázky' },
];

// Patička. Kdo dojel až sem a nekoupil, hledá buď funkci, kterou přehlédl, nebo
// cestu dovnitř. Tlačítko je tu inkoustové: nad patičkou je závěrečná výzva
// a dvě limetky nad sebou by si konkurovaly.
export default function Paticka() {
  return (
    <footer className="border-t border-black/[0.06] relative">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8">
          <div>
            <div className="flex items-center gap-2.5">
              <LogoMark size={26} />
              <span className="text-base font-bold tracking-tight text-[#16181A]">Managero</span>
            </div>
            <p className="mt-3 text-sm text-black/55 max-w-sm text-pretty">Provoz podniku na jednom místě: směny, docházka, uzávěrky, sklad, receptury, úkoly, chat a stránka pro hosty.</p>
            <div className="mt-5">
              <Zkusit tichy />
            </div>
          </div>
          <nav aria-label="Patička">
            <p className="t-label text-black/50">Na stránce</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {ODKAZY.map(o => (
                <li key={o.href}><a href={o.href} className="tap-target-sm inline-flex items-center text-black/65 hover:text-[#16181A] transition-colors">{o.label}</a></li>
              ))}
              <li><Link href="/login" className="tap-target-sm inline-flex items-center text-black/65 hover:text-[#16181A] transition-colors">Přihlášení</Link></li>
            </ul>
          </nav>
        </div>
        <p className="mt-10 pt-6 border-t border-black/[0.06] text-xs text-black/55 max-w-2xl text-pretty">{PATICKA_POCTIVOST}</p>
      </div>
    </footer>
  );
}
