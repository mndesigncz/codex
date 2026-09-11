import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import ClientShell from '@/components/client/ClientShell';

export const dynamic = 'force-dynamic';

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  const me = u?.id && u.role === 'customer' ? { id: Number(u.id), name: String(u.name ?? ''), email: String(u.email ?? '') } : null;
  return <ClientShell me={me}>{children}</ClientShell>;
}
