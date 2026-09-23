// Tok registrace → pokladna. Databáze ani klíče Stripu tu nejsou, takže se
// /api/register a /api/billing/checkout podstrčí. Přihlášení se zkouší
// v obou stavech: když projde i když ne — druhý případ nesmí skončit
// pokladnou, která vrátí 401.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

const pripady = [
  ['Max ročně, přihlášení projde', '/register?plan=max&interval=year', true,  true],
  ['Pro měsíčně, přihlášení projde', '/register?plan=pro',              true,  true],
  ['Max, přihlášení selže',        '/register?plan=max&interval=year', false, false],
  ['tarif Zdarma',                 '/register?plan=free',              true,  false],
];

for (const [jm, url, prihlaseniProjde, cekamPokladnu] of pripady) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 1000 } });
  let checkout = null;
  await ctx.route('**/api/register', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ joinCode: 'ABCD12' }) }));
  if (prihlaseniProjde) {
    await ctx.route('**/api/auth/callback/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'http://localhost:3000/' }) }));
  }
  await ctx.route('**/api/billing/checkout', async r => {
    checkout = JSON.parse(r.request().postData() || '{}');
    return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Platby zatím nejsou nastavené.' }) });
  });
  const p = await ctx.newPage();
  const chyby = []; p.on('pageerror', e => chyby.push(String(e).slice(0, 140)));
  await p.goto('http://localhost:3000' + url, { waitUntil: 'networkidle' });
  for (const [id, v] of [['#reg-jmeno','Jan Novák'],['#reg-podnik','Kavárna U Lípy'],['#reg-email','jan@priklad.cz'],['#reg-heslo','tajneheslo1'],['#reg-heslo-znovu','tajneheslo1']]) await p.fill(id, v);
  await p.getByRole('button', { name: 'Vytvořit podnik' }).click();
  await p.waitForTimeout(2500);

  const kod = await p.locator('text=ABCD12').count() > 0;
  const dialog = await p.getByRole('dialog').count() > 0;
  const nahrada = await p.locator('text=přihlášení neproběhlo').count() > 0;
  const sedi = dialog === cekamPokladnu;
  console.log(`${sedi ? '✓' : '✗'} ${jm}`);
  console.log(`    kód týmu: ${kod ? 'ano' : 'NE'} · pokladna: ${dialog ? 'ano' : 'ne'} (čekáno ${cekamPokladnu ? 'ano' : 'ne'})`);
  if (checkout) console.log(`    checkout: ${JSON.stringify(checkout)}`);
  if (!prihlaseniProjde) console.log(`    náhradní hláška místo rozbité pokladny: ${nahrada ? 'ano ✓' : 'NE ✗'}`);
  if (chyby.length) console.log(`    CHYBY: ${chyby.join(' | ')}`);
  await ctx.close();
}
await b.close();
