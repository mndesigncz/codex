'use client';

import { useState, useEffect, useMemo } from 'react';

interface InventoryItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  criticalQuantity: number;
  maxQuantity: number;
  unit: string;
  supplierUrl?: string;
}

interface Props {
  user: { id?: string; name?: string | null };
}

function statusOf(i: InventoryItem): 'ok' | 'low' | 'critical' {
  if (i.quantity <= i.criticalQuantity) return 'critical';
  if (i.quantity <= i.minQuantity) return 'low';
  return 'ok';
}
const statusRank = { critical: 0, low: 1, ok: 2 } as const;

export default function InventoryReport({ user }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Per-item edited (unsaved) quantity draft.
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  // Secondary "nahlásit" report flow.
  const [showReport, setShowReport] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/inventory')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const qtyOf = (i: InventoryItem) => (draft[i.id] !== undefined ? draft[i.id] : i.quantity);
  const isDirty = (i: InventoryItem) => draft[i.id] !== undefined && draft[i.id] !== i.quantity;

  const setQty = (id: number, val: number) => {
    setDraft(prev => ({ ...prev, [id]: Math.max(0, val) }));
  };

  const save = async (item: InventoryItem) => {
    const newQty = qtyOf(item);
    if (newQty === item.quantity) return;
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQty, note: 'Úprava stavu zaměstnancem' }),
      });
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        setItems(prev => prev.map(x => x.id === item.id ? { ...x, ...(updated ?? { quantity: newQty }) } : x));
        setDraft(prev => { const n = { ...prev }; delete n[item.id]; return n; });
        setSavedId(item.id);
        setTimeout(() => setSavedId(s => (s === item.id ? null : s)), 2500);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingId(null);
    }
  };

  const lowItems = useMemo(
    () => items.filter(i => statusOf(i) !== 'ok')
      .sort((a, b) => statusRank[statusOf(a)] - statusRank[statusOf(b)] || a.name.localeCompare(b.name, 'cs')),
    [items],
  );
  const filtered = useMemo(
    () => items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())),
    [items, search],
  );

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

  const Stepper = ({ item }: { item: InventoryItem }) => {
    const dirty = isDirty(item);
    return (
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setQty(item.id, qtyOf(item) - 1)}
            className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/70 hover:text-black text-lg leading-none">−</button>
          <input
            type="number"
            value={qtyOf(item)}
            onChange={e => setQty(item.id, parseInt(e.target.value) || 0)}
            className="w-16 text-center rounded-2xl bg-black/[0.04] border border-black/[0.08] px-2 py-2 text-sm font-semibold text-[#16181A] tabular-nums focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
          />
          <button type="button" onClick={() => setQty(item.id, qtyOf(item) + 1)}
            className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/70 hover:text-black text-lg leading-none">+</button>
          <span className="text-xs text-black/40 w-6">{item.unit}</span>
        </div>
        {item.supplierUrl && (
          <a href={item.supplierUrl} target="_blank" rel="noopener" title="Objednat u dodavatele"
            className="rounded-full bg-[#C8F542]/20 text-[#5B7A08] hover:bg-[#C8F542]/30 px-3 h-9 flex items-center text-xs font-semibold whitespace-nowrap">Objednat ↗</a>
        )}
        <button type="button" onClick={() => save(item)} disabled={!dirty || savingId === item.id}
          className={`rounded-full px-4 h-9 text-xs font-semibold whitespace-nowrap transition-all ${dirty ? 'bg-[#C8F542] text-black hover:brightness-110' : savedId === item.id ? 'bg-[#C8F542]/15 text-[#5B7A08]' : 'glass border border-black/10 text-black/30'} disabled:cursor-not-allowed`}>
          {savingId === item.id ? 'Ukládám…' : savedId === item.id && !dirty ? 'Uloženo ✓' : 'Uložit'}
        </button>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="glass-card p-5">
        <h1 className="text-xl font-bold tracking-tight text-[#16181A]">Sklad & zásoby</h1>
        <p className="text-black/50 text-sm mt-1">Uprav stav, když něco dochází — vedení dostane upozornění.</p>
      </div>

      {success && (
        <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 p-4 text-[#5B7A08] text-sm">
          ✅ Hlášení bylo odesláno zaměstnavateli.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : (
        <>
          {/* Prominent low / critical items on top */}
          {lowItems.length > 0 && (
            <div className="glass-card border-orange-500/20 bg-orange-500/[0.06] p-5 space-y-3">
              <p className="font-semibold text-sm flex items-center gap-2 text-orange-700">⚠️ Dochází — uprav stav</p>
              <div className="space-y-2">
                {lowItems.map(i => {
                  const st = statusOf(i);
                  return (
                    <div key={i.id} className="flex items-center justify-between gap-3 flex-wrap bg-white/40 dark:bg-black/10 rounded-2xl px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#16181A] truncate">
                          {i.name}
                          <span className={`ml-2 text-xs font-semibold ${st === 'critical' ? 'text-red-600' : 'text-orange-600'}`}>
                            {st === 'critical' ? 'kriticky' : 'dochází'}
                          </span>
                        </p>
                        <p className="text-xs text-black/45">{i.category}</p>
                      </div>
                      <Stepper item={i} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full list with steppers */}
          <div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Hledat položku..."
              className="w-full max-w-sm rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm"
            />
          </div>

          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-black/[0.06]">
              <p className="text-xs font-semibold text-black/45 uppercase tracking-wider">Všechny položky ({filtered.length})</p>
            </div>
            <div className="divide-y divide-black/[0.06]">
              {filtered.map(item => {
                const st = statusOf(item);
                const dot = st === 'critical' ? 'bg-red-500' : st === 'low' ? 'bg-orange-500' : 'bg-[#C8F542]';
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 hover:bg-black/[0.02] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} title={st} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#16181A] truncate">{item.name}</p>
                        <p className="text-xs text-black/45 truncate">{item.category}</p>
                      </div>
                    </div>
                    <Stepper item={item} />
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="p-8 text-center text-black/45 text-sm">Žádné položky neodpovídají hledání.</div>
              )}
            </div>
          </div>

          {/* Secondary: multi-select report flow */}
          <div className="glass-card overflow-hidden">
            <button onClick={() => setShowReport(s => !s)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-black/[0.02] transition-colors">
              <div>
                <p className="text-sm font-semibold text-[#16181A]">Nahlásit chybějící položky</p>
                <p className="text-xs text-black/45">Pošli vedení seznam s poznámkou</p>
              </div>
              <span className="text-black/40 text-sm">{showReport ? '▲' : '▼'}</span>
            </button>

            {showReport && (
              <form onSubmit={handleSubmit} className="border-t border-black/[0.06] p-5 space-y-4">
                <p className="text-xs font-semibold text-black/45 uppercase tracking-wider">Vyberte položky k nahlášení ({selected.length} vybráno)</p>
                <div className="divide-y divide-black/[0.06] rounded-2xl border border-black/[0.06] overflow-hidden">
                  {filtered.map(item => {
                    const isLow = statusOf(item) !== 'ok';
                    const isChecked = selected.includes(item.id);
                    return (
                      <label key={item.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-black/[0.03] transition-colors ${isChecked ? 'bg-[#C8F542]/[0.06]' : ''}`}>
                        <span className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all ${isChecked ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/15'}`}>
                          {isChecked && <span className="text-xs font-bold">✓</span>}
                        </span>
                        <input type="checkbox" checked={isChecked} onChange={() => toggle(item.id)} className="sr-only" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#16181A] truncate">{item.name}</p>
                          <p className="text-xs text-black/45 truncate">{item.category}</p>
                        </div>
                        <span className={`text-xs font-medium ${isLow ? 'text-red-600' : 'text-black/55'}`}>
                          {item.quantity} {item.unit}{isLow && ' ⚠️'}
                        </span>
                      </label>
                    );
                  })}
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
        </>
      )}
    </div>
  );
}
