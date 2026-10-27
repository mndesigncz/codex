import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import Domov from '@/components/client/host/Domov';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Karta · Managero client' };

// Karta = domov přihlášeného hosta (QR, karty podniků, co je dnes).
export default async function Page() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id || u.role !== 'customer') redirect('/client/login?next=/client/me');
  return <Domov />;
}
