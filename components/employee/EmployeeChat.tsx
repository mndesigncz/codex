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
  user: { id?: string; name?: string | null; avatar?: string };
}

export default function EmployeeChat({ user }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
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
        setMessages(prev => [...prev, { ...msg, senderName: user.name ?? 'Zaměstnanec', senderAvatar: user.avatar ?? '👤' }]);
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
      <div className="px-6 py-3 border-b border-tea-200 bg-white flex-shrink-0">
        <h3 className="font-bold text-tea-800">💬 Obecný chat</h3>
        <p className="text-xs text-tea-400">Komunikace s týmem a vedením</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-4xl animate-spin">⏳</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-tea-400 py-12">
            <p className="text-4xl mb-2">💬</p>
            <p>Žádné zprávy.</p>
          </div>
        ) : messages.map(msg => {
          const isMe = msg.senderId === myId;
          return (
            <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
              <div className="w-9 h-9 rounded-full bg-matcha-100 flex items-center justify-center text-lg flex-shrink-0">
                {msg.senderAvatar}
              </div>
              <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                {!isMe && <p className="text-xs text-tea-400 mb-1 ml-1">{msg.senderName}</p>}
                <div className={`px-4 py-2.5 rounded-2xl text-sm ${isMe ? 'bg-matcha-600 text-white rounded-tr-sm' : 'bg-white border border-tea-200 text-tea-800 rounded-tl-sm shadow-sm'}`}>
                  {msg.content}
                </div>
                <p className="text-xs text-tea-300 mt-1 mx-1">
                  {new Date(msg.createdAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMessage} className="flex-shrink-0 p-4 border-t border-tea-200 bg-white flex gap-3">
        <input
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Napište zprávu..."
          className="flex-1 px-4 py-2.5 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800 placeholder:text-tea-300"
        />
        <button type="submit" disabled={!newMessage.trim() || sending}
          className="px-4 py-2.5 bg-matcha-600 hover:bg-matcha-700 disabled:bg-matcha-400 text-white rounded-xl font-medium text-sm transition-all">
          {sending ? '⏳' : '📤'}
        </button>
      </form>
    </div>
  );
}
