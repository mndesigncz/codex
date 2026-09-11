'use client';

// Stránka podniku pro hosta: kdo jsou, kdy mají otevřeno, co nabízejí,
// rezervace a věrnost. Vše na jedné adrese, přepínané záložkami.

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { Icon } from '../Icons';
import { Segmented, Skeleton, EmptyState } from '../ui';
import { hoursLabel, slotsFor, czDay, DAY_NAMES, RES_STATUS } from '@/lib/clientSlots';
import { pragueToday, dayPlus } from '@/lib/pragueTime';

type Tab = 'menu' | 'reserve' | 'loyalty';

const btnPrimary = 'tap-target inline-flex items-center justify-center gap-2 rounded-full bg-[#C8F542] text-[#16181A] px-5 py-3 text-sm font-semibold hover:brightness-105 active:scale-[0.98] disabled:opacity-50 transition';
const btnQuiet = 'tap-target inline-flex items-center justify-center gap-2 rounded-full glass border border-black/10 px-4 py-2.5 text-sm font-medium hover:bg-black/[0.05] active:scale-[0.98] disabled:opacity-50 transition';
const input = 'w-full rounded-2xl bg-white/70 border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/60 focus:ring-2 focus:ring-[#C8F542]/25 focus:outline-none transition text-sm';
const label = 'block text-xs font-semibold text-black/55 mb-1.5';

export default function BusinessPage({ slug }: { slug: string }) {
  const [d, setD] = useState<any | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>('menu');
  const [flash, setFlash] = useState('');
  const load = useCallback(() => fetch(`/api/client/b/${encodeURIComponent(slug)}`).then(r => r.status === 404 ? (setNotFound(true), null) : r.json()).then(x => x && setD(x)).catch(() => setNotFound(true)), [slug]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(''), 4000); return () => clearTimeout(t); } }, [flash]);

  if (notFound) return <EmptyState icon="location" title="Podnik tu není" hint="Buď má jinou adresu, nebo Managero client zatím nezapnul." action={<Link href="/client" className={btnQuiet}>Zpět na podniky</Link>} />;
  if (!d) return <div className="space-y-4"><Skeleton className="h-48 rounded-3xl" /><Skeleton className="h-10 w-72 rounded-full" /><Skeleton className="h-64 rounded-3xl" /></div>;

  const b = d.business; const me = d.me; const today: string = d.today;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'menu', label: 'Nabídka' },
    ...(b.reservationsOn ? [{ id: 'reserve' as Tab, label: 'Rezervace' }] : []),
    ...(b.loyaltyOn ? [{ id: 'loyalty' as Tab, label: 'Věrnost' }] : []),
  ];
  const join = async () => {
    const r = await fetch(`/api/client/b/${encodeURIComponent(slug)}/join`, { method: 'POST' });
    if (r.status === 401) { window.location.href = `/client/login?next=${encodeURIComponent('/client/' + slug)}`; return; }
    if (r.ok) { setFlash('Jsi členem. Vítej.'); load(); }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-black/[0.06] bg-white/60 min-h-[13rem] flex flex-col justify-end p-5 sm:p-7">
        {b.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {b.coverUrl && <div className="absolute inset-0 bg-gradient-to-t from-[#16181A]/85 via-[#16181A]/30 to-transparent" />}
        <div className={`relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end ${b.coverUrl ? 'text-white' : ''}`}>
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter leading-[1.02] text-balance">{b.name}</h1>
            {b.tagline && <p className={`mt-1.5 text-base ${b.coverUrl ? 'text-white/80' : 'text-black/60'} text-pretty`}>{b.tagline}</p>}
            <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm ${b.coverUrl ? 'text-white/80' : 'text-black/55'}`}>
              <span className="inline-flex items-center gap-1.5"><Icon name="clock" size={15} />Dnes {hoursLabel(b.hours, today)}</span>
              {b.address && <span className="inline-flex items-center gap-1.5"><Icon name="location" size={15} />{b.address}</span>}
            </div>
          </div>
          <div className="shrink-0">
            {me?.member ? (
              <div className={`rounded-2xl px-4 py-3 ${b.coverUrl ? 'bg-white/15 backdrop-blur' : 'bg-[#C8F542]/20 border border-[#C8F542]/40'}`}>
                <p className="text-[11px] uppercase tracking-wider opacity-70">Člen</p>
                <p className="text-lg font-bold tabular-nums leading-tight">{me.points} b. <span className="opacity-60 font-medium text-sm">· {me.stamps}/{b.stampTarget || '–'} razítek</span></p>
              </div>
            ) : (
              <button onClick={join} className={btnPrimary}><Icon name="plus" size={16} /> Stát se členem</button>
            )}
          </div>
        </div>
      </section>

      {flash && <p role="status" className="rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/40 text-[#3E5406] text-sm px-4 py-3">{flash}</p>}

      {tabs.length > 1 && <Segmented options={tabs} value={tab} onChange={setTab} ariaLabel="Části stránky podniku" />}

      {tab === 'menu' && <MenuTab menu={d.menu} description={b.description} hours={b.hours} currency={b.currency} />}
      {tab === 'reserve' && b.reservationsOn && <ReserveTab slug={slug} b={b} me={me} today={today} signedIn={d.signedIn} onDone={(m: string) => { setFlash(m); load(); }} />}
      {tab === 'loyalty' && b.loyaltyOn && <LoyaltyTab slug={slug} b={b} me={me} coupons={d.coupons} signedIn={d.signedIn} onDone={(m: string) => { setFlash(m); load(); }} />}
    </div>
  );
}

function MenuTab({ menu, description, hours, currency }: { menu: any; description: string; hours: any; currency: string }) {
  const cur = currency === 'CZK' ? 'Kč' : currency;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6 md:gap-10 items-start">
      <div className="space-y-6">
        {menu?.sections?.length ? menu.sections.map((s: any) => (
          <section key={s.id}>
            <h2 className="text-lg font-bold tracking-tight mb-2">{s.title}</h2>
            <ul className="divide-y divide-black/[0.06]">
              {s.items.map((it: any) => (
                <li key={it.id} className={`py-2.5 flex items-baseline gap-3 ${it.soldOut ? 'opacity-50' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight">{it.name}{it.soldOut && <span className="ml-2 text-[11px] uppercase tracking-wider text-black/50">vyprodáno</span>}</p>
                    {it.description && <p className="text-sm text-black/55 mt-0.5 text-pretty">{it.description}</p>}
                  </div>
                  <span className="tabular-nums font-semibold shrink-0">{it.price} {cur}</span>
                </li>
              ))}
            </ul>
          </section>
        )) : <EmptyState icon="leaf" title="Nabídka zatím není zveřejněná" hint="Podnik ji doplní v aplikaci." compact />}
      </div>
      <aside className="space-y-5 md:sticky md:top-24">
        {description && <p className="text-sm text-black/65 leading-relaxed text-pretty">{description}</p>}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45 mb-2">Otevírací doba</p>
          <ul className="text-sm divide-y divide-black/[0.06]">
            {DAY_NAMES.map((n, i) => {
              const day = hours?.[String(i)];
              const txt = !day ? 'neuvedeno' : day.closed || !day.open ? 'zavřeno' : `${day.open}–${day.close}`;
              return <li key={n} className="py-1.5 flex justify-between gap-3"><span className="cz-sentence">{n}</span><span className="tabular-nums text-black/70">{txt}</span></li>;
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function ReserveTab({ slug, b, me, today, signedIn, onDone }: { slug: string; b: any; me: any; today: string; signedIn: boolean; onDone: (m: string) => void }) {
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const [party, setParty] = useState(2);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const slots = useMemo(() => slotsFor(b.hours, date, b.slotMinutes), [b.hours, date, b.slotMinutes]);
  useEffect(() => { if (!slots.includes(time)) setTime(slots[0] ?? ''); }, [slots, time]);
  const maxDate = dayPlus(today, b.leadDays);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!signedIn) { window.location.href = `/client/login?next=${encodeURIComponent('/client/' + slug)}`; return; }
    if (!time) { setErr('Vyber čas.'); return; }
    setBusy(true);
    const r = await fetch(`/api/client/b/${encodeURIComponent(slug)}/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, time, party, note }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(d.error || 'Rezervace se nepovedla.'); return; }
    setNote(''); onDone('Rezervace odeslána. Podnik ji potvrdí.');
  };
  const cancel = async (id: number) => {
    if (!confirm('Zrušit rezervaci?')) return;
    const r = await fetch(`/api/client/reservations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
    if (r.ok) onDone('Rezervace zrušena.');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6 md:gap-10 items-start">
      <form onSubmit={submit} className="glass-card p-5 sm:p-6 grid gap-4" noValidate>
        <h2 className="text-lg font-bold tracking-tight">Rezervovat stůl</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <label htmlFor="r-date" className={label}>Den</label>
            <input id="r-date" type="date" min={today} max={maxDate} value={date} onChange={e => setDate(e.target.value)} className={input} required />
          </div>
          <div className="grid gap-2">
            <label htmlFor="r-time" className={label}>Čas</label>
            {slots.length ? (
              <select id="r-time" value={time} onChange={e => setTime(e.target.value)} className={input}>
                {slots.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : <p className="text-sm text-black/55 py-3">V tento den je zavřeno.</p>}
          </div>
          <div className="grid gap-2">
            <label htmlFor="r-party" className={label}>Kolik vás bude</label>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Méně" onClick={() => setParty(p => Math.max(1, p - 1))} className="tap-target h-11 w-11 rounded-full glass border border-black/10 grid place-items-center hover:bg-black/[0.05] active:scale-95 transition"><span className="text-lg leading-none">−</span></button>
              <input id="r-party" type="number" min={1} max={b.maxParty} value={party} onChange={e => setParty(Math.max(1, Math.min(b.maxParty, parseInt(e.target.value || '1', 10))))} className={`${input} text-center tabular-nums !w-20`} />
              <button type="button" aria-label="Více" onClick={() => setParty(p => Math.min(b.maxParty, p + 1))} className="tap-target h-11 w-11 rounded-full glass border border-black/10 grid place-items-center hover:bg-black/[0.05] active:scale-95 transition"><span className="text-lg leading-none">+</span></button>
            </div>
            <p className="text-xs text-black/45">Nejvíc {b.maxParty} u jedné rezervace.</p>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <label htmlFor="r-note" className={label}>Poznámka</label>
            <input id="r-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Kočárek, oslava, u okna…" className={input} maxLength={300} />
          </div>
        </div>
        {err && <p role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm px-3 py-2">{err}</p>}
        <button type="submit" disabled={busy || !slots.length} className={btnPrimary}>
          <Icon name="calendarCheck" size={16} /> {busy ? 'Odesílám…' : signedIn ? 'Odeslat rezervaci' : 'Přihlásit se a rezervovat'}
        </button>
      </form>
      <aside>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-black/45 mb-2">Moje rezervace tady</h3>
        {me?.reservations?.length ? (
          <ul className="divide-y divide-black/[0.06]">
            {me.reservations.map((r: any) => {
              const st = RES_STATUS[r.status] ?? RES_STATUS.requested;
              return (
                <li key={r.id} className="py-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold cz-sentence">{czDay(r.date, true)} <span className="text-black/50 font-medium">· {r.time}</span></p>
                    <p className="text-sm text-black/55">{r.party} {r.party === 1 ? 'osoba' : r.party < 5 ? 'osoby' : 'osob'}{r.note ? ` · ${r.note}` : ''}</p>
                    <span className={`inline-block mt-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.tone === 'ok' ? 'bg-[#C8F542]/25 text-[#3E5406]' : st.tone === 'wait' ? 'bg-amber-500/15 text-amber-800' : 'bg-black/[0.06] text-black/60'}`}>{st.label}</span>
                  </div>
                  {['requested', 'confirmed'].includes(r.status) && (
                    <button onClick={() => cancel(r.id)} className="tap-target-sm text-xs text-black/55 hover:text-red-700 transition shrink-0">Zrušit</button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-black/55">Zatím žádná. První je hned vlevo.</p>}
      </aside>
    </div>
  );
}

function LoyaltyTab({ slug, b, me, coupons, signedIn, onDone }: { slug: string; b: any; me: any; coupons: any[]; signedIn: boolean; onDone: (m: string) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const claim = async (id: number) => {
    if (!signedIn) { window.location.href = `/client/login?next=${encodeURIComponent('/client/' + slug)}`; return; }
    setBusy(id); setErr('');
    const r = await fetch(`/api/client/b/${encodeURIComponent(slug)}/coupons/${id}/claim`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setErr(d.error || 'Kupon se nepodařilo vzít.'); return; }
    onDone(`Kupon je tvůj. Kód ${d.code} ukaž u kasy.`);
  };
  const target = b.stampTarget || 0;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-6 md:gap-10 items-start">
      <section className="glass-card p-5 sm:p-6">
        <h2 className="text-lg font-bold tracking-tight">Razítka a body</h2>
        {me?.member ? (
          <>
            {target > 0 && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-black/60">Razítka za návštěvy</p>
                  <p className="text-sm font-semibold tabular-nums">{me.stamps} / {target}</p>
                </div>
                <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(target, 10)}, minmax(0, 1fr))` }} aria-hidden>
                  {Array.from({ length: target }).map((_, i) => (
                    <span key={i} className={`h-8 rounded-lg border ${i < me.stamps ? 'bg-[#C8F542] border-[#C8F542]' : 'bg-white/60 border-black/[0.08]'}`} />
                  ))}
                </div>
                <p className="mt-2 text-xs text-black/55">Za {target} návštěv: <strong className="text-black/80">{b.stampReward || 'odměna'}</strong>. Razítko přibude, když podnik uzavře tvoji rezervaci nebo objednávku.</p>
              </div>
            )}
            <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-black/[0.06] pt-4">
              <p className="text-sm text-black/60">Body</p>
              <p className="text-2xl font-bold tabular-nums">{me.points}</p>
            </div>
            <p className="text-xs text-black/55 mt-1">{b.pointsPer100} bodů za každých 100 Kč útraty od stolu. Body jsou na kupony vpravo.</p>
            {me.claims?.length > 0 && (
              <div className="mt-5 border-t border-black/[0.06] pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45 mb-2">Kupony k uplatnění</p>
                <ul className="space-y-2">
                  {me.claims.map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/40 px-3.5 py-2.5">
                      <span className="text-sm font-medium min-w-0 truncate">{c.title}</span>
                      <span className="font-mono font-bold tracking-widest text-sm shrink-0">{c.code}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-black/50 mt-2">Kód ukaž obsluze u kasy.</p>
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-black/60">Staň se členem a začni sbírat razítka za návštěvy a body za útratu.</p>
        )}
      </section>
      <section>
        <h2 className="text-lg font-bold tracking-tight mb-3">Kupony za body</h2>
        {err && <p role="alert" className="mb-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm px-3 py-2">{err}</p>}
        {coupons?.length ? (
          <ul className="divide-y divide-black/[0.06]">
            {coupons.map((c: any) => {
              const can = me?.member && me.points >= Number(c.cost_points);
              return (
                <li key={c.id} className="py-3.5 flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.title}</p>
                    {c.description && <p className="text-sm text-black/55 text-pretty">{c.description}</p>}
                    {c.valid_until && <p className="text-xs text-black/45 mt-0.5">Platí do {czDay(c.valid_until)}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{Number(c.cost_points) === 0 ? 'zdarma' : `${c.cost_points} b.`}</p>
                    <button onClick={() => claim(c.id)} disabled={busy === c.id || (signedIn && me?.member && !can)}
                      className="tap-target-sm mt-1 rounded-full bg-[#16181A] text-white px-3.5 py-1.5 text-xs font-semibold hover:bg-black active:scale-[0.97] disabled:opacity-40 transition">
                      {busy === c.id ? '…' : 'Vzít'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState icon="gift" title="Zatím žádné kupony" hint="Podnik je přidá, jakmile bude mít co nabídnout." compact />}
      </section>
    </div>
  );
}
