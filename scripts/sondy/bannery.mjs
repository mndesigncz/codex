// Kolo 74 — promo bannery na stránce podniku (karusel nahoře).
// Ruční sonda (MIMO v spust.mjs): API podvrhuje, banner přidává do fixtury podniku.
// Tvrdí, že na 390 i 1280 px stránka nescrolluje do strany, že je vidět právě jeden
// banner, že tlačítka předchozí/další a tečky přepínají, že odkaz ven je https s
// rel noopener, že se pod „méně pohybu“ banner sám neotáčí a nemá tlačítko pauzy,
// a že bez bannerů se karusel nevykreslí.
//   SONDY_ZAKLAD=http://localhost:3414 node scripts/sondy/bannery.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const fix = JSON.parse(readFileSync(DIR + 'client_b_kavarna-u-lipy.json', 'utf8'));
let fails = 0;
const tvrdi = (popis, ok, co = '') => { console.log(`${ok ? '✓' : '✗'} ${popis}${ok ? '' : '  ← ' + co}`); if (!ok) fails++; };

const BANNERY = [
  { id: 1, title: 'Páteční degustace čajů', text: 'Každý pátek od 18:00 ochutnáme tři nové sklizně.', imageUrl: null, linkKind: 'menu', linkRef: null },
  { id: 2, title: 'Dvojnásobné body o víkendu', text: 'Sobota a neděle: body za útratu navíc. Velmi dlouhý text, který se musí zalomit a nesmí roztáhnout stránku do šířky ani na úzkém telefonu.', imageUrl: null, linkKind: 'coupon', linkRef: null },
  { id: 3, title: 'Nový web podniku', text: 'Podívej se, co je u nás nového.', imageUrl: null, linkKind: 'url', linkRef: 'https://example.com/novinky' },
];

const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

async function otevri(sirka, { banners = BANNERY, mene = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: sirka, height: 900 }, locale: 'cs-CZ', reducedMotion: mene ? 'reduce' : 'no-preference' });
  await ctx.route('**/api/**', route => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/api/client/b/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...fix, banners }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/client/kavarna-u-lipy`, { waitUntil: 'networkidle' });
  await p.waitForSelector('h1');
  return { ctx, p };
}
const viditelne = (p) => p.$$eval('[data-banner]', els => els.filter(e => !e.hidden && e.offsetParent !== null).map(e => e.getAttribute('data-banner')));
const scrollX = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const sirka of [390, 1280]) {
  const { ctx, p } = await otevri(sirka);
  const k = p.getByRole('region', { name: 'Oznámení podniku' });
  tvrdi(`${sirka}: karusel je vidět`, await k.count() === 1);
  tvrdi(`${sirka}: vidět je jen první banner`, JSON.stringify(await viditelne(p)) === '["1"]', JSON.stringify(await viditelne(p)));
  tvrdi(`${sirka}: bez vodorovného scrollu`, (await scrollX(p)) <= 0, String(await scrollX(p)));
  await p.getByRole('button', { name: 'Další oznámení' }).click();
  tvrdi(`${sirka}: další → druhý`, JSON.stringify(await viditelne(p)) === '["2"]');
  tvrdi(`${sirka}: dlouhý text nepřetéká`, (await scrollX(p)) <= 0);
  await p.getByRole('button', { name: 'Další oznámení' }).click();
  const odkaz = p.locator('[data-banner="3"] a');
  tvrdi(`${sirka}: odkaz ven je https s rel`, (await odkaz.getAttribute('href')) === 'https://example.com/novinky' && /noopener/.test((await odkaz.getAttribute('rel')) ?? ''));
  await p.getByRole('button', { name: 'Další oznámení' }).click();
  tvrdi(`${sirka}: za posledním zpět na první`, JSON.stringify(await viditelne(p)) === '["1"]');
  await p.getByRole('button', { name: 'Předchozí oznámení' }).click();
  tvrdi(`${sirka}: předchozí z prvního na poslední`, JSON.stringify(await viditelne(p)) === '["3"]');
  await p.getByRole('button', { name: 'Oznámení 2 z 3' }).click();
  tvrdi(`${sirka}: tečka přepíná`, JSON.stringify(await viditelne(p)) === '["2"]');
  // Banner „kupon“ přepne záložku na Věrnost.
  await p.locator('[data-banner="2"]').getByRole('button', { name: 'Ukázat kupony' }).click();
  await p.waitForTimeout(300);
  tvrdi(`${sirka}: odkaz na kupony otevře Věrnost`, await p.getByRole('tab', { name: /Věrnost/ }).getAttribute('aria-selected') === 'true');
  await p.screenshot({ path: new URL(`./shots/bannery-${sirka}.png`, import.meta.url).pathname }).catch(() => {});
  await ctx.close();
}

// Méně pohybu: žádné automatické otáčení, žádné tlačítko pauzy.
{
  const { ctx, p } = await otevri(390, { mene: true });
  await p.waitForTimeout(8500);
  tvrdi('méně pohybu: banner se sám neotočil', JSON.stringify(await viditelne(p)) === '["1"]', JSON.stringify(await viditelne(p)));
  tvrdi('méně pohybu: bez tlačítka pauzy', await p.getByRole('button', { name: /Pozastavit|Přehrávat/ }).count() === 0);
  await ctx.close();
}
// Bez omezení pohybu se otáčí a jde pozastavit.
{
  const { ctx, p } = await otevri(390);
  await p.getByRole('button', { name: 'Pozastavit' }).click();
  await p.waitForTimeout(8000);
  tvrdi('pauza: po pozastavení se neotáčí', JSON.stringify(await viditelne(p)) === '["1"]');
  await p.getByRole('button', { name: 'Přehrávat' }).click();
  await p.mouse.move(0, 0);
  await p.waitForTimeout(8000);
  tvrdi('po spuštění se banner sám otočí', JSON.stringify(await viditelne(p)) === '["2"]', JSON.stringify(await viditelne(p)));
  await ctx.close();
}
// Jediný banner: žádné ovládání. Žádný banner: žádný karusel.
{
  const { ctx, p } = await otevri(390, { banners: [BANNERY[0]] });
  tvrdi('jeden banner: bez tlačítek dalšího', await p.getByRole('button', { name: 'Další oznámení' }).count() === 0);
  tvrdi('jeden banner: je vidět', JSON.stringify(await viditelne(p)) === '["1"]');
  await ctx.close();
}
{
  const { ctx, p } = await otevri(390, { banners: [] });
  tvrdi('bez bannerů: karusel není', await p.getByRole('region', { name: 'Oznámení podniku' }).count() === 0);
  await ctx.close();
}
await b.close();
console.log(fails ? `\n${fails} selhání` : '\nVše v pořádku.');
process.exit(fails ? 1 : 0);
