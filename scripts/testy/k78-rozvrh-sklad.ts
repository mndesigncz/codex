// Kolo 78 — vícejazyčnost Rozvrhu a Skladu: opravy z recenze.
//
// Hlídá: plochý slovník nepřepisuje větu, kterou už má (stejná věta = stejný překlad,
// přepis by zvedal verzi a překresloval vše); čeština v plurálech zůstává beze změny
// (1000 směn, ne 1 000); tisk nese jazyk a patičku v jazyce uživatele; hláška ze serveru
// u odpisu jde přes překlad; překlady hlášek rout rozvrhu a skladu existují ve všech jazycích.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { preloz } from '../../lib/i18n/core.ts';
import { pridejSlovnik, vsechnySlovniky, verzeSlovniku } from '../../lib/i18n/stav.ts';
import { printHtml } from '../../lib/printDoc.ts';
import { vetaOdpisu } from '../../lib/recepturyPrehled.ts';

export default function ({ eq, ok }: Testy) {
  // ---- pridejSlovnik: první vyhrává, opakované načtení nic nemění ----
  const v0 = verzeSlovniku();
  ok('pridejSlovnik: nová věta se přidá', pridejSlovnik('de', { 'Testovací věta k78': 'Testsatz' }) === true);
  const v1 = verzeSlovniku();
  ok('pridejSlovnik: stejná sekce podruhé nic nezmění (verze stejná)', pridejSlovnik('de', { 'Testovací věta k78': 'Testsatz' }) === false && verzeSlovniku() === v1 && v1 === v0 + 1);
  ok('pridejSlovnik: jiný překlad existující věty ji nepřepíše', pridejSlovnik('de', { 'Testovací věta k78': 'Anderer Satz' }) === false && vsechnySlovniky().de?.['Testovací věta k78'] === 'Testsatz');

  // ---- čeština beze změny: plurál bez seskupení tisíců ----
  const PL = '{n, plural, one {# směna} few {# směny} other {# směn}}';
  eq('plurál cs: 1000 a 1234 bez mezery, desetinné číslo s tečkou jako dřív', [preloz({}, 'cs', PL, { n: 1000 }), preloz({}, 'cs', PL, { n: 1234 }), preloz({}, 'cs', PL, { n: 5.3 })], ['1000 směn', '1234 směn', '5.3 směn']);

  // ---- tisk: jazyk a patička ----
  const NOW = new Date('2026-09-30T10:00:00Z');
  const cs = printHtml({ title: 'Rozvrh', body: '' }, NOW);
  ok('tisk cs: <html lang="cs"> a česká patička beze změny', cs.includes('<html lang="cs">') && cs.includes('vytištěno 30. 9. 2026 12:00:00 z aplikace Managero'));
  const de = printHtml({ title: 'Dienstplan', body: '', jazyk: 'de', paticka: c => `gedruckt am ${c} aus der Managero-App` }, NOW);
  ok('tisk de: <html lang="de"> a německá patička s časem v německém formátu', de.includes('<html lang="de">') && de.includes('gedruckt am 30.9.2026, 12:00:00 aus der Managero-App') && !de.includes('vytištěno'));

  // ---- odpis: chyba ze serveru jde přes překlad ----
  eq('vetaOdpisu: error ze serveru se předá překladači', vetaOdpisu({ error: 'Synchronizace selhala — zkus to za chvíli.' }, k => `[${k}]`), { text: '[Synchronizace selhala — zkus to za chvíli.]', chyba: true });

  // ---- hlášky serveru: všechny věty z error: '…' v routách rozvrhu a skladu mají překlad ----
  const api: Record<string, Record<string, string>> = {};
  for (const j of ['en', 'de', 'sk', 'pl']) api[j] = JSON.parse(readFileSync(new URL(`../../locales/${j}/api.json`, import.meta.url), 'utf8'));
  for (const k of ['Neplatný měsíc', 'Jedna inventura už běží — dokončete ji nebo zrušte.', 'Recepturu se nepodařilo uložit, původní zůstala beze změny. Zkus to za chvíli.']) {
    ok(`api: „${k.slice(0, 30)}…“ přeložená ve všech jazycích`, ['en', 'de', 'sk', 'pl'].every(j => typeof api[j][k] === 'string' && api[j][k].length > 3 && api[j][k] !== k));
  }
}
