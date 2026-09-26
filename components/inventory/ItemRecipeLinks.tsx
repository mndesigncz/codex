'use client';

// Druhá strana provázání: z otevřené skladové položky přiřadit, do kterých
// položek v kase patří a kolik jí na jednu porci jde.
//
// Dosud to šlo jen z Receptur — tedy „vyber produkt, pak najdi surovinu".
// Když ale někdo zakládá surovinu, přemýšlí opačně: „tohle je vodka, jde do
// Blue Lagoonu a do Espressa Martini". Tenhle panel to umí i tímhle směrem.
//
// Kolo 69 (B4): dřív limetkově tónovaný box s ručním štítkem verzálkami,
// bílými boxy na řádek a ručním „Přidat do receptury". Teď neutrální Well
// s nadpisem t-card, řádky .list, tlačítka z ui a cena v měně podniku
// (dřív natvrdo „Kč").

import { useEffect, useId, useRef, useState } from 'react';
import { useMoney } from '../CurrencyProvider';
import { Button, Input, Label, ListRow, Well } from '../ui';
import { useResultKeys } from '@/lib/useResultKeys';
import { okJson } from '@/lib/api';

type Link = { productId: string; productName: string | null; amount: number };
type Product = { productId: string; name: string; category?: string | null; price?: number | null };

const dec = (v: string) => Number(String(v).replace(',', '.')) || 0;
const fmt = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 3 });

export default function ItemRecipeLinks({ item, links, unitLabel, onChanged, onOpenRecipe }: {
  item: { id: number; name: string };
  links: Link[];
  /** Jednotka, ve které se surovina odepisuje — obsahová, když ji položka má. */
  unitLabel: string;
  onChanged: (next: Link[]) => void;
  onOpenRecipe?: (productId: string) => void;
}) {
  const money = useMoney();
  const uid = useId();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Product[]>([]);
  const [picked, setPicked] = useState<Product | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pickList = useRef<HTMLDivElement>(null);
  const keys = useResultKeys(pickList, searchRef, { onEscape: () => { setAdding(false); setQuery(''); setFound([]); } });

  // Menu má u větších podniků skoro tisíc položek — hledáme na serveru.
  useEffect(() => {
    if (!adding || picked) return;
    const q = query.trim();
    if (q.length < 2) { setFound([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const d = await fetch(`/api/pos/usage?q=${encodeURIComponent(q)}`).then(okJson);
        setFound(Array.isArray(d.products) ? d.products : []);
        if (d.error) setErr(d.error);
      } catch { setFound([]); }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, adding, picked]);

  const send = async (productId: string, productName: string | null, value: number) => {
    setBusy(productId); setErr('');
    try {
      const res = await fetch('/api/pos/usage', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, productName, itemId: item.id, amount: value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Uložení se nepodařilo.'); setBusy(''); return false; }
      const rest = links.filter(l => l.productId !== productId);
      onChanged(value > 0 ? [...rest, { productId, productName, amount: value }] : rest);
      setBusy('');
      return true;
    } catch { setErr('Uložení se nepodařilo.'); setBusy(''); return false; }
  };

  const confirmAdd = async () => {
    if (!picked) return;
    const v = dec(amount);
    if (!(v > 0)) { setErr('Kolik téhle suroviny jde na jednu porci?'); return; }
    if (await send(picked.productId, picked.name, v)) {
      // Picker zůstává otevřený. Jedna surovina jde typicky do několika
      // položek menu (mléko do latté, cappuccina, flat white) a zavírat
      // ho po každém přidání znamenalo pokaždé znovu hledat.
      // Stejně to dělá `ProductionRecipe` o dva soubory vedle.
      setPicked(null); setQuery(''); setAmount(''); setFound([]);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  };

  return (
    <Well className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="t-card">Používá se v kase{links.length > 0 ? ` (${links.length}×)` : ''}</h3>
        {!adding && (
          <Button variant="secondary" size="sm" icon="plus" onClick={() => { setAdding(true); setErr(''); }}>Přidat do receptury</Button>
        )}
      </div>

      {links.length === 0 && !adding && (
        <p className="t-meta">Zatím v žádné receptuře. Dokud tam nebude, prodej téhle suroviny sklad neodepíše.</p>
      )}

      {links.length > 0 && (
        <ul className="list">
          {links.map(l => (
            <ListRow key={l.productId} title={l.productName ?? l.productId}
              actions={<>
                <Input
                  defaultValue={fmt(l.amount)} inputMode="decimal" aria-label={`Množství na porci — ${l.productName ?? l.productId} (${unitLabel})`}
                  onBlur={e => {
                    const v = dec(e.target.value);
                    if (v > 0 && v !== l.amount) send(l.productId, l.productName, v);
                  }}
                  className="!w-20 text-right tabular-nums"
                />
                <span className="text-[13px] text-black/55 w-8">{unitLabel}</span>
                {onOpenRecipe && (
                  <Button variant="ghost" size="sm" iconOnly icon="clipboard" aria-label={`Otevřít recepturu ${l.productName ?? l.productId}`}
                    onClick={() => onOpenRecipe(l.productId)} />
                )}
                <Button variant="ghost" size="sm" iconOnly icon="close" disabled={busy === l.productId}
                  aria-label={`Odebrat z receptury ${l.productName ?? l.productId}`} onClick={() => send(l.productId, l.productName, 0)} />
              </>} />
          ))}
        </ul>
      )}

      {adding && (
        <div className="space-y-2">
          {picked ? (
            <>
              <p className="text-sm text-[#16181A]">
                <span className="font-semibold">{picked.name}</span>
                {picked.category ? <span className="text-black/55"> · {picked.category}</span> : null}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={`${uid}-porce`} className="!mb-0">Na jednu porci jde</Label>
                <Input id={`${uid}-porce`} autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAdd(); } }}
                  placeholder="0,04" className="!w-24 text-center" />
                <span className="text-[13px] text-black/55">{unitLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" loading={!!busy} onClick={confirmAdd}>Přidat</Button>
                <Button variant="ghost" size="sm" onClick={() => { setPicked(null); setAmount(''); }}>Zpět na hledání</Button>
              </div>
            </>
          ) : (
            <>
              <Input ref={searchRef} autoFocus value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={keys.onInputKeyDown} aria-label="Hledat položku v kase"
                placeholder="Hledat položku v kase…" />
              {query.trim().length >= 2 && found.length === 0 && (
                <p className="t-meta">Nic takového v menu není.</p>
              )}
              {found.length > 0 && (
                <div ref={pickList} onKeyDown={keys.onListKeyDown}
                  className="max-h-48 overflow-y-auto scrollbar-thin divide-y divide-black/[0.06]">
                  {found.map(p => (
                    <button key={p.productId} type="button" onClick={() => { setPicked(p); setErr(''); }}
                      className="w-full text-left px-1 py-2 hover:bg-black/[0.04] transition-colors">
                      <span className="block text-sm text-[#16181A] truncate">{p.name}</span>
                      <span className="block text-[13px] text-black/55 truncate">
                        {p.category || 'bez kategorie'}{p.price != null ? ` · ${money(p.price)}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setQuery(''); setFound([]); setErr(''); }}>Zrušit</Button>
            </>
          )}
        </div>
      )}

      {err && <p className="note note-danger" role="alert">{err}</p>}

      {links.length > 0 && (
        <p className="t-meta">Změna velikosti balení nebo ceny se propíše do marží těchhle položek.</p>
      )}
    </Well>
  );
}
