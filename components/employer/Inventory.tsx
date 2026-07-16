'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../Icons';

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
  updatedAt?: string;
  updatedByName?: string;
}

interface Category {
  id: number;
  name: string;
  position: number;
}

type SortKey = 'name' | 'qtyAsc' | 'qtyDesc' | 'status' | 'updated';
type View = 'list' | 'grid';

const DEFAULT_CATEGORIES = ['Čaje', 'Přísady', 'Nádobí', 'Doplňky'];
const inputClass = 'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';
const emptyForm = { name: '', category: '', quantity: '10', minQuantity: '5', criticalQuantity: '2', maxQuantity: '50', unit: 'ks', supplier: '', supplierUrl: '' };

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

export default function Inventory({ user }: { user?: any }) {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('Vše');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [view, setView] = useState<View>('grid');
  const [showForm, setShowForm] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [newCatInline, setNewCatInline] = useState('');
  const [addingCat, setAddingCat] = useState(false);

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
  useEffect(() => { load(); }, []);

  // Category names available for the pick-list: custom categories, plus any
  // category strings already used by items (so nothing gets orphaned in the UI).
  const catNames = useMemo(() => {
    const set = new Set<string>();
    categories.forEach(c => set.add(c.name));
    items.forEach(i => { if (i.category) set.add(i.category); });
    return Array.from(set);
  }, [categories, items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter(i =>
      (cat === 'Vše' || i.category === cat) &&
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
  }, [items, cat, search, sort]);

  const critical = items.filter(i => statusOf(i) === 'critical');
  const low = items.filter(i => statusOf(i) === 'low');

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, category: catNames[0] ?? '' });
    setNewCatInline('');
    setShowForm(true);
  };
  const openEdit = (i: Item) => {
    setEditing(i);
    setForm({ name: i.name, category: i.category ?? '', quantity: String(i.quantity), minQuantity: String(i.minQuantity), criticalQuantity: String(i.criticalQuantity), maxQuantity: String(i.maxQuantity), unit: i.unit, supplier: i.supplier ?? '', supplierUrl: i.supplierUrl ?? '' });
    setNewCatInline('');
    setShowForm(true);
  };

  const createCategory = async (name: string): Promise<boolean> => {
    const clean = name.trim();
    if (!clean) return false;
    try {
      const res = await fetch('/api/inventory/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: clean }),
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
    const ok = await createCategory(clean);
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
          <p className="text-black/45 text-sm">{items.length} {items.length === 1 ? 'položka' : items.length >= 2 && items.length <= 4 ? 'položky' : 'položek'} · přidávejte a hlídejte limity</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCats(true)} className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] font-medium px-4 py-2.5 text-sm flex items-center gap-2">
            <Icon name="settings" size={16} /> Kategorie
          </button>
          <button onClick={openNew} className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 flex items-center gap-2">
            <Icon name="plus" size={16} /> Přidat položku
          </button>
        </div>
      </div>

      {(critical.length > 0 || low.length > 0) && (
        <div className="glass-card border-orange-500/20 bg-orange-500/[0.06] p-5">
          <p className="font-semibold text-sm flex items-center gap-2 text-orange-700">
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
          <div className="flex items-center gap-2 shrink-0">
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
          {['Vše', ...catNames].map(c => (
            <button key={c} onClick={() => setCat(c)} className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 ${cat === c ? 'bg-[#C8F542] text-black' : 'glass text-black/55 hover:text-black'}`}>{c}</button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-black/45">
        <span>{filtered.length} {filtered.length === 1 ? 'položka' : filtered.length >= 2 && filtered.length <= 4 ? 'položky' : 'položek'}{cat !== 'Vše' ? ` v „${cat}"` : ''}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-black/45">{items.length === 0 ? 'Žádné položky. Přidejte první.' : 'Žádné položky neodpovídají filtru.'}</div>
      ) : view === 'list' ? (
        <ListView items={filtered} step={step} openEdit={openEdit} remove={remove} />
      ) : (
        <GridView items={filtered} step={step} openEdit={openEdit} remove={remove} />
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
                  {catNames.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {catNames.map(c => {
                        const active = form.category === c;
                        return (
                          <button type="button" key={c} onClick={() => setForm(f => ({ ...f, category: c }))}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${active ? 'bg-[#C8F542] text-black' : 'glass text-black/55 hover:text-black'}`}>
                            {active && <Icon name="check" size={13} />}{c}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <div className="relative flex-1 min-w-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30 pointer-events-none"><Icon name="plus" size={14} /></span>
                      <input value={newCatInline} onChange={e => setNewCatInline(e.target.value)} placeholder="Nová kategorie"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInlineCategory(); } }}
                        className={`${inputClass} py-2 pl-8`} />
                    </div>
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
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-full glass border border-black/10 text-[#16181A] py-3 text-sm font-medium hover:bg-black/[0.06]">Zrušit</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-full bg-[#C8F542] text-black py-3 text-sm font-semibold hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2">
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
    </div>
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
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-4 py-2.5 text-sm flex items-center gap-2 font-medium">
        <Icon name="swap" size={15} className="text-black/40" />
        <span className="whitespace-nowrap">{current.label}</span>
        <Icon name="chevron" size={14} className={`text-black/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" className="absolute right-0 mt-2 w-56 z-30 rounded-2xl bg-white/95 backdrop-blur-xl border border-black/[0.08] shadow-xl shadow-black/10 p-1.5">
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
function GridView({ items, step, openEdit, remove }: {
  items: Item[]; step: (i: Item, d: number) => void; openEdit: (i: Item) => void; remove: (i: Item) => void;
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
            <p className="text-[11px] text-black/25 mt-2">Limit: {i.minQuantity} · kriticky: {i.criticalQuantity} {i.unit}{i.updatedByName ? ` · ${relTime(i.updatedAt)} ${i.updatedByName}` : ''}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Category management modal ---------- */
function CategoryManager({ categories, onClose, onChanged, createCategory }: {
  categories: Category[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  createCategory: (name: string) => Promise<boolean>;
}) {
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const ok = await createCategory(newName);
    setBusy(false);
    if (ok) { setNewName(''); await onChanged(); }
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

  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= categories.length) return;
    const a = categories[idx], b = categories[target];
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
    if (!confirm(`Smazat kategorii „${c.name}"? Položky si svůj štítek ponechají.`)) return;
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
          <button onClick={add} disabled={busy || !newName.trim()} className="shrink-0 rounded-full bg-[#C8F542] text-black font-semibold px-5 text-sm hover:brightness-110 disabled:opacity-40">Přidat</button>
        </div>

        {categories.length === 0 ? (
          <div className="text-center space-y-3 py-4">
            <p className="text-sm text-black/45">Zatím žádné kategorie.</p>
            <button onClick={seedDefaults} disabled={busy} className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-4 py-2 text-sm font-medium disabled:opacity-40">
              Přidat výchozí: {DEFAULT_CATEGORIES.join(', ')}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {categories.map((c, idx) => (
              <div key={c.id} className="flex items-center gap-2 py-2.5">
                <div className="flex flex-col">
                  <button onClick={() => move(idx, -1)} disabled={busy || idx === 0} className="text-black/40 hover:text-black disabled:opacity-20 leading-none text-xs">▲</button>
                  <button onClick={() => move(idx, 1)} disabled={busy || idx === categories.length - 1} className="text-black/40 hover:text-black disabled:opacity-20 leading-none text-xs">▼</button>
                </div>
                {editId === c.id ? (
                  <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveRename(c.id); } if (e.key === 'Escape') setEditId(null); }}
                    onBlur={() => saveRename(c.id)}
                    className="flex-1 rounded-xl bg-black/[0.04] border border-black/[0.08] px-3 py-1.5 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none" />
                ) : (
                  <span className="flex-1 text-sm text-[#16181A] truncate">{c.name}</span>
                )}
                <button onClick={() => { setEditId(c.id); setEditName(c.name); }} className="rounded-full glass w-8 h-8 flex items-center justify-center text-black/50 hover:text-black text-sm">✎</button>
                <button onClick={() => del(c)} className="rounded-full glass w-8 h-8 flex items-center justify-center text-red-600/70 hover:text-red-600 text-sm">✕</button>
              </div>
            ))}
          </div>
        )}

        <button onClick={onClose} className="w-full rounded-full glass border border-black/10 text-[#16181A] py-3 text-sm font-medium hover:bg-black/[0.06]">Hotovo</button>
      </div>
    </div>
  );
}
