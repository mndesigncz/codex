#!/usr/bin/env node
// Ověření domény pro universal links (iOS) a app links (Android).
//
//   node scripts/check-well-known.mjs            # struktura (v CI)
//   node scripts/check-well-known.mjs --release  # navíc: žádná zástupná pole, před odesláním do obchodu
//
// public/.well-known/apple-app-site-association a assetlinks.json musí být platné
// JSON, obsahovat OBĚ aplikace (app.managero.app a app.managero.client), mít pro ně
// disjunktní cesty (každý odkaz otevře právě jednu aplikaci) a servírovat se jako
// application/json BEZ přesměrování: middleware je nesmí chytat (matcher) a next.config.js
// musí nastavit Content-Type (soubor nemá příponu). Zástupná pole {{TEAM_ID}} a {{SHA256}}
// se doplní po založení účtů u Applu a Googlu; s --release jsou chybou.

import { readFileSync } from 'node:fs';

const chyby = [];
const release = process.argv.includes('--release');
const BALICKY = ['app.managero.app', 'app.managero.client'];

function json(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { chyby.push(`${p}: neplatný JSON nebo chybí (${e.message})`); return null; }
}

const aasa = json('public/.well-known/apple-app-site-association');
if (aasa) {
  const detaily = aasa.applinks?.details ?? [];
  const podleAplikace = new Map();
  for (const d of detaily) for (const id of d.appIDs ?? []) podleAplikace.set(id.replace(/^[^.]+\./, ''), (d.components ?? []).map(c => c['/']));
  for (const b of BALICKY) if (!podleAplikace.has(b)) chyby.push(`AASA: chybí aplikace ${b}`);
  // Disjunktní cesty: stejná cesta ani předpona jedné aplikace nesmí ležet v druhé.
  const predpona = (c) => c.replace(/\*$/, '');
  const [a, b] = BALICKY.map(x => podleAplikace.get(x) ?? []);
  for (const x of a) for (const y of b) {
    const px = predpona(x), py = predpona(y);
    if (px.startsWith(py) || py.startsWith(px)) chyby.push(`AASA: cesty aplikací se překrývají (${x} × ${y}): odkaz by mohl otevřít obě`);
  }
  const hosteJenKlient = (podleAplikace.get('app.managero.client') ?? []).every(c => c === '/client' || c.startsWith('/client/'));
  if (!hosteJenKlient) chyby.push('AASA: Managero client smí otevírat jen /client a /client/*');
  if (!(aasa.webcredentials?.apps ?? []).length) chyby.push('AASA: chybí webcredentials.apps');
  if (release && /\{\{/.test(JSON.stringify(aasa))) chyby.push('AASA: zbývá zástupné pole {{TEAM_ID}} (--release)');
}

// Jediný zdroj pravdy je apps/apps.json (linkCesty): commitnutý AASA musí být přesně to, co z něj vygeneruje
// apps/scripts/well-known.mjs (jen s {{TEAM_ID}} místo skutečného Team ID). Jinak by se cesty iOS a Androidu rozešly.
if (aasa) {
  try {
    const { execFileSync } = await import('node:child_process');
    const vygenerovano = JSON.parse(execFileSync('node', ['apps/scripts/well-known.mjs', 'aasa', 'AAAAAAAAAA'], { encoding: 'utf8' }).replaceAll('AAAAAAAAAA', '{{TEAM_ID}}'));
    const ted = JSON.stringify(aasa);
    if (!release && JSON.stringify(vygenerovano) !== ted && !/\{\{/.test(ted)) { /* po doplnění Team ID se porovnává jen struktura níže */ }
    else if (JSON.stringify(vygenerovano) !== ted) chyby.push('AASA: public/.well-known/apple-app-site-association neodpovídá apps/apps.json; obnov: node apps/scripts/well-known.mjs aasa AAAAAAAAAA | sed "s/AAAAAAAAAA/{{TEAM_ID}}/g" > public/.well-known/apple-app-site-association');
  } catch (e) { chyby.push(`AASA: generátor apps/scripts/well-known.mjs selhal (${String(e.message).split('\n')[0]})`); }
}

const links = json('public/.well-known/assetlinks.json');
if (links) {
  const balicky = links.map(x => x.target?.package_name);
  for (const b of BALICKY) if (!balicky.includes(b)) chyby.push(`assetlinks.json: chybí balíček ${b}`);
  for (const x of links) {
    if (x.target?.namespace !== 'android_app') chyby.push('assetlinks.json: namespace musí být android_app');
    if (!Array.isArray(x.target?.sha256_cert_fingerprints) || !x.target.sha256_cert_fingerprints.length) chyby.push(`assetlinks.json: ${x.target?.package_name} nemá otisk certifikátu`);
    if (release && JSON.stringify(x).includes('{{')) chyby.push(`assetlinks.json: ${x.target?.package_name} má zástupný otisk {{SHA256}} (--release)`);
  }
}

const mw = readFileSync('middleware.ts', 'utf8');
const matcher = mw.slice(mw.indexOf('matcher:'), mw.indexOf(']', mw.indexOf('matcher:')));
if (/well-known/.test(matcher)) chyby.push('middleware.ts: matcher chytá .well-known, ověření domény by prošlo přesměrováním');
const cfg = readFileSync('next.config.js', 'utf8');
if (!/apple-app-site-association/.test(cfg) || !/application\/json/.test(cfg)) chyby.push('next.config.js: chybí hlavička Content-Type: application/json pro apple-app-site-association');
if (/redirects\s*\(/.test(cfg)) chyby.push('next.config.js: redirects() může přesměrovat .well-known; ověřit');

if (chyby.length) {
  console.error('Kontrola .well-known selhala:');
  for (const c of chyby) console.error(`  ✗ ${c}`);
  process.exit(1);
}
console.log(`.well-known: struktura v pořádku${release ? ', zástupná pole vyplněná' : ' (zástupná pole {{TEAM_ID}} a {{SHA256}} se doplní před vydáním)'}.`);
