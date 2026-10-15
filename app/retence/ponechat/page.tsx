import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoMark } from '@/components/Icons';

// Výsledek odkazu „Ponechat účet“ z e-mailu před anonymizací neaktivního hosta (retence, balík G).
// Samotnou změnu dělá app/api/retence/ponechat; sem se jen přesměruje se stavem.
export const metadata: Metadata = { title: 'Účet zůstává · Managero client', robots: { index: false, follow: false }, referrer: 'no-referrer' };

const TEXTY: Record<string, { h: string; p: string; tone: 'ok' | 'wait' | 'danger' }> = {
  ok: { h: 'Účet zůstává', p: 'Děkujeme. Váš účet i body zůstávají a lhůta neaktivity se počítá znovu od dneška.', tone: 'ok' },
  neplatny: { h: 'Odkaz není platný', p: 'Odkaz je neúplný nebo upravený. Otevřete ho prosím znovu z e-mailu.', tone: 'danger' },
  nenalezen: { h: 'Účet se nepodařilo najít', p: 'Účet už možná neexistuje. Pokud si myslíte, že jde o chybu, napište nám na kontakt na stránce Podpora.', tone: 'danger' },
  limit: { h: 'Moc pokusů', p: 'Zkuste to prosím za chvíli znovu.', tone: 'wait' },
};

export default async function Stranka({ searchParams }: { searchParams: Promise<{ stav?: string }> }) {
  const { stav } = await searchParams;
  const t = TEXTY[String(stav ?? '')] ?? TEXTY.neplatny;
  return (
    <main className="min-h-[100dvh] px-4 py-10 pb-[max(env(safe-area-inset-bottom),24px)]">
      <div className="mx-auto w-full max-w-md">
        <Link href="/client" className="tap-target inline-flex items-center gap-2 mb-8" aria-label="Managero client">
          <LogoMark size={32} /><span className="font-bold tracking-tight">Managero client</span>
        </Link>
        <section className="card p-5 sm:p-6" aria-labelledby="h-ponechat">
          <h1 id="h-ponechat" className="t-page text-balance">{t.h}</h1>
          <p role="status" className={`note note-${t.tone} mt-4`}>{t.p}</p>
          <Link href="/client/me" className="btn btn-primary tap-target mt-5 w-full justify-center">Otevřít Managero client</Link>
        </section>
      </div>
    </main>
  );
}
