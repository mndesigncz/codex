// Kolo 68 — plocha na telefonu 390 × 844 s dotykem (spec §4.12, §7.2 k68-telefon, AK-1, 4, 11).
//
// Dva malé widgety vedle sebe jako na iOS, nic nepřetéká do strany, podržení
// prstem otevře menu, tah prstem po 180 ms držení přeskládá a pošle jeden
// PUT, rychlý švih bez držení NEtáhne, ale posune stránku (tah nesmí ukrást
// rolování — přehled jsou samé widgety). Lišta úprav sedí nad dokem, galerie
// vyjede jako list zdola a klepnutí na prázdné místo úpravy ukončí.
// Nakonec Domů zaměstnance v tmavém režimu: bez přetečení, obrys a odznaky čitelné.
import {
  kontext, konec, tvrdi, otevri, poradi, li, lista, hotovo, vUpravach, stred, dokud, dotyk,
  podrzPrstem, klepniPrstem, tahniPrstem, mistoPodPlochou, poradiPutu, roleMine, FIX_VEDENI, FIX_DOMU, OUT,
} from './k68-spolecne.mjs';

const TEL = { width: 390, height: 844 };
const PUVODNI = FIX_VEDENI.polozky.map(x => x.id);
const preteceni = (p) => p.evaluate(() => {
  const m = document.querySelector('main');
  return { doc: document.documentElement.scrollWidth, main: m ? m.scrollWidth - m.clientWidth : 0 };
});
const posunuto = (p) => p.evaluate(() => Math.max(window.scrollY, document.scrollingElement?.scrollTop ?? 0, ...[...document.querySelectorAll('main')].map(m => m.scrollTop)));

{
  const { ctx, p, stav, chyby } = await kontext({ viewport: TEL, mobil: true });
  const cdp = await dotyk(p);
  await otevri(p, '/employer/overview');

  // 1) Dva S vedle sebe, bez vodorovného přetečení.
  const a = await li(p, PUVODNI[0]).boundingBox(); const b = await li(p, PUVODNI[1]).boundingBox();
  tvrdi('1: dva malé widgety leží vedle sebe (stejné y, různé x)', Math.abs(a.y - b.y) <= 1 && b.x > a.x + a.width - 1, `${JSON.stringify(a)} ${JSON.stringify(b)}`);
  const pt = await preteceni(p);
  tvrdi('1: žádné vodorovné přetečení (dokument ≤ 390, main bez přesahu)', pt.doc <= 390 && pt.main <= 0, JSON.stringify(pt));
  await p.screenshot({ path: OUT + 'k68-prehled-tel-klid.png' });

  // 2) Podržení prstem → menu u prstu; „Upravit stránku" → úpravy.
  const s = await stred(li(p, PUVODNI[1]));
  await podrzPrstem(cdp, p, s.x, s.y);
  const menu = p.getByRole('menu');
  tvrdi('2: podržení prstem otevře menu widgetu', await dokud(() => menu.isVisible(), 1500));
  const mr = await menu.boundingBox().catch(() => null);
  tvrdi('2: menu se vejde do okna (8 px od okrajů)', !!mr && mr.x >= 7 && mr.x + mr.width <= 390 - 7 && mr.y >= 7 && mr.y + mr.height <= 844 - 7, JSON.stringify(mr));
  tvrdi('2: podržení prstem nic neoznačilo (žádný výběr textu)', await p.evaluate(() => (getSelection()?.toString() ?? '') === ''));
  await p.getByRole('menuitem', { name: 'Upravit stránku' }).click();
  tvrdi('2: „Upravit stránku" vstoupí do úprav', await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  tvrdi('2: v úpravách mají widgety touch-action pan-y (rolování zůstává prohlížeči)', await li(p, PUVODNI[0]).evaluate(el => getComputedStyle(el).touchAction === 'pan-y'));

  // 3) Tah prstem (250 ms držení) první → třetí: nové pořadí a jeden PUT.
  await p.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main').forEach(m => { m.scrollTop = 0; }); });
  await p.waitForTimeout(200);
  const z = await stred(li(p, PUVODNI[0])); const na = await stred(li(p, PUVODNI[2]));
  await tahniPrstem(cdp, p, z, na);
  const po = await poradi(p);
  tvrdi('3: tah prstem přesune první widget na třetí místo', po[2] === PUVODNI[0], JSON.stringify(po));
  await dokud(() => stav.puty.length > 0, 2000);
  await p.waitForTimeout(600);
  tvrdi('3: tah prstem pošle právě jeden PUT s novým pořadím', stav.puty.length === 1 && JSON.stringify(poradiPutu(stav.puty[0])) === JSON.stringify(po), `${stav.puty.length} PUT`);
  tvrdi('3: tažená karta se usadí', await li(p, PUVODNI[0]).evaluate(el => el.style.transform === '' || el.style.transform === 'none'));

  // Rychlý švih nahoru bez 180 ms držení: tah nezačne, stránka se posune, pořadí zůstane.
  await p.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main').forEach(m => { m.scrollTop = 0; }); });
  await p.waitForTimeout(200);
  const pred = await poradi(p);
  const putu = stav.puty.length;
  const w = await stred(li(p, pred[4]));
  await tahniPrstem(cdp, p, { x: w.x, y: Math.min(w.y, 780) }, { x: w.x, y: 120 }, 0, 8, 12);
  await p.waitForTimeout(900);
  tvrdi('3: rychlý švih bez držení nezačne tah (pořadí beze změny, žádný PUT)', JSON.stringify(await poradi(p)) === JSON.stringify(pred) && stav.puty.length === putu, JSON.stringify(await poradi(p)));
  tvrdi('3: švih místo toho posune stránku', (await posunuto(p)) > 0, String(await posunuto(p)));
  await p.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main').forEach(m => { m.scrollTop = 0; }); });
  await p.waitForTimeout(300);

  // 4) Lišta nad dokem; galerie jako list zdola; klepnutí na prázdné místo ukončí úpravy.
  const lr = await lista(p).boundingBox();
  const dok = await p.locator('nav.dock-strong').first().boundingBox().catch(() => null);
  tvrdi('4: spodek lišty úprav leží nad dokem', !!lr && (!dok || lr.y + lr.height <= dok.y + 1), `${JSON.stringify(lr)} dok ${JSON.stringify(dok)}`);
  const hr = await hotovo(p).boundingBox();
  tvrdi('4: „Hotovo" má dotykovou plochu ≥ 32 px', !!hr && hr.height >= 32, JSON.stringify(hr));
  await p.screenshot({ path: OUT + 'k68-prehled-tel-upravy.png' });
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(600);
  const gr = await galerie.boundingBox();
  tvrdi('4: galerie je list zdola (spodek dialogu = spodek okna)', !!gr && Math.abs(gr.y + gr.height - 844) <= 40 && gr.width >= 380, JSON.stringify(gr));
  const gpt = await preteceni(p);
  tvrdi('4: galerie nepřetéká do strany', gpt.doc <= 390, JSON.stringify(gpt));
  await p.keyboard.press('Escape');
  await dokud(async () => (await p.getByRole('dialog').count()) === 0, 1500);
  await p.waitForTimeout(300);
  const pod = await mistoPodPlochou(p);
  await p.waitForTimeout(200);
  await klepniPrstem(cdp, p, pod.x, pod.y);
  tvrdi('4: klepnutí na prázdné místo úpravy ukončí', await dokud(async () => !(await vUpravach(p)), 1500));
  tvrdi('bez chyb v konzoli', chyby.length === 0, chyby.join(' | ').slice(0, 300));
  await ctx.close();
}

// Domů zaměstnance, telefon, tmavý režim: bez přetečení, S vedle sebe, obrys a odznak čitelné.
{
  const { ctx, p, chyby } = await kontext({ viewport: TEL, mobil: true, tmavy: true, role: 'employee', mineData: roleMine('barista'), fix: FIX_DOMU });
  await otevri(p, '/employee/shifts', 'zamestnanec.domu');
  const pt = await preteceni(p);
  tvrdi('domů: telefon v tmavém režimu bez vodorovného přetečení', pt.doc <= 390 && pt.main <= 0, JSON.stringify(pt));
  tvrdi('domů: tmavý režim je zapnutý', await p.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark'));
  await p.screenshot({ path: OUT + 'k68-domu-tel-klid.png' });
  const upr = p.locator('[data-plocha]').getByRole('button', { name: 'Upravit stránku' }).or(p.locator('[data-plocha]').getByRole('button', { name: 'Upravit', exact: true }));
  // Na telefonu jsou vedlejší akce hlavičky v „···" — vstup do úprav přes podržení prázdného místa.
  const cdp = await dotyk(p);
  const pod = await mistoPodPlochou(p);
  await p.waitForTimeout(200);
  await podrzPrstem(cdp, p, pod.x, pod.y);
  tvrdi('domů: podržení prázdného místa vstoupí do úprav', await dokud(() => vUpravach(p), 1500), `upravit: ${await upr.count()}`);
  await p.waitForTimeout(500);
  const odznak = await p.locator('[data-plocha] [data-odznak]').first().evaluate(el => {
    const cs = getComputedStyle(el); return { bg: cs.backgroundColor, fg: cs.color };
  });
  const jas = (c) => { const m = /\d+(\.\d+)?/g; const [r, g, bb] = (c.match(m) ?? []).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bb); };
  const kontrast = (x, y) => { const [h, l] = [jas(x), jas(y)].sort((u, v) => v - u); return (h + 0.05) / (l + 0.05); };
  tvrdi('domů tmavě: odznak „−" má kontrast ≥ 4,5 : 1', kontrast(odznak.bg, odznak.fg) >= 4.5, JSON.stringify(odznak));
  await p.screenshot({ path: OUT + 'k68-domu-tel-upravy.png' });
  const pt2 = await preteceni(p);
  tvrdi('domů: ani v úpravách nic nepřetéká', pt2.doc <= 390, JSON.stringify(pt2));
  tvrdi('domů: bez chyb v konzoli', chyby.length === 0, chyby.join(' | ').slice(0, 300));
  await ctx.close();
}

await konec();
