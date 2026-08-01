// Inventory categories nest to any depth: Tabáky → Virginia → Sladké → …
// Items keep referencing their category by NAME, exactly as before — a
// subcategory is just a category that has a parent, so nothing about items,
// packaging or thresholds had to change when nesting arrived.

export interface CategoryNode {
  id: number;
  name: string;
  position: number;
  parentId?: number | null;
  tracksOpen?: boolean;
  contentUnit?: string | null;
  defaultPackageSize?: number | null;
  thresholdUnit?: 'package' | 'content';
  scale?: any;
}

export interface TreeNode<T extends CategoryNode = CategoryNode> {
  cat: T;
  children: TreeNode<T>[];
}

/** Depth guard: a malformed parent chain must never hang the UI. */
const MAX_DEPTH = 12;

function order<T extends CategoryNode>(a: T, b: T) {
  return (a.position - b.position) || a.name.localeCompare(b.name, 'cs');
}

/**
 * A category whose parent no longer exists — or which sits in a cycle — is
 * treated as a root, so a broken link can never hide a whole branch.
 */
function rootsOf<T extends CategoryNode>(categories: T[]): T[] {
  const byId = new Map<number, T>();
  categories.forEach(c => byId.set(c.id, c));
  return categories.filter(c => {
    if (c.parentId == null || !byId.has(c.parentId)) return true;
    // Walk up; if we come back to ourselves the chain is a cycle.
    let cur = byId.get(c.parentId);
    for (let i = 0; i < MAX_DEPTH && cur; i++) {
      if (cur.id === c.id) return true;
      cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
    }
    return false;
  });
}

export function childrenOfId<T extends CategoryNode>(categories: T[], id: number | null): T[] {
  const roots = new Set(rootsOf(categories).map(c => c.id));
  return categories
    .filter(c => (id === null ? roots.has(c.id) : c.parentId === id && !roots.has(c.id)))
    .sort(order);
}

/** The whole forest, each level sorted for display. */
export function buildTree<T extends CategoryNode>(categories: T[]): TreeNode<T>[] {
  const build = (parentId: number | null, depth: number): TreeNode<T>[] => {
    if (depth > MAX_DEPTH) return [];
    return childrenOfId(categories, parentId).map(cat => ({
      cat,
      children: build(cat.id, depth + 1),
    }));
  };
  return build(null, 0);
}

/** Every category flattened for a pick-list, each with its nesting depth. */
export function flattenTree<T extends CategoryNode>(categories: T[]): { cat: T; depth: number }[] {
  const out: { cat: T; depth: number }[] = [];
  const walk = (nodes: TreeNode<T>[], depth: number) => {
    nodes.forEach(n => {
      out.push({ cat: n.cat, depth });
      walk(n.children, depth + 1);
    });
  };
  walk(buildTree(categories), 0);
  return out;
}

export function findByName<T extends CategoryNode>(categories: T[], name: string): T | undefined {
  return categories.find(c => c.name === name);
}

export function findById<T extends CategoryNode>(categories: T[], id: number | null): T | undefined {
  return id == null ? undefined : categories.find(c => c.id === id);
}

/**
 * The category and every category nested under it, by id. This is what filters
 * run on: names may repeat under different parents, ids never do.
 */
export function scopeIds<T extends CategoryNode>(categories: T[], id: number): number[] {
  return [id, ...descendantsOf(categories, id).map(c => c.id)];
}

/** From the root down to a category, by id. */
export function ancestryOfId<T extends CategoryNode>(categories: T[], id: number | null): T[] {
  const cat = findById(categories, id);
  return cat ? ancestryOf(categories, cat) : [];
}

/** "Tabáky → Virginia → Sladké" for a category resolved by id. */
export function pathOfId<T extends CategoryNode>(categories: T[], id: number | null, sep = ' → '): string {
  return ancestryOfId(categories, id).map(c => c.name).join(sep);
}

/** Direct children of the named category. */
export function childrenOf<T extends CategoryNode>(categories: T[], name: string): T[] {
  const cat = findByName(categories, name);
  return cat ? childrenOfId(categories, cat.id) : [];
}

/** The category and everything nested under it, at any depth. */
export function descendantsOf<T extends CategoryNode>(categories: T[], id: number): T[] {
  const out: T[] = [];
  const walk = (parentId: number, depth: number) => {
    if (depth > MAX_DEPTH) return;
    childrenOfId(categories, parentId).forEach(c => {
      out.push(c);
      walk(c.id, depth + 1);
    });
  };
  walk(id, 0);
  return out;
}

/**
 * Every category name a filter on `name` should match: the category itself plus
 * everything nested under it. Selecting "Tabáky" therefore shows what is filed
 * under "Tabáky → Virginia → Sladké" too.
 */
export function categoryScope<T extends CategoryNode>(categories: T[], name: string): string[] {
  const cat = findByName(categories, name);
  if (!cat) return [name];
  return [name, ...descendantsOf(categories, cat.id).map(c => c.name)];
}

/** From the root down to the given category: ["Tabáky", "Virginia", "Sladké"]. */
export function ancestryOf<T extends CategoryNode>(categories: T[], target: T | string): T[] {
  const cat = typeof target === 'string' ? findByName(categories, target) : target;
  if (!cat) return [];
  const chain: T[] = [cat];
  const byId = new Map<number, T>();
  categories.forEach(c => byId.set(c.id, c));
  const roots = new Set(rootsOf(categories).map(c => c.id));
  let cur = cat;
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (roots.has(cur.id) || cur.parentId == null) break;
    const parent = byId.get(cur.parentId);
    if (!parent) break;
    chain.unshift(parent);
    cur = parent;
  }
  return chain;
}

/** "Tabáky → Virginia → Sladké" for display. */
export function categoryPath<T extends CategoryNode>(categories: T[], name: string, sep = ' → '): string {
  const chain = ancestryOf(categories, name);
  return chain.length ? chain.map(c => c.name).join(sep) : name;
}

/**
 * Which categories may become the parent of `id`: anything except itself and
 * its own descendants, which would create a cycle.
 */
export function possibleParents<T extends CategoryNode>(categories: T[], id: number): T[] {
  const blocked = new Set([id, ...descendantsOf(categories, id).map(c => c.id)]);
  return categories.filter(c => !blocked.has(c.id)).sort(order);
}

/** True when moving `id` under `parentId` would create a cycle. */
export function wouldCycle<T extends CategoryNode>(categories: T[], id: number, parentId: number): boolean {
  return id === parentId || descendantsOf(categories, id).some(c => c.id === parentId);
}

/**
 * The nearest ancestor (or the category itself) that carries packaging
 * settings, so a deeply nested subcategory inherits from wherever it was
 * configured.
 */
export function packagingSourceOf<T extends CategoryNode>(categories: T[], target: T | string): T | null {
  const chain = ancestryOf(categories, target);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].tracksOpen) return chain[i];
  }
  return null;
}

/**
 * A predicate for "is this item in this category, or anything under it".
 * Matching is by id; an item created before the id column existed falls back to
 * its label, so nothing disappears while the backfill is pending. `orphanLabel`
 * browses items whose category was deleted.
 */
export function matcher<T extends CategoryNode>(
  categories: T[],
  id: number | null,
  orphanLabel?: string | null,
): (item: { category: string; categoryId?: number | null }) => boolean {
  if (orphanLabel) {
    const known = new Set(categories.map(c => c.id));
    return i => i.category === orphanLabel && (i.categoryId == null || !known.has(i.categoryId));
  }
  if (id == null) return () => true;
  const ids = new Set(scopeIds(categories, id));
  const names = new Set(categories.filter(c => ids.has(c.id)).map(c => c.name));
  return i => (i.categoryId != null ? ids.has(i.categoryId) : names.has(i.category));
}

/** True when the category or anything nested under it tracks open packages. */
export function branchTracksOpen<T extends CategoryNode>(categories: T[], cat: T): boolean {
  return cat.tracksOpen === true || descendantsOf(categories, cat.id).some(c => c.tracksOpen === true);
}
