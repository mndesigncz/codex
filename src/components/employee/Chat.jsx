import { useState, useRef, useEffect } from 'react';
import { messages, employees } from '../../data/mockData.js';

const employer = { id: 0, name: 'Eva Zelenková', avatar: '👩‍💼', role: 'Majitelka' };
const allPeople = [employer, ...employees];

function formatTime(ts) {
  try { return new Date(ts).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ts; }
}

export default function Chat({ user }) {
  const [msgs, setMsgs] = useState(messages);
  const [input, setInput] = useState('');
  const endRef = useRef(null);
  const myId = user?.id ?? 1;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMsgs(prev => [...prev, {
      id: Date.now(),
      senderId: myId,
      senderName: user?.name || 'Zaměstnanec',
      senderAvatar: user?.avatar || '👤',
      content: text,
      timestamp: new Date().toISOString(),
      channel: 'general',
      isRead: true,
    }]);
    setInput('');
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const getSender = (id) => allPeople.find(p => p.id === id) || { name: 'Neznámý', avatar: '👤' };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="flex flex-col h-full p-4 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-tea-100 shadow-sm mb-4 p-4 flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 bg-matcha-100 rounded-xl flex items-center justify-center text-xl">💬</div>
          <div>
            <p className="font-bold text-tea-800"># obecný</p>
            <p className="text-xs text-tea-400">Týmový chat</p>
          </div>
          <div className="ml-auto flex -space-x-2">
            {allPeople.slice(0, 5).map(p => (
              <span key={p.id} className="w-7 h-7 rounded-full border-2 border-white bg-matcha-100 flex items-center justify-center text-sm" title={p.name}>
                {p.avatar}
              </span>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2 mb-4">
          {msgs.map((msg, i) => {
            const isMe = msg.senderId === myId;
            const sender = getSender(msg.senderId);
            const showHeader = i === 0 || msgs[i - 1].senderId !== msg.senderId;
            return (
              <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                {showHeader ? (
                  <span className="text-2xl flex-shrink-0 self-end">{sender.avatar}</span>
                ) : (
                  <span className="w-8 flex-shrink-0"></span>
                )}
                <div className={`max-w-xs sm:max-w-sm flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {showHeader && (
                    <span className={`text-xs font-semibold text-tea-500 mb-0.5 ${isMe ? 'text-right' : ''}`}>
                      {isMe ? 'Vy' : sender.name}
                    </span>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                    isMe
                      ? 'bg-matcha-600 text-white rounded-br-sm'
                      : 'bg-white border border-tea-200 text-tea-800 rounded-bl-sm shadow-sm'
                  }`}>
                    {msg.content}
                  </div>
                  <span className="text-xs text-tea-300 mt-0.5">{formatTime(msg.timestamp)}</span>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Quick phrases */}
        <div className="flex gap-2 flex-wrap mb-3 flex-shrink-0">
          {[
            '🤒 Jsem nemocný/á, nemohu přijít',
            '⏰ Budu mít zpoždění',
            '❓ Potřebuji poradit',
          ].map(phrase => (
            <button
              key={phrase}
              onClick={() => setInput(phrase)}
              className="text-xs bg-tea-100 text-tea-600 px-3 py-1.5 rounded-full hover:bg-tea-200 transition-colors"
            >
              {phrase}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 bg-white rounded-2xl border border-tea-200 shadow-sm flex items-end gap-2 p-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Napište zprávu..."
            rows={1}
            className="flex-1 resize-none text-sm text-tea-800 placeholder:text-tea-300 focus:outline-none bg-transparent leading-relaxed max-h-28"
          />
          <button
            onClick={send}
            disabled={!input.trim()}
            className="p-2.5 bg-matcha-600 text-white rounded-xl disabled:opacity-40 hover:bg-matcha-700 transition-all flex-shrink-0"
          >
            <span className="text-base">➤</span>
          </button>
        </div>
      </div>
    </div>
  );
}
