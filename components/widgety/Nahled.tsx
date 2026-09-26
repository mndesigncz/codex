'use client';

// Živý náhled widgetu (kolo 68, spec §3.7): galerie a nastavení widgetu.
//
// Widget se kreslí v přirozené šířce své velikosti (S 240, M 496, L 1008 px)
// a zmenší se `transform: scale(k)`, kde k = šířka obalu / přirozená šířka.
// Kdyby se mu jen zúžil obal, rozložil by se jinak než na ploše (StatRow by
// se zalomil, seznam by ukázal jiný počet řádků) a náhled by lhal.
//
// Obal je `inert` a `aria-hidden`: tlačítka se kreslí, ale nereagují,
// odečítač náhled přeskočí a widget dostane `nahled={true}`, takže nic
// nezapisuje ani nenaviguje. Data jsou skutečná, divákova (sdílená
// mezipaměť useDataWidgetu) — ukázková data by v galerii slibovala něco,
// co na ploše neuvidí. Widget s tarifem a výchozí rozložení se kreslí
// schematicky, bez dotazu.

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Navigace, Velikost } from '@/lib/widgety/typy';
import { widget as najdiWidget } from '@/lib/widgety/katalog';
import { sNastavenimVychozimi } from '@/lib/widgety/rozlozeni';
import { idZWidgetu } from '@/lib/widgety/hash';
import { PRIROZENA_SIRKA } from '@/lib/widgety/konstanty';
import { lineWidget } from './registr';
import { KontextWidgetuCtx, KostraWidgetu, PojistkaWidgetu, SchematickyWidget, type KontextWidgetu } from './Widget';
import { NavigaceKontext, useNavigace } from './NavigaceKontext';

// V prohlížeči se měří před vykreslením (bez poskočení), na serveru nic.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const bezAkce = () => {};

export function Nahled({ widget: id, velikost, nastaveni, schematicky = false, line = false, className = '' }: {
  widget: string;
  velikost: Velikost;
  /** Uložené (nebo rozepsané) nastavení — doplní se výchozími jako na ploše. */
  nastaveni?: Record<string, unknown>;
  /** Bez dat: jen ikona, název, popis a pruhy (tarif, výchozí rozložení). */
  schematicky?: boolean;
  /** Kreslit, až se obal přiblíží k oknu (galerie má desítky náhledů). */
  line?: boolean;
  className?: string;
}) {
  const def = najdiWidget(id);
  const obal = useRef<HTMLDivElement>(null);
  const vnitrek = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const [vyska, setVyska] = useState<number | null>(null);
  const [videt, setVidet] = useState(!line);
  const [pokus, setPokus] = useState(0);
  const sirka = PRIROZENA_SIRKA[velikost];

  // Líné náhledy: kreslit (a ptát se na data), až je položka galerie blízko okna.
  useEffect(() => {
    if (videt || !obal.current || typeof IntersectionObserver === 'undefined') { setVidet(true); return; }
    const io = new IntersectionObserver(z => { if (z.some(x => x.isIntersecting)) { setVidet(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(obal.current);
    return () => io.disconnect();
  }, [videt]);

  useIsoLayoutEffect(() => {
    const o = obal.current;
    const v = vnitrek.current;
    if (!o || !v) return;
    const zmer = () => {
      const kk = Math.min(1, o.clientWidth / sirka) || 1;
      setK(kk);
      setVyska(v.offsetHeight * kk);
    };
    zmer();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(zmer);
    ro.observe(o);
    ro.observe(v);
    return () => ro.disconnect();
  }, [sirka, videt]);

  const Komponenta = useMemo(() => lineWidget(id, pokus), [id, pokus]);
  const kontext = useMemo<KontextWidgetu>(() => ({
    instance: `nahled-${idZWidgetu(id)}-${velikost.toLowerCase()}`,
    velikost, definice: def, nahled: true, upravy: false, inkoust: false, nahlasSkryti: bezAkce,
  }), [id, velikost, def]);
  const nav = useNavigace();
  // Odkazy se v náhledu kreslí (vidíš, kam widget vede), ale nikam nevedou.
  const navNahledu = useMemo<Navigace>(() => ({ ...nav, onNavigate: bezAkce }), [nav]);
  const plne = useMemo(() => sNastavenimVychozimi(def?.nastaveni, nastaveni), [def, nastaveni]);

  return (
    <div ref={obal} aria-hidden inert className={`pointer-events-none overflow-hidden ${className}`} style={{ height: vyska ?? undefined }}>
      <div ref={vnitrek} style={{
        width: sirka, transform: k !== 1 ? `scale(${k})` : undefined, transformOrigin: 'top left',
        // Malý widget v širokém obalu se nezvětšuje — stojí uprostřed.
        marginInline: k === 1 ? 'auto' : undefined,
      }}>
        {!videt ? (
          // Statický zástupce bez shimmeru: desítky běžících pruhů v galerii by jen blikaly.
          <div className="h-32 rounded-3xl bg-black/[0.05]" />
        ) : (
          <NavigaceKontext.Provider value={navNahledu}>
            <KontextWidgetuCtx.Provider value={kontext}>
              {schematicky || !def ? <SchematickyWidget /> : (
                <PojistkaWidgetu resetKey={`${id}-${velikost}-${pokus}`} onZnovu={() => setPokus(p => p + 1)}>
                  <Suspense fallback={<KostraWidgetu />}>
                    <Komponenta instance={kontext.instance} velikost={velikost} nastaveni={plne} nahled />
                  </Suspense>
                </PojistkaWidgetu>
              )}
            </KontextWidgetuCtx.Provider>
          </NavigaceKontext.Provider>
        )}
      </div>
    </div>
  );
}

export default Nahled;
