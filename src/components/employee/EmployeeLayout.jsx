import { useState } from 'react';
import MyShifts from './MyShifts.jsx';
import ShiftRequests from './ShiftRequests.jsx';
import InventoryReport from './InventoryReport.jsx';
import Chat from './Chat.jsx';
import Tasks from './Tasks.jsx';
import { notifications } from '../../data/mockData.js';

const navItems = [
  { id: 'my-shifts',      label: 'Směny',    icon: '📅' },
  { id: 'shift-requests', label: 'Žádosti',  icon: '📨' },
  { id: 'inventory',      label: 'Sklad',    icon: '📦' },
  { id: 'tasks',          label: 'Úkoly',    icon: '✅' },
  { id: 'chat',           label: 'Chat',     icon: '💬' },
];

export default function EmployeeLayout({ user, onLogout }) {
  const [currentView, setCurrentView] = useState('my-shifts');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [localNotifs, setLocalNotifs] = useState(notifications.filter(n => n.link === 'my-shifts' || n.type === 'success'));

  const unreadCount = localNotifs.filter(n => !n.isRead).length;

  const markAllRead = () => {
    setLocalNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const renderView = () => {
    switch (currentView) {
      case 'my-shifts': return <MyShifts user={user} onNavigate={setCurrentView} />;
      case 'shift-requests': return <ShiftRequests user={user} />;
      case 'inventory': return <InventoryReport user={user} />;
      case 'tasks': return <Tasks user={user} />;
      case 'chat': return <Chat user={user} />;
      default: return <MyShifts user={user} onNavigate={setCurrentView} />;
    }
  };

  const currentLabel = navItems.find(n => n.id === currentView)?.label || 'Směny';

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
              <p className="text-text-secondary text-xs">Portál zaměstnance</p>
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
                  ? 'bg-accent-blue/20 text-accent-blue'
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
                    <button onClick={markAllRead} className="text-xs text-accent-blue hover:underline">
                      Označit vše
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto scrollbar-thin">
                    {localNotifs.length === 0 ? (
                      <p className="text-center text-text-secondary text-sm py-6">Žádné notifikace</p>
                    ) : localNotifs.map(n => (
                      <div key={n.id} className={`px-4 py-3 border-b border-border hover:bg-elevated ${!n.isRead ? 'bg-elevated/50' : ''}`}>
                        <div className="flex gap-3">
                          <span className="text-lg flex-shrink-0">
                            {n.type === 'warning' ? '⚠️' : n.type === 'success' ? '✅' : 'ℹ️'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white">{n.title}</p>
                            <p className="text-xs text-text-secondary mt-0.5">{n.message}</p>
                          </div>
                          {!n.isRead && <span className="ml-auto w-2 h-2 bg-accent-blue rounded-full flex-shrink-0 mt-1"></span>}
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 flex items-center">
        {navItems.map(item => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-all ${
                isActive ? 'text-accent-blue' : 'text-text-secondary'
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-accent-blue mt-0.5" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
