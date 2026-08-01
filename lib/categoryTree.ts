// Inventory categories are one level deep: a category can hold subcategories,
// a subcategory cannot. Items keep referencing their category by NAME, exactly
// as before — a subcategory is just a category that happens to have a parent,
// so nothing about items, packaging or thresholds had to change.

export interface CategoryNode {
  id: number;
  name: string;
  position: number;
  parentId?: number | null;
  tracksOpen?: boolean;
  contentUnit?: string | null;
  defaultPackageSize?: number | null;
  scale?: any;
}

export interface CategoryTreeNode<T extends CategoryNode = CategoryNode> {
  cat: T;
  children: T[];
}

/** Roots in display order, each with its children in display order. */
export function buildTree<T extends CategoryNode>(categories: T[]): CategoryTreeNode<T>[] {
  const byId = new Map<number, T>();
  categories.forEach(c => byId.set(c.id, c));
  const order = (a: T, b: T) => (a.position - b.position) || a.name.localeCompare(b.name, 'cs');

  // A parent pointing at something that no longer exists is treated as a root,
  // so a deleted parent can never hide its children.
  const isRoot = (c: T) => c.parentId == null || !byId.has(c.parentId);

  return categories
    .filter(isRoot)
    .sort(order)
    .map(cat => ({
      cat,
      children: categories.filter(c => !isRoot(c) && c.parentId === cat.id).sort(order),
    }));
}

/** Categories flattened for a pick-list: each root followed by its children. */
export function flattenTree<T extends CategoryNode>(categories: T[]): { cat: T; depth: 0 | 1 }[] {
  const out: { cat: T; depth: 0 | 1 }[] = [];
  buildTree(categories).forEach(({ cat, children }) => {
    out.push({ cat, depth: 0 });
    children.forEach(c => out.push({ cat: c, depth: 1 }));
  });
  return out;
}

export function childrenOf<T extends CategoryNode>(categories: T[], name: string): T[] {
  const parent = categories.find(c => c.name === name);
  if (!parent) return [];
  return buildTree(categories).find(n => n.cat.id === parent.id)?.children ?? [];
}

/**
 * Every category name a filter on `name` should match: the category itself plus
 * its subcategories. Selecting "Tabáky" therefore shows everything filed under
 * "Tabáky → Virginia" as well.
 */
export function categoryScope<T extends CategoryNode>(categories: T[], name: string): string[] {
  return [name, ...childrenOf(categories, name).map(c => c.name)];
}

/** "Tabáky → Virginia" for a subcategory, plain name for a root. */
export function categoryPath<T extends CategoryNode>(categories: T[], name: string): string {
  const cat = categories.find(c => c.name === name);
  if (!cat?.parentId) return name;
  const parent = categories.find(c => c.id === cat.parentId);
  return parent ? `${parent.name} → ${cat.name}` : name;
}

/**
 * Which categories may become the parent of `id`. One level deep, so a category
 * that already has subcategories can't be nested, and neither can it become its
 * own parent.
 */
export function possibleParents<T extends CategoryNode>(categories: T[], id: number): T[] {
  const hasChildren = categories.some(c => c.parentId === id);
  if (hasChildren) return [];
  return categories.filter(c => c.id !== id && c.parentId == null);
}
