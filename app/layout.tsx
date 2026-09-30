import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { SessionProvider } from './providers';
import { ObalProvider } from '@/components/ObalProvider';
import { obalZHlavicek } from '@/lib/obal';
import { SITE_URL, SITE_NAZEV, SITE_TITULEK, SITE_POPIS, OG_ZAKLAD } from '@/lib/web';
import { getJazyk } from '@/lib/i18n/server';
import { nactiSekce, SEKCE_VZDY } from '@/lib/i18n/slovniky';
import { POPIS_APLIKACE } from '@/lib/i18n/meta';

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
//
// Popis je v jazyce z cookie (plán vícejazyčnosti §2.9). Titulek a marketingový
// popis prodejní stránky zůstávají česky: prodejní stránka se překládá až později
// (s prefixy /en, /de kvůli SEO). Mimo ni se zobrazuje krátký popis aplikace.
export async function generateMetadata(): Promise<Metadata> {
  const jazyk = await getJazyk();
  const popis = jazyk === 'cs' ? SITE_POPIS : POPIS_APLIKACE[jazyk];
  return {
    metadataBase: new URL(SITE_URL),
    title: SITE_TITULEK,
    description: popis,
    applicationName: SITE_NAZEV,
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, title: 'Managero', statusBarStyle: 'default' },
    openGraph: { ...OG_ZAKLAD, description: popis },
    twitter: {
      card: 'summary_large_image',
      title: SITE_TITULEK,
      description: popis,
      images: ['/brand/hero-counter.webp'],
    },
  };
}

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
  // Jazyk z cookie. Čeština nenačítá žádný slovník; ostatní jazyky dostanou
  // `common` a `api` hned v prvním HTML, ať se nic nepřekreslí česky.
  const jazyk = await getJazyk();
  const slovniky = jazyk === 'cs' ? undefined : await nactiSekce(jazyk, SEKCE_VZDY);
  return (
    <html lang={jazyk} className={`${sans.variable} ${mono.variable}`} data-obal={obal ?? undefined}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=location.pathname;var c=p==='/'||p==='/demo'||p.indexOf('/demo/')===0||p==='/client'||p.indexOf('/client/')===0||/[?&]mode=client(&|$)/.test(location.search);var t=c?null:(localStorage.getItem('managero-theme')||localStorage.getItem('pangea-theme'));if(t==='dark'&&!c)document.documentElement.setAttribute('data-theme','dark');}catch(e){}`,
          }}
        />
      </head>
      <body>
        <ObalProvider obal={obal}><SessionProvider jazyk={jazyk} slovniky={slovniky}>{children}</SessionProvider></ObalProvider>
      </body>
    </html>
  );
}
