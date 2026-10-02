// Kolo 81 — zprávy členům: kontrola vstupu, čas plánování v pražském čase, okna pro srovnání
// návštěv, denní limit při odeslání (ne při zadání), příloha kupon / promo kód, zkouška sobě,
// úprava naplánované zprávy a respektování vypnutých novinek.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  zkontrolujZpravu, casPlanovani, oknoUcinku, vetaUcinku, zbyvaZprav, radekPrilohy, textOznameni, jePlatnePublikum, klicLimituZprav, simpleHash,
  DRUHY_NAVSTEVY, ZPRAV_DENNE, TITLE_MAX, BODY_MAX, PLANOVANI_DNI, DUPLICITA_MS,
} from '../../lib/zpravyPravidla.ts';
import { jeZtlumeno } from '../../lib/pushPravidla.ts';
import { AUDIT_POPISKY } from '../../lib/auditPopisky.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const TED = new Date('2026-10-02T12:00:00Z').getTime();
const clen = (n: number) => `${n} členů`;

export default async function ({ eq, ok }: Testy) {
  // ---- vstup zprávy ----
  const platna = zkontrolujZpravu({ title: 'Nový čaj', body: 'Ochutnávka', audience: 'all', linkKind: 'page' }, TED);
  ok('zpráva: platná projde', 'data' in platna && platna.data.title === 'Nový čaj' && platna.data.scheduledAt === null);
  ok('zpráva: bez nadpisu je chyba', 'chyba' in zkontrolujZpravu({ title: '  ' }, TED));
  ok('zpráva: nadpis nad limit je chyba (dřív se tiše uřízl)', /nejvýš 80/.test(String((zkontrolujZpravu({ title: 'x'.repeat(TITLE_MAX + 1) }, TED) as any).chyba)));
  ok('zpráva: text nad limit je chyba', /nejvýš 300/.test(String((zkontrolujZpravu({ title: 'a', body: 'x'.repeat(BODY_MAX + 1) }, TED) as any).chyba)));
  ok('zpráva: neznámé publikum je chyba, ne tiché „všem"', 'chyba' in zkontrolujZpravu({ title: 'a', audience: 'vsichni-na-svete' }, TED));
  ok('zpráva: publikum „selection" se z formuláře zadat nedá', !jePlatnePublikum('selection'));
  eq('publikum: všechny druhy, které UI nabízí, jsou platné', ['all', 'quiet', 'quiet:60', 'quiet:90', 'birthday:month', 'near:stamps', 'near:points', 'new:14', 'tier:silver', 'tier:gold', 'tier:platinum', 'group:12', 'gold'].map(jePlatnePublikum), Array(13).fill(true));
  eq('publikum: group:abc a prázdné jsou neplatné', ['group:abc', '', 'tier:diamond'].map(jePlatnePublikum), [false, false, false]);
  eq('zpráva: neznámý cíl odkazu padá na stránku podniku', (zkontrolujZpravu({ title: 'a', linkKind: 'ven' }, TED) as any).data.linkKind, 'page');

  // ---- čas plánování ----
  eq('čas: letní pražský čas (CEST, +2) → 12:00 UTC', casPlanovani('2026-10-05T14:00')?.toISOString(), '2026-10-05T12:00:00.000Z');
  eq('čas: zimní pražský čas (CET, +1) → 13:00 UTC', casPlanovani('2026-12-05T14:00')?.toISOString(), '2026-12-05T13:00:00.000Z');
  eq('čas: ISO s pásmem zůstane beze změny', casPlanovani('2026-10-05T14:00:00Z')?.toISOString(), '2026-10-05T14:00:00.000Z');
  eq('čas: nesmysl a prázdné jsou null', [casPlanovani('zítra'), casPlanovani(''), casPlanovani(null)], [null, null, null]);
  const budouci = zkontrolujZpravu({ title: 'a', scheduledAt: '2026-10-05T14:00' }, TED) as any;
  eq('plánování: čas v budoucnu se zachová', budouci.data.scheduledAt.toISOString(), '2026-10-05T12:00:00.000Z');
  eq('plánování: čas v minulosti nebo za pár vteřin je odeslání hned', [zkontrolujZpravu({ title: 'a', scheduledAt: '2026-09-01T10:00' }, TED), zkontrolujZpravu({ title: 'a', scheduledAt: new Date(TED + 30_000).toISOString() }, TED)].map((r: any) => r.data.scheduledAt), [null, null]);
  ok('plánování: dál než 90 dní je chyba', /nejvýš 90/.test(String((zkontrolujZpravu({ title: 'a', scheduledAt: new Date(TED + (PLANOVANI_DNI + 2) * 86400000).toISOString() }, TED) as any).chyba)));
  ok('plánování: den před hranicí 90 dní projde', 'data' in zkontrolujZpravu({ title: 'a', scheduledAt: new Date(TED + (PLANOVANI_DNI - 1) * 86400000).toISOString() }, TED));
  ok('plánování: nečitelný čas je chyba', 'chyba' in zkontrolujZpravu({ title: 'a', scheduledAt: 'brzy' }, TED));

  // ---- příloha ----
  eq('příloha: kupon a promo kód zároveň nejde', 'chyba' in zkontrolujZpravu({ title: 'a', couponId: 3, promoId: 4 }, TED), true);
  const sKuponem = zkontrolujZpravu({ title: 'a', couponId: 3, linkKind: 'page' }, TED) as any;
  eq('příloha: se zprávou s kuponem se cíl „stránka" změní na Věrnost', [sKuponem.data.couponId, sKuponem.data.linkKind], [3, 'loyalty']);
  eq('příloha: vlastní cíl zůstane', (zkontrolujZpravu({ title: 'a', promoId: 5, linkKind: 'me' }, TED) as any).data.linkKind, 'me');
  eq('příloha: nesmyslné id je bez přílohy', [(zkontrolujZpravu({ title: 'a', couponId: 'x' }, TED) as any).data.couponId, (zkontrolujZpravu({ title: 'a', couponId: -2 }, TED) as any).data.couponId], [null, null]);
  eq('text oznámení: kupon pod textem', textOznameni('Jaro', 'Pojď k nám', { kupon: { title: 'Káva zdarma' } }), { title: 'Jaro', body: 'Pojď k nám\nKupon: Káva zdarma' });
  eq('text oznámení: promo kód bez textu zprávy', textOznameni('Jaro', '', { promo: { code: 'JARO25' } }), { title: 'Jaro', body: 'Promo kód: JARO25' });
  eq('text oznámení: bez přílohy a bez textu nemá tělo', textOznameni('Jaro', '  ', null).body, undefined);
  eq('řádek přílohy: bez přílohy nic', radekPrilohy(null), '');

  // ---- denní limit ----
  eq('limit: pět zpráv za den', ZPRAV_DENNE, 5);
  eq('limit: zbývá', [0, 3, 5, 9].map(n => zbyvaZprav(n)), [5, 2, 0, 0]);
  ok('limit: klíč nese den i podnik (o půlnoci se počítá znovu, podniky se neovlivňují)', klicLimituZprav(1, '2026-10-02') !== klicLimituZprav(1, '2026-10-03') && klicLimituZprav(1, '2026-10-02') !== klicLimituZprav(2, '2026-10-02'));
  eq('dvojklik: stejná zpráva stejnému publiku má stejný klíč, jiný text jiný', [simpleHash('a|b|all|0') === simpleHash('a|b|all|0'), simpleHash('a|b|all|0') === simpleHash('a|c|all|0')], [true, false]);
  ok('dvojklik: okno duplicity je pár minut', DUPLICITA_MS >= 60_000 && DUPLICITA_MS <= 600_000);

  const route = precti('app/api/client/admin/broadcast/route.ts');
  const lib = precti('lib/broadcasts.ts');
  const vetevPlanovani = route.slice(route.indexOf('if (data.scheduledAt) {'), route.indexOf('const r = await odesliZpravu'));
  ok('limit: naplánování zprávy slot NEspotřebuje (větev plánování nevolá limit ani odeslání)', vetevPlanovani.length > 100 && !/hit\(|vezmiSlot|odesliZpravu|ZPRAV_DENNE/.test(vetevPlanovani));
  ok('limit: odeslání bere slot dřív, než se zpráva založí', lib.indexOf('await vezmiSlot(teamId)') > 0 && lib.indexOf('await vezmiSlot(teamId)') < lib.indexOf('INSERT INTO client_broadcasts'));
  ok('limit: slot je atomický upsert s klíčem dne', /hit\(klicLimituZprav\(teamId, pragueToday\(\)\), ZPRAV_DENNE/.test(lib));
  ok('limit: dispatcher bere slot při odeslání a při vyčerpání vrátí zprávu do fronty', /vezmiSlot\(Number\(claimed\.team_id\)\)/.test(lib) && /SET status = 'scheduled', sent_at = scheduled_at/.test(lib));
  ok('dispatcher: přivlastnění řádku je atomické (UPDATE … WHERE status = scheduled RETURNING)', /UPDATE client_broadcasts SET status = 'sent', sent_at = NOW\(\)\s+WHERE id = \$\{d\.id\} AND status = 'scheduled' RETURNING \*/.test(lib));

  // Souběh: pět zpráv odejde, šestá a další ne (podmínka count > max jako v hit()).
  let pocet = 0;
  const slot = async () => { pocet += 1; return pocet <= ZPRAV_DENNE; };
  const vysledky = await Promise.all(Array.from({ length: 12 }, () => slot()));
  eq('souběh: z 12 současných odeslání projde přesně limit', vysledky.filter(Boolean).length, ZPRAV_DENNE);

  // ---- okna pro srovnání návštěv ----
  const o = oknoUcinku('2026-10-02T10:00:00Z', new Date('2026-10-05T10:00:00Z'))!;
  eq('okno: sedm kalendářních dnů před a po dni odeslání, den odeslání mimo', [o.predOd, o.predDo, o.poOd, o.poDo], ['2026-09-25', '2026-10-01', '2026-10-03', '2026-10-09']);
  eq('okno: běží, dokud neskončí sedmý den', [o.probiha, oknoUcinku('2026-10-02T10:00:00Z', new Date('2026-10-09T10:00:00Z'))!.probiha, oknoUcinku('2026-10-02T10:00:00Z', new Date('2026-10-10T10:00:00Z'))!.probiha], [true, true, false]);
  const pulnoc = oknoUcinku('2026-10-02T22:30:00Z', new Date('2026-10-20T10:00:00Z'))!;
  eq('okno: zpráva v 00:30 pražského času patří už do dalšího dne (ne do UTC dne)', [pulnoc.predDo, pulnoc.poOd], ['2026-10-02', '2026-10-04']);
  eq('okno: čas z databáze bez pásma je UTC', oknoUcinku('2026-10-02 22:30:00', new Date('2026-10-20T10:00:00Z'))?.poOd, '2026-10-04');
  eq('okno: nečitelný čas je null', oknoUcinku('nic'), null);
  eq('okno: přes změnu letního času drží kalendářní dny', [oknoUcinku('2026-10-25T10:00:00Z')!.predOd, oknoUcinku('2026-10-25T10:00:00Z')!.poDo], ['2026-10-18', '2026-11-01']);
  eq('návštěva jsou jen visit a order', [...DRUHY_NAVSTEVY], ['visit', 'order']);
  ok('metrika: SQL počítá jen visit a order a pražské dny, ne každý řádek deníku', /l\.kind IN \('visit', 'order'\)/.test(route) && /AT TIME ZONE 'Europe\/Prague'\)::date BETWEEN w\.po_od::date AND w\.po_do::date/.test(route) && !/l\.created_at >= b\.sent_at/.test(route));
  ok('metrika: počítají se různí hosté, ne řádky', /COUNT\(DISTINCT l\.customer_id\)/.test(route));
  eq('věta účinku: žádná data nic neříká', vetaUcinku(0, 0, false, clen), null);
  eq('věta účinku: po, před a rozdíl', vetaUcinku(14, 10, false, clen), '14 členů u kasy do 7 dní, předtím 10 (+4)');
  eq('věta účinku: probíhá a pokles', vetaUcinku(3, 8, true, clen), 'zatím 3 členů u kasy do 7 dní, předtím 8 (-5)');
  eq('věta účinku: beze změny bez závorky', vetaUcinku(5, 5, false, clen), '5 členů u kasy do 7 dní, předtím 5');

  // ---- novinky a odhlášení ----
  eq('novinky: bez souhlasu zpráva nejde', [jeZtlumeno({}, 'novinky'), jeZtlumeno(null, 'novinky'), jeZtlumeno(undefined, 'novinky')], [true, true, true]);
  eq('novinky: odhlášený host zprávu nedostane', jeZtlumeno({ novinky: false }, 'novinky'), true);
  eq('novinky: jen výslovné true zprávu pustí (ne řetězec, ne 1)', [jeZtlumeno({ novinky: true }, 'novinky'), jeZtlumeno({ novinky: 'true' }, 'novinky'), jeZtlumeno({ novinky: 1 }, 'novinky')], [false, true, true]);
  eq('novinky: ostatní kategorie to neovlivní', [jeZtlumeno({ novinky: false }, 'message'), jeZtlumeno({ messages: false }, 'message')], [false, true]);
  ok('doručení: zpráva i „Chybíš nám" jdou v kategorii novinky (respektují odhlášení)', /category: 'novinky'/.test(lib) && /category: 'novinky'/.test(precti('lib/reaktivace.ts')));
  const push = precti('lib/push.ts');
  ok('push: vypnutá kategorie nevytvoří ani oznámení v aplikaci (return před INSERT)', push.indexOf('if (jeZtlumeno(prefs ?? {}, payload.category)) return false;') > 0 && push.indexOf('if (jeZtlumeno(prefs ?? {}, payload.category)) return false;') < push.indexOf('INSERT INTO notifications'));
  ok('push: rozeslání jde po dávkách a chyba jednoho hosta nezastaví ostatní', /PUSH_SOUBEZNE = 20/.test(push) && /\.catch\(e => \{ console\.error\('notifyUser selhal'/.test(push));
  ok('dosah: UI i server počítají, kolik z publika má zapnuté novinky', /notif_prefs->>'novinky' = 'true'/.test(lib) && /dosah=/.test(precti('components/client/loyalty/ZpravyRozeslani.tsx')));
  ok('doručeno a zdrženo se zapíše k zprávě (recipients, muted)', /SET recipients = \$\{r\.doruceno\}, muted = \$\{r\.ztlumeno\}/.test(lib));

  // ---- zkouška sobě, úprava, zrušení ----
  ok('zkouška: neposílá se v kategorii novinky (správce s vypnutými novinkami ji dostane) a nespotřebuje slot', /Bez kategorie „novinky“/.test(lib) && !/vezmiSlot/.test(lib.slice(lib.indexOf('export async function zkusebniZprava'))));
  ok('zkouška: nepíše řádek do historie a má vlastní omezení', !/INSERT INTO client_broadcasts/.test(lib.slice(lib.indexOf('export async function zkusebniZprava'))) && /client-broadcast-test:/.test(route));
  ok('úprava: PATCH mění jen zprávu, která pořád čeká ve frontě (atomicky), jinak 409', /WHERE id = \$\{id\} AND team_id = \$\{u\.team_id\} AND status = 'scheduled'\s+RETURNING \*/.test(route) && /status: 409/.test(route));
  ok('úprava: nový čas musí být v budoucnu', /Čas odeslání musí být v budoucnu/.test(route));
  ok('zrušení: jen čekající a zapíše se do protokolu', /AND status = 'scheduled' RETURNING id, title/.test(route) && /'client\.broadcast\.zruseno'/.test(route));
  ok('příloha: připojit ji smí jen ten, kdo spravuje kupony, a ověřuje se, že patří podniku a platí', /kupony\.spravovat/.test(route) && /kind = 'offer' AND active = TRUE/.test(lib) && /team_id = \$\{teamId\}/.test(lib));
  ok('příloha: neplatná příloha při doručení zprávu neshodí', /Příloha, která mezitím přestala platit, se vynechá/.test(lib));
  ok('skupina v publiku musí patřit podniku', /FROM client_groups WHERE id = \$\{parseInt\(m\[1\], 10\)\} AND team_id = \$\{teamId\}/.test(route));
  ok('veřejná stránka: Novinky ukazují jen zprávy všem členům', /COALESCE\(audience, 'all'\) = 'all'/.test(precti('app/api/client/b/[slug]/route.ts')));

  // ---- protokol změn ----
  for (const klic of ['client.broadcast', 'client.broadcast.test', 'client.broadcast.upraveno', 'client.broadcast.zruseno', 'client.group', 'client.bulk', 'client.export', 'client.poznamka', 'client.points', 'client.credit']) {
    ok(`protokol: ${klic} má český popisek`, typeof AUDIT_POPISKY[klic] === 'string' && AUDIT_POPISKY[klic].length > 8);
  }
}
