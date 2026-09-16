// Online platby hostů: podnik si propojí vlastní Stripe účet (Connect,
// Accounts v2). Managero je SaaS platforma — podnik je obchodník (merchant
// of record), platí si poplatky Stripe sám a má plný Stripe Dashboard.
// Onboarding dělá Stripe (Account Link), my nesbíráme žádné doklady.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getStripe, stripeConfigured, appUrl } from '@/lib/stripe';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function employer() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = parseInt((session.user as any).id);
  if ((session.user as any).role !== 'employer') return null;
  const [u] = await sql`SELECT team_id, email FROM users WHERE id = ${id}`;
  if (!u?.team_id) return null;
  return { id, teamId: Number(u.team_id), email: String(u.email) };
}

/** Založí (jednou) propojený účet a vrátí odkaz na onboarding ve Stripe. */
async function onboardingUrl(me: { id: number; teamId: number; email: string }): Promise<string> {
  const stripe = getStripe();
  const [team] = await sql`SELECT name, stripe_account_id FROM teams WHERE id = ${me.teamId}`;
  let accountId: string | null = team?.stripe_account_id ?? null;
  if (!accountId) {
    const acct = await stripe.v2.core.accounts.create({
      display_name: String(team?.name ?? 'Podnik'),
      contact_email: me.email,
      dashboard: 'full',
      identity: { country: 'cz' },
      defaults: {
        currency: 'czk',
        locales: ['cs-CZ'],
        // Podnik platí poplatky Stripe sám a Stripe nese riziko záporného
        // zůstatku — přesně to, co pro SaaS s přímými platbami Stripe doporučuje.
        responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
      },
      configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
      metadata: { teamId: String(me.teamId), app: 'managero' },
    }, { idempotencyKey: `managero-connect-${me.teamId}` });
    accountId = acct.id;
    await sql`UPDATE teams SET stripe_account_id = ${accountId}, stripe_payments_ready = FALSE WHERE id = ${me.teamId}`;
    await audit(me.teamId, me.id, 'connect.account_created', 'team', me.teamId, accountId);
  }
  const link = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: ['merchant'],
        // Odkaz vyprší → Stripe pošle podnik sem a my vyrobíme nový.
        refresh_url: `${appUrl()}/api/stripe/connect/onboard`,
        return_url: `${appUrl()}/employer/overview?mode=client&tab=settings&connect=return`,
      },
    },
  });
  return link.url;
}

/** Tlačítko v nastavení: vrátí adresu, kam hosta poslat. */
export async function POST() {
  const me = await employer();
  if (!me) return NextResponse.json({ error: 'Propojení se Stripe dělá vedení.' }, { status: 403 });
  if (!stripeConfigured()) return NextResponse.json({ configured: false, error: 'Online platby nejsou zapnuté.' }, { status: 503 });
  try {
    return NextResponse.json({ url: await onboardingUrl(me) });
  } catch (e: any) {
    console.error('stripe connect onboard', e?.message ?? e);
    return NextResponse.json({ error: 'Propojení se nepodařilo připravit. Zkuste to za chvíli.' }, { status: 502 });
  }
}

/** Vypršelý odkaz (refresh_url): vyrobí nový a přesměruje. */
export async function GET() {
  const me = await employer();
  const settings = `${appUrl()}/employer/overview?mode=client&tab=settings`;
  if (!me || !stripeConfigured()) return NextResponse.redirect(settings, 303);
  try {
    return NextResponse.redirect(await onboardingUrl(me), 303);
  } catch (e: any) {
    console.error('stripe connect refresh', e?.message ?? e);
    return NextResponse.redirect(`${settings}&connect=error`, 303);
  }
}
