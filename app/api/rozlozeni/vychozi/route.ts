// Výchozí rozložení podniku (kolo 68, spec §1.6): co uvidí lidé, kteří si
// stránku sami neupravili — pro celý typ role, nebo pro konkrétní roli —
// a případně zámek, aby si ji nepřestavovali.
//
// Nastavuje vedení s podnik.nastaveni; u stránek tabletu stačí i
// kiosk.spravovat. Správce smí do výchozího dát i widget, který sám nevidí:
// oprávnění tím nikomu nepřidá, data se vždycky kreslí podle diváka. Proto
// GET vrací položky nefiltrované — náhled výchozího je bez dat (spec §3.8).
// Zápis naopak widgety, které správce nevidí, nemaže (zachovejSkryte jako
// u osobního rozložení); odebrat je jde jen výslovně přes `odebrane`.

import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved, type Kontext, type VlastniRole } from '@/lib/opravneniDb';
import { hit } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';
import { czCount } from '@/lib/czech';
import { stranka as najdiStranku } from '@/lib/widgety/stranky';
import { LIMIT_ZAPISU, MAX_POLOZEK, MAX_TELO_BAJTU, NASTROJ } from '@/lib/widgety/konstanty';
import { jeSpravceStranky, slozZapisVychoziho } from '@/lib/widgety/rozlozeni';
import { jePredMigraci, odpovedVychozi, overRozsah, smazRadek, stavZapisuVychoziho, zapisRadek } from '@/lib/widgety/rozlozeniDb';
import type { DefiniceStranky, Rozsah } from '@/lib/widgety/typy';

export const dynamic = 'force-dynamic';

const WIDGET = { one: 'widget', few: 'widgety', many: 'widgetů' };
const NENACTENO = 'Výchozí rozložení se teď nepodařilo načíst. Zkus to za chvíli znovu.';
const NEULOZENO = 'Výchozí rozložení se teď nepodařilo uložit. Zkus to za chvíli znovu.';
const PRED_MIGRACI = 'Rozložení se teď nedá uložit — aktualizace databáze ještě neproběhla. Zkus to za chvíli.';

const odpoved = (data: unknown, status = 200, hlavicky: Record<string, string> = {}) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', ...hlavicky } });
const bezCache = (res: NextResponse) => { res.headers.set('Cache-Control', 'no-store'); return res; };

interface Vstup { c: Kontext; s: DefiniceStranky; rozsah: Rozsah; vlastni: VlastniRole[] }

/** Brána správce a kontrola stránky a rozsahu (rozsah musí patřit k rozhraní stránky). */
async function vstup(request: Request): Promise<Vstup | NextResponse> {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return bezCache(c);
  const q = new URL(request.url).searchParams;
  const s = najdiStranku(q.get('stranka'));
  if (!s) return odpoved({ error: 'Neznámá stránka.' }, 400);
  if (!s.aktivni) return odpoved({ error: 'Tahle stránka se zatím upravovat nedá.' }, 404);
  if (!jeSpravceStranky(c.role.opravneni, s)) {
    return odpoved({ error: 'Výchozí rozložení nastavuje vedení s oprávněním k nastavení podniku.' }, 403);
  }
  const r = await overRozsah(c.teamId, s, q.get('rozsah'));
  if (!r) return odpoved({ error: 'Tenhle rozsah ke stránce nepatří.' }, 400);
  return { c, s, rozsah: r.rozsah, vlastni: r.vlastni };
}

async function prectiTelo(request: Request): Promise<{ data: any } | { chyba: NextResponse }> {
  const moc = () => ({ chyba: odpoved({ error: 'Rozložení je moc velké na uložení.' }, 413) });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_TELO_BAJTU) return moc();
  let text: string;
  try { text = await request.text(); } catch { return { chyba: odpoved({ error: 'Rozložení se nepodařilo přečíst.' }, 400) }; }
  if (new TextEncoder().encode(text).length > MAX_TELO_BAJTU) return moc();
  try { return { data: JSON.parse(text) }; } catch { return { chyba: odpoved({ error: 'Rozložení se nepodařilo přečíst.' }, 400) }; }
}

async function limitZapisu(meId: number): Promise<NextResponse | null> {
  const limit = await hit(`rozlozeni:${meId}`, LIMIT_ZAPISU.max, LIMIT_ZAPISU.oknoS);
  return limit.ok ? null : odpoved({ error: 'Moc změn najednou — chvilku počkej.' }, 429, { 'Retry-After': String(limit.retryAfter) });
}

export async function GET(request: Request) {
  const v = await vstup(request);
  if (v instanceof NextResponse) return v;
  try { return odpoved(await odpovedVychozi(v.c.teamId, v.s, v.rozsah, v.vlastni)); }
  catch (e) { console.error('rozlozeni/vychozi GET', e); return odpoved({ error: NENACTENO }, 503); }
}

/**
 * Výchozí rozložení: `{ polozky, zamceno, verze, odebrane? }` (typ ZapisVychoziho;
 * verze 0 = výchozí podniku ještě není).
 */
export async function PUT(request: Request) {
  const v = await vstup(request);
  if (v instanceof NextResponse) return v;
  const { c, s, rozsah } = v;
  const telo = await prectiTelo(request);
  if ('chyba' in telo) return telo.chyba;
  const { polozky, verze } = telo.data ?? {};
  const zamceno = telo.data?.zamceno === true;
  if (!Array.isArray(polozky)) return odpoved({ error: 'Chybí seznam widgetů.' }, 400);
  if (!Number.isInteger(verze) || verze < 0) return odpoved({ error: 'Chybí verze rozložení.' }, 400);
  const odebraneRaw: unknown = telo.data?.odebrane;
  const odebrane = new Set(Array.isArray(odebraneRaw) ? odebraneRaw.slice(0, MAX_POLOZEK * 5).filter((x): x is string => typeof x === 'string') : []);

  const zamitnuto = await limitZapisu(c.meId);
  if (zamitnuto) return zamitnuto;

  // Co v rozsahu teď je a co z toho správce vidí. „Uložit jako výchozí"
  // z plochy posílá jen jeho profiltrovanou plochu — bez zachovejSkryte by
  // delegovaný správce bez finance.trzby (nebo vlastník během výpadku tarifu
  // Max) smazal všem widgety, o kterých ani nevěděl (spec §1.6). Před
  // migrací se základ spočítá z kódu a spadne až zápis (42P01).
  let stav: Awaited<ReturnType<typeof stavZapisuVychoziho>>;
  try { stav = await stavZapisuVychoziho(c, s, rozsah, v.vlastni); }
  catch (e) { console.error('rozlozeni/vychozi PUT: čtení', e); return odpoved({ error: NENACTENO }, 503); }
  const nove = slozZapisVychoziho(s, polozky, stav.ulozene, stav.spravce, odebrane);
  let novaVerze: number | null;
  try {
    novaVerze = await zapisRadek({ teamId: c.teamId, stranka: s.id, rozsah, userId: null, polozky: nove, zamceno, verze, meId: c.meId });
  } catch (e) {
    if (jePredMigraci(e)) return odpoved({ error: PRED_MIGRACI }, 503);
    console.error('rozlozeni/vychozi PUT', e);
    return odpoved({ error: NEULOZENO }, 503);
  }
  if (novaVerze == null) {
    let aktualni = null;
    try { aktualni = await odpovedVychozi(c.teamId, s, rozsah, v.vlastni); } catch { /* klient si načte znovu sám */ }
    return odpoved({ error: 'Rozložení se mezitím změnilo jinde.', aktualni }, 409);
  }
  const widgetu = nove.filter(p => p.widget !== NASTROJ).length;
  audit(c.teamId, c.meId, 'rozlozeni.vychozi', 'stranka', null, `${s.id} ${rozsah}: ${czCount(widgetu, WIDGET)}${zamceno ? ', zamčeno' : ''}`);
  return odpoved({ ok: true, polozky: nove, zamceno, verze: novaVerze });
}

/** Obnovit výchozí z aplikace: smaže výchozí podniku pro rozsah. */
export async function DELETE(request: Request) {
  const v = await vstup(request);
  if (v instanceof NextResponse) return v;
  const { c, s, rozsah } = v;
  const zamitnuto = await limitZapisu(c.meId);
  if (zamitnuto) return zamitnuto;
  try { await smazRadek(c.teamId, s.id, rozsah); }
  catch (e) {
    if (jePredMigraci(e)) return odpoved({ error: PRED_MIGRACI }, 503);
    console.error('rozlozeni/vychozi DELETE', e);
    return odpoved({ error: NEULOZENO }, 503);
  }
  audit(c.teamId, c.meId, 'rozlozeni.vychozi', 'stranka', null, `${s.id} ${rozsah}: obnoveno výchozí z aplikace`);
  try { return odpoved({ ok: true, ...(await odpovedVychozi(c.teamId, s, rozsah, v.vlastni)) }); }
  catch (e) { console.error('rozlozeni/vychozi DELETE: čtení', e); return odpoved({ error: NENACTENO }, 503); }
}
