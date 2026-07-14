'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import MyShifts from './MyShifts';
import ShiftRequests from './ShiftRequests';
import InventoryReport from './InventoryReport';
import EmployeeChat from './EmployeeChat';
import Tasks from './Tasks';

const navItems = [
  { id: 'my-shifts',       label: 'Moje směny', icon: '📅' },
  { id: 'shift-requests',  label: 'Žádosti',    icon: '📨' },
  { id: 'inventory',       label: 'Sklad',      icon: '📦' },
  { id: 'tasks',           label: 'Úkoly',      icon: '✅' },
  { id: 'chat',            label: 'Chat',       icon: '💬' },
];

interface Props {
  user: { name?: string | null; email?: string | null; id?: string; role?: string; avatar?: string; jobTitle?: string };
}

export default function EmployeeLayout({ user }: Props) {
  const [currentView, setCurrentView] = useState('my-shifts');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const renderView = () => {
    switch (currentView) {
      case 'my-shifts':      return <MyShifts user={user} />;
      case 'shift-requests': return <ShiftRequests user={user} />;
      case 'inventory':      return <InventoryReport user={user} />;
      case 'tasks':          return <Tasks user={user} />;
      case 'chat':           return <EmployeeChat user={user} />;
      default:               return <MyShifts user={user} />;
    }
  };

  return (
    <div className="flex h-screen bg-cream overflow-hidden">
      <aside className={`${sidebarOpen ? 'w-60' : 'w-16'} bg-matcha-800 text-white flex flex-col transition-all duration-300 flex-shrink-0`}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-matcha-700">
          <span className="text-2xl flex-shrink-0">🍵</span>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm leading-tight">Čajovna Zelená</p>
              <p className="text-matcha-300 text-xs">Portál zaměstnance</p>
            </div>
          )}
        </div>
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                currentView === item.id
                  ? 'bg-matcha-600 text-white shadow-md'
                  : 'text-matcha-200 hover:bg-matcha-700 hover:text-white'
              }`}
            >
              <span className="text-xl flex-shrink-0">{item.icon}</span>
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-matcha-700">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 p-2 rounded-xl bg-matcha-700">
              <span className="text-2xl">{user.avatar ?? '👤'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{user.name}</p>
                <p className="text-xs text-matcha-300">{user.jobTitle ?? 'Barista'}</p>
              </div>
              <button onClick={() => signOut({ callbackUrl: '/login' })} title="Odhlásit se" className="text-matcha-400 hover:text-white transition-colors text-lg">
                🚪
              </button>
            </div>
          ) : (
            <button onClick={() => signOut({ callbackUrl: '/login' })} title="Odhlásit se" className="w-full flex justify-center p-2 text-matcha-400 hover:text-white transition-colors text-xl">
              🚪
            </button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-tea-200 px-6 py-3 flex items-center gap-4 flex-shrink-0 shadow-sm">
          <button onClick={() => setSidebarOpen(v => !v)} className="text-tea-500 hover:text-tea-800 transition-colors text-xl">☰</button>
          <div className="flex-1">
            <h2 className="font-bold text-tea-800 text-lg">
              {navItems.find(n => n.id === currentView)?.icon}{' '}
              {navItems.find(n => n.id === currentView)?.label}
            </h2>
          </div>
          <div className="flex items-center gap-2 pl-2 border-l border-tea-200">
            <span className="text-2xl">{user.avatar ?? '👤'}</span>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-tea-800 leading-tight">{user.name}</p>
              <p className="text-xs text-tea-500">{user.jobTitle ?? 'Barista'}</p>
            </div>
          </div>
        </header>
        <main className={`flex-1 ${currentView === 'chat' ? 'overflow-hidden' : 'overflow-y-auto scrollbar-thin'}`}>
          {renderView()}
        </main>
      </div>
    </div>
  );
}
