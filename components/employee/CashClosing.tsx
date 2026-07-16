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

export default function CashClosing({ user }: { user: { id: number; name: string } }) {
  const [closings, setClosings] = useState<Closing[]>([]);
  const [payDailyCash, setPayDailyCash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const d = await fetch('/api/closings').then(r => r.json());
      setClosings(Array.isArray(d.closings) ? d.closings : []);
      setPayDailyCash(!!d.payDailyCash);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setMsg('');
    if (form.closingCash === '') { setErr('Zadej skutečný stav kasy na konci směny.'); return; }
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
        }),
      });
      if (res.ok) {
        setMsg('Uzávěrka byla odeslána. ✓');
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

  const field = (label: string, key: keyof FormState, opts?: { hint?: string; placeholder?: string }) => (
    <div>
      <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">{label}</label>
      <div className="relative">
        <input type="number" inputMode="numeric" value={form[key]} onChange={set(key)}
          placeholder={opts?.placeholder ?? '0'} className={`${inputClass} pr-10`} />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">Kč</span>
      </div>
      {opts?.hint && <p className="text-[11px] text-black/40 mt-1.5">{opts.hint}</p>}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {msg && <div className="p-3 rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 text-[#5B7A08] text-sm">{msg}</div>}
      {err && <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">{err}</div>}

      <form onSubmit={submit} className="glass-card p-6 space-y-6">
        <div>
          <h3 className="font-bold tracking-tight text-[#16181A] flex items-center gap-2">
            <Icon name="trend" size={18} /> Nová uzávěrka
          </h3>
          <p className="text-black/45 text-sm mt-1">Na konci směny spočítej kasu a vyplň hodnoty.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Datum</label>
            <input type="date" value={form.date} onChange={set('date')} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Směna (volitelné)</label>
            <input type="text" value={form.shiftLabel} onChange={set('shiftLabel')} placeholder="Ranní / Odpolední…" className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('Kasa na začátku', 'openingCash', { hint: 'Kolik bylo v kase na začátku směny.' })}
          {field('Tržba hotově', 'cashRevenue', { hint: 'Hotovost přijatá do kasy.' })}
          {field('Tržba kartou', 'cardRevenue', { hint: 'Nejde do kasy — jen evidence.' })}
          {field('Spropitné', 'tips')}
          {field('Výdaje z kasy', 'expenses', { hint: 'Nákupy apod. placené z kasy.' })}
          {field('Odloženo ven', 'cashRemoved', { hint: 'Do trezoru / odvod.' })}
          {payDailyCash && field('Moje výplata dnes', 'selfPayout', { hint: 'Kolik sis dnes vyplatil/a z kasy.' })}
          {field('Zákazníků (volitelné)', 'customers')}
        </div>

        {/* Expected vs counted */}
        <div className="rounded-2xl bg-black/[0.03] border border-black/[0.07] p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-black/55">Očekávaný stav kasy</span>
            <span className="font-semibold text-[#16181A]">{czk(expected)}</span>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Skutečný stav kasy na konci *</label>
            <div className="relative">
              <input type="number" inputMode="numeric" required value={form.closingCash} onChange={set('closingCash')}
                placeholder="0" className={`${inputClass} pr-10`} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">Kč</span>
            </div>
          </div>
          {diff !== null && (
            <div className={`flex items-center justify-between text-sm rounded-xl px-3 py-2 ${
              diff === 0 ? 'bg-[#C8F542]/10 text-[#5B7A08]' : diff > 0 ? 'bg-[#0A84FF]/10 text-[#0A6FE0]' : 'bg-red-500/10 text-red-600'
            }`}>
              <span className="font-medium">{diff === 0 ? 'Kasa sedí' : diff > 0 ? 'Přebytek' : 'Manko'}</span>
              <span className="font-bold">{diff > 0 ? '+' : ''}{czk(diff)}</span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Poznámka</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Cokoliv důležitého k předání…" className={`${inputClass} resize-none`} />
        </div>

        <button type="submit" disabled={submitting}
          className="rounded-full bg-[#16181A] text-white font-semibold px-6 py-3 text-sm hover:bg-black disabled:opacity-50 transition-all">
          {submitting ? 'Odesílám…' : 'Odeslat uzávěrku'}
        </button>
      </form>

      {/* My past closings */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold tracking-tight text-[#16181A]">Moje uzávěrky</h3>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
          </div>
        ) : closings.length === 0 ? (
          <div className="glass-card p-8 text-center"><p className="text-black/45">Zatím žádná uzávěrka.</p></div>
        ) : (
          closings.map(c => {
            const d = cashDifference(c);
            return (
              <div key={c.id} className="glass-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold tracking-tight text-[#16181A]">
                    {new Date(c.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {c.shift_label && <span className="text-black/40 font-normal"> · {c.shift_label}</span>}
                  </p>
                  <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${
                    d === 0 ? 'bg-[#C8F542]/15 text-[#5B7A08]' : d > 0 ? 'bg-[#0A84FF]/15 text-[#0A6FE0]' : 'bg-red-500/15 text-red-600'
                  }`}>{d === 0 ? 'Sedí' : d > 0 ? `Přebytek +${czk(d)}` : `Manko ${czk(d)}`}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-black/40">Tržba hotově</span><p className="font-semibold text-[#16181A]">{czk(c.cash_revenue)}</p></div>
                  <div><span className="text-black/40">Tržba kartou</span><p className="font-semibold text-[#16181A]">{czk(c.card_revenue)}</p></div>
                  <div><span className="text-black/40">Odloženo</span><p className="font-semibold text-[#16181A]">{czk(c.cash_removed)}</p></div>
                  {payDailyCash && <div><span className="text-black/40">Moje výplata</span><p className="font-semibold text-[#16181A]">{czk(c.self_payout)}</p></div>}
                </div>
                {c.notes && <p className="text-sm text-black/55 bg-black/[0.04] border border-black/[0.06] rounded-2xl p-3 mt-3">{c.notes}</p>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
