// Identifikace provozovatele v aplikaci (§ 435 OZ): Nastavení → O aplikaci a Moje → Účet a soukromí.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { firma, identifikace } from '../../lib/firma.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ ok }: Testy) {
  const k = cti('components/pravni/ProvozovatelInfo.tsx');
  ok('komponenta: věta z lib/firma.ts a právní odkazy (vč. Podpory)', /identifikace\(f, jazyk\)/.test(k) && /firma\(\{\}\)/.test(k) && /<PravniOdkazy/.test(k));
  ok('věta nese jméno, IČO, sídlo, zápis a DPH', [/Martin Nemeškal/, /IČO 17944953/, /Javorník/, /živnostenském rejstříku/, /Neplátce DPH/].every(r => r.test(identifikace(firma({})))));
  ok('Nastavení → O aplikaci', /<ProvozovatelInfo/.test(cti('components/Settings.tsx')));
  ok('Managero client → Moje (účet hosta)', /<ProvozovatelInfo/.test(cti('components/client/UcetHosta.tsx')));
}
