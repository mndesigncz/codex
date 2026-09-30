// Rozvrh: uložené směny, generátor (skutečný algoritmus z lib/rozvrhGenerator,
// ne vymyšlený návrh), zveřejnění, výměny směn a typy směn.
//
// Generování je dvoufázové jako na serveru: POST /api/schedule/generate bez
// `commit` vrátí návrh (nic se neukládá), s `commit: true` návrh uloží.
// Teprve /api/schedule/publish „rozešle" rozvrh lidem.

import { chyba, ok, type Obsluha } from '../typy';
import { LIDE, KDO_JSEM, clen } from '../data/lide';
import { OTEVIRACI_DOBA, type DemoStav, type Smena } from '../stav';
import { mojeRole } from './zaklad';
import { coverageGaps, missingSlots } from '@/lib/coverage';
import { navrhniRozvrh, type ClovekGeneratoru } from '@/lib/rozvrhGenerator';

/** Otisk uložených směn měsíce (jako md5 na serveru: souběh se pozná změnou). */
function verzeMesice(s: DemoStav, mesic: string): string {
  const txt = s.smeny.filter(x => x.date.startsWith(mesic + '-')).sort((a, b) => a.id - b.id)
    .map(x => `${x.id}|${x.employeeId}|${x.date}|${x.startTime}|${x.endTime}`).join(',');
  let h = 5381;
  for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0;
  return `d${(h >>> 0).toString(16)}`;
}

function tvarSmeny(x: Smena) {
  const l = clen(x.employeeId);
  return { id: x.id, employeeId: x.employeeId, employeeName: l.name, employeeAvatar: l.avatar ?? '👤', date: x.date, startTime: x.startTime, endTime: x.endTime, type: x.type };
}

function typyProGenerator(s: DemoStav) {
  return s.typySmen.map(t => ({ id: t.id, name: t.name, start_time: t.startTime, end_time: t.endTime, color: t.color, starts_at_open: t.startsAtOpen, ends_at_close: t.endsAtClose }));
}

function typLabel(s: DemoStav, x: Smena) {
  const t = s.typySmen.find(t => t.name === x.type);
  return { typeLabel: t?.name ?? x.type, typeColor: t?.color ?? '#64748B' };
}

function tvarSmenyProShifts(s: DemoStav, x: Smena) {
  return { id: x.id, teamId: 1, employeeId: x.employeeId, date: x.date, startTime: x.startTime, endTime: x.endTime, type: x.type, start_time: x.startTime, end_time: x.endTime, ...typLabel(s, x) };
}

export const rozvrh: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, metoda, q } = p;
  const meId = KDO_JSEM[s.role];
  const opr = new Set(mojeRole(s).opravneni);

  // ---- Uložený rozvrh měsíce ----
  if (cesta === '/api/schedule') {
    if (metoda === 'GET') {
      const mesic = q.get('month');
      if (!mesic || !/^\d{4}-\d{2}$/.test(mesic)) return chyba('Neplatný měsíc');
      const smeny = s.smeny.filter(x => x.date.startsWith(mesic + '-')).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
      const poDni = new Map<string, { start: string; end: string; type: string }[]>();
      for (const x of smeny) (poDni.get(x.date) ?? poDni.set(x.date, []).get(x.date)!).push({ start: x.startTime, end: x.endTime, type: x.type });
      // Kontrolují se jen dny, na které je něco naplánované (prázdný měsíc není díra).
      const dny = [...poDni.keys()].sort();
      const gaps = coverageGaps(OTEVIRACI_DOBA, poDni, dny);
      const understaffed = missingSlots(OTEVIRACI_DOBA, typyProGenerator(s) as any, poDni, dny);
      return ok({ shifts: smeny.map(tvarSmeny), gaps, understaffed, demand: {}, verze: verzeMesice(s, mesic) });
    }
    if (metoda === 'POST') {
      const list: any[] = Array.isArray(p.telo?.shifts) ? p.telo.shifts : [];
      let n = 0;
      for (const x of list) {
        const employeeId = Number(x.employeeId);
        if (!employeeId || !x.date || !x.startTime || !x.endTime) continue;
        s.smeny.push({ id: ++s.dalsiId, employeeId, date: String(x.date), startTime: String(x.startTime), endTime: String(x.endTime), type: String(x.type ?? 'flexible') });
        n++;
      }
      return ok({ inserted: n });
    }
    if (metoda === 'DELETE') {
      const id = q.get('id');
      const mesic = q.get('month');
      if (id) { s.smeny = s.smeny.filter(x => x.id !== Number(id)); return ok(); }
      if (mesic) { s.smeny = s.smeny.filter(x => !x.date.startsWith(mesic + '-')); return ok(); }
      return chyba('Chybí id nebo měsíc');
    }
  }

  // ---- Generátor: návrh, pak uložení ----
  if (cesta === '/api/schedule/generate' && metoda === 'POST') {
    const b = p.telo ?? {};
    const mesic: string = b.month;
    if (!mesic || !/^\d{4}-\d{2}$/.test(mesic)) return chyba('Neplatný měsíc');
    if (b.commit) {
      const list: any[] = Array.isArray(b.shifts) ? b.shifts : [];
      if (list.length === 0) return ok({ inserted: 0 });
      const verze = typeof b.verze === 'string' ? b.verze : null;
      if (verze && verze !== verzeMesice(s, mesic)) {
        return chyba('Rozvrh tohoto měsíce mezitím někdo změnil. Nic se neuložilo, zkontroluj uložené směny a ulož znovu.', 409, { konflikt: true });
      }
      if (b.replaceMonth === true) s.smeny = s.smeny.filter(x => !x.date.startsWith(mesic + '-'));
      let n = 0;
      for (const x of list) {
        const employeeId = Number(x.employeeId);
        if (!employeeId || !String(x.date ?? '').startsWith(mesic + '-') || !x.startTime || !x.endTime) continue;
        s.smeny.push({ id: ++s.dalsiId, employeeId, date: String(x.date), startTime: String(x.startTime), endTime: String(x.endTime), type: String(x.type ?? 'flexible') });
        n++;
      }
      k.hlas('rozvrh-ulozen', { mesic, pocet: n });
      return { status: 200, telo: { inserted: n, ok: true }, zpozdeni: 260 };
    }

    const nahradit = opr.has('rozvrh.mazat_mesic') && b.nahradit !== false;
    const lide: ClovekGeneratoru[] = LIDE.filter(l => l.role === 'employee').map(l => {
      const a = s.dostupnost.find(d => d.employeeId === l.id && d.month === mesic);
      const volno = s.volno.filter(v => v.employeeId === l.id && v.status === 'approved');
      const nemuze = [...(a?.unavailableDates ?? [])];
      for (const v of volno) {
        for (let d = new Date(v.fromDate + 'T12:00:00Z'); d <= new Date(v.toDate + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) nemuze.push(d.toISOString().slice(0, 10));
      }
      return {
        id: l.id, name: l.name, avatar: l.avatar ?? '👤', unavailable: nemuze, dayPrefs: a?.dayPreferences ?? {},
        preferredShift: a?.preferredShift ?? null, maxShifts: a?.maxShifts ?? null, maxConsecutive: 5, maxHours: null,
        priorDates: [], splitOk: true,
      };
    });
    const ulozene = nahradit ? [] : s.smeny.filter(x => x.date.startsWith(mesic + '-'))
      .map(x => ({ employeeId: x.employeeId, date: x.date, startTime: x.startTime, endTime: x.endTime, type: x.type }));
    const vysledek = navrhniRozvrh({
      month: mesic, lide, typy: typyProGenerator(s), openingHours: OTEVIRACI_DOBA,
      pevne: [], pravidla: { balanceShifts: true, splitShifts: false }, trzby: null, ulozene,
    });
    k.hlas('rozvrh-vygenerovan', { mesic, pocet: vysledek.proposed.length });
    // Generování chvilku trvá i na skutečném serveru; bez prodlevy by tlačítko
    // „Vygenerovat" neukázalo ani stav načítání.
    return { status: 200, telo: { ...vysledek, nahradit }, zpozdeni: 700 };
  }

  // ---- Zveřejnění: rozešle upozornění lidem se směnou ----
  if (cesta === '/api/schedule/publish' && metoda === 'POST') {
    const mesic = String(p.telo?.month ?? '');
    const lidi = new Set(s.smeny.filter(x => x.date.startsWith(mesic + '-')).map(x => x.employeeId));
    k.hlas('rozvrh-publikovan', { mesic, lidi: lidi.size });
    return { status: 200, telo: { ok: true, notified: lidi.size }, zpozdeni: 320 };
  }
  if (cesta === '/api/schedule/adjust' && metoda === 'POST') return ok({ changes: [], warnings: [] });
  if (cesta === '/api/schedule/rules') {
    if (metoda !== 'GET') return ok({ ok: true });
    return ok({
      teamMax: 5, teamMaxHours: null, balanceShifts: true, splitShifts: false,
      members: LIDE.filter(l => l.role === 'employee').map(l => ({ id: l.id, name: l.name, avatar: l.avatar, role: l.role, maxConsecutive: null, maxHours: null, splitOk: true })),
    });
  }
  if (cesta === '/api/schedule/import') return ok({ ok: true, inserted: 0 });

  // ---- Typy směn a pevné dny ----
  if (cesta === '/api/shift-types') {
    if (metoda === 'GET') {
      return ok({ shiftTypes: s.typySmen.map(t => ({ ...t, zOrganizace: false, sdileno: false, spravuje: null })) });
    }
    return ok({ ok: true });
  }
  if (cesta.startsWith('/api/shift-types/')) return ok({ ok: true });
  if (cesta === '/api/fixed-assignments') return metoda === 'GET' ? ok({ assignments: [] }) : ok({ ok: true });

  // ---- Směny člověka a týmu ----
  if (cesta === '/api/shifts') {
    if (metoda === 'GET') {
      const emp = q.get('employeeId');
      if (emp) {
        const id = Number(emp);
        if (id !== meId && !opr.has('rozvrh.zobrazit') && !opr.has('hodnoceni.zobrazit')) return chyba('Nedostatečná oprávnění', 403);
        const moje = s.smeny.filter(x => x.employeeId === id).sort((a, b) => a.date.localeCompare(b.date));
        return ok(moje.map(x => {
          const t = tvarSmenyProShifts(s, x);
          return id === meId ? { ...t, rating: x.date < s.dnes ? 5 : null } : t;
        }));
      }
      if (q.get('team') === '1') {
        if (!opr.has('rozvrh.nahled')) return ok({ shifts: [], people: [], enabled: false });
        const mesic = q.get('month');
        const rows = s.smeny.filter(x => !mesic || x.date.startsWith(mesic + '-')).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
        return ok({
          enabled: true,
          shifts: rows.map(x => ({ ...tvarSmenyProShifts(s, x), employeeName: clen(x.employeeId).name, employeeAvatar: clen(x.employeeId).avatar, isMine: x.employeeId === meId })),
        });
      }
      if (opr.has('rozvrh.zobrazit')) {
        return ok({
          shifts: s.smeny.slice().sort((a, b) => a.date.localeCompare(b.date)).map(x => ({ ...tvarSmenyProShifts(s, x), employeeName: clen(x.employeeId).name, employeeAvatar: clen(x.employeeId).avatar })),
          requests: [],
        });
      }
      return ok({ shifts: s.smeny.filter(x => x.employeeId === meId).map(x => tvarSmenyProShifts(s, x)), requests: [] });
    }
    if (metoda === 'POST') {
      const b = p.telo ?? {};
      const x: Smena = { id: ++s.dalsiId, employeeId: Number(b.employeeId), date: String(b.date), startTime: String(b.startTime), endTime: String(b.endTime), type: String(b.type ?? 'custom') };
      s.smeny.push(x);
      return ok(tvarSmenyProShifts(s, x));
    }
  }

  // ---- Burza směn ----
  if (cesta === '/api/shifts/offers') {
    if (metoda === 'GET') {
      return ok({
        meId, isEmployer: opr.has('rozvrh.burza_schvalit') || s.role === 'vedeni',
        offers: s.nabidky.map(n => {
          const sm = s.smeny.find(x => x.id === n.shiftId);
          return {
            id: n.id, shiftId: n.shiftId, offeredBy: n.offeredBy, claimedBy: n.claimedBy, status: n.status, note: n.note,
            date: sm?.date ?? s.dnes, startTime: sm?.startTime ?? '', endTime: sm?.endTime ?? '', type: sm?.type ?? '',
            offeredByName: clen(n.offeredBy).name, offeredByAvatar: clen(n.offeredBy).avatar,
            claimedByName: n.claimedBy ? clen(n.claimedBy).name : null, claimedByAvatar: n.claimedBy ? clen(n.claimedBy).avatar : null,
          };
        }),
      });
    }
    return ok({ ok: true });
  }
  if (cesta === '/api/shifts/requests') return metoda === 'GET' ? ok({ requests: [] }) : ok({ ok: true });

  return undefined;
};
