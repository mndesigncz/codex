import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { SessionProvider } from './providers';
import { SITE_URL, SITE_NAZEV, SITE_TITULEK, SITE_POPIS, OG_ZAKLAD } from '@/lib/web';

// Jedno písmo s charakterem místo systémového fallbacku, který na každé
// platformě vypadal jinak (Arial na Linuxu, SF na Macu). Geist má pevné
// číslice pro tabulky, českou diakritiku a čitelné malé stupně na baru.
// Balíček `geist` ho servíruje přes next/font/local — žádný externí
// požadavek při načtení; proměnné --font-geist-sans / --font-geist-mono.
const sans = GeistSans;
const mono = GeistMono;

// Sdílecí základ celého webu. Konkrétní stránky si přepisují title (a canonical
// má jen prodejní stránka v app/page.tsx — kořenový canonical by ukazoval
// všechny podstránky na úvodní).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITULEK,
  description: SITE_POPIS,
  applicationName: SITE_NAZEV,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Managero', statusBarStyle: 'default' },
  openGraph: OG_ZAKLAD,
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITULEK,
    description: SITE_POPIS,
    images: ['/brand/landing/og.png'],
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#C8F542' },
    { media: '(prefers-color-scheme: dark)', color: '#0C0D0F' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs" className={`${sans.variable} ${mono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=location.pathname;var c=p==='/'||p==='/demo'||p.indexOf('/demo/')===0||p==='/client'||p.indexOf('/client/')===0||/[?&]mode=client(&|$)/.test(location.search);var t=c?null:(localStorage.getItem('managero-theme')||localStorage.getItem('pangea-theme'));if(t==='dark'&&!c)document.documentElement.setAttribute('data-theme','dark');}catch(e){}`,
          }}
        />
      </head>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
