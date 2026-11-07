import { getJazyk } from '@/lib/i18n/server';
import { POPIS_MANIFESTU } from '@/lib/i18n/meta';

// Manifest je jeden na celý web, proto se řídí jazykem z cookie (stejně jako
// <html lang>). Bez cookie (instalace z prohlížeče poprvé) je česky.
//
// Route handler místo souboru app/manifest.ts: odkaz na manifest píše app/layout.tsx
// sám, s crossOrigin="use-credentials". Prohlížeč manifest jinak stahuje bez cookies,
// a na chráněném náhledu Vercelu (Deployment Protection) tak místo manifestu dostal
// přesměrování na přihlášení — „Přidat na plochu“ pak udělalo jen záložku s ovládáním
// prohlížeče místo samostatné aplikace. Na produkci se nic nemění.
export const dynamic = 'force-dynamic';

export async function GET() {
  const jazyk = await getJazyk();
  const manifest = {
    name: 'Managero',
    short_name: 'Managero',
    description: POPIS_MANIFESTU[jazyk],
    lang: jazyk,
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F1F4EC',
    theme_color: '#C8F542',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate', Vary: 'Cookie' },
  });
}
