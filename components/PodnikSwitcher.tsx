'use client';

// Přepínač podniku v hlavičce — pro majitele řetězce i baristu, který jezdí
// mezi pobočkami. Členství ověřuje server (`/api/teams/switch`), tady se jen
// vybírá. Po přepnutí se stránka NAČTE ZNOVU: token si tým vezme z databáze
// přes `session.update()`, a všechno, co si obrazovky držely pro starý
// podnik (koncepty v sessionStorage, filtry), tím odejde — jinak by v novém
// podniku svítily rozepsané formuláře z toho starého.

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Icon } from './Icons';
import { okJson } from '@/lib/api';

interface Podnik { teamId: number; teamName: string; role: 'employer' | 'employee' }
interface Data { activeTeamId: number | null; teams: Podnik[]; organization: { name: string; isOwner: boolean } | null }

export default function PodnikSwitcher({ compact = false, canCreate = false, onOverview }: { compact?: boolean; canCreate?: boolean; onOverview?: () => void }) {
  const { update } = useSession();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/teams/mine').then(okJson)
      .then(d => { if (alive) setData({ activeTeamId: d.activeTeamId ?? null, teams: d.teams ?? [], organization: d.organization ?? null }); })
      .catch(() => { /* bez seznamu se přepínač prostě neukáže */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const zavri = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', zavri); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', zavri); document.removeEventListener('keydown', esc); };
  }, [open]);

  const aktivni = data?.teams.find(t => t.teamId === data.activeTeamId) ?? null;
  const vicPodniku = (data?.teams.length ?? 0) > 1;
  // Jeden podnik a nemůžu přidat další → není co přepínat, nic nekreslit.
  if (!data || (!vicPodniku && !canCreate)) return null;

  const uklidKonceptu = () => {
    try {
      const klice: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k && k.startsWith('managero-koncept-')) klice.push(k); }
      klice.forEach(k => sessionStorage.removeItem(k));
    } catch { /* soukromý režim */ }
  };

  const prepni = async (teamId: number) => {
    if (busy || teamId === data.activeTeamId) { setOpen(false); return; }
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/teams/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Přepnutí se nepodařilo.'); setBusy(false); return; }
      uklidKonceptu();
      await update();
      window.location.href = window.location.pathname;
    } catch { setErr('Přepnutí se nepodařilo.'); setBusy(false); }
  };

  const zaloz = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/teams/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Podnik se nepodařilo založit.'); setBusy(false); return; }
      uklidKonceptu();
      await update();
      window.location.href = window.location.pathname;
    } catch { setErr('Podnik se nepodařilo založit.'); setBusy(false); }
  };

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open}
        title={aktivni ? `Podnik: ${aktivni.teamName}` : 'Podnik'}
        className={`flex items-center gap-2 rounded-2xl transition ${compact ? 'p-2 justify-center' : 'px-3 py-2 w-full text-left'} hover:bg-black/[0.05] ${open ? 'bg-black/[0.06]' : ''}`}>
        <Icon name="box" size={18} className="shrink-0 text-black/50" />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold truncate">{aktivni?.teamName ?? 'Vyber podnik'}</span>
              {data.organization && <span className="block text-[11px] text-black/40 truncate">{data.organization.name}</span>}
            </span>
            <Icon name="chevron" size={14} className={`shrink-0 text-black/40 transition-transform ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>
      {open && (
        <div role="menu" className="absolute left-0 right-0 top-full mt-1 z-50 glass-strong rounded-2xl p-1.5 shadow-[0_14px_40px_rgba(25,35,15,0.16)] min-w-[220px] pop-in origin-top">
          {data.teams.map(t => (
            <button key={t.teamId} type="button" role="menuitem" disabled={busy} onClick={() => prepni(t.teamId)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition ${
                t.teamId === data.activeTeamId ? 'bg-[#C8F542]/25 text-[#16181A] font-semibold' : 'text-black/70 hover:text-black hover:bg-black/[0.05]'}`}>
              <span className="min-w-0 flex-1 truncate">{t.teamName}</span>
              <span className="shrink-0 text-[11px] text-black/40">{t.role === 'employer' ? 'vedení' : 'tým'}</span>
              {t.teamId === data.activeTeamId && <Icon name="check" size={14} className="shrink-0 text-[#5B7A08]" />}
            </button>
          ))}
          {onOverview && vicPodniku && (
            <>
              <div className="h-px bg-black/[0.06] my-1" />
              <button type="button" role="menuitem" onClick={() => { setOpen(false); onOverview(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-black/70 hover:text-black hover:bg-black/[0.05] transition">
                <Icon name="trend" size={15} /> Všechny podniky
              </button>
            </>
          )}
          {canCreate && (
            <>
              <div className="h-px bg-black/[0.06] my-1" />
              {creating ? (
                <form onSubmit={e => { e.preventDefault(); zaloz(); }} className="px-1.5 py-1 space-y-1.5">
                  <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} maxLength={80}
                    aria-label="Název nového podniku" placeholder="Název podniku…"
                    className="w-full rounded-xl bg-white/70 border border-black/[0.08] px-3 py-2 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none" />
                  <div className="flex gap-1.5">
                    <button type="submit" disabled={busy || !newName.trim()} className="btn btn-accent btn-sm flex-1 disabled:opacity-50">{busy ? 'Zakládám…' : 'Založit'}</button>
                    <button type="button" onClick={() => { setCreating(false); setNewName(''); }} className="btn btn-secondary btn-sm">Zrušit</button>
                  </div>
                </form>
              ) : (
                <button type="button" role="menuitem" onClick={() => setCreating(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-[#5B7A08] hover:bg-black/[0.05] transition">
                  <Icon name="plus" size={15} /> Přidat podnik
                </button>
              )}
            </>
          )}
          {err && <p className="px-3 py-1.5 text-xs text-bad-ink">{err}</p>}
        </div>
      )}
    </div>
  );
}
