import type { MetadataRoute } from 'next';
import { SITE_URL, VEREJNE_TRASY } from '@/lib/web';
import { KLICE_DOKUMENTU, alternatesDokumentu } from '@/lib/pravni/odkazy';

// sitemap.xml: jen veřejné trasy bez přihlášení. Stránky podniků pro hosty
// (/client/<slug>) tu nejsou schválně — každá je vlastní obsah podniku a
// zatím nemá vlastní title ani popis.
// Právní dokumenty (lib/pravni/odkazy.ts) česky i anglicky, ať se nový dokument
// nemusí připisovat na dvě místa; každá verze nese hreflang na tu druhou
// (stejné páry jako `alternates` v metadatech stránky).
export default function sitemap(): MetadataRoute.Sitemap {
  const abs = (trasa: string) => (trasa === '/' ? `${SITE_URL}/` : `${SITE_URL}${trasa}`);
  const dokumenty = new Map<string, Record<string, string>>();
  for (const k of KLICE_DOKUMENTU) for (const j of ['cs', 'en'] as const) {
    const a = alternatesDokumentu(k, j);
    dokumenty.set(a.canonical, Object.fromEntries(Object.entries(a.languages).map(([l, t]) => [l, abs(t)])));
  }
  const trasy = Array.from(new Set<string>([...VEREJNE_TRASY, ...dokumenty.keys()]));
  return trasy.map((trasa) => ({
    url: abs(trasa),
    changeFrequency: trasa === '/' ? 'weekly' : 'monthly',
    priority: trasa === '/' ? 1 : 0.6,
    ...(dokumenty.has(trasa) ? { alternates: { languages: dokumenty.get(trasa)! } } : {}),
  }));
}
