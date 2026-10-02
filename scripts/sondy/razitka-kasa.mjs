// Razítka u kasy (/employer/ctecka): klíč akce, ruční položky, storno a upozornění na vypršelou kartu.
//
// Ruční sonda (je v MIMO v spust.mjs): API podvrhuje fixturami, takže tvrdí jen chování obrazovky.
//  R1 Každý POST akce nese hlavičku Idempotency-Key; opakování téže akce po výpadku sítě má STEJNÝ klíč,
//     další (nová) akce po úspěchu klíč jiný.
//  R2 Odpověď s expiredCount a lost ukáže upozornění „Rozdělaná karta hosta vypršela“.
//  R3 Ruční položky: klepnutí na položky → „Připsat razítka“ → POST action items s položkami a množstvím.
//  R4 Storno poslední akce: tlačítko, potvrzení v okně, POST action storno.
//  R5 Karta mimo okno platnosti ukáže důvod; účtenka, která už věrnost připsala, je zablokovaná.
//  R6 390 px bez vodorovného scrollu.
//   SONDY_ZAKLAD=http://localhost:3414 node scripts/sondy/razitka-kasa.mjs
import { kontext, tvrdi, konec, BASE } from './k68-spolecne.mjs';

const dnes = new Date().toISOString();
const HOST = {
  customer: { id: 7, name: 'Klára Nováková' },
  member: true, points: 240, credit: 0, stamps: 0, visits: 14, spend: 5400,
  campaigns: [
    { id: 1, name: 'Káva za 8 razítek', required: 8, ruleType: 'products', stamps: 5, reward: 'Káva zdarma', completed: 1, platiTed: true, okno: null, vyprsela: false, vyprselaRazitek: 0, dosbiratDo: null, zbyvaDni: null, dalsiKartaOd: null, hotovoNavzdy: false },
    { id: 2, name: 'Happy hour', required: 5, ruleType: 'visit', stamps: 0, reward: null, completed: 0, platiTed: false, okno: 'Po–Pá, 14:00–18:00', vyprsela: false, vyprselaRazitek: 0, dosbiratDo: null, zbyvaDni: null, dalsiKartaOd: null, hotovoNavzdy: false },
  ],
  posledniAkce: { note: 'Káva za 8 razítek: +1 razítko (5/8)', at: dnes },
  polozky: [{ id: 11, name: 'Espresso' }, { id: 12, name: 'Cappuccino' }],
  tierBy: 'visits', levelLabel: 'Člen', tier: 'bronze', discount: 0, tierDiscount: 0, nextTierAt: null,
  stampedToday: false, birthdayToday: false, lastVisit: dnes, openCoupons: [], affordable: [],
  bills: [{ bill_id: 'B1', final_price: 250, paid_at: dnes, awarded: false }, { bill_id: 'B2', final_price: 99, paid_at: dnes, awarded: true }],
  rules: { pointsPer100: 5, stampTarget: 0, stampReward: null, cashbackPct: 0 },
};

function api(zaznam, rezim) {
  return (req, json) => {
    const u = new URL(req.url()); const m = req.method();
    if (u.pathname === '/api/client/staff/scan' && m === 'GET') return json(HOST);
    if (u.pathname === '/api/client/staff/scan' && m === 'POST') {
      const b = JSON.parse(req.postData() || '{}');
      zaznam.push({ ...b, klic: req.headers()['idempotency-key'] ?? null });
      if (rezim.pad > 0) { rezim.pad--; return json({ error: 'Spadlo.' }, 500); }
      return json({ ok: true, message: 'Klára Nováková: Káva za 8 razítek: +1 (6/8)', customer: HOST.customer, ...HOST, expiredCount: 4, lost: 2 });
    }
    return undefined;
  };
}

async function sken(p, text) { await p.keyboard.type(text, { delay: 6 }); await p.keyboard.press('Enter'); }
const scrollX = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const zaznam = []; const rezim = { pad: 1 };
const { ctx, p, chyby } = await kontext({ viewport: { width: 390, height: 900 }, mobil: true, dalsi: api(zaznam, rezim) });
await ctx.addInitScript(() => { try { localStorage.setItem('managero-ctecka-navrat', '0'); } catch { /* */ } });
await p.goto(BASE + '/employer/ctecka', { waitUntil: 'networkidle' });
await p.locator('[data-testid="ctecka"]').waitFor({ timeout: 20000 });
await sken(p, 'ABCD-EFGH');
await p.locator('[data-testid="ctecka-host"]').waitFor({ timeout: 5000 });

// R5
const host = await p.locator('[data-testid="ctecka-host"]').innerText();
tvrdi('R5: karta mimo okno ukáže důvod', /nedává — platí jen Po–Pá, 14:00–18:00/.test(host), host.slice(0, 300));
tvrdi('R5: razítko za návštěvu je zablokované, když žádná karta „za návštěvu“ teď neplatí', await p.getByRole('button', { name: 'Razítko za návštěvu' }).isDisabled());
tvrdi('R5: už připsaná účtenka je zablokovaná', await p.getByRole('button', { name: /už je připsaná/ }).isDisabled());
tvrdi('R6: bez vodorovného scrollu', (await scrollX(p)) <= 0, String(await scrollX(p)));

// R1: první pokus spadne (500) a druhý se stejným klíčem projde
await p.getByRole('button', { name: /Připsat z účtenky 250/ }).click();
await p.waitForTimeout(500);
await p.getByRole('button', { name: /Připsat z účtenky 250/ }).click();
await p.locator('[data-testid="ctecka-potvrzeni"]').waitFor({ timeout: 3000 });
const bill = zaznam.filter(z => z.action === 'bill');
tvrdi('R1: každý POST má Idempotency-Key', bill.length === 2 && bill.every(z => !!z.klic), JSON.stringify(bill));
tvrdi('R1: opakování po chybě serveru má stejný klíč', bill.length === 2 && bill[0].klic === bill[1].klic, JSON.stringify(bill));

// R2
const upoz = await p.locator('[data-testid="razitka-upozorneni"]').innerText();
tvrdi('R2: upozornění na vypršelou kartu (expiredCount)', /vypršela, propadlo 4 razítka/.test(upoz), upoz);
tvrdi('R2: upozornění na razítka, která se nevešla (lost)', /2 razítka se na kartu nevešlo/.test(upoz), upoz);

// R3: ruční položky (nová akce → nový klíč)
await p.getByRole('button', { name: 'Zůstat u hosta' }).click().catch(() => {});
await p.getByRole('button', { name: /Razítka z ručně zadaných položek/ }).click();
await p.getByRole('button', { name: 'Přidat Espresso' }).click();
await p.getByRole('button', { name: 'Přidat Espresso' }).click();
await p.getByRole('button', { name: 'Přidat Cappuccino' }).click();
await p.getByRole('button', { name: /Připsat razítka \(3 kusy\)/ }).click();
await p.locator('[data-testid="ctecka-potvrzeni"]').waitFor({ timeout: 3000 });
const items = zaznam.filter(z => z.action === 'items').pop();
tvrdi('R3: POST items s položkami a množstvím', JSON.stringify(items?.items) === JSON.stringify([{ itemId: 11, qty: 2 }, { itemId: 12, qty: 1 }]), JSON.stringify(items));
tvrdi('R1: nová akce má jiný klíč než předchozí', !!items?.klic && items.klic !== bill[0].klic);

// R4: storno s potvrzením
await p.getByRole('button', { name: 'Storno poslední akce' }).click();
tvrdi('R4: storno se ptá na potvrzení', await p.getByRole('button', { name: 'Stornovat' }).isVisible());
await p.getByRole('button', { name: 'Ne, nechat' }).click();
tvrdi('R4: „Ne, nechat“ nic neposlala', !zaznam.some(z => z.action === 'storno'));
await p.getByRole('button', { name: 'Storno poslední akce' }).click();
await p.getByRole('button', { name: 'Stornovat' }).click();
await p.locator('[data-testid="ctecka-potvrzeni"]').waitFor({ timeout: 3000 });
tvrdi('R4: POST storno', zaznam.some(z => z.action === 'storno'));
tvrdi('bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));
await ctx.close();
await konec();
