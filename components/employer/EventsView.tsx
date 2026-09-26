'use client';

// Events: the shop's concerts, lectures and offsite trips — crewed from the
// team (creates real shifts), packed from the stock (real movements), shown
// to customers when public, and settled with a simple revenue/costs outcome.
//
// Kolo 69 (balík B8): stránka je plocha s widgety (PlochaWidgetu, stránka
// vedeni.akce) — v administraci i v Managero client stejná. Hlavička jde do
// plochy, tahle komponenta kreslí nástroj: seznam akcí. Z auditu „Klient –
// Akce": vlastní odsazení stránky pryč (sčítalo se s odsazením skořápky
// a nadpis ujel o 24 px), prázdný stav je EmptyState (dřív karta s větou
// a drobnou ikonou), akce jsou řádky jednoho seznamu v kartě (dřív
// průhledné klikací karty `glass-card` s modrou ikonou, ručně barvenými
// pilulkami stavu a emoji lidí v textu). „Nová akce" jen s akce.upravit.
// Seznam čte /api/events přes sdílenou mezipaměť widgetů: odškrtnutí
// v Přípravě akce se tak propíše sem a změna tady do widgetů.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Modal, Skeleton, Switch, type ChipTone } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { EVENT_KINDS, EVENT_STATUSES, kindSpec, statusLabel } from '@/lib/events';
import { pragueToday } from '@/lib/pragueTime';
import { useModal } from '@/lib/useModal';
import { okJson } from '@/lib/api';
import { DiscardGuard } from '../ui/DiscardGuard';
import { useDraft } from '@/lib/useDraft';
import { DraftNote } from '../ui/DraftNote';
import { obsahuje, obsahujeNekde } from '@/lib/hledani';
import { czCount, type CzNoun } from '@/lib/czech';
import { vysledekAkce } from '@/lib/klientPrehled';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { useOpravneni } from '../role/useOpravneni';
import { NaStranceAkci } from '../widgety/oblasti/akce';

type Ev = any;

const inputClass =
  'w-full field border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition';

const URL_AKCE = '/api/events';
const TON_STAVU: Record<string, ChipTone> = { planned: 'info', confirmed: 'ok', done: 'muted', cancelled: 'muted' };
const V_OBSLUZE: CzNoun = { one: 'člověk v obsluze', few: 'lidé v obsluze', many: 'lidí v obsluze' };

export default function EventsView({ user }: { user: { id?: string } }) {
  void user;
  const money = useMoney();
  // „Nová akce" podle `ma` (před načtením oprávnění ANO, rozhoduje server) — jako navigace layoutu.
  const { ma } = useOpravneni();
  const spravuje = ma('akce.upravit');
  const akce = useDataWidgetu<any>(URL_AKCE, raw => raw);
  const events: Ev[] = useMemo(() => (Array.isArray(akce.data?.events) ? akce.data.events : []), [akce.data]);
  const [members, setMembers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [detail, setDetail] = useState<Ev | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');
  const [showPast, setShowPast] = useState(false);

  const [menuBoards, setMenuBoards] = useState<any[]>([]);
  const nactiCiselniky = async () => {
    const [td, iv, mb] = await Promise.all([
      fetch('/api/teams').then(okJson).catch(() => ({})),
      fetch('/api/inventory').then(okJson).catch(() => []),
      fetch('/api/menu').then(okJson).catch(() => null),
    ]);
    setMembers((td.members ?? []).filter((m: any) => m.role !== 'kiosk'));
    setItems(Array.isArray(iv) ? iv.filter((i: any) => i.archived !== true && i.approved !== false) : []);
    // Nabídka podniku po tabulích — menu akce si bere celé tabule i položky.
    setMenuBoards(Array.isArray(mb?.boards)
      ? mb.boards.map((bd: any) => ({ id: bd.id, name: bd.name, sections: (bd.sections ?? []).filter((sec: any) => (sec.items ?? []).length > 0) }))
          .filter((bd: any) => bd.sections.length > 0)
      : []);
  };
  useEffect(() => { void nactiCiselniky(); }, []);
  const load = async () => { obnovDataWidgetu(URL_AKCE); };

  const today = pragueToday();
  const upcoming = useMemo(() => events.filter(e => e.date >= today && e.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date)), [events, today]);
  const past = useMemo(() => events.filter(e => e.date < today || e.status === 'cancelled').sort((a, b) => b.date.localeCompare(a.date)), [events, today]);

  const patch = async (id: number, body: any) => {
    const res = await fetch(`/api/events/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (res?.ok) {
      const d = await fetch(URL_AKCE).then(okJson).catch(() => ({}));
      const fresh = (d.events ?? []).find((e: Ev) => e.id === id);
      if (fresh) setDetail((cur: Ev) => (cur && cur.id === id ? fresh : cur));
      obnovDataWidgetu(URL_AKCE);
      return true;
    }
    const d = res ? await res.json().catch(() => ({})) : {};
    setErr(d.error || 'Uložení se nepodařilo.');
    return false;
  };

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });

  const radek = (e: Ev) => {
    const k = kindSpec(e.kind);
    // Stejná logika jako v detailu a ve widgetu Výsledek akce: tržbu akce s uzávěrkami nese uzávěrka.
    const rev = e.closingsCount > 0 ? e.closingsTotal : e.revenue;
    const result = vysledekAkce({ trzba: rev ?? null, naklady: e.costs ?? null });
    const lidi = (e.crewPeople ?? []).length;
    const meta = [
      `${fmtDate(e.date).replace(/^./, c => c.toLocaleUpperCase('cs-CZ'))}${e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}`,
      e.offsite || e.location ? `${e.location || 'mimo podnik'}${e.offsite ? ' · venkovní' : ''}` : null,
      lidi ? czCount(lidi, V_OBSLUZE) : null,
      e.public ? `veřejná${e.going > 0 ? ` · přijde ${e.going}` : ''}` : null,
    ].filter(Boolean).join(' · ');
    return (
      <ListRow key={e.id} onClick={() => setDetail(e)}
        lead={<Icon name={k.icon} size={18} className="text-black/40" />}
        title={e.title} meta={meta}
        value={result != null ? <span className={result >= 0 ? 'text-ok-ink' : 'text-bad-ink'}>{result >= 0 ? '+' : ''}{money(result)}</span> : undefined}
        right={<Chip tone={TON_STAVU[e.status] ?? 'info'} size="sm">{statusLabel(e.status)}</Chip>} />
    );
  };

  const nastroj = akce.error && !akce.data ? <ErrorState title="Akce se nenačetly" onRetry={akce.reload} detail={akce.error} />
    : !akce.data ? <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
    : (
      <div className="space-y-4">
        {akce.data.notMigrated && <p className="note note-wait">Akce budou dostupné po migraci (/api/init).</p>}
        {err && <p className="note note-danger" role="alert">{err}</p>}
        {upcoming.length === 0 ? (
          <Card>
            <EmptyState icon="calendarCheck" compact title="Žádná naplánovaná akce"
              hint="Založ první — obsadíš ji lidmi, sbalíš sklad a dáš vědět zákazníkům." />
          </Card>
        ) : (
          <Card pad="none" aria-label="Nadcházející akce"><ul className="list px-5">{upcoming.map(radek)}</ul></Card>
        )}
        {past.length > 0 && (
          <div className="space-y-2">
            <Button variant="ghost" size="sm" iconAfter="chevron" aria-expanded={showPast}
              className={showPast ? '[&>svg:last-child]:rotate-180' : ''} onClick={() => setShowPast(o => !o)}>
              Minulé a zrušené ({past.length})
            </Button>
            {showPast && <Card pad="none" aria-label="Minulé a zrušené akce"><ul className="list px-5">{past.map(radek)}</ul></Card>}
          </div>
        )}
      </div>
    );

  return (
    <>
      {/* Widgety na téhle ploše nekreslí odkaz „Akce ›" — vedl by sem. */}
      <NaStranceAkci.Provider value>
      <PlochaWidgetu
        stranka="vedeni.akce"
        hlavicka={{
          title: 'Akce',
          hintId: 'eventsview',
          subtitle: 'Koncerty, přednášky i výjezdy mimo podnik — se směnami, balením a vyúčtováním.',
          primary: spravuje ? <Button variant="accent" icon="plus" onClick={() => setCreating(true)}>Nová akce</Button> : undefined,
        }}
        nastroj={nastroj}
      />
      </NaStranceAkci.Provider>
      {creating && (
        <EventEditor onClose={() => setCreating(false)} onSaved={async (ev) => { setCreating(false); await load(); setDetail(ev); }} />
      )}
      {detail && (
        <EventDetail event={detail} members={members} items={items} menuBoards={menuBoards} money={money} patch={patch}
          onClose={() => setDetail(null)}
          onDeleted={async () => { setDetail(null); await load(); }} />
      )}
    </>
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
  const koncept = useDraft('akce-nova',
    { title, kind, date, startTime, endTime, location, offsite },
    (v) => { setTitle(v.title); setKind(v.kind); setDate(v.date); setStartTime(v.startTime);
             setEndTime(v.endTime); setLocation(v.location); setOffsite(v.offsite); },
    { vychozi: { title: '', kind: 'concert', date: '', startTime: '', endTime: '', location: '', offsite: false } });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true); setErr('');
    const res = await fetch('/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, kind, date, startTime, endTime, location, offsite }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) { const d = await res.json(); koncept.hotovo(); onSaved(d.event); }
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Akci se nepodařilo založit.'); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-4" onClick={onClose}>
      <div ref={m.ref} {...m.dialogProps} className="modal-sheet rounded-3xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={e => e.stopPropagation()}>
        <DiscardGuard guard={m.guard} />
        <h3 className="text-lg font-bold tracking-tight text-[#16181A] mb-4">Nová akce</h3>
        <div className="mb-3"><DraftNote koncept={koncept} co="rozepsanou akci" /></div>
        {err && <p className="text-sm text-bad-ink mb-2">{err}</p>}
        {/* Opravdový <form>, ne jen tlačítko s onClick: po vyplnění názvu
            a data se čeká, že Enter akci založí. Bez něj se musí sáhnout
            po myši uprostřed psaní. */}
        <form onSubmit={e => { e.preventDefault(); if (!busy && title.trim() && date) save(); }}>
        <div className="space-y-3">
          {/* Základní rozcestí: akce u nás (obsluha = kdo je na směně), nebo
              výjezd ven (vlastní směna k akci, balení skladu, uzávěrka za akci). */}
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl glass border border-black/[0.07] p-1" role="radiogroup" aria-label="Kde se akce koná">
            <button type="button" role="radio" aria-checked={!offsite} onClick={() => setOffsite(false)}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${!offsite ? 'seg-on' : 'seg-off'}`}>
              <Icon name="overview" size={15} className="inline -mt-0.5 mr-1.5" />U nás v podniku
            </button>
            <button type="button" role="radio" aria-checked={offsite} onClick={() => setOffsite(true)}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${offsite ? 'seg-on' : 'seg-off'}`}>
              <Icon name="tent" size={15} className="inline -mt-0.5 mr-1.5" />Výjezd ven
            </button>
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Název akce" maxLength={160} className={inputClass} />
          <div className="flex flex-wrap gap-1.5">
            {EVENT_KINDS.map(k => (
              <button key={k.id} type="button" onClick={() => { setKind(k.id); if (k.id === 'outdoor') setOffsite(true); }}
                className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold transition ${kind === k.id ? 'seg-on' : 'seg-off glass'}`}>
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
          <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Zrušit</button>
          <button type="submit" disabled={busy || !title.trim() || !date}
            className="btn btn-primary flex-1 disabled:opacity-50">
            {busy ? 'Zakládám…' : 'Založit akci'}
          </button>
        </div>
        </form>
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
        <p className="t-label">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

function EventDetail({ event: e, members, items, menuBoards, money, patch, onClose, onDeleted }: {
  event: any; members: any[]; items: any[]; menuBoards: any[]; money: (n: number) => string;
  patch: (id: number, body: any) => Promise<boolean>;
  onClose: () => void; onDeleted: () => void;
}) {
  const dm = useModal(true, onClose, 'Detail akce');
  const [checkTxt, setCheckTxt] = useState('');
  const [packSearch, setPackSearch] = useState('');
  const [menuPickOpen, setMenuPickOpen] = useState(false);
  const [crewSearch, setCrewSearch] = useState('');
  const [crewOpen, setCrewOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [places, setPlaces] = useState<any | null>(null);
  const [pos, setPos] = useState<any | null>(null);
  const [posBusy, setPosBusy] = useState(false);
  const [posErr, setPosErr] = useState('');
  const [uploading, setUploading] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  // Potvrzení nevratných kroků a počet kusů do balení v okně — dřív confirm() a prompt().
  const [potvrdit, setPotvrdit] = useState<{ title: string; text: string; akce: string; danger?: boolean; run: () => void } | null>(null);
  const [baleni, setBaleni] = useState<{ item: any; qty: string } | null>(null);
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
  const boardOn = (boardId: number) => (e.menu ?? []).some((l: any) => l.boardId === boardId);
  const toggleMenuItem = (itemId: number) => {
    const next = menuHas(itemId)
      ? (e.menu ?? []).filter((l: any) => l.itemId !== itemId)
      : [...(e.menu ?? []), { itemId }];
    patch(e.id, { menu: next });
  };
  const toggleBoard = (boardId: number) => {
    const next = boardOn(boardId)
      ? (e.menu ?? []).filter((l: any) => l.boardId !== boardId)
      : [...(e.menu ?? []), { boardId }];
    patch(e.id, { menu: next });
  };
  const addCustomLine = () => {
    if (!customName.trim()) return;
    patch(e.id, { menu: [...(e.menu ?? []), { name: customName.trim(), price: customPrice === '' ? null : Number(customPrice) }] });
    setCustomName(''); setCustomPrice('');
  };

  useEffect(() => {
    if (!e.offsite) return;
    let dead = false;
    fetch('/api/pos/places').then(okJson).then(d => { if (!dead) setPlaces(d); }).catch(() => {});
    return () => { dead = true; };
  }, [e.offsite]);

  const crewCandidates = members
    .filter(m => !e.crew.includes(m.id))
    .filter(m => obsahuje(m.name, crewSearch))
    .slice(0, 6);
  const packCandidates = packSearch.trim()
    ? items.filter(i => obsahuje(i.name, packSearch)
        && !e.packing.some((p: any) => p.itemId === i.id)).slice(0, 6)
    : [];

  return (
    <>
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-4" onClick={onClose}>
      <div ref={dm.ref} {...dm.dialogProps} className="modal-sheet rounded-3xl p-6 max-w-2xl w-full max-h-[92vh] overflow-y-auto scrollbar-thin" onClick={ev2 => ev2.stopPropagation()}>
        <DiscardGuard guard={dm.guard} />
        {/* hlavička */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-bold tracking-tight text-[#16181A]"><Icon name={k.icon} size={20} className="inline -mt-1 mr-2 text-[#0A5CC0]" />{e.title}</h3>
            <p className="text-sm text-black/50 cz-sentence mt-0.5">
              {e.offsite ? 'Výjezd ven' : 'U nás v podniku'}
              {' · '}{new Date(e.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
              {e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}
            </p>
          </div>
          <button onClick={dm.guard.attemptClose} className="tap-target-sm shrink-0 btn-icon" aria-label="Zavřít"><Icon name="close" size={15} /></button>
        </div>

        {/* stav + oznámení týmu */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {EVENT_STATUSES.map(st => (
            <button key={st.id} onClick={() => patch(e.id, { status: st.id })}
              className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                e.status === st.id ? 'seg-on' : 'seg-off glass'
              }`}>
              {st.label}
            </button>
          ))}
          <span className="hidden sm:block flex-1" />
          <button onClick={() => patch(e.id, { publishToTeam: true }).then(ok => ok && alert('Tým dostal notifikaci o akci.'))}
            className="tap-target-sm w-full sm:w-auto rounded-full glass px-3 py-1.5 text-xs font-semibold text-black/50 hover:text-black transition">
            <Icon name="bell" size={13} className="inline -mt-0.5 mr-1.5" />Oznámit týmu
          </button>
        </div>

        {/* kdy a kde — edituje se rovnou tady, uloží se při opuštění pole */}
        <Sec title="Kdy a kde">
          {/* Pevné minimální šířky: nativní time input potřebuje ~110 px,
              jinak hodnotu ořízne (vyfoceno „15:0…"). Řádek se láme, nemačká. */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <input type="date" aria-label="Datum akce" value={base.date}
              onChange={ev3 => setBase(b => ({ ...b, date: ev3.target.value }))}
              onBlur={() => { if (base.date && base.date !== e.date) patch(e.id, { date: base.date }); }}
              className={`${inputClass} col-span-2 sm:!w-auto sm:min-w-[150px] sm:grow`} />
            <input type="time" aria-label="Začátek" value={base.start}
              onChange={ev3 => setBase(b => ({ ...b, start: ev3.target.value }))}
              onBlur={() => { if (base.start !== (e.startTime ?? '')) patch(e.id, { startTime: base.start }); }}
              className={`${inputClass} !w-full sm:!w-[132px] shrink-0`} />
            <input type="time" aria-label="Konec" value={base.end}
              onChange={ev3 => setBase(b => ({ ...b, end: ev3.target.value }))}
              onBlur={() => { if (base.end !== (e.endTime ?? '')) patch(e.id, { endTime: base.end }); }}
              className={`${inputClass} !w-full sm:!w-[132px] shrink-0`} />
            <input aria-label="Místo" placeholder={e.offsite ? 'Kam se jede — místo a adresa' : 'Místo v podniku'} value={base.location} maxLength={300}
              onChange={ev3 => setBase(b => ({ ...b, location: ev3.target.value }))}
              onBlur={() => { if (base.location !== (e.location ?? '')) patch(e.id, { location: base.location }); }}
              className={`${inputClass} col-span-2 sm:basis-full`} />
          </div>
          {e.public && <p className="text-[11px] text-black/40 mt-1.5">Změnu termínu veřejné akce pošleme hostům, kteří ji sledují.</p>}
          {/* Výjezd s vlastním Storyous terminálem: přiřaď akci její provozovnu
              a tržby dvou kas se nikdy nesmíchají. Nabízí se jen, když má
              merchant provozoven víc. */}
          {e.offsite && places && (places.places ?? []).length > 1 && (
            <div className="mt-2.5">
              <label htmlFor={`akce-kasa-${e.id}`} className="field-label">Kasa akce (provozovna Storyous)</label>
              <select id={`akce-kasa-${e.id}`} value={e.posPlaceId ?? ''}
                onChange={ev3 => patch(e.id, { posPlaceId: ev3.target.value || null })}
                className={inputClass}>
                <option value="">Bez vlastní kasy — na místě jen hotovost (uzávěrka za akci)</option>
                {(places.places ?? []).filter((pl: any) => pl.placeId !== places.current).map((pl: any) => (
                  <option key={pl.placeId} value={pl.placeId}>{pl.name || pl.placeId}</option>
                ))}
              </select>
              <p className="text-[11px] text-black/40 mt-1">S vlastní kasou umí akce načíst svoji tržbu za celý den — odděleně od podniku.</p>
            </div>
          )}
        </Sec>

        {/* lidé */}
        {!e.offsite && (
          <Sec title={`Ze směny ten den (${(e.onShift ?? []).length})`}>
            {(e.onShift ?? []).length === 0 ? (
              <p className="text-sm text-black/45">V rozvrhu na ten den zatím nikdo není — obsluhu přidej níž, nebo naplánuj směny v Rozvrhu.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(e.onShift ?? []).map((m2: any) => (
                  <span key={m2.id} className="rounded-full bg-[#0A84FF]/10 text-[#0A5CC0] border border-[#0A84FF]/20 px-3 py-1.5 text-sm">
                    {m2.avatar} {m2.name}<span className="text-[#0A5CC0] tabular-nums">{m2.start ? ` · ${String(m2.start).slice(0, 5)}` : ''}{m2.end ? `–${String(m2.end).slice(0, 5)}` : ''}</span>
                  </span>
                ))}
              </div>
            )}
          </Sec>
        )}
        <Sec title={e.offsite ? `Směna k akci (${e.crew.length}) — jen na tenhle výjezd` : `Navíc na akci (${e.crew.length}) — vytvoří směnu v rozvrhu`}>
          {e.crew.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {e.crew.map((cid: number) => {
                // crewPeople řeší jména server — members můžou být ještě nenačtení
                const m = (e.crewPeople ?? []).find((x: any) => x.id === cid)
                  ?? members.find(x => x.id === cid) ?? { id: cid, name: 'Neznámý', avatar: '' };
                return (
                  <span key={cid} className="inline-flex items-center gap-1.5 rounded-full bg-[#C8F542]/20 text-[#3E5406] border border-[#C8F542]/40 pl-3 pr-1.5 py-1.5 text-sm font-semibold">
                    {m.avatar ?? ''} {m.name}
                    <button type="button" aria-label={`Odebrat ${m.name} z akce`} onClick={() => toggleCrew(cid)}
                      className="tap-target-sm rounded-full p-1 text-[#3E5406]/60 hover:text-bad-ink transition"><Icon name="close" size={12} /></button>
                  </span>
                );
              })}
            </div>
          )}
          {/* Zeď všech členů nahradilo hledací pole — tým může mít i desítky lidí. */}
          <div className="relative">
            <input data-transient value={crewSearch} onChange={ev3 => setCrewSearch(ev3.target.value)}
              onFocus={() => setCrewOpen(true)} onBlur={() => setTimeout(() => setCrewOpen(false), 150)}
              placeholder="Přidat člověka — začni psát jméno…" className={inputClass} />
            {crewOpen && crewCandidates.length > 0 && (
              <div className="absolute inset-x-0 top-full mt-1 z-10 glass-strong rounded-2xl p-1.5 space-y-0.5 shadow-lg max-h-56 overflow-y-auto scrollbar-thin">
                {crewCandidates.map(m => (
                  <button key={m.id} type="button" onMouseDown={ev3 => ev3.preventDefault()}
                    onClick={() => { toggleCrew(m.id); setCrewSearch(''); }}
                    className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-[#16181A] hover:bg-black/[0.06] transition-colors">
                    {m.avatar ?? ''} {m.name}
                  </button>
                ))}
              </div>
            )}
            {crewOpen && crewCandidates.length === 0 && crewSearch.trim() !== '' && (
              <div className="absolute inset-x-0 top-full mt-1 z-10 glass-strong rounded-2xl px-3 py-2.5 text-sm text-black/45 shadow-lg">Nikdo takový v týmu není.</div>
            )}
          </div>
        </Sec>

        {/* pro hosty — všechno, co uvidí zákazník, v jedné kartě */}
        <Sec title="Pro hosty">
          <div className="well border border-black/[0.06] p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {/* Zapnuto/vypnuto je přepínač, ne limetkové tlačítko (limetka se září je akce, ne stav). */}
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#16181A]">
                <Switch checked={!!e.public} onChange={() => patch(e.id, { public: !e.public })} label="Veřejná akce" />
                <span aria-hidden>{e.public ? 'Veřejná — hosté ji vidí' : 'Zveřejnit hostům'}</span>
              </span>
              {e.public && (
                <button disabled={announcing}
                  onClick={() => setPotvrdit({
                    title: 'Rozeslat akci členům?', akce: 'Rozeslat',
                    text: 'Všem členům podniku přijde push a akce se objeví v novinkách na stránce podniku.',
                    run: async () => {
                      setAnnouncing(true);
                      const ok = await patch(e.id, { announceMembers: true });
                      setAnnouncing(false);
                      if (ok) alert('Členové dostali pozvánku.');
                    },
                  })}
                  className="tap-target-sm w-full sm:w-auto rounded-full bg-white/70 border border-black/10 px-3.5 py-2 text-xs font-semibold text-black/60 hover:text-black transition disabled:opacity-50">
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
              <label htmlFor={`akce-popis-${e.id}`} className="field-label">Popis</label>
              <textarea id={`akce-popis-${e.id}`} value={desc} rows={3} maxLength={2000} placeholder="Co hosty čeká — program, vstupné, na co se těšit…"
                onChange={ev3 => setDesc(ev3.target.value)}
                onBlur={() => { if (desc !== (e.description ?? '')) patch(e.id, { description: desc }); }}
                className={`${inputClass} resize-y`} />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="t-label">Fotky ({(e.photos ?? []).length}/8)</p>
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
                        className="tap-target-sm absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-[#16181A] text-white grid place-items-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition"><Icon name="close" size={11} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="t-label">Menu akce ({(e.menu ?? []).length}) — z nabídky podniku</p>
                <button type="button" onClick={() => setMenuPickOpen(o => !o)} aria-expanded={menuPickOpen}
                  className="tap-target-sm shrink-0 whitespace-nowrap rounded-full bg-white/70 border border-black/10 px-3 py-1.5 text-xs font-semibold text-black/60 hover:text-black transition">
                  <Icon name="leaf" size={13} className="inline -mt-0.5 mr-1.5" />{menuPickOpen ? 'Hotovo' : 'Vybrat z nabídky'}
                </button>
              </div>
              {(e.menu ?? []).length > 0 && (
                <ul className="space-y-1.5">
                  {(e.menu ?? []).map((l: any, i: number) => (
                    <li key={`${l.boardId ?? 'b'}-${l.itemId ?? 'x'}-${i}`} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm ${l.boardId != null ? 'bg-[#C8F542]/[0.10] border-[#C8F542]/30' : 'bg-white/60 border-black/[0.06]'}`}>
                      {l.boardId != null && <Icon name="leaf" size={14} className="shrink-0 text-[#5B7A08]" />}
                      <span className="min-w-0 flex-1 truncate text-[#16181A]">{l.boardId != null ? <>Celá nabídka „{l.name}"<span className="text-black/45"> · {l.count ?? 0} položek</span></> : l.name}</span>
                      {l.itemId != null && (
                        l.pos
                          ? <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#C8F542]/15 text-[#5B7A08] px-2 py-0.5 text-[11px] font-semibold" title="Spárováno s pokladnou — dá se namarkovat a tiskne se"><Icon name="receipt" size={11} />kasa</span>
                          : <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-wait/15 text-wait-ink px-2 py-0.5 text-[11px] font-semibold" title="Bez párování s pokladnou — v kase nepůjde namarkovat. Spáruj v Menu.">bez kasy</span>
                      )}
                      {l.price != null && <span className="shrink-0 text-xs text-black/55 tabular-nums">{money(l.price)}</span>}
                      <button type="button" aria-label={`Vyřadit ${l.name} z menu akce`}
                        onClick={() => patch(e.id, { menu: (e.menu ?? []).filter((_: any, j: number) => j !== i) })}
                        className="tap-target-sm shrink-0 text-black/25 hover:text-bad-ink"><Icon name="close" size={15} /></button>
                    </li>
                  ))}
                </ul>
              )}
              {menuPickOpen && (
                <div className="mt-2 rounded-2xl bg-white/70 border border-black/[0.08] p-3 max-h-64 overflow-y-auto scrollbar-thin space-y-3">
                  {menuBoards.length === 0 ? (
                    <p className="text-sm text-black/45">Nabídka je prázdná — nejdřív ji naplň v sekci Menu.</p>
                  ) : menuBoards.map((bd: any) => (
                    <div key={bd.id} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{bd.name}</p>
                        <button type="button" onClick={() => toggleBoard(bd.id)} aria-pressed={boardOn(bd.id)}
                          className={`filter-pill tap-target-sm ${boardOn(bd.id) ? 'seg-on' : 'seg-off glass'}`}>
                          {boardOn(bd.id) ? 'Celá nabídka vybraná' : 'Vzít celou nabídku'}
                        </button>
                      </div>
                      {!boardOn(bd.id) && bd.sections.map((sec: any) => (
                    <div key={sec.id}>
                      <p className="t-label mb-1">{sec.title}</p>
                      <div className="flex flex-wrap gap-2">
                        {(sec.items ?? []).map((mi: any) => {
                          const on = menuHas(mi.id);
                          return (
                            <button key={mi.id} type="button" onClick={() => toggleMenuItem(mi.id)} aria-pressed={on}
                              className={`filter-pill tap-target-sm ${on ? 'seg-on' : 'seg-off glass'}`}>
                              {mi.name}{mi.price != null ? ` · ${mi.price}` : ''}{on ? <Icon name="check" size={11} className="inline ml-1 -mt-0.5" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                      ))}
                    </div>
                  ))}
                  <a href="/employer/overview?mode=client&tab=menu" className="tap-target-sm inline-flex items-center gap-1 py-1 text-[13px] font-semibold text-[#16181A] underline underline-offset-2 hover:no-underline">Chybí položka? Uprav nabídku v Menu<Icon name="chevronRight" size={13} /></a>
                </div>
              )}
              {/* Výjezd mívá úplně vlastní menu — volný řádek s cenou, vždy po ruce. */}
              {e.offsite && (
                <div className="flex gap-2 mt-2">
                  <input value={customName} onChange={ev3 => setCustomName(ev3.target.value)} maxLength={120}
                    placeholder="Vlastní položka výjezdu…"
                    onKeyDown={ev3 => { if (ev3.key === 'Enter') addCustomLine(); }}
                    className={inputClass} />
                  <input value={customPrice} onChange={ev3 => setCustomPrice(ev3.target.value)} type="number" inputMode="numeric" placeholder="Kč" aria-label="Cena vlastní položky"
                    className={`${inputClass} !w-24 text-center`} />
                  <button onClick={addCustomLine} className="shrink-0 rounded-full bg-black/[0.05] text-[#16181A] font-semibold px-5 min-w-[48px] text-sm hover:bg-black/[0.08] transition">+</button>
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
                  className="tap-target flex items-center gap-2.5 text-left min-w-0 flex-1">
                  <span className={c.done ? 'text-[#5B7A08]' : 'text-black/30'}><Icon name={c.done ? 'check' : 'box'} size={16} /></span>
                  <span className="min-w-0 flex-1">{c.text}</span>
                </button>
                <button type="button" aria-label="Odebrat úkol"
                  onClick={() => patch(e.id, { checklist: e.checklist.filter((_: any, j: number) => j !== i) })}
                  className="tap-target-sm shrink-0 text-black/25 hover:text-bad-ink px-1"><Icon name="close" size={15} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input value={checkTxt} onChange={ev3 => setCheckTxt(ev3.target.value)} placeholder="Přidat úkol k akci…" maxLength={200}
              onKeyDown={ev3 => { if (ev3.key === 'Enter' && checkTxt.trim()) { patch(e.id, { checklist: [...e.checklist, { text: checkTxt.trim(), done: false }] }); setCheckTxt(''); } }}
              className={inputClass} />
            <button onClick={() => { if (checkTxt.trim()) { patch(e.id, { checklist: [...e.checklist, { text: checkTxt.trim(), done: false }] }); setCheckTxt(''); } }}
              className="shrink-0 rounded-full bg-black/[0.05] text-[#16181A] font-semibold px-5 min-w-[48px] text-sm hover:bg-black/[0.08] transition">+</button>
          </div>

          {e.offsite && (
            <div className="mt-3 well border border-black/[0.06] p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <p className="t-label flex items-center gap-1.5"><Icon name="tent" size={13} />Balicí seznam (ze skladu)</p>
                <div className="flex gap-1.5">
                  {e.packing.some((p: any) => p.itemId && !p.packed) && (
                    <Button size="sm" variant="primary" icon="box" onClick={() => setPotvrdit({
                      title: 'Vyskladnit vše nesbalené?', akce: 'Vyskladnit',
                      text: 'Množství se odečte ze skladu (s poznámkou u položek).',
                      run: () => { void patch(e.id, { packAction: 'checkout' }); },
                    })}>Vyskladnit</Button>
                  )}
                  {e.packing.some((p: any) => p.itemId && p.packed && p.returned == null) && (
                    <Button size="sm" variant="secondary" icon="swap" onClick={() => setPotvrdit({
                      title: 'Vrátit sbalené do skladu?', akce: 'Vrátit',
                      text: 'Vrací se plné množství — spotřebu pak uprav ve skladu.',
                      run: () => { void patch(e.id, { packAction: 'return' }); },
                    })}>Vrátit do skladu</Button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                {e.packing.map((p2: any, i: number) => (
                  <div key={i} className="flex items-center gap-2.5 rounded-xl bg-white/60 border border-black/[0.06] px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-[#16181A]">{p2.name}</span>
                    <span className="shrink-0 text-xs text-black/45 tabular-nums">{p2.qty}×</span>
                    <span className="shrink-0 text-xs">
                      {p2.returned != null ? <span className="text-ok-ink">vráceno {p2.returned}</span>
                       : p2.packed ? <span className="text-wait-ink">vyskladněno</span>
                       : <span className="text-black/35">čeká</span>}
                    </span>
                    {!p2.packed && (
                      <button aria-label={`Odebrat ${p2.name} z balení`} onClick={() => patch(e.id, { packing: e.packing.filter((_: any, j: number) => j !== i) })}
                        className="tap-target-sm shrink-0 text-black/25 hover:text-bad-ink"><Icon name="close" size={15} /></button>
                    )}
                  </div>
                ))}
              </div>
              <div className="relative mt-2">
                <input data-transient value={packSearch} onChange={ev3 => setPackSearch(ev3.target.value)} placeholder="Přidat ze skladu — začni psát název…" className={inputClass} />
                {packCandidates.length > 0 && (
                  <div className="absolute inset-x-0 top-full mt-1 z-10 glass-strong rounded-2xl p-1.5 space-y-0.5 shadow-lg">
                    {packCandidates.map(i2 => (
                      <button key={i2.id}
                        onClick={() => setBaleni({ item: i2, qty: '1' })}
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
          <div className="well border border-black/[0.06] p-4">
            {/* Akce u nás jede přes běžnou kasu — pokladna umí říct, co se
                namarkovalo za dobu akce a kolik se prodalo z jejího menu. */}
            {(!e.offsite || e.posPlaceId) && (
              <div className="mb-3">
                {pos == null ? (
                  <button disabled={posBusy}
                    onClick={async () => {
                      setPosBusy(true); setPosErr('');
                      const r = await fetch(`/api/events/${e.id}/pos`).catch(() => null);
                      const d = r ? await r.json().catch(() => null) : null;
                      setPosBusy(false);
                      if (r?.ok && d) setPos(d);
                      else setPosErr(d?.error || 'Pokladna teď neodpovídá.');
                    }}
                    className="tap-target-sm w-full sm:w-auto rounded-full bg-white/70 border border-black/10 px-3.5 py-2 text-xs font-semibold text-black/60 hover:text-black transition disabled:opacity-50">
                    <Icon name="receipt" size={13} className="inline -mt-0.5 mr-1.5" />{posBusy ? 'Načítám z pokladny…' : e.offsite ? 'Tržba kasy akce (celý den)' : 'Prodej z pokladny za dobu akce'}
                  </button>
                ) : (
                  <div className="rounded-xl bg-white/60 border border-black/[0.06] px-3 py-2.5 space-y-1.5">
                    <p className="text-sm text-[#16181A]">
                      <Icon name="receipt" size={15} className="inline -mt-0.5 mr-1.5 text-[#5B7A08]" />
                      V kase {pos.from ? `${pos.from}–${pos.till ?? 'konec dne'}` : 'ten den'}: <span className="font-bold tabular-nums">{money(pos.revenue)}</span>
                      <span className="text-black/45"> · {pos.bills} {pos.bills === 1 ? 'účtenka' : pos.bills < 5 ? 'účtenky' : 'účtenek'}</span>
                    </p>
                    {(pos.items ?? []).length > 0 && (
                      <ul className="text-xs text-black/60 space-y-0.5">
                        {pos.items.map((it: any, i: number) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span className="min-w-0 truncate">{it.name}</span>
                            <span className="shrink-0 tabular-nums">{it.paired ? `${it.qty}× ten den` : 'bez párování s kasou'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[11px] text-black/40">Informativní pohled — do financí jde tržba dne přes běžnou uzávěrku, nic se tu nezapisuje.</p>
                  </div>
                )}
                {posErr && <p className="text-xs text-bad-ink mt-1.5">{posErr}</p>}
              </div>
            )}
            {e.closingsCount > 0 ? (
              <div className="flex items-center justify-between gap-2 flex-wrap rounded-xl bg-white/60 border border-black/[0.06] px-3 py-2.5">
                {/* czech-ok: po předložce „z“ je 2. pád stejný pro 2–4 i 5+. */}
                <p className="text-sm text-black/60"><Icon name="receipt" size={15} className="inline -mt-0.5 mr-1.5" />Tržba z {e.closingsCount === 1 ? 'uzávěrky za akci' : `${e.closingsCount} uzávěrek za akci`}</p>
                <p className="text-sm font-bold tabular-nums text-[#16181A]">{money(e.closingsTotal)}</p>
              </div>
            ) : (
              <div>
                <label htmlFor={`akce-trzba-${e.id}`} className="field-label">Tržba z akce</label>
                <input id={`akce-trzba-${e.id}`} type="number" inputMode="numeric" value={revenue} onChange={ev3 => setRevenue(ev3.target.value)}
                  onBlur={() => patch(e.id, { revenue: revenue === '' ? null : Number(revenue) })} placeholder="0" className={inputClass} />
                <p className="text-[11px] text-black/40 mt-1.5">
                  {e.offsite
                    ? 'Nebo na místě udělejte uzávěrku „Za akci" — pozná, že ten den akce je, a tržba se sem propíše sama.'
                    : 'Když obsluha udělá uzávěrku „Za akci", tržba se sem propíše sama.'}
                </p>
              </div>
            )}
            <div className="mt-2.5">
              <label htmlFor={`akce-naklady-${e.id}`} className="field-label">Náklady</label>
              <input id={`akce-naklady-${e.id}`} type="number" inputMode="numeric" value={costs} onChange={ev3 => setCosts(ev3.target.value)}
                onBlur={() => patch(e.id, { costs: costs === '' ? null : Number(costs) })} placeholder="0" className={inputClass} />
            </div>
            {result != null && (
              <p className={`mt-2.5 text-sm font-bold tabular-nums ${result >= 0 ? 'text-ok-ink' : 'text-bad-ink'}`}>
                Výsledek: {result >= 0 ? '+' : ''}{money(result)}
              </p>
            )}
          </div>
        </Sec>

        <div className="mt-6 flex justify-between gap-2">
          <Button variant="danger" onClick={() => setPotvrdit({
            title: `Smazat akci „${e.title}"?`, akce: 'Smazat', danger: true,
            text: 'Odeberou se i směny z akce. Smazanou akci nejde vrátit.',
            run: async () => {
              const res = await fetch(`/api/events/${e.id}`, { method: 'DELETE' }).catch(() => null);
              if (res?.ok) onDeleted();
            },
          })}>Smazat akci</Button>
          <Button variant="primary" onClick={onClose}>Hotovo</Button>
        </div>
      </div>
    </div>
    {potvrdit && (
      <Modal open onClose={() => setPotvrdit(null)} size="sm" title={potvrdit.title}
        footer={<>
          <Button variant="secondary" onClick={() => setPotvrdit(null)}>Zrušit</Button>
          <Button variant={potvrdit.danger ? 'danger-solid' : 'primary'} onClick={() => { const p = potvrdit; setPotvrdit(null); p.run(); }}>{potvrdit.akce}</Button>
        </>}>
        <p className="text-sm text-black/70 text-pretty">{potvrdit.text}</p>
      </Modal>
    )}
    {baleni && (
      <Modal open onClose={() => setBaleni(null)} size="sm" title={`Kolik vzít: ${baleni.item.name}`}
        footer={<>
          <Button variant="secondary" onClick={() => setBaleni(null)}>Zrušit</Button>
          <Button type="submit" form="akce-baleni" variant="primary" disabled={!(parseInt(baleni.qty, 10) > 0)}>Přidat do balení</Button>
        </>}>
        <form id="akce-baleni" onSubmit={ev4 => {
          ev4.preventDefault();
          const qty = parseInt(baleni.qty, 10);
          if (!Number.isFinite(qty) || qty <= 0) return;
          const i2 = baleni.item;
          patch(e.id, { packing: [...e.packing, { itemId: i2.id, name: i2.name, qty, packed: false, returned: null }] });
          setPackSearch(''); setBaleni(null);
        }}>
          <Field id="akce-baleni-kusy" label="Kusů" hint={`Skladem ${baleni.item.quantity} ${baleni.item.unit}.`}>
            <Input id="akce-baleni-kusy" type="number" inputMode="numeric" min={1} autoFocus className="!w-28" value={baleni.qty} onChange={ev4 => setBaleni({ ...baleni, qty: ev4.target.value })} />
          </Field>
        </form>
      </Modal>
    )}
    </>
  );
}
