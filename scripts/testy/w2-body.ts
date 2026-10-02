// W2 — Body, úrovně, cashback, přehledy.
//
// Hlídá hlavně to, co bylo pokažené: deník, který se se zůstatkem rozešel (odepsání víc, než host
// má), prahy úrovní, které formulář a server chápaly jinak (2000 × 500/1000), zbytky po
// floor(částka/100), den v UTC místo pražského a „členové u kasy" počítaní z každého řádku deníku.
// Dál nová pravidla (minimum, strop, kredit/poukaz, vyloučené položky, zaokrouhlení), snížení
// úrovně po pauze, oznámení o postupu, přehledy a CSV. Souběhy: jedna logika zůstatku
// (skutečnaZmena) nad paralelními připsáními — součet deníku musí sedět se zůstatkem.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  spoctiOdmenu, pravidlaBoduZProfilu, vetyOOmezeni, cenaVyloucenychPolozek, validujPravidla, popisZmenyPravidel, vetaZmenPravidel,
  skutecnaZmena, jeNavstevaZDeniku, druhOdkazu, zdrojBodu, souhrnZdroju, zdrojRadkuDeniku, hodnotaBodu, denikCsv, csvPoleDeniku,
  vylouceneZProfilu, novaPolePravidel, obdobiZDotazu, jeRazeni, cisloCs, mesiceNeaktivity,
  MAX_PRAH_NAVSTEV, MAX_PRAH_UTRATY, MAX_ZUSTATEK, MAX_VYLOUCENYCH_POLOZEK, POLE_PRAVIDEL,
  type PravidlaBodu,
} from '../../lib/bodyPravidla.ts';
import { tierFor, tierForMember, tierRulesFromProfile, jeNeaktivni, snizenaUroven } from '../../lib/clientSlots.ts';
import { jePostup, textPostupu } from '../../lib/urovnePostup.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Zdroják bez řádkových komentářů — komentáře o opraveném chování mluví o starém záměrně. */
const bezKomentaru = (s: string) => s.split('\n').filter(l => !/^\s*(\/\/|\/?\*|\{\/\*)/.test(l)).join('\n');

const PRAVIDLA: PravidlaBodu = { pointsPer100: 5, round: 'sta', minSpend: 0, capPerBill: 0, excludePrepaid: true, cashbackPct: 0 };
const money = (n: number) => `${n} Kč`;

export default async function ({ eq, ok }: Testy) {
  // ---- výpočet odměny: dosavadní chování zůstává ----
  {
    let shoda = true;
    for (const [ppc, pct] of [[5, 0], [10, 3], [1, 50], [0, 7], [100, 1]] as const) {
      for (let c = 0; c <= 5000; c += 7) {
        const o = spoctiOdmenu(c, { ...PRAVIDLA, pointsPer100: ppc, cashbackPct: pct });
        if (o.points !== Math.floor(c / 100) * ppc || o.cashback !== Math.floor(c * pct / 100)) shoda = false;
      }
    }
    ok('odměna: s výchozími pravidly přesně dosavadní vzorec (floor(částka/100) × body)', shoda);
  }
  eq('odměna: 250 za celé stovky dá body za 200', spoctiOdmenu(250, PRAVIDLA).points, 10);
  eq('odměna: poměrně dolů z 250 → 12', spoctiOdmenu(250, { ...PRAVIDLA, round: 'dolu' }).points, 12);
  eq('odměna: poměrně na nejbližší z 250 → 13', spoctiOdmenu(250, { ...PRAVIDLA, round: 'nejblizsi' }).points, 13);
  eq('odměna: poměrně na nejbližší, 99 při 5 b./100 → 5', spoctiOdmenu(99, { ...PRAVIDLA, round: 'nejblizsi' }).points, 5);
  eq('odměna: pod stovkou za celé stovky nedá nic (zbytek propadá)', spoctiOdmenu(99, PRAVIDLA).points, 0);
  eq('odměna: záporná, nečíselná a prázdná částka = nula', [spoctiOdmenu(-5, PRAVIDLA).points, spoctiOdmenu('abc', PRAVIDLA).points, spoctiOdmenu(null, PRAVIDLA).castka], [0, 0, 0]);
  eq('odměna: 0 bodů za stovku = žádné body, cashback běží dál', (() => { const o = spoctiOdmenu(1000, { ...PRAVIDLA, pointsPer100: 0, cashbackPct: 5 }); return [o.points, o.cashback]; })(), [0, 50]);

  // minimum, strop
  {
    const p = { ...PRAVIDLA, minSpend: 150 };
    const pod = spoctiOdmenu(140, p);
    eq('minimum: pod minimem žádné body a důvod', [pod.points, pod.duvody], [0, ['pod_minimem']]);
    eq('minimum: na minimu body jsou', spoctiOdmenu(150, p).points, 5);
    eq('minimum: cashback minimem není dotčen', spoctiOdmenu(140, { ...p, cashbackPct: 10 }).cashback, 14);
    const strop = spoctiOdmenu(10_000, { ...PRAVIDLA, capPerBill: 50 });
    eq('strop: velký účet se ořízne a řekne proč', [strop.points, strop.duvody], [50, ['strop']]);
    eq('strop: účet pod stropem beze změny', spoctiOdmenu(300, { ...PRAVIDLA, capPerBill: 50 }).duvody, []);
  }

  // kredit/poukaz a vyloučené položky
  {
    const o = spoctiOdmenu(500, { ...PRAVIDLA, cashbackPct: 10 }, { predplaceno: 200 });
    eq('kredit: část zaplacená kreditem se nepočítá (body i cashback)', [o.zaklad, o.points, o.cashback, o.duvody], [300, 15, 30, ['predplaceno']]);
    eq('kredit: vypnuté pravidlo počítá celý účet', spoctiOdmenu(500, { ...PRAVIDLA, excludePrepaid: false }, { predplaceno: 200 }).points, 25);
    eq('kredit: víc než účet se ořízne na účet', spoctiOdmenu(300, PRAVIDLA, { predplaceno: 9999 }).zaklad, 0);
    const v = spoctiOdmenu(500, PRAVIDLA, { vylouceno: 150, predplaceno: 100 });
    eq('vyloučené položky: odečtou se po kreditu', [v.zaklad, v.points, v.duvody], [250, 10, ['predplaceno', 'polozky']]);
    eq('vyloučené položky: nikdy víc než zbývá z účtu', spoctiOdmenu(100, PRAVIDLA, { predplaceno: 80, vylouceno: 500 }).vylouceno, 20);
    eq('vyloučené položky: cena z účtenky = cena za kus × počet jen u vyloučených produktů',
      cenaVyloucenychPolozek([
        { productId: 'a', amount: 2, price: 45 }, { productId: 'b', amount: 1, price: 100 },
        { productId: null, amount: 1, price: 50 }, { productId: 'a', amount: 1, price: null },
      ], new Set(['a'])), 90);
    eq('vyloučené položky: nesmyslné množství se přeskočí', cenaVyloucenychPolozek([{ productId: 'a', amount: -1, price: 10 }, { productId: 'a', amount: NaN, price: 10 }], new Set(['a'])), 0);
  }
  eq('věty: omezení se řeknou lidsky v měně podniku', vetyOOmezeni(spoctiOdmenu(500, { ...PRAVIDLA, capPerBill: 5 }, { predplaceno: 200 }), { ...PRAVIDLA, capPerBill: 5 }, money),
    ['200 Kč zaplaceno kreditem nebo poukazem se nepočítá', 'strop 5 b. na účtenku']);
  eq('věty: minimum se řekne lidsky', vetyOOmezeni(spoctiOdmenu(140, { ...PRAVIDLA, minSpend: 150 }), { ...PRAVIDLA, minSpend: 150 }, money), ['body se dávají od 150 Kč (z tohohle účtu se počítá 140 Kč)']);
  eq('pravidla z profilu: chybějící sloupce = dosavadní chování', pravidlaBoduZProfilu({ points_per_100: 5, cashback_pct: 2 }),
    { pointsPer100: 5, round: 'sta', minSpend: 0, capPerBill: 0, excludePrepaid: true, cashbackPct: 2 });
  eq('pravidla z profilu: nesmysl se ořízne, neznámé zaokrouhlení je výchozí', (() => { const r = pravidlaBoduZProfilu({ points_per_100: 9999, points_round: 'hack', cashback_pct: -3, points_cap_per_bill: 'x' }); return [r.pointsPer100, r.round, r.cashbackPct, r.capPerBill]; })(), [100, 'sta', 0, 0]);
  eq('vyloučené položky z profilu: duplicity, nesmysly a strop počtu', (() => {
    const v = vylouceneZProfilu([{ itemId: 1, name: 'A' }, { itemId: 1, name: 'B' }, { itemId: 'x' }, { itemId: -4 }, ...Array.from({ length: 80 }, (_, i) => ({ itemId: i + 10, name: 'p' }))]);
    return [v.length, v[0].name];
  })(), [MAX_VYLOUCENYCH_POLOZEK, 'A']);
  eq('vyloučené položky: JSON text z databáze', vylouceneZProfilu('[{"itemId":3,"name":"X"}]'), [{ itemId: 3, name: 'X' }]);
  eq('vyloučené položky: rozbitý JSON = nic', vylouceneZProfilu('{rozbitý'), []);

  // ---- poctivá změna zůstatku a souběh ----
  eq('zůstatek: odečet víc, než host má → skutečná změna jen k nule', skutecnaZmena(200, -500), { nove: 0, zmena: -200 });
  eq('zůstatek: odečet z nuly nic nezmění', skutecnaZmena(0, -50), { nove: 0, zmena: 0 });
  eq('zůstatek: běžné připsání', skutecnaZmena(10, 5), { nove: 15, zmena: 5 });
  eq('zůstatek: strop INTEGER', skutecnaZmena(MAX_ZUSTATEK - 3, 100), { nove: MAX_ZUSTATEK, zmena: 3 });
  eq('zůstatek: nečíselná změna = nula', skutecnaZmena(7, NaN), { nove: 7, zmena: 0 });
  {
    // Atomický „příkaz": čtení a zápis bez přerušení — to dělá jeden SQL s FOR UPDATE. Souběžná volání
    // se řadí za sebe a každé vidí výsledek předchozího; součet deníku proto vždy sedí se zůstatkem.
    let zustatek = 100;
    const denik: number[] = [];
    let fronta: Promise<unknown> = Promise.resolve();
    const award = (delta: number) => {
      const krok = fronta.then(async () => {
        await new Promise(r => setTimeout(r, Math.random() * 3));
        const r = skutecnaZmena(zustatek, delta);
        zustatek = r.nove;
        if (r.zmena !== 0) denik.push(r.zmena);
        return r.nove;
      });
      fronta = krok.catch(() => {});
      return krok;
    };
    const zmeny = [30, -50, 20, -500, 10, -5, 40, -90, 15, 15, -1000, 7, 7, 7];
    await Promise.all(zmeny.map(d => award(d)));
    eq('souběh: součet deníku + počátek = zůstatek (14 paralelních změn)', 100 + denik.reduce((a, b) => a + b, 0), zustatek);
    ok('souběh: zůstatek nikdy záporný', zustatek >= 0);
  }
  {
    // Starý způsob: čtení a zápis zvlášť — ztrácí změny. Test dokládá, proč je potřeba jeden příkaz.
    let zustatek = 0;
    const naivni = async (d: number) => { const precteno = zustatek; await new Promise(r => setTimeout(r, 1)); zustatek = precteno + d; };
    await Promise.all([naivni(10), naivni(10), naivni(10)]);
    ok('souběh: čtení a zápis zvlášť by ztratilo změny (proto jeden příkaz)', zustatek < 30);
  }
  {
    const zdroj = bezKomentaru(precti('lib/client.ts'));
    ok('award: zůstatek a deník v jednom příkazu (FOR UPDATE), deník dostává skutečnou změnu', /FOR UPDATE/.test(zdroj)
      && /VALUES \(\$\{teamId\}, \$\{customerId\}, \$\{change\}, \$\{kind\}/.test(zdroj) && /\$\{change\}, \$\{kind\}, \$\{ref \?\? null\}, \$\{note \?\? null\}(, \$\{staffId\})?\)`;/.test(zdroj) && /return \{ points: po/.test(zdroj));
    ok('award: starý příkaz GREATEST(0, points + delta) s plným delta v deníku je pryč', !/GREATEST\(0, points \+ \$\{delta\}\)/.test(zdroj) && !/GREATEST\(0, credit \+ /.test(zdroj));
    ok('award: součet se počítá v bigint (nepřeteče INTEGER)', /s\.points::bigint \+ \$\{d\}::bigint/.test(zdroj) && /s\.credit::bigint \+ \$\{d\}::bigint/.test(zdroj));
  }

  // ---- validace pravidel ----
  const dobra = { points_per_100: 5, cashback_pct: 3, tier_by: 'visits', silver_at: 10, gold_at: 25, platinum_at: 0, member_discount: 0, silver_discount: 5, gold_discount: 10, platinum_discount: 0 };
  eq('validace: dobrá pravidla bez chyb (vypnutá platina s nižší slevou nevadí)', validujPravidla(dobra), []);
  eq('validace: zlato nad stříbrem', validujPravidla({ ...dobra, gold_at: 10 }).map(c => c.pole), ['gold_at']);
  eq('validace: platina nad zlatem, nebo 0', validujPravidla({ ...dobra, platinum_at: 20 }).map(c => c.pole), ['platinum_at']);
  eq('validace: sleva s úrovní neklesá', validujPravidla({ ...dobra, silver_discount: 5, gold_discount: 2 }).map(c => c.pole), ['gold_discount']);
  eq('validace: zapnutá platina musí mít slevu aspoň jako zlato', validujPravidla({ ...dobra, platinum_at: 100, platinum_discount: 3 }).map(c => c.pole), ['platinum_discount']);
  eq('validace: práh návštěv nad MAX_PRAH_NAVSTEV', validujPravidla({ ...dobra, gold_at: MAX_PRAH_NAVSTEV + 1 }).map(c => c.pole), ['gold_at']);
  eq('validace: práh na hranici projde (formulář i server berou stejnou konstantu)', validujPravidla({ ...dobra, gold_at: MAX_PRAH_NAVSTEV }), []);
  eq('validace: režim útraty kontroluje prahy útraty, ne návštěv', validujPravidla({ ...dobra, tier_by: 'spend', silver_spend: 5000, gold_spend: 15000, platinum_spend: 0, gold_at: 1 }), []);
  eq('validace: útrata nad MAX_PRAH_UTRATY', validujPravidla({ ...dobra, tier_by: 'spend', silver_spend: 5, gold_spend: MAX_PRAH_UTRATY + 1 }).map(c => c.pole), ['gold_spend']);
  eq('validace: prázdné a desetinné pole', validujPravidla({ points_per_100: '', cashback_pct: '2,5' }).map(c => c.pole), ['points_per_100', 'cashback_pct']);
  eq('validace: neposlaná pole se přeskočí (částečný PUT)', validujPravidla({ cashback_pct: 3 }), []);
  eq('validace: strop, minimum a pauza mají meze', validujPravidla({ points_cap_per_bill: -1, points_min_spend: 1e9, tier_inactive_months: 99 }).map(c => c.pole).sort(), ['points_cap_per_bill', 'points_min_spend', 'tier_inactive_months']);
  eq('validace: neznámé zaokrouhlení', validujPravidla({ points_round: 'hack' }).map(c => c.pole), ['points_round']);
  ok('validace: každá zpráva je česká věta a jmenuje pole', validujPravidla({ gold_at: 1, silver_at: 5, tier_by: 'visits' }).every(c => /[a-zá-ž]/i.test(c.text) && c.text.length > 10));
  ok('validace: POLE_PRAVIDEL obsahuje každé pole, které validace zná', ['points_round', 'points_min_spend', 'points_cap_per_bill', 'tier_inactive_months', 'silver_at', 'platinum_spend'].every(k => (POLE_PRAVIDEL as readonly string[]).includes(k)));
  eq('formulář: nová pole do PUT (přidaná pole se nesmí ztratit)', Object.keys(novaPolePravidel({})).sort(),
    ['points_cap_per_bill', 'points_exclude_items', 'points_exclude_prepaid', 'points_min_spend', 'points_round', 'tier_inactive_months']);
  {
    // Nesoulad UI × server: dřív UI 2000, server 500/1000.
    const server = bezKomentaru(precti('app/api/client/admin/profile/route.ts'));
    const ui = bezKomentaru(precti('components/client/LoyaltyTabs.tsx'));
    ok('prahy: server bere MAX_PRAH_NAVSTEV, žádné 500/1000/2000 natvrdo', /silver_at, Number\(cur\.silver_at\) \|\| 10, 1, MAX_PRAH_NAVSTEV/.test(server)
      && /gold_at, Number\(cur\.gold_at\) \|\| 25, 2, MAX_PRAH_NAVSTEV/.test(server) && /platinum_at, Number\(cur\.platinum_at\) \|\| 0, 0, MAX_PRAH_NAVSTEV/.test(server)
      && !/silver_at, [^)]*, 500\)/.test(server) && !/gold_at, [^)]*, 1000\)/.test(server));
    ok('prahy: formulář bere stejné konstanty (ne 2000 natvrdo)', /MAX_PRAH_NAVSTEV/.test(ui) && /MAX_PRAH_UTRATY/.test(ui) && !/max=\{podleUtraty \? 100000000 : 2000\}/.test(ui));
    ok('prahy: server kontroluje pravidla jako celek přes validujPravidla', /validujPravidla\(spojene\)/.test(server));
    ok('prahy: formulář kontroluje před odesláním, ne až po chybě ze serveru', /validujPravidla\(telo\)/.test(ui));
  }

  // ---- úrovně: pauza ----
  {
    const r = { silverAt: 5, goldAt: 10, platinumAt: 20, silverDiscount: 5, goldDiscount: 10, platinumDiscount: 15, inactiveMonths: 6 };
    const ted = Date.UTC(2026, 9, 2, 12);
    const pred7m = new Date(Date.UTC(2026, 2, 1)).toISOString();
    const pred3m = new Date(Date.UTC(2026, 6, 20)).toISOString();
    ok('pauza: 7 měsíců bez návštěvy při limitu 6 = neaktivní', jeNeaktivni(pred7m, 6, ted));
    ok('pauza: 3 měsíce = aktivní', !jeNeaktivni(pred3m, 6, ted));
    ok('pauza: vypnuto (0) = nikdy neaktivní', !jeNeaktivni(pred7m, 0, ted));
    ok('pauza: bez zaznamenané návštěvy se úroveň nesnižuje (nový člen, import)', !jeNeaktivni(null, 6, ted) && !jeNeaktivni('', 6, ted) && !jeNeaktivni('nesmysl', 6, ted));
    ok('pauza: čas z databáze bez zóny (UTC) se čte', jeNeaktivni('2026-03-01 10:00:00', 6, ted) && !jeNeaktivni('2026-08-01 10:00:00', 6, ted));
    ok('pauza: Date objekt', jeNeaktivni(new Date(pred7m), 6, ted));
    eq('pauza: platina → zlato', snizenaUroven(tierFor(25, r), r).id, 'gold');
    eq('pauza: zlato → stříbro, sleva podle nové úrovně', (() => { const t = snizenaUroven(tierFor(12, r), r); return [t.id, t.discount, t.reduced]; })(), ['silver', 5, true]);
    eq('pauza: stříbro → člen', snizenaUroven(tierFor(6, r), r).id, 'bronze');
    eq('pauza: člen zůstává členem a není „snížený"', (() => { const t = snizenaUroven(tierFor(1, r), r); return [t.id, t.reduced ?? false]; })(), ['bronze', false]);
    eq('pauza: tierForMember bez neaktivity = dosavadní úroveň', tierForMember({ visits: 12, lastVisitAt: pred3m }, r).id, 'gold');
    // Date.now() uvnitř tierForMember: čerstvá návštěva nikdy nesnižuje, stará ano
    eq('pauza: tierForMember s dávnou návštěvou snižuje o stupeň', tierForMember({ visits: 12, lastVisitAt: '2020-01-01T00:00:00Z' }, r).id, 'silver');
    eq('pauza: tierForMember bez limitu nesnižuje ani po letech', tierForMember({ visits: 12, lastVisitAt: '2020-01-01T00:00:00Z' }, { ...r, inactiveMonths: 0 }).id, 'gold');
    eq('pauza: profil → pravidla nese počet měsíců', tierRulesFromProfile({ tier_inactive_months: 4 }).inactiveMonths, 4);
    eq('pauza: mesiceNeaktivity ořízne do rozsahu', [mesiceNeaktivity({ tier_inactive_months: 99 }), mesiceNeaktivity({}), mesiceNeaktivity({ tier_inactive_months: -2 })], [36, 0, 0]);
  }

  // ---- oznámení o postupu ----
  ok('postup: stříbro → zlato je postup', jePostup('silver', 'gold'));
  ok('postup: stejná úroveň ani snížení není postup', !jePostup('gold', 'gold') && !jePostup('gold', 'silver'));
  ok('postup: člen → platina (přeskok) je postup', jePostup('bronze', 'platinum'));
  eq('postup: text se slevou', textPostupu({ label: 'Zlatý host', discount: 10 }, 'Kavárna U Lípy'), { title: 'Nová úroveň: Zlatý host', body: 'V podniku Kavárna U Lípy ses posunul(a) výš. Máš slevu 10 %.' });
  ok('postup: bez slevy se o ní nemluví', !/slev/.test(textPostupu({ label: 'Stříbrný host', discount: 0 }, 'X').body));

  // ---- historie změn pravidel ----
  {
    const pred = { points_per_100: 5, cashback_pct: 0, cashback_mode: 'credit', silver_at: 10 };
    const po = { points_per_100: 10, cashback_pct: 3, cashback_mode: 'credit', silver_at: 10, points_round: 'dolu', points_min_spend: 150 };
    const z = popisZmenyPravidel(pred, po, money);
    eq('historie: změny před → po česky', z, ['Bodů za 100: 5 → 10', 'Zaokrouhlení bodů: za celé stovky → poměrně, dolů', 'Minimální útrata pro body: bez minima → 150 Kč', 'Cashback: 0 % → 3 %']);
    eq('historie: beze změny nic', popisZmenyPravidel(pred, { ...pred }, money), []);
    eq('historie: chybějící sloupec není falešná změna', popisZmenyPravidel({ points_per_100: 5 }, { points_per_100: 5, points_round: 'sta', points_exclude_prepaid: true, tier_by: 'visits', cashback_mode: 'credit' }, money), []);
    eq('historie: vyloučené položky jako počet', popisZmenyPravidel({}, { points_exclude_items: [{ itemId: 1, name: 'A' }, { itemId: 2, name: 'B' }] }, money), ['Vyloučené položky: 0 → 2']);
    eq('historie: věta se středníky', vetaZmenPravidel(['A: 1 → 2', 'B: 3 → 4']), 'A: 1 → 2; B: 3 → 4');
    const dlouha = Array.from({ length: 30 }, (_, i) => `Pole číslo ${i}: 100 → 200`);
    const veta = vetaZmenPravidel(dlouha);
    ok('historie: dlouhý seznam se vejde do 300 znaků a řekne, kolik dalších', veta.length <= 300 && /a \d+ dalších$/.test(veta));
    eq('historie: nic ke zmínění = prázdná věta', vetaZmenPravidel([]), '');
  }

  // ---- přehledy ----
  ok('návštěva: razítko, objednávka, účtenka a částka u kasy ano', jeNavstevaZDeniku('visit', null) && jeNavstevaZDeniku('order', 'ord:5') && jeNavstevaZDeniku('manual', 'bill:A1') && jeNavstevaZDeniku('manual', 'card') && jeNavstevaZDeniku('cashback', 'card'));
  ok('návštěva: ruční úprava, promo, narozeniny, uvítání, pozvání, kupon ne', ![['manual', null], ['manual', 'promo:LETO'], ['birthday', 'bday:2026'], ['welcome', null], ['referral', 'ref:3'], ['coupon', 'ABC-123'], ['manual', 'spend']].some(([k, r]) => jeNavstevaZDeniku(k as string, r as string | null)));
  {
    // SQL v řadě a v přehledu musí klasifikovat stejně jako jeNavstevaZDeniku.
    const sqlTxt = bezKomentaru(precti('lib/bodyPrehledy.ts'));
    ok('řada: „členové u kasy" jen ze skutečných návštěv (visit/order/card/bill)', /x\.kind IN \('visit', 'order'\) OR x\.ref = 'card' OR x\.ref LIKE 'bill:%'/.test(sqlTxt));
    ok('řada: dny jsou pražské, žádné CURRENT_DATE ani přetypování UTC sloupce', !/CURRENT_DATE|\w\.created_at::date|\w\.joined_at::date|\w\.redeemed_at::date/.test(sqlTxt)
      && (sqlTxt.match(/AT TIME ZONE 'UTC' AT TIME ZONE 'Europe\/Prague'/g) ?? []).length >= 6);
    const route = bezKomentaru(precti('app/api/client/admin/loyalty/route.ts'));
    ok('řada: route bere řadu z pražského výpočtu, ne z vlastního UTC dotazu', /radaPoDnech\(/.test(route) && !/CURRENT_DATE|created_at::date/.test(route));
  }
  eq('odkaz: druhy odkazů jako v SQL CASE', ['card', 'bill:7', 'promo:X', 'ord:1', null, '', 'import:3'].map(r => druhOdkazu(r)), ['card', 'bill', 'promo', 'ord', 'none', 'none', 'other']);
  eq('zdroje: rozřazení kind × odkaz', [zdrojBodu('manual', 'card').id, zdrojBodu('manual', 'bill').id, zdrojBodu('manual', 'promo').id, zdrojBodu('manual', 'none').id, zdrojBodu('manual', 'other').id, zdrojBodu('order', 'ord').id, zdrojBodu('cashback', 'card').id, zdrojBodu('xyz', 'none').id],
    ['utrata', 'utrata', 'promo', 'rucne', 'import', 'objednavky', 'cashback', 'jine']);
  eq('zdroje: souhrn sloučí kasu a účtenky, seřadí a vynechá prázdné', souhrnZdroju([
    { kind: 'manual', odkaz: 'card', given: 100, spent: 0, n: 4 }, { kind: 'manual', odkaz: 'bill', given: 50, spent: 0, n: 2 },
    { kind: 'coupon', odkaz: 'other', given: 0, spent: 300, n: 3 }, { kind: 'order', odkaz: 'ord', given: 400, spent: 0, n: 8 },
    { kind: 'welcome', odkaz: 'none', given: 0, spent: 0, n: 1 },
  ]).map(z => [z.id, z.given, z.spent, z.n]), [['objednavky', 400, 0, 8], ['utrata', 150, 0, 6], ['kupony', 0, 300, 3]]);
  eq('hodnota bodu: medián z kuponů s pevnou slevou', hodnotaBodu([{ cost_points: 100, amount_off: 50 }, { cost_points: 200, amount_off: 200 }, { cost_points: 50, amount_off: 10 }]), 0.5);
  eq('hodnota bodu: bez kuponu s pevnou slevou nejde odhadnout', hodnotaBodu([{ cost_points: 100, amount_off: null }, { cost_points: 0, amount_off: 50 }]), null);
  eq('hodnota bodu: sudý počet = průměr dvou prostředních', hodnotaBodu([{ cost_points: 100, amount_off: 40 }, { cost_points: 100, amount_off: 60 }]), 0.5);

  // zdroj řádku v CSV
  eq('CSV zdroj: kredit, útrata, razítko, body', [
    zdrojRadkuDeniku('cashback', 'bill:1', 0, 15), zdrojRadkuDeniku('credit', 'card', 0, -80), zdrojRadkuDeniku('credit', null, 0, 20),
    zdrojRadkuDeniku('manual', 'spend', 0, 0), zdrojRadkuDeniku('visit', 'card', 0, 0), zdrojRadkuDeniku('order', 'ord:3', 12, 0),
  ], ['Cashback v kreditu', 'Uplatnění kreditu u kasy', 'Ruční úprava kreditu', 'Ruční úprava útraty', 'Razítko za návštěvu', 'Objednávky z aplikace']);
  {
    const csv = denikCsv([
      { kdy: '2. 10. 2026 8:15', host: 'Jana; "Novotná"', druh: 'Body', body: 12, kredit: 0, zdroj: 'Útrata u kasy a z účtenek', poznamka: '=HYPERLINK("x")' },
      { kdy: '2. 10. 2026 9:00', host: 'Petr', druh: 'Kredit', body: 0, kredit: -80, zdroj: 'Uplatnění kreditu u kasy', poznamka: '' },
    ]);
    const radky = csv.split('\r\n');
    ok('CSV: BOM na začátku (Excel pozná češtinu)', csv.charCodeAt(0) === 0xFEFF);
    eq('CSV: hlavička', radky[0].slice(1), 'Kdy;Host;Druh;Body;Kredit;Zdroj;Poznámka');
    ok('CSV: středník a uvozovky v poli se escapují', radky[1].includes('"Jana; ""Novotná"""'));
    ok('CSV: vzorec v poznámce se zneškodní (injekce do Excelu)', radky[1].includes(`"'=HYPERLINK(""x"")"`) || radky[1].includes("'=HYPERLINK"));
    eq('CSV: záporný kredit zůstává číslem', radky[2].split(';')[4], '-80');
    eq('CSV: pole +, -, @ na začátku textu dostanou apostrof', [csvPoleDeniku('+420'), csvPoleDeniku('@x'), csvPoleDeniku('ok')], ["'+420", "'@x", 'ok']);
    eq('CSV: prázdný deník = jen hlavička', denikCsv([]).split('\r\n').filter(Boolean).length, 1);
  }

  // období
  eq('období: výchozí = posledních 30 dní včetně dneška', obdobiZDotazu(undefined, undefined, '2026-10-02'), { od: '2026-09-03', do: '2026-10-02' });
  eq('období: vlastní rozsah', obdobiZDotazu('2026-01-01', '2026-01-31', '2026-10-02'), { od: '2026-01-01', do: '2026-01-31' });
  eq('období: špatné datum', obdobiZDotazu('2026-02-30', '2026-03-01', '2026-10-02'), { chyba: 'Datum zadej jako RRRR-MM-DD.' });
  eq('období: obrácené', obdobiZDotazu('2026-03-02', '2026-03-01', '2026-10-02'), { chyba: 'Začátek období je až po jeho konci.' });
  ok('období: delší než 366 dní se odmítne', 'chyba' in obdobiZDotazu('2024-01-01', '2026-01-01', '2026-10-02'));
  ok('období: přesně 366 dní projde', !('chyba' in obdobiZDotazu('2025-01-01', '2026-01-01', '2026-10-02')));
  ok('řazení: jen tři známé', jeRazeni('utrata') && jeRazeni('body') && jeRazeni('navstevy') && !jeRazeni('name; DROP'));
  eq('číslo: česky s mezerou jako oddělovačem tisíců', cisloCs(1234567).replace(/\s/g, ' '), '1 234 567');

  // ---- ruční úprava: audit s popiskem, kontrola zůstatku, kredit v UI ----
  {
    const route = bezKomentaru(precti('app/api/client/admin/loyalty/route.ts'));
    ok('ruční úprava bodů a kreditu se zapisuje do historie změn', /'client\.points'/.test(route) && /'client\.credit'/.test(route));
    ok('ruční úprava: odepsat víc než host má vrací 409, ne tiché oříznutí', (route.match(/status: 409/g) ?? []).length === 2);
    ok('ruční úprava: deník dostává skutečnou změnu (awardDetail / awardCreditDetail)', /awardDetail\(/.test(route) && /awardCreditDetail\(/.test(route));
    const okno = precti('components/client/loyalty/BodyUpravaClena.tsx');
    ok('člen: okno umí upravit kredit (what: credit) jen s oprávněním', /what: 'credit'/.test(okno) && /smiKredit/.test(okno));
    const admin = bezKomentaru(precti('components/client/loyalty/ClenoveSprava.tsx'));
    ok('člen: seznam hlídá vernost.kredit_upravit a používá nové okno', /smi\('vernost\.kredit_upravit'\)/.test(admin) && /<UpravaClenaOkno/.test(admin));
    const zakaznici = bezKomentaru(precti('app/api/client/admin/customers/route.ts'));
    ok('členové: kredit v seznamu jen s vernost.zobrazit', /vidiKredit = ctx\.role\.opravneni\.has\('vernost\.zobrazit'\)/.test(zakaznici));
  }
  {
    const popisky = precti('lib/auditPopisky.ts');
    ok('audit: nové akce mají český popisek', ['client.points', 'client.credit', 'client.pravidla', 'client.export'].every(k => new RegExp(`'${k.replace('.', '\\.')}': '[^']*[a-zá-ž]`, 'i').test(popisky)));
    const profil = bezKomentaru(precti('app/api/client/admin/profile/route.ts'));
    ok('pravidla: změna se zapisuje do historie jako před → po', /popisZmenyPravidel\(cur, pFinal/.test(profil) && /'client\.pravidla'/.test(profil));
    ok('pravidla: nová pole vyžadují vernost.pravidla', ['points_round', 'points_min_spend', 'points_cap_per_bill', 'points_exclude_prepaid', 'points_exclude_items', 'tier_inactive_months'].every(k => new RegExp(`${k}: 'vernost\\.pravidla'`).test(profil)));
  }

  // ---- kasa a objednávky berou jedno pravidlo ----
  {
    const scan = bezKomentaru(precti('app/api/client/staff/scan/route.ts'));
    ok('kasa: body a cashback z účtenky i částky přes odmenaZUctu, ne floor(částka/100) natvrdo', (scan.match(/odmenaZUctu\(/g) ?? []).length === 2 && !/Math\.floor\(total \/ 100\)/.test(scan) && !/Math\.floor\(amount \/ 100\)/.test(scan));
    ok('kasa: kredit/poukaz od obsluhy (prepaid) a položky z účtenky jdou do výpočtu', /predplaceno: b\.prepaid/.test(scan) && /polozky/.test(scan));
    ok('kasa: odmítnutá částka řekne proč (strop, minimum, kredit)', /omezeni\.join/.test(scan));
    const objednavky = bezKomentaru(precti('lib/clientOrders.ts'));
    ok('objednávky: body přes odmenaZUctu', /odmenaZUctu\(teamId, profile/.test(objednavky) && !/Math\.floor\(Number\(o\.total\) \/ 100\)/.test(objednavky));
    ok('oznámení o postupu: po návštěvě i po útratě', /oznamPostupUrovne\(teamId, customerId, \{ navstev: 1 \}\)/.test(bezKomentaru(precti('lib/client.ts'))) && /oznamPostupUrovne\(teamId, customerId, \{ utrata: n \}\)/.test(bezKomentaru(precti('lib/urovneDb.ts'))));
    ok('úroveň po pauze: všechna místa s tierForMember předávají lastVisitAt', [
      'app/api/client/b/[slug]/route.ts', 'app/api/client/b/[slug]/coupons/[id]/claim/route.ts', 'lib/clenoveDb.ts',
      'app/api/client/staff/scan/route.ts', 'components/client/MyPage.tsx',
    ].every(f => /lastVisitAt:/.test(precti(f))));
  }
  {
    const init = precti('app/api/init/route.ts');
    const lib = precti('lib/bodyPravidlaDb.ts');
    const sloupce = ['points_round', 'points_min_spend', 'points_cap_per_bill', 'points_exclude_prepaid', 'points_exclude_items', 'tier_inactive_months'];
    ok('schéma: nové sloupce jsou v init i v lazy ALTER ve stejném znění', sloupce.every(k => init.includes(`ADD COLUMN IF NOT EXISTS ${k} `) && lib.includes(`ADD COLUMN IF NOT EXISTS ${k} `)));
  }
}
