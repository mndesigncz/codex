'use client';

// Založení podniku — a rovnou s ním volba tarifu.
//
// Dřív vedla jediná cesta do pokladny přes Nastavení uvnitř aplikace:
// `/api/billing/checkout` chce přihlášeného provozovatele, takže kdo si
// chtěl předplatné aktivovat hned při registraci, narazil na 401. Z prodejní
// stránky se do Stripe nedalo dostat vůbec.
//
// Teď si tarif vybere ještě před formulářem (z ceníku se nese v adrese),
// a jakmile je účet založený a člověk přihlášený, pokladna se otevře sama.
// Kód týmu je přitom na obrazovce za ní — kdo kartu zadávat nechce, okno
// zavře a nic neztratí.

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogoMark, Icon } from '@/components/Icons';
import { PLAN_NAMES, PRICES, TRIAL_DAYS, priceLabel, type Interval, type PlanId } from '@/lib/plan';
import { formatMoney } from '@/lib/money';

// Pokladna se stahuje, až když má opravdu vyskočit. Kdo zakládá podnik na
// tarifu Zdarma, nemá důvod táhnout Stripe.js.
const CheckoutModal = dynamic(() => import('@/components/CheckoutModal'), { ssr: false });

const inputClass =
  'w-full field border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition text-sm';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [ref, setRef] = useState('');
  const [plan, setPlan] = useState<PlanId>('pro');
  const [interval, setIntervalPlanu] = useState<Interval>('month');
  const [pokladna, setPokladna] = useState(false);
  const [zaplaceno, setZaplaceno] = useState(false);
  const [prihlaseniSelhalo, setPrihlaseniSelhalo] = useState(false);
  const router = useRouter();
  // Affiliate odkaz /register?ref=KÓD — kód si pamatujeme i přes obnovení stránky.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const r = q.get('ref');
      if (r) { localStorage.setItem('managero-ref', r); setRef(r); }
      else setRef(localStorage.getItem('managero-ref') ?? '');
      // Tarif z ceníku. Neznámou hodnotu ignorujeme — adresa je od
      // návštěvníka a nemá právo nastavit něco, co neexistuje.
      const t = q.get('plan');
      if (t === 'free' || t === 'pro' || t === 'max') setPlan(t);
      if (q.get('interval') === 'year') setIntervalPlanu('year');
    } catch { /* ignore */ }
  }, []);

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
        body: JSON.stringify({ name, email, password, teamName, ref: ref || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Chyba při registraci.'); setIsLoading(false); return; }
      // Kód týmu se ukáže vždycky; přihlášení musí proběhnout dřív, než
      // se otevře pokladna — bez sezení by `/api/billing/checkout` vrátil 401.
      setJoinCode(data.joinCode);
      const prihlaseni = await signIn('credentials', { email, password, redirect: false });
      // Pokladna se otevře jen s platným sezením. Bez něj by `/api/billing/checkout`
      // vrátil 401 a člověk by koukal na chybu v okně, které si nevyžádal —
      // hned potom, co mu aplikace pogratulovala k založení podniku.
      if (plan !== 'free' && prihlaseni?.ok) setPokladna(true);
      else if (plan !== 'free') setPrihlaseniSelhalo(true);
    } catch {
      setError('Chyba serveru. Zkuste to prosím znovu.');
      setIsLoading(false);
    }
  };

  // Po registraci: kód týmu, a nad ním pokladna, pokud si člověk vybral
  // placený tarif. Pořadí je schválně takové — kód nesmí zmizet jen proto,
  // že někdo zavřel okno s kartou.
  if (joinCode) {
    const placeny = plan !== 'free';
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-5"><LogoMark size={64} /></div>
          <div className="glass-card p-8">
            <div className="text-4xl mb-3">🎉</div>
            <h1 className="text-2xl font-bold tracking-tight text-[#16181A] mb-2">Podnik vytvořen!</h1>
            <p className="text-black/55 text-sm mb-2">Sdílejte tento kód se zaměstnanci — připojí se do vašeho týmu.</p>

            {zaplaceno ? (
              <p className="text-xs text-[#5B7A08] bg-[#C8F542]/10 border border-[#C8F542]/25 rounded-xl px-3 py-2 mb-6 inline-flex items-center gap-1.5">
                <Icon name="check" size={13} className="shrink-0" />
                {PLAN_NAMES[plan]} je aktivní. Prvních {TRIAL_DAYS} dní zdarma, pak {priceLabel(plan as 'pro' | 'max', interval)}.
              </p>
            ) : (
              <p className="text-xs text-[#5B7A08] bg-[#C8F542]/10 border border-[#C8F542]/25 rounded-xl px-3 py-2 mb-6">
                Prvních {TRIAL_DAYS} dní máte všechny funkce Pro zdarma.
              </p>
            )}

            <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/25 p-6 mb-6">
              <p className="text-xs uppercase tracking-[0.2em] text-black/45 mb-2">Kód týmu</p>
              <p className="text-4xl font-bold tracking-[0.3em] text-[#5B7A08]">{joinCode}</p>
            </div>

            <button
              onClick={() => { router.push('/'); router.refresh(); }}
              className="w-full rounded-full bg-[#C8F542] text-black font-semibold py-3 hover:brightness-110 transition text-sm"
            >
              Přejít do aplikace →
            </button>

            {/* Kdo pokladnu zavřel, se k ní dostane zpátky bez hledání
                v Nastavení. Bez tohohle odkazu by zavřené okno znamenalo
                „tak snad někdy jindy". */}
            {placeny && !zaplaceno && prihlaseniSelhalo && (
              <p className="mt-3 text-xs text-wait-ink">
                Podnik je založený, ale přihlášení neproběhlo. Přihlas se a tarif {PLAN_NAMES[plan]} aktivuj v Nastavení → Předplatné.
              </p>
            )}
            {placeny && !zaplaceno && !prihlaseniSelhalo && (
              <button
                onClick={() => setPokladna(true)}
                className="tap-target-sm mt-3 w-full text-sm font-medium text-black/50 hover:text-[#16181A] transition"
              >
                Aktivovat {PLAN_NAMES[plan]} kartou
              </button>
            )}
          </div>
        </div>

        {pokladna && placeny && (
          <CheckoutModal
            plan={plan as 'pro' | 'max'}
            interval={interval}
            trial
            onClose={() => setPokladna(false)}
            onDone={() => { setZaplaceno(true); setPokladna(false); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5"><LogoMark size={64} /></div>
          <h1 className="text-3xl font-bold tracking-tight text-[#16181A] mb-2">Vytvořit podnik</h1>
          <p className="text-black/45 text-sm">Registrace je určená pro provozovatele. Zaměstnanci se připojují kódem nebo pozvánkou.</p>
        </div>

        <div className="glass-card p-8">
          {/* Tarif se volí tady, ne až někde v Nastavení po týdnu používání.
              Kdo přišel z ceníku, má vybráno; kdo přišel z hlavičky, může
              přepnout. Karta se zadává až po založení účtu. */}
          <fieldset className="mb-6">
            <legend className="block text-xs uppercase tracking-wider text-black/45 mb-2.5">Tarif na začátek</legend>
            <div className="grid grid-cols-3 gap-1.5">
              {(['free', 'pro', 'max'] as const).map(t => (
                <button key={t} type="button" onClick={() => setPlan(t)} aria-pressed={plan === t}
                  className={`tap-target rounded-2xl px-2 py-2.5 text-center transition ${
                    plan === t ? 'bg-[#16181A] text-white' : 'glass border border-black/10 text-black/65 hover:text-[#16181A]'
                  }`}>
                  <span className="block text-sm font-bold">{PLAN_NAMES[t]}</span>
                  <span className={`block text-[11px] ${plan === t ? 'text-white/60' : 'text-black/45'}`}>
                    {t === 'free' ? 'do 3 lidí' : formatMoney(PRICES[t][interval === 'year' ? 'year' : 'month'], 'CZK')}
                  </span>
                </button>
              ))}
            </div>
            {plan !== 'free' && (
              <div className="mt-2.5 flex items-center justify-between gap-3">
                <div className="flex gap-1 glass rounded-full p-1">
                  {(['month', 'year'] as const).map(i => (
                    <button key={i} type="button" onClick={() => setIntervalPlanu(i)} aria-pressed={interval === i}
                      className={`tap-target-sm rounded-full px-3 py-1 text-xs font-semibold transition ${interval === i ? 'seg-on' : 'seg-off'}`}>
                      {i === 'month' ? 'Měsíčně' : 'Ročně'}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-black/45 text-right">{TRIAL_DAYS} dní zdarma,<br />pak {priceLabel(plan, interval)}</p>
              </div>
            )}
          </fieldset>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="reg-jmeno" className="block text-xs uppercase tracking-wider text-black/45 mb-2">Vaše jméno</label>
              <input id="reg-jmeno" autoComplete="name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jan Novák" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="reg-podnik" className="block text-xs uppercase tracking-wider text-black/45 mb-2">Název podniku</label>
              <input id="reg-podnik" autoComplete="organization" type="text" value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Název podniku" className={inputClass} />
            </div>
            <div>
              <label htmlFor="reg-email" className="block text-xs uppercase tracking-wider text-black/45 mb-2">Email</label>
              <input id="reg-email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vas@email.cz" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="reg-heslo" className="block text-xs uppercase tracking-wider text-black/45 mb-2">Heslo</label>
              <input id="reg-heslo" autoComplete="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimálně 8 znaků" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="reg-heslo-znovu" className="block text-xs uppercase tracking-wider text-black/45 mb-2">Zopakuj heslo</label>
              <input id="reg-heslo-znovu" autoComplete="new-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Zadejte heslo znovu" required className={inputClass} />
            </div>

            {error && <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">{error}</div>}

            <button type="submit" disabled={isLoading} className="w-full py-3 rounded-full bg-[#C8F542] hover:brightness-110 disabled:opacity-50 text-black font-semibold transition text-sm active:scale-[0.98]">
              {isLoading ? 'Vytváření…' : 'Vytvořit podnik'}
            </button>
          </form>

          <div className="mt-6 space-y-1.5 text-center text-sm">
            <p className="text-black/45">Jste zaměstnanec? <Link href="/join" className="tap-target-sm inline-flex items-center text-[#5B7A08] hover:underline font-medium">Připojit se k týmu →</Link></p>
            <p className="text-black/45">Už máte účet? <Link href="/login" className="tap-target-sm inline-flex items-center text-[#5B7A08] hover:underline font-medium">Přihlásit se</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
