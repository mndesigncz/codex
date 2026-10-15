import type { Metadata } from 'next';
import Link from 'next/link';
import { OvereniEmailuStranka } from '@/components/auth/OvereniEmailu';
import { vypadaJakoToken } from '@/lib/jednorazovyToken';
import { getT } from '@/lib/i18n/server';

// Token je v adrese: stránka nesmí do vyhledávače ani poslat Referer dál.
export const metadata: Metadata = { title: 'Potvrzení e-mailu · Managero', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function Stranka({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!vypadaJakoToken(token)) {
    const t = await getT(['spolecne']);
    return (
      <main className="min-h-[100dvh] flex items-center justify-center p-4">
        <div className="card p-6 max-w-md w-full text-center">
          <h1 className="t-page">{t('Odkaz nefunguje')}</h1>
          <p className="t-meta mt-3 text-pretty">{t('Odkaz je neúplný nebo už neplatí. Nový pošlete v aplikaci v Nastavení → Zabezpečení.')}</p>
          <Link href="/" className="btn btn-secondary mt-6 tap-target">{t('Do aplikace')}</Link>
        </div>
      </main>
    );
  }
  return <OvereniEmailuStranka token={token} />;
}
