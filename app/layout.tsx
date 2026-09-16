import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { SessionProvider } from './providers';

// Jedno písmo s charakterem místo systémového fallbacku, který na každé
// platformě vypadal jinak (Arial na Linuxu, SF na Macu). Geist má pevné
// číslice pro tabulky, českou diakritiku a čitelné malé stupně na baru.
// Balíček `geist` ho servíruje přes next/font/local — žádný externí
// požadavek při načtení; proměnné --font-geist-sans / --font-geist-mono.
const sans = GeistSans;
const mono = GeistMono;

export const metadata: Metadata = {
  title: 'Managero',
  description: 'Systém pro správu podniku',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Managero', statusBarStyle: 'default' },
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
            __html: `try{var t=localStorage.getItem('managero-theme')||localStorage.getItem('pangea-theme');var p=location.pathname;var c=p==='/client'||p.indexOf('/client/')===0||/[?&]mode=client(&|$)/.test(location.search);if(t==='dark'&&!c)document.documentElement.setAttribute('data-theme','dark');}catch(e){}`,
          }}
        />
      </head>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
