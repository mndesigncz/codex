'use client';

// Drilling through nested categories: a breadcrumb of where you are, plus a
// grid of buttons for what is one level further in. Used by the employer stock,
// the employee stock and the tablet, so the same taps work everywhere.

import { Icon } from '../Icons';
import {
  ancestryOfId, childrenOfId, findById, scopeIds, type CategoryNode,
} from '@/lib/categoryTree';

export interface CategoryNavProps<T extends CategoryNode> {
  categories: T[];
  /** Category id, or null for the top level ("Vše"). Ids, not names — two
   *  branches may use the same name. */
  current: number | null;
  onNavigate: (id: number | null) => void;
  /** Item count for a category including everything nested under it. */
  countOf?: (id: number) => number;
  /** How many items in that branch need attention, shown as a warning badge. */
  alertOf?: (id: number) => number;
  /** Bigger targets for the tablet. */
  size?: 'normal' | 'touch';
  /** Label for the root level. */
  rootLabel?: string;
  /** Labels used by items whose category was deleted; they have no row to open. */
  extraRoots?: string[];
  onNavigateOrphan?: (name: string) => void;
}

export default function CategoryNav<T extends CategoryNode>({
  categories, current, onNavigate, countOf, alertOf,
  size = 'normal', rootLabel = 'Vše', extraRoots = [], onNavigateOrphan,
}: CategoryNavProps<T>) {
  const trail = ancestryOfId(categories, current);
  const level = childrenOfId(categories, current);

  const touch = size === 'touch';

  return (
    <div className="space-y-2.5">
      {/* Breadcrumb — every step back is one tap. */}
      <div className="flex items-center gap-1 flex-wrap text-sm">
        <button onClick={() => onNavigate(null)}
          className={`rounded-full font-medium transition ${touch ? 'px-4 py-2.5 min-h-[44px]' : 'px-3 py-1.5'} ${
            current === null ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'
          }`}>
          {rootLabel}
        </button>
        {trail.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1">
            <Icon name="chevron" size={13} className="text-black/20 -rotate-90 shrink-0" />
            <button onClick={() => onNavigate(c.id)}
              className={`rounded-full font-medium transition ${touch ? 'px-4 py-2.5 min-h-[44px]' : 'px-3 py-1.5'} ${
                i === trail.length - 1 ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'
              }`}>
              {c.name}
            </button>
          </span>
        ))}
      </div>

      {/* One level in. Only rendered when there is somewhere to go. */}
      {(level.length > 0 || (current === null && extraRoots.length > 0)) && (
        <div className={`grid gap-2 ${touch ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4'}`}>
          {level.map(c => {
            const kids = childrenOfId(categories, c.id).length;
            const count = countOf ? countOf(c.id) : null;
            const alerts = alertOf ? alertOf(c.id) : 0;
            return (
              <button key={c.id} onClick={() => onNavigate(c.id)}
                className={`glass-card flex items-center gap-2.5 text-left active:scale-[0.99] transition ${
                  touch ? 'p-4 min-h-[72px]' : 'p-3'
                }`}>
                <span className={`inline-flex shrink-0 items-center justify-center rounded-2xl bg-[#C8F542]/20 text-[#5B7A08] ${
                  touch ? 'h-11 w-11' : 'h-9 w-9'
                }`}>
                  <Icon name="box" size={touch ? 20 : 16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-bold text-[#16181A] truncate ${touch ? 'text-base' : 'text-sm'}`}>{c.name}</span>
                  <span className="block text-[11px] text-black/40 truncate">
                    {count !== null && <>{count} {plural(count)}</>}
                    {kids > 0 && <>{count !== null ? ' · ' : ''}{kids} podkat.</>}
                    {alerts > 0 && <span className="text-orange-600 font-semibold"> · {alerts} dochází</span>}
                  </span>
                </span>
                <Icon name="chevron" size={touch ? 18 : 15} className="text-black/25 -rotate-90 shrink-0" />
              </button>
            );
          })}
          {current === null && extraRoots.map(name => (
            <button key={name} onClick={() => onNavigateOrphan?.(name)}
              className={`glass-card flex items-center gap-2.5 text-left active:scale-[0.99] transition ${
                touch ? 'p-4 min-h-[72px]' : 'p-3'
              }`}>
              <span className={`inline-flex shrink-0 items-center justify-center rounded-2xl bg-black/[0.05] text-black/40 ${
                touch ? 'h-11 w-11' : 'h-9 w-9'
              }`}>
                <Icon name="box" size={touch ? 20 : 16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block font-bold text-[#16181A] truncate ${touch ? 'text-base' : 'text-sm'}`}>{name}</span>
                <span className="block text-[11px] text-black/40">Bez kategorie</span>
              </span>
              <Icon name="chevron" size={touch ? 18 : 15} className="text-black/25 -rotate-90 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function plural(n: number) {
  return n === 1 ? 'položka' : n >= 2 && n <= 4 ? 'položky' : 'položek';
}

/**
 * Items filed under a category or anything nested below it. Matching is by id;
 * an item that predates the id column falls back to its label so it stays
 * reachable until the migration backfills it.
 */
export function inScope<T extends CategoryNode, I extends { category: string; categoryId?: number | null }>(
  categories: T[], id: number | null, items: I[],
): I[] {
  if (id === null) return items;
  const ids = new Set(scopeIds(categories, id));
  const names = new Set(
    categories.filter(c => ids.has(c.id)).map(c => c.name),
  );
  return items.filter(i => (i.categoryId != null ? ids.has(i.categoryId) : names.has(i.category)));
}
