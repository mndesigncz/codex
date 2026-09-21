// Brána do správy platformy. Kdo není správce podle prostředí, jde domů —
// bez vysvětlení, protože tahle adresa se nemá ani zjistit.
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { isSuperadminId } from '@/lib/superadmin';
import AdminShell from '@/components/admin/AdminShell';

export const metadata: Metadata = { title: 'Správa platformy · Managero' };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  const email = String(session.user.email ?? '');
  const id = (session.user as { id?: string }).id;
  // Dvě podmínky: token říká „správce" (rozhodnuto při přihlášení podle
  // databáze — role vedení) a id je v seznamu TEĎ (vyškrtnutí z prostředí
  // platí hned, ne až po novém přihlášení). Každý zásah pak ještě zvlášť
  // ověří brána API podle databáze.
  if ((session.user as { superadmin?: unknown }).superadmin !== true) redirect('/');
  if (!isSuperadminId(id)) redirect('/');
  return <AdminShell email={email.toLowerCase()}>{children}</AdminShell>;
}
