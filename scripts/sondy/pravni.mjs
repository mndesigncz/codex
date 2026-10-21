// Právní stránky (2026-10-21): provozovatel Martin Nemeškal, obchodní podmínky, DPA, subzpracovatelé.
//
//  P1 Každá právní stránka česky i anglicky se vykreslí (200), nemá zástupná pole {{…}},
//     „Návrh“ ani odkaz na zrušenou platformu ODR a nese identifikaci provozovatele
//     (jméno, IČO, sídlo, zápis v rejstříku) a telefon.
//  P2 Odkazy mezi právními stránkami vedou na existující stránky (200) a kotvy (#…) existují.
//  P3 /cenik vede na ceník na landingu; landing má v patičce identifikaci a odkazy na
//     obchodní podmínky; ceník neříká „bez DPH“.
//  P4 Telefon 390: nic nepřetéká do strany, odkazy v patičce jsou dotykové cíle.
//  P5 Podmínky užívání mají ADR ČOI a kontaktní místo DSA; zásady kotvy #cookies, #retence, #smazani.
import { browser, tvrdi, konec, BASE } from './k68-spolecne.mjs';

const DOKUMENTY = ['obchodni-podminky', 'zpracovatelska-smlouva', 'subzpracovatele', 'zruseni-predplatneho',
  'podminky', 'soukromi', 'podpora', 'smazat-ucet', 'informace-pro-zamestnance'];
const STRANKY = [...DOKUMENTY.flatMap(k => [`/${k}`, `/en/${k}`]), '/nahlasit'];

const textZHtml = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------
console.log('P1 Stránky, identifikace, bez zástupných polí');
const stavy = new Map();
async function stav(cesta) {
  if (!stavy.has(cesta)) {
    const r = await fetch(BASE + cesta, { redirect: 'manual' });
    stavy.set(cesta, { status: r.status, html: r.status === 200 ? await r.text() : '', kam: r.headers.get('location') });
  }
  return stavy.get(cesta);
}
for (const cesta of STRANKY) {
  const r = await stav(cesta);
  const t = textZHtml(r.html);
  tvrdi(`${cesta}: 200`, r.status === 200, String(r.status));
  if (r.status !== 200) continue;
  tvrdi(`${cesta}: bez zástupných polí a „Návrh“`, !/\{\{|\}\}/.test(t) && !/Návrh:|Draft:/.test(t), t.match(/.{30}(\{\{|Návrh:|Draft:).{30}/)?.[0]);
  tvrdi(`${cesta}: bez platformy ODR`, !/\bODR\b|ec\.europa\.eu\/consumers\/odr/.test(r.html));
  tvrdi(`${cesta}: identifikace provozovatele`, t.includes('Martin Nemeškal') && t.includes('17944953') && t.includes('Míru 482, 790 70 Javorník') && /živnostenském rejstříku|Trade Register/.test(t));
  tvrdi(`${cesta}: telefon a e-mail jako odkazy`, r.html.includes('href="tel:+420727960413"') && r.html.includes('href="mailto:podpora@managero.app"'));
  tvrdi(`${cesta}: neplátce DPH`, /Neplátce DPH|Not a VAT payer/.test(t));
}

// ---------------------------------------------------------------------------
console.log('P2 Odkazy mezi stránkami a kotvy');
const odkazy = new Set();
for (const cesta of STRANKY) {
  const { html } = await stav(cesta);
  for (const m of html.matchAll(/href="(\/[^"]*)"/g)) {
    const h = m[1].replace(/&amp;/g, '&');
    if (h.startsWith('/_next') || h === '/') continue;
    odkazy.add(h);
  }
}
for (const h of [...odkazy].sort()) {
  const [cesta, kotva] = h.split('#');
  const r = await stav(cesta || '/');
  const ok = r.status === 200 || (r.status >= 300 && r.status < 400);
  tvrdi(`odkaz ${h}: ${r.status}`, ok, String(r.status));
  if (kotva && r.status === 200 && cesta !== '/') tvrdi(`kotva ${h} existuje`, r.html.includes(`id="${kotva}"`));
}

// ---------------------------------------------------------------------------
console.log('P3 Ceník a landing');
{
  const r = await stav('/cenik');
  tvrdi('/cenik přesměruje na /#cenik', r.status >= 300 && r.status < 400 && /\/#cenik$/.test(r.kam ?? ''), `${r.status} ${r.kam}`);
  const l = await stav('/');
  const t = textZHtml(l.html);
  tvrdi('landing: ceník má kotvu #cenik', l.html.includes('id="cenik"'));
  tvrdi('landing: patička s identifikací provozovatele', t.includes('Managero provozuje Martin Nemeškal, IČO 17944953'));
  tvrdi('landing: odkaz na obchodní podmínky a zrušení předplatného', l.html.includes('href="/obchodni-podminky"') && l.html.includes('href="/zruseni-predplatneho"'));
  tvrdi('landing: ceník neříká „bez DPH“, ale konečné ceny neplátce', !/bez DPH/.test(t) && /není plátcem DPH/.test(t), t.match(/.{40}DPH.{40}/)?.[0]);
}

// ---------------------------------------------------------------------------
console.log('P5 Obsah, který musí být');
{
  const pod = textZHtml((await stav('/podminky')).html);
  tvrdi('podmínky: ADR ČOI', /adr\.coi\.gov\.cz/.test(pod) && /Česká obchodní inspekce/.test(pod));
  tvrdi('podmínky: kontaktní místo DSA a moderace', /čl\. 11 a 12/.test(pod) && /Jak obsah moderujeme/.test(pod));
  const sou = (await stav('/soukromi')).html;
  tvrdi('zásady: kotvy #cookies, #retence, #smazani', ['cookies', 'retence', 'smazani'].every(k => sou.includes(`id="${k}"`)));
  tvrdi('zásady: ÚOOÚ', /uoou\.gov\.cz/.test(sou));
  const op = textZHtml((await stav('/obchodni-podminky')).html);
  tvrdi('obchodní podmínky: ceny z ceníku, neplátce, zkušební doba, Data Act', /499\s*Kč/.test(op) && /3\s*990\s*Kč/.test(op) && /není plátcem DPH/.test(op) && /30 dní zdarma/.test(op) && /přechodné období/.test(op));
  const sub = textZHtml((await stav('/subzpracovatele')).html);
  tvrdi('subzpracovatelé: Vercel, Neon, Resend, Apple, Google, Stripe', ['Vercel', 'Neon', 'Resend', 'Apple', 'Google', 'Stripe'].every(x => sub.includes(x)));
}

// ---------------------------------------------------------------------------
console.log('P4 Telefon 390: bez přetečení, dotykové cíle');
{
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  for (const cesta of [...STRANKY, '/']) {
    await p.goto(BASE + cesta, { waitUntil: 'networkidle' });
    const m = await p.evaluate(() => {
      const malo = [...document.querySelectorAll('footer[data-provozovatel] a')].map(a => a.getBoundingClientRect()).filter(r => r.width > 0 && r.height < 44).length;
      return { pretece: document.documentElement.scrollWidth > window.innerWidth + 1, sirka: document.documentElement.scrollWidth, malo };
    });
    tvrdi(`${cesta} 390: nepřetéká`, !m.pretece, `scrollWidth ${m.sirka}`);
    if (cesta !== '/') tvrdi(`${cesta} 390: odkazy v patičce jsou dotykové cíle`, m.malo === 0, `${m.malo} malých`);
  }
  await ctx.close();
}

await konec();
