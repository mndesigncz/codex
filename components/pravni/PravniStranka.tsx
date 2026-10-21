// Společná kostra právních a podpůrných stránek (obchodní podmínky, zpracovatelská
// smlouva, subzpracovatelé, zrušení předplatného, podmínky užívání, zásady, podpora,
// smazání účtu, šablona pro zaměstnance). Veřejná, bez přihlášení, česky i anglicky;
// funguje i uvnitř obou aplikací (brána lib/obal.ts je pouští). Texty jsou
// v lib/pravni/dokumenty/*, údaje provozovatele v lib/firma.ts.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoMark } from '@/components/Icons';
import { chybejiciUdaje, firma, type Firma } from '@/lib/firma';
import { dokument, type Jazyk } from '@/lib/pravni/texty';
import { cestaDokumentu, type KlicDokumentu } from '@/lib/pravni/odkazy';
import PravniPaticka from './PravniPaticka';
import { TextSOdkazy } from './TextSOdkazy';

export default function PravniStranka({ klic, jazyk, dodatek }: {
  klic: KlicDokumentu;
  jazyk: Jazyk;
  /** Interaktivní část pod textem (formulář žádosti o smazání účtu). */
  dodatek?: ReactNode;
}) {
  const f: Firma = firma();
  const d = dokument(klic, jazyk, f);
  const chybi = chybejiciUdaje(f);
  const jinyJazyk = jazyk === 'cs' ? { href: cestaDokumentu(klic, 'en'), text: 'English' } : { href: cestaDokumentu(klic, 'cs'), text: 'Česky' };
  const text = (t: string) => <TextSOdkazy text={t} jazyk={jazyk} f={f} />;
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
          // Jen když někdo v prostředí přepíše údaje provozovatele neplatnou hodnotou
          // (lib/firma.ts má výchozí hodnoty): stránka nesmí potichu ukázat rozbitou identifikaci.
          <p role="note" className="note note-wait mb-6">
            {jazyk === 'en'
              ? `Operator details are incomplete (${chybi.join(', ')}). Check the FIRMA_* environment variables.`
              : `Údaje provozovatele nejsou úplné (${chybi.join(', ')}). Zkontrolujte proměnné prostředí FIRMA_*.`}
          </p>
        )}

        <h1 className="t-page text-balance">{d.titulek}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-black/70 text-pretty">{text(d.uvod)}</p>
        <p className="mt-2 t-meta">{jazyk === 'en' ? 'Effective from' : 'Platí od'}: {d.aktualizace}</p>

        {d.obsah && (
          // Obsah je sbalený: na telefonu by 24 řádků odsunulo první článek pod ohyb.
          <details className="mt-6 rounded-2xl border border-black/[0.08] px-4 group">
            <summary className="min-h-11 flex items-center cursor-pointer text-sm font-medium text-black/70 select-none">
              {jazyk === 'en' ? `Contents (${d.sekce.length})` : `Obsah (${d.sekce.length})`}
            </summary>
            <nav aria-label={jazyk === 'en' ? 'Contents' : 'Obsah'} className="pb-3">
              <ol className="grid gap-x-6 sm:grid-cols-2 list-none">
                {d.sekce.map(s => (
                  <li key={s.id} className="min-w-0">
                    <a href={`#${s.id}`} className="min-h-11 sm:min-h-9 inline-flex items-center text-sm text-black/70 underline-offset-2 hover:underline text-pretty">{s.h}</a>
                  </li>
                ))}
              </ol>
            </nav>
          </details>
        )}

        <div className="mt-8 grid gap-8">
          {d.sekce.map(s => (
            <section key={s.id} id={s.id} aria-labelledby={`h-${s.id}`} className="scroll-mt-6">
              <h2 id={`h-${s.id}`} className="t-section text-balance">{s.h}</h2>
              {s.p?.map((t, i) => <p key={i} className="mt-2 text-[15px] leading-relaxed text-black/70 text-pretty">{text(t)}</p>)}
              {s.li && (
                <ul className="mt-2 grid gap-1.5 list-disc pl-5 text-[15px] leading-relaxed text-black/70 marker:text-black/30">
                  {s.li.map((t, i) => <li key={i} className="text-pretty">{text(t)}</li>)}
                </ul>
              )}
              {s.po?.map((t, i) => <p key={i} className="mt-2 text-[15px] leading-relaxed text-black/70 text-pretty">{text(t)}</p>)}
            </section>
          ))}
        </div>

        {dodatek && <div className="mt-10">{dodatek}</div>}

        <PravniPaticka jazyk={jazyk} f={f} />
      </div>
    </main>
  );
}
