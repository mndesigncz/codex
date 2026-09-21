// Rozhodnutí o pozastaveném podniku — čisté, bez prohlížeče, bez databáze.
//
// Middleware je tenké lepidlo kolem tohohle: přečte token, stáhne seznam
// blokovaných a zavolá `rozhodni`. Všechno, co se dá splést (výjimky,
// správce, API vs. stránka), je tady a má testy.
//
// Proč se blokuje tady a ne v každé routě: aplikace má 99 rout s vlastním
// `ctx()`. Přidat kontrolu do každé je 99 míst, kde se dá zapomenout.

export type Rozhodnuti =
  | { akce: 'pustit' }
  | { akce: 'api'; status: 423 }
  | { akce: 'presmerovat'; kam: string };

/** Cesty, které pozastavení NESMÍ zastavit. */
export const VYJIMKY = [
  '/api/auth',        // odhlášení musí jít vždycky
  '/api/admin',       // správce sám
  '/api/mcp',
  '/api/init',        // migrace
  '/api/register',
  '/api/billing/webhook', // Stripe nemá session, ale ať je to napsané
  '/pozastaveno',     // stránka, kam se přesměrovává
];

export function rozhodni(vstup: {
  pathname: string;
  teamId: number | null | undefined;
  blokovane: ReadonlySet<number>;
  superadmin: boolean;
}): Rozhodnuti {
  const { pathname, teamId, blokovane, superadmin } = vstup;
  if (VYJIMKY.some(v => pathname === v || pathname.startsWith(v + '/') || pathname.startsWith(v))) return { akce: 'pustit' };
  // Správce platformy nikdy nesmí zablokovat sám sebe.
  if (superadmin) return { akce: 'pustit' };
  if (teamId == null || !Number.isFinite(teamId)) return { akce: 'pustit' };
  if (!blokovane.has(teamId)) return { akce: 'pustit' };
  if (pathname.startsWith('/api/')) return { akce: 'api', status: 423 };
  return { akce: 'presmerovat', kam: '/pozastaveno' };
}

export const ZPRAVA_423 = 'Podnik je pozastavený správcem platformy.';
