// Věrnost: body, úrovně a cashback — úplnost (kolo 80, okruh B) nad základem z kola 77 (w2-body.ts).
//
// Čistá logika (lib/bodyPravidla.ts): strop za den, násobič podle úrovně (a vyšší z něj a z akce),
// zaokrouhlení „nahoru“ a „zbytek se přenáší“, uvítací body, validace nových polí, propadání kreditu,
// storno účtenky, oznámení o poklesu úrovně. Plus hlídání napojení: že připsání jde jedním místem
// (odmenaZUctu), že storno visí na synchronizaci účtenek, že DDL v init sedí s lazy příkazy.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  spoctiOdmenu, pravidlaBoduZProfilu, nasobicUrovne, uvitaciBody, validujPravidla, novaPolePravidel, vetyOOmezeni,
  rozlisDenikKreditu, castKreditem, castStorna, oznameniPoklesu, vylouceneSekceZProfilu, popisZmenyPravidel,
  type PravidlaBodu,
} from '../../lib/bodyPravidla.ts';
import { planPropadani } from '../../lib/propadaniBodu.ts';

const zdroj = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const R = (o: Partial<PravidlaBodu> = {}): PravidlaBodu => ({
  pointsPer100: 5, round: 'sta', minSpend: 0, capPerBill: 0, excludePrepaid: true, cashbackPct: 0, capPerDay: 0, multSilver: 1, multGold: 1, multPlatinum: 1, ...o,
});
const money = (n: number) => `${n} Kč`;

export default function ({ eq, ok }: Testy) {
  // ---- zaokrouhlení: nahoru a přenos zbytku ----
  eq('zaokrouhlení: nahoru (251 Kč, 5 b./100)', spoctiOdmenu(251, R({ round: 'nahoru' })).points, 13);
  eq('zaokrouhlení: nahoru, plovoucí čárka nepřidá bod navíc (30 Kč, 1 b./100)', spoctiOdmenu(30, R({ round: 'nahoru', pointsPer100: 1 })).points, 1);
  const c1 = spoctiOdmenu(250, R({ round: 'prenos' }));
  eq('přenos zbytku: z 250 jsou body za 200 a zbytek 50', [c1.points, c1.zbytekNovy], [10, 50]);
  const c2 = spoctiOdmenu(250, R({ round: 'prenos' }), { zbytek: c1.zbytekNovy });
  eq('přenos zbytku: další útrata 250 + 50 = 300 → body za 300, zbytek 0', [c2.points, c2.zbytekNovy], [15, 0]);
  eq('přenos zbytku: bez režimu přenosu se zbytek nepřenáší', spoctiOdmenu(250, R(), { zbytek: 90 }).zbytekNovy, 0);
  eq('přenos zbytku: pod minimem zůstává původní zbytek', spoctiOdmenu(50, R({ round: 'prenos', minSpend: 100 }), { zbytek: 40 }).zbytekNovy, 40);

  // ---- strop za den ----
  const den = spoctiOdmenu(10000, R({ capPerDay: 500 }), { dnesUzBodu: 450 });
  eq('strop za den: dnes už 450, zbývá 50', [den.points, den.duvody.includes('strop_den')], [50, true]);
  eq('strop za den: vyčerpaný = nula', spoctiOdmenu(1000, R({ capPerDay: 500 }), { dnesUzBodu: 500 }).points, 0);
  eq('strop za den: nula = bez stropu', spoctiOdmenu(100000, R()).points, 5000);
  ok('strop za den: věta pro obsluhu', vetyOOmezeni(den, R({ capPerDay: 500 }), money).some(v => /za den/.test(v)));
  const obe = spoctiOdmenu(10000, R({ capPerBill: 200, capPerDay: 500 }), { dnesUzBodu: 450 });
  eq('strop za den i na účtenku: platí přísnější', obe.points, 50);

  // ---- násobič podle úrovně ----
  const m = R({ multGold: 1.5, multSilver: 1.2 });
  eq('násobič úrovně: Člen vždy 1×', nasobicUrovne(m, 'bronze'), 1);
  eq('násobič úrovně: zlatý 1,5× z 20 bodů je 30', spoctiOdmenu(400, m, { uroven: 'gold' }).points, 30);
  eq('násobič úrovně: stříbrný 1,2× z 20 bodů je 24', spoctiOdmenu(400, m, { uroven: 'silver' }).points, 24);
  const akce = spoctiOdmenu(400, m, { uroven: 'gold', bonusNasobic: 2, bonusNazev: 'Happy hour' });
  eq('násobič: akce 2× a úroveň 1,5× → platí vyšší, ne součin', [akce.points, akce.nasobic], [40, 2]);
  const urov = spoctiOdmenu(400, m, { uroven: 'gold', bonusNasobic: 1.2 });
  eq('násobič: úroveň 1,5× je vyšší než akce 1,2×', [urov.points, urov.nasobic], [30, 1.5]);
  ok('násobič: popis jde do poznámky', akce.nasobicPopis.includes('Happy hour') && urov.nasobicPopis.includes('za úroveň'));
  eq('násobič: vyšší úroveň nemá míň než ta pod ní', nasobicUrovne(R({ multSilver: 2, multGold: 1, multPlatinum: 1 }), 'platinum'), 2);
  eq('násobič: strop na účtenku platí až po násobiči', spoctiOdmenu(1000, R({ multGold: 3, capPerBill: 60 }), { uroven: 'gold' }).points, 60);
  eq('násobič: profil → pravidla, poškozená hodnota je 1', pravidlaBoduZProfilu({ mult_gold: 'abc', mult_silver: 9 }).multGold, 1);

  // ---- uvítací body ----
  eq('uvítací body: bez nastavení dřívější chování (10, když jsou body za útratu)', [uvitaciBody({ points_per_100: 5 }), uvitaciBody({ points_per_100: 0 })], [10, 0]);
  eq('uvítací body: nastavená hodnota včetně nuly vyhrává', [uvitaciBody({ welcome_points: 25, points_per_100: 0 }), uvitaciBody({ welcome_points: 0, points_per_100: 5 })], [25, 0]);
  eq('uvítací body: poškozená hodnota se ořízne', uvitaciBody({ welcome_points: 99999 }), 1000);
  ok('uvítací body: připojení hosta čte nastavení, ne pevných 10', (() => { const j = zdroj('app/api/client/b/[slug]/join/route.ts'); return j.includes('uvitaciBody(p)') && !/award\([^)]*, 10,/.test(j); })());

  // ---- vyloučené kategorie ----
  eq('vyloučené kategorie: čistí se duplicity a nesmysly', vylouceneSekceZProfilu([{ sectionId: 3, name: 'Poukazy' }, { sectionId: 3 }, { sectionId: -1 }, {}, { sectionId: '7' }]).map(x => x.sectionId), [3, 7]);
  eq('vyloučené kategorie: z JSON textu', vylouceneSekceZProfilu('[{"sectionId":4,"name":"Tabák"}]'), [{ sectionId: 4, name: 'Tabák' }]);
  eq('platba kreditem: poukaz a věrnostní se sečtou, hotovost ne', castKreditem({ voucher: 100, loyalty: 50, bank: 70 }), 150);
  eq('platba kreditem: bez rozpadu nula', castKreditem(null), 0);

  // ---- validace nových polí ----
  const chyby = (v: Record<string, unknown>) => validujPravidla(v).map(c => c.pole).sort();
  eq('validace: strop za den menší než na účtenku je chyba', chyby({ points_cap_per_bill: 300, points_cap_per_day: 100 }), ['points_cap_per_day']);
  eq('validace: násobič pod 1 a nad 5 je chyba', chyby({ mult_silver: 0.5, mult_gold: 6 }), ['mult_gold', 'mult_silver']);
  eq('validace: násobič s desetinnou čárkou projde', chyby({ mult_gold: '1,5' }), []);
  eq('validace: uvítací body mají meze', chyby({ welcome_points: 1001 }), ['welcome_points']);
  eq('validace: propadnutí kreditu pod 7 dní je chyba, 0 je vypnuto', [chyby({ credit_expire_days: 6 }), chyby({ credit_expire_days: 0 }), chyby({ credit_expire_days: 90 })], [['credit_expire_days'], [], []]);
  ok('formulář: nová pole jdou do PUT', ['points_cap_per_day', 'mult_gold', 'welcome_points', 'credit_expire_days', 'points_exclude_sections'].every(k => k in novaPolePravidel({})));
  ok('historie změn: nová pole mají popisek před → po', popisZmenyPravidel({ mult_gold: 1, credit_expire_days: 0 }, { mult_gold: 1.5, credit_expire_days: 90 }, money).join(';') === 'Násobič zlato: 1× → 1,5×;Propadnutí kreditu: vypnuto → po 90 dnech');

  // ---- propadání kreditu ----
  const D = '2026-10-01';
  const denik = [
    { credit_delta: 100, kind: 'cashback', ref: 'bill:1', created_at: '2026-01-05 10:00:00' },
    { credit_delta: 50, kind: 'cashback', ref: 'bill:2', created_at: '2026-09-25 10:00:00' },
    { credit_delta: -30, kind: 'credit', ref: 'card', created_at: '2026-02-01 10:00:00' },
    { credit_delta: 0, kind: 'expire', ref: 'cwarn:2026-09-20', created_at: '2026-09-20 05:00:00' },
  ];
  const rk = rozlisDenikKreditu(denik, D);
  eq('kredit: upozornění se ze vstupu vyřadí a zapamatuje', [rk.vstup.length, rk.poslednVarovani], [3, '2026-09-20']);
  eq('kredit: nejstarší se spotřebuje první, utracených 30 ubralo, propadne 70', planPropadani(rk.vstup, 120, D, 90).propadne, 70);
  eq('kredit: nikdy víc než zůstatek', planPropadani(rk.vstup, 20, D, 90).propadne, 20);
  eq('kredit: den propadnutí se pozná', rozlisDenikKreditu([{ credit_delta: -70, kind: 'expire', ref: `cexp:${D}`, created_at: '2026-10-01 03:00:00' }], D).dnesUz, true);
  eq('kredit: body (delta) se do kreditu nepletou', rozlisDenikKreditu([{ credit_delta: 0, kind: 'manual', created_at: '2026-01-01 10:00:00' }], D).vstup.length, 0);

  // ---- storno účtenky ----
  eq('storno: celá účtenka vrací zbývající', castStorna(40, 0, 1), 40);
  eq('storno: už vrácené se nevrací podruhé', castStorna(40, 40, 1), 0);
  eq('storno: poměrná část', castStorna(40, 0, 0.5), 20);
  eq('storno: poměr nad 100 % se ořízne', castStorna(40, 10, 5), 30);
  eq('storno: záporná hodnota nic', castStorna(-5, 0, 1), 0);

  // ---- pokles úrovně ----
  const o = oznameniPoklesu('silver', 'Kavárna');
  ok('oznámení poklesu: jmenuje podnik i novou úroveň', /Kavárna/.test(o.title) && /Stříbrný/.test(o.title) && /klesla/.test(o.title));

  // ---- Napojení ----
  const client = zdroj('lib/client.ts');
  ok('deník: award i awardCredit zapisují skutečnou změnu (FOR UPDATE)', (client.match(/FOR UPDATE/g) ?? []).length >= 2 && client.includes('MAX_ZUSTATEK') && client.includes("'storno'"));
  ok('deník: storno se nepočítá mezi utracené body', client.includes("kind NOT IN ('expire', 'storno')"));
  const scan = zdroj('app/api/client/staff/scan/route.ts');
  ok('kasa: účtenka i částka jdou přes odmenaZUctu s hostem a bonusem (násobič úrovně, strop za den)', (scan.match(/odmenaZUctu\([^\n]*customerId: c\.id, bonus/g) ?? []).length === 2);
  ok('kasa: zrušená účtenka se nenabízí a nepřipíše', scan.includes('b.refunded = FALSE AND b.deleted = FALSE') && scan.includes('byla v pokladně zrušena nebo vrácena'));
  ok('kasa: kredit z rozpadu plateb v pokladně (castKreditem) a zápis připsaného pro storno', scan.includes('castKreditem(pb?.other_methods)') && scan.includes('zapisPripsaneZaUctenku('));
  ok('objednávka: body přes odmenaZUctu s hostem, jedním místem', zdroj('lib/clientOrders.ts').includes('customerId: Number(o.customer_id), bonus') && zdroj('lib/clientOrders.ts').includes('zapisZbytek('));
  ok('storno: visí na konci synchronizace účtenek', zdroj('lib/posMirror.ts').includes('stornujUctenky(teamId)'));
  const db = zdroj('lib/bodyPravidlaDb.ts');
  ok('storno: obě cesty Storyous (příznak na původní, opravná se záporem) a idempotence', db.includes('b.refunded = TRUE OR b.deleted = TRUE') && db.includes('refunded_bill_id IS NOT NULL') && db.includes("'storno:' || r.bill_id") && db.includes('reversed_at IS NULL'));
  const init = zdroj('app/api/init/route.ts');
  const sloupce = Array.from(db.matchAll(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)/g)).map(x => `${x[1]} ADD COLUMN IF NOT EXISTS ${x[2]}`);
  ok('schéma: každý lazy sloupec je i v init (kontrola SQL čte odtud)', sloupce.length >= 20 && sloupce.every(s => init.includes(`ALTER TABLE ${s}`)));
  ok('init: denně propadá kredit a kontroluje se pokles úrovně', /await propadniKredit\(\)/.test(init) && /await oznamPoklesyUrovni\(\)/.test(init));
  const profil = zdroj('app/api/client/admin/profile/route.ts');
  ok('profil: nová pole mají oprávnění a zapnutí propadání kreditu si pamatuje den', profil.includes("credit_expire_days: 'vernost.pravidla'") && profil.includes('credit_expire_since'));
  const hostApi = zdroj('app/api/client/b/[slug]/route.ts');
  ok('host: kredit a snížená úroveň na stránce podniku', hostApi.includes('creditExpiring') && hostApi.includes('levelDegraded') && zdroj('components/client/BusinessPage.tsx').includes('creditExpiring'));
  ok('host: pravidla získávání zmiňují uvítání, propadání kreditu a pokles úrovně', zdroj('components/client/loyalty/HostPravidla.tsx').includes("case 'propadani_kreditu'") && zdroj('lib/hostPrehled.ts').includes("druh: 'pokles_urovne'"));
  const tabs = zdroj('components/client/LoyaltyTabs.tsx');
  ok('věrnost: nová pravidla (násobiče, uvítání, kredit) jsou v obrazovce a tarif Max se vysvětluje předem', tabs.includes('<BodyNasobiceKredit') && tabs.includes('!maMax'));
  const prehledy = zdroj('lib/bodyPrehledy.ts');
  ok('přehledy: výnosnost (útrata z účtenek, cashback, náklad) a poukazy v závazku', prehledy.includes('vynosnost') && prehledy.includes('FROM client_vouchers') && zdroj('components/client/loyalty/BodyPrehledy.tsx').includes('Výnosnost za období'));
}
