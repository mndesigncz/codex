'use client';

import { useEffect, useState } from 'react';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { okJson } from '@/lib/api';

import { Icon } from './Icons';
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

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  // Připíchnuté oznámení je to, co vedoucí chce, aby všichni viděli. Když se
  // nenačte, pruh dřív jen zmizel — a nikdo se nedozvěděl, že něco visí.
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch('/api/announcements')
      .then(okJson)
      .then((d) => {
        if (cancelled) return;
        if (!Array.isArray(d?.announcements)) throw new Error('nečekaná odpověď');
        setAnnouncements(d.announcements as Announcement[]);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  if (failed) {
    return (
      <div className="note note-wait flex items-center justify-between gap-3 min-w-0">
        <span className="min-w-0">Oznámení se nenačetla. Něco připíchnutého ti teď nevidíme.</span>
        <button type="button" onClick={() => setTick((t) => t + 1)}
          className="tap-target-sm shrink-0 font-semibold underline underline-offset-2">
          Zkusit znovu
        </button>
      </div>
    );
  }

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
            <Icon name="pin" size={15} className="inline -mt-0.5 mr-1.5 shrink-0" />
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
