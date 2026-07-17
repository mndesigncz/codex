import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import KioskApp from '@/components/kiosk/KioskApp';

export default async function KioskPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const role = (session.user as any)?.role;
  // Only the dedicated tablet account gets the kiosk; others go to their app.
  if (role === 'employer') redirect('/employer/overview');
  if (role !== 'kiosk') redirect('/employee/shifts');
  return <KioskApp teamName={(session.user as any)?.name ?? 'Tablet'} />;
}
