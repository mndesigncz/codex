import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { SessionProvider } from './providers';
import { ObalProvider } from '@/components/ObalProvider';
import { obalZHlavicek } from '@/lib/obal';
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
    images: ['/brand/hero-counter.webp'],
  },
};

export const viewport = {
  // Bez `viewport-fit=cover` vrací env(safe-area-inset-*) nulu, takže dock a
  // spodní listy v nativním obalu (iPhone s výřezem, Android edge-to-edge)
  // sedí pod home indikátorem. Safe-area se v layoutech řeší přes env().
  viewportFit: 'cover' as const,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#C8F542' },
    { media: '(prefers-color-scheme: dark)', color: '#0C0D0F' },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Nativní obal (lib/obal.ts): server ví, jestli běžíme v aplikaci, dřív než
  // se vykreslí první znak, takže se v obalu nikdy neukáže cena ani odkaz na platbu.
  const obal = obalZHlavicek(await headers());
  return (
    <html lang="cs" className={`${sans.variable} ${mono.variable}`} data-obal={obal ?? undefined}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=location.pathname;var c=p==='/'||p==='/demo'||p.indexOf('/demo/')===0||p==='/client'||p.indexOf('/client/')===0||/[?&]mode=client(&|$)/.test(location.search);var t=c?null:(localStorage.getItem('managero-theme')||localStorage.getItem('pangea-theme'));if(t==='dark'&&!c)document.documentElement.setAttribute('data-theme','dark');}catch(e){}`,
          }}
        />
      </head>
      <body>
        <ObalProvider obal={obal}><SessionProvider>{children}</SessionProvider></ObalProvider>
      </body>
    </html>
  );
}
