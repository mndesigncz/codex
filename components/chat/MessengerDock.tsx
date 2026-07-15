'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@/components/Icons';
import { MessageBubble } from './ChatView';
import {
  Conversation,
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

const MAX_OPEN = 3;

export default function MessengerDock({ user }: Props) {
  const meId = typeof user.id === 'string' ? parseInt(user.id) : user.id;
  const { conversations, refresh, setConversations } = useConversations();
  const [openIds, setOpenIds] = useState<number[]>([]);
  const [listOpen, setListOpen] = useState(false);

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0);

  const openWindow = useCallback(
    (id: number) => {
      setListOpen(false);
      setOpenIds((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        return next.slice(-MAX_OPEN);
      });
      markRead(id);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
      );
    },
    [setConversations],
  );

  const closeWindow = useCallback((id: number) => {
    setOpenIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const openConvs = openIds
    .map((id) => conversations.find((c) => c.id === id))
    .filter((c): c is Conversation => !!c);

  return (
    <div className="hidden md:block fixed bottom-4 right-4 z-40">
      <style>{`@keyframes chatDockIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
      <div className="flex items-end gap-3">
        {/* Open chat windows */}
        {openConvs.map((conv, i) => (
          <ChatWindow
            key={conv.id}
            conv={conv}
            meId={meId}
            onClose={() => closeWindow(conv.id)}
            onSent={refresh}
            offset={i}
          />
        ))}

        {/* Right column: list popover + launcher */}
        <div className="flex flex-col items-end gap-3">
          {listOpen && (
            <ConversationPopover
              conversations={conversations}
              onPick={openWindow}
              onClose={() => setListOpen(false)}
            />
          )}
          <button
            onClick={() => setListOpen((v) => !v)}
            className="relative w-14 h-14 rounded-full bg-[#C8F542] text-black flex items-center justify-center shadow-[0_12px_40px_rgba(0,0,0,0.5)] hover:scale-105 active:scale-95 transition-transform"
            aria-label="Chat"
          >
            <Icon name="chat" size={26} />
            {totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-[#16181A] text-[11px] font-semibold flex items-center justify-center border-2 border-[#0A0A0C]">
                {totalUnread}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConvAvatar({ conv, size = 40 }: { conv: Conversation; size?: number }) {
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

function ConversationPopover({
  conversations,
  onPick,
  onClose,
}: {
  conversations: Conversation[];
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="w-80 max-h-[70vh] rounded-3xl glass-strong shadow-[0_12px_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-[chatDockIn_.18s_cubic-bezier(0.16,1,0.3,1)]">
      <div className="px-4 py-3 flex items-center justify-between border-b border-black/[0.06]">
        <span className="font-semibold text-[#16181A]">Zprávy</span>
        <button
          onClick={onClose}
          className="text-black/55 hover:text-black p-1"
          aria-label="Zavřít"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="overflow-y-auto scrollbar-thin divide-y divide-black/[0.06]">
        {conversations.length === 0 && (
          <div className="p-6 text-center text-black/45 text-sm">Žádné konverzace</div>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.03] transition-colors"
          >
            <ConvAvatar conv={c} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[#16181A] truncate">{c.name}</span>
                <span className="text-[11px] text-black/45 flex-shrink-0">
                  {formatTime(c.lastTime)}
                </span>
              </div>
              <span className="text-sm text-black/45 truncate block">
                {c.lastMessage ?? 'Zatím žádné zprávy'}
              </span>
            </div>
            {c.unreadCount > 0 && (
              <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#C8F542] text-black text-[11px] font-semibold flex items-center justify-center">
                {c.unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatWindow({
  conv,
  meId,
  onClose,
  onSent,
  offset,
}: {
  conv: Conversation;
  meId: number;
  onClose: () => void;
  onSent: () => void;
  offset: number;
}) {
  const { messages, setMessages } = useThreadMessages(conv.id);
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
      await doSend({ attachmentUrl: up.url, attachmentType: up.type, attachmentName: up.name });
    } else {
      alert('Nahrání souboru se nezdařilo');
    }
    setUploading(false);
  };

  return (
    <div
      className="w-80 h-[440px] rounded-3xl glass-strong shadow-[0_12px_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-[chatDockIn_.18s_cubic-bezier(0.16,1,0.3,1)]"
      style={{ zIndex: 40 - offset }}
    >
      <header className="px-3 py-2.5 flex items-center gap-2 border-b border-black/[0.06]">
        <ConvAvatar conv={conv} size={32} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[#16181A] text-sm truncate">{conv.name}</div>
          {conv.type === 'team' && (
            <div className="text-[10px] text-black/45 leading-none">Týmový kanál</div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-black/55 hover:text-black p-1"
          aria-label="Zavřít"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-1.5">
        {messages.length === 0 && (
          <div className="text-center text-black/45 text-xs py-6">Zatím žádné zprávy.</div>
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
        className="px-2.5 py-2.5 border-t border-black/[0.06] flex items-center gap-1.5"
      >
        <input ref={fileRef} type="file" accept="image/*,*/*" className="hidden" onChange={handleFile} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-black/60 hover:text-black hover:bg-black/[0.04] transition-colors disabled:opacity-40"
          aria-label="Připojit soubor"
        >
          {uploading ? (
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
          ) : (
            <PaperclipIcon />
          )}
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Zpráva…"
          className="flex-1 min-w-0 rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3 py-2 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-[#C8F542] text-black flex items-center justify-center disabled:opacity-40"
          aria-label="Odeslat"
        >
          <Icon name="send" size={16} />
        </button>
      </form>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
    </svg>
  );
}
