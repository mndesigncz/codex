import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getJazyk } from '@/lib/i18n/server';
import { ZapisSlovniky } from '@/lib/i18n/client';
import { nactiSekce } from '@/lib/i18n/slovniky';

// Přihlášená část: nic z ní nemá být ve vyhledávači.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const role = (session.user as any)?.role;
  if (role !== 'employer') redirect('/employee/shifts');

  // Sekce předplatného (Nastavení → Předplatné, zámky Pro/Max, platební okno) se zapíše dřív, než se vykreslí
  // stránka pod ní: bez toho by první vykreslení i hlášky po návratu ze Stripe vyšly česky. Čeština nic nenačítá.
  const jazyk = await getJazyk();
  const slovniky = jazyk === 'cs' ? null : await nactiSekce(jazyk, ['predplatne']);
  return <>{slovniky && <ZapisSlovniky sekce={['predplatne']} slovniky={slovniky} />}{children}</>;
}
