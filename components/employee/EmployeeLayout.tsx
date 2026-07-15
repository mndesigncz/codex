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
      <aside className={`${sidebarOpen ? 'w-64' : 'w-[76px]'} glass-strong hidden md:flex m-4 mr-0 rounded-[28px] text-[#16181A] flex-col transition-all duration-300 flex-shrink-0 overflow-hidden`}>
        <div className={`flex items-center gap-3 py-5 border-b border-black/[0.07] ${sidebarOpen ? 'px-5' : 'px-0 justify-center'}`}>
          <LogoMark size={40} />
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm leading-tight tracking-tight">Čajovna Zelená</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-black/40 mt-0.5">Portál zaměstnance</p>
            </div>
          )}
        </div>
        <nav className="flex-1 py-4 space-y-1 px-3 overflow-y-auto scrollbar-thin">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setCurrentView(item.id)} title={item.label}
              className={`w-full flex items-center gap-3 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 ${sidebarOpen ? 'px-3.5' : 'px-0 justify-center'} ${
                currentView === item.id ? 'bg-[#16181A] text-white shadow-sm' : 'text-black/55 hover:text-black hover:bg-black/[0.05]'
              }`}>
              <Icon name={item.icon} size={21} className="flex-shrink-0" />
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-black/[0.07]">
          {sidebarOpen ? (
            <div className="flex items-center gap-1 p-1.5 rounded-2xl bg-black/[0.04]">
              <button onClick={() => setCurrentView('settings')} title="Účet a nastavení" className="flex items-center gap-3 flex-1 min-w-0 p-1.5 rounded-xl hover:bg-black/[0.05] transition-colors">
              <span className="text-xl flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 bg-black/[0.05]">{user.avatar ?? '👤'}</span>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold truncate">{user.name}</p>
                <p className="text-[11px] text-black/45">{user.jobTitle ?? 'Barista'}</p>
              </div>
              </button>
              <button onClick={() => signOut({ callbackUrl: '/login' })} title="Odhlásit se" className="rounded-full p-2 text-black/40 hover:text-black hover:bg-black/[0.06] transition-colors">
                <Icon name="logout" size={18} />
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <button onClick={() => setCurrentView('settings')} title="Účet a nastavení" className="w-full flex justify-center p-2.5 rounded-2xl text-black/40 hover:text-black hover:bg-black/[0.05] transition-colors"><span className="text-lg">{user.avatar ?? '👤'}</span></button>
              <button onClick={() => signOut({ callbackUrl: '/login' })} title="Odhlásit se" className="w-full flex justify-center p-2.5 rounded-2xl text-black/40 hover:text-black hover:bg-black/[0.05] transition-colors">
                <Icon name="logout" size={20} />
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="px-6 pt-5 pb-1 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => setSidebarOpen(v => !v)} className="hidden md:flex rounded-full p-2 text-black/45 hover:text-black hover:bg-black/[0.05] transition-colors">
            <Icon name="menu" size={20} />
          </button>
          <div className="md:hidden"><LogoMark size={36} /></div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-[#16181A] text-lg tracking-tight truncate">{active?.label}</h2>
          </div>
          <NotificationBell />
        </header>

        <main className={`flex-1 pb-28 md:pb-4 ${currentView === 'chat' ? 'overflow-hidden flex flex-col m-4 mt-4 glass rounded-[28px]' : 'overflow-y-auto scrollbar-thin'}`}>
          {renderView()}
        </main>
      </div>

      <MessengerDock user={user as any} />

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
            className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition-all duration-200 ${isSecondaryActive || moreOpen ? 'text-[#16181A]' : 'text-black/40'}`}>
            <Icon name="menu" size={22} strokeWidth={isSecondaryActive || moreOpen ? 2 : 1.7} />
            <span className={`h-1 w-1 rounded-full transition-all ${isSecondaryActive ? 'bg-[#C8F542]' : 'bg-transparent'}`} />
          </button>
        </nav>

        {moreOpen && (
          <div className="glass-strong mx-auto max-w-md rounded-3xl mb-2 p-2 absolute bottom-full left-4 right-4 grid grid-cols-2 gap-1">
            {mobileSecondary.map(item => (
              <button key={item.id} onClick={() => { setCurrentView(item.id); setMoreOpen(false); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${currentView === item.id ? 'bg-[#16181A] text-white' : 'text-black/60 hover:text-black hover:bg-black/[0.05]'}`}>
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
