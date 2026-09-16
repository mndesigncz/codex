// Stav propojeného účtu pro nastavení podniku. Při návratu z onboardingu
// (?refresh=1) se zeptá Stripe znovu; jinak vrací, co máme uložené.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { stripeConfigured, platformFeePercent } from '@/lib/stripe';
import { connectStateOf, refreshConnect } from '@/lib/stripeSync';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const id = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id, role FROM users WHERE id = ${id}`;
  if (!u?.team_id || u.role !== 'employer') return NextResponse.json({ error: 'Jen pro vedení.' }, { status: 403 });
  const teamId = Number(u.team_id);
  const configured = stripeConfigured();
  const refresh = new URL(req.url).searchParams.get('refresh') === '1';
  let state = await connectStateOf(teamId);
  if (configured && refresh && state.accountId) {
    try { state = await refreshConnect(teamId); } catch (e: any) { console.warn('stripe connect status', e?.message ?? e); }
  }
  let onlinePaymentsOn = false;
  try {
    const [p] = await sql`SELECT online_payments_on FROM client_profiles WHERE team_id = ${teamId}`;
    onlinePaymentsOn = !!p?.online_payments_on;
  } catch {}
  return NextResponse.json({
    configured,
    accountId: state.accountId,
    ready: state.ready,
    requirementsDue: state.due,
    onlinePaymentsOn,
    feePercent: platformFeePercent(),
  });
}
