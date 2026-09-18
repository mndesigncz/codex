// Stránka, která tu není.
//
// Nejčastěji sem dojde zákazník, ne zaměstnanec: sdílený odkaz na nabídku
// (`/s/<token>`) se dá vypnout nebo vygenerovat znovu, a lidé ho mají
// v záložkách a na letácích s QR kódem. Dokud tenhle soubor neexistoval,
// dostali od Next.js anglické „404 This page could not be found." — bez
// vysvětlení, bez cesty dál a v jazyce, kterým ten produkt nemluví.
//
// Co tu tedy musí být: česky, řekne co se stalo, nabídne kam jít a nesvaluje
// to na člověka. „Neplatný odkaz" zní jako jeho chyba; odkaz přestal platit.

import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Stránka nenalezena' };

export default function NotFound() {
  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-8 text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-[#C8F542]/15 text-[#5B7A08] grid place-items-center">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
        </div>
        <h1 className="t-page mt-5">Tahle stránka tu není</h1>
        <p className="t-meta mt-2.5 text-pretty">
          Adresa možná přestala platit — sdílené odkazy na nabídku se dají kdykoli
          vypnout nebo vystavit znovu. Zkus to místo, odkud jsi přišel, nebo se
          zeptej v podniku na aktuální odkaz.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Link href="/" className="btn btn-accent">Na úvod</Link>
          <Link href="/client" className="btn btn-secondary">Najít podnik</Link>
        </div>
      </div>
    </main>
  );
}
