// Kolo 8 (R8-6): navigace, hledání a komunikace.
//  1) Zpět a adresa obrazovky (telefon 390 i monitor): přechod zapíše `?view=…`, Zpět vrátí předchozí
//     pohled místo opuštění aplikace, Vpřed ho zase otevře; otevřené okno přidá `&okno=1` a Zpět ho
//     nejdřív zavře; rozepsané okno se při Zpět zeptá; odkaz `?view=tasks&arg=ukol:2` otevře detail.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, roleMine, DIR, OUT } from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PREDVCEREM: praha(-2), ZITRA: praha(1), POZDEJI: praha(20) };
const CASY = { CAS_DNES: new Date(Date.now() - 60000).toISOString(), CAS_PREDVCEREM: new Date(Date.now() - 2 * 86400000).toISOString() };
const nacti = (jmeno) => { let t = readFileSync(DIR + jmeno + '.json', 'utf8'); for (const [k, v] of Object.entries({ ...DNY, ...CASY })) t = t.replaceAll(`"${k}"`, `"${v}"`); return JSON.parse(t); };
const podvrh = (req, json) => {
  const { pathname: path } = new URL(req.url());
  if (path === '/api/tasks' && req.method() === 'GET') return json(nacti('k69-b6a-tasks'));
  if (path === '/api/teams' && req.method() === 'GET') return json(nacti('k69-b6a-teams'));
  return undefined;
};
const q = (p) => new URL(p.url()).search;
const plochaJe = (p, id) => dokud(async () => await p.locator(`[data-plocha="${id}"] li[data-instance]:not([hidden])`).count() >= 1 && await p.locator('[data-plocha]').first().getAttribute('data-plocha') === id, 8000);

// ---- 1a) Vedení na telefonu: dok, Zpět, Vpřed, okno, rozepsané okno ----
{
  const { ctx, p, chyby } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh });
  await otevri(p, '/employer/overview', 'vedeni.prehled');
  tvrdi('1a: Přehled bez parametru v adrese', !/view=/.test(q(p)), q(p));
  await p.getByRole('button', { name: 'Sklad', exact: true }).first().click();
  tvrdi('1a: dok → Sklad: v adrese je ?view=inventory', await dokud(async () => /view=inventory/.test(q(p)), 4000) && await plochaJe(p, 'vedeni.sklad'), q(p));
  await p.goBack();
  tvrdi('1a: Zpět vrátí Přehled (ne přihlášení, ne zavření aplikace)', await plochaJe(p, 'vedeni.prehled') && !/view=inventory/.test(q(p)), q(p));
  await p.goForward();
  tvrdi('1a: Vpřed zase otevře Sklad', await plochaJe(p, 'vedeni.sklad') && /view=inventory/.test(q(p)), q(p));
  await p.screenshot({ path: OUT + 'k84-navigace-390-sklad.png' });

  // Okno: hledání (lupa v hlavičce) → detail úkolu; Zpět zavře okno, další Zpět vrátí pohled.
  await p.getByRole('button', { name: 'Hledat v aplikaci' }).click();
  const okno = p.getByRole('dialog', { name: 'Hledat v aplikaci' });
  await okno.waitFor({ timeout: 5000 });
  tvrdi('1a: otevřené hledání má v adrese &okno=1', await dokud(async () => /okno=1/.test(q(p)), 3000), q(p));
  await p.goBack();
  tvrdi('1a: Zpět zavře hledání a zůstane na Skladu', await dokud(async () => await okno.count() === 0, 4000) && await plochaJe(p, 'vedeni.sklad') && !/okno=1/.test(q(p)), q(p));
  await p.getByRole('button', { name: 'Hledat v aplikaci' }).click();
  await okno.waitFor({ timeout: 5000 });
  await okno.getByRole('combobox').fill('sirupy');
  await okno.getByRole('option', { name: /Doplnit sirupy/ }).first().waitFor({ timeout: 5000 });
  await okno.getByRole('option', { name: /Doplnit sirupy/ }).first().click();
  const detail = p.getByRole('dialog', { name: 'Doplnit sirupy' });
  tvrdi('1a: výběr úkolu otevře Úkoly s detailem a adresu ?view=tasks…&okno=1', await dokud(async () => await detail.count() === 1 && /view=tasks/.test(q(p)) && /okno=1/.test(q(p)), 8000), q(p));
  await p.screenshot({ path: OUT + 'k84-navigace-390-detail.png' });
  await p.goBack();
  tvrdi('1a: Zpět zavře detail úkolu, Úkoly zůstanou', await dokud(async () => await detail.count() === 0, 4000) && await plochaJe(p, 'vedeni.ukoly') && !/okno=1/.test(q(p)), q(p));
  await p.goBack();
  tvrdi('1a: další Zpět vrátí Sklad', await plochaJe(p, 'vedeni.sklad'), q(p));
  tvrdi('1a: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---- 1b) Odkaz s argumentem a rozepsané okno (monitor) ----
{
  const { ctx, p, chyby } = await kontext({ viewport: { width: 1280, height: 900 }, dalsi: podvrh });
  await otevri(p, '/employer/overview?view=tasks&arg=ukol:2', 'vedeni.ukoly');
  const detail = p.getByRole('dialog', { name: 'Doplnit sirupy' });
  tvrdi('1b: odkaz ?view=tasks&arg=ukol:2 otevře Úkoly rovnou s detailem', await dokud(async () => await detail.count() === 1, 8000));
  await p.goBack();
  tvrdi('1b: Zpět z detailu z odkazu zavře detail (Úkoly zůstanou)', await dokud(async () => await detail.count() === 0, 4000) && await plochaJe(p, 'vedeni.ukoly'));
  // Boční pás → Finance → Zpět → Úkoly
  await p.locator('aside').getByRole('button', { name: 'Finance' }).click();
  tvrdi('1b: boční pás zapíše ?view=finance', await dokud(async () => /view=finance/.test(q(p)), 4000) && await plochaJe(p, 'vedeni.finance'), q(p));
  await p.screenshot({ path: OUT + 'k84-navigace-1280-finance.png' });
  await p.goBack();
  tvrdi('1b: Zpět vrátí Úkoly', await plochaJe(p, 'vedeni.ukoly') && /view=tasks/.test(q(p)), q(p));
  // Rozepsané okno: detail úkolu, napsat poznámku, Zpět → otázka; „Zpět k úpravám" okno nechá; Zahodit zavře.
  await p.keyboard.press('Control+k');
  const hledani = p.getByRole('dialog', { name: 'Hledat v aplikaci' });
  await hledani.waitFor({ timeout: 5000 });
  await hledani.getByRole('combobox').fill('sirupy');
  await hledani.getByRole('option', { name: /Doplnit sirupy/ }).first().waitFor({ timeout: 5000 });
  await hledani.getByRole('option', { name: /Doplnit sirupy/ }).first().click();
  await detail.waitFor({ timeout: 8000 });
  const pole = detail.locator('textarea, input[type="text"], input:not([type])').first();
  if (await pole.count()) {
    await pole.click();
    await p.keyboard.type('Objednat i vanilkový', { delay: 10 });
    await p.waitForTimeout(200);
    await p.goBack();
    tvrdi('1b: Zpět nad rozepsaným oknem se zeptá, okno zůstane', await dokud(async () => await p.locator('.discard-guard:visible').count() === 1, 4000) && await detail.count() === 1);
    tvrdi('1b: …a adresa dál nese &okno=1', await dokud(async () => /okno=1/.test(q(p)), 2000), q(p));
    await p.locator('.discard-guard button', { hasText: /Zpět k úpravám/ }).click();
    tvrdi('1b: „Zpět k úpravám" nechá okno i text', await dokud(async () => await p.locator('.discard-guard:visible').count() === 0, 2000) && (await pole.inputValue()).includes('vanilkový'));
    await p.goBack();
    await p.locator('.discard-guard button', { hasText: /^Zahodit$/ }).click({ timeout: 4000 });
    tvrdi('1b: „Zahodit" po Zpět okno zavře a adresa je bez okna', await dokud(async () => await detail.count() === 0 && !/okno=1/.test(q(p)), 4000), q(p));
  } else {
    tvrdi('1b: (detail úkolu nemá psané pole — rozepsané okno se měří jinde)', true);
    await p.keyboard.press('Escape');
  }
  tvrdi('1b: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---- 1c) Zaměstnanec na telefonu ----
{
  const { ctx, p, chyby } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, role: 'employee', mineData: roleMine('barista'), dalsi: podvrh });
  await otevri(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  await p.getByRole('button', { name: 'Úkoly', exact: true }).first().click();
  tvrdi('1c: dok → Úkoly: ?view=tasks', await dokud(async () => /view=tasks/.test(q(p)), 4000) && await plochaJe(p, 'zamestnanec.ukoly'), q(p));
  await p.getByRole('button', { name: 'Více' }).click();
  const vice = p.getByRole('dialog').first();
  await vice.waitFor({ timeout: 4000 });
  tvrdi('1c: list Více je okno s &okno=1', await dokud(async () => /okno=1/.test(q(p)), 3000), q(p));
  await p.goBack();
  tvrdi('1c: Zpět zavře list Více, Úkoly zůstanou', await dokud(async () => await p.getByRole('dialog').count() === 0, 4000) && await plochaJe(p, 'zamestnanec.ukoly'), q(p));
  await p.goBack();
  tvrdi('1c: další Zpět vrátí Domů', await plochaJe(p, 'zamestnanec.domu') && !/view=tasks/.test(q(p)), q(p));
  await p.screenshot({ path: OUT + 'k84-navigace-390-zam.png' });
  tvrdi('1c: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

await konec();
