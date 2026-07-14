'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import Overview from './Overview';
import ShiftManagement from './ShiftManagement';
import Inventory from './Inventory';
import Team from './Team';
import EmployerChat from './EmployerChat';
import PlanningBoard from './PlanningBoard';
import Recipes from './Recipes';
import DailyReports from './DailyReports';

const navItems = [
  { id: 'overview',  label: 'Přehled',    icon: '📊' },
  { id: 'shifts',    label: 'Směny',      icon: '📅' },
  { id: 'inventory', label: 'Sklad',      icon: '📦' },
  { id: 'team',      label: 'Tým',        icon: '👥' },
  { id: 'chat',      label: 'Chat',       icon: '💬' },
  { id: 'planning',  label: 'Plánování',  icon: '🗂️' },
  { id: 'recipes',   label: 'Recepty',    icon: '📋' },
  { id: 'reports',   label: 'Zprávy',     icon: '📈' },
];

interface Props {
  user: { name?: string | null; email?: string | null; role?: string; avatar?: string };
}

export default function EmployerLayout({ user }: Props) {
  const [currentView, setCurrentView] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const renderView = () => {
    switch (currentView) {
      case 'overview':  return <Overview onNavigate={setCurrentView} />;
      case 'shifts':    return <ShiftManagement />;
      case 'inventory': return <Inventory />;
      case 'team':      return <Team />;
      case 'chat':      return <EmployerChat user={user} />;
      case 'planning':  return <PlanningBoard />;
      case 'recipes':   return <Recipes />;
      case 'reports':   return <DailyReports />;
      default:          return <Overview onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — floating glass rail */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} glass-strong hidden md:flex m-4 mr-0 rounded-3xl text-white flex-col transition-all duration-300 flex-shrink-0 overflow-hidden`}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/[0.08]">
          <span className="text-2xl flex-shrink-0">🍵</span>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm leading-tight tracking-tight">Čajovna Zelená</p>
              <p className="text-xs uppercase tracking-wider text-white/40">Správa čajovny</p>
            </div>
          )}
        </div>
        <nav className="flex-1 py-4 space-y-1.5 px-3">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all ${
                currentView === item.id
                  ? 'bg-[#C8F542]/15 text-[#C8F542]'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <span className="text-xl flex-shrink-0">{item.icon}</span>
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/[0.08]">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 p-2 rounded-2xl bg-white/[0.06] border border-white/10">
              <span className="text-2xl flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ring-2 ring-white/10 bg-white/[0.06]">{user.avatar ?? '👩‍💼'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{user.name}</p>
                <p className="text-xs text-white/40">Zaměstnavatel</p>
              </div>
              <button onClick={() => signOut({ callbackUrl: '/login' })} title="Odhlásit se" className="rounded-full p-1.5 text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors text-lg">
                🚪
              </button>
            </div>
          ) : (
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              title="Odhlásit se"
              className="w-full flex justify-center p-2 rounded-full text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors text-xl"
            >
              🚪
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-white/[0.03] border-b border-white/[0.06] px-6 py-3 flex items-center gap-4 flex-shrink-0">
          <button onClick={() => setSidebarOpen(v => !v)} className="hidden md:block rounded-full p-1.5 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-xl">
            ☰
          </button>
          <div className="flex-1">
            <h2 className="font-bold text-white text-lg tracking-tight">
              {navItems.find(n => n.id === currentView)?.icon}{' '}
              {navItems.find(n => n.id === currentView)?.label}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 pl-3 border-l border-white/10">
              <span className="text-2xl flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-white/10 bg-white/[0.06]">{user.avatar ?? '👩‍💼'}</span>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-white leading-tight">{user.name}</p>
                <p className="text-xs text-white/40">Zaměstnavatel</p>
              </div>
            </div>
          </div>
        </header>
        <main className={`flex-1 pb-24 md:pb-0 ${currentView === 'chat' ? 'overflow-hidden' : 'overflow-y-auto scrollbar-thin'}`}>
          {renderView()}
        </main>
      </div>

      {/* Mobile bottom nav — floating pill dock */}
      <div className="md:hidden fixed bottom-4 left-4 right-4 z-30 pb-[env(safe-area-inset-bottom)]">
        <nav className="glass-strong mx-auto max-w-md rounded-full px-2 py-2 flex items-center justify-around">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              title={item.label}
              className={`flex flex-col items-center gap-0.5 rounded-full px-2.5 py-1 transition-all ${
                currentView === item.id ? 'text-[#C8F542]' : 'text-white/50 hover:text-white'
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className={`h-1 w-1 rounded-full transition-all ${currentView === item.id ? 'bg-[#C8F542]' : 'bg-transparent'}`} />
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
