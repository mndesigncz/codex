'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Icon } from '@/components/Icons';
import { EmptyState, SearchField, Button } from '../ui';
import PollsStrip from './Polls';
import NewConversation from './NewConversation';
import {
  Conversation,
  ChatMessage,
  useConversations,
  useThreadMessages,
  sendMessage,
  uploadFile,
  MAX_UPLOAD_BYTES,
  markRead,
  formatTime,
  formatClock,
  dayKey,
  dayLabel,
} from './useChat';

interface Props {
  user: { id: number | string; name: string; role?: string; avatar?: string };
  /**
   * Konverzace, která se má otevřít rovnou po příchodu — proklik z doku,
   * z dlaždice v TO GO nebo z karty „poslední nepřečtená". Bez toho vedl
   * každý proklik jen na seznam a člověk musel vlákno hledat znovu.
   */
  openConversationId?: number | null;
}

export default function ChatView({ user, openConversationId = null }: Props) {
  const meId = typeof user.id === 'string' ? parseInt(user.id) : user.id;
  const { conversations, loading, refresh, setConversations } = useConversations();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const active = conversations.find((c) => c.id === activeId) ?? null;

  // Kolik zpráv bylo nepřečtených ve chvíli otevření. Otevření je totiž
  // zároveň přečtení — počítadlo se vynuluje dřív, než se vlákno vykreslí,
  // takže se to musí zapamatovat tady, ne uvnitř vlákna.
  const [unreadAtOpen, setUnreadAtOpen] = useState(0);

  const openConversation = useCallback(
    (id: number) => {
      setActiveId(id);
      markRead(id);
      setConversations((prev) => {
        setUnreadAtOpen(prev.find((c) => c.id === id)?.unreadCount ?? 0);
        return prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c));
      });
    },
    [setConversations],
  );

  // Proklik zvenčí. Otevře se jen tehdy, když je to nové id — jinak by
  // každé přeplnutí seznamu vrátilo člověka zpátky do vlákna, ze kterého
  // právě odešel.
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (openConversationId == null || handled.current === openConversationId) return;
    handled.current = openConversationId;
    openConversation(openConversationId);
  }, [openConversationId, openConversation]);

  const totalUnread = conversations.reduce((n, c) => n + c.unreadCount, 0);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return conversations.filter((c) => {
      if (onlyUnread && c.unreadCount === 0) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.lastMessage ?? '').toLowerCase().includes(needle)
      );
    });
  }, [conversations, q, onlyUnread]);

  return (
    <div className="h-full w-full flex overflow-hidden rounded-3xl glass-card">
      {/* Nadpis obrazovky. Vizuálně je zbytečný — celá plocha je zjevně
          chat —, ale kdo se po aplikaci pohybuje podle nadpisů, měl tu
          jedinou obrazovku bez záchytného bodu. */}
      <h1 className="sr-only">Chat</h1>
      {/* Conversation list */}
      <aside
        className={`${
          activeId ? 'hidden md:flex' : 'flex'
        } flex-col w-full md:w-80 xl:w-96 2xl:w-[26rem] md:flex-shrink-0 border-r border-black/[0.06] h-full`}
      >
        <div className="px-4 py-3.5 border-b border-black/[0.06] space-y-3">
          <div className="flex items-center gap-2">
            <Icon name="chat" size={22} className="text-[#5B7A08]" />
            <h2 className="t-section flex-1">Zprávy</h2>
            <Button size="sm" variant="secondary" icon="plus" onClick={() => setNewOpen(true)}>
              Nová
            </Button>
          </div>
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Hledat v konverzacích…"
            ariaLabel="Hledat v konverzacích"
            storageKey="chat"
          />
          {/* Filtr se ukazuje jen když je co filtrovat — prázdný přepínač
              „Nepřečtené (0)" je jen další věc, kterou musí oko přeskočit. */}
          {totalUnread > 0 && (
            <button
              type="button"
              onClick={() => setOnlyUnread((v) => !v)}
              aria-pressed={onlyUnread}
              className={`chip tap-target-sm ${onlyUnread ? 'seg-on' : 'seg-off glass'}`}
            >
              Nepřečtené · {totalUnread}
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-black/[0.06]">
          {loading && (
            <div className="p-6 text-center text-black/45 text-sm">Načítání…</div>
          )}
          {!loading && conversations.length === 0 && (
            <EmptyState
              illustration="chat"
              compact
              title="Zatím žádné konverzace"
              hint="Napište kolegovi — vlákno vznikne prvním odeslaným řádkem."
              action={<Button icon="plus" onClick={() => setNewOpen(true)}>Nová zpráva</Button>}
            />
          )}
          {!loading && conversations.length > 0 && shown.length === 0 && (
            <div className="p-6 text-center text-black/45 text-sm">
              {onlyUnread ? 'Všechno přečtené.' : 'Nic neodpovídá hledání.'}
            </div>
          )}
          {shown.map((c) => (
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
            unreadAtOpen={unreadAtOpen}
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

      <NewConversation
        open={newOpen}
        onClose={() => setNewOpen(false)}
        meId={meId}
        conversations={conversations}
        onOpened={(id) => { refresh(); openConversation(id); }}
      />
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
          <span className={`truncate ${conv.unreadCount > 0 ? 'font-bold text-[#16181A]' : 'font-medium text-[#16181A]'}`}>
            {conv.name}
          </span>
          <span className="text-[11px] text-black/45 flex-shrink-0">
            {formatTime(conv.lastTime)}
          </span>
        </div>
        {/* V provozním chatu nese zpráva pokyn („dodávka dorazí mezi devátou
            a jedenáctou"). Z jednoho useknutého řádku se přečetla třetina,
            takže náhled dostal řádky dva. */}
        <div className="flex items-start justify-between gap-2">
          <span className={`min-w-0 flex-1 text-sm line-clamp-2 ${conv.unreadCount > 0 ? 'text-[#16181A]/80 font-medium' : 'text-black/45'}`}>
            {conv.lastMessage === 'Příloha'
              ? <span className="inline-flex items-center gap-1"><Icon name="clipboard" size={13} className="shrink-0 opacity-70" />Příloha</span>
              : (conv.lastMessage ?? 'Zatím žádné zprávy')}
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
  if (conv.avatar && conv.avatar.trim()) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-black/[0.04] border border-black/[0.08] flex-shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
      >
        {conv.avatar}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-black/[0.04] border border-black/[0.08] text-black/45 flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <Icon name="user" size={Math.round(size * 0.45)} />
    </span>
  );
}

function Thread({
  conv,
  meId,
  unreadAtOpen,
  onBack,
  onSent,
}: {
  conv: Conversation;
  meId: number;
  /** Kolik zpráv bylo nepřečtených při otevření — nad první z nich jde čára. */
  unreadAtOpen: number;
  onBack: () => void;
  onSent: () => void;
}) {
  const { messages, setMessages, loading } = useThreadMessages(conv.id);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // Odskočit na konec při nové zprávě dává smysl jen tehdy, když je člověk
  // dole. Když se prohrabuje ránem, poskakující pohled je nepříjemný.
  useEffect(() => {
    if (atBottom) scrollToBottom(messages.length > 0 ? 'smooth' : 'auto');
  }, [messages, atBottom, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const autoGrow = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, []);

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
      setAtBottom(true);
      onSent();
      return true;
    }
    return false;
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText('');
    requestAnimationFrame(autoGrow);
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
    if (up) {
      await doSend({
        attachmentUrl: up.url,
        attachmentType: up.type,
        attachmentName: up.name,
      });
    } else {
      setSendError('Nahrání souboru se nezdařilo.');
    }
    setUploading(false);
  };

  // Index první nepřečtené zprávy — nad ni patří čára. Nula znamená, že
  // nepřečtené bylo celé vlákno; tam čára nemá co oddělovat.
  const firstUnread = unreadAtOpen > 0 && unreadAtOpen < messages.length
    ? messages.length - unreadAtOpen
    : -1;

  return (
    <>
      <header className="px-4 py-3 border-b border-black/[0.06] flex items-center gap-3">
        <button
          onClick={onBack}
          className="tap-target-sm md:hidden text-black/60 hover:text-black p-1 -ml-1"
          aria-label="Zpět"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <Avatar conv={conv} size={38} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[#16181A] truncate">{conv.name}</div>
          <div className="text-[11px] text-black/45">
            {conv.type === 'team' ? 'Týmový kanál — vidí celý tým' : 'Jen vy dva'}
          </div>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-2"
      >
        {conv.type === 'team' && <PollsStrip meId={meId} />}
        {loading && (
          <div className="text-center text-black/45 text-sm py-6">Načítání…</div>
        )}
        {!loading && messages.length === 0 && (
          <EmptyState illustration="chat" title="Zatím žádné zprávy" hint="Napiš první — tým to uvidí v aplikaci i na kiosku." compact />
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          // Oddělovač dne. Dlouhé vlákno bez něj je jedna stěna a u zprávy
          // „přijdu později" se nedá poznat, jestli je z dneška nebo z minulého týdne.
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          return (
            <div key={m.id} className="space-y-2">
              {newDay && (
                <div className="flex items-center gap-3 pt-2 pb-1">
                  <span className="h-px flex-1 bg-black/[0.07]" />
                  <span className="t-label text-black/40">{dayLabel(m.createdAt)}</span>
                  <span className="h-px flex-1 bg-black/[0.07]" />
                </div>
              )}
              {i === firstUnread && (
                <div className="flex items-center gap-3 pt-1 pb-1">
                  <span className="h-px flex-1 bg-[#C8F542]" />
                  <span className="t-label text-[#5B7A08]">Nepřečtené</span>
                  <span className="h-px flex-1 bg-[#C8F542]" />
                </div>
              )}
              <MessageBubble
                msg={m}
                own={m.senderId === meId}
                dayShown
                showSender={conv.type === 'team' && m.senderId !== meId && (newDay || prev?.senderId !== m.senderId)}
              />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Skok na konec — když se člověk prohrabuje starším a zatím mezitím
          přijde zpráva, nemá ji jak najít jinak než ručním scrollováním. */}
      {!atBottom && messages.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => { setAtBottom(true); scrollToBottom(); }}
            className="absolute -top-14 right-4 z-10 btn-icon bg-[#16181A] text-[#C8F542] shadow-lg"
            aria-label="Přejít na konec"
          >
            <Icon name="chevron" size={16} className="rotate-90" />
          </button>
        </div>
      )}

      {sendError && (
        <p className="px-3 pt-2 text-xs font-medium text-bad-ink flex items-center gap-1.5">
          <span aria-hidden><Icon name="warning" size={15} /></span> {sendError}
        </p>
      )}

      <form
        onSubmit={handleSend}
        className="px-3 py-3 border-t border-black/[0.06] flex items-end gap-2"
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
        {/* Jednořádkové pole nutilo psát provozní pokyn do jedné věty, nebo
            ho poslat po kouskách. Pole roste s textem; Enter odešle,
            Shift+Enter udělá nový řádek — jako všude jinde. */}
        <textarea
          ref={boxRef}
          rows={1}
          value={text}
          onChange={(e) => { setText(e.target.value); autoGrow(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder="Napište zprávu…"
          aria-label="Text zprávy"
          className="flex-1 min-w-0 resize-none field border border-black/[0.08] px-4 py-2.5 leading-snug text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
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
  dayShown = false,
}: {
  msg: ChatMessage;
  own: boolean;
  showSender: boolean;
  /**
   * Vlákno má nad každým dnem čáru s datem, takže bublina pod ní psala den
   * podruhé („Včera" v bublině hned pod oddělovačem VČERA). S touhle
   * hodnotou ukáže jen hodinu; v doku, kde čáry nejsou, zůstává datum.
   */
  dayShown?: boolean;
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
          className={`text-[11px] mt-1 ${own ? 'on-accent-muted' : 'text-black/45'} text-right`}
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
