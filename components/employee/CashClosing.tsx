'use client';

import { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icons';
import {
  Closing, expectedCash, cashDifference, expectedCashLines,
  type Movement, type MovementKind, MOVEMENT_KINDS, movementLabel, sumMovements,
  DIFF_REASONS, diffReasonLabel, explainDifference,
  type DenominationCounts, denominationsFor, sumDenominations, hasDenominations,
  cashLeft,
} from '@/lib/closing';
import { useCurrency, useMoney, useSymbol } from '../CurrencyProvider';

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

/**
 * Counting the drawer the way people actually count it: how many of each note
 * and coin. The app does the adding — an arithmetic slip stops masquerading as
 * a manko. Only denominations with a count show a subtotal.
 */
function DrawerCounter({ denomSet, counts, onChange, money, symbol }: {
  denomSet: number[];
  counts: DenominationCounts;
  onChange: (next: DenominationCounts) => void;
  money: (n: number) => string;
  symbol: string;
}) {
  const setCount = (denom: number, raw: string) => {
    const next = { ...counts };
    const v = Math.max(0, Math.round(Number(raw)));
    if (!raw || !Number.isFinite(v) || v === 0) delete next[String(denom)];
    else next[String(denom)] = Math.min(v, 9999);
    onChange(next);
  };
  const bump = (denom: number, delta: number) => {
    const cur = counts[String(denom)] ?? 0;
    setCount(denom, String(cur + delta));
  };
  const fmtDenom = (d: number) => (Number.isInteger(d) ? String(d) : d.toFixed(2).replace('.', ','));

  return (
    <div className="rounded-2xl bg-white/70 border border-black/[0.06] overflow-hidden">
      <div className="divide-y divide-black/[0.05]">
        {denomSet.map(d => {
          const cnt = counts[String(d)] ?? 0;
          return (
            <div key={d} className={`flex items-center gap-2 px-3 py-1.5 ${cnt > 0 ? 'bg-[#C8F542]/[0.07]' : ''}`}>
              <span className="w-16 shrink-0 text-sm font-semibold text-[#16181A] tabular-nums">
                {fmtDenom(d)} <span className="text-[11px] font-medium text-black/35">{symbol}</span>
              </span>
              <div className="flex items-center gap-1 ml-auto">
                <button type="button" onClick={() => bump(d, -1)} disabled={cnt <= 0} aria-label={`Ubrat ${fmtDenom(d)} ${symbol}`}
                  className="rounded-xl glass w-9 h-9 flex items-center justify-center text-lg leading-none text-black/60 hover:text-black disabled:opacity-25 active:scale-95 transition">−</button>
                <input
                  type="number" inputMode="numeric" min={0}
                  value={cnt === 0 ? '' : cnt}
                  onChange={e => setCount(d, e.target.value)}
                  placeholder="0"
                  className="w-14 h-9 text-center rounded-xl bg-black/[0.04] border border-black/[0.08] text-sm font-semibold text-[#16181A] tabular-nums placeholder-black/25 focus:border-[#C8F542]/50 focus:outline-none"
                />
                <button type="button" onClick={() => bump(d, 1)} aria-label={`Přidat ${fmtDenom(d)} ${symbol}`}
                  className="rounded-xl bg-[#C8F542] w-9 h-9 flex items-center justify-center text-lg leading-none text-black hover:brightness-110 active:scale-95 transition">+</button>
              </div>
              <span className={`w-20 shrink-0 text-right text-xs tabular-nums ${cnt > 0 ? 'text-[#5B7A08] font-semibold' : 'text-black/20'}`}>
                {cnt > 0 ? money(d * cnt) : '—'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#16181A] text-white">
        <span className="text-sm font-semibold">Napočítáno v kase</span>
        <span className="text-lg font-bold tabular-nums">{money(sumDenominations(counts))}</span>
      </div>
    </div>
  );
}

/**
 * Itemised cash movements. One line per thing that left (or entered) the till,
 * so a closing answers "co si z kasy brali" instead of showing one lump sum.
 */
function MovementEditor({ movements, setMovements, payDailyCash, money, symbol }: {
  movements: Movement[];
  setMovements: (m: Movement[]) => void;
  payDailyCash: boolean;
  money: (n: number) => string;
  symbol: string;
}) {
  const [kind, setKind] = useState<MovementKind>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const kinds = MOVEMENT_KINDS.filter(k => k.kind !== 'payout' || payDailyCash);

  const add = () => {
    const v = Math.abs(Math.round(Number(amount)));
    if (!Number.isFinite(v) || v === 0) return;
    setMovements([...movements, { kind, amount: v, note: note.trim() || undefined }]);
    setAmount(''); setNote('');
  };

  return (
    <div className="rounded-2xl bg-white/60 border border-black/[0.07] p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold text-[#16181A]">Pohyby v kase</p>
        <p className="text-[11px] text-black/40">Rozepiš, co se z kasy bralo — vedení pak vidí za co.</p>
      </div>

      {movements.length > 0 && (
        <div className="divide-y divide-black/[0.06]">
          {movements.map((m, i) => {
            const spec = MOVEMENT_KINDS.find(k => k.kind === m.kind);
            return (
              <div key={i} className="flex items-center gap-2.5 py-2">
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                  spec?.sign === 1 ? 'bg-[#C8F542]/25 text-[#5B7A08]' : 'bg-black/[0.06] text-black/50'
                }`}>
                  {movementLabel(m.kind)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-black/60">{m.note || '—'}</span>
                <span className="shrink-0 text-sm font-semibold text-[#16181A] tabular-nums">
                  {spec?.sign === 1 ? '+' : '−'}{money(m.amount)}
                </span>
                <button type="button" onClick={() => setMovements(movements.filter((_, idx) => idx !== i))}
                  title="Odebrat"
                  className="shrink-0 rounded-full w-7 h-7 flex items-center justify-center text-black/35 hover:text-red-600">✕</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {kinds.map(k => (
          <button key={k.kind} type="button" onClick={() => setKind(k.kind)}
            title={k.hint}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              kind === k.kind ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'
            }`}>
            {k.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative w-32 shrink-0">
          <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="0"
            className={`${inputClass} py-2 pr-10 tabular-nums`} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-black/35">{symbol}</span>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={MOVEMENT_KINDS.find(k => k.kind === kind)?.hint ?? 'Za co'}
          className={`${inputClass} py-2 flex-1 min-w-[8rem]`} />
        <button type="button" onClick={add} disabled={!amount}
          className="shrink-0 rounded-2xl bg-[#C8F542] text-black px-4 text-sm font-semibold hover:brightness-110 disabled:opacity-40">
          Přidat
        </button>
      </div>
    </div>
  );
}

// A numbered, iconed section panel — one guided step of the closing flow.
function Step({
  num, total, icon, title, subtitle, children, tone = 'plain', refCb,
}: {
  num: number; total: number; icon: string; title: string; subtitle: string;
  children: React.ReactNode; tone?: 'plain' | 'climax';
  refCb?: (el: HTMLElement | null) => void;
}) {
  const climax = tone === 'climax';
  return (
    <section
      ref={refCb}
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

// Labelled on/off switch for the per-closing money-flow options (payout source,
// where the tips end up). Both directly change the expected-cash maths.
function Toggle({ title, hint, on, onChange }: {
  title: string; hint: string; on: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/60 border border-black/[0.07] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#16181A]">{title}</p>
        <p className="text-xs text-black/45 mt-0.5">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        onClick={() => onChange(!on)}
        className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${on ? 'bg-[#C8F542]' : 'bg-black/15'}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-[#FDFDFB] shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

type EligibleShift = {
  id: number; date: string; startTime: string; endTime: string; type: string;
  employeeId?: number; employeeName?: string; employeeAvatar?: string;
};

type Member = { id: number; name: string; avatar?: string };

type Coworker = { id: number; name: string; avatar?: string; startTime: string | null; endTime: string | null; hadShift?: boolean };

export default function CashClosing({ user, hideHistory, onSubmitted, initialDate }: {
  user: { id: number; name: string };
  hideHistory?: boolean;
  onSubmitted?: () => void;
  initialDate?: string;
}) {
  const [closings, setClosings] = useState<Closing[]>([]);
  const [payDailyCash, setPayDailyCash] = useState(false);
  // Per-closing money-flow flags, seeded from the team policy so a reset after
  // submitting goes back to the team default rather than a hardcoded guess.
  const [teamPayoutFromRegister, setTeamPayoutFromRegister] = useState(true);
  const [teamTipsInDrawer, setTeamTipsInDrawer] = useState(false);
  const [payoutFromRegister, setPayoutFromRegister] = useState(true);
  const [tipsInDrawer, setTipsInDrawer] = useState(false);
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
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [coworkerSel, setCoworkerSel] = useState<Record<number, { on: boolean; payout: string }>>({});
  // Itemised cash movements — what was actually taken out of / put into the till.
  const [movements, setMovements] = useState<Movement[]>([]);
  // Why the counted cash didn't match, filled in only when it doesn't.
  const [diffReason, setDiffReason] = useState('');
  const [diffNote, setDiffNote] = useState('');
  // The previous closing's counted cash — offered as this shift's opening cash.
  const [carry, setCarry] = useState<{ amount: number; date: string; label: string | null } | null>(null);
  // Today's procedure runs — the closing is the natural moment to notice an
  // unfinished closing checklist.
  const [todayRuns, setTodayRuns] = useState<any[]>([]);
  // Procedures the employer marked as mandatory before the closing.
  const [requiredProcs, setRequiredProcs] = useState<{ id: number; name: string; icon?: string }[]>([]);
  // Real numbers from the POS (Storyous), when the team connected one.
  const [pos, setPos] = useState<any | null>(null);
  // Counting the drawer by denomination instead of typing one total. When the
  // counter is on, the counted total drives form.closingCash.
  const [countMode, setCountMode] = useState(false);
  const [denoms, setDenoms] = useState<DenominationCounts>({});
  // End-of-shift removal: how much stays in the drawer for the next shift.
  // Empty = everything stays (no removal). The removal itself is derived.
  const [leaveCash, setLeaveCash] = useState('');
  // Team's desired float — the removal is computed so exactly this stays.
  const [drawerFloat, setDrawerFloat] = useState<number | null>(null);
  // Off-site event closings: filed BESIDE the shop's closing for the day.
  const [dayEvents, setDayEvents] = useState<{ id: number; title: string }[]>([]);
  const [eventId, setEventId] = useState<number | ''>('');
  // Structured handover for the next shift.
  const [hoTodo, setHoTodo] = useState('');
  const [hoRunningOut, setHoRunningOut] = useState('');
  const [hoMessage, setHoMessage] = useState('');
  const money = useMoney();
  const symbol = useSymbol();
  const { currency } = useCurrency();
  const denomSet = denominationsFor(currency);

  const load = async () => {
    // The team decides whether cash tips stay in the drawer — it changes the
    // expected-cash maths, so the form must start from the team's reality.
    try {
      const t = await fetch('/api/teams').then(r => r.json());
      const drawer = t?.team?.tips_in_drawer === true;
      setTeamTipsInDrawer(drawer);
      setTipsInDrawer(drawer);
      const df = t?.team?.drawer_float;
      if (df != null && Number(df) > 0) {
        setDrawerFloat(Math.round(Number(df)));
        // The desired float prefills "co v kase necháš" — editable as ever.
        setLeaveCash(l => (l === '' ? String(Math.round(Number(df))) : l));
      }
    } catch { /* keep the safe default: tips are kept aside */ }
    try {
      const rd = await fetch('/api/procedures/runs?today=team').then(r => r.json());
      setTodayRuns(Array.isArray(rd?.runs) ? rd.runs : []);
    } catch { /* runs are a nice-to-have here */ }
    try {
      const pd = await fetch('/api/procedures').then(r => r.json());
      const list = Array.isArray(pd?.procedures) ? pd.procedures : [];
      setRequiredProcs(list.filter((p: any) => p.requireBeforeClosing === true)
        .map((p: any) => ({ id: p.id, name: p.name, icon: p.icon })));
    } catch { /* enforcement needs the list; without it nothing blocks */ }
    try {
      const d = await fetch('/api/closings').then(r => r.json());
      const list: Closing[] = Array.isArray(d.closings) ? d.closings : [];
      setClosings(list);
      // What the previous shift left in the drawer is what this one starts
      // with. Asked via a dedicated endpoint: the TEAM's last closing, not the
      // author's own — with alternating shifts my own last closing can be days
      // old (or a covered stub) and would manufacture a phantom manko.
      try {
        const dd = await fetch('/api/closings/drawer').then(r => r.json());
        const prev = dd?.drawer;
        if (prev) {
          const left = Math.round(Number(prev.amount) || 0);
          setCarry({ amount: left, date: prev.date, label: prev.shiftLabel ?? null });
          setForm(f => (f.openingCash === '' ? { ...f, openingCash: String(left) } : f));
          // A team that removes the surplus every day leaves the same float each
          // time — offer it prefilled, still editable.
          if ((Number(prev.finalRemoval) || 0) > 0) setLeaveCash(l => (l === '' ? String(left) : l));
        }
      } catch { /* prefill is a nice-to-have */ }
      // Events happening on the closing's date — an off-site stall keeps its
      // own drawer, so it gets its own closing.
      try {
        const evd = await fetch('/api/events').then(r => r.json());
        const evs = (Array.isArray(evd?.events) ? evd.events : [])
          .filter((e: any) => e.status !== 'cancelled')
          .map((e: any) => ({ id: e.id, title: e.title, date: e.date }));
        setDayEvents(evs.slice(0, 30));
      } catch { /* events are a nice-to-have here */ }
      setPayDailyCash(!!d.payDailyCash);
      const payoutDefault = d.payoutFromRegister !== false;
      setTeamPayoutFromRegister(payoutDefault);
      setPayoutFromRegister(payoutDefault);
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

  // Employer opened the form for a specific missing day → preselect that date.
  useEffect(() => {
    if (initialDate) setForm(f => ({ ...f, date: initialDate }));
  }, [initialDate]);

  // The shared kiosk always picks a shift (it defines WHO submits). Employees
  // and employers get a free date; the form is always visible for everyone.
  const isSelf = !isEmployer && !isKiosk;
  // Employee submitting for a day they weren't scheduled ⇒ goes to approval.
  const onShift = eligible.some(s => s.date === form.date);

  // Who is this closing FOR? Employee ⇒ themselves; employer/kiosk ⇒ the picked
  // member (null on employer means "me").
  const actorId = isSelf ? user.id : (selEmployee ?? meId);

  // Team members who ALSO had a shift that day and don't have their own closing
  // yet — one person can close for the whole crew.
  useEffect(() => {
    if (!form.date || actorId == null) { setCoworkers([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const d = await fetch(`/api/closings/coworkers?date=${form.date}&exclude=${actorId}`).then(r => r.json());
        if (!cancelled) setCoworkers(Array.isArray(d.coworkers) ? d.coworkers : []);
      } catch { if (!cancelled) setCoworkers([]); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.date, actorId]);

  const pickShift = (s: EligibleShift) => {
    setForm(f => ({ ...f, date: s.date, shiftLabel: `${s.startTime}–${s.endTime}` }));
    if (isKiosk) setSelEmployee(s.employeeId ?? null);
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Itemised movements, when present, are the source of truth for the totals —
  // the person writing them shouldn't have to keep a separate sum in their head.
  // A deposit puts money back, so it lands as a negative expense.
  const movedExpenses = sumMovements(movements, 'expense') - sumMovements(movements, 'deposit');
  const movedRemoval = sumMovements(movements, 'removal');
  const movedPayout = sumMovements(movements, 'payout');
  const hasMoved = (kind: MovementKind) => movements.some(m => m.kind === kind);
  const effExpenses = hasMoved('expense') || hasMoved('deposit') ? movedExpenses : n(form.expenses);
  const effRemoved = hasMoved('removal') ? movedRemoval : n(form.cashRemoved);
  const effPayout = payDailyCash ? (hasMoved('payout') ? movedPayout : n(form.selfPayout)) : 0;

  // Live preview of expected drawer cash and difference.
  const preview = {
    opening_cash: n(form.openingCash), cash_revenue: n(form.cashRevenue), tips: n(form.tips),
    card_revenue: n(form.cardRevenue),
    expenses: effExpenses, cash_removed: effRemoved, self_payout: effPayout,
    closing_cash: n(form.closingCash), payout_from_register: payoutFromRegister, tips_in_drawer: tipsInDrawer,
  };
  const expected = expectedCash(preview);
  const expectedLines = expectedCashLines(preview);
  const diff = form.closingCash === '' ? null : cashDifference(preview);
  // Arithmetic nudges: a difference landing exactly on a number already in the
  // closing is nearly always that number.
  // End-of-shift removal, derived from "what stays in": counted − left.
  // It happens AFTER the count, so it never touches expected/diff.
  const finalRemoval = leaveCash === '' || form.closingCash === ''
    ? 0
    : Math.max(0, n(form.closingCash) - n(leaveCash));
  const leaveTooHigh = leaveCash !== '' && form.closingCash !== '' && n(leaveCash) > n(form.closingCash);
  const hints = diff == null || diff === 0 ? [] : explainDifference(diff, { ...preview, final_removal: finalRemoval }, movements);

  useEffect(() => {
    if (!form.date) return;
    let alive = true;
    fetch(`/api/pos/summary?date=${form.date}`).then(r => r.json())
      .then(d => { if (alive) setPos(d?.connected && d.bills != null ? d : null); })
      .catch(() => { if (alive) setPos(null); });
    return () => { alive = false; };
  }, [form.date]);

  const totalSteps = 4;

  // The stepper reflects what is actually filled in, and tapping a step jumps
  // to it. Step 3 is legitimately empty on a quiet shift, so it counts as done
  // once the person has moved past it to the final count.
  const stepDone = [
    form.openingCash !== '',
    form.cashRevenue !== '' || form.cardRevenue !== '',
    movements.length > 0 || form.expenses !== '' || form.cashRemoved !== '' || form.selfPayout !== '' || form.closingCash !== '',
    form.closingCash !== '',
  ];
  const stepRefs = useRef<(HTMLElement | null)[]>([]);
  const scrollToStep = (i: number) =>
    stepRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // A required procedure counts as done when ANYONE on the team completed it today.
  const missingRequired = requiredProcs.filter(p =>
    !todayRuns.some((r: any) => r.procedure_id === p.id && r.status === 'completed'));

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setMsg('');
    if (form.closingCash === '') { setErr('Zadej skutečný stav kasy na konci směny.'); return; }
    if (leaveTooHigh) { setErr('V kase nemůže zůstat víc, než kolik jsi napočítal/a. Uprav odvod na konci směny.'); return; }
    if (missingRequired.length > 0 && !isEmployer) {
      setErr(`Nejdřív dokonči ${missingRequired.length === 1 ? 'povinný postup' : 'povinné postupy'}: ${missingRequired.map(p => p.name).join(', ')}. Pak půjde uzávěrka odeslat.`);
      return;
    }
    if (missingRequired.length > 0 && isEmployer && !confirm(`Povinné postupy nejsou dokončené (${missingRequired.map(p => p.name).join(', ')}). Odeslat uzávěrku přesto?`)) return;
    // Employee closing a day they weren't on shift ⇒ confirm the approval path.
    if (isSelf && !onShift) { setShowConfirm(true); return; }
    doSubmit();
  };

  const doSubmit = async () => {
    setShowConfirm(false); setErr(''); setMsg('');
    setSubmitting(true);
    const includedCoworkers = coworkers
      .filter(c => coworkerSel[c.id]?.on)
      .map(c => ({ employeeId: c.id, payout: n(coworkerSel[c.id]?.payout ?? '') }));
    try {
      const res = await fetch('/api/closings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date, shiftLabel: form.shiftLabel,
          openingCash: n(form.openingCash), cashRevenue: n(form.cashRevenue), cardRevenue: n(form.cardRevenue),
          tips: n(form.tips), expenses: effExpenses, cashRemoved: effRemoved,
          selfPayout: effPayout, closingCash: n(form.closingCash),
          customers: n(form.customers), notes: form.notes,
          payoutFromRegister, tipsInDrawer,
          eventId: eventId === '' ? null : eventId,
          movements, diffReason: diffReason || null, diffNote: diffNote || null,
          denominations: countMode ? denoms : null,
          finalRemoval,
          handover: (hoTodo.trim() || hoRunningOut.trim() || hoMessage.trim())
            ? { todo: hoTodo.trim(), runningOut: hoRunningOut.trim(), message: hoMessage.trim() }
            : null,
          employeeId: isSelf ? undefined : selEmployee,
          coworkers: includedCoworkers,
        }),
      });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        const forCoworkers = includedCoworkers.length > 0 ? ' (i za kolegy)' : '';
        setMsg(d.approved === false ? 'Uzávěrka odeslána ke schválení vedení. ✓' : `Uzávěrka byla odeslána. ✓${forCoworkers}`);
        setForm(emptyForm());
        setCoworkerSel({});
        setDenoms({});
        setLeaveCash('');
        setHoTodo(''); setHoRunningOut(''); setHoMessage('');
        setMovements([]);
        setDiffReason(''); setDiffNote('');
        setPayoutFromRegister(teamPayoutFromRegister);
        setTipsInDrawer(teamTipsInDrawer);
        onSubmitted?.();
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
    const unit = opts?.unit === undefined ? symbol : opts.unit;
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
    <div className="p-4 sm:p-6 space-y-6">
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

      {/* Missing-closing nudge: shifts the employee worked but never closed. */}
      {isSelf && eligible.length > 0 && (
        <div className="p-4 rounded-2xl bg-orange-500/[0.09] border border-orange-500/30 space-y-2.5">
          <p className="flex items-center gap-2 font-semibold text-[#16181A] text-sm">
            <span className="text-lg" aria-hidden>⚠️</span>
            {eligible.length === 1 ? 'Chybí ti uzávěrka za den, kdy jsi měl/a směnu' : `Chybí ti ${eligible.length} uzávěrky za dny, kdy jsi měl/a směnu`}
          </p>
          <p className="text-xs text-black/55">Vyplň ji prosím — vyber den a projdi formulář níže.</p>
          <div className="flex flex-wrap gap-2">
            {eligible.map(s => (
              <button key={s.id} type="button" onClick={() => pickShift(s)}
                className={`rounded-full border px-3.5 py-2 text-xs font-semibold capitalize transition ${
                  form.date === s.date ? 'bg-orange-500 text-white border-orange-500' : 'bg-white border-orange-500/30 text-orange-700 hover:border-orange-500/60'
                }`}>
                {new Date(s.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                <span className="font-normal opacity-70"> · {s.startTime}–{s.endTime}</span>
              </button>
            ))}
          </div>
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
                <button type="button" onClick={() => scrollToStep(i)} title={`Přejít na krok ${lbl}`}
                  className="flex items-center gap-2 shrink-0 group">
                  <span
                    className={`grid place-items-center h-6 w-6 shrink-0 rounded-full text-[11px] font-bold transition ${
                      stepDone[i]
                        ? 'bg-[#C8F542] text-black'
                        : 'bg-black/[0.08] text-black/45 group-hover:bg-black/[0.14]'
                    }`}
                  >
                    {stepDone[i] ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
                    ) : i + 1}
                  </span>
                  <span className={`text-[11px] font-semibold hidden sm:inline transition ${stepDone[i] ? 'text-[#5B7A08]' : 'text-black/45'}`}>{lbl}</span>
                </button>
                {i < totalSteps - 1 && <span className={`h-px flex-1 transition ${stepDone[i] ? 'bg-[#C8F542]/60' : 'bg-black/[0.09]'}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Running total that follows the person through the form, so every
            field they fill visibly moves the number they'll be checking against. */}
        {(form.openingCash !== '' || form.cashRevenue !== '') && (
          <button type="button" onClick={() => scrollToStep(3)}
            className="sticky top-2 z-20 w-full flex items-center justify-between gap-3 rounded-2xl bg-[#16181A]/95 backdrop-blur px-4 py-2.5 text-white shadow-lg shadow-black/15 active:scale-[0.99] transition">
            <span className="text-xs font-medium text-white/70">Očekáváno v kase</span>
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="text-base font-bold tabular-nums">{money(expected)}</span>
              {diff !== null && (
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${
                  diff === 0 ? 'bg-[#C8F542] text-black' : diff > 0 ? 'bg-[#0A84FF] text-white' : 'bg-red-500 text-white'
                }`}>
                  {diff === 0 ? 'sedí ✓' : `${diff > 0 ? '+' : ''}${money(diff)}`}
                </span>
              )}
            </span>
          </button>
        )}


        {/* Step 1 — opening cash + when/which shift */}
        {dayEvents.length > 0 && (
          <div className="rounded-2xl border border-[#0A84FF]/25 bg-[#0A84FF]/[0.06] p-4 space-y-2">
            <p className="text-sm font-semibold text-[#16181A]">🎪 Uzávěrka za akci?</p>
            <p className="text-[12px] text-black/45">
              Venkovní akce má vlastní kasu — její uzávěrka se ukládá zvlášť a nemíchá se
              s kasou podniku. Denní uzávěrku podniku pak uděláš normálně vedle.
            </p>
            <select value={eventId}
              onChange={e => setEventId(e.target.value === '' ? '' : parseInt(e.target.value))}
              className={inputClass}>
              <option value="">Ne — běžná uzávěrka podniku</option>
              {dayEvents.map(ev => <option key={ev.id} value={ev.id}>Akce: {ev.title}</option>)}
            </select>
          </div>
        )}

        <Step refCb={el => { stepRefs.current[0] = el; }} num={1} total={totalSteps} icon="clock" title="Kasa na začátku"
          subtitle="Kolik bylo v kase, když směna začala.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0 space-y-2">
              {field('Kasa na začátku', 'openingCash', {
                hint: carry
                  ? `Předchozí směna (${new Date(carry.date + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}${carry.label ? `, ${carry.label}` : ''}) skončila s ${money(carry.amount)}.`
                  : 'Počáteční stav hotovosti v kase.',
              })}
              {closings.some(c => c.date === form.date) && (
                <p className="text-[11px] font-medium text-orange-700 bg-orange-500/[0.1] border border-orange-500/25 rounded-xl px-3 py-2">
                  Za tenhle den už uzávěrka existuje. Pokračuj, jen když zavíráš další směnu téhož dne.
                </p>
              )}
              {carry && (
                <div className="flex items-center gap-2 flex-wrap">
                  {n(form.openingCash) === Math.round(carry.amount) ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-3 py-1 text-[11px] font-semibold">
                      <Icon name="check" size={12} /> Převzato z předchozí směny
                    </span>
                  ) : (
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, openingCash: String(Math.round(carry.amount)) }))}
                      className="rounded-full glass border border-black/10 px-3 py-1 text-[11px] font-medium text-[#16181A] hover:bg-black/[0.05]">
                      Převzít {money(carry.amount)} z předchozí směny
                    </button>
                  )}
                </div>
              )}
            </div>
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
        <Step refCb={el => { stepRefs.current[1] = el; }} num={2} total={totalSteps} icon="trend" title="Tržby"
          subtitle="Co za směnu přišlo — hotově, kartou a spropitné.">
          {pos && (
            <div className="rounded-2xl bg-[#0A84FF]/[0.07] border border-[#0A84FF]/25 p-4 mb-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#16181A] min-w-0">
                  💳 Pokladna {pos.placeName ? `(${pos.placeName})` : 'Storyous'}
                  <span className="font-normal text-black/50"> · {pos.bills} účtenek · hotově {money(pos.cash)} · kartou {money(pos.card)}{pos.other > 0 ? ` · jinak ${money(pos.other)}` : ''}{pos.tips > 0 ? ` · spropitné ${money(pos.tips)}` : ''}</span>
                </p>
                <button type="button"
                  onClick={() => setForm(f => ({
                    ...f,
                    cashRevenue: String(pos.cash),
                    cardRevenue: String(pos.card + pos.other),
                    tips: pos.tips > 0 ? String(pos.tips) : f.tips,
                  }))}
                  className="shrink-0 rounded-full bg-[#16181A] text-white px-4 py-1.5 text-xs font-bold hover:bg-black transition">
                  Předvyplnit z pokladny
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Tržba hotově', 'cashRevenue', { hint: 'Hotovost přijatá do kasy.' })}
            {field('Tržba kartou', 'cardRevenue', { hint: 'Nejde do kasy — jen evidence.' })}
            {field('Spropitné', 'tips', {
              hint: tipsInDrawer
                ? 'Zůstává v kase — připočte se k očekávanému stavu.'
                : 'Bereš ho stranou — očekávaný stav kasy neovlivní.',
            })}
            {field('Zákazníků (volitelné)', 'customers', { unit: null, placeholder: 'počet' })}
          </div>
          <Toggle
            title="Spropitné v hotovosti zůstává v kase"
            hint="Zapni, když spropitné fyzicky leží v kase — jinak by se pokaždé ukazoval falešný přebytek."
            on={tipsInDrawer}
            onChange={setTipsInDrawer}
          />
        </Step>

        {/* Step 3 — expenses & payouts */}
        <Step refCb={el => { stepRefs.current[2] = el; }} num={3} total={totalSteps} icon="box" title="Výdaje a odvody"
          subtitle="Co z kasy odešlo během směny.">
          <MovementEditor
            movements={movements} setMovements={setMovements}
            payDailyCash={payDailyCash} money={money} symbol={symbol}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!hasMoved('expense') && !hasMoved('deposit')
              && field('Výdaje z kasy', 'expenses', { hint: 'Nákupy apod. placené z kasy.' })}
            {!hasMoved('removal') && field('Odloženo ven', 'cashRemoved', { hint: 'Do trezoru / odvod.' })}
            {payDailyCash && !hasMoved('payout') && field('Moje výplata dnes', 'selfPayout', {
              hint: payoutFromRegister
                ? 'Vyplaceno z kasy — odečte se z očekávaného stavu.'
                : 'Vyplaceno bokem (ne z kasy) — očekávaný stav kasy neovlivní.',
            })}
          </div>
          {payDailyCash && (
            <Toggle
              title="Výplatu beru z kasy"
              hint={payoutFromRegister
                ? 'Zapnuto — výplata se odečte z očekávaného stavu kasy.'
                : 'Vypnuto — bereš ji bokem, kasy se netýká.'}
              on={payoutFromRegister}
              onChange={setPayoutFromRegister}
            />
          )}
        </Step>

        {/* Kolegové na směně — one person closes for the whole crew */}
        {coworkers.length > 0 && (
          <section className="relative rounded-3xl border border-[#C8F542]/40 bg-[#C8F542]/[0.06] p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="flex-shrink-0 grid place-items-center h-11 w-11 rounded-2xl bg-white text-[#16181A] border border-black/[0.06] shadow-sm">
                <Icon name="users" size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold tracking-tight text-[#16181A] leading-tight">Byl někdo další na směně?</h4>
                <p className="text-black/45 text-[13px] mt-0.5">
                  Zaškrtni kolegy a uzavři to i za ně{payDailyCash ? ' i s výplatou' : ''}. Kdo neměl směnu, tomu se automaticky přidá a dostane stejný čas jako ty (vedení pak může upravit).
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {coworkers.map(cw => {
                const sel = coworkerSel[cw.id];
                const on = !!sel?.on;
                return (
                  <div key={cw.id} className={`rounded-2xl border px-4 py-3 transition ${on ? 'bg-white border-[#C8F542]/50' : 'bg-white/50 border-black/[0.08]'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setCoworkerSel(s => ({ ...s, [cw.id]: { on: !on, payout: s[cw.id]?.payout ?? '' } }))}
                        className="flex items-center gap-2.5 min-w-0 text-left"
                      >
                        <span className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-full border-2 transition ${on ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/20 text-transparent'}`}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
                        </span>
                        <span className="text-lg shrink-0">{cw.avatar ?? '👤'}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[#16181A] truncate">{cw.name}</span>
                          {cw.hadShift
                            ? <span className="block text-xs text-black/45 tabular-nums">{cw.startTime}–{cw.endTime}</span>
                            : <span className="block text-xs text-orange-600">bez naplánované směny — přidá se</span>}
                        </span>
                      </button>
                      {on && payDailyCash && (
                        <div className="relative shrink-0 w-32">
                          <input
                            type="number" inputMode="numeric"
                            value={sel?.payout ?? ''}
                            onChange={e => setCoworkerSel(s => ({ ...s, [cw.id]: { on: true, payout: e.target.value } }))}
                            placeholder="výplata" className={`${inputClass} pr-9 !py-2.5 text-sm`} />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-black/35">{symbol}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Step 4 — the climax: expected vs counted */}
        <Step refCb={el => { stepRefs.current[3] = el; }} num={4} total={totalSteps} icon="check" tone="climax" title="Kontrola kasy"
          subtitle="Spočítej hotovost v kase a porovnej s očekáváním.">
          {/* The arithmetic spelled out — no mystery number to argue with. */}
          <div className="rounded-2xl bg-white/70 border border-black/[0.06] px-4 py-3.5 space-y-1.5">
            {expectedLines.map(l => (
              <div key={l.label} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-black/50 min-w-0 truncate">{l.label}</span>
                <span className="text-black/70 tabular-nums shrink-0 whitespace-nowrap">
                  {l.sign < 0 ? '− ' : '+ '}{money(l.amount)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 pt-2.5 mt-1 border-t border-black/[0.08]">
              <span className="text-sm font-semibold text-[#16181A] min-w-0">Očekávaný stav kasy</span>
              <span className="text-lg font-bold tracking-tight text-[#16181A] tabular-nums shrink-0 whitespace-nowrap">{money(expected)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label className="block text-xs uppercase tracking-wider text-black/45">Skutečný stav kasy na konci *</label>
              {denomSet.length > 0 && (
                <div className="flex gap-1 rounded-full glass border border-black/[0.07] p-1">
                  {([[false, 'Zadat celkem'], [true, 'Spočítat bankovky']] as const).map(([mode, lbl]) => (
                    <button key={String(mode)} type="button"
                      onClick={() => setCountMode(mode)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                        countMode === mode ? 'bg-[#16181A] text-white' : 'text-black/55 hover:text-black'
                      }`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {countMode ? (
              <>
                <DrawerCounter denomSet={denomSet} counts={denoms} money={money} symbol={symbol}
                  onChange={next => {
                    setDenoms(next);
                    // The counter drives the total, so the rest of the form
                    // (diff, hints, submit) needs no special case.
                    setForm(f => ({
                      ...f,
                      closingCash: hasDenominations(next) ? String(Math.round(sumDenominations(next))) : '',
                    }));
                  }} />
                <p className="text-[11px] text-black/40">
                  Napiš ke každé bankovce a minci, kolik jich v kase je — součet se doplní sám.
                </p>
              </>
            ) : (
              <div className="relative">
                <input type="number" inputMode="numeric" required value={form.closingCash} onChange={set('closingCash')}
                  placeholder="0" className={`${inputClass} pr-12 !py-4 text-base font-semibold`} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">{symbol}</span>
              </div>
            )}
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
              <span className="text-lg font-bold tabular-nums whitespace-nowrap">{diff > 0 ? '+' : ''}{money(diff)}</span>
            </div>
          )}

          {/* When it doesn't match: say why, so the employer isn't left guessing. */}
          {diff !== null && diff !== 0 && (
            <div className="rounded-2xl bg-white/60 border border-black/[0.07] p-4 space-y-3">
              <p className="text-sm font-semibold text-[#16181A]">Čím to nejspíš je?</p>

              {hints.length > 0 && (
                <div className="space-y-1.5">
                  {hints.map((h, i) => (
                    <p key={i} className="text-[12px] text-[#5B7A08] bg-[#C8F542]/[0.14] border border-[#C8F542]/25 rounded-xl px-3 py-2">
                      {h}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {DIFF_REASONS.map(r => (
                  <button key={r.id} type="button" title={r.hint}
                    onClick={() => setDiffReason(diffReason === r.id ? '' : r.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      diffReason === r.id ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'
                    }`}>
                    {r.label}
                  </button>
                ))}
              </div>

              <textarea value={diffNote} onChange={e => setDiffNote(e.target.value)} rows={2}
                placeholder="Co se stalo — vlastními slovy (nepovinné)"
                className={`${inputClass} resize-none py-2`} />
            </div>
          )}

          {/* End-of-shift removal — the drawer gets counted FIRST (that is what
              the diff above judges), and only then does the surplus go to the
              safe. What stays here is what the next shift takes over. */}
          {form.closingCash !== '' && (
            <div className="rounded-2xl bg-white/60 border border-black/[0.07] p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-[#16181A]">Odvod na konci směny</p>
                <p className="text-[12px] text-black/45 mt-0.5">
                  {drawerFloat != null
                    ? `Podnik má nastavený stav kasy ${drawerFloat.toLocaleString('cs-CZ')} ${symbol} — kolik odložit, spočítám tak, aby v kase zůstalo přesně tolik. Číslo můžeš upravit.`
                    : 'Napiš, kolik v kase necháváš pro další směnu — kolik odložit spočítám. Nech prázdné, pokud v kase zůstává všechno.'}
                </p>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">V kase necháváš</label>
                <div className="relative">
                  <input type="number" inputMode="numeric" value={leaveCash}
                    onChange={e => setLeaveCash(e.target.value)}
                    placeholder={`${n(form.closingCash)}`}
                    className={`${inputClass} pr-12`} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">{symbol}</span>
                </div>
              </div>
              {leaveTooHigh ? (
                <p className="text-[13px] text-red-600 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2">
                  V kase je napočítáno jen {money(n(form.closingCash))} — nemůže v ní zůstat víc.
                </p>
              ) : leaveCash !== '' && finalRemoval > 0 ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#16181A] text-white px-4 py-3">
                  <span className="text-sm font-medium flex items-center gap-2 min-w-0">
                    <Icon name="swap" size={16} /> Odlož ven (trezor / odvod)
                  </span>
                  <span className="text-lg font-bold tabular-nums shrink-0 whitespace-nowrap">{money(finalRemoval)}</span>
                </div>
              ) : leaveCash !== '' ? (
                <p className="text-[13px] text-black/45">V kase zůstává všechno — žádný odvod.</p>
              ) : (
                <p className="text-[12px] text-black/35">Nech prázdné, pokud v kase zůstává všechno.</p>
              )}
            </div>
          )}
        </Step>

        <div>
          {missingRequired.length > 0 && (
            <div className="rounded-2xl bg-red-500/[0.07] border border-red-500/25 p-4">
              <p className="text-sm font-semibold text-red-600 flex items-center gap-2">
                <Icon name="warning" size={16} /> Před uzávěrkou je potřeba dokončit:
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {missingRequired.map(p => (
                  <span key={p.id} className="rounded-full bg-white/70 border border-red-500/20 px-3 py-1.5 text-sm text-[#16181A]">
                    {p.icon ?? '📋'} {p.name}
                  </span>
                ))}
              </div>
              <p className="text-[12px] text-black/45 mt-2">Najdeš je v sekci Postupy. Jakmile je někdo ze směny dokončí, uzávěrka půjde odeslat.</p>
            </div>
          )}

          {todayRuns.length > 0 && (
            <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">Dnešní postupy</p>
              <div className="flex flex-wrap gap-1.5">
                {todayRuns.map((r: any) => {
                  const missing = Math.max(0, (Number(r.total_items) || 0)
                    - (Array.isArray(r.checked_items) ? r.checked_items.length : 0)
                    - (Array.isArray(r.skipped_items) ? r.skipped_items.length : 0));
                  const running = r.status === 'running';
                  return (
                    <span key={r.id} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                      running ? 'bg-orange-500/12 text-orange-600'
                      : missing > 0 ? 'bg-amber-500/12 text-amber-700'
                      : 'bg-[#C8F542]/15 text-[#5B7A08]'
                    }`}>
                      {r.procedure_icon ?? '📋'} {r.procedure_name}
                      {running ? ' · běží' : missing > 0 ? ` · ${missing} nedokončeno` : ' ✓'}
                    </span>
                  );
                })}
              </div>
              {todayRuns.some((r: any) => r.status === 'running') && (
                <p className="text-[12px] text-orange-600 mt-2">Postup ještě běží — dokonči ho, ať se do hodnocení nezapíše jako nedodělaný.</p>
              )}
            </div>
          )}

          <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] p-4 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-black/45">🤝 Předávka pro další směnu <span className="normal-case font-normal text-black/35">(nepovinné — uvidí ji tým na přehledu a tabletu)</span></p>
            <input value={hoTodo} onChange={e => setHoTodo(e.target.value)} maxLength={500}
              placeholder="Co zbývá dodělat…"
              className={inputClass} />
            <input value={hoRunningOut} onChange={e => setHoRunningOut(e.target.value)} maxLength={500}
              placeholder="Co dochází / objednat…"
              className={inputClass} />
            <input value={hoMessage} onChange={e => setHoMessage(e.target.value)} maxLength={500}
              placeholder="Vzkaz pro další směnu…"
              className={inputClass} />
          </div>

          <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Poznámka</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Cokoliv důležitého k předání…" className={`${inputClass} resize-none`} />
        </div>

        <button type="submit" disabled={submitting}
          className="w-full sm:w-auto rounded-full bg-[#16181A] text-white font-semibold px-7 py-3.5 text-sm hover:bg-black disabled:opacity-50 transition-all inline-flex items-center justify-center gap-2">
          {submitting ? 'Odesílám…' : <>Odeslat uzávěrku <Icon name="check" size={17} /></>}
        </button>
      </form>

      {/* My past closings (hidden on the shared kiosk and when embedded) */}
      {!isKiosk && !hideHistory && (
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
                  <button
                    type="button"
                    title="Smazat uzávěrku"
                    onClick={async () => {
                      if (!confirm('Smazat tuhle uzávěrku? Po smazání ji můžeš vyplnit znovu správně.')) return;
                      const res = await fetch(`/api/closings/${c.id}`, { method: 'DELETE' });
                      if (res.ok) setClosings(prev => prev.filter(x => x.id !== c.id));
                      else { const d = await res.json().catch(() => ({})); setErr(d.error || 'Smazání se nepodařilo.'); }
                    }}
                    className="rounded-full w-8 h-8 flex items-center justify-center glass text-black/40 hover:text-red-600 transition-colors"
                  >✕</button>
                  <span className={`text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap shrink-0 ${
                    d === 0 ? 'bg-[#C8F542]/15 text-[#5B7A08]' : d > 0 ? 'bg-[#0A84FF]/15 text-[#0A6FE0]' : 'bg-red-500/15 text-red-600'
                  }`}>{d === 0 ? 'Sedí' : d > 0 ? `Přebytek +${money(d)}` : `Manko ${money(d)}`}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="min-w-0"><span className="block text-black/40 truncate">Tržba hotově</span><p className="font-semibold text-[#16181A] tabular-nums truncate">{money(c.cash_revenue)}</p></div>
                  <div className="min-w-0"><span className="block text-black/40 truncate">Tržba kartou</span><p className="font-semibold text-[#16181A] tabular-nums truncate">{money(c.card_revenue)}</p></div>
                  <div className="min-w-0"><span className="block text-black/40 truncate">Odloženo</span><p className="font-semibold text-[#16181A] tabular-nums truncate">{money(c.cash_removed)}</p></div>
                  {payDailyCash && <div className="min-w-0"><span className="block text-black/40 truncate">Moje výplata</span><p className="font-semibold text-[#16181A] tabular-nums truncate">{money(c.self_payout)}</p></div>}
                </div>
                {(c.movements?.length ?? 0) > 0 && (
                  <div className="mt-3 rounded-2xl bg-black/[0.03] border border-black/[0.06] p-3">
                    <p className="text-[11px] uppercase tracking-wider text-black/45 font-semibold mb-1.5">Pohyby v kase</p>
                    <div className="divide-y divide-black/[0.06]">
                      {c.movements!.map((m, i) => {
                        const spec = MOVEMENT_KINDS.find(k => k.kind === m.kind);
                        return (
                          <div key={i} className="flex items-center gap-2 py-1.5 text-sm">
                            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-black/40">{movementLabel(m.kind)}</span>
                            <span className="min-w-0 flex-1 truncate text-black/55">{m.note || '—'}</span>
                            <span className="shrink-0 font-semibold text-[#16181A] tabular-nums">
                              {spec?.sign === 1 ? '+' : '−'}{money(m.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {hasDenominations(c.denominations) && (
                  <div className="mt-3 rounded-2xl bg-black/[0.03] border border-black/[0.06] p-3">
                    <p className="text-[11px] uppercase tracking-wider text-black/45 font-semibold mb-1.5">Kasa napočítaná po bankovkách</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(c.denominations!)
                        .sort((a, b) => Number(b[0]) - Number(a[0]))
                        .map(([denom, count]) => (
                          <span key={denom} className="rounded-full bg-white border border-black/[0.08] px-2.5 py-1 text-xs tabular-nums text-[#16181A]">
                            <strong>{count}×</strong> {Number(denom).toLocaleString('cs-CZ')}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
                {(Number(c.final_removal) || 0) > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-black/[0.03] border border-black/[0.06] px-3 py-2.5 text-sm">
                    <span className="text-black/55 whitespace-nowrap">Odvod na konci: <strong className="text-[#16181A] tabular-nums">−{money(Number(c.final_removal))}</strong></span>
                    <span className="text-black/55 whitespace-nowrap">V kase zůstalo: <strong className="text-[#16181A] tabular-nums">{money(cashLeft(c))}</strong></span>
                  </div>
                )}
                {(c.diff_reason || c.diff_note) && (
                  <div className="mt-3 rounded-2xl bg-amber-500/[0.08] border border-amber-500/25 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold mb-1">Proč kasa nesedí</p>
                    {c.diff_reason && <p className="text-sm font-medium text-[#16181A]">{diffReasonLabel(c.diff_reason)}</p>}
                    {c.diff_note && <p className="text-sm text-black/55 mt-0.5">{c.diff_note}</p>}
                  </div>
                )}
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
          <div className="modal-sheet rounded-3xl p-6 max-w-sm w-full text-center max-h-[85vh] overflow-y-auto scrollbar-thin" onClick={e => e.stopPropagation()}>
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
