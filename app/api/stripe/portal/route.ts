// Správa předplatného (karta, faktury, zrušení) přes Stripe Customer Portal.
// Vzhled a povolené akce portálu se nastavují v Dashboardu → Settings → Billing.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getStripe, stripeConfigured, appUrl } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const me = { id: parseInt((session.user as any).id), role: (session.user as any).role as string };
  if (me.role !== 'employer') return NextResponse.json({ error: 'Předplatné spravuje vedení.' }, { status: 403 });
  if (!stripeConfigured()) return NextResponse.json({ configured: false, error: 'Online platby nejsou zapnuté.' }, { status: 503 });

  const [u] = await sql`SELECT team_id FROM users WHERE id = ${me.id}`;
  if (!u?.team_id) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });
  const [team] = await sql`SELECT stripe_customer_id FROM teams WHERE id = ${u.team_id}`;
  if (!team?.stripe_customer_id) return NextResponse.json({ error: 'Podnik zatím nemá žádné předplatné.' }, { status: 404 });

  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: team.stripe_customer_id,
      return_url: `${appUrl()}/employer/overview?view=settings`,
      locale: 'cs',
    });
    return NextResponse.json({ url: portal.url });
  } catch (e: any) {
    console.error('stripe portal', e?.message ?? e);
    return NextResponse.json({ error: 'Portál se nepodařilo otevřít. Zkuste to za chvíli.' }, { status: 502 });
  }
}
