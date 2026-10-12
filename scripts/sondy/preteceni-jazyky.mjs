// Přetečení — vedoucí německy a polsky na nejužším telefonu (320 px): všech 19 pohledů.
// Dlouhá slova („Zeiterfassungseinträge", „Kassenabschluss") jsou nejčastější příčina,
// proč se text nevejde do karty; čeština je v preteceni-vedeni*.mjs, zaměstnanec
// v preteceni-jazyky-zamestnanec.mjs. Jazyk nastavuje cookie `managero-lang` jako
// přepínač v Nastavení (viz k76-jazyk). Co se měří a proč: preteceni-jadro.mjs.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/preteceni-jazyky.mjs [de,pl] [pohled,pohled]
import { kontext, konec, POHLEDY, url, viewport, nastavJazyk, projdi } from './preteceni-jadro.mjs';

const jazyky = process.argv[2] ? process.argv[2].split(',') : ['de', 'pl'];
const pohledy = process.argv[3] ? process.argv[3].split(',') : POHLEDY.employer;
const W = 320;

for (const jazyk of jazyky) {
  const { ctx, p } = await kontext({ viewport: viewport(W), role: 'employer', mobil: true });
  await nastavJazyk(ctx, jazyk);
  await projdi(ctx, p, pohledy.map(v => [url('employer', v), v]), `vedení ${jazyk} ${W}`);
  await ctx.close();
}
await konec();
