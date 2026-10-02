// Hromadné akce nad výběrem členů: přidat do skupiny / odebrat ze skupiny, bonus bodů,
// zpráva vybraným. Výběr je buď seznam id (zaškrtnutí), nebo „všichni, kdo splňují
// filtr" (server si je vybere sám stejnou funkcí jako seznam). Každá akce nese klíč
// z prohlížeče: dvojklik ani opakované odeslání nic nezdvojí. Kupon vybraným jde
// jinudy: lišta výběru otevře okno posílání kuponů (coupons/send). Blokovaný člen
// nedostane ani body, ani zprávu.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { zajistiSchemaClenu } from '@/lib/clenoveSchema';
import { hit } from '@/lib/rateLimit';
import { odesliZpravu, nactiPrilohu } from '@/lib/broadcasts';
import { zkontrolujZpravu } from '@/lib/zpravyPravidla';
import { czCount } from '@/lib/czech';
import { nactiClenyTymu, zajistiClenove, kontextFiltru } from '@/lib/clenoveDb';
import {
  HROMADNE_AKCE, HROMADNA_MAX, BONUS_CELKEM_MAX, normalizujFiltr, splnujeFiltr, chybaBonusu, normalizujKlicAkce, PRAZDNY_FILTR,
} from '@/lib/clenoveFiltr';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const KLIC_AKCE: Record<string, string> = {
  group: 'zakaznici.skupiny', points: 'vernost.upravit_body', message: 'zakaznici.zpravy',
};

export async function POST(req: NextRequest) {
  const ctx = await pozaduj(['zakaznici.skupiny', 'vernost.upravit_body', 'zakaznici.zpravy']);
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const akce = String(b.action ?? '');
  if (!(HROMADNE_AKCE as readonly string[]).includes(akce)) return NextResponse.json({ error: 'Tuhle hromadnou akci neznám.' }, { status: 400 });
  if (!ctx.role.opravneni.has(KLIC_AKCE[akce])) return NextResponse.json({ error: 'Tuhle akci nad hosty nemáš povolenou.' }, { status: 403 });
  // Výběr hostů předpokládá seznam členů.
  if (!ctx.role.opravneni.has('zakaznici.zobrazit')) return NextResponse.json({ error: 'Členy klubu nemáš povoleno vidět.' }, { status: 403 });
  const klic = normalizujKlicAkce(b.key);
  if (!klic) return NextResponse.json({ error: 'Chybí klíč akce. Obnov stránku a zkus to znovu.' }, { status: 400 });
  await zajistiClenove();
  await zajistiSchemaClenu();

  // ---- výběr hostů ----
  let ids: number[] = [];
  if (Array.isArray(b.ids)) {
    const zadane = [...new Set((b.ids as unknown[]).map(x => Math.round(Number(x))).filter(n => Number.isFinite(n) && n > 0))];
    if (zadane.length > HROMADNA_MAX) return NextResponse.json({ error: `Najednou jde vybrat nejvýš ${HROMADNA_MAX} hostů.` }, { status: 400 });
    // Jen skuteční členové tohoto podniku; cizí id se zahodí.
    const r = zadane.length ? await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${u.team_id} AND customer_id = ANY(${zadane})` as any[] : [];
    ids = r.map(x => Number(x.customer_id));
  } else if (b.filter && typeof b.filter === 'object') {
    const f = normalizujFiltr(b.filter as Record<string, unknown>);
    const vsichni = await nactiClenyTymu(u.team_id);
    const poHostu = new Map<number, Set<number>>(vsichni.map(c => [c.id, new Set(c.skupiny.map(g => g.id))]));
    const k = { ...kontextFiltru(), hledatEmail: ctx.role.opravneni.has('zakaznici.kontakty'), skupinyHosta: (id: number) => poHostu.get(id) };
    ids = vsichni.filter(c => splnujeFiltr(c, f ?? PRAZDNY_FILTR, k)).map(c => c.id);
    if (ids.length > HROMADNA_MAX) {
      return NextResponse.json({ error: `Filtr odpovídá ${czCount(ids.length, { one: 'hostovi', few: 'hostům', many: 'hostům' })}, najednou jde nejvýš ${HROMADNA_MAX}. Zúži filtr.` }, { status: 400 });
    }
    // Seznam se mezitím mohl změnit (host přišel, bod připsán): uživatel potvrzoval jiný počet.
    const ocekavano = Number(b.expected);
    if (Number.isFinite(ocekavano) && ocekavano !== ids.length) {
      return NextResponse.json({ error: `Výběr se mezitím změnil (bylo ${ocekavano}, teď je ${ids.length}). Zkontroluj ho a potvrď znovu.` }, { status: 409 });
    }
  } else {
    return NextResponse.json({ error: 'Nikdo není vybrán.' }, { status: 400 });
  }
  if (!ids.length) return NextResponse.json({ error: 'Nikdo není vybrán.' }, { status: 400 });

  // ---- klíč akce: první požadavek ho přivlastní, opakování dostane 409 ----
  // (Klíč se bere až po ověření výběru, aby chybný pokus neublokoval opravený.)
  const gate = await hit(`clenove-bulk:${u.team_id}:${klic}`, 1, 3600, { failClosed: true });
  if (!gate.ok) return NextResponse.json({ error: 'Tahle akce už proběhla. Obnov seznam, ať vidíš výsledek.' }, { status: 409 });

  if (akce === 'group') {
    const gid = parseInt(String(b.groupId), 10);
    const odebrat = b.mode === 'remove';
    const [g] = await sql`SELECT id, name, rules FROM client_groups WHERE id = ${Number.isFinite(gid) ? gid : 0} AND team_id = ${u.team_id}` as any[];
    if (!g) return NextResponse.json({ error: 'Skupina nenalezena.' }, { status: 404 });
    if (g.rules) return NextResponse.json({ error: 'Do dynamické skupiny hosty ručně nepřidáváš, členy jí určují pravidla.' }, { status: 400 });
    const r = odebrat
      ? await sql`DELETE FROM client_group_members WHERE group_id = ${g.id} AND team_id = ${u.team_id} AND customer_id = ANY(${ids}) RETURNING customer_id` as any[]
      : await sql`
          INSERT INTO client_group_members (group_id, customer_id, team_id)
          SELECT ${g.id}, m.customer_id, ${u.team_id} FROM client_memberships m
          WHERE m.team_id = ${u.team_id} AND m.customer_id = ANY(${ids})
          ON CONFLICT (group_id, customer_id) DO NOTHING
          RETURNING customer_id` as any[];
    await audit(u.team_id, u.id, 'client.bulk', 'client', Number(g.id), `${odebrat ? 'odebráno ze skupiny' : 'přidáno do skupiny'} ${String(g.name)}: ${r.length} z ${ids.length} hostů`);
    return NextResponse.json({ ok: true, vybrano: ids.length, zmeneno: r.length, preskoceno: ids.length - r.length });
  }

  if (akce === 'points') {
    const chyba = chybaBonusu(b.delta);
    if (chyba) return NextResponse.json({ error: chyba }, { status: 400 });
    const delta = Number(b.delta);
    if (delta * ids.length > BONUS_CELKEM_MAX) {
      return NextResponse.json({ error: `Celkem by se rozdalo víc než ${BONUS_CELKEM_MAX.toLocaleString('cs')} bodů. Sniž bonus, nebo zúž výběr.` }, { status: 400 });
    }
    const poznamka = String(b.note ?? '').trim().slice(0, 120) || 'Bonus od podniku';
    // Jedním příkazem: body se přičtou a deník se zapíše jen těm, komu se připsaly (atomicky).
    const r = await sql`
      WITH u AS (
        UPDATE client_memberships SET points = points + ${delta}
        WHERE team_id = ${u.team_id} AND customer_id = ANY(${ids}) AND blocked = FALSE
        RETURNING customer_id
      )
      INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note)
      SELECT ${u.team_id}, customer_id, ${delta}, 'manual', ${`bulk:${klic}`}, ${poznamka} FROM u
      RETURNING customer_id` as any[];
    await audit(u.team_id, u.id, 'client.bulk', 'client', null, `bonus ${delta} b. × ${r.length} hostů (${poznamka})`);
    return NextResponse.json({ ok: true, vybrano: ids.length, zmeneno: r.length, celkem: delta * r.length });
  }

  // akce === 'message'
  const k = zkontrolujZpravu({ ...(b.message ?? {}), audience: 'all', scheduledAt: null });
  if ('chyba' in k) return NextResponse.json({ error: k.chyba }, { status: 400 });
  if (k.data.couponId || k.data.promoId) {
    if (!ctx.role.opravneni.has('kupony.spravovat')) return NextResponse.json({ error: 'Připojit kupon nebo promo kód smí jen ten, kdo je spravuje.' }, { status: 403 });
    const n = await nactiPrilohu(u.team_id, k.data.couponId, k.data.promoId);
    if ('chyba' in n) return NextResponse.json({ error: n.chyba }, { status: 400 });
  }
  const r = await odesliZpravu({ teamId: u.team_id, userId: u.id, data: k.data, ids, audience: 'selection' });
  if (!r.ok) return NextResponse.json({ error: r.chyba }, { status: r.status });
  await audit(u.team_id, u.id, 'client.broadcast', 'client', null, `${k.data.title} · ${r.doruceno} z ${ids.length} vybraných hostů`);
  return NextResponse.json({ ok: true, vybrano: ids.length, zmeneno: r.doruceno, ztlumeno: r.ztlumeno });
}
