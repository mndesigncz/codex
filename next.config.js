/** @type {import('next').NextConfig} */

// Bezpečnostní hlavičky. Aplikace je vnitřní nástroj podniku — nemá důvod
// jít vložit do cizí stránky ani odesílat adresy jinam.
//
// Jediná výjimka je veřejná ukázka /demo (ukázková aplikace proti
// in-browser mock serveru, lib/demo): prodejní stránka ji vkládá do rámu
// zařízení jako <iframe> téhož původu. Proto má vlastní sadu hlaviček
// (`ramovatSam`): rámovat ji smí jen stránka ze stejného původu, nikdy cizí
// web, a CSP ji navíc ZÚŽUJE — žádné Stripe, žádné cizí hostitele, na síť
// jen 'self' (a v demu na síť /api stejně nic neodejde).
function bezpecnostniHlavicky({ ramovatSam }) {
  // 'unsafe-eval' jen ve vývoji: potřebuje ho React Refresh. Produkční build
  // eval nepoužívá a s ním by CSP pustila eval()/new Function() z vloženého skriptu.
  const evalVeVyvoji = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'";
  return [
    // Klikací past: bez tohohle jde appku vložit do neviditelného rámu
    // na cizí stránce a nechat obsluhu klikat naslepo. Ukázka smí být
    // v rámu jen na stránce téhož původu.
    { key: 'X-Frame-Options', value: ramovatSam ? 'SAMEORIGIN' : 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Ukázka má být mimo vyhledávače i tehdy, kdyby robota nezajímala metadata stránky.
    ...(ramovatSam ? [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] : []),
    // Adresa s tokenem sdílené stránky se nemá odeslat cizímu webu
    // v hlavičce Referer.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // payment: vložená pokladna Stripe nabízí Apple Pay / Google Pay
    // přes Payment Request API ze svého rámu. Ukázka platby nemá.
    { key: 'Permissions-Policy', value: ramovatSam
      ? 'camera=(), microphone=(), geolocation=(), payment=()'
      : 'camera=(self), microphone=(), geolocation=(), payment=(self "https://js.stripe.com" "https://checkout.stripe.com")' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    // Poslední pojistka, kdyby se do stránky přece jen dostal cizí
    // skript: nemá odkud se načíst a nemá kam odeslat data.
    // 'unsafe-inline' a 'unsafe-eval' u skriptů zůstávají, protože je
    // Next.js pro hydrataci potřebuje; zúžit to chce nonce, což je
    // samostatná úprava.
    {
      key: 'Content-Security-Policy',
      value: (ramovatSam ? [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${evalVeVyvoji}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        // Ukázka mluví jen sama se sebou; skutečné /api řeší interceptor v prohlížeči.
        "connect-src 'self'",
        "frame-src 'none'",
        // Rámovat smí jen stránka ze stejného původu (prodejní stránka).
        "frame-ancestors 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ] : [
        "default-src 'self'",
        // Stripe: vložená pokladna (js.stripe.com) běží v rámu na naší
        // stránce, karta nikdy neprojde naším kódem.
        `script-src 'self' 'unsafe-inline'${evalVeVyvoji} https://js.stripe.com`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://api.storyous.com https://login.storyous.com https://blob.vercel-storage.com https://api.stripe.com https://checkout.stripe.com https://merchant-ui-api.stripe.com https://r.stripe.com",
        // 'self': prodejní stránka vkládá ukázku /demo jako <iframe> téhož
        // původu. Ostatní trasy zůstávají nerámovatelné (X-Frame-Options
        // DENY a frame-ancestors 'none' výše), takže 'self' tu nic dalšího neotevírá.
        "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ]).join('; '),
    },
  ];
}

const nextConfig = {
  async headers() {
    return [
      {
        // Všechno kromě /demo. Vzor s vyloučením místo dvou překrývajících se
        // pravidel: u dvou pravidel na stejnou cestu by o vítězi hlavičky
        // rozhodovalo pořadí, které si Next mezi verzemi může vyložit jinak
        // — a šlo by o to, jestli se appka smí vložit do cizího rámu.
        source: '/((?!demo(?:/|$)).*)',
        headers: bezpecnostniHlavicky({ ramovatSam: false }),
      },
      {
        source: '/demo/:path*',
        headers: bezpecnostniHlavicky({ ramovatSam: true }),
      },
      {
        // Nahrané soubory se servírují z vlastní routy a mají tam ještě
        // přísnější pravidla; tohle je pojistka na úrovni odpovědi.
        source: '/api/upload/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'DENY' }],
      },
    ];
  },
};
module.exports = nextConfig;
