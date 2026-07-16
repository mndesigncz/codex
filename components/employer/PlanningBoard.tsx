'use client';

import { useState, useEffect } from 'react';

interface PlanningCard {
  id: number;
  title: string;
  description?: string;
  column: string;
  position: number;
}

const COLUMNS = [
  { id: 'ideas', label: 'Nápady', dot: 'bg-[#0A84FF]', chip: 'bg-[#0A84FF]/15 text-[#0A6FE0]' },
  { id: 'in_progress', label: 'Rozpracováno', dot: 'bg-orange-400', chip: 'bg-orange-500/15 text-orange-600' },
  { id: 'review', label: 'Ke schválení', dot: 'bg-yellow-400', chip: 'bg-yellow-500/15 text-yellow-600' },
  { id: 'done', label: 'Hotovo', dot: 'bg-[#C8F542]', chip: 'bg-[#C8F542]/15 text-[#5B7A08]' },
];

export default function PlanningBoard() {
  const [cards, setCards] = useState<PlanningCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCard, setNewCard] = useState<{ column: string; title: string; description: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/planning')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCards(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const getColumnCards = (colId: string) => cards.filter(c => c.column === colId).sort((a, b) => a.position - b.position);

  const handleAddCard = async () => {
    if (!newCard || !newCard.title.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newCard, position: getColumnCards(newCard.column).length }),
      });
      if (res.ok) {
        const card = await res.json();
        setCards(prev => [...prev, card]);
        setNewCard(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  };

  const moveCard = async (card: PlanningCard, targetCol: string) => {
    if (card.column === targetCol) return;
    const newPosition = getColumnCards(targetCol).length;
    // Optimistic
    const prev = cards;
    setCards(cs => cs.map(c => c.id === card.id ? { ...c, column: targetCol, position: newPosition } : c));
    setMenuId(null);
    try {
      const res = await fetch(`/api/planning/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: targetCol, position: newPosition }),
      });
      if (!res.ok) throw new Error('patch failed');
    } catch (e) {
      console.error(e);
      setCards(prev); // rollback
    }
  };

  const deleteCard = async (card: PlanningCard) => {
    if (!confirm(`Smazat kartu „${card.title}"?`)) return;
    const prev = cards;
    setCards(cs => cs.filter(c => c.id !== card.id));
    setMenuId(null);
    try {
      const res = await fetch(`/api/planning/${card.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
    } catch (e) {
      console.error(e);
      setCards(prev); // rollback
    }
  };

  const handleDrop = (colId: string) => {
    setDragOverCol(null);
    if (dragId === null) return;
    const card = cards.find(c => c.id === dragId);
    setDragId(null);
    if (card) moveCard(card, colId);
  };

  return (
    <div className="p-6">
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map(col => (
            <div
              key={col.id}
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.id); }}
              onDragLeave={() => setDragOverCol(c => (c === col.id ? null : c))}
              onDrop={() => handleDrop(col.id)}
              className={`glass rounded-3xl p-4 flex flex-col gap-3 transition-all ${dragOverCol === col.id ? 'ring-2 ring-[#C8F542]/60 bg-[#C8F542]/[0.04]' : ''}`}
            >
              <div className="flex items-center justify-between px-1 py-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <span className="font-semibold text-sm text-[#16181A] tracking-tight">{col.label}</span>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${col.chip}`}>{getColumnCards(col.id).length}</span>
              </div>

              <div className="space-y-3 min-h-24">
                {getColumnCards(col.id).map(card => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => setDragId(card.id)}
                    onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                    className={`relative bg-black/[0.04] border border-black/[0.07] rounded-2xl p-4 hover:bg-black/[0.06] transition-all duration-300 cursor-grab active:cursor-grabbing ${dragId === card.id ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#16181A] text-sm">{card.title}</p>
                        {card.description && <p className="text-xs text-black/45 mt-1.5">{card.description}</p>}
                      </div>
                      <button
                        onClick={() => setMenuId(m => (m === card.id ? null : card.id))}
                        className="rounded-full glass w-7 h-7 flex items-center justify-center text-black/50 hover:text-black shrink-0 leading-none"
                        title="Možnosti"
                      >
                        ···
                      </button>
                    </div>

                    {menuId === card.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                        <div className="absolute right-3 top-11 z-20 glass-strong rounded-2xl p-2 w-48 shadow-lg space-y-0.5">
                          <p className="text-[10px] uppercase tracking-wider text-black/40 px-2 py-1">Přesunout do →</p>
                          {COLUMNS.filter(c => c.id !== card.column).map(c => (
                            <button
                              key={c.id}
                              onClick={() => moveCard(card, c.id)}
                              className="w-full text-left px-2 py-2 rounded-xl text-sm text-[#16181A] hover:bg-black/[0.06] flex items-center gap-2 transition-colors"
                            >
                              <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                              {c.label}
                            </button>
                          ))}
                          <div className="h-px bg-black/[0.08] my-1" />
                          <button
                            onClick={() => deleteCard(card)}
                            className="w-full text-left px-2 py-2 rounded-xl text-sm text-red-600 hover:bg-red-500/10 transition-colors"
                          >
                            Smazat kartu
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {newCard?.column === col.id ? (
                <div className="bg-black/[0.04] border border-[#C8F542]/30 rounded-2xl p-3 space-y-2">
                  <input
                    autoFocus
                    value={newCard.title}
                    onChange={e => setNewCard(prev => prev ? { ...prev, title: e.target.value } : null)}
                    placeholder="Název karty..."
                    className="w-full text-sm rounded-xl bg-black/[0.04] border border-black/[0.08] px-3 py-2 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none transition-all"
                  />
                  <textarea
                    value={newCard.description}
                    onChange={e => setNewCard(prev => prev ? { ...prev, description: e.target.value } : null)}
                    placeholder="Popis (volitelné)"
                    rows={2}
                    className="w-full text-xs rounded-xl bg-black/[0.04] border border-black/[0.08] px-3 py-2 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none transition-all resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddCard} disabled={adding} className="flex-1 py-1.5 rounded-full bg-[#C8F542] text-black text-xs font-semibold hover:brightness-110 disabled:opacity-50 transition-all">
                      {adding ? 'Přidávám…' : 'Přidat'}
                    </button>
                    <button onClick={() => setNewCard(null)} className="flex-1 py-1.5 rounded-full glass border border-black/10 text-black/60 text-xs hover:bg-black/[0.06] transition-all">
                      Zrušit
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNewCard({ column: col.id, title: '', description: '' })}
                  className="w-full py-2.5 border border-dashed border-black/10 rounded-2xl text-xs text-black/30 hover:border-[#C8F542]/40 hover:text-[#5B7A08] transition-all duration-300"
                >
                  + Přidat kartu
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
