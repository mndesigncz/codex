// Přetečení — němčina a polština na nejužším telefonu (320 px): všechny pohledy
// vedoucího i zaměstnance. Dlouhá slova („Zeiterfassungseinträge", „Kassenabschluss")
// jsou nejčastější příčina, proč se text nevejde do karty; čeština na všech šířkách
// je v preteceni-vedeni.mjs a preteceni-zamestnanec.mjs. Jazyk nastavuje cookie
// `managero-lang` jako přepínač v Nastavení (viz k76-jazyk). Co se měří a proč:
// preteceni-jadro.mjs.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/preteceni-jazyky.mjs [de,pl] [employer,employee]
import { kontext, konec, POHLEDY, url, viewport, nastavJazyk, projdi, FIX_DOMU } from './preteceni-jadro.mjs';

const jazyky = process.argv[2] ? process.argv[2].split(',') : ['de', 'pl'];
const role = process.argv[3] ? process.argv[3].split(',') : ['employer', 'employee'];
const W = 320;

for (const jazyk of jazyky) for (const r of role) {
  const { ctx, p } = await kontext({ viewport: viewport(W), role: r, mobil: true, fix: r === 'employee' ? FIX_DOMU : undefined });
  await nastavJazyk(ctx, jazyk);
  await projdi(ctx, p, POHLEDY[r].map(v => [url(r, v), v]), `${r === 'employer' ? 'vedení' : 'zaměstnanec'} ${jazyk} ${W}`);
  await ctx.close();
}
await konec();
