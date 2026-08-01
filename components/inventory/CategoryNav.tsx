'use client';

// Drilling through nested categories: a breadcrumb of where you are, plus a
// grid of buttons for what is one level further in. Used by the employer stock,
// the employee stock and the tablet, so the same taps work everywhere.

import { Icon } from '../Icons';
import { ancestryOf, childrenOf, childrenOfId, categoryScope, type CategoryNode } from '@/lib/categoryTree';

export interface CategoryNavProps<T extends CategoryNode> {
  categories: T[];
  /** null = the top level ("Vše"). */
  current: string | null;
  onNavigate: (name: string | null) => void;
  /** Item count for a category including everything nested under it. */
  countOf?: (name: string) => number;
  /** How many items in that branch need attention, shown as a warning badge. */
  alertOf?: (name: string) => number;
  /** Bigger targets for the tablet. */
  size?: 'normal' | 'touch';
  /** Label for the root level. */
  rootLabel?: string;
  /** Extra categories with no row of their own (item labels no longer configured). */
  extraRoots?: string[];
}

export default function CategoryNav<T extends CategoryNode>({
  categories, current, onNavigate, countOf, alertOf,
  size = 'normal', rootLabel = 'Vše', extraRoots = [],
}: CategoryNavProps<T>) {
  const trail = current ? ancestryOf(categories, current) : [];
  const level = current ? childrenOf(categories, current) : childrenOfId(categories, null);

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
            <button onClick={() => onNavigate(c.name)}
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
            const kids = childrenOf(categories, c.name).length;
            const count = countOf ? countOf(c.name) : null;
            const alerts = alertOf ? alertOf(c.name) : 0;
            return (
              <button key={c.id} onClick={() => onNavigate(c.name)}
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
            <button key={name} onClick={() => onNavigate(name)}
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
                <span className="block text-[11px] text-black/40">
                  {countOf ? <>{countOf(name)} {plural(countOf(name))}</> : 'bez kategorie'}
                </span>
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

/** Items filed under a category or anything nested below it. */
export function inScope<T extends CategoryNode, I extends { category: string }>(
  categories: T[], name: string | null, items: I[],
): I[] {
  if (name === null) return items;
  const scope = new Set(categoryScope(categories, name));
  return items.filter(i => scope.has(i.category));
}
