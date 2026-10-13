// Kolo 7, balík R7-5 — Nápady (zamítnutí s důvodem, poznámky pod podnětem) a filtry
// Návodů a Nápadů na telefonu.
//
// 1280 (vedení, Nápady): Segmented na „Zamítnout" otevře okno „Proč zamítnout?" místo
// okamžitého PATCH; Zrušit nic nepošle a stav zůstane; Zamítnout pošle jediný PATCH
// { status: 'declined', reason }. Naplánovat jde bez okna. U podnětu sbalené
// „Poznámky (n)" — počty jedním dotazem, po rozbalení vlákno s důvodem.
// 390 (vedení i zaměstnanec, Návody i Nápady): pásy filtrů skryté za „Filtry · N",
// po rozbalení vidět a dokument nepřetéká; zapnutý filtr ukáže počet. Okno „Proč
// zamítnout?" na telefonu vyjede zdola. Zaměstnanec v poznámkách vidí důvod.
//
// Fixtury: k69-b6a-suggestions (podněty), k69-b6b-guides (návody), k83-postupy-poznamky-podnetu.
import {
  kontext, konec, tvrdi, otevri, dokud, fixtura, roleMine, OUT,
} from './k68-spolecne.mjs';

const FIX_NAPADY = fixtura('k69-b6a-rozlozeni-napady');
const FIX_NAPADY_ZAM = fixtura('k69-b6a-rozlozeni-napady-zam');
const FIX_NAVODY = fixtura('k69-b6b-rozlozeni-navody');
const FIX_NAVODY_ZAM = fixtura('k69-b6b-rozlozeni-navody-zam');
const NAPADY = '/employer/overview?view=suggestions';
const NAPADY_ZAM = '/employee/shifts?view=suggestions';
const NAVODY = '/employer/overview?view=guides';
const NAVODY_ZAM = '/employee/shifts?view=guides';

/** Podvrh Nápadů, poznámek a návodů; zápisy do `stav`. */
const podvrh = ({ spravuje = true } = {}) => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (path === '/api/suggestions' && m === 'GET') return json({ ...fixtura('k69-b6a-suggestions'), isEmployer: spravuje });
  if (/^\/api\/suggestions\/\d+$/.test(path) && m === 'PATCH') {
    (stav.patche ??= []).push({ id: Number(path.split('/').pop()), ...req.postDataJSON() });
    return json({ ok: true });
  }
  if (path === '/api/notes') {
    if (m === 'GET' && url.searchParams.get('pocty') != null) {
      (stav.dotazyPoctu ??= []).push(url.searchParams.get('pocty'));
      return json({ pocty: { 11: 0, 12: 0, 13: 0, 14: 2 } });
    }
    if (m === 'GET') {
      (stav.dotazyPoznamek ??= []).push(`${url.searchParams.get('typ')}:${url.searchParams.get('id')}`);
      return json(url.searchParams.get('typ') === 'suggestion' && url.searchParams.get('id') === '14' ? fixtura('k83-postupy-poznamky-podnetu') : []);
    }
    return json({ ok: true });
  }
  if (path === '/api/guides' && m === 'GET') return json(fixtura('k69-b6b-guides'));
  if (path === '/api/guides/categories') return json(fixtura('guides_categories'));
  if (path === '/api/guides/ctenari') return json(fixtura('k69-b6b-ctenari'));
  if (path === '/api/organization/podniky' || path === '/api/organization') return json({ podniky: [] });
  return undefined;
};

const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const vybrano = (loc) => loc.getAttribute('aria-selected');

// ---------------------------------------------------------------------------
// 1280: zamítnutí s důvodem a poznámky pod podnětem
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_NAPADY, dalsi: podvrh() });
  await otevri(p, NAPADY, 'vedeni.napady');
  const nastroj = widgetLi(p, 'nastroj');
  const seg = nastroj.getByRole('tablist', { name: 'Stav podnětu Nové zástěry' });
  await seg.getByRole('tab', { name: 'Zamítnout' }).click();
  const okno = p.getByRole('dialog', { name: 'Proč zamítnout?' });
  tvrdi('N1: Segmented na „Zamítnout" otevře okno „Proč zamítnout?" s názvem podnětu', await dokud(() => okno.isVisible(), 1500)
    && (await okno.innerText()).includes('Nové zástěry'));
  tvrdi('N1: …a zatím nic neodešlo', !(stav.patche ?? []).length, JSON.stringify(stav.patche));
  tvrdi('N1: pole „Důvod (uvidí autor)" je nepovinné, nejvýš 300 znaků', await okno.getByLabel('Důvod (uvidí autor)').getAttribute('maxlength') === '300'
    && await okno.getByRole('button', { name: 'Zamítnout' }).isEnabled());
  await p.screenshot({ path: OUT + 'k83-napady-zamitnout-desk.png' });
  await okno.getByRole('button', { name: 'Zrušit' }).click();
  tvrdi('N2: Zrušit zavře okno, nic nepošle a Segmented zůstane na „Nový"', await dokud(async () => (await okno.count()) === 0, 1500)
    && !(stav.patche ?? []).length && await vybrano(seg.getByRole('tab', { name: 'Nový' })) === 'true');
  await seg.getByRole('tab', { name: 'Zamítnout' }).click();
  await okno.getByLabel('Důvod (uvidí autor)').fill('Zástěry jsme objednali minulý měsíc.');
  await okno.getByRole('button', { name: 'Zamítnout' }).click();
  tvrdi('N3: Zamítnout pošle jediný PATCH { status: declined, reason }', await dokud(() => (stav.patche ?? []).length === 1, 2000)
    && stav.patche[0].id === 13 && stav.patche[0].status === 'declined' && stav.patche[0].reason === 'Zástěry jsme objednali minulý měsíc.', JSON.stringify(stav.patche));
  tvrdi('N3: …okno se zavře a ohlásí, že důvod dostal autor', await dokud(async () => (await okno.count()) === 0, 2000)
    && await dokud(() => p.getByText('Podnět je zamítnutý, důvod dostal autor.').isVisible(), 2000));
  // Naplánovat bez okna.
  await nastroj.getByRole('tablist', { name: 'Stav podnětu Druhý mlýnek na kávu' }).getByRole('tab', { name: 'Naplánovat' }).click();
  tvrdi('N4: Naplánovat jde bez okna rovnou PATCH { status: planned }', await dokud(() => (stav.patche ?? []).some(x => x.id === 11 && x.status === 'planned'), 2000)
    && await p.getByRole('dialog', { name: 'Proč zamítnout?' }).count() === 0, JSON.stringify(stav.patche));
  // Poznámky pod podnětem.
  tvrdi('N5: počty poznámek jedním dotazem pro všechny podněty', (stav.dotazyPoctu ?? []).length >= 1 && stav.dotazyPoctu[0] === '11,12,13,14', JSON.stringify(stav.dotazyPoctu));
  const tlPozn = nastroj.getByRole('button', { name: 'Poznámky (2)' });
  tvrdi('N5: u Brunche sbalené „Poznámky (2)", u ostatních „Poznámky"', await tlPozn.isVisible() && await tlPozn.getAttribute('aria-expanded') === 'false'
    && await nastroj.getByRole('button', { name: 'Poznámky', exact: true }).count() === 3);
  tvrdi('N5: poznámky se před rozbalením nenačítají', !(stav.dotazyPoznamek ?? []).length);
  await tlPozn.click();
  tvrdi('N5: rozbalení načte vlákno podnětu 14 a ukáže důvod', await dokud(() => nastroj.getByText('brunch zkusíme až po sezóně').isVisible(), 2000)
    && await tlPozn.getAttribute('aria-expanded') === 'true' && (stav.dotazyPoznamek ?? []).includes('suggestion:14'));
  tvrdi('N5: v rozbaleném vláknu jde napsat poznámku', await nastroj.getByLabel('Přidat poznámku').isVisible());
  await p.screenshot({ path: OUT + 'k83-napady-poznamky-desk.png', fullPage: true });
  await tlPozn.click();
  tvrdi('N5: druhé klepnutí vlákno sbalí', await dokud(async () => !(await nastroj.getByText('brunch zkusíme až po sezóně').isVisible()), 1500));
  tvrdi('N: 1280 bez vodorovného přetečení', await bezPreteceni(p));
  tvrdi('N: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 390: „Filtry · N" v Nápadech a Návodech (vedení i zaměstnanec), okno zdola
// ---------------------------------------------------------------------------
const pasyViditelne = (p) => p.evaluate(() => [...document.querySelectorAll('[data-plocha] [role=group]')]
  .filter(e => /^(Filtr podle stavu|Kategorie návodů|Stav návodů)$/.test(e.getAttribute('aria-label') ?? ''))
  .map(e => ({ jmeno: e.getAttribute('aria-label'), videt: e.getBoundingClientRect().width > 0, vejde: e.getBoundingClientRect().right <= innerWidth + 1 })));

for (const [popis, opts, cesta, stranka, fix, pasy, pilulka] of [
  ['vedení Nápady', {}, NAPADY, 'vedeni.napady', FIX_NAPADY, ['Filtr podle stavu'], /^Nové/],
  ['zaměstnanec Nápady', { role: 'employee', mineData: roleMine('barista'), spravuje: false }, NAPADY_ZAM, 'zamestnanec.napady', FIX_NAPADY_ZAM, ['Filtr podle stavu'], /^Nové/],
  ['vedení Návody', {}, NAVODY, 'vedeni.navody', FIX_NAVODY, ['Kategorie návodů', 'Stav návodů'], /^Bar/],
  ['zaměstnanec Návody', { role: 'employee', mineData: roleMine('barista') }, NAVODY_ZAM, 'zamestnanec.navody', FIX_NAVODY_ZAM, ['Kategorie návodů', 'Stav návodů'], /^Bar/],
]) {
  const { spravuje, ...k } = opts;
  const { ctx, p, chyby } = await kontext({ fix, viewport: { width: 390, height: 844 }, mobil: true, ...k, dalsi: podvrh({ spravuje: spravuje ?? true }) });
  await otevri(p, cesta, stranka);
  const nastroj = widgetLi(p, 'nastroj');
  const filtry = nastroj.getByRole('button', { name: /^Filtry/ });
  const pred = await pasyViditelne(p);
  tvrdi(`F1 ${popis} 390: tlačítko „Filtry" vidět, pásy skryté`, await filtry.isVisible() && await filtry.getAttribute('aria-expanded') === 'false'
    && pred.length === pasy.length && pred.every(x => !x.videt), JSON.stringify(pred));
  const vyska = await filtry.evaluate(el => Math.round(el.getBoundingClientRect().height));
  tvrdi(`F1 ${popis} 390: aria-controls míří na pásy`, !!(await filtry.getAttribute('aria-controls')) && await p.locator(`[id="${await filtry.getAttribute('aria-controls')}"]`).count() === 1, `výška ${vyska}`);
  await filtry.click();
  const po = await pasyViditelne(p);
  tvrdi(`F2 ${popis} 390: po rozbalení jsou pásy vidět a vejdou se, dokument nepřetéká`, await filtry.getAttribute('aria-expanded') === 'true'
    && po.every(x => x.videt && x.vejde) && await bezPreteceni(p), JSON.stringify(po));
  await p.screenshot({ path: OUT + `k83-filtry-${cesta.includes('employee') ? 'zam' : 'vedeni'}-${cesta.includes('guides') ? 'navody' : 'napady'}-tel.png` });
  await nastroj.getByRole('group', { name: pasy[0] }).getByRole('button', { name: pilulka }).click();
  tvrdi(`F3 ${popis} 390: zapnutý filtr ukáže „Filtry · 1"`, await dokud(() => nastroj.getByRole('button', { name: 'Filtry · 1' }).isVisible(), 1500));
  await nastroj.getByRole('button', { name: 'Filtry · 1' }).click();
  tvrdi(`F3 ${popis} 390: se zapnutým filtrem pás zůstane vidět (jde zrušit druhým klepnutím)`, (await pasyViditelne(p)).find(x => x.jmeno === pasy[0])?.videt === true);
  await nastroj.getByRole('group', { name: pasy[0] }).getByRole('button', { name: pilulka }).click();
  tvrdi(`F3 ${popis} 390: druhé klepnutí na pilulku filtr zruší („Filtry" bez počtu)`, await dokud(() => nastroj.getByRole('button', { name: 'Filtry', exact: true }).isVisible(), 1500));
  tvrdi(`F ${popis}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// Okno „Proč zamítnout?" na telefonu vyjíždí zdola.
{
  const { ctx, p } = await kontext({ fix: FIX_NAPADY, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, NAPADY, 'vedeni.napady');
  const seg = widgetLi(p, 'nastroj').getByRole('tablist', { name: 'Stav podnětu Nové zástěry' });
  await seg.scrollIntoViewIfNeeded();
  await seg.getByRole('tab', { name: 'Zamítnout' }).click();
  const okno = p.getByRole('dialog', { name: 'Proč zamítnout?' });
  await dokud(() => okno.isVisible(), 1500);
  await p.waitForTimeout(450);
  const r = await okno.evaluate(el => { const b = el.getBoundingClientRect(); return { spodek: Math.round(b.bottom), sirka: Math.round(b.width), preteka: el.scrollWidth > el.clientWidth + 1 }; });
  tvrdi('N6: okno „Proč zamítnout?" na telefonu dosedne na spodní hranu přes celou šířku a nepřetéká', r.spodek >= 840 && r.sirka >= 388 && !r.preteka, JSON.stringify(r));
  const pole = await okno.getByLabel('Důvod (uvidí autor)').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  tvrdi('N6: pole důvodu má na dotyku písmo ≥ 16 px (bez zoomu)', pole >= 16, String(pole));
  await p.screenshot({ path: OUT + 'k83-napady-zamitnout-tel.png' });
  await ctx.close();
}

// Zaměstnanec vidí důvod zamítnutí v poznámkách svého podnětu.
{
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: FIX_NAPADY_ZAM, mineData: roleMine('barista'), viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh({ spravuje: false }) });
  await otevri(p, NAPADY_ZAM, 'zamestnanec.napady');
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('Z1: zaměstnanec nemá posun stavu, ale má „Poznámky (2)" u zamítnutého brunche', await nastroj.getByRole('tablist', { name: /^Stav podnětu/ }).count() === 0
    && await nastroj.getByRole('button', { name: 'Poznámky (2)' }).isVisible());
  await nastroj.getByRole('button', { name: 'Poznámky (2)' }).click();
  tvrdi('Z1: …po rozbalení vidí důvod od vedení', await dokud(() => nastroj.getByText('brunch zkusíme až po sezóně').isVisible(), 2000));
  tvrdi('Z1: 390 bez přetečení i s rozbaleným vláknem', await bezPreteceni(p));
  await nastroj.getByText('brunch zkusíme až po sezóně').scrollIntoViewIfNeeded();
  await p.screenshot({ path: OUT + 'k83-napady-poznamky-zam-tel.png' });
  tvrdi('Z1: zaměstnanec nic nezapsal', !(stav.patche ?? []).length);
  await ctx.close();
}

await konec();
