// Rozložení stránky pro přihlášeného (kolo 68, spec §1.6): co vidí na ploše,
// jeho vlastní úpravy a „Obnovit výchozí".
//
// Podnik se bere z pozaduj() — z databáze, nikdy z těla požadavku. Server
// vrací jen widgety, které divák smí vidět, a při zápisu vrací zpátky ty,
// které dočasně nevidí (tarif, oprávnění), aby nezmizely natrvalo.
// Odpovědi se necachují: rozložení je osobní a mění se každou úpravou.

import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved, type Kontext } from '@/lib/opravneniDb';
import { hit } from '@/lib/rateLimit';
import { stranka as najdiStranku } from '@/lib/widgety/stranky';
import { LIMIT_ZAPISU, MAX_TELO_BAJTU } from '@/lib/widgety/konstanty';
import { filtrujViditelne, polozkaViditelna, slozZapis, smiUpravitRozlozeni } from '@/lib/widgety/rozlozeni';
import { jePredMigraci, odpovedRozlozeni, smazRadek, spocitejRozlozeni, zapisRadek, type StavRozlozeni } from '@/lib/widgety/rozlozeniDb';
import type { DefiniceStranky, PolozkaRozlozeni } from '@/lib/widgety/typy';

export const dynamic = 'force-dynamic';

const NENACTENO = 'Rozložení se teď nepodařilo načíst. Zkus to za chvíli znovu.';
const NEULOZENO = 'Rozložení se teď nepodařilo uložit. Zkus to za chvíli znovu.';
const PRED_MIGRACI = 'Rozložení se teď nedá uložit — aktualizace databáze ještě neproběhla. Zkus to za chvíli.';

const odpoved = (data: unknown, status = 200, hlavicky: Record<string, string> = {}) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', ...hlavicky } });
const bezCache = (res: NextResponse) => { res.headers.set('Cache-Control', 'no-store'); return res; };

/** Brána a kontroly stránky společné pro GET, PUT i DELETE. */
async function vstup(request: Request): Promise<{ c: Kontext; s: DefiniceStranky } | NextResponse> {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return bezCache(c);
  const s = najdiStranku(new URL(request.url).searchParams.get('stranka'));
  if (!s) return odpoved({ error: 'Neznámá stránka.' }, 400);
  if (!s.aktivni) return odpoved({ error: 'Tahle stránka se zatím upravovat nedá.' }, 404);
  if (c.role.typ !== s.rozhrani) return odpoved({ error: 'Tahle stránka patří jinému rozhraní.' }, 403);
  return { c, s };
}

/**
 * Tělo zápisu. Víc než 16 KB se odmítne dřív, než se začne normalizovat —
 * plocha má nejvýš 40 položek a to se do limitu vejde s velkou rezervou.
 */
async function prectiTelo(request: Request): Promise<{ data: any } | { chyba: NextResponse }> {
  const moc = () => ({ chyba: odpoved({ error: 'Rozložení je moc velké na uložení.' }, 413) });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_TELO_BAJTU) return moc();
  let text: string;
  try { text = await request.text(); } catch { return { chyba: odpoved({ error: 'Rozložení se nepodařilo přečíst.' }, 400) }; }
  if (new TextEncoder().encode(text).length > MAX_TELO_BAJTU) return moc();
  try { return { data: JSON.parse(text) }; } catch { return { chyba: odpoved({ error: 'Rozložení se nepodařilo přečíst.' }, 400) }; }
}

/** Stav stránky pro zápis: bez tabulky (před migrací) se zapisovat nedá. */
async function stavProZapis(c: Kontext, s: DefiniceStranky): Promise<StavRozlozeni | NextResponse> {
  let stav: StavRozlozeni;
  try { stav = await spocitejRozlozeni(c, s); } catch (e) { console.error('rozlozeni: čtení', e); return odpoved({ error: NENACTENO }, 503); }
  if (stav.predMigraci) return odpoved({ error: PRED_MIGRACI }, 503);
  const brana = smiUpravitRozlozeni(stav.divak, stav.vysledek.vychozi);
  if (!brana.ok) return odpoved({ error: brana.chyba, ...(brana.zamceno ? { zamceno: true } : {}) }, 403);
  const limit = await hit(`rozlozeni:${c.meId}`, LIMIT_ZAPISU.max, LIMIT_ZAPISU.oknoS);
  if (!limit.ok) return odpoved({ error: 'Moc změn najednou — chvilku počkej.' }, 429, { 'Retry-After': String(limit.retryAfter) });
  return stav;
}

export async function GET(request: Request) {
  const v = await vstup(request);
  if (v instanceof NextResponse) return v;
  // Před migrací (tabulka chybí) se nevrací chyba: rozložení se spočítá ze
  // starého configu nebo z kódu a verze je 0 (rozlozeniDb.nactiRadky).
  try { return odpoved(await odpovedRozlozeni(v.c, v.s)); }
  catch (e) { console.error('rozlozeni GET', e); return odpoved({ error: NENACTENO }, 503); }
}

/** Osobní rozložení: `{ polozky, verze }`, verze = ta, kterou klient viděl (0 = řádek ještě není). */
export async function PUT(request: Request) {
  const v = await vstup(request);
  if (v instanceof NextResponse) return v;
  const { c, s } = v;
  const telo = await prectiTelo(request);
  if ('chyba' in telo) return telo.chyba;
  const { polozky, verze } = telo.data ?? {};
  // Nepole by normalizace proměnila v prázdnou plochu — chyba klienta nesmí smazat rozložení.
  if (!Array.isArray(polozky)) return odpoved({ error: 'Chybí seznam widgetů.' }, 400);
  if (!Number.isInteger(verze) || verze < 0) return odpoved({ error: 'Chybí verze rozložení.' }, 400);

  const stav = await stavProZapis(c, s);
  if (stav instanceof NextResponse) return stav;
  // Základ pro skryté položky je to, z čeho člověk vycházel: jeho osobní
  // řádek, u prvního zápisu nefiltrované výchozí (spec §1.5).
  const nove = slozZapis(s, polozky, stav.vysledek.nefiltrovane, (p: PolozkaRozlozeni) => polozkaViditelna(p, stav.divak));
  let novaVerze: number | null;
  try {
    novaVerze = await zapisRadek({ teamId: c.teamId, stranka: s.id, rozsah: `osobni:${c.meId}`, userId: c.meId, polozky: nove, zamceno: false, verze, meId: c.meId });
  } catch (e) {
    if (jePredMigraci(e)) return odpoved({ error: PRED_MIGRACI }, 503);
    console.error('rozlozeni PUT', e);
    return odpoved({ error: NEULOZENO }, 503);
  }
  if (novaVerze == null) {
    let aktualni = null;
    try { aktualni = await odpovedRozlozeni(c, s); } catch { /* klient si načte znovu sám */ }
    return odpoved({ error: 'Rozložení se mezitím změnilo jinde.', aktualni }, 409);
  }
  return odpoved({ ok: true, polozky: filtrujViditelne(nove, stav.divak), verze: novaVerze });
}

/** Obnovit výchozí: smaže osobní řádek a vrátí rozložení, které teď platí. */
export async function DELETE(request: Request) {
  const v = await vstup(request);
  if (v instanceof NextResponse) return v;
  const { c, s } = v;
  const stav = await stavProZapis(c, s);
  if (stav instanceof NextResponse) return stav;
  try { await smazRadek(c.teamId, s.id, `osobni:${c.meId}`); }
  catch (e) {
    if (jePredMigraci(e)) return odpoved({ error: PRED_MIGRACI }, 503);
    console.error('rozlozeni DELETE', e);
    return odpoved({ error: NEULOZENO }, 503);
  }
  try { return odpoved({ ok: true, ...(await odpovedRozlozeni(c, s)) }); }
  catch (e) { console.error('rozlozeni DELETE: čtení', e); return odpoved({ error: NENACTENO }, 503); }
}
