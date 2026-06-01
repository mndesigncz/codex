import { useState, useRef, useEffect } from 'react';
import { messages as initialMessages, employees, currentEmployer } from '../../data/mockData.js';

export default function Chat({ user }) {
  const [messages, setMessages] = useState(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  const [quickMessage, setQuickMessage] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (text) => {
    const content = (text || newMessage).trim();
    if (!content) return;
    const msg = {
      id: Date.now(),
      senderId: user.id,
      senderName: user.name,
      senderAvatar: user.avatar,
      content,
      timestamp: new Date().toISOString(),
      channel: 'general',
      isRead: true,
    };
    setMessages(prev => [...prev, msg]);
    setNewMessage('');
    setQuickMessage('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

  const formatDate = (ts) => {
    const d = new Date(ts);
    const today = new Date();
    const diff = Math.floor((today - d) / 86400000);
    if (diff === 0) return 'Dnes';
    if (diff === 1) return 'Včera';
    return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' });
  };

  const groupedMessages = messages.reduce((groups, msg) => {
    const date = formatDate(msg.timestamp);
    if (!groups[date]) groups[date] = [];
    groups[date].push(msg);
    return groups;
  }, {});

  const quickMessages = [
    '🤒 Jsem nemocný/á, nemohu přijít na dnešní směnu.',
    '⏰ Přijdu o 15 minut pozdě.',
    '✅ Jsem na místě, otevírám.',
    '🔄 Potřebuji vyměnit směnu, může někdo zaskočit?',
    '📦 Dochází zásoby – informuji vedení.',
    '✓ Směna proběhla v pořádku, zavírám.',
  ];

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 bg-matcha-800 text-white flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-matcha-700">
          <h3 className="font-bold text-sm uppercase tracking-wide text-matcha-300">Kanály</h3>
        </div>
        <div className="p-2">
          {[
            { name: '# obecný', active: true },
            { name: '# směny', active: false },
            { name: '# sklad', active: false },
          ].map(ch => (
            <button
              key={ch.name}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                ch.active ? 'bg-matcha-600 text-white' : 'text-matcha-300 hover:bg-matcha-700'
              }`}
            >
              {ch.name}
            </button>
          ))}
        </div>

        <div className="px-4 py-4 border-t border-b border-matcha-700 mt-2">
          <h3 className="font-bold text-sm uppercase tracking-wide text-matcha-300">Tým</h3>
        </div>
        <div className="p-2 flex-1">
          {[currentEmployer, ...employees].map((member, i) => {
            const isMe = member.id === user.id;
            return (
              <div key={member.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isMe ? 'bg-matcha-700 text-white' : 'text-matcha-200'}`}>
                <div className="relative">
                  <span className="text-xl">{member.avatar}</span>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-matcha-800 ${i < 3 ? 'bg-green-400' : 'bg-tea-500'}`}></span>
                </div>
                <span className="truncate">{member.name.split(' ')[0]}{isMe ? ' (já)' : ''}</span>
              </div>
            );
          })}
        </div>

        {/* Quick messages */}
        <div className="px-4 py-3 border-t border-matcha-700">
          <p className="text-xs font-semibold text-matcha-300 uppercase tracking-wide mb-2">Rychlé zprávy</p>
          <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
            {quickMessages.map((qm, i) => (
              <button
                key={i}
                onClick={() => handleSend(qm)}
                className="w-full text-left text-xs text-matcha-300 hover:text-white hover:bg-matcha-700 px-2 py-1.5 rounded-lg transition-colors"
              >
                {qm.length > 40 ? qm.slice(0, 40) + '...' : qm}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-tea-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-tea-800"># obecný</h2>
            <p className="text-xs text-tea-400">Týmová komunikace</p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 text-xs bg-tea-100 text-tea-600 rounded-lg hover:bg-tea-200 transition-colors">
              🔍 Hledat
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {Object.entries(groupedMessages).map(([date, msgs]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 border-t border-tea-200"></div>
                <span className="text-xs text-tea-400 font-medium px-2">{date}</span>
                <div className="flex-1 border-t border-tea-200"></div>
              </div>
              <div className="space-y-4">
                {msgs.map(msg => {
                  const isMe = msg.senderId === user.id;
                  return (
                    <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <div className="w-9 h-9 rounded-xl bg-tea-100 flex items-center justify-center text-lg flex-shrink-0">
                        {msg.senderAvatar}
                      </div>
                      <div className={`max-w-xs sm:max-w-md flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className={`flex items-baseline gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                          <span className="text-sm font-semibold text-tea-800">
                            {isMe ? 'Já' : msg.senderName.split(' ')[0]}
                          </span>
                          <span className="text-xs text-tea-400">{formatTime(msg.timestamp)}</span>
                        </div>
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isMe
                            ? 'bg-matcha-600 text-white rounded-tr-sm'
                            : 'bg-tea-100 text-tea-800 rounded-tl-sm'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-tea-200 flex-shrink-0">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <textarea
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Napište zprávu... (pro rychlé zprávy použijte levý panel)"
                rows={1}
                className="w-full px-4 py-3 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 resize-none text-sm text-tea-800 placeholder:text-tea-300"
                style={{ minHeight: '46px', maxHeight: '120px' }}
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!newMessage.trim()}
              className="px-4 py-3 bg-matcha-600 hover:bg-matcha-700 disabled:bg-matcha-300 text-white rounded-xl transition-all shadow-sm text-xl"
            >
              ➤
            </button>
          </div>
          <p className="text-xs text-tea-400 mt-1.5 px-1">
            Enter = odeslat • Shift+Enter = nový řádek
          </p>
        </div>
      </div>
    </div>
  );
}
