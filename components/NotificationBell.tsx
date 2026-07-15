'use client';

import { useState, useEffect, useRef } from 'react';
import { Icon } from './Icons';

interface Notif {
  id: number;
  title: string;
  body?: string;
  type: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

const typeIcon: Record<string, string> = {
  chat: 'chat', inventory: 'box', shift: 'calendar', invite: 'users', info: 'bell',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      setNotifs(data.notifications || []);
      setUnread(data.unread || 0);
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markAllRead = async () => {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
  };

  const openNotif = async (n: Notif) => {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) });
    setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    setUnread(u => Math.max(0, u - (n.is_read ? 0 : 1)));
    if (n.link && n.link !== '/') window.location.href = n.link;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(o => !o); if (!open && unread) markAllRead(); }}
        className="relative rounded-full bg-white/[0.08] border border-white/10 w-10 h-10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
        title="Notifikace"
      >
        <Icon name="bell" size={19} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C8F542] text-black text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] panel-dark rounded-3xl overflow-hidden z-50 shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
            <span className="font-bold text-white text-sm">Notifikace</span>
            {notifs.some(n => !n.is_read) && (
              <button onClick={markAllRead} className="text-xs text-[#C8F542] hover:underline">Přečíst vše</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-thin divide-y divide-white/[0.05]">
            {notifs.length === 0 ? (
              <div className="p-8 text-center text-white/40 text-sm">Žádné notifikace</div>
            ) : notifs.map(n => (
              <button key={n.id} onClick={() => openNotif(n)}
                className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-white/[0.04] transition-colors ${!n.is_read ? 'bg-[#C8F542]/[0.04]' : ''}`}>
                <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[#C8F542]">
                  <Icon name={typeIcon[n.type] || 'bell'} size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{n.title}</p>
                  {n.body && <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[11px] text-white/30 mt-1">
                    {new Date(n.created_at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {!n.is_read && <span className="mt-1.5 h-2 w-2 rounded-full bg-[#C8F542] flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
