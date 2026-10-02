// Kolo 73b — Nastavení: synchronizace jazyka a motivu, osobní formáty, oznámení v2 (kategorie,
// tiché hodiny), vzhled zařízení, profil podniku (IČO, DIČ, prahy), export vlastních dat, záložky.
// Čistá logika bez databáze a bez prohlížeče.

import type { Testy } from './_testy.ts';
import { jeJazykVyslovny, jazykKUplatneni, motivKUplatneni } from '../../lib/i18n/synchronizace.ts';
import {
  cistyFormaty, ucinneHodiny, ucinnyZacatekTydne, prepisDesetinny, hmVTvaru, datumVTvaru, jsouVychoziFormaty,
  nastavOsobniFormaty, nastavTymovyFormat, osobniFormaty, aktualniHodiny, VYCHOZI_FORMATY,
} from '../../lib/i18n/osobniFormaty.ts';
import { fmtDatum, fmtHM, fmtCas } from '../../lib/i18n/format.ts';
import { dbTimeHM, dbTimeDayHM } from '../../lib/pragueTime.ts';
import { jeZtlumeno, jeVTichychHodinach, minutyZHM, CATEGORY_PREF } from '../../lib/pushPravidla.ts';
import { cistePrefsUctu, cisteTicho, KATEGORIE_OZNAMENI } from '../../lib/nastaveniUcet.ts';
import { cistyVzhled, atributyVzhledu, VYCHOZI_VZHLED } from '../../lib/vzhled.ts';
import { cistyIco, cistyDic, cistyPrah, pragySedi, icoMaPlatnouKontrolu } from '../../lib/podnikProfil.ts';
import { sestavExport, nazevExportu, druhZarizeniZEndpointu, POLE_PROFILU } from '../../lib/exportUctu.ts';
import { zalozkaNastaveni, ZALOZKY_NASTAVENI } from '../../lib/nastaveniZalozky.ts';

export default function ({ eq, ok }: Testy) {
  // ---- 1) synchronizace jazyka a motivu ----
  ok('jazyk: bez cookie není výslovný', !jeJazykVyslovny(undefined, false));
  ok('jazyk: cookie od člověka je výslovná', jeJazykVyslovny('de', false));
  ok('jazyk: cookie z automatiky (značka) není výslovná', !jeJazykVyslovny('de', true));
  ok('jazyk: nesmyslná cookie není výslovná', !jeJazykVyslovny('xx', false));
  eq('jazyk: nové zařízení převezme jazyk z účtu', jazykKUplatneni({ zUctu: 'de', aktualni: 'cs', vyslovnyNaZarizeni: false }), 'de');
  eq('jazyk: výslovná volba na zařízení má přednost', jazykKUplatneni({ zUctu: 'de', aktualni: 'cs', vyslovnyNaZarizeni: true }), null);
  eq('jazyk: účet bez jazyka nic nemění', jazykKUplatneni({ zUctu: null, aktualni: 'cs', vyslovnyNaZarizeni: false }), null);
  eq('jazyk: nesmysl z účtu se zahodí', jazykKUplatneni({ zUctu: 'klingon', aktualni: 'cs', vyslovnyNaZarizeni: false }), null);
  eq('jazyk: shodný jazyk se nepřepíná (žádné zbytečné obnovení)', jazykKUplatneni({ zUctu: 'pl', aktualni: 'pl', vyslovnyNaZarizeni: false }), null);
  eq('jazyk: hodnota z databáze „SK-sk“ se přečte', jazykKUplatneni({ zUctu: 'SK-sk', aktualni: 'cs', vyslovnyNaZarizeni: false }), 'sk');
  eq('motiv: nové zařízení převezme tmavý', motivKUplatneni({ zUctu: 'dark', vyslovnyNaZarizeni: false }), 'dark');
  eq('motiv: podle systému je platná volba', motivKUplatneni({ zUctu: 'system', vyslovnyNaZarizeni: false }), 'system');
  eq('motiv: výslovná volba na zařízení má přednost', motivKUplatneni({ zUctu: 'dark', vyslovnyNaZarizeni: true }), null);
  eq('motiv: nesmysl se zahodí', motivKUplatneni({ zUctu: 'sepia', vyslovnyNaZarizeni: false }), null);

  // ---- 2) osobní formáty ----
  eq('formáty: výchozí = vše podle podniku a jazyka', cistyFormaty(undefined), VYCHOZI_FORMATY);
  eq('formáty: neplatné položky se vrátí na auto', cistyFormaty({ cas: '13', datum: 'xyz', tyden: 5, desetinny: ';' }), VYCHOZI_FORMATY);
  eq('formáty: platné projdou, týden jako číslo i řetězec', cistyFormaty({ cas: '12', datum: 'ymd', tyden: 0, desetinny: '.' }), { cas: '12', datum: 'ymd', tyden: '0', desetinny: '.' });
  ok('formáty: jsouVychozi', jsouVychoziFormaty(VYCHOZI_FORMATY) && !jsouVychoziFormaty(cistyFormaty({ cas: '12' })));
  eq('čas: osobní 12 přebíjí týmových 24', ucinneHodiny(cistyFormaty({ cas: '12' }), '24'), 12);
  eq('čas: osobní 24 přebíjí týmových 12', ucinneHodiny(cistyFormaty({ cas: '24' }), '12'), 24);
  eq('čas: auto bere podnik', [ucinneHodiny(VYCHOZI_FORMATY, '12'), ucinneHodiny(VYCHOZI_FORMATY, '24'), ucinneHodiny(VYCHOZI_FORMATY, undefined)], [12, 24, 24]);
  eq('týden: osobní neděle přebíjí pondělí podniku', ucinnyZacatekTydne(cistyFormaty({ tyden: '0' }), 1), 0);
  eq('týden: osobní pondělí přebíjí neděli podniku', ucinnyZacatekTydne(cistyFormaty({ tyden: '1' }), 0), 1);
  eq('týden: auto bere podnik', [ucinnyZacatekTydne(VYCHOZI_FORMATY, 0), ucinnyZacatekTydne(VYCHOZI_FORMATY, 1), ucinnyZacatekTydne(VYCHOZI_FORMATY, null)], [0, 1, 1]);
  eq('hodiny: 24 doplní nulu a ořízne vteřiny', [hmVTvaru('8:05', 24), hmVTvaru('08:00:00', 24), hmVTvaru('14:30', 24)], ['08:05', '08:00', '14:30']);
  eq('hodiny: 12 — odpoledne, půlnoc, poledne', [hmVTvaru('14:30', 12), hmVTvaru('00:05', 12), hmVTvaru('12:00', 12), hmVTvaru('09:15:00', 12), hmVTvaru('24:00', 12)], ['2:30 PM', '12:05 AM', '12:00 PM', '9:15 AM', '12:00 AM']);
  eq('hodiny: nečitelný vstup zůstane', [hmVTvaru('—', 12), hmVTvaru(null, 24), hmVTvaru(undefined, 12)], ['—', '', '']);
  eq('datum: tři pořadí', [datumVTvaru(2026, 2, 11, 'dmy', false), datumVTvaru(2026, 2, 11, 'mdy', false), datumVTvaru(2026, 2, 11, 'ymd', false)], ['11. 2. 2026', '2/11/2026', '2026-02-11']);
  eq('datum: bez roku', [datumVTvaru(2026, 2, 5, 'dmy', true), datumVTvaru(2026, 2, 5, 'mdy', true), datumVTvaru(2026, 2, 5, 'ymd', true)], ['5. 2.', '2/5', '02-05']);
  // desetinný oddělovač: jen znak, ne měna ani seskupení
  eq('čísla: auto nemění nic', prepisDesetinny('1 500,50 Kč', 'cs-CZ', 'auto'), '1 500,50 Kč');
  eq('čísla: cs čárka → tečka, mezera zůstane', prepisDesetinny('1 500,50 Kč', 'cs-CZ', '.'), '1 500.50 Kč');
  eq('čísla: cs už má čárku', prepisDesetinny('1 500,50 Kč', 'cs-CZ', ','), '1 500,50 Kč');
  eq('čísla: en tečka → čárka a seskupení se vymění', prepisDesetinny('1,500.50', 'en-GB', ','), '1.500,50');
  eq('čísla: de má seskupení tečkou — volba tečka je prohodí', prepisDesetinny('1.500,50 €', 'de-DE', '.'), '1,500.50 €');
  eq('čísla: bez desetin', prepisDesetinny('250 Kč', 'cs-CZ', '.'), '250 Kč');

  // formátovací funkce jedním místem (modulový stav se zapisuje jen v prohlížeči → krátce simulujeme okno)
  eq('fmtHM: bez osobní volby i podniku 24 h jako dřív', [fmtHM('08:00:00'), fmtHM('18:30'), fmtHM(null)], ['08:00', '18:30', '']);
  eq('fmtDatum: bez volby podle jazyka (cs)', fmtDatum('2026-02-11', { jazyk: 'cs', styl: 'cislo' }), '11. 2. 2026');
  eq('fmtDatum: explicitní volba v parametru', [fmtDatum('2026-02-11', { jazyk: 'cs', styl: 'cislo', datum: 'ymd' }), fmtDatum('2026-02-11', { jazyk: 'cs', styl: 'kratce', datum: 'mdy' })], ['2026-02-11', '2/11']);
  eq('fmtDatum: dlouhé styly osobní volba nemění', fmtDatum('2026-02-11', { jazyk: 'cs', styl: 'dlouze', datum: 'ymd' }), '11. února 2026');
  const puvodniWindow = (globalThis as any).window;
  (globalThis as any).window = {};
  try {
    nastavTymovyFormat('12', 0);
    eq('stav: podnik 12 h bez osobní volby → 12', aktualniHodiny(), 12);
    eq('stav: fmtHM podle podniku', fmtHM('14:30'), '2:30 PM');
    eq('stav: dbTimeHM (docházka, kiosk) podle podniku', dbTimeHM('2026-03-10T13:05:00Z'), '2:05 PM');
    nastavOsobniFormaty(cistyFormaty({ cas: '24' }));
    eq('stav: osobní 24 přebije podnik 12', [aktualniHodiny(), fmtHM('14:30'), dbTimeHM('2026-03-10T13:05:00Z')], [24, '14:30', '14:05']);
    nastavOsobniFormaty(cistyFormaty({ cas: '12', datum: 'ymd' }));
    eq('stav: osobní 12 + datum ymd v dbTimeDayHM', dbTimeDayHM('2026-03-10T13:05:00Z'), '03-10 2:05 PM');
    eq('stav: fmtDatum čte osobní volbu bez parametru', fmtDatum('2026-02-11', { jazyk: 'cs', styl: 'cislo' }), '2026-02-11');
    eq('stav: fmtCas bez parametru hodiny bere osobní volbu', fmtCas('14:30', { jazyk: 'en' }).replace(/\s/g, ' ').toLowerCase(), '2:30 pm');
    eq('stav: osobní volby jsou čitelné', osobniFormaty().datum, 'ymd');
    // reset, ať další testy vidí výchozí stav
    nastavOsobniFormaty(VYCHOZI_FORMATY);
    nastavTymovyFormat('24', 1);
    eq('stav: po resetu zpět 24 h a bez osobního data', [fmtHM('14:30'), dbTimeDayHM('2026-03-10T13:05:00Z')], ['14:30', '10. 3. 14:05']);
  } finally {
    nastavOsobniFormaty(VYCHOZI_FORMATY);
    nastavTymovyFormat('24', 1);
    if (puvodniWindow === undefined) delete (globalThis as any).window; else (globalThis as any).window = puvodniWindow;
  }
  eq('stav: na serveru (bez okna) se stav nezapisuje', (() => { nastavOsobniFormaty(cistyFormaty({ cas: '12' })); return aktualniHodiny(); })(), 24);

  // ---- 4b) oznámení v2: kategorie, tiché hodiny, souhrn ----
  eq('kategorie: nové kategorie mají vlastní klíč', [CATEGORY_PREF.task, CATEGORY_PREF.closing, CATEGORY_PREF.booking, CATEGORY_PREF.timeoff], ['ukoly', 'uzaverky', 'rezervace', 'volno']);
  ok('kategorie: bez preferencí je vše zapnuté', (['task', 'closing', 'booking', 'timeoff', 'shift'] as const).every(k => !jeZtlumeno({}, k)));
  ok('kategorie: vypnuté úkoly se ztlumí, ostatní ne', jeZtlumeno({ ukoly: false }, 'task') && !jeZtlumeno({ ukoly: false }, 'closing') && !jeZtlumeno({ ukoly: false }, 'booking'));
  ok('kategorie: uzávěrky a rezervace jdou vypnout zvlášť', jeZtlumeno({ uzaverky: false }, 'closing') && jeZtlumeno({ rezervace: false }, 'booking') && !jeZtlumeno({ rezervace: false }, 'closing'));
  ok('kategorie: volno bez vlastního nastavení dědí směny (kdo ztlumil směny, volno nedostane)', jeZtlumeno({ shifts: false }, 'timeoff'));
  ok('kategorie: vlastní nastavení volna přebíjí směny', !jeZtlumeno({ shifts: false, volno: true }, 'timeoff') && jeZtlumeno({ shifts: true, volno: false }, 'timeoff'));
  ok('kategorie: general se nikdy neztlumí', !jeZtlumeno({ ukoly: false, shifts: false }, 'general') && !jeZtlumeno({ shifts: false }, undefined));
  ok('kategorie: novinky dál jen s výslovným souhlasem', jeZtlumeno({}, 'novinky') && !jeZtlumeno({ novinky: true }, 'novinky'));
  eq('čas: minutyZHM', [minutyZHM('00:00'), minutyZHM('7:05'), minutyZHM('23:59'), minutyZHM('24:00'), minutyZHM('abc'), minutyZHM(null)], [0, 425, 1439, null, null, null]);
  const ticho = { ticho: { zap: true, od: '22:00', do: '07:00' } };
  ok('tiché hodiny: přes půlnoc — večer ano', jeVTichychHodinach(ticho, '23:30') && jeVTichychHodinach(ticho, '22:00'));
  ok('tiché hodiny: přes půlnoc — po půlnoci ano, ráno konec', jeVTichychHodinach(ticho, '03:00') && jeVTichychHodinach(ticho, '06:59') && !jeVTichychHodinach(ticho, '07:00'));
  ok('tiché hodiny: přes půlnoc — přes den ne', !jeVTichychHodinach(ticho, '12:00') && !jeVTichychHodinach(ticho, '21:59'));
  ok('tiché hodiny: v rámci dne', jeVTichychHodinach({ ticho: { zap: true, od: '13:00', do: '15:00' } }, '14:00') && !jeVTichychHodinach({ ticho: { zap: true, od: '13:00', do: '15:00' } }, '15:00'));
  ok('tiché hodiny: vypnuté nebo bez nastavení netlumí', !jeVTichychHodinach({ ticho: { zap: false, od: '00:00', do: '23:00' } }, '12:00') && !jeVTichychHodinach({}, '12:00') && !jeVTichychHodinach(null, '12:00'));
  ok('tiché hodiny: shodné od a do nebo nesmysl netlumí', !jeVTichychHodinach({ ticho: { zap: true, od: '08:00', do: '08:00' } }, '08:00') && !jeVTichychHodinach({ ticho: { zap: true, od: 'x', do: '07:00' } }, '03:00'));
  eq('účet: ticho se očistí a doplní výchozí', cisteTicho({ zap: true, od: '9:30', do: 'nesmysl' }), { zap: true, od: '09:30', do: '07:00' });
  eq('účet: do databáze projdou jen známé klíče', cistePrefsUctu({ ukoly: false, digest: false, evil: true, novinky: true, push: true, admin: 'x' }), { ukoly: false, digest: false });
  eq('účet: boolean musí být boolean', cistePrefsUctu({ messages: 'false', lowStock: 0, shifts: false }), { shifts: false });
  eq('účet: formáty a ticho se čistí', cistePrefsUctu({ formaty: { cas: '12', datum: 'zzz' }, ticho: { zap: 1 } }), { ticho: { zap: false, od: '22:00', do: '07:00' }, formaty: { cas: '12', datum: 'auto', tyden: 'auto', desetinny: 'auto' } });
  eq('účet: nesmysl místo objektu', [cistePrefsUctu(null), cistePrefsUctu('x'), cistePrefsUctu([1])], [{}, {}, {}]);
  ok('účet: každá kategorie z nastavení má pravidlo v pushPravidla', KATEGORIE_OZNAMENI.every(k => k === 'messages' || k === 'lowStock' || k === 'shifts' || Object.values(CATEGORY_PREF).includes(k)));

  // ---- 4a) vzhled zařízení ----
  eq('vzhled: výchozí', cistyVzhled(undefined), VYCHOZI_VZHLED);
  eq('vzhled: nesmysly na výchozí', cistyVzhled({ hustota: 'x', pismo: 'obri', pohyb: 'ano', kontrast: 1 }), VYCHOZI_VZHLED);
  eq('vzhled: atributy výchozího vzhledu jsou prázdné', Object.values(atributyVzhledu(VYCHOZI_VZHLED)), [null, null, null, null]);
  eq('vzhled: atributy', atributyVzhledu({ hustota: 'kompaktni', pismo: 'nejvetsi', pohyb: true, kontrast: true }), { 'data-density': 'compact', 'data-fontsize': 'xlarge', 'data-motion': 'reduce', 'data-contrast': 'high' });
  eq('vzhled: větší písmo', atributyVzhledu({ ...VYCHOZI_VZHLED, pismo: 'vetsi' })['data-fontsize'], 'large');

  // ---- 4e) profil podniku ----
  ok('IČO: platné', ['27082440', '00006947', '25596641'].every(icoMaPlatnouKontrolu));
  ok('IČO: špatná kontrolní číslice', !icoMaPlatnouKontrolu('12345678') && !icoMaPlatnouKontrolu('27082441'));
  eq('IČO: mezery pryč a doplnění nul', [cistyIco(' 270 824 40 '), cistyIco('6947')], ['27082440', '00006947']);
  eq('IČO: prázdné = bez IČO, nesmysl = chyba', [cistyIco(''), cistyIco(null), cistyIco('abc'), cistyIco('123456789'), cistyIco('12345678')], [null, null, undefined, undefined, undefined]);
  eq('DIČ: velká písmena a mezery pryč', [cistyDic('cz 27082440'), cistyDic('SK2020123456'), cistyDic('de123456789')], ['CZ27082440', 'SK2020123456', 'DE123456789']);
  eq('DIČ: prázdné = bez DIČ, nesmysl = chyba', [cistyDic(' '), cistyDic('27082440'), cistyDic('C'), cistyDic('CZ-123')], [null, undefined, undefined, undefined]);
  eq('práh: celé číslo, desetinné se zaokrouhlí (sloupec je INTEGER)', [cistyPrah('5'), cistyPrah(2.6), cistyPrah('3,4'), cistyPrah(0)], [5, 3, 3, 0]);
  eq('práh: prázdné, záporné a nesmysl neprojdou', [cistyPrah(''), cistyPrah(null), cistyPrah(-1), cistyPrah('abc'), cistyPrah(1e9)], [undefined, undefined, undefined, undefined, undefined]);
  ok('prahy: kritický nesmí být nad nízkým', pragySedi(5, 2) && pragySedi(5, 5) && !pragySedi(2, 5));

  // ---- 4d) export vlastních dat ----
  const dok = sestavExport({
    ucet: { id: 7, name: 'Jana', email: 'jana@x.cz', password_hash: '$2a$10$tajne', token: 'abc', role: 'employee', created_at: '2026-01-01' },
    nastaveni: { jazyk: 'de', preference: { ukoly: false } },
    clenstvi: [{ team_id: 3, podnik: 'Kavárna', role: 'employee' }],
    smeny: [{ id: 1, date: '2026-02-11', start_time: '08:00', end_time: '16:00' }],
    dochazka: null, volno: [], dostupnost: [], zpravy: [{ id: 5, content: 'Ahoj' }],
  }, new Date('2026-02-11T10:00:00Z'));
  ok('export: hash hesla a tokeny se do souboru nedostanou', !JSON.stringify(dok).includes('tajne') && !('password_hash' in (dok.ucet ?? {})) && !('token' in (dok.ucet ?? {})));
  eq('export: profil nese jen povolená pole', Object.keys(dok.ucet ?? {}).every(k => (POLE_PROFILU as readonly string[]).includes(k)), true);
  eq('export: sekce, která se nenačetla, je jmenovaná', dok.nedostupne, ['dochazka']);
  eq('export: chybějící sekce je prázdné pole, ne null', [dok.dochazka, dok.volno], [[], []]);
  eq('export: čas a verze', [dok.vytvoreno, dok.verze, dok.aplikace], ['2026-02-11T10:00:00.000Z', 1, 'Managero']);
  eq('export: název souboru', nazevExportu(new Date('2026-02-11T10:00:00Z')), 'managero-moje-data-2026-02-11.json');
  eq('zařízení: druh podle služby, adresa se nevrací', [
    druhZarizeniZEndpointu('https://fcm.googleapis.com/fcm/send/abc'), druhZarizeniZEndpointu('https://web.push.apple.com/xyz'),
    druhZarizeniZEndpointu('https://updates.push.services.mozilla.com/wpush/v2/q'), druhZarizeniZEndpointu('https://wns2-par02p.notify.windows.com/?token=1'),
    druhZarizeniZEndpointu('https://example.org/push'), druhZarizeniZEndpointu('nesmysl'), druhZarizeniZEndpointu(undefined),
  ], ['chrome', 'safari', 'firefox', 'edge', 'jine', 'jine', 'jine']);

  // ---- deep link na záložky ----
  eq('záložka: platná id', ['jazyk', 'privacy', 'podnik', 'zkratky', 'notifications', 'account'].map(z => zalozkaNastaveni(z)), ['jazyk', 'privacy', 'podnik', 'zkratky', 'notifications', 'account']);
  eq('záložka: neznámá nebo prázdná se zahodí', [zalozkaNastaveni('hack'), zalozkaNastaveni(''), zalozkaNastaveni(null), zalozkaNastaveni(undefined), zalozkaNastaveni(['jazyk'])], [undefined, undefined, undefined, undefined, undefined]);
  ok('záložky: ID bez duplicit', new Set(ZALOZKY_NASTAVENI).size === ZALOZKY_NASTAVENI.length);
}
