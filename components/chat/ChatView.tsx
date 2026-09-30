'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Icon } from '@/components/Icons';
import { EmptyState, SearchField, Button, Badge, Skeleton } from '../ui';
import { Menu, type MenuItem } from '../ui/Menu';
import NahlasitOkno from '../moderace/NahlasitOkno';
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
import { useDraft } from '@/lib/useDraft';
import { prvniNeprectenaId } from '@/lib/chatVlakno';
import { useOpravneni } from '../role/useOpravneni';
import { obsahuje, obsahujeNekde } from '@/lib/hledani';

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
        obsahujeNekde(needle, c.name, c.lastMessage)
      );
    });
  }, [conversations, q, onlyUnread]);

  return (
    // Jediná karta obrazovky (DP §3.9). Dřív `glass-card` ve skleněném rámu
    // layoutu — na snímku dvojitý okraj a stín.
    <div className="card h-full w-full flex overflow-hidden">
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
            <Icon name="chat" size={17} className="shrink-0 text-black/40" />
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
              // .chip má odsazení v :where() a preflight tlačítka ho vynuloval —
              // text narážel na rámeček. filter-pill je v @layer components.
              className={`filter-pill tap-target-sm ${onlyUnread ? 'seg-on' : 'seg-off glass'}`}
            >
              Nepřečtené · {totalUnread}
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-black/[0.06]">
          {loading && (
            <div className="p-4 space-y-3" aria-busy="true" aria-label="Načítám konverzace">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
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
            <p className="p-6 text-center t-meta">
              {onlyUnread ? 'Všechno přečtené.' : 'Nic neodpovídá hledání.'}
            </p>
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
            <Icon name="chat" size={48} className="text-black/15" />
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
        active ? 'bg-black/[0.04]' : 'hover:bg-black/[0.03]'
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
          <span className={`min-w-0 flex-1 text-sm line-clamp-2 ${conv.unreadCount > 0 ? 'text-black/80 font-medium' : 'text-black/45'}`}>
            {conv.lastMessage === 'Příloha'
              ? <span className="inline-flex items-center gap-1"><Icon name="clipboard" size={13} className="shrink-0 opacity-70" />Příloha</span>
              : (conv.lastMessage ?? 'Zatím žádné zprávy')}
          </span>
          {/* Jeden odznak pro celou aplikaci (DP §3.20), ne ruční limetka. */}
          <Badge count={conv.unreadCount} max={99} ring={false} className="shrink-0 mt-0.5"
            label={`Nepřečtené: ${conv.unreadCount}`} />
        </div>
      </div>
    </button>
  );
}

function Avatar({ conv, size = 44 }: { conv: Conversation; size?: number }) {
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
  // Cizí anketu smí zavřít ten, kdo spravuje ankety (server to hlídá stejným
  // klíčem). Do ankety se dřív předávalo jen meId, takže „Uzavřít“ viděl
  // jen autor. Před načtením oprávnění tlačítko nekreslíme (`ma()` by tehdy
  // odpovídalo ano).
  const { ma, nacteno } = useOpravneni();
  const jeVedeni = nacteno && ma('oznameni.spravovat');
  // Moderace (Apple 1.2): nahlásit zprávu, zablokovat autora, smazat zprávu. Cizí zprávu
  // smí smazat jen ten, kdo smí odebírat členy; server to hlídá stejným klíčem.
  const moderator = nacteno && ma('tym.odebrat');
  const [nahlasit, setNahlasit] = useState<number | null>(null);
  const [moderaceZprava, setModeraceZprava] = useState('');
  const zablokuj = async (m: ChatMessage) => {
    setModeraceZprava('');
    try {
      const r = await fetch('/api/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: m.senderId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setModeraceZprava(d.error || 'Zablokovat se nepodařilo.'); return; }
      setMessages(prev => prev.filter(x => x.senderId !== m.senderId));
      setModeraceZprava(`Uživatel ${m.senderName} je zablokovaný a jeho zprávy se nezobrazují. Odblokovat jde v Nastavení, Zabezpečení.`);
    } catch { setModeraceZprava('Zablokovat se nepodařilo. Zkontrolujte připojení.'); }
  };
  const smazZpravu = async (m: ChatMessage) => {
    setModeraceZprava('');
    try {
      const r = await fetch(`/api/conversations/${conv.id}/messages/${m.id}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setModeraceZprava(d.error || 'Zprávu se nepodařilo smazat.'); return; }
      setMessages(prev => prev.filter(x => x.id !== m.id));
    } catch { setModeraceZprava('Zprávu se nepodařilo smazat. Zkontrolujte připojení.'); }
  };
  const akceZpravy = (m: ChatMessage): MenuItem[] => {
    const own = m.senderId === meId;
    const out: MenuItem[] = [];
    if (!own) {
      out.push({ label: 'Nahlásit zprávu', icon: 'warning', onClick: () => setNahlasit(m.id) });
      out.push({ label: 'Zablokovat autora', icon: 'lock', onClick: () => { void zablokuj(m); } });
    }
    if (own || moderator) out.push({ label: 'Smazat zprávu', icon: 'trash', danger: true, onClick: () => { void smazZpravu(m); } });
    return out;
  };
  const [text, setText] = useState('');
  // Rozepsaná zpráva je vázaná na kanál: přepnu jinam, vrátím se a mám ji
  // tam, kde byla. Banner se tu nevykresluje schválně — viz DESIGN.md:
  // poznámka patří formuláři, který se sám předvyplní a překvapí. Zpráva
  // v okně chatu je přesně tam, kde jsem ji nechal, a mluví sama za sebe.
  const koncept = useDraft(`chat-${conv.id}`, { text }, (v) => setText(v.text), {
    vychozi: { text: '' },
  });
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
    koncept.hotovo();
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
    if ('error' in up) { setSendError(up.error); setUploading(false); return; }
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

  // Čára „Nepřečtené“ se přišpendlí k id zprávy při prvním načtení vlákna;
  // odvozená z živé délky by se posouvala s každou novou zprávou.
  const [firstUnreadId, setFirstUnreadId] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (firstUnreadId !== undefined || loading || messages.length === 0) return;
    setFirstUnreadId(prvniNeprectenaId(messages, unreadAtOpen));
  }, [firstUnreadId, loading, messages, unreadAtOpen]);

  return (
    <>
      <header className="px-4 py-3 border-b border-black/[0.06] flex items-center gap-3">
        <Button variant="ghost" size="sm" iconOnly aria-label="Zpět" onClick={onBack} className="md:hidden -ml-1">
          <Icon name="chevronRight" size={18} className="rotate-180" />
        </Button>
        <Avatar conv={conv} size={38} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[#16181A] truncate">{conv.name}</div>
          <div className="t-meta">
            {conv.type === 'team' ? 'Týmový kanál — vidí celý tým' : 'Jen vy dva'}
          </div>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-2"
      >
        {conv.type === 'team' && <PollsStrip meId={meId} isEmployer={jeVedeni} />}
        {loading && (
          <div className="space-y-2 py-2" aria-busy="true" aria-label="Načítám zprávy">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-10 w-1/2 ml-auto" />
          </div>
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
              {m.id === firstUnreadId && (
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
                akce={akceZpravy(m)}
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

      {moderaceZprava && <p role="status" className="px-3 pt-2 t-meta">{moderaceZprava}</p>}
      {nahlasit != null && (
        <NahlasitOkno kind="zprava" refId={nahlasit} onClose={() => setNahlasit(null)}
          onDone={(z) => { setNahlasit(null); setModeraceZprava(z); }} />
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
          {/* Bílé kolečko na bílé liště nebylo vidět — při nahrávání to
              vypadalo, že se nic neděje. */}
          {uploading ? (
            <span className="spinner spinner-sm" aria-hidden />
          ) : (
            <Icon name="paperclip" size={20} />
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
        {/* Odeslat je hlavní akce vlákna → jediná limetka obrazovky. */}
        <Button type="submit" variant="accent" iconOnly icon="send" aria-label="Odeslat"
          disabled={!text.trim() || sending} className="shrink-0" />
      </form>
    </>
  );
}

export function MessageBubble({
  msg,
  own,
  showSender,
  dayShown = false,
  akce,
}: {
  msg: ChatMessage;
  own: boolean;
  showSender: boolean;
  /** Nabídka u zprávy: nahlásit, zablokovat, smazat (moderace). Bez ní se nekreslí. */
  akce?: MenuItem[];
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
        <span className="text-xs text-black/55 ml-3 mb-0.5">{msg.senderName}</span>
      )}
      <div className={`group flex items-end gap-1 max-w-full ${own ? 'flex-row-reverse' : ''}`}>
      <div
        className={`max-w-[78%] px-4 py-2.5 ${
          own
            // Vlastní bublina jemným tónem, ne plnou limetkou: ve vlákně by
            // limetka převládla a splynula s tlačítkem Odeslat (DP T3).
            // Roh xl místo lg — 8 px je mimo škálu rádiusů.
            ? 'bg-[var(--ok-bg)] text-[#16181A] rounded-3xl rounded-br-xl'
            : 'bg-[var(--well)] border border-[var(--well-line)] text-[#16181A] rounded-3xl rounded-bl-xl'
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
            {/* Sponka i u přijaté přílohy: stejný znak jako tlačítko „Připojit
                soubor", takže je jasné, že jde o totéž. */}
            <Icon name="paperclip" size={18} className="flex-shrink-0" />
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
          className="text-[11px] mt-1 text-black/55 text-right tabular-nums"
        >
          {dayShown ? formatClock(msg.createdAt) : formatTime(msg.createdAt)}
        </div>
      </div>
      {akce && akce.length > 0 && (
        // Na počítači se nabídka ukáže po najetí nebo fokusu, na dotykovém zařízení je vidět vždy.
        <Menu items={akce} size="sm" label="Akce se zprávou" align={own ? 'left' : 'right'}
          className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity" />
      )}
      </div>
    </div>
  );
}
