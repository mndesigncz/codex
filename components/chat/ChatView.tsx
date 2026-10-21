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
  toggleReaction,
  uploadFile,
  MAX_UPLOAD_BYTES,
  markRead,
  formatTime,
  formatClock,
  dayKey,
  dayLabel,
  TEXT_PRILOHA,
} from './useChat';
import { useT } from '@/lib/i18n/client';
import { useDraft } from '@/lib/useDraft';
import { prvniNeprectenaId } from '@/lib/chatVlakno';
import { EMOJI_REAKCI, kdoVidel, posledniVlastniId, prepniReakci, shrnJmena, uryvekZpravy } from '@/lib/chatReakce';
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
  const t = useT('chat');
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
      <h1 className="sr-only">{t('Chat')}</h1>
      {/* Conversation list */}
      <aside
        className={`${
          activeId ? 'hidden md:flex' : 'flex'
        } flex-col w-full md:w-80 xl:w-96 2xl:w-[26rem] md:flex-shrink-0 border-r border-black/[0.06] h-full`}
      >
        <div className="px-4 py-3.5 border-b border-black/[0.06] space-y-3">
          <div className="flex items-center gap-2">
            <Icon name="chat" size={17} className="shrink-0 text-black/40" />
            <h2 className="t-section flex-1">{t('Zprávy')}</h2>
            <Button size="sm" variant="secondary" icon="plus" onClick={() => setNewOpen(true)}>
              {t('Nová')}
            </Button>
          </div>
          {/* v4 (P10, V05): hledání a filtr v jedné řadě 44 — pole pružné, „Nepřečtené" na pravé hraně.
              Dřív se filtr zalomil pod pole na levý okraj a měl 36 vedle pole 44. */}
          <div className="rada rada-pruzna rada-m">
            <SearchField
              value={q}
              onChange={setQ}
              placeholder={t('Hledat v konverzacích…')}
              ariaLabel={t('Hledat v konverzacích')}
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
                className={`filter-pill tap-target-sm whitespace-nowrap ${onlyUnread ? 'seg-on' : 'seg-off glass'}`}
              >
                {t('Nepřečtené · {n}', { n: totalUnread })}
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-black/[0.06]">
          {loading && (
            <div className="p-4 space-y-3" aria-busy="true" aria-label={t('Načítám konverzace')}>
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          )}
          {!loading && conversations.length === 0 && (
            <EmptyState
              illustration="chat"
              compact
              title={t('Zatím žádné konverzace')}
              hint={t('Napište kolegovi — vlákno vznikne prvním odeslaným řádkem.')}
              action={<Button icon="plus" onClick={() => setNewOpen(true)}>{t('Nová zpráva')}</Button>}
            />
          )}
          {!loading && conversations.length > 0 && shown.length === 0 && (
            <p className="p-6 text-center t-meta">
              {onlyUnread ? t('Všechno přečtené.') : t('Nic neodpovídá hledání.')}
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
            <p className="text-sm">{t('Vyberte konverzaci')}</p>
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
  const t = useT('chat');
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
            {formatTime(conv.lastTime, t)}
          </span>
        </div>
        {/* V provozním chatu nese zpráva pokyn („dodávka dorazí mezi devátou
            a jedenáctou"). Z jednoho useknutého řádku se přečetla třetina,
            takže náhled dostal řádky dva. */}
        <div className="flex items-start justify-between gap-2">
          <span className={`min-w-0 flex-1 text-sm line-clamp-2 ${conv.unreadCount > 0 ? 'text-black/80 font-medium' : 'text-black/45'}`}>
            {conv.lastMessage === TEXT_PRILOHA
              ? <span className="inline-flex items-center gap-1"><Icon name="clipboard" size={13} className="shrink-0 opacity-70" />{t('Příloha')}</span>
              : (conv.lastMessage ?? t('Zatím žádné zprávy'))}
          </span>
          {/* Jeden odznak pro celou aplikaci (DP §3.20), ne ruční limetka. */}
          <Badge count={conv.unreadCount} max={99} ring={false} className="shrink-0 mt-0.5"
            label={t('Nepřečtené: {n}', { n: conv.unreadCount })} />
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
  const t = useT('chat');
  const { messages, setMessages, members, loading } = useThreadMessages(conv.id);
  // Kolo 8: odpověď cituje zprávu (pruh nad polem), reakce se přepínají optimisticky, „Viděli" z last_read_at.
  const [odpovedNa, setOdpovedNa] = useState<ChatMessage | null>(null);
  const [reakceChyba, setReakceChyba] = useState('');
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
      if (!r.ok) { setModeraceZprava(d.error || t('Zablokovat se nepodařilo.')); return; }
      setMessages(prev => prev.filter(x => x.senderId !== m.senderId));
      setModeraceZprava(t('Uživatel {jmeno} je zablokovaný a jeho zprávy se nezobrazují. Odblokovat jde v Nastavení, Zabezpečení.', { jmeno: m.senderName }));
    } catch { setModeraceZprava(t('Zablokovat se nepodařilo. Zkontrolujte připojení.')); }
  };
  const smazZpravu = async (m: ChatMessage) => {
    setModeraceZprava('');
    try {
      const r = await fetch(`/api/conversations/${conv.id}/messages/${m.id}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setModeraceZprava(d.error || t('Zprávu se nepodařilo smazat.')); return; }
      setMessages(prev => prev.filter(x => x.id !== m.id));
    } catch { setModeraceZprava(t('Zprávu se nepodařilo smazat. Zkontrolujte připojení.')); }
  };
  const reagovat = async (m: ChatMessage, emoji: string) => {
    setReakceChyba('');
    const puvodni = m.reactions ?? [];
    setMessages(prev => prev.map(x => (x.id === m.id ? { ...x, reactions: prepniReakci(puvodni, emoji, { id: meId, name: t('Ty') }) } : x)));
    const nove = await toggleReaction(conv.id, m.id, emoji);
    if (nove) setMessages(prev => prev.map(x => (x.id === m.id ? { ...x, reactions: nove } : x)));
    else { setMessages(prev => prev.map(x => (x.id === m.id ? { ...x, reactions: puvodni } : x))); setReakceChyba(t('Reakci se nepodařilo uložit.')); }
  };
  const odpovedet = (m: ChatMessage) => { setOdpovedNa(m); boxRef.current?.focus(); };
  const skocNa = (id: number) => {
    const el = document.getElementById(`zprava-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('ring-2', 'ring-[#C8F542]', 'rounded-3xl');
    setTimeout(() => el.classList.remove('ring-2', 'ring-[#C8F542]', 'rounded-3xl'), 1200);
  };
  const akceZpravy = (m: ChatMessage): MenuItem[] => {
    const own = m.senderId === meId;
    const out: MenuItem[] = [{ label: t('Odpovědět'), icon: 'chat', onClick: () => odpovedet(m) }];
    if (!own) {
      out.push({ label: t('Nahlásit zprávu'), icon: 'warning', onClick: () => setNahlasit(m.id) });
      out.push({ label: t('Zablokovat autora'), icon: 'lock', onClick: () => { void zablokuj(m); } });
    }
    if (own || moderator) out.push({ label: t('Smazat zprávu'), icon: 'trash', danger: true, onClick: () => { void smazZpravu(m); } });
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
    replyTo?: number | null;
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
    const obsah = text.trim();
    if (!obsah || sending) return;
    setSending(true);
    setText('');
    koncept.hotovo();
    requestAnimationFrame(autoGrow);
    const ok = await doSend({ content: obsah, replyTo: odpovedNa?.id ?? null });
    if (ok) setOdpovedNa(null);
    // The input was cleared optimistically; a failed send must give the text
    // back rather than swallow what the person wrote.
    if (!ok) {
      setText(obsah);
      setSendError(t('Zprávu se nepodařilo odeslat.'));
    }
    setSending(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // Say it right away instead of uploading for a minute and then failing.
    if (file.size > MAX_UPLOAD_BYTES) {
      setSendError(t('Soubor je příliš velký (max {n} MB).', { n: Math.round(MAX_UPLOAD_BYTES / 1024 / 1024) }));
      return;
    }
    setSendError('');
    setUploading(true);
    const up = await uploadFile(file, t);
    if ('error' in up) { setSendError(up.error); setUploading(false); return; }
    if (up) {
      await doSend({
        attachmentUrl: up.url,
        attachmentType: up.type,
        attachmentName: up.name,
      });
    } else {
      setSendError(t('Nahrání souboru se nezdařilo.'));
    }
    setUploading(false);
  };

  const posledniVlastni = posledniVlastniId(messages, meId);

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
        <Button variant="ghost" size="sm" iconOnly aria-label={t('Zpět')} onClick={onBack} className="md:hidden -ml-1">
          <Icon name="chevronRight" size={18} className="rotate-180" />
        </Button>
        <Avatar conv={conv} size={38} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[#16181A] truncate">{conv.name}</div>
          <div className="t-meta">
            {conv.type === 'team' ? t('Týmový kanál — vidí celý tým') : t('Jen vy dva')}
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
          <div className="space-y-2 py-2" aria-busy="true" aria-label={t('Načítám zprávy')}>
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-10 w-1/2 ml-auto" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <EmptyState illustration="chat" title={t('Zatím žádné zprávy')} hint={t('Napiš první — tým to uvidí v aplikaci i na kiosku.')} compact />
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          // „Viděli" jen u poslední vlastní zprávy: v týmu jména, v soukromé konverzaci čas přečtení.
          let videli: string | undefined;
          if (m.id === posledniVlastni) {
            if (conv.type === 'direct') {
              const druhy = members.find(c => c.id !== meId);
              videli = druhy && kdoVidel(members, m).length ? t('Přečteno {cas}', { cas: formatClock(druhy.lastReadAt, t) }) : undefined;
            } else {
              const j = shrnJmena(kdoVidel(members, m));
              videli = j.text ? (j.dalsich ? t('Viděli: {jmena} +{n}', { jmena: j.text, n: j.dalsich }) : t('Viděli: {jmena}', { jmena: j.text })) : undefined;
            }
          }
          // Oddělovač dne. Dlouhé vlákno bez něj je jedna stěna a u zprávy
          // „přijdu později" se nedá poznat, jestli je z dneška nebo z minulého týdne.
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          return (
            <div key={m.id} className="space-y-2">
              {newDay && (
                <div className="flex items-center gap-3 pt-2 pb-1">
                  <span className="h-px flex-1 bg-black/[0.07]" />
                  <span className="t-label text-black/40">{dayLabel(m.createdAt, t)}</span>
                  <span className="h-px flex-1 bg-black/[0.07]" />
                </div>
              )}
              {m.id === firstUnreadId && (
                <div className="flex items-center gap-3 pt-1 pb-1">
                  <span className="h-px flex-1 bg-[#C8F542]" />
                  <span className="t-label text-[#5B7A08]">{t('Nepřečtené')}</span>
                  <span className="h-px flex-1 bg-[#C8F542]" />
                </div>
              )}
              <MessageBubble
                msg={m}
                own={m.senderId === meId}
                dayShown
                showSender={conv.type === 'team' && m.senderId !== meId && (newDay || prev?.senderId !== m.senderId)}
                akce={akceZpravy(m)}
                meId={meId}
                onReagovat={emoji => { void reagovat(m, emoji); }}
                onOdpovedet={() => odpovedet(m)}
                onSkocNa={skocNa}
                videli={videli}
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
            aria-label={t('Přejít na konec')}
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
      {(sendError || reakceChyba) && (
        <p className="px-3 pt-2 text-xs font-medium text-bad-ink flex items-center gap-1.5">
          <span aria-hidden><Icon name="warning" size={15} /></span> {sendError || reakceChyba}
        </p>
      )}
      {/* Odpověď: citace nad polem (šedý pruh), křížek ji zruší — zpráva pak odejde bez vazby. */}
      {odpovedNa && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-2xl bg-[var(--well)] border border-[var(--well-line)] px-3 py-2" data-odpoved-na={odpovedNa.id}>
          <span aria-hidden className="mt-0.5 h-8 w-0.5 shrink-0 rounded-full bg-[#5B7A08]" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-[#16181A]">{t('Odpověď na {jmeno}', { jmeno: odpovedNa.senderId === meId ? t('Ty') : odpovedNa.senderName })}</p>
            <p className="t-meta truncate">{uryvekZpravy(odpovedNa.content) ?? t('Příloha')}</p>
          </div>
          <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={t('Zrušit odpověď')} onClick={() => setOdpovedNa(null)} className="-my-1 -mr-1" />
        </div>
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
          aria-label={t('Připojit soubor')}
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
          placeholder={t('Napište zprávu…')}
          aria-label={t('Text zprávy')}
          className="flex-1 min-w-0 resize-none field border border-black/[0.08] px-4 py-2.5 leading-snug text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
        />
        {/* Odeslat je hlavní akce vlákna → jediná limetka obrazovky. */}
        <Button type="submit" variant="accent" iconOnly icon="send" aria-label={t('Odeslat')}
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
  meId,
  onReagovat,
  onOdpovedet,
  onSkocNa,
  videli,
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
  /** Kolo 8: reakce (najetí na monitoru, podržení na dotyku), odpověď, skok na citovanou zprávu a „Viděli". */
  meId?: number;
  onReagovat?: (emoji: string) => void;
  onOdpovedet?: () => void;
  onSkocNa?: (id: number) => void;
  videli?: string;
}) {
  const t = useT('chat');
  // Lišta reakcí po podržení prstu (na monitoru stačí najetí — CSS group-hover).
  const [lista, setLista] = useState(false);
  const drzeni = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zrusDrzeni = () => { if (drzeni.current) { clearTimeout(drzeni.current); drzeni.current = null; } };
  const zacniDrzeni = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || !onReagovat) return;
    zrusDrzeni();
    drzeni.current = setTimeout(() => { drzeni.current = null; setLista(true); }, 450);
  };
  useEffect(() => {
    if (!lista) return;
    const zavri = (e: Event) => { if (!(e.target as Element | null)?.closest?.(`[data-zprava="${msg.id}"]`)) setLista(false); };
    document.addEventListener('pointerdown', zavri, true);
    return () => document.removeEventListener('pointerdown', zavri, true);
  }, [lista, msg.id]);
  const reakce = msg.reactions ?? [];
  const mojeReakce = (emoji: string) => meId != null && reakce.some(r => r.emoji === emoji && r.userIds.includes(meId));
  return (
    <div className={`flex flex-col ${own ? 'items-end' : 'items-start'}`} id={`zprava-${msg.id}`} data-zprava={msg.id}>
      {showSender && (
        <span className="text-xs text-black/55 ml-3 mb-0.5">{msg.senderName}</span>
      )}
      <div className={`group relative flex items-end gap-1 max-w-full ${own ? 'flex-row-reverse' : ''}`}
        onPointerDown={zacniDrzeni} onPointerUp={zrusDrzeni} onPointerCancel={zrusDrzeni} onPointerMove={zrusDrzeni}
        onContextMenu={e => { if (lista) e.preventDefault(); }}>
      {onReagovat && (
        // Lišta 👍 ✅ ❤️ 😂 + Odpovědět: na monitoru po najetí nebo s fokusem, na dotyku po podržení (0,45 s).
        <div role="toolbar" aria-label={t('Reagovat')} data-lista-reakci={lista ? '' : undefined}
          className={`absolute -top-9 ${own ? 'right-0' : 'left-0'} z-10 flex items-center gap-0.5 rounded-full glass-strong px-1 py-0.5 shadow-[shadow:var(--shadow-float)] transition-opacity
            ${lista ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto [@media(hover:none)]:group-hover:opacity-0 [@media(hover:none)]:group-hover:pointer-events-none'}`}>
          {EMOJI_REAKCI.map(e => (
            <button key={e} type="button" onClick={() => { setLista(false); onReagovat(e); }} aria-pressed={mojeReakce(e)}
              aria-label={t('Reagovat {emoji}', { emoji: e })}
              className={`tap-target-sm grid h-8 w-8 place-items-center rounded-full text-base leading-none transition-colors hover:bg-black/[0.06] ${mojeReakce(e) ? 'bg-[var(--ok-bg)]' : ''}`}>
              <span aria-hidden>{e}</span>
            </button>
          ))}
          {onOdpovedet && (
            <button type="button" onClick={() => { setLista(false); onOdpovedet(); }} aria-label={t('Odpovědět')} title={t('Odpovědět')}
              className="tap-target-sm grid h-8 w-8 place-items-center rounded-full text-black/60 transition-colors hover:bg-black/[0.06] hover:text-black">
              <Icon name="chat" size={15} />
            </button>
          )}
        </div>
      )}
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
              alt={msg.attachmentName ?? t('obrázek')}
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
              {msg.attachmentName ?? t('Soubor')}
            </span>
          </a>
        )}
        {/* Citovaná zpráva: šedý pruh nad textem, klepnutí skočí na originál. */}
        {msg.replyTo && (
          <button type="button" onClick={() => onSkocNa?.(msg.replyTo!.id)} disabled={!onSkocNa} aria-label={t('Přejít na původní zprávu')}
            className={`mb-1.5 block w-full max-w-full rounded-xl border-l-2 border-[#5B7A08]/60 bg-black/[0.04] px-2.5 py-1.5 text-left ${onSkocNa ? 'hover:bg-black/[0.07]' : ''}`}>
            <span className="block text-[11px] font-semibold text-black/60 truncate">{msg.replyTo.senderName}</span>
            <span className="block text-[12px] text-black/60 truncate">{msg.replyTo.content || t('Příloha')}</span>
          </button>
        )}
        {msg.content && (
          <p className={`whitespace-pre-wrap break-words ${msg.attachmentUrl ? 'mt-1.5' : ''}`}>
            {msg.content}
          </p>
        )}
        <div
          className="text-[11px] mt-1 text-black/55 text-right tabular-nums"
        >
          {dayShown ? formatClock(msg.createdAt, t) : formatTime(msg.createdAt, t)}
        </div>
      </div>
      {akce && akce.length > 0 && (
        // Na počítači se nabídka ukáže po najetí nebo fokusu, na dotykovém zařízení je vidět vždy.
        <Menu items={akce} size="sm" label={t('Akce se zprávou')} align={own ? 'left' : 'right'}
          className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity" />
      )}
      </div>
      {/* Reakce pod bublinou: malé chipy s počtem („👍 4"), vlastní zvýrazněná; popisek nese, kdo reagoval. */}
      {reakce.length > 0 && (
        <div className={`mt-1 flex flex-wrap gap-1 ${own ? 'justify-end' : ''}`} data-reakce={msg.id}>
          {reakce.map(r => (
            <button key={r.emoji} type="button" onClick={onReagovat ? () => onReagovat(r.emoji) : undefined} disabled={!onReagovat}
              aria-pressed={meId != null && r.userIds.includes(meId)} title={r.jmena.join(', ')}
              aria-label={t('Reakce {emoji}: {jmena}', { emoji: r.emoji, jmena: r.jmena.join(', ') })}
              className={`chip chip-sm tap-target-sm tabular-nums ${meId != null && r.userIds.includes(meId) ? 'chip-ok' : 'chip-muted'} ${onReagovat ? 'hover:brightness-95' : ''}`}>
              <span aria-hidden>{r.emoji}</span> {r.pocet}
            </button>
          ))}
        </div>
      )}
      {videli && <span className="mt-0.5 mr-1 text-[11px] text-black/50" data-videli="">{videli}</span>}
    </div>
  );
}
