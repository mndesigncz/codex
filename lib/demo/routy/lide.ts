// Lidé a jejich čas: docházka (píchačky), volno a dostupnost.
// Příchod a odchod skutečně mění stav, takže tablet i widget „Právě na směně"
// po píchnutí ukážou novou situaci.

import { chyba, ok, type Obsluha } from '../typy';
import { LIDE, KDO_JSEM, clen } from '../data/lide';
import { mojeRole } from './zaklad';
import type { DemoStav } from '../stav';

function smenaDnes(s: DemoStav, employeeId: number) {
  return s.smeny.filter(x => x.date === s.dnes && x.employeeId === employeeId).sort((a, b) => a.startTime.localeCompare(b.startTime))[0] ?? null;
}

export const lide: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, metoda, q } = p;
  const meId = KDO_JSEM[s.role];
  const opr = new Set(mojeRole(s).opravneni);

  // ---- Docházka ----
  if (cesta === '/api/attendance') {
    if (metoda === 'GET') {
      if (opr.has('dochazka.tablet') || opr.has('dochazka.zobrazit')) {
        const roster = LIDE.filter(l => l.role !== 'kiosk').map(l => {
          const otevrena = s.pichacky.find(x => x.employeeId === l.id && x.clockOut == null) ?? null;
          const sm = smenaDnes(s, l.id);
          return {
            id: l.id, name: l.name, avatar: l.avatar,
            hourlyRate: opr.has('finance.mzdy') ? l.hourlyRate : null,
            hasPin: false, openSince: otevrena?.clockIn ?? null, openEntryId: otevrena?.id ?? null, nudgedAt: null,
            shiftStart: sm?.startTime ?? null, shiftEnd: sm?.endTime ?? null,
          };
        });
        const dni = Math.min(180, Math.max(1, Number(q.get('days') ?? 30)));
        const od = Date.now() - dni * 86400000;
        const entries = opr.has('dochazka.zobrazit')
          ? s.pichacky.filter(x => new Date(x.clockIn).getTime() >= od).sort((a, b) => b.clockIn.localeCompare(a.clockIn)).map(x => ({
            id: x.id, employeeId: x.employeeId, employeeName: clen(x.employeeId).name, employeeAvatar: clen(x.employeeId).avatar,
            clockIn: x.clockIn, clockOut: x.clockOut, source: x.source, note: x.note,
          }))
          : [];
        return ok({ roster, entries });
      }
      const moje = s.pichacky.filter(x => x.employeeId === meId).sort((a, b) => b.clockIn.localeCompare(a.clockIn));
      const otevrena = moje.find(x => x.clockOut == null) ?? null;
      const ja: Record<string, unknown> = { id: meId, openSince: otevrena?.clockIn ?? null };
      if (opr.has('finance.moje_mzda') || opr.has('finance.mzdy')) ja.hourlyRate = clen(meId).hourlyRate;
      return ok({ roster: [ja], entries: moje.map(x => ({ id: x.id, employeeId: x.employeeId, clockIn: x.clockIn, clockOut: x.clockOut, source: x.source, note: x.note })) });
    }
    if (metoda === 'POST') {
      const b = p.telo ?? {};
      const kdo = Number(b.employeeId);
      if (!Number.isFinite(kdo)) return chyba('Chybí zaměstnanec');
      const otevrena = s.pichacky.find(x => x.employeeId === kdo && x.clockOut == null);
      if (b.action === 'out') {
        if (!otevrena) return chyba('Žádný otevřený příchod k odpíchnutí.', 409);
        otevrena.clockOut = new Date().toISOString();
        k.hlas('odchod-zapsan', { employeeId: kdo });
        return ok({ ok: true, action: 'out', entry: { id: otevrena.id, employeeId: kdo, clockIn: otevrena.clockIn, clockOut: otevrena.clockOut }, closingDone: true });
      }
      if (otevrena) return chyba('Příchod už je zaznamenaný.', 409);
      const zaznam = { id: ++s.dalsiId, employeeId: kdo, clockIn: new Date().toISOString(), clockOut: null, source: s.role === 'kiosk' ? 'kiosk' : 'app', note: null };
      s.pichacky.push(zaznam);
      k.hlas('prichod-zapsan', { employeeId: kdo });
      return ok({ ok: true, action: 'in', entry: { id: zaznam.id, employeeId: kdo, clockIn: zaznam.clockIn, clockOut: null }, autoClosedPrevious: false });
    }
    if (metoda === 'PATCH') return ok({ ok: true });
    if (metoda === 'DELETE') {
      const id = Number(q.get('id'));
      s.pichacky = s.pichacky.filter(x => x.id !== id);
      return ok();
    }
  }

  // ---- Volno ----
  if (cesta === '/api/timeoff') {
    if (metoda === 'GET') {
      const jenMoje = q.get('mine') === '1';
      const tym = opr.has('volno.zobrazit') && !jenMoje;
      const rows = (tym ? s.volno : s.volno.filter(v => v.employeeId === meId))
        .slice().sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.fromDate.localeCompare(a.fromDate));
      return ok({
        requests: rows.map(v => ({ id: v.id, employeeId: v.employeeId, fromDate: v.fromDate, toDate: v.toDate, type: v.type, note: v.note, status: v.status, createdAt: v.createdAt, employeeName: clen(v.employeeId).name, employeeAvatar: clen(v.employeeId).avatar })),
        isEmployer: tym,
      });
    }
    if (metoda === 'POST') {
      const b = p.telo ?? {};
      const od = String(b.fromDate ?? ''), doo = String(b.toDate ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(od) || !/^\d{4}-\d{2}-\d{2}$/.test(doo)) return chyba('Neplatné datum.');
      if (doo < od) return chyba('Konec volna je před začátkem.');
      s.volno.push({ id: ++s.dalsiId, employeeId: meId, fromDate: od, toDate: doo, type: String(b.type ?? 'vacation'), note: b.note ?? null, status: 'pending', createdAt: new Date().toISOString() });
      return ok({ ok: true });
    }
    if (metoda === 'PATCH') {
      const b = p.telo ?? {};
      const v = s.volno.find(x => x.id === Number(b.id));
      if (!v) return chyba('Žádost nenalezena', 404);
      if (b.status === 'approved' || b.status === 'rejected') v.status = b.status;
      if (typeof b.fromDate === 'string') v.fromDate = b.fromDate;
      if (typeof b.toDate === 'string') v.toDate = b.toDate;
      return ok({ ok: true });
    }
    if (metoda === 'DELETE') { s.volno = s.volno.filter(x => x.id !== Number(q.get('id'))); return ok(); }
  }

  // ---- Dostupnost ----
  if (cesta === '/api/availability') {
    if (metoda === 'GET') {
      const mesic = q.get('month');
      if (!mesic) return chyba('Chybí měsíc');
      const radky = s.dostupnost.filter(d => d.month === mesic);
      if (opr.has('dostupnost.zobrazit') && !q.get('mine')) {
        return ok({
          submissions: radky.map(d => ({ id: d.id, employeeId: d.employeeId, employeeName: clen(d.employeeId).name, employeeAvatar: clen(d.employeeId).avatar ?? '👤', month: d.month, unavailableDates: d.unavailableDates, dayPreferences: d.dayPreferences, preferredShift: d.preferredShift, maxShifts: d.maxShifts, note: d.note, status: d.status, createdAt: new Date().toISOString() })),
          naplanovanoSmen: s.smeny.filter(x => x.date.startsWith(mesic + '-')).length,
        });
      }
      const moje = radky.find(d => d.employeeId === meId);
      return ok(moje ? { ...moje, createdAt: new Date().toISOString() } : null);
    }
    if (metoda === 'POST' || metoda === 'PATCH') {
      const b = p.telo ?? {};
      const kdo = metoda === 'PATCH' && b.employeeId ? Number(b.employeeId) : meId;
      let d = s.dostupnost.find(x => x.employeeId === kdo && x.month === b.month);
      if (!d) { d = { id: ++s.dalsiId, employeeId: kdo, month: String(b.month), unavailableDates: [], dayPreferences: {}, preferredShift: null, maxShifts: null, note: null, status: 'submitted' }; s.dostupnost.push(d); }
      if (Array.isArray(b.unavailableDates)) d.unavailableDates = b.unavailableDates;
      if (b.dayPreferences && typeof b.dayPreferences === 'object') d.dayPreferences = b.dayPreferences;
      if ('preferredShift' in b) d.preferredShift = b.preferredShift ?? null;
      if ('maxShifts' in b) d.maxShifts = b.maxShifts == null || b.maxShifts === '' ? null : Number(b.maxShifts);
      if ('note' in b) d.note = b.note ?? null;
      return ok({ ok: true });
    }
  }

  // ---- Lidé ----
  if (cesta === '/api/users') {
    return ok(LIDE.map(l => ({ id: l.id, name: l.name, email: l.email, role: l.role, avatar: l.avatar, jobTitle: l.jobTitle })));
  }
  if (cesta === '/api/employees') {
    return ok(LIDE.filter(l => l.role !== 'kiosk').map(l => ({ id: l.id, name: l.name, avatar: l.avatar, role: l.role, jobTitle: l.jobTitle, hourlyRate: opr.has('finance.mzdy') ? l.hourlyRate : 0 })));
  }
  if (cesta === '/api/invitations') return ok({ invitations: [] });

  return undefined;
};
