// Uzávěrky a jejich zámek. Zámek se počítá ze stejných dat jako úkoly
// (routy/ukoly.ts), takže odškrtnutí povinného úkolu ho odemkne: formulář
// se po PATCH /api/tasks znovu zeptá /api/closings/povinne a dostane
// `zamceno: false`. POST /api/closings pak uspěje a uzávěrka se objeví
// v seznamu. Pravidla zámku jsou skutečná (lib/povinnePredUzaverkou).

import { chyba, ok, type Obsluha } from '../typy';
import { KDO_JSEM, LIDE, clen } from '../data/lide';
import { posunDen } from '../cas';
import type { DemoStav, UzaverkaDemo } from '../stav';
import { mojeRole } from './zaklad';
import {
  jeZamceno, pocty, sestavStav, zpravaZamceno,
  type PovinnaPolozka, type StavPovinnych,
} from '@/lib/povinnePredUzaverkou';

export const ID_ZAVIRACIHO_POSTUPU = 3;
export const ID_POVINNEHO_NAVODU = 7;

/** Povinné věci dne: postup, povinné úkoly na dnešek a návod. */
export function stavPovinnych(s: DemoStav): StavPovinnych {
  const v: PovinnaPolozka[] = [];
  v.push({
    typ: 'postup', id: ID_ZAVIRACIHO_POSTUPU, nazev: 'Zavírací postup', ikona: 'clipboard', hotovo: s.zaviraciPostupHotov,
    odkaz: { pohled: 'procedures', arg: String(ID_ZAVIRACIHO_POSTUPU), href: '/employee/shifts?view=procedures' },
  });
  for (const u of s.ukoly) {
    if (!u.requireBeforeClosing || u.dueDate !== s.dnes) continue;
    v.push({
      typ: 'ukol', id: u.id, nazev: u.title, ikona: 'check',
      kdo: u.assignedTo != null ? clen(u.assignedTo).name : 'Kdokoli', kdoId: u.assignedTo,
      hotovo: u.status === 'done',
      odkaz: { pohled: 'tasks', arg: String(u.id), href: '/employee/shifts?view=tasks' },
    });
  }
  v.push({
    typ: 'navod', id: ID_POVINNEHO_NAVODU, nazev: 'Nová pokladna: zavírání krok za krokem', ikona: 'book', hotovo: s.navodPrecten,
    odkaz: { pohled: 'guides', arg: String(ID_POVINNEHO_NAVODU), href: '/employee/shifts?view=guides' },
  });
  return sestavStav(v);
}

function lidiUzaverky(ids: number[]) {
  return ids.map(id => ({ id, name: clen(id).name, avatar: clen(id).avatar }));
}

function tvar(u: UzaverkaDemo) {
  const a = clen(u.created_by);
  return {
    id: u.id, team_id: 1, created_by: u.created_by, date: u.date, shift_date: u.shift_date, shift_label: u.shift_label,
    opening_cash: u.opening_cash, cash_revenue: u.cash_revenue, card_revenue: u.card_revenue, tips: u.tips, tips_card: u.tips_card,
    expenses: u.expenses, cash_removed: u.cash_removed, self_payout: u.self_payout, closing_cash: u.closing_cash,
    customers: u.customers, notes: u.notes, approved: u.approved, covered_by: null,
    author_name: a.name, author_avatar: a.avatar, event_title: null, event_id: null,
    movements: u.movements, denominations: u.denominations, shiftEmployees: lidiUzaverky(u.shiftEmployees),
    final_removal: u.final_removal, created_at: u.created_at, handover: u.handover ?? null,
  };
}

const cislo = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(0, n) : 0; };

export const uzaverky: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, metoda, q } = p;
  const meId = KDO_JSEM[s.role];
  const opr = new Set(mojeRole(s).opravneni);
  const smiVse = opr.has('uzaverky.zobrazit_vse');
  const tablet = s.role === 'kiosk';

  // ---- Zámek uzávěrky ----
  if (cesta === '/api/closings/povinne' && metoda === 'GET') {
    const stav = stavPovinnych(s);
    const { celkem, hotovo } = pocty(stav);
    return ok({
      den: s.dnes, zamceno: jeZamceno(stav), polozky: stav.polozky, vsechny: stav.vsechny, neznamo: stav.neznamo,
      smiObejit: opr.has('uzaverky.obejit_postupy'), duvodVolna: null, celkem, hotovo,
    });
  }

  // ---- Seznam a odeslání ----
  if (cesta === '/api/closings') {
    if (metoda === 'GET') {
      const rows = (tablet ? [] : smiVse ? s.uzaverky : s.uzaverky.filter(u => u.created_by === meId))
        .slice().sort((a, b) => b.shift_date.localeCompare(a.shift_date) || b.created_at.localeCompare(a.created_at));
      // Které směny ještě nemají uzávěrku: člověk svoje, tablet celého týmu za poslední dny.
      const uzavrene = new Set(s.uzaverky.flatMap(u => u.shiftEmployees.map(e => `${u.shift_date}|${e}`)));
      const dnesSmeny = s.smeny.filter(x => x.date <= s.dnes && x.date >= posunDen(s.dnes, tablet ? -3 : -14));
      const eligibleShifts = opr.has('uzaverky.za_jineho') && !tablet ? [] : dnesSmeny
        .filter(x => (tablet || x.employeeId === meId) && !uzavrene.has(`${x.date}|${x.employeeId}`))
        .sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime))
        .map(x => tablet
          ? { id: x.id, date: x.date, startTime: x.startTime, endTime: x.endTime, type: x.type, employeeId: x.employeeId, employeeName: clen(x.employeeId).name, employeeAvatar: clen(x.employeeId).avatar }
          : { id: x.id, date: x.date, startTime: x.startTime, endTime: x.endTime, type: x.type });
      const zaJineho = opr.has('uzaverky.za_jineho') && !tablet;
      const scheduledByDate: Record<string, { id: number; name: string; avatar: string | null }[]> = {};
      if (smiVse) {
        for (const x of s.smeny.filter(x => x.date >= posunDen(s.dnes, -30) && x.date <= s.dnes)) {
          (scheduledByDate[x.date] ??= []).push({ id: x.employeeId, name: clen(x.employeeId).name, avatar: clen(x.employeeId).avatar });
        }
      }
      const zavreneDny = new Set(s.uzaverky.map(u => u.shift_date));
      const missingClosings = smiVse ? Object.keys(scheduledByDate).filter(d => !zavreneDny.has(d) && d < s.dnes).sort().reverse().map(date => ({ date, employees: scheduledByDate[date] })) : [];
      const missingToday = smiVse && scheduledByDate[s.dnes] && !zavreneDny.has(s.dnes) ? { date: s.dnes, employees: scheduledByDate[s.dnes] } : null;
      return ok({
        closings: rows.map(tvar), suggestedDate: s.dnes, canSeeAll: smiVse,
        payDailyCash: false, payoutFromRegister: true, tipsInDrawer: false, requiresShift: true,
        isEmployer: zaJineho, isKiosk: tablet, obejitPovinne: opr.has('uzaverky.obejit_postupy'),
        eligibleShifts,
        members: zaJineho ? LIDE.filter(l => l.role !== 'kiosk').map(l => ({ id: l.id, name: l.name, avatar: l.avatar, aktivniJinde: false })) : [],
        scheduledByDate, missingClosings, missingToday, meId,
      });
    }

    if (metoda === 'POST') {
      const b = p.telo ?? {};
      const autorId = b.employeeId && opr.has('uzaverky.za_jineho') ? Number(b.employeeId) : meId;
      const den = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date ?? '')) ? String(b.date) : s.dnes;
      // Brána na serveru: zamčenou uzávěrku nelze odeslat, dokud se neudělá povinné.
      const stav = stavPovinnych(s);
      if (jeZamceno(stav) && !opr.has('uzaverky.obejit_postupy')) {
        return chyba(zpravaZamceno(stav.polozky), 400, { kod: 'POVINNE_NESPLNENO', chybi: stav.polozky });
      }
      if (s.uzaverky.some(u => u.shift_date === den && u.shiftEmployees.includes(autorId))) {
        return chyba('Za tuto směnu už je uzávěrka odeslaná.', 409);
      }
      const spolu = Array.isArray(b.coworkers) ? b.coworkers.map(Number).filter(Number.isFinite) : [];
      const smena = s.smeny.find(x => x.date === den && x.employeeId === autorId);
      const nova: UzaverkaDemo = {
        id: ++s.dalsiId, created_by: autorId, date: den, shift_date: den,
        shift_label: String(b.shiftLabel || (smena ? `${smena.startTime}–${smena.endTime}` : '')),
        opening_cash: cislo(b.openingCash), cash_revenue: cislo(b.cashRevenue), card_revenue: cislo(b.cardRevenue),
        tips: cislo(b.tips), tips_card: cislo(b.tipsCard), expenses: cislo(b.expenses), cash_removed: cislo(b.cashRemoved),
        self_payout: cislo(b.selfPayout), closing_cash: cislo(b.closingCash), customers: cislo(b.customers),
        notes: b.notes ? String(b.notes) : null, approved: opr.has('uzaverky.bez_schvaleni'),
        movements: Array.isArray(b.movements) ? b.movements : [], denominations: b.denominations && typeof b.denominations === 'object' ? b.denominations : {},
        shiftEmployees: [autorId, ...spolu.filter((x: number) => x !== autorId)], final_removal: cislo(b.finalRemoval),
        created_at: new Date().toISOString(), handover: b.handover ?? null,
      };
      s.uzaverky.push(nova);
      k.hlas('uzaverka-odeslana', { id: nova.id, den, trzba: nova.cash_revenue + nova.card_revenue });
      return { status: 200, telo: { ok: true, closing: tvar(nova), approved: nova.approved, covered: spolu.length, tipsInDrawer: false, openClockIns: [] }, zpozdeni: 320 };
    }
  }
  if (cesta.startsWith('/api/closings/') && /^\/api\/closings\/\d+$/.test(cesta)) {
    const id = Number(cesta.split('/').pop());
    const u = s.uzaverky.find(x => x.id === id);
    if (metoda === 'GET') return u ? ok({ closing: tvar(u) }) : chyba('Uzávěrka nenalezena', 404);
    if (metoda === 'PATCH') { if (u) { if (p.telo?.approved !== undefined) u.approved = !!p.telo.approved; k.hlas('uzaverka-schvalena', { id }); } return ok(); }
    if (metoda === 'DELETE') { s.uzaverky = s.uzaverky.filter(x => x.id !== id); return ok(); }
  }

  // ---- Podpůrné údaje formuláře ----
  if (cesta === '/api/closings/handover') {
    const s1 = s.uzaverky.filter(u => u.handover).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return ok(s1 ? { handover: s1.handover, date: s1.shift_date, authorName: clen(s1.created_by).name, authorAvatar: clen(s1.created_by).avatar } : { handover: null });
  }
  if (cesta === '/api/closings/drawer') {
    const posledni = s.uzaverky.filter(u => u.created_by).sort((a, b) => b.shift_date.localeCompare(a.shift_date) || b.created_at.localeCompare(a.created_at))[0];
    if (!posledni) return ok({ drawer: null });
    return ok({
      gapDays: [],
      drawer: { date: posledni.shift_date, shiftLabel: posledni.shift_label, authorName: clen(posledni.created_by).name, amount: posledni.closing_cash - posledni.final_removal, finalRemoval: posledni.final_removal },
    });
  }
  if (cesta === '/api/closings/wage') {
    const kdo = Number(q.get('employeeId') ?? meId);
    const otevrena = s.pichacky.find(x => x.employeeId === kdo && x.clockOut == null);
    const ms = otevrena ? Date.now() - new Date(otevrena.clockIn).getTime() : 0;
    const sazba = clen(kdo).hourlyRate;
    return ok({
      available: opr.has('finance.moje_mzda') || opr.has('finance.mzdy'), employeeId: kdo,
      wage: { ms, rate: sazba, earned: Math.round(ms / 3600000 * sazba), open: !!otevrena, suspicious: false, noEntries: !otevrena },
      points: { tasks: 2, procedures: 1, taskPts: 10, procPts: 10, closingPts: 15, total: 35 },
    });
  }
  if (cesta === '/api/closings/coworkers') {
    const den = q.get('date') ?? s.dnes;
    const vyloucit = Number(q.get('exclude') ?? meId);
    const uzavrene = new Set(s.uzaverky.filter(u => u.shift_date === den).flatMap(u => u.shiftEmployees));
    const kolegove = LIDE.filter(l => l.role !== 'kiosk' && l.id !== vyloucit && !uzavrene.has(l.id)).map(l => {
      const sm = s.smeny.find(x => x.date === den && x.employeeId === l.id);
      return { id: l.id, name: l.name, avatar: l.avatar, startTime: sm?.startTime ?? null, endTime: sm?.endTime ?? null, hadShift: !!sm };
    }).sort((a, b) => Number(!a.hadShift) - Number(!b.hadShift) || a.name.localeCompare(b.name, 'cs'));
    return ok({ coworkers: kolegove });
  }
  if (cesta === '/api/closings/calendar') {
    const mesic = q.get('month') ?? s.dnes.slice(0, 7);
    const days: Record<string, unknown> = {};
    const dny = new Set([...s.smeny.map(x => x.date), ...s.uzaverky.map(u => u.shift_date)].filter(d => d.startsWith(mesic + '-') && d <= s.dnes));
    for (const d of dny) {
      const naSmene = s.smeny.filter(x => x.date === d).map(x => ({ id: x.employeeId, name: clen(x.employeeId).name, avatar: clen(x.employeeId).avatar, hadClosing: s.uzaverky.some(u => u.shift_date === d && u.shiftEmployees.includes(x.employeeId)) }));
      const zavrely = s.uzaverky.filter(u => u.shift_date === d);
      days[d] = {
        onShift: naSmene, closedBy: zavrely.map(u => ({ id: u.created_by, name: clen(u.created_by).name, avatar: clen(u.created_by).avatar })),
        hasClosing: zavrely.length > 0, missing: zavrely.length === 0 && d < s.dnes,
        ...(zavrely.length ? { revenue: zavrely.reduce((a, u) => a + u.cash_revenue + u.card_revenue, 0) } : {}),
      };
    }
    return ok({ month: mesic, selfOnly: !smiVse, days });
  }
  return undefined;
};
