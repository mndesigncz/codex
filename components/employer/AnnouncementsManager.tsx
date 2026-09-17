'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../Icons';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { Modal, Button } from '../ui';

interface Announcement {
  id: number;
  content: string;
  pinned: boolean;
  createdAt: string;
  authorName: string | null;
  authorAvatar: string | null;
}

function formatDate(iso: string): string {
  return dbTimeDayHM(iso);
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
        <h2 className="t-section"><Icon name="pin" size={15} className="inline -mt-0.5 mr-1.5 shrink-0" /> Nástěnka</h2>
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
          className="w-full field border border-black/[0.08] px-4 py-3 text-sm focus:border-[#C8F542]/50 focus:outline-none resize-none"
        />
        <label className="flex items-center gap-2 cursor-pointer min-h-[36px] text-sm text-black/60">
          <input type="checkbox" checked={alsoChat} onChange={e => setAlsoChat(e.target.checked)}
            className="h-5 w-5 rounded accent-[#5B9E00]" />
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
              <span className={`shrink-0 mt-0.5 ${a.pinned ? 'text-[#8A6A00]' : 'text-black/35'}`} aria-hidden>
                <Icon name={a.pinned ? 'pin' : 'book'} size={17} />
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
                  className="tap-target-sm w-7 h-7 rounded-full flex items-center justify-center text-black/40 hover:text-black/70 hover:bg-black/[0.06] text-sm transition"><Icon name="pencil" size={15} /></button>
                <button type="button" onClick={() => patch(a.id, { pinned: !a.pinned })}
                  aria-label={a.pinned ? 'Odepnout' : 'Připnout'} title={a.pinned ? 'Odepnout (tým ho přestane vidět)' : 'Znovu připnout'}
                  className={`tap-target-sm w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/[0.06] transition ${a.pinned ? 'text-[#8A6A00]' : 'text-black/40 hover:text-black/70'}`}><Icon name="pin" size={15} /></button>
                <button type="button" onClick={() => remove(a.id)}
                  aria-label="Odstranit oznámení"
                  className="tap-target-sm w-7 h-7 rounded-full flex items-center justify-center text-black/40 hover:text-black/70 hover:bg-black/[0.06] text-sm transition"><Icon name="close" size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal open onClose={() => setEditing(null)} title="Upravit oznámení" size="sm"
          footer={<>
            <Button variant="secondary" onClick={() => setEditing(null)}>Zrušit</Button>
            <Button variant="primary" icon="check" disabled={!editText.trim()}
              onClick={async () => { if (await patch(editing.id, { content: editText.trim() })) setEditing(null); }}>Uložit</Button>
          </>}>
          <textarea rows={4} value={editText} maxLength={1000} autoFocus
            onChange={(e) => setEditText(e.target.value)} className="field resize-none" />
        </Modal>
      )}
    </div>
  );
}
