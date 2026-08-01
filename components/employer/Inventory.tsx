'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../Icons';
import CategoryStockView from '../inventory/CategoryStockView';
import { normalizeCategoryPackaging, normalizeScale, CONTENT_UNITS, type ScaleStep } from '@/lib/packaging';
import { buildTree, categoryScope, categoryPath, childrenOf, possibleParents } from '@/lib/categoryTree';
import { useMoney, useSymbol } from '../CurrencyProvider';

interface Item {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  criticalQuantity: number;
  maxQuantity: number;
  unit: string;
  supplier?: string;
  supplierUrl?: string;
  unitCost?: number | null;
  updatedAt?: string;
  updatedByName?: string;
}

interface Category {
  id: number;
  name: string;
  position: number;
  parentId?: number | null;
  tracksOpen?: boolean;
  contentUnit?: string | null;
  defaultPackageSize?: number | null;
  scale?: any;
}

interface OrderItem {
  name: string;
  qty: number;
  unit: string;
  itemId?: number | null;
}

interface Order {
  id: number;
  supplier?: string | null;
  items: OrderItem[];
  totalCost?: number | null;
  status: 'ordered' | 'received' | 'cancelled';
  note?: string | null;
  createdAt: string;
  receivedAt?: string | null;
  createdByName?: string;
}

type SortKey = 'name' | 'qtyAsc' | 'qtyDesc' | 'status' | 'updated';
type View = 'list' | 'grid';

const DEFAULT_CATEGORIES = ['Čaje', 'Přísady', 'Nádobí', 'Doplňky'];
const inputClass = 'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';
const emptyForm = { name: '', category: '', quantity: '10', minQuantity: '5', criticalQuantity: '2', maxQuantity: '50', unit: 'ks', supplier: '', supplierUrl: '', unitCost: '' };

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Název A→Z' },
  { key: 'qtyAsc', label: 'Množství ↑' },
  { key: 'qtyDesc', label: 'Množství ↓' },
  { key: 'status', label: 'Stav' },
  { key: 'updated', label: 'Naposledy upraveno' },
];

function statusOf(i: Item): 'ok' | 'low' | 'critical' {
  if (i.quantity <= i.criticalQuantity) return 'critical';
  if (i.quantity <= i.minQuantity) return 'low';
  return 'ok';
}
const statusRank = { critical: 0, low: 1, ok: 2 } as const;

// Suggested order amount: refill up to maxQuantity; if max is not set,
// aim for twice the minimum. Always suggest at least 1.
function suggestedAmount(i: Item): number {
  const base = i.maxQuantity && i.maxQuantity > 0
    ? i.maxQuantity - i.quantity
    : i.minQuantity * 2 - i.quantity;
  return Math.max(1, Math.max(0, base));
}

function relTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (isNaN(d)) return '';
  const diff = Date.now() - d;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'právě teď';
  if (min < 60) return `před ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `před ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return `před ${days} d`;
  return new Date(iso).toLocaleDateString('cs-CZ');
}

export default function Inventory({ user, initialCategory }: { user?: any; initialCategory?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState(initialCategory ?? 'Vše');
  // A quick-access tile can re-target the stock while this view stays mounted.
  useEffect(() => { if (initialCategory) setCat(initialCategory); }, [initialCategory]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [view, setView] = useState<View>('grid');
  const [showForm, setShowForm] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const money = useMoney();
  const symbol = useSymbol();
  const [newCatInline, setNewCatInline] = useState('');
  // Which parent a category created from inside the item form goes under.
  const [inlineParent, setInlineParent] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [showShopping, setShowShopping] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = (msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 4000);
  };
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const loadOrders = async () => {
    try {
      const data = await fetch('/api/orders').then(r => r.json());
      if (Array.isArray(data?.orders)) setOrders(data.orders);
    } catch {}
  };

  const load = async () => {
    try {
      const [data, cats] = await Promise.all([
        fetch('/api/inventory').then(r => r.json()),
        fetch('/api/inventory/categories').then(r => r.json()),
      ]);
      if (Array.isArray(data)) setItems(data);
      if (Array.isArray(cats)) setCategories(cats);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); loadOrders(); }, []);

  // Category names available for the pick-list: custom categories, plus any
  // category strings already used by items (so nothing gets orphaned in the UI).
  const catNames = useMemo(() => {
    const set = new Set<string>();
    categories.forEach(c => set.add(c.name));
    items.forEach(i => { if (i.category) set.add(i.category); });
    return Array.from(set);
  }, [categories, items]);

  const tree = useMemo(() => buildTree(categories), [categories]);
  // Category strings used by items but no longer configured — kept at the top
  // level so nothing becomes unreachable.
  const orphanNames = useMemo(() => {
    const known = new Set(categories.map(c => c.name));
    const set = new Set<string>();
    items.forEach(i => { if (i.category && !known.has(i.category)) set.add(i.category); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'cs'));
  }, [categories, items]);

  // The top-level chip that should look selected: a subcategory highlights its
  // parent and opens the second row next to its siblings.
  const activeRoot = useMemo(() => {
    if (cat === 'Vše') return null;
    const c = categories.find(x => x.name === cat);
    if (!c) return cat;
    if (c.parentId == null) return cat;
    return categories.find(x => x.id === c.parentId)?.name ?? cat;
  }, [categories, cat]);

  const subCats = useMemo(
    () => (activeRoot ? childrenOf(categories, activeRoot) : []),
    [categories, activeRoot],
  );

  // A category that tracks open packages renders its own two-mode view.
  // Subcategories inherit the setting from their parent, so packaging is
  // configured once on "Tabáky" and every subcategory under it behaves the same.
  const packagedCat = useMemo(() => {
    const c = categories.find(x => x.name === cat);
    if (!c) return null;
    if (c.tracksOpen) return c;
    if (c.parentId != null) {
      const parent = categories.find(x => x.id === c.parentId);
      if (parent?.tracksOpen) return parent;
    }
    return null;
  }, [categories, cat]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Picking a parent category includes everything filed under its subcategories.
    const scope = cat === 'Vše' ? null : new Set(categoryScope(categories, cat));
    const list = items.filter(i =>
      (scope === null || scope.has(i.category)) &&
      (q === '' || i.name.toLowerCase().includes(q) || (i.supplier ?? '').toLowerCase().includes(q)));
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'qtyAsc': return a.quantity - b.quantity;
        case 'qtyDesc': return b.quantity - a.quantity;
        case 'status': {
          const d = statusRank[statusOf(a)] - statusRank[statusOf(b)];
          return d !== 0 ? d : a.name.localeCompare(b.name, 'cs');
        }
        case 'updated': {
          const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return tb - ta;
        }
        default: return a.name.localeCompare(b.name, 'cs');
      }
    });
    return sorted;
  }, [items, categories, cat, search, sort]);

  const critical = items.filter(i => statusOf(i) === 'critical');
  const low = items.filter(i => statusOf(i) === 'low');

  // Items to (re)order: critical first, then low, alphabetically within each group.
  const toBuy = useMemo(() =>
    items
      .filter(i => statusOf(i) !== 'ok')
      .sort((a, b) => {
        const d = statusRank[statusOf(a)] - statusRank[statusOf(b)];
        return d !== 0 ? d : a.name.localeCompare(b.name, 'cs');
      }),
  [items]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, category: catNames[0] ?? '' });
    setNewCatInline('');
    setShowForm(true);
  };
  const openEdit = (i: Item) => {
    setEditing(i);
    setForm({ name: i.name, category: i.category ?? '', quantity: String(i.quantity), minQuantity: String(i.minQuantity), criticalQuantity: String(i.criticalQuantity), maxQuantity: String(i.maxQuantity), unit: i.unit, supplier: i.supplier ?? '', supplierUrl: i.supplierUrl ?? '', unitCost: i.unitCost != null ? String(i.unitCost) : '' });
    setNewCatInline('');
    setShowForm(true);
  };

  const createCategory = async (name: string, parentId?: number | null): Promise<boolean> => {
    const clean = name.trim();
    if (!clean) return false;
    try {
      const res = await fetch('/api/inventory/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean, parentId: parentId ?? null }),
      });
      if (!res.ok) return false;
      const cats = await fetch('/api/inventory/categories').then(r => r.json());
      if (Array.isArray(cats)) setCategories(cats);
      return true;
    } catch { return false; }
  };

  // Inline "+ nová kategorie" inside the item form.
  const addInlineCategory = async () => {
    const clean = newCatInline.trim();
    if (!clean) return;
    setAddingCat(true);
    const ok = await createCategory(clean, inlineParent ? parseInt(inlineParent) : null);
    setAddingCat(false);
    if (ok) {
      setForm(f => ({ ...f, category: clean }));
      setNewCatInline('');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name, category: form.category, unit: form.unit, supplier: form.supplier, supplierUrl: form.supplierUrl,
      quantity: parseInt(form.quantity) || 0, minQuantity: parseInt(form.minQuantity) || 0,
      criticalQuantity: parseInt(form.criticalQuantity) || 0, maxQuantity: parseInt(form.maxQuantity) || 0,
      unitCost: form.unitCost === '' ? null : parseInt(form.unitCost) || 0,
    };
    try {
      if (editing) {
        await fetch(`/api/inventory/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      setShowForm(false);
      await load();
    } catch {}
    setSaving(false);
  };

  const step = async (i: Item, delta: number) => {
    const q = Math.max(0, i.quantity + delta);
    setItems(prev => prev.map(x => x.id === i.id ? { ...x, quantity: q } : x));
    try {
      await fetch(`/api/inventory/${i.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: q }) });
    } catch {}
  };

  const remove = async (i: Item) => {
    if (!confirm(`Smazat položku „${i.name}"?`)) return;
    setItems(prev => prev.filter(x => x.id !== i.id));
    try { await fetch(`/api/inventory/${i.id}`, { method: 'DELETE' }); } catch {}
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#16181A]">Sklad & zásoby</h1>
          <p className="text-black/45 text-sm">
            {items.length} {items.length === 1 ? 'položka' : items.length >= 2 && items.length <= 4 ? 'položky' : 'položek'}
            {(() => {
              const val = items.reduce((s, i) => s + (i.unitCost ? i.quantity * i.unitCost : 0), 0);
              return val > 0 ? <> · hodnota zásob <span className="font-semibold text-[#16181A]">{money(val)}</span></> : ' · přidávejte a hlídejte limity';
            })()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {toBuy.length > 0 && (
            <button onClick={() => setShowShopping(true)} className="rounded-full glass border border-black/10 text-[#16181A] px-4 py-2.5 text-sm font-medium hover:bg-black/[0.05] whitespace-nowrap">
              🛒 Nákupní seznam ({toBuy.length})
            </button>
          )}
          <button onClick={() => setShowCats(true)} className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] font-medium px-4 py-2.5 text-sm flex items-center gap-2 whitespace-nowrap">
            <Icon name="settings" size={16} /> Kategorie
          </button>
          <button onClick={openNew} className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 flex items-center gap-2 whitespace-nowrap">
            <Icon name="plus" size={16} /> Přidat položku
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/30 text-[#5B7A08] text-sm font-semibold px-4 py-3">
          {notice}
        </div>
      )}

      {(critical.length > 0 || low.length > 0) && (
        <div className="glass-card border-orange-500/20 bg-orange-500/[0.06] p-5">
          <p className="font-semibold text-sm flex flex-wrap items-center gap-2 text-orange-700">
            <Icon name="warning" size={16} />
            {critical.length > 0 && <span className="text-red-600">{critical.length} kriticky málo</span>}
            {critical.length > 0 && low.length > 0 && <span className="text-black/30">·</span>}
            {low.length > 0 && <span className="text-orange-600">{low.length} dochází</span>}
          </p>
          <p className="text-black/55 text-sm mt-1 truncate">{[...critical, ...low].map(i => i.name).join(', ')}</p>
        </div>
      )}

      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-white/60 dark:bg-transparent backdrop-blur-md space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1 min-w-0">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/30 pointer-events-none"><Icon name="search" size={16} /></span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat položku nebo dodavatele..." className={`${inputClass} pl-10`} />
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0 min-w-0">
            <SortMenu sort={sort} setSort={setSort} />
            <div className="glass rounded-full p-1 flex items-center gap-1 shrink-0">
              <button onClick={() => setView('list')} title="Seznam" className={`w-9 h-9 flex items-center justify-center rounded-full text-sm transition-all ${view === 'list' ? 'bg-[#16181A] text-white' : 'text-black/50 hover:text-black'}`}>
                <Icon name="box" size={16} />
              </button>
              <button onClick={() => setView('grid')} title="Karty" className={`w-9 h-9 flex items-center justify-center rounded-full text-sm transition-all ${view === 'grid' ? 'bg-[#16181A] text-white' : 'text-black/50 hover:text-black'}`}>
                <Icon name="trend" size={16} />
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-thin -mx-1 px-1">
          <button onClick={() => setCat('Vše')} className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 ${cat === 'Vše' ? 'bg-[#C8F542] text-black' : 'glass text-black/55 hover:text-black'}`}>Vše</button>
          {tree.map(({ cat: root, children }) => (
            <button key={root.id} onClick={() => setCat(root.name)}
              className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 flex items-center gap-1.5 ${activeRoot === root.name ? 'bg-[#C8F542] text-black' : 'glass text-black/55 hover:text-black'}`}>
              {root.name}
              {children.length > 0 && (
                <span className={`text-[10px] tabular-nums ${activeRoot === root.name ? 'text-black/45' : 'text-black/30'}`}>{children.length}</span>
              )}
            </button>
          ))}
          {orphanNames.map(c => (
            <button key={c} onClick={() => setCat(c)} className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 ${cat === c ? 'bg-[#C8F542] text-black' : 'glass text-black/55 hover:text-black'}`}>{c}</button>
          ))}
        </div>

        {/* Second row: the selected category's subcategories. */}
        {subCats.length > 0 && activeRoot && (
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin -mx-1 px-1">
            <Icon name="chevron" size={13} className="text-black/20 shrink-0 -rotate-90" />
            <button onClick={() => setCat(activeRoot)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 ${cat === activeRoot ? 'bg-[#16181A] text-white' : 'glass text-black/50 hover:text-black'}`}>
              Vše v {activeRoot}
            </button>
            {subCats.map(s => (
              <button key={s.id} onClick={() => setCat(s.name)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 ${cat === s.name ? 'bg-[#16181A] text-white' : 'glass text-black/50 hover:text-black'}`}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {orders.length > 0 && (
        <OrdersPanel orders={orders} refreshOrders={loadOrders} refreshItems={load} notify={showNotice} />
      )}

      <div className="flex items-center justify-between text-xs text-black/45">
        <span>
          {filtered.length} {filtered.length === 1 ? 'položka' : filtered.length >= 2 && filtered.length <= 4 ? 'položky' : 'položek'}
          {cat !== 'Vše' ? ` v „${categoryPath(categories, cat)}"` : ''}
          {cat !== 'Vše' && cat === activeRoot && subCats.length > 0 ? ' včetně podkategorií' : ''}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-black/45">{items.length === 0 ? 'Žádné položky. Přidejte první.' : 'Žádné položky neodpovídají filtru.'}</div>
      ) : packagedCat ? (
        <CategoryStockView
          category={cat}
          packaging={normalizeCategoryPackaging(packagedCat)}
          items={filtered as any}
          canEdit
          onChanged={updated => setItems(list => list.map(x => x.id === updated.id ? { ...x, ...updated } : x))}
          onEditItem={i => openEdit(items.find(x => x.id === i.id) ?? (i as any))}
          onRemoveItem={i => remove(items.find(x => x.id === i.id) ?? (i as any))}
          onStep={(i, d) => step(items.find(x => x.id === i.id) ?? (i as any), d)}
        />
      ) : view === 'list' ? (
        <ListView items={filtered} step={step} openEdit={openEdit} remove={remove} />
      ) : (
        <GridView items={filtered} step={step} openEdit={openEdit} remove={remove} money={money} />
      )}

      {/* Item form modal */}
      {showForm && (
        <div className="fixed inset-0 modal-overlay z-50 flex items-end md:items-center justify-center md:p-4" onClick={() => setShowForm(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={save} className="modal-sheet rounded-3xl rounded-b-none md:rounded-3xl w-full max-w-lg max-h-[88vh] overflow-y-auto scrollbar-thin">
            {/* Sticky header */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 bg-white/70 backdrop-blur-xl border-b border-black/[0.06]">
              <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0 w-10 h-10 rounded-2xl bg-[#C8F542] text-black flex items-center justify-center">
                  <Icon name={editing ? 'box' : 'plus'} size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold tracking-tight text-[#16181A] leading-tight truncate">{editing ? 'Upravit položku' : 'Nová položka'}</h3>
                  <p className="text-xs text-black/45 truncate">{editing ? editing.name : 'Přidejte novou zásobu do skladu'}</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="shrink-0 rounded-full glass w-9 h-9 flex items-center justify-center text-black/50 hover:text-black">✕</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Section: základ */}
              <div className="rounded-2xl bg-black/[0.02] border border-black/[0.06] p-4 space-y-4">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-black/45 font-semibold">
                  <Icon name="leaf" size={14} className="text-[#5B7A08]" /> Základní informace
                </p>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Název</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Např. Sencha Gyokuro" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Kategorie</label>
                  {(tree.length > 0 || orphanNames.length > 0) && (
                    <div className="space-y-2 mb-2.5">
                      {tree.map(({ cat: root, children }) => (
                        <div key={root.id}>
                          <CatChip name={root.name} active={form.category === root.name}
                            onPick={() => setForm(f => ({ ...f, category: root.name }))} />
                          {children.length > 0 && (
                            <div className="mt-1.5 ml-3 pl-2.5 border-l border-black/[0.08] flex flex-wrap gap-1.5">
                              {children.map(s => (
                                <CatChip key={s.id} name={s.name} active={form.category === s.name} small
                                  onPick={() => setForm(f => ({ ...f, category: s.name }))} />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {orphanNames.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {orphanNames.map(c => (
                            <CatChip key={c} name={c} active={form.category === c}
                              onPick={() => setForm(f => ({ ...f, category: c }))} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <div className="relative flex-1 min-w-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30 pointer-events-none"><Icon name="plus" size={14} /></span>
                      <input value={newCatInline} onChange={e => setNewCatInline(e.target.value)} placeholder="Nová kategorie"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInlineCategory(); } }}
                        className={`${inputClass} py-2 pl-8`} />
                    </div>
                    <select value={inlineParent} onChange={e => setInlineParent(e.target.value)}
                      title="Kam novou kategorii zařadit"
                      className="shrink-0 max-w-[9rem] rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3 text-sm text-[#16181A] focus:outline-none focus:border-[#C8F542]/50">
                      <option value="">Hlavní</option>
                      {tree.map(({ cat: root }) => (
                        <option key={root.id} value={String(root.id)}>pod {root.name}</option>
                      ))}
                    </select>
                    <button type="button" onClick={addInlineCategory} disabled={addingCat || !newCatInline.trim()} className="shrink-0 rounded-2xl glass border border-black/10 text-[#16181A] px-4 text-sm font-medium hover:bg-black/[0.05] disabled:opacity-40">
                      {addingCat ? '…' : 'Přidat'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Section: množství */}
              <div className="rounded-2xl bg-black/[0.02] border border-black/[0.06] p-4 space-y-4">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-black/45 font-semibold">
                  <Icon name="box" size={14} className="text-black/40" /> Množství
                </p>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Aktuální množství</label>
                    <div className="flex items-center rounded-2xl bg-black/[0.04] border border-black/[0.08] p-1 focus-within:border-[#C8F542]/50 focus-within:ring-2 focus-within:ring-[#C8F542]/20 transition-all">
                      <button type="button" aria-label="Ubrat" onClick={() => setForm(f => ({ ...f, quantity: String(Math.max(0, (parseInt(f.quantity) || 0) - 1)) }))}
                        className="rounded-xl bg-black/[0.04] hover:bg-black/[0.08] w-9 h-9 flex items-center justify-center text-lg leading-none text-[#16181A] shrink-0">−</button>
                      <input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                        className="flex-1 min-w-0 bg-transparent text-center text-sm font-semibold text-[#16181A] focus:outline-none tabular-nums" />
                      <button type="button" aria-label="Přidat" onClick={() => setForm(f => ({ ...f, quantity: String(Math.max(0, (parseInt(f.quantity) || 0) + 1)) }))}
                        className="rounded-xl bg-[#C8F542] hover:brightness-110 w-9 h-9 flex items-center justify-center text-lg leading-none text-black shrink-0">+</button>
                    </div>
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Jednotka</label>
                    <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="ks" className={inputClass} />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Max. množství</label>
                    <input type="number" value={form.maxQuantity} onChange={e => setForm(f => ({ ...f, maxQuantity: e.target.value }))} className={inputClass} />
                  </div>
                </div>
              </div>

              {/* Section: upozornění */}
              <div className="rounded-2xl bg-black/[0.02] border border-black/[0.06] p-4 space-y-4">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-black/45 font-semibold">
                  <Icon name="warning" size={14} className="text-orange-500" /> Hlídání zásob
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-orange-600/70 mb-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-400" /> Upozornit při
                    </label>
                    <input type="number" value={form.minQuantity} onChange={e => setForm(f => ({ ...f, minQuantity: e.target.value }))} className={inputClass} />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-red-600/70 mb-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> Kriticky málo při
                    </label>
                    <input type="number" value={form.criticalQuantity} onChange={e => setForm(f => ({ ...f, criticalQuantity: e.target.value }))} className={inputClass} />
                  </div>
                </div>
              </div>

              {/* Section: dodavatel */}
              <div className="rounded-2xl bg-black/[0.02] border border-black/[0.06] p-4 space-y-4">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-black/45 font-semibold">
                  <Icon name="send" size={14} className="text-black/40" /> Dodavatel <span className="normal-case tracking-normal text-black/30 font-normal">· volitelné</span>
                </p>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Cena za jednotku</label>
                  <div className="relative">
                    <input type="number" inputMode="numeric" value={form.unitCost} onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} placeholder="0" className={`${inputClass} pr-12`} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">{symbol}/{form.unit || 'ks'}</span>
                  </div>
                  <p className="text-[11px] text-black/40 mt-1.5">Slouží k výpočtu hodnoty zásob.</p>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Název dodavatele</label>
                  <input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Např. Čajovna s.r.o." className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Odkaz na objednání</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/30 pointer-events-none"><Icon name="send" size={15} /></span>
                    <input type="url" inputMode="url" value={form.supplierUrl} onChange={e => setForm(f => ({ ...f, supplierUrl: e.target.value }))} placeholder="https://..." className={`${inputClass} pl-10`} />
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky footer */}
            <div className="sticky bottom-0 z-10 flex gap-3 px-6 py-4 bg-white/70 backdrop-blur-xl border-t border-black/[0.06]">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-full glass border border-black/10 text-[#16181A] py-3 text-sm font-medium hover:bg-black/[0.06] whitespace-nowrap">Zrušit</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-full bg-[#C8F542] text-black py-3 text-sm font-semibold hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap">
                <Icon name="check" size={16} />{saving ? 'Ukládám…' : 'Uložit položku'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showCats && (
        <CategoryManager
          categories={categories}
          onClose={() => setShowCats(false)}
          onChanged={load}
          createCategory={createCategory}
        />
      )}

      {showShopping && (
        <ShoppingListModal
          items={toBuy}
          onClose={() => setShowShopping(false)}
          onOrdered={async (count) => {
            setShowShopping(false);
            if (count > 0) {
              showNotice(count === 1 ? 'Objednávka vytvořena ✓' : count <= 4 ? `Vytvořeny ${count} objednávky ✓` : `Vytvořeno ${count} objednávek ✓`);
              await loadOrders();
            } else {
              showNotice('Objednávku se nepodařilo vytvořit');
            }
          }}
        />
      )}
    </div>
  );
}

/* ---------- One category chip in the item form ---------- */
function CatChip({ name, active, small, onPick }: {
  name: string; active: boolean; small?: boolean; onPick: () => void;
}) {
  return (
    <button type="button" onClick={onPick}
      className={`rounded-full font-medium transition-all inline-flex items-center gap-1.5 ${
        small ? 'px-3 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs'
      } ${active ? 'bg-[#C8F542] text-black' : 'glass text-black/55 hover:text-black'}`}>
      {active && <Icon name="check" size={small ? 11 : 13} />}{name}
    </button>
  );
}

/* ---------- Sort dropdown (custom popover) ---------- */
function SortMenu({ sort, setSort }: { sort: SortKey; setSort: (k: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const current = SORTS.find(s => s.key === sort) ?? SORTS[0];
  return (
    <div ref={ref} className="relative min-w-0">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-4 py-2.5 text-sm flex items-center gap-2 font-medium min-w-0 max-w-full">
        <Icon name="swap" size={15} className="text-black/40 shrink-0" />
        <span className="truncate min-w-0">{current.label}</span>
        <Icon name="chevron" size={14} className={`text-black/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-3rem)] z-30 rounded-2xl bg-white/95 backdrop-blur-xl border border-black/[0.08] shadow-xl shadow-black/10 p-1.5">
          {SORTS.map(s => {
            const active = s.key === sort;
            return (
              <button key={s.key} role="option" aria-selected={active} type="button"
                onClick={() => { setSort(s.key); setOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center justify-between gap-2 transition-colors ${active ? 'bg-[#C8F542]/20 text-[#5B7A08] font-semibold' : 'text-[#16181A] hover:bg-black/[0.04]'}`}>
                <span>{s.label}</span>
                {active && <Icon name="check" size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- List view (dense rows) ---------- */
function ListView({ items, step, openEdit, remove }: {
  items: Item[]; step: (i: Item, d: number) => void; openEdit: (i: Item) => void; remove: (i: Item) => void;
}) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="hidden md:grid grid-cols-[auto_1fr_140px_200px_auto] gap-3 px-4 py-2.5 border-b border-black/[0.06] text-[11px] uppercase tracking-wider text-black/40 font-semibold">
        <span className="w-2" />
        <span>Položka</span>
        <span>Kategorie</span>
        <span>Množství</span>
        <span className="text-right">Akce</span>
      </div>
      <div className="divide-y divide-black/[0.06]">
        {items.map(i => {
          const st = statusOf(i);
          const pct = Math.min(100, Math.round((i.quantity / Math.max(1, i.maxQuantity)) * 100));
          const dot = st === 'critical' ? 'bg-red-500' : st === 'low' ? 'bg-orange-500' : 'bg-[#C8F542]';
          const bar = st === 'critical' ? 'bg-red-400' : st === 'low' ? 'bg-orange-400' : 'bg-[#C8F542]';
          return (
            <div key={i.id} className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_140px_200px_auto] gap-2 md:gap-3 items-center px-4 py-3 hover:bg-black/[0.02] transition-colors">
              <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} title={st} />
              <div className="min-w-0">
                <p className="font-medium text-sm text-[#16181A] truncate">{i.name}</p>
                <p className="text-[11px] text-black/40 truncate md:hidden">{i.category}{i.supplier ? ` · ${i.supplier}` : ''}</p>
                {(i.updatedByName || i.updatedAt) && (
                  <p className="text-[11px] text-black/30 truncate hidden md:block">{relTime(i.updatedAt)}{i.updatedByName ? ` · ${i.updatedByName}` : ''}</p>
                )}
              </div>
              <span className="hidden md:block text-xs text-black/50 truncate">{i.category || '—'}</span>
              <div className="hidden md:flex items-center gap-2">
                <div className="h-1.5 w-14 bg-black/[0.06] rounded-full overflow-hidden shrink-0">
                  <div className={`h-full ${bar} rounded-full`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-black/60 tabular-nums whitespace-nowrap">{i.quantity} {i.unit}</span>
              </div>
              <div className="flex items-center gap-1 justify-end">
                <button onClick={() => step(i, -1)} className="rounded-full glass w-8 h-8 flex items-center justify-center text-black/70 hover:text-black text-base leading-none">−</button>
                <span className="md:hidden text-sm font-semibold text-[#16181A] w-12 text-center tabular-nums">{i.quantity}<span className="text-[10px] text-black/40 ml-0.5">{i.unit}</span></span>
                <button onClick={() => step(i, 1)} className="rounded-full glass w-8 h-8 flex items-center justify-center text-black/70 hover:text-black text-base leading-none">+</button>
                {i.supplierUrl && (
                  <a href={i.supplierUrl} target="_blank" rel="noopener" title="Objednat u dodavatele" className="rounded-full bg-[#C8F542]/20 text-[#5B7A08] hover:bg-[#C8F542]/30 px-3 h-8 hidden sm:flex items-center gap-1 text-xs font-semibold whitespace-nowrap">Objednat ↗</a>
                )}
                <button onClick={() => openEdit(i)} title="Upravit" className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/60 hover:text-black text-sm">✎</button>
                <button onClick={() => remove(i)} title="Smazat" className="rounded-full glass w-9 h-9 flex items-center justify-center text-red-600/70 hover:text-red-600 text-sm">✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Grid view (glass cards) ---------- */
function GridView({ items, step, openEdit, remove, money }: {
  items: Item[]; step: (i: Item, d: number) => void; openEdit: (i: Item) => void; remove: (i: Item) => void;
  money: (n: number) => string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map(i => {
        const st = statusOf(i);
        const pct = Math.min(100, Math.round((i.quantity / Math.max(1, i.maxQuantity)) * 100));
        const barColor = st === 'critical' ? 'bg-red-400' : st === 'low' ? 'bg-orange-400' : 'bg-[#C8F542]';
        const chip = st === 'critical' ? 'bg-red-500/15 text-red-600' : st === 'low' ? 'bg-orange-500/15 text-orange-600' : 'bg-[#C8F542]/15 text-[#5B7A08]';
        return (
          <div key={i.id} className="glass-card p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-[#16181A] truncate">{i.name}</p>
                <p className="text-xs text-black/45 truncate">{i.category}{i.supplier ? ` · ${i.supplier}` : ''}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium shrink-0 ${chip}`}>{st === 'critical' ? 'Kriticky' : st === 'low' ? 'Dochází' : 'OK'}</span>
            </div>
            <div className="mt-3 h-1.5 bg-black/[0.06] rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => step(i, -1)} className="rounded-full glass w-8 h-8 flex items-center justify-center text-black/70 hover:text-black">−</button>
                <span className="text-lg font-bold text-[#16181A] w-16 text-center tabular-nums">{i.quantity} <span className="text-xs text-black/45">{i.unit}</span></span>
                <button onClick={() => step(i, 1)} className="rounded-full glass w-8 h-8 flex items-center justify-center text-black/70 hover:text-black">+</button>
              </div>
              <div className="flex items-center gap-1">
                {i.supplierUrl && (
                  <a href={i.supplierUrl} target="_blank" rel="noopener" title="Objednat u dodavatele" className="rounded-full bg-[#C8F542]/20 text-[#5B7A08] hover:bg-[#C8F542]/30 px-3 h-9 flex items-center text-xs font-semibold whitespace-nowrap">Objednat ↗</a>
                )}
                <button onClick={() => openEdit(i)} className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/60 hover:text-black text-sm">✎</button>
                <button onClick={() => remove(i)} className="rounded-full glass w-9 h-9 flex items-center justify-center text-red-600/70 hover:text-red-600 text-sm">✕</button>
              </div>
            </div>
            <p className="text-[11px] text-black/25 mt-2">Limit: {i.minQuantity} · kriticky: {i.criticalQuantity} {i.unit}{i.unitCost ? ` · ${money(i.unitCost)}/${i.unit} · hodnota ${money(i.quantity * i.unitCost)}` : ''}{i.updatedByName ? ` · ${relTime(i.updatedAt)} ${i.updatedByName}` : ''}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Orders panel ---------- */
function OrdersPanel({ orders, refreshOrders, refreshItems, notify }: {
  orders: Order[];
  refreshOrders: () => Promise<void> | void;
  refreshItems: () => Promise<void> | void;
  notify: (msg: string) => void;
}) {
  const open = orders.filter(o => o.status === 'ordered');
  const history = orders.filter(o => o.status !== 'ordered');

  // Default: expanded when any open order exists, collapsed otherwise.
  // null = user has not toggled yet.
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const expanded = expandedOverride ?? open.length > 0;
  const [showHistory, setShowHistory] = useState(false);
  const [receivingId, setReceivingId] = useState<number | null>(null);
  const [costInput, setCostInput] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const money = useMoney();
  const symbol = useSymbol();

  const now = new Date();
  const monthlySpend = orders
    .filter(o => o.status === 'received' && typeof o.totalCost === 'number' && o.totalCost > 0 && o.receivedAt)
    .filter(o => {
      const d = new Date(o.receivedAt as string);
      return !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((sum, o) => sum + (o.totalCost as number), 0);

  const summary = (o: Order) => o.items.map(it => `${it.name} ×${it.qty}`).join(', ');
  const fmtDate = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('cs-CZ');
  };
  const fmtKc = (n: number) => money(n);

  const markReceived = async (o: Order) => {
    setBusyId(o.id);
    try {
      const cost = parseFloat(costInput.replace(',', '.'));
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: o.id, action: 'received', ...(isNaN(cost) ? {} : { totalCost: cost }) }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const n = typeof data?.restocked === 'number' ? data.restocked : o.items.length;
        notify(`Naskladněno ${n} ${n === 1 ? 'položka' : n >= 2 && n <= 4 ? 'položky' : 'položek'} ✓`);
        setReceivingId(null);
        setCostInput('');
        await Promise.all([refreshOrders(), refreshItems()]);
      }
    } catch {}
    setBusyId(null);
  };

  const cancelOrder = async (o: Order) => {
    if (!confirm(`Zrušit objednávku${o.supplier ? ` u „${o.supplier}"` : ''}?`)) return;
    setBusyId(o.id);
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: o.id, action: 'cancelled' }),
      });
      if (res.ok) await refreshOrders();
    } catch {}
    setBusyId(null);
  };

  const deleteOrder = async (o: Order) => {
    if (!confirm('Smazat objednávku z historie?')) return;
    setBusyId(o.id);
    try {
      const res = await fetch(`/api/orders?id=${o.id}`, { method: 'DELETE' });
      if (res.ok) await refreshOrders();
    } catch {}
    setBusyId(null);
  };

  return (
    <div className="glass-card p-5">
      {/* Header */}
      <button type="button" onClick={() => setExpandedOverride(!expanded)} className="w-full flex items-center gap-2 text-left min-w-0">
        <span className="font-bold tracking-tight text-[#16181A] flex items-center gap-2 min-w-0">
          <span aria-hidden>📦</span> <span className="truncate">Objednávky</span>
        </span>
        {open.length > 0 && (
          <span className="shrink-0 rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-2.5 py-0.5 text-xs font-semibold tabular-nums">{open.length}</span>
        )}
        <span className="flex-1" />
        <Icon name="chevron" size={16} className={`shrink-0 text-black/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Open orders */}
          {open.length === 0 ? (
            <p className="text-sm text-black/45">Žádné otevřené objednávky.</p>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {open.map(o => (
                <div key={o.id} className="py-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#16181A] truncate">
                        {o.supplier || 'Bez dodavatele'}
                        <span className="font-normal text-black/40"> · {fmtDate(o.createdAt)}</span>
                      </p>
                      <p className="text-xs text-black/50 min-w-0 truncate">{summary(o)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => { setReceivingId(receivingId === o.id ? null : o.id); setCostInput(''); }}
                        disabled={busyId === o.id}
                        className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2 text-xs hover:brightness-110 disabled:opacity-50 whitespace-nowrap shrink-0">
                        Přišlo ✓
                      </button>
                      <button
                        onClick={() => cancelOrder(o)}
                        disabled={busyId === o.id}
                        className="rounded-full glass border border-black/10 text-black/50 hover:text-red-600 px-4 py-2 text-xs font-medium disabled:opacity-50 whitespace-nowrap shrink-0">
                        Zrušit
                      </button>
                    </div>
                  </div>
                  {receivingId === o.id && (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-black/[0.03] border border-black/[0.06] p-3">
                      <label className="text-xs text-black/50 whitespace-nowrap">Celková cena ({symbol}, nepovinné)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        autoFocus
                        value={costInput}
                        onChange={e => setCostInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); markReceived(o); } }}
                        placeholder="např. 1250"
                        className="flex-1 min-w-[6rem] rounded-xl bg-white/70 border border-black/[0.08] px-3 py-2 text-sm text-[#16181A] tabular-nums focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none" />
                      <button
                        onClick={() => markReceived(o)}
                        disabled={busyId === o.id}
                        className="rounded-full bg-[#16181A] text-white px-4 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0">
                        {busyId === o.id ? 'Naskladňuji…' : 'Potvrdit příjem'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowHistory(h => !h)} className="flex items-center gap-1.5 text-xs font-semibold text-black/45 hover:text-black">
                <Icon name="chevron" size={13} className={`transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                Historie ({history.length})
              </button>
              {showHistory && (
                <div className="mt-2 divide-y divide-black/[0.06]">
                  {history.map(o => (
                    <div key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                      <span className="text-xs text-black/45 tabular-nums whitespace-nowrap shrink-0">{fmtDate(o.receivedAt ?? o.createdAt)}</span>
                      <span className="text-sm text-[#16181A] min-w-0 flex-1 truncate">{o.supplier || 'Bez dodavatele'}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0 whitespace-nowrap ${o.status === 'received' ? 'bg-[#C8F542]/20 text-[#5B7A08]' : 'bg-red-500/10 text-red-600'}`}>
                        {o.status === 'received' ? 'Přijato' : 'Zrušeno'}
                      </span>
                      {typeof o.totalCost === 'number' && o.totalCost > 0 && (
                        <span className="text-xs font-semibold text-[#16181A] tabular-nums whitespace-nowrap shrink-0">{fmtKc(o.totalCost)}</span>
                      )}
                      <button
                        onClick={() => deleteOrder(o)}
                        disabled={busyId === o.id}
                        title="Smazat"
                        className="rounded-full glass w-7 h-7 flex items-center justify-center text-red-600/60 hover:text-red-600 text-xs disabled:opacity-50 shrink-0">
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Monthly spend */}
          {monthlySpend > 0 && (
            <p className="text-xs text-black/50 border-t border-black/[0.06] pt-3">
              Tento měsíc utraceno za zboží: <span className="font-semibold text-[#16181A] tabular-nums">{fmtKc(monthlySpend)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Shopping list modal ---------- */
function ShoppingListModal({ items, onClose, onOrdered }: {
  items: Item[];
  onClose: () => void;
  onOrdered: (createdCount: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const hasSuppliers = items.some(i => (i.supplier ?? '').trim() !== '');

  // Group by supplier (keeps the critical-first ordering inside each group).
  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    items.forEach(i => {
      const key = (i.supplier ?? '').trim() || 'Bez dodavatele';
      const arr = map.get(key);
      if (arr) arr.push(i); else map.set(key, [i]);
    });
    return Array.from(map.entries());
  }, [items]);

  const buildText = () => {
    const date = new Date().toLocaleDateString('cs-CZ');
    const lines: string[] = [`Nákupní seznam – Pangea (${date})`];
    groups.forEach(([supplier, list]) => {
      lines.push('');
      lines.push(`${supplier}:`);
      list.forEach(i => {
        lines.push(`• ${i.name} — objednat ${suggestedAmount(i)} ${i.unit} (zbývá ${i.quantity})`);
      });
    });
    return lines.join('\n');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildText());
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const share = async () => {
    try { await navigator.share({ title: 'Nákupní seznam', text: buildText() }); } catch {}
  };

  // One order per supplier group.
  const createOrders = async () => {
    if (ordering) return;
    setOrdering(true);
    let created = 0;
    for (const [supplier, list] of groups) {
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supplier: supplier === 'Bez dodavatele' ? null : supplier,
            items: list.map(i => ({ name: i.name, qty: suggestedAmount(i), unit: i.unit, itemId: i.id })),
          }),
        });
        if (res.ok) created++;
      } catch {}
    }
    setOrdering(false);
    onOrdered(created);
  };

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 space-y-4 max-h-[85vh] overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold tracking-tight text-[#16181A]">Nákupní seznam</h3>
          <button onClick={onClose} className="shrink-0 rounded-full glass w-9 h-9 flex items-center justify-center text-black/50 hover:text-black">✕</button>
        </div>

        <div className="space-y-4">
          {groups.map(([supplier, list]) => (
            <div key={supplier} className="space-y-1">
              {hasSuppliers && (
                <p className="text-xs uppercase tracking-wider text-black/45 font-semibold">{supplier}</p>
              )}
              <div className="divide-y divide-black/[0.06]">
                {list.map(i => {
                  const st = statusOf(i);
                  return (
                    <div key={i.id} className="flex items-center gap-2.5 py-2.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${st === 'critical' ? 'bg-red-500' : 'bg-orange-500'}`} title={st === 'critical' ? 'Kriticky málo' : 'Dochází'} />
                      <span className="flex-1 min-w-0 truncate text-sm font-medium text-[#16181A]">{i.name}</span>
                      <span className="shrink-0 text-xs text-black/45 tabular-nums whitespace-nowrap">{i.quantity} {i.unit}</span>
                      <span className="shrink-0 text-sm font-bold text-[#16181A] tabular-nums whitespace-nowrap">objednat +{suggestedAmount(i)} {i.unit}</span>
                      {i.supplierUrl && (
                        <a href={i.supplierUrl} target="_blank" rel="noopener" title="Objednat u dodavatele" className="shrink-0 rounded-full glass w-7 h-7 flex items-center justify-center text-xs text-[#5B7A08] hover:bg-black/[0.05]">↗</a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          <button onClick={createOrders} disabled={ordering} className="flex-1 basis-full sm:basis-auto rounded-full bg-[#C8F542] text-black py-3 px-4 text-sm font-semibold hover:brightness-110 disabled:opacity-50 whitespace-nowrap">
            {ordering ? 'Vytvářím…' : 'Vytvořit objednávku'}
          </button>
          <button onClick={copy} className="flex-1 rounded-full bg-[#16181A] text-white py-3 px-4 text-sm font-semibold hover:opacity-90 whitespace-nowrap">
            {copied ? 'Zkopírováno ✓' : 'Zkopírovat seznam'}
          </button>
          {canShare && (
            <button onClick={share} className="flex-1 rounded-full glass border border-black/10 text-[#16181A] py-3 px-4 text-sm font-medium hover:bg-black/[0.06] whitespace-nowrap">
              Sdílet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Category management modal ---------- */
function CategoryManager({ categories, onClose, onChanged, createCategory }: {
  categories: Category[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  createCategory: (name: string, parentId?: number | null) => Promise<boolean>;
}) {
  const [newName, setNewName] = useState('');
  const [newParent, setNewParent] = useState('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [packId, setPackId] = useState<number | null>(null);
  const [moveId, setMoveId] = useState<number | null>(null);
  const [err, setErr] = useState('');

  const tree = useMemo(() => buildTree(categories), [categories]);
  const roots = tree.map(t => t.cat);

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const ok = await createCategory(newName, newParent ? parseInt(newParent) : null);
    setBusy(false);
    if (ok) { setNewName(''); await onChanged(); }
    else setErr('Kategorii se nepodařilo vytvořit.');
  };

  // Re-file a category: null lifts it back to the top level.
  const setParent = async (c: Category, parentId: number | null) => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/inventory/categories/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || 'Přesun se nepodařil.');
      } else {
        setMoveId(null);
        await onChanged();
      }
    } catch { setErr('Nepodařilo se spojit se serverem.'); }
    setBusy(false);
  };

  const seedDefaults = async () => {
    setBusy(true);
    const existing = new Set(categories.map(c => c.name.toLowerCase()));
    for (const name of DEFAULT_CATEGORIES) {
      if (!existing.has(name.toLowerCase())) await createCategory(name);
    }
    setBusy(false);
    await onChanged();
  };

  const saveRename = async (id: number) => {
    const name = editName.trim();
    if (!name) { setEditId(null); return; }
    setBusy(true);
    try {
      await fetch(`/api/inventory/categories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    } catch {}
    setBusy(false);
    setEditId(null);
    await onChanged();
  };

  // Reordering happens inside a sibling group, so subcategories move within
  // their parent instead of jumping across the whole list.
  const move = async (siblings: Category[], idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= siblings.length) return;
    const a = siblings[idx], b = siblings[target];
    setBusy(true);
    try {
      await Promise.all([
        fetch(`/api/inventory/categories/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: b.position }) }),
        fetch(`/api/inventory/categories/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: a.position }) }),
      ]);
    } catch {}
    setBusy(false);
    await onChanged();
  };

  const del = async (c: Category) => {
    const kids = categories.filter(x => x.parentId === c.id).length;
    const extra = kids > 0 ? ` ${kids} ${kids === 1 ? 'podkategorie se přesune' : 'podkategorií se přesune'} na hlavní úroveň.` : '';
    if (!confirm(`Smazat kategorii „${c.name}"? Položky si svůj štítek ponechají.${extra}`)) return;
    setBusy(true);
    try { await fetch(`/api/inventory/categories/${c.id}`, { method: 'DELETE' }); } catch {}
    setBusy(false);
    await onChanged();
  };

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-sheet rounded-3xl rounded-b-none md:rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[85vh] overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold tracking-tight text-[#16181A]">Kategorie</h3>
          <button onClick={onClose} className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/50 hover:text-black">✕</button>
        </div>

        <div className="flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Název nové kategorie"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            className={inputClass} />
          {roots.length > 0 && (
            <select value={newParent} onChange={e => setNewParent(e.target.value)}
              title="Kam ji zařadit"
              className="shrink-0 max-w-[9rem] rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3 text-sm text-[#16181A] focus:outline-none focus:border-[#C8F542]/50">
              <option value="">Hlavní</option>
              {roots.map(r => <option key={r.id} value={String(r.id)}>pod {r.name}</option>)}
            </select>
          )}
          <button onClick={add} disabled={busy || !newName.trim()} className="shrink-0 rounded-full bg-[#C8F542] text-black font-semibold px-5 text-sm hover:brightness-110 disabled:opacity-40">Přidat</button>
        </div>

        {err && <p className="text-xs font-medium text-red-600">{err}</p>}

        {categories.length === 0 ? (
          <div className="text-center space-y-3 py-4">
            <p className="text-sm text-black/45">Zatím žádné kategorie.</p>
            <button onClick={seedDefaults} disabled={busy} className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-4 py-2 text-sm font-medium disabled:opacity-40">
              Přidat výchozí: {DEFAULT_CATEGORIES.join(', ')}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {tree.map(({ cat: root, children }, rootIdx) => (
              <div key={root.id} className="py-2.5 space-y-2">
                <CategoryRow
                  c={root} siblings={roots} idx={rootIdx} busy={busy}
                  editing={editId === root.id} editName={editName} setEditName={setEditName}
                  startEdit={() => { setEditId(root.id); setEditName(root.name); }}
                  cancelEdit={() => setEditId(null)} saveRename={() => saveRename(root.id)}
                  move={move} onDelete={() => del(root)}
                  packOpen={packId === root.id} togglePack={() => setPackId(packId === root.id ? null : root.id)}
                  moveOpen={moveId === root.id} toggleMove={() => { setMoveId(moveId === root.id ? null : root.id); setErr(''); }}
                  parentOptions={possibleParents(categories, root.id)} setParent={p => setParent(root, p)}
                  childCount={children.length}
                />
                {packId === root.id && <PackagingEditor category={root} onSaved={onChanged} />}

                {children.length > 0 && (
                  <div className="ml-3 pl-3 border-l border-black/[0.08] space-y-2">
                    {children.map((s, i) => (
                      <div key={s.id} className="space-y-2">
                        <CategoryRow
                          c={s} siblings={children} idx={i} busy={busy} nested
                          editing={editId === s.id} editName={editName} setEditName={setEditName}
                          startEdit={() => { setEditId(s.id); setEditName(s.name); }}
                          cancelEdit={() => setEditId(null)} saveRename={() => saveRename(s.id)}
                          move={move} onDelete={() => del(s)}
                          packOpen={packId === s.id} togglePack={() => setPackId(packId === s.id ? null : s.id)}
                          moveOpen={moveId === s.id} toggleMove={() => { setMoveId(moveId === s.id ? null : s.id); setErr(''); }}
                          parentOptions={roots.filter(r => r.id !== s.parentId)} setParent={p => setParent(s, p)}
                          childCount={0} inheritsPackaging={root.tracksOpen === true}
                        />
                        {packId === s.id && <PackagingEditor category={s} onSaved={onChanged} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button onClick={onClose} className="w-full rounded-full glass border border-black/10 text-[#16181A] py-3 text-sm font-medium hover:bg-black/[0.06]">Hotovo</button>
      </div>
    </div>
  );
}

/* ---------- One row in the category manager ---------- */
function CategoryRow({
  c, siblings, idx, busy, nested, editing, editName, setEditName, startEdit, cancelEdit, saveRename,
  move, onDelete, packOpen, togglePack, moveOpen, toggleMove, parentOptions, setParent, childCount,
  inheritsPackaging,
}: {
  c: Category; siblings: Category[]; idx: number; busy: boolean; nested?: boolean;
  editing: boolean; editName: string; setEditName: (v: string) => void;
  startEdit: () => void; cancelEdit: () => void; saveRename: () => void;
  move: (siblings: Category[], idx: number, dir: -1 | 1) => void;
  onDelete: () => void;
  packOpen: boolean; togglePack: () => void;
  moveOpen: boolean; toggleMove: () => void;
  parentOptions: Category[]; setParent: (parentId: number | null) => void;
  childCount: number; inheritsPackaging?: boolean;
}) {
  // A category with subcategories can't itself be nested — that would make the
  // tree three levels deep — so the move control only offers what is allowed.
  const canMove = parentOptions.length > 0 || c.parentId != null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-col shrink-0">
          <button onClick={() => move(siblings, idx, -1)} disabled={busy || idx === 0}
            className="text-black/40 hover:text-black disabled:opacity-20 leading-none text-xs">▲</button>
          <button onClick={() => move(siblings, idx, 1)} disabled={busy || idx === siblings.length - 1}
            className="text-black/40 hover:text-black disabled:opacity-20 leading-none text-xs">▼</button>
        </div>
        {editing ? (
          <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveRename(); } if (e.key === 'Escape') cancelEdit(); }}
            onBlur={saveRename}
            className="flex-1 min-w-0 rounded-xl bg-black/[0.04] border border-black/[0.08] px-3 py-1.5 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none" />
        ) : (
          <span className={`flex-1 min-w-0 truncate ${nested ? 'text-[13px] text-black/70' : 'text-sm text-[#16181A] font-medium'}`}>
            {c.name}
            {childCount > 0 && <span className="text-[11px] text-black/30 ml-1.5">{childCount} podkat.</span>}
            {inheritsPackaging && !c.tracksOpen && <span className="text-[11px] text-black/30 ml-1.5">balení dědí</span>}
          </span>
        )}
        {canMove && (
          <button onClick={toggleMove} title="Přesunout pod jinou kategorii"
            className={`shrink-0 rounded-full w-8 h-8 flex items-center justify-center text-sm transition ${moveOpen ? 'bg-[#16181A] text-white' : 'glass text-black/50 hover:text-black'}`}>
            <Icon name="swap" size={14} />
          </button>
        )}
        <button onClick={togglePack} title="Balení a zbytky"
          className={`shrink-0 rounded-full w-8 h-8 flex items-center justify-center text-sm transition ${c.tracksOpen ? 'bg-[#C8F542] text-black' : 'glass text-black/50 hover:text-black'}`}>
          <Icon name="box" size={15} />
        </button>
        <button onClick={startEdit} className="shrink-0 rounded-full glass w-8 h-8 flex items-center justify-center text-black/50 hover:text-black text-sm">✎</button>
        <button onClick={onDelete} className="shrink-0 rounded-full glass w-8 h-8 flex items-center justify-center text-red-600/70 hover:text-red-600 text-sm">✕</button>
      </div>

      {moveOpen && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-black/[0.03] border border-black/[0.06] px-3 py-2">
          <span className="text-[11px] text-black/45">Zařadit:</span>
          <button onClick={() => setParent(null)} disabled={busy || c.parentId == null}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition disabled:opacity-30 ${c.parentId == null ? 'bg-[#C8F542] text-black' : 'bg-white border border-black/[0.08] text-[#16181A] hover:border-[#C8F542]'}`}>
            Hlavní úroveň
          </button>
          {parentOptions.map(p => (
            <button key={p.id} onClick={() => setParent(p.id)} disabled={busy || c.parentId === p.id}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition disabled:opacity-30 ${c.parentId === p.id ? 'bg-[#C8F542] text-black' : 'bg-white border border-black/[0.08] text-[#16181A] hover:border-[#C8F542]'}`}>
              pod {p.name}
            </button>
          ))}
          {parentOptions.length === 0 && c.parentId == null && (
            <span className="text-[11px] text-black/35">Kategorie s podkategoriemi nejde zanořit.</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Per-category packaging settings ---------- */
// Turning this on makes every item in the category track how much is left in
// its open package, and gives staff a tap-scale instead of a scale-and-weigh.
function PackagingEditor({ category, onSaved }: {
  category: Category;
  onSaved: () => Promise<void> | void;
}) {
  const [on, setOn] = useState(category.tracksOpen === true);
  const [unit, setUnit] = useState(category.contentUnit ?? 'g');
  const [size, setSize] = useState(category.defaultPackageSize != null ? String(category.defaultPackageSize) : '');
  const [steps, setSteps] = useState<ScaleStep[]>(() => normalizeScale(category.scale).steps);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true); setSaved(false); setErr('');
    try {
      const res = await fetch(`/api/inventory/categories/${category.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracksOpen: on,
          contentUnit: unit || null,
          defaultPackageSize: size === '' ? null : Number(size),
          scale: { kind: 'fraction', steps },
        }),
      });
      if (res.ok) {
        setSaved(true); await onSaved(); setTimeout(() => setSaved(false), 1800);
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || 'Nastavení se nepodařilo uložit.');
      }
    } catch {
      setErr('Nepodařilo se spojit se serverem.');
    }
    setBusy(false);
  };

  const setStep = (i: number, patch: Partial<ScaleStep>) =>
    setSteps(list => list.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  return (
    <div className="mt-2.5 rounded-2xl bg-black/[0.03] border border-black/[0.06] p-3.5 space-y-3">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#C8F542]" />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[#16181A]">Sledovat zbytek v načatém balení</span>
          <span className="block text-[11px] text-black/45 mt-0.5">
            Obsluha na konci směny jen ťukne, jak je krabička plná — nic neváží.
          </span>
        </span>
      </label>

      {on && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-black/45 mb-1">Jednotka obsahu</label>
              <select value={unit} onChange={e => setUnit(e.target.value)}
                className="w-full rounded-xl bg-white border border-black/[0.08] px-3 py-2 text-sm text-[#16181A] focus:outline-none focus:border-[#C8F542]/50">
                {CONTENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-black/45 mb-1">Výchozí balení</label>
              <input type="number" min={0} value={size} onChange={e => setSize(e.target.value)} placeholder="100"
                className="w-full rounded-xl bg-white border border-black/[0.08] px-3 py-2 text-sm text-[#16181A] tabular-nums focus:outline-none focus:border-[#C8F542]/50" />
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/45 mb-1.5">Stupně měřítka</p>
            <div className="space-y-1.5">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={s.label} onChange={e => setStep(i, { label: e.target.value })}
                    className="flex-1 min-w-0 rounded-xl bg-white border border-black/[0.08] px-3 py-1.5 text-sm text-[#16181A] focus:outline-none focus:border-[#C8F542]/50" />
                  <div className="flex items-center gap-1 shrink-0">
                    <input type="number" min={0} max={100} value={s.pct ?? 0}
                      onChange={e => setStep(i, { pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      className="w-16 rounded-xl bg-white border border-black/[0.08] px-2 py-1.5 text-sm text-[#16181A] tabular-nums focus:outline-none focus:border-[#C8F542]/50" />
                    <span className="text-xs text-black/40">%</span>
                  </div>
                  <button onClick={() => setSteps(l => l.filter((_, idx) => idx !== i))}
                    className="shrink-0 rounded-full w-7 h-7 flex items-center justify-center text-black/35 hover:text-red-600">✕</button>
                </div>
              ))}
            </div>
            <button onClick={() => setSteps(l => [...l, { label: 'Nový stupeň', pct: 50 }])}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/[0.05] text-black/60 px-3 py-1.5 text-xs font-medium hover:bg-black/[0.09] transition">
              <Icon name="plus" size={13} /> Přidat stupeň
            </button>
            <p className="text-[11px] text-black/40 mt-1.5">
              Procenta platí pro jakoukoliv velikost balení — „Půl" je 50 g u stogramové i 25 g u padesátigramové.
            </p>
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={busy}
          className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2 text-xs hover:brightness-110 disabled:opacity-50 transition">
          {busy ? 'Ukládám…' : 'Uložit'}
        </button>
        {saved && <span className="text-xs font-medium text-[#5B7A08]">Uloženo ✓</span>}
        {err && <span className="text-xs font-medium text-red-600">{err}</span>}
      </div>
    </div>
  );
}
