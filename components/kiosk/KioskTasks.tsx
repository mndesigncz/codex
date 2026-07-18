'use client';

import { useState, useEffect } from 'react';

interface Task {
  id: number;
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  dueDate?: string | null;
  assigneeName?: string | null;
  assigneeAvatar?: string | null;
}

const prioDot = (p: string) => p === 'high' ? 'bg-red-500' : p === 'medium' ? 'bg-orange-400' : 'bg-[#C8F542]';

export default function KioskTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);

  const load = () => {
    fetch('/api/tasks').then(r => r.json()).then(d => { if (Array.isArray(d)) setTasks(d); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(load, []);

  const setStatus = async (t: Task, status: string) => {
    const prev = tasks;
    setTasks(list => list.map(x => x.id === t.id ? { ...x, status } : x));
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, status }),
      });
      if (!res.ok) throw new Error();
    } catch { setTasks(prev); }
  };

  const open = tasks.filter(t => t.status !== 'done');
  const done = tasks.filter(t => t.status === 'done');

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : open.length === 0 && done.length === 0 ? (
        <div className="glass-card p-8 text-center text-black/45">Žádné úkoly. 🎉</div>
      ) : (
        <>
          {open.length === 0 && <div className="glass-card p-6 text-center text-[#5B7A08] font-medium">Všechny úkoly splněné! 🎉</div>}
          <div className="space-y-2.5">
            {open.map(t => (
              <div key={t.id} className="glass-card p-4">
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${prioDot(t.priority)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#16181A]">{t.title}</p>
                    {t.description && <p className="text-sm text-black/50 mt-0.5">{t.description}</p>}
                    <p className="text-xs text-black/40 mt-1 truncate">
                      {t.assigneeName ? `${t.assigneeAvatar ?? '👤'} ${t.assigneeName}` : ''}
                      {t.dueDate ? ` · do ${new Date(t.dueDate + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  {t.status === 'pending' && (
                    <button onClick={() => setStatus(t, 'in_progress')}
                      className="flex-1 rounded-full bg-[#0A84FF]/12 text-[#0A6FE0] font-semibold px-4 py-2.5 text-sm active:scale-[0.98] transition whitespace-nowrap">
                      Začít
                    </button>
                  )}
                  <button onClick={() => setStatus(t, 'done')}
                    className="flex-1 rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2.5 text-sm active:scale-[0.98] transition whitespace-nowrap">
                    Hotovo ✓
                  </button>
                </div>
              </div>
            ))}
          </div>

          {done.length > 0 && (
            <div>
              <button onClick={() => setShowDone(v => !v)} className="text-sm text-black/45 hover:text-black transition px-1">
                {showDone ? 'Skrýt hotové' : `Zobrazit hotové (${done.length})`}
              </button>
              {showDone && (
                <div className="space-y-2 mt-2">
                  {done.map(t => (
                    <div key={t.id} className="glass-card p-3.5 flex items-center gap-3 opacity-70">
                      <span className="text-[#5B7A08]">✓</span>
                      <p className="text-sm text-black/50 line-through truncate flex-1 min-w-0">{t.title}</p>
                      <button onClick={() => setStatus(t, 'pending')} className="text-xs text-black/40 hover:text-black whitespace-nowrap shrink-0">Vrátit</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
