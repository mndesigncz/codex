/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bezpečnostní hlavičky. Aplikace je vnitřní nástroj podniku — nemá důvod
  // jít vložit do cizí stránky ani odesílat adresy jinam.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Klikací past: bez tohohle jde appku vložit do neviditelného rámu
          // na cizí stránce a nechat obsluhu klikat naslepo.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Adresa s tokenem sdílené stránky se nemá odeslat cizímu webu
          // v hlavičce Referer.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // Poslední pojistka, kdyby se do stránky přece jen dostal cizí
          // skript: nemá odkud se načíst a nemá kam odeslat data.
          // 'unsafe-inline' a 'unsafe-eval' u skriptů zůstávají, protože je
          // Next.js pro hydrataci potřebuje; zúžit to chce nonce, což je
          // samostatná úprava.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.storyous.com https://login.storyous.com https://blob.vercel-storage.com",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
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
