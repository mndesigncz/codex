'use client';

import { akceProHledani } from '@/components/widgety/akceHledani';
import { predejUkolum } from '@/lib/ukolyFiltr';
import { GlobalniHledani, useZkratkaHledani } from '../GlobalniHledani';
import { useState } from 'react';
import { predejPohledu } from '@/lib/predaniPohledu';
import { odhlasit } from '@/lib/odhlaseni';
import PodnikSwitcher from '../PodnikSwitcher';
import { Icon, LogoMark } from '../Icons';
import { Avatar, Badge, ErrorBoundary, IconButton, MenuPanel, MenuItemButton } from '../ui';
import { Dock } from '../ui/Dock';
import { usePopover } from '@/lib/usePopover';
import NotificationBell from '../NotificationBell';
import MessengerDock from '../chat/MessengerDock';
import { useConversations } from '../chat/useChat';
import EmployeeDashboard from './EmployeeDashboard';
import MobileMoreSheet from '../MobileMoreSheet';
import { VYCHOZI_NAV } from '@/lib/navigace';
import { useHistoriePohledu, useNavigaceAplikace } from '../useNavigaceAplikace';
import { useJazyk, useT } from '@/lib/i18n/client';
import { JAZYK_NAZEV } from '@/lib/i18n/config';
import JazykOkno from '../JazykOkno';
import { Chip } from '../ui';
import dynamic from 'next/dynamic';
import { PageSkeleton } from '../ui';
import { useOpravneni } from '../role/useOpravneni';
import BezOpravneni from '../role/BezOpravneni';
import { NavigaceKontext, useHodnotaNavigace } from '../widgety/NavigaceKontext';
import { otevriPostupPoPrechodu } from '@/lib/otevriPostup';
import { zalozkaNastaveni } from '@/lib/nastaveniZalozky';
import { useUkolyZaBody } from '../navic/data';
import { pocetKVzeti, urlUkolyZaBody } from '../navic/logika';

// Pohledy se stahují až při otevření — viz EmployerLayout. Zaměstnanec
// otevře za směnu obvykle dvě obrazovky; stahovat kvůli tomu uzávěrku,
// inventuru i výměny směn je čekání navíc na telefonu v provozu.
// Domovská obrazovka zůstává statická, je první po přihlášení.
function naLine<P extends object>(nacti: () => Promise<{ default: React.ComponentType<P> }>) {
  return dynamic(nacti, { loading: () => <PageSkeleton /> }) as React.ComponentType<P>;
}

const ChatView = naLine(() => import('../chat/ChatView'));
const Guides = naLine(() => import('../Guides'));
const Settings = naLine(() => import('../Settings'));
const MyShifts = naLine(() => import('./MyShifts'));
const AvailabilitySubmit = naLine(() => import('../scheduling/AvailabilitySubmit'));
const InventoryReport = naLine(() => import('./InventoryReport'));
const RecipesView = naLine<import('../inventory/RecipesView').RecipesViewProps>(() => import('../inventory/RecipesView'));
const Tasks = naLine(() => import('./Tasks'));
const MyRewards = naLine(() => import('./MyRewards'));
const CashClosing = naLine(() => import('./CashClosing'));
const SuggestionsBoard = naLine(() => import('../SuggestionsBoard'));
const Procedures = naLine(() => import('../procedures/Procedures'));


// Výchozí pohledy, skupiny a dok jsou v lib/navigace.ts (sdílí je oba layouty
// a skládání navigace podle nastavení podniku).
const navItems = VYCHOZI_NAV.zamestnanec.polozky;
const byId = Object.fromEntries(navItems.map(n => [n.id, n]));

// Pohledy podle oprávnění (kolo 67). Barista má všechno níže, takže se mu
// nic neschová; vlastní role typu Zaměstnanec (třeba Kuchař bez uzávěrky)
// už nevidí obrazovku, která by skončila 403. Vlastní směny, dostupnost,
// úkoly a odměny patří každému — jde o jeho vlastní data.
const KLICE_POHLEDU: Record<string, readonly string[] | null> = {
  inventory: ['sklad.zobrazit'],
  recipes: ['receptury.zobrazit'],
  closing: ['uzaverky.vytvorit', 'uzaverky.predavka'],
  procedures: ['postupy.zobrazit'],
  guides: ['navody.zobrazit'],
  suggestions: ['napady.pridat', 'napady.spravovat'],
  chat: ['chat.pouzivat'],
};

interface Props {
  user: { name?: string | null; email?: string | null; id?: string; role?: string; avatar?: string; jobTitle?: string };
}

export default function EmployeeLayout({ user }: Props) {
  const [currentView, setCurrentView] = useState('home');
  const { ma, opravneni, nacteno } = useOpravneni();
  const smiPohled = (id: string) => { const k = KLICE_POHLEDU[id]; return k == null || ma(k); };
  const t = useT();
  const { jazyk } = useJazyk();
  // Navigace podle oprávnění (první) a nastavení podniku (skrýt, přejmenovat, pořadí).
  const nav = useNavigaceAplikace('zamestnanec', smiPohled, [opravneni, nacteno]);
  const [jazykOpen, setJazykOpen] = useState(false);
  // Adresa a historie obrazovek (kolo 8): odkaz z oznámení `/employee/shifts?view=X`
  // (i `&tab=jazyk`, `&guide=12` — čte se jako `arg`) otevře rovnou tu obrazovku, každý
  // přechod se zapíše do historie a Zpět na telefonu vrátí předchozí obrazovku místo
  // zavření aplikace. Okna si své záznamy řeší lib/useModal.
  const zname = (v: string) => byId[v] != null || v === 'settings';
  const historie = useHistoriePohledu({
    vychozi: 'home', zname,
    naStart: (v, a) => naviguj(v, a, false),
    naZpet: (v, a) => naviguj(v, a, false),
  });
  // A quick-access tile can ask for a specific stock category.
  const [inventoryCat, setInventoryCat] = useState<string | undefined>();
  // Zvedne se při každém příchodu do Skladu z widgetu: stejný argument podruhé (filtr mezitím zrušený) se použije znovu.
  const [inventoryPredani, setInventoryPredani] = useState(0);
  // Proklik na KONKRÉTNÍ návod — z úkolu „Vyrobit X“ nebo z výrobní tabule.
  // Bez toho vede každý odkaz jen na seznam návodů.
  const [guideId, setGuideId] = useState<number | null>(null);
  // Filtr Návodů z widgetu (`stav:kprecteni`, `stav:navrhy`); `n` se zvedne při každém příchodu.
  const [guideFiltr, setGuideFiltr] = useState<{ stav?: 'kprecteni' | 'navrhy'; n: number }>({ n: 0 });
  // Proklik z widgetu „Nepřečtené zprávy“ do konkrétního vlákna. Layout
  // zaměstnance arg pro chat zahazoval (jen vedení ho předávalo), takže
  // klepnutí na řádek skončilo na seznamu konverzací.
  const [chatConvId, setChatConvId] = useState<number | null>(null);
  // Receptura z kasy k otevření (proklik z widgetu nebo z položky skladu).
  const [recipeProduct, setRecipeProduct] = useState<string | undefined>();
  // Záložka Nastavení z odkazu nebo z widgetu; nonce říká otevřenému Nastavení, že si ji někdo vyžádal znovu.
  const [settingsTab, setSettingsTab] = useState<ReturnType<typeof zalozkaNastaveni>>();
  const [settingsNonce, setSettingsNonce] = useState(0);
  const navigate = (view: string, arg?: string) => naviguj(view, arg);
  /** Přepne pohled; `zapsat` = zapsat i do historie (při Zpět a při načtení z adresy ne — záznam už tam je). */
  const naviguj = (view: string, arg?: string, zapsat = true) => {
    if (view === 'tasks') predejUkolum(arg);
    setSettingsTab(view === 'settings' ? zalozkaNastaveni(arg) : undefined);
    if (view === 'settings') setSettingsNonce(n => n + 1);
    setInventoryCat(view === 'inventory' ? arg : undefined);
    if (view === 'inventory' && arg) setInventoryPredani(n => n + 1);
    setRecipeProduct(view === 'recipes' && arg && !arg.includes(':') ? arg : undefined);
    setGuideId(view === 'guides' && arg && /^\d+$/.test(arg) ? Number(arg) : null);
    // Dostupnost: `volno` (akce „Požádat o volno" v paletě) otevře okno žádosti hned po příchodu.
    if (view === 'suggestions' || view === 'procedures' || view === 'availability') predejPohledu(view, arg);
    if (view === 'guides') setGuideFiltr(f => ({ stav: arg === 'stav:kprecteni' ? 'kprecteni' : arg === 'stav:navrhy' ? 'navrhy' : undefined, n: f.n + 1 }));
    setChatConvId(view === 'chat' && arg && /^\d+$/.test(arg) ? Number(arg) : null);
    // Proklik na KONKRÉTNÍ postup (zamčená uzávěrka, widget) — bez toho
    // skončil člověk na seznamu a hledal. Detail otevře událost, až se
    // Postupy připojí. Úkoly `arg` zatím nevyužijí (seznam je krátký).
    if (view === 'procedures' && arg && /^\d+$/.test(arg)) otevriPostupPoPrechodu(Number(arg));
    setCurrentView(view);
    if (zapsat) historie.zapis(view, arg);
  };
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { otevreno: hledaniOtevreno, setOtevreno: setHledani } = useZkratkaHledani();
  // Chat byl na telefonu jediná ikona v docku, která nikdy nedala vědět,
  // že něco přišlo. Sklad hlásil „3", Docházka „2", chat mlčel — takže
  // nebyl důvod na něj ťuknout.
  const { conversations: chatConvs } = useConversations();
  const unreadChat = chatConvs.reduce((n, c) => n + (c.unreadCount || 0), 0);
  // Kolo 11: Úkoly nesou odznak s počtem úkolů za body, které si dnes jde vzít — jeden dotaz na
  // /api/navic/ukoly, sdílený s widgetem na Domů a sekcí v Úkolech (useDataWidgetu, obnova po každé změně navíc).
  const zaBody = useUkolyZaBody(nacteno && ma('navic.zapsat') ? urlUkolyZaBody() : null);
  const kVzetiZaBody = pocetKVzeti(zaBody.data ?? []);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const ucet = usePopover(accountOpen, setAccountOpen, { focusFirst: true, arrowKeys: true });
  const openSettings = () => { navigate('settings'); setAccountOpen(false); setMoreOpen(false); };

  const renderView = () => {
    if (!smiPohled(currentView)) return <BezOpravneni onZpet={() => navigate('home')} />;
    switch (currentView) {
      case 'home':         return <EmployeeDashboard user={user} />;
      // Výměny a kalendář vlastních směn jsou od kola 69 widgety plochy Mých směn.
      case 'my-shifts':    return <MyShifts user={user as any} />;
      // Žádost o volno je od kola 7 tlačítko v hlavičce Dostupnosti (okno) a „Moje žádosti" pod kalendářem —
      // karta pod plochou (na telefonu mimo výřez) je pryč.
      case 'availability': return <AvailabilitySubmit user={user as any} />;
      case 'inventory':    return <InventoryReport user={user as any} initialCategory={inventoryCat} predani={inventoryPredani} />;
      case 'recipes':      return <RecipesView stranka="zamestnanec.receptury" openProductId={recipeProduct} onNavigate={navigate} />;
      case 'closing':      return <CashClosing user={user as any} />;
      case 'procedures':   return <Procedures user={user as any} />;
      case 'tasks':        return <Tasks user={user as any} />;
      case 'rewards':      return <MyRewards />;
      case 'chat':         return <ChatView user={user as any} openConversationId={chatConvId} />;
      case 'guides':       return <Guides user={user as any} openGuideId={guideId} predani={guideFiltr} />;
      case 'suggestions':  return <SuggestionsBoard />;
      case 'settings':     return <Settings user={user as any} initialTab={settingsTab ?? 'account'} tabNonce={settingsNonce} />;
      default:             return <EmployeeDashboard user={user} />;
    }
  };

  // Štítek aktivního pohledu z poskládané navigace (přejmenování, jazyk); skrytý
  // pohled otevřený odkazem se hledá mezi skrytými, neznámý spadne na výchozí název.
  const active = [...nav.vse, ...nav.skryte].find(n => n.id === currentView)
    ?? (byId[currentView] ? { ...byId[currentView], label: t(byId[currentView].label, undefined, 'nav') } : undefined);
  const jeSkryty = nav.skryte.some(n => n.id === currentView);
  const title = currentView === 'settings' ? t('Nastavení') : active?.label;
  const mojeNav = navItems.filter(n => smiPohled(n.id));
  const vDoku = (id: string) => nav.dok.some(d => d.id === id);
  const mobileSecondary = nav.vse.filter(n => !vDoku(n.id));
  // Chat mimo dok nese odznak nepřečtených na dlaždici (stejné číslo jako v doku); Úkoly počet úkolů za body k vzetí.
  const odznakChatu = (id: string): { badge?: number; badgeLabel?: string } => (id === 'chat' && currentView !== 'chat' && unreadChat > 0
    ? { badge: unreadChat, badgeLabel: t('{n, plural, one {# nepřečtená zpráva} few {# nepřečtené zprávy} other {# nepřečtených zpráv}}', { n: unreadChat }) }
    : id === 'tasks' && currentView !== 'tasks' && kVzetiZaBody > 0
      ? { badge: kVzetiZaBody, badgeLabel: t('{n, plural, one {# úkol za body k vzetí} few {# úkoly za body k vzetí} other {# úkolů za body k vzetí}}', { n: kVzetiZaBody }) }
      : {});
  const mobileGroups = nav.sekce
    .map(sec => ({ title: sec.title, items: sec.items.filter(n => !vDoku(n.id)).map(n => ({ ...n, ...odznakChatu(n.id) })) }))
    .filter(g => g.items.length);

  // Navigace pro widgety na ploše (kolo 68, spec §2.6): proklik z widgetu vede
  // jen na pohled, který zaměstnanecký layout zná a kam divák smí — smiPohled
  // pro neznámé id vrací ano (null = každý), proto ještě kontrola seznamu.
  const smiPohledZWidgetu = (pohled: string) => (byId[pohled] != null || pohled === 'settings') && smiPohled(pohled);
  const navigaceWidgetu = useHodnotaNavigace(navigate, smiPohledZWidgetu, mojeNav, [opravneni, nacteno]);

  return (
    <NavigaceKontext.Provider value={navigaceWidgetu}>
    <div className="flex h-[100dvh] overflow-hidden">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-[76px]'} glass-strong hidden md:flex m-4 mr-0 rounded-3xl text-[#16181A] flex-col transition-[width] duration-300 flex-shrink-0`}>
        <div className={`flex items-center gap-3 py-5 border-b border-black/[0.07] ${sidebarOpen ? 'px-5' : 'px-0 justify-center'}`}>
          <LogoMark size={40} />
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm leading-tight tracking-tight">Managero</p>
              <p className="t-label text-black/40 mt-0.5">{t('Portál zaměstnance')}</p>
            </div>
          )}
        </div>
        {/* Barista, který jezdí mezi pobočkami, si tu vybere, kde dnes je. */}
        <div className={`border-b border-black/[0.07] ${sidebarOpen ? 'px-2 py-1.5' : 'px-1 py-1.5'}`}>
          <PodnikSwitcher compact={!sidebarOpen} />
        </div>
        <nav className="flex-1 py-3 space-y-0.5 px-3 overflow-y-auto scrollbar-thin">
          {nav.sekce.map((sec, si) => {
            const items = sec.items.filter(n => n.id !== 'chat');
            if (!items.length) return null;
            return (
              <div key={sec.id} className={si > 0 ? 'pt-2.5' : ''}>
                {sec.title && (sidebarOpen
                  // Štítek skupiny jako všude jinde (t-label), ne ručně psaný (audit kola 68, rám).
                  ? <p className="t-label px-3.5 pb-1.5">{sec.title}</p>
                  : <div className="mx-3 mb-1.5 h-px bg-black/[0.07]" />
                )}
                <div className="space-y-0.5">
                  {items.map(item => {
                    const odznak = odznakChatu(item.id);
                    return (
                    <button key={item.id} onClick={() => navigate(item.id)} title={item.label}
                      className={`relative w-full flex items-center gap-3 py-2.5 rounded-2xl text-sm font-medium transition duration-200 ${sidebarOpen ? 'px-3.5' : 'px-0 justify-center'} ${
                        currentView === item.id ? 'seg-on' : 'seg-off'
                      }`}>
                      <Icon name={item.icon} size={21} className="flex-shrink-0 i-lead"
                        motion={currentView === item.id ? 'pop' : undefined}
                        key={currentView === item.id ? 'on' : 'off'} />
                      {sidebarOpen && <span className="truncate">{item.label}</span>}
                      {/* Odznak (kolo 11: úkoly za body k vzetí) — v rozbaleném pásu vpravo, v zúženém přes roh ikony. */}
                      {odznak.badge ? <Badge count={odznak.badge} label={odznak.badgeLabel} ring={!sidebarOpen}
                        className={sidebarOpen ? 'ml-auto shrink-0' : 'absolute top-1 right-3'} /> : null}
                    </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        <div ref={ucet.ref} className="p-3 border-t border-black/[0.07] relative">
          {/* Účtové menu je MenuPanel jako každá jiná nabídka (audit kola 68,
              rám): dřív vlastní panel se stínem psaným ručně, bez Escapu,
              bez zavření klepnutím vedle a bez šipek. */}
          {accountOpen && (
            <MenuPanel ref={ucet.panelRef} onKeyDown={ucet.onPanelKeyDown} direction="up" aria-label={t('Účet')}
              className="absolute left-3 right-3 bottom-full mb-2 origin-bottom-left">
              <MenuItemButton label={t('Nastavení')} icon="settings" onClick={openSettings} />
              <MenuItemButton label={`${t('Jazyk')}: ${JAZYK_NAZEV[jazyk]}`} icon="globe" onClick={() => { setAccountOpen(false); setJazykOpen(true); }} />
              <div role="separator" className="h-px bg-black/[0.06] my-1" />
              <MenuItemButton label={t('Odhlásit se')} icon="logout" danger onClick={() => odhlasit({ callbackUrl: '/login' })} />
            </MenuPanel>
          )}
          <button ref={ucet.triggerRef} type="button" onClick={() => setAccountOpen(v => !v)} onKeyDown={ucet.onTriggerKeyDown}
            title={t('Účet')} aria-haspopup="menu" aria-expanded={accountOpen}
            className={`w-full flex items-center gap-3 rounded-2xl transition-colors ${accountOpen ? 'bg-black/[0.06]' : 'bg-black/[0.04] hover:bg-black/[0.05]'} ${sidebarOpen ? 'p-2' : 'p-2 justify-center'}`}>
            <Avatar emoji={user.avatar} size="md" />
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate">{user.name}</p>
                  <p className="text-[11px] text-black/45">{user.jobTitle ?? 'Barista'}</p>
                </div>
                <Icon name="chevron" size={16} className={`text-black/40 transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Stejné odsazení jako u vedení — na 320px ho název stránky potřebuje. */}
        {/* Horní lišta v3: značka a podnik vlevo, vpravo hledání a oznámení v šedých
            kruzích. Název stránky stojí jednou — velkým h1 pod lištou; tady ho čte
            jen odečítač. */}
        <header className="px-5 sm:px-6 pt-4 pb-1 flex items-center gap-2 sm:gap-2.5 flex-shrink-0 min-h-[3.75rem]">
          {/* Ikonové tlačítko bez textu je pro odečítač obrazovky prostě
              „tlačítko". Tenhle přepínač je na každé obrazovce aplikace. */}
          <IconButton icon="menu" onClick={() => setSidebarOpen(v => !v)}
            aria-label={sidebarOpen ? t('Zúžit boční pás') : t('Rozbalit boční pás')}
            aria-expanded={sidebarOpen} className="hidden md:inline-flex" />
          <div className="md:hidden shrink-0"><LogoMark size={30} /></div>
          {/* Barista mezi pobočkami se přepíná hlavně z telefonu — boční pás tam není. */}
          <div className="md:hidden shrink-0"><PodnikSwitcher compact jenPrepinani /></div>
          <p className="sr-only">{title}</p>
          <div className="flex-1 min-w-0" />
          {/* Sekce skrytá v nastavení podniku, otevřená odkazem nebo widgetem: preference, ne zákaz. */}
          {jeSkryty && <Chip tone="muted" size="sm" className="shrink-0">{t('Skrytá sekce')}</Chip>}
          {/* Lupa i na telefonu (kolo 6, Z9): hledání najde úkoly, položky skladu, návody i akce. */}
          <IconButton icon="search" onClick={() => setHledani(true)} title={t('Hledat v aplikaci (Ctrl K)')} aria-label={t('Hledat v aplikaci')} aria-haspopup="dialog" />
          <NotificationBell />
        </header>

        {/* relative: absolutně umístěné prvky uvnitř (skryté popisky pro
            odečítač, sr-only) se jinak vztahují k celému dokumentu, ne
            k posuvné <main> — v jejím obsahu ležely pod okrajem obrazovky
            a nafoukly dokument. Na telefonu pak tah prstem po pozadí
            posunul celé rozvržení nahoru: hlavička zmizela a pod kartami
            zůstal prázdný pruh. */}
        <main className={`relative flex-1 ${currentView === 'chat'
            // Chat se na telefonu nescrolluje, takže odsazení pro dok
            // jen ukusovalo z plochy na zprávy: z 844px displeje zbývalo
            // na vlákno 467, a pod psacím polem bylo 80px prázdna.
            ? 'pb-[84px] md:pb-4 overflow-hidden flex flex-col mx-2 my-2 md:m-4'
            : 'pb-28 md:pb-4 overflow-y-auto scrollbar-thin'}`}>
          {currentView === 'chat' ? (
            <ErrorBoundary resetKey={currentView}>{renderView()}</ErrorBoundary>
          ) : (
            <div className="mx-auto w-full max-w-7xl">
              <ErrorBoundary resetKey={currentView}>{renderView()}</ErrorBoundary>
            </div>
          )}
        </main>
      </div>

      {/* Na obrazovce Chatu plovoucí tlačítko nedává smysl — otevírá
          přesně to, co má člověk otevřené pod ním. */}
      {currentView !== 'chat' && smiPohled('chat') && <MessengerDock user={user as any} />}

      {/* Spodní dok na telefonu — sdílený components/ui/Dock (kolo 69, B8); dřív
          vlastní kopie s `glass-strong`, jinak neprůhledná než dok administrace. */}
      <Dock label={t('Spodní navigace')}
        items={nav.dok.map(n => ({
          id: n.id, label: (n as { short?: string }).short ?? n.label, icon: n.icon,
          ...(n.id === 'chat' && currentView !== 'chat' ? { badge: unreadChat, badgeLabel: t('{n, plural, one {# nepřečtená zpráva} few {# nepřečtené zprávy} other {# nepřečtených zpráv}}', { n: unreadChat }) } : odznakChatu(n.id)),
        }))}
        activeId={currentView}
        onSelect={id => { navigate(id); setMoreOpen(false); }}
        more={{ onClick: () => setMoreOpen(v => !v), active: moreOpen || currentView === 'settings' || mobileSecondary.some(n => n.id === currentView) }} />

      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        groups={mobileGroups}
        activeId={currentView}
        onSelect={navigate}
        actions={[
          { label: t('Hledat'), icon: 'search', onClick: () => { setMoreOpen(false); setHledani(true); } },
          { label: t('Nastavení'), icon: 'settings', onClick: openSettings },
          { label: `${t('Jazyk')}: ${JAZYK_NAZEV[jazyk]}`, icon: 'globe', onClick: () => { setMoreOpen(false); setJazykOpen(true); } },
          { label: t('Odhlásit se'), icon: 'logout', onClick: () => odhlasit({ callbackUrl: '/login' }), danger: true },
        ]}
      />
      <GlobalniHledani open={hledaniOtevreno} onClose={() => setHledani(false)} stranky={nav.vse} akce={akceProHledani('zamestnanec', smiPohled)} onStranka={navigate}
        hledatUkoly={smiPohled('tasks')} hledatSklad={smiPohled('inventory')} hledatNavody={smiPohled('guides')} hledatPostupy={smiPohled('procedures')}
        hledatReceptury={smiPohled('recipes')} />
      <JazykOkno open={jazykOpen} onClose={() => setJazykOpen(false)} />
    </div>
    </NavigaceKontext.Provider>
  );
}
