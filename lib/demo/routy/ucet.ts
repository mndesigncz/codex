// Účet a drobnosti kolem něj, které ukázka dřív neznala (audit 2026-10, L07):
// zařízení s oznámeními, zablokovaní lidé, nahlášený obsah, poznámky k nápadům
// a výplaty (Docházka › Výplatní listina, Můj výdělek). Bez nich obrazovky
// Nastavení a Docházky v ukázce mlčky padaly na prázdný tvar `[]`.
//
// Stav, který se dá v ukázce měnit (blokace, poznámky), drží `k.stav` pod
// vlastními klíči — DemoStav se kvůli tomu nemění (sdílí ho víc oblastí).

import { chyba, ok, type Obsluha } from '../typy';
import { KDO_JSEM, LIDE, clen } from '../data/lide';
import { mojeRole } from './zaklad';
import type { DemoStav } from '../stav';

interface PoznamkaDema { id: number; typ: string; klic: string; text: string; autorId: number; createdAt: string }
interface StavUctu { blokovani: number[]; poznamky: PoznamkaDema[] }

function stavUctu(s: DemoStav): StavUctu {
  const x = s as DemoStav & { __ucet?: StavUctu };
  x.__ucet ??= { blokovani: [], poznamky: [] };
  return x.__ucet;
}

/** Odpracováno letos v ms (uzavřené záznamy) — strop DPP ve Výplatní listině. */
function hodinyLetosMs(s: DemoStav, id: number): number {
  const rok = s.dnes.slice(0, 4);
  return s.pichacky
    .filter(p => p.employeeId === id && p.clockOut && p.clockIn.slice(0, 4) === rok)
    .reduce((a, p) => a + Math.max(0, new Date(p.clockOut!).getTime() - new Date(p.clockIn).getTime()), 0);
}

export const ucet: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, metoda, q } = p;
  const meId = KDO_JSEM[s.role];
  const opr = new Set(mojeRole(s).opravneni);

  // ---- Nastavení › Notifikace: zařízení s push oznámeními ----
  if (cesta === '/api/account/zarizeni') return metoda === 'GET' ? ok({ zarizeni: [] }) : ok({ ok: true });

  // ---- Nastavení › Zabezpečení: zablokovaní lidé ----
  if (cesta === '/api/blocks') {
    const u = stavUctu(s);
    if (metoda === 'GET') return ok({ blocked: u.blokovani.map(id => ({ id, name: clen(id).name, avatar: clen(id).avatar })) });
    const cil = Number(p.telo?.userId ?? q.get('userId'));
    if (!Number.isFinite(cil) || cil === meId) return chyba('Tohohle uživatele zablokovat nejde.');
    if (metoda === 'POST') { if (!u.blokovani.includes(cil)) u.blokovani.unshift(cil); return ok({ ok: true }); }
    if (metoda === 'DELETE') { u.blokovani = u.blokovani.filter(x => x !== cil); return ok({ ok: true }); }
  }

  // ---- Nastavení › Nahlášený obsah (moderace) ----
  if (cesta === '/api/reports') return metoda === 'GET' ? ok({ reports: [] }) : ok({ ok: true });

  // ---- Poznámky (vlákno u nápadu, úkolu…) ----
  if (cesta === '/api/notes') {
    const u = stavUctu(s);
    if (metoda === 'GET') {
      if (q.has('pocty')) {
        const ids = String(q.get('pocty') ?? '').split(',').filter(Boolean);
        const pocty: Record<string, number> = {};
        for (const id of ids) {
          const n = u.poznamky.filter(x => x.typ === (q.get('typ') ?? 'suggestion') && x.klic === id).length;
          if (n) pocty[id] = n;
        }
        return ok({ pocty });
      }
      const typ = String(q.get('typ') ?? ''), klic = String(q.get('id') ?? '');
      return ok(u.poznamky.filter(x => x.typ === typ && x.klic === klic).map(x => tvarPoznamky(x, meId)));
    }
    if (metoda === 'POST') {
      const text = String(p.telo?.text ?? '').trim();
      if (!text) return chyba('Napiš text poznámky.');
      const nova: PoznamkaDema = { id: ++s.dalsiId, typ: String(p.telo?.typ ?? ''), klic: String(p.telo?.id ?? ''), text, autorId: meId, createdAt: new Date().toISOString() };
      u.poznamky.push(nova);
      return ok(tvarPoznamky(nova, meId), 201);
    }
    if (metoda === 'DELETE') {
      const id = Number(q.get('noteId') ?? q.get('id') ?? p.telo?.noteId);
      u.poznamky = u.poznamky.filter(x => x.id !== id);
      return ok({ ok: true });
    }
    return ok({ ok: true });
  }

  // ---- Výplaty (Docházka › Výplatní listina, Můj výdělek) ----
  if (cesta === '/api/payroll' && metoda === 'GET') {
    const od = q.get('od') ?? s.dnes.slice(0, 8) + '01';
    const doD = q.get('do') ?? s.dnes;
    const pravidla = { dysko: {}, priplatky: {}, showTipsToStaff: false, hraniceOdvodu: null };
    if (q.get('ja') === '1') {
      if (s.role === 'kiosk' || !(opr.has('finance.moje_mzda') || opr.has('finance.mzdy'))) return chyba('Nedostatečná oprávnění', 403);
      return ok({ od, do: doD, ja: { zKasy: 0, zKasyPocet: 0, uzaverky: [], vyplaty: [], spropitne: null, spropitnePoDnech: [] }, zamky: [], pravidla: { priplatky: {}, showTipsToStaff: false } });
    }
    if (!opr.has('dochazka.zobrazit')) return chyba('Nedostatečná oprávnění', 403);
    const vidiMzdy = opr.has('finance.mzdy');
    const lide = LIDE.filter(l => l.role !== 'kiosk').map(l => ({
      id: l.id, name: l.name, avatar: l.avatar, jobTitle: l.jobTitle, role: l.role,
      contractType: null, contractHoursYear: null, hodinyLetosMs: hodinyLetosMs(s, l.id),
      zKasy: vidiMzdy ? 0 : null, zKasyPocet: 0, uzaverky: [], vyplaceno: vidiMzdy ? 0 : null, vyplaty: [],
    }));
    return ok({ od, do: doD, lide, zamky: [], vidiMzdy, payDailyCash: false, pravidla });
  }
  if (cesta.startsWith('/api/payroll/')) return ok({ ok: true });

  return undefined;
};

function tvarPoznamky(x: PoznamkaDema, meId: number) {
  const a = clen(x.autorId);
  return {
    id: x.id, text: x.text, createdAt: x.createdAt, updatedAt: null,
    autor: { id: a.id, name: a.name, avatar: a.avatar ?? null },
    moje: x.autorId === meId, muzuSmazat: x.autorId === meId, pripnuta: false, zminky: [],
  };
}
