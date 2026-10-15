// „Přepočítat zpětně body“ (kolo 91): automatické řádky podle nového pravidla, jako by
// platilo odjakživa; ruční úpravy vedení nedotčené; náhled dopadu (i lidé, kteří by šli do
// minusu); přepočet jde vrátit. Čistá aritmetika tady, dotazy hlídané ve zdroji.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  bodyPostupu, jeZmena, souhrnDopadu, ucinnyDen, rozdelRadek, ucinnePravidlo, VYCHOZI_PRAVIDLO,
  type ZmenaRadku,
} from '../../lib/bodyRezim.ts';

const zdroj = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const rozsah = (n: number) => Array.from({ length: n }, (_, i) => i);
const kroky = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Krok ${i + 1}` }));

export default function ({ eq, ok }: Testy) {
  const Z = 10;

  // ---- přepočet jednoho řádku: kombinace → celek ----
  const items = kroky(10);
  const hotovo = rozsah(8);
  const stary = bodyPostupu(items, hotovo, [], {}, ucinnePravidlo(VYCHOZI_PRAVIDLO, null, Z), Z);
  const novy = bodyPostupu(items, hotovo, [], {}, ucinnePravidlo({ ...VYCHOZI_PRAVIDLO, rezim: 'celek' }, null, Z), Z);
  // kombinace: round(10 × 8/10) − 2 = 6; celek: 10 − 2 = 8 → řádek −2
  eq('kombinace → celek: řádek 6 → −2 (celkem za průběh 16 → 8)', [stary.radek, novy.radek, Z + stary.radek, Z + novy.radek], [6, -2, 16, 8]);
  const z: ZmenaRadku = { id: 7, uid: 3, den: '2026-10-10', kind: 'procedure', refId: 99, stare: stary.radek, nove: novy.radek, stareSrazka: null, noveSrazka: novy.srazka, stareNote: stary.summary, noveNote: novy.summary };
  ok('je to změna', jeZmena(z));
  ok('beze změny bodů i srážky = žádný záznam', !jeZmena({ id: 1, stare: 4, nove: 4, stareSrazka: -1, noveSrazka: -1 }));
  ok('starý řádek bez srážky dostane srážku = změna (doplní se pro strop)', jeZmena({ id: 1, stare: 4, nove: 4, stareSrazka: null, noveSrazka: -1 }));
  ok('nový řádek úkolu jen když není nulový', !jeZmena({ id: null, stare: 0, nove: 0, stareSrazka: null, noveSrazka: 0 }) && jeZmena({ id: null, stare: 0, nove: 3, stareSrazka: null, noveSrazka: 0 }));

  // ---- souhrn dopadu: „Změní se 23 záznamů u 6 lidí, celkem −84 b“ + kdo by šel do minusu ----
  const s = souhrnDopadu([{ uid: 1 }, { uid: 1 }, { uid: 2 }], [
    { uid: 1, pred: 50, po: 30 },
    { uid: 2, pred: 5, po: -3 },
    { uid: 3, pred: -2, po: -6 },  // už byl v minusu — nehlásí se jako nově do minusu
    { uid: 4, pred: 10, po: 10 },
  ]);
  eq('souhrn: 3 záznamy, 3 lidé (i ten jen se změnou stropu), celkem −32', [s.zaznamu, s.lidi, s.celkem], [3, 3, -32]);
  eq('do minusu jen ten, kdo z nuly a víc klesne pod nulu', s.doMinusu.map(d => d.uid), [2]);

  // ---- přepočet se stropem: změna řádku se promítne do dne a strop ji ořízne ----
  const n = { stropZap: true, denniStrop: 30, stropOd: null };
  // den: 2 průběhy po (základ 10 + řádek), uzávěrka 15 → plus = 10+6 + 10+6 + 15 = 47
  const den0 = { den: '2026-10-10', plus: 47, minus: 0, nahrazeno: false };
  const pred = ucinnyDen(den0, n);
  // přepočet obou řádků 6 → celek se srážkou −2 (řádek −2): plus −6 a −6 a +0, minus −2 a −2
  const s0 = rozdelRadek(6, null), s1 = rozdelRadek(-2, -2);
  const den1 = { ...den0, plus: den0.plus + 2 * (s1.plus - s0.plus), minus: den0.minus + 2 * (s1.minus - s0.minus) };
  const po = ucinnyDen(den1, n);
  eq('se stropem: před 47 → 30; po přepočtu plus 35, srážky −4 → 30 − 4 = 26', [pred.efektivni, den1.plus, den1.minus, po.efektivni], [30, 35, -4, 26]);
  eq('změna zůstatku = (nová oprava dne − stará) + změna řádků', (po.uprava - pred.uprava) + 2 * (-2 - 6), po.efektivni - pred.efektivni);

  // ---- dotazy: jen automatické nedotčené řádky, ruční nikdy ----
  const db = zdroj('lib/bodyPrepocetDb.ts');
  const nedotceny = /created_by IS NULL AND COALESCE\(i\.rucne, FALSE\) = FALSE AND i\.note LIKE 'auto:%'\s+AND i\.updated_at <= i\.created_at \+ INTERVAL '2 seconds'/g;
  eq('postupy, úkoly i uzávěrky: stejná podmínka „nedotčený automatický řádek“', (db.match(nedotceny) ?? []).length, 3);
  ok('úkoly: řádek upravený vedením se přeskočí (rucni)', /if \(r\.rucni === true\) continue;/.test(db));
  ok('zápis: jen řádek se stejnou hodnotou, jakou viděl náhled, a pořád automatický', /s\.points = x\.p0\s+AND s\.created_by IS NULL AND COALESCE\(s\.rucne, FALSE\) = FALSE AND s\.note LIKE 'auto:%'/.test(db));
  ok('přepočet nemění updated_at (řádek zůstává „nedotčený“ pro další přepočet)', !/SET points = x\.p, srazka = x\.s, note = x\.n, updated_at/.test(db));
  ok('výchozí podniku: položka s vlastním způsobem se přeskočí', (db.match(/prepisPolozky\?\.rezim != null\) continue;/g) ?? []).length === 2);
  ok('staré hodnoty se uloží do body_prepocty dřív, než se řádky přepíšou', db.indexOf('INSERT INTO body_prepocty') < db.indexOf('UPDATE shift_review_items AS s SET points = x.p'));
  ok('strop zpětně = odjakživa, změna stropu platí ode dne uložení', /n1\.stropOd = rozsah\.zpetneStrop \? null : stropSeZmenil\(n0, n1\) \? pragueToday\(\) : n0\.stropOd/.test(db));
  ok('starší ruční hodnocení: převod jen s volbou, id do body_prepocty, vrácení zpět na NULL', /pravidla\.starsiHodnoceni === true/.test(db) && /predchozi \|\| \$\{JSON\.stringify\(\{ hodnoceni: ids \}\)\}/.test(db) && /SET nahradit_auto = NULL WHERE team_id = \$\{teamId\} AND id = ANY\(\$\{hodnoceni\}\) AND nahradit_auto = TRUE/.test(db));

  // ---- vrácení ----
  ok('vrátit jde jen poslední přepočet', /ORDER BY id DESC LIMIT 1/.test(db) && /Vrátit jde jen poslední přepočet\./.test(db));
  ok('vrácení: staré hodnoty jen u řádků, které se od přepočtu nezměnily', /WHERE s\.id = x\.id AND s\.team_id = \$\{teamId\} AND s\.points = x\.np/.test(db));
  ok('vrácení: doplněné řádky zmizí', /DELETE FROM shift_review_items AS s/.test(db));
  ok('vrácení: předchozí pravidlo podniku (i chybějící klíče)', /points_config, '\{\}'::jsonb\) - \$\{chybelo\}::text\[\]/.test(db));

  // ---- API, oprávnění, audit, smazání účtu, ukázka ----
  const api = zdroj('app/api/body/prepocet/route.ts');
  eq('API: oprávnění odmeny.nastaveni (GET i POST)', (api.match(/pozaduj\('odmeny\.nastaveni'\)/g) ?? []).length, 2);
  ok('API: náhled nic nezapisuje (nahled !== false vrací před zápisem)', api.indexOf("if (b.nahled !== false) return") < api.indexOf('provedPrepocet('));
  ok('audit: přepočet i vrácení mají popisek', /'points\.prepocet':/.test(zdroj('lib/auditPopisky.ts')) && /'points\.prepocet_vracen':/.test(zdroj('lib/auditPopisky.ts')));
  ok('smazání účtu zná body_prepocty', /body_prepocty: 'ponechat'/.test(zdroj('lib/smazaniUctu.ts')));
  ok('DDL na konci init: body_prepocty, srazka, rucne, nahradit_auto, body_rezim', ['CREATE TABLE IF NOT EXISTS body_prepocty', 'ADD COLUMN IF NOT EXISTS srazka', 'ADD COLUMN IF NOT EXISTS rucne', 'ADD COLUMN IF NOT EXISTS nahradit_auto', 'procedures ADD COLUMN IF NOT EXISTS body_rezim', 'tasks ADD COLUMN IF NOT EXISTS body_rezim'].every(k => zdroj('app/api/init/route.ts').includes(k)));
  ok('ukázka zná /api/body/prepocet', /cesta === '\/api\/body\/prepocet'/.test(zdroj('lib/demo/routy/ostatni.ts')));
}
