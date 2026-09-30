// Vygeneruje apps/<app>/www/{index.html,offline.html} ze šablony a z apps/apps.json.
//   node apps/scripts/sync-www.mjs managero|client      (nebo bez argumentu = obě)
//
// Capacitor chce existující webDir i při server.url. V něm je jen offline.html
// (server.errorPath, když se živý web nenačte) a záchytný index.html, který
// přesměruje na živý web, kdyby někdo server.url vypnul.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spolecne = JSON.parse(readFileSync(`${APPS}/apps.json`, 'utf8'));
const tpl = readFileSync(`${APPS}/_shared/www/offline.html.tpl`, 'utf8');
const klice = process.argv[2] ? [process.argv[2]] : Object.keys(spolecne.apps);

for (const klic of klice) {
  const app = spolecne.apps[klic];
  if (!app) { console.error(`neznámá aplikace: ${klic}`); process.exit(2); }
  const out = `${APPS}/${klic}/www`;
  mkdirSync(out, { recursive: true });
  const offline = tpl.replaceAll('{{NAZEV}}', app.nazev).replaceAll('{{START_URL}}', app.vstupniUrl);
  writeFileSync(`${out}/offline.html`, offline);
  writeFileSync(`${out}/index.html`, `<!doctype html>
<html lang="cs"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta http-equiv="refresh" content="0;url=${app.vstupniUrl}" />
<title>${app.nazev}</title></head>
<body><p><a href="${app.vstupniUrl}">${app.nazev}</a></p></body></html>
`);
  console.log(`www pro ${klic}: ${out}`);
}
