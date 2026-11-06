// Limetková lišta pokroku na SVĚTLÉ ploše (seznam na skle, lístek). Systémová ListaPostupu je
// pro inkoustovou kartu (krémová dráha); tady je dráha z jamky a limetka má tmavší hranu, ať se
// na bílé neztratí. Čísla stojí vedle lišty jako text, lišta sama je jen ozdoba (aria-hidden).

export default function PostupSvetly({ podil, className = '' }: { podil: number; className?: string }) {
  const p = Math.max(0, Math.min(1, Number.isFinite(podil) ? podil : 0));
  return (
    <span aria-hidden className={`block h-1.5 min-w-0 overflow-hidden rounded-full bg-[var(--hp-well)] shadow-[inset_0_0_0_1px_var(--hp-line)] ${className}`}>
      <span className="block h-full rounded-full bg-[var(--hp-lime)] shadow-[inset_0_0_0_1px_rgba(79,106,7,0.35)]" style={{ width: `${Math.round(p * 1000) / 10}%` }} />
    </span>
  );
}
