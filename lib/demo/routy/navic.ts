// Ukázka: „Navíc" (kolo 9, N1) — co člověk udělal nad rámec povinností, nabídka
// s body a uznávání. Stav žije v paměti stránky: zápis z ukázky je vidět hned,
// uznání přepne chip a nic nejde na skutečné API.

import { ok, chyba, type Obsluha } from '../typy';
import { KDO_JSEM, LIDE, clen } from '../data/lide';
import { dnes, posunDen } from '../cas';
import { mojeRole } from './zaklad';
import { limitNabidkyVycerpan, nabidkaPlatna, validujNabidku, validujZapis, type Navic, type NabidkaNavic } from '@/lib/navic';

const jmeno = (id: number) => clen(id)?.name ?? 'Někdo';
const avatar = (id: number) => clen(id)?.avatar ?? null;

let dalsiId = 100;
const NABIDKA: NabidkaNavic[] = [
  { id: 1, title: 'Vytřít sklad a chodbu', description: 'Včetně rohů za regály.', points: 20, bonusCzk: null, autoApprove: false, active: true, validFrom: null, validTo: null, maxPerDay: 1, createdAt: '' },
  { id: 2, title: 'Umýt výlohu zvenku', description: null, points: 15, bonusCzk: null, autoApprove: true, active: true, validFrom: null, validTo: null, maxPerDay: 1, createdAt: '' },
  { id: 3, title: 'Zaskočit za kolegu na směnu', description: 'Nahlásit, za koho.', points: 50, bonusCzk: 300, autoApprove: false, active: true, validFrom: null, validTo: null, maxPerDay: null, createdAt: '' },
];
const ZAPISY: Navic[] = [
  { id: 1, userId: 3, userName: jmeno(3), userAvatar: avatar(3), reportedBy: null, reportedByName: null, day: posunDen(dnes(), -1), shiftId: null, closingId: null, taskId: null, offerId: 1, offerTitle: 'Vytřít sklad a chodbu', text: 'Vytřela jsem sklad i chodbu, včetně rohů.', photoUrl: null, pointsProposed: 20, status: 'ceka', points: null, bonusCzk: null, decidedBy: null, decidedByName: null, decidedAt: null, decisionNote: null, createdAt: `${posunDen(dnes(), -1)}T19:40:00.000Z` },
  { id: 2, userId: 4, userName: jmeno(4), userAvatar: avatar(4), reportedBy: null, reportedByName: null, day: posunDen(dnes(), -3), shiftId: null, closingId: null, taskId: null, offerId: null, offerTitle: null, text: 'Vyřešil jsem reklamaci dortu a zákazník odcházel spokojený.', photoUrl: null, pointsProposed: null, status: 'uznano', points: 30, bonusCzk: null, decidedBy: 1, decidedByName: jmeno(1), decidedAt: `${posunDen(dnes(), -2)}T09:10:00.000Z`, decisionNote: 'Díky, přesně takhle.', createdAt: `${posunDen(dnes(), -3)}T21:05:00.000Z` },
  { id: 3, userId: 3, userName: jmeno(3), userAvatar: avatar(3), reportedBy: null, reportedByName: null, day: posunDen(dnes(), -6), shiftId: null, closingId: null, taskId: null, offerId: 2, offerTitle: 'Umýt výlohu zvenku', text: 'Umytá výloha.', photoUrl: null, pointsProposed: 15, status: 'uznano', points: 15, bonusCzk: null, decidedBy: null, decidedByName: null, decidedAt: `${posunDen(dnes(), -6)}T17:00:00.000Z`, decisionNote: null, createdAt: `${posunDen(dnes(), -6)}T17:00:00.000Z` },
];

export const navic: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, metoda } = p;
  if (!cesta.startsWith('/api/navic')) return undefined;
  const role = mojeRole(s);
  const opr = new Set(role.opravneni);
  const ja = KDO_JSEM[s.role];
  const smiUznat = opr.has('navic.uznat');
  const smiTym = opr.has('navic.zobrazit_tym');
  const smiNabidku = opr.has('navic.nabidka');
  const smiZapsat = opr.has('navic.zapsat');
  const d = dnes();

  if (cesta === '/api/navic/offers') {
    if (metoda === 'GET') return ok({ offers: smiNabidku ? NABIDKA : NABIDKA.filter(n => nabidkaPlatna(n, d)), smi: { nabidka: smiNabidku } });
    if (!smiNabidku) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
    if (metoda === 'POST') {
      const v = validujNabidku(p.telo ?? {});
      if (!v.ok) return chyba(v.chyba);
      const n: NabidkaNavic = { id: ++dalsiId, ...v.nabidka, createdAt: new Date().toISOString() };
      NABIDKA.push(n);
      return ok({ ok: true, offer: n }, 201);
    }
    if (metoda === 'PATCH') {
      const i = NABIDKA.findIndex(n => n.id === Number(p.telo?.id));
      if (i < 0) return chyba('Položka nenalezena.', 404);
      const v = validujNabidku({ ...NABIDKA[i], ...(p.telo ?? {}) });
      if (!v.ok) return chyba(v.chyba);
      NABIDKA[i] = { ...NABIDKA[i], ...v.nabidka };
      return ok({ ok: true, offer: NABIDKA[i] });
    }
    if (metoda === 'DELETE') {
      const i = NABIDKA.findIndex(n => n.id === Number(p.q.get('id')));
      if (i < 0) return chyba('Položka nenalezena.', 404);
      NABIDKA.splice(i, 1);
      return ok();
    }
    return ok();
  }

  const m = cesta.match(/^\/api\/navic\/(\d+)$/);
  if (m) {
    const z = ZAPISY.find(x => x.id === Number(m[1]));
    if (!z) return chyba('Zápis nenalezen.', 404);
    if (metoda === 'DELETE') {
      if (!smiUznat && (z.userId !== ja || z.status !== 'ceka')) return chyba('Cizí zápis smazat nejde.', 403);
      ZAPISY.splice(ZAPISY.indexOf(z), 1);
      return ok();
    }
    if (metoda === 'PATCH') {
      const b = p.telo ?? {};
      if (typeof b.status === 'string') {
        if (!smiUznat) return chyba('Uznávat navíc smí jen ten, kdo na to má oprávnění.', 403);
        if (b.status === 'uznano') {
          z.status = 'uznano'; z.points = Number.isFinite(Number(b.points)) ? Number(b.points) : (z.pointsProposed ?? 0);
          z.bonusCzk = Number.isFinite(Number(b.bonusCzk)) && Number(b.bonusCzk) > 0 ? Number(b.bonusCzk) : null;
        } else {
          z.status = 'odmitnuto'; z.points = null; z.bonusCzk = null;
        }
        z.decidedBy = ja; z.decidedByName = jmeno(ja); z.decidedAt = new Date().toISOString(); z.decisionNote = typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null;
        return ok({ ok: true, item: z });
      }
      const v = validujZapis({ ...b, day: b.day ?? z.day }, d, smiUznat);
      if (!v.ok) return chyba(v.chyba);
      Object.assign(z, { text: v.zapis.text, day: v.zapis.day, offerId: v.zapis.offerId, offerTitle: NABIDKA.find(n => n.id === v.zapis.offerId)?.title ?? null, photoUrl: v.zapis.photoUrl });
      return ok({ ok: true, item: z });
    }
    return ok();
  }

  if (cesta === '/api/navic') {
    if (metoda === 'GET') {
      const scope = p.q.get('scope') === 'team' && smiTym ? 'team' : 'mine';
      const stav = p.q.get('status');
      const mesic = p.q.get('month');
      const den = p.q.get('day');
      const userId = scope === 'team' ? Number(p.q.get('userId')) || null : (Number(p.q.get('actingAs')) || ja);
      const items = ZAPISY.filter(z => (!userId || z.userId === userId) && (!stav || z.status === stav) && (!mesic || z.day.startsWith(mesic)) && (!den || z.day === den))
        .sort((a, b) => (a.status === 'ceka' ? 0 : 1) - (b.status === 'ceka' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt));
      return ok({ items, nabidka: NABIDKA.filter(n => nabidkaPlatna(n, d)), smi: { uznat: smiUznat, nabidka: smiNabidku, tym: smiTym, zapsat: smiZapsat } });
    }
    if (metoda === 'POST') {
      const b = p.telo ?? {};
      const cilovy = Number(b.userId) || Number(b.actingAs) || ja;
      if (cilovy !== ja && !smiUznat && s.role !== 'kiosk') return chyba('Zapsat navíc za jiného člověka smí jen ten, kdo navíc uznává.', 403);
      if (!LIDE.some(l => l.id === cilovy)) return chyba('Člověk není v podniku.', 404);
      const v = validujZapis(b, d, smiUznat);
      if (!v.ok) return chyba(v.chyba);
      const n = v.zapis.offerId ? NABIDKA.find(x => x.id === v.zapis.offerId) ?? null : null;
      if (v.zapis.offerId && !n) return chyba('Položka nabídky už neexistuje.', 404);
      if (n && limitNabidkyVycerpan(n, ZAPISY.filter(z => z.userId === cilovy && z.day === v.zapis.day))) return chyba('Tohle jde za den zapsat jen jednou.', 409);
      const uznat = (b.uznat && typeof b.uznat === 'object' && smiUznat) ? { points: Number(b.uznat.points ?? n?.points ?? 0) || 0, bonusCzk: Number(b.uznat.bonusCzk ?? n?.bonusCzk ?? 0) || null, kym: ja }
        : n?.autoApprove ? { points: n.points, bonusCzk: n.bonusCzk, kym: null } : null;
      const z: Navic = {
        id: ++dalsiId, userId: cilovy, userName: jmeno(cilovy), userAvatar: avatar(cilovy),
        reportedBy: cilovy === ja && s.role !== 'kiosk' ? null : ja, reportedByName: cilovy === ja && s.role !== 'kiosk' ? null : jmeno(ja),
        day: v.zapis.day, shiftId: v.zapis.shiftId, closingId: v.zapis.closingId, taskId: v.zapis.taskId, offerId: v.zapis.offerId, offerTitle: n?.title ?? null,
        text: v.zapis.text, photoUrl: v.zapis.photoUrl, pointsProposed: n?.points ?? null,
        status: uznat ? 'uznano' : 'ceka', points: uznat?.points ?? null, bonusCzk: uznat?.bonusCzk ?? null,
        decidedBy: uznat?.kym ?? null, decidedByName: uznat?.kym ? jmeno(uznat.kym) : null, decidedAt: uznat ? new Date().toISOString() : null, decisionNote: null,
        createdAt: new Date().toISOString(),
      };
      ZAPISY.unshift(z);
      return ok({ ok: true, item: z }, 201);
    }
    return ok();
  }
  return undefined;
};
