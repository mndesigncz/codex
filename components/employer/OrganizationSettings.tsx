'use client';

// Nastavení organizace — co si majitel řetězce zvolí sám.
//
// Zobrazí se jen tomu, kdo má víc podniků pod jednou střechou. Přepínače se
// UKLÁDAJÍ už teď; chování, které z nich plyne, přibývá po kolech, a každá
// volba to o sobě říká — ať nikdo nečeká, že „konsolidovaný přehled" už
// dnes něco ukáže.

import { useEffect, useState } from 'react';
import { Icon } from '../Icons';
import { okJson } from '@/lib/api';
import { type NastaveniOrganizace } from '@/lib/organizace';

interface Org { id: number; name: string; isOwner: boolean; settings: NastaveniOrganizace; teams: { id: number; name: string }[] }

export default function OrganizationSettings() {
  const [org, setOrg] = useState<Org | null>(null);
  const [nacteno, setNacteno] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/organization').then(okJson)
      .then(d => { if (alive) { setOrg(d?.organization ?? null); setNacteno(true); } })
      .catch(() => { if (alive) setNacteno(true); });
    return () => { alive = false; };
  }, []);

  if (!nacteno || !org) return null;

  const uloz = async (patch: Partial<NastaveniOrganizace>) => {
    setBusy(true); setMsg('');
    const puvodni = org.settings;
    setOrg(o => o ? { ...o, settings: { ...o.settings, ...patch } } : o);
    try {
      const res = await fetch('/api/organization', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: patch }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setOrg(o => o ? { ...o, settings: puvodni } : o); setMsg(d.error || 'Uložení se nepodařilo.'); }
      else setMsg('Uloženo ✓');
    } catch { setOrg(o => o ? { ...o, settings: puvodni } : o); setMsg('Uložení se nepodařilo.'); }
    setBusy(false);
    setTimeout(() => setMsg(''), 2500);
  };

  const Prepinac = ({ klic, title, hint, brzy }: { klic: keyof NastaveniOrganizace; title: string; hint: string; brzy?: boolean }) => {
    const on = org.settings[klic] === true;
    return (
      <div className="flex items-start justify-between gap-4 rounded-2xl bg-white/60 border border-black/[0.07] px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#16181A]">{title}{brzy && <span className="ml-2 chip chip-sm chip-muted align-middle">připravuje se</span>}</p>
          <p className="text-xs text-black/45 mt-0.5">{hint}</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label={title} disabled={!org.isOwner || busy}
          onClick={() => uloz({ [klic]: !on } as Partial<NastaveniOrganizace>)}
          className={`tap-target-sm relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${on ? 'bg-[#16181A]' : 'bg-black/15'}`}>
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
    );
  };

  return (
    <section className="glass-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="t-card"><Icon name="box" size={16} className="inline -mt-0.5 mr-1.5 text-[#5B7A08]" /> Organizace: {org.name}</h3>
          <p className="text-xs text-black/45 mt-0.5">
            {org.teams.length} {org.teams.length === 1 ? 'podnik' : org.teams.length < 5 ? 'podniky' : 'podniků'} pod jednou střechou: {org.teams.map(t => t.name).join(', ')}.
            {!org.isOwner && ' Nastavení mění vlastník organizace.'}
          </p>
        </div>
        {msg && <span className={`text-xs font-semibold ${msg.endsWith('✓') ? 'text-[#5B7A08]' : 'text-bad-ink'}`}>{msg}</span>}
      </div>
      <div className="space-y-2">
        <Prepinac klic="sdileniLidi" title="Sdílení lidí mezi podniky"
          hint="Zaměstnanec může být členem víc podniků a přepínat mezi nimi. Vedení může vždy." />
        <Prepinac klic="konsolidovanyPrehled" title="Přehled za všechny podniky"
          hint="Tržby, mzdy a uzávěrky všech podniků na jedné obrazovce — v přepínači podniku nahoře, položka „Všechny podniky“." />
        <Prepinac klic="sdileneCiselniky" title="Sdílené číselníky" brzy
          hint="Kategorie skladu, receptury a návody společné pro celou organizaci." />
        <div className="flex items-start justify-between gap-4 rounded-2xl bg-white/60 border border-black/[0.07] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#16181A]">Fakturace<span className="ml-2 chip chip-sm chip-muted align-middle">připravuje se</span></p>
            <p className="text-xs text-black/45 mt-0.5">Každý podnik má svůj plán a fakturu, nebo jedna faktura za organizaci.</p>
          </div>
          <div className="flex gap-1 rounded-full bg-black/[0.05] p-0.5 shrink-0">
            {([['per_team', 'Za podnik'], ['per_org', 'Za organizaci']] as const).map(([v, label]) => (
              <button key={v} type="button" disabled={!org.isOwner || busy} onClick={() => uloz({ fakturace: v })}
                className={`tap-target-sm rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${org.settings.fakturace === v ? 'seg-on' : 'seg-off'}`}>{label}</button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
