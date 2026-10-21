// Vedení v ukázce: výplaty (Docházka › Mzdy za období, Výplatní listina, Můj výdělek)
// a poznámky k položkám (úkoly, uzávěrky, podněty). Audit 2026-10 (V12, V13, V45, V32):
// ukázka tyhle adresy neznala — mzdy byly prázdné widgety a poznámka napsaná v ukázce
// po odeslání zmizela. Data jsou vymyšlená stejně jako zbytek ukázky („Kavárna U Lípy").
//
// Poznámky žijí jen v paměti modulu (do obnovení stránky); stav ukázky (stav.ts) se tu
// nemění, ať soubor jen přidává a nesahá do sdíleného tvaru.

import { chyba, ok, type Obsluha } from '../typy';
import { LIDE, KDO_JSEM, clen } from '../data/lide';
import { mojeRole } from './zaklad';
import { VYCHOZI_PRAVIDLA_DYSKA, VYCHOZI_PRAVIDLA_PRIPLATKU } from '../../dochazkaPrehled';

interface PoznamkaDemo {
  id: number; typ: string; entita: string; text: string; autorId: number;
  createdAt: string; updatedAt: string | null; pripnuta: boolean;
}

let poznamky: PoznamkaDemo[] = [];
let dalsiPoznamka = 9000;

const rozmezi = (q: URLSearchParams) => {
  const od = q.get('od'), dd = q.get('do');
  return od && dd && /^\d{4}-\d{2}-\d{2}$/.test(od) && /^\d{4}-\d{2}-\d{2}$/.test(dd) ? { od, do: dd } : null;
};

export const vedeni: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, metoda, q } = p;
  const meId = KDO_JSEM[s.role];
  const opr = new Set(mojeRole(s).opravneni);

  // ---- Výplaty ----
  if (cesta === '/api/payroll' && metoda === 'GET') {
    const r = rozmezi(q);
    if (!r) return chyba('Neplatné období (od–do, nejvýš 400 dní).');
    const pravidla = { dysko: VYCHOZI_PRAVIDLA_DYSKA, priplatky: VYCHOZI_PRAVIDLA_PRIPLATKU, showTipsToStaff: true, hraniceOdvodu: null };
    if (q.get('ja') === '1') {
      if (s.role === 'kiosk' || !(opr.has('finance.moje_mzda') || opr.has('finance.mzdy'))) return chyba('Nedostatečná oprávnění', 403);
      return ok({
        od: r.od, do: r.do,
        ja: { zKasy: 0, zKasyPocet: 0, uzaverky: [], vyplaty: [], spropitne: null, spropitnePoDnech: [] },
        zamky: [], pravidla: { priplatky: pravidla.priplatky, showTipsToStaff: true },
      });
    }
    if (!opr.has('dochazka.zobrazit')) return chyba('Nedostatečná oprávnění', 403);
    const vidiMzdy = opr.has('finance.mzdy');
    const lide = LIDE.filter(l => l.role !== 'kiosk').map(l => ({
      id: l.id, name: l.name, avatar: l.avatar, jobTitle: l.jobTitle, role: l.role,
      // Brigádník na dohodu (DPP) — ať listina ukáže i hlídání limitu hodin.
      contractType: l.id === 4 ? 'DPP' : l.role === 'employer' ? null : 'HPP',
      contractHoursYear: l.id === 4 ? 300 : null,
      hodinyLetosMs: l.id === 4 ? 212 * 3_600_000 : 0,
      zKasy: vidiMzdy ? 0 : null, zKasyPocet: 0, uzaverky: [],
      vyplaceno: vidiMzdy ? 0 : null, vyplaty: [],
    }));
    return ok({ od: r.od, do: r.do, lide, zamky: [], vidiMzdy, payDailyCash: false, pravidla });
  }

  // ---- Poznámky k položkám ----
  if (cesta === '/api/notes/pocty' && metoda === 'GET') {
    const typ = q.get('typ') ?? '';
    const pocty: Record<string, { n: number; nove: boolean }> = {};
    for (const n of poznamky.filter(x => x.typ === typ)) {
      const x = (pocty[n.entita] ??= { n: 0, nove: false });
      x.n++;
      if (n.autorId !== meId) x.nove = true;
    }
    return ok({ pocty });
  }
  if (cesta === '/api/notes') {
    const tvar = (n: PoznamkaDemo) => {
      const a = clen(n.autorId);
      return { id: n.id, text: n.text, createdAt: n.createdAt, updatedAt: n.updatedAt, autor: { id: a.id, name: a.name, avatar: a.avatar },
        moje: n.autorId === meId, muzuSmazat: n.autorId === meId || s.role === 'vedeni', pripnuta: n.pripnuta, zminky: [] };
    };
    if (metoda === 'GET') {
      const typ = q.get('typ') ?? '';
      const ids = q.get('pocty');
      if (ids != null) {
        const pocty: Record<string, number> = {};
        for (const id of ids.split(',').filter(Boolean)) {
          const n = poznamky.filter(x => x.typ === typ && x.entita === id).length;
          if (n) pocty[id] = n;
        }
        return ok({ pocty });
      }
      const id = q.get('id') ?? '';
      return ok(poznamky.filter(x => x.typ === typ && x.entita === id)
        .sort((a, b) => Number(b.pripnuta) - Number(a.pripnuta) || a.createdAt.localeCompare(b.createdAt)).map(tvar));
    }
    const b = p.telo ?? {};
    if (metoda === 'POST') {
      const text = String(b.text ?? '').trim();
      if (!text) return chyba('Napiš text poznámky.');
      const n: PoznamkaDemo = { id: ++dalsiPoznamka, typ: String(b.typ ?? ''), entita: String(b.id ?? ''), text: text.slice(0, 2000),
        autorId: Number(b.zaKoho) || meId, createdAt: new Date().toISOString(), updatedAt: null, pripnuta: false };
      poznamky.push(n);
      return ok(tvar(n), 201);
    }
    if (metoda === 'PATCH') {
      const n = poznamky.find(x => x.id === Number(b.id));
      if (!n) return chyba('Poznámka už neexistuje.', 404);
      if (typeof b.text === 'string' && b.text.trim()) { n.text = b.text.trim().slice(0, 2000); n.updatedAt = new Date().toISOString(); }
      if (typeof b.pripnuta === 'boolean') n.pripnuta = b.pripnuta;
      return ok(tvar(n));
    }
    if (metoda === 'DELETE') {
      const id = Number(q.get('id'));
      poznamky = poznamky.filter(x => x.id !== id);
      return ok();
    }
  }
  return undefined;
};
