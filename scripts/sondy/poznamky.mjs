// Poznámky k věcem (components/Poznamky.tsx, /api/notes) na detailu úkolu z Úkolů vedení i zaměstnance:
// seznam s počtem v nadpisu („Poznámky · 2"), autor, „před 2 h", „upraveno", víceřádkový text; přidání přes
// Ctrl+Enter i tlačítkem pošle POST {typ:'task', id, text} a poznámka se ukáže hned; Enter dělá nový řádek;
// odmítnutý zápis vrátí text do pole a přizná se hláškou; smazání jde přes okno (ne confirm()) a pošle DELETE ?id=;
// telefon 390 bez přetečení. Zaměstnanec: cizí poznámka bez „···", vlastní jde upravit (PATCH).
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, roleMine, DIR, OUT } from './k68-spolecne.mjs';

const praha = (o = 0) => ((d) => { d.setUTCDate(d.getUTCDate() + o); return d.toISOString().slice(0, 10); })(new Date(`${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now()))}T12:00:00Z`));
const DNY = { DNES: praha(0), VCERA: praha(-1), PREDVCEREM: praha(-2), ZITRA: praha(1), POZDEJI: praha(20) };
const CASY = {
  CAS_DNES: new Date(Date.now() - 60000).toISOString(), CAS_PREDVCEREM: new Date(Date.now() - 2 * 86400000).toISOString(),
  CAS_PRED_2H: new Date(Date.now() - 2 * 3600000).toISOString(), CAS_PRED_3D: new Date(Date.now() - 3 * 86400000).toISOString(),
};
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries({ ...DNY, ...CASY })) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t);
};
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1);
/** Tlačítka a pole v okně, která přečnívají přes okraj obrazovky. */
const presahy = (okno) => okno.evaluate(el => {
  const out = [];
  for (const b of el.querySelectorAll('button, textarea')) {
    const r = b.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.left < -1 || r.right > innerWidth + 1) out.push(`${b.tagName} „${(b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 20)}" ${Math.round(r.left)}–${Math.round(r.right)}`);
  }
  return out;
});

// Zaměstnanec (Eva, id 16) vidí poznámky se svými příznaky; vedení (Martin, id 15) smí mazat obě.
let zam = false;
const podvrh = (req, json, stav) => {
  const url = new URL(req.url()); const path = url.pathname; const q = url.searchParams; const m = req.method();
  if (path === '/api/tasks') return m === 'GET' ? json(nacti('k69-b6a-tasks')) : json({ ok: true });
  if (path === '/api/teams' && m === 'GET') return json(nacti('k69-b6a-teams'));
  if (path !== '/api/notes') return undefined;
  stav.notes ??= nacti('poznamky-task').map(p => (zam ? { ...p, moje: p.autor.id === 16, muzuSmazat: p.autor.id === 16 } : p));
  if (m === 'GET') { (stav.notesGety ??= []).push(req.url()); return json(q.get('typ') === 'task' && q.get('id') === '2' ? stav.notes : []); }
  if (m === 'POST') {
    const t = req.postDataJSON(); (stav.notesPosty ??= []).push(t);
    if (stav.odmitnout) return json({ error: 'Poznámku se nepodařilo uložit.' }, 500);
    const n = { id: 100 + stav.notesPosty.length, text: t.text, createdAt: new Date().toISOString(), updatedAt: null,
      autor: zam ? { id: 16, name: 'Eva Testová', avatar: '🙂' } : { id: 15, name: 'Martin Nemeškal', avatar: null }, moje: true, muzuSmazat: true };
    stav.notes = [...stav.notes, n];
    return json(n, 201);
  }
  if (m === 'PATCH') {
    const t = req.postDataJSON(); (stav.notesPatche ??= []).push(t);
    stav.notes = stav.notes.map(p => (p.id === t.id ? { ...p, text: t.text, updatedAt: new Date().toISOString() } : p));
    return json(stav.notes.find(p => p.id === t.id) ?? { ok: true });
  }
  if (m === 'DELETE') { const id = Number(q.get('id')); (stav.notesDelety ??= []).push(id); stav.notes = stav.notes.filter(p => p.id !== id); return json({ ok: true }); }
  return json({ ok: true });
};

// Vedení: seznam, přidání, Enter, odmítnutí, smazání, telefon.
for (const w of [1280, 390]) {
  const { ctx, p, stav, chyby } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, fix: nacti('k69-b6a-rozlozeni-ukoly'), dalsi: podvrh });
  let confirmVolan = false;
  p.on('dialog', d => { confirmVolan = true; d.dismiss().catch(() => {}); });
  await otevri(p, '/employer/overview?view=tasks', 'vedeni.ukoly');
  const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
  await nastroj.getByRole('button', { name: 'Doplnit sirupy', exact: true }).click();
  const okno = p.getByRole('dialog', { name: 'Doplnit sirupy' });
  await okno.waitFor({ timeout: 5000 });
  const sekce = okno.getByRole('region', { name: /^Poznámky/ });

  tvrdi(`${w}: detail si řekne o poznámky úkolu (GET /api/notes?typ=task&id=2)`, await dokud(() => (stav.notesGety ?? []).some(u => u.includes('typ=task') && u.includes('id=2')), 3000), JSON.stringify(stav.notesGety));
  tvrdi(`${w}: nadpis nese počet „Poznámky · 2"`, await dokud(() => okno.getByRole('heading', { name: 'Poznámky · 2' }).isVisible(), 3000), (await okno.innerText()).slice(-300));
  const t0 = await sekce.innerText();
  tvrdi(`${w}: seznam ukáže autory, text, „před 2 h", „před 3 dny" a „upraveno"`,
    /Martin Nemeškal/.test(t0) && /Eva Testová/.test(t0) && /Sirupy jsou v druhé polici/.test(t0) && /před 2 h/.test(t0) && /před 3 dny/.test(t0) && /upraveno/.test(t0), t0.replace(/\s+/g, ' ').slice(0, 300));
  tvrdi(`${w}: víceřádkový text zůstane na dvou řádcích`, /objednáno,\s*\n\s*přijde ve čtvrtek/.test(t0), JSON.stringify(t0.slice(0, 200)));
  tvrdi(`${w}: vedení má u obou poznámek „···"`, await sekce.getByRole('button', { name: 'Akce s poznámkou' }).count() === 2);

  // Přidání: Ctrl+Enter odešle a poznámka je vidět hned.
  const pole = sekce.getByRole('textbox', { name: 'Přidat poznámku' });
  const pridat = sekce.getByRole('button', { name: 'Přidat', exact: true });
  // Během odesílání tlačítko hlásí aria-busy a další Ctrl+Enter se nepočítá (text zůstane v poli) — další krok počká.
  const odeslano = () => dokud(async () => (await pridat.getAttribute('aria-busy')) === null, 3000);
  await pole.fill('Vanilka bývá v lednici');
  await pole.press('Control+Enter');
  tvrdi(`${w}: Ctrl+Enter pošle POST {typ:'task', id:2, text}`, await dokud(() => (stav.notesPosty ?? []).length === 1, 3000) && JSON.stringify(stav.notesPosty[0]) === JSON.stringify({ typ: 'task', id: 2, text: 'Vanilka bývá v lednici' }), JSON.stringify(stav.notesPosty));
  tvrdi(`${w}: nová poznámka je v seznamu a počet je 3`, await dokud(async () => await sekce.locator('li', { hasText: 'Vanilka bývá v lednici' }).count() === 1 && await okno.getByRole('heading', { name: 'Poznámky · 3' }).isVisible(), 3000));
  tvrdi(`${w}: pole se po odeslání vyprázdní`, (await pole.inputValue()) === '');
  await odeslano();

  // Enter = nový řádek, tlačítko Přidat odešle oba řádky.
  await pole.fill('řádek 1');
  await pole.press('Enter');
  await pole.type('řádek 2');
  tvrdi(`${w}: samotný Enter neodesílá, dělá nový řádek`, (stav.notesPosty ?? []).length === 1 && (await pole.inputValue()) === 'řádek 1\nřádek 2', JSON.stringify(await pole.inputValue()));
  await pridat.click();
  tvrdi(`${w}: tlačítko Přidat pošle víceřádkový text`, await dokud(() => (stav.notesPosty ?? []).length === 2, 3000) && stav.notesPosty[1].text === 'řádek 1\nřádek 2', JSON.stringify(stav.notesPosty));
  await odeslano();

  // Odmítnutý zápis: text zpátky do pole a hláška, nic tiše nezmizí.
  stav.odmitnout = true;
  await pole.fill('Tohle server odmítne');
  await pole.press('Control+Enter');
  const hlaska = sekce.getByRole('alert');
  tvrdi(`${w}: 500 při zápisu přizná hlášku`, await dokud(() => hlaska.isVisible(), 3000) && /Poznámku se nepodařilo uložit/.test(await hlaska.innerText()), await sekce.innerText());
  tvrdi(`${w}: …odmítnutý text se vrátí do pole a v seznamu není`, (await pole.inputValue()) === 'Tohle server odmítne' && await sekce.locator('li', { hasText: 'Tohle server odmítne' }).count() === 0);
  stav.odmitnout = false;
  await odeslano();
  await pole.fill('');

  // Smazání přes okno, ne confirm().
  await sekce.getByRole('button', { name: 'Akce s poznámkou' }).first().click();
  await p.getByRole('menuitem', { name: 'Smazat' }).click();
  const potvrzeni = p.getByRole('dialog', { name: 'Smazat poznámku?' });
  tvrdi(`${w}: Smazat z „···" otevře okno (ne confirm())`, await dokud(() => potvrzeni.isVisible(), 2000) && !confirmVolan);
  await potvrzeni.getByRole('button', { name: 'Smazat', exact: true }).click();
  tvrdi(`${w}: potvrzení pošle DELETE /api/notes?id=11`, await dokud(() => (stav.notesDelety ?? []).includes(11), 3000), JSON.stringify(stav.notesDelety));
  tvrdi(`${w}: smazaná poznámka zmizí a počet klesne na 3`, await dokud(async () => await sekce.locator('li', { hasText: 'Sirupy jsou v druhé polici' }).count() === 0 && await okno.getByRole('heading', { name: 'Poznámky · 3' }).isVisible(), 3000), (await sekce.innerText()).slice(0, 200));

  if (w === 390) {
    tvrdi('390: bez vodorovného přetečení', await bezPreteceni(p));
    // Jen sekce poznámek: patička detailu s pěti tlačítky je starší stav mimo tuhle sondu.
    const pres = await presahy(sekce);
    tvrdi('390: nic z poznámek nepřečnívá přes okraj obrazovky', pres.length === 0, pres.join(' | '));
    await p.screenshot({ path: OUT + 'poznamky-390.png' });
  } else {
    await p.screenshot({ path: OUT + 'poznamky-1280.png' });
  }
  // Pole po odeslání vyprázdnil React, inline editor po uložení zmizel: okno se nesmí ptát na text, který už nikde není.
  await p.keyboard.press('Escape');
  tvrdi(`${w}: Escape po odeslání detail zavře bez otázky na rozepsané`, await dokud(async () => await p.getByRole('dialog').count() === 0, 3000), String(await p.getByRole('dialog').count()));
  tvrdi(`${w}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// Zaměstnanec: cizí poznámka bez „···", vlastní jde upravit (PATCH), Escape zavře detail bez rozepsaného textu.
zam = true;
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', viewport: { width: 1280, height: 900 }, fix: nacti('k69-b6a-rozlozeni-ukoly-zam'), mineData: roleMine('barista'), dalsi: podvrh });
  await otevri(p, '/employee/shifts?view=tasks', 'zamestnanec.ukoly');
  const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
  await nastroj.getByRole('button', { name: 'Doplnit sirupy', exact: true }).click();
  const okno = p.getByRole('dialog', { name: 'Doplnit sirupy' });
  await okno.waitFor({ timeout: 5000 });
  const sekce = okno.getByRole('region', { name: /^Poznámky/ });
  tvrdi('Z: zaměstnanec vidí poznámky s počtem', await dokud(() => okno.getByRole('heading', { name: 'Poznámky · 2' }).isVisible(), 3000));
  tvrdi('Z: cizí poznámka nemá „···", vlastní ano (jedno menu)', await sekce.getByRole('button', { name: 'Akce s poznámkou' }).count() === 1);
  await sekce.getByRole('button', { name: 'Akce s poznámkou' }).click();
  tvrdi('Z: v „···" vlastní poznámky je Upravit i Smazat', await p.getByRole('menuitem', { name: 'Upravit' }).count() === 1 && await p.getByRole('menuitem', { name: 'Smazat' }).count() === 1);
  await p.getByRole('menuitem', { name: 'Upravit' }).click();
  const editor = sekce.getByRole('textbox', { name: 'Upravit poznámku' });
  tvrdi('Z: Upravit otevře pole s původním textem', await dokud(() => editor.isVisible(), 2000) && /Karamel došel/.test(await editor.inputValue()));
  await editor.fill('Karamel dorazil, je v regálu.');
  await sekce.getByRole('button', { name: 'Uložit', exact: true }).click();
  tvrdi('Z: Uložit pošle PATCH {id:12, text}', await dokud(() => (stav.notesPatche ?? []).length === 1, 3000) && stav.notesPatche[0].id === 12 && stav.notesPatche[0].text === 'Karamel dorazil, je v regálu.', JSON.stringify(stav.notesPatche));
  tvrdi('Z: upravený text je vidět s „upraveno"', await dokud(async () => { const t = await sekce.innerText(); return /Karamel dorazil/.test(t) && /upraveno/.test(t) && !/Karamel došel/.test(t); }, 3000), (await sekce.innerText()).slice(0, 300));
  await p.keyboard.press('Escape');
  tvrdi('Z: Escape bez rozepsané poznámky detail zavře', await dokud(async () => await p.getByRole('dialog').count() === 0, 3000));
  tvrdi('Z: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}
await konec();
