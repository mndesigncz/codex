import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import ClientHome from '@/components/client/ClientHome';
import Podniky from '@/components/client/host/Podniky';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Managero client', description: 'Rezervace, věrnostní karta a objednávka od stolu pro podniky, kam chodíš.' };

// Přihlášený host: Podniky (hledání, filtry, sken stojánku). Nepřihlášený: úvod a seznam podniků.
export default async function ClientHomePage() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (u?.id && u.role === 'customer') return <Podniky />;
  return <ClientHome />;
}
