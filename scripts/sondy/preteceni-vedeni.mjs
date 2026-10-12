// Přetečení — vedoucí: všech 19 pohledů (overview … events) na 320/390/768/1024 px
// česky. Němčina a polština (nejdelší slova) jsou v preteceni-jazyky.mjs, ať sonda
// zůstane pod časovým limitem spouštěče.
// Co se měří a proč: preteceni-jadro.mjs. Fixtury: výchozí podvrh z k68-spolecne
// (jako snimky-vse), tedy stejná data, jaká vidí snímky pro UX audit.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/preteceni-vedeni.mjs [šířka,šířka] [pohled,pohled]
import { kontext, konec, SIRKY, POHLEDY, url, viewport, projdi } from './preteceni-jadro.mjs';

const sirky = process.argv[2] ? process.argv[2].split(',').map(Number) : SIRKY;
const pohledy = process.argv[3] ? process.argv[3].split(',') : POHLEDY.employer;

for (const w of sirky) {
  const { ctx, p } = await kontext({ viewport: viewport(w), role: 'employer', mobil: w < 600 });
  await projdi(ctx, p, pohledy.map(v => [url('employer', v), v]), `vedení cs ${w}`);
  await ctx.close();
}
await konec();
