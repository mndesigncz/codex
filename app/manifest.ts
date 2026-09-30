import type { MetadataRoute } from 'next';
import { getJazyk } from '@/lib/i18n/server';
import { POPIS_MANIFESTU } from '@/lib/i18n/meta';

// Manifest je jeden na celý web, proto se řídí jazykem z cookie (stejně jako
// <html lang>). Bez cookie (instalace z prohlížeče poprvé) je česky.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const jazyk = await getJazyk();
  return {
    name: 'Managero',
    short_name: 'Managero',
    description: POPIS_MANIFESTU[jazyk],
    lang: jazyk,
    start_url: '/',
    display: 'standalone',
    background_color: '#F1F4EC',
    theme_color: '#C8F542',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
