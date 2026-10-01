// Kolo 73 — jednotky: zadá se v jedné, uloží se a zobrazí v jiné.
//
// Hlídá jednotky množství (lib/jednotky), zaokrouhlení načatého balení u l a kg,
// zděděné balení z kategorie, kroky návodu se surovinou a hodnotu zásob.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  prevedMnozstvi, faktorJednotky, rodinaJednotky, nabidkaJednotek, jednotkaMnozstvi, cenaZaRozumnouJednotku,
  vyznamCeny, CONTENT_UNITS, jednotkaSnesDesetiny,
} from '../../lib/jednotky.ts';
import {
  consumeContent, totalContent, effectivePackages, fmtAmount, resolveSteps, efektivniBaleni, baleniPolozky, jednotkaPolozky,
  CONTENT_UNITS as CONTENT_UNITS_PACKAGING,
} from '../../lib/packaging.ts';
import { normalizeSteps, mnozstviKroku, zadaneMnozstvi, popisMnozstviKroku, ingredientSteps } from '../../lib/guideSteps.ts';
import { hodnotaZasob, chybiUdaje } from '../../lib/skladPrehled.ts';
import { premapujKroky } from '../../lib/kopie.ts';
import { mnozstviKZapisu, pocetZPole } from '../../lib/inventura.ts';
import { benefitLabel, conditionBadges } from '../../lib/kuponyPopisky.ts';

export default function ({ eq, ok }: Testy) {
  // ---- A: množství kroku návodu se převádí do jednotky položky ----
  eq('převod: 20 ml na položku v litrech', prevedMnozstvi(20, 'ml', 'l'), 0.02);
  eq('převod: 2 dl na litry', prevedMnozstvi(2, 'dl', 'l'), 0.2);
  eq('převod: 5 g na kilogramy', prevedMnozstvi(5, 'g', 'kg'), 0.005);
  eq('převod: 1,5 dkg na gramy', prevedMnozstvi(1.5, 'dkg', 'g'), 15);
  eq('převod: stejná jednotka beze změny', prevedMnozstvi(0.04, 'l', 'l'), 0.04);
  eq('převod: litr a „litr" jsou totéž', prevedMnozstvi(1, 'litr', 'ml'), 1000);
  eq('převod: z ml na kusy nejde — číslo zůstane', prevedMnozstvi(20, 'ml', 'ks'), 20);
  eq('převod: bez plovoucí chyby', prevedMnozstvi(3, 'ml', 'l'), 0.003);
  eq('rodiny: ml → l, dkg → kg, balení → ks', [rodinaJednotky('ml'), rodinaJednotky('dkg'), rodinaJednotky('balení')], ['l', 'kg', 'ks']);
  eq('faktor: cl a neznámé', [faktorJednotky('cl'), faktorJednotky('lahev')], [0.01, 1]);
  eq('nabídka jednotek podle položky', [nabidkaJednotek('l'), nabidkaJednotek('g'), nabidkaJednotek('ks')], [['ml', 'cl', 'dl', 'l'], ['g', 'dkg', 'kg'], ['ks']]);

  // Položka vedená v litrech: 20 ml se uloží jako 0,02 l, zobrazí jako 20 ml.
  const kLitr = mnozstviKroku(20, 'ml', 'l');
  eq('krok: 20 ml u litrové položky se uloží jako 0,02', kLitr, { amount: 0.02, unit: 'ml', zadano: 20 });
  eq('krok: 5 g u kilové položky', mnozstviKroku(5, 'g', 'kg').amount, 0.005);
  eq('krok: stejná jednotka se nepřevádí', mnozstviKroku(40, 'ml', 'ml').amount, 40);
  eq('krok: prázdné množství', mnozstviKroku(null, 'ml', 'l'), { amount: null, unit: 'ml', zadano: null });
  eq('krok: bez položky se nepřevádí', mnozstviKroku(20, 'ml', null).amount, 20);
  const novy: any = { text: 'Nalij', itemId: 3, ...kLitr };
  eq('krok: normalizace nový krok zachová', normalizeSteps([novy])[0], { text: 'Nalij', itemId: 3, amount: 0.02, unit: 'ml', zadano: 20 });
  eq('krok: zobrazení zadaného množství', zadaneMnozstvi(novy, 'l'), { hodnota: 20, unit: 'ml' });
  eq('krok: text množství z toho, co se zadalo', popisMnozstviKroku(novy), '20 ml');
  eq('krok: do receptury jde množství v jednotce položky', ingredientSteps([novy]), [{ itemId: 3, amount: 0.02 }]);

  // Stará data se nesmí poškodit: bez `zadano` je `amount` v jednotce položky a zůstane.
  const stary = normalizeSteps([{ text: 'Nasyp', itemId: 7, amount: 0.04, unit: 'l' }])[0];
  eq('stará data: amount se nemění', stary.amount, 0.04);
  eq('stará data: bez „zadano"', stary.zadano, undefined);
  eq('stará data: zobrazení jako dřív', popisMnozstviKroku(stary), '0,04 l');
  eq('stará data: editor ukáže uložené číslo', zadaneMnozstvi(stary, 'l'), { hodnota: 0.04, unit: 'l' });
  eq('stará data: řetězcový krok projde', normalizeSteps(['Jen text']), [{ text: 'Jen text' }]);
  eq('stará data: zadano bez množství se zahodí', normalizeSteps([{ text: 'x', itemId: 1, zadano: 5 }])[0].zadano, undefined);
  eq('kopie mezi podniky nese „zadano"', premapujKroky([novy], new Map([[3, 'Vodka']]), [{ id: 9, name: 'Vodka' }]).kroky[0], { text: 'Nalij', itemId: 9, amount: 0.02, unit: 'ml', zadano: 20 });

  // ---- B: zaokrouhlení načatého balení u l a kg ----
  eq('consumeContent: 0,7 − 0,02 l zůstane 0,68', consumeContent({ quantity: 2, packageSize: 1, openAmount: 0.7 }, 0.02), { quantity: 2, openAmount: 0.68 });
  eq('consumeContent: 0,5 kg − 0,005 kg', consumeContent({ quantity: 0, packageSize: 1, openAmount: 0.5 }, 0.005).openAmount, 0.495);
  eq('consumeContent: ml zůstávají celé', consumeContent({ quantity: 1, packageSize: 700, openAmount: 700 }, 40).openAmount, 660);
  eq('consumeContent: g zůstávají celé', consumeContent({ quantity: 3, packageSize: 250, openAmount: 100 }, 130), { quantity: 2, openAmount: 220 });
  eq('consumeContent: načne další balení u litrů', consumeContent({ quantity: 1, packageSize: 0.7, openAmount: 0.01 }, 0.02), { quantity: 0, openAmount: 0.69 });
  eq('consumeContent: bez balení po desetinách kg', consumeContent({ quantity: 2.5, packageSize: null, openAmount: null }, 0.125).quantity, 2.375);
  eq('consumeContent: nikdy pod nulu', consumeContent({ quantity: 0, packageSize: 1, openAmount: 0.01 }, 5), { quantity: 0, openAmount: 0 });
  eq('totalContent: 2 × 0,7 l + 0,68', totalContent({ quantity: 2, packageSize: 0.7, openAmount: 0.68 }), 2.08);
  eq('effectivePackages: 2 + 0,68 / 0,7', effectivePackages({ quantity: 2, packageSize: 0.7, openAmount: 0.68 }), 2.971);
  eq('fmtAmount: 0,68 l se neukáže jako 0,7', fmtAmount(0.68), '0,68');
  eq('fmtAmount: celé číslo bez čárky', fmtAmount(250), '250');
  eq('resolveSteps: 25 % z 0,7 l je 0,175', resolveSteps({ kind: 'fraction', steps: [{ label: 'Čtvrtina', pct: 25 }] }, 0.7)[0].amount, 0.175);
  eq('resolveSteps: 25 % z 750 ml zůstává 187,5', resolveSteps({ kind: 'fraction', steps: [{ label: 'Čtvrtina', pct: 25 }] }, 750)[0].amount, 187.5);

  // ---- C: balení zděděné z kategorie ----
  const kat = { defaultPackageSize: 0.7, contentUnit: 'l' };
  eq('dědění: bez vlastní hodnoty z kategorie', efektivniBaleni({ packageSize: null, contentUnit: null }, kat), { packageSize: 0.7, contentUnit: 'l' });
  eq('dědění: vlastní velikost vyhrává', efektivniBaleni({ packageSize: 1, contentUnit: null }, kat), { packageSize: 1, contentUnit: 'l' });
  eq('dědění: vlastní jednotka vyhrává', efektivniBaleni({ packageSize: null, contentUnit: 'ml' }, kat).contentUnit, 'ml');
  eq('dědění: nula je nevyplněno', efektivniBaleni({ packageSize: 0 }, kat).packageSize, 0.7);
  eq('dědění: bez kategorie se nic nevymýšlí', efektivniBaleni({ packageSize: null }, null), { packageSize: null, contentUnit: null });
  eq('klient: efektivní pole z API mají přednost', baleniPolozky({ packageSize: null, effectivePackageSize: 0.7, effectiveContentUnit: 'l' }), { packageSize: 0.7, contentUnit: 'l' });
  eq('klient: bez efektivních polí vlastní hodnoty', baleniPolozky({ packageSize: 750, contentUnit: 'ml' }), { packageSize: 750, contentUnit: 'ml' });
  eq('jednotka položky: balená v litrech podle kategorie', jednotkaPolozky({ unit: 'lahev', effectivePackageSize: 0.7, effectiveContentUnit: 'l' }), 'l');
  eq('jednotka položky: bez balení je to vlastní jednotka', jednotkaPolozky({ unit: 'ks', contentUnit: 'ml', packageSize: null }), 'ks');
  eq('jednotka položky: gramy', jednotkaPolozky({ unit: 'balení', packageSize: 250, contentUnit: 'g' }), 'g');
  eq('jednotkaMnozstvi: balení bez jednotky obsahu', jednotkaMnozstvi({ unit: 'lahev', packageSize: 0.7 }), 'lahev');
  // Odpis prodeje z láhve zděděné z kategorie: bez balení by 0,04 l ubralo celou lahev.
  const zKat = efektivniBaleni({ packageSize: null }, kat);
  eq('odpis se zděděným balením nebere celou lahev', consumeContent({ quantity: 3, packageSize: zKat.packageSize, openAmount: 0 }, 0.04), { quantity: 2, openAmount: 0.66 });
  eq('odpis bez zděděného balení (starý chybný stav) bral celé kusy', consumeContent({ quantity: 3, packageSize: null, openAmount: 0 }, 0.04).quantity, 2.96);

  // ---- F: hodnota zásob — jedna funkce, načaté balení i zděděná velikost ----
  const h = hodnotaZasob([
    { id: 1, name: 'Vodka', quantity: 2, unitCost: 300, packageSize: null, effectivePackageSize: 0.7, openAmount: 0.35 },
    { id: 2, name: 'Starý džus', quantity: 10, unitCost: 100, archived: true },
    { id: 3, name: 'Citron', quantity: 4, unitCost: 5 },
  ]);
  eq('hodnota zásob: načatá lahev se zděděným balením a bez archivovaných', h.hodnota, Math.round((2 + 0.5) * 300) + 20);
  eq('hodnota zásob: top bez archivovaných', h.top.map(x => x.nazev), ['Vodka', 'Citron']);
  eq('chybí údaje: velikost z kategorie stačí', chybiUdaje([
    { id: 1, name: 'Vodka', quantity: 1, unitCost: 300, packageSize: null, effectivePackageSize: 0.7 },
    { id: 2, name: 'Rum', quantity: 1, unitCost: 300, packageSize: null, effectivePackageSize: null },
  ], { '1': [1], '2': [1] }).map(r => r.nazev), ['Rum']);

  // ---- H: jednotky položky ----
  eq('jednotky obsahu: jedno místo', CONTENT_UNITS_PACKAGING === CONTENT_UNITS, true);
  ok('jednotky obsahu: dkg se dá vybrat', (CONTENT_UNITS as readonly string[]).includes('dkg'));
  ok('jednotky obsahu: každá je známá rodina', CONTENT_UNITS.every(u => ['l', 'kg', 'ks'].includes(rodinaJednotky(u))));

  // ---- I: cena za rozumnou jednotku ----
  eq('cena za ml → za litr', cenaZaRozumnouJednotku(0.0043, 'ml'), { cena: 4.3, jednotka: 'l' });
  eq('cena za g → za kg', cenaZaRozumnouJednotku(0.025, 'g'), { cena: 25, jednotka: 'kg' });
  eq('cena za l zůstává', cenaZaRozumnouJednotku(86, 'l'), { cena: 86, jednotka: 'l' });
  eq('cena za kus zůstává', cenaZaRozumnouJednotku(3, 'ks'), { cena: 3, jednotka: 'ks' });
  eq('cena za dkg → za kg', cenaZaRozumnouJednotku(0.5, 'dkg'), { cena: 50, jednotka: 'kg' });

  // ---- E: co znamená pole ceny ----
  eq('cena: s velikostí balení je to cena balení', vyznamCeny('0,7'), 'baleni');
  eq('cena: bez velikosti balení je to cena jednotky', [vyznamCeny(''), vyznamCeny(null), vyznamCeny('0')], ['jednotka', 'jednotka', 'jednotka']);

  // ---- G: desetinná množství a prahy ----
  ok('desetiny: kg a l ano', jednotkaSnesDesetiny('kg') && jednotkaSnesDesetiny('l') && jednotkaSnesDesetiny('dkg'));
  ok('desetiny: g, ml a ks ne', !jednotkaSnesDesetiny('g') && !jednotkaSnesDesetiny('ml') && !jednotkaSnesDesetiny('ks') && !jednotkaSnesDesetiny('balení'));
  eq('pole: česká čárka (2,5 kg)', pocetZPole('2,5', true), { ok: true, hodnota: 2.5 });
  eq('pole: tečka (2.5 kg)', pocetZPole('2.5', true), { ok: true, hodnota: 2.5 });
  eq('pole: nedopsané „0," se nezahodí', pocetZPole('0,', true), { ok: true, hodnota: 0 });
  eq('pole: u celých jednotek je desetina chyba, ne zaokrouhlení', pocetZPole('2,5', false), { ok: false, duvod: 'cele' });
  eq('zápis: desetinný sloupec drží 2,5', mnozstviKZapisu('2,5', true), 2.5);
  eq('zápis: INTEGER sloupec dostane celé číslo, ne chybu databáze', mnozstviKZapisu(2.5, false), 3);
  eq('zápis: nesmysl a záporné je 0', [mnozstviKZapisu('abc', true), mnozstviKZapisu(-4, true), mnozstviKZapisu(null, false)], [0, 0, 0]);

  // ---- I: částky v kuponech podle měny podniku ----
  const eur = (n: number) => `${n} €`;
  eq('kupon: sleva v korunách jako dřív', benefitLabel({ benefit_kind: 'amount', amount_off: 50 }), 'Sleva 50 Kč');
  eq('kupon: sleva v eurech', benefitLabel({ benefit_kind: 'amount', amount_off: 5 }, eur), 'Sleva 5 €');
  eq('kupon: podmínka útraty v eurech', conditionBadges({ min_order_value: 20 }, eur), ['od 20 € útraty']);

  // ---- zdrojové kontroly: jedno místo pro rozhodnutí, ne opsaná logika ----
  const zdroj = (cesta: string) => readFileSync(new URL('../../' + cesta, import.meta.url), 'utf8');
  for (const f of ['lib/posSync.ts', 'app/api/pos/margins/route.ts', 'app/api/pos/products/route.ts', 'app/api/stocktake/route.ts', 'app/api/inventory/[id]/route.ts']) {
    ok(`C: ${f} bere balení přes baleniRadku (zděděné z kategorie)`, zdroj(f).includes('baleniRadku('));
  }
  ok('C: /api/inventory posílá hotové efektivní balení', zdroj('app/api/inventory/route.ts').includes('effectivePackageSize: baleni.packageSize'));
  ok('D: Stocktake nemá litr jako zálohu jednotky', !/\|\| 'l'/.test(zdroj('components/inventory/Stocktake.tsx')));
  ok('D: ztráty nemají litr jako zálohu jednotky', !/\|\| 'l'/.test(zdroj('app/api/inventory/shrinkage/route.ts')));
  ok('E: žádné „Cena za kus" a pole ceny se řídí vyznamCeny', ['components/inventory/NewStockEntry.tsx', 'components/inventory/ItemInlineEdit.tsx', 'components/inventory/NewIngredientInline.tsx', 'components/employer/Inventory.tsx']
    .every(f => zdroj(f).includes('vyznamCeny(') && !zdroj(f).includes('Cena za kus')));
  ok('I: digest a uzávěrky nepoužívají koruny natvrdo', !zdroj('app/api/digest/route.ts').includes("czk }") && !zdroj('app/api/closings/route.ts').includes('czk,')
    && zdroj('app/api/digest/route.ts').includes('menaPodniku(') && zdroj('app/api/closings/route.ts').includes('menaPodniku('));
  ok('I: kupony na stránce hosta a u obsluhy berou měnu podniku', zdroj('app/api/client/b/[slug]/route.ts').includes('castkaPodniku')
    && zdroj('app/api/client/admin/redeem/route.ts').includes('menaPodniku(') && zdroj('app/api/client/admin/coupons/route.ts').includes('menaPodniku('));
  ok('J: množství a čísla ve widgetech Skladu nejsou napevno česky', !/const (cislo|mnozstvi) = .*'cs-CZ'/.test(zdroj('components/widgety/oblasti/sklad.tsx')));
}
