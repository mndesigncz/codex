// W5 — hostovská strana: platnost kuponů („vyprší za N dní“), doba na dokončení razítkové karty,
// historie bez interních poznámek, stránkování, „jak získat body“ z pravidel podniku.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  dniDo, platnostKuponu, typZaznamu, stranaHistorie, pravidlaZisku, urovneSeSlevou, BRZY_DNI, NA_STRANU_HISTORIE, MAX_NA_STRANU_HISTORIE,
} from '../../lib/hostPrehled.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  const DNES = '2026-10-01';

  // ---- Dny do data ----
  eq('dny: zítra', dniDo('2026-10-02', DNES), 1);
  eq('dny: dnes', dniDo(DNES, DNES), 0);
  eq('dny: včera', dniDo('2026-09-30', DNES), -1);
  eq('dny: přes přechod na zimní čas (poslední neděle října)', dniDo('2026-10-26', '2026-10-24'), 2);
  eq('dny: přes přechod na letní čas', dniDo('2026-03-30', '2026-03-28'), 2);
  eq('dny: datum s časem z databáze', dniDo('2026-10-05T00:00:00.000Z', DNES), 4);
  eq('dny: chybí datum', dniDo(null, DNES), null);
  eq('dny: špatný tvar', dniDo('1. 10. 2026', DNES), null);

  // ---- Platnost kuponu ----
  eq('kupon: bez data = bez omezení', platnostKuponu(null, DNES).stav, 'bez');
  eq('kupon: prázdný řetězec = bez omezení', platnostKuponu('', DNES).stav, 'bez');
  eq('kupon: daleko', platnostKuponu('2026-12-31', DNES), { stav: 'ok', do: '2026-12-31', dni: 91 });
  eq('kupon: hranice „brzy“ (14 dní)', platnostKuponu('2026-10-15', DNES).stav, 'brzy');
  eq('kupon: o den za hranicí', platnostKuponu('2026-10-16', DNES).stav, 'ok');
  eq('kupon: končí zítra', platnostKuponu('2026-10-02', DNES), { stav: 'brzy', do: '2026-10-02', dni: 1 });
  eq('kupon: končí dnes', platnostKuponu(DNES, DNES).stav, 'dnes');
  eq('kupon: skončil včera', platnostKuponu('2026-09-30', DNES).stav, 'vyprsel');
  eq('kupon: BRZY_DNI je 14', BRZY_DNI, 14);

  // ---- Doba na dokončení karty (od posledního razítka, jako v lib/stamps.ts addStamps) ----

  // ---- Historie: jen druh záznamu, žádné interní poznámky ----
  const r = (src: string, kind: string, delta: number, credit_delta = 0) => typZaznamu({ src, kind, delta, credit_delta });
  eq('historie: razítko za návštěvu', r('l', 'visit', 0), 'stamp');
  eq('historie: body za návštěvu', r('l', 'visit', 12), 'points_earned');
  eq('historie: body za útratu', r('l', 'order', 30), 'points_earned');
  eq('historie: kupon za body', r('l', 'coupon', -50), 'points_spent_coupon');
  eq('historie: vrácené body za kupon', r('l', 'coupon', 50), 'points_returned');
  eq('historie: propadlé body', r('l', 'expire', -20), 'points_expired');
  eq('historie: uvítací body', r('l', 'welcome', 10), 'welcome');
  eq('historie: narozeniny', r('l', 'birthday', 50), 'birthday');
  eq('historie: pozvaný kamarád', r('l', 'referral', 20), 'referral');
  eq('historie: návrat', r('l', 'reactivation', 15), 'reactivation');
  eq('historie: cashback', r('l', 'cashback', 0, 25), 'cashback');
  eq('historie: kredit uplatněn', r('l', 'credit', 0, -25), 'credit_spent');
  eq('historie: ruční přidání', r('l', 'manual', 5), 'manual_plus');
  eq('historie: ruční odečet', r('l', 'manual', -5), 'manual_minus');
  eq('historie: ruční odečet kreditu', r('l', 'manual', 0, -10), 'manual_minus');
  eq('historie: neznámý druh s body', r('l', 'jine', 3), 'manual_plus');
  eq('historie: neznámý druh bez čísel', r('l', 'jine', 0), 'other');
  eq('historie: odměna za dokončenou kartu', r('s', 'reward', 0), 'reward_coupon');
  eq('historie: uplatněný kupon', r('u', 'used', 0), 'coupon_used');

  const db = zdroj('lib/hostHistorieDb.ts');
  ok('historie: select nečte interní poznámku (note)', !/\bl\.note\b|\bnote\b\s*,/.test(db.slice(db.indexOf('SELECT x.src'), db.indexOf('const polozky'))));
  ok('historie: select nečte ref deníku', !/\bl\.ref\b\s*(,|AS)/.test(db.slice(db.indexOf('SELECT x.src'), db.indexOf('const polozky'))));
  ok('historie: výstup nemá pole note ani ref', !/\bnote:|\bref:/.test(db.slice(db.indexOf('const polozky'))));
  ok('historie: upozornění na propadnutí (řádek bez bodů) se nevrací', db.includes("l.delta <> 0 OR l.credit_delta <> 0 OR l.kind = 'visit'"));
  ok('historie: jen moje záznamy', (db.match(/customer_id = \$\{customerId\}/g) ?? []).length >= 3);
  ok('historie: stránkování přes LIMIT/OFFSET s jedním řádkem navíc', db.includes('LIMIT ${naStranu + 1} OFFSET ${offset}'));
  const route = zdroj('app/api/client/me/historie/route.ts');
  ok('historie: endpoint vyžaduje přihlášeného hosta', route.includes('await customer()') && route.includes('status: 401'));
  ok('historie: slug zúží na jeden podnik', route.includes('profileBySlug('));

  // ---- Stránkování ----
  eq('strana: výchozí', stranaHistorie(undefined, undefined), { strana: 1, naStranu: NA_STRANU_HISTORIE, offset: 0 });
  eq('strana: třetí po 20', stranaHistorie('3', '20'), { strana: 3, naStranu: 20, offset: 40 });
  eq('strana: velikost se ořízne na 50', stranaHistorie(1, 5000).naStranu, MAX_NA_STRANU_HISTORIE);
  eq('strana: záporná a nesmysl', stranaHistorie(-4, 'abc'), { strana: 1, naStranu: NA_STRANU_HISTORIE, offset: 0 });
  eq('strana: nulová velikost = výchozí', stranaHistorie(2, 0).naStranu, NA_STRANU_HISTORIE);
  eq('strana: absurdní strana se ořízne', stranaHistorie(99999999, 10).strana, 1000);

  // ---- Jak získat body ----
  const plne = { pointsPer100: 5, cashbackPct: 3, pointsExpireDays: 365, birthdayPoints: 50, referralPoints: 20, campaigns: [{ name: 'Káva', required: 10, reward: 'Káva zdarma' }], maUrovneSeSlevou: true };
  eq('pravidla: všechno zapnuté', pravidlaZisku(plne).map(p => p.druh), ['body_za_utratu', 'razitka', 'kredit', 'narozeniny', 'pozvanka', 'urovne', 'propadani']);
  eq('pravidla: nic nezapnuté = nic', pravidlaZisku({ pointsPer100: 0, cashbackPct: 0, pointsExpireDays: 0, birthdayPoints: 0, referralPoints: 0, campaigns: [], maUrovneSeSlevou: false }), []);
  eq('pravidla: jen body za útratu', pravidlaZisku({ ...plne, cashbackPct: 0, pointsExpireDays: 0, birthdayPoints: 0, referralPoints: 0, campaigns: [], maUrovneSeSlevou: false }), [{ druh: 'body_za_utratu', body: 5 }]);
  eq('pravidla: karta s odměnou', pravidlaZisku(plne)[1], { druh: 'razitka', nazev: 'Káva', pocet: 10, odmena: 'Káva zdarma' });
  eq('pravidla: karta bez razítek se nezmiňuje', pravidlaZisku({ ...plne, campaigns: [{ name: 'X', required: 0, reward: '' }] }).some(p => p.druh === 'razitka'), false);
  eq('pravidla: záporné a desetinné hodnoty se ošetří', pravidlaZisku({ ...plne, pointsPer100: -3 as any, cashbackPct: 2.9 }).find(p => p.druh === 'kredit'), { druh: 'kredit', procent: 2 });
  eq('úrovně: žádná sleva', urovneSeSlevou({ memberDiscount: 0, silverDiscount: 0, goldDiscount: 0, platinumDiscount: 0 }), false);
  eq('úrovně: zlatá sleva', urovneSeSlevou({ goldDiscount: 10 }), true);
  eq('úrovně: chybí data', urovneSeSlevou(null), false);

  // ---- Zapojení do stránek hosta ----
  const bp = zdroj('components/client/BusinessPage.tsx');
  ok('stránka podniku: legacy „x/10“ se při kampaních skryje', bp.includes('b.stampTarget > 0 && !(me.campaigns?.length)'));
  ok('stránka podniku: platnost kuponu přes PlatnostKuponu', bp.includes('<PlatnostKuponu validUntil={c.valid_until}'));
  ok('stránka podniku: poznámky ke kartě (vyprší, kdy, limit) přes RazitkaPoznamky', bp.includes('<RazitkaPoznamky cp={cp} />'));
  ok('stránka podniku: pravidla z nastavení podniku', bp.includes('<HostPravidla b={b}'));
  ok('stránka podniku: historie jen pro přihlášeného', bp.includes('{signedIn && <HostHistorie slug={slug}'));
  ok('stránka podniku: bannery posílají statistiku', bp.includes('slug={slug} />') && bp.includes('<PromoBanners banners={d.banners}'));
  const my = zdroj('components/client/MyPage.tsx');
  ok('Moje: historie napříč podniky', my.includes('<HostHistorie showBusiness />'));
  ok('Moje: platnost kuponu', my.includes('<PlatnostKuponu validUntil={c.valid_until}'));
  const api = zdroj('app/api/client/b/[slug]/route.ts');
  ok('API podniku: kdy karta vyprší jde z hostKarta', api.includes('expiresAt: k.expiresAt'));
  ok('API podniku: platnost kuponu v seznamu vyzvednutých', api.includes('c.title, c.valid_until FROM client_coupon_claims'));
}
