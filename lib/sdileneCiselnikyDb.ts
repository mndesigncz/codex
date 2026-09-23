// Sdílené číselníky — databázová část (kolo 60). Čistá logika je vedle
// v lib/sdileneCiselniky.ts, stejná dvojice jako navody.ts / navodyDb.ts.
//
// Sdílení samo je jen ve čtení a nic tady nepotřebuje. Řádky se hýbou jen ve
// dvou chvílích, obě z PATCH /api/organization po kontrole vlastníka:
//
//   VYPNUTÍ (zdroj číselníku mizí nebo se mění): podnik, který na řádky
//   zdroje ukazuje id-čkem, dostane jejich KOPIE s `origin_id` a odkazy se
//   přepojí — položkám nesmí zmizet kategorie zpod nohou. Dodavatelé
//   a odměny se nekopírují: vazby jsou text, resp. denormalizované.
//
//   ZAPNUTÍ (zdroj se vrací): kopie s `origin_id` v řádcích nového zdroje se
//   sloučí zpět — odkazy se přepojí na originál a kopie se smaže. Zdroj je
//   master, lokální úpravy kopie propadnou; hint u nastavení to říká.
//
// Každý podnik běží ve vlastním try (jako cyklus v přehledu organizace):
// chyba u jednoho nezastaví ostatní ani uložení nastavení, ale vrací se
// v odpovědi, ať UI neřekne „Uloženo" nad rozbitým podnikem. Nikdy se
// nesahá na řádky zdroje; zápisy jdou vždy jen `WHERE team_id = B`.

import { neon } from '@neondatabase/serverless';
import { CISELNIKY, type Ciselnik } from './organizace';
import { kategorieKeKopirovani, premapujRodice } from './sdileneCiselniky';
import { MAX_DEPTH } from './categoryTree';
import { audit } from './audit';
import { czCount, type CzNoun } from './czech';

const sql = neon(process.env.DATABASE_URL!);

/** Výsledek za jeden podnik a číselník — jde do odpovědi PATCH i do auditu. */
export interface VysledekKopie {
  teamId: number;
  ciselnik: Ciselnik;
  /** 'kopie' při vypnutí, 'slouceni' při zapnutí — UI to říká jinou větou. */
  akce: 'kopie' | 'slouceni';
  ok: boolean;
  pocet: number;
}

const RADEK: CzNoun = { one: 'řádek', few: 'řádky', many: 'řádků' };

/** Číselníky, které mají vazby po id, a proto se kopírují; ostatní se jen přestanou číst (příznak drží CISELNIKY, ať UI říká totéž). */
const S_KOPII: Ciselnik[] = CISELNIKY.filter(c => c.kopie).map(c => c.klic);

const nazevCiselniku = (c: Ciselnik) => CISELNIKY.find(x => x.klic === c)?.nazev ?? c;
const ids = (rows: any[], klic = 'id') => rows.map(r => Number(r[klic])).filter(n => Number.isFinite(n));

/**
 * Kořenový originál: kopie kopie nese origin_id ORIGINÁLU, ne prostřední
 * kopie. Bez toho po změně zdroje A → C → A zůstal v podniku trvalý
 * duplikát s origin_id ukazujícím na kopii v C, která mezitím zanikla.
 */
const koren = (r: any) => (r.origin_id != null ? Number(r.origin_id) : Number(r.id));

/**
 * Veřejné sdílené odkazy podniku ukazují na kategorie po id (category_id,
 * excluded[]). Po kopii i sloučení musí ukazovat na nové řádky — jinak by se
 * skryté položky objevily na veřejné stránce a odkaz na kategorii zůstal prázdný.
 */
async function prepojOdkazy(teamId: number, mapa: Map<number, number>): Promise<void> {
  if (!mapa.size) return;
  let rows: any[] = [];
  try { rows = await sql`SELECT id, category_id, excluded FROM share_links WHERE team_id = ${teamId}`; } catch { return; }
  for (const r of rows) {
    const cat = r.category_id != null ? Number(r.category_id) : null;
    const novaCat = cat != null ? (mapa.get(cat) ?? cat) : null;
    const ex: number[] = Array.isArray(r.excluded) ? r.excluded.map(Number).filter(Number.isFinite) : [];
    const noveEx = ex.map(id => mapa.get(id) ?? id);
    if (novaCat === cat && noveEx.every((v, i) => v === ex[i])) continue;
    await sql`UPDATE share_links SET category_id = ${novaCat}, excluded = ${JSON.stringify(noveEx)}::jsonb
              WHERE id = ${r.id} AND team_id = ${teamId}`;
  }
}

/**
 * Měsíční preference „jen tenhle typ" ('type:<id>') podniku — po kopii
 * i sloučení ukazují na nový řádek. Neexistující id by v generátoru
 * zablokovalo každý slot a člověk by v ty dny nebyl naplánován.
 */
async function prepojPreference(teamId: number, mapa: Map<number, number>): Promise<void> {
  if (!mapa.size) return;
  let rows: any[] = [];
  try {
    rows = await sql`SELECT id, day_preferences FROM availability_requests
                     WHERE team_id = ${teamId} AND day_preferences::text LIKE '%type:%'`;
  } catch { return; }
  for (const r of rows) {
    if (!r.day_preferences || typeof r.day_preferences !== 'object') continue;
    const p: Record<string, string> = { ...r.day_preferences };
    let zmena = false;
    for (const [k, v] of Object.entries(p)) {
      const m = /^type:(\d+)$/.exec(String(v));
      const nove = m ? mapa.get(Number(m[1])) : undefined;
      if (nove != null) { p[k] = `type:${nove}`; zmena = true; }
    }
    if (zmena) await sql`UPDATE availability_requests SET day_preferences = ${JSON.stringify(p)}::jsonb WHERE id = ${r.id} AND team_id = ${teamId}`;
  }
}

/**
 * Vlastní podkategorie pod kopií, která se při sloučení maže, se stane
 * kořenem — a přišla by o balení děděné po řetězci (packagingSourceOf bere
 * nejbližšího předka s tracks_open). Než se rodič zahodí, dostane si
 * efektivní balení sama; vlastní nastavení se nepřepisuje.
 */
async function zdedBaleniPredOsirenim(teamId: number, kopie: number[]): Promise<void> {
  const rows = await sql`
    SELECT id, parent_id, tracks_open, content_unit, default_package_size, scale, threshold_unit, defaults
    FROM inventory_categories WHERE team_id = ${teamId}` as any[];
  const podle = new Map<number, any>(rows.map(r => [Number(r.id), r]));
  const mizi = new Set(kopie);
  for (const r of rows) {
    if (mizi.has(Number(r.id)) || r.parent_id == null || !mizi.has(Number(r.parent_id)) || r.tracks_open === true) continue;
    let p = podle.get(Number(r.parent_id)); let hloubka = 0;
    while (p && p.tracks_open !== true && p.parent_id != null && hloubka++ < MAX_DEPTH) p = podle.get(Number(p.parent_id));
    if (!p || p.tracks_open !== true) continue;
    await sql`
      UPDATE inventory_categories
      SET tracks_open = TRUE, content_unit = ${p.content_unit ?? null}, default_package_size = ${p.default_package_size ?? null},
          scale = ${p.scale != null ? JSON.stringify(p.scale) : null}::jsonb, threshold_unit = ${p.threshold_unit ?? null},
          defaults = COALESCE(defaults, ${p.defaults != null ? JSON.stringify(p.defaults) : null}::jsonb)
      WHERE id = ${r.id} AND team_id = ${teamId}`;
  }
}

// ---------------------------------------------------------------------------
// Kopie při vypnutí
// ---------------------------------------------------------------------------

/**
 * Kategorie skladu: použité kategorie zdroje + jejich předky (balení
 * a předvyplnění se dědí po řetězci), rodič před dítětem, ať se parent_id
 * přemapuje v jednom průchodu. Kopie, která už existuje (přerušený předchozí
 * běh), se znovu použije místo druhé „Sirupy" — díky tomu je běh opakovatelný.
 */
async function zkopirujKategorieSkladu(zdroj: number, teamId: number): Promise<number> {
  const pouzite = ids(await sql`
    SELECT DISTINCT i.category_id AS id FROM inventory_items i
    JOIN inventory_categories c ON c.id = i.category_id
    WHERE i.team_id = ${teamId} AND c.team_id = ${zdroj}`);
  if (!pouzite.length) return 0;
  const strom = await sql`
    SELECT id, origin_id, parent_id, name, position, tracks_open, content_unit, default_package_size,
           scale, threshold_unit, defaults, hide_from_overview
    FROM inventory_categories WHERE team_id = ${zdroj}` as any[];
  const keKopii = kategorieKeKopirovani(
    strom.map(r => ({ ...r, id: Number(r.id), parent_id: r.parent_id != null ? Number(r.parent_id) : null })),
    pouzite,
  );
  // `mapa`: id ve zdroji → id kopie (pro rodiče, položky a odkazy);
  // `podleKorene`: kořenový originál → existující kopie (přerušený běh).
  const mapa = new Map<number, number>();
  const podleKorene = new Map<number, number>();
  const stavajici = await sql`
    SELECT id, origin_id FROM inventory_categories
    WHERE team_id = ${teamId} AND origin_id = ANY(${keKopii.map(koren)})` as any[];
  for (const r of stavajici) podleKorene.set(Number(r.origin_id), Number(r.id));
  // Kořenový originál může ležet v TOMHLE podniku (B bylo zdrojem, A dostalo
  // kopie, pak zdrojem bylo A a B jeho kopie použilo): pak se položky
  // přepojí na vlastní řádek a nic se nekopíruje.
  const vlastni = new Set(ids(await sql`
    SELECT id FROM inventory_categories WHERE team_id = ${teamId} AND id = ANY(${keKopii.map(koren)})`));

  let pocet = 0;
  for (const c of keKopii) {
    let noveId = vlastni.has(koren(c)) ? koren(c) : podleKorene.get(koren(c));
    if (noveId == null) {
      const [row] = await sql`
        INSERT INTO inventory_categories
          (team_id, origin_id, name, position, parent_id, tracks_open, content_unit, default_package_size,
           scale, threshold_unit, defaults, hide_from_overview)
        VALUES (${teamId}, ${koren(c)}, ${c.name}, ${c.position ?? 0}, ${premapujRodice(c.parent_id, mapa)},
                ${c.tracks_open === true}, ${c.content_unit ?? null}, ${c.default_package_size ?? null},
                ${c.scale != null ? JSON.stringify(c.scale) : null}::jsonb, ${c.threshold_unit ?? null},
                ${c.defaults != null ? JSON.stringify(c.defaults) : null}::jsonb, ${c.hide_from_overview === true})
        RETURNING id`;
      noveId = Number(row.id);
      podleKorene.set(koren(c), noveId);
      pocet++;
    }
    mapa.set(c.id, noveId);
    // Jen položky TOHOHLE podniku; řádky zdroje i ostatních podniků zůstávají.
    await sql`UPDATE inventory_items SET category_id = ${noveId} WHERE team_id = ${teamId} AND category_id = ${c.id}`;
  }
  await prepojOdkazy(teamId, mapa);
  return pocet;
}

/** Typy směn: kopie jen těch, na které ukazuje pevná směna podniku; preference 'type:<id>' se přepojí s nimi. */
async function zkopirujTypySmen(zdroj: number, teamId: number): Promise<number> {
  const pouzite = await sql`
    SELECT DISTINCT st.id, st.origin_id, st.name, st.start_time, st.end_time, st.color, st.position, st.starts_at_open, st.ends_at_close
    FROM fixed_assignments fa JOIN shift_types st ON st.id = fa.shift_type_id
    WHERE fa.team_id = ${teamId} AND st.team_id = ${zdroj}` as any[];
  if (!pouzite.length) return 0;
  const stavajici = await sql`
    SELECT id, origin_id FROM shift_types WHERE team_id = ${teamId} AND origin_id = ANY(${pouzite.map(koren)})` as any[];
  const podleKorene = new Map<number, number>(stavajici.map(r => [Number(r.origin_id), Number(r.id)]));
  // Kořenový originál ve vlastním podniku → přepojit na něj, nekopírovat.
  const vlastni = new Set(ids(await sql`SELECT id FROM shift_types WHERE team_id = ${teamId} AND id = ANY(${pouzite.map(koren)})`));
  const mapa = new Map<number, number>();
  let pocet = 0;
  for (const t of pouzite) {
    const puvodni = Number(t.id);
    let noveId = vlastni.has(koren(t)) ? koren(t) : podleKorene.get(koren(t));
    if (noveId == null) {
      const [row] = await sql`
        INSERT INTO shift_types (team_id, origin_id, name, start_time, end_time, color, position, starts_at_open, ends_at_close)
        VALUES (${teamId}, ${koren(t)}, ${t.name}, ${t.start_time}, ${t.end_time}, ${t.color ?? 'lime'}, ${t.position ?? 0},
                ${t.starts_at_open === true}, ${t.ends_at_close === true})
        RETURNING id`;
      noveId = Number(row.id);
      podleKorene.set(koren(t), noveId);
      pocet++;
    }
    mapa.set(puvodni, noveId);
    await sql`UPDATE fixed_assignments SET shift_type_id = ${noveId} WHERE team_id = ${teamId} AND shift_type_id = ${puvodni}`;
  }
  await prepojPreference(teamId, mapa);
  return pocet;
}

/** Kategorie návodů: kopie jen těch, na které ukazuje návod podniku. */
async function zkopirujKategorieNavodu(zdroj: number, teamId: number): Promise<number> {
  const pouzite = await sql`
    SELECT DISTINCT gc.id, gc.origin_id, gc.name, gc.icon, gc.position
    FROM guides g JOIN guide_categories gc ON gc.id = g.category_id
    WHERE g.team_id = ${teamId} AND gc.team_id = ${zdroj}` as any[];
  if (!pouzite.length) return 0;
  const stavajici = await sql`
    SELECT id, origin_id FROM guide_categories WHERE team_id = ${teamId} AND origin_id = ANY(${pouzite.map(koren)})` as any[];
  const podleKorene = new Map<number, number>(stavajici.map(r => [Number(r.origin_id), Number(r.id)]));
  // Kořenový originál ve vlastním podniku → přepojit na něj, nekopírovat.
  const vlastni = new Set(ids(await sql`SELECT id FROM guide_categories WHERE team_id = ${teamId} AND id = ANY(${pouzite.map(koren)})`));
  let pocet = 0;
  for (const k of pouzite) {
    const puvodni = Number(k.id);
    let noveId = vlastni.has(koren(k)) ? koren(k) : podleKorene.get(koren(k));
    if (noveId == null) {
      const [row] = await sql`
        INSERT INTO guide_categories (team_id, origin_id, name, icon, position)
        VALUES (${teamId}, ${koren(k)}, ${k.name}, ${k.icon ?? 'book'}, ${k.position ?? 0})
        RETURNING id`;
      noveId = Number(row.id);
      podleKorene.set(koren(k), noveId);
      pocet++;
    }
    await sql`UPDATE guides SET category_id = ${noveId} WHERE team_id = ${teamId} AND category_id = ${puvodni}`;
  }
  return pocet;
}

// ---------------------------------------------------------------------------
// Sloučení při zapnutí
// ---------------------------------------------------------------------------

/**
 * Společný tvar sloučení pro jednu tabulku: kopie podniku (`origin_id` v
 * řádcích nového zdroje) přepojí odkazy zpět na originál a smažou se.
 * Kopie, jejíž originál už neexistuje nikde, zůstane jako běžný vlastní
 * řádek (origin_id se vynuluje). Kopie s originálem v JINÉM podniku než je
 * nový zdroj se nechá být — až se ten podnik stane zdrojem, sloučí se k němu.
 */
async function slouceni(
  nacti: () => Promise<{ kopie: number[]; origins: Map<number, number>; existujici: Set<number>; veZdroji: Set<number> }>,
  prepoj: (kopie: number, origin: number) => Promise<void>,
  smaz: (kopie: number[]) => Promise<void>,
  osirotit: (kopie: number[]) => Promise<void>,
  /** Po přepojení řádků, před smazáním kopií — s mapou kopie → originál (odkazy, preference). */
  poPrepojeni?: (mapa: Map<number, number>) => Promise<void>,
): Promise<number> {
  const { kopie, origins, existujici, veZdroji } = await nacti();
  if (!kopie.length) return 0;
  const keSmazani: number[] = [];
  const sirotci: number[] = [];
  const prepojeno = new Map<number, number>();
  for (const k of kopie) {
    const o = origins.get(k)!;
    if (veZdroji.has(o)) { await prepoj(k, o); keSmazani.push(k); prepojeno.set(k, o); }
    else if (!existujici.has(o)) sirotci.push(k);
  }
  if (sirotci.length) await osirotit(sirotci);
  if (prepojeno.size && poPrepojeni) await poPrepojeni(prepojeno);
  if (keSmazani.length) await smaz(keSmazani);
  return keSmazani.length;
}

/** Načte kopie podniku v dané tabulce a rozhodne, které originály jsou ve zdroji, které ještě existují. */
async function kopiePodniku(tabulka: 'inventory_categories' | 'shift_types' | 'guide_categories', zdroj: number, teamId: number) {
  const q = {
    inventory_categories: {
      kopie: () => sql`SELECT id, origin_id FROM inventory_categories WHERE team_id = ${teamId} AND origin_id IS NOT NULL`,
      originy: (o: number[]) => sql`SELECT id, team_id FROM inventory_categories WHERE id = ANY(${o})`,
    },
    shift_types: {
      kopie: () => sql`SELECT id, origin_id FROM shift_types WHERE team_id = ${teamId} AND origin_id IS NOT NULL`,
      originy: (o: number[]) => sql`SELECT id, team_id FROM shift_types WHERE id = ANY(${o})`,
    },
    guide_categories: {
      kopie: () => sql`SELECT id, origin_id FROM guide_categories WHERE team_id = ${teamId} AND origin_id IS NOT NULL`,
      originy: (o: number[]) => sql`SELECT id, team_id FROM guide_categories WHERE id = ANY(${o})`,
    },
  }[tabulka];
  const rows = await q.kopie() as any[];
  const origins = new Map<number, number>(rows.map(r => [Number(r.id), Number(r.origin_id)]));
  const kopie = [...origins.keys()];
  const existujici = new Set<number>();
  const veZdroji = new Set<number>();
  if (kopie.length) {
    for (const r of await q.originy([...new Set(origins.values())]) as any[]) {
      existujici.add(Number(r.id));
      if (Number(r.team_id) === zdroj) veZdroji.add(Number(r.id));
    }
  }
  return { kopie, origins, existujici, veZdroji };
}

/**
 * Kategorie skladu: vlastní podkategorie, které si podnik pod kopií mezitím
 * založil, se stanou kořeny — pod kategorii z organizace se zanořit nesmí
 * (strom napříč podniky), a zahodit je by byla ztráta dat.
 */
function sloucKategorieSkladu(zdroj: number, teamId: number): Promise<number> {
  return slouceni(
    () => kopiePodniku('inventory_categories', zdroj, teamId),
    // Položka nese vedle ukazatele i štítek `category`; kdyby si podnik kopii
    // mezitím přejmenoval, nesl by po sloučení jméno, které už nikde není.
    async (kopie, origin) => {
      await sql`
        UPDATE inventory_items
        SET category_id = ${origin}, category = (SELECT name FROM inventory_categories WHERE id = ${origin})
        WHERE team_id = ${teamId} AND category_id = ${kopie}`;
    },
    async (kopie) => {
      await zdedBaleniPredOsirenim(teamId, kopie);
      await sql`UPDATE inventory_categories SET parent_id = NULL WHERE team_id = ${teamId} AND parent_id = ANY(${kopie}) AND NOT (id = ANY(${kopie}))`;
      await sql`DELETE FROM inventory_categories WHERE team_id = ${teamId} AND id = ANY(${kopie})`;
    },
    async (kopie) => { await sql`UPDATE inventory_categories SET origin_id = NULL WHERE team_id = ${teamId} AND id = ANY(${kopie})`; },
    (mapa) => prepojOdkazy(teamId, mapa),
  );
}

function sloucTypySmen(zdroj: number, teamId: number): Promise<number> {
  return slouceni(
    () => kopiePodniku('shift_types', zdroj, teamId),
    async (kopie, origin) => { await sql`UPDATE fixed_assignments SET shift_type_id = ${origin} WHERE team_id = ${teamId} AND shift_type_id = ${kopie}`; },
    async (kopie) => { await sql`DELETE FROM shift_types WHERE team_id = ${teamId} AND id = ANY(${kopie})`; },
    async (kopie) => { await sql`UPDATE shift_types SET origin_id = NULL WHERE team_id = ${teamId} AND id = ANY(${kopie})`; },
    (mapa) => prepojPreference(teamId, mapa),
  );
}

function sloucKategorieNavodu(zdroj: number, teamId: number): Promise<number> {
  return slouceni(
    () => kopiePodniku('guide_categories', zdroj, teamId),
    async (kopie, origin) => { await sql`UPDATE guides SET category_id = ${origin} WHERE team_id = ${teamId} AND category_id = ${kopie}`; },
    async (kopie) => { await sql`DELETE FROM guide_categories WHERE team_id = ${teamId} AND id = ANY(${kopie})`; },
    async (kopie) => { await sql`UPDATE guide_categories SET origin_id = NULL WHERE team_id = ${teamId} AND id = ANY(${kopie})`; },
  );
}

// ---------------------------------------------------------------------------
// Veřejný vstup
// ---------------------------------------------------------------------------

const KOPIE: Record<Ciselnik, ((zdroj: number, teamId: number) => Promise<number>) | null> = {
  kategorieSkladu: zkopirujKategorieSkladu, typySmen: zkopirujTypySmen, kategorieNavodu: zkopirujKategorieNavodu,
  dodavatele: null, odmeny: null,
};
const SLOUCENI: Record<Ciselnik, ((zdroj: number, teamId: number) => Promise<number>) | null> = {
  kategorieSkladu: sloucKategorieSkladu, typySmen: sloucTypySmen, kategorieNavodu: sloucKategorieNavodu,
  dodavatele: null, odmeny: null,
};

/**
 * Provede kopie (za každý číselník, jemuž zdroj mizí) a sloučení (za každý,
 * který zdroj dostává) pro všechny podniky organizace kromě zdroje samého.
 * `podniky` musí přijít z `teams WHERE organization_id = org.id` — tahle
 * funkce nic neověřuje, spoléhá na volajícího (PATCH po kontrole vlastníka).
 * Nikdy nevyhodí; každý podnik má výsledek ok/chyba zvlášť.
 */
export async function provedZmenuZdroju(input: {
  orgId: number; meId: number; podniky: number[];
  vypina: { ciselnik: Ciselnik; zdroj: number }[];
  slucuje: { ciselnik: Ciselnik; zdroj: number }[];
}): Promise<VysledekKopie[]> {
  const out: VysledekKopie[] = [];
  const kroky: { akce: 'kopie' | 'slouceni'; ciselnik: Ciselnik; zdroj: number }[] = [
    ...input.vypina.map(v => ({ akce: 'kopie' as const, ...v })),
    ...input.slucuje.map(s => ({ akce: 'slouceni' as const, ...s })),
  ];
  for (const krok of kroky) {
    if (!S_KOPII.includes(krok.ciselnik)) continue;
    // Zdroj, který mezitím z organizace odešel, se nekopíruje ani neslučuje:
    // podniky jeho řádky už nečtou (tymyProCiselnik) a kopírovat data cizího
    // podniku sem by bylo přesně to, čemu má tenancy bránit. Staré id ve
    // `zdrojeCiselniku` přežít mohlo — ukládá se, dokud ho vlastník nezmění.
    if (!input.podniky.includes(krok.zdroj)) continue;
    const fn = (krok.akce === 'kopie' ? KOPIE : SLOUCENI)[krok.ciselnik];
    if (!fn) continue;
    for (const teamId of input.podniky) {
      if (teamId === krok.zdroj) continue;
      let ok = true; let pocet = 0;
      try { pocet = await fn(krok.zdroj, teamId); }
      catch { ok = false; }
      out.push({ teamId, ciselnik: krok.ciselnik, akce: krok.akce, ok, pocet });
      if (!ok || pocet > 0) {
        audit(teamId, input.meId, `organization.ciselniky.${krok.akce}`, 'organization', input.orgId,
          `${nazevCiselniku(krok.ciselnik)}: ${ok ? czCount(pocet, RADEK) : 'chyba'}`);
      }
    }
  }
  return out;
}
