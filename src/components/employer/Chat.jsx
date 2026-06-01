import { useState, useRef, useEffect } from 'react';
import { messages as initialMessages, employees } from '../../data/mockData.js';

export default function Chat({ user }) {
  const [messages, setMessages] = useState(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = newMessage.trim();
    if (!text) return;
    const msg = {
      id: Date.now(),
      senderId: 0,
      senderName: user.name,
      senderAvatar: user.avatar,
      content: text,
      timestamp: new Date().toISOString(),
      channel: 'general',
      isRead: true,
    };
    setMessages(prev => [...prev, msg]);
    setNewMessage('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  };

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

  return (
    <div className="flex h-full">
      {/* Sidebar - channels & members — hidden on mobile */}
      <div className="hidden md:flex w-56 bg-card border-r border-border text-white flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-border">
          <h3 className="font-bold text-xs uppercase tracking-wide text-text-secondary">Kanály</h3>
        </div>
        <div className="p-2">
          {[
            { id: 'general', name: '# obecný', active: true },
            { id: 'smeny', name: '# směny', active: false },
            { id: 'sklad', name: '# sklad', active: false },
            { id: 'recepty', name: '# recepty', active: false },
          ].map(ch => (
            <button
              key={ch.id}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                ch.active ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-elevated hover:text-white'
              }`}
            >
              {ch.name}
            </button>
          ))}
        </div>

        <div className="px-4 py-4 border-t border-b border-border mt-2">
          <h3 className="font-bold text-xs uppercase tracking-wide text-text-secondary">Členové</h3>
        </div>
        <div className="p-2 flex-1 overflow-y-auto scrollbar-thin">
          {employees.map((emp, i) => (
            <div key={emp.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-text-secondary text-sm">
              <div className="relative">
                <span className="text-xl">{emp.avatar}</span>
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${i < 2 ? 'bg-accent' : 'bg-elevated border-border'}`}></span>
              </div>
              <span className="truncate">{emp.name.split(' ')[0]}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-elevated text-white text-sm border border-border">
            <div className="relative">
              <span className="text-xl">👩‍💼</span>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card bg-accent"></span>
            </div>
            <span className="truncate">Eva (já)</span>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-base overflow-hidden">
        {/* Header */}
        <div className="px-4 md:px-6 py-4 border-b border-border bg-card flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-white"># obecný</h2>
            <p className="text-xs text-text-secondary">Týmová komunikace · {messages.length} zpráv</p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 text-xs bg-elevated text-text-secondary rounded-lg hover:text-white hover:bg-border transition-colors border border-border">
              🔍 Hledat
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-thin">
          {Object.entries(groupedMessages).map(([date, msgs]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 border-t border-border"></div>
                <span className="text-xs text-text-secondary font-medium px-2">{date}</span>
                <div className="flex-1 border-t border-border"></div>
              </div>
              <div className="space-y-4">
                {msgs.map(msg => {
                  const isMe = msg.senderId === 0;
                  return (
                    <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <div className="w-9 h-9 rounded-xl bg-elevated flex items-center justify-center text-lg flex-shrink-0 border border-border">
                        {msg.senderAvatar}
                      </div>
                      <div className={`max-w-xs md:max-w-md ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div className={`flex items-baseline gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                          <span className="text-sm font-semibold text-white">{msg.senderName.split(' ')[0]}</span>
                          <span className="text-xs text-text-secondary">{formatTime(msg.timestamp)}</span>
                        </div>
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isMe
                            ? 'bg-accent text-black rounded-tr-sm'
                            : 'bg-card text-white rounded-tl-sm border border-border'
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
        <div className="px-4 md:px-6 py-4 border-t border-border bg-card flex-shrink-0">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Napište zprávu... (Enter odeslat)"
                rows={1}
                className="w-full px-4 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent resize-none text-sm text-white placeholder:text-text-secondary/50"
                style={{ minHeight: '46px', maxHeight: '120px' }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!newMessage.trim()}
              className="px-4 py-3 bg-accent hover:bg-accent/90 disabled:bg-elevated disabled:text-text-secondary text-black rounded-2xl transition-all text-xl font-bold min-h-[46px]"
            >
              ➤
            </button>
          </div>
          <p className="text-xs text-text-secondary/50 mt-1.5 px-1">
            Enter = odeslat · Shift+Enter = nový řádek
          </p>
        </div>
      </div>
    </div>
  );
}
