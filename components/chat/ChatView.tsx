'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@/components/Icons';
import {
  Conversation,
  ChatMessage,
  useConversations,
  useThreadMessages,
  sendMessage,
  uploadFile,
  markRead,
  formatTime,
} from './useChat';

interface Props {
  user: { id: number | string; name: string; role?: string; avatar?: string };
}

export default function ChatView({ user }: Props) {
  const meId = typeof user.id === 'string' ? parseInt(user.id) : user.id;
  const { conversations, loading, refresh, setConversations } = useConversations();
  const [activeId, setActiveId] = useState<number | null>(null);
  const active = conversations.find((c) => c.id === activeId) ?? null;

  const openConversation = useCallback(
    (id: number) => {
      setActiveId(id);
      markRead(id);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
      );
    },
    [setConversations],
  );

  return (
    <div className="h-full w-full flex overflow-hidden rounded-3xl glass-card">
      {/* Conversation list */}
      <aside
        className={`${
          activeId ? 'hidden md:flex' : 'flex'
        } flex-col w-full md:w-80 md:flex-shrink-0 border-r border-black/[0.06] h-full`}
      >
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-center gap-2">
          <Icon name="chat" size={22} className="text-[#5B7A08]" />
          <h2 className="text-lg font-semibold text-[#16181A]">Zprávy</h2>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-black/[0.06]">
          {loading && (
            <div className="p-6 text-center text-black/45 text-sm">Načítání…</div>
          )}
          {!loading && conversations.length === 0 && (
            <div className="p-6 text-center text-black/45 text-sm">Žádné konverzace</div>
          )}
          {conversations.map((c) => (
            <ConversationRow
              key={c.id}
              conv={c}
              active={c.id === activeId}
              onClick={() => openConversation(c.id)}
            />
          ))}
        </div>
      </aside>

      {/* Active thread */}
      <section
        className={`${
          activeId ? 'flex' : 'hidden md:flex'
        } flex-col flex-1 h-full min-w-0`}
      >
        {active ? (
          <Thread
            key={active.id}
            conv={active}
            meId={meId}
            onBack={() => setActiveId(null)}
            onSent={refresh}
          />
        ) : (
          <div className="flex-1 hidden md:flex flex-col items-center justify-center text-black/45 gap-3">
            <Icon name="chat" size={48} className="text-[#16181A]/15" />
            <p className="text-sm">Vyberte konverzaci</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ConversationRow({
  conv,
  active,
  onClick,
}: {
  conv: Conversation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        active ? 'bg-black/[0.04]' : 'hover:bg-white/[0.03]'
      }`}
    >
      <Avatar conv={conv} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-[#16181A] truncate">{conv.name}</span>
          <span className="text-[11px] text-black/45 flex-shrink-0">
            {formatTime(conv.lastTime)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-black/45 truncate">
            {conv.lastMessage ?? 'Zatím žádné zprávy'}
          </span>
          {conv.unreadCount > 0 && (
            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#C8F542] text-black text-[11px] font-semibold flex items-center justify-center">
              {conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function Avatar({ conv, size = 44 }: { conv: Conversation; size?: number }) {
  if (conv.type === 'team') {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-[#C8F542]/15 border border-[#C8F542]/25 text-[#5B7A08] flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <Icon name="users" size={Math.round(size * 0.5)} />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-black/[0.04] border border-black/[0.08] flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {conv.avatar ?? '👤'}
    </span>
  );
}

function Thread({
  conv,
  meId,
  onBack,
  onSent,
}: {
  conv: Conversation;
  meId: number;
  onBack: () => void;
  onSent: () => void;
}) {
  const { messages, setMessages, loading } = useThreadMessages(conv.id);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const doSend = async (payload: {
    content?: string;
    attachmentUrl?: string;
    attachmentType?: string;
    attachmentName?: string;
  }) => {
    const msg = await sendMessage(conv.id, payload);
    if (msg) {
      setMessages((prev) => [...prev, msg]);
      onSent();
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText('');
    await doSend({ content: t });
    setSending(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    const up = await uploadFile(file);
    if (up) {
      await doSend({
        attachmentUrl: up.url,
        attachmentType: up.type,
        attachmentName: up.name,
      });
    } else {
      alert('Nahrání souboru se nezdařilo');
    }
    setUploading(false);
  };

  return (
    <>
      <header className="px-4 py-3 border-b border-black/[0.06] flex items-center gap-3">
        <button
          onClick={onBack}
          className="md:hidden text-black/60 hover:text-black p-1 -ml-1"
          aria-label="Zpět"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <Avatar conv={conv} size={38} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[#16181A] truncate">{conv.name}</div>
          {conv.type === 'team' && (
            <div className="text-[11px] text-black/45">Týmový kanál</div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-2">
        {loading && (
          <div className="text-center text-black/45 text-sm py-6">Načítání…</div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-center text-black/45 text-sm py-6">
            Zatím žádné zprávy. Napište první!
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            msg={m}
            own={m.senderId === meId}
            showSender={conv.type === 'team' && m.senderId !== meId && messages[i - 1]?.senderId !== m.senderId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="px-3 py-3 border-t border-black/[0.06] flex items-center gap-2"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,*/*"
          className="hidden"
          onChange={handleFile}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-black/60 hover:text-black hover:bg-black/[0.04] transition-colors disabled:opacity-40"
          aria-label="Připojit soubor"
        >
          {uploading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
          ) : (
            <PaperclipIcon />
          )}
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Napište zprávu…"
          className="flex-1 min-w-0 rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-2.5 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-[#C8F542] text-black flex items-center justify-center disabled:opacity-40 transition-opacity"
          aria-label="Odeslat"
        >
          <Icon name="send" size={20} />
        </button>
      </form>
    </>
  );
}

export function MessageBubble({
  msg,
  own,
  showSender,
}: {
  msg: ChatMessage;
  own: boolean;
  showSender: boolean;
}) {
  return (
    <div className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
      {showSender && (
        <span className="text-[11px] text-black/45 ml-3 mb-0.5">{msg.senderName}</span>
      )}
      <div
        className={`max-w-[78%] px-4 py-2.5 ${
          own
            ? 'bg-[#C8F542] text-black rounded-3xl rounded-br-lg'
            : 'glass text-[#16181A] rounded-3xl rounded-bl-lg'
        }`}
      >
        {msg.attachmentUrl && msg.attachmentType === 'image' && (
          <a href={msg.attachmentUrl} target="_blank" rel="noreferrer">
            <img
              src={msg.attachmentUrl}
              alt={msg.attachmentName ?? 'obrázek'}
              className="max-w-[min(220px,100%)] max-h-[220px] rounded-2xl object-cover"
            />
          </a>
        )}
        {msg.attachmentUrl && msg.attachmentType === 'file' && (
          <a
            href={msg.attachmentUrl}
            target="_blank"
            rel="noreferrer"
            download={msg.attachmentName ?? undefined}
            className={`flex items-center gap-2 rounded-2xl px-3 py-2 max-w-full ${
              own ? 'bg-black/10' : 'bg-black/[0.04]'
            }`}
          >
            <FileIcon />
            <span className="text-sm truncate min-w-0 max-w-[min(160px,100%)] underline">
              {msg.attachmentName ?? 'Soubor'}
            </span>
          </a>
        )}
        {msg.content && (
          <p className={`whitespace-pre-wrap break-words ${msg.attachmentUrl ? 'mt-1.5' : ''}`}>
            {msg.content}
          </p>
        )}
        <div
          className={`text-[10px] mt-1 ${own ? 'text-black/50' : 'text-black/45'} text-right`}
        >
          {formatTime(msg.createdAt)}
        </div>
      </div>
    </div>
  );
}

function PaperclipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <path d="M14 3v5h5" />
      <path d="M19 8.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.5L19 8.5Z" />
    </svg>
  );
}
