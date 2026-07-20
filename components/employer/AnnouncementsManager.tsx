'use client';

import { useCallback, useEffect, useState } from 'react';

interface Announcement {
  id: number;
  content: string;
  pinned: boolean;
  createdAt: string;
  authorName: string | null;
  authorAvatar: string | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AnnouncementsManager() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/announcements');
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d?.announcements)) {
        setAnnouncements(d.announcements as Announcement[]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    const text = content.trim();
    if (!text || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) {
        setError(d?.error ?? 'Oznámení se nepodařilo připnout.');
      } else {
        setContent('');
        await load();
      }
    } catch {
      setError('Oznámení se nepodařilo připnout.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Odstranit toto oznámení?')) return;
    const prev = announcements;
    setAnnouncements((list) => list.filter((a) => a.id !== id));
    try {
      const r = await fetch(`/api/announcements?id=${id}`, { method: 'DELETE' });
      if (!r.ok) {
        setAnnouncements(prev);
        setError('Oznámení se nepodařilo odstranit.');
      }
    } catch {
      setAnnouncements(prev);
      setError('Oznámení se nepodařilo odstranit.');
    }
  };

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="min-w-0">
        <h2 className="font-bold tracking-tight text-[#16181A]">📌 Nástěnka</h2>
        <p className="text-sm text-black/45">
          Připnutá oznámení uvidí celý tým a přijde jim notifikace.
        </p>
      </div>

      <div className="space-y-2">
        <textarea
          rows={2}
          value={content}
          maxLength={1000}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Např. V pátek zavíráme dřív…"
          className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-sm focus:border-[#C8F542]/50 focus:outline-none resize-none"
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[11px] text-black/35">{content.length}/1000</span>
          <button
            type="button"
            onClick={submit}
            disabled={!content.trim() || saving}
            className="rounded-full bg-[#16181A] text-white font-semibold px-5 py-2.5 text-sm disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? 'Připínám…' : 'Připnout oznámení'}
          </button>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>

      {announcements.length === 0 ? (
        <p className="text-sm text-black/40">Žádná připnutá oznámení.</p>
      ) : (
        <div className="space-y-2">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="rounded-3xl bg-[#FFD60A]/[0.12] border border-[#FFD60A]/30 px-4 py-3 flex items-start gap-3 min-w-0"
            >
              <span className="shrink-0 text-lg leading-6" aria-hidden>
                📌
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[#16181A] whitespace-pre-wrap break-words">
                  {a.content}
                </p>
                <p className="mt-1 text-[11px] text-black/40 truncate">
                  {a.authorAvatar ? `${a.authorAvatar} ` : ''}
                  {a.authorName ?? ''}
                  {a.authorName ? ' · ' : ''}
                  {formatDate(a.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(a.id)}
                aria-label="Odstranit oznámení"
                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-black/40 hover:text-black/70 hover:bg-black/[0.06] text-sm"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
