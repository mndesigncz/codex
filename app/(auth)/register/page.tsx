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
import { textPoRegistraci } from '@/lib/predplatneTexty';
import { formatMoney } from '@/lib/money';
import JazykMenu from '@/components/ui/JazykMenu';
import { useT } from '@/lib/i18n/client';

// Pokladna se stahuje, až když má opravdu vyskočit. Kdo zakládá podnik na
// tarifu Zdarma, nemá důvod táhnout Stripe.js.
const CheckoutModal = dynamic(() => import('@/components/CheckoutModal'), { ssr: false });

const inputClass =
  'w-full field border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition text-sm';

// Překlad registrace (kolo 76). Formulář je přeložený, vykání jako v originálu
// (německy „Sie“). Právně a platebně citlivá část zůstává ČESKY: výběr tarifu,
// ceny, zkušební doba a věty po registraci o platbě (lib/predplatneTexty.ts) —
// překlad by tvrdil něco o penězích, co musí schválit člověk. U cizího jazyka
// pod výběrem tarifu proto stojí poznámka.
export default function RegisterPage() {
  const t = useT('auth');
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
    if (password.length < 8) { setError(t('Heslo musí mít alespoň 8 znaků.')); return; }
    if (password !== confirmPassword) { setError(t('Hesla se neshodují.')); return; }

    setIsLoading(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, teamName, ref: ref || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t('Chyba při registraci.')); setIsLoading(false); return; }
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
      setError(t('Chyba serveru. Zkuste to prosím znovu.'));
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
            <h1 className="text-2xl font-bold tracking-tight text-[#16181A] mb-2">{t('Podnik vytvořen!')}</h1>
            <p className="text-black/55 text-sm mb-2">{t('Sdílejte tento kód se zaměstnanci — připojí se do vašeho týmu.')}</p>

            {/* Sdělení musí říkat pravdu o tom, co se stalo: nový podnik je na
                tarifu Zdarma a zkouška Pro/Max běží až po zadání karty ve
                Stripe pokladně (lib/predplatneTexty.ts). */}
            {zaplaceno ? (
              <p className="text-xs text-[#5B7A08] bg-[#C8F542]/10 border border-[#C8F542]/25 rounded-xl px-3 py-2 mb-6 inline-flex items-center gap-1.5">
                <Icon name="check" size={13} className="shrink-0" />
                {textPoRegistraci({ plan, stav: 'aktivni', interval })}
              </p>
            ) : (
              <p className="note note-info text-xs mb-6">
                {textPoRegistraci({ plan, stav: placeny && !prihlaseniSelhalo ? 'zavrenaPokladna' : 'zdarma', interval })}
              </p>
            )}

            <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/25 p-6 mb-6">
              <p className="text-xs uppercase tracking-[0.2em] text-black/45 mb-2">{t('Kód týmu')}</p>
              <p className="text-4xl font-bold tracking-[0.3em] text-[#5B7A08]">{joinCode}</p>
            </div>

            <button
              onClick={() => { router.push('/'); router.refresh(); }}
              className="w-full rounded-full bg-[#C8F542] text-black font-semibold py-3 hover:brightness-110 transition text-sm"
            >
              {t('Přejít do aplikace →')}
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
    <div className="relative min-h-[100dvh] flex items-center justify-center p-4">
      {/* Přepínač jazyka: malá pilulka v rohu stránky. */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6"><JazykMenu /></div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5"><LogoMark size={64} /></div>
          <h1 className="text-3xl font-bold tracking-tight text-[#16181A] mb-2">{t('Vytvořit podnik')}</h1>
          <p className="text-black/45 text-sm">{t('Registrace je určená pro provozovatele. Zaměstnanci se připojují kódem nebo pozvánkou.')}</p>
        </div>

        <div className="glass-card p-8">
          {/* Tarif se volí tady, ne až někde v Nastavení po týdnu používání.
              Kdo přišel z ceníku, má vybráno; kdo přišel z hlavičky, může
              přepnout. Karta se zadává až po založení účtu. */}
          <fieldset className="mb-6">
            <legend className="block text-xs uppercase tracking-wider text-black/45 mb-2.5">Tarif na začátek</legend>{/* i18n-ok: tarif, cena a platba zůstávají česky */}
            <div className="grid grid-cols-3 gap-1.5">
              {(['free', 'pro', 'max'] as const).map(tp => (
                <button key={tp} type="button" onClick={() => setPlan(tp)} aria-pressed={plan === tp}
                  className={`tap-target rounded-2xl px-2 py-2.5 text-center transition ${
                    plan === tp ? 'bg-[#16181A] text-white' : 'glass border border-black/10 text-black/65 hover:text-[#16181A]'
                  }`}>
                  <span className="block text-sm font-bold">{PLAN_NAMES[tp]}</span>
                  <span className={`block text-[11px] ${plan === tp ? 'text-white/60' : 'text-black/45'}`}>
                    {tp === 'free' ? 'do 3 lidí' /* i18n-ok: cena */ : formatMoney(PRICES[tp][interval === 'year' ? 'year' : 'month'], 'CZK')}
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
                      {i === 'month' ? 'Měsíčně' : 'Ročně'}{/* i18n-ok: cena */}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-black/45 text-right">{TRIAL_DAYS} dní zdarma,<br />pak {priceLabel(plan, interval)}</p>
              </div>
            )}
            {/* Ceník a platba zůstávají česky (právně citlivé); cizímu jazyku to řekneme. */}
            {t.jazyk !== 'cs' && <p className="t-meta mt-2.5">{t('Ceník a platební podmínky jsou zatím jen česky.')}</p>}
          </fieldset>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="reg-jmeno" className="block text-xs uppercase tracking-wider text-black/45 mb-2">{t('Vaše jméno')}</label>
              <input id="reg-jmeno" autoComplete="name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('Jan Novák')} required className={inputClass} />
            </div>
            <div>
              <label htmlFor="reg-podnik" className="block text-xs uppercase tracking-wider text-black/45 mb-2">{t('Název podniku')}</label>
              <input id="reg-podnik" autoComplete="organization" type="text" value={teamName} onChange={e => setTeamName(e.target.value)} placeholder={t('Název podniku')} className={inputClass} />
            </div>
            <div>
              <label htmlFor="reg-email" className="block text-xs uppercase tracking-wider text-black/45 mb-2">{t('Email')}</label>
              <input id="reg-email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('vas@email.cz')} required className={inputClass} />
            </div>
            <div>
              <label htmlFor="reg-heslo" className="block text-xs uppercase tracking-wider text-black/45 mb-2">{t('Heslo')}</label>
              <input id="reg-heslo" autoComplete="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('Minimálně 8 znaků')} required className={inputClass} />
            </div>
            <div>
              <label htmlFor="reg-heslo-znovu" className="block text-xs uppercase tracking-wider text-black/45 mb-2">{t('Zopakuj heslo')}</label>
              <input id="reg-heslo-znovu" autoComplete="new-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t('Zadejte heslo znovu')} required className={inputClass} />
            </div>

            {error && <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">{error}</div>}

            <button type="submit" disabled={isLoading} className="w-full py-3 rounded-full bg-[#C8F542] hover:brightness-110 disabled:opacity-50 text-black font-semibold transition text-sm active:scale-[0.98]">
              {isLoading ? t('Vytváření…') : t('Vytvořit podnik')}
            </button>
          </form>

          <div className="mt-6 space-y-1.5 text-center text-sm">
            <p className="text-black/45">{t('Jste zaměstnanec?')} <Link href="/join" className="tap-target-sm inline-flex items-center text-[#5B7A08] hover:underline font-medium">{t('Připojit se k týmu →')}</Link></p>
            <p className="text-black/45">{t('Už máte účet?')} <Link href="/login" className="tap-target-sm inline-flex items-center text-[#5B7A08] hover:underline font-medium">{t('Přihlásit se')}</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
