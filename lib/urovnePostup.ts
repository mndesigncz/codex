// Oznámení hostovi, že postoupil na vyšší úroveň.
//
// Úroveň se počítá z návštěv nebo z útraty (lib/clientSlots.ts). Host se o postupu dřív
// dozvěděl, až když si otevřel svou stránku; teď mu přijde oznámení hned, jak ho návštěva
// nebo útrata přes práh přenese. Čistá část (pořadí úrovní, text) jde testovat bez databáze,
// databáze se načítá až uvnitř funkce, ať se moduly nezacyklí (lib/client ↔ tenhle soubor).

import { tierForMember, tierRulesFromProfile, type Tier, type TierId } from './clientSlots.ts';

const PORADI: Record<TierId, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3 };

/** Je `po` vyšší úroveň než `pred`? Snížení ani stejná úroveň oznámení nespouští. */
export function jePostup(pred: TierId, po: TierId): boolean {
  return PORADI[po] > PORADI[pred];
}

/** Text oznámení. Slevu zmiňuje jen tehdy, když ji úroveň opravdu dává. */
export function textPostupu(tier: Pick<Tier, 'label' | 'discount'>, podnik: string): { title: string; body: string } {
  const sleva = Number(tier.discount) > 0 ? ` Máš slevu ${Math.round(Number(tier.discount))} %.` : '';
  return {
    title: `Nová úroveň: ${tier.label}`,
    body: `V podniku ${podnik || 'tvém oblíbeném podniku'} ses posunul(a) výš.${sleva}`,
  };
}

/**
 * Po návštěvě (`navstev`) nebo útratě (`utrata`) porovná úroveň před a po a při postupu
 * pošle oznámení. Volá se až PO zápisu, takže „před" je stav bez právě přičtené změny.
 * Snížení po neaktivitě se nepočítá (návrat z ní není postup). Nikdy nevyhazuje chybu.
 */
export async function oznamPostupUrovne(teamId: number, customerId: number, zmena: { navstev?: number; utrata?: number }): Promise<boolean> {
  try {
    const { sql, ensureProfile } = await import('./client');
    const { notifyUser } = await import('./push');
    const p = await ensureProfile(teamId);
    if (!p?.loyalty_on) return false;
    const [m] = await sql`
      SELECT visits, COALESCE((to_jsonb(m)->>'spend')::int, 0) AS spend
      FROM client_memberships m WHERE customer_id = ${customerId} AND team_id = ${teamId}` as any[];
    if (!m) return false;
    const pravidla = { ...tierRulesFromProfile(p), inactiveMonths: 0 };
    const po = tierForMember({ visits: Number(m.visits), spend: Number(m.spend) }, pravidla);
    const pred = tierForMember({
      visits: Math.max(0, Number(m.visits) - (Number(zmena.navstev) || 0)),
      spend: Math.max(0, Number(m.spend) - (Number(zmena.utrata) || 0)),
    }, pravidla);
    if (!jePostup(pred.id, po.id)) return false;
    const [t] = await sql`SELECT name FROM teams WHERE id = ${teamId}` as any[];
    const text = textPostupu(po, String(t?.name ?? ''));
    await notifyUser(customerId, { title: text.title, body: text.body, link: p.slug ? `/client/${p.slug}` : '/client/me', type: 'success' });
    return true;
  } catch {
    return false;
  }
}
