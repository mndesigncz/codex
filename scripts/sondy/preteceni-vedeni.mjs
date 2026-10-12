// Přetečení — vedoucí: všech 19 pohledů (overview … events) na 320/390/768/1024 px
// česky; na 320 px navíc německy a polsky (nejdelší slova, nejužší telefon).
// Co se měří a proč: preteceni-jadro.mjs. Fixtury: výchozí podvrh z k68-spolecne
// (jako snimky-vse), tedy stejná data, jaká vidí snímky pro UX audit.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/preteceni-vedeni.mjs [šířka,šířka] [pohled,pohled]
import { kontext, konec, SIRKY, POHLEDY, url, viewport, nastavJazyk, otevriStranku, prover } from './preteceni-jadro.mjs';

const sirky = process.argv[2] ? process.argv[2].split(',').map(Number) : SIRKY;
const pohledy = process.argv[3] ? process.argv[3].split(',') : POHLEDY.employer;
const kola = [...sirky.map(w => [w, 'cs']), ...(sirky.includes(320) ? [[320, 'de'], [320, 'pl']] : [])];

for (const [w, jazyk] of kola) {
  const { ctx, p } = await kontext({ viewport: viewport(w), role: 'employer', mobil: w < 600 });
  await nastavJazyk(ctx, jazyk);
  for (const pohled of pohledy) {
    await otevriStranku(p, url('employer', pohled));
    await prover(p, `vedení ${jazyk} ${w} ${pohled}`);
  }
  await ctx.close();
}
await konec();
