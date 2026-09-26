'use client';

// Výrobní receptura položky: „tuhle věc vyrábíme sami z těchhle surovin".
//
// Když je zapnutá, položka nechodí do nákupního seznamu. Místo toho při
// docházejícím stavu vznikne směně úkol „Vyrobit X" s recepturou a kontrolou
// surovin; co chybí, jde do nákupu jako surovina. Editor sedí v detailu
// položky vedle „Používá se v kase", protože je to druhá strana téže mince:
// tam se říká, co se z položky prodává, tady, z čeho se položka dělá.
//
// Kolo 69 (B4): dřív modře tónovaný box s ručním štítkem verzálkami, ručním
// inkoustovým přepínačem a bílými boxy na surovinu. Teď neutrální Well
// s nadpisem t-card, sdílený Switch (limetka = stav), suroviny jako .list
// a popisky navázané na pole.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Input, Label, ListRow, Switch, Textarea, Well } from '../ui';
import { useResultKeys } from '@/lib/useResultKeys';
import { okJson } from '@/lib/api';
import { obsahuje } from '@/lib/hledani';
import ProductionGuideLink from './ProductionGuideLink';

export interface RecipeLine {
  ingredientId: number; name: string; amount: number; unit: string;
  available: number; need: number; missing: number;
}
export interface ProductionInfo {
  itemId: number; name: string; unit: string;
  madeInHouse: boolean; batchYield: number | null; batchSteps: string;
  productionLabel: string; taskTitle: string; status: string; batches: number;
  ingredients: RecipeLine[];
  /** Návod připnutý k téhle položce — z něj jdou kroky do úkolu „Vyrobit X“. */
  guideId?: number | null; guideTitle?: string | null; guideSteps?: number;
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
  const ingInput = useRef<HTMLInputElement>(null);
  const ingList = useRef<HTMLDivElement>(null);
  const ingKeys = useResultKeys(ingList, ingInput, { onEscape: () => setQuery('') });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  const nacti = useCallback((alive: () => boolean, jenNavod = false) => {
    return fetch(`/api/inventory/${item.id}/production`).then(okJson).then(d => {
      if (!alive() || !d || d.error) return;
      setInfo(d);
      // Po změně vazby na návod se přepisuje jen `info` — rozepsané pole
      // s postupem nebo výtěžností by se jinak přetáhlo zpátky na to, co je
      // na serveru, a člověk by přišel o to, co právě napsal.
      if (jenNavod) return;
      setOn(!!d.madeInHouse);
      setYieldStr(d.batchYield != null ? fmt(d.batchYield) : '');
      setLabel(d.productionLabel ?? '');
      setSteps(d.batchSteps ?? '');
      setLines((d.ingredients ?? []).map((l: RecipeLine) => ({ ingredientId: l.ingredientId, name: l.name, unit: l.unit, amount: fmt(l.amount) })));
    }).catch(() => {});
  }, [item.id]);

  useEffect(() => {
    let alive = true;
    nacti(() => alive);
    return () => { alive = false; };
  }, [nacti]);

  const nactiZnovu = () => { nacti(() => true, true); };
  const maNavodSKroky = !!info?.guideId && (info.guideSteps ?? 0) > 0;

  const unitOf = (p: Pickable) => (Number(p.packageSize) > 0 ? (p.contentUnit ?? p.unit) : p.unit);
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const used = new Set(lines.map(l => l.ingredientId));
    return items.filter(p => p.id !== item.id && !used.has(p.id) && obsahuje(p.name, q)).slice(0, 8);
  }, [query, items, lines, item.id]);

  const uid = useId();

  /** `radky` = aktuální suroviny, když se mění zároveň s uložením (odebrání):
   *  stav Reactu v tomhle tiku ještě neplatí a dřív přes setTimeout odešly
   *  staré suroviny — odebraná surovina se po obnovení vrátila. */
  const save = async (next?: { on?: boolean; radky?: typeof lines }) => {
    setBusy(true); setErr(''); setSaved(false);
    const madeInHouse = next?.on ?? on;
    const radky = next?.radky ?? lines;
    try {
      const res = await fetch(`/api/inventory/${item.id}/production`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          madeInHouse,
          batchYield: dec(yieldStr) > 0 ? dec(yieldStr) : null,
          batchSteps: steps, productionLabel: label,
          ingredients: radky.map(l => ({ ingredientId: l.ingredientId, amount: dec(l.amount) })).filter(l => l.amount > 0),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Uložení se nepodařilo.'); setBusy(false); return; }
      setInfo(d); setSaved(true); onSaved?.(d);
      setTimeout(() => setSaved(false), 2000);
    } catch { setErr('Uložení se nepodařilo.'); }
    setBusy(false);
  };

  const toggle = async (next: boolean) => {
    setOn(next);
    await save({ on: next });
  };

  const availability = new Map((info?.ingredients ?? []).map(l => [l.ingredientId, l]));

  return (
    <Well className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${uid}-t`} className="t-card flex items-center gap-2">
          <Icon name="leaf" size={17} className="shrink-0 text-black/40" /> Vyrábíme sami
        </h3>
        <Switch checked={on} onChange={toggle} disabled={busy} labelledBy={`${uid}-t`} />
      </div>

      {!on && (
        <p className="t-meta">
          Zapni u limonády, ice tea, sirupu nebo pečiva, co si děláte sami. Místo nákupního
          seznamu pak při docházejícím stavu dostane směna úkol „vyrobit“ s recepturou.
        </p>
      )}

      {on && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`${uid}-davka`}>Jedna dávka vyrobí</Label>
              <div className="flex items-center gap-2">
                <Input id={`${uid}-davka`} inputMode="decimal" value={yieldStr} onChange={e => setYieldStr(e.target.value)} onBlur={() => save()}
                  placeholder="5" className="text-center" />
                <span className="text-sm text-black/55 shrink-0">{item.unit}</span>
              </div>
            </div>
            <div>
              <Label htmlFor={`${uid}-ukol`}>Název úkolu pro směnu</Label>
              <Input id={`${uid}-ukol`} value={label} onChange={e => setLabel(e.target.value)} onBlur={() => save()}
                placeholder={`Vyrobit ${item.name}`} />
            </div>
          </div>

          <div className="space-y-1.5">
            <p id={`${uid}-sur`} className="t-label">Suroviny na jednu dávku</p>
            {lines.length === 0 && (
              <p className="t-meta">Zatím bez surovin — úkol vznikne i tak, jen bez kontroly skladu.</p>
            )}
            {lines.length > 0 && (
              <ul className="list" aria-labelledby={`${uid}-sur`}>
                {lines.map(l => {
                  const a = availability.get(l.ingredientId);
                  const short = a && a.missing > 0;
                  return (
                    <ListRow key={l.ingredientId} title={l.name}
                      meta={a ? <span className={short ? 'text-bad-ink' : undefined}>ve skladu {fmt(a.available)} {a.unit}</span> : undefined}
                      actions={<>
                        <Input value={l.amount} inputMode="decimal"
                          onChange={e => setLines(ls => ls.map(x => x.ingredientId === l.ingredientId ? { ...x, amount: e.target.value } : x))}
                          onBlur={() => save()}
                          aria-label={`Množství ${l.name} (${l.unit})`}
                          className="!w-20 text-right tabular-nums" />
                        <span className="text-[13px] text-black/55 w-8">{l.unit}</span>
                        <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={`Odebrat ${l.name}`}
                          onClick={() => { const radky = lines.filter(x => x.ingredientId !== l.ingredientId); setLines(radky); save({ radky }); }} />
                      </>} />
                  );
                })}
              </ul>
            )}
            <div className="relative">
              <Input ref={ingInput} value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={ingKeys.onInputKeyDown} aria-label="Přidat surovinu ze skladu"
                placeholder="Přidat surovinu ze skladu…" />
              {found.length > 0 && (
                <div ref={ingList} onKeyDown={ingKeys.onListKeyDown}
                  className="absolute z-10 left-0 right-0 mt-1 card p-1 shadow-[shadow:var(--shadow-float)] max-h-48 overflow-y-auto scrollbar-thin">
                  {found.map(p => (
                    <button key={p.id} type="button"
                      onClick={() => { setLines(ls => [...ls, { ingredientId: p.id, name: p.name, unit: unitOf(p), amount: '' }]); setQuery(''); }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-black/[0.04] transition-colors">
                      <span className="block text-sm text-[#16181A] truncate">{p.name}</span>
                      <span className="block text-[13px] text-black/55 truncate">{p.category || 'bez kategorie'} · {unitOf(p)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Návod bije text níž: má kategorii, schválení i potvrzení přečtení
              a je vidět i ze záložky Návody. Textové pole zůstává pro postupy,
              kolem kterých se návod psát nikomu nevyplatí. */}
          <ProductionGuideLink
            itemId={item.id} itemName={item.name}
            guideId={info?.guideId ?? null} guideTitle={info?.guideTitle ?? null}
            guideSteps={info?.guideSteps ?? 0}
            onChanged={nactiZnovu}
          />

          <div>
            <Label htmlFor={`${uid}-postup`}>
              {maNavodSKroky ? 'Postup (návod ho přebíjí)' : 'Postup (řádek = krok v úkolu)'}
            </Label>
            <Textarea id={`${uid}-postup`} value={steps} onChange={e => setSteps(e.target.value)} onBlur={() => save()} rows={3}
              placeholder={'Nakrájet citrony\nSvařit sirup s vodou\nNechat vychladnout a stočit'} className="text-sm" />
            {maNavodSKroky && (
              <p className="t-meta mt-1">
                Kroky do úkolu jdou z návodu „{info?.guideTitle}“. Tenhle text zůstane uložený,
                ale obsluha ho neuvidí — použije se, až vazbu na návod zrušíš.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 t-meta">
            <span>
              {info?.status && info.status !== 'ok'
                ? `Dochází — směna má úkol „${info.taskTitle}“ (${info.batches}× dávka).`
                : 'Když bude docházet, směna dostane úkol s touhle recepturou.'}
            </span>
            <span className="shrink-0 inline-flex items-center gap-1" aria-live="polite">
              {busy ? 'Ukládám…' : saved ? <><Icon name="check" size={13} className="text-ok-ink" /><span className="text-ok-ink">Uloženo</span></> : ''}
            </span>
          </div>
        </>
      )}
      {err && <p className="note note-danger" role="alert">{err}</p>}
    </Well>
  );
}
