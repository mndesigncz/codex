// Zkouška spojení s pokladnou. Odpovídá na jedinou otázku, kterou podnik má:
// „proč se objednávka nevytiskla na terminálu?"
//
// Projde celý řetězec po článcích a u každého řekne, co v něm vázne. Nic
// nikam nezapisuje — do ostré kasy se neposílá žádná testovací objednávka;
// Delivery API se ověří dotazem na neexistující objednávku, na který smí
// pokladna odpovědět jedině „neznám".
import { NextResponse } from 'next/server';
import { sql, employer, ensureProfile } from '@/lib/client';
import { getConnection, listDesks, tableOrderState, StoryousError } from '@/lib/storyous';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

/** Jeden článek řetězce: prošel, nebo v čem vázne a kde se to spraví. */
interface Krok { krok: string; ok: boolean; detail: string; kde?: string }

export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const p = await ensureProfile(u.team_id);
  const kroky: Krok[] = [];

  // 1. Připojení ------------------------------------------------------------
  const conn = await getConnection(u.team_id);
  kroky.push(conn
    ? { krok: 'Připojení k pokladně', ok: true, detail: `${conn.placeName ?? 'provozovna'} · ${conn.merchantId}-${conn.placeId}` }
    : { krok: 'Připojení k pokladně', ok: false, detail: 'Storyous není připojený.', kde: 'Nastavení → Pokladna' });
  if (!conn) return NextResponse.json({ kroky, hotovo: false });

  // 2. Odpovídá pokladna? ---------------------------------------------------
  let desks: { deskId: string; name: string }[] = [];
  try {
    desks = await listDesks(conn);
    kroky.push({ krok: 'Pokladna odpovídá', ok: true, detail: `${desks.length} stolů v pokladně` });
  } catch (e) {
    const m = e instanceof StoryousError ? `${e.status}: ${e.message}` : String((e as any)?.message ?? e);
    kroky.push({ krok: 'Pokladna odpovídá', ok: false, detail: `Storyous vrátil chybu — ${m}`, kde: 'Nastavení → Pokladna (zkontroluj přihlašovací údaje a provozovnu)' });
    return NextResponse.json({ kroky, hotovo: false });
  }

  // 3. Objednávky od stolu: umí je tahle provozovna vůbec přijmout? ---------
  // Dotaz na objednávku, která neexistuje. Když je rozhraní pro provozovnu
  // zapnuté, pokladna odpoví „neznám" (404) a to je v pořádku. Když odpoví
  // „nesmíš" (401/403), není rozhraní povolené — a přesně tohle je důvod,
  // proč objednávky mizí beze stopy.
  try {
    await tableOrderState(conn, `mgr-check-${Date.now()}`);
    kroky.push({ krok: 'Příjem objednávek od stolu', ok: true, detail: 'Rozhraní pro objednávky od stolu odpovídá.' });
  } catch (e) {
    const st = e instanceof StoryousError ? e.status : 0;
    const zakaz = st === 401 || st === 403;
    kroky.push({
      krok: 'Příjem objednávek od stolu', ok: false,
      detail: zakaz
        ? `Storyous objednávky od stolu pro tuhle provozovnu nepovoluje (${st}). Tohle appka neobejde — musí to zapnout podpora Storyous.`
        : `Rozhraní neodpovědělo: ${e instanceof StoryousError ? `${e.status}: ${e.message}` : String((e as any)?.message ?? e)}`,
      kde: zakaz ? 'Napiš podpoře Storyous, ať pro provozovnu zapne Delivery API (objednávky od stolu).' : undefined,
    });
  }

  // 4. Stoly spárované s pokladnou -----------------------------------------
  const tables = await sql`SELECT id, name, storyous_desk_id, active FROM client_tables WHERE team_id = ${u.team_id} ORDER BY id` as any[];
  const aktivni = tables.filter(t => t.active);
  const spárované = aktivni.filter(t => t.storyous_desk_id);
  const známé = new Set(desks.map(d => String(d.deskId)));
  const cizí = spárované.filter(t => !známé.has(String(t.storyous_desk_id))).map(t => String(t.name));
  kroky.push(
    aktivni.length === 0
      ? { krok: 'Stoly', ok: false, detail: 'Nemáš žádný aktivní stůl.', kde: 'Klient → Stoly' }
      : spárované.length === 0
        ? { krok: 'Stoly', ok: false, detail: `Žádný z ${aktivni.length} stolů není spárovaný s pokladnou. Bez toho kasa neví, na který stůl objednávku napsat.`, kde: 'Klient → Stoly → Načíst z pokladny' }
        : cizí.length
          ? { krok: 'Stoly', ok: false, detail: `${cizí.slice(0, 4).join(', ')} ukazuje na stůl, který pokladna nezná (asi se v kase přejmenoval nebo smazal).`, kde: 'Klient → Stoly → Načíst z pokladny' }
          : { krok: 'Stoly', ok: true, detail: `${spárované.length} z ${aktivni.length} stolů je spárovaných s pokladnou.` });

  // 5. Nabídka, ze které host objednává ------------------------------------
  const [board] = p.menu_slug
    ? await sql`SELECT id, name, slug FROM menu_boards WHERE team_id = ${u.team_id} AND slug = ${p.menu_slug} AND enabled IS NOT FALSE ORDER BY id LIMIT 1`
    : await sql`SELECT id, name, slug FROM menu_boards WHERE team_id = ${u.team_id} AND enabled IS NOT FALSE ORDER BY id LIMIT 1`;
  if (!board) {
    kroky.push({ krok: 'Nabídka pro hosty', ok: false, detail: 'Žádné zapnuté menu — host nemá co objednat.', kde: 'Klient → Menu' });
  } else {
    const items = await sql`
      SELECT i.name, i.pos_product_id FROM menu_items i JOIN menu_sections s ON s.id = i.section_id
      WHERE s.board_id = ${board.id}` as any[];
    const bez = items.filter(i => !i.pos_product_id).map(i => String(i.name));
    kroky.push(bez.length
      ? { krok: 'Položky menu', ok: false, detail: `V menu „${board.name}" nemá ${bez.length} z ${items.length} položek produkt v pokladně: ${bez.slice(0, 5).join(', ')}${bez.length > 5 ? ` a další` : ''}. Objednávka, ve které taková položka bude, se neodešle.`, kde: 'Klient → Menu → Tisk na terminálu' }
      : { krok: 'Položky menu', ok: true, detail: `Všech ${items.length} položek menu „${board.name}" má produkt v pokladně.` });
  }

  // 6. Nastavení, které odesílání vypíná -----------------------------------
  kroky.push(p.order_auto_pos === false
    ? { krok: 'Automatické odesílání', ok: false, detail: 'Je vypnuté, takže objednávka čeká, až ji obsluha pošle ručně.', kde: 'Klient → Nastavení' }
    : { krok: 'Automatické odesílání', ok: true, detail: 'Zapnuté — objednávka jde do kasy hned.' });
  if (!p.ordering_on) kroky.push({ krok: 'Objednávky od stolu', ok: false, detail: 'Hosté nemůžou objednávat, je to vypnuté.', kde: 'Klient → Nastavení' });

  return NextResponse.json({ kroky, hotovo: kroky.every(k => k.ok) });
}
