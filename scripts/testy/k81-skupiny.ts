// Kolo 81 — kombinace segmentů v publiku zpráv a doplňky skupin (archiv, přidání z CSV).
// Čisté funkce z lib/skupinyPravidla.ts, plus kontrola zapojení. Údaje skupiny, dynamická pravidla a
// filtry členů testuje k81-clenove.ts.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { ctiKombinaci, zapisKombinaci, sloucMnoziny, stitekKombinace, platnaCast } from '../../lib/skupinyPravidla.ts';
import { jePlatnePublikum } from '../../lib/zpravyPravidla.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
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

  // ---- publikum zprávy ----
  ok('publikum: kombinace je platné publikum zprávy, nesmyslná ne', jePlatnePublikum('mix:and|quiet:60|!tier:gold') && jePlatnePublikum('mix:or|quiet|group:3') && !jePlatnePublikum('mix:and|quiet') && !jePlatnePublikum('kdykoli'));

  // ---- zapojení ----
  const groups = precti('app/api/client/admin/groups/route.ts');
  ok('API skupin: změny jen s oprávněním skupin', (groups.match(/pozaduj\('zakaznici\.skupiny'\)/g) ?? []).length >= 3);
  ok('API skupin: archiv jde přes PATCH a zapisuje se do historie', groups.includes("typeof b.archived === 'boolean'") && groups.includes("'client.group'"));
  const imp = precti('app/api/client/admin/groups/import/route.ts');
  ok('import do skupiny: potřebuje i kontakty (jinak by šlo hádat e-maily)', imp.includes("'zakaznici.kontakty'"));
  ok('import do skupiny: bez potvrzení jen náhled, zápis jde do historie změn', imp.includes('b.potvrdit === true') && imp.includes("'client.skupina.import'"));
  const broadcasts = precti('lib/broadcasts.ts');
  ok('zprávy: blokovaní se z publika vyřazují', broadcasts.includes('blokovaniIds'));
  ok('zprávy: archivované skupiny se v nabídce publika neukazují', precti('app/api/client/admin/broadcast/route.ts').includes('.filter(g => !g.archived)'));
  const init = precti('app/api/init/route.ts');
  ok('schéma: archiv skupin je v init', init.includes('client_groups ADD COLUMN IF NOT EXISTS archived BOOLEAN'));
}
