import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Landing from '@/components/Landing';
import type { Metadata } from 'next';
import { OG_ZAKLAD } from '@/lib/web';

// Canonical jen tady: úvodní stránka je jediná, která se má z adresy sama vyhlásit za originál.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { ...OG_ZAKLAD, url: '/' },
};

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
  if (role === 'customer') {
    redirect('/client');
  }
  if (role === 'kiosk') {
    redirect('/kiosk');
  }
  redirect('/employee/shifts');
}
