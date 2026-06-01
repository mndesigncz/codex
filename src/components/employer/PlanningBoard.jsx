import { useState } from 'react';
import { planningBoard as initialBoard, employees, recipes } from '../../data/mockData.js';

const columnColors = {
  blue: { header: 'bg-blue-100 border-blue-200', dot: 'bg-blue-400', badge: 'bg-blue-100 text-blue-700', title: 'text-blue-700' },
  orange: { header: 'bg-amber-100 border-amber-200', dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-700', title: 'text-amber-700' },
  yellow: { header: 'bg-yellow-100 border-yellow-200', dot: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700', title: 'text-yellow-700' },
  green: { header: 'bg-matcha-100 border-matcha-200', dot: 'bg-matcha-400', badge: 'bg-matcha-100 text-matcha-700', title: 'text-matcha-700' },
};

const priorityIcons = { high: '🔴', medium: '🟡', low: '🟢' };

export default function PlanningBoard() {
  const [board, setBoard] = useState(initialBoard);
  const [activeTab, setActiveTab] = useState('board');
  const [dragging, setDragging] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [showNewCard, setShowNewCard] = useState(null); // column id
  const [newCard, setNewCard] = useState({ title: '', description: '', priority: 'medium', assignee: '0', tags: '' });

  const handleDragStart = (cardId, colId) => setDragging({ cardId, colId });
  const handleDragOver = (e, colId) => { e.preventDefault(); setDragOverCol(colId); };
  const handleDrop = (e, targetColId) => {
    e.preventDefault();
    if (!dragging || dragging.colId === targetColId) {
      setDragging(null);
      setDragOverCol(null);
      return;
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
    setDragging(null);
    setDragOverCol(null);
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
    <div className="p-6 max-w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tea-800">🗂️ Plánovací tabule</h1>
          <p className="text-tea-500 text-sm">{totalCards} karet • Kanban board pro plánování</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-tea-100 p-1 rounded-xl w-fit">
        {[['board', '🗂️ Kanban tabule'], ['recipes', '🍵 Recepty & Menu']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === id ? 'bg-white shadow text-matcha-700' : 'text-tea-500 hover:text-tea-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'board' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {board.columns.map(col => {
            const colors = columnColors[col.color] || columnColors.blue;
            const isOver = dragOverCol === col.id;
            return (
              <div
                key={col.id}
                className={`flex-shrink-0 w-72 rounded-2xl border-2 transition-all ${
                  isOver ? 'border-matcha-400 bg-matcha-50' : 'border-tea-200 bg-white'
                }`}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                {/* Column header */}
                <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl border-b ${colors.header}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${colors.dot}`}></span>
                    <span className={`font-bold text-sm ${colors.title}`}>{col.title}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${colors.badge}`}>
                      {col.cards.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowNewCard(col.id)}
                    className="text-tea-400 hover:text-tea-700 transition-colors text-lg leading-none"
                  >
                    ＋
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
                        className="bg-white rounded-xl border border-tea-200 p-3 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-all hover:border-tea-300"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-semibold text-tea-800 leading-snug">{card.title}</p>
                          <span className="flex-shrink-0">{priorityIcons[card.priority]}</span>
                        </div>
                        {card.description && (
                          <p className="text-xs text-tea-500 mb-2 leading-relaxed">{card.description}</p>
                        )}
                        {card.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {card.tags.map(tag => (
                              <span key={tag} className="text-xs px-1.5 py-0.5 bg-tea-100 text-tea-600 rounded-md">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <span className="text-base">{assignee?.avatar}</span>
                            <span className="text-xs text-tea-400">{assignee?.name?.split(' ')[0]}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Inline new card form */}
                  {showNewCard === col.id && (
                    <div className="bg-tea-50 rounded-xl border-2 border-matcha-400 p-3 space-y-2">
                      <input
                        type="text"
                        value={newCard.title}
                        onChange={e => setNewCard(s => ({ ...s, title: e.target.value }))}
                        placeholder="Název karty..."
                        className="w-full px-2 py-1.5 text-sm border border-tea-200 rounded-lg focus:outline-none focus:border-matcha-500"
                        autoFocus
                      />
                      <textarea
                        value={newCard.description}
                        onChange={e => setNewCard(s => ({ ...s, description: e.target.value }))}
                        placeholder="Popis (volitelné)..."
                        rows={2}
                        className="w-full px-2 py-1.5 text-sm border border-tea-200 rounded-lg focus:outline-none focus:border-matcha-500 resize-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={newCard.priority}
                          onChange={e => setNewCard(s => ({ ...s, priority: e.target.value }))}
                          className="px-2 py-1.5 text-xs border border-tea-200 rounded-lg focus:outline-none focus:border-matcha-500"
                        >
                          <option value="high">🔴 Vysoká</option>
                          <option value="medium">🟡 Střední</option>
                          <option value="low">🟢 Nízká</option>
                        </select>
                        <select
                          value={newCard.assignee}
                          onChange={e => setNewCard(s => ({ ...s, assignee: e.target.value }))}
                          className="px-2 py-1.5 text-xs border border-tea-200 rounded-lg focus:outline-none focus:border-matcha-500"
                        >
                          <option value="0">👩‍💼 Eva</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.name.split(' ')[0]}</option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="text"
                        value={newCard.tags}
                        onChange={e => setNewCard(s => ({ ...s, tags: e.target.value }))}
                        placeholder="Tagy (oddělené čárkou)"
                        className="w-full px-2 py-1.5 text-xs border border-tea-200 rounded-lg focus:outline-none focus:border-matcha-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddCard(col.id)}
                          className="flex-1 py-1.5 bg-matcha-600 text-white text-xs font-semibold rounded-lg hover:bg-matcha-700"
                        >
                          Přidat
                        </button>
                        <button
                          onClick={() => setShowNewCard(null)}
                          className="py-1.5 px-2 border border-tea-200 text-tea-500 text-xs rounded-lg hover:bg-tea-100"
                        >
                          Zrušit
                        </button>
                      </div>
                    </div>
                  )}

                  {col.cards.length === 0 && showNewCard !== col.id && (
                    <p className="text-xs text-tea-300 text-center py-4">Přetáhněte sem kartu nebo klikněte ＋</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'recipes' && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recipes.map(recipe => (
              <div key={recipe.id} className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden hover:shadow-md transition-shadow">
                <div className="px-5 py-4 border-b border-tea-100 bg-gradient-to-r from-matcha-50 to-tea-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-tea-800">{recipe.name}</h3>
                      <p className="text-xs text-tea-500 mt-0.5">{recipe.category}</p>
                    </div>
                    <span className="text-xl font-bold text-matcha-700">{recipe.price} Kč</span>
                  </div>
                  <div className="flex gap-3 mt-3">
                    <span className="text-xs bg-white/80 px-2 py-1 rounded-lg text-tea-600">⏱ {recipe.prepTime}</span>
                    <span className="text-xs bg-white/80 px-2 py-1 rounded-lg text-tea-600">🌡 {recipe.temperature}</span>
                    {recipe.steepTime !== 'N/A' && (
                      <span className="text-xs bg-white/80 px-2 py-1 rounded-lg text-tea-600">⏳ {recipe.steepTime}</span>
                    )}
                  </div>
                </div>
                <div className="p-5">
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-tea-600 uppercase tracking-wide mb-1.5">Ingredience</p>
                    <ul className="space-y-1">
                      {recipe.ingredients.map((ing, i) => (
                        <li key={i} className="text-sm text-tea-700 flex gap-2">
                          <span className="text-matcha-500">•</span>
                          {ing}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-tea-600 uppercase tracking-wide mb-1.5">Postup</p>
                    <p className="text-sm text-tea-600 leading-relaxed">{recipe.instructions}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-tea-100">
                    {recipe.tags.map(tag => (
                      <span key={tag} className="text-xs px-2 py-0.5 bg-matcha-50 text-matcha-700 rounded-full border border-matcha-200">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Add recipe card */}
            <button className="bg-tea-50 border-2 border-dashed border-tea-300 rounded-2xl p-8 text-center hover:bg-tea-100 hover:border-tea-400 transition-all group">
              <span className="text-4xl block mb-2 group-hover:scale-110 transition-transform">🍵</span>
              <p className="font-semibold text-tea-500 group-hover:text-tea-700">Přidat nový recept</p>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
