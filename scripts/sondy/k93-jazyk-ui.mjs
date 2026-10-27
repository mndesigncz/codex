// Kolo 93: v angličtině (a němčině) nesmí v UI zůstat čeština.
//
// Na produkci v angličtině zůstalo česky celé Managero client (lišta „Přehled · Rezervace ·
// Čtečka u kasy · Hosté", stránky správy), pozdrav „Dobrý den, Eliška" a datum „Úterý 27. října"
// v hlavičce Přehledu. Sonda projde ukázku /demo (vedení, zaměstnanec, tablet, všechny záložky
// Managero client) a hostovskou ukázku /client/demo s cookie managero-lang=en (390 i 1280)
// a de (390) a hledá český text: diakritiku, kterou angličtina ani němčina nemají, a pár
// českých slov bez diakritiky.
//
// Co se nepočítá: data ukázky (jména, poznámky, názvy podniků, položky menu — všechny řetězce
// z lib/demo/** a lib/klient/demo/**, celá i po slovech u jmen), údaje provozovatele (lib/firma.ts),
// endonymy jazyků v přepínači (Čeština, Slovenčina) a měna Kč (formát peněz řídí podnik).
//
// Vědomě vynecháno: Managero client → Stránka podniku (BrandTab.tsx) — v kole 93 ji přebarvuje
// souběžná práce a texty se do ní nesahalo; až se přeloží, smaže se z VYNECHAT.
//
//   SONDY_ZAKLAD=http://localhost:3116 node scripts/sondy/k93-jazyk-ui.mjs
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';
const ROOT = new URL('../../', import.meta.url).pathname;
const HOST = new URL(BASE).hostname;

// ---- Data ukázky: co smí zůstat česky -------------------------------------------------
function* walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) yield* walk(p); else if (/\.(ts|json)$/.test(n)) yield p; } }
const data = new Set();
const slovaJmen = new Set();
const zdroje = [...walk(ROOT + 'lib/demo'), ...walk(ROOT + 'lib/klient/demo'), ROOT + 'lib/firma.ts'];
for (const f of zdroje) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`]*)`/g)) {
    const v = m[1] ?? m[2] ?? m[3] ?? '';
    for (const kus of v.split(/\$\{[^}]*\}/)) { const k = kus.trim(); if (k.length >= 3 && /\p{L}/u.test(k)) data.add(k); }
    // Jména („Eliška Nováková") se v UI zkracují („Eliška N.", „Dobrý den, Eliška") — whitelist i po slovech.
    if (/^\p{Lu}\p{Ll}+( \p{Lu}\p{Ll}+){1,2}$/u.test(v)) for (const sl of v.split(' ')) slovaJmen.add(sl);
  }
}
for (const endonym of ['Čeština', 'Slovenčina', 'Polski', 'Deutsch', 'English']) data.add(endonym);
data.add('IČO'); // „company ID (IČO)" — české označení zůstává i v cizím jazyce (právní údaj)
// Porovnává se bez ohledu na velikost písmen: název odměny se v UI vkládá do věty malým („… káva podle výběru …").
const dataSerazena = [...data].map(s => s.toLowerCase()).sort((a, b) => b.length - a.length);
const slovaJmenMala = new Set([...slovaJmen].map(s => s.toLowerCase()));
// Diakritika, kterou angličtina ani němčina nepoužívá (é jen s jiným znakem — „Café" je v datech).
const RE_CZ = /[áčďěíňřšťúůýž]|\b(dnes|zítra|rezervace|akce|stoly|fronta|nebo|jen|bez|osob|kupony|poukazy|podnik|hledat|uložit|zrušit|přidat)\b/;
/** Očistí text o data ukázky; vrátí, co zbylo. */
function bezDat(text) {
  let r = text.replace(/https?:\/\/\S+/g, ' ');
  for (const d of dataSerazena) if (r.includes(d)) r = r.split(d).join(' ');
  return r.replace(/\p{L}+/gu, w => (slovaJmenMala.has(w) ? ' ' : w)).replace(/(?<!\p{L})\p{L}\./gu, ' ').replace(/kč/g, ' ');
}
function cesky(text) {
  let puvodni = text.toLowerCase();
  if (!RE_CZ.test(bezDat(puvodni))) return null;
  // Konec textu je kus dat — zkrácený výpustkou („…dodavatele koláčů…") nebo bez tečky na konci („Další akce: Vytřela
  // jsem sklad i chodbu, včetně rohů"). Zkouší se od každého začátku slova; kus delší než 7 znaků.
  for (let i = 0; i < puvodni.length; i++) {
    if (i > 0 && !/[\s:(„"]/.test(puvodni[i - 1])) continue;
    const kus = puvodni.slice(i).replace(/…\s*$/, '').trim();
    if (kus.length < 8) break;
    if (dataSerazena.some(d => d.includes(kus))) { puvodni = puvodni.slice(0, i); break; }
  }
  const r = bezDat(puvodni);
  return RE_CZ.test(r) ? r.trim() : null;
}

// ---- Obrazovky -------------------------------------------------------------------------
const CLIENT_TABS = ['overview', 'reservations', 'orders', 'tables', 'reader', 'customers', 'campaigns', 'reviews', 'loyalty', 'cards', 'menu', 'events', 'settings'];
const VYNECHAT = ['brand']; // viz hlavička
const CESTY = [
  '/demo', '/demo?scena=rozvrh', '/demo?scena=uzaverka&role=vedeni', '/demo?scena=sklad', '/demo?scena=ukoly', '/demo?scena=tym',
  '/demo?role=zamestnanec', '/demo?scena=rozvrh&role=zamestnanec', '/demo?scena=uzaverka', '/demo?scena=sklad&role=zamestnanec', '/demo?scena=ukoly&role=zamestnanec',
  '/demo?scena=kiosk',
  ...CLIENT_TABS.filter(t => !VYNECHAT.includes(t)).map(t => `/demo?mode=client&tab=${t}`),
  '/client/demo', '/client/demo/podniky', '/client/demo/odmeny', '/client/demo/odmeny?z=nabidky', '/client/demo/odmeny?z=vyzvy', '/client/demo/odmeny?z=historie',
  '/client/demo/aktivita', '/client/demo/profil', '/client/demo/p/kavarna-u-lipy', '/client/demo/p/bistro-orech', '/client/demo/p/bar-pod-vezi',
];
const BEHY = [['en', 390], ['en', 1280], ['de', 390]];

const SBER = () => {
  const out = new Set();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    const s = n.textContent.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const el = n.parentElement;
    if (!el || el.closest('script,style,noscript')) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue;
    out.add(s);
  }
  for (const el of document.querySelectorAll('[aria-label],[title],[placeholder]')) {
    for (const a of ['aria-label', 'title', 'placeholder']) { const v = el.getAttribute(a); if (v) out.add(v.replace(/\s+/g, ' ').trim()); }
  }
  return [...out];
};

const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const nalezy = new Map(); // text → [kde]
let stranek = 0;
for (const [jazyk, sirka] of BEHY) {
  const mobil = sirka < 600;
  const ctx = await b.newContext({ viewport: { width: sirka, height: mobil ? 844 : 900 }, isMobile: mobil, hasTouch: mobil, locale: jazyk === 'de' ? 'de-DE' : 'en-GB' });
  await ctx.addCookies([{ name: 'managero-lang', value: jazyk, domain: HOST, path: '/', sameSite: 'Lax' }]);
  for (const c of CESTY) {
    const p = await ctx.newPage();
    const chyby = [];
    p.on('pageerror', e => chyby.push(String(e).slice(0, 140)));
    // Spadlá sekce (ErrorBoundary) chybu jen zaloguje — i tu je potřeba vidět (kolo 93: t(undefined) shodilo Kupony).
    p.on('console', m => { if (m.type() === 'error' && /sekce spadla/.test(m.text())) chyby.push(m.text().slice(0, 140)); });
    await p.goto(BASE + c, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => chyby.push(String(e).slice(0, 140)));
    await p.waitForTimeout(900);
    const lang = await p.evaluate(() => document.documentElement.lang).catch(() => '');
    if (lang !== jazyk) { const k = `<html lang="${lang}"> místo ${jazyk}`; nalezy.set(k, [...(nalezy.get(k) ?? []), `${jazyk} ${sirka} ${c}`]); }
    for (const s of await p.evaluate(SBER).catch(() => [])) {
      if (!cesky(s)) continue;
      nalezy.set(s, [...(nalezy.get(s) ?? []), `${jazyk} ${sirka} ${c}`]);
    }
    for (const e of chyby) nalezy.set(`chyba stránky: ${e}`, [...(nalezy.get(`chyba stránky: ${e}`) ?? []), `${jazyk} ${sirka} ${c}`]);
    stranek++;
    await p.close();
  }
  await ctx.close();
}
await b.close();

console.log(`Prošlo ${stranek} obrazovek (${BEHY.map(([j, s]) => `${j} ${s}`).join(', ')}).`);
if (nalezy.size === 0) console.log('✓ žádný český text mimo data ukázky');
else {
  for (const [s, kde] of [...nalezy].sort()) console.log(`✗ „${s.slice(0, 120)}"  ← ${kde.slice(0, 2).join(' · ')}${kde.length > 2 ? ` (+${kde.length - 2})` : ''}`);
  console.log(`\n${nalezy.size} českých textů v cizím jazyce.`);
}
process.exit(nalezy.size ? 1 : 0);
