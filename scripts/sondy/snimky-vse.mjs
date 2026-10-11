// Pomůcka pro UX audit (není sonda, nic netvrdí): nafotí první dvě obrazovky každé stránky aplikace pro vedoucího,
// zaměstnance a tablet (kiosk) do shots/vse-<role>-<pohled>-<šířka>.png. Čte se očima, ne strojem.
//   SONDY_ZAKLAD=http://localhost:3400 node scripts/sondy/snimky-vse.mjs [role] [šířka] [pohled,pohled]
//   např. node scripts/sondy/snimky-vse.mjs employee 390
import { kontext, BASE, OUT } from './k68-spolecne.mjs';

const POHLEDY = {
  employer: ['overview', 'shifts', 'inventory', 'recipes', 'procedures', 'tasks', 'guides', 'planning', 'reports', 'finance',
    'suggestions', 'attendance', 'my-shifts', 'rewards', 'settings', 'team-settings', 'menu', 'announcements'],
  employee: ['home', 'my-shifts', 'procedures', 'availability', 'inventory', 'closing', 'tasks', 'rewards', 'guides', 'suggestions', 'settings'],
  kiosk: [''],
};
const url = (role, pohled) => role === 'employer' ? `${BASE}/employer/overview?view=${pohled}` : role === 'employee' ? `${BASE}/employee/shifts?view=${pohled}` : `${BASE}/kiosk`;
const roleArg = process.argv[2], sirka = Number(process.argv[3] ?? 390), vybrane = process.argv[4]?.split(',');
const ROLE = roleArg ? [roleArg] : ['employer', 'employee', 'kiosk'];

for (const role of ROLE) {
  const vp = role === 'kiosk' ? { width: 1024, height: 768 } : { width: sirka, height: sirka < 600 ? 844 : 900 };
  const { ctx, p } = await kontext({ viewport: vp, role, mobil: vp.width < 600 });
  for (const pohled of POHLEDY[role].filter(x => !vybrane || vybrane.includes(x))) {
    try {
      await p.goto(url(role, pohled), { waitUntil: 'networkidle', timeout: 45000 });
      await p.waitForTimeout(900);
      const vyska = await p.evaluate(() => document.documentElement.scrollHeight);
      await p.screenshot({ path: OUT + `vse-${role}-${pohled || 'kiosk'}-${vp.width}.png`, fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: Math.min(vyska, vp.height * 2.2) } });
    } catch (e) { console.log('✗', role, pohled, String(e).slice(0, 100)); }
  }
  await ctx.close();
}
process.exit(0);
