// Kolo 71 — přednastavené role jde upravit (per podnik), Vedení a Tablet ne.
//
// Martin: „chci mít možnost editovat i přednastavené role."
//
// Sonda hlídá Nastavení → Role a oprávnění (API podvržené):
//  R1 Barista má „Upravit", Vedení a Tablet ne (jen vysvětlení).
//  R2 Úprava Baristy: editor předvyplněný platnou sadou, přepnutí oprávnění
//     a Uložit pošle PUT /api/roles/system/barista { opravneni, verze }.
//  R3 Upravená role má štítek „Upraveno" a „Obnovit výchozí" → potvrzení →
//     DELETE /api/roles/system/barista.
//  R4 Server odmítne (403 s důvodem) → hláška je vidět doslova.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? 'design-round-secret-0123456789ab'} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} employer`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let fails = 0;
const tvrdi = (popis, ok, co = '') => { console.log(`${ok ? '✓' : '✗'} ${popis}${ok ? '' : '  ← ' + co}`); if (!ok) fails++; };

const ROLE = JSON.parse(readFileSync(DIR + 'roles.json', 'utf8'));
const NEUPRAVITELNE = new Set(['vedeni', 'kiosk']);
/** GET /api/roles tak, jak ho teď vrací server: platná sada + výchozí + příznaky úprav. */
const roles = ({ upravenaBarista = false } = {}) => ({
  ...ROLE,
  upravyNedostupne: false,
  system: ROLE.system.map(r => {
    const zaklad = { ...r, upraveno: false, vychoziOpravneni: [...r.opravneni], vychoziNazev: r.nazev, vychoziPopis: r.popis,
      upravitelna: !NEUPRAVITELNE.has(r.klic), verze: 0,
      procZamceno: NEUPRAVITELNE.has(r.klic) ? (r.klic === 'kiosk' ? 'Tablet má pevnou sadu oprávnění.' : 'Roli vedení nejde upravit — jde jen zkopírovat do vlastní.') : null };
    if (r.klic !== 'barista' || !upravenaBarista) return zaklad;
    return { ...zaklad, opravneni: r.opravneni.filter(k => k !== 'napady.pridat'), upraveno: true, verze: 2 };
  }),
});
const mine = () => ({ ...JSON.parse(readFileSync(DIR + 'teams_mine.json', 'utf8')),
  role: { klic: 'vedeni', roleId: null, nazev: 'Vlastník', typ: 'vedeni', jeVlastnik: true }, opravneni: ROLE.ja.opravneni });

async function kontext({ upravenaBarista = false, put = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('managero-app-mode', 'full'); } catch {} });
  const stav = { puty: [], deletes: [] };
  await ctx.route('**/api/**', async route => {
    const req = route.request(); const u = req.url(); const m = req.method(); const path = new URL(u).pathname;
    if (u.includes('/api/auth/')) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/teams/mine') return json(mine());
    if (path === '/api/roles' && m === 'GET') return json(roles({ upravenaBarista: upravenaBarista || stav.puty.length > 0 }));
    if (path.startsWith('/api/roles/system/')) {
      const klic = decodeURIComponent(path.split('/').pop());
      if (m === 'PUT') { const t = JSON.parse(req.postData() || '{}'); stav.puty.push({ klic, ...t }); return put ? put(json) : json({ ok: true, verze: 3 }); }
      if (m === 'DELETE') { stav.deletes.push(klic); upravenaBarista = false; return json({ ok: true }); }
    }
    if (m !== 'GET') return json({ ok: true });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return json([]);
  });
  return { ctx, stav };
}
async function otevriRole(p) {
  await p.goto('http://localhost:3000/employer/overview?view=settings', { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
  await p.getByRole('button', { name: /Role a oprávnění/ }).or(p.getByRole('tab', { name: /Role a oprávnění/ })).filter({ visible: true }).first().click();
  await p.waitForTimeout(900);
}
/** Řádek přednastavené role podle názvu z fixtury. */
const radek = (p, klic) => {
  const nazev = ROLE.system.find(r => r.klic === klic).nazev;
  return p.locator('li, [role="listitem"], .list-row').filter({ hasText: nazev }).filter({ has: p.getByRole('button') }).last();
};

// R1–R2) Upravit Baristu → PUT.
{
  const { ctx, stav } = await kontext();
  const p = await ctx.newPage();
  const chyby = []; p.on('pageerror', e => chyby.push(String(e)));
  await otevriRole(p);
  tvrdi('R1: Barista má „Upravit"', await radek(p, 'barista').getByRole('button', { name: 'Upravit' }).count() === 1);
  tvrdi('R1: Vedení ani Tablet „Upravit" nemají', await radek(p, 'vedeni').getByRole('button', { name: 'Upravit' }).count() === 0
    && await radek(p, 'kiosk').getByRole('button', { name: 'Upravit' }).count() === 0);
  await radek(p, 'barista').getByRole('button', { name: 'Upravit' }).click();
  await p.waitForTimeout(600);
  const nazev = p.getByLabel('Název role');
  tvrdi('R2: editor předvyplněný názvem Baristy', (await nazev.inputValue()).includes(ROLE.system.find(r => r.klic === 'barista').nazev.split(' ')[0]), await nazev.inputValue());
  // Přepni jedno oprávnění, které Barista má (Přidat nápad), přes hledání.
  const hledat = p.getByLabel('Hledat v oprávněních').first();
  await hledat.fill('nápad'); await p.waitForTimeout(400);
  const prep = p.getByRole('switch').filter({ visible: true }).first();
  const pred = await prep.getAttribute('aria-checked');
  await prep.click(); await p.waitForTimeout(300);
  tvrdi('R2: přepnutí oprávnění v editoru přednastavené role funguje', (await prep.getAttribute('aria-checked')) !== pred);
  await hledat.fill(''); await p.waitForTimeout(200);
  await p.getByRole('button', { name: /^Uložit/ }).first().click();
  const put = await (async () => { for (let i = 0; i < 20 && !stav.puty.length; i++) await p.waitForTimeout(150); return stav.puty[0]; })();
  const vychozi = ROLE.system.find(r => r.klic === 'barista').opravneni;
  tvrdi('R2: Uložit pošle PUT /api/roles/system/barista s jinou sadou a verzí 0', put?.klic === 'barista' && Array.isArray(put.opravneni)
    && put.opravneni.length !== vychozi.length && put.verze === 0, JSON.stringify(put)?.slice(0, 200));
  tvrdi('R2: PUT nenese typ (typ přednastavené role je pevný)', put && !('typ' in put), JSON.stringify(put)?.slice(0, 120));
  tvrdi('R1–R2: bez chyb stránky', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

// R3) Upravená Barista: štítek a „Obnovit výchozí" → DELETE.
{
  const { ctx, stav } = await kontext({ upravenaBarista: true });
  const p = await ctx.newPage();
  await otevriRole(p);
  tvrdi('R3: upravená role má štítek „Upraveno"', await radek(p, 'barista').getByText('Upraveno', { exact: true }).count() >= 1);
  await radek(p, 'barista').getByRole('button', { name: 'Obnovit výchozí' }).click();
  const okno = p.getByRole('dialog', { name: 'Obnovit výchozí oprávnění?' });
  tvrdi('R3: „Obnovit výchozí" se nejdřív zeptá', await okno.isVisible());
  await okno.getByRole('button', { name: 'Obnovit výchozí' }).click();
  for (let i = 0; i < 20 && !stav.deletes.length; i++) await p.waitForTimeout(150);
  tvrdi('R3: potvrzení pošle DELETE /api/roles/system/barista', stav.deletes[0] === 'barista', JSON.stringify(stav.deletes));
  await ctx.close();
}

// R4) 403 s důvodem se ukáže doslova.
{
  const hlaska = 'Roli nemůžeš dát oprávnění, která sám nemáš: „Vidět mzdy a sazby".';
  const { ctx } = await kontext({ put: (json) => json({ error: hlaska }, 403) });
  const p = await ctx.newPage();
  await otevriRole(p);
  await radek(p, 'barista').getByRole('button', { name: 'Upravit' }).click();
  await p.waitForTimeout(500);
  // Bez změny je Uložit šedé (není co ukládat) — změní se aspoň popis.
  tvrdi('R4: bez změny je Uložit neaktivní', await p.getByRole('button', { name: /^Uložit/ }).first().isDisabled());
  await p.getByLabel('Popis').first().fill('Obsluha baru a kasy.');
  await p.getByRole('button', { name: /^Uložit/ }).first().click();
  await p.waitForTimeout(900);
  const a = await p.getByRole('alert').allInnerTexts();
  tvrdi('R4: hláška serveru je vidět doslova a editor zůstal otevřený', a.some(x => x.includes(hlaska)) && await p.getByLabel('Název role').isVisible(), a.join(' | '));
  await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} neprošlo` : '\nvše prošlo');
process.exit(fails ? 1 : 0);
