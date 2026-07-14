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
  { id: 'ideas', label: 'Nápady', dot: 'bg-[#0A84FF]', chip: 'bg-[#0A84FF]/15 text-[#0A84FF]' },
  { id: 'in_progress', label: 'Rozpracováno', dot: 'bg-orange-400', chip: 'bg-orange-500/15 text-orange-400' },
  { id: 'review', label: 'Ke schválení', dot: 'bg-yellow-400', chip: 'bg-yellow-500/15 text-yellow-400' },
  { id: 'done', label: 'Hotovo', dot: 'bg-[#C8F542]', chip: 'bg-[#C8F542]/15 text-[#C8F542]' },
];

export default function PlanningBoard() {
  const [cards, setCards] = useState<PlanningCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCard, setNewCard] = useState<{ column: string; title: string; description: string } | null>(null);
  const [adding, setAdding] = useState(false);

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

  return (
    <div className="p-6">
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-4xl animate-spin">⏳</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map(col => (
            <div key={col.id} className="glass rounded-3xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between px-1 py-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <span className="font-semibold text-sm text-white tracking-tight">{col.label}</span>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${col.chip}`}>{getColumnCards(col.id).length}</span>
              </div>

              <div className="space-y-3 min-h-24">
                {getColumnCards(col.id).map(card => (
                  <div key={card.id} className="bg-white/[0.06] border border-white/[0.08] rounded-2xl p-4 hover:bg-white/[0.09] transition-all duration-300">
                    <p className="font-semibold text-white text-sm">{card.title}</p>
                    {card.description && <p className="text-xs text-white/40 mt-1.5">{card.description}</p>}
                  </div>
                ))}
              </div>

              {newCard?.column === col.id ? (
                <div className="bg-white/[0.06] border border-[#C8F542]/30 rounded-2xl p-3 space-y-2">
                  <input
                    autoFocus
                    value={newCard.title}
                    onChange={e => setNewCard(prev => prev ? { ...prev, title: e.target.value } : null)}
                    placeholder="Název karty..."
                    className="w-full text-sm rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 text-white placeholder-white/30 focus:border-[#C8F542]/50 focus:outline-none transition-all"
                  />
                  <textarea
                    value={newCard.description}
                    onChange={e => setNewCard(prev => prev ? { ...prev, description: e.target.value } : null)}
                    placeholder="Popis (volitelné)"
                    rows={2}
                    className="w-full text-xs rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 text-white placeholder-white/30 focus:border-[#C8F542]/50 focus:outline-none transition-all resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddCard} disabled={adding} className="flex-1 py-1.5 rounded-full bg-[#C8F542] text-black text-xs font-semibold hover:brightness-110 disabled:opacity-50 transition-all">
                      {adding ? '⏳' : 'Přidat'}
                    </button>
                    <button onClick={() => setNewCard(null)} className="flex-1 py-1.5 rounded-full glass border border-white/15 text-white/60 text-xs hover:bg-white/10 transition-all">
                      Zrušit
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNewCard({ column: col.id, title: '', description: '' })}
                  className="w-full py-2.5 border border-dashed border-white/15 rounded-2xl text-xs text-white/30 hover:border-[#C8F542]/40 hover:text-[#C8F542] transition-all duration-300"
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
