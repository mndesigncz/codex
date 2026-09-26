// Rozložení stránek — databázová část (kolo 68, spec §1.2 a §1.6). Jen pro server.
//
// SQL a převod řádků tabulky rozlozeni_stranek; logika (co platí, co je
// vidět, co se smí zapsat) je v rozlozeni.ts a má testy. Podnik se bere
// vždycky z kontextu pozaduj() — tedy z databáze, nikdy z těla požadavku.

import { neon } from '@neondatabase/serverless';
import type { Kontext, VlastniRole } from '../opravneniDb.ts';
import { pocetyRoli, vlastniRole } from '../opravneniDb.ts';
import { SYSTEMOVE_ROLE } from '../opravneni.ts';
import { PLAN_ENFORCED } from '../plan.ts';
import { teamPlanInfo } from '../planServer.ts';
import type { DefiniceStranky, Divak, OdpovedRozlozeni, OdpovedVychozi, PolozkaRozlozeni, RadekRozlozeni, Rozhrani, Rozsah, RozsahVolba, Tarif, VyreseneRozlozeni } from './typy.ts';
import { KATALOG_WIDGETU } from './katalog/index.ts';
import { jeSpravceStranky, normalizujRozlozeni, rozeberRozsah, tvarOdpovedi, vychoziZKodu, vyresRozlozeni, zVychozich } from './rozlozeni.ts';

const sql = neon(process.env.DATABASE_URL!);

/** Stránky, pro které ještě může platit starý teams.dashboard_config (spec §1.3, krok 5). */
const STRANKY_Z_DASHBOARD_CONFIG = new Set(['vedeni.prehled', 'zamestnanec.domu']);

/** Tabulka rozlozeni_stranek ještě není — /api/init po nasazení neproběhl (Postgres 42P01). */
export const jePredMigraci = (e: unknown): boolean => (e as { code?: unknown } | null)?.code === '42P01';

function naRadek(r: any): RadekRozlozeni {
  let polozky: unknown = r.polozky;
  if (typeof polozky === 'string') { try { polozky = JSON.parse(polozky); } catch { polozky = []; } }
  const cas = r.updated_at ? new Date(r.updated_at) : null;
  return {
    rozsah: String(r.rozsah),
    polozky,
    zamceno: r.zamceno === true,
    verze: Number(r.verze) || 1,
    zdroj: r.zdroj ?? null,
    upravil: r.upravil != null ? Number(r.upravil) : null,
    upraveno: cas && Number.isFinite(cas.getTime()) ? cas.toISOString() : null,
  };
}

export interface RadkyStranky {
  osobni: RadekRozlozeni | null;
  vychozi: RadekRozlozeni[];
  /** Tabulka ještě neexistuje: počítá se jen z configu a z kódu, zápis nejde. */
  predMigraci: boolean;
}

/**
 * Řádky jedné stránky: osobní řádek diváka a všechna výchozí podniku.
 * Při chybě databáze (mimo stav před migrací) vyhodí — routa vrátí 503.
 */
export async function nactiRadky(teamId: number, stranka: string, userId: number | null): Promise<RadkyStranky> {
  try {
    const osobniRozsah = `osobni:${userId ?? 0}`;
    const rows = await sql`
      SELECT rozsah, polozky, zamceno, verze, zdroj, upravil, updated_at
      FROM rozlozeni_stranek
      WHERE team_id = ${teamId} AND stranka = ${stranka} AND (rozsah = ${osobniRozsah} OR rozsah NOT LIKE 'osobni:%')` as any[];
    const radky = rows.map(naRadek);
    return {
      osobni: radky.find(r => r.rozsah === osobniRozsah) ?? null,
      vychozi: radky.filter(r => !r.rozsah.startsWith('osobni:')),
      predMigraci: false,
    };
  } catch (e) {
    if (jePredMigraci(e)) return { osobni: null, vychozi: [], predMigraci: true };
    throw e;
  }
}

/** Starý config podniku; když ho nejde přečíst, platí výchozí z kódu (config je jen přechodný záchyt). */
async function nactiDashboardConfig(teamId: number): Promise<unknown> {
  try {
    const [t] = await sql`SELECT dashboard_config FROM teams WHERE id = ${teamId}`;
    return t?.dashboard_config ?? null;
  } catch { return null; }
}

/** Tarif podniku jako tarif widgetů. Bez vynucování tarifů má každý všechno. */
export async function tarifPodniku(teamId: number): Promise<Tarif> {
  if (!PLAN_ENFORCED) return 'max';
  const e = (await teamPlanInfo(teamId)).effective;
  return e === 'max' ? 'max' : e === 'pro' ? 'pro' : 'zdarma';
}

/** roles.zdroj vlastní role — systémová role, ze které se zkopírovala (výchozí z kódu pro roli). */
async function zdrojVlastniRole(teamId: number, roleId: number | null): Promise<string | null> {
  if (roleId == null) return null;
  try {
    const [r] = await sql`SELECT zdroj FROM roles WHERE id = ${roleId} AND team_id = ${teamId}`;
    return typeof r?.zdroj === 'string' && r.zdroj ? r.zdroj : null;
  } catch { return null; }
}

/** Divák z kontextu brány pozaduj(). */
export async function divakZKontextu(c: Kontext, stranka: Pick<DefiniceStranky, 'rozhrani'>): Promise<Divak> {
  const [tarif, zdrojRole] = await Promise.all([tarifPodniku(c.teamId), zdrojVlastniRole(c.teamId, c.role.roleId)]);
  return {
    userId: c.meId,
    typ: c.role.typ,
    klic: c.role.klic,
    roleId: c.role.roleId,
    zdrojRole,
    opravneni: c.role.opravneni,
    tarif,
    jeSpravce: jeSpravceStranky(c.role.opravneni, stranka),
  };
}

export interface StavRozlozeni {
  divak: Divak;
  vysledek: VyreseneRozlozeni;
  predMigraci: boolean;
}

/** Co divák na stránce vidí (spec §1.3). Chyba databáze vyhodí. */
export async function spocitejRozlozeni(c: Kontext, stranka: DefiniceStranky): Promise<StavRozlozeni> {
  const [divak, radky, dashboardConfig] = await Promise.all([
    divakZKontextu(c, stranka),
    nactiRadky(c.teamId, stranka.id, c.meId),
    STRANKY_Z_DASHBOARD_CONFIG.has(stranka.id) ? nactiDashboardConfig(c.teamId) : Promise.resolve(null),
  ]);
  const vysledek = vyresRozlozeni({ stranka, divak, osobni: radky.osobni, vychozi: radky.vychozi, dashboardConfig });
  return { divak, vysledek, predMigraci: radky.predMigraci };
}

/** Tvar GET /api/rozlozeni pro diváka (i `aktualni` u 409 a odpověď DELETE). */
export async function odpovedRozlozeni(c: Kontext, stranka: DefiniceStranky): Promise<OdpovedRozlozeni> {
  const { divak, vysledek } = await spocitejRozlozeni(c, stranka);
  return tvarOdpovedi(stranka, divak, vysledek);
}

/**
 * Zápis s kontrolou verze (spec §1.2): `verze` je ta, kterou klient viděl
 * (0 = řádek ještě není). Vrátí novou verzi, nebo null, když se mezitím
 * změnila jinde — pak routa vrátí 409 a aktuální stav.
 */
export async function zapisRadek(a: {
  teamId: number; stranka: string; rozsah: Rozsah; userId: number | null;
  polozky: PolozkaRozlozeni[]; zamceno: boolean; verze: number; meId: number;
}): Promise<number | null> {
  const json = JSON.stringify(a.polozky);
  const rows = await sql`
    INSERT INTO rozlozeni_stranek (team_id, stranka, rozsah, user_id, polozky, zamceno, verze, upravil, updated_at)
    VALUES (${a.teamId}, ${a.stranka}, ${a.rozsah}, ${a.userId}, ${json}::jsonb, ${a.zamceno}, 1, ${a.meId}, NOW())
    ON CONFLICT (team_id, stranka, rozsah) DO UPDATE
      SET polozky = EXCLUDED.polozky, zamceno = EXCLUDED.zamceno, upravil = EXCLUDED.upravil,
          verze = rozlozeni_stranek.verze + 1, updated_at = NOW()
      WHERE rozlozeni_stranek.verze = ${a.verze}
    RETURNING verze` as any[];
  return rows.length ? Number(rows[0].verze) : null;
}

/** Smaže řádek (obnovit výchozí). Vrátí, jestli nějaký byl. */
export async function smazRadek(teamId: number, stranka: string, rozsah: Rozsah): Promise<boolean> {
  const rows = await sql`
    DELETE FROM rozlozeni_stranek WHERE team_id = ${teamId} AND stranka = ${stranka} AND rozsah = ${rozsah}
    RETURNING id` as any[];
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Výchozí rozložení podniku (Nastavení → Stránky, „Uložit jako výchozí")
// ---------------------------------------------------------------------------

const NAZEV_TYPU: Record<Rozhrani, string> = { vedeni: 'Celé vedení', zamestnanec: 'Všichni zaměstnanci', kiosk: 'Všechny tablety' };

/**
 * Rozsah výchozího pro stránku: `typ:<rozhraní stránky>`, nebo role téhož
 * typu (systémová podle klíče, vlastní podle id v tomhle podniku). Bez
 * rozsahu v dotazu platí typ rozhraní stránky. Jiný rozsah → null.
 */
export async function overRozsah(teamId: number, stranka: DefiniceStranky, raw: string | null): Promise<{ rozsah: Rozsah; vlastni: VlastniRole[] } | null> {
  const vlastni = await vlastniRole(teamId);
  const r = rozeberRozsah(raw == null || raw === '' ? `typ:${stranka.rozhrani}` : raw);
  if (!r) return null;
  if (r.druh === 'typ') return r.typ === stranka.rozhrani ? { rozsah: `typ:${r.typ}`, vlastni } : null;
  if (r.druh === 'role') return SYSTEMOVE_ROLE.some(s => s.klic === r.klic && s.typ === stranka.rozhrani) ? { rozsah: `role:${r.klic}`, vlastni } : null;
  if (r.druh === 'vlastni') return vlastni.some(v => v.id === r.roleId && v.typ === stranka.rozhrani) ? { rozsah: `role:#${r.roleId}`, vlastni } : null;
  return null;
}

/** Volby „Pro koho" s počtem lidí (pocetyRoli nepočítá vlastníka podniku). */
async function volbyRozsahu(teamId: number, stranka: DefiniceStranky, vlastni: VlastniRole[]): Promise<RozsahVolba[]> {
  const pocty = await pocetyRoli(teamId);
  const sys = SYSTEMOVE_ROLE.filter(r => r.typ === stranka.rozhrani);
  const vl = vlastni.filter(r => r.typ === stranka.rozhrani);
  const celkem = sys.reduce((n, r) => n + (pocty.system[r.klic] ?? 0), 0) + vl.reduce((n, r) => n + (pocty.vlastni[r.id] ?? 0), 0);
  return [
    { id: `typ:${stranka.rozhrani}`, nazev: NAZEV_TYPU[stranka.rozhrani], clenu: celkem },
    ...sys.map((r): RozsahVolba => ({ id: `role:${r.klic}`, nazev: r.nazev, clenu: pocty.system[r.klic] ?? 0 })),
    ...vl.map((r): RozsahVolba => ({ id: `role:#${r.id}`, nazev: r.nazev, clenu: pocty.vlastni[r.id] ?? 0 })),
  ];
}

/**
 * Výchozí z kódu pro rozsah — přesně to, co by lidé s tou rolí viděli bez
 * výchozího podniku (i s pravidlem tří), jen bez filtru na konkrétního diváka.
 */
function kodProRozsah(stranka: DefiniceStranky, rozsah: Rozsah, vlastni: VlastniRole[], tarif: Tarif): PolozkaRozlozeni[] {
  const r = rozeberRozsah(rozsah);
  if (r?.druh === 'role') {
    const sys = SYSTEMOVE_ROLE.find(s => s.klic === r.klic);
    return vychoziZKodu(stranka, { typ: stranka.rozhrani, klic: r.klic, zdrojRole: null, opravneni: new Set(sys?.opravneni ?? []), tarif });
  }
  if (r?.druh === 'vlastni') {
    const role = vlastni.find(v => v.id === r.roleId);
    return vychoziZKodu(stranka, { typ: stranka.rozhrani, klic: null, zdrojRole: role?.zdroj ?? null, opravneni: new Set(role?.opravneni ?? []), tarif });
  }
  return normalizujRozlozeni(stranka, zVychozich(stranka.vychozi[`typ:${stranka.rozhrani}`] ?? []));
}

/** Položky výchozího rozsahu: uložený řádek (normalizovaný), bez něj výchozí z kódu pro rozsah. */
function polozkyVychoziho(stranka: DefiniceStranky, rozsah: Rozsah, radek: RadekRozlozeni | null, vlastni: VlastniRole[], tarif: Tarif): PolozkaRozlozeni[] {
  return radek ? normalizujRozlozeni(stranka, radek.polozky) : kodProRozsah(stranka, rozsah, vlastni, tarif);
}

/**
 * Podklad pro zápis výchozího (slozZapisVychoziho): kdo zapisuje (jeho
 * viditelnost) a co teď v rozsahu je — základ pro zachovejSkryte.
 * Chyba databáze vyhodí.
 */
export async function stavZapisuVychoziho(c: Kontext, stranka: DefiniceStranky, rozsah: Rozsah, vlastni: VlastniRole[]): Promise<{ spravce: Divak; ulozene: PolozkaRozlozeni[] }> {
  const [spravce, radky] = await Promise.all([divakZKontextu(c, stranka), nactiRadky(c.teamId, stranka.id, null)]);
  const radek = radky.vychozi.find(r => r.rozsah === rozsah) ?? null;
  return { spravce, ulozene: polozkyVychoziho(stranka, rozsah, radek, vlastni, spravce.tarif) };
}

/** Tvar GET /api/rozlozeni/vychozi — NEfiltrované položky (jen bez neznámých a plánovaných). */
export async function odpovedVychozi(teamId: number, stranka: DefiniceStranky, rozsah: Rozsah, vlastni: VlastniRole[]): Promise<OdpovedVychozi> {
  const [radky, rozsahy, tarif] = await Promise.all([
    nactiRadky(teamId, stranka.id, null),
    volbyRozsahu(teamId, stranka, vlastni),
    tarifPodniku(teamId),
  ]);
  const radek = radky.vychozi.find(r => r.rozsah === rozsah) ?? null;
  return {
    stranka: stranka.id,
    rozsah,
    polozky: polozkyVychoziho(stranka, rozsah, radek, vlastni, tarif),
    zamceno: radek?.zamceno ?? false,
    verze: radek?.verze ?? 0,
    zdroj: radek ? 'podnik' : 'aplikace',
    rozsahy,
    dostupne: KATALOG_WIDGETU.filter(w => w.stav === 'hotovo' && w.rozhrani.includes(stranka.rozhrani)).map(w => w.id),
    upraveno: radek?.upraveno ?? null,
  };
}
