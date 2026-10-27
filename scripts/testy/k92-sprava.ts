// Kolo 92: správa Managero client — segmenty hostů, štítky, průměrný účet, průvodce nastavením,
// narozeniny kolem rezervace a struktura navigace (čtyři oblasti).
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  CHYBI_DNI, NOVY_DNI, STAMGAST_NAVSTEV, SEGMENTY_HOSTU, jeSegmentHostu, patriDoSegmentu, poctySegmentu, predKolika, prumernyUcet, stitkyHosta,
} from '../../lib/klientSprava/segmentyHostu.ts';
import { dnyZpet, krokyPruvodce, narozeninyBlizko, procento } from '../../lib/klientSprava/zdravi.ts';
import { normalizujFiltr, splnujeFiltr, PRAZDNY_FILTR } from '../../lib/clenoveFiltr.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default async function ({ eq, ok }: Testy) {
  const ted = new Date('2026-10-21T12:00:00Z');
  const pred = (dni: number) => new Date(ted.getTime() - dni * 86400000).toISOString();
  const host = (o: Partial<{ visits: number; last: number | null; joined: number; open_coupons: number; narozeniny: boolean }>) => ({
    visits: o.visits ?? 0, last_visit_at: o.last == null ? null : pred(o.last), joined_at: pred(o.joined ?? 400), open_coupons: o.open_coupons ?? 0, narozeninyTentoMesic: !!o.narozeniny,
  });

  // ---- segmenty ----
  ok('segment: štamgast = aspoň 10 návštěv a naposledy do 30 dní', patriDoSegmentu(host({ visits: STAMGAST_NAVSTEV, last: 3 }), 'stamgasti', ted));
  ok('segment: bývalý štamgast, který přestal chodit, štamgast není', !patriDoSegmentu(host({ visits: 40, last: 60 }), 'stamgasti', ted));
  ok('segment: nový = přidal se před méně než 30 dny', patriDoSegmentu(host({ joined: NOVY_DNI - 1 }), 'novi', ted) && !patriDoSegmentu(host({ joined: NOVY_DNI }), 'novi', ted));
  ok('segment: chybí = aspoň dvě návštěvy a 45+ dní nic', patriDoSegmentu(host({ visits: 2, last: CHYBI_DNI }), 'chybi', ted) && !patriDoSegmentu(host({ visits: 1, last: 90 }), 'chybi', ted));
  ok('segment: host bez návštěvy nechybí (nikdy nepřišel)', !patriDoSegmentu(host({ visits: 0, last: null }), 'chybi', ted));
  eq('segment: počty všech najednou', poctySegmentu([host({ visits: 12, last: 1 }), host({ joined: 3 }), host({ visits: 5, last: 50, open_coupons: 1 }), host({ narozeniny: true })], ted),
    { stamgasti: 1, novi: 1, chybi: 1, narozeniny: 1, kupon: 1 });
  ok('segment: neznámý se nepozná', jeSegmentHostu('chybi') && !jeSegmentHostu('vip') && SEGMENTY_HOSTU.length === 5);

  // ---- štítky a hodnota hosta ----
  eq('štítky: štamgast', stitkyHosta(host({ visits: 20, last: 2 }), ted).map(s => s.text), ['Štamgast']);
  eq('štítky: chybí N dní', stitkyHosta(host({ visits: 6, last: 52 }), ted).map(s => s.text), ['Chybí 52 dní']);
  eq('Ø účet jen se známou útratou i návštěvami (žádné vymyšlené číslo)', [prumernyUcet(8692, 41), prumernyUcet(0, 5), prumernyUcet(500, 0)], [212, null, null]);
  eq('naposledy slovy', [predKolika(pred(0), ted), predKolika(pred(1), ted), predKolika(pred(6), ted), predKolika(pred(21), ted), predKolika(null, ted)],
    ['dnes', 'včera', 'před 6 dny', 'před 3 týdny', 'zatím nebyl']);

  // ---- filtr seznamu hostů se segmentem ----
  const f = normalizujFiltr(new URLSearchParams('segment=stamgasti'));
  const k = { now: ted, mesic: 10 };
  const clen = (visits: number, last: number) => ({ id: 1, name: 'Jana', points: 0, stamps: 0, visits, spend: 0, joined_at: pred(400), last_visit_at: pred(last), open_coupons: 0, birthday: null });
  ok('filtr: segment rozhoduje stejně jako čip', splnujeFiltr(clen(12, 2), f, k) && !splnujeFiltr(clen(3, 2), f, k));
  ok('filtr: bez segmentu bez omezení', splnujeFiltr(clen(1, 300), PRAZDNY_FILTR, k));

  // ---- přehled ----
  eq('dny zpět: 3 pražské dny končící dneškem', dnyZpet('2026-10-21', 3), ['2026-10-19', '2026-10-20', '2026-10-21']);
  eq('průvodce: sedm kroků, hotové podle souhrnu', krokyPruvodce({ enabled: true, brand: true, menu: true, tables: 4, loyaltyOn: true, pos: false, location: true }).map(k => k.hotovo),
    [true, true, true, true, true, false, true]);
  eq('procento: bez základu null', [procento(38, 100), procento(1, 0)], [38, null]);
  ok('narozeniny kolem dne rezervace (±3 dny, i přes Silvestra)', narozeninyBlizko('1990-10-23', '2026-10-21') && !narozeninyBlizko('1990-11-03', '2026-10-21') && narozeninyBlizko('1985-01-01', '2026-12-30'));

  // ---- navigace: čtyři oblasti ----
  const admin = precti('components/client/ClientAdmin.tsx');
  ok('navigace: Přehled + Provoz · Hosté · Věrnost · Podnik', ["{ title: 'Provoz'", "{ title: 'Hosté'", "{ title: 'Věrnost'", "{ title: 'Podnik'"].every(x => admin.includes(x)));
  ok('navigace: čtečka u kasy je v Provozu a v doku', admin.includes("ids: ['reservations', 'orders', 'tables', 'reader']") && admin.includes("const DOCK: Tab[] = ['overview', 'reservations', 'reader', 'customers'];"));
  const prehled = precti('lib/widgety/stranky/vedeni.klient.ts');
  ok('Přehled Clientu: ve výchozím rozložení není „Čeká na tebe" z Managera', !/w: 'prehled\.ceka_na_tebe'/.test(prehled));
}
