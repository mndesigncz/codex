// Strukturovaná data prodejní stránky (JSON-LD).
//
// Jen to, co se o produktu dá doložit: název, kategorie, jazyk a tři nabídky
// s cenami z lib/plan (stejné hodnoty jako v ceníku a ve Stripe). Žádné
// `aggregateRating`, `review` ani zákazník: hodnocení, které neexistuje,
// by bylo vymyšlené a vyhledávače za to trestají. Hlídá to check-landing-obsah.

import { PLAN_NAMES, PRICES } from '@/lib/plan';
import { SITE_NAZEV, SITE_POPIS, SITE_URL } from '@/lib/web';

export function jsonLdLanding() {
  const mesicni = (plan: 'pro' | 'max') => ({
    '@type': 'Offer',
    name: PLAN_NAMES[plan],
    priceCurrency: 'CZK',
    price: String(PRICES[plan].month),
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: PRICES[plan].month,
      priceCurrency: 'CZK',
      billingDuration: 1,
      unitCode: 'MON',
    },
    url: `${SITE_URL}/register?plan=${plan}`,
  });
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${SITE_URL}/#organizace`, name: SITE_NAZEV, url: SITE_URL },
      { '@type': 'WebSite', '@id': `${SITE_URL}/#web`, url: SITE_URL, name: SITE_NAZEV, inLanguage: 'cs', publisher: { '@id': `${SITE_URL}/#organizace` } },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#aplikace`,
        name: SITE_NAZEV,
        description: SITE_POPIS,
        url: SITE_URL,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'cs',
        publisher: { '@id': `${SITE_URL}/#organizace` },
        offers: [
          { '@type': 'Offer', name: PLAN_NAMES.free, priceCurrency: 'CZK', price: '0', url: `${SITE_URL}/register?plan=free` },
          mesicni('pro'),
          mesicni('max'),
        ],
      },
    ],
  };
}

/** Do <script type="application/ld+json">: `<` se escapuje, ať se z textu nedá ukončit značka. */
export function jsonLdRetezec(): string {
  return JSON.stringify(jsonLdLanding()).replace(/</g, '\\u003c');
}
