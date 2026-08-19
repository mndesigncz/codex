'use client';

// Map POS products to stock items and run the sales write-off. Once mapped,
// every sold pot of tea quietly leaves the stock on its own.

import { useEffect, useMemo, useState } from 'react';

const inputClass =
  'rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3.5 py-2.5 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none';

export default function PosMappingModal({ items, onClose, onSynced }: {
  items: any[];
  onClose: () => void;
  onSynced: () => void;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [draft, setDraft] = useState<Record<string, { itemId: string; amount: string }>>({});

  const load = async () => {
    try {
      const d = await fetch('/api/pos/products').then(r => r.json());
      setConnected(!!d.connected);
      setProducts(Array.isArray(d.products) ? d.products : []);
      setMappings(Array.isArray(d.mappings) ? d.mappings : []);
      if (d.error) setErr(d.error);
    } catch { setErr('Načtení se nepodařilo.'); setConnected(false); }
  };
  useEffect(() => { load(); }, []);

  const mapped = useMemo(() => new Map(mappings.map(m => [m.productId, m])), [mappings]);
  const q = search.trim().toLowerCase();
  const shown = useMemo(() => {
    const base = q
      ? products.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      : products.filter(p => mapped.has(p.productId));
    return base.slice(0, 30);
  }, [products, q, mapped]);

  const saveMap = async (p: any, itemId: string, amount: string) => {
    setErr('');
    const res = await fetch('/api/pos/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: p.productId, productName: p.name,
        itemId: itemId === '' ? null : parseInt(itemId),
        amountPerSale: Number(amount) || 1,
      }),
    }).catch(() => null);
    if (res?.ok) { setDraft(d => { const n = { ...d }; delete n[p.productId]; return n; }); await load(); }
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
    setSyncMsg(`Zpracováno ${d.processed ?? 0} účtenek.${ded ? ` Odepsáno: ${ded}.` : ' Žádné namapované prodeje.'}`);
    if ((d.unmapped ?? []).length) {
      setSyncMsg(m => m + ` Nenamapováno: ${d.unmapped.map((x: any) => `${x.name} (${x.count}×)`).join(', ')}.`);
    }
    onSynced();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center modal-overlay p-4" onClick={onClose}>
      <div className="modal-sheet rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-lg font-bold tracking-tight text-[#16181A]">💳 Prodeje z pokladny</h3>
          <button onClick={onClose} className="rounded-full w-9 h-9 flex items-center justify-center glass text-black/50 hover:text-black">✕</button>
        </div>
        <p className="text-sm text-black/45 mb-4">
          Namapuj produkty z pokladny na položky skladu — každý prodej se pak odepíše sám
          (u balených položek nejdřív z otevřeného balení). Nenamapované produkty se jen ignorují.
        </p>

        {connected === false && <p className="text-sm text-amber-700 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3">Pokladna není připojená — Nastavení → Pokladna.</p>}
        {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
        {syncMsg && <p className="text-sm text-[#5B7A08] bg-[#C8F542]/10 border border-[#C8F542]/25 rounded-2xl px-4 py-2.5 mb-3">{syncMsg}</p>}

        {connected && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button onClick={sync} disabled={syncing}
                className="rounded-full bg-[#16181A] text-white px-5 py-2.5 text-sm font-bold hover:bg-black disabled:opacity-50 transition">
                {syncing ? 'Synchronizuji…' : '🔄 Odepsat dnešní prodeje'}
              </button>
              <span className="text-xs text-black/40">Bere účtenky ze včerejška a dneška; každou jen jednou. Večer to proběhne i samo.</span>
            </div>

            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Hledat v ${products.length} produktech pokladny… (prázdné = jen namapované)`}
              className={`${inputClass} w-full mb-3`} />

            <div className="space-y-2">
              {shown.length === 0 && (
                <p className="text-sm text-black/40 text-center py-6">
                  {q ? 'Nic nenalezeno.' : 'Zatím žádné mapování — vyhledej produkt a přiřaď mu položku skladu.'}
                </p>
              )}
              {shown.map(p => {
                const m = mapped.get(p.productId);
                const d = draft[p.productId] ?? { itemId: m ? String(m.itemId) : '', amount: m ? String(m.amountPerSale) : '1' };
                const dirty = draft[p.productId] != null;
                return (
                  <div key={p.productId} className="rounded-2xl border border-black/[0.06] bg-white/50 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#16181A] truncate">{p.name}</p>
                        <p className="text-[11px] text-black/40 truncate">{p.category || 'bez kategorie'}{m ? ` · → ${m.itemName ?? '?'} (${m.amountPerSale} ${m.itemUnit ?? ''}/prodej)` : ''}</p>
                      </div>
                      <select value={d.itemId}
                        onChange={e => setDraft(dr => ({ ...dr, [p.productId]: { ...d, itemId: e.target.value } }))}
                        className={`${inputClass} w-44`}>
                        <option value="">— bez odpisu —</option>
                        {items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                      <input type="number" inputMode="decimal" min={0} step="0.1" value={d.amount}
                        onChange={e => setDraft(dr => ({ ...dr, [p.productId]: { ...d, amount: e.target.value } }))}
                        title="Kolik se odepíše za jeden prodej (v jednotce položky — např. gramy)"
                        className={`${inputClass} w-20 text-right tabular-nums`} />
                      <button onClick={() => saveMap(p, d.itemId, d.amount)} disabled={!dirty && !!m === (d.itemId !== '')}
                        className="rounded-full bg-[#C8F542] text-black px-4 py-2 text-xs font-bold hover:brightness-110 disabled:opacity-40 transition">
                        Uložit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
