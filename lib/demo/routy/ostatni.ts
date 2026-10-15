// Ostatní části, které se objevují na přehledech (odměny, objednávky od stolu):
// jen tolik dat, aby widgety ukázaly obsah místo prázdného stavu.

import { chyba, ok, type Obsluha } from '../typy';
import { KDO_JSEM, LIDE, clen } from '../data/lide';
import { posunDen } from '../cas';
import type { DemoStav } from '../stav';
import { computeAutoPoints, normalizePoints } from '@/lib/rewardLevels';
import { nastaveniRezimu } from '@/lib/bodyRezim';
import { mojeRole } from './zaklad';

const UROVNE = [
  { name: 'Nováček', minPoints: 0, perks: '' },
  { name: 'Barista', minPoints: 150, perks: 'Sleva 10 % na vlastní nákup' },
  { name: 'Mistr', minPoints: 500, perks: 'Sleva 20 % a přednostní výběr směn' },
  { name: 'Legenda', minPoints: 1200, perks: 'Sleva 30 % a bonus k výplatě' },
];
const BODY = { task: 5, procedure: 10, closing: 15, ratingStar: 4, taskMissed: -5, procedureSkipped: -2, procedureMissed: -4, closingMissing: -10, closingBalanced: 3 };

/** Body lidí v ukázce (stabilní; tabulka ukazuje pořadí i postup do další úrovně). */
const BODY_LIDI: Record<number, number> = { 2: 640, 3: 236, 4: 122, 5: 410, 6: 74 };

function uroven(body: number) {
  let i = 0;
  UROVNE.forEach((u, idx) => { if (body >= u.minPoints) i = idx; });
  const dalsi = UROVNE[i + 1] ?? null;
  const od = UROVNE[i].minPoints;
  return {
    levelName: UROVNE[i].name, levelIndex: i, perks: UROVNE[i].perks,
    next: dalsi ? { name: dalsi.name, minPoints: dalsi.minPoints, perks: '' } : null,
    pctToNext: dalsi ? Math.round(((body - od) / (dalsi.minPoints - od)) * 100) : 100,
    pointsIntoLevel: body - od, pointsForNext: dalsi ? dalsi.minPoints - od : 0,
  };
}

const rozpis = (b: number) => ({ tasks: Math.round(b / 30), procedures: Math.round(b / 60), closings: Math.round(b / 80), reviewPoints: Math.round(b * 0.4), ratedShifts: Math.round(b / 35), autoPoints: 0, itemPoints: 0, flagged: 0, awards: 0, awardCount: 0 });

/**
 * Je směna ohodnocená? Starší než dva dny bere ukázka jako dávno ohodnocené
 * (jinak by Odměny ukazovaly desítky nehodnocených směn); poslední dva dny
 * čekají na vedení, dokud v ukázce někdo neohodnotí. Jeden zdroj pravdy pro
 * seznam, počítadla i „k hodnocení" v žebříčku.
 */
function jeOhodnoceno(s: DemoStav, kdo: number, den: string): boolean {
  if (den < posunDen(s.dnes, -2)) return true;
  return s.hodnoceni.some(h => h.employeeId === kdo && h.date === den);
}

/** Směny, které čekají na hodnocení (poslední dva dny a dnešek, jako měsíční soupiska). */
function cekajiciSmeny(s: DemoStav) {
  const od = posunDen(s.dnes, -2);
  return s.smeny.filter(x => x.date >= od && x.date <= s.dnes && !jeOhodnoceno(s, x.employeeId, x.date));
}

function nazevSmeny(s: DemoStav, x: { type: string }): string {
  return s.typySmen.find(t => t.name === x.type)?.name ?? x.type;
}

/** Přepočty bodů v paměti ukázky (kolo 91). */
const PREPOCTY: { id: number; kdo: string | null; kdy: string; rozsah: unknown; souhrn: { zaznamu: number; lidi: number; celkem: number; doMinusu: number }; vraceno: string | null }[] = [];

export const ostatni: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, metoda, q } = p;
  const meId = KDO_JSEM[s.role];
  const opr = new Set(mojeRole(s).opravneni);

  if (cesta === '/api/rewards' && metoda === 'GET') {
    const moje = BODY_LIDI[meId] ?? 0;
    const ja = { points: moje, breakdown: rozpis(moje), ...uroven(moje) };
    const reviews = [
      { work_date: posunDen(s.dnes, -1), rating: 5, note: 'Skvěle zvládnutý páteční nával, díky!', points: 20, autoPoints: 0, flagged: false, scope: 'shift', seen_at: null, created_at: `${posunDen(s.dnes, -1)}T21:00:00Z` },
      { work_date: posunDen(s.dnes, -4), rating: 4, note: null, points: 16, autoPoints: 0, flagged: false, scope: 'individual', seen_at: `${posunDen(s.dnes, -3)}T08:00:00Z`, created_at: `${posunDen(s.dnes, -4)}T21:00:00Z` },
    ];
    const telo: Record<string, unknown> = { role: s.role === 'vedeni' ? 'employer' : 'employee', levels: UROVNE, points: BODY, rezim: nastaveniRezimu(null), me: ja, reviews, items: [], unseenFlagged: 0 };
    if (opr.has('odmeny.zebricek') || s.role === 'vedeni') {
      telo.standings = LIDE.filter(l => l.role === 'employee').map(l => {
        const b = BODY_LIDI[l.id] ?? 0;
        return { id: l.id, name: l.name, avatar: l.avatar, points: b, breakdown: rozpis(b), flagged: 0, flaggedUnseen: 0, pending: cekajiciSmeny(s).filter(x => x.employeeId === l.id).length, oldestPending: cekajiciSmeny(s).filter(x => x.employeeId === l.id).map(x => x.date).sort()[0] ?? null, ...uroven(b) };
      }).sort((a, b) => b.points - a.points);
    }
    return ok(telo);
  }
  // ---- Výchozí způsob počítání bodů (kolo 91) pro okno postupu a úkolu ----
  if (cesta === '/api/body/vychozi' && metoda === 'GET') {
    const n = nastaveniRezimu(null);
    return ok({ postupy: { ...n.postupy, zaklad: BODY.procedure }, ukoly: { ...n.ukoly, zaklad: BODY.task }, uzaverky: { ...n.uzaverky, zaklad: BODY.closing }, stropZap: n.stropZap, denniStrop: n.denniStrop, stropZdroje: n.stropZdroje, stropOd: n.stropOd });
  }
  // ---- Přepočet bodů zpětně (kolo 91): náhled dopadu a historie jen v paměti ukázky ----
  if (cesta === '/api/body/prepocet') {
    if (!opr.has('odmeny.nastaveni')) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
    if (metoda === 'GET') return ok({ historie: PREPOCTY.map((h, i) => ({ ...h, lzeVratit: i === 0 && !h.vraceno })) });
    const b = p.telo ?? {};
    if (b.vratit != null) {
      const h = PREPOCTY[0];
      if (!h || h.id !== Number(b.vratit) || h.vraceno) return chyba('Vrátit jde jen poslední přepočet.', 409);
      h.vraceno = new Date().toISOString();
      return ok({ ok: true, historie: PREPOCTY.map(x => ({ ...x, lzeVratit: false })) });
    }
    const druhy: string[] = Array.isArray(b.rozsah?.druhy) ? b.rozsah.druhy : [];
    const polozka = b.rozsah?.typ === 'postup' || b.rozsah?.typ === 'ukol';
    const zaznamu = polozka ? 4 : druhy.length * 9;
    const nahled = { zaznamu, lidi: zaznamu ? Math.min(3, zaznamu) : (b.rozsah?.zpetneStrop ? 2 : 0), celkem: zaznamu ? -zaznamu * 2 : (b.rozsah?.zpetneStrop ? -36 : 0), doMinusu: [],
      clenove: LIDE.filter(l => l.role === 'employee').slice(0, 2).map((l, i) => ({ uid: l.id, jmeno: l.name, pred: BODY_LIDI[l.id] ?? 0, po: (BODY_LIDI[l.id] ?? 0) - 10 - i * 8 })) };
    if (b.nahled !== false) return ok({ nahled });
    PREPOCTY.unshift({ id: Date.now(), kdo: clen(meId)?.name ?? null, kdy: new Date().toISOString(), rozsah: b.rozsah ?? null, souhrn: { zaznamu, lidi: nahled.lidi, celkem: nahled.celkem, doMinusu: 0 }, vraceno: null });
    return ok({ ok: true, id: PREPOCTY[0].id, nahled, historie: PREPOCTY.map((h, i) => ({ ...h, lzeVratit: i === 0 })) });
  }

  // ---- Pochvaly s body (kolo 5) ----
  if (cesta === '/api/rewards/awards') {
    if (!opr.has('hodnoceni.zobrazit')) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
    const jmeno = (id: number) => LIDE.find(l => l.id === id);
    const tvar = (a: DemoStav['pochvaly'][number]) => ({ id: a.id, userId: a.userId, name: jmeno(a.userId)?.name ?? '', avatar: jmeno(a.userId)?.avatar ?? null, points: a.points, reason: a.reason, givenBy: jmeno(a.givenBy)?.name ?? null, createdAt: a.createdAt });
    if (metoda === 'POST') {
      if (!opr.has('hodnoceni.hodnotit')) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
      const b = p.telo ?? {};
      const points = Math.round(Number(b.points));
      if (!Number.isFinite(points) || points < 1 || points > 500) return chyba('Body musí být 1 až 500.', 400);
      const a = { id: Date.now(), userId: Number(b.userId), points, reason: b.reason ? String(b.reason).slice(0, 200) : null, givenBy: meId, createdAt: new Date().toISOString() };
      s.pochvaly.unshift(a);
      return ok({ award: tvar(a) });
    }
    if (metoda === 'DELETE') { s.pochvaly = s.pochvaly.filter(a => String(a.id) !== q.get('id')); return ok({ ok: true }); }
    const ukazka: DemoStav['pochvaly'] = [
      { id: 1, userId: 2, points: 20, reason: 'Zaskočila za nemocnou kolegyni', givenBy: meId, createdAt: `${posunDen(s.dnes, -2)}T15:10:00Z` },
      { id: 2, userId: 3, points: 10, reason: 'Vzorně vyčištěný mlýnek', givenBy: meId, createdAt: `${posunDen(s.dnes, -6)}T19:40:00Z` },
    ];
    return ok({ awards: [...s.pochvaly, ...ukazka].map(tvar) });
  }
  if (cesta === '/api/rewards/catalog') {
    return ok({
      catalog: [
        { id: 1, team_id: 1, title: 'Káva zdarma na směně', icon: '☕', cost: 50, active: true, zOrganizace: false, sdileno: false, spravuje: null },
        { id: 2, team_id: 1, title: 'Volný pátek', icon: null, cost: 300, active: true, zOrganizace: false, sdileno: false, spravuje: null },
        { id: 3, team_id: 1, title: 'Oběd na účet podniku', icon: '🍝', cost: 120, active: true, zOrganizace: false, sdileno: false, spravuje: null },
      ],
      redemptions: [],
    });
  }

  // ---- Hodnocení směn (Odměny, widget Ohodnotit směny) ----
  if (cesta === '/api/shift-reviews') {
    if (!opr.has('hodnoceni.zobrazit')) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
    const hodnotitele = LIDE.filter(l => l.role === 'employee');
    const tvarHodnoceni = (kdo: number, den: string) => s.hodnoceni.find(h => h.employeeId === kdo && h.date === den);
    if (metoda === 'POST') {
      const b = p.telo ?? {};
      const den = String(b.date ?? '');
      const ids: number[] = b.applyToShift && Array.isArray(b.employeeIds) && b.employeeIds.length ? b.employeeIds.map(Number) : [Number(b.employeeId)];
      for (const id of ids.filter(Number.isFinite)) {
        s.hodnoceni = s.hodnoceni.filter(h => !(h.employeeId === id && h.date === den));
        s.hodnoceni.push({ employeeId: id, date: den, rating: Math.max(0, Math.min(5, Math.round(Number(b.rating) || 0))), note: b.note ? String(b.note) : null, points: Math.round(Number(b.points) || 0), flagged: b.flagged === true, createdAt: new Date().toISOString() });
      }
      k.hlas('smena-ohodnocena', { den, lidi: ids.length });
      return ok({ ok: true });
    }
    if (metoda === 'PATCH') return ok({ ok: true });
    const mesic = q.get('month');
    const kdo = q.get('employeeId');
    if (!kdo && mesic) {
      const dny = new Map<string, number[]>();
      for (const x of s.smeny.filter(x => x.date.startsWith(mesic + '-') && hodnotitele.some(l => l.id === x.employeeId))) {
        const a = dny.get(x.date) ?? [];
        if (!a.includes(x.employeeId)) a.push(x.employeeId);
        dny.set(x.date, a);
      }
      const days = Array.from(dny.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, ids]) => {
        const staff = ids.map(id => ({ id, name: clen(id).name, avatar: clen(id).avatar, reviewed: jeOhodnoceno(s, id, date), rating: tvarHodnoceni(id, date)?.rating ?? (jeOhodnoceno(s, id, date) ? 4 : 0), flagged: false }))
          .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
        return { date, staff, pending: staff.filter(x => !x.reviewed).length };
      });
      return ok({ month: mesic, days });
    }
    const den = q.get('date') ?? s.dnes;
    if (!kdo) {
      const list = hodnotitele.map(l => {
        const sm = s.smeny.find(x => x.employeeId === l.id && x.date === den);
        const rv = tvarHodnoceni(l.id, den);
        const hotovo = !!sm && jeOhodnoceno(s, l.id, den);
        return {
          id: l.id, name: l.name, avatar: l.avatar, worked: !!sm, reviewed: hotovo, rating: rv?.rating ?? (hotovo ? 4 : 0), points: rv?.points ?? 0, flagged: rv?.flagged === true,
          shiftLabel: sm ? nazevSmeny(s, sm) : null, startTime: sm?.startTime ?? null, endTime: sm?.endTime ?? null,
          coworkerIds: sm ? s.smeny.filter(x => x.date === den && x.employeeId !== l.id && x.startTime === sm.startTime).map(x => x.employeeId) : [],
        };
      }).sort((a, b) => Number(b.worked) - Number(a.worked) || a.name.localeCompare(b.name, 'cs'));
      return ok({ date: den, list });
    }
    // Detail jedné směny (okno Ohodnotit): co člověk ten den udělal.
    const id = Number(kdo);
    const sm = s.smeny.find(x => x.employeeId === id && x.date === den);
    const ukoly = s.ukoly.filter(u => (u.completedBy === id && u.status === 'done' && (u.completedAt ?? '').slice(0, 10) === den) || (u.status !== 'done' && u.dueDate === den && u.assignedTo === id))
      .map(u => ({ id: u.id, title: u.title, description: u.description, priority: u.priority, checklist: u.checklist, reviewNote: null, state: u.status === 'done' ? 'done' as const : 'missed' as const, item: null }));
    const uz = s.uzaverky.find(u => u.shift_date === den && u.shiftEmployees.includes(id));
    const closing = uz ? {
      id: uz.id, approved: uz.approved, shiftLabel: uz.shift_label, openingCash: uz.opening_cash, cashRevenue: uz.cash_revenue, cardRevenue: uz.card_revenue, tips: uz.tips,
      expenses: uz.expenses, cashRemoved: uz.cash_removed, selfPayout: uz.self_payout, closingCash: uz.closing_cash, customers: uz.customers, notes: uz.notes, reviewNote: null,
      tipsInDrawer: false, expected: uz.closing_cash, difference: 0, item: null, filedByName: uz.created_by !== id ? clen(uz.created_by).name : null, date: uz.date,
    } : null;
    const rv = tvarHodnoceni(id, den);
    const hadShift = !!sm;
    return ok({
      employee: { id, name: clen(id).name, avatar: clen(id).avatar },
      date: den, hadShift, shift: sm ? { startTime: sm.startTime, endTime: sm.endTime, label: nazevSmeny(s, sm) } : null,
      coworkers: sm ? s.smeny.filter(x => x.date === den && x.employeeId !== id && x.startTime === sm.startTime).map(x => ({ id: x.employeeId, name: clen(x.employeeId).name, avatar: clen(x.employeeId).avatar })) : [],
      tasks: ukoly, procedures: [], closing,
      review: rv ? { rating: rv.rating, note: rv.note, points: rv.points, autoPoints: 0, flagged: rv.flagged, scope: 'individual', nahraditAuto: true } : null,
      autoPoints: computeAutoPoints({ hadShift, tasks: ukoly, procedures: [], closing }, normalizePoints(null)),
      // Kolo 91: automatické body dne po stropu (ukázka: nasbíral víc než strop).
      den: hadShift ? { efektivni: 30, nasbirano: 42, uprava: -12, zastropovano: true, strop: 30, stropPlati: true, nahrazeno: false, automaticky: 30 } : null,
    });
  }

  // ---- Příjem u obsluhy: objednávky hostů od stolu ----
  if (cesta === '/api/client/staff/inbox') {
    const hodinaZpet = Date.now() - 3 * 3600_000;
    // Jako skutečná routa: nové a rozpracované, hotové a odmítnuté jen poslední tři hodiny; nové nahoře.
    const viditelne = s.objednavkyHostu
      .filter(o => o.status === 'new' || o.status === 'confirmed' || new Date(o.updatedAt).getTime() > hodinaZpet)
      .sort((a, b) => ['new', 'confirmed', 'done', 'declined'].indexOf(a.status) - ['new', 'confirmed', 'done', 'declined'].indexOf(b.status) || a.createdAt.localeCompare(b.createdAt));
    if (metoda === 'PATCH') {
      const o = s.objednavkyHostu.find(x => x.id === Number(p.telo?.id));
      if (!o) return chyba('Stav objednávky se nepodařilo změnit.');
      if (p.telo?.action === 'pos') return ok({ ok: true, posOk: true, posNote: 'Objednávka je v pokladně.' });
      const dalsi = String(p.telo?.status ?? '');
      if (dalsi !== 'confirmed' && dalsi !== 'declined' && dalsi !== 'done') return chyba('Neznámý stav');
      o.status = dalsi; o.updatedAt = new Date().toISOString();
      k.hlas('objednavka-hosta-prijata', { id: o.id, stav: dalsi });
      return ok({ ok: true });
    }
    const cas = (iso: string) => iso.replace('T', ' ').slice(0, 19);
    return ok({
      orders: viditelne.map(o => ({ id: o.id, status: o.status, items: o.items, total: o.total, created_at: cas(o.createdAt), customer_name: o.customerName, table_name: o.tableName, via_qr: true, geo_status: 'ok', geo_distance_m: 9, storyous_order_id: null })),
      reservations: [],
      newCount: viditelne.filter(o => o.status === 'new').length, stuck: 0, today: s.dnes,
      pos: { connected: true, autoPos: true, tables: 8, tablesPaired: 8, items: 24, itemsLinked: 24 },
    });
  }

  // ---- Kartička hosta u kasy (CardScan, čtečka) a párování s účtem z pokladny ----
  // Ukázkový podnik pokladnu Storyous nemá: párování se nekreslí (pos: false) a kasa se chová
  // jako bez pokladny — host se načte a razítko nebo body z částky se jen ohlásí.
  if (cesta === '/api/client/staff/claims') {
    if (metoda === 'PATCH') return chyba('Ukázka nemá napojenou pokladnu.', 409);
    return ok({ pos: false, ceka: [], hotovo: [], stoly: [] });
  }
  if (cesta === '/api/client/staff/scan') {
    const host = {
      customer: { id: 901, name: 'Klára Vojtíšková' }, member: true, points: 120, credit: 0, stamps: 3, visits: 6, spend: 1840,
      campaigns: [], posledniAkce: null, polozky: [], lastVisit: null, birthdayToday: false, tierBy: 'visits',
      levelLabel: 'Člen', tier: 'bronze', discount: 0, discountSource: null, discountName: null, tierDiscount: 0,
      nextTierAt: 10, nextTierLabel: 'Stříbrný', nextTierUnit: 'visits', stampedToday: false, openCoupons: [], affordable: [],
      bills: [], parovani: null,
      rules: { pointsPer100: 5, stampTarget: 8, stampReward: 'Káva zdarma', cashbackPct: 0, bodyPravidla: null },
    };
    if (metoda === 'POST') {
      const akce = String(p.telo?.action ?? '');
      if (akce === 'stamp') return ok({ ok: true, message: 'Klára Vojtíšková: razítko 4/8.', ...host, stamps: 4, stampedToday: true });
      if (akce === 'points') return ok({ ok: true, message: `Klára Vojtíšková: +${Math.floor((Number(p.telo?.amount) || 0) / 100) * 5} bodů.`, ...host });
      return chyba('V ukázce jde dát razítko nebo body z částky.', 400);
    }
    return ok(host);
  }
  return undefined;
};
