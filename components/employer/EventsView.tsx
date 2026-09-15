'use client';

// Events: the shop's concerts, lectures and offsite trips — crewed from the
// team (creates real shifts), packed from the stock (real movements), shown
// to customers when public, and settled with a simple revenue/costs outcome.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { PageHeader, Button } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { EVENT_KINDS, EVENT_STATUSES, kindSpec, statusLabel } from '@/lib/events';
import { pragueToday } from '@/lib/pragueTime';
import { useModal } from '@/lib/useModal';

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

  const [menuItems, setMenuItems] = useState<any[]>([]);
  const load = async () => {
    try {
      const [ed, td, iv, mb] = await Promise.all([
        fetch('/api/events').then(r => r.json()).catch(() => ({})),
        fetch('/api/teams').then(r => r.json()).catch(() => ({})),
        fetch('/api/inventory').then(r => r.json()).catch(() => []),
        fetch('/api/menu').then(r => r.json()).catch(() => null),
      ]);
      setEvents(Array.isArray(ed.events) ? ed.events : []);
      setMembers((td.members ?? []).filter((m: any) => m.role !== 'kiosk'));
      setItems(Array.isArray(iv) ? iv.filter((i: any) => i.archived !== true && i.approved !== false) : []);
      // Nabídka podniku jako našeptávač pro menu akce — jméno i cena.
      setMenuItems(Array.isArray(mb?.sections) ? mb.sections.flatMap((sec: any) => sec.items ?? []) : []);
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
            <p className="font-bold tracking-tight text-[#16181A] line-clamp-2"><Icon name={k.icon} size={16} className="inline -mt-0.5 mr-1.5 text-[#0A6FE0]" />{e.title}</p>
            <p className="text-sm text-black/50 mt-0.5 cz-sentence line-clamp-2">
              {fmtDate(e.date)}{e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}
            </p>
            {(e.offsite || e.location) && (
              <p className="text-xs text-black/40 mt-0.5 line-clamp-2"><Icon name="location" size={15} className="inline -mt-0.5 mr-1.5 shrink-0" /> {e.location || 'mimo podnik'}{e.offsite ? ' · venkovní' : ''}</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <span className={`tap-target-sm rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
              e.status === 'confirmed' ? 'bg-[#C8F542]/20 text-[#5B7A08]'
              : e.status === 'done' ? 'bg-black/[0.06] text-black/50'
              : e.status === 'cancelled' ? 'bg-red-500/10 text-red-600'
              : 'bg-[#0A84FF]/10 text-[#0A6FE0]'
            }`}>{statusLabel(e.status)}</span>
            {e.public && <span className="text-[11px] text-[#5B7A08]">veřejná{e.going > 0 ? ` · ✋ ${e.going}` : ''}</span>}
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
              <span key={p.id} className="tap-target-sm rounded-full bg-white/60 border border-black/[0.06] px-2.5 py-1 text-xs text-[#16181A]">
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
      <PageHeader title="Akce" subtitle="Koncerty, přednášky i výjezdy čajovny — se směnami, balením a vyúčtováním."
        primary={<Button variant="accent" icon="plus" onClick={() => setCreating(true)}>Nová akce</Button>} />

      {err && <p className="text-sm text-red-600">{err}</p>}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
        </div>
      ) : (
        <>
          {upcoming.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C8F542]/15 text-2xl mb-3"><Icon name="calendarCheck" size={15} /></div>
              <p className="text-black/55 text-sm">Žádná naplánovaná akce. Založ první — obsadíš ji lidmi, sbalíš sklad a dáš vědět zákazníkům.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {upcoming.map(e => <EventCard key={e.id} e={e} />)}
            </div>
          )}

          {past.length > 0 && (
            <div>
              <button onClick={() => setShowPast(o => !o)} className="tap-target-sm text-sm text-black/45 hover:text-black transition flex items-center gap-1.5">
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
        <EventDetail event={detail} members={members} items={items} menuItems={menuItems} money={money} patch={patch}
          onClose={() => setDetail(null)}
          onDeleted={async () => { setDetail(null); await load(); }} />
      )}
    </div>
  );
}

// ---- Create form (short — details come after in the detail sheet) ----
function EventEditor({ onClose, onSaved }: { onClose: () => void; onSaved: (ev: any) => void }) {
  const m = useModal(true, onClose, 'Nová akce');
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
      <div ref={m.ref} {...m.dialogProps} className="modal-sheet rounded-3xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold tracking-tight text-[#16181A] mb-4">Nová akce</h3>
        {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
        <div className="space-y-3">
          {/* Základní rozcestí: akce u nás (obsluha = kdo je na směně), nebo
              výjezd ven (vlastní směna k akci, balení skladu, uzávěrka za akci). */}
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl glass border border-black/[0.07] p-1" role="radiogroup" aria-label="Kde se akce koná">
            <button type="button" role="radio" aria-checked={!offsite} onClick={() => setOffsite(false)}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${!offsite ? 'bg-[#16181A] text-white' : 'text-black/55 hover:text-black'}`}>
              <Icon name="overview" size={15} className="inline -mt-0.5 mr-1.5" />U nás v podniku
            </button>
            <button type="button" role="radio" aria-checked={offsite} onClick={() => setOffsite(true)}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${offsite ? 'bg-[#16181A] text-white' : 'text-black/55 hover:text-black'}`}>
              <Icon name="tent" size={15} className="inline -mt-0.5 mr-1.5" />Výjezd ven
            </button>
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Název akce" maxLength={160} className={inputClass} />
          <div className="flex flex-wrap gap-1.5">
            {EVENT_KINDS.map(k => (
              <button key={k.id} type="button" onClick={() => { setKind(k.id); if (k.id === 'outdoor') setOffsite(true); }}
                className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold transition ${kind === k.id ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'}`}>
                <Icon name={k.icon} size={15} className="inline -mt-0.5 mr-1.5" />{k.label}
              </button>
            ))}
          </div>
          <input type="date" aria-label="Datum akce" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
          <div className="grid grid-cols-2 gap-2">
            <input type="time" aria-label="Začátek akce" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputClass} />
            <input type="time" aria-label="Konec akce" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputClass} />
          </div>
          <input value={location} onChange={e => setLocation(e.target.value)}
            placeholder={offsite ? 'Kam se jede — název místa a adresa' : 'Místo v podniku (nepovinné, třeba „zahrádka")'}
            maxLength={300} className={inputClass} />
          <p className="text-xs text-black/45">
            {offsite
              ? 'Výjezd: lidem vytvoříš směnu jen k akci, sbalíš sklad a večer uděláte uzávěrku za akci.'
              : 'Akce u nás: obsluha je ten den ze směny, další lidi můžeš přidat navíc.'}
          </p>
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
function EventDetail({ event: e, members, items, menuItems, money, patch, onClose, onDeleted }: {
  event: any; members: any[]; items: any[]; menuItems: any[]; money: (n: number) => string;
  patch: (id: number, body: any) => Promise<boolean>;
  onClose: () => void; onDeleted: () => void;
}) {
  const dm = useModal(true, onClose, 'Detail akce');
  const [checkTxt, setCheckTxt] = useState('');
  const [packSearch, setPackSearch] = useState('');
  const [dishName, setDishName] = useState('');
  const [dishPrice, setDishPrice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
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
      <div ref={dm.ref} {...dm.dialogProps} className="modal-sheet rounded-3xl p-6 max-w-2xl w-full max-h-[92vh] overflow-y-auto scrollbar-thin" onClick={ev2 => ev2.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <h3 className="text-xl font-bold tracking-tight text-[#16181A]"><Icon name={k.icon} size={20} className="inline -mt-1 mr-2 text-[#0A6FE0]" />{e.title}</h3>
            <p className="text-sm text-black/50 cz-sentence mt-0.5">
              {new Date(e.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}
              {e.location ? ` · ${e.location}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full w-9 h-9 flex items-center justify-center glass text-black/50 hover:text-black" aria-label="Zavřít"><Icon name="close" size={15} /></button>
        </div>

        {/* status + publicity row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {EVENT_STATUSES.map(st => (
            <button key={st.id} onClick={() => patch(e.id, { status: st.id })}
              className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                e.status === st.id ? 'bg-[#16181A] text-white' : 'glass text-black/50 hover:text-black'
              }`}>
              {st.label}
            </button>
          ))}
          <span className="flex-1" />
          <button onClick={() => patch(e.id, { public: !e.public })}
            className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              e.public ? 'bg-[#C8F542]/20 text-[#5B7A08]' : 'glass text-black/50 hover:text-black'
            }`}
            title="Veřejná akce se ukáže zákazníkům na sdílené stránce">
            {e.public ? 'Veřejná' : 'Zveřejnit zákazníkům'}
          </button>
          <button onClick={() => patch(e.id, { publishToTeam: true }).then(ok => ok && alert('Tým dostal notifikaci o akci. ✓'))}
            className="tap-target-sm rounded-full glass px-3 py-1.5 text-xs font-semibold text-black/50 hover:text-black transition">
            📣 Oznámit týmu
          </button>
          {e.public && (
            <button disabled={announcing}
              onClick={async () => {
                if (!confirm('Rozeslat akci všem členům podniku? Přijde jim push a objeví se v novinkách na stránce podniku.')) return;
                setAnnouncing(true);
                const ok = await patch(e.id, { announceMembers: true });
                setAnnouncing(false);
                if (ok) alert('Členové dostali pozvánku. ✓');
              }}
              className="tap-target-sm rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-3 py-1.5 text-xs font-semibold hover:bg-[#C8F542]/30 transition disabled:opacity-50">
              {announcing ? 'Rozesílám…' : '📣 Rozeslat členům'}
            </button>
          )}
        </div>
        {e.public && (e.followers > 0 || e.going > 0) && (
          <p className="mt-2 text-xs text-black/50">
            <Icon name="bell" size={13} className="inline -mt-0.5 mr-1" />{e.followers} {e.followers === 1 ? 'host sleduje' : e.followers < 5 ? 'hosté sledují' : 'hostů sleduje'}
            {e.going > 0 && <> · ✋ {e.going} {e.going === 1 ? 'přijde' : e.going < 5 ? 'přijdou' : 'přijde'}{e.capacity ? ` z ${e.capacity} míst` : ''}</>}
          </p>
        )}

        {/* obsluha akce: u nás začíná tím, kdo ten den stejně je na směně */}
        {!e.offsite && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">Ze směny ten den ({(e.onShift ?? []).length})</p>
            {(e.onShift ?? []).length === 0 ? (
              <p className="text-sm text-black/45">Na {new Date(e.date + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })} zatím v rozvrhu nikdo není — obsluhu přidej níž, nebo naplánuj směny v Rozvrhu.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(e.onShift ?? []).map((m2: any) => (
                  <span key={m2.id} className="rounded-full bg-[#0A84FF]/10 text-[#0A6FE0] border border-[#0A84FF]/20 px-3 py-1.5 text-sm">
                    {m2.avatar} {m2.name}<span className="text-[#0A6FE0]/70 tabular-nums">{m2.start ? ` · ${String(m2.start).slice(0, 5)}` : ''}{m2.end ? `–${String(m2.end).slice(0, 5)}` : ''}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {/* crew */}
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">
            {e.offsite ? `Směna k akci (${e.crew.length}) — vytvoří směnu jen na tenhle výjezd` : `Navíc na akci (${e.crew.length}) — vytvoří směnu v rozvrhu`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {members.map(m => {
              const on = e.crew.includes(m.id);
              return (
                <button key={m.id} onClick={() => toggleCrew(m.id)}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    on ? 'bg-[#C8F542]/20 text-[#5B7A08] border border-[#C8F542]/40 font-semibold' : 'glass text-black/55 hover:text-black border border-transparent'
                  }`}>
                  {m.avatar ?? ''} {m.name}{on ? <Icon name="check" size={13} className="inline ml-1 -mt-0.5" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* fotky akce — hosté je uvidí na stránce podniku */}
        <div className="mt-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-black/45">Fotky ({(e.photos ?? []).length}/8)</p>
            <label className={`tap-target-sm rounded-full glass px-3 py-1.5 text-xs font-semibold text-black/55 hover:text-black transition cursor-pointer ${uploading || (e.photos ?? []).length >= 8 ? 'opacity-50 pointer-events-none' : ''}`}>
              <Icon name="camera" size={15} className="inline -mt-0.5 mr-1.5" />{uploading ? 'Nahrávám…' : 'Přidat fotku'}
              <input type="file" accept="image/*" className="sr-only" onChange={async ev3 => {
                const f = ev3.target.files?.[0]; ev3.target.value = '';
                if (!f) return;
                setUploading(true);
                const fd = new FormData(); fd.append('file', f);
                const r = await fetch('/api/upload', { method: 'POST', body: fd }).catch(() => null);
                const d = r?.ok ? await r.json().catch(() => null) : null;
                setUploading(false);
                const upId = d?.url ? parseInt(String(d.url).split('/').pop()!) : NaN;
                if (!Number.isFinite(upId)) { alert('Fotku se nepodařilo nahrát.'); return; }
                await patch(e.id, { photos: [...(e.photos ?? []), `/api/client/img/${upId}`] });
              }} />
            </label>
          </div>
          {(e.photos ?? []).length === 0 ? (
            <p className="text-sm text-black/40">Zatím žádná fotka. První nahraná je i náhledovka pro hosty.</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {(e.photos ?? []).map((url: string, i: number) => (
                <div key={url} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Fotka akce ${i + 1}`} className="aspect-square w-full rounded-2xl object-cover border border-black/[0.06]" />
                  <button type="button" aria-label={`Odebrat fotku ${i + 1}`}
                    onClick={() => patch(e.id, { photos: (e.photos ?? []).filter((_: string, j: number) => j !== i) })}
                    className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-[#16181A] text-white grid place-items-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition"><Icon name="close" size={11} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* menu akce — co se tam bude podávat; hosté ho uvidí v detailu */}
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">Menu akce ({(e.menu ?? []).length})</p>
          {(e.menu ?? []).length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {(e.menu ?? []).map((l: any, i: number) => (
                <li key={i} className="flex items-center gap-2.5 rounded-xl bg-white/60 border border-black/[0.06] px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-[#16181A]">{l.name}</span>
                  {l.price != null && <span className="shrink-0 text-xs text-black/55 tabular-nums">{money(l.price)}</span>}
                  <button type="button" aria-label={`Odebrat ${l.name} z menu akce`}
                    onClick={() => patch(e.id, { menu: (e.menu ?? []).filter((_: any, j: number) => j !== i) })}
                    className="shrink-0 text-black/25 hover:text-red-600"><Icon name="close" size={15} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input value={dishName} list="event-menu-dl" placeholder="Položka — vyber z nabídky, nebo napiš vlastní…" maxLength={120}
              onChange={ev3 => {
                setDishName(ev3.target.value);
                const hit = menuItems.find((mi: any) => mi.name === ev3.target.value);
                if (hit && hit.price != null) setDishPrice(String(hit.price));
              }}
              onKeyDown={ev3 => { if (ev3.key === 'Enter' && dishName.trim()) { patch(e.id, { menu: [...(e.menu ?? []), { name: dishName.trim(), price: dishPrice === '' ? null : Number(dishPrice) }] }); setDishName(''); setDishPrice(''); } }}
              className={inputClass} />
            <datalist id="event-menu-dl">
              {menuItems.map((mi: any) => <option key={mi.id} value={mi.name} />)}
            </datalist>
            <input value={dishPrice} onChange={ev3 => setDishPrice(ev3.target.value)} type="number" inputMode="numeric" placeholder="Kč" aria-label="Cena položky"
              className={`${inputClass} !w-24 text-center`} />
            <button onClick={() => { if (dishName.trim()) { patch(e.id, { menu: [...(e.menu ?? []), { name: dishName.trim(), price: dishPrice === '' ? null : Number(dishPrice) }] }); setDishName(''); setDishPrice(''); } }}
              className="shrink-0 rounded-full bg-black/[0.05] text-[#16181A] font-semibold px-4 text-sm hover:bg-black/[0.08] transition">+</button>
          </div>
        </div>

        {/* checklist */}
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">Přípravy</p>
          <div className="space-y-1.5">
            {e.checklist.map((c: any, i: number) => (
              <div key={i}
                className={`w-full flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-sm transition ${
                  c.done ? 'border-[#C8F542]/30 bg-[#C8F542]/[0.08] text-black/45 line-through' : 'border-black/[0.07] bg-white/50 text-[#16181A]'
                }`}>
                <button type="button" aria-pressed={c.done}
                  onClick={() => patch(e.id, { checklist: e.checklist.map((x: any, j: number) => j === i ? { ...x, done: !x.done } : x) })}
                  className="flex items-center gap-2.5 text-left min-w-0 flex-1">
                  <span className={c.done ? 'text-[#4F6A07]' : 'text-black/30'}><Icon name={c.done ? 'check' : 'box'} size={16} /></span>
                  <span className="min-w-0 flex-1">{c.text}</span>
                </button>
                <button type="button" aria-label="Odebrat úkol"
                  onClick={() => patch(e.id, { checklist: e.checklist.filter((_: any, j: number) => j !== i) })}
                  className="shrink-0 text-black/25 hover:text-red-600 px-1"><Icon name="close" size={15} /></button>
              </div>
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
                    className="tap-target-sm rounded-full bg-[#16181A] text-white px-3 py-1.5 text-xs font-bold hover:bg-black transition">
                    <Icon name="box" size={15} className="inline -mt-0.5 mr-1.5 shrink-0" /> Vyskladnit
                  </button>
                )}
                {e.packing.some((p: any) => p.itemId && p.packed && p.returned == null) && (
                  <button onClick={() => { if (confirm('Vrátit sbalené položky zpět do skladu? (Vrací se plné množství — spotřebu pak uprav ve skladu.)')) patch(e.id, { packAction: 'return' }); }}
                    className="tap-target-sm rounded-full bg-[#C8F542] text-black px-3 py-1.5 text-xs font-bold hover:brightness-110 transition">
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
                    <button aria-label="Zavřít" onClick={() => patch(e.id, { packing: e.packing.filter((_: any, j: number) => j !== i) })}
                      className="shrink-0 text-black/25 hover:text-red-600"><Icon name="close" size={15} /></button>
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
          {e.closingsCount > 0 && (
            <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap rounded-xl bg-white/60 border border-black/[0.06] px-3 py-2">
              <p className="text-sm text-black/60"><Icon name="receipt" size={15} className="inline -mt-0.5 mr-1.5" />
                {e.closingsCount === 1 ? 'Uzávěrka za akci' : `Uzávěrky za akci: ${e.closingsCount}`} · <span className="font-semibold tabular-nums text-[#16181A]">{money(e.closingsTotal)}</span>
              </p>
              {e.closingsTotal !== (e.revenue ?? 0) && (
                <button onClick={() => patch(e.id, { adoptRevenue: true })}
                  className="tap-target-sm rounded-full bg-[#16181A] text-white px-3 py-1.5 text-xs font-bold hover:bg-black transition">
                  Převzít do tržby
                </button>
              )}
            </div>
          )}
          {e.offsite && e.closingsCount === 0 && (
            <p className="mt-2.5 text-xs text-black/45">Na místě uděláte uzávěrku za akci: Uzávěrka → „Uzávěrka za akci?" — tržba se pak dá převzít sem jedním klikem.</p>
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
