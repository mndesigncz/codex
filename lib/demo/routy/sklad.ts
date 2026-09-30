// Sklad: zásoby, kategorie, dodavatelé, objednávky. Úprava množství
// (stepper, odpis, otevření balení) mění stav a stav položky
// (ok / dochází / kritické) se přepočítá jako na serveru, takže widget
// „Dochází" a nákupní seznam ukážou výsledek hned.

import { chyba, ok, type Obsluha } from '../typy';
import { clen, KDO_JSEM } from '../data/lide';
import type { DemoStav, Zasoba } from '../stav';
import { mojeRole } from './zaklad';

function stavZasoby(z: Zasoba): 'ok' | 'low' | 'critical' {
  if (z.quantity <= z.criticalQuantity) return 'critical';
  if (z.quantity <= z.minQuantity) return 'low';
  return 'ok';
}

function tvar(s: DemoStav, z: Zasoba, vidiCeny: boolean) {
  const kat = s.kategorie.find(c => c.id === z.categoryId);
  return {
    id: z.id, name: z.name, category: kat?.name ?? '', categoryId: z.categoryId,
    quantity: z.quantity, status: stavZasoby(z), unit: z.unit,
    minQuantity: z.minQuantity, criticalQuantity: z.criticalQuantity, maxQuantity: z.maxQuantity,
    supplier: z.supplier, supplierUrl: null, unitCost: vidiCeny ? z.unitCost : null,
    packageSize: null, openAmount: null, contentUnit: null, brand: null, description: null,
    archived: false, hideFromOverview: false, highlight: null, approved: true, submittedBy: null, submittedByName: null,
    photoUrl: null, portions: [], updatedAt: z.updatedAt, updatedBy: z.updatedBy, updatedByName: clen(z.updatedBy).name,
    thresholdUnit: 'package', madeInHouse: z.supplier === 'vlastní výroba', batchYield: null, productionLabel: null, buyFor: [],
  };
}

function zapisPohyb(s: DemoStav, z: Zasoba, puvodni: number, nove: number, poznamka: string | null, kdo: number) {
  s.pohybySkladu.unshift({ id: ++s.dalsiId, itemId: z.id, oldQuantity: puvodni, newQuantity: nove, note: poznamka, createdAt: new Date().toISOString(), userId: kdo });
}

export const sklad: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, metoda, q } = p;
  const meId = KDO_JSEM[s.role];
  const opr = new Set(mojeRole(s).opravneni);
  const vidiCeny = opr.has('sklad.ceny');

  if (cesta === '/api/inventory') {
    if (metoda === 'GET') return ok(s.zasoby.map(z => tvar(s, z, vidiCeny)));
    if (metoda === 'POST') {
      const b = p.telo ?? {};
      const jmeno = String(b.name ?? '').trim();
      if (!jmeno) return chyba('Zadej název položky.');
      const kat = s.kategorie.find(c => c.id === Number(b.categoryId)) ?? s.kategorie.find(c => c.name === b.category) ?? s.kategorie[0];
      const nova: Zasoba = {
        id: ++s.dalsiId, name: jmeno, categoryId: kat.id, quantity: Number(b.quantity) || 0, unit: String(b.unit ?? 'ks'),
        minQuantity: Number(b.minQuantity) || 2, criticalQuantity: Number(b.criticalQuantity) || 1, maxQuantity: Number(b.maxQuantity) || 10,
        supplier: b.supplier ? String(b.supplier) : null, unitCost: Number(b.unitCost) || 0, updatedAt: new Date().toISOString(), updatedBy: meId,
      };
      s.zasoby.push(nova);
      zapisPohyb(s, nova, 0, nova.quantity, 'Nová položka', meId);
      k.hlas('sklad-pridano', { id: nova.id });
      return ok(tvar(s, nova, vidiCeny));
    }
  }
  if (cesta === '/api/inventory/bulk') return ok({ ok: true });
  if (cesta === '/api/inventory/categories') {
    if (metoda === 'GET') return ok(s.kategorie.map(c => ({ ...c, zOrganizace: false, sdileno: false, spravuje: null, tracksOpen: false, contentUnit: null, defaultPackageSize: null, thresholdUnit: 'package', defaults: null, scale: null, hideFromOverview: false })));
    return ok({ ok: true });
  }
  if (cesta.startsWith('/api/inventory/categories/')) return ok({ ok: true });
  if (cesta === '/api/inventory/log') {
    const id = q.get('itemId') ? Number(q.get('itemId')) : null;
    const rows = s.pohybySkladu.filter(x => id == null || x.itemId === id).slice(0, id ? 30 : 20).map(x => {
      const z = s.zasoby.find(y => y.id === x.itemId);
      return { id: x.id, itemId: x.itemId, oldQuantity: x.oldQuantity, newQuantity: x.newQuantity, oldOpen: null, newOpen: null, note: x.note, createdAt: x.createdAt, userName: clen(x.userId).name, itemName: z?.name ?? '', unit: z?.unit ?? '', contentUnit: null };
    });
    return ok(rows);
  }
  if (cesta === '/api/inventory/reports') {
    if (metoda === 'POST') {
      const b = p.telo ?? {};
      const polozky = Array.isArray(b.items) ? b.items : [];
      s.hlaseniSkladu.unshift({ id: ++s.dalsiId, items: polozky, note: b.note ?? null, status: 'new', authorId: meId, createdAt: new Date().toISOString() });
      k.hlas('hlaseni-skladu', { polozek: polozky.length });
      return ok({ ok: true });
    }
    if (metoda === 'PATCH') {
      const r = s.hlaseniSkladu.find(x => x.id === Number(p.telo?.id));
      if (r) r.status = p.telo?.status === 'done' ? 'done' : 'new';
      return ok({ ok: true });
    }
    return ok({
      reports: s.hlaseniSkladu.map(r => ({ id: r.id, items: JSON.stringify(r.items), note: r.note, status: r.status, author_name: clen(r.authorId).name, author_avatar: clen(r.authorId).avatar, created_at: r.createdAt })),
    });
  }
  if (cesta === '/api/inventory/shrinkage') return ok({ ready: false });
  if (/^\/api\/inventory\/\d+$/.test(cesta)) {
    const z = s.zasoby.find(x => x.id === Number(cesta.split('/').pop()));
    if (!z) return chyba('Položka nenalezena', 404);
    if (metoda === 'DELETE') { s.zasoby = s.zasoby.filter(x => x.id !== z.id); return ok(); }
    if (metoda === 'PATCH') {
      const b = p.telo ?? {};
      const puvodni = z.quantity;
      if (b.consume !== undefined) {
        const cnt = Number(b.consume);
        if (!Number.isFinite(cnt) || cnt <= 0) return chyba('Neplatné množství.');
        z.quantity = Math.max(0, Math.round((z.quantity - cnt) * 100) / 100);
      } else if (b.quantity !== undefined && b.quantity !== null) {
        z.quantity = Math.max(0, Number(b.quantity));
      }
      for (const pole of ['name', 'unit', 'supplier'] as const) if (typeof b[pole] === 'string') (z as any)[pole] = b[pole];
      for (const pole of ['minQuantity', 'criticalQuantity', 'maxQuantity'] as const) if (b[pole] !== undefined) (z as any)[pole] = Number(b[pole]) || 0;
      if (b.unitCost !== undefined) z.unitCost = Number(b.unitCost) || 0;
      z.updatedAt = new Date().toISOString(); z.updatedBy = meId;
      if (z.quantity !== puvodni) {
        zapisPohyb(s, z, puvodni, z.quantity, b.note ?? null, meId);
        k.hlas('sklad-upraveno', { id: z.id, nazev: z.name, mnozstvi: z.quantity, stav: stavZasoby(z) });
      }
      return ok(tvar(s, z, vidiCeny));
    }
  }

  if (cesta === '/api/suppliers') {
    if (metoda === 'GET') {
      const jmena = [...new Set(s.zasoby.map(z => z.supplier).filter((x): x is string => !!x && x !== 'vlastní výroba'))].sort((a, b) => a.localeCompare(b, 'cs'));
      return ok({ suppliers: jmena.map((name, i) => ({ id: i + 1, name, email: null, phone: null, note: null, zOrganizace: false, sdileno: false, spravuje: null })) });
    }
    return ok({ ok: true });
  }
  if (cesta === '/api/orders') {
    if (metoda === 'GET') {
      return ok({
        orders: s.objednavky.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(o => ({
          id: o.id, supplier: o.supplier, items: o.items, totalCost: vidiCeny ? o.totalCost : null, status: o.status, note: o.note,
          createdAt: o.createdAt, receivedAt: o.receivedAt, createdByName: clen(o.createdBy).name,
        })),
      });
    }
    if (metoda === 'POST') {
      const b = p.telo ?? {};
      const polozky = Array.isArray(b.items) ? b.items : [];
      s.objednavky.push({ id: ++s.dalsiId, supplier: String(b.supplier ?? 'Dodavatel'), items: polozky, totalCost: null, status: 'ordered', note: b.note ?? null, createdAt: new Date().toISOString(), receivedAt: null, createdBy: meId });
      k.hlas('objednavka-odeslana', { supplier: b.supplier });
      return ok({ ok: true });
    }
    if (metoda === 'PATCH') {
      const o = s.objednavky.find(x => x.id === Number(p.telo?.id));
      if (o && p.telo?.status === 'received') {
        o.status = 'received'; o.receivedAt = new Date().toISOString();
        // Příjem objednávky naskladní: bez toho by zásoba zůstala „dochází" i po dodávce.
        for (const it of o.items) {
          const z = s.zasoby.find(x => x.id === it.itemId);
          if (z) { const stara = z.quantity; z.quantity += it.qty; zapisPohyb(s, z, stara, z.quantity, 'Příjem objednávky', meId); }
        }
        k.hlas('objednavka-prijata', { id: o.id });
      }
      return ok({ ok: true });
    }
  }
  if (cesta === '/api/stocktake') return ok({ open: null, history: [] });
  if (cesta === '/api/production') return ok({ toMake: [] });
  if (cesta === '/api/pos/usage') return metoda === 'GET' && q.get('q') ? ok({ products: [] }) : ok({ usage: {} });
  if (cesta === '/api/recipes') return ok({ recipes: [] });

  return undefined;
};
