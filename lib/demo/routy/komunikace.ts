// Komunikace a postupy: nástěnka (oznámení), chat, nejbližší akce, postupy
// a návody. Oznámení a zprávy se dají psát a hned se objeví.

import { chyba, ok, type Obsluha } from '../typy';
import { KDO_JSEM, LIDE, clen } from '../data/lide';
import { casDnes, posunDen } from '../cas';
import type { BehPostupu, DemoStav } from '../stav';
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

const pocetKroku = (procedureId: number) => POSTUPY().find(x => x.id === procedureId)?.items.length ?? 0;

/** Rozběhnutý běh ve tvaru `shapeActive` ze skutečné routy (Runner z něj kreslí checklist). */
function tvarAktivnihoBehu(b: BehPostupu) {
  const proc = POSTUPY().find(x => x.id === b.procedureId)!;
  return {
    id: b.id, procedureId: proc.id, name: proc.name, icon: proc.icon, color: proc.color, items: proc.items,
    checkedItems: b.checked, skippedItems: b.skipped, totalItems: proc.items.length, startedAt: b.startedAt,
    status: b.status, skipReasons: b.skipReasons,
  };
}

/** Řádek seznamu běhů týmu (`procedure_runs` JOIN procedures, users). */
function tvarBehu(b: BehPostupu) {
  const proc = POSTUPY().find(x => x.id === b.procedureId)!;
  const konec = b.completedAt ? new Date(b.completedAt).getTime() : Date.now();
  return {
    id: b.id, procedure_id: proc.id, procedure_name: proc.name, procedure_icon: proc.icon, procedure_color: proc.color,
    user_id: b.userId, user_name: clen(b.userId).name, user_avatar: clen(b.userId).avatar, status: b.status,
    total_items: proc.items.length, checked_items: b.checked, skipped_items: b.skipped, skip_reasons: b.skipReasons,
    started_at: b.startedAt, completed_at: b.completedAt, duration_seconds: Math.max(0, Math.round((konec - new Date(b.startedAt).getTime()) / 1000)),
  };
}

/**
 * Běhy, které tým „už udělal" před otevřením ukázky. Zavírací postup je vždy
 * DNEŠNÍ, protože ho zámek uzávěrky (`zaviraciPostupHotov`) počítá za hotový
 * v kteroukoli denní dobu; s včerejším časem by widget Povinné postupy tvrdil
 * „Čeká" vedle zámku, který říká „hotovo". Čas se bere od teď (nikdy v
 * budoucnosti a nejdřív po dnešní půlnoci). Otevírací rutina je ranní: dnes,
 * když už je po ní, jinak včera.
 */
function STATICKE_BEHY(dnes: string) {
  const ted = Date.now();
  const odPulnoci = new Date(casDnes('00:05', dnes)).getTime();
  const beh = (id: number, procedureId: number, nazev: string, ikona: string, kdo: number, zacatek: string, konec: string) => (
    { id, procedure_id: procedureId, procedure_name: nazev, procedure_icon: ikona, user_id: kdo, user_name: clen(kdo).name, user_avatar: clen(kdo).avatar, status: 'completed', total_items: 4, checked_items: [0, 1, 2, 3], skipped_items: [], skip_reasons: {}, started_at: zacatek, completed_at: konec, duration_seconds: Math.round((new Date(konec).getTime() - new Date(zacatek).getTime()) / 1000) }
  );
  const otevreniDnes = ted >= new Date(casDnes('07:40', dnes)).getTime();
  const rano = otevreniDnes ? dnes : posunDen(dnes, -1);
  const zavKonec = new Date(Math.max(ted - 25 * 60000, odPulnoci + 17 * 60000)).toISOString();
  const zavStart = new Date(new Date(zavKonec).getTime() - 17 * 60000).toISOString();
  return [
    beh(31, ID_ZAVIRACIHO_POSTUPU, 'Zavírací postup', 'check', 3, zavStart, zavKonec),
    beh(32, 1, 'Otevírací rutina', 'clock', 2, casDnes('07:09', rano), casDnes('07:21', rano)),
  ];
}

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
      // Tvar skutečné routy: { ok: true, announcement } (widget Nástěnka čte `d.ok`).
      if (!opr.has('oznameni.spravovat')) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
      const text = String(p.telo?.content ?? '').trim();
      if (!text) return chyba('Napiš text oznámení.');
      if (text.length > 1000) return chyba('Oznámení je moc dlouhé (max 1000 znaků).');
      const novy = { id: ++s.dalsiId, content: text, pinned: true, createdAt: new Date().toISOString(), authorId: meId };
      s.oznameni.unshift(novy);
      // Volitelně i do týmového chatu, stejně jako skutečná routa.
      if (p.telo?.postToChat === true) {
        s.zpravy.push({ id: ++s.dalsiId, conversationId: ID_TYMOVEHO_CHATU, userId: meId, content: `📌 ${text}`, createdAt: novy.createdAt });
      }
      k.hlas('oznameni-pridano', { id: novy.id });
      return ok({ ok: true, announcement: { id: novy.id, content: novy.content, pinned: novy.pinned, createdAt: novy.createdAt } });
    }
    if (metoda === 'PATCH') {
      // Skutečná routa vrací upravený řádek (id, content, pinned, createdAt) nebo 404.
      const o = s.oznameni.find(x => x.id === Number(p.telo?.id));
      if (!o) return chyba('Oznámení nenalezeno', 404);
      if (typeof p.telo?.pinned === 'boolean') o.pinned = p.telo.pinned;
      if (typeof p.telo?.content === 'string' && p.telo.content.trim()) o.content = p.telo.content.trim().slice(0, 2000);
      return ok({ id: o.id, content: o.content, pinned: o.pinned, createdAt: o.createdAt });
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
      // Tvar skutečné routy: { message } (useChat.sendMessage čte `data.message`).
      return ok({ message: { id: z.id, conversationId: id, senderId: meId, content: z.content, attachmentUrl: null, attachmentType: null, attachmentName: null, createdAt: z.createdAt, senderName: clen(meId).name, senderAvatar: clen(meId).avatar } });
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
    // Na tabletu jedná za vybranou osobu (`actingAs`), jinak za přihlášeného.
    const kdo = Number(p.telo?.actingAs ?? q.get('actingAs')) || meId;
    if (metoda === 'GET') {
      // ?active=1: rozběhnutý běh volajícího (Runner se po obnovení stránky vrací do rozdělané práce).
      if (q.get('active')) {
        const beh = s.behyPostupu.find(b => b.status === 'running' && b.userId === kdo);
        return ok({ active: beh ? tvarAktivnihoBehu(beh) : null });
      }
      const dokoncene = s.behyPostupu.filter(b => b.status === 'completed').map(tvarBehu).reverse();
      const vsechny = [...dokoncene, ...STATICKE_BEHY(s.dnes)];
      // ?today=team: dnešní běhy týmu (uzávěrka podle nich pozná, co se dnes udělalo).
      return ok({ runs: q.get('today') === 'team' ? vsechny.filter(r => String(r.completed_at ?? r.started_at).slice(0, 10) === s.dnes) : vsechny });
    }
    if (metoda === 'POST') {
      // Spuštění: zavře případný předchozí běh téhož člověka a vrátí `active` (ProcedureProvider čeká `data.active`).
      const proc = POSTUPY().find(x => x.id === Number(p.telo?.procedureId));
      if (!proc) return chyba('Postup nenalezen', 404);
      for (const b of s.behyPostupu) if (b.status === 'running' && b.userId === kdo) { b.status = 'completed'; b.completedAt = new Date().toISOString(); }
      const beh = { id: ++s.dalsiId, procedureId: proc.id, userId: kdo, checked: [], skipped: [], skipReasons: {}, startedAt: new Date().toISOString(), completedAt: null, status: 'running' as const };
      s.behyPostupu.push(beh);
      k.hlas('postup-spusten', { id: proc.id, nazev: proc.name });
      return ok({ active: tvarAktivnihoBehu(beh) });
    }
    if (metoda === 'PATCH') {
      const beh = s.behyPostupu.find(b => b.id === Number(p.telo?.runId));
      if (!beh) return chyba('Průběh nenalezen', 404);
      if (p.telo?.cancel) { s.behyPostupu = s.behyPostupu.filter(b => b !== beh); return ok(); }
      const cisla = (a: unknown) => Array.isArray(a) ? Array.from(new Set(a.map(n => parseInt(String(n))).filter(n => !Number.isNaN(n)))) : [];
      beh.checked = cisla(p.telo?.checkedItems);
      beh.skipped = cisla(p.telo?.skippedItems).filter(i => !beh.checked.includes(i));
      beh.skipReasons = p.telo?.skipReasons && typeof p.telo.skipReasons === 'object' ? p.telo.skipReasons : {};
      if (p.telo?.complete) {
        beh.status = 'completed';
        beh.completedAt = new Date().toISOString();
        // Dokončený zavírací postup je jedna z povinných věcí před uzávěrkou.
        if (beh.procedureId === ID_ZAVIRACIHO_POSTUPU) s.zaviraciPostupHotov = true;
        k.hlas('postup-dokoncen', { id: beh.procedureId, nazev: POSTUPY().find(x => x.id === beh.procedureId)?.name ?? '' });
        return ok({ run: tvarBehu(beh) });
      }
      return ok({ run: { id: beh.id, procedure_id: beh.procedureId, checked_items: beh.checked, skipped_items: beh.skipped, total_items: pocetKroku(beh.procedureId), status: 'running', started_at: beh.startedAt } });
    }
    return ok({ ok: true });
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
