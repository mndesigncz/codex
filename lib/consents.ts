// Souhlasy hosta (GDPR čl. 7, zákon 480/2004 § 7): s novinkami KONKRÉTNÍHO podniku, ne „od podniků“
// obecně. Čisté, bez databáze a bez importů aplikace (testy: scripts/testy/k90-gdpr-souhlasy.ts);
// zápis a čtení jsou v lib/consentsDb.ts.
//
// Zásady:
//  * Tabulka `consents` se jen doplňuje: každé udělení i odvolání je nový řádek s časem, kanálem
//    (kde to host udělal) a verzí znění. Platí poslední řádek pro (uživatel, podnik, typ). Tak jde
//    kdykoli doložit, kdy a jak host souhlasil a kdy souhlas vzal zpět.
//  * `team_id` NULL = souhlas s platformou (podmínky, zásady, původní souhlas z registrace).
//  * Výchozí je NE: chybějící řádek znamená bez souhlasu.
//  * Dřívější jeden globální souhlas (`users.notif_prefs.novinky`) se jednorázově převede na
//    souhlas s podniky, kde je host členem, s kanálem „prevod“ (lib/consentsDb.ts, převodSouhlasu).

export const TYPY_SOUHLASU = ['novinky_email', 'novinky_push', 'podminky', 'zasady'] as const;
export type TypSouhlasu = typeof TYPY_SOUHLASU[number];

/** Kde host souhlas udělil nebo odvolal. */
export const KANALY_SOUHLASU = ['clenstvi', 'profil', 'odkaz_email', 'prevod', 'registrace', 'brana', 'podpora'] as const;
export type KanalSouhlasu = typeof KANALY_SOUHLASU[number];

export type StavSouhlasu = 'udelen' | 'odvolan';

/** Verze znění souhlasu s novinkami; s věcnou změnou textu níž ji zvednout. */
export const VERZE_ZNENI_NOVINEK = '2026-10-15';

/** Znění, se kterým host souhlasí (ukládá se k řádku, ať jde doložit, co přesně odsouhlasil). */
export function zneniNovinek(podnik: string, typ: 'novinky_email' | 'novinky_push'): string {
  const kanal = typ === 'novinky_email' ? 'e-mailem' : 'oznámením v aplikaci';
  return `Chci dostávat novinky a akce od podniku ${podnik.trim().slice(0, 80) || 'podnik'} ${kanal}. Souhlas mohu kdykoli odvolat v profilu nebo odkazem v e-mailu.`;
}

export const jeTypSouhlasu = (v: unknown): v is TypSouhlasu => typeof v === 'string' && (TYPY_SOUHLASU as readonly string[]).includes(v);
export const jeKanalSouhlasu = (v: unknown): v is KanalSouhlasu => typeof v === 'string' && (KANALY_SOUHLASU as readonly string[]).includes(v);

export interface RadekSouhlasu {
  id: number;
  team_id: number | null;
  typ: string;
  stav: string;
  created_at?: string | null;
}

/** Souhlas s novinkami jednoho podniku: oznámení a e-mail zvlášť. */
export interface SouhlasNovinek { push: boolean; email: boolean }

/** Klíč (podnik, typ) — podnik `null` = platforma. */
export const klicSouhlasu = (teamId: number | null, typ: string) => `${teamId ?? 'p'}:${typ}`;

/**
 * Z řádků (libovolné pořadí) vybere platný stav každé dvojice (podnik, typ): rozhoduje poslední řádek
 * podle id (id roste s časem zápisu; čas sám se může u dvou zápisů v téže milisekundě shodovat).
 */
export function aktualniSouhlasy(radky: readonly RadekSouhlasu[]): Map<string, RadekSouhlasu> {
  const out = new Map<string, RadekSouhlasu>();
  for (const r of radky) {
    const k = klicSouhlasu(r.team_id == null ? null : Number(r.team_id), r.typ);
    const p = out.get(k);
    if (!p || Number(r.id) > Number(p.id)) out.set(k, r);
  }
  return out;
}

/** Souhlas s novinkami daného podniku z platných řádků. Bez řádku NE. */
export function souhlasPodniku(aktualni: Map<string, RadekSouhlasu>, teamId: number): SouhlasNovinek {
  const je = (typ: TypSouhlasu) => aktualni.get(klicSouhlasu(teamId, typ))?.stav === 'udelen';
  return { push: je('novinky_push'), email: je('novinky_email') };
}

/** Má host aspoň jeden platný souhlas s novinkami (kterémukoli podniku)? Podle toho se drží globální příznak v notif_prefs. */
export function maNejakySouhlas(aktualni: Map<string, RadekSouhlasu>): boolean {
  for (const r of aktualni.values()) {
    if (r.team_id != null && (r.typ === 'novinky_push' || r.typ === 'novinky_email') && r.stav === 'udelen') return true;
  }
  return false;
}

export interface ZmenaSouhlasu { teamId: number; typ: 'novinky_push' | 'novinky_email'; stav: StavSouhlasu }

/**
 * Změna z přepínače v profilu → řádky k zápisu. E-mail bez oznámení nedává smysl jako „novinky“
 * (vypínač e-mailu je pod vypínačem novinek), proto vypnutí novinek odvolá i e-mail a zapnutí e-mailu
 * zapne i oznámení. Vrací jen řádky, které stav opravdu mění — opakované klepnutí nic nepřidá.
 */
export function radkyZmeny(z: ZmenaSouhlasu, dnes: SouhlasNovinek): ZmenaSouhlasu[] {
  const cil: SouhlasNovinek = { ...dnes };
  if (z.typ === 'novinky_push') { cil.push = z.stav === 'udelen'; if (!cil.push) cil.email = false; }
  else { cil.email = z.stav === 'udelen'; if (cil.email) cil.push = true; }
  const out: ZmenaSouhlasu[] = [];
  if (cil.push !== dnes.push) out.push({ teamId: z.teamId, typ: 'novinky_push', stav: cil.push ? 'udelen' : 'odvolan' });
  if (cil.email !== dnes.email) out.push({ teamId: z.teamId, typ: 'novinky_email', stav: cil.email ? 'udelen' : 'odvolan' });
  return out;
}

/** Tělo požadavku na změnu souhlasu: { teamId, typ: 'novinky_push'|'novinky_email', stav: boolean }. */
export function zmenaZTela(b: unknown): ZmenaSouhlasu | null {
  const x = (b ?? {}) as Record<string, unknown>;
  const teamId = Number(x.teamId);
  if (!Number.isInteger(teamId) || teamId <= 0) return null;
  if (x.typ !== 'novinky_push' && x.typ !== 'novinky_email') return null;
  if (typeof x.stav !== 'boolean') return null;
  return { teamId, typ: x.typ, stav: x.stav ? 'udelen' : 'odvolan' };
}

// ---- Obchodní sdělení (§ 7 zák. 480/2004) ------------------------------------------------

/** Odesílatel v e-mailu novinek: jméno podniku a IČO, pokud ho podnik vyplnil (8 číslic). */
export function odesilatelSdeleni(podnik: string, ico?: string | null): string {
  const jmeno = podnik.trim() || 'Podnik';
  const i = String(ico ?? '').replace(/\s+/g, '');
  return /^\d{8}$/.test(i) ? `${jmeno}, IČO ${i}` : jmeno;
}
