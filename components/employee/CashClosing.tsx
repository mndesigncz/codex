'use client';

import { useState, useEffect } from 'react';
import { Icon } from '../Icons';
import { Closing, expectedCash, cashDifference, czk } from '@/lib/closing';

const inputClass =
  'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

const today = () => new Date().toISOString().split('T')[0];

type FormState = {
  date: string; shiftLabel: string;
  openingCash: string; cashRevenue: string; cardRevenue: string; tips: string;
  expenses: string; cashRemoved: string; selfPayout: string; closingCash: string;
  customers: string; notes: string;
};

const emptyForm = (): FormState => ({
  date: today(), shiftLabel: '',
  openingCash: '', cashRevenue: '', cardRevenue: '', tips: '',
  expenses: '', cashRemoved: '', selfPayout: '', closingCash: '',
  customers: '', notes: '',
});

const n = (s: string) => Math.round(Number(s)) || 0;

// A numbered, iconed section panel — one guided step of the closing flow.
function Step({
  num, total, icon, title, subtitle, children, tone = 'plain',
}: {
  num: number; total: number; icon: string; title: string; subtitle: string;
  children: React.ReactNode; tone?: 'plain' | 'climax';
}) {
  const climax = tone === 'climax';
  return (
    <section
      className={`relative rounded-3xl border p-5 sm:p-6 space-y-5 transition-all ${
        climax
          ? 'bg-[#C8F542]/[0.07] border-[#C8F542]/40 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset]'
          : 'bg-black/[0.025] border-black/[0.06]'
      }`}
    >
      <div className="flex items-start gap-3.5">
        <div
          className={`flex-shrink-0 grid place-items-center h-11 w-11 rounded-2xl ${
            climax ? 'bg-[#16181A] text-[#C8F542]' : 'bg-white text-[#16181A] border border-black/[0.06] shadow-sm'
          }`}
        >
          <Icon name={icon} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-black/35">
              Krok {num}/{total}
            </span>
          </div>
          <h4 className="font-bold tracking-tight text-[#16181A] leading-tight">{title}</h4>
          <p className="text-black/45 text-[13px] mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

type EligibleShift = {
  id: number; date: string; startTime: string; endTime: string; type: string;
  employeeId?: number; employeeName?: string; employeeAvatar?: string;
};

type Member = { id: number; name: string; avatar?: string };

export default function CashClosing({ user }: { user: { id: number; name: string } }) {
  const [closings, setClosings] = useState<Closing[]>([]);
  const [payDailyCash, setPayDailyCash] = useState(false);
  const [isEmployer, setIsEmployer] = useState(false);
  const [isKiosk, setIsKiosk] = useState(false);
  const [selEmployee, setSelEmployee] = useState<number | null>(null);
  const [requiresShift, setRequiresShift] = useState(true);
  const [eligible, setEligible] = useState<EligibleShift[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const d = await fetch('/api/closings').then(r => r.json());
      setClosings(Array.isArray(d.closings) ? d.closings : []);
      setPayDailyCash(!!d.payDailyCash);
      setIsEmployer(!!d.isEmployer);
      setIsKiosk(!!d.isKiosk);
      setRequiresShift(d.requiresShift !== false);
      const shifts: EligibleShift[] = Array.isArray(d.eligibleShifts) ? d.eligibleShifts : [];
      setEligible(shifts);
      setMembers(Array.isArray(d.members) ? d.members : []);
      const myId = typeof d.meId === 'number' ? d.meId : null;
      setMeId(myId);
      // Employer submits on behalf of themselves by default.
      if (d.isEmployer) setSelEmployee(myId);
      // Preselect the most recent unclosed shift for employees / kiosk.
      if (!d.isEmployer && shifts[0]) {
        setForm(f => ({ ...f, date: shifts[0].date, shiftLabel: `${shifts[0].startTime}–${shifts[0].endTime}` }));
        if (d.isKiosk) setSelEmployee(shifts[0].employeeId ?? null);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // The shared kiosk always picks a shift (it defines WHO submits). Employees
  // and employers get a free date; the form is always visible for everyone.
  const isSelf = !isEmployer && !isKiosk;
  // Employee submitting for a day they weren't scheduled ⇒ goes to approval.
  const onShift = eligible.some(s => s.date === form.date);

  const pickShift = (s: EligibleShift) => {
    setForm(f => ({ ...f, date: s.date, shiftLabel: `${s.startTime}–${s.endTime}` }));
    if (isKiosk) setSelEmployee(s.employeeId ?? null);
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Live preview of expected drawer cash and difference.
  const preview = {
    opening_cash: n(form.openingCash), cash_revenue: n(form.cashRevenue),
    expenses: n(form.expenses), cash_removed: n(form.cashRemoved), self_payout: payDailyCash ? n(form.selfPayout) : 0,
    closing_cash: n(form.closingCash),
  };
  const expected = expectedCash(preview);
  const diff = form.closingCash === '' ? null : cashDifference(preview);

  const totalSteps = 4;

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setMsg('');
    if (form.closingCash === '') { setErr('Zadej skutečný stav kasy na konci směny.'); return; }
    // Employee closing a day they weren't on shift ⇒ confirm the approval path.
    if (isSelf && !onShift) { setShowConfirm(true); return; }
    doSubmit();
  };

  const doSubmit = async () => {
    setShowConfirm(false); setErr(''); setMsg('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/closings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date, shiftLabel: form.shiftLabel,
          openingCash: n(form.openingCash), cashRevenue: n(form.cashRevenue), cardRevenue: n(form.cardRevenue),
          tips: n(form.tips), expenses: n(form.expenses), cashRemoved: n(form.cashRemoved),
          selfPayout: payDailyCash ? n(form.selfPayout) : 0, closingCash: n(form.closingCash),
          customers: n(form.customers), notes: form.notes,
          employeeId: isSelf ? undefined : selEmployee,
        }),
      });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        setMsg(d.approved === false ? 'Uzávěrka odeslána ke schválení vedení. ✓' : 'Uzávěrka byla odeslána. ✓');
        setForm(emptyForm());
        await load();
        setTimeout(() => setMsg(''), 4000);
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || 'Uzávěrku se nepodařilo odeslat.');
      }
    } catch { setErr('Chyba serveru.'); }
    setSubmitting(false);
  };

  // Money input with a unit suffix (defaults to "Kč"; pass unit={null} for a plain count).
  const field = (
    label: string, key: keyof FormState,
    opts?: { hint?: string; placeholder?: string; unit?: string | null },
  ) => {
    const unit = opts?.unit === undefined ? 'Kč' : opts.unit;
    return (
      <div>
        <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">{label}</label>
        <div className="relative">
          <input type="number" inputMode="numeric" value={form[key]} onChange={set(key)}
            placeholder={opts?.placeholder ?? '0'} className={`${inputClass} ${unit ? 'pr-12' : ''}`} />
          {unit && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">{unit}</span>}
        </div>
        {opts?.hint && <p className="text-[11px] text-black/40 mt-1.5">{opts.hint}</p>}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {msg && (
        <div className="p-3.5 rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/25 text-[#5B7A08] text-sm flex items-center gap-2">
          <Icon name="check" size={17} /> {msg}
        </div>
      )}
      {err && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm flex items-center gap-2">
          <Icon name="warning" size={17} /> {err}
        </div>
      )}

      <form onSubmit={submit} className="glass-card p-6 sm:p-7 space-y-6">
        {/* Header + visual step progress */}
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-[#16181A] flex items-center gap-2">
                <Icon name="leaf" size={20} /> Uzávěrka směny
              </h3>
              <p className="text-black/45 text-sm mt-1">Projdi čtyři kroky — na konci ti spočítáme, jestli kasa sedí.</p>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2">
            {['Kasa', 'Tržby', 'Výdaje', 'Kontrola'].map((lbl, i) => (
              <div key={lbl} className="flex items-center gap-2 flex-1 last:flex-initial min-w-0">
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`grid place-items-center h-6 w-6 shrink-0 rounded-full text-[11px] font-bold ${
                      i === totalSteps - 1
                        ? 'bg-[#C8F542] text-[#16181A]'
                        : 'bg-[#16181A] text-white'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[11px] font-semibold text-black/45 hidden sm:inline">{lbl}</span>
                </div>
                {i < totalSteps - 1 && <span className="h-px flex-1 bg-black/[0.09]" />}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1 — opening cash + when/which shift */}
        <Step num={1} total={totalSteps} icon="clock" title="Kasa na začátku"
          subtitle="Kolik bylo v kase, když směna začala.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Kasa na začátku', 'openingCash', {
              hint: closings[0]
                ? `Minulá uzávěrka (${new Date(closings[0].date + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}) skončila s ${czk(closings[0].closing_cash)} v kase.`
                : 'Počáteční stav hotovosti v kase.',
            })}
            {isKiosk ? (
              <div className="min-w-0">
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Kterou směnu uzavíráš?</label>
                <div className="flex flex-col gap-2">
                  {eligible.map(s => {
                    const active = form.date === s.date && selEmployee === (s.employeeId ?? null);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickShift(s)}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                          active ? 'bg-[#C8F542]/[0.12] border-[#C8F542]/40' : 'bg-white border-black/[0.08] hover:border-black/20'
                        }`}
                      >
                        <span className="min-w-0 flex items-center gap-2.5">
                          {s.employeeName && <span className="text-xl shrink-0">{s.employeeAvatar ?? '👤'}</span>}
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[#16181A] capitalize truncate">
                              {s.employeeName ? `${s.employeeName} · ` : ''}
                              {new Date(s.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </span>
                            <span className="block text-xs text-black/45 tabular-nums">{s.startTime}–{s.endTime}</span>
                          </span>
                        </span>
                        <span className={`shrink-0 flex h-5 w-5 items-center justify-center rounded-full border-2 ${active ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/20 text-transparent'}`}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : isEmployer ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                <div className="min-w-0">
                  <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Za koho</label>
                  <select value={selEmployee ?? ''} onChange={e => setSelEmployee(e.target.value ? Number(e.target.value) : null)}
                    className={`${inputClass} appearance-none min-w-0 h-[46px]`} style={{ WebkitAppearance: 'none' }}>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.avatar ? `${m.avatar} ` : ''}{m.name}{m.id === meId ? ' (já)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Datum</label>
                  {/* appearance-none + min-w-0: iOS date inputs have an intrinsic
                      width and overflow the card without it */}
                  <input type="date" value={form.date} onChange={set('date')}
                    className={`${inputClass} appearance-none min-w-0 h-[46px] text-left`}
                    style={{ WebkitAppearance: 'none' }} />
                </div>
              </div>
            ) : (
              <div className="min-w-0 space-y-3">
                {eligible.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {eligible.map(s => {
                      const active = form.date === s.date;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => pickShift(s)}
                          className={`rounded-full border px-3.5 py-2 text-xs font-semibold capitalize transition ${
                            active ? 'bg-[#C8F542]/[0.18] border-[#C8F542]/50 text-[#5B7A08]' : 'bg-white border-black/[0.08] text-[#16181A] hover:border-black/20'
                          }`}
                        >
                          {new Date(s.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                          <span className="text-black/40 font-normal"> · {s.startTime}–{s.endTime}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Datum</label>
                  {/* appearance-none + min-w-0: iOS date inputs have an intrinsic
                      width and overflow the card without it */}
                  <input type="date" value={form.date} onChange={set('date')}
                    className={`${inputClass} appearance-none min-w-0 h-[46px] text-left`}
                    style={{ WebkitAppearance: 'none' }} />
                </div>
              </div>
            )}
          </div>
        </Step>

        {/* Step 2 — revenue */}
        <Step num={2} total={totalSteps} icon="trend" title="Tržby"
          subtitle="Co za směnu přišlo — hotově, kartou a spropitné.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Tržba hotově', 'cashRevenue', { hint: 'Hotovost přijatá do kasy.' })}
            {field('Tržba kartou', 'cardRevenue', { hint: 'Nejde do kasy — jen evidence.' })}
            {field('Spropitné', 'tips')}
            {field('Zákazníků (volitelné)', 'customers', { unit: null, placeholder: 'počet' })}
          </div>
        </Step>

        {/* Step 3 — expenses & payouts */}
        <Step num={3} total={totalSteps} icon="box" title="Výdaje a odvody"
          subtitle="Co z kasy odešlo během směny.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Výdaje z kasy', 'expenses', { hint: 'Nákupy apod. placené z kasy.' })}
            {field('Odloženo ven', 'cashRemoved', { hint: 'Do trezoru / odvod.' })}
            {payDailyCash && field('Moje výplata dnes', 'selfPayout', { hint: 'Kolik sis dnes vyplatil/a z kasy.' })}
          </div>
        </Step>

        {/* Step 4 — the climax: expected vs counted */}
        <Step num={4} total={totalSteps} icon="check" tone="climax" title="Kontrola kasy"
          subtitle="Spočítej hotovost v kase a porovnej s očekáváním.">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 border border-black/[0.06] px-4 py-3">
            <span className="text-sm text-black/55 min-w-0">Očekávaný stav kasy</span>
            <span className="text-lg font-bold tracking-tight text-[#16181A] tabular-nums shrink-0 whitespace-nowrap">{czk(expected)}</span>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Skutečný stav kasy na konci *</label>
            <div className="relative">
              <input type="number" inputMode="numeric" required value={form.closingCash} onChange={set('closingCash')}
                placeholder="0" className={`${inputClass} pr-12 !py-4 text-base font-semibold`} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">Kč</span>
            </div>
          </div>

          {diff === null ? (
            <p className="text-[13px] text-black/40 text-center py-1">Zadej skutečný stav a hned uvidíš výsledek.</p>
          ) : (
            <div className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3.5 border ${
              diff === 0
                ? 'bg-[#C8F542]/15 border-[#C8F542]/40 text-[#5B7A08]'
                : diff > 0
                  ? 'bg-[#0A84FF]/10 border-[#0A84FF]/25 text-[#0A6FE0]'
                  : 'bg-red-500/10 border-red-500/25 text-red-600'
            }`}>
              <span className="flex items-center gap-2 font-semibold">
                <Icon name={diff === 0 ? 'check' : diff > 0 ? 'trend' : 'warning'} size={18} />
                {diff === 0 ? 'Kasa sedí' : diff > 0 ? 'Přebytek v kase' : 'Manko v kase'}
              </span>
              <span className="text-lg font-bold tabular-nums whitespace-nowrap">{diff > 0 ? '+' : ''}{czk(diff)}</span>
            </div>
          )}
        </Step>

        <div>
          <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Poznámka</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Cokoliv důležitého k předání…" className={`${inputClass} resize-none`} />
        </div>

        <button type="submit" disabled={submitting}
          className="w-full sm:w-auto rounded-full bg-[#16181A] text-white font-semibold px-7 py-3.5 text-sm hover:bg-black disabled:opacity-50 transition-all inline-flex items-center justify-center gap-2">
          {submitting ? 'Odesílám…' : <>Odeslat uzávěrku <Icon name="check" size={17} /></>}
        </button>
      </form>

      {/* My past closings (hidden on the shared kiosk) */}
      {!isKiosk && (
      <div className="space-y-3">
        <h3 className="text-lg font-bold tracking-tight text-[#16181A] flex items-center gap-2">
          <Icon name="clock" size={18} /> Moje uzávěrky
        </h3>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
          </div>
        ) : closings.length === 0 ? (
          <div className="glass-card p-8 text-center"><p className="text-black/45">Zatím žádná uzávěrka.</p></div>
        ) : (
          closings.map(c => {
            const d = cashDifference(c);
            // `approved` isn't on the shared Closing type; old rows omit it (⇒ approved).
            const pending = (c as { approved?: boolean }).approved === false;
            return (
              <div key={c.id} className="glass-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="font-bold tracking-tight text-[#16181A] min-w-0">
                    {new Date(c.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {c.shift_label && <span className="text-black/40 font-normal"> · {c.shift_label}</span>}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {pending && (
                    <span className="rounded-full bg-orange-500/15 text-orange-600 px-2.5 py-1 text-xs font-medium whitespace-nowrap">Čeká na schválení</span>
                  )}
                  <span className={`text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap shrink-0 ${
                    d === 0 ? 'bg-[#C8F542]/15 text-[#5B7A08]' : d > 0 ? 'bg-[#0A84FF]/15 text-[#0A6FE0]' : 'bg-red-500/15 text-red-600'
                  }`}>{d === 0 ? 'Sedí' : d > 0 ? `Přebytek +${czk(d)}` : `Manko ${czk(d)}`}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="min-w-0"><span className="block text-black/40 truncate">Tržba hotově</span><p className="font-semibold text-[#16181A] tabular-nums truncate">{czk(c.cash_revenue)}</p></div>
                  <div className="min-w-0"><span className="block text-black/40 truncate">Tržba kartou</span><p className="font-semibold text-[#16181A] tabular-nums truncate">{czk(c.card_revenue)}</p></div>
                  <div className="min-w-0"><span className="block text-black/40 truncate">Odloženo</span><p className="font-semibold text-[#16181A] tabular-nums truncate">{czk(c.cash_removed)}</p></div>
                  {payDailyCash && <div className="min-w-0"><span className="block text-black/40 truncate">Moje výplata</span><p className="font-semibold text-[#16181A] tabular-nums truncate">{czk(c.self_payout)}</p></div>}
                </div>
                {c.notes && <p className="text-sm text-black/55 bg-black/[0.04] border border-black/[0.06] rounded-2xl p-3 mt-3">{c.notes}</p>}
              </div>
            );
          })
        )}
      </div>
      )}

      {/* Off-shift confirmation — closing a day the employee wasn't scheduled
          goes to management for approval. */}
      {showConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center modal-overlay p-4" onClick={() => setShowConfirm(false)}>
          <div className="modal-sheet rounded-3xl p-6 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/15 text-2xl">⚠️</div>
            <h3 className="text-lg font-bold tracking-tight text-[#16181A] mt-3">Nejsi na směně v tento den</h3>
            <p className="text-sm text-black/55 mt-1.5">
              Uzávěrku můžeš odeslat, ale půjde vedení ke schválení. Opravdu ji chceš odeslat?
            </p>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-full bg-black/[0.05] text-[#16181A] font-semibold px-5 py-3 text-sm hover:bg-black/[0.08] transition">
                Zpět
              </button>
              <button type="button" onClick={doSubmit} disabled={submitting}
                className="flex-1 rounded-full bg-[#16181A] text-white font-semibold px-5 py-3 text-sm hover:bg-black disabled:opacity-50 transition">
                Odeslat ke schválení
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
