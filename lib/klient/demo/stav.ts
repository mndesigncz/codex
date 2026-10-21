// Ukázka hosta bez databáze (/client/demo): stav v paměti prohlížeče ve tvaru skutečných odpovědí API.
// Všechno je vymyšlené (podniky, host, ceny) a vztažené k dnešku v Praze, takže ukázka nestárne.
// Nic z toho nejde na server (lib/klient/demo/mock.ts odpovídá dřív, než požadavek opustí prohlížeč).

import { pragueToday, dayPlus, pragueHM } from '../../pragueTime';
import { DEMO_HOST } from './hostDemo';

export interface DemoPodnik {
  slug: string; teamId: number; name: string; tagline: string; description: string; address: string; accent: string;
  phone: string; hours: Record<string, { open: string; close: string } | { closed: true }>;
  reservationsOn: boolean; orderingOn: boolean; loyaltyOn: boolean; pointsPer100: number; stampTarget: number; stampReward: string;
  member: boolean; members: number;
}

const HODINY_KAVARNA = { '0': { open: '09:00', close: '18:00' }, '1': { open: '07:30', close: '20:00' }, '2': { open: '07:30', close: '20:00' }, '3': { open: '07:30', close: '20:00' }, '4': { open: '07:30', close: '21:00' }, '5': { open: '08:00', close: '21:00' }, '6': { open: '09:00', close: '18:00' } };
const HODINY_BISTRO = { '0': { closed: true as const }, '1': { open: '11:00', close: '22:00' }, '2': { open: '11:00', close: '22:00' }, '3': { open: '11:00', close: '22:00' }, '4': { open: '11:00', close: '23:00' }, '5': { open: '11:00', close: '23:00' }, '6': { open: '12:00', close: '22:00' } };

export const DEMO_PODNIKY: DemoPodnik[] = [
  { slug: 'kavarna-u-lipy', teamId: 1, name: 'Kavárna U Lípy', tagline: 'Výběrová káva, snídaně a klid na práci', description: 'Malá kavárna v přízemí starého domu na Lipové. Pražíme si sami, pečeme každé ráno a u okna se dá v klidu pracovat.', address: 'Lipová 12, Brno', accent: '#2E5E4E', phone: '+420 777 100 200', hours: HODINY_KAVARNA, reservationsOn: true, orderingOn: true, loyaltyOn: true, pointsPer100: 5, stampTarget: 10, stampReward: 'Káva podle výběru', member: true, members: 214 },
  { slug: 'bistro-orech', teamId: 2, name: 'Bistro Ořech', tagline: 'Polední menu a večeře z lokálních surovin', description: 'Sezónní kuchyně, denní menu od jedenácti a večery s vínem z Moravy.', address: 'Kounicova 8, Brno', accent: '#7A3E2B', phone: '+420 777 300 400', hours: HODINY_BISTRO, reservationsOn: true, orderingOn: false, loyaltyOn: true, pointsPer100: 10, stampTarget: 0, stampReward: '', member: true, members: 389 },
  { slug: 'bar-pod-vezi', teamId: 3, name: 'Bar Pod Věží', tagline: 'Koktejly, víno a malé talíře', description: 'Malý bar se sklepem, domácími sirupy a jazzem ve čtvrtek.', address: 'Starobrněnská 4, Brno', accent: '#3B5BA9', phone: '+420 777 500 600', hours: HODINY_KAVARNA, reservationsOn: true, orderingOn: false, loyaltyOn: true, pointsPer100: 5, stampTarget: 8, stampReward: 'Koktejl dle výběru', member: false, members: 96 },
  { slug: 'pekarna-kvasek', teamId: 4, name: 'Pekárna Kvásek', tagline: 'Kváskový chléb a croissanty od šesti ráno', description: 'Kváskový chléb, máslové croissanty a filtr s sebou.', address: 'Údolní 21, Brno', accent: '#B9862F', phone: '+420 777 700 800', hours: HODINY_KAVARNA, reservationsOn: false, orderingOn: false, loyaltyOn: true, pointsPer100: 5, stampTarget: 6, stampReward: 'Croissant', member: false, members: 152 },
];

const MENU_KAVARNA = [
  { id: 11, title: 'Káva', items: [
    { id: 101, name: 'Espresso', price: 59, description: 'Etiopie Guji, ovocná a jemná' },
    { id: 102, name: 'Flat white', price: 79, description: 'Dvojité espresso, mléko' },
    { id: 103, name: 'Filtr dne', price: 69, description: 'V60, mění se každý den' },
    { id: 104, name: 'Dýňové latte', price: 89, description: 'Sezónní, s domácím sirupem' },
  ] },
  { id: 12, title: 'Snídaně', items: [
    { id: 111, name: 'Croissant s máslem a džemem', price: 69, description: 'Máslový, z Pekárny Kvásek' },
    { id: 112, name: 'Vajíčka benedikt', price: 179, description: 'Kváskový chléb, šunka, holandská omáčka', alergeny: ['1', '3', '7'] },
    { id: 113, name: 'Granola s jogurtem', price: 129, description: 'Domácí granola, sezónní ovoce', alergeny: ['7', '8'] },
  ] },
  { id: 13, title: 'Sladké', items: [
    { id: 121, name: 'Jablečný štrúdl', price: 79, description: 'S vanilkovou šlehačkou', alergeny: ['1', '3', '7'] },
    { id: 122, name: 'Mrkvový dort', price: 89, description: '' },
  ] },
];
const MENU_BISTRO = [
  { id: 21, title: 'Polední menu', items: [
    { id: 201, name: 'Dýňový krém s pečeným česnekem', price: 79, description: '' },
    { id: 202, name: 'Konfitovaná kachna, červené zelí, knedlík', price: 219, description: '' },
    { id: 203, name: 'Rizoto s hříbky a parmazánem', price: 189, description: '', alergeny: ['7'] },
  ] },
  { id: 22, title: 'Večer', items: [
    { id: 211, name: 'Hovězí líčka na víně', price: 329, description: 'Bramborové pyré, glazovaná mrkev' },
    { id: 212, name: 'Pstruh z Pstružného potoka', price: 299, description: 'Máslová omáčka, brambory' },
  ] },
];

export interface DemoStav {
  dnes: string;
  profil: { name: string; email: string; phone: string; birthday: string; novinky: boolean; novinkyEmail: boolean };
  clenstvi: Record<string, { points: number; credit: number; visits: number; spend: number; lastVisitAt: string; kampane: { id: number; name: string; required: number; reward: string; stamps: number; data: string[] }[] }>;
  claims: { id: number; code: string; title: string; slug: string; kind: string; benefit: string | null; valid_until: string | null; claimed_at: string; redeemed_at: string | null }[];
  nabidky: { id: number; slug: string; title: string; description: string; costPoints: number; benefit: string | null; validUntil: string | null }[];
  rezervace: { id: number; slug: string; date: string; time: string; party: number; note: string | null; status: string; created_at: string; guest_confirmed_at: string | null }[];
  objednavky: { id: number; slug: string; items: { count: number; name: string }[]; total: number; status: string; created_at: string }[];
  poukazy: any[];
  souhlasy: { teamId: number; podnik: string; slug: string; push: boolean; email: boolean }[];
  aktivitaVideno: string | null;
  aktivita: any[];
  zamery: { teamId: number; claimId: number; expiresAt: string }[];
  /** Události u kasy čekající na dotaz /card/stav (tlačítko „Ukázat načtení“). */
  fronta: any[];
  kurzor: number;
  dalsiId: number;
}

const iso = (den: string, hm: string) => `${den}T${hm}:00.000Z`;

export function vytvorStavDema(): DemoStav {
  const dnes = pragueToday();
  const d = (n: number) => dayPlus(dnes, n);
  const hm = pragueHM();
  return {
    dnes,
    profil: { name: DEMO_HOST.name, email: DEMO_HOST.email, phone: '+420 777 123 456', birthday: '1992-05-14', novinky: true, novinkyEmail: true },
    clenstvi: {
      'kavarna-u-lipy': { points: 320, credit: 0, visits: 23, spend: 4980, lastVisitAt: iso(d(-2), '08:12'), kampane: [{ id: 1, name: 'Káva podle výběru', required: 10, reward: 'Káva podle výběru', stamps: 8, data: [d(-48), d(-41), d(-34), d(-27), d(-20), d(-13), d(-9), d(-2)] }] },
      'bistro-orech': { points: 640, credit: 0, visits: 11, spend: 6420, lastVisitAt: iso(d(-6), '12:40'), kampane: [] },
    },
    claims: [
      { id: 501, code: 'KV4-821', title: 'Káva podle výběru', slug: 'kavarna-u-lipy', kind: 'stamps', benefit: null, valid_until: d(70), claimed_at: iso(d(-2), '08:12'), redeemed_at: null },
      { id: 502, code: 'ORE-8F2', title: '−20 % na dort k narozeninám', slug: 'bistro-orech', kind: 'offer', benefit: '−20 %', valid_until: d(3), claimed_at: iso(d(-4), '10:00'), redeemed_at: null },
      { id: 490, code: 'SRP-4QK', title: 'Sirup do kávy zdarma', slug: 'kavarna-u-lipy', kind: 'offer', benefit: null, valid_until: null, claimed_at: iso(d(-30), '09:00'), redeemed_at: iso(d(-27), '08:40') },
    ],
    nabidky: [
      { id: 61, slug: 'kavarna-u-lipy', title: 'Croissant ke kávě', description: 'K jakékoli kávě do 10:00.', costPoints: 150, benefit: null, validUntil: d(40) },
      { id: 62, slug: 'kavarna-u-lipy', title: 'Snídaně pro dva', description: 'Dvě snídaně a dvě kávy.', costPoints: 600, benefit: null, validUntil: d(60) },
      { id: 71, slug: 'bistro-orech', title: 'Dezert dne', description: 'K polednímu menu.', costPoints: 300, benefit: null, validUntil: null },
      { id: 72, slug: 'bistro-orech', title: 'Oběd zdarma', description: 'Jedno polední menu.', costPoints: 600, benefit: null, validUntil: null },
      { id: 73, slug: 'bistro-orech', title: 'Večeře pro dva', description: 'Tři chody a láhev vína.', costPoints: 1000, benefit: null, validUntil: null },
    ],
    rezervace: [
      { id: 31, slug: 'bistro-orech', date: dnes, time: hm < '19:00' ? '19:30' : '20:30', party: 2, note: 'Stůl u okna', status: 'confirmed', created_at: iso(d(-3), '15:00'), guest_confirmed_at: null },
      { id: 29, slug: 'kavarna-u-lipy', date: d(-9), time: '10:00', party: 3, note: null, status: 'done', created_at: iso(d(-12), '18:00'), guest_confirmed_at: null },
    ],
    objednavky: [
      { id: 71, slug: 'kavarna-u-lipy', items: [{ count: 2, name: 'Flat white' }, { count: 1, name: 'Croissant s máslem a džemem' }], total: 227, status: 'done', created_at: iso(d(-2), '08:10') },
    ],
    poukazy: [
      { id: 3, code: 'DP-4K9Q-22MX', balance: 650, value: 1000, currency: 'CZK', validUntil: d(200), stav: 'active', design: 'klasik', business: 'Kavárna U Lípy', slug: 'kavarna-u-lipy' },
    ],
    souhlasy: [
      { teamId: 1, podnik: 'Kavárna U Lípy', slug: 'kavarna-u-lipy', push: true, email: true },
      { teamId: 2, podnik: 'Bistro Ořech', slug: 'bistro-orech', push: true, email: false },
    ],
    aktivitaVideno: iso(d(-3), '12:00'),
    aktivita: [
      { id: 'S1', typ: 'razitko', at: iso(d(-2), '08:12'), slug: 'kavarna-u-lipy', podnik: 'Kavárna U Lípy', accent: '#2E5E4E', delta: 1, karta: { nazev: 'Káva podle výběru', razitka: 8, cil: 10 } },
      { id: 'O1', typ: 'odmena', at: iso(d(-2), '08:12'), slug: 'kavarna-u-lipy', podnik: 'Kavárna U Lípy', accent: '#2E5E4E', nazev: 'Káva podle výběru' },
      { id: 'R31', typ: 'rezervace', at: iso(d(-3), '15:04'), slug: 'bistro-orech', podnik: 'Bistro Ořech', accent: '#7A3E2B', stav: 'confirmed', date: dnes, time: hm < '19:00' ? '19:30' : '20:30', party: 2, odkaz: { rezervace: 31 } },
      { id: 'N1', typ: 'novinka', at: iso(d(-4), '09:00'), slug: 'kavarna-u-lipy', podnik: 'Kavárna U Lípy', accent: '#2E5E4E', titul: 'Nová sezónní nabídka', text: 'Od pátku dýňové latte a jablečný štrúdl s vanilkovou šlehačkou.' },
      { id: 'A1', typ: 'odpoved', at: iso(d(-5), '17:20'), slug: 'kavarna-u-lipy', podnik: 'Kavárna U Lípy', accent: '#2E5E4E', hodnoceni: 5, poznamka: 'Skvělý flat white a klid na práci.', text: 'Díky, Jano! Příští týden máme novou Etiopii, přijď ochutnat.' },
      { id: 'L1', typ: 'body', at: iso(d(-6), '12:41'), slug: 'bistro-orech', podnik: 'Bistro Ořech', accent: '#7A3E2B', delta: 42, zustatek: 640 },
      { id: 'H29', typ: 'hodnotit', at: iso(d(-9), '11:30'), slug: 'kavarna-u-lipy', podnik: 'Kavárna U Lípy', accent: '#2E5E4E', ref: 'res:29', kind: 'reservation' },
      { id: 'N2', typ: 'novinka', at: iso(d(-11), '10:00'), slug: 'bistro-orech', podnik: 'Bistro Ořech', accent: '#7A3E2B', titul: 'Svatomartinské menu', text: 'Od 10. listopadu husa, lokše a mladé víno. Rezervace doporučujeme.' },
    ],
    zamery: [],
    fronta: [],
    kurzor: 1,
    dalsiId: 1000,
  };
}

export function podnikDema(slug: string): DemoPodnik | undefined { return DEMO_PODNIKY.find(p => p.slug === slug); }

export function menuDema(slug: string) {
  const sekce = slug === 'bistro-orech' ? MENU_BISTRO : MENU_KAVARNA;
  return {
    slug: 'denni', name: 'Nabídka', currency: 'CZK',
    sections: sekce.map(s => ({ id: s.id, title: s.title, items: s.items.map(i => ({ ...i, soldOut: false })) })),
    alergenyNazvy: { '1': 'lepek', '3': 'vejce', '7': 'mléko', '8': 'ořechy' },
    alergenyPoznamka: null, alergenyNeuplne: false,
  };
}
