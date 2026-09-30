'use client';

// Moje: nejdřív kartička s QR (to, co host u kasy ukazuje), pak co ještě
// nehodnotil, podniky s razítky a body, nejbližší rezervace, kupony.
// Historie a účet jsou složené, ať stránka na mobilu nezačíná seznamem.

import { useCallback, useEffect, useState } from 'react';
import { Initials } from './ClientShell';
import Link from 'next/link';
import { Icon } from '../Icons';
import { Skeleton, EmptyState } from '../ui';
import { RES_STATUS, tierFor } from '@/lib/clientSlots';
import { formatMoney } from '@/lib/money';
import { okJson } from '@/lib/api';
import { pragueDaySafe } from '@/lib/pragueTime';
import UcetHosta from './UcetHosta';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import type { Jazyk } from '@/lib/i18n/config';

/** Datum z databáze v jazyce hosta („11. 2. 2026“) — přes pražský den, ne místní zónu telefonu hosta. */
function denCesky(v: unknown, jazyk: Jazyk): string {
  const d = pragueDaySafe(v);
  return d ? fmtDatum(d, { jazyk, styl: 'cislo' }) : '';
}

const input = 'field !py-2.5 text-sm';
const label = 'field-label';

export default function MyPage() {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const [d, setD] = useState<any | null>(null);
  const [card, setCard] = useState<any | null>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');
  const load = useCallback(() => fetch('/api/client/me').then(okJson).then(setD).catch(() => setErr(t('Nenačetlo se. Zkus obnovit stránku.'))), [t]);
  useEffect(() => {
    load();
    fetch('/api/client/card').then(okJson).then(x => setCard(x?.code ? x : null)).catch(() => setCard(null));
    fetch('/api/client/reviews').then(okJson).then(x => setPending(Array.isArray(x?.pending) ? x.pending : [])).catch(() => {});
  }, [load]);
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(''), 4000); return () => clearTimeout(t); } }, [flash]);

  if (err) return <p className="note note-danger text-sm px-4 py-3">{err}</p>;
  if (!d) return <div className="space-y-4"><Skeleton className="h-56 rounded-3xl" /><Skeleton className="h-24 rounded-3xl" /><Skeleton className="h-40 rounded-3xl" /></div>;

  const open = (d.claims ?? []).filter((c: any) => !c.redeemed_at);
  const upcoming = (d.reservations ?? []).filter((r: any) => r.date >= d.today && !['cancelled', 'declined', 'done'].includes(r.status));
  const past = (d.reservations ?? []).filter((r: any) => !upcoming.includes(r));
  const orders: any[] = d.orders ?? [];

  return (
    <div className="space-y-8 sm:space-y-10">
      <MemberCard name={d.me?.name} card={card} />

      {flash && <p role="status" className="toast-in rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/40 text-[#3E5406] text-sm px-4 py-3">{flash}</p>}

      {pending.length > 0 && (
        <section aria-labelledby="h-review">
          <h2 id="h-review" className="text-lg font-bold tracking-tight mb-3">{t('Jak to bylo?')}</h2>
          <ul className="space-y-3">
            {pending.map((p: any) => <ReviewPrompt key={p.ref} p={p} onDone={() => { setPending(x => x.filter(y => y.ref !== p.ref)); setFlash(t('Díky za hodnocení.')); }} />)}
          </ul>
        </section>
      )}

      <section aria-labelledby="h-biz">
        <h2 id="h-biz" className="text-lg font-bold tracking-tight mb-3">{t('Moje podniky')}</h2>
        {d.memberships?.length ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {d.memberships.map((m: any) => (
              <li key={m.slug}>
                <Link href={`/client/${m.slug}`} className="block card active:scale-[0.99] transition p-5">
                  <div className="flex items-start gap-3">
                    <Initials name={m.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-bold tracking-tight leading-tight truncate">{m.name}</p>
                      {(() => { const lv = tierFor(Number(m.visits), m.tiers); return (
                        <p className="text-sm text-black/55 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {lv.id !== 'bronze' && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${lv.id === 'gold' ? 'bg-[#C8F542]/30 text-[#3E5406]' : 'bg-black/[0.07] text-black/60'}`}>{t(lv.label)}</span>}
                          {lv.discount > 0 && <span className="rounded-full bg-[#16181A] text-[#C8F542] px-2 py-0.5 text-[11px] font-bold">{t('sleva {n} %', { n: lv.discount })}</span>}
                          <span>{t('{n, plural, one {# návštěva} few {# návštěvy} other {# návštěv}}', { n: m.visits })}{m.lastVisitAt ? ` · ${t('naposledy {datum}', { datum: denCesky(m.lastVisitAt, jazyk) })}` : ''}</span>
                        </p>
                      ); })()}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xl font-bold tabular-nums leading-tight">{m.points} <span className="text-sm font-medium text-black/50">{t('b.')}</span></p>
                      {m.credit > 0 && <p className="text-sm font-semibold tabular-nums text-[#5B7A08] leading-tight">{t('{castka} kreditu', { castka: formatMoney(m.credit, m.currency) })}</p>}
                    </div>
                  </div>
                  {(m.campaigns ?? []).length > 0 ? (
                    <div className="mt-3 space-y-2.5">
                      {m.campaigns.map((cp: any) => (
                        <div key={cp.id}>
                          <div className="flex gap-1" aria-label={t('{name}: {stamps} z {required} razítek', { name: cp.name, stamps: cp.stamps, required: cp.required })}>
                            {Array.from({ length: Math.min(cp.required, 12) }).map((_, i) => <span key={i} className={`h-2 flex-1 rounded-full ${i < cp.stamps ? 'bg-[#C8F542]' : 'bg-black/[0.08]'}`} />)}
                          </div>
                          <p className="text-xs text-black/55 mt-1.5 tabular-nums">{cp.name} · {cp.stamps}/{cp.required}{cp.reward ? ` · ${cp.reward}` : ''}</p>
                        </div>
                      ))}
                    </div>
                  ) : m.stampTarget > 0 && (
                    <div className="mt-3">
                      <div className="flex gap-1" aria-label={t('{stamps} z {target} razítek', { stamps: m.stamps, target: m.stampTarget })}>
                        {Array.from({ length: Math.min(m.stampTarget, 12) }).map((_, i) => <span key={i} className={`h-2 flex-1 rounded-full ${i < m.stamps ? 'bg-[#C8F542]' : 'bg-black/[0.08]'}`} />)}
                      </div>
                      <p className="text-xs text-black/55 mt-1.5 tabular-nums">{t('{stamps}/{target} razítek', { stamps: m.stamps, target: m.stampTarget })}{m.stampReward ? ` · ${t('za plnou kartu {reward}', { reward: m.stampReward })}` : ''}</p>
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="location" title={t('Zatím nejsi členem žádného podniku')} hint={t('Vyber si podnik a přidej se. První body dostaneš hned.')}
            action={<Link href="/client" className="tap-target inline-flex items-center gap-2 btn btn-accent hover:brightness-105 transition">{t('Vybrat podnik')}</Link>} />
        )}
      </section>

      {(upcoming.length > 0 || open.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 items-start">
          {upcoming.length > 0 && (
            <section aria-labelledby="h-res">
              <h2 id="h-res" className="text-lg font-bold tracking-tight mb-3">{t('Nadcházející rezervace')}</h2>
              <ul className="divide-y divide-black/[0.06]">{upcoming.map((r: any) => <ResRow key={r.id} r={r} />)}</ul>
            </section>
          )}
          {open.length > 0 && (
            <section aria-labelledby="h-coup">
              {/* Vysvětlení patří pod nadpis, ne pod seznam: zbytek aplikace
                  má všude nadpis + jednu větu, co se tu dělá. Pod seznamem
                  to vypadalo jako osiřelý popisek. */}
              <h2 id="h-coup" className="text-lg font-bold tracking-tight">{t('Kupony k uplatnění')}</h2>
              <p className="text-sm text-black/55 mt-1 mb-3">{t('Kód ukaž obsluze u kasy.')}</p>
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
            </section>
          )}
        </div>
      )}

      {card?.code && <InviteCard code={card.code} onFlash={setFlash} />}

      {(past.length > 0 || orders.length > 0) && (
        <details className="group">
          <summary className="tap-target-sm inline-flex items-center gap-2 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none">
            <Icon name="chevron" size={16} className="transition-transform group-open:rotate-180" />{t('Historie ({n})', { n: past.length + orders.length })}
          </summary>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            {past.length > 0 && (
              <section>
                <h3 className="text-sm font-bold tracking-tight mb-2">{t('Dřívější rezervace')}</h3>
                <ul className="divide-y divide-black/[0.06]">{past.slice(0, 20).map((r: any) => <ResRow key={r.id} r={r} />)}</ul>
              </section>
            )}
            {orders.length > 0 && (
              <section>
                <h3 className="text-sm font-bold tracking-tight mb-2">{t('Objednávky od stolu')}</h3>
                <ul className="divide-y divide-black/[0.06]">
                  {orders.slice(0, 20).map((o: any) => (
                    <li key={o.id} className="py-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{o.business}</p>
                        <p className="text-sm text-black/55 truncate">{(o.items ?? []).map((i: any) => `${i.count}× ${i.name}`).join(', ')}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold tabular-nums">{formatMoney(o.total, o.currency)}</p>
                        <p className="text-xs text-black/50">{o.status === 'new' ? t('čeká') : o.status === 'confirmed' ? t('připravuje se') : o.status === 'done' ? t('hotovo') : t('nepřijato')}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </details>
      )}

      <ProfileForm me={d.me} onSaved={(me: any) => { setD({ ...d, me }); setFlash(t('Uloženo.')); }} />
      <UcetHosta novinky={d.me?.novinky === true} onFlash={setFlash} />
    </div>
  );
}

/**
 * Pozvi kamaráda: odkaz s kódem kartičky. Kamarád se zaregistruje přes odkaz
 * a při prvním členství ve společném podniku dostanete oba body — pokud to
 * podnik ve věrnosti zapnul.
 */
function InviteCard({ code, onFlash }: { code: string; onFlash: (m: string) => void }) {
  const t = useT('klient-host');
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/client/register?ref=${encodeURIComponent(code)}`;
  const copy = () => { navigator.clipboard?.writeText(link).then(() => onFlash(t('Odkaz s pozvánkou zkopírován.'))).catch(() => {}); };
  const share = () => {
    if (navigator.share) navigator.share({ title: 'Managero client', text: t('Přidej se přes můj kód, dostaneme oba body.'), url: link }).catch(() => {});
    else copy();
  };
  return (
    <section aria-labelledby="h-invite" className="card p-4 sm:p-5">
      <h2 id="h-invite" className="text-lg font-bold tracking-tight">{t('Pozvi kamaráda')}</h2>
      <p className="mt-1 text-sm text-black/60 max-w-[52ch] text-pretty">{t('Pošli mu odkaz. Když se přidá do podniku, kde jsi členem, dostanete oba body — pokud to podnik ve věrnosti zapnul.')}</p>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="font-mono tracking-[0.2em] font-bold text-sm rounded-xl bg-black/[0.05] px-3 py-2">{code}</span>
        <button type="button" onClick={copy} className="tap-target-sm inline-flex items-center gap-1.5 btn btn-secondary btn-sm hover:bg-black/[0.05] active:scale-[0.98] transition"><Icon name="copy" size={15} /> {t('Kopírovat odkaz')}</button>
        <button type="button" onClick={share} className="tap-target-sm w-full sm:w-auto justify-center inline-flex items-center gap-1.5 btn btn-primary active:scale-[0.98] transition"><Icon name="send" size={15} /> {t('Sdílet')}</button>
      </div>
    </section>
  );
}

/** Kartička: tmavá, s QR. Kód i textem, kdyby čtečka selhala. */
function MemberCard({ name, card }: { name: string; card: any | null }) {
  const t = useT('klient-host');
  return (
    <section aria-label={t('Kartička')} className="rounded-3xl bg-[#16181A] text-white p-5 sm:p-7 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 items-center">
      <div className="min-w-0 order-2 sm:order-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C8F542] mb-2">Managero client</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tighter leading-[1.05] break-words">{name}</h1>
        {card ? (
          <p className="mt-3 font-mono text-lg sm:text-xl font-bold tracking-[0.2em] text-white/90">{card.code}</p>
        ) : card === null ? <p className="mt-3 text-sm text-white/60">{t('Kartička se nenačetla.')}</p> : <Skeleton className="mt-3 h-7 w-40 rounded-lg bg-white/10" />}
        <p className="mt-3 text-sm text-white/60 max-w-[34ch] text-pretty">{t('Ukaž u kasy. Obsluha načte kód a přidá razítko za návštěvu nebo body za útratu. Jedna kartička pro všechny podniky.')}</p>
      </div>
      <div className="order-1 sm:order-2 justify-self-center sm:justify-self-end">
        {/* Když QR nedorazí, nesmí tu zůstat šedý obdélník donekonečna —
            host stojí u kasy a potřebuje ukázat aspoň něco. Kód funguje
            i bez čtečky, tak ho v tom případě ukážeme velký místo QR. */}
        <div className="rounded-2xl bg-white p-3 w-40 h-40 sm:w-44 sm:h-44 grid place-items-center [&_svg]:w-full [&_svg]:h-full">
          {card?.svg
            ? <span dangerouslySetInnerHTML={{ __html: card.svg }} className="block w-full h-full" aria-hidden />
            : card?.code
            ? <p className="font-mono text-base font-bold tracking-[0.12em] text-[#16181A] text-center break-all px-1">{card.code}</p>
            : card === null
            ? <p className="text-xs text-black/45 text-center px-2">{t('QR se nenačetlo.')}<br />{t('Řekni obsluze kód nahoře.')}</p>
            : <Skeleton className="w-full h-full rounded-lg" />}
        </div>
      </div>
    </section>
  );
}

function ReviewPrompt({ p, onDone }: { p: any; onDone: () => void }) {
  const t = useT('klient-host');
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    if (!rating) { setErr(t('Vyber hvězdičky.')); return; }
    setBusy(true); setErr('');
    const r = await fetch('/api/client/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: p.ref, rating, note }) });
    const x = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(x.error ? t(x.error) : t('Nepovedlo se.')); return; }
    onDone();
  };
  return (
    <li className="card p-4 sm:p-5">
      <p className="font-semibold leading-tight">{p.business} <span className="text-black/50 font-medium">· {p.kind === 'order' ? t('objednávka od stolu') : t('rezervace')}</span></p>
      <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label={t('Hodnocení')}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t('{n} z 5', { n })} onClick={() => setRating(n)}
            className={`tap-target-sm h-10 w-10 rounded-full grid place-items-center transition ${n <= rating ? 'text-[#16181A]' : 'text-black/20 hover:text-black/40'}`}><Icon name="star" size={24} /></button>
        ))}
      </div>
      <div className="mt-2 flex gap-2 flex-wrap">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder={t('Pár slov, když chceš')} aria-label={t('Poznámka k hodnocení')} className={`${input} flex-1 basis-48`} maxLength={500} />
        <button type="button" onClick={send} disabled={busy} className="tap-target inline-flex items-center gap-2 btn btn-primary active:scale-[0.98] disabled:opacity-50 transition">{busy ? '…' : t('Odeslat')}</button>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-bad-ink">{err}</p>}
    </li>
  );
}

function ProfileForm({ me, onSaved }: { me: any; onSaved: (me: any) => void }) {
  const t = useT('klient-host');
  const [f, setF] = useState({ name: me?.name ?? '', phone: me?.phone ?? '', birthday: me?.birthday ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await fetch('/api/client/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const x = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(x.error ? t(x.error) : t('Nepovedlo se.')); return; }
    onSaved(x.me);
  };
  return (
    <details className="group">
      <summary className="tap-target-sm inline-flex items-center gap-2 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none">
        <Icon name="chevron" size={16} className="transition-transform group-open:rotate-180" />{t('Účet')}
      </summary>
      <form onSubmit={save} className="mt-3 card p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end max-w-2xl">
        <div><label htmlFor="pf-name" className={label}>{t('Jméno')}</label><input id="pf-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={input} required /></div>
        <div><label htmlFor="pf-phone" className={label}>{t('Telefon')}</label><input id="pf-phone" type="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder={t('Pro potvrzení rezervace')} className={input} /></div>
        <div><label htmlFor="pf-bday" className={label}>{t('Narozeniny')}</label><input id="pf-bday" type="date" value={f.birthday} onChange={e => setF({ ...f, birthday: e.target.value })} className={input} /></div>
        <p className="sm:col-span-2 text-xs text-black/50">{t('E-mail: {email}. Narozeniny vidí jen podniky, kde jsi členem, kvůli přání a odměně.', { email: me?.email ?? '' })}</p>
        <button type="submit" disabled={busy} className="tap-target w-full sm:w-auto justify-center sm:justify-self-end inline-flex items-center gap-2 btn btn-primary active:scale-[0.98] disabled:opacity-50 transition">{busy ? '…' : t('Uložit')}</button>
        {err && <p role="alert" className="sm:col-span-3 text-sm text-bad-ink">{err}</p>}
      </form>
    </details>
  );
}

function ResRow({ r }: { r: any }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const st = RES_STATUS[r.status] ?? RES_STATUS.requested;
  return (
    <li className="py-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold cz-sentence">{fmtDatum(r.date, { jazyk, styl: 'denDlouze' })} <span className="text-black/50 font-medium">· {r.time}</span></p>
        <p className="text-sm text-black/55 truncate">{r.business} · {t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: r.party })}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.tone === 'ok' ? 'bg-[#C8F542]/25 text-[#3E5406]' : st.tone === 'wait' ? 'bg-wait/15 text-wait-ink' : 'bg-black/[0.06] text-black/60'}`}>{t(st.label)}</span>
    </li>
  );
}
