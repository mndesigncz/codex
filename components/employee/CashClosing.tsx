'use client';

// Uzávěrka směny — formulář a (pro zaměstnance) stránka s plochou widgetů.
//
// Kolo 69 (balík B5a, spec §6.2): na záložce Uzávěrka je formulář hlavním
// nástrojem plochy `zamestnanec.uzaverka`. Výzva „Chybí ti uzávěrka" nad ním
// a historie „Moje uzávěrky" pod ním jsou widgety (uzaverky.moje_uzaverka,
// uzaverky.moje_historie) — dají se přesunout, odebrat a nahradit předávkou
// nebo povinnými postupy. Tablet a vedení („Nová uzávěrka") dostávají dál
// holý formulář s vlastní hlavičkou: tablet plochu nemá (B9) a vedení jde
// do formuláře z přehledu uzávěrek.
//
// Designové opravy z auditu (DP §1.3, §4 D): kroky už nejsou karty v kartě se
// štítkem „KROK 1/4", ale oddíly jedné karty oddělené linkou; hlavní
// „Odeslat uzávěrku" je jediná limetka (dřív tmavá) a vedlejší „Přidat"
// sekundární (dřív limetka); přepínače jsou SwitchRow, ruční štítky t-label,
// název ikony postupu se už netiskne jako text a `confirm()` nahradil Modal.

import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../Icons';
import { Avatar, Button, Chip, Modal, PageHeader, Segmented, SwitchRow } from '../ui';
import {
  Closing, expectedCash, cashDifference, expectedCashLines,
  type Movement, type MovementKind, MOVEMENT_KINDS, movementLabel, sumMovements,
  DIFF_REASONS, explainDifference,
  type DenominationCounts, denominationsFor, sumDenominations, hasDenominations,
} from '@/lib/closing';
import { useCurrency, useMoney, useSymbol } from '../CurrencyProvider';
import { pragueToday } from '@/lib/pragueTime';
import { useModal } from '@/lib/useModal';
import { okJson } from '@/lib/api';
import { useOtevreniNavodu } from '@/lib/otevriNavod';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import { KLIC_VYPLNIT, UDALOST_VYPLNIT } from '@/lib/uzaverkyPrehled';

const inputClass =
  'w-full field border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition text-sm';

const today = () => pragueToday();

type FormState = {
  date: string; shiftLabel: string;
  /** The card part of `tips` — evidence only, never in the drawer. */
  tipsCard: string;
  openingCash: string; cashRevenue: string; cardRevenue: string; tips: string;
  expenses: string; cashRemoved: string; selfPayout: string; closingCash: string;
  customers: string; notes: string;
};

const emptyForm = (): FormState => ({
  date: today(), shiftLabel: '', tipsCard: '',
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
    <div className="well overflow-hidden !p-0">
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
                  /* Počítadlo bankovek: bez jména je to pro odečítač jen
                     „číselné pole" v řadě dvanácti stejných. */
                  aria-label={`Počet kusů ${fmtDenom(d)} ${symbol}`}
                  placeholder="0"
                  className="w-14 h-9 text-center field rounded-xl border border-black/[0.08] text-sm font-semibold text-[#16181A] tabular-nums placeholder-black/25 focus:border-[#C8F542]/50 focus:outline-none"
                />
                {/* Plus bylo limetkové — dvanáct limetek pod sebou vedle jediné hlavní akce. */}
                <button type="button" onClick={() => bump(d, 1)} aria-label={`Přidat ${fmtDenom(d)} ${symbol}`}
                  className="rounded-xl glass w-9 h-9 flex items-center justify-center text-lg leading-none text-black/60 hover:text-black active:scale-95 transition">+</button>
              </div>
              <span className={`w-20 shrink-0 text-right text-xs tabular-nums ${cnt > 0 ? 'text-[#5B7A08] font-semibold' : 'text-black/20'}`}>
                {cnt > 0 ? money(d * cnt) : '—'}
              </span>
            </div>
          );
        })}
      </div>
      {/* Součet už není druhá inkoustová plocha — ta je v obsahu jen jedna (Očekáváno v kase). */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[var(--surface-line)]">
        <span className="text-sm font-semibold text-[#16181A]">Napočítáno v kase</span>
        <span className="text-lg font-bold tabular-nums text-[#16181A]">{money(sumDenominations(counts))}</span>
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
    <div className="well p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold text-[#16181A]">Pohyby v kase</p>
        <p className="t-meta">Rozepiš, co se z kasy bralo — vedení pak vidí za co.</p>
      </div>

      {movements.length > 0 && (
        <div className="divide-y divide-black/[0.06]">
          {movements.map((m, i) => {
            const spec = MOVEMENT_KINDS.find(k => k.kind === m.kind);
            return (
              <div key={i} className="flex items-center gap-2.5 py-2">
                <Chip tone={spec?.sign === 1 ? 'ok' : 'muted'} size="sm" className="shrink-0">{movementLabel(m.kind)}</Chip>
                <span className="min-w-0 flex-1 truncate text-sm text-black/60">{m.note || '—'}</span>
                <span className="shrink-0 text-sm font-semibold text-[#16181A] tabular-nums">
                  {spec?.sign === 1 ? '+' : '−'}{money(m.amount)}
                </span>
                <button type="button" onClick={() => setMovements(movements.filter((_, idx) => idx !== i))}
                  aria-label={`Odebrat pohyb ${movementLabel(m.kind)}`}
                  className="shrink-0 btn-icon btn-icon-danger"><Icon name="close" size={15} /></button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {kinds.map(k => (
          <button key={k.kind} type="button" onClick={() => setKind(k.kind)}
            title={k.hint} aria-pressed={kind === k.kind}
            className={`filter-pill tap-target-sm ${kind === k.kind ? 'seg-on' : 'seg-off glass'}`}>
            {k.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative w-32 shrink-0">
          <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            aria-label={`Částka pohybu v ${symbol}`}
            placeholder="0"
            className={`${inputClass} py-2 pr-10 tabular-nums`} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-black/35">{symbol}</span>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          aria-label="Za co byl pohyb v kase"
          placeholder={MOVEMENT_KINDS.find(k => k.kind === kind)?.hint ?? 'Za co'}
          className={`${inputClass} py-2 flex-1 min-w-[8rem]`} />
        {/* Vedlejší akce: limetka patří jen „Odeslat uzávěrku" (DP §4 D). */}
        <Button variant="secondary" size="sm" icon="plus" onClick={add} disabled={!amount} className="shrink-0 grow sm:grow-0 justify-center">
          Přidat
        </Button>
      </div>
    </div>
  );
}

// A numbered, iconed section panel — one guided step of the closing flow.
/** „7 h 40 min" z milisekund. */
function hodinyMinuty(ms: number): string {
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

function Step({
  icon, title, subtitle, children, refCb, guide,
}: {
  icon: string; title: string; subtitle: string;
  children: React.ReactNode;
  refCb?: (el: HTMLElement | null) => void;
  /** Návod připnutý k tomuhle kroku — viz „Připnout k uzávěrce" v Návodech. */
  guide?: { id: number; title: string; href: string | null; onOpen?: () => void } | null;
}) {
  // Krok je oddíl jedné karty formuláře oddělený linkou, ne karta v kartě
  // (DP §4 D). Štítek „KROK 1/4" nad nadpisem zmizel — pořadí ukazuje
  // stepper nahoře jednou, ne nadpis každého kroku.
  return (
    <section ref={refCb} className="scroll-mt-20 border-t border-[var(--surface-line)] pt-5 sm:pt-6 space-y-4 sm:space-y-5">
      <div className="flex items-start gap-3.5">
        <span aria-hidden className="well grid h-11 w-11 shrink-0 place-items-center !p-0">
          <Icon name={icon} size={20} className="text-black/55" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="t-card">{title}</h3>
          <p className="t-meta mt-0.5">{subtitle}</p>
          {/* Když kasa nesedí, odpověď na „co teď" nesmí být v jiné záložce. */}
          {guide && (guide.href || guide.onOpen) && (
            guide.onOpen ? (
              <Button variant="secondary" size="sm" icon="book" onClick={guide.onOpen} className="mt-2">{guide.title}</Button>
            ) : (
              <a href={guide.href as string} className="btn btn-secondary btn-sm mt-2 inline-flex items-center gap-1.5">
                <Icon name="book" size={15} /> {guide.title}
              </a>
            )
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

// Přepínače peněžních toků uzávěrky (odkud výplata, kde je spropitné) —
// obojí přímo mění očekávaný stav kasy. Dřív vlastní kopie přepínače (jedna
// z devíti v aplikaci), teď SwitchRow z components/ui.
function Toggle({ title, hint, on, onChange }: {
  title: string; hint: string; on: boolean; onChange: (v: boolean) => void;
}) {
  return <SwitchRow as="div" title={title} hint={hint} checked={on} onChange={onChange} className="well !py-2 px-4" />;
}

type EligibleShift = {
  id: number; date: string; startTime: string; endTime: string; type: string;
  employeeId?: number; employeeName?: string; employeeAvatar?: string;
};

type Member = { id: number; name: string; avatar?: string };

type Coworker = { id: number; name: string; avatar?: string; startTime: string | null; endTime: string | null; hadShift?: boolean };

type PropsUzaverky = {
  user: { id: number; name: string };
  /** Vložený formulář (vedení z přehledu uzávěrek) — bez plochy. */
  hideHistory?: boolean;
  onSubmitted?: () => void;
  initialDate?: string;
};

/**
 * Záložka Uzávěrka. Zaměstnanec (a vedoucí na své záložce) dostane plochu
 * s widgety a formulářem jako nástrojem; tablet (uživatel s rolí kiosk)
 * a vložený formulář vedení dostanou jen formulář s vlastní hlavičkou.
 * Rozhoduje se tady, protože layouty, které CashClosing vykreslují, patří
 * jiným balíkům a nový prop by do nich musel sahat.
 */
export default function CashClosing(props: PropsUzaverky) {
  const tablet = (props.user as { role?: string }).role === 'kiosk';
  if (tablet || props.hideHistory || props.onSubmitted) return <FormularUzaverky {...props} />;
  return <StrankaUzaverky user={props.user} />;
}

function StrankaUzaverky({ user }: { user: PropsUzaverky['user'] }) {
  const smi = useSmi();
  // Kdo má jen předávku (kuchař), formulář nedostane — zůstane mu plocha
  // s předávkou (poznámka katalogu). Formulář by mu API stejně neodeslalo.
  return (
    <PlochaWidgetu
      stranka="zamestnanec.uzaverka"
      hlavicka={{ title: 'Uzávěrka', subtitle: 'Spočítej kasu na konci směny — tržby se předvyplní z pokladny.', hintId: 'cashclosing' }}
      nastroj={smi('uzaverky.vytvorit') ? <FormularUzaverky user={user} vPlose /> : null}
    />
  );
}

function FormularUzaverky({ user, onSubmitted, initialDate, vPlose = false }: PropsUzaverky & {
  /** Nástroj plochy: hlavičku kreslí plocha, výzvu a historii widgety. */
  vPlose?: boolean;
}) {
  const [closings, setClosings] = useState<Closing[]>([]);
  // Návod připnutý k uzávěrce („Připnout k uzávěrce" v Návodech). Ukazuje se
  // u kroku „Kontrola kasy" — jediného místa v aplikaci, kde vzniká manko.
  // Když se seznam nenačte, krok vypadá přesně jako dřív.
  const navodOdkaz = useOtevreniNavodu();
  const [navodUzaverkyRaw, setNavodUzaverkyRaw] = useState<{ id: number; title: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/guides').then(okJson)
      .then(d => {
        if (!alive || !Array.isArray(d.guides)) return;
        const g = d.guides.find((x: any) => x.forClosing === true && x.approved !== false);
        setNavodUzaverkyRaw(g ? { id: Number(g.id), title: String(g.title) } : null);
      })
      .catch(() => { /* bez návodu se uzávěrka chová jako dřív */ });
    return () => { alive = false; };
  }, []);
  const navodUzaverky = navodUzaverkyRaw ? {
    id: navodUzaverkyRaw.id,
    title: navodUzaverkyRaw.title,
    href: navodOdkaz.guideHref ? navodOdkaz.guideHref(navodUzaverkyRaw.id) : null,
    onOpen: navodOdkaz.onOpenGuide ? () => navodOdkaz.onOpenGuide!(navodUzaverkyRaw.id) : undefined,
  } : null;
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
  // Which shift this closing is for — matters on a day somebody worked twice.
  const [pickedShiftId, setPickedShiftId] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
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
  // Dny mezi poslední uzávěrkou a dneškem, kdy někdo pracoval, ale nikdo
  // nezavřel. Hotovost z nich leží v kase, ale v rovnici pro dnešek není —
  // vyšel by přebytek přesně ve výši té tržby a člověk by ji „srovnal" tím,
  // že ji dopíše do dneška. Přesně tak sobota potichu splynula s pondělím.
  const [gapDays, setGapDays] = useState<string[]>([]);
  // Today's procedure runs — the closing is the natural moment to notice an
  // unfinished closing checklist.
  const [todayRuns, setTodayRuns] = useState<any[]>([]);
  // Procedures the employer marked as mandatory before the closing.
  const [requiredProcs, setRequiredProcs] = useState<{ id: number; name: string; icon?: string }[]>([]);
  // Víme vůbec, co se dnes odškrtlo? Bez toho se nesmí blokovat.
  const [runsZname, setRunsZname] = useState(false);
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
  const [dayEvents, setDayEvents] = useState<{ id: number; title: string; date: string }[]>([]);
  const [eventId, setEventId] = useState<number | ''>('');
  // Structured handover for the next shift.
  const [hoTodo, setHoTodo] = useState('');
  const [hoRunningOut, setHoRunningOut] = useState('');
  const [hoMessage, setHoMessage] = useState('');
  // Den, za který chce uzávěrku widget („Moje uzávěrka" → řádek směny). Z jiné
  // stránky přijde přes sessionStorage a uplatní se, až dorazí seznam směn.
  const chtenyDen = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const eligibleRef = useRef<EligibleShift[]>([]);
  // Vedení odesílá i s nedokončenými povinnými postupy — dřív přes confirm().
  const [potvrditPostupy, setPotvrditPostupy] = useState(false);
  const money = useMoney();
  const symbol = useSymbol();
  const { currency } = useCurrency();
  const denomSet = denominationsFor(currency);

  const load = async () => {
    // The team decides whether cash tips stay in the drawer — it changes the
    // expected-cash maths, so the form must start from the team's reality.
    try {
      const t = await fetch('/api/teams').then(okJson);
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
      const rd = await fetch('/api/procedures/runs?today=team').then(okJson);
      setTodayRuns(Array.isArray(rd?.runs) ? rd.runs : []);
      setRunsZname(true);
    } catch {
      // Běhy nejsou „nice-to-have": jsou to jediný doklad, že postup
      // proběhl. Když se nenačtou, prázdný seznam vypadá stejně jako
      // „dnes nikdo nic neudělal" — a uzávěrka pak zablokuje celý tým.
      // Neblokovat je v tomhle případě poctivější než blokovat naslepo.
      setRunsZname(false);
    }
    try {
      const pd = await fetch('/api/procedures').then(okJson);
      const list = Array.isArray(pd?.procedures) ? pd.procedures : [];
      setRequiredProcs(list.filter((p: any) => p.requireBeforeClosing === true)
        .map((p: any) => ({ id: p.id, name: p.name, icon: p.icon })));
    } catch { /* enforcement needs the list; without it nothing blocks */ }
    try {
      const d = await fetch('/api/closings').then(okJson);
      const list: Closing[] = Array.isArray(d.closings) ? d.closings : [];
      setClosings(list);
      // Closing a Friday night at 00:40 is still Friday's closing — the server
      // works out which business day that is, so the form doesn't open on the
      // wrong day just because midnight passed.
      if (typeof d.suggestedDate === 'string' && d.suggestedDate) {
        setForm(f => (f.date === today() && f.date !== d.suggestedDate
          ? { ...f, date: d.suggestedDate } : f));
      }
      // What the previous shift left in the drawer is what this one starts
      // with. Asked via a dedicated endpoint: the TEAM's last closing, not the
      // author's own — with alternating shifts my own last closing can be days
      // old (or a covered stub) and would manufacture a phantom manko.
      try {
        const dd = await fetch('/api/closings/drawer').then(okJson);
        setGapDays(Array.isArray(dd?.gapDays) ? dd.gapDays.map(String) : []);
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
        const evd = await fetch('/api/events').then(okJson);
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
      // Preselect the most recent unclosed shift for employees / kiosk —
      // nebo tu, o kterou si řekl widget.
      const chteny = chtenyDen.current;
      chtenyDen.current = null;
      const prvni = (chteny ? shifts.find(s => s.date === chteny) : undefined) ?? shifts[0];
      if (!d.isEmployer && prvni) {
        setForm(f => ({ ...f, date: prvni.date, shiftLabel: `${prvni.startTime}–${prvni.endTime}` }));
        if (chteny && prvni.date === chteny) setPickedShiftId(prvni.id);
        if (d.isKiosk) setSelEmployee(prvni.employeeId ?? null);
      } else if (chteny) {
        setForm(f => ({ ...f, date: chteny }));
      }
      if (chteny) requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch { /* ignore */ }
  };
  useEffect(() => {
    if (vPlose) {
      try {
        chtenyDen.current = sessionStorage.getItem(KLIC_VYPLNIT);
        sessionStorage.removeItem(KLIC_VYPLNIT);
      } catch { /* soukromé okno: formulář se otevře na výchozí směně */ }
    }
    load();
    // Jednorázově při připojení; `vPlose` se za života formuláře nemění.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Employer opened the form for a specific missing day → preselect that date.
  useEffect(() => {
    if (initialDate) setForm(f => ({ ...f, date: initialDate }));
  }, [initialDate]);

  // The shared kiosk always picks a shift (it defines WHO submits). Employees
  // and employers get a free date; the form is always visible for everyone.
  const isSelf = !isEmployer && !isKiosk;
  // Employee submitting for a day they weren't scheduled ⇒ goes to approval.
  const onShift = eligible.some(s => s.date === form.date);
  // Akce dne uzávěrky — a když se datum přepne jinam, vybraná akce se pustí,
  // ať se uzávěrka omylem nepřipíše k akci z jiného dne.
  const evsToday = useMemo(() => dayEvents.filter(ev => ev.date === form.date), [dayEvents, form.date]);
  useEffect(() => { if (eventId !== '' && !evsToday.some(ev => ev.id === eventId)) setEventId(''); }, [evsToday, eventId]);

  // Who is this closing FOR? Employee ⇒ themselves; employer/kiosk ⇒ the picked
  // member (null on employer means "me").
  const actorId = isSelf ? user.id : (selEmployee ?? meId);

  // Team members who ALSO had a shift that day and don't have their own closing
  // yet — one person can close for the whole crew.
  // Kolik si člověk za tuhle směnu vydělal a kolik dostane bodů. Vedení to
  // vidělo v Docházce, zaměstnanec nikde — a uzávěrka je přesně chvíle, kdy
  // se ptá „kolik to dneska bylo". Tablet dostane `available: false`
  // (sdílená obrazovka za barem) a karta se nevykreslí.
  const [mzda, setMzda] = useState<{
    wage: { ms: number; rate: number; earned: number; open: boolean; suspicious: boolean; noEntries: boolean };
    points: { tasks: number; procedures: number; taskPts: number; procPts: number; closingPts: number; total: number };
  } | null>(null);
  useEffect(() => {
    if (!form.date || actorId == null || isKiosk) { setMzda(null); return; }
    let alive = true;
    fetch(`/api/closings/wage?date=${form.date}&employeeId=${actorId}`).then(okJson)
      .then(d => { if (alive) setMzda(d?.available && d.wage ? { wage: d.wage, points: d.points } : null); })
      .catch(() => { if (alive) setMzda(null); });
    return () => { alive = false; };
  }, [form.date, actorId, isKiosk]);

  useEffect(() => {
    if (!form.date || actorId == null) { setCoworkers([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const d = await fetch(`/api/closings/coworkers?date=${form.date}&exclude=${actorId}`).then(okJson);
        if (!cancelled) setCoworkers(Array.isArray(d.coworkers) ? d.coworkers : []);
      } catch { if (!cancelled) setCoworkers([]); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.date, actorId]);

  const pickShift = (s: EligibleShift) => {
    setForm(f => ({ ...f, date: s.date, shiftLabel: `${s.startTime}–${s.endTime}` }));
    setPickedShiftId(s.id);
    if (isKiosk) setSelEmployee(s.employeeId ?? null);
  };
  eligibleRef.current = eligible;

  // Widget na téže ploše („Moje uzávěrka" → řádek směny) si řekne o den.
  useEffect(() => {
    if (!vPlose) return;
    const naVyplnit = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d?.hodnota) return;
      d.prijato = true;
      const s = eligibleRef.current.find(x => x.date === d.hodnota);
      if (s) {
        setForm(f => ({ ...f, date: s.date, shiftLabel: `${s.startTime}–${s.endTime}` }));
        setPickedShiftId(s.id);
      } else {
        setForm(f => ({ ...f, date: d.hodnota }));
      }
      requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };
    window.addEventListener(UDALOST_VYPLNIT, naVyplnit);
    return () => window.removeEventListener(UDALOST_VYPLNIT, naVyplnit);
  }, [vPlose]);

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
    tips_card: n(form.tipsCard),
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
    fetch(`/api/pos/summary?date=${form.date}`).then(okJson)
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

  // A required procedure counts as done when ANYONE on the team completed it
  // today. The check only has meaning for today's SHOP closing filed by someone
  // who was actually on shift — an off-site stall doesn't run the shop's
  // routine, a backfilled day can't be fixed by doing the routine now, and
  // someone who wasn't on shift can't be asked to finish a shift they never
  // had (that closing goes to the employer for approval anyway).
  const closingIsToday = form.date === today();
  const proceduresApply = runsZname && eventId === '' && closingIsToday && (!isSelf || onShift);
  const missingRequired = !proceduresApply ? [] : requiredProcs.filter(p =>
    !todayRuns.some((r: any) => r.procedure_id === p.id && r.status === 'completed'));

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setMsg('');
    if (form.closingCash === '') { setErr('Zadej skutečný stav kasy na konci směny.'); return; }
    if (leaveTooHigh) { setErr('V kase nemůže zůstat víc, než kolik jsi napočítal/a. Uprav odvod na konci směny.'); return; }
    if (missingRequired.length > 0 && !isEmployer) {
      setErr(`Nejdřív dokonči ${missingRequired.length === 1 ? 'povinný postup' : 'povinné postupy'}: ${missingRequired.map(p => p.name).join(', ')}. Pak půjde uzávěrka odeslat.`);
      return;
    }
    if (missingRequired.length > 0 && isEmployer) { setPotvrditPostupy(true); return; }
    pokracuj();
  };

  const pokracuj = () => {
    setPotvrditPostupy(false);
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
          shiftId: pickedShiftId ?? undefined,
          openingCash: n(form.openingCash), cashRevenue: n(form.cashRevenue), cardRevenue: n(form.cardRevenue),
          tips: n(form.tips), tipsCard: n(form.tipsCard), expenses: effExpenses, cashRemoved: effRemoved,
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
        const forCoworkers = includedCoworkers.length > 0 ? ' i za kolegy' : '';
        // Kdo se zapomněl odpíchnout, to musí slyšet teď, ne ráno z nočního
        // úklidu. Server jim poslal i push; tady je to pro toho, kdo stojí u
        // obrazovky a zrovna odeslal.
        const neodpichnuti: { name: string }[] = Array.isArray(d.openClockIns) ? d.openClockIns : [];
        const dovetek = neodpichnuti.length
          ? ` Nezapomeň se odpíchnout${neodpichnuti.length > 1 ? ` (${neodpichnuti.map(o => o.name).join(', ')})` : ''} — jinak se směna uzavře podle času uzávěrky.`
          : '';
        setMsg((d.approved === false ? 'Uzávěrka odeslána ke schválení vedení.' : `Uzávěrka byla odeslána${forCoworkers}.`) + dovetek);
        // Widgety na ploše (Moje uzávěrka, Moje uzávěrky, Předávka) čtou tytéž URL.
        obnovDataWidgetu('/api/closings');
        obnovDataWidgetu('/api/closings/handover');
        setForm(emptyForm());
        setPickedShiftId(null);
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
        setTimeout(() => setMsg(''), neodpichnuti.length ? 12000 : 4000);
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
      // Popisek musí být s polem svázaný, ne jen nad ním. Vizuálně to
      // vypadalo stejně, ale odečítač obrazovky četl „číselné pole,
      // prázdné" — a do těchhle polí se píšou peníze v kase.
      <label className="block">
        <span className="field-label">{label}</span>
        <div className="relative">
          <input type="number" inputMode="numeric" value={form[key]} onChange={set(key)}
            placeholder={opts?.placeholder ?? '0'} className={`${inputClass} ${unit ? 'pr-12' : ''}`} />
          {unit && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">{unit}</span>}
        </div>
        {opts?.hint && <p className="text-[11px] text-black/40 mt-1.5">{opts.hint}</p>}
      </label>
    );
  };

  return (
    <div className={vPlose ? 'space-y-4' : 'p-4 sm:p-6 space-y-5 sm:space-y-6'}>
      {/* Na ploše hlavičku kreslí plocha (jediný h1); tablet a vedení ji mají tady. */}
      {!vPlose && <PageHeader hintId="cashclosing" title="Uzávěrka" subtitle="Spočítej kasu na konci směny — tržby se předvyplní z pokladny." />}
      {msg && (
        <p className="note note-ok text-sm flex items-center gap-2" role="status">
          <Icon name="check" size={17} className="shrink-0" /> {msg}
        </p>
      )}
      {err && (
        <p className="note note-danger text-sm flex items-center gap-2" role="alert">
          <Icon name="warning" size={17} className="shrink-0" /> {err}
        </p>
      )}
      {/* Výzva „Chybí ti uzávěrka" nad formulářem je od kola 69 widget
          uzaverky.moje_uzaverka; směny k vyplnění nabízí i první krok. */}

      <form ref={formRef} onSubmit={submit} className="card scroll-mt-4 p-4 min-[400px]:p-5 sm:p-7 space-y-5 sm:space-y-6">
        {/* Header + visual step progress */}
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="t-section flex items-center gap-2">
                <Icon name="coins" size={17} className="shrink-0 text-black/40" /> Uzávěrka směny
              </h2>
              <p className="t-meta mt-1">Projdi čtyři kroky — na konci ti spočítáme, jestli kasa sedí.</p>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2">
            {['Kasa', 'Tržby', 'Výdaje', 'Kontrola'].map((lbl, i) => (
              <div key={lbl} className="flex items-center gap-2 flex-1 last:flex-initial min-w-0">
                <button type="button" onClick={() => scrollToStep(i)} title={`Přejít na krok ${lbl}`}
                  aria-label={`Přejít na krok ${lbl}`}
                  className="tap-target-sm flex items-center gap-2 shrink-0 group">
                  <span
                    className={`grid place-items-center h-6 w-6 shrink-0 rounded-full text-[11px] font-bold transition ${
                      stepDone[i]
                        ? 'bg-[#C8F542] text-black'
                        : 'bg-black/[0.08] text-black/45 group-hover:bg-black/[0.14]'
                    }`}
                  >
                    {stepDone[i] ? <Icon name="check" size={12} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={`text-[11px] font-semibold hidden sm:inline transition ${stepDone[i] ? 'text-ok-ink' : 'text-black/45'}`}>{lbl}</span>
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
            // Jediná inkoustová plocha formuláře (souhrn peněz, DP §4 D) — bez
            // rozmazání: blur v obsahu je zákaz a plná barva čte stejně.
            className="sticky top-2 z-20 w-full flex items-center justify-between gap-3 rounded-2xl bg-[#16181A] px-4 py-2.5 text-white shadow-[shadow:var(--shadow-float)] active:scale-[0.99] transition-transform">
            <span className="text-xs font-medium text-white/70">Očekáváno v kase</span>
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="text-base font-bold tabular-nums">{money(expected)}</span>
              {diff !== null && (
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${
                  diff === 0 ? 'bg-[#C8F542] text-black' : diff > 0 ? 'bg-[#0A84FF] text-white' : 'bg-bad text-white'
                }`}>
                  {diff === 0 ? 'sedí' : `${diff > 0 ? '+' : ''}${money(diff)}`}
                </span>
              )}
            </span>
          </button>
        )}


        {/* Step 1 — opening cash + when/which shift */}
        {/* Nabízí se jen akce dne, za který se uzávěrka dělá — dřív tu visel
            seznam všech akcí historie a „ten den je akce" nešlo poznat. */}
        {evsToday.length > 0 && (
            <div className="well p-4 space-y-2.5" role="radiogroup" aria-label="Za co je tahle uzávěrka">
              <p className="text-sm font-semibold text-[#16181A] flex items-center gap-1.5"><Icon name="calendarCheck" size={15} className="shrink-0 text-black/40" /> {evsToday.length === 1 ? `Ten den se koná akce: ${evsToday[0].title}` : 'Ten den se konají akce'}</p>
              <p className="t-meta">
                Výjezd s vlastní kasou má uzávěrku zvlášť („Za akci") a s kasou podniku se
                nemíchá. U akce u nás stačí běžná uzávěrka podniku — kolik z tržby spadlo
                do okna akce se po uložení rozepíše samo (z účtenek pokladny).
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" role="radio" aria-checked={eventId === ''} onClick={() => setEventId('')}
                  className={`filter-pill tap-target-sm ${eventId === '' ? 'seg-on' : 'seg-off glass'}`}>
                  Uzávěrka podniku
                </button>
                {evsToday.map(ev => (
                  <button key={ev.id} type="button" role="radio" aria-checked={eventId === ev.id} onClick={() => setEventId(ev.id)}
                    className={`filter-pill tap-target-sm ${eventId === ev.id ? 'seg-on' : 'seg-off glass'}`}>
                    Za akci: {ev.title}
                  </button>
                ))}
              </div>
            </div>
        )}

        <Step refCb={el => { stepRefs.current[0] = el; }} icon="clock" title="Kasa na začátku"
          subtitle="Kolik bylo v kase, když směna začala.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0 space-y-2">
              {field('Kasa na začátku', 'openingCash', {
                hint: carry
                  ? `Předchozí směna (${new Date(carry.date + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}${carry.label ? `, ${carry.label}` : ''}) skončila s ${money(carry.amount)}.`
                  : 'Počáteční stav hotovosti v kase.',
              })}
              {closings.some(c => c.date === form.date) && (
                <p className="note note-wait text-[13px]">
                  Za tenhle den už uzávěrka existuje. Pokračuj, jen když zavíráš další směnu téhož dne.
                </p>
              )}
              {gapDays.length > 0 && gapDays.every(d => d < form.date) && (
                <p role="alert" className="note note-danger text-[13px]">
                  Mezi poslední uzávěrkou a dneškem chybí uzávěrka za{' '}
                  {gapDays.map(d => new Date(d + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' })).join(', ')}.
                  Hotovost z té směny je v kase, ale do dnešní tržby nepatří — nejdřív dopiš tu chybějící,
                  jinak dnešek vyjde s přebytkem, který není jeho.
                </p>
              )}
              {carry && (
                <div className="flex items-center gap-2 flex-wrap">
                  {n(form.openingCash) === Math.round(carry.amount) ? (
                    <Chip tone="ok" size="sm" icon="check">Převzato z předchozí směny</Chip>
                  ) : (
                    <Button variant="secondary" size="sm"
                      onClick={() => setForm(f => ({ ...f, openingCash: String(Math.round(carry.amount)) }))}>
                      Převzít {money(carry.amount)} z předchozí směny
                    </Button>
                  )}
                </div>
              )}
            </div>
            {isKiosk ? (
              <div className="min-w-0">
                <label className="field-label">Kterou směnu uzavíráš?</label>
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
                          {s.employeeName && <Avatar emoji={s.employeeAvatar} size="sm" />}
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[#16181A] cz-sentence truncate">
                              {s.employeeName ? `${s.employeeName} · ` : ''}
                              {new Date(s.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </span>
                            <span className="block text-xs text-black/45 tabular-nums">{s.startTime}–{s.endTime}</span>
                          </span>
                        </span>
                        <span className={`shrink-0 flex h-5 w-5 items-center justify-center rounded-full border-2 ${active ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/20 text-transparent'}`}>
                          <Icon name="check" size={12} strokeWidth={3} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : isEmployer ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                <div className="min-w-0">
                  <label className="field-label">Za koho</label>
                  <select value={selEmployee ?? ''} aria-label="Kdo byl na směně" onChange={e => setSelEmployee(e.target.value ? Number(e.target.value) : null)}
                    className={`${inputClass} appearance-none min-w-0 h-[46px]`} style={{ WebkitAppearance: 'none' }}>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.avatar ? `${m.avatar} ` : ''}{m.name}{m.id === meId ? ' (já)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="field-label">Datum</label>
                  {/* appearance-none + min-w-0: iOS date inputs have an intrinsic
                      width and overflow the card without it */}
                  <input type="date" aria-label="Datum uzávěrky" value={form.date} onChange={set('date')}
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
                          aria-pressed={active}
                          onClick={() => pickShift(s)}
                          className={`filter-pill tap-target-sm cz-sentence ${active ? 'seg-on' : 'seg-off glass'}`}
                        >
                          {new Date(s.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                          <span className="font-normal opacity-70"> · {s.startTime}–{s.endTime}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div>
                  <label className="field-label">Datum</label>
                  {/* appearance-none + min-w-0: iOS date inputs have an intrinsic
                      width and overflow the card without it */}
                  <input type="date" aria-label="Datum uzávěrky" value={form.date} onChange={set('date')}
                    className={`${inputClass} appearance-none min-w-0 h-[46px] text-left`}
                    style={{ WebkitAppearance: 'none' }} />
                </div>
              </div>
            )}
          </div>
        </Step>

        {/* Step 2 — revenue */}
        <Step refCb={el => { stepRefs.current[1] = el; }} icon="trend" title="Tržby"
          subtitle="Co za směnu přišlo — hotově, kartou a spropitné.">
          {pos && (
            <div className="well p-4 mb-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#16181A] min-w-0">
                  <Icon name="card" size={15} className="inline -mt-0.5 mr-1.5 shrink-0 text-black/40" /> Pokladna {pos.placeName ? `(${pos.placeName})` : 'Storyous'}
                  <span className="font-normal text-black/50"> · {pos.bills} účtenek · hotově {money(pos.cash)} · kartou {money(pos.card)}{pos.other > 0 ? ` · jinak ${money(pos.other)}` : ''}{pos.tips > 0 ? ` · spropitné ${money(pos.tips)}` : ''}
                    {pos.tips > 0 && (pos.tipsCard > 0 || pos.tipsCash > 0)
                      ? ` (hotově ${money(pos.tipsCash ?? 0)} · kartou ${money(pos.tipsCard ?? 0)}${(pos.tipsOther ?? 0) > 0 ? ` · nerozlišeno ${money(pos.tipsOther)}` : ''})`
                      : ''}</span>
                </p>
                <Button variant="primary" size="sm"
                  onClick={() => setForm(f => ({
                    ...f,
                    cashRevenue: String(pos.cash),
                    cardRevenue: String(pos.card + pos.other),
                    tips: pos.tips > 0 ? String(pos.tips) : f.tips,
                    tipsCard: pos.tipsCard != null && pos.tipsCard > 0 ? String(pos.tipsCard) : f.tipsCard,
                  }))}
                  className="shrink-0">
                  Předvyplnit z pokladny
                </Button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Tržba hotově', 'cashRevenue', { hint: 'Hotovost přijatá do kasy.' })}
            {field('Tržba kartou', 'cardRevenue', { hint: 'Nejde do kasy — jen evidence.' })}
            {field('Spropitné celkem', 'tips', {
              hint: tipsInDrawer
                ? 'Hotovostní část zůstává v kase a počítá se k očekávanému stavu.'
                : 'Bereš ho stranou — očekávaný stav kasy neovlivní.',
            })}
            {field('Z toho kartou', 'tipsCard', {
              hint: 'Do kasy se nedostane — jen evidence. Zbytek bereme jako hotovost.',
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
        <Step refCb={el => { stepRefs.current[2] = el; }} icon="box" title="Výdaje a odvody"
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
          // Oddíl jako kroky (linka, jamka s ikonou), ne limetková karta v kartě.
          <section className="border-t border-[var(--surface-line)] pt-5 sm:pt-6 space-y-3">
            <div className="flex items-start gap-3.5">
              <span aria-hidden className="well grid h-11 w-11 shrink-0 place-items-center !p-0">
                <Icon name="users" size={20} className="text-black/55" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="t-card">Byl někdo další na směně?</h3>
                <p className="t-meta mt-0.5">
                  Zaškrtni kolegy a uzavři to i za ně{payDailyCash ? ' i s výplatou' : ''}. Kdo neměl směnu, tomu se automaticky přidá a dostane stejný čas jako ty (vedení pak může upravit).
                </p>
              </div>
            </div>
            <ul className="list">
              {coworkers.map(cw => {
                const sel = coworkerSel[cw.id];
                const on = !!sel?.on;
                return (
                  <li key={cw.id} className="flex items-center justify-between gap-3 py-2.5 min-h-[3.25rem]">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => setCoworkerSel(s => ({ ...s, [cw.id]: { on: !on, payout: s[cw.id]?.payout ?? '' } }))}
                      className="flex items-center gap-2.5 min-w-0 text-left"
                    >
                      <span className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${on ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/20 text-transparent'}`}>
                        <Icon name="check" size={13} strokeWidth={3} />
                      </span>
                      <Avatar emoji={cw.avatar} size="sm" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[#16181A] truncate">{cw.name}</span>
                        {cw.hadShift
                          ? <span className="block t-meta tabular-nums">{cw.startTime}–{cw.endTime}</span>
                          : <span className="block text-[13px] text-wait-ink">bez naplánované směny — přidá se</span>}
                      </span>
                    </button>
                    {on && payDailyCash && (
                      <div className="relative shrink-0 w-32">
                        <input
                          type="number" inputMode="numeric"
                          value={sel?.payout ?? ''}
                          onChange={e => setCoworkerSel(s => ({ ...s, [cw.id]: { on: true, payout: e.target.value } }))}
                          aria-label={`Výplata pro ${cw.name} v ${symbol}`}
                          placeholder="výplata" className={`${inputClass} pr-9 !py-2.5 text-sm`} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-black/45">{symbol}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Step 4 — the climax: expected vs counted */}
        <Step refCb={el => { stepRefs.current[3] = el; }} icon="check" title="Kontrola kasy"
          subtitle="Spočítej hotovost v kase a porovnej s očekáváním."
          guide={navodUzaverky}>
          {/* The arithmetic spelled out — no mystery number to argue with. */}
          <div className="well px-4 py-3.5 space-y-1.5">
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
              <p id="uzaverka-kasa-konec" className="field-label !mb-0">Skutečný stav kasy na konci *</p>
              {denomSet.length > 0 && (
                <Segmented size="sm" ariaLabel="Jak kasu spočítáš" value={countMode ? 'bankovky' : 'celkem'}
                  onChange={v => setCountMode(v === 'bankovky')}
                  options={[{ id: 'celkem', label: 'Zadat celkem' }, { id: 'bankovky', label: 'Spočítat bankovky' }]} />
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
                <p className="t-meta">
                  Napiš ke každé bankovce a minci, kolik jich v kase je — součet se doplní sám.
                </p>
              </>
            ) : (
              <div className="relative">
                <input type="number" inputMode="numeric" required value={form.closingCash} onChange={set('closingCash')}
                  aria-label={`Skutečný stav kasy v ${symbol}`}
                  placeholder="0" className={`${inputClass} pr-12 !py-4 text-base font-semibold`} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">{symbol}</span>
              </div>
            )}
          </div>

          {diff === null ? (
            <p className="t-meta text-center py-1">Zadej skutečný stav a hned uvidíš výsledek.</p>
          ) : (
            // Výsledek je stav, ne ozdoba: tón `note` podle toho, jestli kasa sedí.
            <div role="status" className={`note flex flex-wrap items-center justify-between gap-2 ${diff === 0 ? 'note-ok' : diff > 0 ? 'note-info' : 'note-danger'}`}>
              <span className="flex items-center gap-2 font-semibold">
                <Icon name={diff === 0 ? 'check' : diff > 0 ? 'trend' : 'warning'} size={18} />
                {diff === 0 ? 'Kasa sedí' : diff > 0 ? 'Přebytek v kase' : 'Manko v kase'}
              </span>
              <span className="text-lg font-bold tabular-nums whitespace-nowrap">{diff > 0 ? '+' : ''}{money(diff)}</span>
            </div>
          )}

          {/* When it doesn't match: say why, so the employer isn't left guessing. */}
          {diff !== null && diff !== 0 && (
            <div className="well p-4 space-y-3">
              <p className="text-sm font-semibold text-[#16181A]">Čím to nejspíš je?</p>

              {hints.length > 0 && (
                <div className="space-y-1.5">
                  {hints.map((h, i) => (
                    <p key={i} className="note note-info text-[13px]">
                      {h}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {DIFF_REASONS.map(r => (
                  <button key={r.id} type="button" title={r.hint} aria-pressed={diffReason === r.id}
                    onClick={() => setDiffReason(diffReason === r.id ? '' : r.id)}
                    className={`filter-pill tap-target-sm ${diffReason === r.id ? 'seg-on' : 'seg-off glass'}`}>
                    {r.label}
                  </button>
                ))}
              </div>

              <textarea value={diffNote} onChange={e => setDiffNote(e.target.value)} rows={2}
                aria-label="Co se stalo s kasou"
                placeholder="Co se stalo — vlastními slovy (nepovinné)"
                className={`${inputClass} resize-none py-2`} />
            </div>
          )}

          {/* End-of-shift removal — the drawer gets counted FIRST (that is what
              the diff above judges), and only then does the surplus go to the
              safe. What stays here is what the next shift takes over. */}
          {form.closingCash !== '' && (
            <div className="well p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-[#16181A]">Odvod na konci směny</p>
                <p className="t-meta mt-0.5">
                  {drawerFloat != null
                    ? `Podnik má nastavený stav kasy ${drawerFloat.toLocaleString('cs-CZ')} ${symbol} — kolik odložit, spočítám tak, aby v kase zůstalo přesně tolik. Číslo můžeš upravit.`
                    : 'Napiš, kolik v kase necháváš pro další směnu — kolik odložit spočítám. Nech prázdné, pokud v kase zůstává všechno.'}
                </p>
              </div>
              <div>
                <label htmlFor="uzaverka-nechavas" className="field-label">V kase necháváš</label>
                <div className="relative">
                  <input id="uzaverka-nechavas" type="number" inputMode="numeric" value={leaveCash}
                    onChange={e => setLeaveCash(e.target.value)}
                    placeholder={`${n(form.closingCash)}`}
                    className={`${inputClass} pr-12`} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">{symbol}</span>
                </div>
              </div>
              {leaveTooHigh ? (
                <p className="text-[13px] note note-danger px-3 py-2">
                  V kase je napočítáno jen {money(n(form.closingCash))} — nemůže v ní zůstat víc.
                </p>
              ) : leaveCash !== '' && finalRemoval > 0 ? (
                // Dřív druhá inkoustová plocha; číslo stačí tučně na bílém podkladu.
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-white border border-[var(--surface-line)] px-4 py-3">
                  <span className="text-sm font-medium flex items-center gap-2 min-w-0 text-[#16181A]">
                    <Icon name="swap" size={16} className="shrink-0 text-black/40" /> Odlož ven (trezor / odvod)
                  </span>
                  <span className="text-lg font-bold tabular-nums shrink-0 whitespace-nowrap text-[#16181A]">{money(finalRemoval)}</span>
                </div>
              ) : leaveCash !== '' ? (
                <p className="t-meta">V kase zůstává všechno — žádný odvod.</p>
              ) : (
                <p className="t-meta">Nech prázdné, pokud v kase zůstává všechno.</p>
              )}
            </div>
          )}
        </Step>

        <div>
          {/* Say WHY nothing is being demanded, so a blank space doesn't read
              as a bug the next time somebody expects the checklist. */}
          {missingRequired.length === 0 && requiredProcs.length > 0 && !proceduresApply && (
            <div className="well px-4 py-3">
              <p className="t-meta">
                {eventId !== '' ? 'Uzávěrka za akci — povinné postupy prodejny se u ní neřeší.'
                  : !closingIsToday ? 'Uzávěrka za jiný den — dnešní postupy ji neblokují.'
                  : 'Tenhle den nemáš směnu — uzávěrku můžeš odeslat a vedení ji potvrdí.'}
              </p>
            </div>
          )}
          {missingRequired.length > 0 && (
            <div className="note note-danger rise-in" role="alert">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Icon name="warning" size={16} className="shrink-0" /> Před uzávěrkou je potřeba dokončit:
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {/* Ikona postupu je název ikony — dřív se vytiskl jako text („moon Zavírací rutina"). */}
                {missingRequired.map(p => (
                  <Chip key={p.id} tone="bad" icon={p.icon || 'clipboard'}>{p.name}</Chip>
                ))}
              </div>
              <p className="text-[13px] mt-2">Najdeš je v sekci Postupy. Jakmile je někdo ze směny dokončí, uzávěrka půjde odeslat.</p>
            </div>
          )}

          {todayRuns.length > 0 && (
            <div className="well p-4 mt-3">
              <p className="t-label mb-2">Dnešní postupy</p>
              <div className="flex flex-wrap gap-1.5">
                {todayRuns.map((r: any) => {
                  const missing = Math.max(0, (Number(r.total_items) || 0)
                    - (Array.isArray(r.checked_items) ? r.checked_items.length : 0)
                    - (Array.isArray(r.skipped_items) ? r.skipped_items.length : 0));
                  const running = r.status === 'running';
                  return (
                    <Chip key={r.id} tone={running || missing > 0 ? 'wait' : 'ok'} icon={r.procedure_icon || 'clipboard'}>
                      {r.procedure_name}
                      {running ? ' · běží' : missing > 0 ? ` · ${missing} nedokončeno` : ' · hotovo'}
                    </Chip>
                  );
                })}
              </div>
              {todayRuns.some((r: any) => r.status === 'running') && (
                <p className="text-[13px] text-wait-ink mt-2">Postup ještě běží — dokonči ho, ať se do hodnocení nezapíše jako nedodělaný.</p>
              )}
            </div>
          )}

          {mzda && !mzda.wage.noEntries && (
            <div className="well p-4 space-y-2 mt-3">
              <p className="t-label flex items-center gap-1.5">
                <Icon name="clock" size={13} className="shrink-0" /> Tvoje směna
              </p>
              {mzda.wage.suspicious ? (
                <p className="text-sm text-bad-ink">
                  Příchod je otevřený déle než den — to je zapomenuté odpíchnutí, ne odpracovaný čas. Mzdu spočítáme, až ho vedení opraví.
                </p>
              ) : (
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <p className="text-sm text-[#16181A]">
                    Odpracováno <span className="font-bold tabular-nums">{hodinyMinuty(mzda.wage.ms)}</span>
                    {mzda.wage.open && <span className="text-black/45"> (do teď — příchod je otevřený)</span>}
                  </p>
                  {mzda.wage.rate > 0 ? (
                    <p className="text-sm text-[#16181A]">
                      × {mzda.wage.rate} {symbol}/h = <span className="font-bold tabular-nums">{money(mzda.wage.earned)}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-black/45">Hodinovku ti vedení zatím nenastavilo.</p>
                  )}
                </div>
              )}
              <p className="text-[13px] text-black/55">
                Body za dnešek: <span className="font-semibold text-ok-ink tabular-nums">+{mzda.points.total}</span>
                <span className="text-black/45">
                  {' '}— {mzda.points.closingPts} za uzávěrku
                  {mzda.points.tasks > 0 ? `, ${mzda.points.taskPts} za ${mzda.points.tasks === 1 ? 'úkol' : mzda.points.tasks < 5 ? 'úkoly' : 'úkolů'}` : ''}
                  {mzda.points.procedures > 0 ? `, ${mzda.points.procPts} za ${mzda.points.procedures === 1 ? 'postup' : mzda.points.procedures < 5 ? 'postupy' : 'postupů'}` : ''}
                </span>
              </p>
            </div>
          )}

          <div className="well p-4 space-y-2.5 mt-3">
            <div>
              <p className="t-label flex items-center gap-1.5"><Icon name="handover" size={13} className="shrink-0" /> Předávka pro další směnu</p>
              <p className="t-meta mt-0.5">Nepovinné — uvidí ji tým na přehledu a tabletu.</p>
            </div>
            <input value={hoTodo} onChange={e => setHoTodo(e.target.value)} maxLength={500}
              aria-label="Předávka: co zbývá dodělat"
              placeholder="Co zbývá dodělat…"
              className={inputClass} />
            <input value={hoRunningOut} onChange={e => setHoRunningOut(e.target.value)} maxLength={500}
              aria-label="Předávka: co dochází nebo je potřeba objednat"
              placeholder="Co dochází / objednat…"
              className={inputClass} />
            <input value={hoMessage} onChange={e => setHoMessage(e.target.value)} maxLength={500}
              aria-label="Předávka: vzkaz pro další směnu"
              placeholder="Vzkaz pro další směnu…"
              className={inputClass} />
          </div>

          <label htmlFor="uzaverka-poznamka" className="field-label mt-4 block">Poznámka</label>
          <textarea id="uzaverka-poznamka" value={form.notes} onChange={set('notes')} rows={2} placeholder="Cokoliv důležitého k předání…" className={`${inputClass} resize-none`} />
        </div>

        {/* Jediná limetka obrazovky (DP §4 D) — dřív tmavá, zatímco limetku nesl vedlejší „Přidat". */}
        <Button type="submit" variant="accent" size="lg" block iconAfter="check" loading={submitting}>
          Odeslat uzávěrku
        </Button>
      </form>

      {/* Historie „Moje uzávěrky" je od kola 69 widget uzaverky.moje_historie
          (na tabletu a ve vloženém formuláři vedení nebyla nikdy). */}

      {/* Off-shift confirmation — closing a day the employee wasn't scheduled
          goes to management for approval. */}
      {showConfirm && (
        <Modal open onClose={() => setShowConfirm(false)} size="sm"
          title="Nejsi na směně v tento den"
          subtitle="Uzávěrku můžeš odeslat, ale půjde vedení ke schválení."
          footer={<>
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>Zrušit</Button>
            <Button variant="primary" icon="send" loading={submitting} onClick={doSubmit}>Odeslat ke schválení</Button>
          </>}>
          <div className="flex items-start gap-3 note note-wait">
            <Icon name="warning" size={17} className="shrink-0 mt-0.5" />
            <p className="text-sm">Vedení uvidí, že uzávěrku poslal někdo mimo rozpis, a potvrdí ji.</p>
          </div>
        </Modal>
      )}

      {/* Vedení odesílá i bez povinných postupů — dřív přes confirm() prohlížeče. */}
      {potvrditPostupy && (
        <Modal open onClose={() => setPotvrditPostupy(false)} size="sm"
          title="Povinné postupy nejsou dokončené"
          subtitle={missingRequired.map(p => p.name).join(', ')}
          footer={<>
            <Button variant="secondary" onClick={() => setPotvrditPostupy(false)}>Zrušit</Button>
            <Button variant="primary" icon="send" loading={submitting} onClick={pokracuj}>Odeslat přesto</Button>
          </>}>
          <p className="text-sm text-black/60">Uzávěrka se odešle, i když dnešní povinné postupy nikdo nedokončil.</p>
        </Modal>
      )}
    </div>
  );
}
