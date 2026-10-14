// Data a soukromí (spuštění, balík P): poloha z Píchaček, push k narozeninám jen se souhlasem
// s novinkami, export vlastních dat zaměstnance doplněný o tresty, body, navíc, úpravy mzdy,
// hodnocení směn a výsledek ověření polohy.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { CEKANI_NA_POLOHU_MS, KLIC_INFO_POLOHY, infoPolohyPotvrzeno, potvrdInfoPolohy, zjistiPolohu, overPolohu, parsePoloha } from '../../lib/geoPichani.ts';
import { sestavExport } from '../../lib/exportUctu.ts';
import { jeZtlumeno } from '../../lib/pushPravidla.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

/** Atrapa navigator.geolocation: odpoví polohou, chybou, nebo vůbec. */
function geo(chovani: 'ok' | 'chyba' | 'ticho' | 'vyjimka'): Geolocation {
  return {
    getCurrentPosition(ok: PositionCallback, chyba?: PositionErrorCallback | null) {
      if (chovani === 'vyjimka') throw new Error('nepodporováno');
      if (chovani === 'ok') ok({ coords: { latitude: 50.08, longitude: 14.42, accuracy: 18.4 } } as GeolocationPosition);
      if (chovani === 'chyba') chyba?.({ code: 1, message: 'odmítnuto' } as GeolocationPositionError);
    },
  } as unknown as Geolocation;
}

export default async function ({ eq, ok }: Testy) {
  // ---- poloha z Píchaček ----
  eq('poloha: čeká se 8 s', CEKANI_NA_POLOHU_MS, 8000);
  eq('poloha: povolená vrátí souřadnice a zaokrouhlenou přesnost', await zjistiPolohu(geo('ok')), { lat: 50.08, lng: 14.42, accuracy: 18 });
  eq('poloha: odmítnutá = null (píchnutí projde bez ní)', await zjistiPolohu(geo('chyba')), null);
  eq('poloha: prohlížeč bez polohy = null', await zjistiPolohu(null), null);
  eq('poloha: výjimka = null', await zjistiPolohu(geo('vyjimka')), null);
  eq('poloha: když nepřijde odpověď, po limitu null', await zjistiPolohu(geo('ticho'), 10), null);
  const pravidla = { zapnuto: true, lat: 50.08, lng: 14.42, polomerM: 200 as const };
  eq('server: z poslané polohy „ok" a vzdálenost, bez polohy „missing"', [overPolohu(pravidla, parsePoloha({ lat: 50.08, lng: 14.42, accuracy: 18 }))?.status, overPolohu(pravidla, null)?.status], ['ok', 'missing']);
  const mapa = new Map<string, string>();
  const ul = { getItem: (k: string) => mapa.get(k) ?? null, setItem: (k: string, v: string) => { mapa.set(k, v); } };
  ok('informace o poloze: poprvé neodsouhlasená, po potvrzení zapamatovaná', !infoPolohyPotvrzeno(ul) && (potvrdInfoPolohy(ul), infoPolohyPotvrzeno(ul)) && mapa.get(KLIC_INFO_POLOHY) === '1');
  ok('informace o poloze: úložiště, které hází, = ptát se znovu, nespadnout', !infoPolohyPotvrzeno({ getItem: () => { throw new Error('x'); } }) && (potvrdInfoPolohy({ setItem: () => { throw new Error('x'); } }), true));
  const doch = cti('components/widgety/oblasti/dochazka.tsx');
  ok('Píchačky: polohu berou jen při příchodu u podniku, který ji ověřuje', /const sPolohou = akce === 'in' && data\.data\?\.poloha === true/.test(doch) && /poloha: raw\.pichaniPoloha === true/.test(doch));
  ok('Píchačky: před prvním použitím věta, co se ukládá', /t\('Podnik při píchnutí ověřuje vzdálenost od provozovny\. Ukládá se jen vzdálenost, ne poloha\.'\)/.test(doch));
  ok('Píchačky: poloha jde v těle POST jako „poloha" (server čte b.poloha)', /\.\.\.\(poloha \? \{ poloha \} : \{\}\)/.test(doch) && /parsePoloha\(b\.poloha \?\? b\.geo\)/.test(cti('app/api/attendance/route.ts')));
  ok('GET /api/attendance: příznak pichaniPoloha pro zaměstnance i vedení, tablet ne', (cti('app/api/attendance/route.ts').match(/pichaniPoloha/g) ?? []).length >= 4 && /c\.role\.typ !== 'kiosk' && pravidloUcinne/.test(cti('app/api/attendance/route.ts')));

  // ---- push k narozeninám ----
  const client = cti('lib/client.ts');
  const fce = client.slice(client.indexOf('export async function awardBirthdays'), client.indexOf('export async function awardCreditDetail'));
  ok('narozeniny: push v kategorii novinky', /category: 'novinky'/.test(fce));
  ok('novinky bez výslovného souhlasu ztlumené, se souhlasem chodí', jeZtlumeno({}, 'novinky') && !jeZtlumeno({ novinky: true }, 'novinky'));

  // ---- export vlastních dat ----
  const dok = sestavExport({
    ucet: { id: 7, name: 'Jana' }, nastaveni: null, clenstvi: [], smeny: [], dochazka: [{ id: 1, geo_status: 'far', geo_distance_m: 1200 }], volno: [], dostupnost: [], zpravy: [],
    tresty: [{ id: 3, points: 10, bonus_cut: 0 }], body: [{ id: 4, points: -10, kind: 'trest' }], navic: null, upravyMzdy: [{ id: 5, amount: 500, source: 'premie' }],
    hodnoceni: [{ id: 6, rating: 4 }], hodnoceniPolozek: [],
  }, new Date('2026-10-14T10:00:00Z'));
  eq('export: nové sekce v souboru', [dok.tresty.length, dok.body.length, dok.upravyMzdy.length, dok.hodnoceni.length, dok.navic], [1, 1, 1, 1, []]);
  eq('export: sekce, která se nenačetla, je jmenovaná i u nových', dok.nedostupne, ['nastaveni', 'navic']);
  ok('export: docházka nese geo_status a vzdálenost', (dok.dochazka[0] as Record<string, unknown>).geo_status === 'far');
  const route = cti('app/api/account/export/route.ts');
  ok('export: dotazy jen na vlastní id (penalties, point_awards, extra_work, wage_adjustments, shift_reviews, items)',
    /FROM penalties WHERE user_id = \$\{id\}/.test(route) && /FROM point_awards WHERE user_id = \$\{id\}/.test(route) && /FROM extra_work WHERE user_id = \$\{id\}/.test(route)
    && /FROM wage_adjustments WHERE user_id = \$\{id\}/.test(route) && /FROM shift_reviews WHERE employee_id = \$\{id\}/.test(route) && /FROM shift_review_items WHERE employee_id = \$\{id\}/.test(route));
  ok('export: docházka s geo_status a geo_distance_m', /clock_out, source, note, geo_status, geo_distance_m/.test(route));
}
