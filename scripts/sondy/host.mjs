// Hostovská stránka podniku: co uvidí zákazník, když podnik neexistuje,
// a co uvidí, když mu vypadne připojení. Jsou to dvě různé věci.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const OUT = new URL('./shots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const problems = []; const ok = m => console.log('  ✓', m); const bad = m => { console.log('  ✗', m); problems.push(m); };

async function otevri(stav) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ' });
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/client/b/')) {
      if (stav === '404') return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"nenalezeno"}' });
      if (stav === 'vypadek') return route.abort('internetdisconnected');
      if (stav === '500') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"server"}' });
    }
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  const p = await ctx.newPage();
  const r = await p.goto('http://localhost:3000/client/cafe-am-ring', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1800);
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim();
  return { ctx, p, status: r?.status(), t };
}

console.log('Podnik, který opravdu neexistuje:');
{
  const { ctx, p, t } = await otevri('404');
  /Podnik tu není/.test(t) ? ok('řekne, že podnik tu není') : bad('nic srozumitelného: ' + t.slice(0, 160));
  /Zpět na podniky/.test(t) ? ok('nabízí cestu zpět') : bad('bez cesty dál');
  await p.screenshot({ path: `${OUT}host-404.png` });
  await ctx.close();
}

console.log('Zákazníkovi vypadlo připojení:');
{
  const { ctx, p, t } = await otevri('vypadek');
  !/Podnik tu není/.test(t) ? ok('netvrdí, že podnik neexistuje') : bad('výpadek sítě vydává za neexistující podnik');
  /(nenačet|připojení|Zkusit znovu)/i.test(t) ? ok('mluví o spojení a nabízí zkusit znovu') : bad('o výpadku mlčí: ' + t.slice(0, 160));
  await p.screenshot({ path: `${OUT}host-vypadek.png` });
  await ctx.close();
}

console.log('Server odpověděl chybou:');
{
  const { ctx, p, t } = await otevri('500');
  !/Podnik tu není/.test(t) ? ok('netvrdí, že podnik neexistuje') : bad('chybu serveru vydává za neexistující podnik');
  await p.screenshot({ path: `${OUT}host-500.png` });
  await ctx.close();
}

console.log(problems.length ? `\nPROBLÉMŮ: ${problems.length}` : '\nVšechno prošlo.');
await b.close();
