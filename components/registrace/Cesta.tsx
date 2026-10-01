'use client';

// Založení podniku jako cesta (kolo 77).
//
// Dřív: tarif a karta jako první otázka, pak formulář, pak pokladna, a teprve
// potom průvodce. Člověk měl platit za něco, co ještě neviděl. Teď je pořadí
// jako u aplikací, které umí prodávat: nejdřív pár otázek o podniku (typ,
// název, velikost týmu, co chce mít pod kontrolou), pak krátké shrnutí, které
// ty odpovědi přečte zpátky, pak účet, a až na konci volba tarifu. Zdarma jde
// bez karty; Pro a Max otevřou pokladnu Stripe se zkušební dobou: předplatné
// je ve Stripe hned aktivní (trialing), karta je uložená a po zkušební době se
// strhne sama (lib/billing.ts, createCheckout).
//
// Odpovědi se při registraci uloží do teams.onboarding, takže průvodce
// nastavením na ně naváže a znovu se na ně neptá (začne krokem „podnik").
//
// Nikdy slepá ulička: každý krok jde vrátit, zavřená pokladna nechá vybrat
// znovu nebo zůstat na Zdarma, a v nativní aplikaci se tarif vůbec nenabízí
// (Apple 3.1.1, Google Play Billing): po účtu jde člověk rovnou do průvodce.

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Icon, LogoMark, type IconName } from '@/components/Icons';
import { useObal } from '@/components/ObalProvider';
import { useT } from '@/lib/i18n/client';
import JazykMenu from '@/components/ui/JazykMenu';
import { PLAN_NAMES, PRICES, TRIAL_DAYS, type Interval, type PlanId } from '@/lib/plan';
import { formatMoney } from '@/lib/money';
import { pragueToday } from '@/lib/pragueTime';
import { fmtDatum } from '@/lib/i18n/format';
import { CILE, NAZEV_VELIKOSTI, TYPY, VELIKOSTI_TYMU, type Cil, type TypPodniku, type VelikostTymu } from '@/lib/pruvodce/typy';
import { doporucenyTarif } from '@/lib/pruvodce/plan';
import './cesta.css';

const CheckoutModal = dynamic(() => import('@/components/CheckoutModal'), { ssr: false });

type Krok = 'typ' | 'nazev' | 'tym' | 'cile' | 'sestavuji' | 'ucet' | 'tarif';
const OTAZKY: Krok[] = ['typ', 'nazev', 'tym', 'cile'];

// Krátké pojmenování typu do vět („tvoje kavárna", „tvůj bar").
const TVUJ: Record<TypPodniku, string> = {
  kavarna: 'tvoje kavárna', restaurace: 'tvoje restaurace', bar: 'tvůj bar', pekarna: 'tvoje pekárna', // i18n-ok: jen čeština, cizí jazyk dostane t('tvůj podnik')
  caj: 'tvůj čajový podnik', foodtruck: 'tvůj stánek', jine: 'tvůj podnik', // i18n-ok
};

const tarifNaPlan = (t: 'zdarma' | 'pro' | 'max'): PlanId => (t === 'zdarma' ? 'free' : t);

export default function Cesta() {
  const t = useT('auth');
  // Typy podniku, velikosti týmu a cíle mají překlady ve slovníku průvodce (stejné texty).
  const tp = useT('pruvodce');
  const router = useRouter();
  const { smiPlatby } = useObal();

  const [krok, setKrok] = useState<Krok>('typ');
  const [smer, setSmer] = useState<1 | -1>(1);
  const [typ, setTyp] = useState<TypPodniku | null>(null);
  const [nazev, setNazev] = useState('');
  const [velikost, setVelikost] = useState<VelikostTymu | null>(null);
  const [cile, setCile] = useState<Cil[]>([]);
  const [jmeno, setJmeno] = useState('');
  const [email, setEmail] = useState('');
  const [heslo, setHeslo] = useState('');
  const [ukazHeslo, setUkazHeslo] = useState(false);
  const [chyba, setChyba] = useState('');
  const [existuje, setExistuje] = useState(false);
  const [prihlaseniSelhalo, setPrihlaseniSelhalo] = useState(false);
  const [odesila, setOdesila] = useState(false);
  const [ref, setRef] = useState('');
  const [planZAdresy, setPlanZAdresy] = useState<PlanId | null>(null);
  const [plan, setPlan] = useState<PlanId>('pro');
  const [interval, setIntervalPlanu] = useState<Interval>('month');
  const [pokladna, setPokladna] = useState(false);
  const nadpis = useRef<HTMLHeadingElement>(null);

  // Affiliate kód a tarif z ceníku (?plan=pro&interval=year). Hodnoty z adresy
  // jsou od návštěvníka: neznámé se ignorují.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const r = q.get('ref');
      if (r) { localStorage.setItem('managero-ref', r); setRef(r); }
      else setRef(localStorage.getItem('managero-ref') ?? '');
      const p = q.get('plan');
      if (p === 'free' || p === 'pro' || p === 'max') setPlanZAdresy(p);
      if (q.get('interval') === 'year') setIntervalPlanu('year');
    } catch { /* bez úložiště jen bez doporučení */ }
  }, []);

  const odpovedi = useMemo(() => ({ typ: typ ?? undefined, tym: velikost ? { velikost } : undefined, cile }), [typ, velikost, cile]);
  const doporuceny: PlanId = tarifNaPlan(doporucenyTarif(odpovedi));

  const krokyCesty: Krok[] = smiPlatby ? [...OTAZKY, 'sestavuji', 'ucet', 'tarif'] : [...OTAZKY, 'sestavuji', 'ucet'];
  const poradi = krokyCesty.indexOf(krok);
  const postup = (poradi + 1) / krokyCesty.length;

  const jdi = (k: Krok, s: 1 | -1 = 1) => { setSmer(s); setChyba(''); setKrok(k); };
  const dal = () => { const n = krokyCesty[poradi + 1]; if (n) jdi(n, 1); };
  const zpet = () => { const p = krokyCesty[poradi - 1]; if (p && p !== 'sestavuji') jdi(p, -1); else if (p === 'sestavuji') jdi('cile', -1); };

  // Fokus na nadpis nového kroku: odečítač oznámí otázku, klávesnice začíná nahoře.
  useEffect(() => { nadpis.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }, [krok]);

  // Po účtu: tarif doporučený podle odpovědí, nebo ten, se kterým člověk přišel z ceníku.
  useEffect(() => { if (krok === 'tarif') setPlan(planZAdresy ?? doporuceny); }, [krok]); // eslint-disable-line react-hooks/exhaustive-deps

  // „Skládám Managero": krátké čtení odpovědí zpátky, pak dál. S vypnutým pohybem bez čekání na animaci.
  useEffect(() => {
    if (krok !== 'sestavuji') return;
    const bezPohybu = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tm = window.setTimeout(() => jdi('ucet'), bezPohybu ? 1200 : 3200);
    return () => window.clearTimeout(tm);
  }, [krok]);

  const vyberJeden = <T,>(nastav: (v: T) => void) => (v: T) => {
    nastav(v);
    // Jedna volba = hned dál, jen s chviličkou, ať je vidět, co se vybralo.
    window.setTimeout(() => dal(), 260);
  };

  const zalozit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChyba(''); setExistuje(false);
    if (heslo.length < 8) { setChyba(t('Heslo musí mít alespoň 8 znaků.')); return; }
    setOdesila(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: jmeno, email, password: heslo, teamName: nazev.trim(), ref: ref || undefined, odpovedi: { typ, nazev: nazev.trim(), tym: velikost ? { velikost } : undefined, cile } }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) setExistuje(true);
        setChyba(d.error || t('Chyba při registraci.'));
        setOdesila(false);
        return;
      }
      // Přihlásit hned: pokladna i průvodce chtějí sezení.
      const prihlaseni = await signIn('credentials', { email, password: heslo, redirect: false });
      setOdesila(false);
      // Podnik už existuje; bez sezení by pokladna vrátila 401. Říct to a ukázat cestu dál, ne tiše přesměrovat.
      if (!prihlaseni?.ok) { setPrihlaseniSelhalo(true); return; }
      if (smiPlatby) jdi('tarif');
      else { router.push('/employer/start'); router.refresh(); }
    } catch {
      setChyba(t('Chyba serveru. Zkuste to prosím znovu.'));
      setOdesila(false);
    }
  };

  const doAplikace = () => { router.push('/employer/start'); router.refresh(); };
  const potvrditTarif = () => { if (plan === 'free') doAplikace(); else setPokladna(true); };

  // Den, kdy se karta poprvé strhne: dnes v Praze plus zkušební doba.
  const prvniPlatba = useMemo(() => fmtDatum(pragueToday(TRIAL_DAYS), { jazyk: 'cs', styl: 'dlouze' }), []);

  const typPopis = typ ? tp(nazevTypu(typ)) : '';

  return (
    <div className="cs-root">
      <header className="cs-lista">
        <div className="cs-lista-obsah">
          {poradi > 0 && krok !== 'sestavuji' && krok !== 'tarif' ? (
            <button type="button" onClick={zpet} className="cs-zpet" aria-label={t('Zpět')}>
              <Icon name="chevron" size={18} className="rotate-90" aria-hidden />
            </button>
          ) : (
            <Link href="/" className="cs-zpet" aria-label="Managero"><LogoMark size={28} /></Link>
          )}
          <div className="cs-postup" role="progressbar" aria-label={t('Postup registrace')} aria-valuemin={0} aria-valuemax={krokyCesty.length} aria-valuenow={poradi + 1}>
            <span style={{ transform: `scaleX(${postup})` }} />
          </div>
          <Link href="/login" className="cs-prihlasit">{t('Přihlásit')}</Link>
        </div>
      </header>

      <main className="cs-obsah">
        <div key={krok} className="cs-krok" data-smer={smer}>
          {krok === 'typ' && (
            <>
              <h1 ref={nadpis} tabIndex={-1} className="cs-otazka">{t('Jaký podnik vedeš?')}</h1>
              <p className="cs-pod">{t('Podle toho ti Managero připraví směny, sklad a postupy.')}</p>
              <ul className="cs-volby cs-volby-2 mt-8">
                {TYPY.map(x => (
                  <li key={x.id}>
                    <button type="button" aria-pressed={typ === x.id} onClick={() => vyberJeden(setTyp)(x.id)} className="cs-volba">
                      <span className="cs-volba-nazev">{tp(x.nazev)}</span>
                      <span className="cs-volba-veta">{tp(x.veta)}</span>
                      <span className="cs-volba-znacka" aria-hidden><Icon name="check" size={13} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {krok === 'nazev' && (
            <form onSubmit={e => { e.preventDefault(); if (nazev.trim().length >= 2) dal(); }}>
              <h1 ref={nadpis} tabIndex={-1} className="cs-otazka">{t('Jak se {co} jmenuje?', { co: t.jazyk === 'cs' && typ ? TVUJ[typ] : t('tvůj podnik') })}</h1>
              <p className="cs-pod">{t('Uvidí ho tým v aplikaci a hosté na menu. Změníš ho kdykoli.')}</p>
              <label htmlFor="cs-nazev" className="sr-only">{t('Název podniku')}</label>
              <input id="cs-nazev" autoFocus autoComplete="organization" value={nazev} onChange={e => setNazev(e.target.value)} maxLength={80}
                placeholder={t('Třeba Kavárna U Lípy')} className="cs-pole mt-8" />
              <button type="submit" disabled={nazev.trim().length < 2} className="cs-dal mt-6">{t('Pokračovat')}</button>
            </form>
          )}

          {krok === 'tym' && (
            <>
              <h1 ref={nadpis} tabIndex={-1} className="cs-otazka">{t('Kolik vás v podniku pracuje?')}</h1>
              <p className="cs-pod">{t('I s tebou. Tým do 3 lidí může na tarifu Zdarma zůstat napořád.')}</p>
              <ul className="cs-volby mt-8">
                {VELIKOSTI_TYMU.map(v => (
                  <li key={v}>
                    <button type="button" aria-pressed={velikost === v} onClick={() => vyberJeden(setVelikost)(v)} className="cs-volba cs-volba-radek">
                      <span className="cs-volba-nazev">{tp(NAZEV_VELIKOSTI[v])}</span>
                      <span className="cs-volba-znacka" aria-hidden><Icon name="check" size={13} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {krok === 'cile' && (
            <>
              <h1 ref={nadpis} tabIndex={-1} className="cs-otazka">{t('Co chceš mít pod kontrolou jako první?')}</h1>
              <p className="cs-pod">{t('Vyber, kolik chceš. Úvodní přehled poskládáme podle toho.')}</p>
              <ul className="cs-volby cs-volby-2 mt-8">
                {CILE.map(c => {
                  const on = cile.includes(c.id);
                  return (
                    <li key={c.id}>
                      <button type="button" aria-pressed={on} className="cs-volba"
                        onClick={() => setCile(p => (on ? p.filter(x => x !== c.id) : [...p, c.id]))}>
                        <span className="cs-volba-ikona" aria-hidden><Icon name={c.ikona as IconName} size={18} /></span>
                        <span className="cs-volba-nazev">{tp(c.nazev)}</span>
                        <span className="cs-volba-veta">{tp(c.veta)}</span>
                        {c.tarif !== 'zdarma' && <span className="cs-volba-tarif">{c.tarif === 'max' ? 'Max' : 'Pro'}</span>}
                        <span className="cs-volba-znacka" aria-hidden><Icon name="check" size={13} /></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button type="button" disabled={cile.length === 0} onClick={dal} className="cs-dal mt-8">{t('Pokračovat')}</button>
            </>
          )}

          {krok === 'sestavuji' && (
            <div className="cs-sestavuji" role="status" aria-live="polite">
              <h1 ref={nadpis} tabIndex={-1} className="cs-otazka">{t('Skládám Managero na míru')}</h1>
              <ul className="cs-cteni mt-8">
                {[nazev.trim(), typPopis, velikost ? t('Tým: {v}', { v: tp(NAZEV_VELIKOSTI[velikost]).toLowerCase() }) : '', ...cile.map(c => tp(CILE.find(x => x.id === c)!.nazev))]
                  .filter(Boolean).map((r, i) => (
                    <li key={r} style={{ ['--i' as string]: i }}>
                      <span className="cs-cteni-znacka" aria-hidden><Icon name="check" size={12} /></span>{r}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {krok === 'ucet' && (
            <form onSubmit={zalozit} noValidate>
              <h1 ref={nadpis} tabIndex={-1} className="cs-otazka">{t('Kam ti máme poslat přístup?')}</h1>
              <p className="cs-pod">{t('Účet je tvůj, jako majitele. Zaměstnanci se připojí později kódem.')}</p>
              <div className="mt-8 space-y-3">
                <div>
                  <label htmlFor="cs-jmeno" className="cs-popisek">{t('Tvoje jméno')}</label>
                  <input id="cs-jmeno" autoComplete="name" required value={jmeno} onChange={e => setJmeno(e.target.value)} placeholder={t('Jan Novák')} className="cs-pole" />
                </div>
                <div>
                  <label htmlFor="cs-email" className="cs-popisek">{t('E-mail')}</label>
                  <input id="cs-email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={t('vas@email.cz')} className="cs-pole" />
                </div>
                <div>
                  <label htmlFor="cs-heslo" className="cs-popisek">{t('Heslo')}</label>
                  <div className="relative">
                    <input id="cs-heslo" type={ukazHeslo ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={heslo} onChange={e => setHeslo(e.target.value)} placeholder={t('Minimálně 8 znaků')} className="cs-pole !pr-24" />
                    <button type="button" onClick={() => setUkazHeslo(v => !v)} className="cs-ukaz" aria-pressed={ukazHeslo}>{ukazHeslo ? t('Skrýt') : t('Ukázat')}</button>
                  </div>
                </div>
              </div>
              {prihlaseniSelhalo && (
                <p className="note note-wait mt-4 text-sm" role="alert">
                  {t('Podnik je založený, jen se nepodařilo přihlásit.')} <Link href="/login" className="font-semibold underline underline-offset-2">{t('Přihlásit se')}</Link>
                </p>
              )}
              {chyba && (
                <p className="note note-danger mt-4 text-sm" role="alert">
                  {chyba}{existuje && <> <Link href="/login" className="font-semibold underline underline-offset-2">{t('Přihlásit se')}</Link></>}
                </p>
              )}
              <button type="submit" disabled={odesila || prihlaseniSelhalo || !jmeno.trim() || !email.trim() || heslo.length < 8} className="cs-dal mt-6">
                {odesila ? t('Zakládám podnik…') : t('Založit podnik')}
              </button>
              <p className="mt-4 text-xs text-black/55 text-pretty">Založením účtu souhlasíš s <Link href="/podminky" className="underline underline-offset-2">Podmínkami užívání</Link> a bereš na vědomí <Link href="/soukromi" className="underline underline-offset-2">Zásady ochrany osobních údajů</Link>.</p>{/* i18n-ok: právní věta zůstává česky */}
            </form>
          )}

          {krok === 'tarif' && (
            <>
              <h1 ref={nadpis} tabIndex={-1} className="cs-otazka">{nazev.trim() ? `Podnik ${nazev.trim()} je založený.` : 'Podnik je založený.'}<br />Jak chceš začít?</h1>{/* i18n-ok: tarif a platba zůstávají česky */}
              {t.jazyk !== 'cs' && <p className="cs-pod">{t('Ceník a platební podmínky jsou zatím jen česky.')}</p>}
              <p className="cs-pod">{doporuceny === 'free'
                ? 'Na to, co chceš řešit, ti Zdarma zatím stačí. Pro nebo Max si můžeš vyzkoušet kdykoli později.' // i18n-ok
                : `Podle toho, co chceš řešit, doporučujeme ${PLAN_NAMES[doporuceny]}: ${doporuceny === 'max' ? 'hosté a napojení pokladny' : 'větší tým, tablet u baru a přehledy'}. Prvních ${TRIAL_DAYS} dní zdarma.`}</p>{/* i18n-ok */}

              <div className="mt-6 flex justify-center">
                <div className="cs-interval" role="group" aria-label="Období platby">{/* i18n-ok: tarif a platba zůstávají česky */}
                  {(['month', 'year'] as const).map(i => (
                    <button key={i} type="button" aria-pressed={interval === i} onClick={() => setIntervalPlanu(i)}>{/* i18n-ok */}{i === 'month' ? 'Měsíčně' : 'Ročně'}</button>
                  ))}
                </div>
              </div>

              <ul className="mt-6 space-y-3">
                {(['pro', 'max', 'free'] as const).map(p => {
                  const on = plan === p;
                  const cena = p === 'free' ? null : PRICES[p][interval === 'year' ? 'year' : 'month'];
                  return (
                    <li key={p}>
                      <button type="button" aria-pressed={on} onClick={() => setPlan(p)} className="cs-tarif">
                        <span className="cs-tarif-kruh" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="cs-volba-nazev">{PLAN_NAMES[p]}</span>
                            {p === doporuceny && <span className="cs-doporuceno">Doporučeno</span>}{/* i18n-ok */}
                            {p !== 'free' && <span className="cs-zdarma">{TRIAL_DAYS} dní zdarma</span>}
                          </span>
                          <span className="cs-volba-veta">
                            {p === 'free' ? 'Tým do 3 lidí, směny, úkoly, uzávěrky a sklad. Bez karty.' : p === 'pro' ? 'Neomezený tým, tablet u baru, odměny, exporty a měsíční přehled.' : 'Vše z Pro, a k tomu hosté: věrnost, rezervace, objednávky od stolu a pokladna Storyous.'}{/* i18n-ok */}
                          </span>
                        </span>
                        <span className="cs-tarif-cena">
                          {formatMoney(cena ?? 0, 'CZK')}
                          <span>{cena == null ? 'napořád' : interval === 'year' ? 'ročně' : 'měsíčně'}</span>{/* i18n-ok */}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="cs-shrnuti-platby mt-6">
                {plan === 'free'
                  ? <p>{/* i18n-ok */}Dnes ani později nic neplatíš. Placený tarif si zapneš kdykoli v Nastavení.</p>
                  : <p>{/* i18n-ok */}<strong>Dnes zaplatíš {formatMoney(0, 'CZK')}.</strong> Kartu zadáš teď a předplatné běží hned. První platbu {formatMoney(PRICES[plan][interval === 'year' ? 'year' : 'month'], 'CZK')} strhneme {prvniPlatba}, pak {interval === 'year' ? 'jednou ročně' : 'každý měsíc'}. Když ho do té doby zrušíš, nezaplatíš nic. Zrušit jde kdykoli v Nastavení, jedním klikem.</p>}
              </div>
              <button type="button" onClick={potvrditTarif} className="cs-dal cs-dal-limetka mt-5">
                {plan === 'free' ? 'Pokračovat zdarma' : `Vyzkoušet ${PLAN_NAMES[plan]} ${TRIAL_DAYS} dní zdarma`}{/* i18n-ok */}
              </button>
              {plan !== 'free' && (
                <button type="button" onClick={doAplikace} className="cs-odkaz mt-3">{/* i18n-ok */}Teď ne, pokračovat na Zdarma</button>
              )}
            </>
          )}
        </div>
      </main>

      {krok === 'typ' && (
        <div className="cs-pata">
          <p>{t('Jsi zaměstnanec?')} <Link href="/join" className="font-semibold underline underline-offset-2">{t('Připojit se k týmu')}</Link></p>
          <JazykMenu />
        </div>
      )}

      {pokladna && plan !== 'free' && (
        <CheckoutModal plan={plan} interval={interval} trial onClose={() => setPokladna(false)} onDone={doAplikace} />
      )}
    </div>
  );
}

function nazevTypu(t: TypPodniku): string {
  return TYPY.find(x => x.id === t)?.nazev ?? '';
}
