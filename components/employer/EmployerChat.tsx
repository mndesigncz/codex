'use client';

import { useState, useEffect, useRef } from 'react';

interface Message {
  id: number;
  senderId: number;
  content: string;
  createdAt: string;
  senderName?: string;
  senderAvatar?: string;
}

interface User {
  id: number;
  name: string;
  avatar?: string;
}

interface Props {
  user: { name?: string | null; id?: string; avatar?: string };
}

export default function EmployerChat({ user }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [msgsRes, usersRes] = await Promise.all([
          fetch('/api/messages?channel=general'),
          fetch('/api/users'),
        ]);
        const [msgsData, usersData] = await Promise.all([msgsRes.json(), usersRes.json()]);
        setUsers(usersData);
        const withNames = msgsData.map((m: Message) => {
          const sender = usersData.find((u: User) => u.id === m.senderId);
          return { ...m, senderName: sender?.name ?? 'Neznámý', senderAvatar: sender?.avatar ?? '👤' };
        });
        setMessages(withNames);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: parseInt(user.id ?? '0'),
          channel: 'general',
          content: newMessage.trim(),
        }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => [...prev, { ...msg, senderName: user.name ?? 'Eva', senderAvatar: user.avatar ?? '👩‍💼' }]);
        setNewMessage('');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const myId = parseInt(user.id ?? '0');

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-white/[0.06] backdrop-blur-xl bg-white/[0.03] flex-shrink-0">
        <h3 className="font-bold tracking-tight text-white">💬 Obecný chat</h3>
        <p className="text-xs text-white/40">Komunikace s týmem</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-[#C8F542] animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-white/40 py-12">
            <p className="text-4xl mb-2">💬</p>
            <p>Žádné zprávy. Buďte první!</p>
          </div>
        ) : messages.map(msg => {
          const isMe = msg.senderId === myId;
          return (
            <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
              <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center text-lg flex-shrink-0">
                {msg.senderAvatar}
              </div>
              <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                {!isMe && <p className="text-xs text-white/40 mb-1 ml-1">{msg.senderName}</p>}
                <div className={`px-4 py-2.5 text-sm ${isMe ? 'bg-[#C8F542] text-black rounded-3xl rounded-br-lg font-medium' : 'glass text-white rounded-3xl rounded-bl-lg'}`}>
                  {msg.content}
                </div>
                <p className="text-xs text-white/25 mt-1 mx-1">
                  {new Date(msg.createdAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMessage} className="flex-shrink-0 p-4 border-t border-white/[0.06] backdrop-blur-xl bg-white/[0.03] flex gap-3">
        <input
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Napište zprávu..."
          className="flex-1 rounded-full bg-white/[0.06] border border-white/10 px-5 py-3 text-white placeholder-white/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm"
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-3 text-sm hover:brightness-110 transition-all disabled:opacity-40"
        >
          {sending ? 'Odesílám…' : 'Odeslat'}
        </button>
      </form>
    </div>
  );
}
