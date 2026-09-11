'use client';

// Moje: podniky, kde jsem členem, rezervace, objednávky a kupony s kódy.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../Icons';
import { Skeleton, EmptyState } from '../ui';
import { czDay, RES_STATUS } from '@/lib/clientSlots';

export default function MyPage() {
  const [d, setD] = useState<any | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { fetch('/api/client/me').then(r => r.json()).then(setD).catch(() => setErr('Nenačetlo se. Zkus obnovit stránku.')); }, []);
  if (err) return <p className="rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm px-4 py-3">{err}</p>;
  if (!d) return <div className="space-y-4"><Skeleton className="h-10 w-64 rounded-full" /><Skeleton className="h-40 rounded-3xl" /><Skeleton className="h-64 rounded-3xl" /></div>;

  const open = (d.claims ?? []).filter((c: any) => !c.redeemed_at);
  const upcoming = (d.reservations ?? []).filter((r: any) => r.date >= d.today && !['cancelled', 'declined', 'done'].includes(r.status));
  const past = (d.reservations ?? []).filter((r: any) => !upcoming.includes(r));

  return (
    <div className="space-y-10">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45 mb-2">Moje</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter leading-[1.05]">{d.me?.name}</h1>
      </header>

      <section>
        <h2 className="text-lg font-bold tracking-tight mb-3">Moje podniky</h2>
        {d.memberships?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4">
            {d.memberships.map((m: any) => (
              <Link key={m.slug} href={`/client/${m.slug}`} className="rounded-3xl border border-black/[0.06] bg-white/60 hover:bg-white/80 active:scale-[0.99] transition p-5 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold tracking-tight leading-tight truncate">{m.name}</p>
                  <p className="text-sm text-black/55 mt-0.5">{m.visits} {m.visits === 1 ? 'návštěva' : m.visits < 5 ? 'návštěvy' : 'návštěv'}{m.lastVisitAt ? ` · naposledy ${new Date(m.lastVisitAt).toLocaleDateString('cs-CZ')}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold tabular-nums leading-tight">{m.points} <span className="text-sm font-medium text-black/50">b.</span></p>
                  {m.stampTarget > 0 && <p className="text-xs text-black/55 tabular-nums">{m.stamps}/{m.stampTarget} razítek</p>}
                </div>
                <Icon name="chevron" size={16} className="-rotate-90 text-black/35 shrink-0" />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon="location" title="Zatím nejsi členem žádného podniku" hint="Vyber si podnik a přidej se — první body dostaneš hned."
            action={<Link href="/client" className="tap-target inline-flex items-center gap-2 rounded-full bg-[#C8F542] text-[#16181A] px-5 py-3 text-sm font-semibold hover:brightness-105 transition">Vybrat podnik</Link>} />
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-8 md:gap-12 items-start">
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">Rezervace</h2>
          {upcoming.length ? (
            <ul className="divide-y divide-black/[0.06]">
              {upcoming.map((r: any) => <ResRow key={r.id} r={r} />)}
            </ul>
          ) : <p className="text-sm text-black/55">Nic nadcházejícího. Rezervovat jde na stránce podniku.</p>}
          {past.length > 0 && (
            <details className="mt-4">
              <summary className="text-sm text-black/55 cursor-pointer hover:text-black">Dřívější ({past.length})</summary>
              <ul className="divide-y divide-black/[0.06] mt-2">{past.slice(0, 20).map((r: any) => <ResRow key={r.id} r={r} />)}</ul>
            </details>
          )}
        </section>
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">Kupony</h2>
          {open.length ? (
            <ul className="space-y-2">
              {open.map((c: any) => (
                <li key={c.id} className="rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/40 px-4 py-3">
                  <p className="font-semibold leading-tight">{c.title}</p>
                  <p className="text-xs text-black/55">{c.business}</p>
                  <p className="font-mono font-bold tracking-widest text-lg mt-1.5">{c.code}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-black/55">Žádný kupon k uplatnění. Body směníš na stránce podniku.</p>}
        </section>
      </div>

      {d.orders?.length > 0 && (
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">Objednávky</h2>
          <ul className="divide-y divide-black/[0.06]">
            {d.orders.map((o: any) => (
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
  );
}

function ResRow({ r }: { r: any }) {
  const st = RES_STATUS[r.status] ?? RES_STATUS.requested;
  return (
    <li className="py-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold cz-sentence">{czDay(r.date, true)} <span className="text-black/50 font-medium">· {r.time}</span></p>
        <p className="text-sm text-black/55 truncate">{r.business} · {r.party} {r.party === 1 ? 'osoba' : r.party < 5 ? 'osoby' : 'osob'}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.tone === 'ok' ? 'bg-[#C8F542]/25 text-[#3E5406]' : st.tone === 'wait' ? 'bg-amber-500/15 text-amber-800' : 'bg-black/[0.06] text-black/60'}`}>{st.label}</span>
    </li>
  );
}
