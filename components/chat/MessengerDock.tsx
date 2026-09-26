'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@/components/Icons';
import { EmptyState, Button, Badge } from '../ui';
import { MessageBubble } from './ChatView';
import NewConversation from './NewConversation';
import {
  Conversation,
  useConversations,
  useThreadMessages,
  sendMessage,
  uploadFile,
  MAX_UPLOAD_BYTES,
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
  const [newOpen, setNewOpen] = useState(false);

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
    // Na telefonu je chat v dolním doku; bublina nad ním byla podruhé totéž
    // a zakrývala tlačítka v rohu. Na monitoru, kde dok není, má smysl.
    <div className="hidden md:block fixed md:bottom-4 md:right-4 z-40 max-w-[calc(100vw-1.5rem)]">
      <div className="flex flex-col md:flex-row items-end gap-3">
        {/* Open chat windows (mobile shows only the most recent one) */}
        {openConvs.map((conv, i) => (
          <div key={conv.id} className={i === openConvs.length - 1 ? 'max-w-full' : 'hidden md:block max-w-full'}>
            <ChatWindow
              conv={conv}
              meId={meId}
              onClose={() => closeWindow(conv.id)}
              onSent={refresh}
              offset={i}
            />
          </div>
        ))}

        {/* Right column: list popover + launcher */}
        <div className="flex flex-col items-end gap-3">
          {listOpen && (
            <ConversationPopover
              conversations={conversations}
              onPick={openWindow}
              onNew={() => { setListOpen(false); setNewOpen(true); }}
              onClose={() => setListOpen(false)}
            />
          )}
          {/* Plovoucí chrom je inkoustový (DP §2.10): limetkové kolečko na
              každé obrazovce soupeřilo s hlavní akcí stránky o jedinou limetku.
              Počet nese stejný Badge jako dok a zvonek. */}
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            className="fab-chat chrom-inkoust relative w-14 h-14 rounded-full grid place-items-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] focus-visible:ring-offset-2"
            aria-label={totalUnread > 0 ? `Chat, nepřečtené: ${totalUnread}` : 'Chat'}
            aria-expanded={listOpen}
          >
            <Icon name="chat" size={24} />
            <Badge count={totalUnread} max={99} className="fab-chat-odznak absolute -top-1 -right-1" />
          </button>
        </div>
      </div>

      <NewConversation
        open={newOpen}
        onClose={() => setNewOpen(false)}
        meId={meId}
        conversations={conversations}
        onOpened={(id) => { refresh(); openWindow(id); }}
      />
    </div>
  );
}

function ConvAvatar({ conv, size = 40 }: { conv: Conversation; size?: number }) {
  if (conv.type === 'team') {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-black/[0.04] border border-black/[0.08] text-black/55 flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <Icon name="users" size={Math.round(size * 0.45)} />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-black/[0.04] border border-black/[0.08] flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {conv.avatar ?? <Icon name="user" size={Math.round(size * 0.45)} className="text-black/45" />}
    </span>
  );
}

function ConversationPopover({
  conversations,
  onPick,
  onNew,
  onClose,
}: {
  conversations: Conversation[];
  onPick: (id: number) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    // Stín a vstup jako ostatní plovoucí panely (--shadow-float, pop-in), ne vlastní animace a 50% černá.
    <div className="w-80 max-w-[calc(100vw-1.5rem)] max-h-[min(70vh,calc(100dvh-200px))] rounded-3xl glass-strong shadow-[shadow:var(--shadow-float)] overflow-hidden flex flex-col pop-in">
      <div className="px-4 py-3 flex items-center justify-between border-b border-black/[0.06]">
        <span className="font-semibold text-[#16181A]">Zprávy</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onNew}
            className="btn-icon"
            aria-label="Nová zpráva"
            title="Nová zpráva"
          >
            <Icon name="plus" size={16} />
          </button>
          <Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Zavřít" onClick={onClose} />
        </div>
      </div>
      <div className="overflow-y-auto scrollbar-thin divide-y divide-black/[0.06]">
        {conversations.length === 0 && (
          <div className="p-2"><EmptyState icon="chat" compact title="Žádné konverzace"
            hint="Vyberte kolegu a napište mu — vlákno vznikne samo."
            action={<Button icon="plus" onClick={onNew}>Nová zpráva</Button>} /></div>
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
                {c.lastMessage === 'Příloha'
              ? <span className="inline-flex items-center gap-1"><Icon name="clipboard" size={13} className="shrink-0 opacity-70" />Příloha</span>
              : (c.lastMessage ?? 'Zatím žádné zprávy')}
              </span>
            </div>
            <Badge count={c.unreadCount} max={99} ring={false} className="shrink-0" label={`Nepřečtené: ${c.unreadCount}`} />
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
  const [sendError, setSendError] = useState('');
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
      setSendError('');
      onSent();
      return true;
    }
    return false;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText('');
    const ok = await doSend({ content: t });
    // The input was cleared optimistically; a failed send must give the text
    // back rather than swallow what the person wrote.
    if (!ok) {
      setText(t);
      setSendError('Zprávu se nepodařilo odeslat.');
    }
    setSending(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // Say it right away instead of uploading for a minute and then failing.
    if (file.size > MAX_UPLOAD_BYTES) {
      setSendError(`Soubor je příliš velký (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`);
      return;
    }
    setSendError('');
    setUploading(true);
    const up = await uploadFile(file);
    if ('error' in up) { setSendError(up.error); setUploading(false); return; }
    if (up) {
      await doSend({ attachmentUrl: up.url, attachmentType: up.type, attachmentName: up.name });
    } else {
      setSendError('Nahrání souboru se nezdařilo.');
    }
    setUploading(false);
  };

  return (
    <div
      className="w-80 max-w-[calc(100vw-1.5rem)] h-[440px] max-h-[calc(100dvh-200px)] rounded-3xl glass-strong shadow-[shadow:var(--shadow-float)] overflow-hidden flex flex-col pop-in"
      style={{ zIndex: 40 - offset }}
    >
      <header className="px-3 py-2.5 flex items-center gap-2 border-b border-black/[0.06]">
        <ConvAvatar conv={conv} size={32} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[#16181A] text-sm truncate">{conv.name}</div>
          {conv.type === 'team' && (
            <div className="text-[11px] text-black/45 leading-none">Týmový kanál</div>
          )}
        </div>
        <Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Zavřít" onClick={onClose} />
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-1.5">
        {messages.length === 0 && (
          <p className="text-center t-meta py-6">Zatím žádné zprávy.</p>
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

      {sendError && (
        <p className="px-2.5 pt-1.5 text-[11px] font-medium text-bad-ink flex items-center gap-1">
          <span aria-hidden><Icon name="warning" size={15} /></span> {sendError}
        </p>
      )}

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
            <span className="spinner spinner-sm" aria-hidden />
          ) : (
            <PaperclipIcon />
          )}
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Zpráva…"
          className="flex-1 min-w-0 field border border-black/[0.08] px-3 py-2 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
        />
        {/* Okno doku visí nad cizí obrazovkou, která má svou limetku —
            odeslání je tu tmavé (primary), ne druhá limetka. */}
        <Button type="submit" variant="primary" size="sm" iconOnly icon="send" aria-label="Odeslat"
          disabled={!text.trim() || sending} className="shrink-0" />
      </form>
    </div>
  );
}

function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
    </svg>
  );
}
