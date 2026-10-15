// E-mail vlastníkovi podniku k předplatnému (spuštění, balík G). Volá ho webhook Stripe
// (lib/billing.ts, větve invoice.payment_failed a customer.subscription.trial_will_end) vedle
// oznámení v aplikaci. Šablona je v lib/email.ts (sendPlatbaEmail). Nikdy nevyhazuje: webhook
// se kvůli nedoručenému e-mailu nesmí opakovat (Stripe by pak opakoval i ostatní kroky).

import { neon } from '@neondatabase/serverless';
import { sendPlatbaEmail } from './email';

const sql = neon(process.env.DATABASE_URL!);

export async function emailVlastnikoviOPlatbe(teamId: number, druh: 'platba_selhala' | 'konec_zkousky', extra: { zruseno?: boolean; pokus?: number | null } = {}): Promise<boolean> {
  try {
    const [r] = await sql`
      SELECT u.email, u.name, COALESCE(NULLIF(t.share_theme->>'businessName', ''), t.name) AS podnik
      FROM teams t JOIN users u ON u.id = t.owner_id WHERE t.id = ${teamId}`;
    const email = String(r?.email ?? '');
    if (!r || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.endsWith('@managero.invalid')) return false;
    const v = await sendPlatbaEmail(email, { druh, podnik: String(r.podnik ?? 'podnik'), jmeno: String(r.name ?? ''), ...extra });
    if (!v.sent) console.error('[billing] e-mail vlastníkovi neodešel', teamId, druh, v.error);
    return v.sent;
  } catch (e) {
    console.error('[billing] e-mail vlastníkovi selhal', teamId, druh, e);
    return false;
  }
}
