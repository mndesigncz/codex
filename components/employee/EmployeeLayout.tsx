'use client';

import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import PodnikSwitcher from '../PodnikSwitcher';
import { Icon, LogoMark } from '../Icons';
import { Avatar, Badge, ErrorBoundary, MenuPanel, MenuItemButton } from '../ui';
import { usePopover } from '@/lib/usePopover';
import { czCount, NEPRECTENA_ZPRAVA } from '@/lib/czech';
import NotificationBell from '../NotificationBell';
import MessengerDock from '../chat/MessengerDock';
import { useConversations } from '../chat/useChat';
import EmployeeDashboard from './EmployeeDashboard';
import MobileMoreSheet from '../MobileMoreSheet';
import dynamic from 'next/dynamic';
import { PageSkeleton } from '../ui';
import { useOpravneni } from '../role/useOpravneni';
import BezOpravneni from '../role/BezOpravneni';
import { NavigaceKontext, useHodnotaNavigace } from '../widgety/NavigaceKontext';

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
const TimeOffRequest = naLine(() => import('../scheduling/TimeOffRequest'));
const InventoryReport = naLine(() => import('./InventoryReport'));
const Tasks = naLine(() => import('./Tasks'));
const MyRewards = naLine(() => import('./MyRewards'));
const CashClosing = naLine(() => import('./CashClosing'));
const SuggestionsBoard = naLine(() => import('../SuggestionsBoard'));
const Procedures = naLine(() => import('../procedures/Procedures'));


const navItems = [
  { id: 'home',        label: 'Přehled',    icon: 'overview' },
  { id: 'my-shifts',   label: 'Moje směny', icon: 'calendar', short: 'Směny' },
  { id: 'procedures',  label: 'Postupy',    icon: 'clipboard' },
  { id: 'availability',label: 'Dostupnost', icon: 'swap' },
  { id: 'inventory',   label: 'Sklad',      icon: 'box' },
  { id: 'closing',     label: 'Uzávěrka',   icon: 'trend' },
  { id: 'tasks',       label: 'Úkoly',      icon: 'check' },
  { id: 'rewards',     label: 'Odměny',     icon: 'award' },
  { id: 'chat',        label: 'Chat',       icon: 'chat' }, // mobile dock only
  { id: 'guides',      label: 'Návody',     icon: 'book' },
  { id: 'suggestions', label: 'Nápady',     icon: 'bulb' },
];

// Grouped navigation categories for the menus.
const navSections: { title: string | null; ids: string[] }[] = [
  { title: null,        ids: ['home'] },
  { title: 'Směny',     ids: ['my-shifts', 'availability'] },
  { title: 'Práce',     ids: ['closing', 'inventory', 'tasks', 'procedures'] },
  { title: 'Tým',       ids: ['rewards', 'chat', 'guides', 'suggestions'] },
];
const byId = Object.fromEntries(navItems.map(n => [n.id, n]));

const mobilePrimary = ['home', 'my-shifts', 'inventory', 'chat'];

// Pohledy podle oprávnění (kolo 67). Barista má všechno níže, takže se mu
// nic neschová; vlastní role typu Zaměstnanec (třeba Kuchař bez uzávěrky)
// už nevidí obrazovku, která by skončila 403. Vlastní směny, dostupnost,
// úkoly a odměny patří každému — jde o jeho vlastní data.
const KLICE_POHLEDU: Record<string, readonly string[] | null> = {
  inventory: ['sklad.zobrazit'],
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
  // Deep links from notifications: /employee/shifts?view=X
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get('view');
    if (v && (byId[v] || v === 'settings')) setCurrentView(v);
    const g = Number(p.get('guide'));
    if (v === 'guides' && Number.isFinite(g) && g > 0) setGuideId(g);
  }, []);
  // A quick-access tile can ask for a specific stock category.
  const [inventoryCat, setInventoryCat] = useState<string | undefined>();
  // Proklik na KONKRÉTNÍ návod — z úkolu „Vyrobit X“ nebo z výrobní tabule.
  // Bez toho vede každý odkaz jen na seznam návodů.
  const [guideId, setGuideId] = useState<number | null>(null);
  const navigate = (view: string, arg?: string) => {
    setInventoryCat(view === 'inventory' ? arg : undefined);
    setGuideId(view === 'guides' && arg ? Number(arg) : null);
    setCurrentView(view);
  };
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Chat byl na telefonu jediná ikona v docku, která nikdy nedala vědět,
  // že něco přišlo. Sklad hlásil „3", Docházka „2", chat mlčel — takže
  // nebyl důvod na něj ťuknout.
  const { conversations: chatConvs } = useConversations();
  const unreadChat = chatConvs.reduce((n, c) => n + (c.unreadCount || 0), 0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const ucet = usePopover(accountOpen, setAccountOpen, { focusFirst: true, arrowKeys: true });
  const openSettings = () => { setCurrentView('settings'); setAccountOpen(false); setMoreOpen(false); };

  const renderView = () => {
    if (!smiPohled(currentView)) return <BezOpravneni onZpet={() => setCurrentView('home')} />;
    switch (currentView) {
      case 'home':         return <EmployeeDashboard user={user} />;
      // Výměny a kalendář vlastních směn jsou od kola 69 widgety plochy Mých směn.
      case 'my-shifts':    return <MyShifts user={user as any} />;
      case 'availability': return (
        <div className="space-y-2">
          <AvailabilitySubmit user={user as any} />
          <div className="px-4 sm:px-6 pb-6 max-w-3xl mx-auto w-full"><TimeOffRequest /></div>
        </div>
      );
      case 'inventory':    return <InventoryReport user={user as any} initialCategory={inventoryCat} />;
      case 'closing':      return <CashClosing user={user as any} />;
      case 'procedures':   return <Procedures user={user as any} />;
      case 'tasks':        return <Tasks user={user as any} />;
      case 'rewards':      return <MyRewards />;
      case 'chat':         return <ChatView user={user as any} />;
      case 'guides':       return <Guides user={user as any} openGuideId={guideId} />;
      case 'suggestions':  return <SuggestionsBoard />;
      case 'settings':     return <Settings user={user as any} initialTab="account" />;
      default:             return <EmployeeDashboard user={user} />;
    }
  };

  const active = navItems.find(n => n.id === currentView);
  const title = currentView === 'settings' ? 'Nastavení' : active?.label;
  const mojeNav = navItems.filter(n => smiPohled(n.id));
  const mojeById = Object.fromEntries(mojeNav.map(n => [n.id, n]));
  const mobileSecondary = mojeNav.filter(n => !mobilePrimary.includes(n.id));
  const mobileGroups = navSections
    .map(sec => ({ title: sec.title, items: sec.ids.map(id => mojeById[id]).filter(n => n && !mobilePrimary.includes(n.id)) }))
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
              <p className="t-label text-black/40 mt-0.5">Portál zaměstnance</p>
            </div>
          )}
        </div>
        {/* Barista, který jezdí mezi pobočkami, si tu vybere, kde dnes je. */}
        <div className={`border-b border-black/[0.07] ${sidebarOpen ? 'px-2 py-1.5' : 'px-1 py-1.5'}`}>
          <PodnikSwitcher compact={!sidebarOpen} />
        </div>
        <nav className="flex-1 py-3 space-y-0.5 px-3 overflow-y-auto scrollbar-thin">
          {navSections.map((sec, si) => {
            const items = sec.ids.map(id => mojeById[id]).filter(n => n && n.id !== 'chat');
            if (!items.length) return null;
            return (
              <div key={sec.title ?? 'top'} className={si > 0 ? 'pt-2.5' : ''}>
                {sec.title && (sidebarOpen
                  // Štítek skupiny jako všude jinde (t-label), ne ručně psaný (audit kola 68, rám).
                  ? <p className="t-label px-3.5 pb-1.5">{sec.title}</p>
                  : <div className="mx-3 mb-1.5 h-px bg-black/[0.07]" />
                )}
                <div className="space-y-0.5">
                  {items.map(item => (
                    <button key={item.id} onClick={() => setCurrentView(item.id)} title={item.label}
                      className={`w-full flex items-center gap-3 py-2.5 rounded-2xl text-sm font-medium transition duration-200 ${sidebarOpen ? 'px-3.5' : 'px-0 justify-center'} ${
                        currentView === item.id ? 'seg-on' : 'seg-off'
                      }`}>
                      <Icon name={item.icon} size={21} className="flex-shrink-0 i-lead"
                        motion={currentView === item.id ? 'pop' : undefined}
                        key={currentView === item.id ? 'on' : 'off'} />
                      {sidebarOpen && <span className="truncate">{item.label}</span>}
                    </button>
                  ))}
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
            <MenuPanel ref={ucet.panelRef} onKeyDown={ucet.onPanelKeyDown} direction="up" aria-label="Účet"
              className="absolute left-3 right-3 bottom-full mb-2 origin-bottom-left">
              <MenuItemButton label="Nastavení" icon="settings" onClick={openSettings} />
              <div role="separator" className="h-px bg-black/[0.06] my-1" />
              <MenuItemButton label="Odhlásit se" icon="logout" danger onClick={() => signOut({ callbackUrl: '/login' })} />
            </MenuPanel>
          )}
          <button ref={ucet.triggerRef} type="button" onClick={() => setAccountOpen(v => !v)} onKeyDown={ucet.onTriggerKeyDown}
            title="Účet" aria-haspopup="menu" aria-expanded={accountOpen}
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
        <header className="px-4 sm:px-6 pt-5 pb-1 flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Ikonové tlačítko bez textu je pro odečítač obrazovky prostě
              „tlačítko". Tenhle přepínač je na každé obrazovce aplikace. */}
          <button onClick={() => setSidebarOpen(v => !v)} type="button"
            aria-label={sidebarOpen ? 'Zúžit boční pás' : 'Rozbalit boční pás'}
            aria-expanded={sidebarOpen}
            className="hidden md:flex rounded-full p-2 text-black/45 hover:text-black hover:bg-black/[0.05] transition-colors">
            <Icon name="menu" size={20} />
          </button>
          <div className="hidden min-[380px]:block md:hidden shrink-0"><LogoMark size={30} /></div>
          {/* Barista mezi pobočkami se přepíná hlavně z telefonu — boční pás tam není. */}
          <div className="md:hidden shrink-0"><PodnikSwitcher compact jenPrepinani /></div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-[#16181A] text-lg tracking-tight truncate">{title}</h2>
          </div>
          <NotificationBell />
        </header>

        <main className={`flex-1 ${currentView === 'chat'
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

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <nav className="glass-strong mx-auto max-w-md rounded-3xl px-2 py-2 flex items-center justify-around shadow-[0_10px_34px_rgba(25,35,15,0.16)]">
          {mojeNav.filter(n => mobilePrimary.includes(n.id)).map(item => (
            <button key={item.id} onClick={() => { setCurrentView(item.id); setMoreOpen(false); }} title={item.label}
              className={`relative flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition duration-[var(--dur-2)] ease-[var(--ease-out-soft)] ${
                currentView === item.id ? 'text-[#16181A] -translate-y-0.5' : 'text-black/40'}`}>
              <Icon key={currentView === item.id ? 'on' : 'off'} name={item.icon} size={22}
                strokeWidth={currentView === item.id ? 2 : 1.7}
                className="i-lead" motion={currentView === item.id ? 'pop' : undefined} />
              {item.id === 'chat' && currentView !== 'chat' && (
                <Badge count={unreadChat} label={czCount(unreadChat, NEPRECTENA_ZPRAVA)} className="absolute top-0 right-1" />
              )}
              <span className={`text-[11px] leading-none font-medium ${currentView === item.id ? 'text-[#16181A]' : 'text-black/40'}`}>{(item as any).short ?? item.label}</span>
            </button>
          ))}
          <button onClick={() => setMoreOpen(v => !v)} title="Více"
            className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition duration-200 ${moreOpen || currentView === 'settings' || mobileSecondary.some(n => n.id === currentView) ? 'text-[#16181A]' : 'text-black/40'}`}>
            <Icon name="menu" size={22} />
            <span className="text-[11px] leading-none font-medium">Více</span>
          </button>
        </nav>

      </div>

      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        groups={mobileGroups}
        activeId={currentView}
        onSelect={setCurrentView}
        actions={[
          { label: 'Nastavení', icon: 'settings', onClick: openSettings },
          { label: 'Odhlásit se', icon: 'logout', onClick: () => signOut({ callbackUrl: '/login' }), danger: true },
        ]}
      />
    </div>
    </NavigaceKontext.Provider>
  );
}
