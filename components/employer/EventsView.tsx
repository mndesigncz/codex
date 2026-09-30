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
//
// Po review B8: Nová akce i detail jsou <Modal> s poli Field/Input (dřív ručně
// psaná okna s limetkovým fokusem a poli jen s placeholderem), stav akce
// a místo konání přepíná Segmented, lidé jsou PersonChip. Potvrzení a počet
// kusů do balení jsou druhý krok TÉHOŽ okna, ne další okno nad ním: useModal
// nemá zásobník, dvě okna nad sebou si přetahovala fokus (Tab se nedostal na
// „Smazat") a Escape zavřel obě. Hlášky jdou přes Toast, ne alert().

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import {
  Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Modal, PersonChip, Segmented, Select, Skeleton, Switch, Textarea, Toast, type ChipTone,
} from '../ui';
import { useMoney, usePrice } from '../CurrencyProvider';
import { EVENT_KINDS, EVENT_STATUSES, kindSpec, statusLabel } from '@/lib/events';
import { pragueToday } from '@/lib/pragueTime';
import { okJson } from '@/lib/api';
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

const URL_AKCE = '/api/events';
const TON_STAVU: Record<string, ChipTone> = { planned: 'info', confirmed: 'ok', done: 'muted', cancelled: 'muted' };
const V_OBSLUZE: CzNoun = { one: 'člověk v obsluze', few: 'lidé v obsluze', many: 'lidí v obsluze' };
const UCTENKA: CzNoun = { one: 'účtenka', few: 'účtenky', many: 'účtenek' };
const POLOZKA: CzNoun = { one: 'položka', few: 'položky', many: 'položek' };

/** Hláška pro Toast: v Managero client ji kreslí skořápka (jeden Toast), v administraci tahle stránka. */
export type OznamAkce = (text: string, ton?: 'ok' | 'bad') => void;

export default function EventsView({ user, oznam }: { user: { id?: string }; oznam?: OznamAkce }) {
  void user;
  const [hlaska, setHlaska] = useState<{ text: string; ton: 'ok' | 'bad' } | null>(null);
  const mistni = useCallback<OznamAkce>((text, ton = 'ok') => setHlaska({ text, ton }), []);
  const oznamit = oznam ?? mistni;
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
    // Chyba přes Toast, ne poznámkou v seznamu — ta by byla schovaná pod otevřeným detailem.
    const d = res ? await res.json().catch(() => ({})) : {};
    oznamit(d.error || 'Uložení se nepodařilo.', 'bad');
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
        <EventDetail event={detail} members={members} items={items} menuBoards={menuBoards} money={money} patch={patch} oznam={oznamit}
          onClose={() => setDetail(null)}
          onDeleted={async () => { setDetail(null); await load(); }} />
      )}
      {!oznam && <Toast message={hlaska?.text ?? null} tone={hlaska?.ton} onClose={() => setHlaska(null)} />}
    </>
  );
}

// ---- Nová akce (krátký formulář — podrobnosti až v detailu) ----

type Misto = 'u-nas' | 'vyjezd';
const MISTA: { id: Misto; label: string; icon: string }[] = [
  { id: 'u-nas', label: 'U nás v podniku', icon: 'overview' },
  { id: 'vyjezd', label: 'Výjezd ven', icon: 'tent' },
];

function EventEditor({ onClose, onSaved }: { onClose: () => void; onSaved: (ev: any) => void }) {
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
    <Modal open onClose={onClose} title="Nová akce"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Zrušit</Button>
        <Button type="submit" form="akce-nova" variant="primary" loading={busy} disabled={!title.trim() || !date}>Založit akci</Button>
      </>}>
      <div className="mb-3"><DraftNote koncept={koncept} co="rozepsanou akci" /></div>
      {err && <p className="note note-danger mb-3" role="alert">{err}</p>}
      {/* Opravdový <form>, ne jen tlačítko s onClick: po vyplnění názvu
          a data se čeká, že Enter akci založí. */}
      <form id="akce-nova" className="space-y-4" onSubmit={ev => { ev.preventDefault(); if (!busy && title.trim() && date) void save(); }}>
        {/* Základní rozcestí: akce u nás (obsluha = kdo je na směně), nebo
            výjezd ven (vlastní směna k akci, balení skladu, uzávěrka za akci). */}
        <div className="min-w-0">
          <p className="field-label">Kde se akce koná</p>
          <Segmented ariaLabel="Kde se akce koná" options={MISTA} value={offsite ? 'vyjezd' : 'u-nas'} onChange={v => setOffsite(v === 'vyjezd')} />
          <p className="mt-1.5 text-xs text-black/50">
            {offsite
              ? 'Výjezd: lidem vytvoříš směnu jen k akci, sbalíš sklad a večer uděláte uzávěrku za akci.'
              : 'Akce u nás: obsluha je ten den ze směny, další lidi můžeš přidat navíc.'}
          </p>
        </div>
        <Field id="akce-nova-nazev" label="Název akce">
          <Input id="akce-nova-nazev" autoFocus value={title} onChange={ev => setTitle(ev.target.value)} maxLength={160} />
        </Field>
        <div className="min-w-0">
          <p className="field-label">Druh akce</p>
          <Segmented size="sm" ariaLabel="Druh akce" options={EVENT_KINDS.map(k => ({ id: k.id, label: k.label, icon: k.icon }))} value={kind}
            onChange={id => { setKind(id); if (id === 'outdoor') setOffsite(true); }} />
        </div>
        <Field id="akce-nova-datum" label="Datum">
          <Input id="akce-nova-datum" type="date" value={date} onChange={ev => setDate(ev.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="akce-nova-od" label="Začátek">
            <Input id="akce-nova-od" type="time" value={startTime} onChange={ev => setStartTime(ev.target.value)} />
          </Field>
          <Field id="akce-nova-do" label="Konec">
            <Input id="akce-nova-do" type="time" value={endTime} onChange={ev => setEndTime(ev.target.value)} />
          </Field>
        </div>
        <Field id="akce-nova-misto" label={offsite ? 'Kam se jede' : 'Místo v podniku'} hint={offsite ? 'Název místa a adresa.' : 'Nepovinné, třeba „zahrádka".'}>
          <Input id="akce-nova-misto" value={location} onChange={ev => setLocation(ev.target.value)} maxLength={300} />
        </Field>
      </form>
    </Modal>
  );
}

// ---- Detail akce: Kdy a kde · Lidé · Pro hosty · Přípravy · Peníze ----
// Jedna vizuální řeč: kreslené ikony jen na tlačítkách, nadpisy sekcí bez
// ozdob, obsah pro hosty pohromadě v jedné jamce. Menu akce se neopisuje —
// odkazuje se z nabídky podniku a ceny se dočítají odtamtud.

function Sec({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-6 first:mt-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="t-label">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Potvrzení nevratného kroku — druhý krok okna detailu. */
interface Potvrzeni { title: string; text: string; akce: string; danger?: boolean; run: () => void }

function EventDetail({ event: e, members, items, menuBoards, money, patch, oznam, onClose, onDeleted }: {
  event: any; members: any[]; items: any[]; menuBoards: any[]; money: (n: number) => string;
  patch: (id: number, body: any) => Promise<boolean>;
  oznam: OznamAkce;
  onClose: () => void; onDeleted: () => void;
}) {
  // Cena položky menu smí mít haléře (4,50 €).
  const cena = usePrice();
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
  const fotkaRef = useRef<HTMLInputElement>(null);
  // Potvrzení nevratných kroků a počet kusů do balení — dřív confirm() a prompt().
  const [potvrdit, setPotvrdit] = useState<Potvrzeni | null>(null);
  const [baleni, setBaleni] = useState<{ item: any; qty: string } | null>(null);
  // Základ a peníze se editují v místě — ukládá se při opuštění pole.
  const [base, setBase] = useState({ date: e.date ?? '', start: e.startTime ?? '', end: e.endTime ?? '', location: e.location ?? '', capacity: e.capacity != null ? String(e.capacity) : '' });
  const [desc, setDesc] = useState(e.description ?? '');
  const [revenue, setRevenue] = useState(e.revenue != null ? String(e.revenue) : '');
  const [costs, setCosts] = useState(e.costs != null ? String(e.costs) : '');
  const k = kindSpec(e.kind);

  // ---- Druhý krok okna (potvrzení, kolik kusů) ----
  // Kreslí se ve stejném <Modal> místo detailu, ne jako druhé okno nad ním:
  // useModal nemá zásobník a dvě okna by si přetahovala fokus i Escape.
  // Detail zůstává v DOM schovaný (atribut hidden), takže rozepsaná pole
  // nezmizí, a po návratu se obnoví posun i fokus na tlačítku, které krok otevřelo.
  const krok: 'potvrdit' | 'baleni' | null = potvrdit ? 'potvrdit' : baleni ? 'baleni' : null;
  const obsahRef = useRef<HTMLDivElement>(null);
  const navrat = useRef<{ fokus: HTMLElement | null; posun: number } | null>(null);
  const zapamatuj = () => {
    navrat.current = { fokus: document.activeElement as HTMLElement | null, posun: obsahRef.current?.parentElement?.scrollTop ?? 0 };
  };
  const otevriPotvrzeni = (p: Potvrzeni) => { zapamatuj(); setPotvrdit(p); };
  const otevriBaleni = (item: any) => { zapamatuj(); setBaleni({ item, qty: '1' }); };
  const zavriKrok = useCallback(() => { setPotvrdit(null); setBaleni(null); }, []);
  useLayoutEffect(() => {
    if (krok || !navrat.current) return;
    const { fokus, posun } = navrat.current;
    navrat.current = null;
    const posuvnik = obsahRef.current?.parentElement;
    if (posuvnik) posuvnik.scrollTop = posun;
    if (fokus?.isConnected) fokus.focus({ preventScroll: true });
  }, [krok]);
  // Escape v kroku vrátí do detailu, nezavře okno. Posluchač na window ve fázi
  // zachytávání běží dřív než posluchač useModal na document, takže se klávesa
  // k oknu vůbec nedostane (a nezeptá se ani na rozepsaná pole v detailu).
  useEffect(() => {
    if (!krok) return;
    const naKlavesu = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      zavriKrok();
    };
    window.addEventListener('keydown', naKlavesu, true);
    return () => window.removeEventListener('keydown', naKlavesu, true);
  }, [krok, zavriKrok]);

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
  const pridejUkol = () => {
    if (!checkTxt.trim()) return;
    patch(e.id, { checklist: [...e.checklist, { text: checkTxt.trim(), done: false }] });
    setCheckTxt('');
  };
  const nahrajFotku = async (f: File) => {
    setUploading(true);
    const fd = new FormData(); fd.append('file', f);
    const r = await fetch('/api/upload', { method: 'POST', body: fd }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    setUploading(false);
    const upId = d?.url ? parseInt(String(d.url).split('/').pop()!) : NaN;
    if (!Number.isFinite(upId)) { oznam('Fotku se nepodařilo nahrát.', 'bad'); return; }
    await patch(e.id, { photos: [...(e.photos ?? []), `/api/client/img/${upId}`] });
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

  const cas = e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : '';
  const podtitul = `${k.label} · ${e.offsite ? 'výjezd ven' : 'u nás v podniku'} · ${new Date(e.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}${cas}`;

  const titulek = potvrdit ? potvrdit.title : baleni ? `Kolik vzít: ${baleni.item.name}` : e.title;
  const paticka = potvrdit ? (
    <>
      {/* Fokus na „Zrušit": Enter omylem nic nesmaže, Tab jde hned na hlavní akci. */}
      <Button variant="secondary" autoFocus onClick={zavriKrok}>Zrušit</Button>
      <Button variant={potvrdit.danger ? 'danger-solid' : 'primary'} onClick={() => { const p = potvrdit; setPotvrdit(null); p.run(); }}>{potvrdit.akce}</Button>
    </>
  ) : baleni ? (
    <>
      <Button variant="secondary" onClick={zavriKrok}>Zrušit</Button>
      <Button type="submit" form="akce-baleni" variant="primary" disabled={!(parseInt(baleni.qty, 10) > 0)}>Přidat do balení</Button>
    </>
  ) : undefined;

  return (
    <Modal open size={krok ? 'sm' : 'lg'} onClose={krok ? zavriKrok : onClose} title={titulek}
      subtitle={krok ? undefined : podtitul} footer={paticka}>
      {potvrdit && <p className="text-sm text-black/70 text-pretty">{potvrdit.text}</p>}
      {baleni && (
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
      )}
      <div ref={obsahRef} hidden={!!krok}>
        {/* stav + oznámení týmu */}
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" ariaLabel="Stav akce" options={EVENT_STATUSES.map(st => ({ id: st.id, label: st.label }))} value={e.status}
            onChange={st => { void patch(e.id, { status: st }); }} />
          <span className="hidden sm:block flex-1" />
          <Button size="sm" variant="secondary" icon="bell"
            onClick={() => { void patch(e.id, { publishToTeam: true }).then(ok => { if (ok) oznam('Tým dostal notifikaci o akci.'); }); }}>
            Oznámit týmu
          </Button>
        </div>

        {/* kdy a kde — edituje se rovnou tady, uloží se při opuštění pole */}
        <Sec title="Kdy a kde">
          {/* Pevné minimální šířky: nativní time input potřebuje ~110 px,
              jinak hodnotu ořízne (vyfoceno „15:0…"). Řádek se láme, nemačká. */}
          <div className="grid grid-cols-2 sm:grid-cols-[minmax(150px,1fr)_132px_132px] gap-3">
            <Field id={`akce-datum-${e.id}`} label="Datum" className="col-span-2 sm:col-span-1">
              <Input id={`akce-datum-${e.id}`} type="date" value={base.date}
                onChange={ev3 => setBase(b => ({ ...b, date: ev3.target.value }))}
                onBlur={() => { if (base.date && base.date !== e.date) patch(e.id, { date: base.date }); }} />
            </Field>
            <Field id={`akce-od-${e.id}`} label="Začátek">
              <Input id={`akce-od-${e.id}`} type="time" value={base.start}
                onChange={ev3 => setBase(b => ({ ...b, start: ev3.target.value }))}
                onBlur={() => { if (base.start !== (e.startTime ?? '')) patch(e.id, { startTime: base.start }); }} />
            </Field>
            <Field id={`akce-do-${e.id}`} label="Konec">
              <Input id={`akce-do-${e.id}`} type="time" value={base.end}
                onChange={ev3 => setBase(b => ({ ...b, end: ev3.target.value }))}
                onBlur={() => { if (base.end !== (e.endTime ?? '')) patch(e.id, { endTime: base.end }); }} />
            </Field>
            <Field id={`akce-misto-${e.id}`} label={e.offsite ? 'Kam se jede' : 'Místo v podniku'} className="col-span-2 sm:col-span-3"
              hint={e.public ? 'Změnu termínu veřejné akce pošleme hostům, kteří ji sledují.' : undefined}>
              <Input id={`akce-misto-${e.id}`} value={base.location} maxLength={300}
                onChange={ev3 => setBase(b => ({ ...b, location: ev3.target.value }))}
                onBlur={() => { if (base.location !== (e.location ?? '')) patch(e.id, { location: base.location }); }} />
            </Field>
          </div>
          {/* Výjezd s vlastním Storyous terminálem: přiřaď akci její provozovnu
              a tržby dvou kas se nikdy nesmíchají. Nabízí se jen, když má
              merchant provozoven víc. */}
          {e.offsite && places && (places.places ?? []).length > 1 && (
            <Field id={`akce-kasa-${e.id}`} label="Kasa akce (provozovna Storyous)" className="mt-3"
              hint="S vlastní kasou umí akce načíst svoji tržbu za celý den — odděleně od podniku.">
              <Select id={`akce-kasa-${e.id}`} value={e.posPlaceId ?? ''}
                onChange={ev3 => patch(e.id, { posPlaceId: ev3.target.value || null })}>
                <option value="">Bez vlastní kasy — na místě jen hotovost (uzávěrka za akci)</option>
                {(places.places ?? []).filter((pl: any) => pl.placeId !== places.current).map((pl: any) => (
                  <option key={pl.placeId} value={pl.placeId}>{pl.name || pl.placeId}</option>
                ))}
              </Select>
            </Field>
          )}
        </Sec>

        {/* lidé */}
        {!e.offsite && (
          <Sec title={`Ze směny ten den (${(e.onShift ?? []).length})`}>
            {(e.onShift ?? []).length === 0 ? (
              <p className="t-meta">V rozvrhu na ten den zatím nikdo není — obsluhu přidej níž, nebo naplánuj směny v Rozvrhu.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(e.onShift ?? []).map((m2: any) => (
                  <PersonChip key={m2.id} name={m2.name} avatar={m2.avatar}
                    meta={m2.start ? `${String(m2.start).slice(0, 5)}${m2.end ? `–${String(m2.end).slice(0, 5)}` : ''}` : undefined} />
                ))}
              </div>
            )}
          </Sec>
        )}
        <Sec title={e.offsite ? `Směna k akci (${e.crew.length}) — jen na tenhle výjezd` : `Navíc na akci (${e.crew.length}) — vytvoří směnu v rozvrhu`}>
          {e.crew.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {e.crew.map((cid: number) => {
                // crewPeople řeší jména server — members můžou být ještě nenačtení
                const m = (e.crewPeople ?? []).find((x: any) => x.id === cid)
                  ?? members.find(x => x.id === cid) ?? { id: cid, name: 'Neznámý', avatar: '' };
                return (
                  <span key={cid} className="inline-flex items-center gap-0.5">
                    <PersonChip name={m.name} avatar={m.avatar} tone="ok" />
                    <Button size="sm" variant="ghost" iconOnly icon="close" aria-label={`Odebrat ${m.name} z akce`} onClick={() => toggleCrew(cid)} />
                  </span>
                );
              })}
            </div>
          )}
          {/* Zeď všech členů nahradilo hledací pole — tým může mít i desítky lidí. */}
          <div className="relative">
            <Field id={`akce-lide-${e.id}`} label="Přidat člověka">
              <Input id={`akce-lide-${e.id}`} data-transient value={crewSearch} onChange={ev3 => setCrewSearch(ev3.target.value)}
                onFocus={() => setCrewOpen(true)} onBlur={() => setTimeout(() => setCrewOpen(false), 150)}
                placeholder="Začni psát jméno…" autoComplete="off" />
            </Field>
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
              <div className="absolute inset-x-0 top-full mt-1 z-10 glass-strong rounded-2xl px-3 py-2.5 text-sm text-black/55 shadow-lg">Nikdo takový v týmu není.</div>
            )}
          </div>
        </Sec>

        {/* pro hosty — všechno, co uvidí zákazník, v jedné jamce */}
        <Sec title="Pro hosty">
          <div className="well p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {/* Zapnuto/vypnuto je přepínač, ne limetkové tlačítko (limetka se září je akce, ne stav). */}
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#16181A]">
                <Switch checked={!!e.public} onChange={() => patch(e.id, { public: !e.public })} label="Veřejná akce" />
                <span aria-hidden>{e.public ? 'Veřejná — hosté ji vidí' : 'Zveřejnit hostům'}</span>
              </span>
              {e.public && (
                <Button size="sm" variant="secondary" icon="send" loading={announcing}
                  onClick={() => otevriPotvrzeni({
                    title: 'Rozeslat akci členům?', akce: 'Rozeslat',
                    text: 'Všem členům podniku přijde push a akce se objeví v novinkách na stránce podniku.',
                    run: async () => {
                      setAnnouncing(true);
                      const ok = await patch(e.id, { announceMembers: true });
                      setAnnouncing(false);
                      if (ok) oznam('Členové dostali pozvánku.');
                    },
                  })}>
                  Rozeslat členům
                </Button>
              )}
              {e.public && (e.followers > 0 || e.going > 0) && (
                <span className="t-meta ml-auto">sleduje {e.followers} · přijde {e.going}{e.capacity ? ` z ${e.capacity}` : ''}</span>
              )}
            </div>
            {e.public && (
              <p className="t-meta -mt-2">Na stránce podniku uvidí detail s fotkami a menu, přidají si akci do kalendáře a den předem jim přijde připomínka.</p>
            )}

            <Field id={`akce-popis-${e.id}`} label="Popis" hint="Co hosty čeká — program, vstupné, na co se těšit.">
              <Textarea id={`akce-popis-${e.id}`} value={desc} rows={3} maxLength={2000}
                onChange={ev3 => setDesc(ev3.target.value)}
                onBlur={() => { if (desc !== (e.description ?? '')) patch(e.id, { description: desc }); }} />
            </Field>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="t-label">Fotky ({(e.photos ?? []).length}/8)</p>
                <Button size="sm" variant="secondary" icon="camera" loading={uploading} disabled={(e.photos ?? []).length >= 8}
                  onClick={() => fotkaRef.current?.click()}>Přidat</Button>
                <input ref={fotkaRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={ev3 => {
                  const f = ev3.target.files?.[0]; ev3.target.value = '';
                  if (f) void nahrajFotku(f);
                }} />
              </div>
              {(e.photos ?? []).length === 0 ? (
                <p className="t-meta">První nahraná fotka je náhledovka akce.</p>
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
                <Button size="sm" variant="secondary" icon="leaf" aria-expanded={menuPickOpen} onClick={() => setMenuPickOpen(o => !o)}>
                  {menuPickOpen ? 'Hotovo' : 'Vybrat z nabídky'}
                </Button>
              </div>
              {(e.menu ?? []).length > 0 && (
                <ul className="list">
                  {(e.menu ?? []).map((l: any, i: number) => (
                    <ListRow key={`${l.boardId ?? 'b'}-${l.itemId ?? 'x'}-${i}`}
                      lead={l.boardId != null ? <Icon name="leaf" size={16} className="text-black/40" /> : undefined}
                      title={l.boardId != null ? `Celá nabídka „${l.name}"` : l.name}
                      meta={l.boardId != null ? czCount(Number(l.count) || 0, POLOZKA) : undefined}
                      right={<>
                        {l.itemId != null && (l.pos
                          ? <Chip tone="ok" size="sm" icon="receipt">kasa</Chip>
                          : <Chip tone="wait" size="sm">bez kasy</Chip>)}
                        {l.price != null && <span className="text-xs text-black/55 tabular-nums">{cena(l.price)}</span>}
                      </>}
                      actions={<Button size="sm" variant="ghost" iconOnly icon="close" aria-label={`Vyřadit ${l.name} z menu akce`}
                        onClick={() => patch(e.id, { menu: (e.menu ?? []).filter((_: any, j: number) => j !== i) })} />} />
                  ))}
                </ul>
              )}
              {menuPickOpen && (
                <div className="mt-2 border-t border-black/[0.06] pt-3 max-h-64 overflow-y-auto scrollbar-thin space-y-3">
                  {menuBoards.length === 0 ? (
                    <p className="t-meta">Nabídka je prázdná — nejdřív ji naplň v sekci Menu.</p>
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
                <div className="flex items-end gap-2 mt-3">
                  <Field id={`akce-vlastni-${e.id}`} label="Vlastní položka výjezdu" className="flex-1">
                    <Input id={`akce-vlastni-${e.id}`} value={customName} onChange={ev3 => setCustomName(ev3.target.value)} maxLength={120}
                      onKeyDown={ev3 => { if (ev3.key === 'Enter') { ev3.preventDefault(); addCustomLine(); } }} />
                  </Field>
                  <Field id={`akce-vlastni-cena-${e.id}`} label="Cena" className="w-24 shrink-0">
                    <Input id={`akce-vlastni-cena-${e.id}`} value={customPrice} onChange={ev3 => setCustomPrice(ev3.target.value)} type="number" inputMode="numeric" className="text-center" />
                  </Field>
                  <Button iconOnly icon="plus" aria-label="Přidat vlastní položku" disabled={!customName.trim()} onClick={addCustomLine} />
                </div>
              )}
              {!menuPickOpen && (e.menu ?? []).length === 0 && (
                <p className="t-meta">Vyber, co se na akci bude podávat — ceny se berou z nabídky a drží s ní krok.</p>
              )}
            </div>
          </div>
        </Sec>

        {/* přípravy */}
        <Sec title="Přípravy">
          {e.checklist.length > 0 && (
            <ul className="list" aria-label="Přípravy akce">
              {e.checklist.map((c: any, i: number) => (
                <ListRow key={i}
                  lead={
                    // Hotový bod má limetkové kolečko s fajfkou jako Checklist — limetka bez záře je stav.
                    <button type="button" aria-pressed={c.done} aria-label={`${c.done ? 'Hotovo' : 'Nehotovo'}: ${c.text}`}
                      onClick={() => patch(e.id, { checklist: e.checklist.map((x: any, j: number) => j === i ? { ...x, done: !x.done } : x) })}
                      className="tap-target-sm grid place-items-center">
                      <span aria-hidden className={`grid place-items-center h-5 w-5 rounded-full ${c.done ? 'bg-[#C8F542] on-accent' : 'border-2 border-black/15'}`}>
                        {c.done && <Icon name="check" size={12} strokeWidth={2.6} />}
                      </span>
                    </button>
                  }
                  title={<span className={c.done ? 'text-black/45' : undefined}>{c.text}</span>}
                  actions={<Button size="sm" variant="ghost" iconOnly icon="close" aria-label={`Odebrat úkol: ${c.text}`}
                    onClick={() => patch(e.id, { checklist: e.checklist.filter((_: any, j: number) => j !== i) })} />} />
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2 mt-2">
            <Field id={`akce-ukol-${e.id}`} label="Nový úkol k akci" className="flex-1">
              <Input id={`akce-ukol-${e.id}`} value={checkTxt} onChange={ev3 => setCheckTxt(ev3.target.value)} maxLength={200}
                onKeyDown={ev3 => { if (ev3.key === 'Enter') { ev3.preventDefault(); pridejUkol(); } }} />
            </Field>
            <Button iconOnly icon="plus" aria-label="Přidat úkol" disabled={!checkTxt.trim()} onClick={pridejUkol} />
          </div>

          {e.offsite && (
            <div className="mt-4 well p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <p className="t-label flex items-center gap-1.5"><Icon name="tent" size={13} />Balicí seznam (ze skladu)</p>
                <div className="flex gap-1.5">
                  {e.packing.some((p: any) => p.itemId && !p.packed) && (
                    <Button size="sm" variant="primary" icon="box" onClick={() => otevriPotvrzeni({
                      title: 'Vyskladnit vše nesbalené?', akce: 'Vyskladnit',
                      text: 'Množství se odečte ze skladu (s poznámkou u položek).',
                      run: () => { void patch(e.id, { packAction: 'checkout' }); },
                    })}>Vyskladnit</Button>
                  )}
                  {e.packing.some((p: any) => p.itemId && p.packed && p.returned == null) && (
                    <Button size="sm" variant="secondary" icon="swap" onClick={() => otevriPotvrzeni({
                      title: 'Vrátit sbalené do skladu?', akce: 'Vrátit',
                      text: 'Vrací se plné množství — spotřebu pak uprav ve skladu.',
                      run: () => { void patch(e.id, { packAction: 'return' }); },
                    })}>Vrátit do skladu</Button>
                  )}
                </div>
              </div>
              {e.packing.length > 0 && (
                <ul className="list">
                  {e.packing.map((p2: any, i: number) => (
                    <ListRow key={i} title={p2.name}
                      right={<>
                        <span className="text-xs text-black/55 tabular-nums">{p2.qty}×</span>
                        {p2.returned != null ? <Chip tone="ok" size="sm">vráceno {p2.returned}</Chip>
                          : p2.packed ? <Chip tone="wait" size="sm">vyskladněno</Chip>
                          : <Chip tone="muted" size="sm">čeká</Chip>}
                      </>}
                      actions={!p2.packed ? <Button size="sm" variant="ghost" iconOnly icon="close" aria-label={`Odebrat ${p2.name} z balení`}
                        onClick={() => patch(e.id, { packing: e.packing.filter((_: any, j: number) => j !== i) })} /> : undefined} />
                  ))}
                </ul>
              )}
              <div className="relative mt-2">
                <Field id={`akce-sklad-${e.id}`} label="Přidat ze skladu">
                  <Input id={`akce-sklad-${e.id}`} data-transient value={packSearch} onChange={ev3 => setPackSearch(ev3.target.value)}
                    placeholder="Začni psát název…" autoComplete="off" />
                </Field>
                {packCandidates.length > 0 && (
                  <div className="absolute inset-x-0 top-full mt-1 z-10 glass-strong rounded-2xl p-1.5 space-y-0.5 shadow-lg">
                    {packCandidates.map(i2 => (
                      <button key={i2.id} type="button"
                        onClick={() => otevriBaleni(i2)}
                        className="w-full text-left px-3 py-2 rounded-xl text-sm text-[#16181A] hover:bg-black/[0.06] transition-colors flex justify-between gap-2">
                        <span className="min-w-0 truncate">{i2.name}</span>
                        <span className="shrink-0 text-xs text-black/55">{i2.quantity} {i2.unit}</span>
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
          <div className="well p-4 space-y-3">
            {/* Akce u nás jede přes běžnou kasu — pokladna umí říct, co se
                namarkovalo za dobu akce a kolik se prodalo z jejího menu. */}
            {(!e.offsite || e.posPlaceId) && (
              <div>
                {pos == null ? (
                  <Button size="sm" variant="secondary" icon="receipt" loading={posBusy}
                    onClick={async () => {
                      setPosBusy(true); setPosErr('');
                      const r = await fetch(`/api/events/${e.id}/pos`).catch(() => null);
                      const d = r ? await r.json().catch(() => null) : null;
                      setPosBusy(false);
                      if (r?.ok && d) setPos(d);
                      else setPosErr(d?.error || 'Pokladna teď neodpovídá.');
                    }}>
                    {e.offsite ? 'Tržba kasy akce (celý den)' : 'Prodej z pokladny za dobu akce'}
                  </Button>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-sm text-[#16181A]">
                      <Icon name="receipt" size={15} className="inline -mt-0.5 mr-1.5 text-black/40" />
                      V kase {pos.from ? `${pos.from}–${pos.till ?? 'konec dne'}` : 'ten den'}: <span className="font-bold tabular-nums">{money(pos.revenue)}</span>
                      <span className="text-black/55"> · {czCount(Number(pos.bills) || 0, UCTENKA)}</span>
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
                    <p className="t-meta">Informativní pohled — do financí jde tržba dne přes běžnou uzávěrku, nic se tu nezapisuje.</p>
                  </div>
                )}
                {posErr && <p className="note note-danger mt-2" role="alert">{posErr}</p>}
              </div>
            )}
            {e.closingsCount > 0 ? (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* czech-ok: po předložce „z“ je 2. pád stejný pro 2–4 i 5+. */}
                <p className="text-sm text-black/60"><Icon name="receipt" size={15} className="inline -mt-0.5 mr-1.5" />Tržba z {e.closingsCount === 1 ? 'uzávěrky za akci' : `${e.closingsCount} uzávěrek za akci`}</p>
                <p className="text-sm font-bold tabular-nums text-[#16181A]">{money(e.closingsTotal)}</p>
              </div>
            ) : (
              <Field id={`akce-trzba-${e.id}`} label="Tržba z akce"
                hint={e.offsite
                  ? 'Nebo na místě udělejte uzávěrku „Za akci" — pozná, že ten den akce je, a tržba se sem propíše sama.'
                  : 'Když obsluha udělá uzávěrku „Za akci", tržba se sem propíše sama.'}>
                <Input id={`akce-trzba-${e.id}`} type="number" inputMode="numeric" value={revenue} onChange={ev3 => setRevenue(ev3.target.value)}
                  onBlur={() => patch(e.id, { revenue: revenue === '' ? null : Number(revenue) })} placeholder="0" />
              </Field>
            )}
            <Field id={`akce-naklady-${e.id}`} label="Náklady">
              <Input id={`akce-naklady-${e.id}`} type="number" inputMode="numeric" value={costs} onChange={ev3 => setCosts(ev3.target.value)}
                onBlur={() => patch(e.id, { costs: costs === '' ? null : Number(costs) })} placeholder="0" />
            </Field>
            {result != null && (
              <p className={`text-sm font-bold tabular-nums ${result >= 0 ? 'text-ok-ink' : 'text-bad-ink'}`}>
                Výsledek: {result >= 0 ? '+' : ''}{money(result)}
              </p>
            )}
          </div>
        </Sec>

        {/* Tlačítka detailu jsou v obsahu, ne v patičce okna: patička patří
            druhému kroku a „Smazat akci" musí po Zrušit dostat fokus zpátky. */}
        <div className="mt-6 flex justify-between gap-2">
          <Button variant="danger" onClick={() => otevriPotvrzeni({
            title: `Smazat akci „${e.title}"?`, akce: 'Smazat', danger: true,
            text: 'Odeberou se i směny z akce. Smazanou akci nejde vrátit.',
            run: async () => {
              const res = await fetch(`/api/events/${e.id}`, { method: 'DELETE' }).catch(() => null);
              if (res?.ok) onDeleted();
              else oznam('Akci se nepodařilo smazat.', 'bad');
            },
          })}>Smazat akci</Button>
          <Button variant="primary" onClick={onClose}>Hotovo</Button>
        </div>
      </div>
    </Modal>
  );
}
