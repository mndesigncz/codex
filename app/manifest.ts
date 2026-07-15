import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pangea',
    short_name: 'Pangea',
    description: 'Systém pro správu podniku',
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
