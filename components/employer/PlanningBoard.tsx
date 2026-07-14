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
  { id: 'ideas', label: 'Nápady', color: 'bg-blue-100 border-blue-200', headerColor: 'bg-blue-500' },
  { id: 'in_progress', label: 'Rozpracováno', color: 'bg-amber-50 border-amber-200', headerColor: 'bg-amber-500' },
  { id: 'review', label: 'Ke schválení', color: 'bg-yellow-50 border-yellow-200', headerColor: 'bg-yellow-500' },
  { id: 'done', label: 'Hotovo', color: 'bg-green-50 border-green-200', headerColor: 'bg-green-500' },
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
            <div key={col.id} className="flex flex-col gap-3">
              <div className={`${col.headerColor} text-white px-3 py-2 rounded-xl font-semibold text-sm flex items-center justify-between`}>
                <span>{col.label}</span>
                <span className="bg-white/20 rounded-full px-2 text-xs">{getColumnCards(col.id).length}</span>
              </div>

              <div className="space-y-3 min-h-24">
                {getColumnCards(col.id).map(card => (
                  <div key={card.id} className={`${col.color} border-2 rounded-xl p-3 shadow-sm`}>
                    <p className="font-semibold text-tea-800 text-sm">{card.title}</p>
                    {card.description && <p className="text-xs text-tea-500 mt-1">{card.description}</p>}
                  </div>
                ))}
              </div>

              {newCard?.column === col.id ? (
                <div className="bg-white border-2 border-matcha-200 rounded-xl p-3 space-y-2">
                  <input
                    autoFocus
                    value={newCard.title}
                    onChange={e => setNewCard(prev => prev ? { ...prev, title: e.target.value } : null)}
                    placeholder="Název karty..."
                    className="w-full text-sm border border-tea-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-matcha-500 text-tea-800"
                  />
                  <textarea
                    value={newCard.description}
                    onChange={e => setNewCard(prev => prev ? { ...prev, description: e.target.value } : null)}
                    placeholder="Popis (volitelné)"
                    rows={2}
                    className="w-full text-xs border border-tea-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-matcha-500 text-tea-800 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddCard} disabled={adding} className="flex-1 py-1 bg-matcha-600 text-white text-xs rounded-lg hover:bg-matcha-700 disabled:opacity-60">
                      {adding ? '⏳' : 'Přidat'}
                    </button>
                    <button onClick={() => setNewCard(null)} className="flex-1 py-1 bg-tea-100 text-tea-600 text-xs rounded-lg hover:bg-tea-200">
                      Zrušit
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNewCard({ column: col.id, title: '', description: '' })}
                  className="w-full py-2 border-2 border-dashed border-tea-200 rounded-xl text-xs text-tea-400 hover:border-tea-300 hover:text-tea-500 transition-all"
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
