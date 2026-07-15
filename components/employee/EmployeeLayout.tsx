'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { Icon, LogoMark } from '../Icons';
import NotificationBell from '../NotificationBell';
import ChatView from '../chat/ChatView';
import MessengerDock from '../chat/MessengerDock';
import Guides from '../Guides';
import Settings from '../Settings';
import EmployeeDashboard from './EmployeeDashboard';
import MyShifts from './MyShifts';
import AvailabilitySubmit from '../scheduling/AvailabilitySubmit';
import InventoryReport from './InventoryReport';
import Tasks from './Tasks';

const navItems = [
  { id: 'home',        label: 'Přehled',    icon: 'overview' },
  { id: 'my-shifts',   label: 'Směny',      icon: 'calendar' },
  { id: 'availability',label: 'Dostupnost', icon: 'swap' },
  { id: 'inventory',   label: 'Sklad',      icon: 'box' },
  { id: 'tasks',       label: 'Úkoly',      icon: 'check' },
  { id: 'chat',        label: 'Chat',       icon: 'chat' },
  { id: 'guides',      label: 'Návody',     icon: 'book' },
  { id: 'settings',    label: 'Nastavení',  icon: 'settings' },
];

const mobilePrimary = ['home', 'my-shifts', 'inventory', 'chat'];

interface Props {
  user: { name?: string | null; email?: string | null; id?: string; role?: string; avatar?: string; jobTitle?: string };
}

export default function EmployeeLayout({ user }: Props) {
  const [currentView, setCurrentView] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  const renderView = () => {
    switch (currentView) {
      case 'home':         return <EmployeeDashboard user={user as any} onNavigate={setCurrentView} />;
      case 'my-shifts':    return <MyShifts user={user as any} />;
      case 'availability': return <AvailabilitySubmit user={user as any} />;
      case 'inventory':    return <InventoryReport user={user as any} />;
      case 'tasks':        return <Tasks user={user as any} />;
      case 'chat':         return <ChatView user={user as any} />;
      case 'guides':       return <Guides user={user as any} />;
      case 'settings':     return <Settings user={user as any} />;
      default:             return <EmployeeDashboard user={user as any} onNavigate={setCurrentView} />;
    }
  };

  const active = navItems.find(n => n.id === currentView);
  const mobileSecondary = navItems.filter(n => !mobilePrimary.includes(n.id));
  const isSecondaryActive = mobileSecondary.some(n => n.id === currentView);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-[76px]'} panel-dark hidden md:flex m-4 mr-0 rounded-[28px] text-white flex-col transition-all duration-300 flex-shrink-0 overflow-hidden`}>
        <div className={`flex items-center gap-3 py-5 border-b border-white/[0.08] ${sidebarOpen ? 'px-5' : 'px-0 justify-center'}`}>
          <LogoMark size={40} />
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm leading-tight tracking-tight">Čajovna Zelená</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/35 mt-0.5">Portál zaměstnance</p>
            </div>
          )}
        </div>
        <nav className="flex-1 py-4 space-y-1 px-3 overflow-y-auto scrollbar-thin">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setCurrentView(item.id)} title={item.label}
              className={`w-full flex items-center gap-3 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 ${sidebarOpen ? 'px-3.5' : 'px-0 justify-center'} ${
                currentView === item.id ? 'bg-[#C8F542]/12 text-[#C8F542]' : 'text-white/45 hover:text-white hover:bg-white/[0.05]'
              }`}>
              <Icon name={item.icon} size={21} className="flex-shrink-0" />
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/[0.08]">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.05]">
              <span className="text-xl flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ring-1 ring-white/15 bg-white/[0.08]">{user.avatar ?? '👤'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{user.name}</p>
                <p className="text-[11px] text-white/40">{user.jobTitle ?? 'Barista'}</p>
              </div>
              <button onClick={() => signOut({ callbackUrl: '/login' })} title="Odhlásit se" className="rounded-full p-2 text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors">
                <Icon name="logout" size={18} />
              </button>
            </div>
          ) : (
            <button onClick={() => signOut({ callbackUrl: '/login' })} title="Odhlásit se" className="w-full flex justify-center p-2.5 rounded-2xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors">
              <Icon name="logout" size={20} />
            </button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="panel-dark m-4 mb-0 rounded-[28px] px-5 py-3.5 flex items-center gap-4 flex-shrink-0">
          <button onClick={() => setSidebarOpen(v => !v)} className="hidden md:flex rounded-full p-2 text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors">
            <Icon name="menu" size={20} />
          </button>
          <div className="md:hidden"><LogoMark size={36} /></div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-white text-lg tracking-tight truncate">{active?.label}</h2>
          </div>
          <NotificationBell />
          <button onClick={() => setCurrentView('settings')} className="flex items-center gap-2.5" title="Nastavení účtu">
            <span className="text-xl flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-white/15 bg-white/[0.08]">{user.avatar ?? '👤'}</span>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-semibold text-white leading-tight">{user.name}</p>
              <p className="text-[11px] text-white/40">{user.jobTitle ?? 'Barista'}</p>
            </div>
          </button>
        </header>

        <main className={`flex-1 pb-28 md:pb-4 ${currentView === 'chat' ? 'overflow-hidden flex flex-col m-4 mt-4 glass rounded-[28px]' : 'overflow-y-auto scrollbar-thin'}`}>
          {renderView()}
        </main>
      </div>

      <MessengerDock user={user as any} />

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <nav className="panel-dark mx-auto max-w-md rounded-[26px] px-2 py-2 flex items-center justify-around shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          {navItems.filter(n => mobilePrimary.includes(n.id)).map(item => (
            <button key={item.id} onClick={() => { setCurrentView(item.id); setMoreOpen(false); }} title={item.label}
              className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition-all duration-200 ${currentView === item.id ? 'text-[#C8F542]' : 'text-white/40'}`}>
              <Icon name={item.icon} size={22} strokeWidth={currentView === item.id ? 2 : 1.7} />
              <span className={`h-1 w-1 rounded-full transition-all ${currentView === item.id ? 'bg-[#C8F542]' : 'bg-transparent'}`} />
            </button>
          ))}
          <button onClick={() => setMoreOpen(v => !v)} title="Více"
            className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition-all duration-200 ${isSecondaryActive || moreOpen ? 'text-[#C8F542]' : 'text-white/40'}`}>
            <Icon name="menu" size={22} strokeWidth={isSecondaryActive || moreOpen ? 2 : 1.7} />
            <span className={`h-1 w-1 rounded-full transition-all ${isSecondaryActive ? 'bg-[#C8F542]' : 'bg-transparent'}`} />
          </button>
        </nav>

        {moreOpen && (
          <div className="panel-dark mx-auto max-w-md rounded-3xl mb-2 p-2 absolute bottom-full left-4 right-4 grid grid-cols-2 gap-1">
            {mobileSecondary.map(item => (
              <button key={item.id} onClick={() => { setCurrentView(item.id); setMoreOpen(false); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${currentView === item.id ? 'bg-[#C8F542]/12 text-[#C8F542]' : 'text-white/60 hover:text-white hover:bg-white/[0.05]'}`}>
                <Icon name={item.icon} size={20} />
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
