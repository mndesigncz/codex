'use client';

// Moje: nejdřív kartička s QR (to, co host u kasy ukazuje), pak co ještě
// nehodnotil, podniky s razítky a body, nejbližší rezervace, kupony.
// Historie a účet jsou složené, ať stránka na mobilu nezačíná seznamem.

import { useCallback, useEffect, useState } from 'react';
import { Initials } from './ClientShell';
import Link from 'next/link';
import { Icon, LogoMark } from '../Icons';
import { Skeleton, EmptyState } from '../ui';
import { RES_STATUS, tierForMember } from '@/lib/clientSlots';
import { efektivniSleva } from '@/lib/slevy';
import { formatMoney } from '@/lib/money';
import { okJson } from '@/lib/api';
import { ulozKartu } from '@/lib/offlineKarta';
import { pragueDaySafe } from '@/lib/pragueTime';
import UcetHosta from './UcetHosta';
import KartaNastroje from './KartaNastroje';
import KartickyHosta from './KartickyHosta';
import MamPoukaz from './MamPoukaz';
import HostHistorie from './loyalty/HostHistorie';
import HostPoukazy from './loyalty/HostPoukazy';
import { PlatnostKuponu } from './loyalty/HostPlatnost';
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
  // Kolo 8 (R8-7): odpovědi podniků na moje hodnocení (po podnicích, jen ty s odpovědí).
  const [odpovedi, setOdpovedi] = useState<OdpovedPodniku[]>([]);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');
  const load = useCallback(() => fetch('/api/client/me').then(okJson).then(setD).catch(() => setErr(t('Nenačetlo se. Zkus obnovit stránku.'))), [t]);
  useEffect(() => {
    load();
    // Kartička se uloží i do telefonu: bez připojení ji ukáže offline stránka (lib/offlineKarta.ts).
    fetch('/api/client/card').then(okJson).then(x => { const k = x?.code ? x : null; setCard(k); if (k) ulozKartu(k); }).catch(() => setCard(null));
    fetch('/api/client/reviews').then(okJson).then(x => setPending(Array.isArray(x?.pending) ? x.pending : [])).catch(() => {});
  }, [load]);
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(''), 4000); return () => clearTimeout(t); } }, [flash]);
  const slugy = (d?.memberships ?? []).map((m: any) => String(m.slug)).filter(Boolean).slice(0, 8).join(',');
  useEffect(() => {
    if (!slugy) return;
    let zivy = true;
    Promise.all(slugy.split(',').map((slug: string) => fetch(`/api/client/b/${encodeURIComponent(slug)}/reviews`).then(okJson)
      .then(x => (Array.isArray(x?.reviews) ? x.reviews : []).map((v: any) => ({ ...v, slug })))
      .catch(() => [])))
      .then(vse => { if (!zivy) return; const m = new Map((d?.memberships ?? []).map((x: any) => [String(x.slug), String(x.name)])); setOdpovedi(vse.flat().map((v: any) => ({ ...v, business: m.get(v.slug) ?? v.slug }))); });
    return () => { zivy = false; };
  }, [slugy, d?.memberships]);

  if (err) return <p className="note note-danger text-sm px-4 py-3">{err}</p>;
  if (!d) return <div className="space-y-4"><Skeleton className="h-56 rounded-3xl" /><Skeleton className="h-24 rounded-3xl" /><Skeleton className="h-40 rounded-3xl" /></div>;

  const open = (d.claims ?? []).filter((c: any) => !c.redeemed_at);
  const upcoming = (d.reservations ?? []).filter((r: any) => r.date >= d.today && !['cancelled', 'declined', 'done'].includes(r.status));
  const past = (d.reservations ?? []).filter((r: any) => !upcoming.includes(r));
  const orders: any[] = d.orders ?? [];

  return (
    // v3: kartička je hrdina obrazovky (jako karta v peněžence). Na monitoru stojí vlevo a drží se
    // při posouvání, všechno ostatní je ve sloupci vedle; na telefonu jde první a přes šířku.
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] gap-8 md:gap-10 items-start">
      <div className="space-y-5 md:sticky md:top-24">
        <MemberCard name={d.me?.name} card={card} />
        {card?.code && <KartaNastroje karta={card} podniky={(d.memberships ?? []).map((m: any) => ({ slug: m.slug, name: m.name }))} />}
        {/* Plastové karty od podniků (spuštění, balík C): připojené karty a „Mám plastovou kartu“. */}
        <KartickyHosta />
      </div>

      <div className="space-y-8 sm:space-y-10 min-w-0">
      {flash && <p role="status" className="toast-in note note-ok">{flash}</p>}

      {pending.length > 0 && (
        <section aria-labelledby="h-review">
          <h2 id="h-review" className="t-section mb-3">{t('Jak to bylo?')}</h2>
          <ul className="space-y-3">
            {pending.map((p: any) => <ReviewPrompt key={p.ref} p={p} onDone={() => { setPending(x => x.filter(y => y.ref !== p.ref)); setFlash(t('Díky za hodnocení.')); }} />)}
          </ul>
        </section>
      )}

      {odpovedi.length > 0 && (
        <section aria-labelledby="h-odpovedi">
          <h2 id="h-odpovedi" className="t-section mb-3">{t('Odpovědi na tvoje hodnocení')}</h2>
          <ul className="space-y-3">
            {odpovedi.map(o => (
              <li key={`${o.slug}-${o.id}`} className="card p-4 sm:p-5">
                <p className="font-semibold leading-tight">{o.business} <span className="text-black/50 font-medium tabular-nums">· {t('{n} z 5', { n: o.rating })}</span></p>
                {o.note && <p className="text-sm text-black/55 mt-1">„{o.note}“</p>}
                <p className="t-label mt-3">{t('Odpověď podniku')}{o.repliedAt ? ` · ${denCesky(o.repliedAt, jazyk)}` : ''}</p>
                <p className="text-sm mt-1 whitespace-pre-line text-pretty">{o.reply}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="h-biz">
        <h2 id="h-biz" className="t-section mb-3">{t('Moje podniky')}</h2>
        {d.memberships?.length ? (
          <ul className="grid grid-cols-1 gap-3">
            {d.memberships.map((m: any) => (
              <li key={m.slug}>
                <Link href={`/client/${m.slug}`} className="block card active:scale-[0.99] transition p-5">
                  <div className="flex items-start gap-3">
                    <Initials name={m.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="t-card text-[17px] leading-tight truncate">{m.name}</p>
                      {(() => { const lv = tierForMember({ visits: Number(m.visits), spend: Number(m.spend), lastVisitAt: m.lastVisitAt }, m.tiers); const sl = efektivniSleva({ uroven: lv, skupiny: m.groupDiscounts }); return (
                        <p className="text-sm text-black/55 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {lv.id !== 'bronze' && <span className={`chip chip-sm ${lv.id === 'gold' ? 'chip-ok' : 'chip-muted'}`}>{t(lv.label)}</span>}
                          {sl.pct > 0 && <span className="chip chip-sm chip-ink">{sl.zdroj === 'skupina' && sl.nazev ? t('sleva {n} % ({skupina})', { n: sl.pct, skupina: sl.nazev }) : t('sleva {n} %', { n: sl.pct })}</span>}
                          <span>{t('{n, plural, one {# návštěva} few {# návštěvy} other {# návštěv}}', { n: m.visits })}{m.lastVisitAt ? ` · ${t('naposledy {datum}', { datum: denCesky(m.lastVisitAt, jazyk) })}` : ''}</span>
                        </p>
                      ); })()}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[1.75rem] font-bold tracking-[-0.02em] tabular-nums leading-none">{m.points}<span className="stat-jednotka ml-0.5 font-semibold text-black/50">{t('b.')}</span></p>
                      {m.expiring && <p className="mt-1 text-xs font-semibold leading-snug text-wait-ink">{t('{n, plural, one {# bod propadne} few {# body propadnou} other {# bodů propadne}} do {kdy}', { n: m.expiring.points, kdy: denCesky(m.expiring.till, jazyk) })}</p>}
                      {m.credit > 0 && <p className="mt-1 text-sm font-semibold tabular-nums text-ok-ink leading-tight">{t('{castka} kreditu', { castka: formatMoney(m.credit, m.currency) })}</p>}
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
                          {cp.expired && <p role="status" className="mt-1 text-xs font-semibold text-wait-ink">{t('Rozdělaná karta vypršela, {n, plural, one {# razítko propadlo} few {# razítka propadla} other {# razítek propadlo}}. Další razítko začne novou kartu.', { n: cp.expiredStamps })}</p>}
                          {!cp.expired && cp.finishBy && cp.stamps > 0 && <p className="mt-1 text-xs text-wait-ink">{cp.daysLeft === 0 ? t('Dosbírej kartu dnes, jinak razítka propadnou.') : t('Dosbírej kartu do {datum}, jinak razítka propadnou.', { datum: denCesky(cp.finishBy, jazyk) })}</p>}
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

      {(d.poukazy ?? []).length > 0 && <HostPoukazy poukazy={d.poukazy} />}

      {d.memberships?.length > 0 && (
        <section className="max-w-md">
          <MamPoukaz podniky={d.memberships.map((m: any) => ({ slug: m.slug, name: m.name }))} prihlasen onPridano={load} />
        </section>
      )}

      {(upcoming.length > 0 || open.length > 0) && (
        <div className="grid grid-cols-1 gap-8 sm:gap-10 items-start">
          {upcoming.length > 0 && (
            <section aria-labelledby="h-res">
              <h2 id="h-res" className="t-section mb-3">{t('Nadcházející rezervace')}</h2>
              <ul className="card list px-4 sm:px-5">{upcoming.map((r: any) => <ResRow key={r.id} r={r} akce />)}</ul>
            </section>
          )}
          {open.length > 0 && (
            <section aria-labelledby="h-coup">
              {/* Vysvětlení patří pod nadpis, ne pod seznam: zbytek aplikace
                  má všude nadpis + jednu větu, co se tu dělá. Pod seznamem
                  to vypadalo jako osiřelý popisek. */}
              <h2 id="h-coup" className="t-section">{t('Kupony k uplatnění')}</h2>
              <p className="t-meta mt-1 mb-3">{t('Kód ukaž obsluze u kasy.')}</p>
              <ul className="card list px-4 sm:px-5">
                {open.map((c: any) => (
                  <li key={c.id} className="py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold leading-tight truncate">{c.title}</p>
                        <p className="t-meta truncate mt-0.5">{c.business}</p>
                        <PlatnostKuponu validUntil={c.valid_until} today={d.today} className="block text-xs" />
                      </div>
                      <p className="font-mono font-bold tracking-[0.14em] text-lg shrink-0 rounded-[10px] bg-black/[0.05] px-3 py-1.5">{c.code}</p>
                    </div>
                    {/* QR „managero:coupon:<kód>“: obsluha ho načte skenerem místo opisování. Obrázek se stáhne až po rozbalení. */}
                    <details className="mt-2 group/qr">
                      <summary className="tap-target-sm inline-flex items-center gap-1.5 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none">
                        <Icon name="chevron" size={15} className="transition-transform group-open/qr:rotate-180" />{t('Ukázat QR kód')}
                      </summary>
                      <div className="mt-2 rounded-2xl bg-white border border-black/[0.07] p-3 w-44 h-44 mx-auto">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/client/coupons/${c.id}/qr`} alt={t('QR kód kuponu {kod}', { kod: c.code })} loading="lazy" className="w-full h-full" />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {card?.code && <InviteCard code={card.code} onFlash={setFlash} />}

      {d.memberships?.length > 0 && <HostHistorie showBusiness />}

      {(past.length > 0 || orders.length > 0) && (
        <details className="group">
          <summary className="tap-target-sm inline-flex items-center gap-2 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none">
            <Icon name="chevron" size={16} className="transition-transform group-open:rotate-180" />{t('Historie ({n})', { n: past.length + orders.length })}
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-8 items-start">
            {past.length > 0 && (
              <section>
                <h3 className="t-card mb-1">{t('Dřívější rezervace')}</h3>
                <ul className="list">{past.slice(0, 20).map((r: any) => <ResRow key={r.id} r={r} />)}</ul>
              </section>
            )}
            {orders.length > 0 && (
              <section>
                <h3 className="t-card mb-1">{t('Objednávky od stolu')}</h3>
                <ul className="list">
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
      <UcetHosta novinky={d.me?.novinky === true} novinkyEmail={d.me?.novinkyEmail !== false} onFlash={setFlash} />
      </div>
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
      <h2 id="h-invite" className="t-section">{t('Pozvi kamaráda')}</h2>
      <p className="mt-1 text-sm text-black/60 max-w-[52ch] text-pretty">{t('Pošli mu odkaz. Když se přidá do podniku, kde jsi členem, dostanete oba body — pokud to podnik ve věrnosti zapnul.')}</p>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="font-mono tracking-[0.14em] font-bold text-sm rounded-[10px] bg-black/[0.05] px-3 py-2">{code}</span>
        <button type="button" onClick={copy} className="tap-target btn btn-secondary btn-sm"><Icon name="copy" size={15} /> {t('Kopírovat odkaz')}</button>
        <button type="button" onClick={share} className="tap-target w-full sm:w-auto btn btn-primary"><Icon name="send" size={15} /> {t('Sdílet')}</button>
      </div>
    </section>
  );
}

/**
 * Kartička: hrdina stránky Moje, podoba karty v peněžence. Tmavá plocha, značka nahoře,
 * velký QR na bílém poli uprostřed, pod ním jméno a kód (kód i textem, kdyby čtečka selhala).
 * Popisek „Managero client" větou — verzálky s prostrkáním v3 nepoužívá.
 */
function MemberCard({ name, card }: { name: string; card: any | null }) {
  const t = useT('klient-host');
  return (
    <div>
      <section aria-label={t('Kartička')} className="rounded-[28px] bg-[#16181A] text-white p-5 sm:p-6 shadow-[shadow:var(--shadow-float)]">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <LogoMark size={26} />
            <span className="text-[15px] font-semibold tracking-[-0.01em] truncate">Managero <span className="text-white/55 font-medium">client</span></span>
          </span>
          <span className="text-[13px] font-medium text-white/55 shrink-0">{t('Kartička')}</span>
        </div>
        {/* Když QR nedorazí, nesmí tu zůstat šedý obdélník donekonečna —
            host stojí u kasy a potřebuje ukázat aspoň něco. Kód funguje
            i bez čtečky, tak ho v tom případě ukážeme velký místo QR. */}
        <div className="mt-5 mx-auto w-full max-w-[17rem] aspect-square rounded-[22px] bg-white p-4 grid place-items-center [&_svg]:w-full [&_svg]:h-full">
          {card?.svg
            ? <span dangerouslySetInnerHTML={{ __html: card.svg }} className="block w-full h-full" aria-hidden />
            : card?.code
            ? <p className="font-mono text-xl font-bold tracking-[0.12em] text-[#16181A] text-center break-all px-1">{card.code}</p>
            : card === null
            ? <p className="text-sm text-black/55 text-center px-2">{t('QR se nenačetlo.')}<br />{t('Řekni obsluze kód nahoře.')}</p>
            : <Skeleton className="w-full h-full rounded-xl" />}
        </div>
        <div className="mt-5">
          <h1 className="text-[1.5rem] font-bold tracking-[-0.025em] leading-tight break-words">{name}</h1>
          {card ? (
            <p className="mt-1 font-mono text-[15px] font-semibold tracking-[0.14em] text-white/75">{card.code}</p>
          ) : card === null ? <p className="mt-1 text-sm text-white/60">{t('Kartička se nenačetla.')}</p> : <Skeleton className="mt-1.5 h-5 w-36 rounded-md bg-white/10" />}
        </div>
      </section>
      <p className="mt-3 t-meta text-center text-pretty px-2">{t('Ukaž u kasy. Obsluha načte kód a přidá razítko za návštěvu nebo body za útratu. Jedna kartička pro všechny podniky.')}</p>
    </div>
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

/** Odpověď podniku na moje hodnocení (GET /api/client/b/[slug]/reviews). */
interface OdpovedPodniku { id: number; slug: string; business: string; rating: number; note: string | null; reply: string; repliedAt: string | null }

/** Řádek rezervace; `akce` u nadcházející vede na stránku podniku, kde ji host potvrdí nebo zruší (kolo 8, R8-7). */
function ResRow({ r, akce = false }: { r: any; akce?: boolean }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const st = RES_STATUS[r.status] ?? RES_STATUS.requested;
  const ziva = akce && r.slug && ['requested', 'confirmed'].includes(String(r.status));
  return (
    <li className="py-3.5 flex items-start gap-3 flex-wrap">
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-semibold cz-sentence">{fmtDatum(r.date, { jazyk, styl: 'denDlouze' })} <span className="text-black/50 font-medium">· {r.time}</span></p>
        <p className="text-sm text-black/55 truncate">{r.business} · {t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: r.party })}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        <span className={`chip chip-sm shrink-0 ${st.tone === 'ok' ? 'chip-ok' : st.tone === 'wait' ? 'chip-wait' : 'chip-muted'}`}>{st.tone === 'ok' && <Icon name="check" size={11} />}{t(st.label)}</span>
        {ziva && (
          <Link href={`/client/${encodeURIComponent(String(r.slug))}?tab=reserve&rezervace=${r.id}`} className="tap-target inline-flex items-center gap-1 text-[13px] font-semibold text-black/65 hover:text-black transition">
            {t('Potvrdit nebo zrušit')}<Icon name="chevronRight" size={14} />
          </Link>
        )}
      </div>
    </li>
  );
}
