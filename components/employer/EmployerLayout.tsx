'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { Icon, LogoMark } from '../Icons';
import NotificationBell from '../NotificationBell';
import ChatView from '../chat/ChatView';
import MessengerDock from '../chat/MessengerDock';
import Guides from '../Guides';
import Settings from '../Settings';
import TeamManagement from '../TeamManagement';
import EmployerDashboard from './EmployerDashboard';
import ScheduleBuilder from '../scheduling/ScheduleBuilder';
import Inventory from './Inventory';
import PlanningBoard from './PlanningBoard';
import DailyReports from './DailyReports';
import Procedures from '../procedures/Procedures';

const navItems = [
  { id: 'overview',   label: 'Přehled',    icon: 'overview' },
  { id: 'shifts',     label: 'Rozvrh',     icon: 'calendar' },
  { id: 'inventory',  label: 'Sklad',      icon: 'box' },
  { id: 'procedures', label: 'Postupy',    icon: 'clipboard' },
  { id: 'chat',       label: 'Chat',       icon: 'chat' }, // mobile dock only
  { id: 'guides',     label: 'Návody',     icon: 'book' },
  { id: 'planning',   label: 'Plánování',  icon: 'kanban' },
  { id: 'reports',    label: 'Zprávy',     icon: 'trend' },
];

const mobilePrimary = ['overview', 'shifts', 'inventory', 'chat'];

interface Props {
  user: { name?: string | null; email?: string | null; id?: string; role?: string; avatar?: string };
}

export default function EmployerLayout({ user }: Props) {
  const [currentView, setCurrentView] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const openSettings = () => { setCurrentView('settings'); setAccountOpen(false); setMoreOpen(false); };
  const openTeam = () => { setCurrentView('team-settings'); setAccountOpen(false); setMoreOpen(false); };

  const renderView = () => {
    switch (currentView) {
      case 'overview':  return <EmployerDashboard user={user as any} onNavigate={setCurrentView} />;
      case 'shifts':    return <ScheduleBuilder user={user as any} />;
      case 'inventory': return <Inventory user={user as any} />;
      case 'chat':      return <ChatView user={user as any} />;
      case 'procedures': return <Procedures user={user as any} />;
      case 'guides':    return <Guides user={user as any} />;
      case 'planning':  return <PlanningBoard />;
      case 'reports':   return <DailyReports />;
      case 'settings':  return <Settings user={user as any} initialTab="account" />;
      case 'team-settings': return <TeamManagement user={user as any} />;
      default:          return <EmployerDashboard user={user as any} onNavigate={setCurrentView} />;
    }
  };

  const active = navItems.find(n => n.id === currentView);
  const title = currentView === 'settings' ? 'Nastavení'
    : currentView === 'team-settings' ? 'Nastavení týmu'
    : active?.label;
  const mobileSecondary = navItems.filter(n => !mobilePrimary.includes(n.id));

  const AccountMenu = () => (
    <div className="glass rounded-2xl p-1.5 shadow-[0_10px_30px_rgba(25,35,15,0.14)]">
      <button onClick={openSettings} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-black/70 hover:text-black hover:bg-black/[0.05] transition-colors">
        <Icon name="settings" size={18} /> Nastavení
      </button>
      <button onClick={openTeam} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-black/70 hover:text-black hover:bg-black/[0.05] transition-colors">
        <Icon name="users" size={18} /> Nastavení týmu
      </button>
      <div className="h-px bg-black/[0.06] my-1" />
      <button onClick={() => signOut({ callbackUrl: '/login' })} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-500/[0.06] transition-colors">
        <Icon name="logout" size={18} /> Odhlásit se
      </button>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-[76px]'} glass-strong hidden md:flex m-4 mr-0 rounded-[28px] text-[#16181A] flex-col transition-all duration-300 flex-shrink-0`}>
        <div className={`flex items-center gap-3 py-5 border-b border-black/[0.07] ${sidebarOpen ? 'px-5' : 'px-0 justify-center'}`}>
          <LogoMark size={40} />
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm leading-tight tracking-tight">Pangea</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-black/40 mt-0.5">Správa podniku</p>
            </div>
          )}
        </div>
        <nav className="flex-1 py-4 space-y-1 px-3 overflow-y-auto scrollbar-thin">
          {navItems.filter(n => n.id !== 'chat').map(item => (
            <button key={item.id} onClick={() => setCurrentView(item.id)} title={item.label}
              className={`w-full flex items-center gap-3 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 ${sidebarOpen ? 'px-3.5' : 'px-0 justify-center'} ${
                currentView === item.id ? 'bg-[#16181A] text-white shadow-sm' : 'text-black/55 hover:text-black hover:bg-black/[0.05]'
              }`}>
              <Icon name={item.icon} size={21} className="flex-shrink-0" />
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-black/[0.07] relative">
          {accountOpen && (
            <div className="absolute left-3 right-3 bottom-full mb-2"><AccountMenu /></div>
          )}
          <button onClick={() => setAccountOpen(v => !v)} title="Účet"
            className={`w-full flex items-center gap-3 rounded-2xl transition-colors ${accountOpen ? 'bg-black/[0.06]' : 'bg-black/[0.04] hover:bg-black/[0.05]'} ${sidebarOpen ? 'p-2' : 'p-2 justify-center'}`}>
            <span className="text-xl flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60">{user.avatar ?? '👤'}</span>
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate">{user.name}</p>
                  <p className="text-[11px] text-black/45">Zaměstnavatel</p>
                </div>
                <Icon name="chevron" size={16} className={`text-black/40 transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="px-6 pt-5 pb-1 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => setSidebarOpen(v => !v)} className="hidden md:flex rounded-full p-2 text-black/45 hover:text-black hover:bg-black/[0.05] transition-colors">
            <Icon name="menu" size={20} />
          </button>
          <div className="md:hidden"><LogoMark size={36} /></div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-[#16181A] text-lg tracking-tight truncate">{title}</h2>
          </div>
          <NotificationBell />
        </header>

        <main className={`flex-1 pb-28 md:pb-4 ${currentView === 'chat' ? 'overflow-hidden flex flex-col m-4 mt-4 glass rounded-[28px]' : 'overflow-y-auto scrollbar-thin'}`}>
          {renderView()}
        </main>
      </div>

      <MessengerDock user={user as any} />

      {/* Mobile bottom dock */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <nav className="glass-strong mx-auto max-w-md rounded-[26px] px-2 py-2 flex items-center justify-around shadow-[0_10px_34px_rgba(25,35,15,0.16)]">
          {navItems.filter(n => mobilePrimary.includes(n.id)).map(item => (
            <button key={item.id} onClick={() => { setCurrentView(item.id); setMoreOpen(false); }} title={item.label}
              className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition-all duration-200 ${currentView === item.id ? 'text-[#16181A]' : 'text-black/40'}`}>
              <Icon name={item.icon} size={22} strokeWidth={currentView === item.id ? 2 : 1.7} />
              <span className={`h-1 w-1 rounded-full transition-all ${currentView === item.id ? 'bg-[#C8F542]' : 'bg-transparent'}`} />
            </button>
          ))}
          <button onClick={() => setMoreOpen(v => !v)} title="Více"
            className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition-all duration-200 ${moreOpen || currentView === 'settings' || currentView === 'team-settings' || mobileSecondary.some(n => n.id === currentView) ? 'text-[#16181A]' : 'text-black/40'}`}>
            <Icon name="menu" size={22} />
            <span className="h-1 w-1 rounded-full bg-transparent" />
          </button>
        </nav>

        {moreOpen && (
          <div className="glass-strong mx-auto max-w-md rounded-3xl mb-2 p-2 absolute bottom-full left-4 right-4 grid grid-cols-2 gap-1">
            {mobileSecondary.map(item => (
              <button key={item.id} onClick={() => { setCurrentView(item.id); setMoreOpen(false); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${currentView === item.id ? 'bg-[#16181A] text-white' : 'text-black/60 hover:text-black hover:bg-black/[0.05]'}`}>
                <Icon name={item.icon} size={20} /> {item.label}
              </button>
            ))}
            <button onClick={openSettings} className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-black/60 hover:text-black hover:bg-black/[0.05]">
              <Icon name="settings" size={20} /> Nastavení
            </button>
            <button onClick={openTeam} className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-black/60 hover:text-black hover:bg-black/[0.05]">
              <Icon name="users" size={20} /> Nastavení týmu
            </button>
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="col-span-2 flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-red-600 hover:bg-red-500/[0.06]">
              <Icon name="logout" size={20} /> Odhlásit se
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
