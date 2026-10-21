// Patička právních stránek: odkazy na všechny dokumenty a identifikace provozovatele
// podle § 435 OZ (jméno, IČO, sídlo, zápis v evidenci, DPH) s kontakty.

import { identifikace, jeEmail, telOdkaz, type Firma } from '@/lib/firma';
import PravniOdkazy from './PravniOdkazy';

export default function PravniPaticka({ jazyk, f }: { jazyk: 'cs' | 'en'; f: Firma }) {
  return (
    <footer className="mt-12 pt-6 border-t border-black/[0.08] t-meta grid gap-2" data-provozovatel>
      <PravniOdkazy jazyk={jazyk} vse vysoke />
      <p className="text-pretty">{identifikace(f, jazyk)}</p>
      <p className="flex flex-wrap gap-x-4">
        {jeEmail(f.emailPodpory) && <a href={`mailto:${f.emailPodpory}`} className="min-h-11 inline-flex items-center underline-offset-2 hover:underline">{f.emailPodpory}</a>}
        <a href={telOdkaz(f.telefon)} className="min-h-11 inline-flex items-center underline-offset-2 hover:underline whitespace-nowrap">{f.telefon}</a>
      </p>
    </footer>
  );
}
