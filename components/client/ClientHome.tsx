'use client';

// Vstup pro hosta: co to je, a podniky, ke kterým se dá přidat.
// Hero je zarovnaný vlevo, seznam podniků má dvě nestejné sloupce — jednu
// aplikaci pro víc podniků poznáš právě podle toho, že tu žádný nevládne.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../Icons';
import { Skeleton, EmptyState } from '../ui';
import { hoursLabel } from '@/lib/clientSlots';
import { pragueToday } from '@/lib/pragueTime';

interface Biz { slug: string; name: string; tagline: string; address: string; coverUrl: string; hours: any; member: boolean; members: number; reservationsOn: boolean; orderingOn: boolean; loyaltyOn: boolean }

export default function ClientHome() {
  const [q, setQ] = useState('');
  const [list, setList] = useState<Biz[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [err, setErr] = useState('');
  const today = pragueToday();

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/client/businesses?q=${encodeURIComponent(q)}`).then(r => r.json())
        .then(d => { setList(d.businesses ?? []); setSignedIn(!!d.signedIn); })
        .catch(() => setErr('Seznam podniků se nenačetl. Zkus to za chvíli.'));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const mine = (list ?? []).filter(b => b.member);
  const others = (list ?? []).filter(b => !b.member);

  return (
    <div className="space-y-10 sm:space-y-14">
      <section className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-8 md:gap-12 items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45 mb-3">Pro hosty</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tighter leading-[1.02] text-balance">
            Rezervace, věrnostní karta a objednávka od stolu. Pro podniky, kam chodíš.
          </h1>
          <p className="mt-4 text-base text-black/60 leading-relaxed max-w-[52ch] text-pretty">
            Jeden účet, víc podniků. Přidej se k čajovně nebo kavárně, zarezervuj si stůl, sbírej razítka a body a vyzvedni si odměnu u kasy.
          </p>
          {!signedIn && (
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/client/register" className="tap-target inline-flex items-center gap-2 rounded-full bg-[#C8F542] text-[#16181A] px-5 py-3 text-sm font-semibold hover:brightness-105 active:scale-[0.98] transition">
                <Icon name="plus" size={16} /> Založit účet
              </Link>
              <Link href="/client/login" className="tap-target inline-flex items-center gap-2 rounded-full glass border border-black/10 px-5 py-3 text-sm font-medium hover:bg-black/[0.05] active:scale-[0.98] transition">
                Přihlásit se
              </Link>
            </div>
          )}
        </div>
        <div className="md:justify-self-end w-full md:max-w-xs">
          <label htmlFor="biz-q" className="block text-xs font-semibold text-black/55 mb-1.5">Najít podnik</label>
          <div className="relative">
            <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40" />
            <input id="biz-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Název nebo ulice"
              className="w-full rounded-full bg-white/70 border border-black/[0.08] pl-10 pr-4 py-3 text-sm placeholder-black/35 focus:border-[#C8F542]/60 focus:ring-2 focus:ring-[#C8F542]/25 focus:outline-none transition" />
          </div>
        </div>
      </section>

      {err && <p className="rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm px-4 py-3">{err}</p>}

      {list === null ? (
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4">
          <Skeleton className="h-44 rounded-3xl" /><Skeleton className="h-44 rounded-3xl" />
          <Skeleton className="h-44 rounded-3xl" /><Skeleton className="h-44 rounded-3xl" />
        </div>
      ) : (
        <>
          {mine.length > 0 && <BizList title="Moje podniky" items={mine} today={today} />}
          {others.length > 0
            ? <BizList title={mine.length ? 'Další podniky' : 'Podniky'} items={others} today={today} />
            : mine.length === 0 && (
              <EmptyState icon="location" title={q ? 'Nic takového tu není' : 'Zatím tu není žádný podnik'}
                hint={q ? 'Zkus jiný název nebo ulici.' : 'Podniky se objeví, jakmile si Managero client zapnou.'} />
            )}
        </>
      )}
    </div>
  );
}

function BizList({ title, items, today }: { title: string; items: Biz[]; today: string }) {
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4">
        {items.map((b, i) => (
          <Link key={b.slug} href={`/client/${b.slug}`}
            className={`group relative overflow-hidden rounded-3xl border border-black/[0.06] bg-white/60 hover:bg-white/80 active:scale-[0.99] transition min-h-[11rem] flex flex-col justify-end p-5 ${i % 4 === 1 || i % 4 === 2 ? 'md:col-span-1' : ''}`}
            style={{ animationDelay: `${i * 60}ms` }}>
            {b.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90 group-hover:scale-[1.02] transition-transform duration-500" />
            )}
            {b.coverUrl && <div className="absolute inset-0 bg-gradient-to-t from-[#16181A]/85 via-[#16181A]/25 to-transparent" />}
            <div className={`relative ${b.coverUrl ? 'text-white' : ''}`}>
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                {b.member && <span className="rounded-full bg-[#C8F542] text-[#16181A] px-2.5 py-0.5 text-[11px] font-semibold">Člen</span>}
                <span className={`text-[11px] ${b.coverUrl ? 'text-white/70' : 'text-black/50'}`}>Dnes {hoursLabel(b.hours, today)}</span>
              </div>
              <p className="text-xl font-bold tracking-tight leading-tight">{b.name}</p>
              {b.tagline && <p className={`text-sm mt-1 line-clamp-2 ${b.coverUrl ? 'text-white/80' : 'text-black/60'}`}>{b.tagline}</p>}
              <div className={`mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs ${b.coverUrl ? 'text-white/75' : 'text-black/50'}`}>
                {b.address && <span className="inline-flex items-center gap-1"><Icon name="location" size={13} />{b.address}</span>}
                {b.reservationsOn && <span className="inline-flex items-center gap-1"><Icon name="calendarCheck" size={13} />Rezervace</span>}
                {b.loyaltyOn && <span className="inline-flex items-center gap-1"><Icon name="gift" size={13} />Věrnost</span>}
                {b.orderingOn && <span className="inline-flex items-center gap-1"><Icon name="cup" size={13} />Od stolu</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
