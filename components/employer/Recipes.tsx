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
      <div className="mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Hledat recept..."
          className="w-full max-w-sm px-4 py-2.5 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800 placeholder:text-tea-300"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-4xl animate-spin">⏳</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(recipe => (
            <div
              key={recipe.id}
              onClick={() => setSelected(recipe)}
              className="bg-white rounded-2xl border-2 border-tea-100 p-5 cursor-pointer hover:border-matcha-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-tea-800">{recipe.name}</h3>
                  {recipe.description && <p className="text-xs text-tea-500 mt-0.5">{recipe.description}</p>}
                </div>
                <span className="text-2xl ml-2">🍵</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-tea-400">
                {recipe.prepTime && <span>⏱️ {recipe.prepTime} min</span>}
                <span>📋 {getIngredients(recipe.ingredients).length} ingrediencí</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-tea-800">{selected.name}</h2>
              <button onClick={() => setSelected(null)} className="text-tea-400 hover:text-tea-700 text-xl">✕</button>
            </div>

            {selected.description && <p className="text-tea-500 text-sm mb-4">{selected.description}</p>}

            {selected.prepTime && (
              <div className="flex gap-3 mb-4">
                <span className="bg-amber-100 text-amber-700 text-xs px-3 py-1 rounded-full font-medium">⏱️ {selected.prepTime} min</span>
              </div>
            )}

            <div className="mb-4">
              <h4 className="font-semibold text-tea-800 mb-2">📋 Ingredience</h4>
              <ul className="space-y-1">
                {getIngredients(selected.ingredients).map((ing: string, i: number) => (
                  <li key={i} className="text-sm text-tea-600 flex items-start gap-2">
                    <span className="text-matcha-500 mt-0.5">•</span>{ing}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-tea-800 mb-2">📖 Postup</h4>
              <p className="text-sm text-tea-700 leading-relaxed bg-tea-50 rounded-xl p-3">{selected.instructions}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
