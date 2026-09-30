import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Slovniky } from '@/lib/i18n/server';

// Přihlášená část: nic z ní nemá být ve vyhledávači.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const role = (session.user as any)?.role;
  if (role !== 'employer') redirect('/employee/shifts');

  return <><Slovniky sekce={['rozvrh', 'sklad']} />{children}</>;
}
