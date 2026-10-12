'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Icon } from './Icons';
import { Badge } from './ui/Badge';
import { dbTimeHM, parseDbTime } from '@/lib/pragueTime';
import { usePopover } from '@/lib/usePopover';
import { useVejdiSe } from '@/lib/useVejdiSe';
import { okJson } from '@/lib/api';
import { useT, useJazyk } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { ikonaOznameni, otevriOznameni } from '@/lib/oznameniOdkaz';

interface Notif {
  id: number;
  title: string;
  body?: string;
  type: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const t = useT();
  const { jazyk } = useJazyk();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [flaggedFeedback, setFlaggedFeedback] = useState(0);

  const load = async () => {
    try {
      const data = await fetch('/api/notifications').then(okJson);
      setNotifs(data.notifications || []);
      setUnread(data.unread || 0);
    } catch {}
  };

  // Shift feedback the employee hasn't acknowledged yet. Polled far less often
  // than notifications — the rewards summary is a heavier query.
  const loadFeedback = useCallback(async () => {
    if (role !== 'employee') return;
    try {
      const data = await fetch('/api/rewards').then(okJson);
      setFlaggedFeedback(Number(data?.unseenFlagged) || 0);
    } catch {}
  }, [role]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (role !== 'employee') { setFlaggedFeedback(0); return; }
    loadFeedback();
    const t = setInterval(loadFeedback, 120000);
    return () => clearInterval(t);
  }, [role, loadFeedback]);

  // Zavírání panelu drží společný `usePopover`: Escape, kliknutí mimo,
  // návrat fokusu na zvonek a šipky po oznámeních. Dřív uměl jen kliknutí
  // mimo — Escape nefungoval a klávesnicí se z panelu nedalo odejít.
  // Zavření panelu značí nepřečtená jako přečtená (viz efekt níž) — jedním
  // místem pro všechny cesty ven. `onDismiss` z usePopover pokrývá jen klik
  // mimo, takže po Escapu zůstával odznak „2 nové“ a stav závisel na tom,
  // kterou cestou člověk panel zavřel.
  const unreadRef = useRef(unread);
  unreadRef.current = unread;
  const pop = usePopover(open, setOpen, {
    focusFirst: true,
    arrowKeys: true,
  });
  // Panel se na telefonu vejde na obrazovku i do výšky (useVejdiSe).
  const vejdiSe = useVejdiSe(pop.panelRef, { aktivni: open });

  // Odznak se nuluje až podle odpovědi. Dřív se vynuloval rovnou, takže
  // po nepovedeném zápisu tvrdil „přečteno" a server měl pořád nepřečteno;
  // další dotaz to sice srovnal, ale mezitím číslo poskočilo tam a zpátky.
  const markAllRead = async () => {
    try {
      const res = await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) return;
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnread(0);
    } catch { /* příště to srovná pravidelné načtení */ }
  };

  // Otevřeno → zavřeno jakoukoli cestou (klik mimo, na zvonek, Escape) = přečteno.
  const bylOtevreno = useRef(false);
  useEffect(() => {
    if (bylOtevreno.current && !open && unreadRef.current) markAllRead();
    bylOtevreno.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Otevření oznámení sdílí s Centrem oznámení v Nastavení (lib/oznameniOdkaz): přečteno
  // až podle odpovědi serveru, na odkaz se jde tak jako tak.
  const openNotif = (n: Notif) => otevriOznameni(n, x => {
    setNotifs(prev => prev.map(y => (y.id === x.id ? { ...y, is_read: true } : y)));
    setUnread(u => Math.max(0, u - 1));
  });
  /** „12. 9. 14:30" v jazyce a formátu člověka (čas z databáze přes parseDbTime). */
  const kdy = (iso: string) => { const d = parseDbTime(iso); return d ? `${fmtDatum(d, { jazyk, styl: 'kratce' })} ${dbTimeHM(d)}` : ''; };

  // The flagged feedback stays on the badge until it is acknowledged in Odměny,
  // so "přečíst vše" here can't hide it.
  const badge = unread + (flaggedFeedback > 0 ? 1 : 0);

  return (
    <div className="relative" ref={pop.ref}>
      <button
        ref={pop.triggerRef}
        onKeyDown={pop.onTriggerKeyDown}
        aria-haspopup="dialog" aria-expanded={open}
        onClick={() => {
          if (!open) loadFeedback();
          setOpen(o => !o);
        }}
        className="relative rounded-full bg-black/[0.04] border border-black/[0.08] w-10 h-10 flex items-center justify-center text-black/60 hover:text-black transition-colors"
        title={t('Notifikace')} aria-label={t('Notifikace')}
      >
        {/* The bell only moves when there is actually something new. */}
        <Icon name="bell" size={19} className="i-lead" motion={badge > 0 ? 'ring' : undefined} />
        {/* Stejný odznak jako v doku. Limetkový podklad tu dřív soupeřil
            s hlavní akcí obrazovky o jedinou limetku; červený zůstává pro
            vlajku (nízké hodnocení čeká na potvrzení). */}
        <Badge count={badge} tone={flaggedFeedback > 0 ? 'bad' : 'ink'}
          label={t('{n, plural, one {# nová notifikace} few {# nové notifikace} other {# nových notifikací}}', { n: badge })} className="absolute -top-0.5 -right-0.5" />
      </button>

      {open && (
        <div ref={pop.panelRef} onKeyDown={pop.onPanelKeyDown} role="dialog" aria-label={t('Notifikace')} style={vejdiSe}
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] glass-strong rounded-3xl overflow-hidden z-50 shadow-[0_16px_44px_rgba(25,35,15,0.18)]">
          <div className="px-4 py-3 border-b border-black/[0.07] flex items-center justify-between">
            <span className="font-bold text-[#16181A] text-sm">{t('Notifikace')}</span>
            {notifs.some(n => !n.is_read) && (
              <button type="button" onClick={markAllRead} className="tap-target-sm text-xs text-[#5B7A08] hover:underline">{t('Přečíst vše')}</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-thin divide-y divide-black/[0.05]">
            {flaggedFeedback > 0 && (
              <div className="px-4 py-3 flex gap-3 bg-bad/[0.07]">
                <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-bad/15 text-bad-ink">
                  <Icon name="warning" size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#16181A]">{t('Něco je potřeba napravit')}</p>
                  <p className="text-xs text-black/55 mt-0.5">
                    {t('{n, plural, one {U jedné z tvých směn} few {U # tvých směn} other {U # tvých směn}} máš zpětnou vazbu od vedení. Otevři sekci Odměny.', { n: flaggedFeedback })}
                  </p>
                </div>
              </div>
            )}
            {notifs.length === 0 && flaggedFeedback === 0 ? (
              <div className="p-8 text-center text-black/40 text-sm">{t('Žádné notifikace')}</div>
            ) : notifs.map(n => (
              <button key={n.id} onClick={() => openNotif(n)}
                className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-black/[0.03] transition-colors ${!n.is_read ? 'bg-[#C8F542]/[0.04]' : ''}`}>
                <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#C8F542]/15 text-[#5B7A08]">
                  <Icon name={ikonaOznameni(n.type)} size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#16181A] truncate">{n.title}</p>
                  {n.body && <p className="text-xs text-black/50 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[11px] text-black/35 mt-1 tabular-nums">{kdy(n.created_at)}</p>
                </div>
                {!n.is_read && <span className="mt-1.5 h-2 w-2 rounded-full bg-[#C8F542] flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
