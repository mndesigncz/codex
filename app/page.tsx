import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Landing from '@/components/Landing';
import type { Metadata } from 'next';
import { OG_ZAKLAD } from '@/lib/web';
import { obalZHlavicek, HLASKA_ROLE_V_PROVOZU } from '@/lib/obal';
import SpatnaRole from '@/components/auth/SpatnaRole';
import { COOKIE_STRANA, druhaStranaRelace } from '@/lib/dveStrany';
import { getJazyk } from '@/lib/i18n/server';
import { ZapisSlovniky } from '@/lib/i18n/client';
import { nactiSekce } from '@/lib/i18n/slovniky';
import { COOKIE_ROZCESTNIK } from '@/components/landing/obsah';

// Canonical jen tady: úvodní stránka je jediná, která se má z adresy sama vyhlásit za originál.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { ...OG_ZAKLAD, url: '/' },
};

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getServerSession(authOptions);
  // Nativní obal: žádná prodejní stránka s cenami (Apple 3.1.1, Google Play Billing).
  // Hostovská aplikace se sem nedostane (brána v middleware), provozní jde rovnou na přihlášení.
  const obal = obalZHlavicek(await headers());
  if (!session) {
    if (obal) redirect('/login');
    // Logged-out visitors get the storefront, not a login wall.
    // Slovník ceníku se zapíše před vykreslením Landing (důvod v app/employer/start/page.tsx).
    const jazyk = await getJazyk();
    const slovniky = jazyk === 'cs' ? null : await nactiSekce(jazyk, ['predplatne']);
    // Rozcestník podnik / zákazník: jen dokud si návštěvník nevybral podnik (cookie do zavření
    // prohlížeče) a když nepřišel odkazem rovnou na prodejní stránku (?pro=…, např. z kampaně).
    const rozcestnik = !(await cookies()).get(COOKIE_ROZCESTNIK) && !(await searchParams).pro;
    return <>{slovniky && <ZapisSlovniky sekce={['predplatne']} slovniky={slovniky} />}<Landing rozcestnik={rozcestnik} /></>;
  }
  const role = (session.user as any)?.role;
  // Host v aplikaci pro podniky: přesměrování na /client by brána vrátila zpět (smyčka).
  if (obal === 'managero' && role === 'customer') return <SpatnaRole zprava={HLASKA_ROLE_V_PROVOZU} />;
  // Účet s oběma stranami, který si ještě nevybral (lib/dveStrany): nejdřív „Kam jdeš“.
  if (!obal && !(await cookies()).get(COOKIE_STRANA) && (await druhaStranaRelace(parseInt((session.user as any).id), (session.user as any).metoda).catch(() => null))) {
    redirect('/kam');
  }
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
