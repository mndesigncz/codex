import type { Metadata } from 'next';
import Link from 'next/link';
import { NoveHesloForm } from '@/components/auth/ObnoveniHesla';
import { vypadaJakoToken } from '@/lib/jednorazovyToken';

export const metadata: Metadata = { title: 'Nové heslo · Managero client', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function Stranka({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!vypadaJakoToken(token)) {
    return (
      <div className="card p-6 max-w-md w-full mx-auto text-center">
        <h1 className="t-page">Odkaz nefunguje</h1>
        <p className="t-meta mt-3 text-pretty">Odkaz je neúplný nebo už neplatí. Požádejte o nový.</p>
        <Link href="/client/zapomenute-heslo" className="btn btn-secondary mt-6 tap-target">Zapomenuté heslo</Link>
      </div>
    );
  }
  return <NoveHesloForm klient token={token} />;
}
