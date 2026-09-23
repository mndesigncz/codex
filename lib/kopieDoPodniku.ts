// Kopie do podniku (kolo 64) — databázová část. Čistá logika (přemapování
// podle názvu, volný slug) je vedle v lib/kopie.ts.
//
// Zdrojový podnik se JEN čte, zapisuje se výhradně `team_id = cíl`. Každá
// položka běží ve vlastním try: chyba u jedné nezastaví ostatní a vrací se
// v poznámce bez detailu Postgresu, ať vedení vidí, co se zkopírovalo a co
// ne, místo obecné pětistovky nad půlkou hotové práce.
//
// Kdo smí kopírovat a odkud (táž organizace, jiný podnik) rozhoduje routa;
// tady se už věří, že `z` i `teamId` prošly kontrolou.

import { neon } from '@neondatabase/serverless';
import { normalizeSteps, type GuideStep } from './guideSteps';
import { parseSteps, sanitizeSteps } from './steps';
import { audit } from './audit';
import { tymyCiselniku } from './tenant';
import { verejnaHlaska } from './verejnaChyba';
import { normName } from './menuPos';
import { cleanSlug, DEFAULT_CURRENCY } from './menu';
import {
  nazvyNormovane, premapujGuideId, premapujKroky, premapujPodleNazvu, volnySlug,
  type EntitaKopie, type VysledekKopie,
} from './kopie';

const sql = neon(process.env.DATABASE_URL!);

/** Řádek seznamu ke kopírování — tvar odpovědi GET. */
export interface PolozkaKeKopii {
  id: number;
  nazev: string;
  popis: string | null;
  pocet: number;
  kategorie: string | null;
}

export interface ZadaniKopie {
  entita: EntitaKopie;
  /** Zdrojový podnik — ověřený routou proti organizaci. */
  z: number;
  nazevZdroje: string;
  /** Název cíle — do auditu zdrojového podniku. */
  nazevCile: string;
  /** Cílový (aktivní) podnik volajícího. */
  teamId: number;
  meId: number;
  ids: number[];
}

const NEPOVEDLO = 'Kopie se nepovedla.';
const STEJNY_NAZEV = 'Stejný název tu už je.';

/** Checklist z databáze: JSONB přijde jako pole, starší řádky jako text. */
function krokyZRadku(raw: any): GuideStep[] {
  if (typeof raw === 'string') {
    try { return normalizeSteps(JSON.parse(raw)); } catch { return []; }
  }
  return normalizeSteps(raw);
}

function vyhozeno(content: any): string | null {
  const flat = String(content ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return flat.length > 120 ? flat.slice(0, 120).trimEnd() + '…' : flat;
}

const idNazev = (rows: any[], klic = 'name') => rows.map(r => ({ id: Number(r.id), name: String(r[klic] ?? '') }));
const mapaNazvu = (rows: any[], klic = 'name') => new Map<number, string>(rows.map(r => [Number(r.id), String(r[klic] ?? '')]));

// ---------------------------------------------------------------------------
// Seznam ke kopírování
// ---------------------------------------------------------------------------

/** Co zdrojový podnik nabízí. Návrhy čekající na schválení se nenabízejí — nejsou hotové. */
export async function seznamKeKopii(entita: EntitaKopie, z: number): Promise<PolozkaKeKopii[]> {
  if (entita === 'navody') {
    const rows = await sql`
      SELECT g.id, g.title, g.content, g.checklist, c.name AS kategorie
      FROM guides g LEFT JOIN guide_categories c ON c.id = g.category_id
      WHERE g.team_id = ${z} AND g.approved IS DISTINCT FROM FALSE
      ORDER BY g.title ASC, g.id ASC LIMIT 200` as any[];
    return rows.map(r => ({
      id: Number(r.id), nazev: String(r.title ?? ''), popis: vyhozeno(r.content),
      pocet: krokyZRadku(r.checklist).length, kategorie: r.kategorie != null ? String(r.kategorie) : null,
    }));
  }
  if (entita === 'postupy') {
    const rows = await sql`
      SELECT id, name, description, items FROM procedures
      WHERE team_id = ${z} AND approved IS DISTINCT FROM FALSE
      ORDER BY name ASC, id ASC LIMIT 200` as any[];
    return rows.map(r => ({
      id: Number(r.id), nazev: String(r.name ?? ''), popis: r.description ? String(r.description) : null,
      pocet: parseSteps(r.items).length, kategorie: null,
    }));
  }
  const rows = await sql`
    SELECT b.id, b.name, b.title,
           (SELECT COUNT(*)::int FROM menu_items i JOIN menu_sections s ON s.id = i.section_id WHERE s.board_id = b.id) AS pocet
    FROM menu_boards b
    WHERE b.team_id = ${z}
    ORDER BY b.name ASC, b.id ASC LIMIT 200` as any[];
  return rows.map(r => ({
    id: Number(r.id), nazev: String(r.name ?? ''), popis: r.title ? String(r.title) : null,
    pocet: Number(r.pocet) || 0, kategorie: null,
  }));
}

// ---------------------------------------------------------------------------
// Kopie
// ---------------------------------------------------------------------------

export async function zkopirujDoPodniku(zadani: ZadaniKopie): Promise<VysledekKopie[]> {
  const vysledky = zadani.entita === 'navody' ? await kopieNavodu(zadani)
    : zadani.entita === 'postupy' ? await kopiePostupu(zadani)
    : await kopieMenu(zadani);
  // Stopa i ve ZDROJI: audit_log je po podnicích, a bez tohohle řádku by
  // vedení podniku A nevidělo, že jeho receptury a ceny odešly jinam.
  const hotove = vysledky.filter(r => r.noveId != null);
  if (hotove.length) {
    audit(zadani.z, zadani.meId, 'organization.kopie.zdroj', zadani.entita, null,
      `Do podniku „${zadani.nazevCile}": ${hotove.map(r => r.nazev).join(', ')}`);
  }
  return vysledky;
}

/** Vyžádané id, které ve zdroji není (nebo je jen návrh) — do výsledků, ať UI nemlčí. */
function chybejici(ids: number[], nalezene: Set<number>, co: string): VysledekKopie[] {
  return ids.filter(id => !nalezene.has(id)).map(id => ({ id, noveId: null, nazev: `#${id}`, poznamky: [`${co} ve zdrojovém podniku není.`] }));
}

async function kopieNavodu({ z, nazevZdroje, teamId, meId, ids }: ZadaniKopie): Promise<VysledekKopie[]> {
  const zdroje = await sql`
    SELECT id, title, content, checklist, category_id, item_id FROM guides
    WHERE team_id = ${z} AND id = ANY(${ids}) AND approved IS DISTINCT FROM FALSE
    ORDER BY id` as any[];
  const vysledky = chybejici(ids, new Set(zdroje.map(r => Number(r.id))), 'Návod');
  if (!zdroje.length) return vysledky;

  // Kategorie zdroje jen podle id: se sdílenými číselníky může ležet v jiném
  // podniku organizace, takže se nefiltruje po team_id. Cíl vidí vlastní
  // kategorie i ty ze zdroje organizace — stejně jako POST /api/guides.
  const catIds = [...new Set(zdroje.map(r => Number(r.category_id)).filter(n => Number.isFinite(n) && n > 0))];
  const kategorieZdroje = catIds.length ? mapaNazvu(await sql`SELECT id, name FROM guide_categories WHERE id = ANY(${catIds})`) : new Map<number, string>();
  const tymy = await tymyCiselniku(teamId, 'kategorieNavodu');
  const kategorieCile = idNazev(await sql`SELECT id, name FROM guide_categories WHERE team_id = ANY(${tymy})`);

  // Suroviny: jen když na ně nějaký návod ukazuje (kroky nebo připnutí).
  const kroky = new Map<number, GuideStep[]>(zdroje.map(r => [Number(r.id), krokyZRadku(r.checklist)]));
  const potrebujeSklad = zdroje.some(r => r.item_id != null || kroky.get(Number(r.id))!.some(k => k.itemId != null));
  const polozkyZdroje = potrebujeSklad ? mapaNazvu(await sql`SELECT id, name FROM inventory_items WHERE team_id = ${z}`) : new Map<number, string>();
  const polozkyCile = potrebujeSklad ? idNazev(await sql`SELECT id, name FROM inventory_items WHERE team_id = ${teamId} AND archived IS NOT TRUE`) : [];

  const navodyCile = await sql`SELECT id, title, item_id FROM guides WHERE team_id = ${teamId}` as any[];
  const nazvyCile = nazvyNormovane(navodyCile.map(r => r.title));
  // Jedna položka = jeden návod (lib/navodyDb): co už je připnuté, se nepřepisuje.
  const pripnuto = new Set<number>(navodyCile.map(r => Number(r.item_id)).filter(n => Number.isFinite(n) && n > 0));

  for (const r of zdroje) {
    const id = Number(r.id);
    const nazev = String(r.title ?? '');
    const poznamky: string[] = [];
    try {
      const categoryId = r.category_id != null ? premapujPodleNazvu(kategorieZdroje.get(Number(r.category_id)), kategorieCile) : null;
      if (r.category_id != null && categoryId == null) {
        const kat = kategorieZdroje.get(Number(r.category_id));
        poznamky.push(kat ? `Kategorie „${kat}" tu není — návod je bez kategorie.` : 'Návod je bez kategorie.');
      }
      const checklist = premapujKroky(kroky.get(id) ?? [], polozkyZdroje, polozkyCile);
      poznamky.push(...checklist.poznamky);

      let itemId: number | null = null;
      if (r.item_id != null) {
        const nazevPolozky = polozkyZdroje.get(Number(r.item_id));
        const cil = premapujPodleNazvu(nazevPolozky, polozkyCile);
        if (cil == null) poznamky.push(nazevPolozky ? `Položka „${nazevPolozky}" v tomhle podniku není — návod není připnutý.` : 'Návod není připnutý k položce.');
        else if (pripnuto.has(cil)) poznamky.push(`Položka „${nazevPolozky}" tu už má jiný návod — nepřipnuto.`);
        else itemId = cil;
      }
      if (nazvyCile.has(normName(nazev))) poznamky.push(STEJNY_NAZEV);

      const [nove] = await sql`
        INSERT INTO guides (team_id, category_id, title, content, checklist, created_by, updated_at, approved, submitted_by,
                            require_read, for_closing, item_id, product_id, product_name)
        VALUES (${teamId}, ${categoryId}, ${nazev}, ${String(r.content ?? '')}, ${JSON.stringify(checklist.kroky)}, ${meId}, NOW(), TRUE, NULL,
                FALSE, FALSE, ${itemId}, NULL, NULL)
        RETURNING id`;
      const noveId = Number(nove.id);
      if (itemId != null) pripnuto.add(itemId);
      nazvyCile.add(normName(nazev));
      audit(teamId, meId, 'organization.kopie', 'navody', noveId, `Z podniku „${nazevZdroje}": ${nazev}`);
      vysledky.push({ id, noveId, nazev, poznamky });
    } catch (e) {
      vysledky.push({ id, noveId: null, nazev, poznamky: [verejnaHlaska(e, NEPOVEDLO, '[kopie] návod')] });
    }
  }
  return vysledky;
}

async function kopiePostupu({ z, nazevZdroje, teamId, meId, ids }: ZadaniKopie): Promise<VysledekKopie[]> {
  const zdroje = await sql`
    SELECT id, name, description, icon, color, items, remind_at, remind_days, remind_anchor FROM procedures
    WHERE team_id = ${z} AND id = ANY(${ids}) AND approved IS DISTINCT FROM FALSE
    ORDER BY id` as any[];
  const vysledky = chybejici(ids, new Set(zdroje.map(r => Number(r.id))), 'Postup');
  if (!zdroje.length) return vysledky;

  const kroky = new Map(zdroje.map(r => [Number(r.id), parseSteps(r.items)]));
  const guideIds = [...new Set([...kroky.values()].flat().map(s => s.guideId).filter((g): g is number => g != null))];
  const navodyZdroje = guideIds.length ? mapaNazvu(await sql`SELECT id, title FROM guides WHERE team_id = ${z} AND id = ANY(${guideIds})`, 'title') : new Map<number, string>();
  const navodyCile = guideIds.length
    ? (await sql`SELECT id, title FROM guides WHERE team_id = ${teamId} AND approved IS DISTINCT FROM FALSE` as any[]).map(r => ({ id: Number(r.id), title: String(r.title ?? '') }))
    : [];
  const nazvyCile = nazvyNormovane((await sql`SELECT name FROM procedures WHERE team_id = ${teamId}` as any[]).map(r => r.name));
  // Dávka je vždy jedna entita, takže návody kopírované „v téže dávce" tu
  // nejsou — návod zkopírovaný před chvílí se najde podle názvu v cíli.
  const mapaDavky = new Map<number, number>();

  for (const r of zdroje) {
    const id = Number(r.id);
    const nazev = String(r.name ?? '');
    const poznamky: string[] = [];
    try {
      const { items, poznamky: pz } = premapujGuideId(kroky.get(id) ?? [], mapaDavky, navodyCile, navodyZdroje);
      poznamky.push(...pz);
      if (nazvyCile.has(normName(nazev))) poznamky.push(STEJNY_NAZEV);
      const remindAnchor = ['open', 'close', 'time'].includes(r.remind_anchor) ? r.remind_anchor : 'time';
      const remindDays = Array.isArray(r.remind_days) ? r.remind_days : [];
      const [nove] = await sql`
        INSERT INTO procedures (team_id, name, description, icon, color, items, remind_at, remind_days, remind_anchor,
                                require_before_closing, created_by, approved, submitted_by)
        VALUES (${teamId}, ${nazev}, ${r.description ?? null}, ${r.icon ?? 'check'}, ${r.color ?? 'lime'}, ${JSON.stringify(sanitizeSteps(items))},
                ${r.remind_at ?? null}, ${JSON.stringify(remindDays)}, ${remindAnchor}, FALSE, ${meId}, TRUE, NULL)
        RETURNING id`;
      const noveId = Number(nove.id);
      nazvyCile.add(normName(nazev));
      audit(teamId, meId, 'organization.kopie', 'postupy', noveId, `Z podniku „${nazevZdroje}": ${nazev}`);
      vysledky.push({ id, noveId, nazev, poznamky });
    } catch (e) {
      vysledky.push({ id, noveId: null, nazev, poznamky: [verejnaHlaska(e, NEPOVEDLO, '[kopie] postup')] });
    }
  }
  return vysledky;
}

async function kopieMenu({ z, nazevZdroje, teamId, meId, ids }: ZadaniKopie): Promise<VysledekKopie[]> {
  const zdroje = await sql`
    SELECT id, slug, name, eyebrow, title, note, currency, theme FROM menu_boards
    WHERE team_id = ${z} AND id = ANY(${ids}) ORDER BY id` as any[];
  const vysledky = chybejici(ids, new Set(zdroje.map(r => Number(r.id))), 'Menu');
  if (!zdroje.length) return vysledky;

  // Slug je veřejná adresa jedinečná napříč všemi podniky — obsazené se
  // berou všechny, ne jen cílové, jinak by INSERT spadl na unikátní index.
  const obsazene = new Set<string>((await sql`SELECT slug FROM menu_boards` as any[]).map(r => String(r.slug ?? '')));
  const nazvyCile = nazvyNormovane((await sql`SELECT name FROM menu_boards WHERE team_id = ${teamId}` as any[]).map(r => r.name));

  for (const r of zdroje) {
    const id = Number(r.id);
    const nazev = String(r.name ?? '');
    const poznamky: string[] = [];
    let noveId: number | null = null;
    try {
      const slug = volnySlug(cleanSlug(r.slug ?? nazev), obsazene);
      if (nazvyCile.has(normName(nazev))) poznamky.push(STEJNY_NAZEV);
      const [nove] = await sql`
        INSERT INTO menu_boards (team_id, slug, name, eyebrow, title, note, currency, theme,
                                 wifi_ssid, wifi_password, pin_hash, enabled, created_by)
        VALUES (${teamId}, ${slug}, ${nazev}, ${r.eyebrow ?? null}, ${r.title ?? null}, ${r.note ?? null}, ${r.currency ?? DEFAULT_CURRENCY},
                ${r.theme != null ? JSON.stringify(r.theme) : null}::jsonb, NULL, NULL, NULL, FALSE, ${meId})
        RETURNING id`;
      noveId = Number(nove.id);
      obsazene.add(slug);
      nazvyCile.add(normName(nazev));

      // Sekce a položky v původním pořadí; párování s pokladnou a „vyprodáno"
      // jsou stav JINÉHO podniku, kopie začíná bez nich.
      const sekce = await sql`
        SELECT id, title, column_no, position FROM menu_sections WHERE board_id = ${id} ORDER BY position, id` as any[];
      const polozky = sekce.length
        ? await sql`
            SELECT section_id, name, price, description, position FROM menu_items
            WHERE section_id = ANY(${sekce.map(s => Number(s.id))}) ORDER BY position, id` as any[]
        : [];
      // Položky sekce jedním dotazem (unnest polí), ne po jedné: menu smí mít
      // desítky sekcí po stovce položek a po jednom by to byly tisíce dotazů
      // v jednom požadavku.
      let sp = 0;
      for (const s of sekce) {
        const [nova] = await sql`
          INSERT INTO menu_sections (board_id, title, column_no, position)
          VALUES (${noveId}, ${String(s.title ?? '')}, ${Number(s.column_no) === 2 ? 2 : 1}, ${sp++}) RETURNING id`;
        const jeho = polozky.filter(p => Number(p.section_id) === Number(s.id));
        if (!jeho.length) continue;
        await sql`
          INSERT INTO menu_items (section_id, name, price, description, sold_out, pos_product_id, position)
          SELECT ${nova.id}, x.name, x.price, x.description, FALSE, NULL, x.position
          FROM unnest(${jeho.map(it => String(it.name ?? ''))}::text[], ${jeho.map(it => Math.round(Number(it.price) || 0))}::int[],
                      ${jeho.map(it => (it.description ?? null) as string | null)}::text[], ${jeho.map((_, i) => i)}::int[])
               AS x(name, price, description, position)`;
      }
      poznamky.push(`Menu je po zkopírování vypnuté a má novou adresu /menu-akce.html?menu=${slug} — zapni ho, až projdeš ceny.`);
      audit(teamId, meId, 'organization.kopie', 'menu', noveId, `Z podniku „${nazevZdroje}": ${nazev}`);
      vysledky.push({ id, noveId, nazev, poznamky });
    } catch (e) {
      // Deska mohla vzniknout a spadnout až u sekcí — hlásit „nepovedlo" a
      // nechat v cíli vypnuté torzo by znamenalo, že další pokus založí
      // druhé. Úklid je best-effort; tabulky nemají ON DELETE CASCADE.
      if (noveId != null) {
        try {
          await sql`DELETE FROM menu_items WHERE section_id IN (SELECT id FROM menu_sections WHERE board_id = ${noveId})`;
          await sql`DELETE FROM menu_sections WHERE board_id = ${noveId}`;
          await sql`DELETE FROM menu_boards WHERE id = ${noveId} AND team_id = ${teamId}`;
        } catch (e2) { console.error('[kopie] úklid menu selhal:', e2); }
      }
      vysledky.push({ id, noveId: null, nazev, poznamky: [verejnaHlaska(e, NEPOVEDLO, '[kopie] menu')] });
    }
  }
  return vysledky;
}
