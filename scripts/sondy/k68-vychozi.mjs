// Kolo 68 — výchozí rozložení podniku (spec §3.8, §7.2 k68-vychozi, AK-15).
//
// Vlastník si poskládá Přehled a jedním oknem ho dá jako výchozí celému
// vedení se zámkem. V Nastavení → Stránky upraví výchozí plochu zaměstnanců:
// widgety jsou jen schematické a editor NEPOŠLE žádný datový dotaz (data
// jiných lidí správci neprotečou). Odebrání i zámek se uloží PUTem do
// /api/rozlozeni/vychozi, „Obnovit výchozí z aplikace" pošle DELETE.
import { kontext, konec, tvrdi, otevri, lista, upravit, vUpravach, dokud, dotazyNa, BASE, OUT } from './k68-spolecne.mjs';

// 1) Přehled → úpravy → „···" → Uložit jako výchozí pro… → Celé vedení + Zamknout → PUT vychozi.
{
  const { ctx, p, stav, chyby } = await kontext();
  await otevri(p, '/employer/overview');
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await lista(p).getByRole('button', { name: 'Další možnosti úprav' }).click();
  const polozky = (await p.getByRole('menuitem').allInnerTexts()).map(s => s.trim());
  tvrdi('1: „···" v liště nabízí Uložit jako výchozí pro… a Obnovit výchozí rozložení', polozky.includes('Uložit jako výchozí pro…') && polozky.includes('Obnovit výchozí rozložení'), JSON.stringify(polozky));
  await p.getByRole('menuitem', { name: 'Uložit jako výchozí pro…' }).click();
  const okno = p.getByRole('dialog', { name: 'Uložit jako výchozí' });
  tvrdi('1: otevře se okno „Uložit jako výchozí"', await dokud(() => okno.isVisible(), 3000));
  const vyber = okno.getByLabel('Pro koho');
  await dokud(async () => (await vyber.locator('option').count()) > 1, 3000);
  const volby = await vyber.locator('option').allInnerTexts();
  tvrdi('1: „Pro koho" nabízí rozsahy s počtem lidí', volby.includes('Celé vedení (5)') && volby.includes('Provozní / Manažer směny (2)'), JSON.stringify(volby));
  await vyber.selectOption({ label: 'Celé vedení (5)' });
  await okno.getByRole('switch', { name: /Zamknout/ }).click();
  tvrdi('1: okno připomene, že každý uvidí jen své widgety', (await okno.innerText()).includes('Každý uvidí jen widgety, na které má oprávnění.'));
  await okno.getByRole('button', { name: 'Uložit výchozí' }).click();
  await dokud(() => stav.vychoziPuty.length > 0, 3000);
  const put = stav.vychoziPuty[0];
  tvrdi('1: PUT /api/rozlozeni/vychozi se stránkou vedeni.prehled a rozsahem typ:vedeni', put?.stranka === 'vedeni.prehled' && put?.rozsah === 'typ:vedeni', JSON.stringify(put ? { s: put.stranka, r: put.rozsah } : null));
  tvrdi('1: PUT nese zámek a aktuální plochu', put?.zamceno === true && (put?.polozky ?? []).length === 8, JSON.stringify({ z: put?.zamceno, n: put?.polozky?.length }));
  tvrdi('1: toast „Výchozí rozložení uloženo"', await dokud(() => p.getByText('Výchozí rozložení uloženo').isVisible(), 2000));
  tvrdi('1: osobní rozložení se tím nezměnilo (žádný PUT /api/rozlozeni)', stav.puty.length === 0, `${stav.puty.length}`);
  tvrdi('1: bez chyb v konzoli', chyby.length === 0, chyby.join(' | ').slice(0, 300));
  await ctx.close();
}

// 2–3) Nastavení → Stránky → Přehled (Zaměstnanci) → Upravit: schematicky, bez datových dotazů; odebrání, zámek, obnovení.
{
  const { ctx, p, stav, chyby } = await kontext();
  await p.goto(BASE + '/employer/overview?view=settings', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: /Stránky/ }).filter({ visible: true }).first().click();
  const nadpis = p.getByRole('heading', { name: 'Rozložení stránek' });
  tvrdi('2: Nastavení → Stránky ukáže „Rozložení stránek"', await dokud(() => nadpis.isVisible(), 3000));
  const skupina = p.getByRole('region', { name: 'Zaměstnanci' });
  await dokud(async () => (await skupina.innerText()).includes('Výchozí z aplikace'), 3000);
  tvrdi('2: řádek Přehled u Zaměstnanců ukazuje „Výchozí z aplikace"', (await skupina.innerText()).includes('Výchozí z aplikace'), await skupina.innerText());
  const od = Date.now();
  await skupina.getByRole('button', { name: 'Upravit' }).first().click();
  const plocha = p.locator('[data-plocha="zamestnanec.domu"]');
  await plocha.locator('li[data-instance]').first().waitFor({ timeout: 8000 });
  await p.waitForTimeout(1200);
  tvrdi('2: editor výchozího je trvale v režimu úprav', await plocha.evaluate(el => el.hasAttribute('data-upravy')));
  const lista2 = p.getByRole('region', { name: 'Úpravy stránky' });
  tvrdi('2: lišta ukazuje „Výchozí · Všichni zaměstnanci"', (await lista2.innerText()).includes('Výchozí · Všichni zaměstnanci'), await lista2.innerText());
  const schema = await plocha.locator('li[data-widget]').evaluateAll(els => els.map(e => ({ w: e.getAttribute('data-widget'), txt: (e.textContent ?? '').trim().slice(0, 60) })));
  tvrdi('2: widgety jsou jen schematické (název a popis, žádná data)', schema.length === 5 && schema.every(s => s.txt.length > 3), JSON.stringify(schema));
  const DATA = ['/api/closings/handover', '/api/shifts', '/api/attendance', '/api/tasks', '/api/announcements', '/api/inventory', '/api/availability'];
  tvrdi('2: editor nepošle žádný datový dotaz widgetů', dotazyNa(stav, DATA, od).length === 0, dotazyNa(stav, DATA, od).map(d => d.path).join(', '));
  await p.screenshot({ path: OUT + 'k68-vychozi-editor.png' });

  // Odebrat widget „−" → PUT vychozi bez něj (a s `odebrane`, protože server zachovává skryté).
  // Odznak se vlní (nikdy „stabilní") — posunout kartu doprostřed, ať ji nezakrývá lišta, a klepnout.
  await plocha.locator('li[data-widget="uzaverky.predavka"]').evaluate(el => el.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(300);
  await plocha.getByRole('button', { name: 'Odebrat widget Předávka' }).click({ force: true });
  await dokud(() => stav.vychoziPuty.length > 0, 3000);
  const put = stav.vychoziPuty.at(-1);
  tvrdi('2: odebrání pošle PUT vychozi bez widgetu', put?.rozsah === 'typ:zamestnanec' && !(put?.polozky ?? []).some(x => x.widget === 'uzaverky.predavka'), JSON.stringify(put?.polozky?.map(x => x.widget)));
  tvrdi('2: PUT vyjmenuje odebrané (server by ho jinak vrátil)', (put?.odebrane ?? []).includes('uzaverky-predavka'), JSON.stringify(put?.odebrane));
  // Zámek se uloží jako každá jiná změna.
  await p.getByRole('switch', { name: /Zamknout/ }).click();
  await dokud(() => stav.vychoziPuty.at(-1)?.zamceno === true, 3000);
  tvrdi('2: „Zamknout" se uloží (PUT se zamceno: true)', stav.vychoziPuty.at(-1)?.zamceno === true, JSON.stringify(stav.vychoziPuty.map(x => x.zamceno)));
  tvrdi('2: ani po úpravách žádný datový dotaz', dotazyNa(stav, DATA, od).length === 0, dotazyNa(stav, DATA, od).map(d => d.path).join(', '));

  // 3) „···" → Obnovit výchozí z aplikace → DELETE; zpět na seznam → „Výchozí z aplikace".
  await lista2.getByRole('button', { name: 'Další možnosti úprav' }).click();
  await p.getByRole('menuitem', { name: 'Obnovit výchozí z aplikace' }).click();
  tvrdi('3: „Obnovit výchozí z aplikace" pošle DELETE vychozi', await dokud(() => stav.vychoziDelete === 1, 3000), String(stav.vychoziDelete));
  await p.waitForTimeout(400);
  tvrdi('3: po obnovení je Předávka zpátky', await plocha.locator('li[data-widget="uzaverky.predavka"]').count() === 1);
  await p.getByRole('button', { name: 'Zpět na stránky' }).click();
  await dokud(() => nadpis.isVisible(), 3000);
  await p.waitForTimeout(600);
  tvrdi('3: seznam ukazuje „Výchozí z aplikace"', (await skupina.innerText()).includes('Výchozí z aplikace'), await skupina.innerText());
  tvrdi('bez chyb v konzoli', chyby.length === 0, chyby.join(' | ').slice(0, 300));
  await ctx.close();
}

await konec();
