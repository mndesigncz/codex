// Ukázková data pro snímky Managero client: víc podniků s obálkami, menu, kampaní, kuponem, akcí
// a členstvím hosta. Všechno je vymyšlené (podniky, lidé, ceny); žádné cizí značky ani fotky
// s nejasnou licencí: obálky jsou jednoduché vektorové obrazce v barvách značky (data: URI).
//
// Základ tvoří fixtury sond (scripts/sondy/fixtury/client_*.json); tady se jen přepisuje a doplňuje,
// takže když se změní tvar API, sondy i snímky se rozbijí společně a hned je to vidět.
// Data jsou vztažená k zadanému „dnes“ (fixní čas snímků), nezávisí na denní době.
import { readFileSync } from 'node:fs';
import { REPO } from './_spolecne.mjs';

const FIX = `${REPO}/scripts/sondy/fixtury`;
const nacti = (n) => JSON.parse(readFileSync(`${FIX}/${n}.json`, 'utf8'));

/** Jednoduchá obálka podniku: dvoubarevný přechod a pár měkkých tvarů. Jen v barvách značky. */
function obalka(c1, c2, tvar) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="1200" height="600" fill="url(#g)"/>${tvar}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
const KRUHY = '<circle cx="980" cy="140" r="220" fill="#fff" fill-opacity=".18"/><circle cx="1080" cy="470" r="150" fill="#fff" fill-opacity=".14"/><circle cx="210" cy="520" r="120" fill="#fff" fill-opacity=".12"/>';
const PRUHY = '<rect x="700" y="0" width="90" height="600" fill="#fff" fill-opacity=".12"/><rect x="860" y="0" width="60" height="600" fill="#fff" fill-opacity=".1"/><rect x="980" y="0" width="120" height="600" fill="#fff" fill-opacity=".14"/>';
const VLNY = '<path d="M0 420 C 250 330 450 520 700 420 S 1050 330 1200 400 V600 H0Z" fill="#fff" fill-opacity=".16"/><path d="M0 500 C 300 430 500 590 760 500 S 1080 440 1200 490 V600 H0Z" fill="#fff" fill-opacity=".12"/>';

const PODNIKY = [
  { slug: 'kavarna-u-lipy', name: 'Kavárna U Lípy', tagline: 'Káva, snídaně a klid na práci', address: 'Lipová 14, Brno', cover: obalka('#3E5406', '#8BB31A', KRUHY) },
  { slug: 'ukazkova-cajovna', name: 'Ukázková čajovna', tagline: 'Čaje z celého světa a domácí koláče', address: 'Nádražní 3, Olomouc', cover: obalka('#1F5C46', '#4FB286', VLNY) },
  { slug: 'ukazkove-bistro', name: 'Ukázkové bistro', tagline: 'Denní menu a víkendové brunche', address: 'Mostní 8, Praha', cover: obalka('#23262A', '#5A6B2C', PRUHY) },
];

/** YYYY-MM-DD o `dny` dnů později než `dnes`. */
function den(dnes, dny) {
  const d = new Date(`${dnes}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dny);
  return d.toISOString().slice(0, 10);
}

/** Celá sada odpovědí API, klíč = pathname bez /api/ (s koncovou částí po /b/<slug>). */
export function klientFixtury(dnes = '2026-10-14') {
  const zaklad = nacti('client_b_kavarna-u-lipy');
  const hodiny = zaklad.business.hours;
  const b = {};
  for (const p of PODNIKY) {
    const kopie = JSON.parse(JSON.stringify(zaklad));
    kopie.business = {
      ...kopie.business, slug: p.slug, name: p.name, tagline: p.tagline, address: p.address, coverUrl: p.cover, hours: hodiny,
      description: 'Malý podnik, kde se ještě vaří doopravdy. Sedí se u stolů i na baru, pečeme denně.',
      stampReward: 'Káva jako odměna', stampTarget: 8,
    };
    // Menu: popisy a ceny z fixtury, doplnit aspoň tři sekce pro objednání.
    kopie.menu.name = 'Denní nabídka';
    kopie.coupons = [
      { id: 1, title: 'Filtr dne jako odměna', cost_points: 200, kind: 'offer', valid_until: den(dnes, 40) },
      { id: 2, title: 'Dezert k snídani', cost_points: 120, kind: 'offer', valid_until: den(dnes, 30) },
    ];
    kopie.news = [{ id: 1, title: 'Nová sezónní nabídka', body: 'Od pátku máme dýňové latte a jablečný štrúdl.', created_at: `${den(dnes, -2)}T08:00:00Z` }];
    kopie.events = [
      { id: 1, title: 'Degustace nové pražírny', description: 'Ochutnávka tří nových káv s pražičem.', kind: 'event', date: den(dnes, 6), start_time: '18:00', end_time: '20:00', location: 'U nás v podniku', offsite: false, capacity: 20, photos: [], menu: [], going: 7, public: true },
      { id: 2, title: 'Víkendový brunch', description: 'Celý víkend podáváme brunch od deseti.', kind: 'event', date: den(dnes, 10), start_time: '10:00', end_time: '14:00', location: 'U nás v podniku', offsite: false, capacity: 30, photos: [], menu: [], going: 12, public: true },
    ];
    kopie.stampCampaigns = [{ id: 1, title: 'Osmá káva jako odměna', target: 8 }];
    kopie.me = { points: 320, stamps: 6, visits: 18, tier: 'silver' };
    kopie.today = dnes;
    kopie.signedIn = true;
    b[p.slug] = kopie;
  }
  const me = nacti('client_me');
  me.customer = { id: 101, name: 'Jana Dvořáková', email: 'jana@example.com' };
  me.memberships = [
    { teamId: 1, slug: PODNIKY[0].slug, name: PODNIKY[0].name, points: 320, stamps: 6, visits: 18, tier: 'silver', coverUrl: PODNIKY[0].cover },
    { teamId: 2, slug: PODNIKY[1].slug, name: PODNIKY[1].name, points: 140, stamps: 3, visits: 7, tier: 'member', coverUrl: PODNIKY[1].cover },
  ];
  me.claims = [{ id: 5, title: 'Filtr dne jako odměna', redeemed_at: null, business: PODNIKY[0].name }];
  me.reservations = [{ id: 11, date: den(dnes, 3), time: '18:00', party: 2, status: 'confirmed', business: PODNIKY[0].name }];
  me.orders = me.orders ?? [];
  return {
    businesses: { businesses: PODNIKY.map(p => ({ slug: p.slug, name: p.name, tagline: p.tagline, address: p.address, logoUrl: '', coverUrl: p.cover, member: p.slug !== PODNIKY[2].slug })) },
    me,
    card: nacti('client_card'),
    b,
  };
}

/** Mock API hostovských tras (snímky Managero client). Session řeší skutečný server podle cookie. */
export async function namockujKlienta(ctx, fix) {
  await ctx.route('**/api/**', route => {
    const u = new URL(route.request().url()); const p = u.pathname;
    const ok = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p.startsWith('/api/auth/')) {
      if (p === '/api/auth/session') return ok({ user: { id: '18', name: fix.me.customer.name, email: fix.me.customer.email, role: 'customer' }, expires: '2099-01-01T00:00:00.000Z' });
      return route.continue();
    }
    if (p === '/api/client/businesses') return ok(fix.businesses);
    if (p === '/api/client/me') return ok(fix.me);
    if (p === '/api/client/card') return ok(fix.card);
    let m = /^\/api\/client\/b\/([^/]+)\/orders$/.exec(p);
    if (m) return ok({ orders: [] });
    m = /^\/api\/client\/b\/([^/]+)$/.exec(p);
    if (m) return fix.b[m[1]] ? ok(fix.b[m[1]]) : ok({ error: 'nenalezeno' }, 404);
    return ok({});
  });
}

