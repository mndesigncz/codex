// Ručně spouštěná sonda průvodce „Přecházíš z Kartičky?“ (components/client/ImportKartickaOkno.tsx) a jeho vstupů v administraci.
// Není v ZELENE ve spust.mjs (je v MIMO): API se podvrhuje, ale okno se otevírá tlačítkem v ClientAdmin
// (Zákazníci → Členové), které přidává rodič; sonda ho hledá podle jména /Kartičk/.
//
// Spuštění proti lokálnímu buildu:
//   SONDY_ZAKLAD=http://localhost:3400 SONDY_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node scripts/sondy/import-karticka.mjs
//
// Prochází celého průvodce (soubor → sloupce → náhled → pravidla → import → historie) na 390 px a 1280 px
// a v každém kroku měří: žádný vodorovný scroll stránky ani okna, tlačítko dalšího kroku je vidět a použitelné,
// nejvýš jedna limetková akce, každý Select má popisek. Navíc velký soubor (1 200 členů, tři dávky) s Zrušit.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dotazyNa, fixtura, BASE, DIR, OUT } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const SOUBOR = DIR + 'import-karticka.csv';
const ZAKAZNICI = '/employer/overview?mode=client&tab=customers';
const CLIENT = (tab) => `/employer/overview?mode=client&tab=${tab}`;

const NAHLED = { radku: 10, noveUcty: 8, existujiciHoste: 2, uzJsouClenove: 1, cizi: 1 };
const HISTORIE = [
  { id: 5, zdroj: 'karticka', soubor: 'stary-export.csv', created_at: '2026-09-20T10:15:00.000Z', vraceno_at: null,
    pocty: { noveUcty: 30, novaClenstvi: 32, aktualizovano: 0, preskoceno: 3, razitkaZapsana: 40, plneKarty: 0, chyb: 2, radku: 37 } },
  { id: 4, zdroj: 'karticka', soubor: 'zkouska.csv', created_at: '2026-09-10T08:00:00.000Z', vraceno_at: '2026-09-10T09:00:00.000Z',
    pocty: { noveUcty: 5, novaClenstvi: 5, aktualizovano: 0, preskoceno: 0, razitkaZapsana: 0, plneKarty: 0, chyb: 0, radku: 5 } },
];

/** Podvrh API importu, kampaní a profilu; vše, co UI pošle, se zapisuje do `stav`. */
const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  stav.import ??= { posty: [], nahledy: [], deletes: [], stamps: [], puty: [], zpozdeni: 0, selhat: new Set() };
  const s = stav.import;
  if (path === '/api/client/admin/import') {
    if (m === 'GET') return json(s.nemigrovano ? { importy: [], notMigrated: true } : { importy: HISTORIE });
    if (m === 'DELETE') { s.deletes.push(url.searchParams.get('id')); return json({ ok: true, vraceno: 10, smazanoUctu: 8 }); }
    if (m === 'POST') {
      const b = req.postDataJSON();
      if (b.nahled) { s.nahledy.push(b); return json({ nahled: { ...NAHLED, radku: b.radky.length } }); }
      s.posty.push(b);
      const cislo = s.posty.length;
      if (s.selhat.has(cislo)) { s.selhat.delete(cislo); return json({ error: 'Import se nepovedl. Nic se nezapsalo do poloviny: zkuste to znovu, případně import vraťte.' }, 500); }
      const n = b.radky.length;
      const odpoved = () => json({ ok: true, importId: 77, noveUcty: n - 1, novaClenstvi: n, aktualizovano: 0, preskoceno: 0, razitkaZapsana: n, razitkaBezKampane: 0, plneKarty: cislo === 1 ? 2 : 0, zarazenoDoSkupin: n, chyby: [] });
      return s.zpozdeni ? new Promise(r => setTimeout(r, s.zpozdeni)).then(odpoved) : odpoved();
    }
  }
  if (path === '/api/client/admin/stamps') {
    if (m === 'POST') { s.stamps.push(req.postDataJSON()); return json({ ok: true, id: 9 }); }
    if (m === 'GET') return json({ campaigns: [{ id: 3, name: 'Věrnostní karta', required_stamps: 8, active: true }] });
  }
  if (path === '/api/client/admin/profile') {
    if (m === 'PUT') { s.puty.push(req.postDataJSON()); return json({ ok: true }); }
    if (m === 'GET') return json({ profile: { slug: 'kavarna', enabled: true, loyalty_on: true, cashback_pct: 2, cashback_mode: 'credit', points_per_100: 5, stamp_target: 10, stamp_reward: 'Káva zdarma', birthday_points: 50, referral_points: 0, silver_at: 10, gold_at: 25, opening_hours: {} }, boards: [], url: '' });
  }
  // Počet členů podle potřeby sondy: 0 = „Začni", 3 = výrazná karta, jinak z fixtury (148 = decentní řádek).
  if (s.clenu !== undefined && m === 'GET' && path === '/api/client/admin/summary') return json({ ...fixtura('client_admin_summary'), members: s.clenu });
  if (s.clenu !== undefined && m === 'GET' && path === '/api/client/admin/loyalty') {
    const f = fixtura('client_admin_loyalty');
    return json({ ...f, summary: { ...f.summary, members: s.clenu } });
  }
  return undefined;
};

const okno = (p) => p.locator('[role="dialog"]').first();
const dalsi = (p) => okno(p).getByRole('button', { name: 'Pokračovat' });

/** Měření jednoho kroku: vodorovný scroll, dosažitelné tlačítko dalšího kroku, limetka, popisky Selectů, velikost polí. */
async function zmer(p, popis, { tlacitko = 'Pokračovat' } = {}) {
  const m = await p.evaluate((nazev) => {
    const d = document.querySelector('[role="dialog"]');
    const sirka = window.innerWidth;
    const tl = [...d.parentElement.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(nazev) && b.offsetParent !== null);
    const r = tl?.getBoundingClientRect();
    const bezPopisku = [...d.querySelectorAll('select, input:not([type=file]), textarea')].filter(x => x.offsetParent !== null
      && !(x.labels?.length) && !x.getAttribute('aria-label') && !x.getAttribute('aria-labelledby'));
    const polePod44 = [...d.querySelectorAll('select, input:not([type=file]):not([type=checkbox]), textarea')].filter(x => x.offsetParent !== null
      && x.tagName !== 'TEXTAREA' && x.getBoundingClientRect().height < 43.5).length;
    return {
      strankaScroll: document.documentElement.scrollWidth - sirka,
      oknoScroll: d.scrollWidth - d.clientWidth,
      tlacitkoViditelne: !!r && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= sirka && r.height > 0,
      tlacitkoVyska: r ? Math.round(r.height) : 0,
      tlacitkoZakazano: tl ? tl.disabled : null,
      limetek: d.parentElement.querySelectorAll('button.on-accent').length,
      bezPopisku: bezPopisku.map(x => x.id || x.tagName),
      polePod44,
    };
  }, tlacitko);
  tvrdi(`${popis}: bez vodorovného scrollu stránky`, m.strankaScroll <= 1, `${m.strankaScroll}px`);
  tvrdi(`${popis}: bez vodorovného scrollu okna`, m.oknoScroll <= 1, `${m.oknoScroll}px`);
  tvrdi(`${popis}: tlačítko „${tlacitko}“ je vidět a má ≥ 44 px`, m.tlacitkoViditelne && m.tlacitkoVyska >= 44, JSON.stringify(m));
  tvrdi(`${popis}: nejvýš jedna limetková akce`, m.limetek <= 1, `${m.limetek}×`);
  tvrdi(`${popis}: každé pole má popisek`, m.bezPopisku.length === 0, m.bezPopisku.join(','));
  tvrdi(`${popis}: pole formuláře mají ≥ 44 px`, m.polePod44 === 0, `${m.polePod44}×`);
  return m;
}

const otevriOkno = async (p) => {
  await p.getByRole('button', { name: /Kartičk/ }).first().click();
  await okno(p).waitFor({ timeout: 8000 });
  await p.waitForTimeout(300);
};

async function pruvodce(viewport, mobil) {
  const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: nacti('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh });
  const jmeno = `${viewport.width}px`;
  await otevri(p, ZAKAZNICI, 'vedeni.klient_zakaznici');
  await otevriOkno(p);

  // 1) Úvod
  tvrdi(`${jmeno} úvod: nadpis „Přecházíš z Kartičky?“`, await okno(p).getByRole('heading', { name: 'Přecházíš z Kartičky?' }).count() === 1);
  const uvodText = await okno(p).innerText();
  tvrdi(`${jmeno} úvod: říká, co se nepřenese (kupony, poukazy, bannery, pravidla)`, /Co se nepřenese/.test(uvodText) && /kupony, promo kódy a dárkové poukazy/.test(uvodText) && /bannery/.test(uvodText));
  tvrdi(`${jmeno} úvod: bez souboru je Pokračovat zakázané`, await dalsi(p).isDisabled());
  tvrdi(`${jmeno} úvod: poctivě říká, že formát exportu Kartička nezveřejňuje`, /nezveřejňuje/.test(await okno(p).innerText()));
  await zmer(p, `${jmeno} úvod`);
  await p.locator('#import-soubor').setInputFiles(SOUBOR);
  await okno(p).getByText(/Rozpoznáno/).waitFor();
  const stavSouboru = await okno(p).innerText();
  tvrdi(`${jmeno} úvod: rozpoznáno 12 řádků a 12 sloupců`, /Rozpoznáno\s*12\s*řádků a\s*12\s*sloupců/.test(stavSouboru), stavSouboru.slice(-300));
  await zmer(p, `${jmeno} úvod se souborem`);
  await p.screenshot({ path: `${OUT}import-karticka-${jmeno}-1-uvod.png` });
  await dalsi(p).click();

  // 2) Sloupce
  await okno(p).getByRole('heading', { name: 'Zkontroluj sloupce' }).waitFor();
  const email = okno(p).getByLabel('E-mail', { exact: true });
  tvrdi(`${jmeno} sloupce: sloupec E-mail je předvyplněný na pole E-mail`, await email.inputValue() === 'email');
  tvrdi(`${jmeno} sloupce: Číslo staré karty se rozpoznalo`, await okno(p).getByLabel('Číslo karty', { exact: true }).inputValue() === 'cisloKarty');
  tvrdi(`${jmeno} sloupce: je vidět náhled prvních 5 řádků`, await okno(p).getByText('Náhled prvních 5 řádků').count() === 1);
  await zmer(p, `${jmeno} sloupce`);
  // Bez e-mailu nejde pokračovat a ukáže se varování.
  await email.selectOption('');
  tvrdi(`${jmeno} sloupce: bez e-mailu je Pokračovat zakázané`, await dalsi(p).isDisabled());
  tvrdi(`${jmeno} sloupce: bez e-mailu je varování`, await okno(p).getByText(/Chybí sloupec s e-mailem/).count() === 1);
  // Dva sloupce na totéž pole.
  await email.selectOption('email');
  await okno(p).getByLabel('Jméno', { exact: true }).selectOption('telefon');
  tvrdi(`${jmeno} sloupce: dva sloupce na totéž pole → varování`, await okno(p).getByText(/Víc sloupců míří na totéž pole/).count() === 1);
  await okno(p).getByLabel('Jméno', { exact: true }).selectOption('jmeno');
  tvrdi(`${jmeno} sloupce: po opravě varování zmizí`, await okno(p).getByText(/Víc sloupců míří na totéž pole/).count() === 0);
  await p.screenshot({ path: `${OUT}import-karticka-${jmeno}-2-sloupce.png` });
  await dalsi(p).click();

  // 3) Náhled
  await okno(p).getByRole('heading', { name: 'Náhled importu' }).waitFor();
  await okno(p).getByText(/Nových účtů/).waitFor();
  const nahled = await okno(p).innerText();
  tvrdi(`${jmeno} náhled: 10 členů (12 řádků − duplikát − chybný e-mail)`, /členů\s*10/i.test(nahled.replace(/\n+/g, ' ')), nahled.slice(0, 200));
  tvrdi(`${jmeno} náhled: odpověď serveru (nových účtů 8, už členy 1, vedení 1)`, /Nových účtů:\s*8/.test(nahled) && /členy tohoto podniku:\s*1/.test(nahled) && /zaměstnanci nebo vedení:\s*1/.test(nahled));
  tvrdi(`${jmeno} náhled: dotaz na server měl nahled:true a nejvýš 500 řádků`, stav.import.nahledy.length >= 1 && stav.import.nahledy.at(-1).radky.length === 10);
  tvrdi(`${jmeno} náhled: přeskočené řádky s důvodem`, /Přeskočené řádky: 2/.test(nahled) && /Stejný e-mail už je na řádku 2/.test(nahled) && /E-mail nevypadá správně/.test(nahled));
  tvrdi(`${jmeno} náhled: upozornění je sbalené (Upozornění (1) a nečitelné číslo)`, await okno(p).locator('details summary').filter({ hasText: /Upozornění \(\d+\)/ }).count() === 1);
  tvrdi(`${jmeno} náhled: soubor má razítka a není vybraná kampaň → varování`, await okno(p).getByText(/není vybraná kampaň/).count() >= 1);
  tvrdi(`${jmeno} náhled: tabulka chyb je ve vlastním posuvném kontejneru`, await okno(p).locator('div.overflow-x-auto').count() >= 1);
  await zmer(p, `${jmeno} náhled`);
  // Chyby ke stažení.
  const [stazeni] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), okno(p).getByRole('button', { name: /Stáhnout chyby/ }).click()]);
  tvrdi(`${jmeno} náhled: Stáhnout chyby (CSV) stáhne soubor`, !!stazeni && /\.csv$/.test(stazeni.suggestedFilename()), stazeni?.suggestedFilename());
  // Nová kampaň.
  await okno(p).getByLabel('Razítka', { exact: true }).selectOption('nova');
  tvrdi(`${jmeno} náhled: nová kampaň bez odměny blokuje Pokračovat`, await dalsi(p).isDisabled());
  await okno(p).getByLabel('Odměna za plnou kartu').fill('Káva zdarma');
  await okno(p).getByRole('spinbutton', { name: 'Razítek na kartě' }).fill('8');
  tvrdi(`${jmeno} náhled: s kampaní zmizelo varování o razítkách`, await okno(p).getByText(/není vybraná kampaň/).count() === 0);
  tvrdi(`${jmeno} náhled: nabízí i existující kampaň z GET stamps`, await okno(p).getByLabel('Razítka', { exact: true }).locator('option', { hasText: 'Věrnostní karta' }).count() === 1);
  tvrdi(`${jmeno} náhled: přepínač skupin je zapnutý (sloupec Skupina existuje)`, await okno(p).getByRole('switch', { name: /Zařadit do skupin/ }).getAttribute('aria-checked') === 'true');
  await okno(p).getByText('Jak se importovaní členové dostanou ke kartě').scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}import-karticka-${jmeno}-3-nahled.png` });
  await zmer(p, `${jmeno} náhled s kampaní`);
  await dalsi(p).click();

  // 4) Pravidla
  await okno(p).getByRole('heading', { name: 'Převzít pravidla věrnosti' }).waitFor();
  await okno(p).getByRole('spinbutton', { name: 'Cashback v %' }).waitFor();
  const pole = (n) => okno(p).getByRole('spinbutton', { name: n });
  tvrdi(`${jmeno} pravidla: formulář je předvyplněný z profilu (cashback 2, body 5, narozeniny 50, razítek 10, odměna)`,
    await pole('Cashback v %').inputValue() === '2' && await okno(p).locator('#pravidlo-points_per_100').inputValue() === '5'
    && await pole('Bodů k narozeninám').inputValue() === '50' && await pole('Razítek na kartě').inputValue() === '10'
    && await okno(p).getByLabel('Odměna za plnou kartu').inputValue() === 'Káva zdarma');
  tvrdi(`${jmeno} pravidla: beze změny je „Uložit pravidla“ zakázané`, await okno(p).getByRole('button', { name: 'Uložit pravidla' }).isDisabled());
  const textKroku = await okno(p).innerText();
  tvrdi(`${jmeno} pravidla: je tu seznam „Co přenést ručně“ s bannery, kupony, poukazy`, /Co přenést ručně/.test(textKroku) && /Bannery/.test(textKroku) && /Kupony a promo kódy/.test(textKroku) && /Dárkové poukazy/.test(textKroku));
  await zmer(p, `${jmeno} pravidla`);
  await pole('Bodů za pozvání').fill('25');
  await pole('Cashback v %').fill('77');
  tvrdi(`${jmeno} pravidla: cashback 77 % ukáže chybu a zakáže uložení`, await okno(p).getByText(/Povoleno 0 až 50/).count() === 1 && await okno(p).getByRole('button', { name: 'Uložit pravidla' }).isDisabled());
  await pole('Cashback v %').fill('6');
  await okno(p).getByRole('button', { name: 'Uložit pravidla' }).click();
  await okno(p).getByText('Uloženo.').waitFor();
  const put = stav.import.puty.at(-1);
  tvrdi(`${jmeno} pravidla: PUT obsahuje jen změněná pole`, put && Object.keys(put).sort().join() === 'cashback_pct,referral_points' && put.cashback_pct === 6 && put.referral_points === 25, JSON.stringify(put));
  await p.screenshot({ path: `${OUT}import-karticka-${jmeno}-4-pravidla.png` });
  await dalsi(p).click();

  // 5) Import
  await okno(p).getByRole('heading', { name: 'Import členů' }).waitFor();
  await zmer(p, `${jmeno} import`, { tlacitko: 'Importovat' });
  await okno(p).getByRole('button', { name: /Importovat 10/ }).click();
  await okno(p).getByRole('button', { name: 'Hotovo' }).waitFor({ timeout: 8000 });
  const vysledek = await okno(p).innerText();
  tvrdi(`${jmeno} import: výsledek s kartami součtů`, /Noví členové/i.test(vysledek) && /Nové účty/i.test(vysledek) && /Razítka zapsána/i.test(vysledek) && /Plné karty/i.test(vysledek) && /k ruční kontrole/i.test(vysledek));
  await p.waitForTimeout(700);
  const vypln = await okno(p).getByRole('progressbar').evaluate(el => ({ sirka: el.firstElementChild.getBoundingClientRect().width / el.getBoundingClientRect().width, barva: getComputedStyle(el.firstElementChild).backgroundColor }));
  tvrdi(`${jmeno} import: progress bar je na konci plný a tmavý`, vypln.sirka > 0.99 && vypln.barva !== 'rgba(0, 0, 0, 0)', JSON.stringify(vypln));
  tvrdi(`${jmeno} import: plné karty jsou vysvětlené jako rozdělaná zbytková část`, /zbytková část/.test(vysledek));
  tvrdi(`${jmeno} import: je k dispozici „Vrátit import“`, await okno(p).getByRole('button', { name: 'Vrátit import' }).count() === 1);
  tvrdi(`${jmeno} import: nová kampaň se založila před importem (name, requiredStamps, rewardTitle)`,
    stav.import.stamps.length === 1 && stav.import.stamps[0].name === 'Karta z Kartičky' && stav.import.stamps[0].requiredStamps === 8 && stav.import.stamps[0].rewardTitle === 'Káva zdarma', JSON.stringify(stav.import.stamps));
  const post = stav.import.posty[0];
  tvrdi(`${jmeno} import: dávka nese nastavení (karticka, kampaň 9, skupiny, bez importId)`,
    post && post.nastaveni.zdroj === 'karticka' && post.nastaveni.kampanRazitek === 9 && post.nastaveni.skupiny === true && post.nastaveni.importId === null
    && post.nastaveni.existujici === 'preskocit' && post.radky.length === 10 && post.nastaveni.soubor === 'import-karticka.csv', JSON.stringify(post?.nastaveni));
  await zmer(p, `${jmeno} výsledek`, { tlacitko: 'Hotovo' });
  await p.screenshot({ path: `${OUT}import-karticka-${jmeno}-5-vysledek.png` });

  // Vrácení hned po importu.
  await okno(p).getByRole('button', { name: 'Vrátit import' }).click();
  await p.getByRole('dialog', { name: 'Vrátit import?' }).waitFor();
  tvrdi(`${jmeno} vrácení: potvrzení vysvětluje, co se stane`, /Smaže nové účty a členství/.test(await p.getByRole('dialog', { name: 'Vrátit import?' }).innerText()));
  await p.getByRole('dialog', { name: 'Vrátit import?' }).getByRole('button', { name: 'Vrátit import' }).click();
  await okno(p).getByText(/Import byl vrácen/).waitFor();
  tvrdi(`${jmeno} vrácení: DELETE jde na import 77`, stav.import.deletes.at(-1) === '77', String(stav.import.deletes));
  await okno(p).getByRole('button', { name: 'Hotovo' }).click();
  await p.waitForTimeout(300);
  tvrdi(`${jmeno}: Hotovo okno zavře`, await p.locator('[role="dialog"]').count() === 0);

  // 6) Historie
  await otevriOkno(p);
  await okno(p).getByRole('button', { name: /Historie importů/ }).click();
  await okno(p).getByText('stary-export.csv').waitFor();
  const hist = await okno(p).innerText();
  tvrdi(`${jmeno} historie: soubor, počty a stav „vráceno“`, /zkouska\.csv/.test(hist) && /vráceno/.test(hist) && /nových účtů 30/.test(hist));
  tvrdi(`${jmeno} historie: „Vrátit import“ jen u nevráceného`, await okno(p).getByRole('button', { name: 'Vrátit import' }).count() === 1);
  await zmer(p, `${jmeno} historie`, { tlacitko: 'Zpět k průvodci' });
  await p.screenshot({ path: `${OUT}import-karticka-${jmeno}-6-historie.png` });
  await okno(p).getByRole('button', { name: 'Vrátit import' }).click();
  await p.getByRole('dialog', { name: 'Vrátit import?' }).getByRole('button', { name: 'Vrátit import' }).click();
  await p.waitForTimeout(500);
  tvrdi(`${jmeno} historie: vrácení starého importu volá DELETE ?id=5`, stav.import.deletes.at(-1) === '5', String(stav.import.deletes));

  tvrdi(`${jmeno}: bez chyb na stránce`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

/** Vstupy do přechodu: Věrnost → Přehled (výrazná karta / decentní řádek), Přehled správy („Začni“), Zákazníci, Nastavení, odkazy z kroku Pravidla. */
async function vstupy(viewport, mobil) {
  const jmeno = `vstupy ${viewport.width}px`;
  const bezScrollu = async (p, popis) => {
    const x = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    tvrdi(`${jmeno} ${popis}: bez vodorovného scrollu stránky`, x <= 1, `${x}px`);
  };
  const tlacitko = (p) => p.getByRole('button', { name: 'Přenést z Kartičky' });
  const otevriAZavri = async (p, popis) => {
    await tlacitko(p).first().click();
    await okno(p).waitFor({ timeout: 8000 });
    await p.waitForTimeout(500);
    tvrdi(`${jmeno} ${popis}: tlačítko otevře průvodce`, await okno(p).getByRole('heading', { name: 'Přecházíš z Kartičky?' }).count() === 1);
    await zmer(p, `${jmeno} ${popis} okno`);
    await okno(p).locator('button:not([aria-label])', { hasText: 'Zavřít' }).click();
    await p.waitForTimeout(300);
    tvrdi(`${jmeno} ${popis}: Zavřít okno zavře`, await p.locator('[role="dialog"]').count() === 0);
  };
  // Počet členů určuje, jestli je karta výrazná (do 5 členů) nebo decentní.
  for (const [clenu, popis] of [[3, 'málo členů'], [148, 'hodně členů']]) {
    const { ctx, p, stav, chyby } = await kontext({
      viewport, mobil, fix: nacti('k69-b8-rozlozeni-vernost'),
      dalsi: (req, json, st) => { st.import ??= { posty: [], nahledy: [], deletes: [], stamps: [], puty: [], zpozdeni: 0, selhat: new Set() }; st.import.clenu = clenu; return podvrh(req, json, st); },
    });
    await otevri(p, CLIENT('loyalty'), 'vedeni.klient_vernost');
    const karta = p.locator(clenu <= 5 ? '[data-prechod="vyrazna"]' : '[data-prechod="decentni"]');
    await karta.waitFor({ timeout: 8000 });
    tvrdi(`${jmeno} Věrnost, ${popis}: ${clenu <= 5 ? 'výrazná karta' : 'decentní řádek'} s textem „Přecházíš z Kartičky?“`, /Přecházíš z Kartičky\?/.test(await karta.innerText()));
    tvrdi(`${jmeno} Věrnost, ${popis}: ${clenu <= 5 ? 'jen výrazná' : 'jen decentní'} varianta`, await p.locator('[data-prechod]').count() === 1);
    const r = await karta.boundingBox();
    tvrdi(`${jmeno} Věrnost, ${popis}: karta se vejde do šířky okna`, r.x >= 0 && r.x + r.width <= viewport.width + 1, JSON.stringify(r));
    await bezScrollu(p, `Věrnost, ${popis}`);
    await p.screenshot({ path: `${OUT}import-karticka-${viewport.width}px-vstup-vernost-${clenu}.png` });
    await otevriAZavri(p, `Věrnost, ${popis}`);
    tvrdi(`${jmeno} Věrnost, ${popis}: bez chyb na stránce`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
    await ctx.close();
  }
  // Přehled správy: krok „Začni“ jen pro podnik bez členů.
  for (const clenu of [0, 148]) {
    const { ctx, p } = await kontext({
      viewport, mobil, fix: nacti('k69-b8-rozlozeni-klient'),
      dalsi: (req, json, st) => { st.import ??= { posty: [], nahledy: [], deletes: [], stamps: [], puty: [], zpozdeni: 0, selhat: new Set() }; st.import.clenu = clenu; return podvrh(req, json, st); },
    });
    await otevri(p, CLIENT('overview'), 'vedeni.klient');
    await p.waitForTimeout(500);
    const pocet = await p.locator('[data-prechod="vyrazna"]').count();
    tvrdi(`${jmeno} Přehled správy, ${clenu} členů: ${clenu === 0 ? 'je krok „Začni“' : 'výzva se neukazuje'}`, pocet === (clenu === 0 ? 1 : 0), String(pocet));
    if (clenu === 0) {
      tvrdi(`${jmeno} Přehled správy: karta nese štítek „Začni“`, /Začni/.test(await p.locator('[data-prechod="vyrazna"]').innerText()));
      await bezScrollu(p, 'Přehled správy');
      await p.screenshot({ path: `${OUT}import-karticka-${viewport.width}px-vstup-prehled.png` });
      await otevriAZavri(p, 'Přehled správy');
    }
    await ctx.close();
  }
  // Zákazníci → Členové a Nastavení.
  {
    const { ctx, p } = await kontext({ viewport, mobil, fix: nacti('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh });
    await otevri(p, ZAKAZNICI, 'vedeni.klient_zakaznici');
    tvrdi(`${jmeno} Zákazníci: tlačítko „Přenést z Kartičky“ je v nástrojové liště`, await tlacitko(p).count() === 1);
    await bezScrollu(p, 'Zákazníci');
    await otevriAZavri(p, 'Zákazníci');
    await p.goto(BASE + CLIENT('settings'), { waitUntil: 'networkidle' });
    await p.getByRole('heading', { name: 'Přecházíš z Kartičky?' }).waitFor({ timeout: 10000 });
    tvrdi(`${jmeno} Nastavení: karta „Přecházíš z Kartičky?“ s tlačítkem`, await tlacitko(p).count() === 1);
    await bezScrollu(p, 'Nastavení');
    await p.screenshot({ path: `${OUT}import-karticka-${viewport.width}px-vstup-nastaveni.png` });
    await otevriAZavri(p, 'Nastavení');
    await ctx.close();
  }
  // Odkazy z kroku Pravidla: okno se zavře a otevře se Věrnost → Kupony a kódy.
  {
    const { ctx, p } = await kontext({ viewport, mobil, fix: nacti('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh });
    await otevri(p, ZAKAZNICI, 'vedeni.klient_zakaznici');
    await otevriOkno(p);
    await p.locator('#import-soubor').setInputFiles(SOUBOR);
    await okno(p).getByText(/Rozpoznáno/).waitFor();
    await dalsi(p).click(); await dalsi(p).click();
    await okno(p).getByText(/Nových účtů/).waitFor();
    await dalsi(p).click();
    await okno(p).getByRole('heading', { name: 'Převzít pravidla věrnosti' }).waitFor();
    await okno(p).getByRole('button', { name: /Kupony a promo kódy/ }).click();
    await p.waitForTimeout(500);
    tvrdi(`${jmeno} odkaz „Kupony a promo kódy“: okno se zavřelo`, await p.locator('[role="dialog"]').count() === 0);
    const vybrana = await p.getByRole('tab', { selected: true }).allInnerTexts();
    tvrdi(`${jmeno} odkaz „Kupony a promo kódy“: otevřela se část Kupony a kódy`, vybrana.some(t => /Kupony a kódy/.test(t)), vybrana.join('|'));
    await ctx.close();
  }
}

/** Velký soubor: 1 200 členů = tři dávky, průběh „Import: 500 z 1 200“, Zrušit, chyba dávky a Zkusit znovu. */
async function velky(viewport, mobil) {
  const { ctx, p, stav } = await kontext({ viewport, mobil, fix: nacti('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh });
  const jmeno = `velký ${viewport.width}px`;
  await otevri(p, ZAKAZNICI, 'vedeni.klient_zakaznici');
  await otevriOkno(p);
  const radky = ['E-mail;Jméno;Body'];
  for (let i = 1; i <= 1200; i++) radky.push(`clen${i}@example.cz;Člen ${i};${i}`);
  await p.locator('#import-soubor').setInputFiles({ name: 'velky.csv', mimeType: 'text/csv', buffer: Buffer.from(radky.join('\n'), 'utf8') });
  await okno(p).getByText(/Rozpoznáno/).waitFor();
  await dalsi(p).click();
  await dalsi(p).click(); // sloupce → náhled
  await okno(p).getByText(/Nových účtů/).waitFor();
  tvrdi(`${jmeno}: kontrola serveru jde jen pro prvních 500 řádků`, stav.import.nahledy.at(-1).radky.length === 500);
  await dalsi(p).click(); // náhled → pravidla
  await dalsi(p).click(); // pravidla → import
  stav.import.zpozdeni = 600;
  stav.import.selhat.add(2); // druhá dávka poprvé spadne
  await okno(p).getByRole('button', { name: /Importovat 1/ }).click();
  const bar = okno(p).getByRole('progressbar');
  await bar.waitFor();
  tvrdi(`${jmeno}: progress bar má aria-valuenow, -max a text`, await bar.getAttribute('aria-valuemax') === '1200' && await bar.getAttribute('aria-valuenow') !== null);
  await okno(p).getByText(/Import:\s*500\s*z\s*1\s*200/).waitFor({ timeout: 8000 });
  await okno(p).getByRole('button', { name: 'Zkusit znovu' }).waitFor({ timeout: 8000 });
  tvrdi(`${jmeno}: chyba druhé dávky ukáže českou větu`, /Dávka 2 z 3 se nezapsala/.test(await okno(p).innerText()));
  tvrdi(`${jmeno}: druhá dávka už nese importId z první odpovědi`, stav.import.posty[1].nastaveni.importId === 77);
  await p.screenshot({ path: `${OUT}import-karticka-${jmeno.replace(' ', '-')}-chyba.png` });
  await okno(p).getByRole('button', { name: 'Zkusit znovu' }).click();
  await okno(p).getByRole('button', { name: 'Zrušit' }).waitFor({ timeout: 4000 });
  await okno(p).getByRole('button', { name: 'Zrušit' }).click();
  await okno(p).getByText(/Import zastaven/).first().waitFor({ timeout: 8000 });
  const t = await okno(p).innerText();
  tvrdi(`${jmeno}: po Zrušit zůstává zapsané a jde vrátit`, /Import jsi zastavil/.test(t) && await okno(p).getByRole('button', { name: 'Vrátit import' }).count() === 1);
  const poslední = stav.import.posty.at(-1);
  tvrdi(`${jmeno}: opakovaná dávka nese importId 77`, poslední.nastaveni.importId === 77, String(poslední.nastaveni.importId));
  tvrdi(`${jmeno}: dávky mají nejvýš 500 řádků`, stav.import.posty.every(x => x.radky.length <= 500));
  await zmer(p, `${jmeno} zastaveno`, { tlacitko: 'Hotovo' });
  await ctx.close();
}

await pruvodce({ width: 390, height: 844 }, true);
await pruvodce({ width: 1280, height: 900 }, false);
await velky({ width: 390, height: 844 }, true);
await vstupy({ width: 390, height: 844 }, true);
await vstupy({ width: 1280, height: 900 }, false);
await konec();
