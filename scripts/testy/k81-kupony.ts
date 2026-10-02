// Kolo 81 — kupony a promo kódy: doplňky nad základem z kola 77 (w3-kupony.ts):
// kupon vázaný na položku nabídky, vyloučené položky a kategorie, historie změn před → po,
// export katalogu a vydaných kódů do CSV, hromadné akce.
//
// Čisté funkce (lib/kuponyPopisky.ts, kuponyPole.ts, kuponyZmeny.ts) se zkouší přímo; co sahá do
// databáze a UI, hlídají kontroly zdrojáků (ať se doplňky nedají omylem odpojit).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { benefitLabel, conditionBadges, odkazyList } from '../../lib/kuponyPopisky.ts';
import { normalizujKupon, zkontrolujKupon } from '../../lib/kuponyPole.ts';
import { popisZmen, vetaZmen, kuponyCsv, claimyCsv } from '../../lib/kuponyZmeny.ts';

const zdroj = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- kupon vázaný na položku nabídky ----
  eq('výhoda: zdarma bez položky je obecná', benefitLabel({ benefit_kind: 'free_item' }), 'Položka zdarma');
  eq('výhoda: zdarma s položkou ji jmenuje', benefitLabel({ benefit_kind: 'free_item', menu_item_name: 'Dezert dne' }), 'Zdarma: Dezert dne');
  eq('výhoda: sleva % na položku', benefitLabel({ benefit_kind: 'percent', percent_off: 20, menu_item_name: 'Dezert dne' }), 'Sleva 20 % na Dezert dne');
  eq('výhoda: sleva v měně na položku', benefitLabel({ benefit_kind: 'amount', amount_off: 30, menu_item_name: 'Dezert dne' }, n => `${n} €`), 'Sleva 30 € na Dezert dne');
  eq('výhoda: X+Y s položkou', benefitLabel({ benefit_kind: 'xy', xy_buy: 2, xy_free: 1, menu_item_name: 'Dezert dne' }), '2+1 zdarma: Dezert dne');
  eq('výhoda: bez položky beze změny', [benefitLabel({ benefit_kind: 'percent', percent_off: 15 }), benefitLabel({ benefit_kind: 'xy', xy_buy: 2 })], ['Sleva 15 %', '2+1 zdarma']);

  // ---- vyloučené položky a kategorie ----
  eq('odkazy: čistí se duplicity, nesmysly a texty z JSON', odkazyList('[{"itemId":3,"name":"Káva"},{"itemId":3},{"itemId":-1},{}]', 'itemId'), [{ id: 3, name: 'Káva' }]);
  eq('odkazy: kategorie', odkazyList([{ sectionId: '7', name: 'Dezerty' }], 'sectionId'), [{ id: 7, name: 'Dezerty' }]);
  eq('štítky: vyloučené se ukážou jako „mimo …“', conditionBadges({ excluded_items: [{ itemId: 1, name: 'Poukaz' }], excluded_sections: [{ sectionId: 2, name: 'Tabák' }] }), ['mimo: Poukaz, Tabák']);
  eq('štítky: dlouhý výčet se zkrátí', conditionBadges({ excluded_items: [1, 2, 3, 4, 5].map(i => ({ itemId: i, name: `P${i}` })) }), ['mimo: P1, P2, P3 a 2 dalších']);
  eq('štítky: bez vyloučení žádný štítek navíc', conditionBadges({ adult_only: true }), ['18+']);
  const f = normalizujKupon({ title: 'X', menuItemId: '12', excludedItems: [{ itemId: 5, name: 'Poukaz' }, { itemId: 5 }], excludedSections: [{ sectionId: 9, name: 'Tabák' }] });
  eq('pole: položka a vyloučení z formuláře', [f.menu_item_id, f.excluded_items, f.excluded_sections], [12, [{ itemId: 5, name: 'Poukaz' }], [{ sectionId: 9, name: 'Tabák' }]]);
  eq('pole: bez položky je null', normalizujKupon({ title: 'X' }).menu_item_id, null);
  eq('pole: kontrola kuponu s položkou projde', zkontrolujKupon(normalizujKupon({ title: 'X', benefitKind: 'free_item', menuItemId: 4 })), null);

  // ---- historie změn ----
  const stary = { title: 'Dezert', cost_points: 100, max_total: null, active: true, draft: false, target_tiers: [], excluded_items: [] };
  eq('historie: co se změnilo před → po', popisZmen(stary, { title: 'Dezert', cost_points: 150, max_total: 50 }), ['cena: 100 b. → 150 b.', 'limit kusů: — → 50']);
  eq('historie: beze změny nic', popisZmen(stary, { title: 'Dezert', cost_points: 100, active: true }), []);
  eq('historie: pole, která nepřišla, se nehlásí', popisZmen(stary, { cost_points: 100 }), []);
  eq('historie: vyloučené položky se porovnávají obsahem', popisZmen(stary, { excluded_items: [{ itemId: 4, name: 'A' }] }), ['vyloučené položky: 0 → 1']);
  eq('historie: koncept a zveřejnění', popisZmen(stary, { draft: true }), ['koncept: ne → ano']);
  ok('historie: věta do auditu má strop a nese název akce', (() => { const v = vetaZmen('upraven Dezert', Array.from({ length: 40 }, (_, i) => `pole ${i}: a → b`)); return v.startsWith('upraven Dezert: ') && v.length <= 280 && /dalších$/.test(v); })());
  eq('historie: bez změn polí je věta krátká', vetaZmen('upraven X', []), 'upraven X (beze změny polí)');

  // ---- CSV ----
  const dnes = '2026-10-02';
  const csv = kuponyCsv([
    { title: '=HYPERLINK("x")', cost_points: 100, benefit_kind: 'percent', percent_off: 15, claimed: 3, redeemed: 2, welcome: true, valid_until: '2026-12-31', max_total: 50 },
    { title: 'Dezert', cost_points: 0, benefit_kind: 'free_item', menu_item_name: 'Dezert dne', draft: true, adult_only: true },
  ], dnes, n => `${n} Kč`);
  const r = csv.trim().split('\r\n');
  ok('CSV kuponů: BOM, hlavička a dva řádky', csv.startsWith('﻿Název;Stav;Výhoda') && r.length === 3);
  ok('CSV kuponů: vzorec v buňce se neprovede, stav česky', r[1].includes("'=HYPERLINK") && r[1].includes('Aktivní') && r[2].includes('Koncept'));
  ok('CSV kuponů: výhoda s položkou a příznaky', r[2].includes('Zdarma: Dezert dne') && r[2].includes('ano'));
  const cl = claimyCsv([
    { title: 'Dezert', code: 'ABC-DEF', customer_name: 'Jana', claimed_at: '2026-09-28 10:00:00', redeemed_at: '2026-09-30 10:00:00', order_value: 250, staff_name: 'Eva', source: 'points', valid_until: null },
    { title: 'Dezert', code: 'GHI-JKL', customer_name: 'Petr', claimed_at: '2026-08-01 10:00:00', redeemed_at: null, valid_until: '2026-09-01', source: null },
  ], dnes).trim().split('\r\n');
  ok('CSV kódů: dny do uplatnění, útrata, obsluha a původ', cl[1].includes(';2;') && cl[1].includes('250') && cl[1].includes('Eva') && cl[1].includes('Za body') && cl[1].endsWith('uplatněno'));
  ok('CSV kódů: propadlý neuplatněný kód a neznámý původ', cl[2].endsWith('propadlo') && cl[2].includes('Neznámý'));

  // ---- Napojení ----
  const route = zdroj('app/api/client/admin/coupons/route.ts');
  ok('API: položka nabídky se ověřuje na tým a kupon ji ukládá i vyloučení', route.includes('polozkaTymu(') && route.includes('menu_item_id = ${f.menu_item_id}') && route.includes('excluded_sections = '));
  ok('API: úprava zapisuje do historie, co se přepsalo (popisZmen)', route.includes('popisZmen(cur, f)') && route.includes('vetaZmen('));
  ok('API: hromadné akce (PATCH s ids) a smazání přeskočí kupony s kódy', route.includes('Array.isArray(b.ids)') && route.includes('NOT EXISTS (SELECT 1 FROM client_coupon_claims'));
  ok('API: export katalogu a vydaných kódů do CSV', route.includes("vystup === 'kupony' || vystup === 'claimy'") && route.includes('kuponyCsv(') && route.includes('claimyCsv('));
  const hist = zdroj('app/api/client/admin/coupons/historie/route.ts');
  ok('historie: jen pro správce kuponů, jen kupony týmu, z auditního deníku', hist.includes("pozaduj('kupony.spravovat')") && hist.includes('team_id = ${ctx.teamId}') && hist.includes('FROM audit_log'));
  const init = zdroj('app/api/init/route.ts');
  ok('init: sloupce kuponu navíc', ['menu_item_id INTEGER', "excluded_items JSONB NOT NULL DEFAULT '[]'", "excluded_sections JSONB NOT NULL DEFAULT '[]'"].every(x => init.includes(x)));
  ok('host i obsluha vidí jméno položky (join na menu_items)', zdroj('app/api/client/b/[slug]/route.ts').includes('menu_item_name') && zdroj('app/api/client/admin/redeem/route.ts').includes('menu_item_name') && zdroj('app/api/client/staff/scan/route.ts').includes('menu_item_name'));
  const ui = zdroj('components/client/loyalty/Kupony.tsx');
  ok('UI: historie změn, export CSV a hromadný výběr v katalogu', ui.includes('<KuponyHistorie') && ui.includes('?export=claimy') && ui.includes("action: 'archivovat'") === false && ui.includes('hromadne('));
  ok('UI: editor má položku nabídky a vyloučené položky a kategorie', zdroj('components/client/loyalty/KuponyEditor.tsx').includes('Platí jen na položku') && zdroj('components/client/loyalty/KuponyEditor.tsx').includes('<VyberKategorii'));
  ok('audit: akce kuponů mají popisek', ['client.kupon', 'client.kupon.odeslan', 'client.kupon.uplatnen', 'client.promo'].every(k => zdroj('lib/auditPopisky.ts').includes(`'${k}'`)));
}
