// Zámek aplikace Face ID / otiskem (spuštění, balík S): přepínač jen v obalu, nastavení přes most.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ ok }: Testy) {
  const z = cti('components/ucet/ZamekAplikace.tsx');
  ok('jen v nativním obalu a jen s dostupnou biometrikou', /if \(!jeNativni\(\)\) return;/.test(z) && /if \(!dostupny\) return null;/.test(z) && /most\.zamek\.dostupny\(\)/.test(z));
  ok('stav i změna jdou přes most (nastav ověří biometriku)', /most\.zamek\.zapnuto\(\)/.test(z) && /most\?\.zamek\.nastav\(v\)/.test(z));
  ok('nepovedené ověření přepínač nepřepne', /if \(ok\) setZapnuto\(v\);/.test(z));
  const most = cti('components/NativeBridge.tsx');
  ok('most: zapnutí nejdřív ověří (nikdo se nezamkne ven bez Face ID/kódu)', /if \(!BA \|\| !\(await BA\.checkBiometry\(\)\)\.isAvailable\) return false;/.test(most));
  ok('Nastavení → Zabezpečení má kartu zámku', /<ZamekAplikace obal="karta" \/>/.test(cti('components/Settings.tsx')));
  ok('účet hosta má řádek zámku', /<ZamekAplikace \/>/.test(cti('components/client/UcetHosta.tsx')));
}
