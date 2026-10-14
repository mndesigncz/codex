// Spuštění (balík P) — souhlas s podmínkami s verzí: click-wrap a brána nové verze.
//
// Sonda nezávisí na databázi: kontroly serveru jdou na cesty, které odmítnou chybějící
// souhlas DŘÍV, než sáhnou do databáze; v prohlížeči API podvrhují fixtury.
//  S1 Server: registrace podniku, připojení kódem, pozvánka a registrace hosta bez
//     `terms: true` vrátí 400; host bez `vek15: true` taky.
//  S2 Registrace podniku (Cesta): bez zaškrtnutí se nic neodešle a pod zaškrtávátkem je
//     věta; se zaškrtnutím odejde `terms: true`. Telefon 390 i počítač 1280.
//  S3 Připojení k týmu (/join): totéž, odkazy na podmínky a zásady.
//  S4 Registrace hosta: bez souhlasu i bez věku neodejde; s oběma `terms` + `vek15`.
//  S5 Brána nové verze: přihlášený se starší verzí dostane okno; bez zaškrtnutí
//     neodsouhlasí, se zaškrtnutím POST /api/account/souhlas a okno zmizí; po obnovení
//     stránky se server už neptá (relace). Tablet a právní stránky bránu nemají.
//  S6 Rozložení: nic nepřetéká (390 i 1280), zaškrtávátko je dotykový cíl ≥ 44 px.
import { browser, tvrdi, konec, BASE, tokenPro, kontext, jdi, otevri, OUT } from './k68-spolecne.mjs';
import { kUctu, vyplnUcet } from './cesta-registrace.mjs';

const HLASKA = 'Bez souhlasu s podmínkami účet založit nejde.';

/** POST bez prohlížeče (s Origin, ať projde CSRF bránou middleware). */
async function post(cesta, telo) {
  const r = await fetch(BASE + cesta, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify(telo) });
  let d = {}; try { d = await r.json(); } catch { /* ne-JSON */ }
  return { status: r.status, error: d.error ?? '' };
}

/** Přetečení a výška řádku se zaškrtávátkem. */
async function rozlozeni(p) {
  return p.evaluate(() => {
    const radek = document.querySelector('[data-souhlas-podminek] label');
    return { pretece: document.documentElement.scrollWidth > window.innerWidth + 1, vyska: radek ? Math.round(radek.getBoundingClientRect().height) : 0 };
  });
}

// ---------------------------------------------------------------------------
console.log('S1 Server odmítne účet bez souhlasu');
{
  let r = await post('/api/register', { name: 'Jan', email: 'jan@priklad.cz', password: 'tajneheslo1' });
  tvrdi('podnik: bez terms 400 s větou', r.status === 400 && r.error === HLASKA, `${r.status} ${r.error}`);
  r = await post('/api/register', { name: 'Jan', email: 'jan@priklad.cz', password: 'tajneheslo1', terms: 'true' });
  tvrdi('podnik: terms jako text nestačí', r.status === 400 && r.error === HLASKA, `${r.status} ${r.error}`);
  r = await post('/api/teams/join', { name: 'Eva', email: 'eva@priklad.cz', password: 'tajneheslo1', joinCode: 'ABC123' });
  tvrdi('kód týmu: bez terms 400', r.status === 400 && r.error === HLASKA, `${r.status} ${r.error}`);
  r = await post('/api/invitations/accept', { token: 'x'.repeat(20), name: 'Eva', password: 'tajneheslo1' });
  tvrdi('pozvánka: bez terms 400', r.status === 400 && r.error === HLASKA, `${r.status} ${r.error}`);
  r = await post('/api/client/register', { name: 'Klára', email: 'klara@priklad.cz', password: 'tajneheslo1' });
  tvrdi('host: bez terms 400', r.status === 400 && r.error === HLASKA, `${r.status} ${r.error}`);
  r = await post('/api/client/register', { name: 'Klára', email: 'klara@priklad.cz', password: 'tajneheslo1', terms: true });
  tvrdi('host: bez věku 400', r.status === 400 && /od 15 let/.test(r.error), `${r.status} ${r.error}`);
}

// ---------------------------------------------------------------------------
console.log('S2 Registrace podniku');
for (const [nazev, viewport, mobil] of [['telefon 390', { width: 390, height: 844 }, true], ['počítač 1280', { width: 1280, height: 900 }, false]]) {
  const b = await browser();
  const ctx = await b.newContext({ viewport, locale: 'cs-CZ', isMobile: mobil, hasTouch: mobil });
  const posty = [];
  await ctx.route('**/api/register', r => { posty.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, joinCode: 'ABCD12' }) }); });
  const p = await ctx.newPage();
  await jdi(p, BASE + '/register');
  await kUctu(p);
  await vyplnUcet(p, { souhlas: false });
  const box = p.locator('#cs-souhlas');
  tvrdi(`${nazev}: zaškrtávátko souhlasu je a výchozí je prázdné`, await box.count() === 1 && !(await box.isChecked()));
  tvrdi(`${nazev}: odkazy na podmínky a zásady v nové záložce`, await p.locator('[data-souhlas-podminek] a[href="/podminky"][target="_blank"]').count() === 1 && await p.locator('[data-souhlas-podminek] a[href="/soukromi"][target="_blank"]').count() === 1);
  await p.getByRole('button', { name: 'Založit podnik' }).click();
  await p.waitForTimeout(400);
  tvrdi(`${nazev}: bez zaškrtnutí se nic neodešle`, posty.length === 0, `${posty.length}`);
  tvrdi(`${nazev}: bez zaškrtnutí věta pod zaškrtávátkem`, await p.getByText(HLASKA).count() === 1);
  const l = await rozlozeni(p);
  tvrdi(`${nazev}: nic nepřetéká`, !l.pretece);
  tvrdi(`${nazev}: řádek se zaškrtávátkem je dotykový cíl ≥ 44 px`, l.vyska >= 44, `${l.vyska}`);
  await p.screenshot({ path: `${OUT}k88-souhlas-registrace-${viewport.width}.png`, fullPage: true });
  await box.check();
  tvrdi(`${nazev}: po zaškrtnutí věta zmizí`, await p.getByText(HLASKA).count() === 0);
  await p.getByRole('button', { name: 'Založit podnik' }).click();
  await p.waitForTimeout(600);
  tvrdi(`${nazev}: se zaškrtnutím odejde terms: true`, posty.length === 1 && posty[0].terms === true, JSON.stringify(posty[0] ?? null));
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('S3 Připojení k týmu');
{
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
  const posty = [];
  await ctx.route('**/api/teams/join', r => { posty.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Neplatný kód týmu' }) }); });
  const p = await ctx.newPage();
  await jdi(p, BASE + '/join');
  await p.fill('#join-kod', 'ABC123');
  await p.fill('#join-jmeno', 'Eva Testová');
  await p.fill('#join-email', 'eva@priklad.cz');
  await p.fill('#join-heslo', 'tajneheslo1');
  await p.getByRole('button', { name: 'Připojit se' }).click();
  await p.waitForTimeout(400);
  tvrdi('join: bez zaškrtnutí se nic neodešle a je věta', posty.length === 0 && await p.getByText(HLASKA).count() === 1, `${posty.length}`);
  const l = await rozlozeni(p);
  tvrdi('join 390: nic nepřetéká, cíl ≥ 44 px', !l.pretece && l.vyska >= 44, JSON.stringify(l));
  await p.screenshot({ path: `${OUT}k88-souhlas-join-390.png`, fullPage: true });
  await p.check('#join-souhlas');
  await p.getByRole('button', { name: 'Připojit se' }).click();
  await p.waitForTimeout(500);
  tvrdi('join: se zaškrtnutím odejde terms: true', posty.length === 1 && posty[0].terms === true, JSON.stringify(posty[0] ?? null));
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('S4 Registrace hosta');
{
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
  const posty = [];
  await ctx.route('**/api/client/register', r => { posty.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Tenhle e-mail už je zaregistrovaný. Přihlas se.' }) }); });
  const p = await ctx.newPage();
  await jdi(p, BASE + '/client/register');
  await p.fill('#r-name', 'Klára Vojtíšková');
  await p.fill('#r-email', 'klara@priklad.cz');
  await p.fill('#r-pw', 'tajneheslo1');
  const zalozit = p.getByRole('button', { name: 'Založit účet' });
  await zalozit.click();
  await p.waitForTimeout(300);
  tvrdi('host: bez souhlasu se nic neodešle a je věta', posty.length === 0 && await p.getByText(HLASKA).count() === 1, `${posty.length}`);
  await p.check('#r-souhlas');
  await zalozit.click();
  await p.waitForTimeout(300);
  tvrdi('host: bez věku se nic neodešle a je věta o 15 letech', posty.length === 0 && await p.getByText('Účet hosta si můžeš založit od 15 let.').count() === 1, `${posty.length}`);
  const l = await rozlozeni(p);
  tvrdi('host 390: nic nepřetéká, cíl ≥ 44 px', !l.pretece && l.vyska >= 44, JSON.stringify(l));
  await p.screenshot({ path: `${OUT}k88-souhlas-host-390.png`, fullPage: true });
  await p.check('#r-souhlas-vek');
  await zalozit.click();
  await p.waitForTimeout(500);
  tvrdi('host: s oběma zaškrtnutími odejde terms: true a vek15: true', posty.length === 1 && posty[0].terms === true && posty[0].vek15 === true, JSON.stringify(posty[0] ?? null));
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('S5 Brána nové verze');
for (const [nazev, viewport, mobil] of [['telefon 390', { width: 390, height: 844 }, true], ['počítač 1280', { width: 1280, height: 900 }, false]]) {
  const souhlas = { get: 0, post: [] };
  const { ctx, p } = await kontext({
    viewport, mobil,
    dalsi: (req, json) => {
      if (new URL(req.url()).pathname !== '/api/account/souhlas') return undefined;
      if (req.method() === 'POST') { souhlas.post.push(JSON.parse(req.postData() || '{}')); return json({ ok: true }); }
      souhlas.get++;
      return json({ potreba: true, verzePodminek: '2026-10-14', verzeZasad: '2026-10-14' });
    },
  });
  await otevri(p, '/employer/overview');
  const okno = p.getByRole('dialog', { name: 'Aktualizovali jsme podmínky' });
  await okno.waitFor({ timeout: 8000 }).catch(() => {});
  tvrdi(`${nazev}: přihlášenému se starší verzí se ukáže okno`, await okno.isVisible());
  const l = await rozlozeni(p);
  tvrdi(`${nazev}: okno nepřetéká, cíl ≥ 44 px`, !l.pretece && l.vyska >= 44, JSON.stringify(l));
  await p.screenshot({ path: `${OUT}k88-souhlas-brana-${viewport.width}.png` });
  await okno.getByRole('button', { name: 'Souhlasím a pokračovat' }).click();
  await p.waitForTimeout(300);
  tvrdi(`${nazev}: bez zaškrtnutí se souhlas neuloží`, souhlas.post.length === 0 && await okno.getByText(HLASKA).count() === 1);
  await okno.locator('#nova-verze-souhlas').check();
  await okno.getByRole('button', { name: 'Souhlasím a pokračovat' }).click();
  await p.waitForTimeout(600);
  tvrdi(`${nazev}: se zaškrtnutím POST { terms: true } a okno zmizí`, souhlas.post.length === 1 && souhlas.post[0].terms === true && !(await okno.isVisible()), JSON.stringify(souhlas.post));
  const getPred = souhlas.get;
  await jdi(p, BASE + '/employer/overview');
  await p.waitForTimeout(1500);
  tvrdi(`${nazev}: po obnovení se server v téže relaci už neptá`, souhlas.get === getPred, `${getPred} → ${souhlas.get}`);
  await ctx.close();
}
{
  // Tablet: sdílený účet za podnik nesouhlasí — brána se serveru ani nezeptá.
  let dotazu = 0;
  const { ctx, p } = await kontext({ role: 'kiosk', dalsi: (req, json) => (new URL(req.url()).pathname === '/api/account/souhlas' ? (dotazu++, json({ potreba: true })) : undefined) });
  await jdi(p, BASE + '/kiosk');
  await p.waitForTimeout(2500);
  tvrdi('tablet: brána se neptá a okno nemá', dotazu === 0 && await p.getByRole('dialog', { name: 'Aktualizovali jsme podmínky' }).count() === 0, `${dotazu}`);
  // Právní stránka: podmínky si musí jít přečíst i s otevřenou bránou.
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro('employer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await jdi(p, BASE + '/podminky');
  await p.waitForTimeout(1500);
  tvrdi('právní stránka: brána se neukáže', dotazu === 0 && await p.getByRole('dialog', { name: 'Aktualizovali jsme podmínky' }).count() === 0, `${dotazu}`);
  await ctx.close();
}

await konec();
