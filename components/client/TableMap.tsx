'use client';

// Plánek stolů podniku. Souřadnice jsou v procentech, velikost a tvar podle
// počtu míst — hosté neznají názvy stolů, ale „ten kulatý u okna" poznají.
// Bez rozmístěných stolů se nic nekreslí; plánek je doplněk, ne podmínka.

export interface MapTable { id: number; name: string; seats: number; map_x?: number | null; map_y?: number | null }

export function placedTables(tables: MapTable[] | null | undefined): MapTable[] {
  return (tables ?? []).filter(t => t.map_x != null && t.map_y != null);
}

export default function TableMap({ tables, selectedId, onPick, caption }: {
  tables: MapTable[]; selectedId?: number | null; onPick?: (id: number) => void; caption?: string;
}) {
  const placed = placedTables(tables);
  if (!placed.length) return null;
  return (
    <figure className="m-0">
      <div className="relative w-full aspect-[3/2] rounded-3xl border border-black/[0.08] bg-white/60 overflow-hidden"
        style={{ backgroundImage: 'radial-gradient(rgba(22,24,26,0.07) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        role={onPick ? 'radiogroup' : undefined} aria-label={onPick ? 'Vyber stůl na plánku' : 'Plánek stolů'}>
        {placed.map(t => {
          const sel = t.id === selectedId;
          // Pilulka s celým názvem — hosté stůl poznávají podle jména, ořez
          // by ho zabil. Větší stůl má hranatější a vyšší pilulku.
          const shape = t.seats >= 5 ? 'rounded-2xl px-3 py-2.5 text-xs' : 'rounded-full px-3 py-2 text-[11px]';
          const cls = `absolute -translate-x-1/2 -translate-y-1/2 inline-flex items-center whitespace-nowrap font-bold leading-none border transition ${shape} ${sel ? 'bg-[#16181A] text-[#C8F542] border-[#16181A] shadow-lg scale-110 z-10' : 'bg-white text-[#16181A] border-black/[0.12] shadow-sm'}`;
          return onPick ? (
            <button key={t.id} type="button" role="radio" aria-checked={sel} aria-label={`Stůl ${t.name} · ${t.seats} m.`}
              onClick={() => onPick(t.id)} style={{ left: `${t.map_x}%`, top: `${t.map_y}%` }}
              className={`${cls} hover:border-[#16181A]/40 active:scale-95`}>
              {t.name}
            </button>
          ) : (
            <div key={t.id} aria-hidden style={{ left: `${t.map_x}%`, top: `${t.map_y}%` }} className={cls}>
              {t.name}
            </div>
          );
        })}
      </div>
      {caption && <figcaption className="mt-1.5 text-xs text-black/50">{caption}</figcaption>}
    </figure>
  );
}
