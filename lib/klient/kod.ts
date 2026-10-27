// Jedno pole „Mám kód“ (Odměny): host nemusí vědět, jaký kód drží. Server ho pozná a provede
// stejnou akci jako dřívější samostatná pole:
//   1. promo kód podniku (client_promos.code je jedinečný napříč podniky) → lib/klient/promo.ts,
//   2. dárkový poukaz (DP-XXXX-XXXX, kontrolní znak) → přidá se hostovi do aplikace (prevezmiPoukaz),
//   3. plastová karta (8 znaků) → připojí se k účtu (pripojKartu, i převzetí bodů),
//   4. kód podniku (adresa /client/<kód>) → vrátí podnik, stránka nabídne „Otevřít“.
// Chyby jsou obecné („neznáme“), ať se z odpovědi nedá hádat, které kódy existují.

import { sql, profileBySlug } from '../client';
import { pragueToday } from '../pragueTime';
import { overKod } from '../poukazy';
import { prevezmiPoukaz } from '../poukazyHostDb';
import { pripojKartu } from '../kartyFyzickeDb';
import { vypadaJakoKarta } from '../kartyFyzicke';
import { uplatniPromo } from './promo';

export const KOD_NEZNAME = 'Tenhle kód neznáme. Zkontroluj ho, nebo se zeptej obsluhy.';

export type VysledekKodu = { status: number; body: Record<string, unknown> };

async function jmenoPodniku(teamId: number): Promise<{ slug: string; podnik: string } | null> {
  const [r] = await sql`
    SELECT p.slug, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS podnik
    FROM client_profiles p JOIN teams t ON t.id = p.team_id WHERE p.team_id = ${teamId}`;
  return r ? { slug: String(r.slug), podnik: String(r.podnik) } : null;
}

export async function rozpoznejKod(me: { id: number }, vstup: unknown): Promise<VysledekKodu> {
  const surovy = String(vstup ?? '').trim().slice(0, 60);
  const cisty = surovy.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cisty.length < 3) return { status: 400, body: { error: 'Napiš celý kód.' } };

  // 1. Promo kód (jedinečný napříč podniky).
  const [promo] = await sql`SELECT team_id FROM client_promos WHERE code = ${cisty} AND active = TRUE` as any[];
  if (promo) {
    const pod = await jmenoPodniku(Number(promo.team_id));
    const p = pod ? await profileBySlug(pod.slug) : null;
    if (!p || !p.loyalty_on) return { status: 404, body: { error: KOD_NEZNAME } };
    const r = await uplatniPromo(me, p, cisty);
    if (r.status !== 200) return r;
    return { status: 200, body: { typ: 'promo', ...r.body, slug: pod!.slug, podnik: pod!.podnik } };
  }

  // 2. Dárkový poukaz: platný kód (kontrolní znak) → podnik, kde existuje a je aktivní.
  const poukaz = overKod(surovy);
  if (poukaz) {
    const rows = await sql`SELECT team_id, balance, currency, valid_until FROM client_vouchers WHERE code = ${poukaz} AND status = 'active' AND balance > 0 LIMIT 2` as any[];
    if (rows.length === 1 && await prevezmiPoukaz(Number(rows[0].team_id), me.id, poukaz, pragueToday())) {
      const pod = await jmenoPodniku(Number(rows[0].team_id));
      return { status: 200, body: { typ: 'poukaz', slug: pod?.slug ?? null, podnik: pod?.podnik ?? '', balance: Number(rows[0].balance), currency: String(rows[0].currency ?? 'CZK'), validUntil: rows[0].valid_until ?? null } };
    }
  }

  // 3. Plastová karta podniku.
  if (vypadaJakoKarta(surovy)) {
    const r = await pripojKartu(me.id, surovy);
    if (r.ok) return { status: 200, body: { typ: 'karta', zprava: r.zprava, podnik: r.podnik } };
    if (r.status !== 404) return { status: r.status, body: { error: r.chyba } };
  }

  // 4. Kód podniku (adresa stránky).
  const p = await profileBySlug(surovy.toLowerCase());
  if (p && p.enabled !== false) {
    const pod = await jmenoPodniku(Number(p.team_id));
    if (pod) return { status: 200, body: { typ: 'podnik', ...pod } };
  }
  return { status: 404, body: { error: KOD_NEZNAME } };
}
