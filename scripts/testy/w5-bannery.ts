// W5 — bannery: cílení, koncept a archiv, odkaz na kupon/kartu, úplné pořadí, kopie, statistika.
// Čisté funkce z lib/bannery.ts plus pojistky nad zdrojáky tam, kde pravidlo žije v SQL
// (jeden příkaz pro přeřazení, součet počítadel bez čtení, žádná IP v databázi).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  validujBanner, validujCil, vyberAktivni, cilSedi, popisCile, procNeukazuje, overPoradi, nadpisKopie, proklikovost, souhrnStatistik, druhUdalosti,
  NEZNAMY_HOST, MAX_AKTIVNICH, type HostKontext,
} from '../../lib/bannery.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default async function ({ eq, ok }: Testy) {
  const DNES = '2026-10-01';
  const b = (id: number, x: any = {}) => ({ id, active: true, position: id, valid_since: null, valid_until: null, target_kind: 'all', target_ref: null, archived: false, ...x });
  const clen: HostKontext = { member: true, level: 'silver', groupIds: [4, 9] };

  // ---- Cílení ----
  eq('cíl: výchozí je všem', (validujBanner({ title: 'a' }) as any).hodnoty.target_kind, 'all');
  eq('cíl: neznámý druh se odmítne, ne tiše „všem“', validujBanner({ title: 'a', target_kind: 'vsichni_krome_mne' }).ok, false);
  eq('cíl: úroveň bez výběru', validujBanner({ title: 'a', target_kind: 'level', target_ref: '' }).ok, false);
  eq('cíl: neznámá úroveň', validujBanner({ title: 'a', target_kind: 'level', target_ref: 'diamond' }).ok, false);
  eq('cíl: úroveň zlatá', (validujBanner({ title: 'a', target_kind: 'level', target_ref: 'gold' }) as any).hodnoty.target_ref, 'gold');
  eq('cíl: skupina bez id', validujBanner({ title: 'a', target_kind: 'group', target_ref: '' }).ok, false);
  eq('cíl: skupina s nesmyslem', validujBanner({ title: 'a', target_kind: 'group', target_ref: '1; DROP' }).ok, false);
  eq('cíl: skupina 7', (validujBanner({ title: 'a', target_kind: 'group', target_ref: '7' }) as any).hodnoty.target_ref, '7');
  eq('cíl: členům nemá ref', (validujBanner({ title: 'a', target_kind: 'members', target_ref: 'gold' }) as any).hodnoty.target_ref, null);
  eq('cíl: validujCil nečlenům', validujCil('nonmembers', null), { ok: true, kind: 'nonmembers', ref: null });

  eq('cílení: všem vidí člen i nečlen', [cilSedi(b(1), clen), cilSedi(b(1), NEZNAMY_HOST)], [true, true]);
  eq('cílení: jen členům', [cilSedi(b(1, { target_kind: 'members' }), clen), cilSedi(b(1, { target_kind: 'members' }), NEZNAMY_HOST)], [true, false]);
  eq('cílení: jen nečlenům', [cilSedi(b(1, { target_kind: 'nonmembers' }), clen), cilSedi(b(1, { target_kind: 'nonmembers' }), NEZNAMY_HOST)], [false, true]);
  eq('cílení: úroveň sedí jen členovi té úrovně', [cilSedi(b(1, { target_kind: 'level', target_ref: 'silver' }), clen), cilSedi(b(1, { target_kind: 'level', target_ref: 'gold' }), clen)], [true, false]);
  eq('cílení: úroveň se nikdy neukáže nečlenovi', cilSedi(b(1, { target_kind: 'level', target_ref: 'bronze' }), { member: false, level: 'bronze', groupIds: [] }), false);
  eq('cílení: skupina', [cilSedi(b(1, { target_kind: 'group', target_ref: '9' }), clen), cilSedi(b(1, { target_kind: 'group', target_ref: '5' }), clen)], [true, false]);
  eq('cílení: skupina bez členství nic', cilSedi(b(1, { target_kind: 'group', target_ref: '9' }), { member: false, level: null, groupIds: [9] }), false);
  eq('cílení: starý řádek bez sloupce = všem', cilSedi({} as any, NEZNAMY_HOST), true);

  // Cílení se uplatní před limitem pěti: banner pro jiné hosty nezabere místo.
  const sedm = [1, 2, 3, 4, 5, 6, 7].map(i => b(i, i <= 5 ? { target_kind: 'level', target_ref: 'gold' } : {}));
  eq('limit pěti se počítá až po cílení', vyberAktivni(sedm, DNES, MAX_AKTIVNICH, clen).map(r => r.id), [6, 7]);
  eq('bez hosta se cílení neuplatňuje (editor)', vyberAktivni(sedm, DNES).length, MAX_AKTIVNICH);

  // ---- Koncept a archiv ----
  eq('archiv: archivovaný se nikdy neukáže', vyberAktivni([b(1, { archived: true }), b(2)], DNES).map(r => r.id), [2]);
  eq('archiv: archivovaný je vždy vypnutý', (validujBanner({ title: 'a', archived: true, active: true }) as any).hodnoty.active, false);
  eq('archiv: stav v editoru', procNeukazuje(b(1, { archived: true }), DNES), 'archivovaný');
  eq('koncept: vypnutý banner se neukáže', vyberAktivni([b(1, { active: false })], DNES).length, 0);
  eq('koncept: stav v editoru zůstává „vypnutý“', procNeukazuje(b(1, { active: false }), DNES), 'vypnutý');

  // ---- Odkaz na kupon a kartu ----
  eq('kupon bez cíle projde (otevře Věrnost)', (validujBanner({ title: 'a', link_kind: 'coupon', link_ref: '' }) as any).hodnoty.link_ref, null);
  eq('kupon s id', (validujBanner({ title: 'a', link_kind: 'coupon', link_ref: '12' }) as any).hodnoty.link_ref, '12');
  eq('kupon s nesmyslem', validujBanner({ title: 'a', link_kind: 'coupon', link_ref: 'abc' }).ok, false);
  eq('karta bez cíle', validujBanner({ title: 'a', link_kind: 'campaign', link_ref: '' }).ok, false);
  eq('karta s id', (validujBanner({ title: 'a', link_kind: 'campaign', link_ref: '3' }) as any).hodnoty.link_ref, '3');
  eq('karta s nulou', validujBanner({ title: 'a', link_kind: 'campaign', link_ref: '0' }).ok, false);

  // ---- Pořadí: úplný seznam id podniku ----
  const moje = [1, 2, 3];
  eq('pořadí: úplné projde', overPoradi([3, 1, 2], moje), { ok: true, ids: [3, 1, 2] });
  eq('pořadí: čísla jako text', overPoradi(['2', '1', '3'], moje), { ok: true, ids: [2, 1, 3] });
  eq('pořadí: chybí banner', overPoradi([1, 2], moje).ok, false);
  eq('pořadí: banner dvakrát', overPoradi([1, 1, 2], moje).ok, false);
  eq('pořadí: cizí banner', overPoradi([1, 2, 99], moje).ok, false);
  eq('pořadí: navíc banner', overPoradi([1, 2, 3, 4], moje).ok, false);
  eq('pořadí: nesmysl', overPoradi([1, 'x', 3], moje).ok, false);
  eq('pořadí: desetinné číslo', overPoradi([1, 2.5, 3], moje).ok, false);
  eq('pořadí: není pole', overPoradi('1,2,3', moje).ok, false);
  eq('pořadí: prázdný podnik a prázdný seznam', overPoradi([], []), { ok: true, ids: [] });

  // ---- Kopie ----
  eq('kopie: přípona', nadpisKopie('Degustace'), 'Degustace (kopie)');
  eq('kopie: nezřetězí se', nadpisKopie('Degustace (kopie)'), 'Degustace (kopie)');
  eq('kopie: z kopie kopie', nadpisKopie(nadpisKopie('Degustace')), 'Degustace (kopie)');
  ok('kopie: v mezích 80 znaků', nadpisKopie('x'.repeat(80)).length <= 80 && nadpisKopie('x'.repeat(80)).endsWith(' (kopie)'));
  eq('kopie: výsledný nadpis projde validací', validujBanner({ title: nadpisKopie('y'.repeat(80)) }).ok, true);

  // ---- Statistika ----
  eq('CTR: bez zobrazení nula', proklikovost(0, 5), 0);
  eq('CTR: 3 z 40', proklikovost(40, 3), 7.5);
  eq('CTR: nikdy nad 100 %', proklikovost(10, 99), 100);
  eq('CTR: záporné a text se ošetří', proklikovost(-4 as any, 'x' as any), 0);
  const radky = [
    { banner_id: 1, day: '2026-09-28', views: 10, clicks: 1 }, { banner_id: 1, day: '2026-09-30', views: 30, clicks: 2 },
    { banner_id: 2, day: '2026-09-30', views: 5, clicks: 0 },
  ];
  const s = souhrnStatistik(radky);
  eq('souhrn: banner 1', s.get(1), { zobrazeni: 40, kliky: 3, proklikovost: 7.5 });
  eq('souhrn: banner 2 bez prokliků', s.get(2), { zobrazeni: 5, kliky: 0, proklikovost: 0 });
  eq('souhrn: od data', souhrnStatistik(radky, '2026-09-30').get(1), { zobrazeni: 30, kliky: 2, proklikovost: 6.7 });
  eq('souhrn: banner bez řádků tu není', s.has(3), false);
  eq('událost: view', druhUdalosti('view'), 'view');
  eq('událost: click', druhUdalosti('click'), 'click');
  eq('událost: cokoli jiného se zahodí', [druhUdalosti('delete'), druhUdalosti(undefined), druhUdalosti({})], [null, null, null]);

  // Souběh: 200 návštěv najednou nad součtovým počítadlem (model „SET views = views + 1“) nic neztratí.
  const sklad = new Map<string, { views: number; clicks: number }>();
  const zapis = async (klic: string, druh: 'view' | 'click') => {
    // Jeden krok bez čtení z databáze a zápisu absolutní hodnoty: tak se chová ON CONFLICT DO UPDATE.
    const r = sklad.get(klic) ?? { views: 0, clicks: 0 };
    sklad.set(klic, { views: r.views + (druh === 'view' ? 1 : 0), clicks: r.clicks + (druh === 'click' ? 1 : 0) });
  };
  await Promise.all(Array.from({ length: 200 }, (_, i) => zapis('1:2026-10-01', i % 4 === 0 ? 'click' : 'view')));
  eq('souběh: 150 zobrazení a 50 prokliků', sklad.get('1:2026-10-01'), { views: 150, clicks: 50 });

  // ---- Pojistky nad zdrojáky (pravidla v SQL) ----
  const admin = zdroj('app/api/client/admin/banners/route.ts');
  ok('přeřazení je jeden UPDATE ... FROM unnest', admin.includes('FROM unnest(') && admin.includes('WITH ORDINALITY'));
  ok('přeřazení nevolá UPDATE ve smyčce', !/for \(let i = 0; i < ids\.length/.test(admin));
  ok('přeřazení ověřuje úplný seznam id podniku', admin.includes('overPoradi('));
  ok('limit bannerů se hlídá ve stejném příkazu jako vložení', admin.includes('WHERE ${h.archived}::boolean OR (SELECT COUNT(*)'));
  ok('duplikace hlídá limit ve stejném příkazu', admin.includes("b.action === 'duplicate'") && admin.includes('AND (SELECT COUNT(*) FROM client_banners WHERE team_id = ${ctx.teamId} AND archived = FALSE) < ${MAX_BANNERU}'));
  ok('odkaz na kupon a kartu se ověřuje proti podniku', admin.includes('FROM client_coupons WHERE id') && admin.includes('FROM client_stamp_campaigns WHERE id'));
  ok('cílení na skupinu se ověřuje proti podniku', admin.includes('FROM client_groups WHERE id'));
  ok('archivovaný banner se nezapne přepínačem', admin.includes('Archivovaný banner nejdřív vrať z archivu.'));
  const db = zdroj('lib/clientBanners.ts');
  ok('statistika: zápis je ON CONFLICT DO UPDATE se součtem', db.includes('ON CONFLICT (banner_id, day) DO UPDATE') && db.includes('views = client_banner_stats.views + EXCLUDED.views'));
  ok('statistika: zapisuje jen banner v provozu a podniku', db.includes('b.team_id = ${teamId} AND b.active = TRUE AND b.archived = FALSE'));
  ok('statistika: den je pražský', db.includes('pragueToday()') && !/klientIp|remoteAddr|x-forwarded/i.test(db));
  ok('statistika: tabulka nemá osobní sloupce', !/client_banner_stats \([^)]*(customer_id|user_id|ip)/.test(db));
  const udalost = zdroj('app/api/client/b/[slug]/banner-event/route.ts');
  ok('událost: omezení počtu volání', udalost.includes('hit(`banner-udalost:'));
  ok('událost: neukládá IP ani cookie', !/INSERT|sql`/.test(udalost));
  ok('veřejné API předává cílení', zdroj('app/api/client/b/[slug]/route.ts').includes('kontextHosta('));
  ok('hostovi se cílení ani statistika nevrací', !/target_kind|target_ref|views/.test(db.slice(db.indexOf('export function tvarBanneru'), db.indexOf('export async function aktivniBannery'))));
  const sprava = zdroj('components/client/BrandTab.tsx');
  ok('Vzhled používá nový editor bannerů', sprava.includes("loyalty/BanneryEditor"));
  eq('popis cílení: úroveň', popisCile({ target_kind: 'level', target_ref: 'gold' }, { urovne: { gold: 'Zlatý' } }), 'Úroveň: Zlatý');
  eq('popis cílení: smazaná skupina', popisCile({ target_kind: 'group', target_ref: '5' }, { skupiny: {} }), 'Skupina: smazaná skupina');
  eq('popis cílení: výchozí', popisCile({}), 'Všem hostům');
}
