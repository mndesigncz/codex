'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogoMark } from '@/components/Icons';

const inputClass =
  'w-full rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Heslo musí mít alespoň 8 znaků.'); return; }
    if (password !== confirmPassword) { setError('Hesla se neshodují.'); return; }

    setIsLoading(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, teamName }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Chyba při registraci.'); setIsLoading(false); return; }
      // Show the join code, then sign in automatically
      setJoinCode(data.joinCode);
      await signIn('credentials', { email, password, redirect: false });
    } catch {
      setError('Chyba serveru. Zkuste to prosím znovu.');
      setIsLoading(false);
    }
  };

  // Success screen — reveal the team join code
  if (joinCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-5"><LogoMark size={64} /></div>
          <div className="glass-card p-8">
            <div className="text-4xl mb-3">🎉</div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Podnik vytvořen!</h1>
            <p className="text-white/50 text-sm mb-6">Sdílejte tento kód se zaměstnanci — připojí se do vašeho týmu.</p>
            <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/25 p-6 mb-6">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40 mb-2">Kód týmu</p>
              <p className="text-4xl font-bold tracking-[0.3em] text-[#C8F542]">{joinCode}</p>
            </div>
            <button
              onClick={() => { router.push('/'); router.refresh(); }}
              className="w-full rounded-full bg-[#C8F542] text-black font-semibold py-3 hover:brightness-110 transition text-sm"
            >
              Přejít do aplikace →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5"><LogoMark size={64} /></div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Vytvořit podnik</h1>
          <p className="text-white/40 text-sm">Registrace je určená pro provozovatele. Zaměstnanci se připojují kódem nebo pozvánkou.</p>
        </div>

        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Vaše jméno</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jan Novák" required className={inputClass} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Název podniku</label>
              <input type="text" value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Čajovna Zelená" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vas@email.cz" required className={inputClass} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Heslo</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimálně 8 znaků" required className={inputClass} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Zopakuj heslo</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Zadejte heslo znovu" required className={inputClass} />
            </div>

            {error && <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

            <button type="submit" disabled={isLoading} className="w-full py-3 rounded-full bg-[#C8F542] hover:brightness-110 disabled:opacity-50 text-black font-semibold transition-all text-sm active:scale-[0.98]">
              {isLoading ? 'Vytváření…' : 'Vytvořit podnik'}
            </button>
          </form>

          <div className="mt-6 space-y-1.5 text-center text-sm">
            <p className="text-white/40">Jste zaměstnanec? <Link href="/join" className="text-[#C8F542] hover:underline font-medium">Připojit se k týmu →</Link></p>
            <p className="text-white/40">Už máte účet? <Link href="/login" className="text-[#C8F542] hover:underline font-medium">Přihlásit se</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
