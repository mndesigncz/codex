// Ukázková data správy Managero client (kolo 92): „Kavárna U Lípy (ukázka)" s hosty, rezervacemi,
// věrnostním programem, kampaněmi, kupony, poukazy, plastovými kartami a menu. Vše vymyšlené a jen pro
// /demo (mode=client); skutečná aplikace nic z toho nevidí. Hosté jsou jen křestním jménem
// a iniciálou příjmení, e-maily na doméně ukazka.example.
//
// Čísla drží pohromadě: útrata hosta = návštěvy × jeho průměrný účet, body = 10 za 100 Kč mínus
// utracené, razítka 0–9 z desetipolíčkové karty, segmenty (štamgasti, noví, chybí 45+ dní) vychází
// z dat posledních návštěv. Dny se počítají od dnešního dne v Praze (posunDen), žádné pevné datum.

import { dnes, posunDen } from '../cas';
import { MENU } from './menu';
import { VYCHOZI_THEME } from '@/lib/menuTheme';
import { narozeninyBlizko } from '@/lib/klientSprava/zdravi';

export const SLUG = 'kavarna-u-lipy';
export const NAZEV = 'Kavárna U Lípy (ukázka)';
export const BARVA = '#2E5E4E';

/** Host ukázky: dny jsou posuny od dneška (záporné = v minulosti). */
export interface HostDema {
  id: number; name: string; email: string; visits: number; avg: number; points: number; stamps: number;
  joined: number; last: number | null; birthday: string | null; groups: number[]; coupons: number; level: 'bronze' | 'silver' | 'gold' | 'platinum';
  reservations: number; poznamka?: string;
}

// [jméno, návštěvy, Ø účet, razítka, přidán (dní zpět), naposledy (dní zpět), narozeniny (za kolik dní), skupiny, kupony, poznámka]
const SUROVA: [string, number, number, number, number, number | null, number | null, number[], number, string?][] = [
  ['Jana N.', 41, 212, 9, 420, 0, null, [1], 1, 'Pije ovesné flat white, sedí u okna.'],
  ['Tereza M.', 38, 236, 7, 610, 2, 13, [1, 2], 2, 'Bez lepku — celiakie, pozor na koláče.'],
  ['Petr N.', 22, 188, 4, 300, 6, null, [1], 0],
  ['Klára Š.', 26, 174, 6, 365, 1, null, [1], 1],
  ['Ondřej B.', 4, 165, 4, 18, 9, null, [], 0],
  ['Marek S.', 17, 310, 7, 280, 12, 8, [], 0],
  ['Lucie K.', 33, 198, 3, 540, 3, null, [1], 1, 'Alergie na ořechy.'],
  ['Eva H.', 12, 142, 2, 200, 52, null, [], 0],
  ['David P.', 9, 260, 9, 150, 4, null, [], 1],
  ['Barbora V.', 3, 120, 3, 9, 3, null, [], 0],
  ['Tomáš R.', 28, 221, 8, 470, 1, 3, [1], 0],
  ['Anna L.', 6, 205, 6, 62, 47, null, [], 0],
  ['Jakub Č.', 2, 98, 2, 6, 6, null, [], 0],
  ['Veronika D.', 14, 189, 4, 230, 66, null, [], 0],
  ['Martin K.', 19, 256, 9, 330, 5, null, [2], 1],
  ['Kristýna P.', 1, 135, 1, 2, 2, null, [], 0],
  ['Filip M.', 7, 178, 7, 95, 58, null, [], 0],
  ['Adéla R.', 11, 166, 1, 180, 8, 9, [], 0],
  ['Lukáš V.', 24, 284, 4, 400, 14, null, [1], 0],
  ['Hana B.', 5, 150, 5, 40, 21, null, [], 1],
  ['Michal Z.', 16, 199, 6, 260, 91, null, [], 0],
  ['Pavla S.', 31, 176, 1, 590, 2, null, [1], 0, 'Laktóza — dává si rostlinné mléko.'],
  ['Jiří H.', 8, 342, 8, 120, 11, null, [2], 0],
  ['Nikola F.', 2, 110, 2, 14, 14, -9, [], 0],
  ['Simona T.', 20, 205, 0, 350, 3, null, [1], 1],
  ['Radek M.', 3, 230, 3, 25, 25, null, [], 0],
  ['Zuzana K.', 13, 158, 3, 210, 49, null, [], 0],
  ['Vojtěch N.', 1, 85, 1, 1, 1, null, [], 0],
  ['Monika J.', 18, 224, 8, 300, 7, null, [], 0],
  ['Štěpán L.', 10, 196, 0, 160, 10, null, [], 0],
  ['Alžběta G.', 4, 172, 4, 30, 30, null, [], 0],
  ['Daniel O.', 27, 238, 7, 500, 4, 1, [1, 2], 1],
  ['Gabriela Ř.', 6, 160, 6, 75, 75, null, [], 0],
  ['Roman Š.', 15, 265, 5, 240, 18, null, [], 0],
  ['Ivana Z.', 9, 140, 9, 110, 6, -13, [], 0],
  ['Patrik B.', 2, 125, 2, 11, 11, null, [], 0],
];

export const HOSTE: HostDema[] = SUROVA.map(([name, visits, avg, stamps, joined, last, bday, groups, coupons, poznamka], i) => {
  const spend = visits * avg;
  const level = visits >= 40 ? 'platinum' : visits >= 25 ? 'gold' : visits >= 10 ? 'silver' : 'bronze';
  const prijmeni = name.split(' ')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return {
    id: 101 + i, name, email: `${prijmeni}.${101 + i}@ukazka.example`, visits, avg, stamps,
    // 10 b. za 100 Kč, část už utracená za kupony.
    points: Math.max(0, Math.round(spend / 10) - Math.round(visits * 9.5)),
    joined: -joined, last: last == null ? null : -last, birthday: bday == null ? null : `1990-${posunDen(dnes(), bday).slice(5)}`, groups, coupons, level,
    reservations: Math.round(visits / 6), poznamka,
  };
});

export const SKUPINY = [
  { id: 1, name: 'Ranní štamgasti', color: '#7C9A6B', dynamic: false, archived: false },
  { id: 2, name: 'Firemní hosté', color: '#4A7DBF', dynamic: false, archived: false },
];

export const UROVNE: Record<HostDema['level'], string> = { bronze: 'Člen', silver: 'Stříbrný host', gold: 'Zlatý host', platinum: 'Platinový host' };

export const STOLY = [
  { id: 1, name: 'U okna', seats: 4, storyous_desk_id: '11', active: true },
  { id: 2, name: 'Velký stůl', seats: 8, storyous_desk_id: '12', active: true },
  { id: 3, name: 'Zahrádka 1', seats: 2, storyous_desk_id: null, active: true },
  { id: 4, name: 'Zahrádka 2', seats: 4, storyous_desk_id: null, active: true },
  { id: 5, name: 'Bar 3', seats: 3, storyous_desk_id: '15', active: true },
  { id: 6, name: 'Stůl 6', seats: 4, storyous_desk_id: '16', active: true },
  { id: 7, name: 'Stůl 7', seats: 2, storyous_desk_id: '17', active: true },
];

/** Otevírací doba ve tvaru teams.opening_hours: klíč dne „0" = pondělí … „6" = neděle. */
export const OTEVIRACI_DOBA: Record<string, { open: string; close: string; closed?: boolean }> = {
  0: { open: '07:30', close: '21:00' }, 1: { open: '07:30', close: '21:00' }, 2: { open: '07:30', close: '21:00' },
  3: { open: '07:30', close: '22:00' }, 4: { open: '07:30', close: '22:00' }, 5: { open: '09:00', close: '22:00' }, 6: { open: '09:00', close: '18:00' },
};

const hostPodleJmena = (jmeno: string) => HOSTE.find(h => h.name === jmeno)!;

/** Rezervace dne `den` pro posun `d` (0 = dnes). */
export function rezervaceDne(dnes: string, d: number): any[] {
  const den = posunDen(dnes, d);
  const r = (id: number, time: string, party: number, status: string, jmeno: string, table: number | null, note: string | null = null) => {
    const h = HOSTE.find(x => x.name === jmeno);
    const stul = STOLY.find(t => t.id === table);
    return {
      id, date: den, time, party, status, note,
      customer_id: h?.id ?? null, customer_name: jmeno, guest_name: jmeno,
      customer_email: h?.email ?? null, customer_phone: h ? `+420 7${String(h.id).padStart(2, '0')} ${200 + h.id} ${300 + h.id}` : '+420 603 555 120',
      table_id: table, table_name: stul?.name ?? null,
      customer_visits: h?.visits ?? null, customer_level: h?.level ?? null, customer_level_label: h ? UROVNE[h.level] : null,
      customer_spend: h ? h.visits * h.avg : null, customer_reservations: h?.reservations ?? null, customer_no_shows: h ? (h.id === 108 ? 2 : 0) : null,
      staff_notes: h?.poznamka ? [h.poznamka] : [], customer_groups: h ? SKUPINY.filter(g => h.groups.includes(g.id)).map(g => ({ name: g.name, color: g.color })) : [],
      customer_birthday_soon: h?.birthday ? narozeninyBlizko(h.birthday, den, 3) : false, created_by: h ? null : 1,
    };
  };
  if (d === 0) return [
    r(201, '08:30', 2, 'seated', 'Pavla S.', 7),
    r(202, '12:00', 3, 'confirmed', 'Pavel H.', 5, 'Zavolal ráno, přijde s kolegy.'),
    r(203, '17:30', 4, 'requested', 'Petr N.', 1, 'Oslava narozenin manželky, prosíme o klidnější stůl.'),
    r(204, '18:00', 2, 'confirmed', 'Tereza M.', 3),
    r(205, '18:30', 6, 'confirmed', 'Daniel O.', 2, 'Firemní posezení, platí jedním účtem.'),
    r(206, '19:30', 2, 'confirmed', 'Jana N.', 6),
    r(207, '20:00', 6, 'requested', 'Ondřej B.', null),
    r(208, '19:00', 4, 'confirmed', 'Lucie K.', 4),
  ];
  if (d === 1) return [
    r(211, '09:00', 2, 'confirmed', 'Klára Š.', 7),
    r(212, '18:00', 5, 'requested', 'Marek S.', 2, 'Narozeniny, přineseme vlastní dort.'),
    r(213, '19:30', 2, 'confirmed', 'Tomáš R.', 1),
  ];
  if (d === 2) return [r(221, '17:00', 4, 'confirmed', 'Martin K.', 6), r(222, '20:00', 2, 'requested', 'Barbora V.', null)];
  if (d === 4) return [r(231, '12:30', 8, 'confirmed', 'Lukáš V.', 2, 'Pracovní oběd.')];
  return [];
}

/** Hodnocení hostů (poslední dva měsíce). */
export function hodnoceni(dnes: string): any[] {
  const v = (id: number, rating: number, note: string | null, dni: number, jmeno: string, ref: string, reply: string | null = null) => ({
    id, ref, rating, note, created_at: `${posunDen(dnes, -dni)} 17:10:00`, customer_name: jmeno,
    crew: [{ name: 'Eliška Nováková', avatar: null }], reply, replied_at: reply ? `${posunDen(dnes, -dni + 1)} 09:00:00` : null, replied_by: reply ? 'Martin' : null, resolved: false,
  });
  return [
    v(1, 5, 'Nejlepší flat white v okolí a milá obsluha.', 1, 'Jana N.', 'ord:12'),
    v(2, 5, 'Skvělá obsluha, koláč byl výborný.', 3, 'Tereza M.', 'res:204', 'Děkujeme, Terezo! Těšíme se zas.'),
    v(3, 4, null, 4, 'Petr N.', 'res:14'),
    v(4, 2, 'Čekali jsme na kávu přes dvacet minut.', 6, 'Eva H.', 'ord:31'),
    v(5, 5, 'Krásná zahrádka, přijdeme znovu.', 9, 'Daniel O.', 'res:177'),
    v(6, 4, 'Dobrá snídaně, jen trochu hluk.', 12, 'Lucie K.', 'ord:40'),
    v(7, 5, null, 15, 'Tomáš R.', 'ord:44'),
    v(8, 5, 'Nejlepší kavárna v Brně.', 22, 'Martin K.', 'res:150'),
  ];
}

/** Profil podniku (tvar /api/client/admin/profile). */
export function profil(): any {
  return {
    enabled: true, slug: SLUG, team_name: NAZEV, loyalty_on: true, points_per_100: 10, cashback_pct: 0, cashback_mode: 'credit', stamp_target: 10, stamp_reward: 'Káva podle výběru',
    silver_at: 10, gold_at: 25, platinum_at: 40, member_discount: 0, silver_discount: 0, gold_discount: 5, platinum_discount: 10, tier_by: 'visits',
    reservations_on: true, ordering_on: true, max_party: 8, lead_days: 30, slot_minutes: 30, auto_confirm: true, auto_confirm_max_party: 4,
    description: 'Malá kavárna u staré lípy. Výběrová káva, domácí koláče a klidná zahrádka.', tagline: 'Výběrová káva a koláče od rána',
    address: 'Lipová 12, Brno', logo_url: '', cover_url: '', gallery: [], accent: BARVA, order_qr_required: true, order_geo: 'warn', lat: 49.1951, lng: 16.6068,
    geo_radius_m: 100, order_auto_pos: true, menu_slug: 'denni', opening_hours: OTEVIRACI_DOBA, welcome_points: 20, birthday_points: 0,
  };
}

/** Razítkové karty (tvar /api/client/admin/stamps). */
export const KAMPANE_RAZITEK = [
  {
    id: 1, team_id: 1, name: 'Kávová karta', description: 'Desátá káva od nás.', conditions: '', active: true, status: 'active', valid_since: null, valid_till: null,
    required_stamps: 10, rule_type: 'visit', stamp_items: [], excluded_items: [], min_value: null, min_value_multiple: false, one_per_order: false,
    reward_title: 'Káva podle výběru', reward_items: [], days_to_finish: 0, days_to_redeem: 30, repeat_mode: 'immediately', stack_cards: true, position: 1,
    max_completions: 0, daily_cap: 1, days_of_week: [], hour_from: null, hour_till: null, color: BARVA, icon: 'cup',
    stampItems: [], rewardItems: [], excludedItems: [], collectors: 128, openStamps: 512, completions: 61, rewardsIssued: 61, rewardsRedeemed: 41,
    milestones: [{ at: 5, title: 'Sirup do kávy zdarma' }],
  },
];

export const STATISTIKA_RAZITEK = {
  nazev: 'Kávová karta', potrebnych: 10, sbirajici: 128, otevrenaRazitka: 512, dokonceno: 61, razitekCelkem: 1122,
  odmenVydano: 61, odmenUplatneno: 41, odmenCeka: 20, prumernaDobaDni: 34, dobaZVzorku: 61,
  top: [{ customerId: 101, jmeno: 'Jana N.', dokonceno: 4, razitek: 9 }, { customerId: 102, jmeno: 'Tereza M.', dokonceno: 3, razitek: 7 }],
};

/** Kupony (tvar /api/client/admin/coupons — shapeCoupon). */
export const KUPONY = [
  { id: 1, title: 'Káva podle výběru', description: 'Odměna za plnou kávovou kartu.', kind: 'reward', cost_points: 0, discount_pct: 0, discount_amount: 0, active: true, archived: false, issued: 61, redeemed: 41, open: 20, valid_until: null, benefit: 'káva zdarma', target: 'all' },
  { id: 2, title: 'Koláč k flat white', description: 'Za 120 bodů domácí koláč ke kávě.', kind: 'points', cost_points: 120, discount_pct: 0, discount_amount: 0, active: true, archived: false, issued: 74, redeemed: 66, open: 8, valid_until: null, benefit: 'koláč zdarma', target: 'all' },
  { id: 3, title: 'Sleva 15 % na snídani', description: 'Ve všední dny do 10:00.', kind: 'offer', cost_points: 0, discount_pct: 15, discount_amount: 0, active: true, archived: false, issued: 40, redeemed: 17, open: 23, valid_until: null, benefit: '−15 %', target: 'all' },
  { id: 4, title: 'Narozeninový dezert', description: 'Dezert zdarma v týdnu narozenin.', kind: 'offer', cost_points: 0, discount_pct: 0, discount_amount: 0, active: true, archived: false, issued: 12, redeemed: 7, open: 5, valid_until: null, benefit: 'dezert zdarma', target: 'all' },
];

export const PROMO_KODY = [
  { id: 1, code: 'LIPA10', title: 'Sleva 10 % z letáku', discount_pct: 10, discount_amount: 0, uses: 34, max_uses: 200, active: true, valid_until: null, created_at: '2026-09-01 10:00:00' },
];

/** Plastové karty (tvar /api/client/cards). */
export function plastoveKarty(dnes: string): any {
  return {
    davky: [
      { id: 1, nazev: 'Pult u kasy', pocet: 100, nove: 38, aktivni: 61, blokovane: 1, created_at: `${posunDen(dnes, -80)} 10:00:00` },
      { id: 2, nazev: 'Zahrádka léto', pocet: 50, nove: 21, aktivni: 29, blokovane: 0, created_at: `${posunDen(dnes, -40)} 10:00:00` },
    ],
    pocty: { nova: 59, aktivni: 90, blokovana: 1 },
    zImportu: 0,
    karty: HOSTE.slice(0, 8).map((h, i) => ({
      id: 300 + i, kod: `L${String(4821 + i * 37).padStart(7, '0')}`, cislo: `0001 ${String(4821 + i * 37).padStart(4, '0')}`, stav: i === 7 ? 'blokovana' : 'aktivni',
      zdroj: 'davka', davkaId: i < 5 ? 1 : 2, hostId: h.id, host: h.name, bezAplikace: i % 3 === 0, activated_at: `${posunDen(dnes, -(10 + i * 4))} 12:00:00`,
    })),
    dalsi: false, smiSpravovat: true,
  };
}

/** Dárkové poukazy (tvar /api/client/admin/vouchers?prehled). */
export function poukazy(dnes: string): any {
  const p = (id: number, code: string, value: number, balance: number, stav: string, dni: number, recipient: string | null) => ({
    id, code, value_amount: value, balance, stav, valid_until: posunDen(dnes, 365 - dni), created_at: `${posunDen(dnes, -dni)} 11:00:00`, recipient_name: recipient, customer_name: recipient,
  });
  const seznam = [
    p(1, 'LIPA-7K2M-Q9', 1000, 1000, 'active', 4, 'Klára Š.'),
    p(2, 'LIPA-3HD8-PL', 500, 180, 'active', 22, 'Petr N.'),
    p(3, 'LIPA-9WX1-TT', 500, 0, 'used', 60, 'Eva H.'),
    p(4, 'LIPA-4NQ7-ZR', 750, 750, 'active', 2, null),
  ];
  return {
    poukazy: seznam, celkem: seznam.length,
    souhrn: { aktivnich: 3, zavazek: 1930, prodano30: 3, uplatneno30: 820, propada30: 0 },
  };
}

/** Kampaně (tvar /api/client/admin/broadcast). Výsledky = skutečné návštěvy příjemců (ukázka). */
export function kampane(dnes: string): any {
  const h = (id: number, title: string, body: string, audience: string, dni: number, recipients: number, po: number, pred: number, channels = 'push') => ({
    id, title, body, audience, status: 'sent', sent_at: `${posunDen(dnes, -dni)} 09:00:00`, scheduled_at: null, recipients, muted: Math.round(recipients * 0.12),
    channels, link_kind: 'page', visits_after: po, visits_before: pred, still_running: dni < 7, email_total: channels !== 'push' ? recipients : 0, email_pos: channels !== 'push' ? recipients : 0, email_sent: channels !== 'push' ? recipients - 1 : 0, email_failed: channels !== 'push' ? 1 : 0,
  });
  return {
    history: [
      { id: 9, title: 'Dýňový koláč je zpátky', body: 'Od pátku znovu pečeme dýňový koláč. Přijď ochutnat.', audience: 'all', status: 'scheduled', scheduled_at: `${posunDen(dnes, 2)} 08:30:00`, sent_at: `${posunDen(dnes, 2)} 08:30:00`, recipients: 0, channels: 'push', link_kind: 'page' },
      h(8, 'Tento týden dvojitá razítka', 'Do neděle dostaneš za každou návštěvu dvě razítka.', 'quiet', 3, 31, 9, 2),
      h(7, 'Nová výběrová káva z Etiopie', 'Ovocná, jemná, s tónem borůvky. Na baru do konce měsíce.', 'all', 12, 132, 71, 64, 'push+email'),
      h(6, 'Ranní sleva pro štamgasty', 'Ve všední dny do 10:00 sleva 15 % na snídani.', 'group:1', 26, 14, 12, 11),
    ],
    members: HOSTE.length, segments: { quiet: 9, 'quiet:60': 4, 'quiet:90': 1, 'birthday:month': 5, 'near:stamps': 7, 'near:points': 6, 'new:14': 5 }, quiet: 9,
    silver: HOSTE.filter(x => x.level !== 'bronze').length, gold: HOSTE.filter(x => x.level === 'gold' || x.level === 'platinum').length, platinum: HOSTE.filter(x => x.level === 'platinum').length,
    groups: SKUPINY.map(g => ({ id: g.id, name: g.name, members: HOSTE.filter(x => x.groups.includes(g.id)).length })),
    limit: { odeslano: 0, max: 5 },
    prilohy: { kupony: KUPONY.filter(k => k.kind === 'offer').map(k => ({ id: k.id, title: k.title })), promoKody: PROMO_KODY.map(p => ({ id: p.id, code: p.code, title: p.title })) },
    slug: SLUG, nazevPodniku: NAZEV,
  };
}

/** Automatizace: všechny recepty vypnuté (Martinovo pravidlo), jen připravené k zapnutí. */
export function automatizace(): any {
  const druhy = ['uvitani', 'prvni_navsteva', 'dokoncena_karta', 'narozeniny_kupon', 'chybis_nam'];
  return {
    pravidla: druhy.map(druh => ({ druh, enabled: false, config: null, enabled_at: null })),
    pocty: {}, log: [], kupony: KUPONY.filter(k => k.kind === 'offer').map(k => ({ id: k.id, title: k.title })), muzePravidla: true,
  };
}

/** Menu pro hosty (tvar /api/menu → boards). Položky z lib/demo/data/menu.ts, ať sedí s Financemi. */
export function menuDesky(): any[] {
  const sekce = [...new Set(MENU.map(m => m.category))];
  return [{
    id: 1, slug: 'denni', name: 'Denní menu', eyebrow: 'Kavárna U Lípy', title: 'Menu', note: 'Alergeny ti rádi řekneme u baru.',
    wifiSsid: 'ULipy-host', wifiPassword: 'kafe2026', currency: 'CZK', enabled: true, hasPin: false, theme: VYCHOZI_THEME,
    sections: sekce.map((s, i) => ({
      id: 10 + i, title: s, column: (i % 2 === 0 ? 1 : 2) as 1 | 2,
      items: MENU.filter(m => m.category === s).map((m, j) => ({
        id: 100 + i * 10 + j, name: m.name, price: m.price, description: null, soldOut: m.name === 'Domácí koláč' ? false : false,
        posProductId: m.productId, posPrice: m.price, allergens: m.category === 'Pečivo' ? [1, 3, 7] : m.category === 'Káva' ? [7] : [], tags: [],
      })),
    })),
    langs: { vychozi: 'cs', dalsi: [] },
  }];
}

/** Host na čtečce u kasy (tvar GET /api/client/staff/scan). */
export function hostNaCtecce(): any {
  const h = hostPodleJmena('Jana N.');
  return {
    customer: { id: h.id, name: h.name }, member: true, points: h.points, visits: h.visits, spend: h.visits * h.avg, credit: 0, stamps: h.stamps,
    lastVisit: new Date(Date.now() - 6 * 86400000).toISOString(), tier: 'platinum', levelLabel: 'Platinový host', discount: 10, discountSource: 'uroven', discountName: null,
    birthdayToday: false, stampedToday: false,
    campaigns: [{ id: 1, name: 'Kávová karta', ruleType: 'visit', stamps: h.stamps, required: 10, reward: 'Káva podle výběru', canStamp: true, color: BARVA, icon: 'cup', milestones: [{ at: 5, title: 'Sirup do kávy zdarma' }] }],
    openCoupons: [{ code: 'K7Q2M9', title: 'Káva podle výběru', benefit: 'káva zdarma', fromStamps: true, validUntil: null }],
    affordable: [{ id: 2, title: 'Koláč k flat white', cost_points: 120 }],
    rules: { pointsPer100: 10, stampTarget: 10, stampReward: 'Káva podle výběru', cashbackPct: 0 },
    bills: [], parovani: null, polozky: [], posledniAkce: null,
    nextTierAt: null, nextTierLabel: null, nextTierUnit: 'visits',
  };
}
