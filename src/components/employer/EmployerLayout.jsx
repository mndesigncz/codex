import { useState } from 'react';
import Overview from './Overview.jsx';
import ShiftManagement from './ShiftManagement.jsx';
import Inventory from './Inventory.jsx';
import Team from './Team.jsx';
import Chat from './Chat.jsx';
import PlanningBoard from './PlanningBoard.jsx';
import Recipes from './Recipes.jsx';
import DailyReports from './DailyReports.jsx';
import { notifications } from '../../data/mockData.js';

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

// Bottom nav shows first 5 items on mobile
const bottomNavItems = navItems.slice(0, 5);

export default function EmployerLayout({ user, onLogout }) {
  const [currentView, setCurrentView] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [localNotifs, setLocalNotifs] = useState(notifications);

  const unreadCount = localNotifs.filter(n => !n.isRead).length;

  const markAllRead = () => {
    setLocalNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const renderView = () => {
    switch (currentView) {
      case 'overview': return <Overview onNavigate={setCurrentView} />;
      case 'shifts': return <ShiftManagement />;
      case 'inventory': return <Inventory />;
      case 'team': return <Team />;
      case 'chat': return <Chat user={user} />;
      case 'planning': return <PlanningBoard />;
      case 'recipes':  return <Recipes />;
      case 'reports':  return <DailyReports />;
      default: return <Overview onNavigate={setCurrentView} />;
    }
  };

  const currentLabel = navItems.find(n => n.id === currentView)?.label || 'Přehled';

  return (
    <div className="flex h-screen bg-base overflow-hidden">

      {/* ── Desktop Sidebar ── */}
      <aside className={`
        hidden md:flex
        ${sidebarOpen ? 'w-60' : 'w-16'}
        bg-card border-r border-border flex-col transition-all duration-300 flex-shrink-0
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
          <span className="text-2xl flex-shrink-0">🍵</span>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm leading-tight text-white">Čajovna Zelená</p>
              <p className="text-text-secondary text-xs">Správa čajovny</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] ${
                currentView === item.id
                  ? 'bg-accent/20 text-accent'
                  : 'text-text-secondary hover:bg-elevated hover:text-white'
              }`}
            >
              <span className="text-xl flex-shrink-0">{item.icon}</span>
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-border">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 p-2 rounded-xl bg-elevated">
              <span className="text-2xl">{user.avatar}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate text-white">{user.name}</p>
                <p className="text-xs text-text-secondary">{user.role}</p>
              </div>
              <button onClick={onLogout} title="Odhlásit se" className="text-text-secondary hover:text-danger transition-colors text-lg">
                🚪
              </button>
            </div>
          ) : (
            <button
              onClick={onLogout}
              title="Odhlásit se"
              className="w-full flex justify-center p-2 text-text-secondary hover:text-danger transition-colors text-xl"
            >
              🚪
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Topbar ── */}
        <header className="bg-card border-b border-border px-4 md:px-6 py-3 flex items-center gap-3 flex-shrink-0">
          {/* Hamburger (desktop only) */}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="hidden md:flex items-center justify-center w-10 h-10 text-text-secondary hover:text-white hover:bg-elevated rounded-xl transition-all"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <path d="M1 1H17M1 7H17M1 13H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Page title */}
          <div className="flex-1">
            <h2 className="font-bold text-white text-base md:text-lg leading-tight">
              {currentLabel}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(v => !v)}
                className="relative w-10 h-10 flex items-center justify-center text-text-secondary hover:text-white hover:bg-elevated rounded-xl transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-danger text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-12 w-80 bg-card rounded-2xl shadow-2xl border border-border z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="font-bold text-white">Notifikace</span>
                    <button onClick={markAllRead} className="text-xs text-accent hover:underline">
                      Označit vše
                    </button>
                  </div>
                  <div className="max-h-96 overflow-y-auto scrollbar-thin">
                    {localNotifs.map(n => (
                      <div
                        key={n.id}
                        className={`px-4 py-3 border-b border-border hover:bg-elevated transition-colors ${!n.isRead ? 'bg-elevated/50' : ''}`}
                      >
                        <div className="flex gap-3">
                          <span className="text-lg flex-shrink-0">
                            {n.type === 'warning' ? '⚠️' : n.type === 'success' ? '✅' : 'ℹ️'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white">{n.title}</p>
                            <p className="text-xs text-text-secondary mt-0.5">{n.message}</p>
                            <p className="text-xs text-text-secondary/50 mt-1">
                              {new Date(n.timestamp).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {!n.isRead && <span className="ml-auto w-2 h-2 bg-accent rounded-full flex-shrink-0 mt-1"></span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 text-center">
                    <button onClick={() => setNotifOpen(false)} className="text-xs text-text-secondary hover:text-white">
                      Zavřít
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Avatar */}
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center text-xl border border-border">
                {user.avatar}
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-semibold text-white leading-tight">{user.name}</p>
                <p className="text-xs text-text-secondary">{user.role}</p>
              </div>
            </div>
          </div>
        </header>

        {/* ── Page content ── */}
        <main className={`flex-1 ${currentView === 'chat' ? 'overflow-hidden' : 'overflow-y-auto scrollbar-thin'} pb-20 md:pb-0`}>
          {renderView()}
        </main>
      </div>

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 flex items-center safe-area-inset-bottom">
        {bottomNavItems.map(item => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-all ${
                isActive ? 'text-accent' : 'text-text-secondary'
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-accent mt-0.5" />
              )}
            </button>
          );
        })}
        {/* More button for remaining items */}
        <button
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] text-text-secondary"
          onClick={() => {
            // cycle through remaining items
            const remaining = navItems.slice(5);
            const currentIndex = remaining.findIndex(n => n.id === currentView);
            if (currentIndex >= 0) {
              setCurrentView(remaining[(currentIndex + 1) % remaining.length].id);
            } else {
              setCurrentView(remaining[0].id);
            }
          }}
        >
          <span className="text-xl leading-none">⋯</span>
          <span className="text-[10px] font-medium leading-tight">
            {navItems.slice(5).find(n => n.id === currentView)?.label || 'Více'}
          </span>
          {navItems.slice(5).some(n => n.id === currentView) && (
            <span className="w-1 h-1 rounded-full bg-accent mt-0.5" />
          )}
        </button>
      </nav>
    </div>
  );
}
