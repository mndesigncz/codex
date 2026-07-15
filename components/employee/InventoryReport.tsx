'use client';

import { useState, useEffect } from 'react';

interface InventoryItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  unit: string;
}

interface Props {
  user: { id?: string; name?: string | null };
}

export default function InventoryReport({ user }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/inventory')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const toggle = (id: number) => {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/inventory/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportedBy: parseInt(user.id ?? '0'),
          items: JSON.stringify(selected),
          note,
        }),
      });
      if (res.ok) {
        setSuccess(true);
        setSelected([]);
        setNote('');
        setTimeout(() => setSuccess(false), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const lowStock = items.filter(i => i.quantity < i.minQuantity);
  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6">
      <div className="glass-card border-orange-500/20 bg-orange-500/[0.06] p-5">
        <p className="text-orange-600 font-semibold text-sm">⚠️ Nahlásit nízký stav zásob</p>
        <p className="text-orange-600/70 text-xs mt-1">Zaškrtněte položky, které je potřeba doplnit, a odešlete hlášení zaměstnavateli.</p>
      </div>

      {success && (
        <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 p-4 text-[#5B7A08] text-sm">
          ✅ Hlášení bylo odesláno zaměstnavateli.
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="glass-card border-red-500/20 bg-red-500/[0.06] p-5">
          <p className="text-red-600 font-semibold text-sm mb-3">Položky pod minimem:</p>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(i => (
              <button key={i.id} onClick={() => toggle(i.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all duration-300 ${selected.includes(i.id) ? 'bg-red-400 text-black' : 'bg-red-500/15 text-red-600 border border-red-500/20 hover:bg-red-500/25'}`}>
                {i.name} ({i.quantity} {i.unit})
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Hledat položku..."
          className="w-full max-w-sm rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-black/[0.06]">
              <p className="text-xs font-semibold text-black/45 uppercase tracking-wider">Vyberte položky k nahlášení ({selected.length} vybráno)</p>
            </div>
            <div className="divide-y divide-black/[0.06]">
              {filtered.map(item => {
                const isLow = item.quantity < item.minQuantity;
                const isChecked = selected.includes(item.id);
                return (
                  <label key={item.id} className={`flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-black/[0.03] transition-colors ${isChecked ? 'bg-[#C8F542]/[0.06]' : ''}`}>
                    <span className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isChecked ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/15'}`}>
                      {isChecked && <span className="text-xs font-bold">✓</span>}
                    </span>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(item.id)}
                      className="sr-only"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#16181A]">{item.name}</p>
                      <p className="text-xs text-black/45">{item.category}</p>
                    </div>
                    <span className={`text-xs font-medium ${isLow ? 'text-red-600' : 'text-black/55'}`}>
                      {item.quantity} {item.unit}
                      {isLow && ' ⚠️'}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Poznámka (volitelné)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="Popište stav zásob nebo další informace..."
              className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm resize-none" />
          </div>

          <button type="submit" disabled={selected.length === 0 || submitting}
            className="rounded-full bg-[#C8F542] text-black font-semibold px-6 py-3 hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {submitting ? 'Odesílám…' : `Odeslat hlášení (${selected.length} položek)`}
          </button>
        </form>
      )}
    </div>
  );
}
