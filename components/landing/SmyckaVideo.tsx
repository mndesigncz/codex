'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { cestaNahravky, NAHRAVKY, rozmerNahravky, type IdNahravky } from './nahravky';

// Smyčka s nahrávkou ovládání aplikace v rámu zařízení.
//
// Video je bonus nad plakátem, ne podmínka: plakát (skutečný snímek téže
// obrazovky) je v HTML hned, takže bez skriptu, s vypnutým pohybem nebo na
// úsporném přenosu je sdělení stejné, jen nehybné. Video se začne stahovat až
// těsně před tím, než se dostane do obrazu (IntersectionObserver), a mimo obraz
// se zastaví. Soubory mají do 1,5 MB, takže nezdržují nic dalšího.
//
// Kdo nechce pohyb, dostane plakát a tlačítko „Přehrát"; kdo pohyb nechce
// v tu chvíli, dostane „Pozastavit" (pravidlo 2.2.2: co se hýbe déle než pět
// vteřin, musí jít zastavit).

function uspornyRezim(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (c?.saveData) return true;
    if (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)) return true;
  } catch { /* starý prohlížeč: bez omezení */ }
  return false;
}

export default function SmyckaVideo({ id, velky = false, priorita = false, povolit = true, className = '', onZkusit }: {
  id: IdNahravky;
  /** Velký rám (celá šířka sloupce) místo malého. */
  velky?: boolean;
  /** Plakát je první, co se na stránce vykreslí (LCP). */
  priorita?: boolean;
  /** Nepovoleno = nestahuje se a nehraje (neaktivní scéna ve sticky kompozici). */
  povolit?: boolean;
  className?: string;
  onZkusit?: () => void;
}) {
  const n = NAHRAVKY[id];
  const r = rozmerNahravky(id);
  const cesta = cestaNahravky(id);
  const ref = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [nacist, setNacist] = useState(false);   // zdroje se smí přiřadit
  const [bezi, setBezi] = useState(false);
  const [uspora, setUspora] = useState(false);
  const [ruc, setRuc] = useState<null | 'hraj' | 'stop'>(null); // člověk video sám spustil / zastavil
  const rucRef = useRef(ruc);
  rucRef.current = ruc;
  const povolitRef = useRef(povolit);
  povolitRef.current = povolit;
  const videnoRef = useRef(false);
  const uspRef = useRef(false);

  useEffect(() => {
    const u = uspornyRezim();
    uspRef.current = u;
    setUspora(u);
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([z]) => {
      const v = video.current;
      videnoRef.current = z.isIntersecting;
      if (z.isIntersecting && povolitRef.current) {
        if (!u) setNacist(true);
        if (v && !u && rucRef.current !== 'stop') v.play().catch(() => { /* prohlížeč přehrání odmítl: zůstane plakát */ });
      } else if (v) {
        v.pause();
      }
    }, { rootMargin: '160px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Scéna se stala aktivní (nebo přestala být): IntersectionObserver se kvůli tomu neozve.
  useEffect(() => {
    if (!videnoRef.current || uspRef.current) return;
    if (povolit) { setNacist(true); if (rucRef.current !== 'stop') video.current?.play().catch(() => {}); }
    else video.current?.pause();
  }, [povolit]);

  // Po přiřazení zdrojů video hned spustit (viditelnost už IO vyhodnotil).
  useEffect(() => {
    if (!nacist || ruc === 'stop' || !povolit) return;
    video.current?.play().catch(() => { /* viz výše */ });
  }, [nacist, ruc, povolit]);

  const prepni = () => {
    const v = video.current;
    if (!v) { setRuc('hraj'); setNacist(true); return; }
    if (v.paused) { setRuc('hraj'); v.play().catch(() => {}); } else { setRuc('stop'); v.pause(); }
  };

  return (
    <figure className={className}>
      <div className={`ld-ram ${velky ? '' : 'ld-ram-m'}`} data-zar={n.zarizeni}>
        <div ref={ref} className="ld-obrazovka" role="img" aria-label={n.popis}
          style={{ ['--ld-pomer' as string]: `${r.w} / ${r.h}` }}>
          <Image src={`${cesta}.webp`} alt="" fill sizes={velky ? '(max-width: 768px) 92vw, 50rem' : '(max-width: 768px) 72vw, 28rem'}
            priority={priorita} loading={priorita ? undefined : 'lazy'} draggable={false} />
          {nacist && (
            <video ref={video} muted loop playsInline preload="auto" aria-hidden tabIndex={-1}
              poster={`${cesta}.webp`} width={r.w} height={r.h}
              onPlaying={() => setBezi(true)} onPause={() => setBezi(false)}>
              <source src={`${cesta}.webm`} type="video/webm" />
              <source src={`${cesta}.mp4`} type="video/mp4" />
            </video>
          )}
        </div>
      </div>
      {/* Úsporný režim: poctivě řekni, proč se nic nehýbe. */}
      {uspora && ruc === null && <p className="mt-2 text-center text-xs text-black/55">Nahrávka se nepřehrává sama. Spustíš ji tlačítkem pod rámem.</p>}
      {/* Ovládání mimo obraz: tlačítko přes aplikaci by zakrývalo, co se právě ukazuje. */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={prepni} className="btn btn-ghost btn-sm inline-flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden fill="currentColor">
            {bezi ? <path d="M3 2h2.6v10H3zM8.4 2H11v10H8.4z" /> : <path d="M4 2.2v9.6L11.6 7z" />}
          </svg>
          {bezi ? 'Pozastavit' : 'Přehrát'}
        </button>
        {onZkusit && <button type="button" onClick={onZkusit} className="btn btn-secondary btn-sm">Zkus to sám v ukázce</button>}
      </div>
    </figure>
  );
}
