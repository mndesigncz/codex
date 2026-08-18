import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Landing from '@/components/Landing';

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session) {
    // Logged-out visitors get the storefront, not a login wall.
    return <Landing />;
  }
  const role = (session.user as any)?.role;
  if (role === 'employer') {
    redirect('/employer/overview');
  }
  if (role === 'kiosk') {
    redirect('/kiosk');
  }
  redirect('/employee/shifts');
}
