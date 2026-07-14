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
    <div className="p-6 space-y-5">
      {success && (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-3 text-green-700 text-sm">
          ✅ {success}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-bold text-tea-800 text-lg">Zaměstnanci ({employees.length})</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-matcha-600 hover:bg-matcha-700 text-white text-sm rounded-xl font-medium transition-all"
        >
          + Přidat zaměstnance
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white rounded-2xl border-2 border-matcha-200 p-5 space-y-4">
          <h4 className="font-bold text-tea-800">Nový zaměstnanec</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-tea-700 mb-1">Jméno *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800" />
            </div>
            <div>
              <label className="block text-xs font-medium text-tea-700 mb-1">Email *</label>
              <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800" />
            </div>
            <div>
              <label className="block text-xs font-medium text-tea-700 mb-1">Telefon</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800" />
            </div>
            <div>
              <label className="block text-xs font-medium text-tea-700 mb-1">Pozice</label>
              <input value={form.jobTitle} onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-tea-700 cursor-pointer">
            <input type="checkbox" checked={form.sendInvite} onChange={e => setForm(f => ({ ...f, sendInvite: e.target.checked }))} className="accent-matcha-600" />
            Odeslat pozvánku emailem s dočasným heslem
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-matcha-600 hover:bg-matcha-700 text-white text-sm rounded-xl font-medium disabled:opacity-60">
              {submitting ? '⏳ Přidávám...' : '✅ Přidat'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-tea-100 hover:bg-tea-200 text-tea-700 text-sm rounded-xl font-medium">
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
            <div key={emp.id} className="bg-white rounded-2xl border-2 border-tea-100 p-5 hover:border-tea-200 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-matcha-100 flex items-center justify-center text-2xl">
                  {emp.avatar ?? '👤'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-tea-800">{emp.name}</p>
                  <p className="text-sm text-tea-500">{emp.jobTitle ?? 'Barista'}</p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5">
                <p className="text-sm text-tea-600">📧 {emp.email}</p>
                {emp.phone && <p className="text-sm text-tea-600">📞 {emp.phone}</p>}
                <p className="text-sm text-tea-600">{shiftPrefLabel(emp.shiftPreference)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
