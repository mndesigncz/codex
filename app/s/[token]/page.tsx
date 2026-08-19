// The public page behind a share link. No login, no app chrome — a customer
// opens it to see what the shop currently offers.
//
// What it deliberately does NOT show: stock counts, purchase prices, suppliers,
// procedure or guide content, anything about staff. Only names, brands and the
// short description written for customers, grouped the way the shop groups them.

import { neon } from '@neondatabase/serverless';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { normalizeTheme, normalizeExcluded, isDark, type ShareTheme } from '@/lib/share';
import { buildTree, type CategoryNode, type TreeNode } from '@/lib/categoryTree';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

type Entry = { id: number; name: string; brand: string | null; description: string | null; highlight?: string | null };

async function loadLink(token: string) {
  try {
    const [row] = await sql`SELECT * FROM share_links WHERE token = ${token} AND enabled IS NOT FALSE`;
    return row ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const link = await loadLink(params.token);
  if (!link) return { title: 'Nenalezeno' };
  let name = '';
  try {
    const [t] = await sql`SELECT name, share_theme FROM teams WHERE id = ${link.team_id}`;
    name = normalizeTheme(t?.share_theme).businessName || t?.name || '';
  } catch { /* fall back to the link title alone */ }
  const title = [link.title, name].filter(Boolean).join(' · ') || 'Nabídka';
  return { title, description: link.note ?? undefined, robots: { index: false } };
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const link = await loadLink(params.token);
  if (!link) notFound();

  const teamId = Number(link.team_id);
  const excluded = new Set(normalizeExcluded(link.excluded));

  let theme: ShareTheme = normalizeTheme(null);
  try {
    const [t] = await sql`SELECT name, share_theme FROM teams WHERE id = ${teamId}`;
    theme = normalizeTheme(t?.share_theme);
    if (!theme.businessName) theme.businessName = t?.name ?? '';
  } catch { /* defaults are fine */ }

  // Public events: the shop's upcoming programme, shown on every share page.
  let publicEvents: any[] = [];
  try {
    const today = new Date().toISOString().slice(0, 10);
    publicEvents = await sql`
      SELECT title, description, kind, date, start_time, end_time, location
      FROM events
      WHERE team_id = ${teamId} AND public = TRUE AND status <> 'cancelled' AND date >= ${today}
      ORDER BY date ASC LIMIT 8`;
  } catch { /* table not migrated — page works without it */ }

  const sections = link.kind === 'guides'
    ? await guideSections(teamId, excluded)
    : await inventorySections(teamId, link.category_id != null ? Number(link.category_id) : null, excluded);

  const dark = isDark(theme.background);
  const muted = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const line = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const card = dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.65)';
  const total = sections.reduce((n, s) => n + s.entries.length, 0);

  return (
    <main style={{ background: theme.background, color: theme.text, minHeight: '100vh' }}>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 20px 72px' }}>
        <header style={{ textAlign: 'center', marginBottom: 36 }}>
          {theme.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logoUrl} alt={theme.businessName || ''}
              style={{ maxHeight: 72, maxWidth: '70%', objectFit: 'contain', margin: '0 auto 18px', display: 'block' }} />
          )}
          {theme.businessName && (
            <p style={{ margin: 0, fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: muted }}>
              {theme.businessName}
            </p>
          )}
          <h1 style={{ margin: '8px 0 0', fontSize: 34, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.02em', color: theme.accent }}>
            {link.title || (link.kind === 'guides' ? 'Co nabízíme' : 'Naše nabídka')}
          </h1>
          {link.note && (
            <p style={{ margin: '12px auto 0', maxWidth: 520, fontSize: 15, lineHeight: 1.55, color: muted }}>{link.note}</p>
          )}
        </header>

        {publicEvents.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: theme.accent }}>
              Nadcházející akce
            </h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {publicEvents.map((ev: any, i2: number) => (
                <div key={i2} style={{ background: card, border: `1px solid ${line}`, borderRadius: 16, padding: '14px 18px' }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    {ev.kind === 'concert' ? '🎵 ' : ev.kind === 'lecture' ? '🎤 ' : ev.kind === 'workshop' ? '🫖 ' : ev.kind === 'outdoor' ? '⛺ ' : '📅 '}{ev.title}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 14, color: muted, textTransform: 'capitalize' }}>
                    {new Date(ev.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {ev.start_time ? ` · ${String(ev.start_time).slice(0, 5)}` : ''}
                    {ev.location ? ` · ${ev.location}` : ''}
                  </p>
                  {ev.description && (
                    <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.5, color: muted }}>{ev.description}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}


        {total === 0 ? (
          <p style={{ textAlign: 'center', color: muted }}>Zatím tu nic není.</p>
        ) : (
          sections.map(section => (
            <section key={section.key} style={{ marginBottom: 34 }}>
              <h2 style={{
                margin: `0 0 ${section.depth > 0 ? 10 : 14}px`,
                paddingLeft: section.depth * 14,
                fontSize: section.depth === 0 ? 20 : 16,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: section.depth === 0 ? theme.accent : theme.text,
                borderLeft: section.depth > 0 ? `2px solid ${line}` : undefined,
              }}>
                {section.title}
              </h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, paddingLeft: section.depth * 14, display: 'grid', gap: 8 }}>
                {section.entries.map(e => (
                  <li key={e.id} style={{ background: card, border: `1px solid ${line}`, borderRadius: 14, padding: '12px 16px' }}>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>
                      {e.name}
                      {e.highlight && (
                        <span style={{
                          marginLeft: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                          padding: '2px 8px', borderRadius: 999, verticalAlign: 'middle',
                          background: theme.accent, color: theme.background,
                        }}>
                          {e.highlight === 'new' ? 'NOVINKA' : 'TIP'}
                        </span>
                      )}
                      {e.brand && <span style={{ fontWeight: 400, color: muted }}> · {e.brand}</span>}
                    </p>
                    {e.description && (
                      <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.5, color: muted }}>{e.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {theme.footer && (
          <p style={{ marginTop: 44, paddingTop: 20, borderTop: `1px solid ${line}`, textAlign: 'center', fontSize: 13, lineHeight: 1.6, color: muted }}>
            {theme.footer}
          </p>
        )}
      </div>
    </main>
  );
}

type Section = { key: string; title: string; depth: number; entries: Entry[] };

/**
 * Stock, grouped the way the shop groups it: a section per category in tree
 * order, nested ones indented under their parent. Parked and unnamed items
 * never appear — they are not on the shelf.
 */
async function inventorySections(teamId: number, rootId: number | null, excluded: Set<number>): Promise<Section[]> {
  let cats: any[] = [];
  try {
    cats = await sql`
      SELECT id, name, position, parent_id FROM inventory_categories WHERE team_id = ${teamId}`;
  } catch { cats = []; }

  const nodes: CategoryNode[] = cats.map(c => ({
    id: Number(c.id), name: String(c.name), position: Number(c.position) || 0,
    parentId: c.parent_id != null ? Number(c.parent_id) : null,
  }));

  let items: any[] = [];
  try {
    items = await sql`
      SELECT id, name, category, category_id, brand, description, highlight
      FROM inventory_items
      WHERE team_id = ${teamId} AND archived IS NOT TRUE AND (approved IS DISTINCT FROM FALSE)
      ORDER BY name ASC`;
  } catch {
    try {
      items = await sql`
        SELECT id, name, category, category_id, NULL AS brand, NULL AS description
        FROM inventory_items WHERE team_id = ${teamId} ORDER BY name ASC`;
    } catch { items = []; }
  }

  const entriesOf = (cat: CategoryNode): Entry[] =>
    items
      .filter(i => (i.category_id != null ? Number(i.category_id) === cat.id : i.category === cat.name))
      .map(i => ({
        id: Number(i.id), name: String(i.name),
        brand: i.brand ?? null, description: i.description ?? null,
        highlight: i.highlight === 'new' || i.highlight === 'tip' ? i.highlight : null,
      }))
      // Novinky a tipy nahoru — to je to, co má zákazník vidět první.
      .sort((a, b) => Number(!!b.highlight) - Number(!!a.highlight) || a.name.localeCompare(b.name, 'cs'));

  // Only the branch under `rootId`, or the whole forest when nothing was picked.
  const forest: TreeNode<CategoryNode>[] = (() => {
    const all = buildTree(nodes);
    if (rootId == null) return all;
    const find = (list: TreeNode<CategoryNode>[]): TreeNode<CategoryNode> | null => {
      for (const n of list) {
        if (n.cat.id === rootId) return n;
        const hit = find(n.children);
        if (hit) return hit;
      }
      return null;
    };
    const node = find(all);
    return node ? [node] : [];
  })();

  const out: Section[] = [];
  const walk = (list: TreeNode<CategoryNode>[], depth: number) => {
    list.forEach(node => {
      // Excluding a category hides everything nested under it too.
      if (excluded.has(node.cat.id)) return;
      const entries = entriesOf(node.cat);
      if (entries.length > 0) {
        out.push({ key: `c${node.cat.id}`, title: node.cat.name, depth, entries });
      }
      walk(node.children, entries.length > 0 || depth > 0 ? depth + 1 : depth);
    });
  };
  walk(forest, 0);

  // Items whose category was deleted still belong somewhere, but only when the
  // whole stock is shared — a link scoped to one branch must not leak them.
  if (rootId == null) {
    const known = new Set(nodes.map(n => n.id));
    const knownNames = new Set(nodes.map(n => n.name));
    const orphans = items.filter(i =>
      i.category_id != null ? !known.has(Number(i.category_id)) : !knownNames.has(i.category));
    if (orphans.length > 0) {
      out.push({
        key: 'orphans', title: 'Ostatní', depth: 0,
        entries: orphans.map(i => ({
          id: Number(i.id), name: String(i.name),
          brand: i.brand ?? null, description: i.description ?? null,
          highlight: i.highlight === 'new' || i.highlight === 'tip' ? i.highlight : null,
        })),
      });
    }
  }

  return out;
}

/**
 * Guides as a plain list of what's on offer. Titles only — the content of a
 * guide is internal know-how and never leaves the app.
 */
async function guideSections(teamId: number, excluded: Set<number>): Promise<Section[]> {
  let cats: any[] = [];
  try {
    cats = await sql`
      SELECT id, name, position FROM guide_categories WHERE team_id = ${teamId} ORDER BY position ASC, name ASC`;
  } catch { cats = []; }

  let guides: any[] = [];
  try {
    guides = await sql`SELECT id, title, category_id FROM guides WHERE team_id = ${teamId} ORDER BY title ASC`;
  } catch { guides = []; }

  const out: Section[] = [];
  cats.forEach((c: any) => {
    const id = Number(c.id);
    if (excluded.has(id)) return;
    const entries = guides
      .filter(g => Number(g.category_id) === id)
      .map(g => ({ id: Number(g.id), name: String(g.title), brand: null, description: null }));
    if (entries.length > 0) out.push({ key: `g${id}`, title: String(c.name), depth: 0, entries });
  });

  const known = new Set(cats.map((c: any) => Number(c.id)));
  const rest = guides.filter(g => g.category_id == null || !known.has(Number(g.category_id)));
  if (rest.length > 0) {
    out.push({
      key: 'g-rest', title: 'Ostatní', depth: 0,
      entries: rest.map(g => ({ id: Number(g.id), name: String(g.title), brand: null, description: null })),
    });
  }
  return out;
}
