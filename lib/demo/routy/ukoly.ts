// Úkoly. Odškrtnutí (PATCH status) skutečně mění stav: úkol je hotový, zapíše
// se, kdo ho splnil, a povinný úkol před uzávěrkou tím odemkne uzávěrku
// (viz routy/uzaverky.ts, kde se zámek počítá ze stejných dat).

import { chyba, ok, type Obsluha } from '../typy';
import { KDO_JSEM, clen } from '../data/lide';
import type { DemoStav, UkolDemo } from '../stav';
import { mojeRole } from './zaklad';
import { posunDen } from '../cas';
import { stavPovinnych } from './uzaverky';
import { jeZamceno } from '@/lib/povinnePredUzaverkou';

function tvar(u: UkolDemo) {
  const kdo = u.assignedTo != null ? clen(u.assignedTo) : null;
  const splnil = u.completedBy != null ? clen(u.completedBy) : null;
  return {
    id: u.id, title: u.title, description: u.description, assignedTo: u.assignedTo, createdBy: u.createdBy,
    teamTask: u.assignedTo == null, priority: u.priority, status: u.status, dueDate: u.dueDate,
    recurrence: u.recurrence, seriesId: u.seriesId, checklist: u.checklist,
    assigneeName: kdo?.name ?? null, assigneeAvatar: kdo?.avatar ?? null,
    completedBy: u.completedBy, completedByName: splnil?.name ?? null, completedByAvatar: splnil?.avatar ?? null,
    completedAt: u.completedAt, source: u.source, sourceRef: null, sourceMeta: u.sourceMeta,
    requireBeforeClosing: u.requireBeforeClosing,
  };
}

function poradi(a: UkolDemo, b: UkolDemo) {
  return Number(a.status === 'done') - Number(b.status === 'done')
    || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.id - a.id;
}

export const ukoly: Obsluha = (p, k) => {
  const s: DemoStav = k.stav;
  const { cesta, metoda, q } = p;
  if (cesta !== '/api/tasks') return undefined;
  const meId = KDO_JSEM[s.role];
  const opr = new Set(mojeRole(s).opravneni);

  if (metoda === 'GET') {
    const tym = opr.has('ukoly.zobrazit_tym');
    const rows = s.ukoly.filter(u => tym || u.assignedTo === meId || u.assignedTo == null).sort(poradi);
    return ok(rows.map(tvar));
  }

  if (metoda === 'POST') {
    const b = p.telo ?? {};
    const title = String(b.title ?? '').trim();
    if (!title) return chyba('Chybí název úkolu');
    const komu = b.assignedTo === null || b.assignedTo === undefined || b.assignedTo === '' || b.assignedTo === 0 ? null : Number(b.assignedTo);
    const dueDate = b.dueDate || null;
    const povinny = b.requireBeforeClosing === true && (opr.has('ukoly.zadavat') || opr.has('ukoly.upravit'));
    if (povinny && !dueDate && !b.recurrence) return chyba('Povinný úkol před uzávěrkou potřebuje den nebo opakování.');
    const novy: UkolDemo = {
      id: ++s.dalsiId, title, description: b.description ?? null, assignedTo: komu, createdBy: meId,
      priority: b.priority ?? 'medium', status: 'pending', dueDate: dueDate ?? (b.recurrence ? s.dnes : null),
      recurrence: b.recurrence ?? null, seriesId: b.recurrence ? `s-${s.dalsiId}` : null,
      checklist: Array.isArray(b.checklist) ? b.checklist.map((i: any) => ({ text: String(i?.text ?? ''), done: false })).filter((i: any) => i.text) : [],
      completedBy: null, completedAt: null, source: null, sourceMeta: null, requireBeforeClosing: povinny,
    };
    s.ukoly.push(novy);
    k.hlas('ukol-pridan', { id: novy.id });
    return ok(tvar(novy));
  }

  if (metoda === 'DELETE') {
    const id = Number(q.get('id'));
    s.ukoly = s.ukoly.filter(u => u.id !== id);
    return ok();
  }

  if (metoda === 'PATCH') {
    const b = p.telo ?? {};
    const u = s.ukoly.find(x => x.id === Number(b.id));
    if (!u) return chyba('Úkol nenalezen', 404);

    if (b.edit) {
      if (b.title !== undefined) u.title = String(b.title).trim() || u.title;
      if (b.description !== undefined) u.description = b.description || null;
      if (b.priority !== undefined) u.priority = b.priority;
      if (b.assignedTo !== undefined) u.assignedTo = b.assignedTo === null || b.assignedTo === '' || b.assignedTo === 0 ? null : Number(b.assignedTo);
      if (b.dueDate !== undefined) u.dueDate = b.dueDate || null;
      if (b.recurrence !== undefined) u.recurrence = b.recurrence || null;
      if (Array.isArray(b.checklist)) u.checklist = b.checklist.map((i: any) => ({ text: String(i?.text ?? ''), done: !!i?.done })).filter((i: any) => i.text);
      if (b.requireBeforeClosing !== undefined && (opr.has('ukoly.zadavat') || opr.has('ukoly.upravit'))) u.requireBeforeClosing = b.requireBeforeClosing === true;
      return ok(tvar(u));
    }
    if (b.move && b.dueDate !== undefined) { u.dueDate = b.dueDate || null; return ok(tvar(u)); }
    if (Array.isArray(b.checklist)) {
      u.checklist = b.checklist.map((i: any) => ({ text: String(i?.text ?? ''), done: !!i?.done })).filter((i: any) => i.text);
      return ok(tvar(u));
    }
    if (b.status === undefined) return ok(tvar(u));

    const hotovo = b.status === 'done';
    const bylo = u.status;
    const zamekPred = jeZamceno(stavPovinnych(s));
    u.status = hotovo ? 'done' : 'pending';
    u.completedBy = hotovo ? (b.actingAs ? Number(b.actingAs) : meId) : null;
    u.completedAt = hotovo ? new Date().toISOString() : null;
    if (hotovo && bylo !== 'done') {
      k.hlas('ukol-odskrtnut', { id: u.id, nazev: u.title, povinny: u.requireBeforeClosing });
      // Odškrtnutí posledního povinného úkolu: uzávěrka se odemkla (sonda a
      // prodejní stránka na to čekají jako na „aha" chvíli scény).
      if (zamekPred && !jeZamceno(stavPovinnych(s))) k.hlas('uzaverka-odemcena', { den: s.dnes });
      // Opakovaný úkol si na serveru drží další výskyty předem; tady stačí, že zítřejší existuje.
      if (u.recurrence && u.seriesId && !s.ukoly.some(x => x.seriesId === u.seriesId && x.status !== 'done' && (x.dueDate ?? '') > (u.dueDate ?? ''))) {
        s.ukoly.push({ ...u, id: ++s.dalsiId, status: 'pending', dueDate: posunDen(u.dueDate ?? s.dnes, 1), completedBy: null, completedAt: null, checklist: u.checklist.map(i => ({ ...i, done: false })) });
      }
    }
    return ok({ ...tvar(u), pointsEarned: hotovo && bylo !== 'done' ? 5 : null });
  }
  return undefined;
};
