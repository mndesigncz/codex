// Přetečení — vedoucí na tabletu a monitoru: všech 19 pohledů na 768 a 1024 px česky
// (postranní lišta ubírá obsahu šířku — na 768 px zbývá 448 px, míň než na telefonu
// 390). Telefon je v preteceni-vedeni.mjs. Co se měří a proč: preteceni-jadro.mjs.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/preteceni-vedeni-tablet.mjs [šířka,šířka] [pohled,pohled]
import { kontext, konec, POHLEDY, url, viewport, projdi } from './preteceni-jadro.mjs';

const sirky = process.argv[2] ? process.argv[2].split(',').map(Number) : [768, 1024];
const pohledy = process.argv[3] ? process.argv[3].split(',') : POHLEDY.employer;

for (const w of sirky) {
  const { ctx, p } = await kontext({ viewport: viewport(w), role: 'employer', mobil: w < 600 });
  await projdi(ctx, p, pohledy.map(v => [url('employer', v), v]), `vedení cs ${w}`);
  await ctx.close();
}
await konec();
