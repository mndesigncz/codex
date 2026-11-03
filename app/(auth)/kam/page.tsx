import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { obalZHlavicek } from '@/lib/obal';
import { cestaStrany, druhaStranaRelace, stranaRole } from '@/lib/dveStrany';
import VolbaStrany from '@/components/auth/VolbaStrany';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

// Volba „Kam jdeš“ pro účet, který má obě strany (lib/dveStrany). Bez druhé
// strany (i když do ní relace z kódu z e-mailu nesmí) nebo v nativním obalu (každá aplikace má jen svou) se neptá a pustí
// člověka rovnou tam, kam patří.
export default async function KamPage() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id) redirect('/login');
  const strana = stranaRole(u.role);
  if (obalZHlavicek(await headers())) redirect('/');
  const d = await druhaStranaRelace(parseInt(u.id), u.metoda);
  if (!d) redirect(cestaStrany(strana));
  return <VolbaStrany strana={strana} email={String(u.email ?? '')} />;
}
