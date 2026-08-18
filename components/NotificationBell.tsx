'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
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
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [flaggedFeedback, setFlaggedFeedback] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      setNotifs(data.notifications || []);
      setUnread(data.unread || 0);
    } catch {}
  };

  // Shift feedback the employee hasn't acknowledged yet. Polled far less often
  // than notifications — the rewards summary is a heavier query.
  const loadFeedback = useCallback(async () => {
    if (role !== 'employee') return;
    try {
      const res = await fetch('/api/rewards');
      const data = await res.json();
      setFlaggedFeedback(Number(data?.unseenFlagged) || 0);
    } catch {}
  }, [role]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (role !== 'employee') { setFlaggedFeedback(0); return; }
    loadFeedback();
    const t = setInterval(loadFeedback, 120000);
    return () => clearInterval(t);
  }, [role, loadFeedback]);

  // Latest open/unread for the outside-click closer (registered once).
  const stateRef = useRef({ open: false, unread: 0 });
  stateRef.current = { open, unread };
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (stateRef.current.open && stateRef.current.unread) markAllRead();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // The flagged feedback stays on the badge until it is acknowledged in Odměny,
  // so "přečíst vše" here can't hide it.
  const badge = unread + (flaggedFeedback > 0 ? 1 : 0);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          if (!open) loadFeedback();
          else if (unread) markAllRead();
          setOpen(o => !o);
        }}
        className="relative rounded-full bg-black/[0.04] border border-black/[0.08] w-10 h-10 flex items-center justify-center text-black/60 hover:text-black transition-colors"
        title="Notifikace"
      >
        <Icon name="bell" size={19} />
        {badge > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold flex items-center justify-center ${flaggedFeedback > 0 ? 'bg-red-500 text-white' : 'bg-[#C8F542] text-black'}`}>
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] glass-strong rounded-3xl overflow-hidden z-50 shadow-[0_16px_44px_rgba(25,35,15,0.18)]">
          <div className="px-4 py-3 border-b border-black/[0.07] flex items-center justify-between">
            <span className="font-bold text-[#16181A] text-sm">Notifikace</span>
            {notifs.some(n => !n.is_read) && (
              <button onClick={markAllRead} className="text-xs text-[#5B7A08] hover:underline">Přečíst vše</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-thin divide-y divide-black/[0.05]">
            {flaggedFeedback > 0 && (
              <div className="px-4 py-3 flex gap-3 bg-red-500/[0.07]">
                <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-600">
                  <Icon name="warning" size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#16181A]">Něco je potřeba napravit</p>
                  <p className="text-xs text-black/55 mt-0.5">
                    {flaggedFeedback === 1 ? 'U jedné z tvých směn' : `U ${flaggedFeedback} tvých směn`} máš zpětnou vazbu od vedení. Otevři sekci Odměny.
                  </p>
                </div>
              </div>
            )}
            {notifs.length === 0 && flaggedFeedback === 0 ? (
              <div className="p-8 text-center text-black/40 text-sm">Žádné notifikace</div>
            ) : notifs.map(n => (
              <button key={n.id} onClick={() => openNotif(n)}
                className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-black/[0.03] transition-colors ${!n.is_read ? 'bg-[#C8F542]/[0.04]' : ''}`}>
                <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#C8F542]/15 text-[#5B7A08]">
                  <Icon name={typeIcon[n.type] || 'bell'} size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#16181A] truncate">{n.title}</p>
                  {n.body && <p className="text-xs text-black/50 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[11px] text-black/35 mt-1">
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
