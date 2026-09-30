import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { infoOBrane } from '@/lib/pruvodce/brana';
import Pruvodce from '@/components/pruvodce/Pruvodce';
import { getJazyk } from '@/lib/i18n/server';
import { ZapisSlovniky } from '@/lib/i18n/client';
import { nactiSekce } from '@/lib/i18n/slovniky';

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
    // Ne-vlastník a hotový průvodce nebo podnik z doby před ním (obojí bez „Spustit znovu") sem nepatří.
    if (!info.vlastnik || ((info.stav === null || info.stav === 'hotovo') && !znovu)) redirect('/employer/overview');
  }
  // Slovník průvodce se zapíše (ZapisSlovniky) dřív, než se vykreslí Pruvodce. Async <Slovniky> jako sourozenec
  // by se vykresloval souběžně a na studeném serveru by první HTML vyšlo česky a hydratace by se rozešla.
  const jazyk = await getJazyk();
  const slovniky = jazyk === 'cs' ? null : await nactiSekce(jazyk, ['pruvodce']);
  const cele = String(session?.user?.name ?? '').trim();
  const jmeno = cele.split(/\s+/)[0] ?? '';
  return <>{slovniky && <ZapisSlovniky sekce={['pruvodce']} slovniky={slovniky} />}<Pruvodce jmeno={jmeno} znovu={znovu} /></>;
}
