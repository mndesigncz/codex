'use client';

import { useState, useEffect } from 'react';

interface Employee {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  jobTitle?: string;
  shiftPreference?: string;
}

const inputClass =
  'w-full rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

export default function Team() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', jobTitle: 'Barista', sendInvite: true });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => { setEmployees(data.filter((u: any) => u.role === 'employee')); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const tempPassword = Math.random().toString(36).slice(-8);
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, password: tempPassword, role: 'employee', sendInvite: form.sendInvite }),
      });
      if (res.ok) {
        const newUser = await res.json();
        setEmployees(prev => [...prev, { ...newUser, ...form }]);
        setShowForm(false);
        setForm({ name: '', email: '', phone: '', jobTitle: 'Barista', sendInvite: true });
        setSuccess(form.sendInvite ? `Zaměstnanec přidán a pozvánka odeslána na ${form.email}` : 'Zaměstnanec přidán');
        setTimeout(() => setSuccess(''), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const shiftPrefLabel = (pref?: string) => {
    if (pref === 'morning') return '🌅 Ranní';
    if (pref === 'afternoon') return '🌆 Odpolední';
    return '🔄 Flexibilní';
  };

  return (
    <div className="p-6 space-y-6">
      {success && (
        <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 p-4 text-[#C8F542] text-sm">
          ✅ {success}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold tracking-tight text-white">Zaměstnanci ({employees.length})</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all"
        >
          + Přidat zaměstnance
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="glass-card border-[#C8F542]/20 p-6 space-y-5">
          <h4 className="font-bold tracking-tight text-white">Nový zaměstnanec</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Jméno *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Email *</label>
              <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Telefon</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Pozice</label>
              <input value={form.jobTitle} onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                className={inputClass} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
            <input type="checkbox" checked={form.sendInvite} onChange={e => setForm(f => ({ ...f, sendInvite: e.target.checked }))} className="accent-[#C8F542]" />
            Odeslat pozvánku emailem s dočasným heslem
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting}
              className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all disabled:opacity-50">
              {submitting ? '⏳ Přidávám...' : '✅ Přidat'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="rounded-full glass border border-white/15 hover:bg-white/10 text-white px-5 py-2.5 text-sm font-medium transition-all">
              Zrušit
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-4xl animate-spin">⏳</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {employees.map(emp => (
            <div key={emp.id} className="glass-card p-6 hover:bg-white/[0.08] transition-all duration-300">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#C8F542]/15 border border-[#C8F542]/20 flex items-center justify-center text-2xl">
                  {emp.avatar ?? '👤'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold tracking-tight text-white">{emp.name}</p>
                  <p className="text-sm text-white/40">{emp.jobTitle ?? 'Barista'}</p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5">
                <p className="text-sm text-white/60">📧 {emp.email}</p>
                {emp.phone && <p className="text-sm text-white/60">📞 {emp.phone}</p>}
                <p className="text-sm text-white/60">{shiftPrefLabel(emp.shiftPreference)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
