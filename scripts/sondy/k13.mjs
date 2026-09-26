// Kolo 13: odškrtnout celý checklist, pozvat víc lidí naráz.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const OUT = new URL('./shots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const problems = []; const ok = m => console.log('  ✓', m); const bad = m => { console.log('  ✗', m); problems.push(m); };
async function open(url) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok('employer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const sent = [];
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    // Kolo 69 (B2): Docházka a Tým jsou plochy s widgety — rozložení z fixtury balíku (jako att.mjs).
    if (new URL(u).pathname === '/api/rozlozeni' && ['vedeni.dochazka', 'vedeni.tym'].includes(new URL(u).searchParams.get('stranka'))) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + (new URL(u).searchParams.get('stranka') === 'vedeni.tym' ? 'k69-b2-rozlozeni-tym' : 'k69-b2-rozlozeni-dochazka') + '.json', 'utf8') });
    if (route.request().method() !== 'GET') {
      sent.push({ m: route.request().method(), u: u.replace('http://localhost:3000',''), body: route.request().postData() });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"token":"t1","emailSent":true}' });
    }
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto('http://localhost:3000' + url, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1700);
  return { ctx, p, errs, sent };
}
console.log('Úkoly — odškrtnout celý checklist:');
{
  const { ctx, p, errs, sent } = await open('/employer/overview?view=tasks');
  const btn = p.locator('button', { hasText: /^Odškrtnout vše$/ });
  if (await btn.count() === 0) bad('tlačítko „Odškrtnout vše" není (checklist má ≤2 položky ve fixture?)');
  else {
    const before = sent.length;
    await btn.first().click();
    await p.waitForTimeout(900);
    const patches = sent.slice(before).filter(x => x.m === 'PATCH');
    patches.length === 1 ? ok('jeden požadavek místo položky po položce') : bad(`čekán 1 PATCH, odešlo ${patches.length}`);
    const body = patches[0] ? JSON.parse(patches[0].body || '{}') : {};
    const list = body.checklist ?? [];
    list.length > 0 && list.every(i => i.done) ? ok(`odškrtnuto všech ${list.length} položek`) : bad(`v požadavku není odškrtnuté vše: ${JSON.stringify(list)}`);
    (await p.locator('button', { hasText: /^Zrušit vše$/ }).count()) > 0 ? ok('tlačítko se přepnulo na „Zrušit vše"') : bad('tlačítko se nepřepnulo');
    await p.screenshot({ path: `${OUT}k13-checklist-1280.png` });
  }
  if (errs.length) bad('Úkoly: ' + errs[0]);
  await ctx.close();
}
console.log('Tým — pozvat víc lidí naráz:');
{
  const { ctx, p, errs, sent } = await open('/employer/overview?view=team-settings');
  // Kolo 69 (B2): pozvání je okno (Modal) z limetky „Pozvat člena", ne pole na stránce.
  await p.getByRole('button', { name: 'Pozvat člena' }).first().click().catch(() => {});
  const okno = p.getByRole('dialog', { name: 'Pozvat člena' });
  await okno.waitFor({ timeout: 3000 }).catch(() => {});
  const f = okno.getByLabel('E-mail');
  if (await f.count() === 0) bad('pole pro pozvánku nenalezeno');
  else {
    await f.fill('a@x.cz, b@x.cz  c@x.cz');
    const before = sent.length;
    await okno.getByRole('button', { name: 'Odeslat pozvánku' }).click();
    await p.waitForTimeout(1500);
    const posts = sent.slice(before).filter(x => x.u.includes('/api/invitations') && x.m === 'POST');
    posts.length === 3 ? ok('tři e-maily = tři pozvánky z jednoho odeslání') : bad(`čekány 3 pozvánky, odešlo ${posts.length}`);
    const emails = posts.map(x => JSON.parse(x.body || '{}').email);
    JSON.stringify(emails) === JSON.stringify(['a@x.cz','b@x.cz','c@x.cz']) ? ok(`adresy rozdělené správně: ${emails.join(', ')}`) : bad(`adresy: ${emails.join(', ')}`);
    (await p.locator('text=/Pozváni 3 lidi|Pozváno 3 lidi/').count()) > 0 ? ok('potvrzení říká počet') : console.log('  · potvrzení: ' + (await p.locator('.note, [class*="note"]').allInnerTexts()).join(' | ').slice(0, 90));
    await p.screenshot({ path: `${OUT}k13-pozvanky-1280.png` });
  }
  if (errs.length) bad('Tým: ' + errs[0]);
  await ctx.close();
}
console.log(problems.length ? `\nPROBLÉMŮ: ${problems.length}` : '\nVšechno prošlo.');
await b.close();
