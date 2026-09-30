'use client';

// Kořen veřejné ukázky /demo: skutečná aplikace proti mock serveru v prohlížeči.
//
// Co se děje, v tomhle pořadí:
//  1. Na úrovni modulu (před prvním vykreslením) se nainstaluje interceptor
//     window.fetch a paměťové úložiště (lib/demo). Kořenový SessionProvider
//     si sáhne na /api/auth/session až v efektu po připojení, takže už dostane
//     odpověď z paměti, ne ze serveru.
//  2. Podle ?role= a ?scena= se namontuje skutečné rozhraní: EmployerLayout
//     (vedení), EmployeeLayout (zaměstnanec) nebo KioskApp (tablet). Stejné
//     vrstvy jako ve skutečných stránkách (CurrencyProvider, PlanProvider),
//     jen bez toho, co v ukázce nemá být: MigrationOnLoad (zápis do databáze),
//     PosTick (dotazy na pokladnu). Service worker a push vypíná kořenový
//     provider podle cesty (app/providers.tsx).
//  3. Scéna se překládá na ?view=, který layouty znají z hlubokých odkazů
//     z oznámení (lib/demo/sceny). Layout si ho přečte při připojení (a ta
//     nastává až po stažení rozhraní, proto se adresa nečistí): obnovení
//     stránky pak drží scénu.
//  4. Rodičovská stránka dostane `demo-pripraveno`, až se ukázka usadí, a
//     `demo-akce` při každé změně, kterou návštěvník udělá.

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CurrencyProvider } from '../CurrencyProvider';
import { PlanProvider } from '../Pro';
import { useTheme } from '../ThemeProvider';
import { instalujDemoApi, nastavHlasitele, nastavRoli, pocetBezicich, resetujDemo } from '@/lib/demo/mockApi';
import { zalozProstredi } from '@/lib/demo/prostredi';
import { posliRodici, rozeberZpravu } from '@/lib/demo/zpravy';
import { jeCestaDema } from '@/lib/demo/cesta';
import { nastaveniZAdresy, pohledScenyProRoli, type NastaveniDema, type RoleDema } from '@/lib/demo/sceny';
import { KDO_JSEM, clen } from '@/lib/demo/data/lide';

// Před prvním vykreslením: modul se vyhodnotí při načtení stránky, dřív než
// React hydratuje strom, a tím i dřív než efekty kořenového SessionProvideru.
if (typeof window !== 'undefined' && jeCestaDema(window.location.pathname)) {
  zalozProstredi();
  instalujDemoApi();
  nastavRoli(nastaveniZAdresy(window.location.search).role);
}

// Rozhraní se stahují až podle role: ukázka vedení nestahuje tablet ani zaměstnance.
const RozhraniVedeni = dynamic(() => import('../employer/EmployerLayout'), { ssr: false });
const RozhraniZamestnance = dynamic(() => import('../employee/EmployeeLayout'), { ssr: false });
const RozhraniTabletu = dynamic(() => import('../kiosk/KioskApp'), { ssr: false });

function uzivatel(role: RoleDema) {
  const c = clen(KDO_JSEM[role]);
  return { id: String(c.id), name: c.name, email: c.email, role: c.role, avatar: c.avatar ?? undefined, jobTitle: c.jobTitle ?? undefined, superadmin: false };
}

function Rozhrani({ role }: { role: RoleDema }) {
  const u = uzivatel(role);
  if (role === 'kiosk') return <RozhraniTabletu user={{ id: u.id, name: u.name, role: 'kiosk', avatar: u.avatar }} />;
  if (role === 'zamestnanec') return <RozhraniZamestnance user={u} />;
  return <RozhraniVedeni user={u} />;
}

// ?rezim=okno: bez bočního panelu a jeho přepínače. Dělá se stylem, ne změnou
// aplikace — panel je v EmployerLayout / EmployeeLayout jediný <aside>.
const STYL_OKNO = `
[data-demo-okno] aside { display: none !important; }
[data-demo-okno] button[aria-label$="boční pás"] { display: none !important; }
`;

/** Adresa s ?view= pro scénu; layout si ji přečte při připojení. */
function adresaSPohledem(n: NastaveniDema): string {
  const q = new URLSearchParams(window.location.search);
  q.set('scena', n.scena);
  q.set('role', n.role);
  const view = pohledScenyProRoli(n.scena, n.role);
  if (view) q.set('view', view); else q.delete('view');
  return `${window.location.pathname}?${q.toString()}`;
}

export default function DemoRoot() {
  const { setForcedLight } = useTheme();
  const [nastaveni, setNastaveni] = useState<NastaveniDema | null>(null);
  const [klic, setKlic] = useState(0);
  const nastaveniRef = useRef<NastaveniDema | null>(null);
  nastaveniRef.current = nastaveni;

  // Světlý motiv vynucený: ukázka nemá tmavý režim a nesmí převzít volbu z aplikace.
  useEffect(() => {
    setForcedLight(true);
    return () => setForcedLight(false);
  }, [setForcedLight]);

  // Události ukázky (odškrtnutý úkol, vygenerovaný rozvrh…) jdou rodiči.
  useEffect(() => {
    nastavHlasitele((akce, detail) => posliRodici({ typ: 'demo-akce', akce, ...(detail ? { detail } : {}) }));
    return () => nastavHlasitele(() => {});
  }, []);

  // První nastavení z adresy.
  useEffect(() => {
    const n = nastaveniZAdresy(window.location.search);
    nastavRoli(n.role);
    window.history.replaceState(null, '', adresaSPohledem(n));
    setNastaveni(n);
  }, []);

  // Rodič se dozví, že je ukázka připravená: až se mock 300 ms nic nevyřizuje
  // (aplikace načetla, co potřebuje) — nebo nejdéle po šesti vteřinách.
  useEffect(() => {
    if (!nastaveni) return;
    let klidne = 0;
    const start = Date.now();
    const t = setInterval(() => {
      klidne = pocetBezicich() === 0 ? klidne + 1 : 0;
      if (klidne >= 3 || Date.now() - start > 6000) {
        clearInterval(t);
        posliRodici({ typ: 'demo-pripraveno', scena: nastaveni.scena, role: nastaveni.role, okno: nastaveni.okno });
      }
    }, 100);
    return () => clearInterval(t);
  }, [nastaveni, klic]);

  const reset = useCallback(() => {
    // Nový stav a čisté načtení: mezipaměť dat widgetů žije v modulech a
    // jinak by první půlminuta po resetu ukazovala staré odpovědi.
    resetujDemo();
    window.location.reload();
  }, []);

  useEffect(() => {
    window.__demoReset = reset;
    const naZpravu = (e: MessageEvent) => {
      const z = rozeberZpravu(e);
      if (!z) return;
      if (z.typ === 'demo-reset') { reset(); return; }
      const dosavadni = nastaveniRef.current;
      const n: NastaveniDema = { scena: z.scena, role: z.role ?? dosavadni?.role ?? nastaveniZAdresy(window.location.search).role, okno: dosavadni?.okno ?? false };
      // Jiná role = jiná relace, oprávnění i rozložení: čisté načtení.
      // Stejná role: stačí znovu namontovat rozhraní na jiný pohled.
      if (dosavadni && n.role !== dosavadni.role) {
        window.location.assign(adresaSPohledem(n).replace(/[?&]view=[^&]*/, ''));
        return;
      }
      window.history.replaceState(null, '', adresaSPohledem(n));
      setNastaveni(n);
      setKlic(k => k + 1);
    };
    window.addEventListener('message', naZpravu);
    return () => window.removeEventListener('message', naZpravu);
  }, [reset]);

  if (!nastaveni) {
    return <div className="min-h-[100dvh]" aria-busy="true" />;
  }
  return (
    <div data-demo data-demo-okno={nastaveni.okno ? '' : undefined}>
      {nastaveni.okno && <style>{STYL_OKNO}</style>}
      <CurrencyProvider>
        <PlanProvider>
          <Rozhrani key={`${nastaveni.role}-${klic}`} role={nastaveni.role} />
        </PlanProvider>
      </CurrencyProvider>
    </div>
  );
}
