'use client';

// Events: the shop's concerts, lectures and offsite trips — crewed from the
// team (creates real shifts), packed from the stock (real movements), shown
// to customers when public, and settled with a simple revenue/costs outcome.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import { EVENT_KINDS, EVENT_STATUSES, kindSpec, statusLabel } from '@/lib/events';
import { pragueToday } from '@/lib/pragueTime';

type Ev = any;

const inputClass =
  'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all';

export default function EventsView({ user }: { user: { id?: string } }) {
  const money = useMoney();
  const [events, setEvents] = useState<Ev[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Ev | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');
  const [showPast, setShowPast] = useState(false);

  const load = async () => {
    try {
      const [ed, td, iv] = await Promise.all([
        fetch('/api/events').then(r => r.json()).catch(() => ({})),
        fetch('/api/teams').then(r => r.json()).catch(() => ({})),
        fetch('/api/inventory').then(r => r.json()).catch(() => []),
      ]);
      setEvents(Array.isArray(ed.events) ? ed.events : []);
      setMembers((td.members ?? []).filter((m: any) => m.role !== 'kiosk'));
      setItems(Array.isArray(iv) ? iv.filter((i: any) => i.archived !== true && i.approved !== false) : []);
      if (ed.notMigrated) setErr('Akce budou dostupné po migraci (/api/init).');
    } catch { setErr('Akce se nepodařilo načíst.'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const today = pragueToday();
  const upcoming = useMemo(() => events.filter(e => e.date >= today && e.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date)), [events, today]);
  const past = useMemo(() => events.filter(e => e.date < today || e.status === 'cancelled').sort((a, b) => b.date.localeCompare(a.date)), [events, today]);

  const patch = async (id: number, body: any) => {
    const res = await fetch(`/api/events/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (res?.ok) {
      await load();
      const d = await fetch('/api/events').then(r => r.json()).catch(() => ({}));
      const fresh = (d.events ?? []).find((e: Ev) => e.id === id);
      if (fresh) setDetail((cur: Ev) => (cur && cur.id === id ? fresh : cur));
      return true;
    }
    const d = res ? await res.json().catch(() => ({})) : {};
    setErr(d.error || 'Uložení se nepodařilo.');
    return false;
  };

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });

  const EventCard = ({ e }: { e: Ev }) => {
    const k = kindSpec(e.kind);
    const result = e.revenue != null || e.costs != null ? (e.revenue ?? 0) - (e.costs ?? 0) : null;
    return (
      <button onClick={() => setDetail(e)}
        className="w-full glass-card p-5 text-left hover:bg-black/[0.02] transition">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold tracking-tight text-[#16181A] truncate">{k.icon} {e.title}</p>
            <p className="text-sm text-black/50 mt-0.5 capitalize truncate">
              {fmtDate(e.date)}{e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}
            </p>
            {(e.offsite || e.location) && (
              <p className="text-xs text-black/40 mt-0.5 truncate">📍 {e.location || 'mimo podnik'}{e.offsite ? ' · venkovní' : ''}</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
              e.status === 'confirmed' ? 'bg-[#C8F542]/20 text-[#5B7A08]'
              : e.status === 'done' ? 'bg-black/[0.06] text-black/50'
              : e.status === 'cancelled' ? 'bg-red-500/10 text-red-600'
              : 'bg-[#0A84FF]/10 text-[#0A6FE0]'
            }`}>{statusLabel(e.status)}</span>
            {e.public && <span className="text-[11px] text-[#5B7A08]">veřejná ✓</span>}
            {result != null && (
              <span className={`text-xs font-bold tabular-nums ${result >= 0 ? 'text-[#5B7A08]' : 'text-red-600'}`}>
                {result >= 0 ? '+' : ''}{money(result)}
              </span>
            )}
          </div>
        </div>
        {e.crewPeople?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {e.crewPeople.map((p: any) => (
              <span key={p.id} className="rounded-full bg-white/60 border border-black/[0.06] px-2.5 py-1 text-xs text-[#16181A]">
                {p.avatar} {p.name}
              </span>
            ))}
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#16181A]">Akce</h1>
          <p className="text-black/45 text-sm mt-1">Koncerty, přednášky i výjezdy čajovny — se směnami, balením a vyúčtováním.</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 flex items-center gap-2 whitespace-nowrap">
          <Icon name="plus" size={16} /> Nová akce
        </button>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
        </div>
      ) : (
        <>
          {upcoming.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C8F542]/15 text-2xl mb-3">📅</div>
              <p className="text-black/55 text-sm">Žádná naplánovaná akce. Založ první — obsadíš ji lidmi, sbalíš sklad a dáš vědět zákazníkům.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {upcoming.map(e => <EventCard key={e.id} e={e} />)}
            </div>
          )}

          {past.length > 0 && (
            <div>
              <button onClick={() => setShowPast(o => !o)} className="text-sm text-black/45 hover:text-black transition flex items-center gap-1.5">
                <Icon name="chevron" size={14} className={`transition-transform ${showPast ? 'rotate-180' : ''}`} />
                Minulé a zrušené ({past.length})
              </button>
              {showPast && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3 opacity-80">
                  {past.map(e => <EventCard key={e.id} e={e} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {creating && (
        <EventEditor onClose={() => setCreating(false)} onSaved={async (ev) => { setCreating(false); await load(); setDetail(ev); }} />
      )}
      {detail && (
        <EventDetail event={detail} members={members} items={items} money={money} patch={patch}
          onClose={() => setDetail(null)}
          onDeleted={async () => { setDetail(null); await load(); }} />
      )}
    </div>
  );
}

// ---- Create form (short — details come after in the detail sheet) ----
function EventEditor({ onClose, onSaved }: { onClose: () => void; onSaved: (ev: any) => void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('concert');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [offsite, setOffsite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true); setErr('');
    const res = await fetch('/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, kind, date, startTime, endTime, location, offsite }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) { const d = await res.json(); onSaved(d.event); }
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Akci se nepodařilo založit.'); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-4" onClick={onClose}>
      <div className="modal-sheet rounded-3xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold tracking-tight text-[#16181A] mb-4">Nová akce</h3>
        {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Název akce" maxLength={160} className={inputClass} />
          <div className="flex flex-wrap gap-1.5">
            {EVENT_KINDS.map(k => (
              <button key={k.id} type="button" onClick={() => { setKind(k.id); if (k.id === 'outdoor') setOffsite(true); }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${kind === k.id ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'}`}>
                {k.icon} {k.label}
              </button>
            ))}
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
          <div className="grid grid-cols-2 gap-2">
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputClass} />
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputClass} />
          </div>
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Místo (u venkovní akce adresa)" maxLength={300} className={inputClass} />
          <label className="flex items-center gap-2.5 cursor-pointer text-sm text-black/60">
            <input type="checkbox" checked={offsite} onChange={e => setOffsite(e.target.checked)} className="h-4 w-4 accent-[#5B9E00]" />
            Venkovní akce — čajovna se veze jinam (odemkne balicí seznam)
          </label>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 rounded-full bg-black/[0.05] text-[#16181A] font-semibold px-5 py-3 text-sm hover:bg-black/[0.08] transition">Zrušit</button>
          <button onClick={save} disabled={busy || !title.trim() || !date}
            className="flex-1 rounded-full bg-[#16181A] text-white font-semibold px-5 py-3 text-sm hover:bg-black disabled:opacity-50 transition">
            {busy ? 'Zakládám…' : 'Založit akci'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Detail sheet: crew, checklist, packing, publicity, money ----
function EventDetail({ event: e, members, items, money, patch, onClose, onDeleted }: {
  event: any; members: any[]; items: any[]; money: (n: number) => string;
  patch: (id: number, body: any) => Promise<boolean>;
  onClose: () => void; onDeleted: () => void;
}) {
  const [checkTxt, setCheckTxt] = useState('');
  const [packSearch, setPackSearch] = useState('');
  const [revenue, setRevenue] = useState(e.revenue != null ? String(e.revenue) : '');
  const [costs, setCosts] = useState(e.costs != null ? String(e.costs) : '');
  const k = kindSpec(e.kind);
  const result = e.revenue != null || e.costs != null ? (e.revenue ?? 0) - (e.costs ?? 0) : null;

  const toggleCrew = (id: number) => {
    const next = e.crew.includes(id) ? e.crew.filter((x: number) => x !== id) : [...e.crew, id];
    patch(e.id, { crew: next });
  };

  const packCandidates = packSearch.trim()
    ? items.filter(i => i.name.toLowerCase().includes(packSearch.toLowerCase())
        && !e.packing.some((p: any) => p.itemId === i.id)).slice(0, 6)
    : [];

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-4" onClick={onClose}>
      <div className="modal-sheet rounded-3xl p-6 max-w-2xl w-full max-h-[92vh] overflow-y-auto scrollbar-thin" onClick={ev2 => ev2.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <h3 className="text-xl font-bold tracking-tight text-[#16181A]">{k.icon} {e.title}</h3>
            <p className="text-sm text-black/50 capitalize mt-0.5">
              {new Date(e.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}
              {e.location ? ` · 📍 ${e.location}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full w-9 h-9 flex items-center justify-center glass text-black/50 hover:text-black">✕</button>
        </div>

        {/* status + publicity row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {EVENT_STATUSES.map(st => (
            <button key={st.id} onClick={() => patch(e.id, { status: st.id })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                e.status === st.id ? 'bg-[#16181A] text-white' : 'glass text-black/50 hover:text-black'
              }`}>
              {st.label}
            </button>
          ))}
          <span className="flex-1" />
          <button onClick={() => patch(e.id, { public: !e.public })}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              e.public ? 'bg-[#C8F542]/20 text-[#5B7A08]' : 'glass text-black/50 hover:text-black'
            }`}
            title="Veřejná akce se ukáže zákazníkům na sdílené stránce">
            {e.public ? '🌍 Veřejná ✓' : 'Zveřejnit zákazníkům'}
          </button>
          <button onClick={() => patch(e.id, { publishToTeam: true }).then(ok => ok && alert('Tým dostal notifikaci o akci. ✓'))}
            className="rounded-full glass px-3 py-1.5 text-xs font-semibold text-black/50 hover:text-black transition">
            📣 Oznámit týmu
          </button>
        </div>

        {/* crew */}
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">Na akci ({e.crew.length}) — vytvoří směnu v rozvrhu</p>
          <div className="flex flex-wrap gap-1.5">
            {members.map(m => {
              const on = e.crew.includes(m.id);
              return (
                <button key={m.id} onClick={() => toggleCrew(m.id)}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    on ? 'bg-[#C8F542]/20 text-[#5B7A08] border border-[#C8F542]/40 font-semibold' : 'glass text-black/55 hover:text-black border border-transparent'
                  }`}>
                  {m.avatar ?? '👤'} {m.name}{on ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* checklist */}
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">Přípravy</p>
          <div className="space-y-1.5">
            {e.checklist.map((c: any, i: number) => (
              <button key={i}
                onClick={() => patch(e.id, { checklist: e.checklist.map((x: any, j: number) => j === i ? { ...x, done: !x.done } : x) })}
                className={`w-full flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-left text-sm transition ${
                  c.done ? 'border-[#C8F542]/30 bg-[#C8F542]/[0.08] text-black/45 line-through' : 'border-black/[0.07] bg-white/50 text-[#16181A] hover:bg-white/80'
                }`}>
                <span>{c.done ? '✅' : '⬜'}</span>
                <span className="min-w-0 flex-1">{c.text}</span>
                <span onClick={(ev3) => { ev3.stopPropagation(); patch(e.id, { checklist: e.checklist.filter((_: any, j: number) => j !== i) }); }}
                  className="shrink-0 text-black/25 hover:text-red-600 px-1">✕</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input value={checkTxt} onChange={ev3 => setCheckTxt(ev3.target.value)} placeholder="Přidat úkol k akci…" maxLength={200}
              onKeyDown={ev3 => { if (ev3.key === 'Enter' && checkTxt.trim()) { patch(e.id, { checklist: [...e.checklist, { text: checkTxt.trim(), done: false }] }); setCheckTxt(''); } }}
              className={inputClass} />
            <button onClick={() => { if (checkTxt.trim()) { patch(e.id, { checklist: [...e.checklist, { text: checkTxt.trim(), done: false }] }); setCheckTxt(''); } }}
              className="shrink-0 rounded-full bg-black/[0.05] text-[#16181A] font-semibold px-4 text-sm hover:bg-black/[0.08] transition">+</button>
          </div>
        </div>

        {/* packing — offsite only */}
        {e.offsite && (
          <div className="mt-5 rounded-2xl bg-black/[0.03] border border-black/[0.06] p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-black/45">⛺ Balicí seznam (ze skladu)</p>
              <div className="flex gap-1.5">
                {e.packing.some((p: any) => p.itemId && !p.packed) && (
                  <button onClick={() => { if (confirm('Vyskladnit vše nesbalené? Množství se odečte ze skladu (s poznámkou u položek).')) patch(e.id, { packAction: 'checkout' }); }}
                    className="rounded-full bg-[#16181A] text-white px-3 py-1.5 text-xs font-bold hover:bg-black transition">
                    📦 Vyskladnit
                  </button>
                )}
                {e.packing.some((p: any) => p.itemId && p.packed && p.returned == null) && (
                  <button onClick={() => { if (confirm('Vrátit sbalené položky zpět do skladu? (Vrací se plné množství — spotřebu pak uprav ve skladu.)')) patch(e.id, { packAction: 'return' }); }}
                    className="rounded-full bg-[#C8F542] text-black px-3 py-1.5 text-xs font-bold hover:brightness-110 transition">
                    ↩️ Vrátit do skladu
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              {e.packing.map((p2: any, i: number) => (
                <div key={i} className="flex items-center gap-2.5 rounded-xl bg-white/60 border border-black/[0.06] px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-[#16181A]">{p2.name}</span>
                  <span className="shrink-0 text-xs text-black/45 tabular-nums">{p2.qty}×</span>
                  <span className="shrink-0 text-xs">
                    {p2.returned != null ? <span className="text-[#5B7A08]">vráceno {p2.returned} ✓</span>
                     : p2.packed ? <span className="text-amber-700">vyskladněno</span>
                     : <span className="text-black/35">čeká</span>}
                  </span>
                  {!p2.packed && (
                    <button onClick={() => patch(e.id, { packing: e.packing.filter((_: any, j: number) => j !== i) })}
                      className="shrink-0 text-black/25 hover:text-red-600">✕</button>
                  )}
                </div>
              ))}
            </div>
            <div className="relative mt-2">
              <input value={packSearch} onChange={ev3 => setPackSearch(ev3.target.value)} placeholder="Přidat ze skladu — začni psát název…" className={inputClass} />
              {packCandidates.length > 0 && (
                <div className="absolute inset-x-0 top-full mt-1 z-10 glass-strong rounded-2xl p-1.5 space-y-0.5 shadow-lg">
                  {packCandidates.map(i2 => (
                    <button key={i2.id}
                      onClick={() => {
                        const qty = parseInt(prompt(`Kolik kusů „${i2.name}" vzít? (skladem ${i2.quantity} ${i2.unit})`, '1') ?? '');
                        if (!Number.isFinite(qty) || qty <= 0) return;
                        patch(e.id, { packing: [...e.packing, { itemId: i2.id, name: i2.name, qty, packed: false, returned: null }] });
                        setPackSearch('');
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-sm text-[#16181A] hover:bg-black/[0.06] transition-colors flex justify-between gap-2">
                      <span className="min-w-0 truncate">{i2.name}</span>
                      <span className="shrink-0 text-xs text-black/40">{i2.quantity} {i2.unit}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* money */}
        <div className="mt-5 rounded-2xl bg-black/[0.03] border border-black/[0.06] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">Vyúčtování akce</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-black/40 mb-1">Tržba z akce</label>
              <input type="number" inputMode="numeric" value={revenue} onChange={ev3 => setRevenue(ev3.target.value)}
                onBlur={() => patch(e.id, { revenue: revenue === '' ? null : Number(revenue) })} placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-black/40 mb-1">Náklady</label>
              <input type="number" inputMode="numeric" value={costs} onChange={ev3 => setCosts(ev3.target.value)}
                onBlur={() => patch(e.id, { costs: costs === '' ? null : Number(costs) })} placeholder="0" className={inputClass} />
            </div>
          </div>
          {result != null && (
            <p className={`mt-2.5 text-sm font-bold tabular-nums ${result >= 0 ? 'text-[#5B7A08]' : 'text-red-600'}`}>
              Výsledek: {result >= 0 ? '+' : ''}{money(result)}
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-between gap-2">
          <button onClick={async () => {
            if (!confirm(`Smazat akci „${e.title}"? Odeberou se i směny z akce.`)) return;
            const res = await fetch(`/api/events/${e.id}`, { method: 'DELETE' }).catch(() => null);
            if (res?.ok) onDeleted();
          }} className="rounded-full glass text-black/45 hover:text-red-600 px-4 py-2.5 text-sm font-medium transition">
            Smazat akci
          </button>
          <button onClick={onClose} className="rounded-full bg-[#16181A] text-white font-semibold px-6 py-2.5 text-sm hover:bg-black transition">Hotovo</button>
        </div>
      </div>
    </div>
  );
}
