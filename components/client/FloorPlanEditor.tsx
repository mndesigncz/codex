'use client';

// Editor půdorysu. Vedení nakreslí zdi a plochy, nahraje podklad (vektor je
// lepší než fotka) a rozmístí stoly tak, jak v podniku opravdu stojí. Host
// pak při objednávce klepne na svůj stůl místo hádání názvů.
//
// Souřadnice jsou v procentech plátna, takže plánek drží na každé šířce.
// Kreslí se tahem myší nebo prstem; mřížka přichytává po dvou procentech,
// Alt ji vypne. Ukládá se ručně, aby se tažením nespouštěl zápis za zápisem.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button } from '../ui';
import { PlanCanvasContent, TableShape } from './TableMap';
import type { FloorPlan, MapTable, Shape } from '@/lib/floorplan';
import { EMPTY_PLAN, tableBox } from '@/lib/floorplan';

type Tool = 'select' | 'wall' | 'room' | 'label';
type Sel = { kind: 'shape'; id: string } | { kind: 'table'; id: number } | null;
/** Rozestavěný tvar může být jen zeď nebo plocha — popisek vzniká rovnou. */
type Draft = Extract<Shape, { type: 'wall' }> | Extract<Shape, { type: 'room' }>;

const TOOLS: { id: Tool; label: string; icon: string; hint: string }[] = [
  { id: 'select', label: 'Vybrat', icon: 'pin', hint: 'Klepni na prvek a táhni ho.' },
  { id: 'wall', label: 'Zeď', icon: 'pencil', hint: 'Táhni čáru tam, kde je zeď nebo bar.' },
  { id: 'room', label: 'Plocha', icon: 'box', hint: 'Táhni obdélník — zahrádka, salonek, tatami.' },
  { id: 'label', label: 'Popisek', icon: 'tag', hint: 'Klepni a napiš, co tam je.' },
];

const uid = () => Math.random().toString(36).slice(2, 10);
const snap = (v: number, on: boolean) => on ? Math.round(v / 2) * 2 : Math.round(v * 10) / 10;
const clamp = (v: number) => Math.max(0, Math.min(100, v));

export default function FloorPlanEditor({ toast, onSaved }: { toast: (m: string) => void; onSaved?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [tables, setTables] = useState<MapTable[]>([]);
  const [base, setBase] = useState('');           // otisk uloženého stavu
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<Sel>(null);
  const [grid, setGrid] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ mode: 'move' | 'resize' | 'draw'; ox: number; oy: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetch('/api/client/admin/floorplan').then(r => r.json());
      const p: FloorPlan = d.plan ?? EMPTY_PLAN;
      const t: MapTable[] = (d.tables ?? []).filter((x: any) => x.active);
      setPlan(p); setTables(t); setBase(JSON.stringify({ p, t }));
    } catch { setPlan(EMPTY_PLAN); setTables([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => plan !== null && base !== JSON.stringify({ p: plan, t: tables }), [plan, tables, base]);
  const placed = tables.filter(t => t.map_x != null && t.map_y != null);
  const unplaced = tables.filter(t => t.map_x == null || t.map_y == null);

  // Souřadnice ukazovátka v procentech plátna.
  const at = (e: { clientX: number; clientY: number }, snapOn: boolean) => {
    const r = box.current!.getBoundingClientRect();
    return { x: snap(clamp(((e.clientX - r.left) / r.width) * 100), snapOn), y: snap(clamp(((e.clientY - r.top) / r.height) * 100), snapOn) };
  };

  const patchShape = (id: string, fn: (s: any) => any) =>
    setPlan(p => p && ({ ...p, shapes: p.shapes.map(s => s.id === id ? fn({ ...s }) : s) }));
  const patchTable = (id: number, fn: (t: MapTable) => MapTable) =>
    setTables(ts => ts.map(t => t.id === id ? fn({ ...t }) : t));

  const onDown = (e: React.PointerEvent) => {
    if (!plan || e.button === 2) return;
    const snapOn = grid && !e.altKey;
    const p = at(e, snapOn);
    if (tool === 'select') { setSel(null); return; }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === 'label') {
      const text = prompt('Co tam je? (například „Bar", „Vchod", „Zahrádka")')?.trim();
      if (text) setPlan(x => x && ({ ...x, shapes: [...x.shapes, { id: uid(), type: 'label', x: p.x, y: p.y, text: text.slice(0, 40) }] }));
      setTool('select'); return;
    }
    const id = uid();
    setDraft(tool === 'wall'
      ? { id, type: 'wall' as const, x1: p.x, y1: p.y, x2: p.x, y2: p.y, t: 0.9 }
      : { id, type: 'room' as const, x: p.x, y: p.y, w: 0, h: 0 });
    drag.current = { mode: 'draw', ox: p.x, oy: p.y };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !plan) return;
    const snapOn = grid && !e.altKey;
    const p = at(e, snapOn);
    const d = drag.current;
    if (d.mode === 'draw' && draft) {
      if (draft.type === 'wall') setDraft({ ...draft, x2: p.x, y2: p.y });
      else setDraft({ ...draft, x: Math.min(d.ox, p.x), y: Math.min(d.oy, p.y), w: Math.abs(p.x - d.ox), h: Math.abs(p.y - d.oy) });
      return;
    }
    if (!sel) return;
    if (d.mode === 'move') {
      if (sel.kind === 'table') patchTable(sel.id, t => ({ ...t, map_x: p.x, map_y: p.y }));
      else patchShape(sel.id, s => s.type === 'wall'
        ? { ...s, x1: p.x - d.ox, y1: p.y - d.oy, x2: p.x - d.ox + (s.x2 - s.x1), y2: p.y - d.oy + (s.y2 - s.y1) }
        : { ...s, x: p.x - d.ox, y: p.y - d.oy });
    } else if (d.mode === 'resize') {
      if (sel.kind === 'table') patchTable(sel.id, t => ({ ...t, map_w: Math.max(3, Math.abs(p.x - (Number(t.map_x) || 0)) * 2), map_h: Math.max(3, Math.abs(p.y - (Number(t.map_y) || 0)) * 2) }));
      else patchShape(sel.id, s => s.type === 'wall' ? { ...s, x2: p.x, y2: p.y } : { ...s, w: Math.max(2, p.x - s.x), h: Math.max(2, p.y - s.y) });
    }
  };

  const onUp = () => {
    if (draft && plan) {
      const big = draft.type === 'wall'
        ? Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 2
        : draft.w > 3 && draft.h > 3;
      const ready: Draft = draft;
      if (big) { setPlan(p => p && ({ ...p, shapes: [...p.shapes, ready] })); setSel({ kind: 'shape', id: ready.id }); setTool('select'); }
      setDraft(null);
    }
    drag.current = null;
  };

  const grab = (e: React.PointerEvent, s: Sel, mode: 'move' | 'resize') => {
    if (tool !== 'select' || !s) return;
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSel(s);
    const p = at(e, false);
    let ox = 0, oy = 0;
    if (mode === 'move') {
      if (s.kind === 'table') { const t = tables.find(x => x.id === s.id)!; ox = p.x - Number(t.map_x); oy = p.y - Number(t.map_y); }
      else { const sh: any = plan!.shapes.find(x => x.id === s.id)!; ox = p.x - (sh.type === 'wall' ? sh.x1 : sh.x); oy = p.y - (sh.type === 'wall' ? sh.y1 : sh.y); }
    }
    drag.current = { mode, ox, oy };
  };

  const removeSel = useCallback(() => {
    if (!sel) return;
    if (sel.kind === 'shape') setPlan(p => p && ({ ...p, shapes: p.shapes.filter(s => s.id !== sel.id) }));
    else patchTable(sel.id, t => ({ ...t, map_x: null, map_y: null }));
    setSel(null);
  }, [sel]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSel(); }
      if (e.key === 'Escape') { setSel(null); setDraft(null); setTool('select'); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [sel, removeSel]);

  const upload = async (f: File) => {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch('/api/client/admin/floorplan', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Nahrání se nepovedlo.');
      setPlan(p => p && ({ ...p, bg: d.bg, ratio: d.ratio ?? p.ratio }));
      toast(d.bg?.svg ? 'Podklad nahraný. Vektor drží ostrost v každé velikosti.' : 'Podklad nahraný.');
    } catch (e: any) { toast(e.message); }
    setBusy(false);
  };

  const save = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await fetch('/api/client/admin/floorplan', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, tables: tables.map(t => ({ id: t.id, map_x: t.map_x, map_y: t.map_y, map_w: t.map_w, map_h: t.map_h, map_shape: t.map_shape, map_rot: t.map_rot })) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Uložení se nepovedlo.');
      setBase(JSON.stringify({ p: plan, t: tables }));
      toast('Plánek uložen. Hosté ho uvidí při objednávce.');
      onSaved?.();
    } catch (e: any) { toast(e.message); }
    setBusy(false);
  };

  if (!plan) return <div className="glass-card p-5"><div className="h-64 rounded-2xl bg-black/[0.04] animate-pulse" /></div>;

  const selShape: any = sel?.kind === 'shape' ? plan.shapes.find(s => s.id === sel.id) : null;
  const selTable = sel?.kind === 'table' ? tables.find(t => t.id === sel.id) : null;
  const hint = TOOLS.find(t => t.id === tool)!.hint;

  return (
    <section className="glass-card p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold tracking-tight flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#C8F542]/15 border border-[#C8F542]/30 text-[#4F6A07]"><Icon name="location" size={15} /></span>
            Plánek podniku
          </h2>
          <p className="text-xs text-black/55 mt-1 max-w-[60ch]">Nakresli zdi a plochy, nebo nahraj půdorys ze souboru. Pak rozmísti stoly tak, jak stojí v podniku — host je pozná i bez znalosti názvů.</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-800">Neuloženo</span>}
          <Button size="sm" variant="accent" loading={busy} disabled={!dirty} onClick={save}>Uložit plánek</Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {TOOLS.map(t => (
          <button key={t.id} type="button" onClick={() => { setTool(t.id); setSel(null); }} aria-pressed={tool === t.id}
            className={`tap-target-sm inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${tool === t.id ? 'bg-[#16181A] text-white' : 'bg-black/[0.05] text-black/65 hover:bg-black/[0.09]'}`}>
            <Icon name={t.icon} size={13} />{t.label}
          </button>
        ))}
        <span className="w-px h-5 bg-black/10 mx-1" />
        <button type="button" onClick={() => setGrid(v => !v)} aria-pressed={grid}
          className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold transition ${grid ? 'bg-[#C8F542]/25 text-[#3E5406]' : 'bg-black/[0.05] text-black/55'}`}>Mřížka</button>
        <button type="button" onClick={() => fileRef.current?.click()}
          className="tap-target-sm inline-flex items-center gap-1.5 rounded-full bg-black/[0.05] px-3 py-1.5 text-xs font-semibold text-black/65 hover:bg-black/[0.09] transition"><Icon name="upload" size={13} />Podklad</button>
        <input ref={fileRef} type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        {plan.bg && (
          <>
            <label className="inline-flex items-center gap-1.5 text-xs text-black/55">Sytost
              <input type="range" min={5} max={100} value={Math.round(plan.bgOpacity * 100)} aria-label="Sytost podkladu"
                onChange={e => setPlan(p => p && ({ ...p, bgOpacity: Number(e.target.value) / 100 }))} className="w-20 accent-[#16181A]" /></label>
            <button type="button" onClick={() => setPlan(p => p && ({ ...p, bg: null }))}
              className="tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold text-black/55 hover:text-red-700 hover:bg-red-500/10 transition">Odebrat podklad</button>
          </>
        )}
      </div>

      {unplaced.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-black/50">Mimo plánek:</span>
          {unplaced.map(t => (
            <button key={t.id} type="button" onClick={() => { patchTable(t.id, x => ({ ...x, map_x: 50, map_y: 50 })); setSel({ kind: 'table', id: t.id }); setTool('select'); }}
              className="tap-target-sm rounded-full bg-black/[0.05] hover:bg-black/[0.09] px-3 py-1.5 text-xs font-semibold transition">+ {t.name}</button>
          ))}
        </div>
      )}

      <div ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        className={`relative w-full rounded-3xl border border-black/[0.08] bg-white/60 overflow-hidden touch-none select-none ${tool === 'select' ? '' : 'cursor-crosshair'}`}
        style={{ aspectRatio: String(plan.ratio), backgroundImage: grid ? 'radial-gradient(rgba(22,24,26,0.07) 1px, transparent 1px)' : undefined, backgroundSize: '18px 18px' }}>
        <PlanCanvasContent plan={plan} />

        {/* rozestavěný tvar */}
        {draft && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden>
            {draft.type === 'wall' ? (
              <line x1={draft.x1} y1={draft.y1} x2={draft.x2} y2={draft.y2} stroke="#4F6A07" strokeWidth={draft.t} strokeLinecap="round" strokeDasharray="2 1.5" />
            ) : (
              <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h} fill="rgba(200,245,66,0.18)" stroke="#4F6A07" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
            )}
          </svg>
        )}

        {/* úchyty tvarů */}
        {plan.shapes.map(s => {
          const on = sel?.kind === 'shape' && sel.id === s.id;
          if (s.type === 'wall') {
            const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
            return (
              <span key={s.id}>
                <button type="button" aria-label="Zeď — posunout" onPointerDown={e => grab(e, { kind: 'shape', id: s.id }, 'move')}
                  className={`tap-target-sm absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full transition ${on ? 'bg-[#16181A]/90 ring-2 ring-[#C8F542]' : 'bg-transparent hover:bg-black/10'}`}
                  style={{ left: `${mx}%`, top: `${my}%` }} />
                {on && <button type="button" aria-label="Zeď — konec" onPointerDown={e => grab(e, { kind: 'shape', id: s.id }, 'resize')}
                  className="tap-target-sm absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-[#16181A] shadow" style={{ left: `${s.x2}%`, top: `${s.y2}%` }} />}
              </span>
            );
          }
          if (s.type === 'room') return (
            <span key={s.id}>
              <button type="button" aria-label={`Plocha ${s.label ?? ''} — posunout`} onPointerDown={e => grab(e, { kind: 'shape', id: s.id }, 'move')}
                onDoubleClick={() => { const v = prompt('Název plochy', s.label ?? '')?.trim(); patchShape(s.id, x => ({ ...x, label: v ? v.slice(0, 40) : undefined })); }}
                className={`absolute transition ${on ? 'ring-2 ring-[#C8F542] bg-[#C8F542]/10' : 'hover:bg-black/[0.04]'}`}
                style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }} />
              {on && <button type="button" aria-label="Plocha — velikost" onPointerDown={e => grab(e, { kind: 'shape', id: s.id }, 'resize')}
                className="tap-target-sm absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-[#16181A] shadow" style={{ left: `${s.x + s.w}%`, top: `${s.y + s.h}%` }} />}
            </span>
          );
          return (
            <button key={s.id} type="button" aria-label={`Popisek ${s.text}`} onPointerDown={e => grab(e, { kind: 'shape', id: s.id }, 'move')}
              className={`tap-target-sm absolute h-7 -translate-x-1/2 -translate-y-1/2 rounded-lg px-2 transition ${on ? 'ring-2 ring-[#C8F542]' : 'hover:bg-black/[0.05]'}`}
              style={{ left: `${s.x}%`, top: `${s.y}%`, minWidth: '2rem' }} />
          );
        })}

        {/* stoly */}
        {placed.map(t => {
          const on = sel?.kind === 'table' && sel.id === t.id;
          const b = tableBox(t);
          return (
            <span key={t.id}>
              <TableShape t={t} selected={on}
                hit={{ 'aria-label': `Stůl ${t.name} — posunout`, tabIndex: 0, onPointerDown: e => grab(e, { kind: 'table', id: t.id }, 'move') }} />
              {on && (
                <>
                  <button type="button" aria-label={`Stůl ${t.name} — velikost`} onPointerDown={e => grab(e, { kind: 'table', id: t.id }, 'resize')}
                    className="tap-target-sm absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-[#16181A] shadow z-20"
                    style={{ left: `${Number(t.map_x) + b.w / 2}%`, top: `${Number(t.map_y) + b.h / 2}%` }} />
                  <button type="button" aria-label={`Stůl ${t.name} — otočit`} onClick={() => patchTable(t.id, x => ({ ...x, map_rot: ((Number(x.map_rot) || 0) + 45) % 360 }))}
                    className="tap-target-sm absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 grid place-items-center rounded-full bg-[#16181A] text-white shadow z-20"
                    style={{ left: `${Number(t.map_x) + b.w / 2}%`, top: `${Number(t.map_y) - b.h / 2}%` }}><Icon name="refresh" size={12} /></button>
                </>
              )}
            </span>
          );
        })}

        {placed.length === 0 && plan.shapes.length === 0 && !plan.bg && (
          <p className="absolute inset-0 grid place-items-center text-sm text-black/40 px-6 text-center pointer-events-none">Vyber nástroj a kresli, nebo nahraj podklad. Stoly přidáš tlačítky nad plánkem.</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-black/55">
        <p>{hint} {grid && 'Alt vypne přichytávání.'}</p>
        {sel && (
          <div className="flex items-center gap-2">
            {selTable && (
              <>
                <span className="font-semibold text-black/70">{selTable.name}</span>
                <button type="button" onClick={() => patchTable(selTable.id, t => ({ ...t, map_shape: tableBox(t).shape === 'circle' ? 'rect' : 'circle' }))}
                  className="tap-target-sm rounded-full bg-black/[0.05] px-3 py-1.5 font-semibold hover:bg-black/[0.09] transition">{tableBox(selTable).shape === 'circle' ? 'Na hranatý' : 'Na kulatý'}</button>
              </>
            )}
            {selShape?.type === 'room' && (
              <button type="button" onClick={() => { const v = prompt('Název plochy', selShape.label ?? '')?.trim(); patchShape(selShape.id, x => ({ ...x, label: v ? v.slice(0, 40) : undefined })); }}
                className="tap-target-sm rounded-full bg-black/[0.05] px-3 py-1.5 font-semibold hover:bg-black/[0.09] transition">Pojmenovat</button>
            )}
            {selShape?.type === 'wall' && (
              <label className="inline-flex items-center gap-1.5">Tloušťka
                <input type="range" min={3} max={40} value={Math.round(selShape.t * 10)} aria-label="Tloušťka zdi"
                  onChange={e => patchShape(selShape.id, x => ({ ...x, t: Number(e.target.value) / 10 }))} className="w-20 accent-[#16181A]" /></label>
            )}
            <button type="button" onClick={removeSel}
              className="tap-target-sm rounded-full px-3 py-1.5 font-semibold text-black/55 hover:text-red-700 hover:bg-red-500/10 transition">{sel.kind === 'table' ? 'Z plánku pryč' : 'Smazat'}</button>
          </div>
        )}
      </div>
    </section>
  );
}
