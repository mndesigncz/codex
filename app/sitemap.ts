import type { MetadataRoute } from 'next';
import { SITE_URL, VEREJNE_TRASY } from '@/lib/web';
import { KLICE_DOKUMENTU } from '@/lib/pravni/odkazy';

// sitemap.xml: jen veřejné trasy bez přihlášení. Stránky podniků pro hosty
// (/client/<slug>) tu nejsou schválně — každá je vlastní obsah podniku a
// zatím nemá vlastní title ani popis.
// Právní dokumenty (lib/pravni/odkazy.ts) česky i anglicky, ať se nový dokument
// nemusí připisovat na dvě místa.
export default function sitemap(): MetadataRoute.Sitemap {
  const pravni = KLICE_DOKUMENTU.flatMap(k => [`/${k}`, `/en/${k}`]);
  const trasy = Array.from(new Set<string>([...VEREJNE_TRASY, ...pravni]));
  return trasy.map((trasa) => ({
    url: trasa === '/' ? `${SITE_URL}/` : `${SITE_URL}${trasa}`,
    changeFrequency: trasa === '/' ? 'weekly' : 'monthly',
    priority: trasa === '/' ? 1 : 0.6,
  }));
}
