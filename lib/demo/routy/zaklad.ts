// Základ ukázky: relace, podnik, oprávnění, rozložení ploch, tarif, upozornění.
// Bez těchhle odpovědí se aplikace ani nevykreslí (SessionProvider, PlanProvider,
// CurrencyProvider a useOpravneni na ně čekají hned po startu).

import { chyba, ok, type Obsluha } from '../typy';
import { KATALOG_ROLI } from '../data/role';
import { ID_ORGANIZACE, ID_TYMU, KDO_JSEM, KOD_TYMU, LIDE, NAZEV_PODNIKU, clen } from '../data/lide';
import { OTEVIRACI_DOBA, type DemoStav } from '../stav';
import { KATALOG, OBLASTI } from '@/lib/opravneni';
import { KIOSK_BILA_LISTINA } from '@/lib/opravneni';
import { planInfoOf } from '@/lib/plan';
import { stranka as najdiStranku } from '@/lib/widgety/stranky';
import { tvarOdpovedi, vyresRozlozeni, zVychozich } from '@/lib/widgety/rozlozeni';
import type { Divak, PolozkaRozlozeni, RadekRozlozeni } from '@/lib/widgety/typy';
import { ROZLOZENI_DEMA } from '../data/rozlozeni';

const PLAN = planInfoOf({ plan: 'max', subscription_status: 'active', subscription_interval: 'month', had_subscription: true });

/** Role, za kterou je ukázka právě „přihlášená". */
export function mojeRole(stav: DemoStav) {
  const klic = stav.role === 'vedeni' ? 'vedeni' : stav.role === 'kiosk' ? 'kiosk' : 'barista';
  const r = KATALOG_ROLI.system.find(x => x.klic === klic)!;
  return {
    klic, roleId: null as number | null,
    nazev: klic === 'vedeni' ? 'Vlastník' : r.nazev,
    typ: r.typ as 'vedeni' | 'zamestnanec' | 'kiosk',
    jeVlastnik: klic === 'vedeni',
    opravneni: r.opravneni,
  };
}

export function divak(stav: DemoStav): Divak {
  const r = mojeRole(stav);
  const opr = new Set(r.opravneni);
  return {
    userId: KDO_JSEM[stav.role], typ: r.typ, klic: r.klic, roleId: null, zdrojRole: null,
    opravneni: opr, tarif: 'max',
    jeSpravce: opr.has('podnik.nastaveni') || (r.typ === 'kiosk' && opr.has('kiosk.spravovat')),
  };
}

/** Uživatel ve tvaru session (next-auth). */
export function uzivatelSession(stav: DemoStav) {
  const c = clen(KDO_JSEM[stav.role]);
  return {
    id: String(c.id), name: c.name, email: c.email, role: c.role, avatar: c.avatar,
    jobTitle: c.jobTitle, teamId: ID_TYMU, superadmin: false,
  };
}

function clenTymu(c: (typeof LIDE)[number]) {
  return {
    id: c.id, name: c.name, email: c.email, role: c.role, avatar: c.avatar, phone: c.phone,
    job_title: c.jobTitle, shift_preference: null, hourly_rate: c.hourlyRate,
    role_klic: c.roleKlic, role_id: null, role_nazev: c.roleNazev,
  };
}

const TYM = {
  id: ID_TYMU, name: NAZEV_PODNIKU, join_code: KOD_TYMU, owner_id: 1, week_start: 1, labor_target_pct: 30,
  low_stock_default: 5, critical_stock_default: 2, business_type: 'kavarna', pay_daily_cash: false,
  closing_requires_shift: true, show_team_schedule: true, payout_from_register: true, tips_in_drawer: false,
  drawer_float: null, dashboard_config: {}, levels_config: [], points_config: {}, currency: 'CZK', locale: 'cs-CZ',
};

export const zaklad: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, metoda } = p;

  // ---- Přihlášení: next-auth klient se ptá na relaci, CSRF a poskytovatele ----
  if (cesta === '/api/auth/session') {
    return ok({ user: uzivatelSession(s), expires: new Date(Date.now() + 24 * 3600 * 1000).toISOString() });
  }
  if (cesta.startsWith('/api/auth/')) {
    if (cesta === '/api/auth/csrf') return ok({ csrfToken: 'ukazka' });
    if (cesta === '/api/auth/providers') return ok({});
    return ok({ ok: true });
  }

  // ---- Podnik a oprávnění ----
  if (cesta === '/api/teams/mine') {
    const r = mojeRole(s);
    return ok({
      role: { klic: r.klic, roleId: r.roleId, nazev: r.nazev, typ: r.typ, jeVlastnik: r.jeVlastnik },
      opravneni: [...r.opravneni].sort(),
      activeTeamId: ID_TYMU,
      teams: [{ teamId: ID_TYMU, role: r.typ === 'vedeni' ? 'employer' : 'employee', teamName: NAZEV_PODNIKU, organizationId: null }],
      muzuZalozit: false,
      organization: null,
    });
  }
  if (cesta === '/api/teams' && metoda === 'GET') {
    const r = mojeRole(s);
    return ok({
      planInfo: PLAN, pinnedShare: null,
      // Join kód vidí jen ten, kdo smí zvát (server ho ostatním maže).
      team: { ...TYM, join_code: r.opravneni.includes('tym.pozvat') ? KOD_TYMU : null },
      members: LIDE.filter(l => l.role !== 'kiosk').map(clenTymu),
      isOwner: r.jeVlastnik,
      organizationId: ID_ORGANIZACE,
    });
  }
  if (cesta === '/api/teams' && metoda !== 'GET') return ok({ ok: true });
  if (cesta === '/api/teams/members') return ok({ members: LIDE.filter(l => l.role !== 'kiosk').map(clenTymu) });
  if (cesta === '/api/teams/switch') return ok({ ok: true });
  if (cesta === '/api/billing/status') {
    return ok({
      configured: true, plan: PLAN,
      prices: { pro: { month: 499, year: 3990, yearCompare: 4990 }, max: { month: 999, year: 7990, yearCompare: 9988 } },
      subscription: null,
      referral: { code: KOD_TYMU, link: '', thisMonth: 0, limit: 3, total: 0, referredCount: 0 },
    });
  }
  if (cesta.startsWith('/api/billing/')) return chyba('V ukázce se nic neplatí.', 400);
  if (cesta === '/api/account') return metoda === 'GET'
    ? ok({ id: KDO_JSEM[s.role], name: clen(KDO_JSEM[s.role]).name, email: clen(KDO_JSEM[s.role]).email, theme: 'light' })
    : ok({ ok: true });
  if (cesta === '/api/opening-hours') return metoda === 'GET' ? ok({ openingHours: OTEVIRACI_DOBA }) : ok({ ok: true, openingHours: OTEVIRACI_DOBA });
  if (cesta === '/api/notifications') {
    if (metoda === 'PATCH') { s.notifikace.forEach(n => { n.is_read = true; }); return ok(); }
    return ok({ notifications: s.notifikace, unread: s.notifikace.filter(n => !n.is_read).length });
  }
  if (cesta === '/api/push/subscribe' || cesta === '/api/init' || cesta === '/api/pos/tick') return ok({ ok: true });

  // ---- Role a oprávnění (Nastavení týmu) ----
  if (cesta === '/api/roles' && metoda === 'GET') {
    const r = mojeRole(s);
    const pocty: Record<string, number> = {};
    for (const l of LIDE) pocty[l.roleKlic] = (pocty[l.roleKlic] ?? 0) + 1;
    return ok({
      katalog: KATALOG, oblasti: OBLASTI, kioskPovoleno: [...KIOSK_BILA_LISTINA],
      system: KATALOG_ROLI.system.map(x => ({ ...x, pocet: pocty[x.klic] ?? 0, procZamceno: x.klic === 'vedeni' ? 'Systémová role vedení se nedá upravit.' : null })),
      upravyNedostupne: false,
      vlastni: [],
      vychozi: { id: null, klic: 'barista' },
      ja: { jeVlastnik: r.jeVlastnik, klic: r.klic, roleId: null, nazev: r.nazev, opravneni: [...r.opravneni].sort() },
    });
  }

  // ---- Rozložení ploch (widgety) ----
  if (cesta === '/api/rozlozeni' || cesta === '/api/rozlozeni/vychozi') {
    const def = najdiStranku(p.q.get('stranka'));
    if (!def) return chyba('Neznámá stránka.', 400);
    const d = divak(s);
    if (cesta === '/api/rozlozeni/vychozi') {
      // Výchozí podniku se v ukázce neupravují; odpověď jen ukáže, co platí.
      const v = vyresRozlozeni({ stranka: def, divak: d, osobni: null, vychozi: radkyVychozich(def.id, d.typ) });
      return ok({ ...tvarOdpovedi(def, d, v), rozsah: p.q.get('rozsah') ?? `typ:${d.typ}` });
    }
    const ulozene = s.rozlozeni?.[def.id] ?? null;
    if (metoda === 'PUT') {
      const telo = p.telo ?? {};
      if (!Array.isArray(telo.polozky)) return chyba('Chybí seznam widgetů.', 400);
      const verze = ((ulozene?.verze) ?? 0) + 1;
      (s.rozlozeni ??= {})[def.id] = { polozky: telo.polozky as PolozkaRozlozeni[], verze };
      const v = vyresRozlozeni({ stranka: def, divak: d, osobni: radekOsobni(s, def.id, d.userId), vychozi: radkyVychozich(def.id, d.typ) });
      return ok({ ok: true, polozky: v.polozky, verze });
    }
    if (metoda === 'DELETE') {
      if (s.rozlozeni) delete s.rozlozeni[def.id];
    }
    const v = vyresRozlozeni({ stranka: def, divak: d, osobni: radekOsobni(s, def.id, d.userId), vychozi: radkyVychozich(def.id, d.typ) });
    return ok(metoda === 'DELETE' ? { ok: true, ...tvarOdpovedi(def, d, v) } : tvarOdpovedi(def, d, v));
  }

  // ---- Pokladna ----
  if (cesta === '/api/pos/summary') return ok(posSouhrn());
  if (cesta === '/api/pos/status') return ok({ connected: true, placeName: NAZEV_PODNIKU, lastSyncAt: new Date().toISOString(), lastError: null, billsCount: 4210, itemsPending: 0 });

  return undefined;
};

/** Údaje z pokladny „za dnešek" — souhrn pro widget Pokladna a předvyplnění uzávěrky. */
export function posSouhrn() {
  return { connected: true, placeName: NAZEV_PODNIKU, bills: 58, total: 16480, cash: 5950, card: 10230, other: 300, tips: 640 };
}

function radkyVychozich(id: string, typ: 'vedeni' | 'zamestnanec' | 'kiosk'): RadekRozlozeni[] {
  const polozky = ROZLOZENI_DEMA[id];
  if (!polozky) return [];
  return [{ rozsah: `typ:${typ}`, polozky: zVychozich(polozky), zamceno: false, verze: 1 }];
}

function radekOsobni(s: DemoStav, id: string, userId: number): RadekRozlozeni | null {
  const r = s.rozlozeni?.[id];
  return r ? { rozsah: `osobni:${userId}`, polozky: r.polozky, zamceno: false, verze: r.verze } : null;
}
