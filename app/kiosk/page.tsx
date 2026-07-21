import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import KioskApp from '@/components/kiosk/KioskApp';
import { CurrencyProvider } from '@/components/CurrencyProvider';

export default async function KioskPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const role = (session.user as any)?.role;
  // Only the dedicated tablet account gets the kiosk; others go to their app.
  if (role === 'employer') redirect('/employer/overview');
  if (role !== 'kiosk') redirect('/employee/shifts');
  const u = session.user as any;
  return (
    <CurrencyProvider>
      <KioskApp user={{ id: u?.id, name: u?.name ?? 'Tablet', role: 'kiosk', avatar: u?.avatar ?? '📟' }} />
    </CurrencyProvider>
  );
}
