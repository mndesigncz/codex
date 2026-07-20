'use client';

import { useEffect, useState } from 'react';

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

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/announcements')
      .then((r) => (r.ok ? r.json() : { announcements: [] }))
      .then((d) => {
        if (!cancelled && Array.isArray(d?.announcements)) {
          setAnnouncements(d.announcements as Announcement[]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (announcements.length === 0) return null;

  const visible = announcements.slice(0, 3);
  const hiddenCount = announcements.length - visible.length;

  return (
    <div className="space-y-2 min-w-0">
      {visible.map((a) => (
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
        </div>
      ))}
      {hiddenCount > 0 && (
        <p className="text-[11px] text-black/35 px-1">+{hiddenCount} dalších</p>
      )}
    </div>
  );
}
