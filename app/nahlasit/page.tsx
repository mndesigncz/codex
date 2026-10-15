import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoMark } from '@/components/Icons';
import PravniOdkazy from '@/components/pravni/PravniOdkazy';
import { chybejiciUdaje, firma, jeEmail } from '@/lib/firma';
import Formular from './Formular';

// Oznámení nezákonného obsahu (DSA čl. 16) — veřejná stránka, funguje i bez účtu a v obou
// aplikacích. Oznámení jde provozovateli platformy (app/api/nahlasit). Texty schvaluje právník.
export const metadata: Metadata = {
  title: 'Nahlásit nezákonný obsah · Managero',
  description: 'Oznámení nezákonného obsahu v aplikacích Managero a Managero client podle Aktu o digitálních službách.',
  alternates: { canonical: '/nahlasit' },
};

export default function Stranka() {
  const f = firma();
  const chybi = chybejiciUdaje(f);
  return (
    <main className="min-h-[100dvh] px-4 sm:px-6 py-6 sm:py-10 pb-[max(env(safe-area-inset-bottom),24px)]" lang="cs">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex items-center gap-3 mb-8">
          <Link href="/" className="tap-target inline-flex items-center gap-2 min-w-0" aria-label="Managero">
            <LogoMark size={32} />
            <span className="font-bold tracking-tight">Managero</span>
          </Link>
        </header>

        {chybi.length > 0 && (
          <p role="note" className="note note-wait mb-6">Návrh: údaje provozovatele zatím nejsou vyplněné ({chybi.join(', ')}). Text musí před zveřejněním schválit právník.</p>
        )}

        <h1 className="t-page text-balance">Nahlásit nezákonný obsah</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-black/70 text-pretty">
          Narazili jste v aplikaci Managero nebo Managero client na obsah, který je podle vás nezákonný? Třeba na stránce podniku, v nabídce,
          v akci nebo ve zprávě. Dejte nám vědět. Účet k tomu nepotřebujete.
        </p>
        <ul className="mt-3 grid gap-1.5 list-disc pl-5 text-[15px] leading-relaxed text-black/70 marker:text-black/30">
          <li className="text-pretty">Oznámení posoudí člověk, ne automat, a to bez zbytečného odkladu.</li>
          <li className="text-pretty">Na e-mail vám pošleme potvrzení, že jsme oznámení přijali, a později i rozhodnutí.</li>
          <li className="text-pretty">Pokud obsah odstraníme, autor se dozví, co a proč. Vaše jméno a e-mail mu nesdělujeme.</li>
        </ul>

        <div className="mt-8"><Formular /></div>

        <section aria-labelledby="h-kontakt" className="mt-10">
          <h2 id="h-kontakt" className="t-section">Kontaktní místo</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-black/70 text-pretty">
            Pro úřady, Evropskou komisi i uživatele (Akt o digitálních službách, čl. 11 a 12):{' '}
            {jeEmail(f.emailPodpory) ? <a className="underline underline-offset-2" href={`mailto:${f.emailPodpory}`}>{f.emailPodpory}</a> : f.emailPodpory}.
            Komunikujeme česky a anglicky. Provozovatel: {f.nazev}, IČO {f.ico}, {f.adresa}.
          </p>
        </section>

        <footer className="mt-12 pt-6 border-t border-black/[0.08] t-meta grid gap-2">
          <PravniOdkazy jazyk="cs" />
          <p>{f.nazev} · IČO {f.ico}</p>
        </footer>
      </div>
    </main>
  );
}
