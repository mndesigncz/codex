// Komunikace a postupy: nástěnka (oznámení), chat, nejbližší akce, postupy
// a návody. Oznámení a zprávy se dají psát a hned se objeví.

import { chyba, ok, type Obsluha } from '../typy';
import { KDO_JSEM, LIDE, clen } from '../data/lide';
import { posunDen } from '../cas';
import type { DemoStav } from '../stav';
import { mojeRole } from './zaklad';
import { ID_POVINNEHO_NAVODU, ID_ZAVIRACIHO_POSTUPU } from './uzaverky';

const ID_TYMOVEHO_CHATU = 1;

function tvarOznameni(o: DemoStav['oznameni'][number]) {
  const a = clen(o.authorId);
  return { id: o.id, content: o.content, pinned: o.pinned, createdAt: o.createdAt, authorName: a.name, authorAvatar: a.avatar };
}

function konverzace(s: DemoStav, meId: number) {
  const tym = s.zpravy.filter(z => z.conversationId === ID_TYMOVEHO_CHATU).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const posledni = tym[tym.length - 1];
  const neprectene = s.precteno.has(ID_TYMOVEHO_CHATU) ? 0 : tym.filter(z => z.userId !== meId).length;
  return [{ id: ID_TYMOVEHO_CHATU, type: 'team', name: 'Týmový chat', avatar: null, otherUserId: null, lastMessage: posledni?.content ?? null, lastTime: posledni?.createdAt ?? null, unreadCount: neprectene }];
}

const POSTUPY = () => [
  { id: 1, name: 'Otevírací rutina', description: 'Co se dělá před otevřením.', icon: 'clock', color: '1', items: [{ text: 'Zapnout kávovar a mlýnek', emoji: '☕', minutes: 10 }, { text: 'Zkontrolovat mléko a ovesný nápoj' }, { text: 'Napéct ranní koláče' }, { text: 'Spočítat kasu při otevření' }], remindAt: null, remindDays: [], remindAnchor: 'open', requireBeforeClosing: false, approved: true, submittedBy: null },
  { id: 2, name: 'Kontrola lednic', description: 'Teplota a data trvanlivosti.', icon: 'box', color: '1', items: ['Změřit teplotu', 'Vyhodit prošlé'], remindAt: '14:00', remindDays: [], remindAnchor: 'time', requireBeforeClosing: false, approved: true, submittedBy: null },
  { id: ID_ZAVIRACIHO_POSTUPU, name: 'Zavírací postup', description: 'Večerní uzavření.', icon: 'check', color: '1', items: ['Uklidit bar a vyčistit kávovar', 'Spočítat kasu', 'Vypnout spotřebiče', 'Zamknout'], remindAt: null, remindDays: [], remindAnchor: 'close', requireBeforeClosing: true, approved: true, submittedBy: null },
];

const NAVODY = (den: string, precten: boolean) => [
  { id: 1, title: 'Jak se dělá flat white', categoryId: null, updatedAt: `${posunDen(den, -12)}T09:10:00Z`, approved: true, submittedBy: null, requireRead: false, readCount: 4, myRead: true, excerpt: 'Dvojité espresso, mléko do 60 °C, nalít jedním tahem.', hasChecklist: true, productId: null, forClosing: false, itemId: null },
  { id: 2, title: 'Domácí limonáda — postup', categoryId: null, updatedAt: `${posunDen(den, -20)}T09:10:00Z`, approved: true, submittedBy: null, requireRead: false, readCount: 5, myRead: true, excerpt: 'Citrony, sirup, dvě dávky po 5 litrech.', hasChecklist: true, productId: null, forClosing: false, itemId: null },
  { id: ID_POVINNEHO_NAVODU, title: 'Nová pokladna: zavírání krok za krokem', categoryId: null, updatedAt: `${posunDen(den, -3)}T09:10:00Z`, approved: true, submittedBy: null, requireRead: true, readCount: 5, myRead: precten, excerpt: 'Jak spočítat kasu a odeslat uzávěrku na tabletu.', hasChecklist: false, productId: null, forClosing: true, itemId: null },
];

export const komunikace: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, metoda, q } = p;
  const meId = KDO_JSEM[s.role];
  const opr = new Set(mojeRole(s).opravneni);

  // ---- Nástěnka ----
  if (cesta === '/api/announcements') {
    if (metoda === 'GET') {
      const seznam = s.oznameni.filter(o => o.pinned || opr.has('oznameni.spravovat')).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
      return ok({ announcements: seznam.map(o => tvarOznameni(o)) });
    }
    if (metoda === 'POST') {
      const text = String(p.telo?.content ?? '').trim();
      if (!text) return chyba('Napiš text oznámení.');
      const novy = { id: ++s.dalsiId, content: text, pinned: true, createdAt: new Date().toISOString(), authorId: meId };
      s.oznameni.unshift(novy);
      k.hlas('oznameni-pridano', { id: novy.id });
      return ok(tvarOznameni(novy));
    }
    if (metoda === 'PATCH') {
      const o = s.oznameni.find(x => x.id === Number(p.telo?.id));
      if (o && typeof p.telo?.pinned === 'boolean') o.pinned = p.telo.pinned;
      if (o && typeof p.telo?.content === 'string') o.content = p.telo.content;
      return ok();
    }
    if (metoda === 'DELETE') { s.oznameni = s.oznameni.filter(x => x.id !== Number(q.get('id'))); return ok(); }
  }

  // ---- Chat ----
  if (cesta === '/api/conversations') return ok({ conversations: konverzace(s, meId) });
  const m = /^\/api\/conversations\/(\d+)\/(messages|read)$/.exec(cesta);
  if (m) {
    const id = Number(m[1]);
    if (m[2] === 'read') { s.precteno.add(id); return ok(); }
    if (metoda === 'GET') {
      return ok({
        messages: s.zpravy.filter(z => z.conversationId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(z => ({
          id: z.id, conversationId: z.conversationId, senderId: z.userId, content: z.content, attachmentUrl: null, attachmentType: null, attachmentName: null,
          createdAt: z.createdAt, senderName: clen(z.userId).name, senderAvatar: clen(z.userId).avatar,
        })),
      });
    }
    if (metoda === 'POST') {
      const text = String(p.telo?.content ?? '').trim();
      if (!text) return chyba('Napiš zprávu.');
      const z = { id: ++s.dalsiId, conversationId: id, userId: meId, content: text, createdAt: new Date().toISOString() };
      s.zpravy.push(z);
      s.precteno.add(id);
      k.hlas('zprava-odeslana', { id: z.id });
      return ok({ id: z.id, conversationId: id, senderId: meId, content: z.content, attachmentUrl: null, attachmentType: null, attachmentName: null, createdAt: z.createdAt, senderName: clen(meId).name, senderAvatar: clen(meId).avatar });
    }
  }
  if (cesta === '/api/messages') return ok({ messages: [] });

  // ---- Akce ----
  if (cesta === '/api/events') {
    if (metoda !== 'GET') return ok({ ok: true });
    const d = posunDen(s.dnes, 6);
    return ok({
      events: [{
        id: 1, title: 'Degustace kávy s pražírnou', description: 'Malá večerní degustace pro stálé hosty.', kind: 'other', date: d,
        startTime: '18:00', endTime: '20:30', location: 'Kavárna U Lípy (ukázka)', offsite: false, status: 'planned', public: false, capacity: 20,
        checklist: [{ text: 'Nachystat šálky a degustační lístky', done: true }, { text: 'Objednat koláčky k degustaci', done: false }, { text: 'Přeskládat stoly', done: false }],
        packing: [], photos: [], menu: [], posPlaceId: null, crew: [2, 3], crewPeople: [2, 3].map(id => ({ id, name: clen(id).name, avatar: clen(id).avatar })),
        onShift: [], closingsCount: 0, closingsTotal: opr.has('akce.finance') ? 0 : null, followers: 0, going: 0,
        revenue: null, costs: null, notes: null, createdBy: 1,
      }],
      isEmployer: opr.has('akce.upravit'),
    });
  }

  // ---- Postupy a návody ----
  if (cesta === '/api/procedures') {
    if (metoda !== 'GET') return ok({ ok: true, id: ++s.dalsiId });
    return ok({ procedures: POSTUPY(), hasShiftToday: true, openingToday: { open: '07:30', close: '20:00', closed: false } });
  }
  if (cesta === '/api/procedures/runs') {
    if (metoda !== 'GET') return ok({ ok: true });
    const dnes = s.dnes;
    return ok({
      runs: [
        { id: 31, procedure_id: ID_ZAVIRACIHO_POSTUPU, procedure_name: 'Zavírací postup', procedure_icon: 'check', user_id: 2, user_name: clen(2).name, user_avatar: clen(2).avatar, status: 'completed', total_items: 4, checked_items: [0, 1, 2, 3], skipped_items: [], skip_reasons: {}, started_at: `${dnes}T05:10:00Z`, completed_at: `${dnes}T05:24:00Z`, duration_seconds: 840 },
        { id: 32, procedure_id: 1, procedure_name: 'Otevírací rutina', procedure_icon: 'clock', user_id: 2, user_name: clen(2).name, user_avatar: clen(2).avatar, status: 'completed', total_items: 4, checked_items: [0, 1, 2, 3], skipped_items: [], skip_reasons: {}, started_at: `${dnes}T05:31:00Z`, completed_at: `${dnes}T05:40:00Z`, duration_seconds: 540 },
      ],
    });
  }
  if (cesta === '/api/procedures/remind') return ok();
  if (/^\/api\/procedures\/\d+$/.test(cesta)) return ok({ ok: true });
  if (cesta === '/api/guides') {
    if (metoda !== 'GET') return ok({ ok: true, id: ++s.dalsiId });
    return ok({ guides: NAVODY(s.dnes, s.navodPrecten) });
  }
  if (cesta === '/api/guides/categories') return ok({ categories: [] });
  if (cesta === '/api/guides/ctenari') return ok({ guides: [] });
  const g = /^\/api\/guides\/(\d+)(\/reads)?$/.exec(cesta);
  if (g) {
    const id = Number(g[1]);
    if (g[2]) {
      if (metoda === 'POST' && id === ID_POVINNEHO_NAVODU) { s.navodPrecten = true; k.hlas('navod-precten', { id }); }
      return ok({ reads: LIDE.filter(l => l.role === 'employee').map(l => ({ userId: l.id, name: l.name, avatar: l.avatar, readAt: new Date().toISOString() })), readers: [] });
    }
    const n = NAVODY(s.dnes, s.navodPrecten).find(x => x.id === id);
    return n ? ok({ guide: { id: n.id, title: n.title, content: `${n.excerpt}\n- Postupuj krok za krokem\n- Při nejistotě se zeptej vedoucí směny`, checklist: [], categoryId: null, updatedAt: n.updatedAt, author: clen(1).name } }) : chyba('Návod nenalezen', 404);
  }

  return undefined;
};
