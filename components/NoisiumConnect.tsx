'use client';

import { useState, useEffect } from 'react';
import { Icon } from './Icons';

const inputClass = 'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

export default function NoisiumConnect() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const d = await fetch('/api/noisium').then(r => r.json());
      setConnected(!!d.connected);
      setProjectId(d.projectId ?? null);
    } catch { setConnected(false); }
  };
  useEffect(() => { load(); }, []);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    try {
      const res = await fetch('/api/noisium', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), baseUrl: baseUrl.trim() || undefined }),
      });
      const d = await res.json();
      if (res.ok) { setMsg(`Připojeno — projekt „${d.projectName}" vytvořen v Noisium.`); setToken(''); await load(); }
      else setErr(d.error || 'Připojení selhalo.');
    } catch { setErr('Chyba serveru.'); }
    setBusy(false);
  };

  const disconnect = async () => {
    if (!confirm('Odpojit Noisium? Token bude smazán.')) return;
    setBusy(true);
    await fetch('/api/noisium', { method: 'DELETE' }).catch(() => {});
    setMsg(''); setErr(''); await load(); setBusy(false);
  };

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-bold tracking-tight text-[#16181A] flex items-center gap-2">
            <Icon name="kanban" size={18} className="flex-shrink-0" /> Propojení s Noisium
          </h3>
          <p className="text-black/45 text-sm mt-1">Publikuj úkoly z Plánování přímo do Noisium (Plan app).</p>
        </div>
        {connected && <span className="rounded-full px-3 py-1 text-xs font-medium bg-[#C8F542]/15 text-[#5B7A08] whitespace-nowrap flex-shrink-0">Připojeno</span>}
      </div>

      {msg && <div className="p-3 rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 text-[#5B7A08] text-sm">{msg}</div>}
      {err && <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">{err}</div>}

      {connected ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-black/60 min-w-0 flex-1 basis-52">Projekt v Noisium je propojený{projectId ? ` (ID ${projectId})` : ''}. V Plánování teď máš u karet tlačítko „Publikovat".</p>
          <button onClick={disconnect} disabled={busy} className="rounded-full glass border border-black/10 text-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500/[0.06] disabled:opacity-50 whitespace-nowrap flex-shrink-0">Odpojit</button>
        </div>
      ) : (
        <form onSubmit={connect} className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">API token</label>
            <input value={token} onChange={e => setToken(e.target.value)} placeholder="tymbr_xxxxxxxxxxxxx" required className={inputClass} />
            <p className="text-xs text-black/40 mt-1.5">Vytvoř v Noisium: Nastavení → API tokeny. Token uvidíš jen jednou.</p>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">API URL (volitelné)</label>
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://noisium.app/api" className={inputClass} />
          </div>
          <button type="submit" disabled={busy || !token.trim()} className="w-full sm:w-auto rounded-full bg-[#16181A] text-white font-semibold px-5 py-2.5 text-sm hover:bg-black disabled:opacity-50 whitespace-nowrap">
            {busy ? 'Připojuji…' : 'Připojit Noisium'}
          </button>
        </form>
      )}
    </div>
  );
}
