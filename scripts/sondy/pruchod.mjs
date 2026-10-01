// Průzkum celé aplikace: každá obrazovka × jazyk × velikost × motiv, s podvrženým API (fixtury).
//
// Není to sonda ze seznamu ZELENE (běží minuty): spouští se ručně, když je potřeba zjistit, co v aplikaci
// ještě drhne napříč jazyky a velikostmi, a výsledek se čte jako seznam k opravě, ne jako ano/ne.
//
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/pruchod.mjs [vystup.json]
//   PRUCHOD_JAZYKY=de,pl PRUCHOD_ROLE=employer PRUCHOD_POHLEDY=settings,finance (zúžení)
//
// U každého načtení hlásí:
//  • chyby stránky a konzole (včetně chyb hydratace React #418/#423/#425),
//  • vodorovné přetečení dokumentu,
//  • oříznutá tlačítka, záložky a čipy (obsah širší než prvek při skrytém přetečení),
//  • česká slova s diakritikou v cizím jazyce (data z fixtur jsou česky, takže je to seznam k posouzení),
//  • prázdnou obrazovku (v <main> skoro žádný text).
import { writeFileSync } from 'node:fs';
import { kontext, BASE } from './k68-spolecne.mjs';

const VYSTUP = process.argv[2] ?? 'pruchod.json';
const filtr = (env, vse) => (process.env[env] ? process.env[env].split(',') : vse);

const POHLEDY = {
  employer: ['overview', 'shifts', 'inventory', 'recipes', 'procedures', 'tasks', 'chat', 'guides', 'planning', 'reports', 'finance',
    'suggestions', 'attendance', 'my-shifts', 'rewards', 'settings', 'team-settings', 'org', 'events', 'menu', 'announcements', 'settings&tab=billing'],
  employee: ['home', 'my-shifts', 'procedures', 'availability', 'inventory', 'closing', 'tasks', 'rewards', 'chat', 'guides', 'suggestions', 'settings'],
  kiosk: [''],
};
const URL_ = (role, pohled) => role === 'employer' ? `${BASE}/employer/overview?view=${pohled}`
  : role === 'employee' ? `${BASE}/employee/shifts?view=${pohled}` : `${BASE}/kiosk`;

const JAZYKY = filtr('PRUCHOD_JAZYKY', ['cs', 'en', 'de', 'pl', 'sk']);
const ROLE = filtr('PRUCHOD_ROLE', ['employer', 'employee', 'kiosk']);
const VYBRANE = process.env.PRUCHOD_POHLEDY ? process.env.PRUCHOD_POHLEDY.split(',') : null;
const TEL = { width: 390, height: 844 }, PC = { width: 1280, height: 900 };
// Kombinace: telefon ve všech jazycích (německé a polské věty jsou nejdelší), počítač v češtině a němčině, telefon tmavě v němčině.
const PRUCHODY = [
  ...JAZYKY.map(j => ({ jazyk: j, vp: TEL, nazev: '390', tmavy: false })),
  ...['cs', 'de'].filter(j => JAZYKY.includes(j)).map(j => ({ jazyk: j, vp: PC, nazev: '1280', tmavy: false })),
  ...(JAZYKY.includes('de') ? [{ jazyk: 'de', vp: TEL, nazev: '390 tmavý', tmavy: true }] : []),
];
const CESKE = { en: /[ěščřžůďť]/, de: /[ěščřžůďť]/, pl: /[ěščřžůďť]/, sk: /[ěřů]/ };

const nalezy = [];
const pocty = { nacteni: 0, chyba: 0 };

for (const role of ROLE) {
  const pohledy = POHLEDY[role].filter(p => !VYBRANE || VYBRANE.includes(p));
  for (const pr of PRUCHODY) {
    const { ctx, p, chyby } = await kontext({ viewport: pr.vp, role, mobil: pr.vp.width < 600, tmavy: pr.tmavy });
    await ctx.addCookies([{ name: 'managero-lang', value: pr.jazyk, domain: new URL(BASE).hostname, path: '/', sameSite: 'Lax' }]);
    for (const pohled of pohledy) {
      pocty.nacteni++;
      const klic = `${role}/${pohled || 'kiosk'} ${pr.jazyk} ${pr.nazev}`;
      chyby.length = 0;
      let potize = [];
      try {
        await p.goto(URL_(role, pohled), { waitUntil: 'networkidle', timeout: 45000 });
        await p.waitForTimeout(1100);
        const m = await p.evaluate((cesky) => {
          const main = document.querySelector('main') ?? document.body;
          const text = (main.innerText || '').trim();
          const pretok = document.documentElement.scrollWidth - window.innerWidth;
          const orez = [...document.querySelectorAll('button, [role=tab], [role=radio], .chip, a.btn')].filter(el => {
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return false;
            const o = getComputedStyle(el).overflow;
            return el.scrollWidth > el.clientWidth + 1 && o !== 'visible';
          }).map(el => (el.textContent || '').trim().slice(0, 28)).filter(Boolean);
          const slova = cesky ? [...new Set((text.match(/[\p{L}]+/gu) || []).filter(w => new RegExp(cesky).test(w)))].slice(0, 14) : [];
          return { delka: text.length, pretok, orez: [...new Set(orez)].slice(0, 6), slova, nadpis: (main.querySelector('h1,h2')?.textContent || '').trim().slice(0, 40) };
        }, pr.jazyk === 'cs' ? null : CESKE[pr.jazyk].source);
        if (chyby.length) potize.push({ druh: 'chyba', detail: [...new Set(chyby.map(c => c.slice(0, 140)))].slice(0, 3) });
        if (m.pretok > 1) potize.push({ druh: 'přetečení', detail: `${m.pretok}px` });
        if (m.orez.length) potize.push({ druh: 'oříznuto', detail: m.orez });
        if (m.slova.length) potize.push({ druh: 'česky', detail: m.slova });
        if (m.delka < 20) potize.push({ druh: 'prázdné', detail: `${m.delka} znaků` });
      } catch (e) { potize.push({ druh: 'výjimka', detail: String(e).slice(0, 140) }); }
      if (potize.length) { pocty.chyba++; nalezy.push({ klic, role, pohled, jazyk: pr.jazyk, velikost: pr.nazev, potize }); }
    }
    await ctx.close();
    console.log(`… ${role} ${pr.jazyk} ${pr.nazev}: hotovo (nálezů zatím ${nalezy.length})`);
  }
}

writeFileSync(VYSTUP, JSON.stringify({ pocty, nalezy }, null, 1));
const podleDruhu = {};
for (const n of nalezy) for (const x of n.potize) podleDruhu[x.druh] = (podleDruhu[x.druh] ?? 0) + 1;
console.log(`\nNačtení: ${pocty.nacteni}, s nálezem: ${pocty.chyba}`, podleDruhu);
process.exit(0);
