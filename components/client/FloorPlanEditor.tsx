'use client';

// Editor půdorysu. Vedení nakreslí zdi a plochy, nahraje podklad (vektor je
// lepší než fotka) a rozmístí stoly tak, jak v podniku opravdu stojí. Host
// pak při objednávce klepne na svůj stůl místo hádání názvů.
//
// Souřadnice jsou v procentech plátna, takže plánek drží na každé šířce.
// Kreslí se tahem myší nebo prstem; mřížka přichytává po dvou procentech,
// Alt ji vypne. Ukládá se ručně, aby se tažením nespouštěl zápis za zápisem.
//
// Kolo 69 (B8): karta s titulkem bez tónovaného kolečka a s rozbalením
// tlačítkem (stejně jako Vzhled QR vedle), nástroje jako Segmented, mřížka
// jako Switch, ostatní ovládání Button (dřív ručně psané pilulky 30 px
// a destruktivní „Smazat" jako šedý text), „Uložit plánek" tmavě (limetkou je
// „Přidat stůl"), kostra Skeleton, oba posuvníky v jedné barvě a popisek
// i název plochy v okně místo prompt(). Upravuje jen kdo má stoly.upravit.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Card, Field, Input, Modal, Segmented, Skeleton, Switch } from '../ui';
import { PlanCanvasContent, TableShape } from './TableMap';
import type { FloorPlan, MapTable, Shape } from '@/lib/floorplan';
import { EMPTY_PLAN, tableBox } from '@/lib/floorplan';
import { okJson } from '@/lib/api';

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

export default function FloorPlanEditor({ toast, onSaved, smiUpravit = true }: { toast: (m: string) => void; onSaved?: () => void; smiUpravit?: boolean }) {
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
  const [open, setOpen] = useState(false);
  const drag = useRef<{ mode: 'move' | 'resize' | 'draw'; ox: number; oy: number } | null>(null);
  // Okno pro text: nový popisek na souřadnicích, nebo název plochy.
  const [pojmenovat, setPojmenovat] = useState<{ druh: 'popisek'; x: number; y: number; text: string } | { druh: 'plocha'; id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetch('/api/client/admin/floorplan').then(okJson);
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
      setPojmenovat({ druh: 'popisek', x: p.x, y: p.y, text: '' });
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

  if (!plan) return <Card><Skeleton className="h-64" /></Card>;

  const selShape: any = sel?.kind === 'shape' ? plan.shapes.find(s => s.id === sel.id) : null;
  const selTable = sel?.kind === 'table' ? tables.find(t => t.id === sel.id) : null;
  const hint = TOOLS.find(t => t.id === tool)!.hint;

  // Kreslení půdorysu je nástroj, ke kterému se člověk vrací jednou za
  // čas — ne obsah, který má pod seznamem stolů viset pořád otevřený.
  // Sbalený vypadá stejně jako sousední „Vzhled QR na stůl".
  return (
    <Card className="space-y-3" aria-labelledby="h-planek">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 id="h-planek" className="t-card flex items-center gap-2"><Icon name="location" size={17} className="shrink-0 text-black/40" />Plánek podniku</h2>
          {open && <p className="t-meta mt-1 max-w-[60ch]">Nakresli zdi a plochy, nebo nahraj půdorys ze souboru. Pak rozmísti stoly tak, jak stojí v podniku — host je pozná i bez znalosti názvů.</p>}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {dirty && <span className="t-meta text-wait-ink">Neuloženo</span>}
          {open && smiUpravit && <Button size="sm" variant="primary" loading={busy} disabled={!dirty} onClick={save}>Uložit plánek</Button>}
          {smiUpravit && (
            <Button variant="ghost" size="sm" iconAfter="chevron" className={open ? '[&>svg:last-child]:rotate-180' : ''}
              aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Skrýt' : 'Upravit plánek'}</Button>
          )}
        </div>
      </div>
      {!open ? null : (<>

      <div className="flex items-center gap-2 flex-wrap">
        <Segmented size="sm" ariaLabel="Nástroj plánku" value={tool} onChange={v => { setTool(v); setSel(null); }}
          options={TOOLS.map(t => ({ id: t.id, label: t.label, icon: t.icon }))} />
        <span className="inline-flex items-center gap-2 text-sm text-black/65">
          <Switch checked={grid} onChange={setGrid} label="Mřížka" /><span aria-hidden>Mřížka</span>
        </span>
        <Button size="sm" variant="secondary" icon="upload" loading={busy} onClick={() => fileRef.current?.click()}>Podklad</Button>
        <input ref={fileRef} type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        {plan.bg && (
          <>
            <label className="inline-flex items-center gap-1.5 text-[13px] text-black/55">Sytost
              <input type="range" min={5} max={100} value={Math.round(plan.bgOpacity * 100)} aria-label="Sytost podkladu"
                onChange={e => setPlan(p => p && ({ ...p, bgOpacity: Number(e.target.value) / 100 }))} className="w-20 accent-[#8FB811]" /></label>
            <Button size="sm" variant="danger" onClick={() => setPlan(p => p && ({ ...p, bg: null }))}>Odebrat podklad</Button>
          </>
        )}
      </div>

      {unplaced.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="t-meta">Mimo plánek:</span>
          {unplaced.map(t => (
            <Button key={t.id} size="sm" variant="secondary" icon="plus" onClick={() => { patchTable(t.id, x => ({ ...x, map_x: 50, map_y: 50 })); setSel({ kind: 'table', id: t.id }); setTool('select'); }}>{t.name}</Button>
          ))}
        </div>
      )}

      <div ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        className={`relative w-full rounded-2xl border border-black/[0.08] bg-white/60 overflow-hidden select-none ${tool === 'select' ? 'touch-pan-y' : 'touch-none cursor-crosshair'}`}
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
                  className={`${on ? 'touch-none' : ''} tap-target-sm absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full transition ${on ? 'bg-[#16181A]/90 ring-2 ring-[#C8F542]' : 'bg-transparent hover:bg-black/10'}`}
                  style={{ left: `${mx}%`, top: `${my}%` }} />
                {on && <button type="button" aria-label="Zeď — konec" onPointerDown={e => grab(e, { kind: 'shape', id: s.id }, 'resize')}
                  className="touch-none tap-target-sm absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-[#16181A] shadow" style={{ left: `${s.x2}%`, top: `${s.y2}%` }} />}
              </span>
            );
          }
          if (s.type === 'room') return (
            <span key={s.id}>
              <button type="button" aria-label={`Plocha ${s.label ?? ''} — posunout`} onPointerDown={e => grab(e, { kind: 'shape', id: s.id }, 'move')}
                onDoubleClick={() => setPojmenovat({ druh: 'plocha', id: s.id, text: s.label ?? '' })}
                className={`${on ? 'touch-none ring-2 ring-[#C8F542] bg-[#C8F542]/10' : 'hover:bg-black/[0.04]'} absolute transition`}
                style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }} />
              {on && <button type="button" aria-label="Plocha — velikost" onPointerDown={e => grab(e, { kind: 'shape', id: s.id }, 'resize')}
                className="touch-none tap-target-sm absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-[#16181A] shadow" style={{ left: `${s.x + s.w}%`, top: `${s.y + s.h}%` }} />}
            </span>
          );
          return (
            <button key={s.id} type="button" aria-label={`Popisek ${s.text}`} onPointerDown={e => grab(e, { kind: 'shape', id: s.id }, 'move')}
              className={`${on ? 'touch-none ring-2 ring-[#C8F542]' : 'hover:bg-black/[0.05]'} tap-target-sm absolute h-7 -translate-x-1/2 -translate-y-1/2 rounded-xl px-2 transition`}
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
                    className="touch-none tap-target-sm absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-[#16181A] shadow z-20"
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

      <div className="flex items-center justify-between gap-3 flex-wrap text-[13px] text-black/55">
        <p>{hint} {grid && 'Alt vypne přichytávání.'}</p>
        {sel && (
          <div className="flex items-center gap-2">
            {selTable && (
              <>
                <span className="font-semibold text-black/70">{selTable.name}</span>
                <Button size="sm" variant="secondary" onClick={() => patchTable(selTable.id, t => ({ ...t, map_shape: tableBox(t).shape === 'circle' ? 'rect' : 'circle' }))}>{tableBox(selTable).shape === 'circle' ? 'Na hranatý' : 'Na kulatý'}</Button>
              </>
            )}
            {selShape?.type === 'room' && (
              <Button size="sm" variant="secondary" onClick={() => setPojmenovat({ druh: 'plocha', id: selShape.id, text: selShape.label ?? '' })}>Pojmenovat</Button>
            )}
            {selShape?.type === 'wall' && (
              <label className="inline-flex items-center gap-1.5">Tloušťka
                <input type="range" min={3} max={40} value={Math.round(selShape.t * 10)} aria-label="Tloušťka zdi"
                  onChange={e => patchShape(selShape.id, x => ({ ...x, t: Number(e.target.value) / 10 }))} className="w-20 accent-[#8FB811]" /></label>
            )}
            <Button size="sm" variant={sel.kind === 'table' ? 'secondary' : 'danger'} onClick={removeSel}>{sel.kind === 'table' ? 'Z plánku pryč' : 'Smazat'}</Button>
          </div>
        )}
      </div>
    </>)}
      {pojmenovat && (
        <Modal open onClose={() => setPojmenovat(null)} size="sm" title={pojmenovat.druh === 'popisek' ? 'Nový popisek' : 'Název plochy'}
          footer={<>
            <Button variant="secondary" onClick={() => setPojmenovat(null)}>Zrušit</Button>
            <Button type="submit" form="planek-text" variant="primary">{pojmenovat.druh === 'popisek' ? 'Přidat' : 'Uložit'}</Button>
          </>}>
          <form id="planek-text" onSubmit={e => {
            e.preventDefault();
            const text = pojmenovat.text.trim().slice(0, 40);
            if (pojmenovat.druh === 'popisek') {
              if (text) { const { x, y } = pojmenovat; setPlan(pl => pl && ({ ...pl, shapes: [...pl.shapes, { id: uid(), type: 'label', x, y, text }] })); }
            } else {
              const id = pojmenovat.id;
              patchShape(id, sh => ({ ...sh, label: text || undefined }));
            }
            setPojmenovat(null);
          }}>
            <Field id="planek-text-pole" label={pojmenovat.druh === 'popisek' ? 'Co tam je' : 'Název'} hint={pojmenovat.druh === 'popisek' ? 'Například Bar, Vchod, Zahrádka.' : 'Prázdné = bez názvu.'}>
              <Input id="planek-text-pole" autoFocus maxLength={40} value={pojmenovat.text} onChange={e => setPojmenovat({ ...pojmenovat, text: e.target.value })} />
            </Field>
          </form>
        </Modal>
      )}
    </Card>
  );
}