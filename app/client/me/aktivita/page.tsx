import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import Aktivita from '@/components/client/host/Aktivita';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Aktivita · Managero client' };

export default async function Page() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id || u.role !== 'customer') redirect('/client/login?next=/client/me/aktivita');
  return <Aktivita />;
}
