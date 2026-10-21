// Přetečení — host (přestavba Managero client 2026-10-21) přes ukázku /client/demo bez databáze:
// Karta, Podniky, Odměny (všechny části), Aktivita, Moje, stránka podniku (člen s razítky, člen
// s body, nečlen) na 320 / 390 / 768 / 1280, česky, německy a polsky. Co se měří: preteceni-jadro.mjs.
//   SONDY_ZAKLAD=http://localhost:3111 node scripts/sondy/preteceni-host.mjs [cs,de,pl] [320,390]
import { kontext, konec, BASE, viewport, nastavJazyk, projdi } from './preteceni-jadro.mjs';

const jazyky = process.argv[2] ? process.argv[2].split(',') : ['cs', 'de', 'pl'];
const sirky = process.argv[3] ? process.argv[3].split(',').map(Number) : [320, 390, 768, 1280];
const OBRAZOVKY = [
  ['/client/demo', 'Karta'], ['/client/demo/podniky', 'Podniky'], ['/client/demo/odmeny', 'Odměny'],
  ['/client/demo/odmeny?z=nabidky', 'Nabídky'], ['/client/demo/odmeny?z=vyzvy', 'Výzvy'], ['/client/demo/odmeny?z=historie', 'Historie'],
  ['/client/demo/aktivita', 'Aktivita'], ['/client/demo/profil', 'Moje'],
  ['/client/demo/p/kavarna-u-lipy', 'podnik s razítky'], ['/client/demo/p/bistro-orech', 'podnik s body'], ['/client/demo/p/bar-pod-vezi', 'nečlen'],
];

for (const jazyk of jazyky) for (const w of sirky) {
  // Jazyky mimo češtinu stačí na nejužším telefonu a monitoru (dlouhá slova, dvě šířky).
  if (jazyk !== 'cs' && w !== 320 && w !== 1280) continue;
  const { ctx, p } = await kontext({ viewport: viewport(w), mobil: w < 768, role: 'customer' });
  await nastavJazyk(ctx, jazyk);
  await projdi(ctx, p, OBRAZOVKY.map(([c, n]) => [BASE + c, n]), `host ${jazyk} ${w}`);
  await ctx.close();
}
await konec();
