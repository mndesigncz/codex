import Link from 'next/link';
import { LogoMark } from '@/components/Icons';
import Zkusit from '../Zkusit';
import PravniOdkazy from '@/components/pravni/PravniOdkazy';
import JazykMenu from '@/components/ui/JazykMenu';
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
// cestu dovnitř. Tlačítko je tu světlé: nad patičkou je závěrečná výzva
// a dvě limetky nad sebou by si konkurovaly.
export default function Paticka() {
  return (
    <footer className="border-t border-[color:var(--ld-linka)]">
      <div className="ld-obsah py-16">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-16 gap-y-10">
          <div>
            <div className="flex items-center gap-2.5">
              <LogoMark size={28} />
              <span className="text-base font-bold tracking-tight">Managero</span>
            </div>
            <p className="ld-meta mt-4 max-w-[36ch]">Provoz podniku na jednom místě: směny, docházka, uzávěrky, sklad, receptury, úkoly, chat a stránka pro hosty.</p>
            <div className="mt-6">
              <Zkusit tichy />
            </div>
          </div>
          <nav aria-label="Patička">
            <h2 className="text-sm font-semibold text-[color:var(--ld-text-3)]">Na stránce</h2>
            <ul className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-[0.9375rem] list-none">
              {ODKAZY.map(o => (
                <li key={o.href}><a href={o.href} className="tap-target-sm inline-flex items-center text-[color:var(--ld-text-2)] hover:text-[color:var(--ld-papir)] transition-colors">{o.label}</a></li>
              ))}
              <li><Link href="/login" className="tap-target-sm inline-flex items-center text-[color:var(--ld-text-2)] hover:text-[color:var(--ld-papir)] transition-colors">Přihlášení</Link></li>
            </ul>
          </nav>
        </div>
        {/* Jazyk je dole, ne v liště: lišta nese jen sekce a dvě akce. Volba platí
            pro celou aplikaci (cookie), stejně se nabízí na přihlášení a registraci. */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <PravniOdkazy className="text-sm text-[color:var(--ld-text-3)]" />
          <span className="ld-jazyk"><JazykMenu align="right" /></span>
        </div>
        <p className="mt-6 pt-6 border-t border-[color:var(--ld-linka)] text-xs text-[color:var(--ld-text-3)] max-w-2xl text-pretty">{PATICKA_POCTIVOST}</p>
      </div>
    </footer>
  );
}
