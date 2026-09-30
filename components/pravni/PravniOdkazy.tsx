// Odkazy na právní stránky. Jedna komponenta pro patičku webu, přihlášení,
// registraci, nastavení a patičku hostovské části; texty a cesty jsou
// v lib/pravni/texty.ts. Bez závislosti na stavu, takže jde použít i v server
// komponentách.

import Link from 'next/link';
import { ODKAZY_PRAVNI, type KlicDokumentu } from '@/lib/pravni/texty';

export default function PravniOdkazy({ jen, className = '', jazyk = 'cs' }: {
  /** Jen vybrané odkazy (např. v registraci stačí zásady a podmínky). */
  jen?: KlicDokumentu[];
  className?: string;
  jazyk?: 'cs' | 'en';
}) {
  const seznam = ODKAZY_PRAVNI.filter(o => !jen || jen.includes(o.klic));
  const predpona = jazyk === 'en' ? '/en' : '';
  return (
    <nav aria-label={jazyk === 'en' ? 'Legal' : 'Právní informace'} className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}>
      {seznam.map(o => (
        <Link key={o.klic} href={`${predpona}/${o.klic}`} className="tap-target-sm inline-flex items-center underline-offset-2 hover:underline">
          {jazyk === 'en' ? o.en : o.cs}
        </Link>
      ))}
    </nav>
  );
}
