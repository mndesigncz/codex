'use client';

import { useSession } from 'next-auth/react';

import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import PodnikSwitcher, { uklidKonceptu } from '../PodnikSwitcher';
import { Icon, LogoMark } from '../Icons';
import { Avatar, Badge, ErrorBoundary } from '../ui';
import { czCount, NEPRECTENA_ZPRAVA } from '@/lib/czech';
import NotificationBell from '../NotificationBell';

import MessengerDock from '../chat/MessengerDock';
import { useConversations } from '../chat/useChat';

import EmployerDashboard from './EmployerDashboard';

import ReceiptsPanel from './ReceiptsPanel';
import ShiftSwap from '../scheduling/ShiftSwap';
import ShiftSwapApprovals from '../scheduling/ShiftSwapApprovals';
import MobileMoreSheet from '../MobileMoreSheet';
import { ProfileLinkProvider } from './ProfileLinkProvider';
import { usePlan, MaxGate } from '../Pro';
import { czDays } from '@/lib/plan';
import { useModal } from '@/lib/useModal';
import { DiscardGuard } from '../ui/DiscardGuard';
import dynamic from 'next/dynamic';
import { PageSkeleton } from '../ui';
import { useOpravneni } from '../role/useOpravneni';
import BezOpravneni from '../role/BezOpravneni';
import { useStrazRole, CO_SE_ZAHODI_ROLE } from '../role/rozepsano';
import { NavigaceKontext, useHodnotaNavigace } from '../widgety/NavigaceKontext';

// Pohledy se stahují až při otevření.
//
// Hlavní obrazovka měla 421 kB prvního načtení, zatímco zbytek aplikace
// 87–137 kB: všech dvaadvacet pohledů — rozvrh, sklad, receptury, postupy,
// chat i správa hostovské části — se stahovalo dřív, než se ukázal přehled.
// Manažer na telefonu v kavárně tak čekal na věci, které ten den vůbec
// neotevře.
//
// Přehled zůstává statický schválně: je to první obrazovka po přihlášení
// a ta čekat nemá. Zbytek dostane kostru, než dojede.
function naLine<P extends object>(nacti: () => Promise<{ default: React.ComponentType<P> }>) {
  return dynamic(nacti, { loading: () => <PageSkeleton /> }) as React.ComponentType<P>;
}

const ChatView = naLine(() => import('../chat/ChatView'));
const Guides = naLine(() => import('../Guides'));
const Settings = naLine(() => import('../Settings'));
const TeamManagement = naLine(() => import('../TeamManagement'));
const ScheduleBuilder = naLine(() => import('../scheduling/ScheduleBuilder'));
const Inventory = naLine(() => import('./Inventory'));
const PlanningBoard = naLine(() => import('./PlanningBoard'));
const EventsView = naLine(() => import('./EventsView'));
const ClosingsOverview = naLine(() => import('./ClosingsOverview'));
const OrgOverview = naLine(() => import('./OrgOverview'));
const FinanceView = naLine(() => import('./FinanceView'));
const MenuEditor = naLine(() => import('./MenuEditor'));
const SuggestionsBoard = naLine(() => import('../SuggestionsBoard'));
const TaskManager = naLine(() => import('./TaskManager'));
const RewardsView = naLine(() => import('./RewardsView'));
const Attendance = naLine(() => import('./Attendance'));
const MyShifts = naLine(() => import('../employee/MyShifts'));
const AvailabilitySubmit = naLine(() => import('../scheduling/AvailabilitySubmit'));
const TimeOffRequest = naLine(() => import('../scheduling/TimeOffRequest'));
const TimeOffApprovals = naLine(() => import('../scheduling/TimeOffApprovals'));
const Procedures = naLine(() => import('../procedures/Procedures'));
const ToGoMode = naLine(() => import('./ToGoMode'));
const ClientAdmin = naLine(() => import('../client/ClientAdmin'));
const RecipesView = naLine<import('../inventory/RecipesView').RecipesViewProps>(() => import('../inventory/RecipesView'));


const navItems = [
  { id: 'overview',   label: 'Přehled',    icon: 'overview' },
  { id: 'shifts',     label: 'Rozvrh',     icon: 'calendar' },
  { id: 'inventory',  label: 'Sklad',      icon: 'box' },
  { id: 'recipes',    label: 'Receptury',  icon: 'clipboard' },
  { id: 'procedures', label: 'Postupy',    icon: 'clipboard' },
  { id: 'tasks',      label: 'Úkoly',      icon: 'check' },
  { id: 'chat',       label: 'Chat',       icon: 'chat' }, // mobile dock only
  { id: 'guides',     label: 'Návody',     icon: 'book' },
  { id: 'planning',   label: 'Plánování',  icon: 'kanban' },
  { id: 'reports',    label: 'Uzávěrky',   icon: 'trend' },
  { id: 'finance',    label: 'Finance',    icon: 'coins' },
  { id: 'suggestions',label: 'Nápady',     icon: 'bulb' },
  { id: 'attendance', label: 'Docházka',   icon: 'clock' },
  { id: 'my-shifts',  label: 'Moje směny', icon: 'swap' },
  { id: 'rewards',    label: 'Odměny',     icon: 'award' },
];

// Grouped navigation — the flat list above still drives view lookup, these
// sections just organise it into readable categories in the menus.
const navSections: { title: string | null; ids: string[] }[] = [
  { title: null,           ids: ['overview'] },
  { title: 'Směny',        ids: ['shifts', 'my-shifts', 'attendance'] },
  { title: 'Kasa & sklad', ids: ['reports', 'finance', 'inventory', 'recipes'] },
  { title: 'Práce',        ids: ['tasks', 'procedures', 'planning'] },
  { title: 'Tým',          ids: ['rewards', 'chat', 'guides', 'suggestions'] },
];
const byId = Object.fromEntries(navItems.map(n => [n.id, n]));

const mobilePrimary = ['overview', 'shifts', 'inventory', 'chat'];

// Která oprávnění otevírají který pohled (kolo 67). Stačí kterékoli z
// pole — Rozvrh vidí plánovač i ten, kdo má jen náhled. `null` = pohled
// patří každému členovi: přehled, vlastní směny, osobní nastavení
// (účet, heslo, vzhled mají všichni; záložky podniku uvnitř Nastavení
// hlídá Nastavení samo) a přehled organizace, který se řídí vlastnictvím.
// Vedení má celý katalog, takže se mu nic neschová.
const KLICE_POHLEDU: Record<string, readonly string[] | null> = {
  overview: null, 'my-shifts': null, settings: null, org: null,
  shifts: ['rozvrh.zobrazit', 'rozvrh.nahled'],
  inventory: ['sklad.zobrazit'],
  recipes: ['receptury.zobrazit'],
  procedures: ['postupy.zobrazit'],
  tasks: ['ukoly.zobrazit_tym', 'ukoly.zadavat'],
  guides: ['navody.zobrazit'],
  planning: ['planovani.zobrazit'],
  reports: ['uzaverky.zobrazit_vse'],
  finance: ['finance.zobrazit', 'finance.trzby'],
  suggestions: ['napady.spravovat', 'napady.pridat'],
  attendance: ['dochazka.zobrazit'],
  rewards: ['odmeny.zebricek', 'odmeny.katalog'],
  'team-settings': ['tym.zobrazit'],
  chat: ['chat.pouzivat'],
  menu: ['menu.zobrazit'],
  events: ['akce.zobrazit'],
};
const KLIENT = ['klient.prehled'];
const UCTENKY = ['finance.uctenky_zobrazit', 'finance.uctenky_pridat'];

interface Props {
  user: { name?: string | null; email?: string | null; id?: string; role?: string; avatar?: string; superadmin?: boolean };
}

export default function EmployerLayout({ user }: Props) {
  const { plan } = usePlan();
  const { ma, role, opravneni, nacteno } = useOpravneni();
  const smiPohled = (id: string) => { const k = KLICE_POHLEDU[id]; return k == null || ma(k); };
  const [currentView, setCurrentViewRaw] = useState('overview');
  // Rozepsaná role v Nastavení (editor sedí na stránce, ne v okně): přechod
  // na jiný pohled nebo do jiného režimu ji odmontuje, takže se nejdřív
  // zeptá. Přechod na tentýž pohled nic neodmontuje, ten projde rovnou.
  const straz = useStrazRole();
  const setCurrentView = (v: string) => { if (v === currentView) setCurrentViewRaw(v); else straz.pokus(() => setCurrentViewRaw(v)); };
  // TO GO vs. full administration. Phones default to TO GO (the pocket view);
  // the choice is remembered and the switch is always one tap away.
  const [appMode, setAppMode] = useState<'togo' | 'full' | 'client' | null>(null);
  // Odkaz z oznámení o nové rezervaci otevře rovnou správnou záložku Clientu.
  const [clientTab, setClientTab] = useState<string | undefined>();
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const receiptsModal = useModal(receiptsOpen, () => setReceiptsOpen(false), 'Účtenky');
  useEffect(() => {
    // Odkaz na konkrétní obrazovku má přednost před kapesním režimem. Bez
    // toho notifikace „schvaluje se ti uzávěrka" otevřela na telefonu TO GO
    // a člověk nepochopil, kam se dostal.
    const qs = new URLSearchParams(window.location.search);
    const asked = qs.get('view');
    // Menu a Akce se přestěhovaly do Managero client. Starý odkaz (z oznámení,
    // z checklistu prvních kroků) proto nepadá na Přehled, ale otevře je tam,
    // kde teď bydlí.
    const MOVED: Record<string, string> = { menu: 'menu', events: 'events' };
    if (qs.get('mode') === 'client') { setClientTab(qs.get('tab') ?? undefined); setAppMode('client'); }
    else if (asked && MOVED[asked]) { setClientTab(MOVED[asked]); setAppMode('client'); }
    else if (asked && asked !== 'overview') { setAppMode('full'); }
    else {
      let stored: string | null = null;
      try { stored = localStorage.getItem('managero-app-mode'); } catch { /* ignore */ }
      if (stored === 'togo' || stored === 'full' || stored === 'client') setAppMode(stored);
      else setAppMode(window.innerWidth < 768 ? 'togo' : 'full');
    }
    // Na tabletu sebere rozbalený rail třetinu šířky a obsah se zmáčkne —
    // do 1024 px startuje zúžený.
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }, []);
  const switchMode = (m: 'togo' | 'full' | 'client') => {
    const prepni = () => {
      setAppMode(m);
      try { localStorage.setItem('managero-app-mode', m); } catch { /* ignore */ }
    };
    if (m === appMode) prepni(); else straz.pokus(prepni);
  };
  // A quick-access tile can ask for a specific stock category.
  const [inventoryCat, setInventoryCat] = useState<string | undefined>();
  // Proklik ze skladu do konkrétní receptury: „tahle surovina se používá v
  // Blue Lagoon" → jedno kliknutí a jsi v jeho receptuře.
  const [recipeProduct, setRecipeProduct] = useState<string | undefined>();
  // Proklik do konkrétní konverzace — z dlaždice v TO GO nebo z karty
  // s poslední nepřečtenou zprávou. Bez toho vedl každý proklik jen na
  // seznam a člověk musel vlákno najít znovu sám.
  const [chatConvId, setChatConvId] = useState<number | null>(null);
  // Proklik na KONKRÉTNÍ návod. Odkaz `?view=guides&guide=12` se generoval
  // z receptur už dřív, ale `guide` nikdo nečetl — člověk skončil na seznamu
  // návodů a hledal ten svůj znovu ručně. Teď na něj míří i úkol „Vyrobit X“,
  // takže mrtvý odkaz by byl vidět mnohem víc.
  const [guideId, setGuideId] = useState<number | null>(null);
  // Z přehledu organizace do konkrétního podniku: přepnout členství na
  // serveru a načíst znovu — stejná cesta jako přepínač v hlavičce.
  // Stejná cesta jako v přepínači: koncepty starého podniku pryč, token
  // obnovit, načíst znovu. Chyba se vrací přehledu, ať ji ukáže.
  const { update: obnovRelaci } = useSession();
  const prepniAOtevri = async (teamId: number): Promise<string | null> => {
    try {
      const res = await fetch('/api/teams/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return d?.error || 'Přepnutí se nepodařilo.';
      uklidKonceptu();
      try { await obnovRelaci(); } catch { /* token se obnoví při načtení */ }
      window.location.href = '/employer/overview';
      return null;
    } catch { return 'Nepodařilo se spojit se serverem.'; }
  };
  const navigate = (view: string, arg?: string) => {
    if (view !== currentView) { straz.pokus(() => naviguj(view, arg)); return; }
    naviguj(view, arg);
  };
  const naviguj = (view: string, arg?: string) => {
    setInventoryCat(view === 'inventory' ? arg : undefined);
    setRecipeProduct(view === 'recipes' ? arg : undefined);
    setChatConvId(view === 'chat' && arg ? Number(arg) : null);
    setGuideId(view === 'guides' && arg ? Number(arg) : null);
    // Rada, která říká „nastav to v Nastavení → Pokladna", musí umět
    // otevřít rovnou tu záložku. Bez tohohle vedla do Účtu a člověk
    // hledal dál sám.
    setSettingsTab(view === 'settings' ? arg : undefined);
    setCurrentViewRaw(view);
  };
  // Deep links from notifications and old bookmarks: /employer/overview?view=X
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get('view');
    if (v && (byId[v] || v === 'settings' || v === 'team-settings' || v === 'org')) setCurrentViewRaw(v);
    const g = Number(p.get('guide'));
    if (v === 'guides' && Number.isFinite(g) && g > 0) setGuideId(g);
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Chat byl na telefonu jediná ikona v docku, která nikdy nedala vědět,
  // že něco přišlo. Sklad hlásil „3", Docházka „2", chat mlčel — takže
  // nebyl důvod na něj ťuknout.
  const { conversations: chatConvs } = useConversations();
  const unreadChat = chatConvs.reduce((n, c) => n + (c.unreadCount || 0), 0);
  const [settingsTab, setSettingsTab] = useState<string | undefined>();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const openSettings = () => { setSettingsTab(undefined); setCurrentView('settings'); setAccountOpen(false); setMoreOpen(false); };
  const openTeam = () => { setCurrentView('team-settings'); setAccountOpen(false); setMoreOpen(false); };

  const renderView = () => {
    // Odkaz z oznámení nebo dlaždice může vést na pohled, který role
    // nezahrnuje — poctivý stav místo 403 uvnitř obrazovky.
    if (!smiPohled(currentView)) return <BezOpravneni onZpet={() => setCurrentView('overview')} />;
    switch (currentView) {
      case 'overview':  return <EmployerDashboard user={user as any} onNavigate={navigate} smiPohled={smiPohled} />;
      case 'shifts':    return (
        <div>
          <ScheduleBuilder user={user as any} onNavigate={navigate} />
          {/* Same horizontal rhythm as ScheduleBuilder's p-6 shell, so nothing
              inside the tab looks wider than its neighbour. */}
          <div className="px-6 pb-6 w-full space-y-4">
            <ShiftSwapApprovals />
            <TimeOffApprovals />
          </div>
        </div>
      );
      case 'inventory': return <Inventory user={user as any} initialCategory={inventoryCat} onNavigate={navigate} />;
      case 'menu':      return <div className="px-6 pb-6 w-full max-w-3xl mx-auto"><MenuEditor /></div>;
      case 'recipes':   return <RecipesView openProductId={recipeProduct} onNavigate={navigate} />;
      case 'chat':      return <ChatView user={user as any} openConversationId={chatConvId} />;
      case 'procedures': return <Procedures user={user as any} />;
      case 'guides':    return <Guides user={user as any} openGuideId={guideId} />;
      case 'planning':  return <PlanningBoard />;
      case 'events':    return <EventsView user={user as any} />;
      case 'tasks':     return <TaskManager user={user as any} />;
      case 'rewards':   return <RewardsView user={user as any} />;
      case 'attendance': return <Attendance user={user as any} />;
      case 'my-shifts': return (
        <div className="space-y-2">
          <MyShifts user={user as any} />
          <ShiftSwap user={user as any} />
          {/* Uvnitř Mých směn; `h1` už patří jim. */}
          <AvailabilitySubmit user={user as any} headingLevel="h2" />
          <div className="px-6 pb-6 max-w-3xl mx-auto w-full"><TimeOffRequest /></div>
        </div>
      );
      case 'reports':   return <ClosingsOverview />;
      case 'org':       return <OrgOverview onOpenTeam={prepniAOtevri} />;
      case 'finance':   return <FinanceView />;
      case 'suggestions': return <SuggestionsBoard />;
      case 'settings':  return <Settings user={user as any} initialTab={(settingsTab ?? 'account') as any} />;
      case 'team-settings': return <TeamManagement user={user as any} />;
      default:          return <EmployerDashboard user={user as any} onNavigate={navigate} smiPohled={smiPohled} />;
    }
  };

  const active = navItems.find(n => n.id === currentView);
  const mojeNav = navItems.filter(n => smiPohled(n.id));
  const mojeById = Object.fromEntries(mojeNav.map(n => [n.id, n]));
  const smiKlient = ma(KLIENT);
  const smiTym = smiPohled('team-settings');

  // Navigace pro widgety na ploše (kolo 68, spec §2.6). Jeden kontext kolem
  // všech režimů — plný, TO GO i Managero client — protože tentýž widget se
  // kreslí na Přehledu i v TO GO a proklik z něj musí vést vždycky tam, kam
  // divák smí. Záložky Managero client mají tvar 'klient:<záložka>', TO GO
  // 'togo' (lib/widgety/typy, DefiniceStranky.pohled).
  const navigujZWidgetu = (pohled: string, arg?: string) => {
    if (pohled.startsWith('klient:')) { setClientTab(pohled.slice('klient:'.length) || undefined); switchMode('client'); return; }
    if (pohled === 'togo') { switchMode('togo'); return; }
    if (appMode !== 'full') switchMode('full');
    navigate(pohled, arg);
  };
  // Jen pohledy, které layout opravdu zná: smiPohled pro neznámé id vrací ano
  // (null = každý) a widget by pak ukázal odkaz, který vede na Přehled.
  const smiPohledZWidgetu = (pohled: string) =>
    pohled.startsWith('klient:') ? smiKlient
      : pohled === 'togo' ? true
      : (byId[pohled] != null || pohled in KLICE_POHLEDU) && smiPohled(pohled);
  const navigaceWidgetu = useHodnotaNavigace(navigujZWidgetu, smiPohledZWidgetu, mojeNav, [opravneni, nacteno, appMode]);
  const title = currentView === 'settings' ? 'Nastavení'
    : currentView === 'team-settings' ? 'Nastavení týmu'
    : currentView === 'org' ? 'Všechny podniky'
    : active?.label;
  const mobileSecondary = mojeNav.filter(n => !mobilePrimary.includes(n.id));
  // Same categories as the sidebar, minus whatever is already in the bottom dock.
  const mobileGroups = navSections
    .map(sec => ({ title: sec.title, items: sec.ids.map(id => mojeById[id]).filter(n => n && !mobilePrimary.includes(n.id)) }))
    .filter(g => g.items.length);

  const AccountMenu = () => (
    <div className="glass-strong rounded-2xl p-1.5 shadow-[0_14px_40px_rgba(25,35,15,0.16)] pop-in origin-bottom">
      <button onClick={openSettings} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-black/70 hover:text-black hover:bg-black/[0.05] transition-colors">
        <Icon name="settings" size={18} /> Nastavení
      </button>
      {smiTym && (
        <button onClick={openTeam} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-black/70 hover:text-black hover:bg-black/[0.05] transition-colors">
          <Icon name="users" size={18} /> Nastavení týmu
        </button>
      )}
      <div className="h-px bg-black/[0.06] my-1" />
      {smiKlient && (
        <button onClick={() => { setAccountOpen(false); switchMode('client'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#16181A] hover:bg-black/[0.05] transition-colors">
          <Icon name="gift" size={18} /> Managero client
        </button>
      )}
      <button onClick={() => signOut({ callbackUrl: '/login' })} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-bad-ink hover:bg-bad/[0.06] transition-colors">
        <Icon name="logout" size={18} /> Odhlásit se
      </button>
    </div>
  );

  if (appMode === 'client' && !smiKlient) {
    // Uložený režim z doby, kdy člověk měl jinou roli (nebo odkaz
    // ?mode=client) — ne bílá obrazovka, ale vysvětlení a cesta zpět.
    return (
      <NavigaceKontext.Provider value={navigaceWidgetu}>
        <BezOpravneni co="Managero client (hosté, rezervace, věrnost)" onZpet={() => switchMode('full')} />
      </NavigaceKontext.Provider>
    );
  }
  if (appMode === 'client') {
    return (
      <NavigaceKontext.Provider value={navigaceWidgetu}>
        <MaxGate feature="Managero client" benefit="Věrnost, rezervace a objednávky od stolu pro vaše hosty patří do plánu Max.">
          <ProfileLinkProvider>
            <ClientAdmin onExit={() => switchMode('full')} initialTab={clientTab} user={user as any} />
          </ProfileLinkProvider>
        </MaxGate>
      </NavigaceKontext.Provider>
    );
  }

  if (appMode === 'togo') {
    return (
      <NavigaceKontext.Provider value={navigaceWidgetu}>
        <ProfileLinkProvider>
          <ToGoMode
            user={user as any}
            onExit={() => switchMode('full')}
            onOpenView={(v, arg) => { switchMode('full'); navigate(v, arg); }}
            smiPohled={smiPohled}
          />
        </ProfileLinkProvider>
      </NavigaceKontext.Provider>
    );
  }

  return (
    <NavigaceKontext.Provider value={navigaceWidgetu}>
    <ProfileLinkProvider>
    <div className="flex h-[100dvh] overflow-hidden">
      <DiscardGuard guard={straz.guard} what={CO_SE_ZAHODI_ROLE} />
      {/* Desktop sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-[76px]'} glass-strong hidden md:flex m-4 mr-0 rounded-3xl text-[#16181A] flex-col transition-[width] duration-300 flex-shrink-0`}>
        <div className={`flex items-center gap-3 py-3.5 border-b border-black/[0.07] ${sidebarOpen ? 'px-5' : 'px-0 justify-center'}`}>
          <LogoMark size={40} />
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm leading-tight tracking-tight">Managero</p>
              <p className="t-label text-black/40 mt-0.5">Správa podniku</p>
            </div>
          )}
        </div>
        {/* Který podnik právě spravuju. Do kola 55 tu název podniku nebyl
            vůbec — s jedním to nevadilo, s třemi je to první otázka. */}
        <div className={`border-b border-black/[0.07] ${sidebarOpen ? 'px-2 py-1.5' : 'px-1 py-1.5'}`}>
          <PodnikSwitcher compact={!sidebarOpen} canCreate onOverview={() => setCurrentView('org')} />
        </div>
        {/* Šestnáct položek se na notebooku s 900 px na výšku nevejde. Dřív se
            poslední („Nápady") prostě uřízla a nic nenaznačilo, že se rail
            roluje — tak se na ni nikdo nedostal. Teď je odsazení těsnější a
            pod seznamem je měkký přechod, který přiznává, že pokračuje. */}
        <div className="flex-1 min-h-0 relative">
        <nav className="h-full py-1.5 space-y-px px-3 overflow-y-auto scrollbar-thin">
          {navSections.map((sec, si) => {
            // Chat lives in the Messenger dock on desktop, so drop it here.
            const items = sec.ids.map(id => mojeById[id]).filter(n => n && n.id !== 'chat');
            if (!items.length) return null;
            return (
              <div key={sec.title ?? 'top'} className={si > 0 ? 'pt-1.5' : ''}>
                {sec.title && (sidebarOpen
                  // Štítek skupiny jako všude jinde (t-label), ne ručně psaný (audit kola 68, rám).
                  ? <p className="t-label px-3.5 pb-0.5">{sec.title}</p>
                  : <div className="mx-3 mb-1.5 h-px bg-black/[0.07]" />
                )}
                <div className="space-y-px">
                  {items.map(item => (
                    <button key={item.id} onClick={() => setCurrentView(item.id)} title={item.label}
                      className={`w-full flex items-center gap-3 py-2 rounded-2xl text-sm font-medium transition duration-200 ${sidebarOpen ? 'px-3.5' : 'px-0 justify-center'} ${
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
        <div className="nav-fade" aria-hidden="true" />
        </div>
        <div className="p-2.5 border-t border-black/[0.07] relative">
          {accountOpen && (
            <div className="absolute left-3 right-3 bottom-full mb-2"><AccountMenu /></div>
          )}
          <button onClick={() => setAccountOpen(v => !v)} title="Účet"
            className={`w-full flex items-center gap-3 rounded-2xl transition-colors ${accountOpen ? 'bg-black/[0.06]' : 'bg-black/[0.04] hover:bg-black/[0.05]'} ${sidebarOpen ? 'p-2' : 'p-2 justify-center'}`}>
            <Avatar emoji={user.avatar} size="md" />
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate">{user.name}</p>
                  {/* Vedení a vlastník vidí totéž co dřív; jiná role vedení
                      (Provozní, Účetní…) ukáže svůj název — ať je jasné,
                      proč v navigaci něco chybí. */}
                  <p className="text-[11px] text-black/45 truncate">{role && !role.jeVlastnik && role.klic !== 'vedeni' ? role.nazev : 'Zaměstnavatel'}</p>
                </div>
                <Icon name="chevron" size={16} className={`text-black/40 transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Na 320px byla tahle hlavička nejtěsnější místo v aplikaci: 48 px
            odsazení, značka, dvě ikony a nápis TO GO se šálkem nechaly na název
            obrazovky 29 pixelů, takže z „Nastavení týmu" zbyla jedna tečka.
            Odsazení a mezery se na telefonu zmenšily a TO GO je tam jen
            ikona — název stránky má přednost před vším ostatním. */}
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
          {/* Přepínač podniků byl jen v bočním pásu, který na telefonu není —
              majitel tří podniků se na mobilu nepřepnul a „Všechny podniky"
              nenašel. S jedním podnikem se nic nekreslí. */}
          <div className="md:hidden shrink-0"><PodnikSwitcher compact canCreate jenPrepinani onOverview={() => setCurrentView('org')} /></div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-[#16181A] text-lg tracking-tight truncate">{title}</h2>
          </div>
          {ma(UCTENKY) && (
          <button onClick={() => setReceiptsOpen(true)} title="Účtenky" aria-label="Účtenky"
            className="tap-target-sm shrink-0 rounded-full p-2 text-black/45 hover:text-black hover:bg-black/[0.05] transition-colors">
            <Icon name="receipt" size={20} />
          </button>
          )}
          {smiKlient && (
          <button onClick={() => switchMode('client')} title="Managero client: hosté, rezervace, věrnost" aria-label="Přepnout do Managero client"
            className="tap-target shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#16181A]/[0.06] border border-black/10 text-[#16181A] px-2.5 sm:px-3 py-1.5 text-xs font-bold hover:bg-[#16181A]/[0.1] transition whitespace-nowrap">
            <Icon name="gift" size={15} className="shrink-0" /><span className="hidden sm:inline">Client</span>
          </button>
          )}
          <button onClick={() => switchMode('togo')} title="Přepnout do TO GO režimu" aria-label="Přepnout do TO GO režimu"
            className="tap-target shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#C8F542]/25 border border-[#C8F542]/40 text-[#5B7A08] px-2.5 sm:px-3 py-1.5 text-xs font-bold hover:bg-[#C8F542]/40 transition whitespace-nowrap">
            <Icon name="cup" size={15} className="shrink-0" /><span className="hidden sm:inline">TO GO</span>
          </button>
          <NotificationBell />
        </header>

        {plan?.pastDue ? (
          <button onClick={() => setCurrentView('settings')}
            className="mx-4 mt-3 note note-danger text-left font-medium hover:brightness-95 transition">
            <Icon name="warning" size={15} className="inline -mt-0.5 mr-1.5" />Platba předplatného se nezdařila.{' '}
            <button type="button" onClick={() => navigate('settings', 'billing')}
              className="tap-target-sm font-semibold underline underline-offset-2 hover:no-underline">
              Zkontrolovat kartu
            </button>
          </button>
        ) : plan?.trialing ? (
          <button onClick={() => setCurrentView('settings')}
            className="mx-4 mt-3 rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/35 px-4 py-2.5 text-sm text-left text-[#5B7A08] font-medium hover:bg-[#C8F542]/25 transition">
            <Icon name="sparkle" size={15} className="inline -mt-0.5 mr-1.5" />
            {plan.subscriptionStatus === 'trialing'
              ? `Zkoušíte ${plan.effective === 'max' ? 'Max' : 'Pro'} — zbývá ${czDays(plan.trialDaysLeft)}, potom se strhne první platba.`
              : `Zkoušíte Pro — zbývá ${czDays(plan.trialDaysLeft)}. Kliknutím zjistíte, co zůstane ve Zdarma.`}
          </button>
        ) : plan && plan.effective === 'free' && !plan.hadSubscription ? (
          <button onClick={() => setCurrentView('settings')}
            className="mx-4 mt-3 rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/35 px-4 py-2.5 text-sm text-left text-[#5B7A08] font-medium hover:bg-[#C8F542]/25 transition">
            <Icon name="sparkle" size={15} className="inline -mt-0.5 mr-1.5" />Vyzkoušejte Pro 30 dní zdarma — neomezený tým, kiosk, odměny a přehledy. Karta se strhne až po měsíci.
          </button>
        ) : null}
        <main className={`flex-1 ${currentView === 'chat'
            // Chat se na telefonu nescrolluje, takže odsazení pro dok
            // jen ukusovalo z plochy na zprávy: z 844px displeje zbývalo
            // na vlákno 467, a pod psacím polem bylo 80px prázdna.
            ? 'pb-[84px] md:pb-4 overflow-hidden flex flex-col mx-2 my-2 md:m-4 glass rounded-3xl'
            : 'pb-36 md:pb-4 overflow-y-auto scrollbar-thin'}`}>
          {currentView === 'chat' ? (
            <ErrorBoundary resetKey={currentView} title={`${title ?? 'Tahle část'} se nenačetla`}>{renderView()}</ErrorBoundary>
          ) : (
            <div className="mx-auto w-full max-w-7xl">
              <ErrorBoundary resetKey={currentView} title={`${title ?? 'Tahle část'} se nenačetla`}>{renderView()}</ErrorBoundary>
            </div>
          )}
        </main>
      </div>

      {/* Na obrazovce Chatu plovoucí tlačítko nedává smysl — otevírá
          přesně to, co má člověk otevřené pod ním. */}
      {currentView !== 'chat' && ma(KLICE_POHLEDU.chat!) && <MessengerDock user={user as any} />}

      {/* Mobile bottom dock */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <nav className="dock-strong mx-auto max-w-md rounded-3xl px-2 py-2 flex items-center justify-around shadow-[0_10px_34px_rgba(25,35,15,0.16)]">
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
              <span className={`text-[11px] leading-none font-medium ${currentView === item.id ? 'text-[#16181A]' : 'text-black/40'}`}>{item.label}</span>
            </button>
          ))}
          <button onClick={() => setMoreOpen(v => !v)} title="Více"
            className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition duration-200 ${moreOpen || currentView === 'settings' || currentView === 'team-settings' || mobileSecondary.some(n => n.id === currentView) ? 'text-[#16181A]' : 'text-black/40'}`}>
            <Icon name="menu" size={22} />
            <span className="text-[11px] leading-none font-medium">Více</span>
          </button>
        </nav>

      </div>

      {receiptsOpen && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-0 sm:p-4" onClick={() => setReceiptsOpen(false)}>
          <div ref={receiptsModal.ref} {...receiptsModal.dialogProps} className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 scrollbar-thin" onClick={e => e.stopPropagation()}>
            <DiscardGuard guard={receiptsModal.guard} />
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="t-card flex items-center gap-2">
                <Icon name="receipt" size={20} className="text-[#5B7A08]" /> Účtenky
              </h3>
              <button aria-label="Zavřít" onClick={() => setReceiptsOpen(false)} className="btn-icon"><Icon name="close" size={15} /></button>
            </div>
            <ReceiptsPanel />
          </div>
        </div>
      )}

      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        groups={mobileGroups}
        activeId={currentView}
        onSelect={setCurrentView}
        actions={[
          { label: 'Nastavení', icon: 'settings', onClick: openSettings },
          ...(smiTym ? [{ label: 'Nastavení týmu', icon: 'users', onClick: openTeam }] : []),
          // Správce platformy podle prostředí (SUPERADMIN_USER_IDS), ne podle role.
          ...(user.superadmin ? [{ label: 'Správa platformy', icon: 'lock', onClick: () => { window.location.assign('/admin'); } }] : []),
          ...(smiKlient ? [{ label: 'Managero client', icon: 'gift', onClick: () => { setMoreOpen(false); switchMode('client'); } }] : []),
          { label: 'Odhlásit se', icon: 'logout', onClick: () => signOut({ callbackUrl: '/login' }), danger: true },
        ]}
      />
    </div>
    </ProfileLinkProvider>
    </NavigaceKontext.Provider>
  );
}
