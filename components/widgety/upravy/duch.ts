'use client';

// Duch odebraného widgetu (kolo 68, spec §4.6).
//
// Model odebere položku hned — Reactu tím zmizí i její <li> a sousedé by se
// srovnali skokem přes díru, která tam ještě před snímkem byla. Proto na
// místě karty zůstane na 160 ms její klon (position: fixed, bez ukazatele),
// který zprůhlední a lehce se zmenší, zatímco sousedé dojedou pružinou.
// Klon je mimo React i mimo mřížku, takže nic nerozbije a sám se uklidí.
//
// Omezený pohyb: jen průhlednost, nejvýš 120 ms (spec §4.11).

import { DUCH_MS } from '@/lib/widgety/konstanty';

export function pustDucha(li: HTMLElement, omezeny: boolean): void {
  if (typeof document === 'undefined') return;
  const r = li.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return;
  const klon = li.cloneNode(true) as HTMLElement;
  // Klon nesmí nic duplikovat pro odečítač ani pro fokus.
  klon.removeAttribute('id');
  klon.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  klon.removeAttribute('tabindex');
  klon.removeAttribute('aria-label');
  klon.removeAttribute('data-instance');
  klon.removeAttribute('data-widget');
  klon.setAttribute('aria-hidden', 'true');
  klon.inert = true;
  // Mimo `.plocha[data-upravy]` by klon ztratil zmenšení na .98 z režimu
  // úprav a v posledním snímku by o 2 % poskočil — převezme ho tedy natvrdo.
  const mer = li.querySelector<HTMLElement>('.w-mer');
  const merKlonu = klon.querySelector<HTMLElement>('.w-mer');
  if (mer && merKlonu) {
    merKlonu.style.transform = getComputedStyle(mer).transform;
    merKlonu.style.transition = 'none';
  }
  Object.assign(klon.style, {
    position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    margin: '0', pointerEvents: 'none', zIndex: '30', transform: 'none', transformOrigin: '50% 50%', order: '', gridColumn: 'auto',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(klon);

  const trvani = omezeny ? 120 : DUCH_MS;
  const snimky: Keyframe[] = omezeny
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.96)' }];
  let uklizeno = false;
  const uklid = () => { if (!uklizeno) { uklizeno = true; klon.remove(); } };
  try {
    const a = klon.animate(snimky, { duration: trvani, easing: 'cubic-bezier(.23, 1, .32, 1)', fill: 'forwards' });
    a.finished.then(uklid, uklid);
  } catch { /* bez WAAPI prostě zmizí */ }
  // Pojistka: skrytá karta prohlížeče animace pozastaví a klon by visel.
  setTimeout(uklid, trvani + 400);
}
