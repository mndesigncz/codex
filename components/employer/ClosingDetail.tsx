'use client';

// Celá uzávěrka na jedné obrazovce.
//
// Do uzávěrky se toho vyplňuje hodně — peníze, pohyby v kase, bankovky, důvod
// rozdílu, předávka další směně, kdo na směně byl. V seznamu se z toho dá
// ukázat jen shrnutí, protože uzávěrek jsou na obrazovce desítky. Když si ale
// vedení jednu rozklikne, chce vidět všechno, a k tomu i to, co uzávěrka sama
// neobsahuje, ale patří ke stejnému dni: co říká pokladna, kdo byl doopravdy
// odpíchnutý, jaké postupy proběhly, jaké účtenky přibyly.
//
// Nic se tu neschovává za „zobrazit více". Když člověk něco vyplnil, musí to
// být vidět — i kdyby to bylo jen proto, aby poznal, že to vyplňovat nemusel.

import { useEffect, useState, useCallback } from 'react';
import { Icon } from '../Icons';
import { PersonLink } from './ProfileLinkProvider';
import { useMoney } from '../CurrencyProvider';
import {
  Closing, expectedCash, expectedCashLines, cashDifference, cashLeft,
  movementLabel, diffReasonLabel, hasDenominations, MOVEMENT_KINDS,
} from '@/lib/closing';
import { dbTimeHM, dbTimeDayHM } from '@/lib/pragueTime';

type Person = { id: number; name: string; avatar?: string | null };

interface Detail {
  closing: Closing & {
    approved?: boolean; covered_by?: number | null; approvedByName?: string | null;
    approved_by?: number | null; review_note?: string | null; shift_date?: string | null;
    event_title?: string | null; tips_card?: number | null;
  };
  crew: Person[];
  covered: { id: number; employeeId: number; name: string | null; avatar: string | null; selfPayout: number }[];
  planned: { employee: Person | null; startTime: string; endTime: string; type: string; autoCreated: boolean }[];
  attendance: { id: number; employee: Person | null; clockIn: string; clockOut: string | null; source: string | null; note: string | null; minutes: number | null }[];
  procedures: { id: number; name: string; employee: Person | null; status: string; completedAt: string | null; durationSeconds: number | null; done: number; total: number; required: boolean }[];
  missingProcedures: string[];
  tasks: { id: number; title: string; employee: Person | null; completedAt: string | null; priority: string }[];
  receipts: { id: number; employee: Person | null; photoUrl: string | null; supplier: string | null; amount: number; note: string | null; createdAt: string }[];
  pos: null | {
    bills: number; total: number; cash: number; card: number; other: number;
    tips: number; tipsCash: number; tipsCard: number; tipsOther: number;
    siblingClosings: number; dayCash: number; dayCard: number; diffCash: number; diffCard: number;
  };
  products: { name: string | null; qty: number }[];
  notes: string[];
  day: string;
}

const hhmm = dbTimeHM;
const dayTime = dbTimeDayHM;

const hours = (min: number | null) =>
  min == null ? '—' : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;

/** Nadpis oddílu. Ploché — žádná karta v kartě v kartě. */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="pt-5 first:pt-0">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-black/40 mb-2.5">{title}</h3>
      {hint && <p className="text-xs text-black/45 -mt-1.5 mb-2.5">{hint}</p>}
      {children}
    </section>
  );
}

/** Řádek štítek → hodnota, zarovnaný na desetinné čárce. */
function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'plus' | 'minus' | 'strong' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[13px] text-black/50 min-w-0">{label}</span>
      <span className={`shrink-0 whitespace-nowrap tabular-nums text-sm ${
        tone === 'strong' ? 'font-bold text-[#16181A]'
          : tone === 'plus' ? 'font-semibold text-[#5B7A08]'
          : tone === 'minus' ? 'font-semibold text-red-600'
          : 'font-semibold text-[#16181A]'}`}>{value}</span>
    </div>
  );
}

export default function ClosingDetail({ id, onClose, onChanged, payDailyCash }: {
  id: number; onClose: () => void; onChanged?: () => void; payDailyCash?: boolean;
}) {
  const money = useMoney();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/closings/${id}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? 'Detail se nepodařilo načíst.');
        return;
      }
      setD(await res.json());
    } catch {
      setErr('Detail se nepodařilo načíst — zkontroluj připojení.');
    }
  }, [id]);

  const c = d?.closing;
  const diff = c ? cashDifference(c) : 0;
  const lines = c ? expectedCashLines(c, { payoutLabel: 'Výplata zaměstnance' }) : [];
  const cashTips = c ? Math.max(0, (c.tips ?? 0) - (Number(c.tips_card) || 0)) : 0;

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  // Tisk staví na týchž řádcích jako obrazovka, aby papír a appka nikdy
  // neukazovaly jiné číslo.
  const print = () => {
    if (!c) return;
    const w = window.open('', '_blank', 'width=640,height=800');
    if (!w) return;
    const row = (label: string, val: string, strong = false) =>
      `<tr><td style="padding:6px 0;color:#555;">${label}</td><td style="text-align:right;${strong ? 'font-weight:700;' : ''}">${val}</td></tr>`;
    const esc = (v: any) => String(v ?? '').replace(/</g, '&lt;');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Uzávěrka ${esc(c.date)}</title></head>
      <body style="font-family:-apple-system,sans-serif;max-width:440px;margin:24px auto;color:#16181A;">
        <h2 style="margin:0 0 2px;">Uzávěrka — ${new Date(c.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
        <p style="margin:0 0 16px;color:#777;">${esc(c.shift_label ?? '')} · vyplnil/a ${esc(c.author_name ?? '—')}${c.created_at ? ` · ${esc(dayTime(c.created_at))}` : ''}</p>
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          ${lines.map(l => row(esc(l.label), `${l.sign < 0 ? '− ' : '+ '}${money(l.amount)}`)).join('')}
          ${row('Očekávaný stav kasy', money(expectedCash(c)), true)}
          ${row('Skutečný stav kasy', money(c.closing_cash), true)}
          ${row(diff === 0 ? 'Kasa sedí' : diff > 0 ? 'Přebytek' : 'Manko', (diff > 0 ? '+' : '') + money(diff), true)}
          ${Number(c.final_removal) ? row('Odvod na konci směny', '− ' + money(Number(c.final_removal))) + row('Zůstalo v kase', money(cashLeft(c))) : ''}
          ${row('Tržba kartou', money(c.card_revenue))}
          ${row('Spropitné hotově', money(cashTips))}
          ${row('Spropitné kartou', money(Number(c.tips_card) || 0))}
          ${row('Zákazníků', String(c.customers))}
          ${d?.pos ? row('Pokladna — hotovost', money(d.pos.cash)) + row('Pokladna — karta', money(d.pos.card)) : ''}
        </table>
        ${c.notes ? `<p style="margin-top:16px;font-size:14px;color:#555;">Poznámka: ${esc(c.notes)}</p>` : ''}
        <p style="margin-top:24px;font-size:12px;color:#999;">Vytištěno z aplikace Managero · ${new Date().toLocaleString('cs-CZ')}</p>
        <script>window.onload = () => window.print();</scr` + `ipt>
      </body></html>`);
    w.document.close();
  };

  const remove = async () => {
    if (!c) return;
    if (!confirm(`Smazat uzávěrku z ${new Date(c.date + 'T00:00:00').toLocaleDateString('cs-CZ')}? Tohle nejde vrátit.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/closings/${id}`, { method: 'DELETE' });
      if (!res.ok) { setErr('Uzávěrku se nepodařilo smazat.'); return; }
      onChanged?.();
      onClose();
    } finally { setBusy(false); }
  };

  const approve = async () => {
    setBusy(true);
    try {
      await fetch(`/api/closings/${id}`, { method: 'PATCH' });
      await load();
      onChanged?.();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center modal-overlay p-0 sm:p-4"
      onClick={onClose} role="dialog" aria-modal="true" aria-label="Detail uzávěrky">
      <div className="modal-sheet w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl max-h-[94vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Hlavička drží datum a rozdíl pořád na očích, i když se scrolluje. */}
        <div className="dock-strong shrink-0 px-5 sm:px-6 py-4 flex items-start justify-between gap-3 border-b border-black/[0.07]">
          <div className="min-w-0">
            <p className="font-bold tracking-tight text-[#16181A] text-lg truncate">
              {c ? new Date(c.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Uzávěrka'}
            </p>
            <p className="text-xs text-black/45 truncate">
              {c?.shift_label ? `${c.shift_label} · ` : ''}
              vyplnil/a {c?.author_name ?? '—'}
              {c?.created_at ? ` · ${dayTime(c.created_at)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {c && !c.covered_by && (
              <span className={`tap-target-sm text-xs font-bold rounded-full px-3 py-1.5 whitespace-nowrap tabular-nums ${
                diff === 0 ? 'bg-[#C8F542]/20 text-[#5B7A08]' : diff > 0 ? 'bg-[#0A84FF]/15 text-[#0A6FE0]' : 'bg-red-500/15 text-red-600'}`}>
                {diff === 0 ? 'Sedí' : `${diff > 0 ? '+' : ''}${money(diff)}`}
              </span>
            )}
            <button onClick={onClose} aria-label="Zavřít"
              className="tap-target h-9 w-9 flex items-center justify-center rounded-full text-black/40 hover:text-[#16181A] hover:bg-black/[0.06] transition-colors">
              <Icon name="close" size={17} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 sm:px-6 py-5 divide-y divide-black/[0.06]">
          {err && <p className="text-sm text-red-600 py-4">{err}</p>}
          {!d && !err && <p className="text-sm text-black/40 py-8 text-center">Načítám…</p>}

          {d && c && (
            <>
              {/* Co všechno se do uzávěrky vyplnilo. Nulové kolonky zůstávají —
                  „nula" je taky odpověď a její chybění vypadá jako opomenutí. */}
              <Section title="Vyplněná čísla">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5">
                  <Row label="Kasa na začátku" value={money(c.opening_cash)} />
                  <Row label="Tržba hotově" value={money(c.cash_revenue)} />
                  <Row label="Tržba kartou" value={money(c.card_revenue)} />
                  <Row label="Spropitné hotově" value={money(cashTips)} />
                  <Row label="Spropitné kartou" value={money(Number(c.tips_card) || 0)} />
                  <Row label="Výdaje z kasy" value={money(c.expenses)} />
                  <Row label="Odloženo ven" value={money(c.cash_removed)} />
                  {payDailyCash && <Row label="Výplata zaměstnance" value={money(c.self_payout)} />}
                  <Row label="Kasa na konci" value={money(c.closing_cash)} />
                  {(Number(c.final_removal) || 0) > 0 && <Row label="Odvod na konci" value={money(Number(c.final_removal))} />}
                  <Row label="Zákazníků" value={String(c.customers)} />
                </div>
                {/* Dva přepínače, které mění výpočet. Když nejsou vidět, vypadá
                    očekávaná kasa jako záhada. */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-medium text-black/55">
                    Spropitné {c.tips_in_drawer ? 'zůstalo v kase' : 'se z kasy vyndalo'}
                  </span>
                  {payDailyCash && (
                    <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-medium text-black/55">
                      Výplata {c.payout_from_register === false ? 'nešla z kasy' : 'šla z kasy'}
                    </span>
                  )}
                  {c.event_title && (
                    <span className="rounded-full bg-[#0A84FF]/12 text-[#0A6FE0] px-2.5 py-1 text-[11px] font-bold">🎪 {c.event_title}</span>
                  )}
                  {c.shift_date && c.shift_date !== c.date && (
                    <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-medium text-black/55">
                      Obchodní den {c.shift_date}
                    </span>
                  )}
                </div>
              </Section>

              {!c.covered_by && (
                <Section title="Jak vyšla kasa" hint="Řádek po řádku, v pořadí, jak se peníze pohnuly.">
                  <div className="rounded-2xl bg-black/[0.03] border border-black/[0.07] px-4 py-2">
                    {lines.map(l => (
                      <Row key={l.label} label={l.label} value={`${l.sign < 0 ? '− ' : '+ '}${money(l.amount)}`} />
                    ))}
                    <div className="border-t border-black/[0.07] mt-1 pt-1">
                      <Row label="Očekávaný stav kasy" value={money(expectedCash(c))} tone="strong" />
                      <Row label="Skutečný stav kasy" value={money(c.closing_cash)} tone="strong" />
                      {(Number(c.final_removal) || 0) > 0 && (
                        <>
                          <Row label="Odvod na konci směny" value={`− ${money(Number(c.final_removal))}`} />
                          <Row label="Zůstalo na další směnu" value={money(cashLeft(c))} tone="strong" />
                        </>
                      )}
                    </div>
                    <div className={`-mx-1 mt-1 mb-1.5 rounded-xl px-3 py-2 flex items-center justify-between gap-3 ${
                      diff === 0 ? 'bg-[#C8F542]/12 text-[#5B7A08]' : diff > 0 ? 'bg-[#0A84FF]/10 text-[#0A6FE0]' : 'bg-red-500/10 text-red-600'}`}>
                      <span className="text-sm font-semibold">{diff === 0 ? 'Kasa sedí' : diff > 0 ? 'Přebytek' : 'Manko'}</span>
                      <span className="text-sm font-bold tabular-nums">{diff > 0 ? '+' : ''}{money(diff)}</span>
                    </div>
                  </div>
                </Section>
              )}

              {/* Kontrola proti pokladně. Nejdůležitější číslo na téhle
                  obrazovce — a jediné, které uzávěrka sama nemůže potvrdit. */}
              <Section title="Kontrola proti pokladně">
                {d.pos ? (
                  <div className="rounded-2xl bg-black/[0.03] border border-black/[0.07] px-4 py-2">
                    <Row label={`Pokladna — hotovost (${d.pos.bills} úč.)`} value={money(d.pos.cash)} />
                    <Row label="Uzávěrka — hotovost" value={money(d.pos.dayCash)} />
                    <Row label="Rozdíl hotovost" value={`${d.pos.diffCash > 0 ? '+' : ''}${money(d.pos.diffCash)}`}
                      tone={d.pos.diffCash === 0 ? undefined : d.pos.diffCash > 0 ? 'plus' : 'minus'} />
                    <div className="border-t border-black/[0.07] my-1" />
                    <Row label="Pokladna — karta" value={money(d.pos.card)} />
                    <Row label="Uzávěrka — karta" value={money(d.pos.dayCard)} />
                    <Row label="Rozdíl karta" value={`${d.pos.diffCard > 0 ? '+' : ''}${money(d.pos.diffCard)}`}
                      tone={d.pos.diffCard === 0 ? undefined : d.pos.diffCard > 0 ? 'plus' : 'minus'} />
                    {(d.pos.other > 0 || d.pos.tips > 0) && (
                      <div className="border-t border-black/[0.07] my-1 pt-1">
                        {d.pos.other > 0 && <Row label="Pokladna — jiná platba" value={money(d.pos.other)} />}
                        {d.pos.tips > 0 && (
                          <Row label="Pokladna — spropitné"
                            value={`${money(d.pos.tips)} (${money(d.pos.tipsCash)} hotově, ${money(d.pos.tipsCard)} kartou${d.pos.tipsOther ? `, ${money(d.pos.tipsOther)} neurčeno` : ''})`} />
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-black/45">Bez dat z pokladny.</p>
                )}
                {d.notes.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {d.notes.map((n, i) => (
                      <li key={i} className="flex gap-2 text-[13px] text-black/55 leading-snug">
                        <Icon name="warning" size={13} className="shrink-0 mt-0.5 text-amber-600" />
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {(c.movements?.length ?? 0) > 0 && (
                <Section title="Pohyby v kase" hint="Co přesně z kasy odešlo nebo do ní přišlo.">
                  <div className="divide-y divide-black/[0.06]">
                    {c.movements!.map((m, i) => {
                      const spec = MOVEMENT_KINDS.find(k => k.kind === m.kind);
                      return (
                        <div key={i} className="flex items-center gap-2.5 py-2 text-sm">
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-black/40 w-24">{movementLabel(m.kind)}</span>
                          <span className="min-w-0 flex-1 text-black/60">{m.note || '—'}</span>
                          <span className="shrink-0 font-semibold text-[#16181A] tabular-nums">{spec?.sign === 1 ? '+' : '−'}{money(m.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {hasDenominations(c.denominations) && (
                <Section title="Kasa napočítaná po bankovkách">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(c.denominations!).sort((a, b) => Number(b[0]) - Number(a[0])).map(([den, count]) => (
                      <span key={den} className="tap-target-sm rounded-full bg-white border border-black/[0.08] px-2.5 py-1 text-xs tabular-nums text-[#16181A]">
                        <strong>{count}×</strong> {Number(den).toLocaleString('cs-CZ')}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {(c.diff_reason || c.diff_note) && (
                <Section title="Proč kasa nesedí">
                  <div className="rounded-2xl bg-amber-500/[0.08] border border-amber-500/25 p-3.5">
                    {c.diff_reason && <p className="text-sm font-semibold text-[#16181A]">{diffReasonLabel(c.diff_reason)}</p>}
                    {c.diff_note && <p className="text-sm text-black/55 mt-0.5">{c.diff_note}</p>}
                  </div>
                </Section>
              )}

              {/* Předávka se dosud zobrazovala jen další směně na dashboardu —
                  v uzávěrce, kde vznikla, ji nikdo nenašel. */}
              {c.handover && (
                <Section title="Předávka další směně">
                  <div className="space-y-2.5">
                    {c.handover.todo && (
                      <div><p className="text-[11px] font-semibold uppercase tracking-wider text-black/40">Zbývá udělat</p>
                        <p className="text-sm text-[#16181A] whitespace-pre-wrap">{c.handover.todo}</p></div>
                    )}
                    {c.handover.runningOut && (
                      <div><p className="text-[11px] font-semibold uppercase tracking-wider text-black/40">Dochází</p>
                        <p className="text-sm text-[#16181A] whitespace-pre-wrap">{c.handover.runningOut}</p></div>
                    )}
                    {c.handover.message && (
                      <div><p className="text-[11px] font-semibold uppercase tracking-wider text-black/40">Vzkaz</p>
                        <p className="text-sm text-[#16181A] whitespace-pre-wrap">{c.handover.message}</p></div>
                    )}
                  </div>
                </Section>
              )}

              {c.notes && (
                <Section title="Poznámka k uzávěrce">
                  <p className="text-sm text-black/65 whitespace-pre-wrap">{c.notes}</p>
                </Section>
              )}

              {/* Kdo tam byl podle plánu, kdo podle píchaček. Rozdíl mezi tím
                  dvojím je přesně to, co vedení potřebuje vidět. */}
              <Section title="Kdo byl na směně">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {d.crew.map(p => (
                    <PersonLink key={p.id} id={p.id}
                      className="tap-target-sm inline-flex items-center gap-1.5 rounded-full bg-[#C8F542]/15 text-[#5B7A08] px-2.5 py-1 text-xs font-medium">
                      <span>{p.avatar ?? '👤'}</span>{p.name}
                      {p.id === c.created_by && <span className="opacity-70">· vyplnil/a</span>}
                    </PersonLink>
                  ))}
                  {d.covered.map(cv => (
                    <PersonLink key={cv.id} id={cv.employeeId}
                      className="tap-target-sm inline-flex items-center gap-1.5 rounded-full bg-[#C8F542]/15 text-[#5B7A08] px-2.5 py-1 text-xs font-medium">
                      <span>{cv.avatar ?? '👤'}</span>{cv.name ?? 'Neznámý'}
                      {payDailyCash && cv.selfPayout > 0 && <span className="opacity-70">· výplata {money(cv.selfPayout)}</span>}
                    </PersonLink>
                  ))}
                </div>
                {d.attendance.length > 0 ? (
                  <div className="divide-y divide-black/[0.06]">
                    {d.attendance.map(a => (
                      <div key={a.id} className="flex items-center gap-2.5 py-2 text-sm">
                        <span className="shrink-0">{a.employee?.avatar ?? '👤'}</span>
                        <span className="min-w-0 flex-1 truncate text-[#16181A]">{a.employee?.name ?? 'Neznámý'}</span>
                        <span className="shrink-0 text-black/45 tabular-nums text-[13px] whitespace-nowrap">
                          {hhmm(a.clockIn)}–{a.clockOut ? hhmm(a.clockOut) : 'běží'}
                        </span>
                        <span className="shrink-0 font-semibold text-[#16181A] tabular-nums text-[13px] w-24 text-right whitespace-nowrap">{hours(a.minutes)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-black/45">Za tenhle den není žádná docházka.</p>
                )}
                {/* Automaticky doplněný odchod je odhad — ať je to vidět tady,
                    ne až ve mzdách. */}
                {d.attendance.filter(a => a.note).map(a => (
                  <p key={a.id} className="mt-2 flex gap-2 text-[13px] text-amber-700 leading-snug">
                    <Icon name="warning" size={13} className="shrink-0 mt-0.5" />
                    <span>{a.employee?.name}: {a.note}</span>
                  </p>
                ))}
                {d.planned.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1.5">Podle rozvrhu</p>
                    <div className="flex flex-wrap gap-1.5">
                      {d.planned.map((p, i) => (
                        <span key={i} className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-medium text-black/55">
                          {p.employee?.name ?? '—'} {p.startTime}–{p.endTime}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Section>

              {(d.procedures.length > 0 || d.missingProcedures.length > 0 || d.tasks.length > 0) && (
                <Section title="Co se ten den udělalo">
                  {d.procedures.length > 0 && (
                    <div className="divide-y divide-black/[0.06] mb-2">
                      {d.procedures.map(p => (
                        <div key={p.id} className="flex items-center gap-2.5 py-2 text-sm">
                          <Icon name={p.status === 'completed' ? 'check' : 'clock'} size={14}
                            className={`shrink-0 ${p.status === 'completed' ? 'text-[#5B7A08]' : 'text-black/30'}`} />
                          <span className="min-w-0 flex-1 truncate text-[#16181A]">
                            {p.name}
                            {p.required && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-black/35">povinný</span>}
                          </span>
                          <span className="shrink-0 text-black/45 text-[13px] tabular-nums whitespace-nowrap">
                            {p.done}/{p.total} · {p.employee?.name ?? '—'} · {hhmm(p.completedAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {d.missingProcedures.length > 0 && (
                    <p className="flex gap-2 text-[13px] text-amber-700 leading-snug">
                      <Icon name="warning" size={13} className="shrink-0 mt-0.5" />
                      <span>Povinné postupy, které ten den nikdo nedokončil: {d.missingProcedures.join(', ')}.</span>
                    </p>
                  )}
                  {d.tasks.length > 0 && (
                    <div className="divide-y divide-black/[0.06] mt-2">
                      {d.tasks.map(t => (
                        <div key={t.id} className="flex items-center gap-2.5 py-2 text-sm">
                          <Icon name="check" size={14} className="shrink-0 text-[#5B7A08]" />
                          <span className="min-w-0 flex-1 truncate text-[#16181A]">{t.title}</span>
                          <span className="shrink-0 text-black/45 text-[13px] whitespace-nowrap">{t.employee?.name ?? '—'} · {hhmm(t.completedAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              )}

              {d.receipts.length > 0 && (
                <Section title="Účtenky z toho dne">
                  <div className="space-y-2">
                    {d.receipts.map(r => (
                      <div key={r.id} className="flex items-center gap-3">
                        {r.photoUrl
                          ? <a href={r.photoUrl} target="_blank" rel="noreferrer" className="shrink-0">
                              <img src={r.photoUrl} alt="" className="h-12 w-12 rounded-xl object-cover ring-1 ring-black/10" />
                            </a>
                          : <span className="shrink-0 h-12 w-12 rounded-xl bg-black/[0.05] flex items-center justify-center text-black/25"><Icon name="receipt" size={18} /></span>}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#16181A] truncate">{r.supplier || 'Bez dodavatele'}</p>
                          <p className="text-xs text-black/45 truncate">{r.employee?.name ?? '—'} · {hhmm(r.createdAt)}{r.note ? ` · ${r.note}` : ''}</p>
                        </div>
                        <span className="shrink-0 font-semibold text-[#16181A] tabular-nums text-sm">{money(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {d.products.length > 0 && (
                <Section title="Co se ten den prodalo" hint="Z prodejů stažených z pokladny — podle nich se odepisuje sklad.">
                  <div className="flex flex-wrap gap-1.5">
                    {d.products.map((p, i) => (
                      <span key={i} className="tap-target-sm rounded-full bg-black/[0.04] border border-black/[0.06] px-2.5 py-1 text-xs text-[#16181A]">
                        <strong className="tabular-nums">{Math.round(p.qty * 10) / 10}×</strong> {p.name ?? 'bez názvu'}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="Záznam">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
                  <Row label="Vyplněno" value={dayTime(c.created_at)} />
                  <Row label="Vyplnil/a" value={c.author_name ?? '—'} />
                  <Row label="Stav" value={c.approved === false ? 'Čeká na schválení' : 'Schváleno'} />
                  {c.approvedByName && <Row label="Schválil/a" value={c.approvedByName} />}
                </div>
                {c.review_note && (
                  <div className="mt-2 rounded-2xl bg-black/[0.03] border border-black/[0.06] p-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-0.5">Poznámka vedení</p>
                    <p className="text-sm text-black/65 whitespace-pre-wrap">{c.review_note}</p>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>

        {c && (
          <div className="dock-strong shrink-0 px-5 sm:px-6 py-3 border-t border-black/[0.07] flex items-center gap-2">
            {c.approved === false && (
              <button onClick={approve} disabled={busy}
                className="rounded-full bg-[#16181A] text-white px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
                {busy ? 'Schvaluji…' : 'Schválit uzávěrku'}
              </button>
            )}
            <button onClick={print}
              className="rounded-full glass border border-black/10 text-[#16181A] px-4 py-2.5 text-sm font-medium hover:bg-black/[0.05] transition">
              Vytisknout
            </button>
            <button onClick={remove} disabled={busy}
              className="rounded-full text-red-600 px-4 py-2.5 text-sm font-medium hover:bg-red-500/[0.07] transition disabled:opacity-50">
              Smazat
            </button>
            <button onClick={onClose}
              className="ml-auto rounded-full glass border border-black/10 text-[#16181A] px-4 py-2.5 text-sm font-medium hover:bg-black/[0.05] transition">
              Zavřít
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
