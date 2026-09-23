import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let fails = 0;
const tvrdi = (p, ok, co='') => { console.log(`${ok?'✓':'✗'} ${p}${ok?'':'  ← '+co}`); if(!ok) fails++; };
// 1) hlavička CSP bez unsafe-eval
const r = await fetch('http://localhost:3000/login'); const csp = r.headers.get('content-security-policy') ?? '';
tvrdi('CSP v produkci bez unsafe-eval', !csp.includes('unsafe-eval'), csp.slice(0,120));
// 2) stránky se vykreslí bez porušení CSP
for (const [role, path, co] of [[null,'/','landing'],[null,'/login','přihlášení'],['employer','/employer/overview','přehled vedení'],['employer','/employer/overview?view=org','všechny podniky'],['employee','/employee/shifts','směny zaměstnance']]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  if (role) {
    const tok = execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${role}`, { encoding: 'utf8' }).trim();
    await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    await ctx.route('**/api/**', async route => { const u = route.request().url(); if (u.includes('/api/auth/')) return route.continue(); const k = keyFor(u);
      if (k && existsSync(DIR+k+'.json')) return route.fulfill({ status:200, contentType:'application/json', body: readFileSync(DIR+k+'.json','utf8') });
      return route.fulfill({ status:200, contentType:'application/json', body:'[]' }); });
  }
  const p = await ctx.newPage(); const chyby = [];
  p.on('console', m => { if (/Content Security Policy|unsafe-eval|Refused to/i.test(m.text())) chyby.push(m.text().slice(0,140)); });
  p.on('pageerror', e => chyby.push('pageerror: ' + String(e).slice(0,140)));
  await p.goto('http://localhost:3000'+path, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  const txt = (await p.locator('body').innerText()).length;
  tvrdi(`${co}: bez porušení CSP a chyb (${txt} znaků obsahu)`, chyby.length === 0 && txt > 100, chyby.join(' | '));
  await ctx.close();
}
// 3) CSRF: POST z cizí stránky na API se zamítne, bez Origin projde k routě
const cizi = await fetch('http://localhost:3000/api/teams/join', { method:'POST', headers:{ 'content-type':'application/json', origin:'https://zly.example' }, body:'{}' });
tvrdi('POST s cizím Origin → 403', cizi.status === 403, String(cizi.status));
const svuj = await fetch('http://localhost:3000/api/teams/join', { method:'POST', headers:{ 'content-type':'application/json', origin:'http://localhost:3000' }, body:'{}' });
tvrdi('POST s vlastním Origin dojde k routě (400 za prázdný formulář)', svuj.status === 400, String(svuj.status));
const server = await fetch('http://localhost:3000/api/teams/join', { method:'POST', headers:{ 'content-type':'application/json' }, body:'{}' });
tvrdi('POST bez Origin (server) dojde k routě', server.status === 400, String(server.status));
await b.close(); console.log(fails ? `\n${fails} SELHALO` : '\nCSP a CSRF v pořádku'); process.exit(fails?1:0);
