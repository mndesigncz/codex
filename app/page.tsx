import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Landing from '@/components/Landing';
import type { Metadata } from 'next';
import { OG_ZAKLAD } from '@/lib/web';
import { obalZHlavicek, HLASKA_ROLE_V_PROVOZU } from '@/lib/obal';
import SpatnaRole from '@/components/auth/SpatnaRole';

// Canonical jen tady: úvodní stránka je jediná, která se má z adresy sama vyhlásit za originál.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { ...OG_ZAKLAD, url: '/' },
};

export default async function Home() {
  const session = await getServerSession(authOptions);
  // Nativní obal: žádná prodejní stránka s cenami (Apple 3.1.1, Google Play Billing).
  // Hostovská aplikace se sem nedostane (brána v middleware), provozní jde rovnou na přihlášení.
  const obal = obalZHlavicek(await headers());
  if (!session) {
    if (obal) redirect('/login');
    // Logged-out visitors get the storefront, not a login wall.
    return <Landing />;
  }
  const role = (session.user as any)?.role;
  // Host v aplikaci pro podniky: přesměrování na /client by brána vrátila zpět (smyčka).
  if (obal === 'managero' && role === 'customer') return <SpatnaRole zprava={HLASKA_ROLE_V_PROVOZU} />;
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
