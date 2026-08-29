'use client';

// Recipes: which stock items disappear when one POS product is sold, and how
// much of each. A glass of wine = 150 ml from the bottle; svařák = wine + spices.
// The queue on top shows what sells without a recipe, best sellers first.

import { useEffect, useMemo, useState } from 'react';

const inputClass =
  'rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3.5 py-2.5 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none';

type Draft = { productId: string; productName: string; ingredients: { itemId: string; amount: string }[]; existing: boolean };

export default function PosMappingModal({ items, onClose, onSynced }: {
  items: any[];
  onClose: () => void;
  onSynced: () => void;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [unmapped, setUnmapped] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const d = await fetch('/api/pos/products').then(r => r.json());
      setConnected(!!d.connected);
      setProducts(Array.isArray(d.products) ? d.products : []);
      setRecipes(Array.isArray(d.recipes) ? d.recipes : []);
      setUnmapped(Array.isArray(d.unmapped) ? d.unmapped : []);
      if (d.error) setErr(d.error);
    } catch { setErr('Načtení se nepodařilo.'); setConnected(false); }
  };
  useEffect(() => { load(); }, []);

  const recipeByProduct = useMemo(() => new Map(recipes.map((r: any) => [r.productId, r])), [recipes]);
  const itemById = useMemo(() => new Map(items.map((i: any) => [String(i.id), i])), [items]);

  const q = search.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return [];
    return products
      .filter(p => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q))
      .slice(0, 20);
  }, [products, q]);

  const openEditor = (productId: string, productName: string) => {
    const r = recipeByProduct.get(productId);
    setErr('');
    setDraft({
      productId, productName,
      existing: !!r,
      ingredients: r
        ? r.ingredients.map((ing: any) => ({ itemId: String(ing.itemId), amount: String(ing.amount) }))
        : [{ itemId: '', amount: '1' }],
    });
  };

  const saveDraft = async (ingredients: { itemId: string; amount: string }[]) => {
    if (!draft) return;
    setSaving(true); setErr('');
    const res = await fetch('/api/pos/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: draft.productId, productName: draft.productName,
        ingredients: ingredients
          .filter(ing => ing.itemId !== '')
          .map(ing => ({ itemId: parseInt(ing.itemId), amount: Number(String(ing.amount).replace(',', '.')) || 1 })),
      }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) { setDraft(null); await load(); }
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Uložení se nepodařilo.'); }
  };

  const sync = async () => {
    setSyncing(true); setSyncMsg(''); setErr('');
    const res = await fetch('/api/pos/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    }).catch(() => null);
    setSyncing(false);
    if (!res?.ok) { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Synchronizace selhala.'); return; }
    const d = await res.json();
    if (d.throttled) { setSyncMsg('Synchronizace běžela před chvílí — zkus to za pár minut.'); return; }
    const ded = (d.deducted ?? []).map((x: any) => `${x.name} −${x.amount}`).join(', ');
    setSyncMsg(`Zpracováno ${d.processed ?? 0} účtenek.${ded ? ` Odepsáno: ${ded}.` : ' Žádné prodeje s recepturou.'}`);
    onSynced();
    await load();
  };

  const recipeSummary = (r: any) =>
    r.ingredients.map((ing: any) => `${ing.amount} ${ing.itemUnit ?? ''} ${ing.itemName ?? '?'}`.trim()).join(' + ');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center modal-overlay p-4" onClick={onClose}>
      <div className="modal-sheet rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-lg font-bold tracking-tight text-[#16181A]">💳 Receptury pokladny</h3>
          <button onClick={onClose} className="rounded-full w-9 h-9 flex items-center justify-center glass text-black/50 hover:text-black">✕</button>
        </div>
        <p className="text-sm text-black/45 mb-4">
          U každého produktu z pokladny urči, kolik čeho ze skladu zmizí za jeden prodej —
          třeba sklenka vína = 150 ml z lahve, svařák = víno + koření. Prodeje se pak odepisují samy
          (u balených položek nejdřív z otevřeného balení).
        </p>

        {connected === false && <p className="text-sm text-amber-700 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3">Pokladna není připojená — Nastavení → Pokladna.</p>}
        {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
        {syncMsg && <p className="text-sm text-[#5B7A08] bg-[#C8F542]/10 border border-[#C8F542]/25 rounded-2xl px-4 py-2.5 mb-3">{syncMsg}</p>}

        {connected && !draft && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button onClick={sync} disabled={syncing}
                className="rounded-full bg-[#16181A] text-white px-5 py-2.5 text-sm font-bold hover:bg-black disabled:opacity-50 transition">
                {syncing ? 'Synchronizuji…' : '🔄 Odepsat dnešní prodeje'}
              </button>
              <span className="text-xs text-black/40">Bere účtenky ze včerejška a dneška; každou jen jednou. Večer to proběhne i samo.</span>
            </div>

            {unmapped.length > 0 && (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 mb-4">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-2">Prodává se, ale neodepisuje se</p>
                <div className="space-y-1.5">
                  {unmapped.map((u: any) => (
                    <button key={u.productId} onClick={() => openEditor(u.productId, u.productName ?? u.productId)}
                      className="w-full flex items-center gap-2 rounded-xl bg-white/60 hover:bg-white px-3 py-2 text-left transition">
                      <span className="text-sm font-semibold text-[#16181A] truncate flex-1">{u.productName ?? u.productId}</span>
                      <span className="text-[11px] font-bold text-amber-700 tabular-nums shrink-0">{Number(u.soldCount) || 0}× prodáno</span>
                      <span className="text-xs font-bold text-[#5B7A08] shrink-0">+ receptura</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Hledat v ${products.length} produktech pokladny…`}
              className={`${inputClass} w-full mb-3`} />

            {q ? (
              <div className="space-y-2">
                {searchResults.length === 0 && <p className="text-sm text-black/40 text-center py-6">Nic nenalezeno.</p>}
                {searchResults.map(p => {
                  const r = recipeByProduct.get(p.productId);
                  return (
                    <button key={p.productId} onClick={() => openEditor(p.productId, p.name)}
                      className="w-full rounded-2xl border border-black/[0.06] bg-white/50 hover:bg-white px-4 py-3 text-left transition">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#16181A] truncate">{p.name}</p>
                          <p className="text-[11px] text-black/40 truncate">
                            {r ? recipeSummary(r) : (p.category || 'bez kategorie')}
                          </p>
                        </div>
                        <span className={`text-xs font-bold shrink-0 ${r ? 'text-black/40' : 'text-[#5B7A08]'}`}>
                          {r ? 'Upravit' : '+ receptura'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {recipes.length === 0 && unmapped.length === 0 && (
                  <p className="text-sm text-black/40 text-center py-6">
                    Zatím žádné receptury. Klikni na „Odepsat dnešní prodeje" — appka ti sama ukáže, co se prodává,
                    nebo produkt vyhledej nahoře.
                  </p>
                )}
                {recipes.map((r: any) => (
                  <button key={r.productId} onClick={() => openEditor(r.productId, r.productName ?? r.productId)}
                    className="w-full rounded-2xl border border-black/[0.06] bg-white/50 hover:bg-white px-4 py-3 text-left transition">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#16181A] truncate">{r.productName ?? r.productId}</p>
                        <p className="text-[11px] text-black/40 truncate">{recipeSummary(r)}</p>
                      </div>
                      <span className="text-xs font-bold text-black/40 shrink-0">Upravit</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {connected && draft && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setDraft(null)} className="rounded-full glass px-3.5 py-2 text-xs font-bold text-black/60 hover:text-black">← Zpět</button>
              <p className="text-sm font-bold text-[#16181A] truncate">{draft.productName}</p>
            </div>
            <p className="text-xs text-black/45 mb-3">Co všechno se odepíše za jeden prodej:</p>

            <div className="space-y-2 mb-3">
              {draft.ingredients.map((ing, idx) => {
                const item = itemById.get(ing.itemId);
                return (
                  <div key={idx} className="rounded-2xl border border-black/[0.06] bg-white/50 px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={ing.itemId}
                        onChange={e => setDraft(d => d && ({ ...d, ingredients: d.ingredients.map((x, i) => i === idx ? { ...x, itemId: e.target.value } : x) }))}
                        className={`${inputClass} flex-1 min-w-[10rem]`}>
                        <option value="">— vyber položku skladu —</option>
                        {items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                      <input inputMode="decimal" value={ing.amount}
                        onChange={e => setDraft(d => d && ({ ...d, ingredients: d.ingredients.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x) }))}
                        className={`${inputClass} w-24 text-right tabular-nums`} />
                      <span className="text-xs text-black/45 w-10">{item?.contentUnit ?? item?.unit ?? ''}</span>
                      <button onClick={() => setDraft(d => d && ({ ...d, ingredients: d.ingredients.filter((_, i) => i !== idx) }))}
                        className="rounded-full w-8 h-8 flex items-center justify-center text-black/35 hover:text-red-600 transition" title="Odebrat ingredienci">✕</button>
                    </div>
                    {item?.packageSize != null && (
                      <p className="text-[11px] text-black/35 mt-1.5">
                        Balení {item.packageSize} {item.contentUnit ?? item.unit ?? ''} — odepisuje se nejdřív z načatého balení.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {draft.ingredients.length < 12 && (
              <button onClick={() => setDraft(d => d && ({ ...d, ingredients: [...d.ingredients, { itemId: '', amount: '1' }] }))}
                className="rounded-full glass px-4 py-2 text-xs font-bold text-black/60 hover:text-black mb-4">
                + Přidat ingredienci
              </button>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => saveDraft(draft.ingredients)} disabled={saving || !draft.ingredients.some(i => i.itemId !== '')}
                className="rounded-full bg-[#C8F542] text-black px-5 py-2.5 text-sm font-bold hover:brightness-110 disabled:opacity-40 transition">
                {saving ? 'Ukládám…' : 'Uložit recepturu'}
              </button>
              {draft.existing && (
                <button onClick={() => saveDraft([])} disabled={saving}
                  className="rounded-full px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-500/10 transition">
                  Smazat recepturu
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
