// Kolo 81 — skupiny členů: údaje (název, popis, barva), dynamická pravidla a kombinace podmínek.
// Čisté funkce z lib/skupinyPravidla.ts, plus kontrola, že API skupin je opravdu zapojené (oprávnění, audit, archiv).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  overMetaSkupiny, overPravidloSkupiny, ctiKombinaci, zapisKombinaci, sloucMnoziny, stitekKombinace, platnaCast, popisPravidlaSkupiny,
  jeBarvaSkupiny, jeRucniAktivni, MAX_NAZEV_SKUPINY, MAX_POPIS_SKUPINY, BARVY_SKUPIN,
} from '../../lib/skupinyPravidla.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- údaje skupiny ----
  const m1 = overMetaSkupiny({ name: '  Štam   gasti ', description: ' Chodí denně ', color: '3' });
  ok('meta: název se zhutní a ořízne', m1.ok && m1.meta.name === 'Štam gasti');
  ok('meta: popis a barva projdou', m1.ok && m1.meta.description === 'Chodí denně' && m1.meta.color === '3');
  eq('meta: prázdný název je chyba', overMetaSkupiny({ name: '   ' }), { ok: false, error: 'Zadej název skupiny.' });
  eq('meta: neznámá barva je chyba', overMetaSkupiny({ name: 'A', color: '9' }).ok, false);
  const m2 = overMetaSkupiny({ color: '' }, { name: 'Stará', description: 'Popis', color: '2' });
  ok('meta: PATCH jen s barvou nepřepíše název ani popis, prázdná barva ji zruší', m2.ok && m2.meta.name === 'Stará' && m2.meta.description === 'Popis' && m2.meta.color === null);
  const m3 = overMetaSkupiny({ name: 'x'.repeat(200), description: 'y'.repeat(500) });
  ok('meta: délky se ořežou na limit', m3.ok && m3.meta.name.length === MAX_NAZEV_SKUPINY && (m3.meta.description ?? '').length === MAX_POPIS_SKUPINY);
  ok('meta: popis lze smazat prázdným řetězcem', (() => { const r = overMetaSkupiny({ description: '' }, { name: 'A', description: 'Starý' }); return r.ok && r.meta.description === null; })());
  eq('barvy: šest, 1 až 6', BARVY_SKUPIN.map(b => b.id), ['1', '2', '3', '4', '5', '6']);
  ok('barva: 0 a 7 neplatí', !jeBarvaSkupiny('0') && !jeBarvaSkupiny('7') && jeBarvaSkupiny('6'));

  // ---- zápis kombinace ----
  eq('kombinace: zápis', zapisKombinaci('and', ['quiet:60', '!tier:gold']), 'mix:and|quiet:60|!tier:gold');
  eq('kombinace: čtení and se zápornou částí', ctiKombinaci('mix:and|quiet:60|!tier:gold'), { rezim: 'and', casti: ['quiet:60', '!tier:gold'] });
  eq('kombinace: čtení or', ctiKombinaci('mix:or|birthday:month|near:stamps'), { rezim: 'or', casti: ['birthday:month', 'near:stamps'] });
  eq('kombinace: jedna část nestačí', ctiKombinaci('mix:and|quiet'), null);
  eq('kombinace: šest částí je moc', ctiKombinaci('mix:or|quiet|quiet:60|quiet:90|birthday:month|near:stamps|near:points'), null);
  eq('kombinace: duplicita se odmítne', ctiKombinaci('mix:or|quiet|quiet'), null);
  eq('kombinace: or nesmí mít „kromě“', ctiKombinaci('mix:or|quiet|!tier:gold'), null);
  eq('kombinace: and jen ze záporných částí nedává smysl', ctiKombinaci('mix:and|!quiet|!tier:gold'), null);
  eq('kombinace: neznámá část', ctiKombinaci('mix:and|quiet|nesmysl'), null);
  eq('kombinace: neznámý režim', ctiKombinaci('mix:xor|quiet|tier:gold'), null);
  eq('kombinace: skupina jen když se povolí', [ctiKombinaci('mix:and|quiet|group:3'), ctiKombinaci('mix:and|quiet|group:3', { skupiny: true })?.casti], [null, ['quiet', 'group:3']]);
  ok('část: segment, úroveň a skupina', platnaCast('quiet:90') && platnaCast('tier:platinum') && !platnaCast('group:1') && platnaCast('group:1', { skupiny: true }) && !platnaCast('group:abc', { skupiny: true }));

  // ---- spojení množin ----
  const A = { cast: 'quiet', ids: [1, 2, 3, 4] }, B = { cast: 'tier:gold', ids: [3, 4, 5] }, Z = { cast: '!near:stamps', ids: [4] };
  eq('množiny: and je průnik', sloucMnoziny('and', [A, B]), [3, 4]);
  eq('množiny: and s „kromě“ odebere záporné', sloucMnoziny('and', [A, B, Z]), [3]);
  eq('množiny: or je sjednocení bez duplicit', sloucMnoziny('or', [A, B]).sort(), [1, 2, 3, 4, 5]);
  eq('množiny: and bez kladné části nedá nikoho', sloucMnoziny('and', [Z]), []);
  eq('množiny: prázdný průnik', sloucMnoziny('and', [A, { cast: 'birthday:month', ids: [9] }]), []);

  // ---- popisky ----
  ok('popisek: kombinace česky', stitekKombinace({ rezim: 'and', casti: ['quiet:60', '!tier:gold'] }).includes('ne zlatí hosté') && stitekKombinace({ rezim: 'and', casti: ['quiet:60', '!tier:gold'] }).includes('zároveň'));
  ok('popisek: or říká „nebo“', stitekKombinace({ rezim: 'or', casti: ['quiet', 'birthday:month'] }).includes(' nebo '));
  ok('popisek: skupina se jménem', stitekKombinace({ rezim: 'or', casti: ['group:3', 'quiet'] }, { 3: 'Štamgasti' }).includes('Štamgasti'));
  eq('pravidlo skupiny: bez pravidla', popisPravidlaSkupiny(null), null);
  ok('pravidlo skupiny: jedna podmínka', (popisPravidlaSkupiny('quiet:60') ?? '').startsWith('Dynamická: '));
  ok('pravidlo skupiny: kombinace', (popisPravidlaSkupiny('mix:and|quiet|tier:gold') ?? '').includes('zároveň'));

  // ---- ověření pravidla z těla požadavku ----
  eq('pravidlo: prázdné = ruční skupina', overPravidloSkupiny(''), { ok: true, rule: null });
  eq('pravidlo: jedna podmínka', overPravidloSkupiny('near:points'), { ok: true, rule: 'near:points' });
  eq('pravidlo: kombinace', overPravidloSkupiny('mix:or|quiet|birthday:month'), { ok: true, rule: 'mix:or|quiet|birthday:month' });
  eq('pravidlo: odkaz na skupinu se odmítne (žádné smyčky)', overPravidloSkupiny('group:3').ok, false);
  eq('pravidlo: kombinace s odkazem na skupinu se odmítne', overPravidloSkupiny('mix:and|quiet|group:3').ok, false);
  eq('pravidlo: nesmysl se odmítne', overPravidloSkupiny('kdykoli').ok, false);
  ok('ruční aktivní: bez pravidla a bez archivu', jeRucniAktivni({ rule: null, archived: false }) && !jeRucniAktivni({ rule: 'quiet' }) && !jeRucniAktivni({ archived: true }));

  // ---- zapojení API ----
  const groups = precti('app/api/client/admin/groups/route.ts');
  ok('API skupin: změny jen s oprávněním skupin', (groups.match(/pozaduj\('zakaznici\.skupiny'\)/g) ?? []).length >= 3);
  ok('API skupin: přejmenování, popis, barva, archiv a pravidlo jdou přes PATCH', ['overMetaSkupiny', 'archived', 'overPravidloSkupiny'].every(x => groups.includes(x)));
  ok('API skupin: změny se zapisují do historie', groups.includes("'client.skupina'"));
  ok('API skupin: dynamická skupina nemá ruční členy ani slevu', groups.includes('Členy dynamické skupiny počítá pravidlo') && groups.includes('Dynamická skupina nemůže mít slevu'));
  ok('API skupin: export členů do CSV', groups.includes("format') === 'csv'") || groups.includes("'csv'"));
  const imp = precti('app/api/client/admin/groups/import/route.ts');
  ok('import do skupiny: potřebuje i kontakty (jinak by šlo hádat e-maily)', imp.includes("'zakaznici.kontakty'"));
  ok('import do skupiny: bez potvrzení jen náhled', imp.includes('b.potvrdit === true'));
  const broadcasts = precti('lib/broadcasts.ts');
  ok('zprávy: dynamická skupina se řeší pravidlem', broadcasts.includes('idsPodlePravidla'));
  ok('zprávy: blokovaní se z publika vyřazují', broadcasts.includes('blokovaniIds'));
  const kupony = precti('lib/coupons.ts');
  ok('kupony: cílení na dynamickou skupinu se vyhodnotí pravidlem', kupony.includes('idsPodlePravidla'));
  const init = precti('app/api/init/route.ts');
  ok('schéma: sloupce skupin jsou v init', ['description TEXT', 'color TEXT', 'archived BOOLEAN', 'rule TEXT'].every(x => init.includes(`client_groups ADD COLUMN IF NOT EXISTS ${x}`)));
}
