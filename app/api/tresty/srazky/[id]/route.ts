import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { notifyUser } from '@/lib/push';
import { pragueToday } from '@/lib/pragueTime';
import { menaPodniku } from '@/lib/menaPodniku';
import { normalizujPoznamku } from '@/lib/tresty';
import { VERZE_DOHODY_O_SRAZCE, VETA_BEZ_PRAV_PENIZE, odKdySrazka, type StavSrazky } from '@/lib/trestyPenize';
import { nazevPodniku, prepocitejPenizeTrestu, zamkyOd, zapisSouhlasSrazky, zneniSrazky } from '@/lib/trestyPenizeDb';
import { oznamNesouhlas, oznamSouhlas, ODKAZ_ZAMESTNANEC } from '../../_penize';
import { predMigraci } from '../../_spolecne';

// PATCH /api/tresty/srazky/[id] — srážka z výplaty u trestu (kolo 96, docs/TRESTY-PENIZE.md).
//
// Zaměstnanec (jen ten, koho se srážka týká; stav „ceka"):
//   { souhlas: true, zneni }        — dohoda o srážkách ze mzdy (§ 146 písm. b) ZP): `zneni` musí být přesně
//                                     to, co mu GET /api/tresty ukázal (item.penize.srazky[].zneni); jinak 409
//                                     s novým zněním. Souhlas se uloží do `consents` (typ srazka_mzdy) i ke srážce,
//                                     srážka se uplatní od prvního otevřeného dne ≥ dnes, záskok přejde s ní.
//   { nesouhlas: true, duvod? }     — nesouhlas (spor): nic se nestrhne, vedení (finance.mzdy + kdo ji zapsal) dostane push.
// Vedení (finance.mzdy):
//   { status: 'zruseno', note? }    — zrušit (uplatněné splátky v otevřeném období zmizí, v uzavřeném vrátí oprava)
//   { castka }                      — snížit (zvýšit nejde: nová srážka potřebuje nový souhlas)
//   { znovu: true }                 — po nesouhlasu požádat o souhlas znovu (stav zpět na „ceka", push zaměstnanci)
// Odpověď: { ok: true, srazka: { id, stav, castka, zneni? } }.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);
const chyba = (text: string, status: number, navic?: Record<string, unknown>) => NextResponse.json({ error: text, ...navic }, { status });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return chyba('Neplatné číslo srážky.', 400);
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatný požadavek.', 400); }
  b = b ?? {};
  let s: any;
  try {
    [s] = await sql`
      SELECT d.id, d.user_id, d.penalty_id, d.kind, d.amount, d.installments, d.reason, d.day, d.status, d.created_by, p.status AS trest_status, u.name AS user_name
      FROM wage_deductions d
      JOIN penalties p ON p.id = d.penalty_id AND p.team_id = d.team_id
      LEFT JOIN users u ON u.id = d.user_id
      WHERE d.id = ${id} AND d.team_id = ${c.teamId}`;
  } catch (e) { if (predMigraci(e)) return chyba('Srážka nenalezena.', 404); throw e; }
  if (!s) return chyba('Srážka nenalezena.', 404);
  const muj = Number(s.user_id) === c.meId;
  const smiPenize = c.role.opravneni.has('finance.mzdy');
  if (!muj && !smiPenize) return chyba('Srážka nenalezena.', 404);
  const stav = String(s.status) as StavSrazky;
  const trestId = Number(s.penalty_id);
  const mena = await menaPodniku(c.teamId);
  const dnes = pragueToday();
  const castka = Number(s.amount) || 0;
  const tvar = (st: StavSrazky, navic: Record<string, unknown> = {}) => NextResponse.json({ ok: true, srazka: { id, stav: st, castka, ...navic } });

  // ---- zaměstnanec: souhlas / nesouhlas ----
  if (b.souhlas === true || b.nesouhlas === true) {
    if (!muj) return chyba('Souhlasit se srážkou může jen ten, koho se týká.', 403);
    if (s.trest_status !== 'plati') return chyba('Trest je zrušený — srážka už neplatí.', 409);
    if (stav !== 'ceka') return chyba('Srážka už nečeká na souhlas.', 409, { stav });
    const zamky = await zamkyOd(c.teamId, `${dnes.slice(0, 7)}-01`);
    const zneni = zneniSrazky({ kind: String(s.kind), amount: castka, installments: Number(s.installments) || 1, reason: String(s.reason ?? ''), day: String(s.day).slice(0, 10) },
      { dnes, zamky, podnik: await nazevPodniku(c.teamId), kc: mena.money });
    if (b.souhlas === true) {
      if (typeof b.zneni !== 'string' || b.zneni.trim() !== zneni) return chyba('Znění dohody se mezitím změnilo — přečti si ho znovu.', 409, { zneni });
      const consentId = await zapisSouhlasSrazky({ userId: c.meId, teamId: c.teamId, udelen: true, zneni });
      const od = odKdySrazka({ denTrestu: String(s.day).slice(0, 10), denSouhlasu: dnes, zamky });
      const done = await sql`
        UPDATE wage_deductions SET status = 'uplatneno', apply_from = ${od}, consent_text = ${zneni}, consent_version = ${VERZE_DOHODY_O_SRAZCE},
          consent_at = NOW(), consent_id = ${consentId}, updated_at = NOW()
        WHERE id = ${id} AND team_id = ${c.teamId} AND status = 'ceka' RETURNING id`;
      if (!done.length) return chyba('Srážka už nečeká na souhlas.', 409);
      await prepocitejPenizeTrestu(c.teamId, trestId, c.meId);
      audit(c.teamId, c.meId, 'tresty.srazka_souhlas', 'penalty', trestId, `souhlas se srážkou ${mena.money(castka)} od ${od}`);
      await oznamSouhlas({ userId: c.meId, jmeno: String(s.user_name ?? ''), castka, kdoZapsal: s.created_by != null ? Number(s.created_by) : null }, mena.money);
      return tvar('uplatneno', { odDne: od, zneni });
    }
    const duvod = normalizujPoznamku(b.duvod);
    if (duvod === false) return chyba('Vyjádření je moc dlouhé (nejvýš 300 znaků).', 400);
    const consentId = await zapisSouhlasSrazky({ userId: c.meId, teamId: c.teamId, udelen: false, zneni });
    const done = await sql`
      UPDATE wage_deductions SET status = 'nesouhlas', refused_at = NOW(), refuse_note = ${duvod}, consent_id = ${consentId}, updated_at = NOW()
      WHERE id = ${id} AND team_id = ${c.teamId} AND status = 'ceka' RETURNING id`;
    if (!done.length) return chyba('Srážka už nečeká na souhlas.', 409);
    await prepocitejPenizeTrestu(c.teamId, trestId, c.meId);
    audit(c.teamId, c.meId, 'tresty.srazka_nesouhlas', 'penalty', trestId, `nesouhlas se srážkou ${mena.money(castka)}${duvod ? ` · ${duvod.slice(0, 120)}` : ''}`);
    await oznamNesouhlas(c.teamId, { userId: c.meId, jmeno: String(s.user_name ?? ''), castka, duvod, kdoZapsal: s.created_by != null ? Number(s.created_by) : null }, mena.money);
    return tvar('nesouhlas');
  }

  // ---- vedení ----
  if (!smiPenize) return chyba(VETA_BEZ_PRAV_PENIZE, 403);
  if (b.status === 'zruseno') {
    if (stav === 'zruseno') return chyba('Srážka už je zrušená.', 409);
    const pozn = normalizujPoznamku(b.note);
    if (pozn === false) return chyba('Poznámka je moc dlouhá (nejvýš 300 znaků).', 400);
    await sql`
      UPDATE wage_deductions SET status = 'zruseno', cancelled_by = ${c.meId}, cancelled_at = NOW(), cancel_note = ${pozn}, updated_at = NOW()
      WHERE id = ${id} AND team_id = ${c.teamId}`;
    await prepocitejPenizeTrestu(c.teamId, trestId, c.meId);
    audit(c.teamId, c.meId, 'tresty.srazka_zrusit', 'penalty', trestId, `${s.user_name ?? ''}: srážka ${mena.money(castka)} zrušena${pozn ? ` · ${pozn}` : ''}`);
    if (!muj) {
      try { await notifyUser(Number(s.user_id), { title: 'Srážka zrušena', body: `${mena.money(castka)} · ${String(s.reason ?? '').slice(0, 100)}`, link: ODKAZ_ZAMESTNANEC, type: 'tresty', category: 'general' }); }
      catch (e) { console.error('srážky: oznámení o zrušení', e); }
    }
    return tvar('zruseno');
  }
  if (b.status !== undefined) return chyba('Neznámý stav.', 400);
  if (stav === 'zruseno') return chyba('Zrušenou srážku už upravit nejde.', 409);
  if (s.trest_status !== 'plati') return chyba('Trest je zrušený — srážka už neplatí.', 409);

  if (b.znovu === true) {
    if (stav !== 'nesouhlas') return chyba('Znovu požádat jde jen po nesouhlasu.', 409);
    await sql`UPDATE wage_deductions SET status = 'ceka', refused_at = NULL, updated_at = NOW() WHERE id = ${id} AND team_id = ${c.teamId}`;
    await prepocitejPenizeTrestu(c.teamId, trestId, c.meId);
    audit(c.teamId, c.meId, 'tresty.srazka_znovu', 'penalty', trestId, `${s.user_name ?? ''}: znovu žádost o souhlas se srážkou ${mena.money(castka)}`);
    try { await notifyUser(Number(s.user_id), { title: `Srážka ${mena.money(castka)} čeká na tvůj souhlas`, body: String(s.reason ?? '').slice(0, 140), link: ODKAZ_ZAMESTNANEC, type: 'tresty', category: 'general' }); }
    catch (e) { console.error('srážky: oznámení o nové žádosti', e); }
    return tvar('ceka');
  }

  if (b.castka !== undefined) {
    const nova = Number(b.castka);
    if (!Number.isInteger(nova) || nova <= 0) return chyba('Srážka musí být celé kladné číslo (nejvýš 200 000).', 400);
    if (nova > castka) return chyba('Zvýšit srážku nejde — přidej novou (zaměstnanec ji musí odsouhlasit).', 409);
    if (nova === castka) return tvar(stav);
    await sql`UPDATE wage_deductions SET amount = ${nova}, updated_at = NOW() WHERE id = ${id} AND team_id = ${c.teamId}`;
    await prepocitejPenizeTrestu(c.teamId, trestId, c.meId);
    audit(c.teamId, c.meId, 'tresty.srazka_upravit', 'penalty', trestId, `${s.user_name ?? ''}: srážka ${mena.money(castka)} → ${mena.money(nova)}`);
    return NextResponse.json({ ok: true, srazka: { id, stav, castka: nova } });
  }
  return chyba('Nevím, co se srážkou udělat.', 400);
}
