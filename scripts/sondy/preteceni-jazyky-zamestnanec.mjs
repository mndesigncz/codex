// Přetečení — zaměstnanec německy a polsky na nejužším telefonu (320 px): všech
// 11 pohledů. Vedoucí je v preteceni-jazyky.mjs, čeština v preteceni-zamestnanec.mjs.
// Rozložení domů = fixtura k68-rozlozeni-domu. Co se měří a proč: preteceni-jadro.mjs.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/preteceni-jazyky-zamestnanec.mjs [de,pl] [pohled,pohled]
import { kontext, konec, POHLEDY, url, viewport, nastavJazyk, projdi, FIX_DOMU } from './preteceni-jadro.mjs';

const jazyky = process.argv[2] ? process.argv[2].split(',') : ['de', 'pl'];
const pohledy = process.argv[3] ? process.argv[3].split(',') : POHLEDY.employee;
const W = 320;

for (const jazyk of jazyky) {
  const { ctx, p } = await kontext({ viewport: viewport(W), role: 'employee', mobil: true, fix: FIX_DOMU });
  await nastavJazyk(ctx, jazyk);
  await projdi(ctx, p, pohledy.map(v => [url('employee', v), v]), `zaměstnanec ${jazyk} ${W}`);
  await ctx.close();
}
await konec();
