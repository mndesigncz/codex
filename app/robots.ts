import type { MetadataRoute } from 'next';
import { SITE_URL, SOUKROME_PREDPONY } from '@/lib/web';

// robots.txt. Přihlášená část, tablet, správa platformy a ukázka jsou
// za přihlášením nebo jen vložené do prodejní stránky — do vyhledávačů
// nepatří. Náhledová nasazení (Vercel preview) se neindexují vůbec, ať se
// s produkcí nepletou duplicitním obsahem.
export default function robots(): MetadataRoute.Robots {
  const jeProdukce = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'production';
  if (!jeProdukce) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...SOUKROME_PREDPONY] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
