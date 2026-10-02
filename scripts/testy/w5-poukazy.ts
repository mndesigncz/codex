// W5 — poukazy: limity uplatnění (min/max), hromadné prodloužení, přehled závazku a měsíců,
// připomenutí konce platnosti, e-mail obdarovanému. Čistá logika z lib/poukazy.ts a lib/poukazyEmail.ts
// plus pojistky nad zdrojáky tam, kde pravidlo žije v SQL (jeden příkaz, zabrání před odesláním).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  posudUplatneni, normalizujLimity, textOdmitnuti, overNovouPlatnost, posudProdlouzeni, idPoukazu, slozPrehled, doplnMesice, posunMesice,
  kPripomenuti, MAX_PRODLOUZENI, PRIPOMENUTI_DNI, BEZ_LIMITU, DUVOD_TEXT, type PoukazVstup,
} from '../../lib/poukazy.ts';
import { emailPoukazu, emailPripominky, emailObdarovaneho, vzkazDarce, MAX_VZKAZ } from '../../lib/poukazyEmail.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default async function ({ eq, ok }: Testy) {
  const DNES = '2026-10-01';
  const p = (x: Partial<PoukazVstup> = {}): PoukazVstup => ({ value_amount: 1000, balance: 1000, currency: 'CZK', valid_until: '2026-12-31', status: 'active', ...x });

  // ---- Limity uplatnění ----
  eq('limity: bez omezení', posudUplatneni(p(), 5, DNES, 'CZK', BEZ_LIMITU).ok, true);
  eq('limity: nezadané = bez omezení', posudUplatneni(p(), 5, DNES, 'CZK', null).ok, true);
  eq('limity: nad maximem', posudUplatneni(p(), 400, DNES, 'CZK', { min: 0, max: 300 }), { ok: false, duvod: 'nad_maximem' });
  eq('limity: přesně maximum projde', posudUplatneni(p(), 300, DNES, 'CZK', { min: 0, max: 300 }).ok, true);
  eq('limity: pod minimem', posudUplatneni(p(), 49, DNES, 'CZK', { min: 50, max: 0 }), { ok: false, duvod: 'pod_minimem' });
  eq('limity: přesně minimum projde', posudUplatneni(p(), 50, DNES, 'CZK', { min: 50, max: 0 }).ok, true);
  eq('limity: zbytek poukazu pod minimem jde uplatnit celý', posudUplatneni(p({ balance: 30 }), 30, DNES, 'CZK', { min: 50, max: 0 }).ok, true);
  eq('limity: část zbytku pod minimem ne', posudUplatneni(p({ balance: 30 }), 20, DNES, 'CZK', { min: 50, max: 0 }), { ok: false, duvod: 'pod_minimem' });
  eq('limity: zbytek nad maximem ale celý neprojde (max platí vždy)', posudUplatneni(p({ balance: 500 }), 500, DNES, 'CZK', { min: 0, max: 300 }), { ok: false, duvod: 'nad_maximem' });
  eq('limity: víc než zůstatek má přednost před limitem', posudUplatneni(p({ balance: 100 }), 200, DNES, 'CZK', { min: 0, max: 300 }), { ok: false, duvod: 'vic_nez_zustatek' });
  eq('limity: zrušený poukaz má přednost', posudUplatneni(p({ status: 'void' }), 10, DNES, 'CZK', { min: 50, max: 0 }), { ok: false, duvod: 'zruseny' });
  eq('limity: normalizace prázdných', normalizujLimity('', ''), { ok: true, limity: { min: 0, max: 0 } });
  eq('limity: normalizace čísel jako text', normalizujLimity('50', '500'), { ok: true, limity: { min: 50, max: 500 } });
  eq('limity: min vyšší než max', normalizujLimity(600, 500).ok, false);
  eq('limity: min bez max je v pořádku', normalizujLimity(600, 0).ok, true);
  eq('limity: záporné', normalizujLimity(-1, 0).ok, false);
  eq('limity: desetinné', normalizujLimity(2.5, 0).ok, false);
  eq('limity: text', normalizujLimity('abc', 0).ok, false);
  eq('limity: nad miliónem', normalizujLimity(0, 2_000_000).ok, false);
  ok('limity: věta s číslem pro minimum', textOdmitnuti('pod_minimem', { min: 50, max: 0 }, 'CZK').includes('50'));
  ok('limity: věta s číslem pro maximum', textOdmitnuti('nad_maximem', { min: 0, max: 300 }, 'CZK').includes('300'));
  eq('limity: bez limitu pevný text', textOdmitnuti('nad_maximem', null, 'CZK'), DUVOD_TEXT.nad_maximem);
  ok('limity: věta v eurech nemá koruny', !/Kč/.test(textOdmitnuti('nad_maximem', { min: 0, max: 300 }, 'EUR')));

  // Souběh: 20 uplatnění po 100 z poukazu za 1000 s maximem 300 najednou (model jednoho atomického UPDATE ... WHERE).
  const poukaz = { balance: 1000 };
  const uplatni = async (castka: number) => {
    const v = posudUplatneni(p({ balance: poukaz.balance }), castka, DNES, 'CZK', { min: 0, max: 300 });
    if (!v.ok) return false;
    poukaz.balance -= castka; // podmínka a odečet v jednom kroku, jako `WHERE balance >= částka`
    return true;
  };
  const vysledky = await Promise.all(Array.from({ length: 20 }, () => uplatni(100)));
  eq('souběh: uplatnilo se právě deset', vysledky.filter(Boolean).length, 10);
  eq('souběh: zůstatek je nula, ne záporný', poukaz.balance, 0);

  // ---- Hromadné prodloužení ----
  eq('nová platnost: dnes projde', overNovouPlatnost(DNES, DNES), { ok: true, datum: DNES });
  eq('nová platnost: v minulosti ne', overNovouPlatnost('2026-09-30', DNES).ok, false);
  eq('nová platnost: neexistující datum ne', overNovouPlatnost('2026-02-31', DNES).ok, false);
  eq('nová platnost: text ne', overNovouPlatnost('zítra', DNES).ok, false);
  eq('nová platnost: prázdná ne', overNovouPlatnost('', DNES).ok, false);
  eq('prodloužení: platný poukaz', posudProdlouzeni({ status: 'active', balance: 100, valid_until: '2026-10-10' }, '2026-12-31'), { ok: true });
  eq('prodloužení: propadlý se zůstatkem se oživí', posudProdlouzeni({ status: 'active', balance: 100, valid_until: '2026-09-01' }, '2026-12-31').ok, true);
  eq('prodloužení: zrušený ne', posudProdlouzeni({ status: 'void', balance: 0, valid_until: '2026-10-10' }, '2026-12-31'), { ok: false, duvod: 'zruseny' });
  eq('prodloužení: vyčerpaný ne', posudProdlouzeni({ status: 'used', balance: 0, valid_until: '2026-10-10' }, '2026-12-31'), { ok: false, duvod: 'vycerpany' });
  eq('prodloužení: bez platnosti není co prodlužovat', posudProdlouzeni({ status: 'active', balance: 100, valid_until: null }, '2026-12-31'), { ok: false, duvod: 'bez_platnosti' });
  eq('prodloužení: kratší datum ne (zkrátit jde jen po jednom)', posudProdlouzeni({ status: 'active', balance: 100, valid_until: '2027-06-01' }, '2026-12-31'), { ok: false, duvod: 'neni_delsi' });
  eq('prodloužení: stejné datum ne', posudProdlouzeni({ status: 'active', balance: 100, valid_until: '2026-12-31' }, '2026-12-31'), { ok: false, duvod: 'neni_delsi' });
  eq('id: bez duplicit', idPoukazu([3, '3', 4]), [3, 4]);
  eq('id: prázdné ne', idPoukazu([]), null);
  eq('id: nesmysl ne', idPoukazu([1, 'x']), null);
  eq('id: nula ne', idPoukazu([0]), null);
  eq('id: moc najednou ne', idPoukazu(Array.from({ length: MAX_PRODLOUZENI + 1 }, (_, i) => i + 1)), null);
  eq('id: přesně maximum projde', idPoukazu(Array.from({ length: MAX_PRODLOUZENI }, (_, i) => i + 1))?.length, MAX_PRODLOUZENI);
  eq('id: není pole', idPoukazu('1,2'), null);

  // Souběh: dvě prodloužení téhož poukazu najednou (model `WHERE valid_until < nový`): druhé s týmž datem nic nezmění.
  const v = { valid_until: '2026-10-10', zmen: 0 };
  const prodluz = async (novy: string) => { if (v.valid_until < novy) { v.valid_until = novy; v.zmen++; return true; } return false; };
  const r2 = await Promise.all([prodluz('2027-01-31'), prodluz('2027-01-31'), prodluz('2026-12-01')]);
  eq('souběh prodloužení: platnost je nejdelší z požadavků', v.valid_until, '2027-01-31');
  ok('souběh prodloužení: nikdy se nezkrátí', r2.filter(Boolean).length >= 1 && v.valid_until === '2027-01-31');

  // ---- Přehled závazku ----
  const sk = [
    { stav: 'active' as const, currency: 'CZK', pocet: 4, zustatek: 2500, hodnota: 4000 },
    { stav: 'expired' as const, currency: 'CZK', pocet: 2, zustatek: 600, hodnota: 800 },
    { stav: 'used' as const, currency: 'CZK', pocet: 9, zustatek: 0, hodnota: 5000 },
    { stav: 'void' as const, currency: 'CZK', pocet: 1, zustatek: 0, hodnota: 300 },
    { stav: 'active' as const, currency: 'EUR', pocet: 3, zustatek: 90, hodnota: 100 },
  ];
  const pr = slozPrehled(sk, 'CZK', { pocet: 1, castka: 700 });
  eq('přehled: závazek jsou jen platné poukazy v měně podniku', [pr.zavazek, pr.pocetPlatnych], [2500, 4]);
  eq('přehled: propadlé zvlášť', [pr.propadlo, pr.pocetPropadlych], [600, 2]);
  eq('přehled: v jiné měně se nesčítá', pr.vJineMene, 3);
  eq('přehled: brzy propadne', pr.brzyPropadne, { pocet: 1, castka: 700 });
  eq('přehled: prázdné je nula', slozPrehled([], 'CZK', { pocet: 0, castka: 0 }).zavazek, 0);
  eq('přehled: malá písmena v měně', slozPrehled([{ stav: 'active', currency: 'czk', pocet: 1, zustatek: 10, hodnota: 10 }], 'CZK', { pocet: 0, castka: 0 }).zavazek, 10);

  // ---- Měsíce ----
  eq('měsíc: posun zpět přes rok', posunMesice('2026-02', -3), '2025-11');
  eq('měsíc: posun vpřed přes rok', posunMesice('2026-11', 3), '2027-02');
  eq('měsíc: špatný tvar zůstane', posunMesice('nesmysl', 1), 'nesmysl');
  const ms = doplnMesice([
    { mesic: '2026-10', prodano: 3000, pocetProdanych: 3, uplatneno: 800, vraceno: 200 },
    { mesic: '2026-08', prodano: 500, pocetProdanych: 1, uplatneno: 0, vraceno: 0 },
    { mesic: '2024-01', prodano: 99, pocetProdanych: 1, uplatneno: 0, vraceno: 0 },
  ], '2026-10', 12);
  eq('měsíce: dvanáct od nejstaršího', [ms.length, ms[0].mesic, ms[11].mesic], [12, '2025-11', '2026-10']);
  eq('měsíce: chybějící jsou nuly', ms.find(m => m.mesic === '2026-09'), { mesic: '2026-09', prodano: 0, pocetProdanych: 0, uplatneno: 0, vraceno: 0, cistoUplatneno: 0 });
  eq('měsíce: uplatněno je po vrácení', ms[11].cistoUplatneno, 600);
  ok('měsíce: starší než rok se neukáže', !ms.some(m => m.mesic === '2024-01'));
  eq('měsíce: přes přelom roku', doplnMesice([], '2026-01', 3).map(m => m.mesic), ['2025-11', '2025-12', '2026-01']);

  // ---- Připomenutí ----
  const k = (x: any = {}) => ({ status: 'active', balance: 100, valid_until: '2026-10-10', pripomenuto: false, ...x });
  eq('připomenutí: končí za 9 dní', kPripomenuti(k(), DNES), true);
  eq('připomenutí: hranice okna', kPripomenuti(k({ valid_until: '2026-10-15' }), DNES), true);
  eq('připomenutí: o den dál ještě ne', kPripomenuti(k({ valid_until: '2026-10-16' }), DNES), false);
  eq('připomenutí: končí dnes', kPripomenuti(k({ valid_until: DNES }), DNES), true);
  eq('připomenutí: už propadlý ne', kPripomenuti(k({ valid_until: '2026-09-30' }), DNES), false);
  eq('připomenutí: už připomenutý ne', kPripomenuti(k({ pripomenuto: true }), DNES), false);
  eq('připomenutí: vyčerpaný ne', kPripomenuti(k({ balance: 0 }), DNES), false);
  eq('připomenutí: zrušený ne', kPripomenuti(k({ status: 'void' }), DNES), false);
  eq('připomenutí: bez platnosti ne', kPripomenuti(k({ valid_until: null }), DNES), false);
  eq('připomenutí: okno je 14 dní', PRIPOMENUTI_DNI, 14);

  // ---- E-mail ----
  eq('e-mail: adresa se očistí', emailObdarovaneho('  Jana@Example.CZ '), 'jana@example.cz');
  eq('e-mail: bez zavináče ne', emailObdarovaneho('jana.example.cz'), null);
  eq('e-mail: prázdný ne', emailObdarovaneho('   '), null);
  eq('e-mail: moc dlouhý ne', emailObdarovaneho(`${'a'.repeat(130)}@example.cz`), null);
  eq('vzkaz: ořízne se', vzkazDarce('x'.repeat(900))?.length, MAX_VZKAZ);
  eq('vzkaz: prázdný je null', vzkazDarce('   '), null);
  eq('vzkaz: řídicí znaky pryč, odřádkování zůstane', vzkazDarce('a\u0000b\nc'), 'ab\nc');
  const mail = emailPoukazu({ podnik: 'Čajovna <U Lípy>', kod: 'DP-ABCD-2349', castka: 500, mena: 'CZK', platnost: '2026-12-31', komu: 'Jana "J" & spol.', vzkaz: '<script>alert(1)</script>', odkaz: 'https://www.managero.app/client/lipa?tab=loyalty' });
  ok('e-mail: kód je v těle', mail.html.includes('DP-ABCD-2349'));
  ok('e-mail: hodnota v měně podniku', mail.html.includes('500') && mail.html.includes('Kč'));
  ok('e-mail: platnost česky', mail.html.includes('31. 12. 2026'));
  ok('e-mail: jména a vzkaz jsou escapované (žádné syrové < z dat)', !mail.html.includes('<script>') && !mail.html.includes('<U Lípy>') && mail.html.includes('&lt;script&gt;'));
  ok('e-mail: odkaz na stránku podniku', mail.html.includes('href="https://www.managero.app/client/lipa?tab=loyalty"'));
  ok('e-mail: předmět nese podnik', mail.subject.includes('Čajovna'));
  const bez = emailPoukazu({ podnik: 'Lípa', kod: 'DP-ABCD-2349', castka: 500, mena: 'EUR', platnost: null });
  ok('e-mail: bez omezení platnosti a v eurech', bez.html.includes('Bez omezení platnosti') && !bez.html.includes('Kč') && bez.html.includes('€'));
  const pripomina = emailPripominky({ podnik: 'Lípa', kod: 'DP-ABCD-2349', castka: 250, mena: 'CZK', platnost: '2026-10-05', zbyvaDni: 4 });
  ok('připomínka: za 4 dny (správný tvar)', pripomina.html.includes('za 4 dny'));
  ok('připomínka: za 7 dní', emailPripominky({ podnik: 'L', kod: 'K', castka: 1, mena: 'CZK', platnost: '2026-10-08', zbyvaDni: 7 }).html.includes('za 7 dní'));
  ok('připomínka: zítra a dnes', emailPripominky({ podnik: 'L', kod: 'K', castka: 1, mena: 'CZK', platnost: '2026-10-02', zbyvaDni: 1 }).html.includes('zítra')
    && emailPripominky({ podnik: 'L', kod: 'K', castka: 1, mena: 'CZK', platnost: DNES, zbyvaDni: 0 }).html.includes('dnes'));

  // ---- Pojistky nad zdrojáky ----
  const db = zdroj('lib/poukazyDb.ts');
  ok('uplatnění: limity jsou i v podmínce UPDATE (ne jen předem)', db.includes('${limity.max}::int = 0 OR ${castka}::int <= ${limity.max}::int') && db.includes('OR balance = ${castka}::int'));
  const prehledDb = zdroj('lib/poukazyPrehledDb.ts');
  ok('prodloužení: jeden UPDATE s podmínkou, ne smyčka', prehledDb.includes('valid_until < ${novy}::date') && !/for \(const .* of .*ids/.test(prehledDb));
  ok('prodloužení: nevrací do hry zrušené a vyčerpané', prehledDb.includes("status = 'active' AND balance > 0"));
  ok('prodloužení: vynuluje příznaky připomenutí', prehledDb.includes('expiry_notified_at = NULL, expiry_mailed_at = NULL'));
  ok('připomenutí: poukaz se nejdřív zabere a pak odešle (idempotence)', prehledDb.includes('SET expiry_notified_at = ${dnes}::date') && prehledDb.includes('SET expiry_mailed_at = ${dnes}::date') && prehledDb.indexOf('expiry_mailed_at = ${dnes}::date') < prehledDb.indexOf('sendVoucherEmail(String('));
  ok('připomenutí: selhané odeslání se uvolní k dalšímu pokusu', (prehledDb.match(/SET expiry_mailed_at = NULL WHERE id/g) ?? []).length >= 2);
  ok('měsíce jsou pražské, ne UTC', prehledDb.includes("AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague'") && !/created_at::date/.test(prehledDb));
  ok('přehled a odeslání jen pro správce', zdroj('app/api/client/admin/vouchers/route.ts').split("poukazy.spravovat").length >= 5);
  ok('e-mail adresa se v protokolu maskuje', prehledDb.includes('maskujEmail(email)') && !/audit\([^)]*\$\{email\}/.test(prehledDb));
  ok('cron volá připomenutí poukazů', zdroj('app/api/init/route.ts').includes('await pripomenPoukazy()'));
  ok('odeslání e-mailu má omezení počtu', zdroj('app/api/client/admin/vouchers/route.ts').includes('hit(`poukaz-email:'));
  ok('smazání účtu maže i e-mail obdarovaného', zdroj('lib/smazaniUctu.ts').includes('recipient_email = NULL'));
}
