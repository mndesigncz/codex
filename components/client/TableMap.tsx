'use client';

// Půdorys podniku pro hosta: podklad (nahraná kresba), zdi, plochy a stoly.
// Všechno v procentech plátna, takže plánek sedí na telefonu i na monitoru.
// Bez rozmístěných stolů a bez kresby se nevykreslí nic — plánek je doplněk.

import type { FloorPlan, MapTable } from '@/lib/floorplan';
import { placedTables, tableBox, planIsEmpty } from '@/lib/floorplan';

export type { MapTable };
export { placedTables };

/** Podklad, zdi a plochy — společné pro hosta i pro editor. */
export function PlanCanvasContent({ plan }: { plan?: FloorPlan | null }) {
  if (!plan) return null;
  return (
    <>
      {plan.bg && 'svg' in plan.bg && (
        <div className="absolute inset-0 [&_svg]:w-full [&_svg]:h-full" style={{ opacity: plan.bgOpacity }}
          aria-hidden dangerouslySetInnerHTML={{ __html: plan.bg.svg }} />
      )}
      {plan.bg && 'src' in plan.bg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={plan.bg.src} alt="" aria-hidden className="absolute inset-0 h-full w-full object-contain" style={{ opacity: plan.bgOpacity }} />
      )}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {plan.shapes.map(s => s.type === 'room' ? (
          <rect key={s.id} x={s.x} y={s.y} width={s.w} height={s.h} rx={0.8}
            fill="rgba(22,24,26,0.04)" stroke="rgba(22,24,26,0.14)" strokeWidth={0.25} vectorEffect="non-scaling-stroke" />
        ) : s.type === 'wall' ? (
          // Plátno se roztahuje (preserveAspectRatio="none"), takže tloušťka
          // v jednotkách plátna by se deformovala. Kreslí se proto v pixelech.
          <line key={s.id} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} vectorEffect="non-scaling-stroke"
            stroke="#16181A" strokeOpacity={0.75} strokeWidth={s.t * 4} strokeLinecap="round" />
        ) : null)}
      </svg>
      {plan.shapes.map(s => s.type === 'room' && s.label ? (
        <span key={s.id} className="absolute text-[11px] font-semibold uppercase tracking-wider text-black/45 pointer-events-none"
          style={{ left: `${s.x + s.w / 2}%`, top: `${s.y + 1}%`, transform: 'translateX(-50%)' }}>{s.label}</span>
      ) : s.type === 'label' ? (
        <span key={s.id} className="absolute text-[11px] font-medium text-black/55 pointer-events-none whitespace-nowrap"
          style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%, -50%)' }}>{s.text}</span>
      ) : null)}
    </>
  );
}

/**
 * Jeden stůl na plánku: tvar a pod ním název. Uvnitř by se „Tatami vlevo"
 * na malém stole ořízlo, pod stolem se přečte celý a s otočením tvaru se
 * netočí, takže zůstane vodorovný.
 */
export function TableShape({ t, selected, hit, label }: {
  t: MapTable; selected?: boolean;
  /** Když je stůl k vybrání nebo tažení, sedí obslužné vlastnosti na tvaru i na popisku. */
  hit?: React.HTMLAttributes<HTMLElement> & { role?: string; 'aria-checked'?: boolean; 'aria-label'?: string; tabIndex?: number };
  label?: string;
}) {
  const b = tableBox(t);
  const live = hit ? { ...hit, className: 'cursor-pointer' } : null;
  return (
    <>
      <span
        {...(live ?? {})}
        aria-hidden={live ? undefined : true}
        className={`absolute border transition ${b.shape === 'circle' ? 'rounded-full' : 'rounded-lg'} ${
          selected ? 'bg-[#16181A] border-[#16181A] shadow-lg z-10' : 'bg-white border-black/[0.16] shadow-sm'
        } ${live ? 'cursor-pointer' : ''}`}
        style={{
          left: `${t.map_x}%`, top: `${t.map_y}%`, width: `${b.w}%`, height: `${b.h}%`,
          transform: `translate(-50%, -50%) rotate(${b.rot}deg)${selected ? ' scale(1.06)' : ''}`,
        }}
      />
      <span
        onPointerDown={hit?.onPointerDown} onClick={hit?.onClick} aria-hidden
        className={`absolute text-[11px] font-semibold leading-none whitespace-nowrap px-1.5 py-0.5 rounded-md transition ${
          selected ? 'bg-[#16181A] text-[#C8F542] z-10' : 'bg-white/85 text-[#16181A]'
        } ${hit ? 'cursor-pointer' : ''}`}
        style={{ left: `${t.map_x}%`, top: `calc(${t.map_y}% + ${b.h / 2}%)`, transform: 'translate(-50%, 2px)' }}>
        {label ?? t.name}
      </span>
    </>
  );
}

export default function TableMap({ tables, plan, selectedId, onPick, caption }: {
  tables: MapTable[]; plan?: FloorPlan | null; selectedId?: number | null; onPick?: (id: number) => void; caption?: string;
}) {
  const placed = placedTables(tables);
  if (!placed.length && planIsEmpty(plan)) return null;
  const ratio = plan?.ratio && plan.ratio > 0 ? plan.ratio : 3 / 2;
  return (
    <figure className="m-0">
      <div className="relative w-full rounded-3xl border border-black/[0.08] bg-white/60 overflow-hidden"
        style={{ aspectRatio: String(ratio), backgroundImage: planIsEmpty(plan) ? 'radial-gradient(rgba(22,24,26,0.07) 1px, transparent 1px)' : undefined, backgroundSize: '18px 18px' }}
        role={onPick ? 'radiogroup' : undefined} aria-label={onPick ? 'Vyber stůl na plánku' : 'Plánek stolů'}>
        <PlanCanvasContent plan={plan} />
        {placed.map(t => (
          <TableShape key={t.id} t={t} selected={t.id === selectedId}
            hit={onPick ? { role: 'radio', 'aria-checked': t.id === selectedId, 'aria-label': `Stůl ${t.name} · ${t.seats} m.`, tabIndex: 0, onClick: () => onPick(t.id), onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(t.id); } } } : undefined} />
        ))}
      </div>
      {caption && <figcaption className="mt-1.5 text-xs text-black/50">{caption}</figcaption>}
    </figure>
  );
}
