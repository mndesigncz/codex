// Vlastní pokladna (Stripe Checkout Sessions, ui_mode 'elements') v okně „Vyzkoušet Pro“.
//
// Klíče Stripe tu nejsou, takže se podstrčí obojí: /api/billing/checkout (POST založení,
// PATCH příprava) i Stripe.js z js.stripe.com (falešné initCheckoutElementsSdk, které
// zaznamená, co mu okno předá, a „platební pole“ nahradí šedým obdélníkem). Sonda tvrdí,
// co okno pošle a ukáže: náš vzhled a písmo do Stripe, IČO s kontrolním součtem, souhlas
// s podmínkami, slevový kód, „Dnes 0 Kč / první platba“, zamítnutou kartu, úspěch a zálohu
// na hostovanou pokladnu, když se Stripe.js nenačte. Na 390 px nic nepřetéká a tlačítko
// platby je vidět bez posouvání; světlý i tmavý režim, čeština i němčina.
//
// Build musí mít NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (stačí falešný pk_test_…), jinak okno
// rovnou přesměruje na hostovanou pokladnu (to je správně, ale vlastní pokladnu to neukáže).
// Snímky: SONDY_SNIMKY (výchozí scripts/sondy/shots).
import { mkdirSync } from 'node:fs';
import { kontext, tvrdi, konec, BASE, OUT } from './k68-spolecne.mjs';

const SNIMKY = process.env.SONDY_SNIMKY ?? OUT;
mkdirSync(SNIMKY, { recursive: true });

// Falešný Stripe.js: tvar API podle @stripe/stripe-js 9.x (checkout.d.ts).
const FALESNY_STRIPE = `(() => {
  const V = window.__stripe = { pk: null, locale: null, init: null, peOpts: null, appearance: [], promo: [], tax: [], server: 0, confirm: 0, confirmOpts: null };
  const trialEnd = Math.floor(Date.UTC(2026, 11, 6, 12) / 1000);
  let sleva = false; let onChange = () => {};
  const amount = (m) => ({ minorUnitsAmount: m, amount: (m / 100).toFixed(2).replace('.', ',') + ' Kč' });
  const session = () => ({
    id: 'cs_test_sondaABCDEFGH12', email: 'majitel@kavarna-u-lipy.cz', currency: 'czk', minorUnitsAmountDivisor: 100, canConfirm: true,
    status: { type: 'open' }, lineItems: [], livemode: false, businessName: null, taxIdInfo: null,
    total: { total: amount(0), subtotal: amount(0), discount: amount(0) },
    recurring: { interval: 'month', intervalCount: 1, isProrated: false, trial: { trialEnd, trialPeriodDays: 30 },
      dueNext: { total: amount(sleva ? 34930 : 49900), subtotal: amount(49900), discount: amount(sleva ? 14970 : 0) } },
    discountAmounts: sleva ? [{ ...amount(14970), displayName: 'MAX30', promotionCode: 'MAX30', recurring: null, percentOff: 30 }] : null,
  });
  function Stripe(pk, o) {
    V.pk = pk; V.locale = o && o.locale;
    return {
      _registerWrapper() {},
      initCheckoutElementsSdk(o) {
        V.init = { tajemstvi: o.clientSecret, appearance: o.elementsOptions && o.elementsOptions.appearance, fonts: o.elementsOptions && o.elementsOptions.fonts };
        return {
          on(ev, h) { if (ev === 'change') onChange = h; },
          changeAppearance(a) { V.appearance.push(a); },
          loadFonts() {},
          createPaymentElement(opts) {
            V.peOpts = opts; const h = {};
            return {
              on(ev, f) { h[ev] = f; return this; },
              mount(el) {
                el.innerHTML = '<div data-falesne-pole style="height:236px;border-radius:14px;background:rgba(128,128,128,.12);display:flex;align-items:center;justify-content:center;font:13px system-ui;color:#888">Payment Element (podvrh)</div>';
                setTimeout(() => h.ready && h.ready({ elementType: 'payment' }), 80);
              },
              destroy() {}, unmount() {}, update() {},
            };
          },
          loadActions: async () => ({ type: 'success', actions: {
            getSession: session,
            applyPromotionCode: async (k) => { V.promo.push(k); if (String(k).toUpperCase() === 'MAX30') { sleva = true; const s = session(); onChange(s); return { type: 'success', session: s }; } return { type: 'error', error: { code: 'invalidCode', message: 'This code is invalid.' } }; },
            removePromotionCode: async () => { sleva = false; const s = session(); onChange(s); return { type: 'success', session: s }; },
            updateTaxIdInfo: async (x) => { V.tax.push(x); return { type: 'success', session: session() }; },
            runServerUpdate: async (fn) => { V.server++; try { await fn(); return { type: 'success', session: session() }; } catch (e) { return { type: 'error', error: { message: String(e && e.message), code: null } }; } },
            confirm: async (o) => { V.confirm++; V.confirmOpts = o;
              if (window.__zamitnout) return { type: 'error', error: { code: 'paymentFailed', message: 'Karta byla zamítnuta.', paymentFailed: { declineCode: 'card_declined' } } };
              return { type: 'success', session: session() }; },
          } }),
        };
      },
    };
  }
  Stripe.version = 'dahlia';
  window.Stripe = Stripe;
})();`;

/** Kontext s podvrženou pokladnou; `stripeNejde` = js.stripe.com neodpoví (blokátor). */
async function otevri({ sirka, tmavy = false, jazyk = 'cs', stripeNejde = false }) {
  const mobil = sirka < 600;
  const zaznam = { posty: [], patche: [] };
  const { ctx, p, chyby } = await kontext({
    viewport: { width: sirka, height: mobil ? 844 : 900 }, mobil, tmavy,
    dalsi: (req, json) => {
      const u = new URL(req.url());
      if (u.pathname !== '/api/billing/checkout') return undefined;
      const telo = JSON.parse(req.postData() || '{}');
      if (req.method() === 'POST') {
        zaznam.posty.push(telo);
        if (telo.ui !== 'elements') return json({ url: `${BASE}/employer/overview?view=settings&tab=billing&hostovana=1` });
        return json({ clientSecret: 'cs_test_sondaABCDEFGH12_secret_xyz', ui: 'elements', ico: '27082440', firma: 'Kavárna U Lípy', souhlas: true, trial: true });
      }
      if (req.method() === 'PATCH') {
        zaznam.patche.push(telo);
        return json({ ok: true });
      }
      return undefined;
    },
  });
  if (jazyk !== 'cs') await ctx.addCookies([{ name: 'managero-lang', value: jazyk, domain: new URL(BASE).hostname, path: '/', sameSite: 'Lax' }]);
  await ctx.route('https://js.stripe.com/**', r => stripeNejde ? r.abort() : r.fulfill({ status: 200, contentType: 'application/javascript', body: FALESNY_STRIPE }));
  await p.goto(BASE + '/employer/overview?view=settings&tab=billing', { waitUntil: 'networkidle' });
  return { ctx, p, chyby, zaznam };
}

const zkousku = (p) => p.getByRole('button', { name: /Vyzkoušet 30 dní zdarma|30 Tage kostenlos testen|Try free for 30 days/ }).first();
const tlacitko = (p) => p.locator('[data-zaplatit]');
async function pripravena(p) {
  await p.locator('[data-vlastni-pokladna]:not([aria-busy])').waitFor({ timeout: 20000 });
  await p.waitForFunction(() => { const b = document.querySelector('[data-zaplatit]'); return b && !b.disabled; }, null, { timeout: 10000 });
  // Na telefonu okno vyjíždí zdola (0,3 s): měří se až dosednuté.
  await p.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'), null, { timeout: 5000 }).catch(() => {});
}

// ---------------------------------------------------------------------------
// 1) Celý průchod na monitoru (světlý, česky)
{
  const { ctx, p, chyby, zaznam } = await otevri({ sirka: 1280 });
  await zkousku(p).click();
  await p.getByRole('dialog').waitFor({ timeout: 10000 });
  await pripravena(p);
  const dlg = p.getByRole('dialog');
  tvrdi('1280: okno žádá vlastní pokladnu (ui elements) pro Pro měsíčně', zaznam.posty[0]?.ui === 'elements' && zaznam.posty[0]?.plan === 'pro' && zaznam.posty[0]?.interval === 'month', JSON.stringify(zaznam.posty));
  const s = await p.evaluate(() => window.__stripe);
  tvrdi('Stripe.js: veřejný klíč, jazyk aplikace (cs) a client secret z relace', /^pk_/.test(s.pk ?? '') && s.locale === 'cs' && s.init?.tajemstvi === 'cs_test_sondaABCDEFGH12_secret_xyz', JSON.stringify({ pk: s.pk, locale: s.locale }));
  tvrdi('Stripe Elements: vzhled Manageru (Geist, inkoust, rádius 14, limetkový fokus)',
    /^Geist/.test(s.init?.appearance?.variables?.fontFamily ?? '') && s.init?.appearance?.variables?.colorPrimary === '#16181A' && s.init?.appearance?.variables?.borderRadius === '14px'
    && /200,245,66/.test(s.init?.appearance?.rules?.['.Input:focus']?.boxShadow ?? ''), JSON.stringify(s.init?.appearance?.variables ?? {}).slice(0, 200));
  tvrdi('Stripe Elements: písmo Geist z našeho původu', (s.init?.fonts ?? []).length === 3 && s.init.fonts.every(f => f.src.includes(`${BASE}/fonts/Geist-Variable.woff2`)), JSON.stringify(s.init?.fonts));
  const pismo = await p.request.get(BASE + '/fonts/Geist-Variable.woff2');
  tvrdi('písmo: 200 s Access-Control-Allow-Origin (rám Stripe ho smí načíst)', pismo.status() === 200 && pismo.headers()['access-control-allow-origin'] === '*', `${pismo.status()} ${pismo.headers()['access-control-allow-origin']}`);
  tvrdi('Payment Element: rozbalovací seznam metod (karta, Apple Pay / Google Pay, Klarna…)', s.peOpts?.layout?.type === 'accordion', JSON.stringify(s.peOpts));

  const text = await dlg.innerText();
  tvrdi('nic ze Stripe vzhledu: žádné „Přidat kód“, „Zobrazit podrobnosti“', !/Přidat kód|Zobrazit podrobnosti|Add code|View details/i.test(text));
  tvrdi('e-mail účtu jen ke čtení (ze Stripe)', await dlg.locator('[data-email-pokladny]').innerText() === 'majitel@kavarna-u-lipy.cz' && await dlg.locator('input[type=email]').count() === 0);
  const shrnuti = await dlg.locator('[data-shrnuti-platby]').innerText();
  tvrdi('shrnutí: dnes 0 Kč, první platba 499 Kč 6. prosince 2026', /Dnes zaplatíte\s*0\s*Kč/.test(shrnuti) && /První platba 6\. prosince 2026\s*499\s*Kč/.test(shrnuti), shrnuti);
  tvrdi('tlačítko: „Začít zkušební dobu“, limetka jediná v okně', (await tlacitko(p).innerText()).trim() === 'Začít zkušební dobu' && await dlg.locator('.on-accent').count() === 1, await tlacitko(p).innerText());
  tvrdi('IČO předvyplněné z profilu podniku', await p.locator('#pokladna-ico').inputValue() === '27082440');
  tvrdi('souhlas s obchodními podmínkami: zaškrtávátko nezaškrtnuté a odkaz na /obchodni-podminky',
    !(await p.locator('#pokladna-souhlas').isChecked()) && await dlg.locator('a[href="/obchodni-podminky"]').count() >= 1);
  await p.screenshot({ path: `${SNIMKY}/pokladna-1280-svetly.png` });

  // IČO s chybným součtem: nic se neodešle
  await p.locator('#pokladna-ico').fill('27082441');
  await tlacitko(p).click();
  await p.waitForTimeout(300);
  tvrdi('IČO se špatným součtem: chyba u pole, nic do Stripe ani na server',
    await dlg.getByText('IČO nesedí: má 8 číslic a platný kontrolní součet.').isVisible() && zaznam.patche.length === 0 && (await p.evaluate(() => window.__stripe.confirm)) === 0);
  await p.locator('#pokladna-ico').fill('27082440');

  // Bez souhlasu: nic se neodešle
  await tlacitko(p).click();
  await p.waitForTimeout(300);
  tvrdi('bez souhlasu s podmínkami: chyba a fokus na zaškrtávátku, platba nezačne',
    await dlg.getByText('Bez souhlasu s obchodními podmínkami předplatné objednat nejde.').isVisible() && zaznam.patche.length === 0
    && await p.evaluate(() => document.activeElement?.id) === 'pokladna-souhlas');

  // Slevový kód: neplatný, pak MAX30
  await dlg.getByRole('button', { name: 'Mám slevový kód' }).click();
  await p.locator('#pokladna-kod').fill('NEPLATI');
  await dlg.getByRole('button', { name: 'Použít' }).click();
  await dlg.getByText('Tenhle slevový kód neplatí nebo už vypršel.').waitFor({ timeout: 5000 }).catch(() => {});
  tvrdi('neplatný slevový kód: česká chyba z naší pokladny', await dlg.getByText('Tenhle slevový kód neplatí nebo už vypršel.').isVisible());
  await p.locator('#pokladna-kod').fill('MAX30');
  await dlg.getByRole('button', { name: 'Použít' }).click();
  await dlg.getByText('Slevový kód MAX30 je použitý').waitFor({ timeout: 5000 }).catch(() => {});
  const poSleve = await dlg.locator('[data-shrnuti-platby]').innerText();
  tvrdi('MAX30: použitý, sleva v souhrnu, první platba 349,30 Kč', await dlg.getByText('Slevový kód MAX30 je použitý').isVisible() && /Sleva\s*−149,70\s*Kč/.test(poSleve) && /349,30\s*Kč/.test(poSleve), poSleve);

  // DIČ (nepovinné) jde do Stripe přes updateTaxIdInfo
  await dlg.getByRole('button', { name: 'Jsem plátce DPH, přidat DIČ' }).click();
  await p.locator('#pokladna-dic').fill('cz 27082440');
  await p.locator('#pokladna-souhlas').check();

  // Zamítnutá karta
  await p.evaluate(() => { window.__zamitnout = true; });
  await tlacitko(p).click();
  await dlg.locator('[data-chyba-platby]').waitFor({ timeout: 8000 }).catch(() => {});
  tvrdi('zamítnutá karta: srozumitelná chyba v okně, okno zůstává', /Platba neprošla: Karta byla zamítnuta\./.test(await dlg.locator('[data-chyba-platby]').innerText().catch(() => '')) && await dlg.isVisible());
  const st = await p.evaluate(() => window.__stripe);
  tvrdi('příprava: PATCH s id relace, IČO a souhlasem uvnitř runServerUpdate, pak confirm (redirect if_required)',
    zaznam.patche.length === 1 && zaznam.patche[0].sessionId === 'cs_test_sondaABCDEFGH12' && zaznam.patche[0].ico === '27082440' && zaznam.patche[0].souhlas === true
    && st.server === 1 && st.confirm === 1 && st.confirmOpts?.redirect === 'if_required', JSON.stringify({ patche: zaznam.patche, server: st.server, confirm: st.confirm }));
  tvrdi('DIČ: updateTaxIdInfo s CZ… a názvem firmy', st.tax[0]?.taxId?.type === 'eu_vat' && st.tax[0]?.taxId?.value === 'CZ27082440' && st.tax[0]?.businessName === 'Kavárna U Lípy', JSON.stringify(st.tax));

  // Úspěch
  await p.evaluate(() => { window.__zamitnout = false; });
  await tlacitko(p).click();
  await p.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  tvrdi('úspěch: okno se zavře a Předplatné ukáže poděkování (onDone)', await p.getByRole('dialog').count() === 0 && await p.getByText('Díky! Předplatné je nastavené').isVisible());
  tvrdi('1280: bez chyb na stránce', chyby.length === 0, chyby.join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 2) Telefon 390 a tmavý režim: nic nepřetéká, tlačítko je vidět bez posouvání
for (const [sirka, tmavy, jazyk] of [[390, false, 'cs'], [390, true, 'cs'], [1280, true, 'cs'], [390, false, 'de']]) {
  const jm = `${sirka} ${tmavy ? 'tmavý' : 'světlý'} ${jazyk}`;
  const { ctx, p, chyby } = await otevri({ sirka, tmavy, jazyk });
  await zkousku(p).click();
  await p.getByRole('dialog').waitFor({ timeout: 10000 });
  await pripravena(p);
  const s = await p.evaluate(() => window.__stripe);
  if (tmavy) tvrdi(`${jm}: Stripe Elements v tmavém vzhledu (limetka, povrch okna)`, s.init?.appearance?.variables?.colorPrimary === '#C8F542' && s.init?.appearance?.variables?.colorBackground === '#1E2124', JSON.stringify(s.init?.appearance?.variables ?? {}).slice(0, 160));
  if (jazyk !== 'cs') tvrdi(`${jm}: Stripe.js i texty v jazyce aplikace`, s.locale === jazyk && /Testphase starten/.test(await tlacitko(p).innerText()), `${s.locale} ${await tlacitko(p).innerText()}`);
  const m = await p.evaluate(() => {
    const d = document.querySelector('[role=dialog]');
    const r = d.getBoundingClientRect();
    const b = document.querySelector('[data-zaplatit]').getBoundingClientRect();
    const pres = [...d.querySelectorAll('*')].filter(e => { const q = e.getBoundingClientRect(); return q.width > 0 && (q.right > r.right + 1 || q.left < r.left - 1); }).map(e => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)}`);
    return { stranka: document.documentElement.scrollWidth, okno: innerWidth, pres: pres.slice(0, 5), tlacitko: { top: b.top, bottom: b.bottom, vyska: b.height }, vyskaOkna: innerHeight };
  });
  tvrdi(`${jm}: nic nepřetéká z okna ani ze stránky`, m.stranka <= m.okno && m.pres.length === 0, JSON.stringify(m));
  tvrdi(`${jm}: tlačítko platby 52 px a vidět bez posouvání`, m.tlacitko.bottom <= m.vyskaOkna && m.tlacitko.top >= 0 && Math.round(m.tlacitko.vyska) === 52, JSON.stringify(m.tlacitko));
  await p.screenshot({ path: `${SNIMKY}/pokladna-${sirka}-${tmavy ? 'tmavy' : 'svetly'}-${jazyk}.png` });
  if (sirka === 390) {
    // Celé okno odscrollované dolů: souhrn, souhlas a poznámka o Stripe.
    await p.locator('[role=dialog] .overflow-y-auto').evaluate(e => { e.scrollTop = e.scrollHeight; });
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${SNIMKY}/pokladna-${sirka}-${tmavy ? 'tmavy' : 'svetly'}-${jazyk}-dole.png` });
  }
  tvrdi(`${jm}: bez chyb na stránce`, chyby.length === 0, chyby.join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 3) Stripe.js se nenačte (blokátor): platba jde přes hostovanou pokladnu
{
  const { ctx, p, zaznam } = await otevri({ sirka: 1280, stripeNejde: true });
  await zkousku(p).click();
  await p.waitForURL(u => u.searchParams.get('hostovana') === '1', { timeout: 15000 }).catch(() => {});
  tvrdi('bez Stripe.js: druhý požadavek bez ui a přesměrování na hostovanou pokladnu',
    zaznam.posty.length === 2 && zaznam.posty[0].ui === 'elements' && zaznam.posty[1].ui === undefined && new URL(p.url()).searchParams.get('hostovana') === '1', JSON.stringify({ posty: zaznam.posty, url: p.url() }));
  await ctx.close();
}

await konec();
