// K88 — provozní minimum před spuštěním: kontrola zdraví nikdy neprozradí hodnoty proměnných,
// podpisy odkazů na ostrém nasazení bez tajemství selžou (žádná veřejně známá náhradní hodnota).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { stavNastaveni, POVINNE } from '../../lib/zdravi.ts';
import { podpisoveTajemstvi } from '../../lib/tajemstvi.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default async function ({ eq, ok }: Testy) {
  const prazdne = stavNastaveni({});
  eq('zdraví: bez prostředí chybí všechny povinné', prazdne.povinneChybi, [...POVINNE]);
  eq('zdraví: bez prostředí žádná funkce', Object.values(prazdne.funkce).some(Boolean), false);
  const plne = stavNastaveni({
    DATABASE_URL: 'postgres://x', NEXTAUTH_SECRET: 'tajne-heslo-123', NEXTAUTH_URL: 'https://a', NEXT_PUBLIC_APP_URL: 'https://a', CRON_SECRET: 'c',
    RESEND_API_KEY: 're_x', EMAIL_FROM: 'a@b.cz',
  });
  eq('zdraví: povinné vyplněné', plne.povinneChybi, []);
  eq('zdraví: e-mail zapnutý', plne.funkce.email, true);
  eq('zdraví: platby vypnuté', plne.funkce.platby, false);
  ok('zdraví: výstup neobsahuje hodnoty', !JSON.stringify(plne).includes('tajne-heslo-123'));
  eq('zdraví: mezery = nevyplněno', stavNastaveni({ DATABASE_URL: '  ' }).povinneChybi.includes('DATABASE_URL'), true);

  eq('tajemství: z prostředí', podpisoveTajemstvi({ NEXTAUTH_SECRET: 'abc' }), 'abc');
  let spadlo = false;
  try { podpisoveTajemstvi({ VERCEL_ENV: 'production' }); } catch { spadlo = true; }
  eq('tajemství: ostré nasazení bez NEXTAUTH_SECRET selže', spadlo, true);
  ok('tajemství: vývoj má náhradní hodnotu', podpisoveTajemstvi({}).length > 0);
  for (const f of ['lib/zpravyEmail.ts', 'lib/clientOrders.ts']) {
    ok(`tajemství: ${f} nemá náhradní 'managero'`, !/NEXTAUTH_SECRET \|\| 'managero'/.test(zdroj(f)));
  }
  ok('health: veřejná routa nečte hodnoty proměnných do odpovědi', !/process\.env\.[A-Z_]+\s*[,}]/.test(zdroj('app/api/health/route.ts').replace(/process\.env\.(VERCEL_GIT_COMMIT_SHA|VERCEL_ENV|NODE_ENV|DATABASE_URL)/g, '')));
}
