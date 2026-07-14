'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Nesprávný email nebo heslo.');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setError('Chyba při přihlášení.');
    } finally {
      setIsLoading(false);
    }
  };

  const fillEmployer = () => {
    setEmail('eva@cajovna.cz');
    setPassword('admin123');
  };

  const fillEmployee = () => {
    setEmail('jana@cajovna.cz');
    setPassword('heslo123');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-matcha-700 via-matcha-600 to-matcha-500 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
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
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-6">
            <h2 className="text-xl font-bold text-tea-800 mb-5">Přihlásit se</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="vas@email.cz"
                  required
                  className="w-full px-4 py-3 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 transition-colors text-tea-800 placeholder:text-tea-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Heslo</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Zadejte heslo"
                  required
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

            {/* Quick fill buttons */}
            <div className="mt-5 pt-4 border-t border-tea-100">
              <p className="text-xs text-tea-400 text-center mb-3">Demo účty</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={fillEmployer}
                  className="flex-1 py-2 px-3 bg-matcha-50 border border-matcha-200 text-matcha-700 text-xs rounded-xl hover:bg-matcha-100 transition-colors"
                >
                  👩‍💼 Zaměstnavatel
                </button>
                <button
                  type="button"
                  onClick={fillEmployee}
                  className="flex-1 py-2 px-3 bg-tea-50 border border-tea-200 text-tea-700 text-xs rounded-xl hover:bg-tea-100 transition-colors"
                >
                  👩 Zaměstnanec
                </button>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-matcha-300 text-xs mt-4">
          © 2025 Čajovna Zelená · Interní systém
        </p>
      </div>
    </div>
  );
}
