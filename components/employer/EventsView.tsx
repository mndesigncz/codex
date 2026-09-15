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

  const [menuSections, setMenuSections] = useState<any[]>([]);
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
      // Nabídka podniku po sekcích (přes všechny tabule) — menu akce se z ní jen odkazuje.
      setMenuSections(Array.isArray(mb?.boards)
        ? mb.boards.flatMap((bd: any) => (bd.sections ?? []).map((sec: any) => ({ ...sec, id: `${bd.id}-${sec.id}` })))
            .filter((sec: any) => (sec.items ?? []).length > 0)
        : []);
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
        <EventDetail event={detail} members={members} items={items} menuSections={menuSections} money={money} patch={patch}
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

// ---- Detail akce: Kdy a kde · Lidé · Pro hosty · Přípravy · Peníze ----
// Jedna vizuální řeč: kreslené ikony jen na tlačítkách, nadpisy sekcí bez
// ozdob, obsah pro hosty pohromadě v jedné kartě. Menu akce se neopisuje —
// odkazuje se z nabídky podniku a ceny se dočítají odtamtud.

function Sec({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-black/45">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

function EventDetail({ event: e, members, items, menuSections, money, patch, onClose, onDeleted }: {
  event: any; members: any[]; items: any[]; menuSections: any[]; money: (n: number) => string;
  patch: (id: number, body: any) => Promise<boolean>;
  onClose: () => void; onDeleted: () => void;
}) {
  const dm = useModal(true, onClose, 'Detail akce');
  const [checkTxt, setCheckTxt] = useState('');
  const [packSearch, setPackSearch] = useState('');
  const [menuPickOpen, setMenuPickOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  // Základ a peníze se editují v místě — ukládá se při opuštění pole.
  const [base, setBase] = useState({ date: e.date ?? '', start: e.startTime ?? '', end: e.endTime ?? '', location: e.location ?? '', capacity: e.capacity != null ? String(e.capacity) : '' });
  const [desc, setDesc] = useState(e.description ?? '');
  const [revenue, setRevenue] = useState(e.revenue != null ? String(e.revenue) : '');
  const [costs, setCosts] = useState(e.costs != null ? String(e.costs) : '');
  const k = kindSpec(e.kind);

  // Tržbu akce s uzávěrkami nese uzávěrka; ruční pole je jen pro akce bez ní.
  const shownRevenue = e.closingsCount > 0 ? e.closingsTotal : (e.revenue ?? null);
  const result = shownRevenue != null || e.costs != null ? (shownRevenue ?? 0) - (e.costs ?? 0) : null;

  const toggleCrew = (id: number) => {
    const next = e.crew.includes(id) ? e.crew.filter((x: number) => x !== id) : [...e.crew, id];
    patch(e.id, { crew: next });
  };
  const menuHas = (itemId: number) => (e.menu ?? []).some((l: any) => l.itemId === itemId);
  const toggleMenuItem = (itemId: number) => {
    const next = menuHas(itemId)
      ? (e.menu ?? []).filter((l: any) => l.itemId !== itemId)
      : [...(e.menu ?? []), { itemId }];
    patch(e.id, { menu: next });
  };

  const packCandidates = packSearch.trim()
    ? items.filter(i => i.name.toLowerCase().includes(packSearch.toLowerCase())
        && !e.packing.some((p: any) => p.itemId === i.id)).slice(0, 6)
    : [];

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-4" onClick={onClose}>
      <div ref={dm.ref} {...dm.dialogProps} className="modal-sheet rounded-3xl p-6 max-w-2xl w-full max-h-[92vh] overflow-y-auto scrollbar-thin" onClick={ev2 => ev2.stopPropagation()}>
        {/* hlavička */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-bold tracking-tight text-[#16181A]"><Icon name={k.icon} size={20} className="inline -mt-1 mr-2 text-[#0A6FE0]" />{e.title}</h3>
            <p className="text-sm text-black/50 cz-sentence mt-0.5">
              {e.offsite ? 'Výjezd ven' : 'U nás v podniku'}
              {' · '}{new Date(e.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
              {e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="tap-target-sm shrink-0 rounded-full w-9 h-9 flex items-center justify-center glass text-black/50 hover:text-black" aria-label="Zavřít"><Icon name="close" size={15} /></button>
        </div>

        {/* stav + oznámení týmu */}
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
          <button onClick={() => patch(e.id, { publishToTeam: true }).then(ok => ok && alert('Tým dostal notifikaci o akci. ✓'))}
            className="tap-target-sm rounded-full glass px-3 py-1.5 text-xs font-semibold text-black/50 hover:text-black transition">
            <Icon name="bell" size={13} className="inline -mt-0.5 mr-1.5" />Oznámit týmu
          </button>
        </div>

        {/* kdy a kde — edituje se rovnou tady, uloží se při opuštění pole */}
        <Sec title="Kdy a kde">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input type="date" aria-label="Datum akce" value={base.date}
              onChange={ev3 => setBase(b => ({ ...b, date: ev3.target.value }))}
              onBlur={() => { if (base.date && base.date !== e.date) patch(e.id, { date: base.date }); }}
              className={`${inputClass} col-span-2 sm:col-span-1`} />
            <div className="col-span-2 sm:col-span-1 grid grid-cols-2 gap-2">
              <input type="time" aria-label="Začátek" value={base.start}
                onChange={ev3 => setBase(b => ({ ...b, start: ev3.target.value }))}
                onBlur={() => { if (base.start !== (e.startTime ?? '')) patch(e.id, { startTime: base.start }); }}
                className={inputClass} />
              <input type="time" aria-label="Konec" value={base.end}
                onChange={ev3 => setBase(b => ({ ...b, end: ev3.target.value }))}
                onBlur={() => { if (base.end !== (e.endTime ?? '')) patch(e.id, { endTime: base.end }); }}
                className={inputClass} />
            </div>
            <input aria-label="Místo" placeholder={e.offsite ? 'Kam se jede — místo a adresa' : 'Místo v podniku'} value={base.location} maxLength={300}
              onChange={ev3 => setBase(b => ({ ...b, location: ev3.target.value }))}
              onBlur={() => { if (base.location !== (e.location ?? '')) patch(e.id, { location: base.location }); }}
              className={`${inputClass} col-span-2`} />
          </div>
          {e.public && <p className="text-[11px] text-black/40 mt-1.5">Změnu termínu veřejné akce pošleme hostům, kteří ji sledují.</p>}
        </Sec>

        {/* lidé */}
        {!e.offsite && (
          <Sec title={`Ze směny ten den (${(e.onShift ?? []).length})`}>
            {(e.onShift ?? []).length === 0 ? (
              <p className="text-sm text-black/45">V rozvrhu na ten den zatím nikdo není — obsluhu přidej níž, nebo naplánuj směny v Rozvrhu.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(e.onShift ?? []).map((m2: any) => (
                  <span key={m2.id} className="rounded-full bg-[#0A84FF]/10 text-[#0A6FE0] border border-[#0A84FF]/20 px-3 py-1.5 text-sm">
                    {m2.avatar} {m2.name}<span className="text-[#0A6FE0]/70 tabular-nums">{m2.start ? ` · ${String(m2.start).slice(0, 5)}` : ''}{m2.end ? `–${String(m2.end).slice(0, 5)}` : ''}</span>
                  </span>
                ))}
              </div>
            )}
          </Sec>
        )}
        <Sec title={e.offsite ? `Směna k akci (${e.crew.length}) — jen na tenhle výjezd` : `Navíc na akci (${e.crew.length}) — vytvoří směnu v rozvrhu`}>
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
        </Sec>

        {/* pro hosty — všechno, co uvidí zákazník, v jedné kartě */}
        <Sec title="Pro hosty">
          <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => patch(e.id, { public: !e.public })} aria-pressed={e.public}
                className={`tap-target-sm rounded-full px-3.5 py-2 text-xs font-bold transition ${
                  e.public ? 'bg-[#C8F542] on-accent' : 'bg-white/70 border border-black/10 text-black/55 hover:text-black'
                }`}>
                {e.public ? 'Veřejná — hosté ji vidí' : 'Zveřejnit hostům'}
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
                  className="tap-target-sm rounded-full bg-white/70 border border-black/10 px-3.5 py-2 text-xs font-semibold text-black/60 hover:text-black transition disabled:opacity-50">
                  <Icon name="send" size={13} className="inline -mt-0.5 mr-1.5" />{announcing ? 'Rozesílám…' : 'Rozeslat členům'}
                </button>
              )}
              {e.public && (e.followers > 0 || e.going > 0) && (
                <span className="text-xs text-black/50 ml-auto">sleduje {e.followers} · přijde {e.going}{e.capacity ? ` z ${e.capacity}` : ''}</span>
              )}
            </div>
            {e.public && (
              <p className="text-[11px] text-black/40 -mt-2">Na stránce podniku uvidí detail s fotkami a menu, přidají si akci do kalendáře a den předem jim přijde připomínka.</p>
            )}

            <div>
              <p className="text-[11px] uppercase tracking-wider text-black/40 mb-1">Popis</p>
              <textarea value={desc} rows={3} maxLength={2000} placeholder="Co hosty čeká — program, vstupné, na co se těšit…"
                onChange={ev3 => setDesc(ev3.target.value)}
                onBlur={() => { if (desc !== (e.description ?? '')) patch(e.id, { description: desc }); }}
                className={`${inputClass} resize-y`} />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[11px] uppercase tracking-wider text-black/40">Fotky ({(e.photos ?? []).length}/8)</p>
                <label className={`tap-target-sm rounded-full bg-white/70 border border-black/10 px-3 py-1.5 text-xs font-semibold text-black/60 hover:text-black transition cursor-pointer ${uploading || (e.photos ?? []).length >= 8 ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Icon name="camera" size={13} className="inline -mt-0.5 mr-1.5" />{uploading ? 'Nahrávám…' : 'Přidat'}
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
                <p className="text-sm text-black/40">První nahraná fotka je náhledovka akce.</p>
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

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[11px] uppercase tracking-wider text-black/40">Menu akce ({(e.menu ?? []).length}) — z nabídky podniku</p>
                <button type="button" onClick={() => setMenuPickOpen(o => !o)} aria-expanded={menuPickOpen}
                  className="tap-target-sm rounded-full bg-white/70 border border-black/10 px-3 py-1.5 text-xs font-semibold text-black/60 hover:text-black transition">
                  <Icon name="leaf" size={13} className="inline -mt-0.5 mr-1.5" />{menuPickOpen ? 'Hotovo' : 'Vybrat z nabídky'}
                </button>
              </div>
              {(e.menu ?? []).length > 0 && (
                <ul className="space-y-1.5">
                  {(e.menu ?? []).map((l: any, i: number) => (
                    <li key={`${l.itemId ?? 'x'}-${i}`} className="flex items-center gap-2.5 rounded-xl bg-white/60 border border-black/[0.06] px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-[#16181A]">{l.name}</span>
                      {l.price != null && <span className="shrink-0 text-xs text-black/55 tabular-nums">{money(l.price)}</span>}
                      <button type="button" aria-label={`Vyřadit ${l.name} z menu akce`}
                        onClick={() => patch(e.id, { menu: (e.menu ?? []).filter((_: any, j: number) => j !== i) })}
                        className="shrink-0 text-black/25 hover:text-red-600"><Icon name="close" size={15} /></button>
                    </li>
                  ))}
                </ul>
              )}
              {menuPickOpen && (
                <div className="mt-2 rounded-2xl bg-white/70 border border-black/[0.08] p-3 max-h-64 overflow-y-auto scrollbar-thin space-y-3">
                  {menuSections.length === 0 ? (
                    <p className="text-sm text-black/45">Nabídka je prázdná — nejdřív ji naplň v sekci Menu.</p>
                  ) : menuSections.map((sec: any) => (
                    <div key={sec.id}>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-black/40 mb-1">{sec.title}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(sec.items ?? []).map((mi: any) => {
                          const on = menuHas(mi.id);
                          return (
                            <button key={mi.id} type="button" onClick={() => toggleMenuItem(mi.id)} aria-pressed={on}
                              className={`rounded-full px-3 py-1.5 text-xs transition ${
                                on ? 'bg-[#C8F542]/25 text-[#3E5406] border border-[#C8F542]/45 font-semibold' : 'bg-black/[0.04] text-black/55 hover:text-black border border-transparent'
                              }`}>
                              {mi.name}{mi.price != null ? ` · ${mi.price}` : ''}{on ? <Icon name="check" size={11} className="inline ml-1 -mt-0.5" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <a href="/employer/overview?mode=client&tab=menu" className="inline-block text-xs font-semibold text-[#0A6FE0] hover:underline">Chybí položka? Uprav nabídku v Menu →</a>
                </div>
              )}
              {!menuPickOpen && (e.menu ?? []).length === 0 && (
                <p className="text-sm text-black/40">Vyber, co se na akci bude podávat — ceny se berou z nabídky a drží s ní krok.</p>
              )}
            </div>
          </div>
        </Sec>

        {/* přípravy */}
        <Sec title="Přípravy">
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

          {e.offsite && (
            <div className="mt-3 rounded-2xl bg-black/[0.03] border border-black/[0.06] p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45"><Icon name="tent" size={13} className="inline -mt-0.5 mr-1.5" />Balicí seznam (ze skladu)</p>
                <div className="flex gap-1.5">
                  {e.packing.some((p: any) => p.itemId && !p.packed) && (
                    <button onClick={() => { if (confirm('Vyskladnit vše nesbalené? Množství se odečte ze skladu (s poznámkou u položek).')) patch(e.id, { packAction: 'checkout' }); }}
                      className="tap-target-sm rounded-full bg-[#16181A] text-white px-3 py-1.5 text-xs font-bold hover:bg-black transition">
                      <Icon name="box" size={13} className="inline -mt-0.5 mr-1.5 shrink-0" />Vyskladnit
                    </button>
                  )}
                  {e.packing.some((p: any) => p.itemId && p.packed && p.returned == null) && (
                    <button onClick={() => { if (confirm('Vrátit sbalené položky zpět do skladu? (Vrací se plné množství — spotřebu pak uprav ve skladu.)')) patch(e.id, { packAction: 'return' }); }}
                      className="tap-target-sm rounded-full bg-[#C8F542] on-accent px-3 py-1.5 text-xs font-bold hover:brightness-110 transition">
                      <Icon name="swap" size={13} className="inline -mt-0.5 mr-1.5 shrink-0" />Vrátit do skladu
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
                      <button aria-label={`Odebrat ${p2.name} z balení`} onClick={() => patch(e.id, { packing: e.packing.filter((_: any, j: number) => j !== i) })}
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
        </Sec>

        {/* peníze — tržbu nese uzávěrka za akci; ručně jen když žádná není */}
        <Sec title="Peníze">
          <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] p-4">
            {e.closingsCount > 0 ? (
              <div className="flex items-center justify-between gap-2 flex-wrap rounded-xl bg-white/60 border border-black/[0.06] px-3 py-2.5">
                <p className="text-sm text-black/60"><Icon name="receipt" size={15} className="inline -mt-0.5 mr-1.5" />Tržba z {e.closingsCount === 1 ? 'uzávěrky za akci' : `${e.closingsCount} uzávěrek za akci`}</p>
                <p className="text-sm font-bold tabular-nums text-[#16181A]">{money(e.closingsTotal)}</p>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-black/40 mb-1">Tržba z akce</label>
                <input type="number" inputMode="numeric" value={revenue} onChange={ev3 => setRevenue(ev3.target.value)}
                  onBlur={() => patch(e.id, { revenue: revenue === '' ? null : Number(revenue) })} placeholder="0" className={inputClass} />
                <p className="text-[11px] text-black/40 mt-1.5">
                  {e.offsite
                    ? 'Nebo na místě udělejte Uzávěrku → „Za akci" — pozná, že ten den akce je, a tržba se sem propíše sama.'
                    : 'Když obsluha udělá uzávěrku „Za akci", tržba se sem propíše sama.'}
                </p>
              </div>
            )}
            <div className="mt-2.5">
              <label className="block text-[11px] uppercase tracking-wider text-black/40 mb-1">Náklady</label>
              <input type="number" inputMode="numeric" value={costs} onChange={ev3 => setCosts(ev3.target.value)}
                onBlur={() => patch(e.id, { costs: costs === '' ? null : Number(costs) })} placeholder="0" className={inputClass} />
            </div>
            {result != null && (
              <p className={`mt-2.5 text-sm font-bold tabular-nums ${result >= 0 ? 'text-[#5B7A08]' : 'text-red-600'}`}>
                Výsledek: {result >= 0 ? '+' : ''}{money(result)}
              </p>
            )}
          </div>
        </Sec>

        <div className="mt-6 flex justify-between gap-2">
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
