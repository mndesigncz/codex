'use client';

// Moje: nejdřív kartička s QR (to, co host u kasy ukazuje), pak co ještě
// nehodnotil, podniky s razítky a body, nejbližší rezervace, kupony.
// Historie a účet jsou složené, ať stránka na mobilu nezačíná seznamem.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../Icons';
import { Skeleton, EmptyState } from '../ui';
import { czDay, RES_STATUS } from '@/lib/clientSlots';

const input = 'w-full rounded-2xl bg-white/70 border border-black/[0.08] px-4 py-2.5 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/60 focus:ring-2 focus:ring-[#C8F542]/25 focus:outline-none transition text-sm';
const label = 'block text-xs font-semibold text-black/55 mb-1.5';
const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n > 1 && n < 5 ? few : many);

export default function MyPage() {
  const [d, setD] = useState<any | null>(null);
  const [card, setCard] = useState<any | null>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');
  const load = useCallback(() => fetch('/api/client/me').then(r => r.json()).then(setD).catch(() => setErr('Nenačetlo se. Zkus obnovit stránku.')), []);
  useEffect(() => {
    load();
    fetch('/api/client/card').then(r => r.json()).then(x => setCard(x?.code ? x : null)).catch(() => setCard(null));
    fetch('/api/client/reviews').then(r => r.json()).then(x => setPending(Array.isArray(x?.pending) ? x.pending : [])).catch(() => {});
  }, [load]);
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(''), 4000); return () => clearTimeout(t); } }, [flash]);

  if (err) return <p className="rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm px-4 py-3">{err}</p>;
  if (!d) return <div className="space-y-4"><Skeleton className="h-56 rounded-[28px]" /><Skeleton className="h-24 rounded-3xl" /><Skeleton className="h-40 rounded-3xl" /></div>;

  const open = (d.claims ?? []).filter((c: any) => !c.redeemed_at);
  const upcoming = (d.reservations ?? []).filter((r: any) => r.date >= d.today && !['cancelled', 'declined', 'done'].includes(r.status));
  const past = (d.reservations ?? []).filter((r: any) => !upcoming.includes(r));
  const orders: any[] = d.orders ?? [];

  return (
    <div className="space-y-8 sm:space-y-10">
      <MemberCard name={d.me?.name} card={card} />

      {flash && <p role="status" className="rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/40 text-[#3E5406] text-sm px-4 py-3">{flash}</p>}

      {pending.length > 0 && (
        <section aria-labelledby="h-review">
          <h2 id="h-review" className="text-lg font-bold tracking-tight mb-3">Jak to bylo?</h2>
          <ul className="space-y-3">
            {pending.map((p: any) => <ReviewPrompt key={p.ref} p={p} onDone={() => { setPending(x => x.filter(y => y.ref !== p.ref)); setFlash('Díky za hodnocení.'); }} />)}
          </ul>
        </section>
      )}

      <section aria-labelledby="h-biz">
        <h2 id="h-biz" className="text-lg font-bold tracking-tight mb-3">Moje podniky</h2>
        {d.memberships?.length ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {d.memberships.map((m: any) => (
              <li key={m.slug}>
                <Link href={`/client/${m.slug}`} className="block rounded-3xl border border-black/[0.06] bg-white/60 hover:bg-white/80 active:scale-[0.99] transition p-5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-bold tracking-tight leading-tight truncate">{m.name}</p>
                      <p className="text-sm text-black/55 mt-0.5">{m.visits} {plural(m.visits, 'návštěva', 'návštěvy', 'návštěv')}{m.lastVisitAt ? ` · naposledy ${new Date(m.lastVisitAt).toLocaleDateString('cs-CZ')}` : ''}</p>
                    </div>
                    <p className="text-xl font-bold tabular-nums leading-tight shrink-0">{m.points} <span className="text-sm font-medium text-black/50">b.</span></p>
                  </div>
                  {m.stampTarget > 0 && (
                    <div className="mt-3">
                      <div className="flex gap-1" aria-label={`${m.stamps} z ${m.stampTarget} razítek`}>
                        {Array.from({ length: Math.min(m.stampTarget, 12) }).map((_, i) => <span key={i} className={`h-2 flex-1 rounded-full ${i < m.stamps ? 'bg-[#C8F542]' : 'bg-black/[0.08]'}`} />)}
                      </div>
                      <p className="text-xs text-black/55 mt-1.5 tabular-nums">{m.stamps}/{m.stampTarget} razítek{m.stampReward ? ` · za plnou kartu ${m.stampReward}` : ''}</p>
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="location" title="Zatím nejsi členem žádného podniku" hint="Vyber si podnik a přidej se. První body dostaneš hned."
            action={<Link href="/client" className="tap-target inline-flex items-center gap-2 rounded-full bg-[#C8F542] text-[#16181A] px-5 py-3 text-sm font-semibold hover:brightness-105 transition">Vybrat podnik</Link>} />
        )}
      </section>

      {(upcoming.length > 0 || open.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 items-start">
          {upcoming.length > 0 && (
            <section aria-labelledby="h-res">
              <h2 id="h-res" className="text-lg font-bold tracking-tight mb-3">Nadcházející rezervace</h2>
              <ul className="divide-y divide-black/[0.06]">{upcoming.map((r: any) => <ResRow key={r.id} r={r} />)}</ul>
            </section>
          )}
          {open.length > 0 && (
            <section aria-labelledby="h-coup">
              <h2 id="h-coup" className="text-lg font-bold tracking-tight mb-3">Kupony k uplatnění</h2>
              <ul className="space-y-2">
                {open.map((c: any) => (
                  <li key={c.id} className="rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/40 px-4 py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight truncate">{c.title}</p>
                      <p className="text-xs text-black/55 truncate">{c.business}</p>
                    </div>
                    <p className="font-mono font-bold tracking-widest text-lg shrink-0">{c.code}</p>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-black/50 mt-2">Kód ukaž obsluze u kasy.</p>
            </section>
          )}
        </div>
      )}

      {(past.length > 0 || orders.length > 0) && (
        <details className="group">
          <summary className="tap-target-sm inline-flex items-center gap-2 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none">
            <Icon name="chevron" size={16} className="transition-transform group-open:rotate-180" />Historie ({past.length + orders.length})
          </summary>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            {past.length > 0 && (
              <section>
                <h3 className="text-sm font-bold tracking-tight mb-2">Dřívější rezervace</h3>
                <ul className="divide-y divide-black/[0.06]">{past.slice(0, 20).map((r: any) => <ResRow key={r.id} r={r} />)}</ul>
              </section>
            )}
            {orders.length > 0 && (
              <section>
                <h3 className="text-sm font-bold tracking-tight mb-2">Objednávky od stolu</h3>
                <ul className="divide-y divide-black/[0.06]">
                  {orders.slice(0, 20).map((o: any) => (
                    <li key={o.id} className="py-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{o.business}</p>
                        <p className="text-sm text-black/55 truncate">{(o.items ?? []).map((i: any) => `${i.count}× ${i.name}`).join(', ')}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold tabular-nums">{o.total} Kč</p>
                        <p className="text-xs text-black/50">{o.status === 'new' ? 'čeká' : o.status === 'confirmed' ? 'připravuje se' : o.status === 'done' ? 'hotovo' : 'nepřijato'}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </details>
      )}

      <ProfileForm me={d.me} onSaved={(me: any) => { setD({ ...d, me }); setFlash('Uloženo.'); }} />
    </div>
  );
}

/** Kartička: tmavá, s QR. Kód i textem, kdyby čtečka selhala. */
function MemberCard({ name, card }: { name: string; card: any | null }) {
  return (
    <section aria-label="Kartička" className="rounded-[28px] bg-[#16181A] text-white p-5 sm:p-7 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 items-center">
      <div className="min-w-0 order-2 sm:order-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C8F542] mb-2">Managero client</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tighter leading-[1.05] break-words">{name}</h1>
        {card ? (
          <p className="mt-3 font-mono text-lg sm:text-xl font-bold tracking-[0.2em] text-white/90">{card.code}</p>
        ) : card === null ? <p className="mt-3 text-sm text-white/60">Kartička se nenačetla.</p> : <Skeleton className="mt-3 h-7 w-40 rounded-lg bg-white/10" />}
        <p className="mt-3 text-sm text-white/60 max-w-[34ch] text-pretty">Ukaž u kasy. Obsluha načte kód a přidá razítko za návštěvu nebo body za útratu. Jedna kartička pro všechny podniky.</p>
      </div>
      <div className="order-1 sm:order-2 justify-self-center sm:justify-self-end">
        <div className="rounded-2xl bg-white p-3 w-40 h-40 sm:w-44 sm:h-44 grid place-items-center [&_svg]:w-full [&_svg]:h-full" aria-hidden>
          {card?.svg ? <span dangerouslySetInnerHTML={{ __html: card.svg }} className="block w-full h-full" /> : <Skeleton className="w-full h-full rounded-lg" />}
        </div>
      </div>
    </section>
  );
}

function ReviewPrompt({ p, onDone }: { p: any; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    if (!rating) { setErr('Vyber hvězdičky.'); return; }
    setBusy(true); setErr('');
    const r = await fetch('/api/client/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: p.ref, rating, note }) });
    const x = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(x.error || 'Nepovedlo se.'); return; }
    onDone();
  };
  return (
    <li className="rounded-3xl border border-black/[0.06] bg-white/60 p-4 sm:p-5">
      <p className="font-semibold leading-tight">{p.business} <span className="text-black/50 font-medium">· {p.kind === 'order' ? 'objednávka od stolu' : 'rezervace'}</span></p>
      <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Hodnocení">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} z 5`} onClick={() => setRating(n)}
            className={`tap-target-sm h-10 w-10 rounded-full text-2xl leading-none transition ${n <= rating ? 'text-[#16181A]' : 'text-black/20 hover:text-black/40'}`}>★</button>
        ))}
      </div>
      <div className="mt-2 flex gap-2 flex-wrap">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Pár slov, když chceš" aria-label="Poznámka k hodnocení" className={`${input} flex-1 basis-48`} maxLength={500} />
        <button type="button" onClick={send} disabled={busy} className="tap-target inline-flex items-center gap-2 rounded-full bg-[#16181A] text-white px-4 py-2.5 text-sm font-semibold hover:bg-black active:scale-[0.98] disabled:opacity-50 transition">{busy ? '…' : 'Odeslat'}</button>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}
    </li>
  );
}

function ProfileForm({ me, onSaved }: { me: any; onSaved: (me: any) => void }) {
  const [f, setF] = useState({ name: me?.name ?? '', phone: me?.phone ?? '', birthday: me?.birthday ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await fetch('/api/client/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const x = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(x.error || 'Nepovedlo se.'); return; }
    onSaved(x.me);
  };
  return (
    <details className="group">
      <summary className="tap-target-sm inline-flex items-center gap-2 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none">
        <Icon name="chevron" size={16} className="transition-transform group-open:rotate-180" />Účet
      </summary>
      <form onSubmit={save} className="mt-3 rounded-3xl border border-black/[0.06] bg-white/60 p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end max-w-2xl">
        <div><label htmlFor="pf-name" className={label}>Jméno</label><input id="pf-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={input} required /></div>
        <div><label htmlFor="pf-phone" className={label}>Telefon</label><input id="pf-phone" type="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="Pro potvrzení rezervace" className={input} /></div>
        <div><label htmlFor="pf-bday" className={label}>Narozeniny</label><input id="pf-bday" type="date" value={f.birthday} onChange={e => setF({ ...f, birthday: e.target.value })} className={input} /></div>
        <p className="sm:col-span-2 text-xs text-black/50">E-mail: {me?.email}. Narozeniny vidí jen podniky, kde jsi členem, kvůli přání a odměně.</p>
        <button type="submit" disabled={busy} className="tap-target justify-self-start sm:justify-self-end inline-flex items-center gap-2 rounded-full bg-[#16181A] text-white px-4 py-2.5 text-sm font-semibold hover:bg-black active:scale-[0.98] disabled:opacity-50 transition">{busy ? '…' : 'Uložit'}</button>
        {err && <p role="alert" className="sm:col-span-3 text-sm text-red-700">{err}</p>}
      </form>
    </details>
  );
}

function ResRow({ r }: { r: any }) {
  const st = RES_STATUS[r.status] ?? RES_STATUS.requested;
  return (
    <li className="py-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold cz-sentence">{czDay(r.date, true)} <span className="text-black/50 font-medium">· {r.time}</span></p>
        <p className="text-sm text-black/55 truncate">{r.business} · {r.party} {plural(r.party, 'osoba', 'osoby', 'osob')}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.tone === 'ok' ? 'bg-[#C8F542]/25 text-[#3E5406]' : st.tone === 'wait' ? 'bg-amber-500/15 text-amber-800' : 'bg-black/[0.06] text-black/60'}`}>{st.label}</span>
    </li>
  );
}
