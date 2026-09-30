import type { Metadata } from 'next';
import Link from 'next/link';
import PotvrditSmazani from '@/components/pravni/PotvrditSmazani';
import { vypadaJakoToken } from '@/lib/jednorazovyToken';

// Odkaz z e-mailu nemá být ve vyhledávači ani v cizích záznamech (token v adrese).
export const metadata: Metadata = { title: 'Potvrzení smazání účtu · Managero', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function Potvrdit({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      {vypadaJakoToken(token) ? (
        <PotvrditSmazani token={token} />
      ) : (
        <div className="card p-6 max-w-md w-full text-center">
          <h1 className="t-page">Odkaz nefunguje</h1>
          <p className="t-meta mt-3 text-pretty">Odkaz je neúplný nebo už neplatí. Požádejte o nový na stránce Smazání účtu.</p>
          <Link href="/smazat-ucet" className="btn btn-secondary mt-6 tap-target">Smazání účtu</Link>
        </div>
      )}
    </main>
  );
}
