'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { IdScenyDema } from '@/lib/demo/sceny';

// Živá ukázka aplikace uvnitř průvodce: skutečná aplikace (veřejná ukázka
// /demo, lib/demo) v rámu telefonu. Nejsou to obrázky ani maketa — widgety,
// seznamy a generátor rozvrhu jsou ty, které pak člověk dostane, jen nad
// vymyšlenými daty kavárny „U Lípy (ukázka)". Ukázka neposílá na server nic
// (mock server v prohlížeči) a je vždy ve světlém motivu.
//
// Jedna instance žije celou dobu průvodce a mění jen scénu zprávou
// `demo-scena` (stejná role = žádné nové načtení), takže přepínání mezi
// Rozvrhem, Skladem a Uzávěrkou je okamžité a nestahuje se znovu.
//
// Zprávy: ukázka pošle `demo-pripraveno`, až se usadí; `demo-scena` se smí
// poslat až potom (dřív poslaná by se ztratila) — viz lib/demo/README.md.
//
// Velikost: aplikace se kreslí v logickém okně telefonu (390 × 760) a zmenší
// se transform: scale, takže se rozloží stejně jako na telefonu a jen se
// zmenší celek.

const SIRKA = 390;
const VYSKA = 760;
const OKRAJ = 8;
const STROP_ZAVESU_MS = 9000;

export default function DemoOkno({ scena, maxVyska, className = '' }: {
  scena: IdScenyDema;
  /** Nejvyšší výška rámu v px (na počítači podle okna). */
  maxVyska?: number;
  className?: string;
}) {
  const obal = useRef<HTMLDivElement>(null);
  const ramec = useRef<HTMLIFrameElement>(null);
  const prvniScena = useRef(scena);
  const pripraveno = useRef(false);
  const [zaves, setZaves] = useState(true);
  const [k, setK] = useState(1);

  // Zmenšení podle dostupné šířky (a výšky, je-li omezená).
  useLayoutEffect(() => {
    const o = obal.current;
    if (!o) return;
    const zmer = () => {
      const podleSirky = (o.clientWidth - 2 * OKRAJ) / SIRKA;
      const podleVysky = maxVyska ? (maxVyska - 2 * OKRAJ) / VYSKA : 1;
      setK(Math.max(0.3, Math.min(1, podleSirky, podleVysky)));
    };
    zmer();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(zmer);
    ro.observe(o);
    return () => ro.disconnect();
  }, [maxVyska]);

  // Ukázka se hlásí, že je usazená; do té doby ji kryje závěs.
  useEffect(() => {
    const naZpravu = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== ramec.current?.contentWindow) return;
      if ((e.data as { typ?: string } | null)?.typ === 'demo-pripraveno') {
        pripraveno.current = true;
        setZaves(false);
      }
    };
    window.addEventListener('message', naZpravu);
    // Zpráva mohla přijít dřív než posluchač: poprosit o zopakování.
    const ping = setInterval(() => {
      if (!pripraveno.current) ramec.current?.contentWindow?.postMessage({ typ: 'demo-ping' }, window.location.origin);
    }, 700);
    // Pojistka: ukázka, která se neozve, nesmí držet závěs věčně.
    const strop = setTimeout(() => setZaves(false), STROP_ZAVESU_MS);
    return () => { window.removeEventListener('message', naZpravu); clearInterval(ping); clearTimeout(strop); };
  }, []);

  // Změna scény po usazení: zpráva místo nového načtení.
  useEffect(() => {
    if (scena === prvniScena.current && !pripraveno.current) return;
    const posli = () => ramec.current?.contentWindow?.postMessage({ typ: 'demo-scena', scena, role: 'vedeni' }, window.location.origin);
    if (pripraveno.current) { posli(); return; }
    // Ještě se neusadila: počkat na usazení a poslat tu poslední.
    const t = setInterval(() => { if (pripraveno.current) { clearInterval(t); posli(); } }, 150);
    return () => clearInterval(t);
  }, [scena]);

  return (
    <div ref={obal} className={`w-full ${className}`}>
      <div className="pv-zarizeni" style={{ width: SIRKA * k + 2 * OKRAJ }} data-demo-okno data-scena={scena}>
        <div className="pv-zarizeni-platno" style={{ width: SIRKA * k, height: VYSKA * k }}>
          <iframe
            ref={ramec}
            title="Ukázka aplikace s vymyšlenými daty"
            src={`/demo?scena=${prvniScena.current}&role=vedeni&rezim=okno`}
            width={SIRKA}
            height={VYSKA}
            style={{ transform: `scale(${k})` }}
          />
          {zaves && <div className="pv-zarizeni-zaves" role="status"><span>Načítám ukázku…</span></div>}
        </div>
      </div>
    </div>
  );
}
