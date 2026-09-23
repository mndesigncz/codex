// Co vidí lidé podniku, který správce platformy pozastavil.
//
// Sem přesměruje middleware každou stránku aplikace; API dostává 423.
// Stránka říká, co se stalo, proč (důvod, který správce napsal) a co s tím —
// ne „Přístup odepřen". Odhlásit se musí jít vždycky: jinak by člověk
// s víc podniky nemohl přejít do toho, který pozastavený není.

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { neon } from '@neondatabase/serverless';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import OdhlasitButton from '@/components/admin/OdhlasitButton';
import PodnikSwitcher from '@/components/PodnikSwitcher';

export const metadata: Metadata = { title: 'Podnik je pozastavený' };
export const dynamic = 'force-dynamic';

export default async function Pozastaveno() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  let jmeno: string | null = null, duvod: string | null = null, blokovano = false;
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const meId = parseInt(String((session.user as { id?: string }).id));
    const [t] = await sql`
      SELECT t.name, t.blocked_at, t.blocked_reason FROM users u JOIN teams t ON t.id = u.team_id WHERE u.id = ${meId}`;
    if (t) { jmeno = t.name; duvod = t.blocked_reason ?? null; blokovano = !!t.blocked_at; }
  } catch { /* bez databáze se ukáže obecná verze */ }
  // Kdo sem přišel omylem (podnik už je obnovený), jde zpátky do aplikace.
  if (!blokovano && jmeno) redirect('/');

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-8">
        <div className="h-14 w-14 rounded-2xl bg-wait/15 text-wait-ink grid place-items-center">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <h1 className="t-page mt-5">{jmeno ? `${jmeno} je pozastavený` : 'Podnik je pozastavený'}</h1>
        <p className="t-meta mt-2.5 text-pretty">
          Přístup do aplikace pro tenhle podnik dočasně vypnul provozovatel Managera.
          Data nikam nezmizela; jakmile se to vyřeší, všechno bude tam, kde bylo.
        </p>
        {duvod && (
          <div className="well mt-5 p-4">
            <p className="t-label">Důvod</p>
            <p className="mt-1.5 text-sm text-pretty">{duvod}</p>
          </div>
        )}
        <p className="t-meta mt-5 text-pretty">
          Jsi majitel? Ozvi se na e-mail, ze kterého ti chodí faktury — odpovíme na něj.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <OdhlasitButton />
          {/* Kdo má i jiný podnik, přepne se do něj — přepínač se s jediným členstvím nekreslí. */}
          <PodnikSwitcher />
        </div>
      </div>
    </main>
  );
}
