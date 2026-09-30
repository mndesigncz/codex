import type { MetadataRoute } from 'next';
import { SITE_URL, VEREJNE_TRASY } from '@/lib/web';

// sitemap.xml: jen veřejné trasy bez přihlášení. Stránky podniků pro hosty
// (/client/<slug>) tu nejsou schválně — každá je vlastní obsah podniku a
// zatím nemá vlastní title ani popis.
export default function sitemap(): MetadataRoute.Sitemap {
  return VEREJNE_TRASY.map((trasa) => ({
    url: trasa === '/' ? `${SITE_URL}/` : `${SITE_URL}${trasa}`,
    changeFrequency: trasa === '/' ? 'weekly' : 'monthly',
    priority: trasa === '/' ? 1 : 0.6,
  }));
}
