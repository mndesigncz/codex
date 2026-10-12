// Přetečení — zaměstnanec: všech 11 pohledů (home … settings) na 320/390/768/1024 px
// česky; němčina a polština jsou v preteceni-jazyky.mjs. Co se měří a proč:
// preteceni-jadro.mjs. Rozložení domů = fixtura k68-rozlozeni-domu (jako k68-telefon).
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/preteceni-zamestnanec.mjs [šířka,šířka] [pohled,pohled]
import { kontext, konec, SIRKY, POHLEDY, url, viewport, projdi, FIX_DOMU } from './preteceni-jadro.mjs';

const sirky = process.argv[2] ? process.argv[2].split(',').map(Number) : SIRKY;
const pohledy = process.argv[3] ? process.argv[3].split(',') : POHLEDY.employee;

for (const w of sirky) {
  const { ctx, p } = await kontext({ viewport: viewport(w), role: 'employee', mobil: w < 600, fix: FIX_DOMU });
  await projdi(ctx, p, pohledy.map(v => [url('employee', v), v]), `zaměstnanec cs ${w}`);
  await ctx.close();
}
await konec();
