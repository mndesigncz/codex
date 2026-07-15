'use client';

import { useState, useEffect } from 'react';
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
  updatedAt?: string;
  updatedByName?: string;
}

const CATEGORIES = ['Čaje', 'Přísady', 'Nádobí', 'Doplňky'];
const inputClass = 'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';
const emptyForm = { name: '', category: 'Čaje', quantity: '10', minQuantity: '5', criticalQuantity: '2', maxQuantity: '50', unit: 'ks', supplier: '' };

function statusOf(i: Item) {
  if (i.quantity <= i.criticalQuantity) return 'critical';
  if (i.quantity <= i.minQuantity) return 'low';
  return 'ok';
}

export default function Inventory({ user }: { user?: any }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('Vše');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await fetch('/api/inventory').then(r => r.json());
      if (Array.isArray(data)) setItems(data);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i =>
    (cat === 'Vše' || i.category === cat) && i.name.toLowerCase().includes(search.toLowerCase()));
  const critical = items.filter(i => statusOf(i) === 'critical');
  const low = items.filter(i => statusOf(i) === 'low');

  const openNew = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (i: Item) => {
    setEditing(i);
    setForm({ name: i.name, category: i.category, quantity: String(i.quantity), minQuantity: String(i.minQuantity), criticalQuantity: String(i.criticalQuantity), maxQuantity: String(i.maxQuantity), unit: i.unit, supplier: i.supplier ?? '' });
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name, category: form.category, unit: form.unit, supplier: form.supplier,
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
    await fetch(`/api/inventory/${i.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: q }) });
  };

  const remove = async (i: Item) => {
    if (!confirm(`Smazat položku „${i.name}"?`)) return;
    setItems(prev => prev.filter(x => x.id !== i.id));
    await fetch(`/api/inventory/${i.id}`, { method: 'DELETE' });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#16181A]">Sklad & zásoby</h1>
          <p className="text-black/45 text-sm">Přidávejte položky a nastavte hlídací limity</p>
        </div>
        <button onClick={openNew} className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 flex items-center gap-2">
          <Icon name="plus" size={16} /> Přidat položku
        </button>
      </div>

      {(critical.length > 0 || low.length > 0) && (
        <div className="glass-card border-orange-500/20 bg-orange-500/[0.06] p-5">
          <p className="font-semibold text-sm text-orange-700">
            {critical.length > 0 && <span className="text-red-600">{critical.length} kriticky málo</span>}
            {critical.length > 0 && low.length > 0 && ' · '}
            {low.length > 0 && <span className="text-orange-600">{low.length} dochází</span>}
          </p>
          <p className="text-black/55 text-sm mt-1">{[...critical, ...low].map(i => i.name).join(', ')}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat položku..." className={`${inputClass} flex-1`} />
        <div className="flex gap-1 overflow-x-auto glass rounded-full p-1">
          {['Vše', ...CATEGORIES].map(c => (
            <button key={c} onClick={() => setCat(c)} className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${cat === c ? 'bg-[#C8F542] text-black' : 'text-black/55 hover:text-black'}`}>{c}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-black/45">Žádné položky. Přidejte první.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(i => {
            const st = statusOf(i);
            const pct = Math.min(100, Math.round((i.quantity / Math.max(1, i.maxQuantity)) * 100));
            const barColor = st === 'critical' ? 'bg-red-400' : st === 'low' ? 'bg-orange-400' : 'bg-[#C8F542]';
            const chip = st === 'critical' ? 'bg-red-500/15 text-red-600' : st === 'low' ? 'bg-orange-500/15 text-orange-600' : 'bg-[#C8F542]/15 text-[#5B7A08]';
            return (
              <div key={i.id} className="glass-card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#16181A]">{i.name}</p>
                    <p className="text-xs text-black/45">{i.category}{i.supplier ? ` · ${i.supplier}` : ''}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${chip}`}>{st === 'critical' ? 'Kriticky' : st === 'low' ? 'Dochází' : 'OK'}</span>
                </div>
                <div className="mt-3 h-1.5 bg-black/[0.06] rounded-full overflow-hidden">
                  <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => step(i, -1)} className="rounded-full glass w-8 h-8 flex items-center justify-center text-black/70 hover:text-black">−</button>
                    <span className="text-lg font-bold text-[#16181A] w-16 text-center">{i.quantity} <span className="text-xs text-black/45">{i.unit}</span></span>
                    <button onClick={() => step(i, 1)} className="rounded-full glass w-8 h-8 flex items-center justify-center text-black/70 hover:text-black">+</button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(i)} className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/60 hover:text-black text-sm">✎</button>
                    <button onClick={() => remove(i)} className="rounded-full glass w-9 h-9 flex items-center justify-center text-red-600/70 hover:text-red-600 text-sm">✕</button>
                  </div>
                </div>
                <p className="text-[11px] text-black/25 mt-2">Limit: {i.minQuantity} · kriticky: {i.criticalQuantity} {i.unit}{i.updatedByName ? ` · upravil ${i.updatedByName}` : ''}</p>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xl z-50 flex items-end md:items-center justify-center md:p-4" onClick={() => setShowForm(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={save} className="glass-strong rounded-3xl rounded-b-none md:rounded-3xl w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto scrollbar-thin">
            <h3 className="text-lg font-bold tracking-tight text-[#16181A]">{editing ? 'Upravit položku' : 'Nová položka'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Název</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Kategorie</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputClass}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Jednotka</label>
                <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Aktuální množství</label>
                <input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Max. množství</label>
                <input type="number" value={form.maxQuantity} onChange={e => setForm(f => ({ ...f, maxQuantity: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-orange-600/70 mb-1.5">Upozornit při</label>
                <input type="number" value={form.minQuantity} onChange={e => setForm(f => ({ ...f, minQuantity: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-red-600/70 mb-1.5">Kriticky málo při</label>
                <input type="number" value={form.criticalQuantity} onChange={e => setForm(f => ({ ...f, criticalQuantity: e.target.value }))} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Dodavatel (volitelné)</label>
                <input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} className={inputClass} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-full glass border border-black/10 text-[#16181A] py-3 text-sm font-medium hover:bg-black/[0.06]">Zrušit</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-full bg-[#C8F542] text-black py-3 text-sm font-semibold hover:brightness-110 disabled:opacity-50">{saving ? 'Ukládám…' : 'Uložit'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
