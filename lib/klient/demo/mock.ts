// Mock server ukázky hosta (/client/demo): window.fetch pro /api/client/* a /api/auth/session
// odpovídá z paměti (lib/klient/demo/stav.ts) ve tvaru skutečných rout. Nic nejde na síť:
// zápisy (rezervace, přibalená odměna, souhlasy, kód) mění jen stav v prohlížeči.
// Instalace je idempotentní a vratná (odinstaluj při odchodu z ukázky).

import QRCode from 'qrcode';
import { vytvorStavDema, podnikDema, menuDema, DEMO_PODNIKY, type DemoStav, type DemoPodnik } from './stav';
import { DEMO_HOST } from './hostDemo';
import { dayPlus, pragueHM } from '../../pragueTime';
import { slotsFor, nejdriveDnes } from '../../clientSlots';

declare global {
  interface Window {
    __hostDemo?: { stav: DemoStav; puvodni: typeof fetch };
    __hostDemoNacteni?: (slug: string, prebalene: number[]) => void;
  }
}

const TIERS = { silverAt: 10, goldAt: 25, platinumAt: 0, memberDiscount: 0, silverDiscount: 5, goldDiscount: 10, platinumDiscount: 0, tierBy: 'visits', silverSpend: 0, goldSpend: 0, platinumSpend: 0, inactiveMonths: 0 };
const KOD_KARTY = 'JDV7-K4QM';
let svgKarty = '';

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });

function profil(p: DemoPodnik) {
  return {
    slug: p.slug, name: p.name, tagline: p.tagline, description: p.description, address: p.address, coverUrl: '', hours: p.hours,
    currency: 'CZK', reservationsOn: p.reservationsOn, orderingOn: p.orderingOn, loyaltyOn: p.loyaltyOn, pointsPer100: p.pointsPer100,
    tiers: TIERS, cashbackPct: 0, pointsOrders: true, pointsPerReservation: 0, voucherPointsPer100: 0, pointsExpireDays: 0, creditExpireDays: 0,
    welcomePoints: 50, birthdayPoints: 50, referralPoints: 20, stampTarget: p.stampTarget, stampReward: p.stampReward,
    maxParty: 8, leadDays: 30, slotMinutes: 30, logoUrl: '', gallery: [], accent: p.accent, orderQrRequired: false, orderGeo: 'off', phone: p.phone,
  };
}

function kampanHosta(k: { id: number; name: string; required: number; reward: string; stamps: number }) {
  return { id: k.id, name: k.name, description: '', conditions: '', required: k.required, reward: k.reward, rewardItems: [], ruleType: 'visit', stamps: k.stamps, completed: 2, color: null, icon: null, image: null, okno: null, expired: false, expiredStamps: 0, finishBy: null, daysLeft: null, nextCardFrom: null, finishedForever: false, validTill: null, limit: 0 };
}

function tierLabel(visits: number) { return visits >= 25 ? { id: 'gold', label: 'Zlatý host', discount: 10, nextAt: null, nextLabel: null } : visits >= 10 ? { id: 'silver', label: 'Stříbrný host', discount: 5, nextAt: 25, nextLabel: 'Zlatý host' } : { id: 'bronze', label: 'Člen', discount: 0, nextAt: 10, nextLabel: 'Stříbrný host' }; }

function meOdpoved(s: DemoStav) {
  const memberships = DEMO_PODNIKY.filter(p => s.clenstvi[p.slug]).map(p => {
    const c = s.clenstvi[p.slug];
    return {
      ...profil(p), points: c.points, stamps: 0, visits: c.visits, spend: c.spend, groupDiscounts: [], credit: c.credit, lastVisitAt: c.lastVisitAt,
      campaigns: c.kampane.map(kampanHosta), expiring: null,
      razitkaData: Object.fromEntries(c.kampane.map(k => [String(k.id), k.data.slice(-k.stamps)])),
      zebricek: s.nabidky.filter(n => n.slug === p.slug && n.costPoints > 0).map(n => ({ title: n.title, cost: n.costPoints })).slice(0, 5),
    };
  });
  const jmeno = (slug: string) => podnikDema(slug)?.name ?? slug;
  return {
    me: { id: DEMO_HOST.id, ...s.profil },
    memberships,
    reservations: s.rezervace.map(r => ({ ...r, business: jmeno(r.slug) })).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
    orders: s.objednavky.map(o => ({ ...o, business: jmeno(o.slug), currency: 'CZK' })),
    claims: s.claims.map(c => ({ ...c, business: jmeno(c.slug) })),
    today: s.dnes,
    poukazy: s.poukazy,
    nabidky: s.nabidky.map(n => {
      const p = podnikDema(n.slug)!;
      return { ...n, business: p.name, accent: p.accent, points: s.clenstvi[n.slug]?.points ?? 0 };
    }),
  };
}

function podnikOdpoved(s: DemoStav, slug: string) {
  const p = podnikDema(slug);
  if (!p) return null;
  const c = s.clenstvi[slug];
  const lv = tierLabel(c?.visits ?? 0);
  const coupons = s.nabidky.filter(n => n.slug === slug).map(n => ({ id: n.id, title: n.title, description: n.description, cost_points: n.costPoints, costPoints: n.costPoints, benefit: n.benefit, badges: [], valid_until: n.validUntil, validUntil: n.validUntil, blocked: null }));
  const kampane = c ? c.kampane : (p.stampTarget > 0 ? [{ id: 90 + p.teamId, name: p.stampReward, required: p.stampTarget, reward: p.stampReward, stamps: 0, data: [] }] : []);
  return {
    business: profil(p),
    bonus: slug === 'kavarna-u-lipy' ? { name: 'Šťastná hodina', multiplier: 2, stampBonus: 0, until: '10:00' } : null,
    menu: menuDema(slug),
    tables: p.orderingOn ? [{ id: 1, name: 'Stůl 1', seats: 2 }, { id: 2, name: 'Stůl 2', seats: 4 }, { id: 3, name: 'U okna', seats: 2 }] : [],
    plan: null,
    coupons,
    news: slug === 'kavarna-u-lipy' ? [{ id: 1, title: 'Nová sezónní nabídka', body: 'Od pátku dýňové latte a jablečný štrúdl s vanilkovou šlehačkou.', sent_at: `${dayPlus(s.dnes, -4)}T09:00:00Z` }]
      : slug === 'bistro-orech' ? [{ id: 2, title: 'Svatomartinské menu', body: 'Od 10. listopadu husa, lokše a mladé víno.', sent_at: `${dayPlus(s.dnes, -11)}T10:00:00Z` }] : [],
    events: slug === 'kavarna-u-lipy' ? [
      { id: 1, title: 'Degustace nové pražírny', description: 'Ochutnávka tří nových káv s pražičem. Vstup volný, místa omezená.', kind: 'event', date: dayPlus(s.dnes, 6), start_time: '18:00', end_time: '20:00', location: 'U nás v kavárně', offsite: false, capacity: 20, photos: [], menu: [], going: 7, myFollow: false, myGoing: false },
    ] : [],
    stampCampaigns: kampane.map(k => kampanHosta({ ...k, stamps: 0 })),
    banners: [],
    me: c ? {
      member: true, points: c.points, stamps: 0, visits: c.visits, credit: c.credit, spend: c.spend, tierBy: 'visits',
      level: lv.id, levelLabel: lv.label, discount: lv.discount, discountSource: lv.discount ? 'uroven' : null, discountName: null,
      nextTierAt: lv.nextAt, nextTierLabel: lv.nextLabel, nextTierUnit: 'visits',
      campaigns: c.kampane.map(kampanHosta), endedCampaigns: [],
      razitkaData: Object.fromEntries(c.kampane.map(k => [String(k.id), k.data.slice(-k.stamps)])),
      reservations: s.rezervace.filter(r => r.slug === slug && r.date >= s.dnes && ['requested', 'confirmed'].includes(r.status)),
      claims: s.claims.filter(x => x.slug === slug && !x.redeemed_at),
      levelDegraded: false,
    } : { member: false },
    signedIn: true,
    today: s.dnes,
  };
}

/** Volné časy: otevírací doba, předstih pro dnešek a pár obsazených časů (aby bylo co přeškrtnout). */
function slotyOdpoved(s: DemoStav, slug: string, den: string, osob: number) {
  const p = podnikDema(slug);
  if (!p) return null;
  const dny = Array.from({ length: 14 }, (_, i) => dayPlus(s.dnes, i)).map(d => ({ den: d, otevreno: slotsFor(p.hours as any, d, 30).length > 0 }));
  const vse = slotsFor(p.hours as any, den, 30, den === s.dnes ? nejdriveDnes(pragueHM()) : undefined);
  const plne = new Set(den === s.dnes ? ['18:30', '19:00'] : ['19:00', '19:30']);
  if (osob >= 6) { plne.add('18:00'); plne.add('20:00'); }
  return { den, osob, kapacita: true, sloty: vse.map(cas => ({ cas, volno: !plne.has(cas) })), dny };
}

async function obsluz(s: DemoStav, url: URL, metoda: string, telo: any): Promise<Response> {
  const p = url.pathname;
  const q = url.searchParams;
  if (p === '/api/auth/session') return json({ user: { id: String(DEMO_HOST.id), name: s.profil.name, email: DEMO_HOST.email, role: 'customer' }, expires: '2099-01-01T00:00:00.000Z' });
  if (p.startsWith('/api/auth/')) return json({});
  if (p === '/api/client/me' && metoda === 'GET') return json(meOdpoved(s));
  if (p === '/api/client/me' && metoda === 'PATCH') {
    if (typeof telo?.name === 'string' && telo.name.trim()) s.profil.name = telo.name.trim().slice(0, 80);
    if (typeof telo?.phone === 'string') s.profil.phone = telo.phone;
    if (typeof telo?.birthday === 'string') s.profil.birthday = telo.birthday;
    return json({ ok: true, me: { id: DEMO_HOST.id, ...s.profil } });
  }
  if (p === '/api/client/card') {
    if (!svgKarty) svgKarty = await QRCode.toString(KOD_KARTY, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#16181A', light: '#00000000' } });
    return json({ code: KOD_KARTY, name: s.profil.name, svg: svgKarty, wallet: { apple: false, google: false } });
  }
  if (p === '/api/client/me/zamer') {
    if (metoda === 'PUT') {
      const pod = podnikDema(String(telo?.slug));
      const cl = s.claims.find(c => c.id === Number(telo?.claimId) && c.slug === pod?.slug && !c.redeemed_at);
      if (!pod || !cl) return json({ error: 'Takovou odměnu nemáš.' }, 409);
      s.zamery = [...s.zamery.filter(z => z.teamId !== pod.teamId), { teamId: pod.teamId, claimId: cl.id, expiresAt: new Date(Date.now() + 7_200_000).toISOString() }];
    } else if (metoda === 'DELETE') {
      const pod = podnikDema(String(q.get('slug')));
      s.zamery = s.zamery.filter(z => z.teamId !== pod?.teamId);
    }
    return json({ ok: true, zamery: s.zamery });
  }
  if (p === '/api/client/card/stav') {
    const od = Number(q.get('od') ?? 0);
    const udalosti = od ? s.fronta.filter(u => u.n > od) : [];
    s.kurzor += 1;
    if (udalosti.length) s.fronta = [];
    return json({ kurzor: String(s.kurzor), udalosti });
  }
  if (p === '/api/client/me/aktivita') {
    if (metoda === 'POST') { s.aktivitaVideno = new Date().toISOString(); return json({ ok: true }); }
    const nove = s.aktivita.filter(a => !s.aktivitaVideno || a.at > s.aktivitaVideno).length;
    if (q.get('pocet')) return json({ neprecteno: nove });
    return json({ polozky: s.aktivita.slice().sort((a, b) => b.at.localeCompare(a.at)), neprecteno: nove, videno: s.aktivitaVideno });
  }
  if (p === '/api/client/me/historie') {
    const polozky = [
      ...s.aktivita.filter(a => a.typ === 'razitko').map(a => ({ key: a.id, typ: 'stamp', at: a.at, points: 0, credit: 0, title: null, business: a.podnik, slug: a.slug, currency: 'CZK' })),
      ...s.aktivita.filter(a => a.typ === 'body').map(a => ({ key: a.id, typ: 'points_earned', at: a.at, points: a.delta, credit: 0, title: null, business: a.podnik, slug: a.slug, currency: 'CZK' })),
      ...s.claims.filter(c => c.redeemed_at).map(c => ({ key: `U${c.id}`, typ: 'coupon_redeemed', at: c.redeemed_at, points: 0, credit: 0, title: c.title, business: podnikDema(c.slug)?.name, slug: c.slug, currency: 'CZK' })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return json({ polozky, dalsi: false, strana: 1, naStranu: 20 });
  }
  if (p === '/api/client/reviews') {
    if (metoda === 'POST') { s.aktivita = s.aktivita.filter(a => !(a.typ === 'hodnotit' && a.ref === telo?.ref)); return json({ ok: true }); }
    return json({ pending: s.aktivita.filter(a => a.typ === 'hodnotit').map(a => ({ ref: a.ref, kind: a.kind, business: a.podnik, slug: a.slug })) });
  }
  if (p === '/api/client/account/souhlasy') {
    if (metoda === 'POST') {
      const x = s.souhlasy.find(z => z.teamId === Number(telo?.teamId));
      if (x) { if (telo.typ === 'novinky_push') { x.push = !!telo.stav; if (!telo.stav) x.email = false; } else { x.email = !!telo.stav; if (telo.stav) x.push = true; } }
      return json({ ok: true, teamId: x?.teamId, push: x?.push, email: x?.email });
    }
    return json({ dostupne: true, podniky: s.souhlasy });
  }
  if (p === '/api/client/account/export') return json({ aplikace: 'Managero client', ukazka: true, host: s.profil });
  if (p === '/api/client/cards/moje') return json({ karty: [] });
  if (p === '/api/client/businesses') {
    return json({ signedIn: true, businesses: DEMO_PODNIKY.map(x => ({ ...profil(x), member: !!s.clenstvi[x.slug], members: x.members })) });
  }
  if (p === '/api/client/kod' && metoda === 'POST') {
    const kod = String(telo?.kod ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (kod === 'PODZIM') {
      s.clenstvi['kavarna-u-lipy'].points += 50;
      return json({ typ: 'promo', slug: 'kavarna-u-lipy', podnik: 'Kavárna U Lípy', title: 'Podzimní kód', points: 50, coupon: null });
    }
    const pod = DEMO_PODNIKY.find(x => x.slug.replace(/-/g, '').toUpperCase() === kod);
    if (pod) return json({ typ: 'podnik', slug: pod.slug, podnik: pod.name });
    return json({ error: 'Tenhle kód neznáme. Zkontroluj ho, nebo se zeptej obsluhy.' }, 404);
  }
  let m = /^\/api\/client\/b\/([^/]+)$/.exec(p);
  if (m) { const d = podnikOdpoved(s, m[1]); return d ? json(d) : json({ error: 'Podnik nenalezen' }, 404); }
  m = /^\/api\/client\/b\/([^/]+)\/sloty$/.exec(p);
  if (m) { const d = slotyOdpoved(s, m[1], q.get('den') ?? s.dnes, Number(q.get('osob') ?? 2)); return d ? json(d) : json({ error: 'Podnik nenalezen' }, 404); }
  m = /^\/api\/client\/b\/([^/]+)\/reservations$/.exec(p);
  if (m && metoda === 'POST') {
    const r = { id: s.dalsiId++, slug: m[1], date: String(telo?.date), time: String(telo?.time), party: Number(telo?.party) || 2, note: telo?.note || null, status: 'confirmed', created_at: new Date().toISOString(), guest_confirmed_at: null };
    s.rezervace.push(r);
    const pod = podnikDema(m[1]);
    s.aktivita.unshift({ id: `R${r.id}`, typ: 'rezervace', at: new Date().toISOString(), slug: m[1], podnik: pod?.name, accent: pod?.accent, stav: 'confirmed', date: r.date, time: r.time, party: r.party, odkaz: { rezervace: r.id } });
    return json({ ok: true, reservation: r });
  }
  if (m && metoda === 'PATCH') { const r = s.rezervace.find(x => x.id === Number(telo?.id)); if (r) r.guest_confirmed_at = new Date().toISOString(); return json({ ok: true, id: r?.id, guestConfirmed: true }); }
  m = /^\/api\/client\/reservations\/(\d+)$/.exec(p);
  if (m && metoda === 'PATCH') { const r = s.rezervace.find(x => x.id === Number(m![1])); if (r) r.status = 'cancelled'; return json({ ok: true }); }
  m = /^\/api\/client\/b\/([^/]+)\/coupons\/(\d+)\/claim$/.exec(p);
  if (m) {
    const n = s.nabidky.find(x => x.id === Number(m![2]));
    const c = s.clenstvi[m[1]];
    if (!n || !c) return json({ error: 'Kupon se nepodařilo vzít.' }, 400);
    if (c.points < n.costPoints) return json({ error: 'Na tenhle kupon zatím nemáš dost bodů.' }, 400);
    c.points -= n.costPoints;
    const code = `DMO-${String(s.dalsiId++).slice(-3)}`;
    s.claims.unshift({ id: s.dalsiId++, code, title: n.title, slug: m[1], kind: 'offer', benefit: n.benefit, valid_until: n.validUntil, claimed_at: new Date().toISOString(), redeemed_at: null });
    return json({ ok: true, code });
  }
  m = /^\/api\/client\/b\/([^/]+)\/join$/.exec(p);
  if (m) {
    const pod = podnikDema(m[1]);
    if (pod && !s.clenstvi[m[1]]) s.clenstvi[m[1]] = { points: 50, credit: 0, visits: 0, spend: 0, lastVisitAt: new Date().toISOString(), kampane: pod.stampTarget ? [{ id: 90 + pod.teamId, name: pod.stampReward, required: pod.stampTarget, reward: pod.stampReward, stamps: 0, data: [] }] : [] };
    return json({ ok: true, points: 50, novinky: !!telo?.novinky });
  }
  m = /^\/api\/client\/b\/([^/]+)\/reviews$/.exec(p);
  if (m) return json({ reviews: s.aktivita.filter(a => a.typ === 'odpoved' && a.slug === m![1]).map(a => ({ id: 1, rating: a.hodnoceni, note: a.poznamka, reply: a.text, repliedAt: a.at })) });
  m = /^\/api\/client\/b\/([^/]+)\/orders$/.exec(p);
  if (m) return json({ orders: [] });
  if (metoda !== 'GET') return json({ ok: true });
  return json({});
}

/** Simulace načtení karty u kasy: razítko (a uplatnění přibalené odměny) jako u skutečné čtečky. */
function nacteni(s: DemoStav, slug: string, prebalene: number[]) {
  const pod = podnikDema(slug); const c = s.clenstvi[slug];
  if (!pod || !c) return;
  const at = new Date().toISOString();
  const n = s.kurzor + 1;
  const k = c.kampane[0];
  if (k) {
    k.stamps = Math.min(k.required, k.stamps + 1); k.data.push(s.dnes);
    s.fronta.push({ n, id: `S${s.dalsiId++}`, typ: 'razitko', at, teamId: pod.teamId, slug, podnik: pod.name, accent: pod.accent, delta: 1, karta: { id: k.id, nazev: k.name, razitka: k.stamps, cil: k.required, odmena: k.reward } });
    s.aktivita.unshift({ id: `S${s.dalsiId++}`, typ: 'razitko', at, slug, podnik: pod.name, accent: pod.accent, delta: 1, karta: { nazev: k.name, razitka: k.stamps, cil: k.required } });
  }
  const body = Math.round(pod.pointsPer100 * 1.6);
  c.points += body; c.visits += 1; c.lastVisitAt = at;
  s.fronta.push({ n, id: `L${s.dalsiId++}`, typ: 'body', at, teamId: pod.teamId, slug, podnik: pod.name, accent: pod.accent, delta: body, zustatek: c.points });
  for (const id of prebalene) {
    const cl = s.claims.find(x => x.id === id && !x.redeemed_at);
    if (!cl) continue;
    cl.redeemed_at = at;
    s.zamery = s.zamery.filter(z => z.claimId !== id);
    s.fronta.push({ n, id: `U${id}`, typ: 'uplatneno', at, teamId: pod.teamId, slug, podnik: pod.name, accent: pod.accent, delta: 0, nazev: cl.title });
  }
}

/** Nainstaluje mock (idempotentně). Vrací funkci, která ho odinstaluje. */
export function nainstalujDemoHosta(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (window.__hostDemo) return () => {};
  const puvodni = window.fetch.bind(window);
  const stav = vytvorStavDema();
  window.__hostDemo = { stav, puvodni };
  window.__hostDemoNacteni = (slug, prebalene) => nacteni(stav, slug, prebalene);
  window.fetch = async (vstup: RequestInfo | URL, init?: RequestInit) => {
    const adresa = typeof vstup === 'string' ? vstup : vstup instanceof URL ? vstup.href : vstup.url;
    const url = new URL(adresa, window.location.origin);
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
      const metoda = String(init?.method ?? (typeof vstup === 'object' && 'method' in vstup ? (vstup as Request).method : 'GET')).toUpperCase();
      let telo: any = null;
      try { telo = init?.body ? JSON.parse(String(init.body)) : null; } catch { telo = null; }
      // Malá prodleva, ať ukázka působí jako skutečná aplikace (a skeletony nebliknou).
      await new Promise(r => setTimeout(r, 60));
      return obsluz(stav, url, metoda, telo);
    }
    if (url.origin !== window.location.origin) return Promise.reject(new TypeError('Ukázka nevolá cizí adresy.'));
    return puvodni(vstup as any, init);
  };
  return () => {
    if (!window.__hostDemo) return;
    window.fetch = window.__hostDemo.puvodni;
    delete window.__hostDemo; delete window.__hostDemoNacteni;
  };
}
