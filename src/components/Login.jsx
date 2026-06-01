import { useState } from 'react';
import { employees, currentEmployer } from '../data/mockData.js';

const employeeCredentials = [
  { id: 1, name: 'Jana Nováková', email: 'jana@cajovna.cz', password: '1234', role: 'Baristka' },
  { id: 2, name: 'Tomáš Procházka', email: 'tomas@cajovna.cz', password: '1234', role: 'Barista' },
  { id: 3, name: 'Lucie Dvořáková', email: 'lucie@cajovna.cz', password: '1234', role: 'Baristka' },
  { id: 4, name: 'Martin Kovář', email: 'martin@cajovna.cz', password: '1234', role: 'Pomocný personál' },
];

export default function Login({ onLogin }) {
  const [accountType, setAccountType] = useState('employer');
  const [selectedEmployee, setSelectedEmployee] = useState('1');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      if (accountType === 'employer') {
        if (password === 'admin') {
          onLogin('employer', currentEmployer);
        } else {
          setError('Nesprávné heslo. (Nápověda: admin)');
        }
      } else {
        const emp = employeeCredentials.find(e => e.id === parseInt(selectedEmployee));
        if (password === '1234') {
          const fullEmployee = employees.find(e => e.id === parseInt(selectedEmployee));
          onLogin('employee', fullEmployee);
        } else {
          setError('Nesprávné heslo. (Nápověda: 1234)');
        }
      }
    }, 600);
  };

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-4">
      {/* Subtle background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent-blue/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl bg-card border border-border flex items-center justify-center text-4xl mx-auto mb-4 shadow-2xl">
            🍵
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">Čajovna Zelená</h1>
          <p className="text-text-secondary text-sm">Systém správy čajovny</p>
        </div>

        {/* Login Card */}
        <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-2xl">
          {/* Account type tabs */}
          <div className="flex p-2 gap-2">
            <button
              onClick={() => { setAccountType('employer'); setError(''); }}
              className={`flex-1 py-3 text-sm font-semibold rounded-2xl transition-all ${
                accountType === 'employer'
                  ? 'bg-accent text-black shadow-lg'
                  : 'text-text-secondary hover:text-white hover:bg-elevated'
              }`}
            >
              Zaměstnavatel
            </button>
            <button
              onClick={() => { setAccountType('employee'); setError(''); }}
              className={`flex-1 py-3 text-sm font-semibold rounded-2xl transition-all ${
                accountType === 'employee'
                  ? 'bg-accent-blue text-white shadow-lg'
                  : 'text-text-secondary hover:text-white hover:bg-elevated'
              }`}
            >
              Zaměstnanec
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
            {accountType === 'employer' ? (
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Účet</label>
                <div className="flex items-center gap-3 p-3 bg-elevated rounded-2xl border border-border">
                  <span className="text-2xl">👩‍💼</span>
                  <div>
                    <p className="font-semibold text-white text-sm">{currentEmployer.name}</p>
                    <p className="text-xs text-text-secondary">{currentEmployer.role} · {currentEmployer.email}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Vyberte zaměstnance</label>
                <div className="space-y-2">
                  {employeeCredentials.map(emp => (
                    <label key={emp.id} className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                      selectedEmployee === String(emp.id)
                        ? 'border-accent-blue bg-accent-blue/10'
                        : 'border-border hover:border-border/80 bg-elevated'
                    }`}>
                      <input
                        type="radio"
                        name="employee"
                        value={emp.id}
                        checked={selectedEmployee === String(emp.id)}
                        onChange={() => setSelectedEmployee(String(emp.id))}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        selectedEmployee === String(emp.id) ? 'border-accent-blue' : 'border-border'
                      }`}>
                        {selectedEmployee === String(emp.id) && (
                          <div className="w-2 h-2 rounded-full bg-accent-blue" />
                        )}
                      </div>
                      <span className="text-xl">{emp.id % 2 === 0 ? '👨' : '👩'}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{emp.name}</p>
                        <p className="text-xs text-text-secondary">{emp.role}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Heslo</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={accountType === 'employer' ? 'Zadejte heslo (admin)' : 'Zadejte heslo (1234)'}
                className="w-full px-4 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent transition-colors text-white placeholder:text-text-secondary/50 text-sm"
              />
            </div>

            {error && (
              <div className="p-3 bg-danger/10 border border-danger/30 rounded-2xl text-danger text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3.5 font-bold rounded-2xl transition-all active:scale-95 shadow-lg text-sm ${
                accountType === 'employer'
                  ? 'bg-accent hover:bg-accent/90 disabled:bg-accent/40 text-black'
                  : 'bg-accent-blue hover:bg-accent-blue/90 disabled:bg-accent-blue/40 text-white'
              }`}
            >
              {isLoading ? 'Přihlašování...' : 'Přihlásit se'}
            </button>
          </form>

          <div className="px-5 pb-5">
            <p className="text-xs text-center text-text-secondary/60">
              Demo: Zaměstnavatel — <code className="bg-elevated px-1 rounded text-text-secondary">admin</code>
              &nbsp;|&nbsp;
              Zaměstnanec — <code className="bg-elevated px-1 rounded text-text-secondary">1234</code>
            </p>
          </div>
        </div>

        <p className="text-center text-text-secondary/40 text-xs mt-6">
          © 2025 Čajovna Zelená · Interní systém
        </p>
      </div>
    </div>
  );
}
