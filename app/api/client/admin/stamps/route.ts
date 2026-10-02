// Správa razítkových kampaní. Vedení jich může mít víc vedle sebe — každá
// říká, za co se razítko připisuje, kolik jich je potřeba a co je odměna.
//
// GET                  seznam kampaní se stavem (koncept / naplánováno / běží / pozastaveno / skončila / archiv)
// GET ?stats=ID        statistiky kampaně (odměny, doba sbírání, top hosté, výnosnost, rozpad po dnech)
// GET ?export=ID       CSV hostů na kampani (&udalosti=1 = CSV deníku razítek)
// POST                 nová kampaň; { action: 'duplicate', id } kopie; { action: 'manual', … } ruční úprava razítek
// PATCH                úprava; { action: 'toggle' | 'archive' | 'restore' | 'publish' | 'move', id }
// DELETE ?id=&force=1  smazání (s nasbíranými razítky jen s force; doporučená cesta je archiv)

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { pragueToday, dbTimeDayHM } from '@/lib/pragueTime';
import { shapeCampaign, addStamps, odeberRazitka, statistikyKampane, stornujPosledni } from '@/lib/stamps';
import { zajistiRazitka } from '@/lib/stampsSchema';
import {
  polePole, overKampan, stavKampane, razitkaCsv, udalostiCsv, DRUH_UDALOSTI, type PoleKampane,
} from '@/lib/razitkaPravidla';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const MAX_HROMADNE = 200;
const csvOdpoved = (text: string, soubor: string) => new NextResponse(text, {
  headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${soubor}"`, 'Cache-Control': 'private, no-store' },
});

/** Jmenné odkazy položek nabídky pro editor (id → jméno) — jedním dotazem. */
async function itemNames(teamId: number, ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  const rows = await sql`
    SELECT mi.id, mi.name FROM menu_items mi
    JOIN menu_sections ms ON ms.id = mi.section_id
    JOIN menu_boards mb ON mb.id = ms.board_id AND mb.team_id = ${teamId}
    WHERE mi.id = ANY(${ids})`;
  return new Map((rows as any[]).map(r => [Number(r.id), String(r.name)]));
}

async function sectionNames(teamId: number, ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  const rows = await sql`
    SELECT ms.id, ms.title FROM menu_sections ms
    JOIN menu_boards mb ON mb.id = ms.board_id AND mb.team_id = ${teamId}
    WHERE ms.id = ANY(${ids})`;
  return new Map((rows as any[]).map(r => [Number(r.id), String(r.title)]));
}

const cislo = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; };

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const q = req.nextUrl.searchParams;
  const dnes = pragueToday();
  try {
    await zajistiRazitka();
    const statId = cislo(q.get('stats'));
    if (statId) {
      const [c] = await sql`SELECT id, name FROM client_stamp_campaigns WHERE id = ${statId} AND team_id = ${u.team_id}`;
      if (!c) return NextResponse.json({ error: 'Kampaň nenalezena.' }, { status: 404 });
      return NextResponse.json({ nazev: String(c.name), ...(await statistikyKampane(u.team_id, statId, dnes)) });
    }
    const expId = cislo(q.get('export'));
    if (expId) {
      // Export nese e-maily členů: smí jen ten, kdo kampaně spravuje.
      if (!ctx.role.opravneni.has('vernost.kampane')) return NextResponse.json({ error: 'Na tohle nemáš v tomto podniku oprávnění.' }, { status: 403 });
      const [c] = await sql`SELECT id, name FROM client_stamp_campaigns WHERE id = ${expId} AND team_id = ${u.team_id}`;
      if (!c) return NextResponse.json({ error: 'Kampaň nenalezena.' }, { status: 404 });
      const soubor = `razitka-${expId}-${dnes}.csv`;
      if (q.get('udalosti') === '1') {
        const rows = await sql`
          SELECT e.created_at, u.name AS host, e.delta, e.kind, e.note, e.amount, s.name AS obsluha
          FROM client_stamp_events e LEFT JOIN users u ON u.id = e.customer_id LEFT JOIN users s ON s.id = e.staff_id
          WHERE e.team_id = ${u.team_id} AND e.campaign_id = ${expId} AND e.undone_at IS NULL ORDER BY e.id DESC LIMIT 20000` as any[];
        return csvOdpoved(udalostiCsv(rows.map(r => ({
          datum: dbTimeDayHM(r.created_at), host: String(r.host ?? ''), zmena: Number(r.delta) || 0, druh: DRUH_UDALOSTI[String(r.kind)] ?? String(r.kind),
          poznamka: String(r.note ?? ''), obsluha: String(r.obsluha ?? ''), castka: r.amount == null ? null : Number(r.amount),
        }))), `razitka-udalosti-${expId}-${dnes}.csv`);
      }
      const rows = await sql`
        SELECT us.name, us.email, p.stamps, p.completed, p.started_at, p.last_stamp_at, p.last_completed_at, p.expired_stamps
        FROM client_stamp_progress p JOIN users us ON us.id = p.customer_id
        WHERE p.team_id = ${u.team_id} AND p.campaign_id = ${expId} ORDER BY p.completed DESC, p.stamps DESC, us.name LIMIT 20000` as any[];
      return csvOdpoved(razitkaCsv(rows.map(r => ({
        host: String(r.name ?? ''), email: String(r.email ?? ''), razitka: Number(r.stamps) || 0, dokonceno: Number(r.completed) || 0,
        zacatek: r.started_at ? dbTimeDayHM(r.started_at) : '', posledniRazitko: r.last_stamp_at ? dbTimeDayHM(r.last_stamp_at) : '',
        posledniDokonceni: r.last_completed_at ? dbTimeDayHM(r.last_completed_at) : '', vypraselo: Number(r.expired_stamps) || 0,
      }))), soubor);
    }

    const [rows, stats] = await Promise.all([
      sql`SELECT * FROM client_stamp_campaigns WHERE team_id = ${u.team_id} ORDER BY position, id`,
      sql`
        SELECT campaign_id, COUNT(*)::int AS collectors,
               COALESCE(SUM(stamps), 0)::int AS open_stamps,
               COALESCE(SUM(completed), 0)::int AS completions
        FROM client_stamp_progress WHERE team_id = ${u.team_id} GROUP BY campaign_id`,
    ]);
    const byId = new Map((stats as any[]).map(r => [Number(r.campaign_id), r]));
    const shaped = (rows as any[]).map(shapeCampaign);
    const ids = Array.from(new Set(shaped.flatMap(c => [...c.stamp_items, ...c.reward_items, ...c.excluded_items].map(x => x.itemId))));
    const secIds = Array.from(new Set(shaped.flatMap(c => [...c.stamp_sections, ...c.excluded_sections].map(x => x.sectionId))));
    const [names, secNames] = await Promise.all([itemNames(u.team_id, ids), sectionNames(u.team_id, secIds)]);
    const ref = (x: { itemId: number }) => ({ itemId: x.itemId, name: names.get(x.itemId) ?? `#${x.itemId}` });
    const sec = (x: { sectionId: number }) => ({ sectionId: x.sectionId, name: secNames.get(x.sectionId) ?? `#${x.sectionId}` });
    const campaigns = shaped.map(c => {
      const st = byId.get(c.id);
      return {
        ...c,
        stav: stavKampane({ active: c.active, draft: c.draft, archived_at: c.archived_at, valid_since: c.valid_since, valid_till: c.valid_till }, dnes),
        stampItems: c.stamp_items.map(ref), rewardItems: c.reward_items.map(ref), excludedItems: c.excluded_items.map(ref),
        stampSections: c.stamp_sections.map(sec), excludedSections: c.excluded_sections.map(sec),
        collectors: Number(st?.collectors) || 0,
        openStamps: Number(st?.open_stamps) || 0,
        completions: Number(st?.completions) || 0,
      };
    });
    return NextResponse.json({ campaigns, today: dnes });
  } catch {
    return NextResponse.json({ campaigns: [], notMigrated: true });
  }
}

/** Sloupce INSERT/UPDATE na jednom místě — kampaň se zakládá, upravuje i duplikuje stejně. */
async function vlozKampan(teamId: number, f: PoleKampane): Promise<number> {
  const [row] = await sql`
    INSERT INTO client_stamp_campaigns (
      team_id, name, description, conditions, active, draft, valid_since, valid_till,
      required_stamps, rule_type, stamp_items, stamp_sections, excluded_items, excluded_sections,
      min_value, min_value_multiple, one_per_order,
      reward_title, reward_items, days_to_finish, days_to_redeem, repeat_mode, stack_cards,
      max_completions, daily_cap, valid_days, hour_from, hour_till, combinable, card_color, card_icon, card_image, position)
    VALUES (
      ${teamId}, ${f.name}, ${f.description}, ${f.conditions}, ${f.active}, ${f.draft}, ${f.valid_since}, ${f.valid_till},
      ${f.required_stamps}, ${f.rule_type}, ${JSON.stringify(f.stamp_items)}::jsonb, ${JSON.stringify(f.stamp_sections)}::jsonb,
      ${JSON.stringify(f.excluded_items)}::jsonb, ${JSON.stringify(f.excluded_sections)}::jsonb,
      ${f.min_value}, ${f.min_value_multiple}, ${f.one_per_order},
      ${f.reward_title}, ${JSON.stringify(f.reward_items)}::jsonb, ${f.days_to_finish}, ${f.days_to_redeem}, ${f.repeat_mode}, ${f.stack_cards},
      ${f.max_completions}, ${f.daily_cap}, ${JSON.stringify(f.valid_days)}::jsonb, ${f.hour_from}, ${f.hour_till}, ${f.combinable},
      ${f.card_color}, ${f.card_icon}, ${f.card_image},
      (SELECT COALESCE(MAX(position), 0) + 1 FROM client_stamp_campaigns WHERE team_id = ${teamId}))
    RETURNING id`;
  return Number(row.id);
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? '');
  // Ruční úprava razítek hýbe stavem hosta (jako ruční body); kampaně zakládá a kopíruje, kdo je spravuje.
  const ctx = await pozaduj(action === 'manual' || action === 'storno' ? 'vernost.upravit_body' : 'vernost.kampane');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  try { await zajistiRazitka(); } catch { return NextResponse.json({ error: 'Razítka se zatím nepodařilo připravit. Zkus to za chvíli.' }, { status: 503 }); }

  if (action === 'duplicate') {
    const id = cislo(b.id);
    const [src] = id ? await sql`SELECT * FROM client_stamp_campaigns WHERE id = ${id} AND team_id = ${u.team_id}` : [];
    if (!src) return NextResponse.json({ error: 'Kampaň nenalezena.' }, { status: 404 });
    const c = shapeCampaign(src);
    // Kopie vzniká jako koncept, ať hned nezačne dávat razítka, a bez postupu hostů.
    const f = polePole({
      name: `${c.name} (kopie)`.slice(0, 120), description: c.description, conditions: c.conditions, active: true, draft: true,
      validSince: c.valid_since, validTill: c.valid_till, requiredStamps: c.required_stamps, ruleType: c.rule_type,
      stampItems: c.stamp_items, stampSections: c.stamp_sections, excludedItems: c.excluded_items, excludedSections: c.excluded_sections,
      minValue: c.min_value, minValueMultiple: c.min_value_multiple, onePerOrder: c.one_per_order,
      rewardTitle: c.reward_title, rewardItems: c.reward_items, daysToFinish: c.days_to_finish, daysToRedeem: c.days_to_redeem,
      repeatMode: c.repeat_mode, stackCards: c.stack_cards, maxCompletions: c.max_completions, dailyCap: c.daily_cap,
      validDays: c.valid_days, hourFrom: c.hour_from, hourTill: c.hour_till, combinable: c.combinable,
      cardColor: c.card_color, cardIcon: c.card_icon, cardImage: c.card_image,
    });
    const novaId = await vlozKampan(u.team_id, f);
    audit(u.team_id, u.id, 'client.stamps', 'stamp_campaign', novaId, `Zduplikována kampaň „${c.name}“`);
    return NextResponse.json({ ok: true, id: novaId });
  }

  if (action === 'storno') {
    // Storno poslední akce s razítky u hosta (stejná logika jako u kasy), volitelně jen na jedné kampani.
    const customerId = cislo(b.customerId);
    if (!customerId) return NextResponse.json({ error: 'Vyber hosta.' }, { status: 400 });
    const [clen] = await sql`SELECT 1 AS x FROM client_memberships WHERE team_id = ${u.team_id} AND customer_id = ${customerId}`;
    if (!clen) return NextResponse.json({ error: 'Tenhle host není členem podniku.' }, { status: 404 });
    const r = await stornujPosledni(u.team_id, customerId, { campaignId: cislo(b.campaignId), staffId: u.id });
    if (!r.ok) return NextResponse.json({ error: r.zprava }, { status: 409 });
    audit(u.team_id, u.id, 'client.stamps.manual', 'client', customerId, `Storno poslední akce s razítky: ${r.kampane.join(', ')}`);
    return NextResponse.json({ ok: true, message: r.zprava });
  }

  if (action === 'manual') {
    const campaignId = cislo(b.campaignId);
    const [row] = campaignId ? await sql`SELECT * FROM client_stamp_campaigns WHERE id = ${campaignId} AND team_id = ${u.team_id}` : [];
    if (!row) return NextResponse.json({ error: 'Kampaň nenalezena.' }, { status: 404 });
    const c = shapeCampaign(row);
    const delta = Math.round(Number(b.delta));
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 50) return NextResponse.json({ error: 'Počet razítek je celé číslo od −50 do 50, ne nula.' }, { status: 400 });
    const duvod = String(b.reason ?? '').trim().slice(0, 160);
    if (duvod.length < 3) return NextResponse.json({ error: 'Napiš důvod (aspoň pár slov) — zapíše se do historie hosta.' }, { status: 400 });
    // Příjemci: jeden host, výběr, nebo celá skupina. Jen členové tohoto podniku.
    let ids: number[] = Array.isArray(b.customerIds) ? b.customerIds.map(cislo).filter((x: number | null): x is number => x != null) : [];
    const jeden = cislo(b.customerId);
    if (jeden) ids.push(jeden);
    const skupina = cislo(b.groupId);
    if (skupina) {
      const g = await sql`SELECT customer_id FROM client_group_members WHERE team_id = ${u.team_id} AND group_id = ${skupina}`;
      ids.push(...(g as any[]).map(r => Number(r.customer_id)));
    }
    ids = Array.from(new Set(ids));
    if (!ids.length) return NextResponse.json({ error: 'Vyber hosta nebo skupinu.' }, { status: 400 });
    if (ids.length > MAX_HROMADNE) return NextResponse.json({ error: `Najednou nejvýš ${MAX_HROMADNE} hostů.` }, { status: 400 });
    const clenove = new Set(((await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${u.team_id} AND customer_id = ANY(${ids})`) as any[]).map(r => Number(r.customer_id)));
    const dobre: number[] = []; const preskoceno: { id: number; proc: string }[] = [];
    const hromadne = ids.length > 1;
    const ref = `ruc:${u.id}:${Date.now()}`;
    for (const cid of ids) {
      if (!clenove.has(cid)) { preskoceno.push({ id: cid, proc: 'Není členem podniku.' }); continue; }
      try {
        if (delta > 0) {
          const r = await addStamps(c, cid, delta, ref, ` — ručně: ${duvod}`, { kind: hromadne ? 'bulk' : 'manual', staffId: u.id, ignoreDailyCap: true });
          if (r.skipped) preskoceno.push({ id: cid, proc: r.skipped }); else dobre.push(cid);
        } else {
          const r = await odeberRazitka(c, cid, -delta, ref, duvod, u.id);
          if (r.removed === 0) preskoceno.push({ id: cid, proc: 'Nemá žádná razítka.' }); else dobre.push(cid);
        }
      } catch (e: any) { preskoceno.push({ id: cid, proc: e?.message || 'Nepovedlo se.' }); }
    }
    audit(u.team_id, u.id, 'client.stamps.manual', 'stamp_campaign', c.id, `${c.name}: ${delta > 0 ? '+' : ''}${delta} × ${dobre.length} hostů (${duvod})`);
    return NextResponse.json({ ok: dobre.length > 0, upraveno: dobre.length, preskoceno });
  }

  const f = polePole(b);
  const chyba = overKampan(f, b);
  if (chyba) return NextResponse.json({ error: chyba }, { status: 400 });
  const id = await vlozKampan(u.team_id, f);
  audit(u.team_id, u.id, 'client.stamps', 'stamp_campaign', id, `Založena kampaň „${f.name}“`);
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('vernost.kampane');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const id = cislo(b.id);
  if (!id) return NextResponse.json({ error: 'Neplatná kampaň' }, { status: 400 });
  try { await zajistiRazitka(); } catch { return NextResponse.json({ error: 'Razítka se zatím nepodařilo připravit. Zkus to za chvíli.' }, { status: 503 }); }
  const [cur] = await sql`SELECT * FROM client_stamp_campaigns WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!cur) return NextResponse.json({ error: 'Kampaň nenalezena' }, { status: 404 });
  const action = String(b.action ?? '');

  if (action === 'toggle') {
    await sql`UPDATE client_stamp_campaigns SET active = ${b.active !== false} WHERE id = ${id} AND team_id = ${u.team_id}`;
    audit(u.team_id, u.id, 'client.stamps', 'stamp_campaign', id, `${b.active !== false ? 'Spuštěna' : 'Pozastavena'} kampaň „${cur.name}“`);
    return NextResponse.json({ ok: true });
  }
  if (action === 'archive' || action === 'restore') {
    // Archiv schová kartu před hosty a z kasy, ale nechává postup, odměny i historii; jde vrátit.
    if (action === 'archive') await sql`UPDATE client_stamp_campaigns SET archived_at = NOW(), active = FALSE WHERE id = ${id} AND team_id = ${u.team_id}`;
    else await sql`UPDATE client_stamp_campaigns SET archived_at = NULL, draft = TRUE WHERE id = ${id} AND team_id = ${u.team_id}`;
    audit(u.team_id, u.id, 'client.stamps', 'stamp_campaign', id, `${action === 'archive' ? 'Archivována' : 'Vrácena z archivu (jako koncept)'} kampaň „${cur.name}“`);
    return NextResponse.json({ ok: true });
  }
  if (action === 'publish') {
    const f = shapeCampaign(cur);
    const chyba = overKampan(polePole({ ...f, requiredStamps: f.required_stamps, ruleType: f.rule_type, stampItems: f.stamp_items, stampSections: f.stamp_sections, minValue: f.min_value, validSince: f.valid_since, validTill: f.valid_till }), {});
    if (chyba) return NextResponse.json({ error: chyba }, { status: 400 });
    await sql`UPDATE client_stamp_campaigns SET draft = FALSE, active = TRUE WHERE id = ${id} AND team_id = ${u.team_id}`;
    audit(u.team_id, u.id, 'client.stamps', 'stamp_campaign', id, `Spuštěna kampaň „${cur.name}“ z konceptu`);
    return NextResponse.json({ ok: true });
  }
  if (action === 'move') {
    // Pořadí se přepíše jedním příkazem, ne dvojicí zápisů (přerušení uprostřed by nechalo dvě kampaně na stejném místě).
    const radky = (await sql`SELECT id FROM client_stamp_campaigns WHERE team_id = ${u.team_id} ORDER BY position, id`) as any[];
    const poradi = radky.map(r => Number(r.id));
    const i = poradi.indexOf(id);
    const j = b.direction === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= poradi.length) return NextResponse.json({ ok: true });
    [poradi[i], poradi[j]] = [poradi[j], poradi[i]];
    const poz = poradi.map((_, k) => k + 1);
    await sql`
      UPDATE client_stamp_campaigns c SET position = v.pos
      FROM (SELECT unnest(${poradi}::int[]) AS cid, unnest(${poz}::int[]) AS pos) v
      WHERE c.id = v.cid AND c.team_id = ${u.team_id}`;
    return NextResponse.json({ ok: true });
  }

  const f = polePole(b);
  const chyba = overKampan(f, b);
  if (chyba) return NextResponse.json({ error: chyba }, { status: 400 });
  await sql`
    UPDATE client_stamp_campaigns SET
      name = ${f.name}, description = ${f.description}, conditions = ${f.conditions}, active = ${f.active}, draft = ${f.draft},
      valid_since = ${f.valid_since}, valid_till = ${f.valid_till},
      required_stamps = ${f.required_stamps}, rule_type = ${f.rule_type},
      stamp_items = ${JSON.stringify(f.stamp_items)}::jsonb, stamp_sections = ${JSON.stringify(f.stamp_sections)}::jsonb,
      excluded_items = ${JSON.stringify(f.excluded_items)}::jsonb, excluded_sections = ${JSON.stringify(f.excluded_sections)}::jsonb,
      min_value = ${f.min_value}, min_value_multiple = ${f.min_value_multiple}, one_per_order = ${f.one_per_order},
      reward_title = ${f.reward_title}, reward_items = ${JSON.stringify(f.reward_items)}::jsonb,
      days_to_finish = ${f.days_to_finish}, days_to_redeem = ${f.days_to_redeem},
      repeat_mode = ${f.repeat_mode}, stack_cards = ${f.stack_cards},
      max_completions = ${f.max_completions}, daily_cap = ${f.daily_cap}, valid_days = ${JSON.stringify(f.valid_days)}::jsonb,
      hour_from = ${f.hour_from}, hour_till = ${f.hour_till}, combinable = ${f.combinable},
      card_color = ${f.card_color}, card_icon = ${f.card_icon}, card_image = ${f.card_image}
    WHERE id = ${id} AND team_id = ${u.team_id}`;
  audit(u.team_id, u.id, 'client.stamps', 'stamp_campaign', id, `Upravena kampaň „${f.name}“`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('vernost.kampane');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const url = new URL(req.url);
  const id = cislo(url.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'Neplatná kampaň' }, { status: 400 });
  try { await zajistiRazitka(); } catch { /* bez tabulek není co hlídat */ }
  const [cur] = await sql`SELECT name FROM client_stamp_campaigns WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!cur) return NextResponse.json({ ok: true });
  // Nasbíraná razítka hostů se bez vědomí nemažou: bez `force` server odmítne a řekne, kolik hostů o ně přijde.
  const [kdo] = await sql`SELECT COUNT(*)::int AS n FROM client_stamp_progress WHERE campaign_id = ${id} AND team_id = ${u.team_id} AND (stamps > 0 OR completed > 0)`;
  const n = Number(kdo?.n) || 0;
  if (n > 0 && url.searchParams.get('force') !== '1') {
    return NextResponse.json({ error: `Na kampani mají razítka nebo dokončené karty ${n} hosté. Smazáním o ně přijdou. Archivuj ji, nebo potvrď smazání.`, collectors: n, needsForce: true }, { status: 409 });
  }
  await sql`DELETE FROM client_stamp_progress WHERE campaign_id = ${id} AND team_id = ${u.team_id}`;
  await sql`DELETE FROM client_stamp_events WHERE campaign_id = ${id} AND team_id = ${u.team_id}`;
  await sql`DELETE FROM client_stamp_campaigns WHERE id = ${id} AND team_id = ${u.team_id}`;
  audit(u.team_id, u.id, 'client.stamps', 'stamp_campaign', id, `Smazána kampaň „${cur.name}“${n ? ` (${n} hostů přišlo o razítka)` : ''}`);
  return NextResponse.json({ ok: true });
}
