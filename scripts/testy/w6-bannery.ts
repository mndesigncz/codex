// W6 — bannery: plán s dny a hodinami (opakování) a jazykové mutace. Čistá logika z lib/banneryPlan.ts a lib/bannery.ts
// plus pojistky nad zdrojáky tam, kde pravidlo žije v SQL nebo v tvaru odpovědi (host nikdy nevidí cizí jazyk ani plán).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  validujPlan, planZRadku, planSedi, popisPlanu, maPlan, isoDen, kdyTed, validujPreklady, prekladyZRadku, textProJazyk, pocetPrekladu, BEZ_PLANU,
} from '../../lib/banneryPlan.ts';
import { validujBanner, vyberAktivni, procNeukazuje } from '../../lib/bannery.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default async function ({ eq, ok }: Testy) {
  // ---- Plán: validace ----
  eq('plán: prázdný = bez omezení', validujPlan({}), { ok: true, plan: BEZ_PLANU });
  eq('plán: dny se řadí a deduplikují', (validujPlan({ days_of_week: [5, 1, 5, 3] }) as any).plan.days_of_week, [1, 3, 5]);
  eq('plán: sedm dní je totéž co každý den', (validujPlan({ days_of_week: [1, 2, 3, 4, 5, 6, 7] }) as any).plan.days_of_week, []);
  eq('plán: den 0 se odmítne', validujPlan({ days_of_week: [0] }).ok, false);
  eq('plán: den 8 se odmítne', validujPlan({ days_of_week: [8] }).ok, false);
  eq('plán: desetinný den se odmítne', validujPlan({ days_of_week: [1.5] }).ok, false);
  eq('plán: text místo seznamu se odmítne', validujPlan({ days_of_week: 'po' }).ok, false);
  eq('plán: jen „od“ se odmítne', validujPlan({ hour_from: '08:00' }).ok, false);
  eq('plán: jen „do“ se odmítne', validujPlan({ hour_till: '12:00' }).ok, false);
  eq('plán: hodiny ve špatném tvaru', validujPlan({ hour_from: '8:00', hour_till: '12:00' }).ok, false);
  eq('plán: 25. hodina', validujPlan({ hour_from: '25:00', hour_till: '12:00' }).ok, false);
  eq('plán: stejné od a do', validujPlan({ hour_from: '08:00', hour_till: '08:00' }).ok, false);
  eq('plán: hodiny přes půlnoc projdou', (validujPlan({ hour_from: '22:00', hour_till: '02:00' }) as any).plan.hour_from, '22:00');
  eq('plán: prázdné řetězce = bez hodin', (validujPlan({ hour_from: '', hour_till: '' }) as any).plan, BEZ_PLANU);

  // ---- Plán: kdy sedí ----
  const po = 1, ut = 2, st = 3, pa = 5, ne = 7;
  const ranni = { days_of_week: [1, 2, 3, 4, 5], hour_from: '08:00', hour_till: '11:00' };
  eq('sedí: pondělí 9:00', planSedi(ranni, { dow: po, hhmm: '09:00' }), true);
  eq('sedí: pondělí 7:59 ne', planSedi(ranni, { dow: po, hhmm: '07:59' }), false);
  eq('sedí: pondělí 11:00 už ne (konec je vyloučený)', planSedi(ranni, { dow: po, hhmm: '11:00' }), false);
  eq('sedí: neděle 9:00 ne', planSedi(ranni, { dow: ne, hhmm: '09:00' }), false);
  eq('sedí: bez plánu vždy', planSedi(BEZ_PLANU, { dow: ne, hhmm: '03:00' }), true);
  eq('sedí: jen dny, kdykoli v ten den', [planSedi({ days_of_week: [6], hour_from: null, hour_till: null }, { dow: 6, hhmm: '23:59' }), planSedi({ days_of_week: [6], hour_from: null, hour_till: null }, { dow: 5, hhmm: '12:00' })], [true, false]);
  eq('sedí: jen hodiny, každý den', planSedi({ days_of_week: [], hour_from: '16:00', hour_till: '18:00' }, { dow: 3, hhmm: '17:30' }), true);
  const vecer = { days_of_week: [5], hour_from: '22:00', hour_till: '02:00' };
  eq('půlnoc: pátek 23:00 ano', planSedi(vecer, { dow: pa, hhmm: '23:00' }), true);
  eq('půlnoc: sobota 01:00 patří k pátku', planSedi(vecer, { dow: 6, hhmm: '01:00' }), true);
  eq('půlnoc: sobota 03:00 už ne', planSedi(vecer, { dow: 6, hhmm: '03:00' }), false);
  eq('půlnoc: sobota 23:00 ne (začátek je jen v pátek)', planSedi(vecer, { dow: 6, hhmm: '23:00' }), false);
  eq('půlnoc: pátek 01:00 ne (to by patřilo ke čtvrtku)', planSedi(vecer, { dow: pa, hhmm: '01:00' }), false);
  eq('půlnoc: pondělí 01:00 po neděli (zalomení týdne)', planSedi({ days_of_week: [7], hour_from: '22:00', hour_till: '02:00' }, { dow: po, hhmm: '01:00' }), true);
  eq('půlnoc bez dnů: každý den', planSedi({ days_of_week: [], hour_from: '22:00', hour_till: '02:00' }, { dow: ut, hhmm: '01:00' }), true);

  // ---- Popisy ----
  eq('popis: bez omezení je prázdný', popisPlanu(BEZ_PLANU), '');
  eq('popis: po–pá 8–11', popisPlanu(ranni), 'po–pá 08:00–11:00');
  eq('popis: jen hodiny je denně', popisPlanu({ days_of_week: [], hour_from: '16:00', hour_till: '18:00' }), 'denně 16:00–18:00');
  eq('popis: výčet dnů', popisPlanu({ days_of_week: [1, 3, 5], hour_from: null, hour_till: null }), 'po, st, pá');
  eq('maPlan: dny', maPlan({ days_of_week: [2], hour_from: null, hour_till: null }), true);
  eq('maPlan: nic', maPlan(BEZ_PLANU), false);

  // ---- Z řádku databáze ----
  eq('řádek: JSONB jako text', planZRadku({ days_of_week: '[1,3]', hour_from: '08:00', hour_till: '09:00' }).days_of_week, [1, 3]);
  eq('řádek: poškozený JSON = každý den', planZRadku({ days_of_week: '[1,', hour_from: null, hour_till: null }).days_of_week, []);
  eq('řádek: neplatné dny se zahodí', planZRadku({ days_of_week: [0, 2, 9], hour_from: null, hour_till: null }).days_of_week, [2]);
  eq('řádek: půlka hodin se zahodí', planZRadku({ days_of_week: [], hour_from: '08:00', hour_till: null }), BEZ_PLANU);
  eq('řádek: starý řádek bez sloupců', planZRadku({} as any), BEZ_PLANU);
  eq('řádek: null', planZRadku(null), BEZ_PLANU);

  // ---- Pražský čas ----
  eq('den v týdnu: pondělí', isoDen('2026-10-05'), 1);
  eq('den v týdnu: neděle', isoDen('2026-10-04'), 7);
  eq('kdyTed: půlnoc v Praze je ještě včerejší den v UTC', kdyTed(new Date('2026-10-03T22:30:00Z')), { dow: 7, hhmm: '00:30' });
  eq('kdyTed: letní čas', kdyTed(new Date('2026-07-01T10:00:00Z')), { dow: 3, hhmm: '12:00' });
  eq('kdyTed: zimní čas', kdyTed(new Date('2026-01-12T10:00:00Z')), { dow: 1, hhmm: '11:00' });

  // ---- Výběr aktivních s plánem ----
  const b = (id: number, x: any = {}) => ({ id, active: true, position: id, valid_since: null, valid_until: null, target_kind: 'all', target_ref: null, archived: false, ...x });
  const radky = [b(1, { days_of_week: [1], hour_from: '08:00', hour_till: '10:00' }), b(2), b(3, { days_of_week: '[6,7]' })];
  eq('výběr: v pondělí v 9 vidí banner 1 a 2', vyberAktivni(radky, '2026-10-05', 5, undefined, { dow: 1, hhmm: '09:00' }).map(r => r.id), [1, 2]);
  eq('výběr: v sobotu jen 2 a 3', vyberAktivni(radky, '2026-10-03', 5, undefined, { dow: 6, hhmm: '09:00' }).map(r => r.id), [2, 3]);
  eq('výběr: bez času se plán neuplatňuje (editor)', vyberAktivni(radky, '2026-10-05').map(r => r.id), [1, 2, 3]);
  // Banner mimo plán nesmí zabrat místo z limitu pěti.
  const sest = [1, 2, 3, 4, 5, 6].map(i => b(i, i <= 5 ? { days_of_week: [7] } : {}));
  eq('výběr: banner mimo plán nezabere místo v limitu', vyberAktivni(sest, '2026-10-05', 5, undefined, { dow: 1, hhmm: '12:00' }).map(r => r.id), [6]);
  eq('procNeukazuje: mimo plán', procNeukazuje(b(1, { days_of_week: [1], hour_from: '08:00', hour_till: '10:00' }), '2026-10-05', { dow: 1, hhmm: '12:00' }), 'mimo plán (po 08:00–10:00)');
  eq('procNeukazuje: v plánu se ukazuje', procNeukazuje(b(1, { days_of_week: [1] }), '2026-10-05', { dow: 1, hhmm: '12:00' }), null);
  eq('procNeukazuje: bez času plán neposuzuje', procNeukazuje(b(1, { days_of_week: [2] }), '2026-10-05'), null);

  // ---- validujBanner nese plán a překlady ----
  const v = validujBanner({ title: 'Snídaně', days_of_week: [1, 2], hour_from: '08:00', hour_till: '10:00', i18n: { en: { title: 'Breakfast', text: 'Fresh' } } }) as any;
  eq('banner: plán projde do hodnot', [v.ok, v.hodnoty.days_of_week, v.hodnoty.hour_from], [true, [1, 2], '08:00']);
  eq('banner: překlad projde do hodnot', v.hodnoty.i18n.en, { title: 'Breakfast', text: 'Fresh' });
  eq('banner: neúplné hodiny se odmítnou', validujBanner({ title: 'x', hour_from: '08:00' }).ok, false);
  eq('banner: neznámý jazyk překladu se odmítne', validujBanner({ title: 'x', i18n: { xx: { title: 'a' } } }).ok, false);
  eq('banner: výchozí hodnoty bez plánu a překladů', [(validujBanner({ title: 'x' }) as any).hodnoty.days_of_week, (validujBanner({ title: 'x' }) as any).hodnoty.i18n], [[], {}]);

  // ---- Překlady ----
  eq('překlady: prázdné', validujPreklady(''), { ok: true, preklady: {} });
  eq('překlady: oříznutí nadpisu na 80 a textu na 300', (() => { const r = validujPreklady({ de: { title: 'a'.repeat(100), text: 'b'.repeat(400) } }) as any; return [r.preklady.de.title.length, r.preklady.de.text.length]; })(), [80, 300]);
  eq('překlady: prázdný jazyk se zahodí', validujPreklady({ pl: { title: '', text: '' } }), { ok: true, preklady: {} });
  eq('překlady: text bez nadpisu je chyba', validujPreklady({ sk: { title: '', text: 'jen text' } }).ok, false);
  eq('překlady: čeština se tu nepřekládá', validujPreklady({ cs: { title: 'x' } }).ok, false);
  eq('překlady: pole místo objektu', validujPreklady([1]).ok, false);
  eq('překlady: JSON jako text', (validujPreklady('{"en":{"title":"Hi","text":""}}') as any).preklady.en.title, 'Hi');
  eq('překlady: rozbitý JSON', validujPreklady('{"en":').ok, false);
  eq('řádek překladů: poškozený jazyk se zahodí, ostatní zůstanou', prekladyZRadku({ en: { title: 'Hi', text: '' }, xx: { title: 'a' }, de: { title: '', text: 'jen text' } }), { en: { title: 'Hi', text: '' } });
  eq('řádek překladů: null', prekladyZRadku(null), {});
  const puvodni = { title: 'Pátek', text: 'Degustace' };
  const preklady = { en: { title: 'Friday', text: 'Tasting' }, de: { title: 'Freitag', text: '' } };
  eq('jazyk: angličtina', textProJazyk(puvodni, preklady, 'en'), { title: 'Friday', text: 'Tasting' });
  eq('jazyk: němčina bez textu zůstane bez textu (překlad je pravda, ne záplata češtinou)', textProJazyk(puvodni, preklady, 'de'), { title: 'Freitag', text: '' });
  eq('jazyk: chybí překlad = čeština', textProJazyk(puvodni, preklady, 'pl'), puvodni);
  eq('jazyk: čeština = původní', textProJazyk(puvodni, preklady, 'cs'), puvodni);
  eq('jazyk: bez jazyka = původní', textProJazyk(puvodni, preklady, null), puvodni);
  eq('jazyk: neznámý jazyk nezpůsobí výjimku', textProJazyk(puvodni, preklady, '__proto__'), puvodni);
  eq('počet překladů', pocetPrekladu(preklady), 2);

  // ---- Pojistky nad zdrojáky ----
  const route = zdroj('app/api/client/admin/banners/route.ts');
  ok('route: vložení nese plán i překlady', /INSERT INTO client_banners \([^)]*days_of_week, hour_from, hour_till, i18n\)/.test(route));
  ok('route: kopie nese plán i překlady', /s\.days_of_week, s\.hour_from, s\.hour_till, s\.i18n/.test(route));
  ok('route: úprava ukládá plán i překlady', /days_of_week = \$\{JSON\.stringify\(h\.days_of_week\)\}::jsonb, hour_from = \$\{h\.hour_from\}, hour_till = \$\{h\.hour_till\}, i18n = /.test(route));
  const cb = zdroj('lib/clientBanners.ts');
  ok('clientBanners: výběr pro hosta zná pražský čas', cb.includes('kdyTed(ted)'));
  ok('clientBanners: host dostane text v jazyce hosta', cb.includes('tvarBanneru(r, jazyk)'));
  ok('clientBanners: veřejný tvar nenese plán ani překlady', !/days_of_week|hour_from|i18n:/.test(cb.slice(cb.indexOf('export function tvarBanneru'), cb.indexOf('export async function aktivniBannery'))));
  ok('stránka podniku posílá jazyk hosta do banneru', zdroj('app/api/client/b/[slug]/route.ts').includes("aktivniBannery(teamId, today, await kontextHosta(teamId, me?.id ?? null, mine), new URL(req.url).searchParams.get('lang'))"));
  const init = zdroj('app/api/init/route.ts');
  ok('init: sloupce plánu a překladů bannerů', ['days_of_week JSONB', 'hour_from TEXT', 'hour_till TEXT', 'i18n JSONB'].every(x => init.includes(`ALTER TABLE client_banners ADD COLUMN IF NOT EXISTS ${x.split(' ')[0]} ${x.split(' ')[1]}`)));
}
