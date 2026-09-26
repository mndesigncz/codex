'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { Icon, LogoMark } from '../Icons';
import PosTick from '../PosTick';
import StaffInbox, { useStaffInbox } from '../client/StaffInbox';
import { Modal, Button, Badge } from '../ui';
import KioskInventory from './KioskInventory';
import KioskTasks from './KioskTasks';
import Procedures from '../procedures/Procedures';
import Guides from '../Guides';
import { prevezmiOtevreniNavodu } from '@/lib/otevriNavod';
import CashClosing from '../employee/CashClosing';
import MessengerDock from '../chat/MessengerDock';
import { usePlan, ProBadge } from '../Pro';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { NavigaceKontext, useHodnotaNavigace } from '../widgety/NavigaceKontext';
import type { PohledNavigace } from '@/lib/widgety/typy';
import {
  KioskShiftProvider, KioskShiftGate, WhoIsWorking, ActivePersonChip,
  useKioskShift, useNow,
} from './KioskShiftGate';

const TABS = [
  { id: 'shift',      label: 'Směna',    icon: 'clock' },
  { id: 'tasks',      label: 'Úkoly',    icon: 'check' },
  { id: 'procedures', label: 'Postupy',  icon: 'clipboard' },
  { id: 'inventory',  label: 'Sklad',    icon: 'box' },
  { id: 'orders',     label: 'Objednávky', icon: 'cup' },
  { id: 'closing',    label: 'Uzávěrka', icon: 'trend' },
  { id: 'guides',     label: 'Návody',   icon: 'book' },
] as const;

type IdZalozky = (typeof TABS)[number]['id'];

// Pohled z widgetu → záložka tabletu (kolo 69, B9). Widgety znají pohledy
// z aplikace vedení a zaměstnance ('inventory', 'klient:orders'…); tablet
// má vlastní záložky, tak je tady jednou přeložíme. Co tu není (Rozvrh,
// Finance, chat…), na tabletu nemá kam vést — smiPohled pak vrátí ne
// a widget odkaz vůbec nenakreslí (spec §2.6, pravidlo 4).
const POHLED_NA_ZALOZKU: Record<string, IdZalozky> = {
  tasks: 'tasks',
  procedures: 'procedures',
  inventory: 'inventory',
  'klient:orders': 'orders',
  closing: 'closing',
  guides: 'guides',
};

// Seznam pohledů pro widget Odkaz (výběr cíle): jen záložky, kam z plochy
// vede cesta, pod id, kterému widgety rozumí.
const POHLEDY_TABLETU: PohledNavigace[] = Object.entries(POHLED_NA_ZALOZKU).map(([pohled, zalozka]) => {
  const t = TABS.find(x => x.id === zalozka)!;
  return { id: pohled, label: t.label, icon: t.icon };
});

interface KioskUser { id?: string | number; name: string; role: string; avatar?: string }

export default function KioskApp({ user }: { user: KioskUser }) {
  // The shared tablet is a Pro feature. The gate explains instead of erroring.
  const { pro, loaded } = usePlan();
  if (loaded && !pro) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6">
        <div className="glass-card p-10 max-w-md text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#C8F542]/15 text-[#5B7A08]"><Icon name="lock" size={28} /></div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#16181A]">Kiosk režim</h1>
            <ProBadge />
          </div>
          <p className="text-sm text-black/55">Sdílený tablet na prodejně — docházka, úkoly, sklad a uzávěrky pro celý tým — patří do plánu Pro. Zapíná se v Nastavení → Předplatné v účtu vedení.</p>
        </div>
      </div>
    );
  }

  return (
    <KioskShiftProvider>
      <PosTick />
      <KioskShell user={user} />
    </KioskShiftProvider>
  );
}

function KioskShell({ user }: { user: KioskUser }) {
  const { active } = useKioskShift();
  const [tab, setTab] = useState<IdZalozky>('shift');
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Počet nových objednávek od stolu do záložky — tablet na baru je první, kdo je má vidět.
  const inbox = useStaffInbox(true);
  const newOrders = Number(inbox.d?.newCount ?? 0);
  // Úkol „Vyrobit limonádu“ s návodem musí na tabletu otevřít ten návod,
  // ne jen přepnout na záložku Návody — u baru se nehledá v seznamu.
  const [wantGuide, setWantGuide] = useState<number | null>(null);
  // Na tabletu nejsou URL, takže odkaz `?view=guides&guide=N` tu nefunguje.
  // Plovoucí běžec postupů visí nad všemi třemi rozhraními a sám neví, že
  // je na kiosku — proto si otevírání návodů přebereme a přepneme záložku.
  useEffect(() => prevezmiOtevreniNavodu(id => { setWantGuide(id); setTab('guides'); }), []);
  const now = useNow();

  // Navigace pro widgety plochy Směna. Proklik vede na záložku tabletu;
  // ta je za KioskShiftGate, takže práce se zapíše pod toho, kdo píchl,
  // stejně jako při ťuknutí na záložku nahoře.
  const navigujZWidgetu = useCallback((pohled: string, arg?: string) => {
    const zalozka = POHLED_NA_ZALOZKU[pohled];
    if (!zalozka) return;
    if (zalozka === 'guides') setWantGuide(arg && /^\d+$/.test(arg) ? Number(arg) : null);
    setTab(zalozka);
  }, []);
  const smiPohledTabletu = useCallback((pohled: string) => pohled in POHLED_NA_ZALOZKU, []);
  const navigaceWidgetu = useHodnotaNavigace(navigujZWidgetu, smiPohledTabletu, POHLEDY_TABLETU, []);
  // The real kiosk session user — used where the surface is shared/read-only.
  const kioskUser = { id: user.id ?? 0, name: user.name, role: 'kiosk', avatar: user.avatar ?? '📟' } as any;
  // Work surfaces run under the person currently selected on the tablet.
  const actingUser = active
    ? ({ id: active.id, name: active.name, role: 'employee', avatar: active.avatar } as any)
    : kioskUser;

  // Dokud se neozve prohlížeč, držíme místo zástupným znakem — jinak by se
  // serverový a klientský čas rozešly a React by překreslil celou obrazovku.
  // Hodiny na kiosku ukazují pražský čas i na tabletu nastaveném jinam.
  // Okna widgetů (NadPlochou v oblastech) a další portály míří do <body>,
  // tedy mimo .kiosk-surface — a přišla by o tabletových 14 px písma a 44 px
  // cílů. Třída na <body> po dobu tabletu platí i pro ně. Samotná
  // .kiosk-surface nemá vlastní vzhled, jen pravidla pro potomky, takže
  // dvojí výskyt (body i obal) nic nezdvojí.
  useEffect(() => {
    document.body.classList.add('kiosk-surface');
    return () => { document.body.classList.remove('kiosk-surface'); };
  }, []);

  const clock = now ? new Date(now).toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' }) : '—:—';
  const dateStr = now ? new Date(now).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }) : '\u00a0';

  return (
    <NavigaceKontext.Provider value={navigaceWidgetu}>
    <div className="kiosk-surface min-h-[100dvh] flex flex-col p-5 sm:p-8">
      {/* Záložky bez plochy nemají viditelný nadpis — identitu nese jméno
          a hodiny v hlavičce tabletu. Pro odečítač obrazovky ale obrazovka
          jméno mít musí. Směna má vlastní h1 v hlavičce plochy, tam by
          byl druhý (DP T6: právě jeden h1). */}
      {tab !== 'shift' && <h1 className="sr-only">Kiosk — {user.name}</h1>}
      {/* Header */}
      {/* Kiosk běží hlavně na tabletu, ale na úzkém displeji se jméno mačkalo
          mezi značku a velké hodiny na 28 px. Identita si vezme celý řádek
          a hodiny se zalomí pod ni. */}
      <header className="flex items-center justify-between gap-x-4 gap-y-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 basis-full sm:basis-0 sm:flex-1">
          <LogoMark size={44} />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-lg tracking-tight text-[#16181A] truncate">{user.name}</p>
            <p className="text-sm text-black/45 cz-sentence truncate">{dateStr}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <ActivePersonChip />
          <p className="text-3xl font-bold tracking-tight text-[#16181A] tabular-nums leading-none">{clock}</p>
          {/* Odhlášení tabletu je pro obsluhu slepá ulička: e-mail ani heslo
              zařízení nikdo z baru nezná, takže jedno ťuknutí znamená tablet
              mimo provoz do příchodu vedení. Proto se ptáme. */}
          <Button variant="secondary" iconOnly icon="logout" aria-label="Odhlásit tablet" title="Odhlásit tablet"
            className="shrink-0" onClick={() => setConfirmSignOut(true)} />
        </div>
      </header>

      {/* Tabs — big touch targets for a shared tablet */}
      {/* Na tabletu se záložky zalomí místo scrollování: 882 px pásu se do
          712 px nevešlo a poslední („Uzávěrka") byla uříznutá bez jakéhokoli
          náznaku, že tam ještě něco je. U baru se nehledá posuvník. */}
      <nav className="mt-5 flex gap-1.5 flex-wrap sm:flex-wrap overflow-x-auto sm:overflow-x-visible scrollbar-thin -mx-1 px-1">
        {TABS.map(t => (
          // aria-current: odečítač musí říct, na které obrazovce obsluha je —
          // třída seg-on je jen pro oko. V tmavém režimu je .seg-on inkoust na
          // skoro stejně tmavém podkladu a vybraná záložka působila slabší než
          // nevybrané se skleněnou výplní; světlá linka (ring, bez posunu
          // rozměru) ji vrátí dopředu, dokud globals.css nemá tmavou .seg-on.
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 min-h-[48px] transition active:scale-[0.97] ${
              tab === t.id ? 'seg-on dark:ring-1 dark:ring-white/30' : 'seg-off glass'
            }`}>
            <Icon key={tab === t.id ? 'on' : 'off'} name={t.icon} size={17}
              className="i-lead" motion={tab === t.id ? 'pop' : undefined} /> {t.label}
            {/* Jeden odznak jako v doku a na zvonku (DP §3.20): inkoust
                s limetkovým číslem, ne ručně limetková pilulka. Na vybrané
                (inkoustové) záložce odliší odznak prstenec plochy. */}
            {t.id === 'orders' && (
              <Badge count={newOrders} max={99} className="ml-0.5" label={`Nové objednávky: ${newOrders}`} />
            )}
          </button>
        ))}
      </nav>

      {/* Směna je vždy dostupná — tady se píchá příchod. Od kola 69 je to
          plocha s widgety (kiosk.smena): nástěnka, předávka, objednávky od
          stolu, povinné postupy… skládá je vedení v Nastavení → Stránky,
          tablet sám jen čte (rezim jen-cteni, sdílené zařízení). Nástrojem
          plochy je „Kdo je na směně" — příchod, odchod a kdo u tabletu stojí. */}
      {tab === 'shift' && (
        <main className="flex-1 mt-6">
          <ZapisPodJmenem>
            {zamceno => (
              <PlochaWidgetu
                stranka="kiosk.smena"
                rezim="jen-cteni"
                hlavicka={{
                  title: 'Směna',
                  subtitle: zamceno
                    ? 'Tablet je zamčený — widgety se odemknou, jakmile se někdo odpíchne.'
                    : 'Kdo je na směně a co dnes čeká.',
                }}
                nastroj={<WhoIsWorkingOrLock />}
              />
            )}
          </ZapisPodJmenem>
        </main>
      )}

      {/* Everything else unlocks once somebody is on shift and records under
          the active person's account. Widgety na Směně hlídá ZapisPodJmenem. */}
      {tab !== 'shift' && (
        <KioskShiftGate>
          {tab === 'tasks' && (
            <main className="flex-1 mt-5">
              <KioskTasks onOpenGuide={id => { setWantGuide(id); setTab('guides'); }} />
            </main>
          )}
          {tab === 'procedures' && (
            <WhoFirst>
              <main className="flex-1 mt-2 -mx-1"><Procedures user={actingUser} /></main>
            </WhoFirst>
          )}
          {tab === 'inventory' && (
            <WhoFirst>
              <main className="flex-1 mt-5">
                <KioskInventory />
              </main>
            </WhoFirst>
          )}
          {tab === 'orders' && <main className="flex-1 mt-5"><StaffInbox /></main>}
          {tab === 'closing' && <main className="flex-1 mt-2 -mx-1"><CashClosing user={kioskUser} /></main>}
          {tab === 'guides' && (
            <main className="flex-1 mt-2 -mx-1">
              <Guides user={kioskUser} ticksFor={active?.id ?? null} openGuideId={wantGuide} />
            </main>
          )}
        </KioskShiftGate>
      )}

      <MessengerDock user={kioskUser} />

      <Modal open={confirmSignOut} onClose={() => setConfirmSignOut(false)} size="sm"
        title="Odhlásit tablet?"
        subtitle="Zařízení se vrátí na přihlašovací obrazovku a bude potřeba e-mail a heslo tabletového účtu. Odpíchnout se odsud do té doby nepůjde."
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmSignOut(false)}>Zrušit</Button>
          <Button variant="primary" icon="logout" onClick={() => signOut({ callbackUrl: '/login' })}>Odhlásit tablet</Button>
        </>}>
        <p className="t-meta text-pretty">
          Tohle není konec směny — na ten je tlačítko u jména nahoře.
        </p>
      </Modal>
    </div>
    </NavigaceKontext.Provider>
  );
}

/**
 * Widgety na ploše Směna stojí mimo KioskShiftGate (plocha je vidět i na
 * zamčeném tabletu), a přitom některé zapisují: „Vyrobeno", „Přijmout"
 * objednávku od stolu, kartička hosta, „Zapsat novou věc", úkoly. Bez téhle
 * pojistky by šel zápis pod anonymní účet tabletu, nebo pod toho, kdo zůstal
 * v cookie — přesně to, co kolo 19 zakázalo („tablet nesmí hádat").
 *
 * - Nikdo na směně: widgety jsou `inert` (nejdou ťuknout ani zaostřit),
 *   nástroj — zamykací obrazovka s příchodem — zůstává živý.
 * - Na směně víc lidí a nikdo vybraný: první ťuknutí na ovládací prvek
 *   widgetu se zadrží a tablet se zeptá, kdo u něj stojí (requireActive,
 *   stejně jako WhoFirst). Po výběru se ťuknutí zopakuje, po zavření
 *   výběru se nestane nic.
 *
 * Widgety samy o tabletu nevědí (patří všem rozhraním), proto se hlídá
 * tady, na hranici plochy — jedno místo pro každý widget, i ten, který
 * vedení přidá do rozložení později.
 */
const NASTROJ_PLOCHY = 'nastroj';
const OVLADACI_PRVEK = 'button, a[href], input, select, textarea, summary, label, [role="button"], [role="menuitem"], [role="checkbox"], [role="switch"]';

function ZapisPodJmenem({ children }: { children: (zamceno: boolean) => React.ReactNode }) {
  const { active, onShift, requireActive, loading } = useKioskShift();
  const obal = useRef<HTMLDivElement>(null);
  const zamceno = onShift.length === 0;
  const ptatSe = !active && onShift.length > 1;
  /** Opakované ťuknutí po výběru osoby — to už pustit. */
  const propustit = useRef(false);

  // `inert` na buňky widgetů (ne na nástroj). Plocha si buňky překresluje
  // sama (načtení rozložení, obnovení), proto hlídač změn ve stromu.
  useLayoutEffect(() => {
    const el = obal.current;
    if (!el) return;
    const nastav = () => {
      el.querySelectorAll<HTMLElement>('li[data-widget]').forEach(li => {
        const ma = zamceno && li.dataset.widget !== NASTROJ_PLOCHY;
        if (li.hasAttribute('inert') !== ma) li.toggleAttribute('inert', ma);
      });
    };
    nastav();
    const hlidac = new MutationObserver(nastav);
    hlidac.observe(el, { childList: true, subtree: true });
    return () => {
      hlidac.disconnect();
      el.querySelectorAll<HTMLElement>('li[data-widget][inert]').forEach(li => li.removeAttribute('inert'));
    };
  }, [zamceno]);

  const prvekWidgetu = (cil: EventTarget | null): HTMLElement | null => {
    if (!(cil instanceof Element)) return null;
    const li = cil.closest<HTMLElement>('li[data-widget]');
    // Portál (okno widgetu) v DOM do buňky nepatří — to už prošlo branou při otevření.
    if (!li || !obal.current?.contains(li) || li.dataset.widget === NASTROJ_PLOCHY) return null;
    const prvek = cil.closest<HTMLElement>(OVLADACI_PRVEK);
    return prvek && li.contains(prvek) ? prvek : null;
  };

  const zeptatSeANavazat = (prvek: HTMLElement, akce: () => void) => {
    void requireActive().then(kdo => {
      if (!kdo) return;
      // Po výběru se musí překreslit a zapsat cookie s osobou (efekt
      // v KioskShiftProvider) — až pak smí odejít zápis.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!prvek.isConnected) return;
        propustit.current = true;
        try { akce(); } finally { propustit.current = false; }
      }));
    });
  };

  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ptatSe || propustit.current) return;
    const prvek = prvekWidgetu(e.target);
    if (!prvek) return;
    e.preventDefault();
    e.stopPropagation();
    zeptatSeANavazat(prvek, () => prvek.click());
  };
  // Pole ve widgetu (rychlý zápis) jde zaostřit i Tabem, bez kliknutí.
  const onFocusCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!ptatSe || propustit.current) return;
    const cil = e.target as HTMLElement;
    if (!cil.matches('input, select, textarea') || !prvekWidgetu(cil)) return;
    cil.blur();
    zeptatSeANavazat(cil, () => cil.focus());
  };

  return (
    <div ref={obal} onClickCapture={onClickCapture} onFocusCapture={onFocusCapture}
      data-kiosk-zapis={zamceno ? 'zamceno' : ptatSe ? 'kdo' : 'ok'}>
      {/* Během prvního načtení rozpisu je plocha taky inert (nevíme, kdo je
          na směně), ale „zamčeno" do podtitulku píšeme až podle odpovědi. */}
      {children(zamceno && !loading)}
    </div>
  );
}

/**
 * Záložky, kde se zapisuje práce, se neotevřou dřív, než tablet ví, kdo u něj
 * stojí. Bez toho běžel zavírací postup pod účtem tabletu — a v uzávěrce pak
 * stálo, že ho odklikal „iPad na baru".
 *
 * Když je na směně jeden člověk, není co splést a tohle se nikdy neukáže.
 */
function WhoFirst({ children }: { children: React.ReactNode }) {
  const { active, onShift, requireActive } = useKioskShift();
  if (active || onShift.length === 0) return <>{children}</>;
  return (
    <div className="flex-1 flex items-start justify-center pt-10 pb-10">
      <div className="card w-full max-w-lg p-8 text-center">
        <div className="mx-auto h-16 w-16 rounded-3xl bg-wait/20 text-wait-ink grid place-items-center">
          <Icon name="user" size={30} />
        </div>
        <h2 className="t-page mt-5">Kdo teď u tabletu stojí?</h2>
        <p className="text-black/50 mt-2.5 max-w-sm mx-auto text-pretty">
          Na směně je vás víc. Ať se práce zapíše pod správné jméno, ťukni na sebe.
        </p>
        {/* Jediná akce obrazovky → jediná limetka (DP §3.1), velikost lg pro tablet. */}
        <Button variant="accent" size="lg" icon="user" className="mt-7" onClick={() => { void requireActive(); }}>
          Vybrat sebe
        </Button>
      </div>
    </div>
  );
}

// Nástroj plochy Směna: když nikdo nepíchl, je to zamykací obrazovka (a tím
// i příchod), jinak „Kdo teď pracuje". Jeden nástroj pro prázdnou i běžící
// směnu — widgety kolem se nemusí starat, v jakém stavu tablet je.
function WhoIsWorkingOrLock() {
  const { onShift } = useKioskShift();
  if (onShift.length === 0) return <KioskShiftGate>{null}</KioskShiftGate>;
  return <WhoIsWorking />;
}
