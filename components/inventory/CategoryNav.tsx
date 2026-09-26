'use client';

// Drilling through nested categories: a breadcrumb of where you are, plus a
// grid of buttons for what is one level further in. Used by the employer stock,
// the employee stock and the tablet, so the same taps work everywhere.

import { Icon } from '../Icons';
import { Chip } from '../ui';
import { czForm, POLOZKA } from '@/lib/czech';

const pluralPolozka = (n: number) => czForm(n, POLOZKA);
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
  /** Collapsed into a single scrollable row — for a toolbar that has gone sticky
   *  and must not eat the screen. */
  condensed?: boolean;
  /** Label for the root level. */
  rootLabel?: string;
  /** Labels used by items whose category was deleted; they have no row to open. */
  extraRoots?: string[];
  onNavigateOrphan?: (name: string) => void;
}

export default function CategoryNav<T extends CategoryNode>({
  categories, current, onNavigate, countOf, alertOf,
  size = 'normal', rootLabel = 'Vše', extraRoots = [], onNavigateOrphan, condensed = false,
}: CategoryNavProps<T>) {
  const trail = ancestryOfId(categories, current);
  const level = childrenOfId(categories, current);

  const touch = size === 'touch';

  // Scrolled state: path and the level below it share one scrollable line, so
  // the toolbar stays a single row no matter how deep the tree goes.
  if (condensed) {
    return (
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin -mx-1 px-1 py-0.5">
        <button type="button" onClick={() => onNavigate(null)}
          className={`tap-target-sm shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
            current === null ? 'seg-on' : 'seg-off glass'
          }`}>
          {rootLabel}
        </button>
        {trail.map(c => (
          <span key={c.id} className="flex items-center gap-1 shrink-0">
            <Icon name="chevron" size={12} className="text-black/20 -rotate-90 shrink-0" />
            <button type="button" onClick={() => onNavigate(c.id)}
              className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                c.id === current ? 'seg-on' : 'seg-off glass'
              }`}>
              {c.name}
            </button>
          </span>
        ))}
        {level.length > 0 && (
          <span className="shrink-0 w-px h-5 bg-black/[0.08] mx-1" aria-hidden />
        )}
        {level.map(c => {
          const alerts = alertOf ? alertOf(c.id) : 0;
          return (
            <button type="button" key={c.id} onClick={() => onNavigate(c.id)}
              className="filter-pill tap-target-sm shrink-0 inline-flex items-center gap-1.5 seg-off glass">
              {c.name}
              {alerts > 0 && <span className="text-wait-ink font-semibold tabular-nums">{alerts}</span>}
            </button>
          );
        })}
        {current === null && extraRoots.map(name => (
          <button key={name} onClick={() => onNavigateOrphan?.(name)}
            className="tap-target-sm shrink-0 rounded-full glass px-3 py-1.5 text-xs font-medium whitespace-nowrap text-black/50 hover:text-black transition">
            {name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Breadcrumb — every step back is one tap. */}
      <div className="flex items-center gap-1 flex-wrap text-sm">
        <button type="button" onClick={() => onNavigate(null)}
          className={`tap-target-sm rounded-full font-medium transition ${touch ? 'px-4 py-2.5 min-h-[44px]' : 'px-3 py-1.5'} ${
            current === null ? 'seg-on' : 'seg-off glass'
          }`}>
          {rootLabel}
        </button>
        {trail.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1">
            <Icon name="chevron" size={13} className="text-black/20 -rotate-90 shrink-0" />
            <button type="button" onClick={() => onNavigate(c.id)}
              className={`tap-target-sm rounded-full font-medium transition ${touch ? 'px-4 py-2.5 min-h-[44px]' : 'px-3 py-1.5'} ${
                i === trail.length - 1 ? 'seg-on' : 'seg-off glass'
              }`}>
              {c.name}
            </button>
          </span>
        ))}
      </div>

      {/* One level in. Only rendered when there is somewhere to go. */}
      {(level.length > 0 || (current === null && extraRoots.length > 0)) && (
        <div className={`grid gap-2 ${touch ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4'}`}>
          {level.map(c => {
            const kids = childrenOfId(categories, c.id).length;
            const count = countOf ? countOf(c.id) : null;
            const alerts = alertOf ? alertOf(c.id) : 0;
            return (
              <button type="button" key={c.id} onClick={() => onNavigate(c.id)}
                className={`card bg-white flex items-center gap-2.5 text-left transition-shadow hover:shadow-[shadow:var(--shadow-float)] active:scale-[0.99] ${
                  touch ? 'p-4 min-h-[72px]' : 'p-3'
                }`}>
                {/* Ikona v neutrální jamce (kolo 69, audit Skladu): limetkový
                    čtverec u každé dlaždice byl limetka jako ozdoba. */}
                <span className={`well inline-flex shrink-0 items-center justify-center text-black/55 ${
                  touch ? 'h-11 w-11' : 'h-9 w-9'
                }`}>
                  <Icon name="box" size={touch ? 20 : 16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block t-card line-clamp-2 ${touch ? '!text-base' : ''}`}>{c.name}</span>
                  <span className="block t-meta line-clamp-2">
                    {count !== null && <>{count} {pluralPolozka(count)}</>}
                    {kids > 0 && <>{count !== null ? ' · ' : ''}{kids} podkat.</>}
                  </span>
                </span>
                {alerts > 0 && <Chip tone="wait" size="sm" className="shrink-0">{alerts} dochází</Chip>}
                <Icon name="chevronRight" size={touch ? 18 : 15} className="text-black/40 shrink-0" />
              </button>
            );
          })}
          {current === null && extraRoots.map(name => (
            <button type="button" key={name} onClick={() => onNavigateOrphan?.(name)}
              className={`card bg-white flex items-center gap-2.5 text-left transition-shadow hover:shadow-[shadow:var(--shadow-float)] active:scale-[0.99] ${
                touch ? 'p-4 min-h-[72px]' : 'p-3'
              }`}>
              <span className={`well inline-flex shrink-0 items-center justify-center text-black/40 ${
                touch ? 'h-11 w-11' : 'h-9 w-9'
              }`}>
                <Icon name="box" size={touch ? 20 : 16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block t-card truncate ${touch ? '!text-base' : ''}`}>{name}</span>
                <span className="block t-meta">Bez kategorie</span>
              </span>
              <Icon name="chevronRight" size={touch ? 18 : 15} className="text-black/40 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
