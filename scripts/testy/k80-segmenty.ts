// Kolo 80 — segmenty příjemců zpráv, automatické „Chybíš nám“ a časová osa hosta.
//
// Čisté funkce z lib/segmenty.ts a lib/clenPrehled.ts: kdo patří do segmentu,
// hranice „přesně N dní“, host bez návštěvy, idempotenční klíč a sestavení osy.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  patriDoSegmentu, vyberClenu, spoctiSegmenty, blizkoKuponu, maDostatChybisNam, refChybisNam, textChybisNam,
  jeSegment, stitekPublika, SEGMENTY, type ClenSegmentu, type KontextSegmentu,
} from '../../lib/segmenty.ts';
import { casovaOsa, zbyvaDoUrovne, zbyvaDoOdmeny } from '../../lib/clenPrehled.ts';
import { tierFor } from '../../lib/clientSlots.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const NOW = new Date('2026-10-02T12:00:00Z');
const dnuZpet = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const K: KontextSegmentu = { now: NOW, mesic: 10, cenyKuponu: [100, 300] };
const clen = (o: Partial<ClenSegmentu> = {}): ClenSegmentu => ({ id: 1, lastVisitAt: dnuZpet(1), joinedAt: dnuZpet(200), birthday: null, chybiRazitek: null, points: 0, ...o });

export default function ({ eq, ok }: Testy) {
  // ---- nepřišli N dní ----
  eq('quiet: 29 dní nestačí', patriDoSegmentu('quiet', clen({ lastVisitAt: dnuZpet(29) }), K), false);
  eq('quiet: přesně 30 dní stačí', patriDoSegmentu('quiet', clen({ lastVisitAt: dnuZpet(30) }), K), true);
  eq('quiet: návštěva dnes ne', patriDoSegmentu('quiet', clen({ lastVisitAt: dnuZpet(0) }), K), false);
  eq('quiet:60 hranice 59 a 60', [59, 60].map(n => patriDoSegmentu('quiet:60', clen({ lastVisitAt: dnuZpet(n) }), K)), [false, true]);
  eq('quiet:90 hranice 89 a 90', [89, 90].map(n => patriDoSegmentu('quiet:90', clen({ lastVisitAt: dnuZpet(n) }), K)), [false, true]);
  eq('quiet: bez návštěvy se měří od přidání (nový člen není spáč)', patriDoSegmentu('quiet', clen({ lastVisitAt: null, joinedAt: dnuZpet(5) }), K), false);
  eq('quiet: bez návštěvy a přidán před 40 dny je spáč', patriDoSegmentu('quiet', clen({ lastVisitAt: null, joinedAt: dnuZpet(40) }), K), true);
  eq('quiet: stará data bez obojího jsou spáč', patriDoSegmentu('quiet', clen({ lastVisitAt: null, joinedAt: null }), K), true);
  eq('quiet: čas z databáze bez pásma se bere jako UTC', patriDoSegmentu('quiet', clen({ lastVisitAt: '2026-09-02 12:00:00' }), K), true);

  // ---- narozeniny ----
  eq('narozeniny: stejný měsíc', patriDoSegmentu('birthday:month', clen({ birthday: '1990-10-31' }), K), true);
  eq('narozeniny: jiný měsíc', patriDoSegmentu('birthday:month', clen({ birthday: '1990-09-30' }), K), false);
  eq('narozeniny: bez data narození', patriDoSegmentu('birthday:month', clen({ birthday: null }), K), false);
  eq('narozeniny: nesmysl v poli', patriDoSegmentu('birthday:month', clen({ birthday: 'brzy' }), K), false);

  // ---- blízko odměně ----
  eq('razítka: chybí 1 a 2 ano', [1, 2].map(n => patriDoSegmentu('near:stamps', clen({ chybiRazitek: n }), K)), [true, true]);
  eq('razítka: chybí 3 ne, 0 ne, nic ne', [3, 0, null].map(n => patriDoSegmentu('near:stamps', clen({ chybiRazitek: n }), K)), [false, false, false]);
  eq('kupon: 100 b. stačí, nic nechybí', blizkoKuponu(100, [100]), false);
  eq('kupon: chybí 10 do stovky ano', blizkoKuponu(90, [100, 300]), true);
  eq('kupon: chybí 50 do stovky ne', blizkoKuponu(50, [100]), false);
  eq('kupon: u drahého kuponu stačí pětina (60 ze 300)', blizkoKuponu(240, [300]), true);
  eq('kupon: 61 ze 300 už ne', blizkoKuponu(239, [300]), false);
  eq('kupon: bez kuponů nikdo není blízko', blizkoKuponu(10, []), false);
  eq('kupon: berou se jen kupony nad body hosta', blizkoKuponu(150, [100, 300]), false);
  eq('kupon: segment používá ceny z kontextu', patriDoSegmentu('near:points', clen({ points: 95 }), K), true);

  // ---- noví členové ----
  eq('nový: 13 dní ano', patriDoSegmentu('new:14', clen({ joinedAt: dnuZpet(13) }), K), true);
  eq('nový: přesně 14 dní už ne', patriDoSegmentu('new:14', clen({ joinedAt: dnuZpet(14) }), K), false);
  eq('nový: bez data přidání ne', patriDoSegmentu('new:14', clen({ joinedAt: null }), K), false);

  // ---- výběr a počty ----
  eq('neznámý segment nepatří nikomu', patriDoSegmentu('xyz', clen(), K), false);
  const sada = [
    clen({ id: 1, lastVisitAt: dnuZpet(95), birthday: '1985-10-01' }),
    clen({ id: 2, lastVisitAt: dnuZpet(65), chybiRazitek: 2 }),
    clen({ id: 3, lastVisitAt: dnuZpet(2), joinedAt: dnuZpet(3), points: 95 }),
  ];
  eq('výběr quiet:60 dá členy 1 a 2', vyberClenu('quiet:60', sada, K), [1, 2]);
  eq('výběr quiet:90 dá jen člena 1', vyberClenu('quiet:90', sada, K), [1]);
  const pocty = spoctiSegmenty(sada, K);
  eq('počty: každý segment má číslo', Object.keys(pocty).sort(), SEGMENTY.map(s => s.id).sort());
  eq('počty: konkrétní hodnoty', [pocty.quiet, pocty['quiet:60'], pocty['quiet:90'], pocty['birthday:month'], pocty['near:stamps'], pocty['near:points'], pocty['new:14']], [2, 2, 1, 1, 1, 1, 1]);
  eq('prázdná sada dává nuly', Object.values(spoctiSegmenty([], K)).every(n => n === 0), true);
  ok('jeSegment zná nové i starý quiet', jeSegment('quiet') && jeSegment('quiet:90') && jeSegment('near:points') && !jeSegment('tier:gold') && !jeSegment('group:3'));
  eq('štítek publika: quiet:60', stitekPublika('quiet:60'), 'nepřišli dva měsíce a déle');
  eq('štítek publika: skupina s názvem', stitekPublika('group:3', 'Štamgasti'), 'skupina Štamgasti');
  eq('štítek publika: všem členům nemá štítek', stitekPublika('all'), null);

  // ---- Chybíš nám ----
  eq('chybíš nám: vypnuto (0 dní)', maDostatChybisNam(dnuZpet(40), 0, NOW), false);
  eq('chybíš nám: záporné číslo je vypnuto', maDostatChybisNam(dnuZpet(40), -5, NOW), false);
  eq('chybíš nám: 29 dní při pravidlu 30 ne', maDostatChybisNam(dnuZpet(29), 30, NOW), false);
  eq('chybíš nám: přesně 30 dní ano', maDostatChybisNam(dnuZpet(30), 30, NOW), true);
  eq('chybíš nám: 43 dní (poslední den okna) ano', maDostatChybisNam(dnuZpet(43), 30, NOW), true);
  eq('chybíš nám: 44 dní už ne, starý spáč zprávu nedostane', maDostatChybisNam(dnuZpet(44), 30, NOW), false);
  eq('chybíš nám: návštěva dnes ne', maDostatChybisNam(dnuZpet(0), 30, NOW), false);
  eq('chybíš nám: host bez návštěvy nikdy', maDostatChybisNam(null, 30, NOW), false);
  eq('chybíš nám: nesmyslný čas ne', maDostatChybisNam('nikdy', 30, NOW), false);
  // Opakované spuštění: stejná odmlka dává stejný klíč, nová návštěva nový.
  const navsteva = '2026-09-02T12:00:00Z';
  eq('klíč: stejná návštěva, stejný klíč při každém spuštění', [refChybisNam(navsteva), refChybisNam(navsteva)], ['react:2026-09-02', 'react:2026-09-02']);
  ok('klíč: jiná poslední návštěva je nový nárok', refChybisNam('2026-09-20T08:00:00Z') !== refChybisNam(navsteva));
  eq('klíč: čas z databáze bez pásma', refChybisNam('2026-09-02 23:30:00'), 'react:2026-09-02');
  eq('text: s body', textChybisNam('Čajovna', 30, 20).body, 'Už je to 30 dní. Přijď se podívat, na kartičce na tebe čeká 20 bodů navíc.');
  eq('text: bez bodů', textChybisNam('Čajovna', 1, 0).body, 'Už je to 1 den. Přijď se podívat, rádi tě zase uvidíme.');
  eq('text: nadpis nese název podniku', textChybisNam('Čajovna', 30, 0).title, 'Chybíš nám, Čajovna');

  // ---- časová osa a „zbývá“ ----
  const money = (n: number) => `${n} Kč`;
  const osa = casovaOsa({
    ledger: [
      { created_at: '2026-09-01T10:00:00Z', delta: 10, kind: 'visit', note: null },
      { created_at: '2026-09-05T10:00:00Z', delta: 0, credit_delta: 25, kind: 'cashback', note: null },
      { created_at: '2026-09-20T10:00:00Z', delta: 20, kind: 'reactivation', note: 'Chybíš nám' },
    ],
    claims: [{ title: 'Káva zdarma', claimed_at: '2026-09-10T10:00:00Z', redeemed_at: '2026-09-12T10:00:00Z' }],
    vouchers: [{ code: 'ABCD', value_amount: 500, balance: 300, created_at: '2026-08-01T10:00:00Z' }],
    orders: [{ total: 340, status: 'done', created_at: '2026-09-15T10:00:00Z' }],
  }, money);
  eq('osa: pořadí od nejnovějšího', osa.map(u => u.at.slice(0, 10)), ['2026-09-20', '2026-09-15', '2026-09-12', '2026-09-10', '2026-09-05', '2026-09-01', '2026-08-01']);
  eq('osa: návštěva bez poznámky se jmenuje česky', osa[5].titulek, 'Návštěva');
  eq('osa: body s plusem a správným tvarem', osa[5].meta, '+10 bodů');
  eq('osa: cashback v kreditu', osa[4].meta, '+25 Kč kredit');
  eq('osa: kupon vzal i uplatnil', [osa[3].titulek, osa[2].titulek], ['Vzal kupon Káva zdarma', 'Uplatnil kupon Káva zdarma']);
  eq('osa: objednávka s částkou a stavem', [osa[1].titulek, osa[1].meta], ['Objednávka za 340 Kč', 'vyřízená']);
  eq('osa: poukaz s částkou a zůstatkem', osa[6].meta, '500 Kč, zbývá 300 Kč');
  eq('osa: prázdné zdroje dají prázdnou osu', casovaOsa({}, money), []);
  eq('osa: limit', casovaOsa({ ledger: Array.from({ length: 80 }, (_, i) => ({ created_at: `2026-09-01T10:${String(i % 60).padStart(2, '0')}:00Z`, delta: 1, kind: 'visit' })) }, money, 10).length, 10);
  const urSil = tierFor(7, { silverAt: 10, goldAt: 25 });
  eq('úroveň: zbývá návštěv', zbyvaDoUrovne(urSil, 7, money), 'Do úrovně Stříbrný host mu zbývá 3 návštěvy.');
  eq('úroveň: v režimu útraty peníze', zbyvaDoUrovne(tierFor(1000, { tierBy: 'spend', silverSpend: 2000, goldSpend: 5000 }), 1000, money), 'Do úrovně Stříbrný host mu zbývá 1000 Kč.');
  eq('úroveň: nejvyšší úroveň nemá co zbývat', zbyvaDoUrovne(tierFor(99, { silverAt: 10, goldAt: 25 }), 99, money), null);
  eq('razítka: zbývá a hotovo, prázdné se vynechá', zbyvaDoOdmeny([
    { name: 'Čaj', required_stamps: 10, stamps: 8 },
    { name: 'Dýmka', required_stamps: 5, stamps: 5 },
    { name: 'Kafe', required_stamps: 6, stamps: 0 },
  ]), ['Čaj: 8 z 10, chybí 2 razítka', 'Dýmka: 5 z 5, odměna je hotová']);

  // ---- zapojení ----
  const init = precti('app/api/init/route.ts');
  ok('init: sloupce pravidla Chybíš nám v profilu', /ADD COLUMN IF NOT EXISTS reactivation_days INTEGER NOT NULL DEFAULT 0/.test(init) && /ADD COLUMN IF NOT EXISTS reactivation_points INTEGER NOT NULL DEFAULT 0/.test(init));
  ok('init: denní úloha běží za narozeninami a nesmí shodit migrace', /awardBirthdays\(\)[\s\S]*odesliChybisNam\(\)/.test(init));
  const profil = precti('app/api/client/admin/profile/route.ts');
  ok('profil: pole pravidla patří pod vernost.pravidla', /reactivation_days: 'vernost\.pravidla'/.test(profil) && /reactivation_points: 'vernost\.pravidla'/.test(profil));
  const uloha = precti('lib/reaktivace.ts');
  ok('úloha: idempotence přes deník (NOT EXISTS) a pravidlo z čisté funkce', /NOT EXISTS/.test(uloha) && /maDostatChybisNam/.test(uloha) && /category: 'novinky'/.test(uloha));
  ok('zprávy: broadcast přijímá nové segmenty a deník účinku nepočítá Chybíš nám jako návštěvu', /jeSegment\(a\)/.test(precti('app/api/client/admin/broadcast/route.ts')) && /kind <> 'reactivation'/.test(precti('app/api/client/admin/broadcast/route.ts')));
  ok('audit: akce změny pravidla má popisek', /'client\.reaktivace'/.test(precti('lib/auditPopisky.ts')));
}
