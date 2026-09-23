// Venkovní menu (/menu-akce.html): 302 kB ručně psaného HTML v public/,
// živá funkce s vlastním QR i service workerem — a žádná kontrola ani sonda
// se jí dosud nedotkla. Měříme ji stejnými měřítky jako zbytek aplikace.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const problems = []; const ok = m => console.log('  ✓', m); const bad = m => { console.log('  ✗', m); problems.push(m); };

const MERENI = `(() => {
  const parse = c => { const m=/rgba?\\(([^)]+)\\)/.exec(c); if(!m) return null;
    const q=m[1].split(',').map(Number); return {r:q[0],g:q[1],b:q[2],a:q.length>3?q[3]:1}; };
  const over=(f,b2)=>({r:f.r*f.a+b2.r*(1-f.a),g:f.g*f.a+b2.g*(1-f.a),b:f.b*f.a+b2.b*(1-f.a),a:1});
  const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
    return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);};
  const ratio=(a,b2)=>{const l1=lum(a),l2=lum(b2),hi=Math.max(l1,l2),lo=Math.min(l1,l2);return (hi+0.05)/(lo+0.05);};
  const bgOf = el => { let acc=null;
    for(let n=el;n;n=n.parentElement){ const c=parse(getComputedStyle(n).backgroundColor);
      if(!c||c.a<0.3) continue; acc=acc?over(acc,c):c; if(acc.a>=0.9) return {...acc,a:1}; }
    return acc?{...acc,a:1}:{r:255,g:255,b:255,a:1}; };
  const vis = el => { const r=el.getBoundingClientRect(); const cs=getComputedStyle(el);
    return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'&&cs.opacity!=='0'; };

  const malyCil=[], drobne=[], slabe=[], bezJmena=[];
  for (const el of document.querySelectorAll('button, a[href], [role="button"], input, select')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    let w=r.width,h=r.height;
    for (const ps of ['::before','::after']) { const cs=getComputedStyle(el,ps);
      if (cs.content==='none') continue;
      const pw=parseFloat(cs.width),ph=parseFloat(cs.height);
      if(pw>w)w=pw; if(ph>h)h=ph; }
    const lbl=(el.getAttribute('aria-label')||el.innerText||el.title||'').trim();
    if (w<44||h<44) malyCil.push((lbl||el.className).slice(0,30)+' '+Math.round(w)+'×'+Math.round(h));
    if (!lbl) bezJmena.push((el.className||el.tagName).toString().slice(0,40));
  }
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length) continue;
    const t=(el.textContent||'').trim(); if(t.length<2||!vis(el)) continue;
    const cs=getComputedStyle(el); const px=parseFloat(cs.fontSize);
    if (px<14) drobne.push(t.slice(0,26)+' '+Math.round(px)+'px');
    const fg=parse(cs.color); if(!fg) continue;
    const bg=bgOf(el); const eff=fg.a<1?over(fg,bg):fg;
    const bold=parseInt(cs.fontWeight,10)>=700;
    const prah=(px>=24||(bold&&px>=18.66))?3:4.5;
    const cr=ratio(eff,bg);
    if (cr<prah) slabe.push(t.slice(0,26)+' '+(Math.round(cr*100)/100)+':1');
  }
  return { malyCil, drobne, slabe, bezJmena, h1: document.querySelectorAll('h1').length,
    lang: document.documentElement.lang };
})()`;

for (const [jmeno, w, h] of [['iPad na šířku', 1024, 768], ['telefon', 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'cs-CZ' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto('http://localhost:3000/menu-akce.html', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(MERENI);
  console.log(`Venkovní menu · ${jmeno}:`);
  r.lang === 'cs' ? ok('stránka má jazyk cs') : bad('bez jazyka: ' + r.lang);
  r.h1 >= 1 ? ok(`nadpis h1 je (${r.h1}×)`) : bad('bez nadpisu h1');
  r.bezJmena.length === 0 ? ok('všechny ovládací prvky mají jméno')
    : bad(`${r.bezJmena.length} bez jména: ` + r.bezJmena.slice(0, 4).join(' | '));
  r.malyCil.length === 0 ? ok('dotykové cíle mají 44 px')
    : bad(`${r.malyCil.length} cílů pod 44 px: ` + r.malyCil.slice(0, 4).join(' | '));
  r.drobne.length === 0 ? ok('žádné písmo pod 14 px')
    : bad(`${r.drobne.length} textů pod 14 px: ` + r.drobne.slice(0, 4).join(' | '));
  r.slabe.length === 0 ? ok('kontrast všude nad normou')
    : bad(`${r.slabe.length} pod prahem: ` + r.slabe.slice(0, 4).join(' | '));
  if (errs.length) bad('chyba stránky: ' + errs[0]);
  await p.screenshot({ path: new URL('./shots/menu-' + w + '.png', import.meta.url).pathname, fullPage: false });
  await ctx.close();
}
console.log(problems.length ? `\nPROBLÉMŮ: ${problems.length}` : '\nVšechno prošlo.');
await b.close();
