// Karta hosta pro peněženky z databáze: spojí profil podniku, členství a kartu.
// Čistá sestava dat je v lib/walletKarta.ts, tady je jen čtení a odeslání změny.

import { sql, ensureCard, membership, profileBySlug, publicProfile } from './client';
import { tierForMember, tierRulesFromProfile } from './clientSlots';
import { cistyJazyk, VYCHOZI, type Jazyk } from './i18n/config';
import { bezpecnaBarva, VYCHOZI_BARVA, type DataKarty } from './walletKarta';
import { googleKonfig } from './walletKonfig';
import { aktualizujGoogleObjekt } from './walletGoogle';
import { pragueToday } from './pragueTime';

/** Jazyk hosta: osobní volba (users.lang), jinak ten, co dodá volající (jazyk požadavku). Před migrací sloupce výchozí. */
async function jazykHosta(customerId: number, nahradni: Jazyk): Promise<Jazyk> {
  try {
    const [u] = await sql`SELECT lang FROM users WHERE id = ${customerId}`;
    return cistyJazyk(u?.lang) ?? nahradni;
  } catch {
    return nahradni;
  }
}

/**
 * Data karty hosta v jednom podniku (podle veřejné adresy). Jen vlastní karta: podnik
 * musí být zapnutý a host jeho členem, jinak null (cizí ani neexistující se nerozliší).
 */
export async function dataKartyHosta(me: { id: number; name: string }, slug: string, origin: string, jazykNahradni: Jazyk = VYCHOZI): Promise<DataKarty | null> {
  const p = await profileBySlug(slug);
  if (!p) return null;
  const m = await membership(me.id, Number(p.team_id));
  if (!m) return null;
  const pub = publicProfile(p);
  const tier = tierForMember({ visits: Number(m.visits ?? 0), spend: Number(m.spend ?? 0) }, tierRulesFromProfile(p));
  const logo = pub.logoUrl && /^https:\/\//.test(pub.logoUrl) ? pub.logoUrl : '';
  // Razítka: jakmile podnik má kampaně, počítadlo na členství neplatí (jediný zdroj pravdy jsou kampaně).
  // Na kartě je rozdělaná kampaň, případně první běžící.
  let razitka = Number(m.stamps ?? 0);
  let razitkaCil = Number(p.stamp_target) || 0;
  try {
    const { maKampane, activeCampaigns, progressFor } = await import('./stamps');
    if (await maKampane(Number(p.team_id))) {
      razitka = 0; razitkaCil = 0;
      const camps = await activeCampaigns(Number(p.team_id), pragueToday());
      if (camps.length) {
        const prog = await progressFor(Number(p.team_id), me.id);
        const c = camps.find(x => Number(prog.get(x.id)?.stamps ?? 0) > 0) ?? camps[0];
        razitka = Number(prog.get(c.id)?.stamps ?? 0); razitkaCil = c.required_stamps;
      }
    }
  } catch { /* zůstane počítadlo z členství */ }
  return {
    podnik: pub.name,
    host: me.name,
    kod: await ensureCard(me.id),
    teamId: Number(p.team_id),
    body: Number(m.points ?? 0),
    razitka,
    razitkaCil,
    uroven: tier.id === 'bronze' ? '' : tier.label,
    barva: bezpecnaBarva(pub.accent, VYCHOZI_BARVA),
    logoUrl: logo || (origin ? `${origin}/icon-512.png` : ''),
    odkaz: origin ? `${origin}/client/${pub.slug}` : '',
    jazyk: await jazykHosta(me.id, jazykNahradni),
  };
}

/**
 * Po změně bodů nebo razítek přepíše kartu v Google Wallet (PATCH). Bez konfigurace
 * se nic nedělá, a chyba nikdy nevyleze ven: věrnostní operace nesmí padat kvůli peněžence.
 * Apple Wallet se takhle obnovit nedá (viz lib/walletApple.ts).
 */
export async function obnovKartuVPenezence(teamId: number, customerId: number): Promise<void> {
  const cfg = googleKonfig();
  if (!cfg) return;
  try {
    const [row] = await sql`SELECT p.slug FROM client_profiles p WHERE p.team_id = ${teamId}`;
    const [u] = await sql`SELECT id, name FROM users WHERE id = ${customerId}`;
    if (!row?.slug || !u) return;
    const base = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const d = await dataKartyHosta({ id: Number(u.id), name: String(u.name) }, String(row.slug), base);
    if (d) await aktualizujGoogleObjekt(cfg, d);
  } catch {
    /* peněženka je navíc */
  }
}
