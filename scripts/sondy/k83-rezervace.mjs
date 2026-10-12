// Kolo 7, balík R7-3 — Managero client: rezervace hosta bez časů v minulosti, automatické
// potvrzování v Nastavení a ruční rezervace v příjmu u obsluhy.
//
// Host (stránka podniku › Rezervace, telefon 390 px):
//  • v 15:00 se nenabídne 8:00 ani nic před 15:30 (předstih 30 min, lib/clientSlots);
//  • ve 21:00, kdy dnes nic nezbývá, řekne „Dnes už se nedá rezervovat" a tlačítko
//    „Zítra" přepne den (časy se zase nabídnou);
//  • odeslání pošle POST s časem z nabídky a potvrzenou rezervaci (auto-potvrzení) ohlásí
//    jako potvrzenou;
//  • německy bez přetečení.
// Vedení: Nastavení › Rezervace a objednávky — přepínač „Potvrzovat rezervace automaticky"
// a hranice skupiny se uloží PUTem; Objednávky › Fronta ukáže ručně zapsanou rezervaci se jménem.
//
// Hodiny prohlížeče se posouvají přes `posunCasu` (k68-spolecne) na přesný pražský čas,
// den i otevírací doba se skládají tady — sonda nezávisí na tom, kdy běží.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, dokud, otevri, BASE, DIR, OUT } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const TEL = { width: 390, height: 844 };
const dnes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
const zitra = (() => { const x = new Date(`${dnes}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); })();

/** Posun hodin tak, aby v Praze bylo právě `hh:mm`. */
function posunNa(hh, mm = 0) {
  const c = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
  const [h, m, s] = c.split(':').map(Number);
  return ((hh * 60 + mm) * 60 - (h * 3600 + m * 60 + s)) * 1000;
}

/** Stránka podniku: každý den 8:00–18:00, dnešek je skutečný dnešek, host přihlášený. */
const podnik = () => {
  const d = nacti('client_b_kavarna-u-lipy');
  d.today = dnes;
  d.business.hours = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => [String(i), { open: '08:00', close: '18:00' }]));
  d.business.reservationsOn = true;
  d.signedIn = true;
  return d;
};
const podvrhHosta = (stav) => (req, json) => {
  const path = new URL(req.url()).pathname;
  if (path === '/api/client/b/kavarna-u-lipy') return json(podnik());
  if (path === '/api/client/b/kavarna-u-lipy/reservations' && req.method() === 'POST') {
    const b = req.postDataJSON();
    (stav.rezervace ??= []).push(b);
    return json({ ok: true, reservation: { id: 501, date: b.date, time: b.time, party: b.party, note: b.note || null, status: 'confirmed' } });
  }
  return undefined;
};

async function stranka(p) {
  await p.goto(`${BASE}/client/kavarna-u-lipy?tab=reserve`, { waitUntil: 'networkidle' });
  await p.waitForSelector('h1', { timeout: 30000 });
  await p.getByRole('heading', { name: 'Rezervovat stůl' }).waitFor({ timeout: 10000 });
  await p.waitForTimeout(400);
}
const casy = (p) => p.locator('#r-time option').allTextContents();
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---------------------------------------------------------------------------
// Host v 15:00 — žádné časy v minulosti
// ---------------------------------------------------------------------------
{
  const stav = {};
  const { ctx, p, chyby } = await kontext({ role: 'customer', viewport: TEL, mobil: true, posunCasu: posunNa(15, 0), dalsi: podvrhHosta(stav) });
  await stranka(p);
  const c = await casy(p);
  tvrdi('H1: v 15:00 se nenabídne 8:00', c.length > 0 && !c.includes('08:00'), c.join(','));
  tvrdi('H1: první nabízený čas je 15:30 (předstih 30 minut), poslední 17:00', c[0] === '15:30' && c.at(-1) === '17:00', c.join(','));
  tvrdi('H1: den je dnešek', await p.locator('#r-date').inputValue() === dnes);
  await p.locator('#r-date').fill(zitra);
  await p.waitForTimeout(300);
  const cz = await casy(p);
  tvrdi('H1: zítra beze změny — od otevření 8:00', cz[0] === '08:00', cz.join(','));
  await p.locator('#r-date').fill(dnes);
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Odeslat rezervaci' }).click();
  const b = await dokud(() => (stav.rezervace ?? []).at(-1), 3000);
  tvrdi('H1: odeslání pošle POST s dnešním dnem a časem z nabídky (15:30)', !!b && b.date === dnes && b.time === '15:30', JSON.stringify(b));
  tvrdi('H5: rezervaci potvrzenou automaticky ohlásí jako potvrzenou', await dokud(() => p.getByText('Rezervace je potvrzená. Těšíme se na tebe.').isVisible(), 3000));
  tvrdi('H1: telefon bez přetečení', await bezPreteceni(p));
  await p.screenshot({ path: OUT + 'k83-rezervace-host-15h.png', fullPage: true });
  tvrdi('H1: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Host ve 21:00 — dnes nic nezbývá
// ---------------------------------------------------------------------------
for (const jazyk of ['cs', 'de', 'pl']) {
  const stav = {};
  const { ctx, p, chyby } = await kontext({ role: 'customer', viewport: TEL, mobil: true, posunCasu: posunNa(21, 0), dalsi: podvrhHosta(stav) });
  if (jazyk !== 'cs') await ctx.addCookies([{ name: 'managero-lang', value: jazyk, domain: 'localhost', path: '/', sameSite: 'Lax' }]);
  await p.goto(`${BASE}/client/kavarna-u-lipy?tab=reserve`, { waitUntil: 'networkidle' });
  await p.waitForSelector('h1', { timeout: 30000 });
  await p.waitForTimeout(700);
  const veta = { cs: 'Dnes už se nedá rezervovat, vyber zítřek.', de: 'Heute kann man nicht mehr reservieren, wähl morgen.', pl: 'Na dziś nie da się już zarezerwować, wybierz jutro.' }[jazyk];
  const zitraTl = { cs: 'Zítra', de: 'Morgen', pl: 'Jutro' }[jazyk];
  tvrdi(`H2 ${jazyk}: ve 21:00 „${veta}"`, await dokud(() => p.getByText(veta).isVisible(), 3000));
  tvrdi(`H2 ${jazyk}: žádný výběr času a odeslání zamčené`, await p.locator('#r-time').count() === 0 && await p.locator('form button[type="submit"]').isDisabled());
  tvrdi(`H2 ${jazyk}: bez přetečení`, await bezPreteceni(p));
  if (jazyk === 'cs') await p.screenshot({ path: OUT + 'k83-rezervace-host-vecer.png', fullPage: true });
  const tl = p.getByRole('button', { name: zitraTl, exact: true });
  const box = await tl.boundingBox();
  tvrdi(`H2 ${jazyk}: tlačítko „${zitraTl}" má aspoň 44 px`, !!box && box.height >= 44, JSON.stringify(box));
  await tl.click();
  await p.waitForTimeout(300);
  tvrdi(`H2 ${jazyk}: „${zitraTl}" přepne den na zítřek a nabídne časy od 8:00`, await p.locator('#r-date').inputValue() === zitra && (await casy(p))[0] === '08:00');
  tvrdi(`H2 ${jazyk}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Vedení: automatické potvrzování v Nastavení
// ---------------------------------------------------------------------------
for (const [vp, mobil, jmeno] of [[{ width: 1280, height: 900 }, false, 'desk'], [TEL, true, 'tel']]) {
  const stav = {};
  const { ctx, p, chyby } = await kontext({ viewport: vp, mobil, fix: nacti('k69-b8-rozlozeni-rezervace'), dalsi: (req, json) => {
    const path = new URL(req.url()).pathname;
    if (path === '/api/client/admin/profile' && req.method() === 'PUT') {
      const b = req.postDataJSON();
      (stav.puty ??= []).push(b);
      return json({ ok: true, profile: { ...nacti('client_admin_profile').profile, ...b }, url: 'https://www.managero.app/client/kavarna-u-lipy' });
    }
    return undefined;
  } });
  await p.goto(`${BASE}/employer/overview?mode=client&tab=settings`, { waitUntil: 'networkidle' });
  const prepinac = p.getByRole('switch', { name: /Potvrzovat rezervace automaticky/ });
  tvrdi(`N ${jmeno}: v Nastavení je přepínač „Potvrzovat rezervace automaticky"`, await dokud(() => prepinac.isVisible(), 20000));
  tvrdi(`N ${jmeno}: hranice skupiny se ukáže, až když je zapnuto`, await p.getByLabel('Samy se potvrdí skupiny do (osob)').count() === 0);
  await prepinac.click();
  const hranice = p.getByLabel('Samy se potvrdí skupiny do (osob)');
  tvrdi(`N ${jmeno}: po zapnutí pole hranice s klávesnicí na čísla`, await dokud(() => hranice.isVisible(), 2000) && await hranice.getAttribute('inputmode') === 'numeric');
  await hranice.fill('6');
  tvrdi(`N ${jmeno}: nápověda řekne, které skupiny dál čekají (od 7 osob)`, await p.getByText('Větší skupiny (od 7 osob) dál čekají na tvé potvrzení.').isVisible());
  tvrdi(`N ${jmeno}: bez přetečení`, await bezPreteceni(p));
  await p.screenshot({ path: OUT + `k83-rezervace-nastaveni-${jmeno}.png`, fullPage: true });
  await p.getByRole('button', { name: 'Uložit', exact: true }).first().click();
  const put = await dokud(() => (stav.puty ?? []).at(-1), 3000);
  tvrdi(`N ${jmeno}: Uložit pošle PUT s auto_confirm: true a hranicí 6`, !!put && put.auto_confirm === true && put.auto_confirm_max_party === 6, JSON.stringify(put && { a: put.auto_confirm, m: put.auto_confirm_max_party }));
  tvrdi(`N ${jmeno}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Vedení: rozepsaná Nová rezervace přežije přechod na jinou záložku (useDraft)
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await kontext({ viewport: TEL, mobil: true, fix: nacti('k69-b8-rozlozeni-rezervace') });
  await otevri(p, '/employer/overview?mode=client&tab=reservations', 'vedeni.klient_rezervace');
  const zalozka = (jmeno) => p.getByRole('navigation', { name: 'Spodní navigace klienta' }).getByRole('button', { name: new RegExp(jmeno) });
  const okno = p.getByRole('dialog', { name: 'Nová rezervace' });
  const novaTl = p.locator('[data-plocha]').getByRole('button', { name: 'Nová rezervace' });
  // Odchod z Rezervací s otevřeným oknem (dok pod oknem; záložka se odmontuje i s oknem).
  const odejdi = () => p.evaluate(() => { const b = [...document.querySelectorAll('nav[aria-label="Spodní navigace klienta"] button')].find(x => /Objednávky/.test(x.textContent ?? '')); b?.click(); });
  // Bez psaného textu se nic neukládá: okno samo předvybere čas, to není rozepsaná práce.
  await novaTl.click();
  await dokud(() => okno.isVisible(), 2000);
  await p.waitForTimeout(400);
  await odejdi();
  await p.waitForTimeout(1000);
  await zalozka('Rezervace').click();
  await p.waitForTimeout(1200);
  tvrdi('D1: okno bez psaného textu se po návratu samo neotevře', !(await okno.isVisible()));
  // S rozepsaným jménem: přechod na Objednávky a zpět okno otevře a přizná obnovení.
  await novaTl.click();
  await dokud(() => okno.isVisible(), 2000);
  await okno.getByLabel('Jméno').fill('Rozepsaný Host');
  await okno.getByLabel('Poznámka').fill('Volal v poledne');
  await p.waitForTimeout(300);
  await odejdi();
  await p.waitForTimeout(1000);
  await zalozka('Rezervace').click().catch(() => {});
  tvrdi('D2: po návratu se okno s rozepsanou rezervací otevře samo', await dokud(() => okno.isVisible(), 4000));
  await p.waitForTimeout(400);
  const obnoveno = { jmeno: await okno.getByLabel('Jméno').inputValue(), pozn: await okno.getByLabel('Poznámka').inputValue(), veta: await okno.getByText('Vrátili jsme ti rozepsané z minula.').isVisible() };
  tvrdi('D2: …se jménem a poznámkou a přizná, že je obnovené', obnoveno.jmeno === 'Rozepsaný Host' && obnoveno.pozn === 'Volal v poledne' && obnoveno.veta, JSON.stringify(obnoveno));
  await okno.getByRole('button', { name: 'Zrušit', exact: true }).click();
  await p.waitForTimeout(400);
  await zalozka('Objednávky').click();
  await p.waitForTimeout(800);
  await zalozka('Rezervace').click();
  await p.waitForTimeout(1200);
  tvrdi('D3: „Zrušit" rozepsané zahodí — okno se už samo neotevře', !(await okno.isVisible()));
  tvrdi('D: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Příjem u obsluhy: ručně zapsaná rezervace se jménem
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await kontext({ fix: nacti('k69-b8-rozlozeni-objednavky'), dalsi: (req, json) => (new URL(req.url()).pathname === '/api/client/staff/inbox' ? json(nacti('k69-b8-inbox')) : undefined) });
  await otevri(p, '/employer/overview?mode=client&tab=orders', 'vedeni.klient_objednavky');
  const radek = p.locator('[data-plocha] li[data-widget="nastroj"] li', { hasText: 'Pavel Horák' });
  tvrdi('I1: příjem ukáže ručně zapsanou rezervaci se jménem hosta bez účtu', await dokud(() => radek.first().isVisible(), 5000));
  tvrdi('I1: …a že je zapsaná ručně', await radek.first().getByText(/zapsáno ručně/).isVisible());
  tvrdi('I1: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await konec();
