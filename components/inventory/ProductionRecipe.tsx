'use client';

// Výrobní receptura položky: „tuhle věc vyrábíme sami z těchhle surovin".
//
// Když je zapnutá, položka nechodí do nákupního seznamu. Místo toho při
// docházejícím stavu vznikne směně úkol „Vyrobit X" s recepturou a kontrolou
// surovin; co chybí, jde do nákupu jako surovina. Editor sedí v detailu
// položky vedle „Používá se v kase", protože je to druhá strana téže mince:
// tam se říká, co se z položky prodává, tady, z čeho se položka dělá.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';

export interface RecipeLine {
  ingredientId: number; name: string; amount: number; unit: string;
  available: number; need: number; missing: number;
}
export interface ProductionInfo {
  itemId: number; name: string; unit: string;
  madeInHouse: boolean; batchYield: number | null; batchSteps: string;
  productionLabel: string; taskTitle: string; status: string; batches: number;
  ingredients: RecipeLine[];
}
type Pickable = { id: number; name: string; unit: string; contentUnit?: string | null; packageSize?: number | null; category?: string };

const dec = (v: string) => Number(String(v).replace(',', '.')) || 0;
const fmt = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 3 });

export default function ProductionRecipe({ item, items, onSaved }: {
  item: { id: number; name: string; unit: string };
  /** Celý sklad pro výběr surovin (položka sama se nenabízí). */
  items: Pickable[];
  onSaved?: (info: ProductionInfo) => void;
}) {
  const [info, setInfo] = useState<ProductionInfo | null>(null);
  const [on, setOn] = useState(false);
  const [yieldStr, setYieldStr] = useState('');
  const [label, setLabel] = useState('');
  const [steps, setSteps] = useState('');
  const [lines, setLines] = useState<{ ingredientId: number; name: string; unit: string; amount: string }[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/inventory/${item.id}/production`).then(r => r.json()).then(d => {
      if (!alive || !d || d.error) return;
      setInfo(d);
      setOn(!!d.madeInHouse);
      setYieldStr(d.batchYield != null ? fmt(d.batchYield) : '');
      setLabel(d.productionLabel ?? '');
      setSteps(d.batchSteps ?? '');
      setLines((d.ingredients ?? []).map((l: RecipeLine) => ({ ingredientId: l.ingredientId, name: l.name, unit: l.unit, amount: fmt(l.amount) })));
    }).catch(() => {});
    return () => { alive = false; };
  }, [item.id]);

  const unitOf = (p: Pickable) => (Number(p.packageSize) > 0 ? (p.contentUnit ?? p.unit) : p.unit);
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const used = new Set(lines.map(l => l.ingredientId));
    return items.filter(p => p.id !== item.id && !used.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, items, lines, item.id]);

  const save = async (next?: { on?: boolean }) => {
    setBusy(true); setErr(''); setSaved(false);
    const madeInHouse = next?.on ?? on;
    try {
      const res = await fetch(`/api/inventory/${item.id}/production`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          madeInHouse,
          batchYield: dec(yieldStr) > 0 ? dec(yieldStr) : null,
          batchSteps: steps, productionLabel: label,
          ingredients: lines.map(l => ({ ingredientId: l.ingredientId, amount: dec(l.amount) })).filter(l => l.amount > 0),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Uložení se nepodařilo.'); setBusy(false); return; }
      setInfo(d); setSaved(true); onSaved?.(d);
      setTimeout(() => setSaved(false), 2000);
    } catch { setErr('Uložení se nepodařilo.'); }
    setBusy(false);
  };

  const toggle = async () => {
    const next = !on;
    setOn(next);
    await save({ on: next });
  };

  const availability = new Map((info?.ingredients ?? []).map(l => [l.ingredientId, l]));

  return (
    <div className="rounded-2xl bg-[#0A84FF]/[0.06] border border-[#0A84FF]/20 px-4 py-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#0A5CC0] flex items-center gap-1.5">
          <Icon name="leaf" size={13} /> Vyrábíme sami
        </p>
        <button type="button" role="switch" aria-checked={on} onClick={toggle} disabled={busy}
          className={`tap-target-sm relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${on ? 'bg-[#16181A]' : 'bg-black/15'}`}>
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {!on && (
        <p className="text-xs text-black/50">
          Zapni u limonády, ice tea, sirupu nebo pečiva, co si děláte sami. Místo nákupního
          seznamu pak při docházejícím stavu dostane směna úkol „vyrobit“ s recepturou.
        </p>
      )}

      {on && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label">Jedna dávka vyrobí</label>
              <div className="flex items-center gap-2">
                <input inputMode="decimal" value={yieldStr} onChange={e => setYieldStr(e.target.value)} onBlur={() => save()}
                  placeholder="5" className="field text-center" />
                <span className="text-sm text-black/50 shrink-0">{item.unit}</span>
              </div>
            </div>
            <div>
              <label className="field-label">Název úkolu pro směnu</label>
              <input value={label} onChange={e => setLabel(e.target.value)} onBlur={() => save()}
                placeholder={`Vyrobit ${item.name}`} className="field" />
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="field-label mb-0">Suroviny na jednu dávku</p>
            {lines.length === 0 && (
              <p className="text-xs text-black/45">Zatím bez surovin — úkol vznikne i tak, jen bez kontroly skladu.</p>
            )}
            {lines.map(l => {
              const a = availability.get(l.ingredientId);
              const short = a && a.missing > 0;
              return (
                <div key={l.ingredientId} className="flex items-center gap-2 rounded-2xl bg-white/70 border border-black/[0.06] pl-3.5 pr-2 py-1.5">
                  <span className="min-w-0 flex-1 text-sm text-[#16181A] truncate">
                    {l.name}
                    {a && <span className={`ml-1.5 text-[11px] ${short ? 'text-red-600' : 'text-black/40'}`}>ve skladu {fmt(a.available)} {a.unit}</span>}
                  </span>
                  <input value={l.amount} inputMode="decimal"
                    onChange={e => setLines(ls => ls.map(x => x.ingredientId === l.ingredientId ? { ...x, amount: e.target.value } : x))}
                    onBlur={() => save()}
                    aria-label={`Množství ${l.name}`}
                    className="tap-target-sm w-20 shrink-0 field !px-2.5 !py-1.5 text-xs text-right tabular-nums" />
                  <span className="shrink-0 text-[11px] text-black/40 w-8">{l.unit}</span>
                  <button type="button" aria-label={`Odebrat ${l.name}`} title="Odebrat z receptury"
                    onClick={() => { setLines(ls => ls.filter(x => x.ingredientId !== l.ingredientId)); setTimeout(() => save(), 0); }}
                    className="shrink-0 rounded-full w-7 h-7 flex items-center justify-center text-black/30 hover:text-red-600 transition">
                    <Icon name="close" size={13} />
                  </button>
                </div>
              );
            })}
            <div className="relative">
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Přidat surovinu ze skladu…" className="field !py-2 text-sm" />
              {found.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 card p-1 max-h-48 overflow-y-auto scrollbar-thin">
                  {found.map(p => (
                    <button key={p.id} type="button"
                      onClick={() => { setLines(ls => [...ls, { ingredientId: p.id, name: p.name, unit: unitOf(p), amount: '' }]); setQuery(''); }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-black/[0.04] transition">
                      <span className="block text-sm text-[#16181A] truncate">{p.name}</span>
                      <span className="block text-[11px] text-black/40 truncate">{p.category || 'bez kategorie'} · {unitOf(p)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="field-label">Postup (řádek = krok v úkolu)</label>
            <textarea value={steps} onChange={e => setSteps(e.target.value)} onBlur={() => save()} rows={3}
              placeholder={'Nakrájet citrony\nSvařit sirup s vodou\nNechat vychladnout a stočit'} className="field resize-none text-sm" />
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-black/45">
            <span>
              {info?.status && info.status !== 'ok'
                ? `Dochází — směna má úkol „${info.taskTitle}“ (${info.batches}× dávka).`
                : 'Když bude docházet, směna dostane úkol s touhle recepturou.'}
            </span>
            <span className={`shrink-0 ${saved ? 'text-[#5B7A08]' : ''}`}>{busy ? 'Ukládám…' : saved ? 'Uloženo ✓' : ''}</span>
          </div>
        </>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
