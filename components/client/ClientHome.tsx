'use client';

// Vstup pro hosta: co to je, a podniky, ke kterým se dá přidat.
// Hero je zarovnaný vlevo, seznam podniků má dvě nestejné sloupce — jednu
// aplikaci pro víc podniků poznáš právě podle toho, že tu žádný nevládne.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../Icons';
import { Skeleton, EmptyState } from '../ui';
import { Initials } from './ClientShell';
import { hoursLabel } from '@/lib/clientSlots';
import { pragueToday } from '@/lib/pragueTime';
import { okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';

interface Biz { slug: string; name: string; tagline: string; address: string; coverUrl: string; hours: any; member: boolean; members: number; reservationsOn: boolean; orderingOn: boolean; loyaltyOn: boolean }

export default function ClientHome() {
  const t = useT('klient-host');
  const [q, setQ] = useState('');
  const [list, setList] = useState<Biz[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [err, setErr] = useState('');
  const today = pragueToday();

  useEffect(() => {
    const casovac = setTimeout(() => {
      fetch(`/api/client/businesses?q=${encodeURIComponent(q)}`).then(okJson)
        .then(d => { setList(d.businesses ?? []); setSignedIn(!!d.signedIn); })
        .catch(() => setErr(t('Seznam podniků se nenačetl. Zkus to za chvíli.')));
    }, q ? 250 : 0);
    return () => clearTimeout(casovac);
  }, [q]);

  const mine = (list ?? []).filter(b => b.member);
  const others = (list ?? []).filter(b => !b.member);

  return (
    <div className="space-y-10 sm:space-y-14">
      <section className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-8 md:gap-12 items-end">
        <div>
          {/* v3: štítek větou (ne verzálky s prostrkáním), nadpis ze škály — t-page, na monitoru o stupeň větší. */}
          <p className="t-label mb-2">{t('Pro hosty')}</p>
          <h1 className="t-page sm:text-[2.5rem] md:text-[3rem] md:leading-[1.02] text-balance">
            {t('Karta, rezervace a objednávka od stolu.')}
          </h1>
          <p className="mt-3 text-[15px] sm:text-base text-black/60 leading-relaxed max-w-[44ch] text-pretty">
            {t('Jeden účet pro všechny podniky, kam chodíš. Razítka a body sbíráš u kasy.')}
          </p>
          {!signedIn && (
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/client/register" className="tap-target inline-flex items-center gap-2 btn btn-accent btn-lg max-sm:flex-1">
                <Icon name="plus" size={16} /> {t('Založit účet')}
              </Link>
              <Link href="/client/login" className="tap-target inline-flex items-center gap-2 btn btn-secondary btn-lg max-sm:flex-1">
                {t('Přihlásit se')}
              </Link>
            </div>
          )}
          {!signedIn && (
            <p className="mt-4 text-sm text-black/60">
              {t('Chceš to nejdřív vidět?')}{' '}
              <Link href="/client/demo" className="tap-target-sm font-semibold text-black/80 underline underline-offset-2">{t('Projdi si ukázku bez účtu')}</Link>
            </p>
          )}
        </div>
        <div className="md:justify-self-end w-full md:max-w-xs space-y-5">
          <div>
            <label htmlFor="biz-q" className="field-label">{t('Najít podnik')}</label>
            {/* Jedna podoba pole pro celou aplikaci (.field: šedá jamka, při psaní zbělá). */}
            <div className="relative">
              <Icon name="search" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black/45" />
              <input id="biz-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('Název nebo ulice')}
                className="field !pl-10" />
            </div>
          </div>
          {/* Co tu host dostane: seznam v jedné kartě, ikony monochromně v šedém kruhu (limetka patří akci). */}
          <ul className="card list px-4">
            {([['card', t('Karta s QR'), t('ukážeš u kasy, obsluha přidá razítko nebo body')], ['calendarCheck', t('Rezervace'), t('stůl na den a hodinu, potvrzení přijde do telefonu')], ['cup', t('Objednávka od stolu'), t('naskenuješ QR na stole, jde rovnou do kasy')]] as const).map(([ic, nadpis, h]) => (
              <li key={nadpis} className="list-row">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/[0.05] text-black/70" aria-hidden><Icon name={ic} size={18} /></span>
                <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium leading-tight">{nadpis}</span><span className="block t-meta mt-0.5 leading-snug">{h}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {err && <p className="note note-danger text-sm px-4 py-3">{err}</p>}

      {list === null ? (
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4">
          <Skeleton className="h-44 rounded-3xl" /><Skeleton className="h-44 rounded-3xl" />
          <Skeleton className="h-44 rounded-3xl" /><Skeleton className="h-44 rounded-3xl" />
        </div>
      ) : (
        <>
          {mine.length > 0 && <BizList title={t('Moje podniky')} items={mine} today={today} />}
          {others.length > 0
            ? <BizList title={mine.length ? t('Další podniky') : t('Podniky')} items={others} today={today} />
            : mine.length === 0 && (
              <EmptyState icon="location" title={q ? t('Nic takového tu není') : t('Zatím tu není žádný podnik')}
                hint={q ? t('Zkus jiný název nebo ulici.') : t('Podniky se objeví, jakmile si Managero client zapnou.')} />
            )}
        </>
      )}
    </div>
  );
}

function BizList({ title, items, today }: { title: string; items: Biz[]; today: string }) {
  const t = useT('klient-host');
  return (
    <section>
      <h2 className="t-section mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4">
        {items.map((b, i) => (
          <Link key={b.slug} href={`/client/${b.slug}`}
            className={`group relative overflow-hidden rounded-3xl ${b.coverUrl ? 'bg-[#16181A] border border-black/[0.06]' : 'card'} active:scale-[0.99] transition min-h-[11rem] flex flex-col justify-end p-5`}
            style={{ animationDelay: `${i * 60}ms` }}>
            {b.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90 group-hover:scale-[1.02] transition-transform duration-500" />
            )}
            {b.coverUrl && <div className="absolute inset-0 bg-gradient-to-t from-[#16181A]/85 via-[#16181A]/25 to-transparent" />}
            <div className={`relative ${b.coverUrl ? 'text-white' : ''}`}>
              <div className="flex items-start gap-3">
                {!b.coverUrl && <Initials name={b.name} size={44} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {b.member && <span className={`chip chip-sm ${b.coverUrl ? 'bg-white text-[#16181A]' : 'chip-ink'}`}><Icon name="check" size={11} />{t('Člen')}</span>}
                    <span className={`text-xs inline-flex items-center gap-1 ${b.coverUrl ? 'text-white/75' : 'text-black/55'}`}><Icon name="clock" size={12} />{t('Dnes {hodiny}', { hodiny: hoursLabel(b.hours, today, cs => t(cs)) })}</span>
                    {b.members > 0 && <span className={`text-xs inline-flex items-center gap-1 ${b.coverUrl ? 'text-white/75' : 'text-black/55'}`}><Icon name="users" size={12} />{b.members}</span>}
                  </div>
                  <p className="text-xl font-bold tracking-[-0.02em] leading-tight">{b.name}</p>
                  {b.tagline && <p className={`text-sm mt-1 line-clamp-2 ${b.coverUrl ? 'text-white/80' : 'text-black/60'}`}>{b.tagline}</p>}
                </div>
              </div>
              <div className={`mt-3 flex flex-wrap gap-1.5 text-xs`}>
                {b.address && <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 min-w-0 max-w-full ${b.coverUrl ? 'bg-white/15 text-white/90' : 'bg-black/[0.05] text-black/65'}`}><Icon name="location" size={12} className="shrink-0" /><span className="min-w-0 break-words">{b.address}</span></span>}
                {b.reservationsOn && <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${b.coverUrl ? 'bg-white/15 text-white/90' : 'bg-black/[0.05] text-black/65'}`}><Icon name="calendarCheck" size={12} />{t('Rezervace')}</span>}
                {b.loyaltyOn && <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${b.coverUrl ? 'bg-white/15 text-white/90' : 'bg-black/[0.05] text-black/65'}`}><Icon name="gift" size={12} />{t('Věrnost')}</span>}
                {b.orderingOn && <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${b.coverUrl ? 'bg-white/15 text-white/90' : 'bg-black/[0.05] text-black/65'}`}><Icon name="cup" size={12} />{t('Od stolu')}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
