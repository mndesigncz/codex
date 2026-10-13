// Přetečení — vedoucí na telefonu: všech 19 pohledů (overview … events) na 320 a 390 px
// česky. Tablet a monitor (768/1024) jsou v preteceni-vedeni-tablet.mjs, němčina
// a polština v preteceni-jazyky.mjs — rozdělené, ať každá sonda zůstane pod limitem
// spouštěče (76 obrazovek v jedné sondě trvalo na dev serveru přes 240 s).
// Co se měří a proč: preteceni-jadro.mjs. Fixtury: výchozí podvrh z k68-spolecne
// (jako snimky-vse), tedy stejná data, jaká vidí snímky pro UX audit.
//
// Kolo 7 (R7-7): navíc záložky Nastavení, které mají vlastní obsah se seznamy a tabulkami
// (Předplatné — srovnání tarifů, Historie změn — pás lidí a hledání, Organizace, Notifikace,
// Profil podniku). Na telefonu ?tab= otevře rovnou sekci, ne seznam sekcí. Předplatné,
// Historie a Organizace se měří i na 768 px (mezipásmo: boční pás + obsah).
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/preteceni-vedeni.mjs [šířka,šířka] [pohled,pohled]
import { kontext, konec, POHLEDY, url, viewport, projdi } from './preteceni-jadro.mjs';

const ZALOZKY_NASTAVENI = ['billing', 'audit', 'organizace', 'notifications', 'podnik'].map(z => `settings&tab=${z}`);
const ZALOZKY_768 = ['billing', 'audit', 'organizace'].map(z => `settings&tab=${z}`);

const sirky = process.argv[2] ? process.argv[2].split(',').map(Number) : [320, 390];
const pohledy = process.argv[3] ? process.argv[3].split(',') : [...POHLEDY.employer, ...ZALOZKY_NASTAVENI];

for (const w of sirky) {
  const { ctx, p } = await kontext({ viewport: viewport(w), role: 'employer', mobil: w < 600 });
  await projdi(ctx, p, pohledy.map(v => [url('employer', v), v]), `vedení cs ${w}`);
  await ctx.close();
}
// Bez vlastních argumentů ještě mezipásmo 768 px pro záložky Nastavení se seznamy.
if (!process.argv[2] && !process.argv[3]) {
  const { ctx, p } = await kontext({ viewport: viewport(768), role: 'employer' });
  await projdi(ctx, p, ZALOZKY_768.map(v => [url('employer', v), v]), 'vedení cs 768');
  await ctx.close();
}
await konec();
