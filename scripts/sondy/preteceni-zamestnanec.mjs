// Přetečení — zaměstnanec: všech 11 pohledů (home … settings) na 320/390/768/1024 px
// česky; na 320 px navíc německy a polsky. Co se měří a proč: preteceni-jadro.mjs.
// Rozložení domů = fixtura k68-rozlozeni-domu (stejná jako sondy k68-telefon).
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/preteceni-zamestnanec.mjs [šířka,šířka] [pohled,pohled]
import { kontext, konec, SIRKY, POHLEDY, url, viewport, nastavJazyk, otevriStranku, prover, FIX_DOMU } from './preteceni-jadro.mjs';

const sirky = process.argv[2] ? process.argv[2].split(',').map(Number) : SIRKY;
const pohledy = process.argv[3] ? process.argv[3].split(',') : POHLEDY.employee;
const kola = [...sirky.map(w => [w, 'cs']), ...(sirky.includes(320) ? [[320, 'de'], [320, 'pl']] : [])];

for (const [w, jazyk] of kola) {
  const { ctx, p } = await kontext({ viewport: viewport(w), role: 'employee', mobil: w < 600, fix: FIX_DOMU });
  await nastavJazyk(ctx, jazyk);
  for (const pohled of pohledy) {
    await otevriStranku(p, url('employee', pohled));
    await prover(p, `zaměstnanec ${jazyk} ${w} ${pohled}`);
  }
  await ctx.close();
}
await konec();
