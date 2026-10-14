// Ukázka: „Tresty" (kolo 10) — co člověk pokazil a co za to dostal, sazebník a
// návrhy z dat. Stav žije v paměti stránky: udělený trest je vidět hned, nic
// nejde na skutečné API.

import { ok, chyba, type Obsluha } from '../typy';
import { KDO_JSEM, LIDE, clen } from '../data/lide';
import { dnes, posunDen } from '../cas';
import { mojeRole } from './zaklad';
import { normalizujText, platnyKlicNavrhu, validujDruh, validujTrest, type DruhTrestu, type NavrhTrestu, type Trest } from '@/lib/tresty';

const jmeno = (id: number) => clen(id)?.name ?? 'Někdo';
const avatar = (id: number) => clen(id)?.avatar ?? null;

let dalsiId = 100;
const DRUHY: DruhTrestu[] = [
  { id: 1, title: 'Pozdní příchod', description: 'Víc než 10 minut po začátku směny.', points: 10, bonusCut: null, active: true, createdAt: '' },
  { id: 2, title: 'Manko v kase', description: null, points: 20, bonusCut: 200, active: true, createdAt: '' },
  { id: 3, title: 'Nezavřená lednice / sklad', description: null, points: 15, bonusCut: null, active: true, createdAt: '' },
];
const zaklad = (o: Partial<Trest> & Pick<Trest, 'id' | 'userId' | 'day' | 'text'>): Trest => ({
  userName: jmeno(o.userId), userAvatar: avatar(o.userId), givenBy: 1, givenByName: jmeno(1),
  shiftId: null, closingId: null, taskId: null, typeId: null, typeTitle: null, photoUrl: null, points: 0, bonusCut: 0,
  status: 'plati', source: 'rucne', sourceKey: null, seenAt: null, response: null, responseAt: null, disputed: false,
  disputeHandledAt: null, cancelledBy: null, cancelledByName: null, cancelledAt: null, cancelNote: null,
  createdAt: `${o.day}T18:00:00.000Z`, ...o,
});
const TRESTY: Trest[] = [
  zaklad({ id: 1, userId: 4, day: posunDen(dnes(), -2), text: 'Pozdní příchod o 25 min.', typeId: 1, typeTitle: 'Pozdní příchod', points: 10, source: 'pozde', sourceKey: 'pozde:9001' }),
  zaklad({ id: 2, userId: 3, day: posunDen(dnes(), -5), text: 'Nezavřená lednice přes noc, vyhodilo se mléko.', typeId: 3, typeTitle: 'Nezavřená lednice / sklad', points: 15,
    seenAt: `${posunDen(dnes(), -4)}T08:00:00.000Z`, response: 'Lednici jsem zavírala, těsnění nedrží.', responseAt: `${posunDen(dnes(), -4)}T08:05:00.000Z`, disputed: true }),
  zaklad({ id: 4, userId: 3, day: posunDen(dnes(), -1), text: 'Pozdní příchod o 15 min.', typeId: 1, typeTitle: 'Pozdní příchod', points: 10, source: 'pozde', sourceKey: 'pozde:9004' }),
  zaklad({ id: 3, userId: 3, day: posunDen(dnes(), -12), text: 'Nevynesený koš před zavřením.', seenAt: `${posunDen(dnes(), -11)}T09:00:00.000Z` }),
];
const NAVRHY: NavrhTrestu[] = [
  { klic: 'pozde:9002', druh: 'pozde', userId: 3, userName: jmeno(3), userAvatar: avatar(3), day: posunDen(dnes(), -1), closingId: null, shiftId: null, minuty: 18, castka: null, poznamka: null },
  { klic: 'manko:9003', druh: 'manko', userId: 4, userName: jmeno(4), userAvatar: avatar(4), day: posunDen(dnes(), -3), closingId: 9003, shiftId: null, minuty: null, castka: 340, poznamka: null },
];
const ZAHOZENE = new Set<string>();

export const tresty: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, metoda } = p;
  if (!cesta.startsWith('/api/tresty')) return undefined;
  const opr = new Set(mojeRole(s).opravneni);
  const ja = KDO_JSEM[s.role];
  const smi = { udelit: opr.has('tresty.udelit'), sazebnik: opr.has('tresty.sazebnik'), tym: opr.has('tresty.zobrazit_tym') };
  const d = dnes();

  if (cesta === '/api/tresty/types') {
    if (metoda === 'GET') return ok({ types: smi.sazebnik ? DRUHY : DRUHY.filter(x => x.active), smi: { sazebnik: smi.sazebnik } });
    if (!smi.sazebnik) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
    if (metoda === 'POST') {
      const v = validujDruh(p.telo ?? {});
      if (!v.ok) return chyba(v.chyba);
      const n: DruhTrestu = { id: ++dalsiId, ...v.druh, createdAt: new Date().toISOString() };
      DRUHY.push(n);
      return ok({ ok: true, type: n }, 201);
    }
    if (metoda === 'PATCH') {
      const i = DRUHY.findIndex(x => x.id === Number(p.telo?.id));
      if (i < 0) return chyba('Položka nenalezena.', 404);
      const v = validujDruh({ ...DRUHY[i], ...(p.telo ?? {}) });
      if (!v.ok) return chyba(v.chyba);
      DRUHY[i] = { ...DRUHY[i], ...v.druh };
      return ok({ ok: true, type: DRUHY[i] });
    }
    if (metoda === 'DELETE') {
      const i = DRUHY.findIndex(x => x.id === Number(p.q.get('id')));
      if (i < 0) return chyba('Položka nenalezena.', 404);
      DRUHY.splice(i, 1);
      return ok();
    }
    return ok();
  }

  if (cesta === '/api/tresty/navrhy') {
    if (!smi.udelit) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
    const vyrizene = new Set([...ZAHOZENE, ...TRESTY.map(t => t.sourceKey).filter(Boolean) as string[]]);
    if (metoda === 'GET') return ok({ navrhy: NAVRHY.filter(n => !vyrizene.has(n.klic)) });
    if (metoda === 'POST') {
      if (!platnyKlicNavrhu(p.telo?.klic)) return chyba('Návrh trestu nesedí.');
      ZAHOZENE.add(p.telo.klic);
      return ok();
    }
    return ok();
  }

  const m = cesta.match(/^\/api\/tresty\/(\d+)$/);
  if (m) {
    const t = TRESTY.find(x => x.id === Number(m[1]));
    if (!t) return chyba('Trest nenalezen.', 404);
    const b = p.telo ?? {};
    const muj = t.userId === ja;
    if (b.seen === true) {
      if (!muj) return chyba('Potvrdit může jen ten, koho se trest týká.', 403);
      t.seenAt = t.seenAt ?? new Date().toISOString();
      return ok({ ok: true, item: t });
    }
    if (b.response !== undefined) {
      if (!muj) return chyba('Vyjádřit se může jen ten, koho se trest týká.', 403);
      const r = normalizujText(b.response);
      if (!r) return chyba('Napiš své vyjádření.');
      Object.assign(t, { response: r, responseAt: new Date().toISOString(), disputed: b.disagree === true, disputeHandledAt: null, seenAt: t.seenAt ?? new Date().toISOString() });
      return ok({ ok: true, item: t });
    }
    if (!smi.udelit) return chyba('Upravovat tresty smí jen ten, kdo je uděluje.', 403);
    if (b.status === 'zruseno') {
      Object.assign(t, { status: 'zruseno', cancelledBy: ja, cancelledByName: jmeno(ja), cancelledAt: new Date().toISOString(), cancelNote: typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null, disputeHandledAt: t.disputed ? new Date().toISOString() : t.disputeHandledAt });
      return ok({ ok: true, item: t });
    }
    if (b.disputeHandled === true) { t.disputeHandledAt = new Date().toISOString(); return ok({ ok: true, item: t }); }
    const v = validujTrest({ ...t, ...b, userId: t.userId }, d);
    if (!v.ok) return chyba(v.chyba);
    const zmena = v.trest.points !== t.points || v.trest.bonusCut !== t.bonusCut;
    Object.assign(t, { text: v.trest.text, day: v.trest.day, points: v.trest.points, bonusCut: v.trest.bonusCut, typeId: v.trest.typeId,
      typeTitle: DRUHY.find(x => x.id === v.trest.typeId)?.title ?? null, seenAt: zmena ? null : t.seenAt });
    return ok({ ok: true, item: t });
  }

  if (cesta === '/api/tresty') {
    if (metoda === 'GET') {
      if (p.q.get('strop') === '1') return ok({ strop: 1500, premie: 1500, uzKraceno: 0 });
      const scope = p.q.get('scope') === 'team' && smi.tym ? 'team' : 'mine';
      const stav = p.q.get('status');
      const mesic = p.q.get('month');
      const den = p.q.get('day');
      const closingId = Number(p.q.get('closingId')) || null;
      const userId = scope === 'team' ? Number(p.q.get('userId')) || null : ja;
      const items = TRESTY.filter(t => (!userId || t.userId === userId) && (!stav || t.status === stav) && (!mesic || t.day.startsWith(mesic)) && (!den || t.day === den) && (!closingId || t.closingId === closingId))
        .sort((a, b) => b.day.localeCompare(a.day));
      return ok({ items, druhy: smi.udelit || smi.sazebnik ? DRUHY.filter(x => x.active) : [], smi });
    }
    if (metoda === 'POST') {
      if (!smi.udelit) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
      const b = p.telo ?? {};
      const v = validujTrest(b, d);
      if (!v.ok) return chyba(v.chyba);
      if (!LIDE.some(l => l.id === v.trest.userId)) return chyba('Člověk není v podniku.', 404);
      const druh = v.trest.typeId ? DRUHY.find(x => x.id === v.trest.typeId) ?? null : null;
      if (v.trest.typeId && !druh) return chyba('Položka sazebníku už neexistuje.', 404);
      if (v.trest.sourceKey && TRESTY.some(t => t.sourceKey === v.trest.sourceKey)) return chyba('Za tohle už trest je.', 409);
      const t = zaklad({
        id: ++dalsiId, userId: v.trest.userId, day: v.trest.day, text: v.trest.text, givenBy: ja, givenByName: jmeno(ja),
        shiftId: v.trest.shiftId, closingId: v.trest.closingId, taskId: v.trest.taskId, typeId: v.trest.typeId, typeTitle: druh?.title ?? null,
        photoUrl: v.trest.photoUrl,
        points: b.points == null || b.points === '' ? druh?.points ?? 0 : v.trest.points,
        bonusCut: b.bonusCut == null || b.bonusCut === '' ? druh?.bonusCut ?? 0 : v.trest.bonusCut,
        source: v.trest.source, sourceKey: v.trest.sourceKey, createdAt: new Date().toISOString(),
      });
      TRESTY.unshift(t);
      return ok({ ok: true, item: t }, 201);
    }
    return ok();
  }
  return undefined;
};
