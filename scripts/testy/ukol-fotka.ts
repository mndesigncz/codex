// Fotka jako důkaz splnění (hlášení z produkce: „U úkolů, kde je potřeba fotka pro
// dokončení, fotka nejde nahrát.").
//
// Okno Přilož fotku (úkoly), Zapsat navíc (úkoly za body „jen s fotkou") a doklady
// k uzávěrce posílaly vybranou fotku přes lib/clientImage.compressImage, který obrázek,
// jenž prohlížeč neumí přečíst (HEIC z iPhonu v Chromu, Edgi, Firefoxu), poslal
// NEZMENŠENÝ: přes 4,5 MB ho Vercel odmítl holým textem 413 a okno ukázalo „Server
// odpověděl 413.", menší se nahrál, ale náhled i fotka v detailu úkolu byly rozbité
// (server HEIC vydává jako přílohu ke stažení). Teď jde fotka přes lib/nahrajFotku:
// zobrazitelný JPEG, nečitelná fotka se odmítne srozumitelnou větou, nic se nepošle.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { postupFotky, poNeprectene, ZOBRAZITELNE_FOTKY, FOTKA_BEZ_PREVODU_DO, povolenyTyp } from '../../lib/nahravaniPravidla.ts';
import { statusMessage } from '../../lib/api.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const MB = 1024 * 1024;

export default function ({ eq, ok }: Testy) {
  // ---- 1) Co s vybranou fotkou před nahráním ----
  eq('fotka: malý JPEG z fotoaparátu jde beze změny', postupFotky('image/jpeg', 400 * 1024), 'poslat');
  eq('fotka: malé PNG i WebP beze změny', [postupFotky('image/png', 1000), postupFotky('image/webp', 1000)], ['poslat', 'poslat']);
  eq('fotka: hranice 900 kB ještě beze změny', postupFotky('image/jpeg', FOTKA_BEZ_PREVODU_DO), 'poslat');
  eq('fotka: 8 MB JPEG z telefonu se převede (zmenší)', postupFotky('image/jpeg', 8 * MB), 'prevest');
  eq('fotka: HEIC z iPhonu se převede vždy, i malý', [postupFotky('image/heic', 300 * 1024), postupFotky('image/heif', 3 * MB)], ['prevest', 'prevest']);
  eq('fotka: AVIF (starší Safari ho neukáže) se převede', postupFotky('image/avif', 1000), 'prevest');
  eq('fotka: soubor bez typu (některé Androidy) se zkusí převést', postupFotky('', 1000), 'prevest');
  eq('fotka: typ s parametrem a velkými písmeny se pozná', postupFotky('IMAGE/JPEG; charset=binary', 1000), 'poslat');
  ok('fotka: zobrazitelné jsou jen formáty, které ukáže každý prohlížeč', [...ZOBRAZITELNE_FOTKY].sort().join() === 'image/gif,image/jpeg,image/png,image/webp');

  // ---- 2) Prohlížeč fotku nepřečetl ----
  eq('nečitelná: HEIC v Chromu se odmítne (dřív odešel nezmenšený a skončil na 413)', poNeprectene('image/heic'), 'odmitnout');
  eq('nečitelná: soubor bez typu se odmítne', poNeprectene(''), 'odmitnout');
  eq('nečitelná: JPEG, který canvas nepřečetl, se pošle, jak je (server rozhodne)', poNeprectene('image/jpeg'), 'poslat');
  // Server HEIC dál přijímá (chat, účtenky) — vadil jen důkaz, který pak nikdo neuvidí.
  eq('server: HEIC do úložiště smí (jiná místa ho posílají jako soubor)', povolenyTyp('IMG_0001.heic', 'image/heic'), 'image/heic');

  // ---- 3) Holé 413 od Vercelu má srozumitelnou větu ----
  eq('413: místo „Server odpověděl 413." věta o velikosti', statusMessage(413), 'Soubor je na nahrání moc velký.');

  // ---- 4) Všechna místa s povinnou fotkou jdou přes lib/nahrajFotku ----
  const pomocnik = zdroj('lib/nahrajFotku.ts');
  ok('nahrajFotku: převod přes pripravFotku a nahrání přes nahrajSoubor (velká fotka přímo do úložiště, ne 413)',
    /pripravFotku\(soubor\)/.test(pomocnik) && /nahrajSoubor\(fotka/.test(pomocnik) && /throw new NecitelnaFotka/.test(pomocnik));
  for (const soubor of ['components/ukoly/PrilozFoto.tsx', 'components/navic/ZapsatNavic.tsx', 'components/employee/CashClosing.tsx']) {
    const s = zdroj(soubor);
    ok(`${soubor}: fotka jde přes nahrajFotku, ne přímým POST /api/upload s compressImage`,
      /nahrajFotku\(soubor\)/.test(s) && !/fetch\('\/api\/upload'/.test(s) && !/compressImage/.test(s));
    ok(`${soubor}: nečitelná fotka má vlastní srozumitelnou hlášku`, /instanceof NecitelnaFotka/.test(s) && s.includes('HEIC z iPhonu'));
  }
  ok('PrilozFoto: náhled, který se nenačte, fotku zahodí a řekne to (dřív rozbitý obrázek a „Označit jako hotový" aktivní)',
    /onError=\{\(\) => \{ setUrl\(null\); setChyba\(/.test(zdroj('components/ukoly/PrilozFoto.tsx')));
  ok('ZapsatNavic: chyba fotky u tlačítka fotky (role=alert), ne pod polem s textem',
    /setChybaFotky\(e instanceof NecitelnaFotka/.test(zdroj('components/navic/ZapsatNavic.tsx')));
  const obraz = zdroj('lib/clientImage.ts');
  ok('clientImage: když createImageBitmap selže, zkusí se přečíst přes <img> (img.decode)', /createImageBitmap\(file\)/.test(obraz) && /img\.decode\(\)/.test(obraz));
}
