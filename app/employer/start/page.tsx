import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { infoOBrane } from '@/lib/pruvodce/brana';
import Pruvodce from '@/components/pruvodce/Pruvodce';

export const metadata: Metadata = { title: 'Nastavení podniku', robots: { index: false, follow: false } };

// Průvodce prvotním nastavením: celoobrazovková trasa, ne okno nad aplikací
// (obnovitelná adresa, žádný boční pás ani dok, které by rušily vyprávění).
// Přihlášení a typ účtu hlídá layout /employer; tady se hlídá jen, jestli
// má průvodce pro tenhle podnik smysl. Při chybě databáze se stránka otevře
// a klient si stav zjistí sám (GET /api/onboarding).
export default async function StartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getServerSession(authOptions);
  const q = await searchParams;
  const znovu = q.znovu === '1';
  const id = Number((session?.user as any)?.id);
  const info = await infoOBrane(id);
  if (info) {
    // Ne-vlastník, podnik bez průvodce (z doby před ním) a hotový průvodce (bez „Spustit znovu") sem nepatří.
    if (!info.vlastnik || info.stav === null || (info.stav === 'hotovo' && !znovu)) redirect('/employer/overview');
  }
  const cele = String(session?.user?.name ?? '').trim();
  const jmeno = cele.split(/\s+/)[0] ?? '';
  return <Pruvodce jmeno={jmeno} znovu={znovu} />;
}
