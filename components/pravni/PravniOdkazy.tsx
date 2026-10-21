// Odkazy na právní stránky. Jedna komponenta pro patičku webu, přihlášení,
// registraci, nastavení a patičku hostovské části; názvy a cesty jsou
// v lib/pravni/odkazy.ts (čistý modul bez textů dokumentů, jde i do klienta).
// Bez závislosti na stavu, takže jde použít i v server komponentách.

import Link from 'next/link';
import { ODKAZY_PRAVNI, ODKAZY_ZAKLAD, cestaDokumentu, type KlicOdkazu } from '@/lib/pravni/odkazy';

// Bez `jen` a `vse` ukazuje základní čtveřici (zásady, podmínky, podpora, smazání účtu) jako
// dřív — přihlášení, účet hosta a nastavení nemají dostat smluvní dokumenty pro podniky.
// Patička webu a právních stránek posílá `vse`.
export default function PravniOdkazy({ jen, vse = false, bezPodniku = false, vysoke = false, className = '', jazyk = 'cs' }: {
  /** Jen vybrané odkazy (např. v registraci stačí zásady a podmínky). */
  jen?: KlicOdkazu[];
  /** Všechny právní stránky včetně obchodních podmínek a zpracovatelské smlouvy. */
  vse?: boolean;
  /** Bez dokumentů jen pro podniky (obchodní podmínky, zpracovatelská smlouva, zrušení předplatného). */
  bezPodniku?: boolean;
  /** Každý odkaz vysoký 44 px (patička právních stránek: víc řádků odkazů pod sebou na telefonu). */
  vysoke?: boolean;
  className?: string;
  jazyk?: 'cs' | 'en';
}) {
  const vyber = jen ?? (vse ? null : ODKAZY_ZAKLAD);
  const seznam = (vyber ? vyber.map(k => ODKAZY_PRAVNI.find(o => o.klic === k)!).filter(Boolean) : ODKAZY_PRAVNI)
    .filter(o => !(bezPodniku && o.podnik));
  return (
    <nav aria-label={jazyk === 'en' ? 'Legal' : 'Právní informace'} className={`flex flex-wrap items-center gap-x-4 ${vysoke ? '' : 'gap-y-1'} ${className}`}>
      {seznam.map(o => (
        <Link key={o.klic} href={cestaDokumentu(o.klic, jazyk)} className={`${vysoke ? 'min-h-11' : 'tap-target-sm'} inline-flex items-center underline-offset-2 hover:underline`}>
          {jazyk === 'en' ? o.en : o.cs}
        </Link>
      ))}
    </nav>
  );
}
