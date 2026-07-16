'use client';

import { useState, useEffect } from 'react';

interface Recipe {
  id: number;
  name: string;
  description?: string;
  ingredients: string;
  instructions: string;
  prepTime?: number;
}

export default function Recipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/recipes')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setRecipes(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  const getIngredients = (ing: string) => {
    try { return JSON.parse(ing); } catch { return [ing]; }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Hledat recept..."
          className="w-full max-w-sm rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(recipe => (
            <div
              key={recipe.id}
              onClick={() => setSelected(recipe)}
              className="glass-card p-6 cursor-pointer hover:bg-black/[0.05] hover:border-[#C8F542]/30 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold tracking-tight text-[#16181A]">{recipe.name}</h3>
                  {recipe.description && <p className="text-xs text-black/45 mt-1">{recipe.description}</p>}
                </div>
                <span className="text-2xl ml-2">🍵</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-black/45">
                {recipe.prepTime && <span className="rounded-full px-3 py-1 bg-orange-500/15 text-orange-600 font-medium">⏱️ {recipe.prepTime} min</span>}
                <span>📋 {getIngredients(recipe.ingredients).length} ingrediencí</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 modal-overlay z-50 flex items-end md:items-center justify-center md:p-4" onClick={() => setSelected(null)}>
          <div className="modal-sheet rounded-3xl rounded-b-none md:rounded-3xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 scrollbar-thin" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold tracking-tight text-[#16181A]">{selected.name}</h2>
              <button onClick={() => setSelected(null)} className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/55 hover:text-black transition-all">✕</button>
            </div>

            {selected.description && <p className="text-black/55 text-sm mb-4">{selected.description}</p>}

            {selected.prepTime && (
              <div className="flex gap-3 mb-5">
                <span className="rounded-full px-3 py-1 text-xs font-medium bg-orange-500/15 text-orange-600">⏱️ {selected.prepTime} min</span>
              </div>
            )}

            <div className="mb-5">
              <h4 className="text-xs uppercase tracking-wider text-black/45 mb-3">📋 Ingredience</h4>
              <ul className="space-y-1.5">
                {getIngredients(selected.ingredients).map((ing: string, i: number) => (
                  <li key={i} className="text-sm text-black/70 flex items-start gap-2">
                    <span className="text-[#5B7A08] mt-0.5">•</span>{ing}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wider text-black/45 mb-3">📖 Postup</h4>
              <p className="text-sm text-black/80 leading-relaxed bg-black/[0.04] border border-black/[0.07] rounded-2xl p-4">{selected.instructions}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
