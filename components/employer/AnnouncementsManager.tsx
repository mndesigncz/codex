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
  const [alsoChat, setAlsoChat] = useState(false);
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
        body: JSON.stringify({ content: text, postToChat: alsoChat }),
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

  // Edit in place + unpin instead of delete — unpinned stays here, hidden from the team.
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [editText, setEditText] = useState('');
  const patch = async (id: number, body: any) => {
    const r = await fetch('/api/announcements', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    }).catch(() => null);
    if (r?.ok) { await load(); return true; }
    setError('Uložení se nepodařilo.');
    return false;
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
        <label className="flex items-center gap-2 cursor-pointer text-sm text-black/60">
          <input type="checkbox" checked={alsoChat} onChange={e => setAlsoChat(e.target.checked)}
            className="h-4 w-4 rounded accent-[#5B9E00]" />
          Poslat i do týmového chatu
        </label>
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
              className={`rounded-3xl px-4 py-3 flex items-start gap-3 min-w-0 border ${a.pinned ? 'bg-[#FFD60A]/[0.12] border-[#FFD60A]/30' : 'bg-black/[0.03] border-black/[0.07] opacity-70'}`}
            >
              <span className="shrink-0 text-lg leading-6" aria-hidden>
                {a.pinned ? '📌' : '📄'}
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
              <div className="shrink-0 flex items-center gap-1">
                <button type="button" onClick={() => { setEditing(a); setEditText(a.content); }}
                  aria-label="Upravit" title="Upravit"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-black/40 hover:text-black/70 hover:bg-black/[0.06] text-sm">✎</button>
                <button type="button" onClick={() => patch(a.id, { pinned: !a.pinned })}
                  aria-label={a.pinned ? 'Odepnout' : 'Připnout'} title={a.pinned ? 'Odepnout (tým ho přestane vidět)' : 'Znovu připnout'}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-black/40 hover:text-black/70 hover:bg-black/[0.06] text-xs">{a.pinned ? '⤓' : '📌'}</button>
                <button type="button" onClick={() => remove(a.id)}
                  aria-label="Odstranit oznámení"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-black/40 hover:text-black/70 hover:bg-black/[0.06] text-sm">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-4" onClick={() => setEditing(null)}>
          <div className="modal-sheet rounded-3xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold tracking-tight text-[#16181A] mb-3">Upravit oznámení</h3>
            <textarea rows={4} value={editText} maxLength={1000} onChange={(e) => setEditText(e.target.value)}
              className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-sm focus:border-[#C8F542]/50 focus:outline-none resize-none" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditing(null)} className="flex-1 rounded-full bg-black/[0.05] text-[#16181A] font-semibold px-5 py-3 text-sm hover:bg-black/[0.08] transition">Zrušit</button>
              <button onClick={async () => { if (await patch(editing.id, { content: editText.trim() })) setEditing(null); }}
                disabled={!editText.trim()}
                className="flex-1 rounded-full bg-[#16181A] text-white font-semibold px-5 py-3 text-sm hover:bg-black disabled:opacity-50 transition">Uložit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
