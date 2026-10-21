// IČO u objednávky předplatného (B2B, OP čl. 1): pole v pokladně Stripe, kontrola mod 11, uložení z webhooku.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { poleIcoPokladny, icoZPokladny, platneIco, fakturacniPoleIco, KLIC_POLE_ICO } from '../../lib/icoPokladna.ts';
import { icoMaPlatnouKontrolu } from '../../lib/podnikProfil.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // Kontrolní součet modulo 11 (váhy 8…2): skutečná IČO z ARES.
  ok('mod 11: platná IČO', ['17944953', '27082440', '00006947', '25596641', '45274649'].every(icoMaPlatnouKontrolu));
  ok('mod 11: překlep v jedné číslici neprojde', !icoMaPlatnouKontrolu('17944954') && !icoMaPlatnouKontrolu('27082441') && !icoMaPlatnouKontrolu('1794495') && !icoMaPlatnouKontrolu('abcdefgh'));
  eq('platneIco: mezery pryč, neplatné null', [platneIco('179 449 53'), platneIco('17944954'), platneIco(''), platneIco(null)], ['17944953', null, null, null]);

  const p = poleIcoPokladny('17944953', 'cs');
  ok('pole: povinné, číselné, přesně 8 číslic, předvyplněné', p.key === KLIC_POLE_ICO && p.optional === false && p.type === 'numeric' && p.numeric?.minimum_length === 8 && p.numeric?.maximum_length === 8 && p.numeric?.default_value === '17944953');
  ok('pole: bez IČO v profilu nepředvyplněné', poleIcoPokladny(null).numeric?.default_value === undefined && poleIcoPokladny('12345678').numeric?.default_value === undefined);
  ok('pole: popisek do 50 znaků, anglicky mimo cs/sk', p.label.custom.length <= 50 && /IČO/.test(p.label.custom) && /Company ID/.test(poleIcoPokladny(null, 'de').label.custom));

  eq('z pokladny: platné', icoZPokladny([{ key: 'jine', text: { value: 'x' } }, { key: 'ico', numeric: { value: '27082440' } }]), { ico: '27082440', zadano: '27082440' });
  eq('z pokladny: neplatný součet = zadáno, ale neuložit', icoZPokladny([{ key: 'ico', numeric: { value: '27082441' } }]), { ico: null, zadano: '27082441' });
  eq('z pokladny: krátké se nedoplňuje nulami', icoZPokladny([{ key: 'ico', numeric: { value: '6947' } }]).ico, null);
  eq('z pokladny: bez pole', icoZPokladny(null), { ico: null, zadano: null });
  eq('faktura: pole IČO', fakturacniPoleIco('17944953'), [{ name: 'IČO', value: '17944953' }]);

  const b = cti('lib/billing.ts');
  ok('pokladna: custom_fields s IČO', /custom_fields: \[poleIcoPokladny\(icoPodniku, jazyk\)\]/.test(b));
  ok('pokladna: IČO z profilu jde na fakturu předem', /nastavPatickuFaktury\(s, customer, icoPodniku\)/.test(b) && /custom_fields: fakturacniPoleIco\(ico\)/.test(b));
  ok('webhook: checkout.session.completed ukládá IČO', /case 'checkout\.session\.completed'[\s\S]{0,200}ulozIcoZPokladny\(s, session\)/.test(b) && /UPDATE teams SET ico = \$\{ico\}/.test(b));
  ok('webhook: název firmy do jména zákazníka', /customer_details\?\.business_name/.test(b));
  ok('historie změn: popisky', /'billing\.ico':/.test(cti('lib/auditPopisky.ts')) && /'billing\.ico_neplatne':/.test(cti('lib/auditPopisky.ts')));
  ok('OP čl. 1: objednat smí jen podnikatel a uvede IČO', /Placený tarif smí objednat jen podnikatel: v pokladně uvede své IČO/.test(cti('lib/pravni/dokumenty/obchodniPodminky.ts')));
}
