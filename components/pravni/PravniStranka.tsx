// Společná kostra právních a podpůrných stránek (zásady, podmínky, podpora,
// smazání účtu). Veřejná, bez přihlášení, česky i anglicky; funguje i uvnitř
// obou aplikací (brána lib/obal.ts je pouští). Texty jsou v lib/pravni/texty.ts
// a před zveřejněním je schvaluje právník.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoMark } from '@/components/Icons';
import { chybejiciUdaje, firma } from '@/lib/firma';
import { dokument, type Jazyk, type KlicDokumentu } from '@/lib/pravni/texty';
import PravniOdkazy from './PravniOdkazy';

export default function PravniStranka({ klic, jazyk, dodatek }: {
  klic: KlicDokumentu;
  jazyk: Jazyk;
  /** Interaktivní část pod textem (formulář žádosti o smazání účtu). */
  dodatek?: ReactNode;
}) {
  const f = firma();
  const d = dokument(klic, jazyk, f);
  const chybi = chybejiciUdaje(f);
  const predpona = jazyk === 'en' ? '/en' : '';
  const jinyJazyk = jazyk === 'cs' ? { href: `/en/${klic}`, text: 'English' } : { href: `/${klic}`, text: 'Česky' };
  return (
    <main className="min-h-[100dvh] px-4 sm:px-6 py-6 sm:py-10 pb-[max(env(safe-area-inset-bottom),24px)]" lang={jazyk}>
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex items-center gap-3 mb-8">
          <Link href="/" className="tap-target inline-flex items-center gap-2 min-w-0" aria-label="Managero">
            <LogoMark size={32} />
            <span className="font-bold tracking-tight">Managero</span>
          </Link>
          <Link href={jinyJazyk.href} hrefLang={jazyk === 'cs' ? 'en' : 'cs'} className="tap-target-sm ml-auto inline-flex items-center t-meta underline-offset-2 hover:underline">{jinyJazyk.text}</Link>
        </header>

        {chybi.length > 0 && (
          // Viditelné jen dokud provozovatel nevyplní údaje (lib/firma.ts): nikdo
          // nemá poslat do obchodu stránku se zástupnými poli bez varování.
          <p role="note" className="note note-wait mb-6">
            {jazyk === 'en'
              ? `Draft: operator details are not filled in yet (${chybi.join(', ')}). The text must be approved by a lawyer before publishing.`
              : `Návrh: údaje provozovatele zatím nejsou vyplněné (${chybi.join(', ')}). Text musí před zveřejněním schválit právník.`}
          </p>
        )}

        <h1 className="t-page text-balance">{d.titulek}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-black/70 text-pretty">{d.uvod}</p>
        <p className="mt-2 t-meta">{jazyk === 'en' ? 'Last updated' : 'Poslední úprava'}: {d.aktualizace}</p>

        <div className="mt-8 grid gap-8">
          {d.sekce.map(s => (
            <section key={s.id} aria-labelledby={`h-${s.id}`}>
              <h2 id={`h-${s.id}`} className="t-section">{s.h}</h2>
              {s.p?.map((t, i) => <p key={i} className="mt-2 text-[15px] leading-relaxed text-black/70 text-pretty">{t}</p>)}
              {s.li && (
                <ul className="mt-2 grid gap-1.5 list-disc pl-5 text-[15px] leading-relaxed text-black/70 marker:text-black/30">
                  {s.li.map((t, i) => <li key={i} className="text-pretty">{t}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>

        {dodatek && <div className="mt-10">{dodatek}</div>}

        <footer className="mt-12 pt-6 border-t border-black/[0.08] t-meta grid gap-2">
          <PravniOdkazy jazyk={jazyk} />
          <p>{f.nazev} · {predpona ? 'Company ID' : 'IČO'} {f.ico}</p>
        </footer>
      </div>
    </main>
  );
}
