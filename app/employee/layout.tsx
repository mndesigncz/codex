import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Slovniky } from '@/lib/i18n/server';

// Přihlášená část: nic z ní nemá být ve vyhledávači.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const role = (session.user as any)?.role;
  if (role === 'employer') redirect('/employer/overview');

  // Zaměstnanecké obrazovky plus návody, postupy a společné součásti správy: slovníky jdou v prvním HTML, ať se v cizím jazyce nic nepřekreslí česky.
  return <><Slovniky sekce={['zamestnanec', 'chat', 'sprava', 'tym', 'navody', 'postupy']} />{children}</>;
}
