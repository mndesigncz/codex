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
    <div className="min-h-screen bg-gradient-to-br from-matcha-700 via-matcha-600 to-matcha-500 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-10 left-10 text-9xl">🍵</div>
        <div className="absolute top-1/4 right-16 text-7xl">🌿</div>
        <div className="absolute bottom-20 left-1/4 text-8xl">🫖</div>
        <div className="absolute bottom-10 right-10 text-9xl">🍃</div>
        <div className="absolute top-1/2 left-1/3 text-6xl">✨</div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🍵</div>
          <h1 className="text-3xl font-bold text-white mb-1">Čajovna Zelená</h1>
          <p className="text-matcha-200 text-sm">Systém správy čajovny</p>
          {/* Wireframe badge */}
          <span className="inline-block mt-2 px-3 py-1 bg-white/20 text-white text-xs rounded-full border border-white/30">
            📐 Wireframe prototyp
          </span>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Account type tabs */}
          <div className="flex border-b border-tea-100">
            <button
              onClick={() => { setAccountType('employer'); setError(''); }}
              className={`flex-1 py-4 text-sm font-semibold transition-all ${
                accountType === 'employer'
                  ? 'bg-matcha-600 text-white'
                  : 'text-tea-500 hover:bg-tea-50'
              }`}
            >
              👩‍💼 Zaměstnavatel
            </button>
            <button
              onClick={() => { setAccountType('employee'); setError(''); }}
              className={`flex-1 py-4 text-sm font-semibold transition-all ${
                accountType === 'employee'
                  ? 'bg-matcha-600 text-white'
                  : 'text-tea-500 hover:bg-tea-50'
              }`}
            >
              👩 Zaměstnanec
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {accountType === 'employer' ? (
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Uživatel</label>
                <div className="flex items-center gap-3 p-3 bg-tea-50 rounded-xl border border-tea-200">
                  <span className="text-2xl">👩‍💼</span>
                  <div>
                    <p className="font-semibold text-tea-800">{currentEmployer.name}</p>
                    <p className="text-xs text-tea-500">{currentEmployer.role} • {currentEmployer.email}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Vyberte zaměstnance</label>
                <div className="space-y-2">
                  {employeeCredentials.map(emp => (
                    <label key={emp.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedEmployee === String(emp.id)
                        ? 'border-matcha-500 bg-matcha-50'
                        : 'border-tea-200 hover:border-tea-300 bg-tea-50'
                    }`}>
                      <input
                        type="radio"
                        name="employee"
                        value={emp.id}
                        checked={selectedEmployee === String(emp.id)}
                        onChange={() => setSelectedEmployee(String(emp.id))}
                        className="accent-matcha-600"
                      />
                      <span className="text-xl">{emp.id % 2 === 0 ? '👨' : '👩'}</span>
                      <div>
                        <p className="text-sm font-semibold text-tea-800">{emp.name}</p>
                        <p className="text-xs text-tea-500">{emp.role}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-tea-700 mb-1">Heslo</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={accountType === 'employer' ? 'Zadejte heslo (admin)' : 'Zadejte heslo (1234)'}
                className="w-full px-4 py-3 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 transition-colors text-tea-800 placeholder:text-tea-300"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-matcha-600 hover:bg-matcha-700 disabled:bg-matcha-400 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span> Přihlašování...
                </span>
              ) : (
                '🔑 Přihlásit se'
              )}
            </button>
          </form>

          <div className="px-6 pb-6 pt-0">
            <p className="text-xs text-center text-tea-400">
              Demo: Zaměstnavatel — heslo: <code className="bg-tea-100 px-1 rounded">admin</code> &nbsp;|&nbsp;
              Zaměstnanec — heslo: <code className="bg-tea-100 px-1 rounded">1234</code>
            </p>
          </div>
        </div>

        <p className="text-center text-matcha-300 text-xs mt-4">
          © 2025 Čajovna Zelená · Interní systém
        </p>
      </div>
    </div>
  );
}
