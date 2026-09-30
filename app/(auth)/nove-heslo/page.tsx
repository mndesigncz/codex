import type { Metadata } from 'next';
import Link from 'next/link';
import { NoveHesloForm } from '@/components/auth/ObnoveniHesla';
import { vypadaJakoToken } from '@/lib/jednorazovyToken';

// Token je v adrese: stránka nesmí do vyhledávače ani poslat Referer dál.
export const metadata: Metadata = { title: 'Nové heslo · Managero', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function Stranka({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!vypadaJakoToken(token)) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center p-4">
        <div className="card p-6 max-w-md w-full text-center">
          <h1 className="t-page">Odkaz nefunguje</h1>
          <p className="t-meta mt-3 text-pretty">Odkaz je neúplný nebo už neplatí. Požádejte o nový.</p>
          <Link href="/zapomenute-heslo" className="btn btn-secondary mt-6 tap-target">Zapomenuté heslo</Link>
        </div>
      </main>
    );
  }
  return <NoveHesloForm klient={false} token={token} />;
}
