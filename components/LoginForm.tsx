'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogoMark } from './Icons';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get('registered') === '1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) setError('Nesprávný email nebo heslo.');
      else { router.push('/'); router.refresh(); }
    } catch {
      setError('Chyba při přihlášení.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = 'w-full rounded-2xl bg-black/[0.03] border border-black/[0.09] px-4 py-3.5 text-[#16181A] placeholder-black/30 focus:border-[#C8F542] focus:ring-2 focus:ring-[#C8F542]/25 focus:outline-none transition text-sm';

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-5xl grid md:grid-cols-2 rounded-[32px] overflow-hidden bg-white/70 backdrop-blur-xl border border-black/[0.06] shadow-[0_30px_80px_rgba(25,35,15,0.12)]">
        {/* Left — brand panel */}
        <div className="relative hidden md:flex flex-col justify-between p-10 min-h-[560px] overflow-hidden">
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(120% 120% at 15% 10%, #EEFFB8 0%, #C8F542 34%, #7FD9BE 72%, #4FB0C8 100%)' }}
          />
          <div className="relative flex items-center gap-2.5">
            <LogoMark size={38} />
            <span className="font-bold text-[#16181A] tracking-tight">Pangea</span>
          </div>
          <div className="relative">
            <p className="text-[#16181A]/60 text-sm mb-2">Vítejte zpět</p>
            <h2 className="text-3xl font-bold tracking-tight text-[#16181A] leading-snug">
              Přehled o celém<br />podniku na jednom místě.
            </h2>
          </div>
        </div>

        {/* Right — form */}
        <div className="p-8 sm:p-12 flex flex-col justify-center bg-white">
          <div className="md:hidden flex items-center gap-2.5 mb-8">
            <LogoMark size={38} />
            <span className="font-bold text-[#16181A] tracking-tight">Pangea</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-[#16181A]">Přihlásit se</h1>
          <p className="text-black/45 text-sm mt-1.5 mb-8">Zadejte své údaje pro vstup do systému.</p>

          {justRegistered && (
            <div className="p-4 rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/30 text-[#5B7A08] text-sm mb-6">
              Účet byl vytvořen. Nyní se můžete přihlásit.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#16181A] mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vas@email.cz" required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#16181A] mb-1.5">Heslo</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Zadejte heslo" required className={`${inputClass} pr-12`} />
                <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-black/35 hover:text-black/60 text-sm">
                  {showPwd ? 'skrýt' : 'zobrazit'}
                </button>
              </div>
            </div>

            {error && <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">{error}</div>}

            <button type="submit" disabled={isLoading}
              className="w-full rounded-2xl bg-[#16181A] text-white font-semibold py-3.5 hover:bg-black disabled:opacity-50 transition text-sm shadow-[0_8px_24px_rgba(20,24,10,0.2)]">
              {isLoading ? 'Přihlašování…' : 'Přihlásit se'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-black/[0.07] space-y-2 text-center text-sm">
            <p className="text-black/50">Provozujete podnik? <Link href="/register" className="text-[#5B7A08] hover:underline font-semibold">Vytvořit účet</Link></p>
            <p className="text-black/50">Máte kód týmu nebo pozvánku? <Link href="/join" className="text-[#5B7A08] hover:underline font-semibold">Připojit se</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
