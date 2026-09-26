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
import { useVejdiSe } from '@/lib/useVejdiSe';
import { nactiTeamsMine } from './role/useOpravneni';

interface Podnik { teamId: number; teamName: string; role: 'employer' | 'employee' }
interface Data { activeTeamId: number | null; teams: Podnik[]; organization: { name: string; isOwner: boolean } | null; muzuZalozit: boolean }

/** Rozepsané formuláře patří ke starému podniku — po přepnutí se zahodí. Sdílí to i „Otevřít" z přehledu organizace. */
export function uklidKonceptu() {
  try {
    const klice: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k && k.startsWith('managero-koncept-')) klice.push(k); }
    klice.forEach(k => sessionStorage.removeItem(k));
  } catch { /* soukromý režim */ }
}

// Dva přepínače na stránce (boční pás + hlavička telefonu) sdílí jeden
// požadavek na /api/teams/mine; druhý by jen zdvojil čtyři dotazy do databáze.
// Od kola 67 ho sdílí i oprávnění (components/role/useOpravneni) — stejná
// odpověď nese role a oprávnění v aktivním podniku.
const nactiPodniky = (znovu: boolean): Promise<any> => nactiTeamsMine(znovu);

/**
 * `jenPrepinani`: v hlavičce telefonu se kreslí jen tomu, kdo má víc podniků
 * — s jedním by tam jen ubíral místo názvu obrazovky (na 320 px zbývalo
 * 64 px). Založit další podnik jde z bočního pásu.
 */
export default function PodnikSwitcher({ compact = false, canCreate = false, jenPrepinani = false, onOverview }: { compact?: boolean; canCreate?: boolean; jenPrepinani?: boolean; onOverview?: () => void }) {
  const { update } = useSession();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  /** Seznam podniků se nenačetl — místo tichého zmizení tlačítko „zkusit znovu". */
  const [chybaSeznamu, setChybaSeznamu] = useState(false);
  const [pokus, setPokus] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Na telefonu se panel vejde na obrazovku (useVejdiSe).
  const vejdiSe = useVejdiSe(panel, { aktivni: open });

  useEffect(() => {
    let alive = true;
    setChybaSeznamu(false);
    nactiPodniky(pokus > 0)
      .then(d => { if (alive) setData({ activeTeamId: d.activeTeamId ?? null, teams: d.teams ?? [], organization: d.organization ?? null, muzuZalozit: d.muzuZalozit === true }); })
      .catch(() => { if (alive) setChybaSeznamu(true); });
    return () => { alive = false; };
  }, [pokus]);

  useEffect(() => {
    if (!open) return;
    const zavri = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', zavri); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', zavri); document.removeEventListener('keydown', esc); };
  }, [open]);

  const aktivni = data?.teams.find(t => t.teamId === data.activeTeamId) ?? null;
  const vicPodniku = (data?.teams.length ?? 0) > 1;
  // Další podnik zakládá jen vlastník toho aktivního — rozhodl server
  // (/api/teams/mine). Manažer s rolí vedení tlačítko nevidí.
  const mohuZalozit = canCreate && data?.muzuZalozit === true;
  if (!data) {
    // Bez seznamu dřív přepínač zmizel beze slova — barista se pak nemohl
    // přepnout a nevěděl proč. Teď je tam tlačítko, které to zkusí znovu.
    if (!chybaSeznamu) return null;
    return (
      <button type="button" onClick={() => setPokus(p => p + 1)} title="Seznam podniků se nenačetl — zkusit znovu"
        className={`flex items-center gap-2 rounded-2xl text-bad-ink transition ${compact ? 'p-2 justify-center' : 'px-3 py-2 w-full text-left'} hover:bg-black/[0.05]`}>
        <Icon name="box" size={18} className="shrink-0" />
        {!compact && <span className="text-sm font-semibold truncate">Podniky se nenačetly · zkusit znovu</span>}
      </button>
    );
  }
  // Jeden podnik a nemůžu (nebo tady nemám) přidat další → není co přepínat.
  if (!vicPodniku && (jenPrepinani || !mohuZalozit)) return null;


  const prepni = async (teamId: number) => {
    if (busy || teamId === data.activeTeamId) { setOpen(false); return; }
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/teams/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Přepnutí se nepodařilo.'); setBusy(false); return; }
      uklidKonceptu();
      // Server už přepnul; když selže obnova tokenu, načtení stránky si tým
      // vezme z databáze samo. Hlásit „nepodařilo" by lhalo.
      try { await update(); } catch { /* token se obnoví při načtení */ }
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
      try { await update(); } catch { /* token se obnoví při načtení */ }
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
        <div ref={panel} role="menu" style={vejdiSe} className="absolute left-0 right-0 top-full mt-1 z-50 glass-strong rounded-2xl p-1.5 shadow-[0_14px_40px_rgba(25,35,15,0.16)] min-w-[220px] pop-in origin-top">
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
          {mohuZalozit && (
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
