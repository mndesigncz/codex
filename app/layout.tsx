import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
// Managero client, směr A „Peněženka“ (tokeny --hp-*, třídy .hp-*): globálně, ať ho má i náhled hosta ve správě.
import './host-penezenka.css';
import { SessionProvider } from './providers';
import { ObalProvider } from '@/components/ObalProvider';
import { obalZHlavicek } from '@/lib/obal';
import { jeAdminHost, hostPozadavku } from '@/lib/spravaHost';
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
  // Host správy platformy (admin.managero.app): žádná instalace na plochu, sdílecí
  // karta ani popis — jen název a zákaz indexování (app/admin/layout.tsx přidá zbytek).
  if (jeAdminHost(hostPozadavku(await headers()))) {
    return { metadataBase: new URL(SITE_URL), title: 'Správa platformy · Managero', robots: { index: false, follow: false } };
  }
  const jazyk = await getJazyk();
  const popis = jazyk === 'cs' ? SITE_POPIS : POPIS_APLIKACE[jazyk];
  return {
    metadataBase: new URL(SITE_URL),
    title: SITE_TITULEK,
    description: popis,
    applicationName: SITE_NAZEV,
    // Odkaz na manifest píše <head> níž sám (crossOrigin="use-credentials", viz app/manifest.webmanifest/route.ts).
    appleWebApp: { capable: true, title: 'Managero', statusBarStyle: 'default' },
    // Next 15 z appleWebApp.capable píše jen standardní `mobile-web-app-capable`; starší
    // iOS Safari pro „Přidat na plochu“ jako samostatnou aplikaci čte jen tuhle značku.
    other: { 'apple-mobile-web-app-capable': 'yes' },
    openGraph: { ...OG_ZAKLAD, description: popis },
    twitter: {
      card: 'summary_large_image',
      title: SITE_TITULEK,
      description: popis,
      images: ['/brand/landing/og.png'],
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
  const h = await headers();
  const obal = obalZHlavicek(h);
  // Správa platformy (admin.managero.app, lib/spravaHost): bez manifestu, service
  // workeru a relace aplikace, vždy česky, motiv podle systému.
  const sprava = jeAdminHost(hostPozadavku(h));
  // Jazyk z cookie. Čeština nenačítá žádný slovník; ostatní jazyky dostanou
  // `common` a `api` hned v prvním HTML, ať se nic nepřekreslí česky.
  const jazyk = sprava ? 'cs' : await getJazyk();
  const slovniky = jazyk === 'cs' ? undefined : await nactiSekce(jazyk, SEKCE_VZDY);
  return (
    <html lang={jazyk} className={`${sans.variable} ${mono.variable}`} data-obal={obal ?? undefined} data-sprava={sprava ? '' : undefined} suppressHydrationWarning>
      <head>
        {!sprava && <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=location.pathname;var h=document.documentElement;var s=h.hasAttribute('data-sprava');var c=!s&&(p==='/'||p==='/demo'||p.indexOf('/demo/')===0||/[?&]mode=client(&|$)/.test(location.search));var k=s||p==='/client'||p.indexOf('/client/')===0;if(k)window.__motivVychozi='system';var t=c?null:(localStorage.getItem('managero-theme')||localStorage.getItem('pangea-theme')||localStorage.getItem('managero-theme-server')||(k?'system':null));if(t==='system')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(t==='dark'&&!c)h.setAttribute('data-theme','dark');var v=c?{}:JSON.parse(localStorage.getItem('managero-vzhled')||'{}');if(v.hustota==='kompaktni')h.setAttribute('data-density','compact');if(v.pismo==='vetsi')h.setAttribute('data-fontsize','large');if(v.pismo==='nejvetsi')h.setAttribute('data-fontsize','xlarge');if(v.pohyb===true)h.setAttribute('data-motion','reduce');if(v.kontrast===true)h.setAttribute('data-contrast','high');}catch(e){}`,
          }}
        />
      </head>
      <body>
        <ObalProvider obal={obal}><SessionProvider jazyk={jazyk} slovniky={slovniky} sprava={sprava}>{children}</SessionProvider></ObalProvider>
      </body>
    </html>
  );
}
