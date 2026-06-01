import { useState } from 'react';
import { planningBoard as initialBoard, employees, recipes } from '../../data/mockData.js';

const columnAccents = {
  blue:   { header: 'border-accent-blue/40 bg-accent-blue/10', dot: 'bg-accent-blue', badge: 'bg-accent-blue/20 text-accent-blue', title: 'text-accent-blue' },
  orange: { header: 'border-warning/40 bg-warning/10', dot: 'bg-warning', badge: 'bg-warning/20 text-warning', title: 'text-warning' },
  yellow: { header: 'border-lime/40 bg-lime/10', dot: 'bg-lime', badge: 'bg-lime/20 text-lime', title: 'text-lime' },
  green:  { header: 'border-accent/40 bg-accent/10', dot: 'bg-accent', badge: 'bg-accent/20 text-accent', title: 'text-accent' },
};

const priorityIcons = { high: '🔴', medium: '🟡', low: '🟢' };

export default function PlanningBoard() {
  const [board, setBoard] = useState(initialBoard);
  const [activeTab, setActiveTab] = useState('board');
  const [dragging, setDragging] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [showNewCard, setShowNewCard] = useState(null);
  const [newCard, setNewCard] = useState({ title: '', description: '', priority: 'medium', assignee: '0', tags: '' });

  const handleDragStart = (cardId, colId) => setDragging({ cardId, colId });
  const handleDragOver = (e, colId) => { e.preventDefault(); setDragOverCol(colId); };
  const handleDrop = (e, targetColId) => {
    e.preventDefault();
    if (!dragging || dragging.colId === targetColId) {
      setDragging(null); setDragOverCol(null); return;
    }
    setBoard(prev => {
      const card = prev.columns.find(c => c.id === dragging.colId)?.cards.find(c => c.id === dragging.cardId);
      if (!card) return prev;
      return {
        ...prev,
        columns: prev.columns.map(col => {
          if (col.id === dragging.colId) return { ...col, cards: col.cards.filter(c => c.id !== dragging.cardId) };
          if (col.id === targetColId) return { ...col, cards: [...col.cards, card] };
          return col;
        }),
      };
    });
    setDragging(null); setDragOverCol(null);
  };

  const handleAddCard = (colId) => {
    if (!newCard.title) return;
    const id = 'p' + Date.now();
    const card = {
      id,
      title: newCard.title,
      description: newCard.description,
      assignee: parseInt(newCard.assignee),
      priority: newCard.priority,
      tags: newCard.tags.split(',').map(t => t.trim()).filter(Boolean),
    };
    setBoard(prev => ({
      ...prev,
      columns: prev.columns.map(col => col.id === colId ? { ...col, cards: [...col.cards, card] } : col),
    }));
    setShowNewCard(null);
    setNewCard({ title: '', description: '', priority: 'medium', assignee: '0', tags: '' });
  };

  const totalCards = board.columns.reduce((sum, col) => sum + col.cards.length, 0);

  return (
    <div className="p-4 md:p-6 max-w-full space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Plánovací tabule</h1>
          <p className="text-text-secondary text-sm">{totalCards} karet · Kanban board</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-elevated p-1 rounded-xl w-fit">
        {[['board', '🗂️ Kanban'], ['recipes', '🍵 Recepty']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${
              activeTab === id ? 'bg-card text-white shadow' : 'text-text-secondary hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'board' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {board.columns.map(col => {
            const colors = columnAccents[col.color] || columnAccents.blue;
            const isOver = dragOverCol === col.id;
            return (
              <div
                key={col.id}
                className={`flex-shrink-0 w-68 md:w-72 rounded-2xl border transition-all ${
                  isOver ? 'border-accent/50 bg-accent/5' : 'border-border bg-card'
                }`}
                style={{ minWidth: '260px' }}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                {/* Column header */}
                <div className={`flex items-center justify-between px-4 py-3 rounded-t-2xl border-b ${colors.header}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${colors.dot}`}></span>
                    <span className={`font-bold text-sm ${colors.title}`}>{col.title}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${colors.badge}`}>
                      {col.cards.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowNewCard(col.id)}
                    className="text-text-secondary hover:text-white transition-colors text-lg leading-none w-7 h-7 flex items-center justify-center hover:bg-elevated rounded-lg"
                  >
                    +
                  </button>
                </div>

                {/* Cards */}
                <div className="p-2 space-y-2 min-h-20">
                  {col.cards.map(card => {
                    const assignee = card.assignee === 0 ? { name: 'Eva', avatar: '👩‍💼' } : employees.find(e => e.id === card.assignee);
                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={() => handleDragStart(card.id, col.id)}
                        className="bg-elevated rounded-xl border border-border p-3 shadow-sm hover:border-border/60 cursor-grab active:cursor-grabbing transition-all"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-semibold text-white leading-snug">{card.title}</p>
                          <span className="flex-shrink-0">{priorityIcons[card.priority]}</span>
                        </div>
                        {card.description && (
                          <p className="text-xs text-text-secondary mb-2 leading-relaxed">{card.description}</p>
                        )}
                        {card.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {card.tags.map(tag => (
                              <span key={tag} className="text-xs px-1.5 py-0.5 bg-card text-text-secondary rounded-md border border-border">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <span className="text-base">{assignee?.avatar}</span>
                          <span className="text-xs text-text-secondary">{assignee?.name?.split(' ')[0]}</span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Inline new card form */}
                  {showNewCard === col.id && (
                    <div className="bg-elevated rounded-xl border-2 border-accent/50 p-3 space-y-2">
                      <input
                        type="text"
                        value={newCard.title}
                        onChange={e => setNewCard(s => ({ ...s, title: e.target.value }))}
                        placeholder="Název karty..."
                        className="w-full px-2 py-1.5 text-sm bg-card border border-border rounded-lg focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50"
                        autoFocus
                      />
                      <textarea
                        value={newCard.description}
                        onChange={e => setNewCard(s => ({ ...s, description: e.target.value }))}
                        placeholder="Popis (volitelné)..."
                        rows={2}
                        className="w-full px-2 py-1.5 text-sm bg-card border border-border rounded-lg focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 resize-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={newCard.priority}
                          onChange={e => setNewCard(s => ({ ...s, priority: e.target.value }))}
                          className="px-2 py-1.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:border-accent text-white"
                        >
                          <option value="high">🔴 Vysoká</option>
                          <option value="medium">🟡 Střední</option>
                          <option value="low">🟢 Nízká</option>
                        </select>
                        <select
                          value={newCard.assignee}
                          onChange={e => setNewCard(s => ({ ...s, assignee: e.target.value }))}
                          className="px-2 py-1.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:border-accent text-white"
                        >
                          <option value="0">👩‍💼 Eva</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.name.split(' ')[0]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddCard(col.id)}
                          className="flex-1 py-1.5 bg-accent text-black text-xs font-bold rounded-lg hover:bg-accent/90"
                        >
                          Přidat
                        </button>
                        <button
                          onClick={() => setShowNewCard(null)}
                          className="py-1.5 px-2 border border-border text-text-secondary text-xs rounded-lg hover:bg-elevated"
                        >
                          Zrušit
                        </button>
                      </div>
                    </div>
                  )}

                  {col.cards.length === 0 && showNewCard !== col.id && (
                    <p className="text-xs text-text-secondary/40 text-center py-4">Přetáhněte sem nebo klikněte +</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'recipes' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recipes.map(recipe => (
            <div key={recipe.id} className="bg-card rounded-2xl border border-border overflow-hidden hover:border-border/60 transition-all">
              <div className="px-5 py-4 border-b border-border bg-elevated">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-white">{recipe.name}</h3>
                    <p className="text-xs text-text-secondary mt-0.5">{recipe.category}</p>
                  </div>
                  <span className="text-xl font-bold text-accent">{recipe.price} Kč</span>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {[['⏱', recipe.prepTime], ['🌡', recipe.temperature], recipe.steepTime !== 'N/A' && ['⏳', recipe.steepTime]].filter(Boolean).map(([icon, val]) => (
                    <span key={val} className="text-xs bg-card px-2 py-1 rounded-lg text-text-secondary border border-border">{icon} {val}</span>
                  ))}
                </div>
              </div>
              <div className="p-5">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Ingredience</p>
                <ul className="space-y-1">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i} className="text-sm text-text-secondary flex gap-2">
                      <span className="text-accent flex-shrink-0">•</span>
                      {ing}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-border">
                  {recipe.tags.map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded-full border border-accent/20">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Add recipe card */}
          <button className="bg-elevated border-2 border-dashed border-border rounded-2xl p-8 text-center hover:bg-card hover:border-border/60 transition-all group">
            <span className="text-4xl block mb-2">🍵</span>
            <p className="font-semibold text-text-secondary group-hover:text-white transition-colors">Přidat nový recept</p>
          </button>
        </div>
      )}
    </div>
  );
}
