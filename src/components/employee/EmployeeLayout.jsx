import { useState } from 'react';
import MyShifts from './MyShifts.jsx';
import ShiftRequests from './ShiftRequests.jsx';
import InventoryReport from './InventoryReport.jsx';
import Chat from './Chat.jsx';
import Tasks from './Tasks.jsx';
import { notifications } from '../../data/mockData.js';

const navItems = [
  { id: 'my-shifts', label: 'Moje směny', icon: '📅' },
  { id: 'shift-requests', label: 'Žádosti', icon: '📨' },
  { id: 'inventory', label: 'Sklad', icon: '📦' },
  { id: 'tasks', label: 'Úkoly', icon: '✅' },
  { id: 'chat', label: 'Chat', icon: '💬' },
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

  return (
    <div className="flex h-screen bg-cream overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-60' : 'w-16'} bg-matcha-800 text-white flex flex-col transition-all duration-300 flex-shrink-0`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-matcha-700">
          <span className="text-2xl flex-shrink-0">🍵</span>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm leading-tight">Čajovna Zelená</p>
              <p className="text-matcha-300 text-xs">Portál zaměstnance</p>
            </div>
          )}
        </div>

        {/* Navigation */}
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

        {/* User info */}
        <div className="p-3 border-t border-matcha-700">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 p-2 rounded-xl bg-matcha-700">
              <span className="text-2xl">{user.avatar}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{user.name}</p>
                <p className="text-xs text-matcha-300">{user.role}</p>
              </div>
              <button onClick={onLogout} title="Odhlásit se" className="text-matcha-400 hover:text-white transition-colors text-lg">
                🚪
              </button>
            </div>
          ) : (
            <button
              onClick={onLogout}
              title="Odhlásit se"
              className="w-full flex justify-center p-2 text-matcha-400 hover:text-white transition-colors text-xl"
            >
              🚪
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-tea-200 px-6 py-3 flex items-center gap-4 flex-shrink-0 shadow-sm">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="text-tea-500 hover:text-tea-800 transition-colors text-xl"
          >
            ☰
          </button>
          <div className="flex-1">
            <h2 className="font-bold text-tea-800 text-lg">
              {navItems.find(n => n.id === currentView)?.icon}{' '}
              {navItems.find(n => n.id === currentView)?.label}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Wireframe badge */}
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full border border-amber-200">
              📐 Wireframe
            </span>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(v => !v)}
                className="relative p-2 text-tea-500 hover:text-tea-800 hover:bg-tea-100 rounded-xl transition-all"
              >
                <span className="text-xl">🔔</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-tea-200 z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-tea-100">
                    <span className="font-bold text-tea-800">Notifikace</span>
                    <button onClick={markAllRead} className="text-xs text-matcha-600 hover:underline">
                      Označit vše jako přečtené
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {localNotifs.length === 0 ? (
                      <p className="text-center text-tea-400 text-sm py-6">Žádné notifikace</p>
                    ) : localNotifs.map(n => (
                      <div key={n.id} className={`px-4 py-3 border-b border-tea-50 hover:bg-tea-50 ${!n.isRead ? 'bg-matcha-50' : ''}`}>
                        <div className="flex gap-3">
                          <span className="text-lg flex-shrink-0">
                            {n.type === 'warning' ? '⚠️' : n.type === 'success' ? '✅' : 'ℹ️'}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-tea-800">{n.title}</p>
                            <p className="text-xs text-tea-500 mt-0.5">{n.message}</p>
                          </div>
                          {!n.isRead && <span className="ml-auto w-2 h-2 bg-matcha-500 rounded-full flex-shrink-0 mt-1"></span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 text-center">
                    <button onClick={() => setNotifOpen(false)} className="text-xs text-tea-400 hover:text-tea-600">
                      Zavřít
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Avatar */}
            <div className="flex items-center gap-2 pl-2 border-l border-tea-200">
              <span className="text-2xl">{user.avatar}</span>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-tea-800 leading-tight">{user.name}</p>
                <p className="text-xs text-tea-500">{user.role}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className={`flex-1 ${currentView === 'chat' ? 'overflow-hidden' : 'overflow-y-auto scrollbar-thin'}`}>
          {renderView()}
        </main>
      </div>
    </div>
  );
}
