'use client';

// Živá 3D scéna v hlavičce prodejní stránky.
//
// Dřív tu byly vystřižené PNG položené přes video a „3D" dělalo jen naklánění
// v CSS. Objekt tím pádem nikam nepatřil — neměl stín do stránky, neměl
// společné světlo s okolím a při scrollu se choval jako nálepka. Tohle je
// skutečný model v prohlížeči: stejné světlo jako má stránka, měkký kontaktní
// stín na podklad a otáčení, které jde za kurzorem a za scrollem.
//
// Hrnek se nestahuje, staví se. Vygenerovaný model (Higgsfield image_to_3d)
// jsme zkusili a zahodili: vážil 306 kB i po kompresi, měl po těle vlnité
// artefakty z rekonstrukce a limetka v něm byla zapečená v textuře, takže
// neseděla s `--lime`. Rotační profil plus torus je pár desítek řádků, váží
// nula bajtů, je dokonale hladký a barvu bere z palety.
//
// Cena za to je three.js. Proto se načítá `import()` až ve chvíli, kdy je
// scéna doopravdy vidět — do prvního balíku prodejní stránky nespadne nic.
// Dokud (a jestli) se nenačte, je na místě obrázek: bez JavaScriptu, na
// slabém telefonu i při „omezit pohyb" se hlavička vykreslí normálně.

import { useEffect, useRef, useState } from 'react';

type Stav = 'obrazek' | 'nacitam' | 'zivy';

/** Umí tenhle prohlížeč vůbec WebGL? Bez zkoušky se to nepozná. */
function maWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Stojí to tomuhle zařízení za to? Na dvoujádru s „omezit pohyb" je
 * poctivější ukázat obrázek než rozjet scénu, která bude cukat.
 */
function stojiTo(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const jader = navigator.hardwareConcurrency;
  if (typeof jader === 'number' && jader > 0 && jader < 4) return false;
  // Datově úsporný režim je výslovná prosba: nestahuj, co nemusíš.
  const spojeni = (navigator as any).connection;
  if (spojeni?.saveData) return false;
  return maWebGL();
}

export function Scene3D({ poster, alt, className = '' }: {
  /** Obrázek, který je vidět, dokud (a jestli) scéna naběhne. */
  poster: string;
  alt: string;
  className?: string;
}) {
  const obal = useRef<HTMLDivElement>(null);
  const [stav, setStav] = useState<Stav>('obrazek');

  useEffect(() => {
    const host = obal.current;
    if (!host || !stojiTo()) return;

    let zivo = true;
    let uklid: (() => void) | null = null;

    // Scéna se rozjede, až je hlavička v dohledu. Kdo na stránku přijde
    // s kotvou #cenik, three.js stahovat nemusí.
    const pozorovatel = new IntersectionObserver((zaznamy) => {
      if (!zaznamy.some(z => z.isIntersecting)) return;
      pozorovatel.disconnect();
      setStav('nacitam');
      void (async () => {
        try {
          const THREE = await import('three');
          if (!zivo) return;
          uklid = postavit(THREE, host, () => setStav('zivy'));
        } catch {
          // Cokoliv selže — síť, ztracený WebGL kontext — zůstane obrázek.
          // Prázdné místo v hlavičce vypadá jako rozbitá stránka.
          if (zivo) setStav('obrazek');
        }
      })();
    }, { rootMargin: '200px' });

    pozorovatel.observe(host);
    return () => { zivo = false; pozorovatel.disconnect(); uklid?.(); };
  }, []);

  return (
    <div ref={obal} className={`relative ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={poster}
        alt={alt}
        width={1024}
        height={1024}
        className={`w-full h-auto select-none pointer-events-none transition-opacity duration-700 ${stav === 'zivy' ? 'opacity-0' : 'opacity-100'}`}
        draggable={false}
      />
      {/* Plátno leží přes obrázek a prolne se přes něj, až má co ukázat —
          žádné bliknutí prázdna mezi obrázkem a scénou. */}
      <div
        data-scena
        aria-hidden
        className={`absolute inset-0 transition-opacity duration-700 ${stav === 'zivy' ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}

/**
 * Hrnek s podšálkem z rotačních profilů.
 *
 * Proužek na okraji i hrana podšálku jsou vlastní geometrie, ne textura —
 * barva na hraně drží ostrost v jakémkoli přiblížení a bere se rovnou
 * z palety, takže limetka na prodejní stránce je tatáž limetka jako
 * v aplikaci.
 */
function hrnek(THREE: typeof import('three')) {
  const g = new THREE.Group();
  const krem = new THREE.MeshStandardMaterial({ color: 0xf1ede1, roughness: 0.82, metalness: 0 });
  const limet = new THREE.MeshStandardMaterial({ color: 0xc8f542, roughness: 0.62, metalness: 0 });
  const kava = new THREE.MeshStandardMaterial({ color: 0x6b3a1c, roughness: 0.38, metalness: 0 });

  // Profil jde zvenku nahoru, přes okraj a zevnitř dolů — stěna má tloušťku.
  // Nekonečně tenká slupka by ve stínu zmizela a hrnek by vypadal jako papír.
  const bod = (x: number, y: number) => new THREE.Vector2(x, y);
  const telo = new THREE.Mesh(new THREE.LatheGeometry([
    bod(0, 0), bod(0.46, 0.02), bod(0.62, 0.16), bod(0.70, 0.46), bod(0.72, 0.86),
    bod(0.72, 0.92), bod(0.64, 0.92),
    bod(0.64, 0.86), bod(0.62, 0.44), bod(0.54, 0.16), bod(0, 0.12),
  ], 96), krem);
  g.add(telo);

  const okraj = new THREE.Mesh(new THREE.CylinderGeometry(0.725, 0.725, 0.1, 96, 1, true), limet);
  okraj.position.y = 0.87;
  g.add(okraj);

  const hladina = new THREE.Mesh(new THREE.CircleGeometry(0.625, 64), kava);
  hladina.rotation.x = -Math.PI / 2;
  hladina.position.y = 0.80;
  g.add(hladina);

  // Plný torus zasazený do stěny. Vyříznutý oblouk by měl otevřené konce
  // a ze strany by se ucho četlo jako nalepený kus.
  const ucho = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.072, 24, 64), krem);
  ucho.position.set(0.80, 0.50, 0);
  g.add(ucho);

  const talir = new THREE.Mesh(new THREE.LatheGeometry([
    bod(0, 0), bod(0.92, 0), bod(1.02, 0.08), bod(1.02, 0.13), bod(0.92, 0.09), bod(0.28, 0.04), bod(0, 0.035),
  ], 96), krem);
  talir.position.y = -0.16;
  g.add(talir);

  const hrana = new THREE.Mesh(new THREE.TorusGeometry(1.012, 0.030, 16, 96), limet);
  hrana.rotation.x = Math.PI / 2;
  hrana.position.y = -0.045;
  g.add(hrana);

  g.traverse((n: any) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  return g;
}

/** Postaví scénu do `host` a vrátí úklid. Oddělené, ať `useEffect` zůstane čitelný. */
function postavit(
  THREE: typeof import('three'),
  host: HTMLDivElement,
  hotovo: () => void,
): () => void {
  const misto = host.querySelector('[data-scena]') as HTMLDivElement;
  const sirka = () => host.clientWidth || 1;
  const vyska = () => host.clientHeight || 1;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(sirka(), vyska());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  misto.appendChild(renderer.domElement);

  const scena = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(32, sirka() / vyska(), 0.1, 100);
  kamera.position.set(0, 1.35, 5.1);
  kamera.lookAt(0, 0.35, 0);

  // Světlo stránky, ne studiové. Krémový odraz zdola je to, co objekt
  // posadí do pozadí místo aby ho z něj vyřízlo.
  scena.add(new THREE.HemisphereLight(0xffffff, 0xe6e2d4, 1.15));
  const klic = new THREE.DirectionalLight(0xfffdf5, 2.1);
  klic.position.set(-2.6, 3.4, 2.4);
  klic.castShadow = true;
  klic.shadow.mapSize.set(1024, 1024);
  klic.shadow.camera.near = 0.5;
  klic.shadow.camera.far = 12;
  klic.shadow.camera.left = -3; klic.shadow.camera.right = 3;
  klic.shadow.camera.top = 3; klic.shadow.camera.bottom = -3;
  klic.shadow.bias = -0.0015;
  klic.shadow.radius = 4;
  scena.add(klic);
  // Limetkový dosvit zezadu — jediná barva navíc, a je to barva značky.
  const dosvit = new THREE.DirectionalLight(0xc8f542, 0.55);
  dosvit.position.set(2.8, 1.2, -2.2);
  scena.add(dosvit);

  // Podložka, která není vidět, ale chytá stín na podklad stránky. Bez ní
  // objekt levituje — a přesně to na předchozí verzi vypadalo nalepeně.
  const stin = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.ShadowMaterial({ opacity: 0.17 }),
  );
  stin.rotation.x = -Math.PI / 2;
  stin.position.y = -0.40;
  stin.receiveShadow = true;
  scena.add(stin);

  const objekt = hrnek(THREE);
  objekt.position.y -= 0.22;

  const drzak = new THREE.Group();
  drzak.add(objekt);
  scena.add(drzak);

  // --- pohyb -------------------------------------------------------------
  // Cíl a skutečnost zvlášť: skutečnost dojíždí k cíli, takže se dá cíl
  // kdykoliv přepsat (kurzor, scroll) a pohyb se nezasekne ani neskočí.
  const cil = { x: 0, y: 0 };
  const ted = { x: 0, y: 0 };
  let scrollCil = 0;
  let scrollTed = 0;

  const naKurzor = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    cil.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    cil.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  const naOdchod = () => { cil.x = 0; cil.y = 0; };
  const naScroll = () => {
    const r = host.getBoundingClientRect();
    scrollCil = (1 - (r.top + r.height / 2) / window.innerHeight) * 1.1;
  };
  window.addEventListener('pointermove', naKurzor, { passive: true });
  host.addEventListener('pointerleave', naOdchod);
  window.addEventListener('scroll', naScroll, { passive: true });
  naScroll();

  const naVelikost = () => {
    renderer.setSize(sirka(), vyska());
    kamera.aspect = sirka() / vyska();
    kamera.updateProjectionMatrix();
  };
  const merak = new ResizeObserver(naVelikost);
  merak.observe(host);

  // Kreslí se jen když je scéna vidět. Roztočený kanvas mimo obrazovku
  // je jen vybitá baterie.
  let vidno = true;
  const dohled = new IntersectionObserver(z => { vidno = z.some(x => x.isIntersecting); });
  dohled.observe(host);

  let smycka = 0;
  let cas = performance.now();
  let prvni = true;
  const krok = (t: number) => {
    smycka = requestAnimationFrame(krok);
    const dt = Math.min((t - cas) / 1000, 0.05);
    cas = t;
    if (!vidno) return;

    // Tlumené dojíždění: rychlé u velkého rozdílu, klidné u malého.
    const k = 1 - Math.exp(-6 * dt);
    ted.x += (cil.x - ted.x) * k;
    ted.y += (cil.y - ted.y) * k;
    scrollTed += (scrollCil - scrollTed) * (1 - Math.exp(-3 * dt));

    drzak.rotation.y = ted.x * 0.42 + scrollTed * 0.8 + t * 0.00006;
    drzak.rotation.x = ted.y * 0.2 + scrollTed * 0.1;
    drzak.position.y = Math.sin(t * 0.0009) * 0.035 - scrollTed * 0.12;

    renderer.render(scena, kamera);
    if (prvni) { prvni = false; hotovo(); }
  };
  smycka = requestAnimationFrame(krok);

  return () => {
    cancelAnimationFrame(smycka);
    window.removeEventListener('pointermove', naKurzor);
    host.removeEventListener('pointerleave', naOdchod);
    window.removeEventListener('scroll', naScroll);
    merak.disconnect();
    dohled.disconnect();
    scena.traverse((u: any) => {
      if (u.isMesh) {
        u.geometry?.dispose?.();
        const mm = Array.isArray(u.material) ? u.material : [u.material];
        for (const m of mm) { m?.map?.dispose?.(); m?.dispose?.(); }
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}

export default Scene3D;
