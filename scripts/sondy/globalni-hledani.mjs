// Globální hledání (Ctrl K): jedno okno najde stránku, úkol, položku skladu nebo člověka a rovnou tam vede.
//  - Ctrl K otevře okno, šipky a Enter vybírají, Escape zavře (jen hledání — okno pod ním zůstane),
//  - „sklad" najde stránku Sklad a Enter ji otevře,
//  - název úkolu najde úkol a výběr otevře Úkoly rovnou s detailem toho úkolu,
//  - zaměstnanec hledá ve stránkách a úkolech, ale lidi ne,
//  - na telefonu je hledání v nabídce Více.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, roleMine, DIR } from './k68-spolecne.mjs';

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

{
  const { ctx, p, chyby } = await kontext({ viewport: { width: 1280, height: 900 }, dalsi: podvrh });
  await otevri(p, '/employer/overview', 'vedeni.prehled');
  const okno = p.getByRole('dialog', { name: 'Hledat v aplikaci' });
  await p.keyboard.press('Control+k');
  tvrdi('Ctrl K otevře hledání', await okno.waitFor({ timeout: 5000 }).then(() => true, () => false));
  tvrdi('bez dotazu nabízí stránky aplikace', await okno.getByRole('option', { name: /Sklad/ }).count() >= 1);
  await okno.getByRole('combobox').fill('sklad');
  tvrdi('„sklad" najde stránku Sklad', await dokud(async () => await okno.getByRole('option', { name: /Sklad/ }).count() >= 1, 3000));
  await p.keyboard.press('Enter');
  tvrdi('Enter otevře Sklad a okno se zavře', await dokud(async () => await p.locator('[data-plocha="vedeni.sklad"]').count() === 1 && await okno.count() === 0, 6000));

  await p.keyboard.press('Control+k');
  await okno.waitFor({ timeout: 5000 });
  await okno.getByRole('combobox').fill('sirupy');
  tvrdi('název úkolu najde úkol ve skupině Úkoly', await dokud(async () => await okno.getByRole('option', { name: /Doplnit sirupy/ }).count() >= 1, 5000));
  await okno.getByRole('option', { name: /Doplnit sirupy/ }).first().click();
  tvrdi('výběr úkolu otevře Úkoly rovnou s jeho detailem', await dokud(async () => await p.locator('[data-plocha="vedeni.ukoly"]').count() === 1 && await p.getByRole('dialog', { name: 'Doplnit sirupy' }).count() === 1, 8000));
  // Hledání nad otevřeným oknem: paleta musí být vrchní vrstva (jinak klepnutí na výsledek chytí detail
  // pod ní) a Escape zavře jen ji — detail úkolu zůstane.
  await p.keyboard.press('Control+k');
  await okno.waitFor({ timeout: 5000 });
  const prvni = okno.getByRole('option').first();
  await prvni.waitFor({ timeout: 5000 });
  const nadDetailem = await prvni.evaluate(el => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });
  tvrdi('hledání otevřené nad detailem úkolu je navrchu (výsledek jde klepnout)', nadDetailem);
  await p.keyboard.press('Escape');
  tvrdi('Escape zavře jen hledání, detail úkolu zůstane', await dokud(async () => await okno.count() === 0, 3000) && await p.getByRole('dialog', { name: 'Doplnit sirupy' }).count() === 1);
  await p.keyboard.press('Escape');
  tvrdi('druhý Escape zavře detail úkolu', await dokud(async () => await p.getByRole('dialog', { name: 'Doplnit sirupy' }).count() === 0, 3000));

  await p.keyboard.press('Control+k');
  await okno.waitFor({ timeout: 5000 });
  await okno.getByRole('combobox').fill('flat white');
  tvrdi('„flat white" najde návod a výběr otevře Návody', await dokud(async () => await okno.getByRole('option', { name: /Jak se dělá flat white/ }).count() >= 1, 5000));
  await okno.getByRole('option', { name: /Jak se dělá flat white/ }).first().click();
  tvrdi('…na stránce Návody', await dokud(async () => await p.locator('[data-plocha="vedeni.navody"]').count() === 1, 6000));

  await p.keyboard.press('Control+k');
  await okno.waitFor({ timeout: 5000 });
  await okno.getByRole('combobox').fill('zavírací');
  tvrdi('„zavírací" najde postup', await dokud(async () => await okno.getByRole('option', { name: /Zavírací rutina/ }).count() >= 1, 5000));
  await p.keyboard.press('Escape');

  // Kolo 5: paleta akcí — „kasa" najde Nastavení › Pokladna (synonymum) a výběr otevře Nastavení na záložce Pokladna;
  // „po termínu" najde akci Úkoly po termínu (deep link stav:po_terminu).
  await p.keyboard.press('Control+k');
  await okno.waitFor({ timeout: 5000 });
  await okno.getByRole('combobox').fill('kasa');
  tvrdi('„kasa" najde ve skupině Akce a nastavení Nastavení › Pokladna i Novou uzávěrku', await dokud(async () => await okno.getByRole('option', { name: /Nastavení › Pokladna/ }).count() === 1 && await okno.getByRole('option', { name: /Nová uzávěrka/ }).count() === 1, 4000), await okno.innerText());
  tvrdi('…skupina se jmenuje „Akce a nastavení"', /Akce a nastavení/i.test(await okno.innerText()));
  await okno.getByRole('option', { name: /Nastavení › Pokladna/ }).click();
  tvrdi('výběr otevře Nastavení rovnou na záložce Pokladna', await dokud(async () => await p.getByRole('heading', { name: 'Pokladna', exact: true }).count() >= 1 || await p.locator('[aria-pressed="true"], [aria-selected="true"]').filter({ hasText: 'Pokladna' }).count() >= 1, 8000), (await p.locator('main').innerText()).slice(0, 200));
  await p.keyboard.press('Control+k');
  await okno.waitFor({ timeout: 5000 });
  await okno.getByRole('combobox').fill('po termínu');
  tvrdi('„po termínu" najde akci Úkoly po termínu', await dokud(async () => await okno.getByRole('option', { name: /Úkoly po termínu/ }).count() === 1, 4000));
  await p.keyboard.press('Escape');

  await p.keyboard.press('Control+k');
  await okno.waitFor({ timeout: 5000 });
  await okno.getByRole('combobox').fill('zzzzzz');
  tvrdi('bez shody ukáže „Nic nenalezeno"', await dokud(async () => /Nic nenalezeno/.test(await okno.innerText()), 3000));
  await p.keyboard.press('Escape');
  tvrdi('Escape hledání zavře', await dokud(async () => await okno.count() === 0, 3000));
  tvrdi('bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

{
  const { ctx, p } = await kontext({ viewport: { width: 1280, height: 900 }, role: 'employee', mineData: roleMine('barista'), dalsi: podvrh });
  await otevri(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  await p.keyboard.press('Control+k');
  const okno = p.getByRole('dialog', { name: 'Hledat v aplikaci' });
  await okno.waitFor({ timeout: 5000 });
  await okno.getByRole('combobox').fill('eva');
  await p.waitForTimeout(800);
  tvrdi('zaměstnanec při hledání jména nevidí skupinu Lidé', !/Lidé/.test(await okno.innerText()));
  await ctx.close();
}

{
  const { ctx, p } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh });
  await otevri(p, '/employer/overview', 'vedeni.prehled');
  await p.getByRole('button', { name: 'Více' }).click();
  await p.getByRole('button', { name: 'Hledat', exact: true }).click();
  tvrdi('na telefonu otevře hledání nabídka Více → Hledat', await p.getByRole('dialog', { name: 'Hledat v aplikaci' }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await ctx.close();
}
await konec();
