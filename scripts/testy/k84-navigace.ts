// Kolo 8 (R8-6): adresa obrazovky a historie (lib/navigace.ts). Každý pohled má
// adresu `?view=…&arg=…`, okno k ní přidá `&okno=1`; starší odkazy (`tab`,
// `guide`, `billing` ze Stripe) se čtou jako `arg`, cizí parametry (ukázka:
// `scena`, `role`) přechod nechává být, `mode` zahazuje.

import type { Testy } from './_testy.ts';
import { adresaOkna, adresaPohledu, rozeberAdresu, stejnyPohled } from '../../lib/navigace.ts';
import { datumZDotazu } from '../../lib/hledani.ts';
import { EMOJI_REAKCI, jeEmojiReakce, kdoVidel, posledniVlastniId, prepniReakci, reakcePoZpravach, seskupReakce, shrnJmena, uryvekZpravy } from '../../lib/chatReakce.ts';

export default function ({ eq, ok }: Testy) {
  // ---- čtení adresy ----
  eq('prázdná adresa: žádný pohled', rozeberAdresu(''), { view: null, arg: null, okno: false });
  eq('?view=finance', rozeberAdresu('?view=finance'), { view: 'finance', arg: null, okno: false });
  eq('view + arg', rozeberAdresu('?view=tasks&arg=ukol%3A12'), { view: 'tasks', arg: 'ukol:12', okno: false });
  eq('bez otazníku taky', rozeberAdresu('view=inventory&arg=Sirupy'), { view: 'inventory', arg: 'Sirupy', okno: false });
  eq('okno=1', rozeberAdresu('?view=tasks&okno=1').okno, true);
  eq('starší odkaz: tab u Nastavení je arg', rozeberAdresu('?view=settings&tab=billing').arg, 'billing');
  eq('starší odkaz: billing=success ze Stripe znamená záložku Předplatné', rozeberAdresu('?view=settings&billing=success').arg, 'billing');
  eq('starší odkaz: guide u Návodů je arg', rozeberAdresu('?view=guides&guide=12').arg, '12');
  eq('guide, který není číslo, se zahodí', rozeberAdresu('?view=guides&guide=abc').arg, null);
  eq('tab mimo Nastavení se nečte', rozeberAdresu('?view=finance&tab=billing').arg, null);
  eq('arg má přednost před tab', rozeberAdresu('?view=settings&tab=billing&arg=pos').arg, 'pos');
  eq('mezery kolem se ořežou, prázdné = nic', rozeberAdresu('?view=%20%20&arg=%20'), { view: null, arg: null, okno: false });

  // ---- zápis adresy ----
  eq('pohled bez argumentu', adresaPohledu('', 'finance'), '?view=finance');
  eq('pohled s argumentem', adresaPohledu('', 'tasks', 'ukol:12'), '?view=tasks&arg=ukol%3A12');
  eq('prázdný argument se nepíše', adresaPohledu('', 'tasks', ''), '?view=tasks');
  eq('přepíše starý pohled i arg', adresaPohledu('?view=tasks&arg=ukol%3A12', 'finance'), '?view=finance');
  eq('zahodí tab, guide, billing a okno', adresaPohledu('?view=settings&tab=billing&guide=3&billing=success&okno=1', 'overview'), '?view=overview');
  eq('mode se zahazuje (pohled administrace = plný režim)', adresaPohledu('?mode=client&tab=menu', 'inventory'), '?view=inventory');
  eq('cizí parametry (ukázka) zůstávají', adresaPohledu('?scena=sklad&role=vedeni&view=inventory', 'finance'), '?scena=sklad&role=vedeni&view=finance');
  ok('výsledek jde zase přečíst', (() => { const a = rozeberAdresu(adresaPohledu('', 'tasks', 'ukol:12')); return a.view === 'tasks' && a.arg === 'ukol:12'; })());

  // ---- okno ----
  eq('okno otevřené', adresaOkna('?view=tasks', true), '?view=tasks&okno=1');
  eq('okno zavřené', adresaOkna('?view=tasks&okno=1', false), '?view=tasks');
  eq('okno bez pohledu (přehled)', adresaOkna('', true), '?okno=1');
  eq('zavření okna bez parametrů = bez otazníku', adresaOkna('?okno=1', false), '');
  eq('druhé otevření záznam nezdvojí', adresaOkna('?view=tasks&okno=1', true), '?view=tasks&okno=1');

  // ---- porovnání ----
  ok('tentýž pohled bez argumentu', stejnyPohled({ view: 'tasks' }, { view: 'tasks', arg: null }));
  ok('prázdný a chybějící argument jsou totéž', stejnyPohled({ view: 'tasks', arg: '' }, { view: 'tasks' }));
  ok('jiný argument = jiný pohled', !stejnyPohled({ view: 'tasks', arg: 'ukol:1' }, { view: 'tasks', arg: 'ukol:2' }));
  ok('jiný pohled', !stejnyPohled({ view: 'tasks' }, { view: 'finance' }));

  testyDatum({ eq, ok });
  testyChat({ eq, ok });
}

// ---- reakce, odpovědi a „Viděli" v chatu (lib/chatReakce.ts) ----
function testyChat({ eq, ok }: Testy) {
  ok('čtyři reakce, 👍 první', EMOJI_REAKCI.length === 4 && EMOJI_REAKCI[0] === '👍');
  ok('jen povolené emoji', jeEmojiReakce('✅') && !jeEmojiReakce('🔥') && !jeEmojiReakce(''));
  const radky = [
    { messageId: 1, emoji: '❤️', userId: 2, name: 'Eva' },
    { messageId: 1, emoji: '👍', userId: 3, name: 'Jakub' },
    { messageId: 1, emoji: '👍', userId: 2, name: 'Eva' },
    { messageId: 1, emoji: '👍', userId: 2, name: 'Eva' }, // duplicitní řádek se nepočítá dvakrát
    { messageId: 2, emoji: '😂', userId: 3, name: 'Jakub' },
  ];
  eq('seskupení: pořadí podle EMOJI_REAKCI, počet a jména', seskupReakce(radky.filter(r => r.messageId === 1)),
    [{ emoji: '👍', pocet: 2, jmena: ['Jakub', 'Eva'], userIds: [3, 2] }, { emoji: '❤️', pocet: 1, jmena: ['Eva'], userIds: [2] }]);
  eq('po zprávách', [...reakcePoZpravach(radky).keys()], [1, 2]);
  const ja = { id: 1, name: 'Já' };
  const r1 = seskupReakce(radky.filter(r => r.messageId === 1));
  eq('přepnutí: přidá mou reakci', prepniReakci(r1, '✅', ja).find(g => g.emoji === '✅'), { emoji: '✅', pocet: 1, jmena: ['Já'], userIds: [1] });
  eq('přepnutí: odebere mou reakci (a prázdná skupina zmizí)', prepniReakci(prepniReakci(r1, '✅', ja), '✅', ja).some(g => g.emoji === '✅'), false);
  const clenove = [
    { id: 1, name: 'Já', lastReadAt: '2026-10-13 08:06:00' },
    { id: 2, name: 'Eva', lastReadAt: '2026-10-13T08:10:00Z' },
    { id: 3, name: 'Jakub', lastReadAt: '2026-10-13T08:20:00Z' },
    { id: 4, name: 'Tereza', lastReadAt: '2026-10-12T20:00:00Z' },
    { id: 5, name: 'Nikdy', lastReadAt: null },
  ];
  eq('viděli: členové s last_read_at po zprávě, bez autora', kdoVidel(clenove, { senderId: 1, createdAt: '2026-10-13T08:05:00Z' }), ['Eva', 'Jakub']);
  eq('viděli: čas bez zóny (Postgres) se bere jako UTC', kdoVidel(clenove, { senderId: 2, createdAt: '2026-10-13 08:05:00' }), ['Já', 'Jakub']);
  eq('viděli: neplatný čas zprávy = nikdo', kdoVidel(clenove, { senderId: 1, createdAt: 'x' }), []);
  eq('shrnutí jmen: dvě a zbytek', shrnJmena(['Eva', 'Petr', 'Jana', 'Tom', 'Al']), { text: 'Eva, Petr', dalsich: 3 });
  eq('shrnutí jmen: prázdné', shrnJmena([]), { text: '', dalsich: 0 });
  eq('poslední vlastní zpráva', posledniVlastniId([{ id: 1, senderId: 1 }, { id: 2, senderId: 2 }, { id: 3, senderId: 1 }, { id: 4, senderId: 2 }], 1), 3);
  eq('poslední vlastní: žádná', posledniVlastniId([{ id: 2, senderId: 2 }], 1), null);
  eq('úryvek: jeden řádek, zkrácený', uryvekZpravy('Zítra\n zavírám   dřív, ' + 'x'.repeat(100), 20), 'Zítra zavírám dřív,…');
  eq('úryvek: prázdný = null', uryvekZpravy('   '), null);
}

// ---- datum v dotazu hledání (lib/hledani.ts) ----
function testyDatum({ eq }: Testy) {
  const dnes = '2026-10-13'; // úterý
  eq('„včera"', datumZDotazu('včera', dnes), '2026-10-12');
  eq('„vcera" bez háčku', datumZDotazu('vcera', dnes), '2026-10-12');
  eq('„dnes"', datumZDotazu('Dnes', dnes), '2026-10-13');
  eq('„předevčírem"', datumZDotazu('předevčírem', dnes), '2026-10-11');
  eq('„pátek" = poslední pátek', datumZDotazu('pátek', dnes), '2026-10-09');
  eq('„pá" zkratka', datumZDotazu('pá', dnes), '2026-10-09');
  eq('„úterý" = dnešek (dnes je úterý)', datumZDotazu('úterý', dnes), '2026-10-13');
  eq('„3.10." letos (je v minulosti)', datumZDotazu('3.10.', dnes), '2026-10-03');
  eq('„3. 10." s mezerou', datumZDotazu('3. 10.', dnes), '2026-10-03');
  eq('„24.12." by bylo v budoucnu → loni', datumZDotazu('24.12.', dnes), '2025-12-24');
  eq('„3.10.2025" s rokem', datumZDotazu('3.10.2025', dnes), '2025-10-03');
  eq('ISO „2026-10-03"', datumZDotazu('2026-10-03', dnes), '2026-10-03');
  eq('„31.2." není den', datumZDotazu('31.2.', dnes), null);
  eq('obyčejné slovo není den', datumZDotazu('latte', dnes), null);
  eq('„po termínu" není pondělí', datumZDotazu('po termínu', dnes), null);
  eq('anglicky „yesterday"', datumZDotazu('yesterday', dnes), '2026-10-12');
  eq('německy „Freitag"', datumZDotazu('Freitag', dnes), '2026-10-09');
  eq('polsky „wczoraj"', datumZDotazu('wczoraj', dnes), '2026-10-12');
  eq('prázdný dotaz', datumZDotazu('', dnes), null);
}
