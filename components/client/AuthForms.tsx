'use client';

// Registrace a přihlášení hosta ve směru A „Peněženka“ (předloha 06): balíček karet jako předmět,
// titulek 32, segment Kód e-mailem · Heslo, pole .hp-pole s ikonou a limetková hlavní akce přes šířku.

import { useState } from 'react';
import { signIn, signOut, getSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Segmented } from '../ui';
import Pole, { popisPole } from './host/ucet/Pole';
import BalicekVstup from './host/ucet/BalicekVstup';
import { mistniCesta } from '@/lib/bezpecnaUrl';
import { useObal } from '../ObalProvider';
import { HLASKA_ROLE_V_CLIENTU } from '@/lib/obal';
import SouhlasPodminek from '../pravni/SouhlasPodminek';
import { useT } from '@/lib/i18n/client';
import { kamPoPrihlaseni } from '@/lib/dveStranyKlient';

// Odkaz pod formulářem: tučně v barvě textu, dotykový cíl 44 px.
const ODKAZ = 'tap-target-sm inline-flex items-center min-h-[44px] font-semibold text-[color:var(--hp-fg)] underline-offset-2 hover:underline';

export function RegisterForm() {
  const t = useT('klient-host');
  const router = useRouter();
  const params = useSearchParams();
  const next = mistniCesta(params.get('next'), '/client/me');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  // Kód z pozvánky (?ref=…) se předvyplní; jde přepsat i vyplnit ručně.
  const [ref, setRef] = useState(() => (params.get('ref') ?? '').toUpperCase());
  // Souhlas s rozesíláním podniků je dobrovolný a výchozí je NE (Apple 4.5.4, zákon 480/2004).
  const [novinky, setNovinky] = useState(false);
  // Click-wrap (spuštění, balík P): souhlas s podmínkami a věk aspoň 15 let výslovně. Dřív se posílalo
  // `terms: true` natvrdo a server ho ignoroval.
  const [souhlas, setSouhlas] = useState(false);
  const [vek, setVek] = useState(false);
  const [chybaSouhlasu, setChybaSouhlasu] = useState<string | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (pw.length < 8) { setErr(t('Heslo musí mít alespoň 8 znaků.')); return; }
    if (!souhlas) { setChybaSouhlasu(t('Bez souhlasu s podmínkami účet založit nejde.')); return; }
    if (!vek) { setChybaSouhlasu(t('Účet hosta si můžeš založit od 15 let.')); return; }
    setChybaSouhlasu(null);
    setBusy(true);
    const r = await fetch('/api/client/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password: pw, ref: ref.trim() || undefined, novinky, terms: souhlas, vek15: vek }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error ? t(d.error) : t('Registrace se nepovedla.')); setBusy(false); return; }
    const s = await signIn('credentials', { email, password: pw, strana: 'host', redirect: false });
    if (s?.error) { setErr(t('Účet vznikl, ale přihlášení selhalo. Zkus se přihlásit.')); setBusy(false); return; }
    router.push(next); router.refresh();
  };
  return (
    <Vstup titulek={t('Založit účet hosta')} uvod={t('Jeden účet pro všechny podniky, kam chodíš.')}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Pole id="r-name" popis={t('Jméno')} ikona="user"><input id="r-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" required /></Pole>
        <Pole id="r-email" popis={t('E-mail')} ikona="mail"><input id="r-email" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Pole>
        <Pole id="r-pw" popis={t('Heslo')} ikona="lock" napoveda={t('Aspoň 8 znaků.')}><input id="r-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" aria-describedby={popisPole('r-pw', null, true)} required /></Pole>
        <Pole id="r-ref" popis={t('Kód od kamaráda')} ikona="gift" napoveda={t('Nepovinné. Až se přidáš do podniku, kde je členem, dostanete oba body.')}>
          <input id="r-ref" className="hp-kod placeholder:font-sans placeholder:tracking-normal" value={ref} onChange={e => setRef(e.target.value.toUpperCase())} placeholder="ABCD-EFGH" autoComplete="off" aria-describedby={popisPole('r-ref', null, true)} />
        </Pole>
        <label className="flex items-start gap-3 min-h-[44px] py-1 cursor-pointer">
          <input type="checkbox" checked={novinky} onChange={e => setNovinky(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 [accent-color:var(--hp-fg)]" />
          <span className="hp-meta !text-[14px] text-pretty">{t('Chci dostávat novinky a akce od podniků, kde jsem členem. Nepovinné, půjde to kdykoli vypnout v profilu.')}</span>
        </label>
        <div>
          <SouhlasPodminek id="r-souhlas" checked={souhlas} chyba={chybaSouhlasu}
            onChange={v => { setSouhlas(v); if (v && vek) setChybaSouhlasu(null); }}
            vek={{ checked: vek, onChange: v => { setVek(v); if (v && souhlas) setChybaSouhlasu(null); } }} />
        </div>
        {err && <p role="alert" className="note note-danger text-sm px-3 py-2">{err}</p>}
        <button type="submit" disabled={busy} className="hp-btn hp-btn-limetka hp-btn-blok mt-1">
          {busy ? t('Zakládám…') : t('Založit účet')}
        </button>
        <p className="hp-meta text-center">{t('Už účet máš?')} <Link href={`/client/login?next=${encodeURIComponent(next)}`} className={ODKAZ}>{t('Přihlas se')}</Link></p>
      </form>
    </Vstup>
  );
}

export function LoginForm() {
  const t = useT('klient-host');
  const router = useRouter();
  const { jeObal } = useObal();
  const params = useSearchParams();
  const next = mistniCesta(params.get('next'), '/client/me');
  // Výchozí je kód e-mailem (u kasy nikdo heslo nepamatuje); heslo zůstává jako druhá cesta.
  const [zpusob, setZpusob] = useState<'kod' | 'heslo'>('kod');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [kod, setKod] = useState(''); const [poslano, setPoslano] = useState(false);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const poPrihlaseni = async (error: string | null | undefined, zprava: string) => {
    if (error) {
      // Server v obalu vrací OBAL_ROLE jen po správném hesle/kódu: účet podniku v aplikaci pro hosty.
      setErr(error === 'OBAL_ROLE' ? HLASKA_ROLE_V_CLIENTU : zprava);
      setBusy(false); return;
    }
    // Kdo není host (vedení, zaměstnanec), v hostovské části nic nemá: na webu ho pošleme domů
    // do jeho aplikace, v obalu by ho server stejně odmítl (pojistka, kdyby prošel).
    const sess = await getSession();
    const role = (sess?.user as any)?.role;
    if (role && role !== 'customer') {
      if (jeObal) { await signOut({ redirect: false }); setErr(HLASKA_ROLE_V_CLIENTU); setBusy(false); return; }
      router.push('/'); router.refresh(); return;
    }
    // Majitel podniku bývá i hostem: s oběma stranami se poprvé zeptáme „Kam teď?“.
    const kam = await kamPoPrihlaseni(next, params.get('next') != null);
    router.push(kam); router.refresh();
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const s = await signIn('credentials', { email, password: pw, strana: 'host', redirect: false });
    await poPrihlaseni(s?.error, t('E-mail nebo heslo nesedí.'));
  };
  const poslatKod = async (e?: React.FormEvent) => {
    e?.preventDefault(); setErr('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr(t('Napiš e-mail, se kterým máš účet.')); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/client/login-kod', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(x.error ? t(x.error) : t('Kód se teď nepodařilo poslat. Zkus to za chvíli, nebo se přihlas heslem.')); return; }
      setPoslano(true); setKod('');
    } catch { setErr(t('Kód se teď nepodařilo poslat. Zkus to za chvíli, nebo se přihlas heslem.')); }
    finally { setBusy(false); }
  };
  const overit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!/^\d{6}$/.test(kod)) { setErr(t('Kód má šest číslic.')); return; }
    setBusy(true);
    const s = await signIn('host-kod', { email, kod, redirect: false });
    await poPrihlaseni(s?.error, t('Kód nesedí nebo už neplatí. Pošli si nový.'));
  };
  const odkazy = (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-6 text-[14px]">
      <Link href="/client/zapomenute-heslo" className={ODKAZ}>{t('Zapomenuté heslo')}</Link>
      <Link href={`/client/register?next=${encodeURIComponent(next)}`} className={ODKAZ}>{t('Založit účet')}</Link>
    </div>
  );
  return (
    <Vstup balicek titulek={t('Všechny tvoje karty na jednom místě')} uvod={t('Razítka, body, odměny a rezervace z kaváren a restaurací, kam chodíš.')}>
      <div className="hp-segment mb-3">
        <Segmented ariaLabel={t('Způsob přihlášení')} value={zpusob} onChange={z => { setZpusob(z); setErr(''); }}
          options={[{ id: 'kod', label: t('Kód e-mailem') }, { id: 'heslo', label: t('Heslo') }]} />
      </div>
      {zpusob === 'kod' ? (
        poslano ? (
          <form onSubmit={overit} className="grid gap-3" noValidate>
            <p className="hp-text text-pretty">{t('Poslali jsme šestimístný kód na {email}. Platí 10 minut.', { email: email.trim() })}</p>
            <Pole id="l-kod" popis={t('Kód z e-mailu')} skrytyPopis ikona="key">
              <input id="l-kod" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="hp-kod !text-[22px] !tracking-[0.4em] text-center" value={kod}
                onChange={e => setKod(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" autoFocus required />
            </Pole>
            {err && <p role="alert" className="note note-danger text-sm px-3 py-2">{err}</p>}
            <button type="submit" disabled={busy || kod.length !== 6} className="hp-btn hp-btn-limetka hp-btn-blok">{busy ? t('Přihlašuji…') : t('Přihlásit se')}</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setPoslano(false); setErr(''); }} className="hp-btn lgx hp-btn-sklo hp-btn-stredni min-w-0">{t('Jiný e-mail')}</button>
              <button type="button" onClick={() => void poslatKod()} disabled={busy} className="hp-btn lgx hp-btn-sklo hp-btn-stredni min-w-0">{t('Poslat znovu')}</button>
            </div>
            <p className="hp-meta text-center text-pretty">{t('Kód nepřišel? Mrkni do spamu, nebo se přihlas heslem.')}</p>
          </form>
        ) : (
          <form onSubmit={poslatKod} className="grid gap-3" noValidate>
            <Pole id="l-email" popis={t('E-mail')} skrytyPopis ikona="mail">
              <input id="l-email" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder={t('E-mail')} aria-describedby="l-email-veta" required />
            </Pole>
            {err && <p role="alert" className="note note-danger text-sm px-3 py-2">{err}</p>}
            <button type="submit" disabled={busy} className="hp-btn hp-btn-limetka hp-btn-blok">{busy ? t('Posílám…') : t('Poslat kód')}</button>
            <p id="l-email-veta" className="hp-meta text-center text-pretty">{t('Pošleme ti kód. Heslo si pamatovat nemusíš.')}</p>
            {odkazy}
          </form>
        )
      ) : (
        <form onSubmit={submit} className="grid gap-3" noValidate>
          <Pole id="l-email" popis={t('E-mail')} skrytyPopis ikona="mail">
            <input id="l-email" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder={t('E-mail')} required />
          </Pole>
          <Pole id="l-pw" popis={t('Heslo')} skrytyPopis ikona="lock">
            <input id="l-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" placeholder={t('Heslo')} required />
          </Pole>
          {err && <p role="alert" className="note note-danger text-sm px-3 py-2">{err}</p>}
          <button type="submit" disabled={busy} className="hp-btn hp-btn-limetka hp-btn-blok">
            {busy ? t('Přihlašuji…') : t('Přihlásit se')}
          </button>
          {odkazy}
        </form>
      )}
      {/* Kdo hledá správu podniku, je tu omylem: jeden odkaz ho pošle na správný vchod. Právní odkazy
          jsou hned pod tím v patičce obalu (ClientShell), tady by se opakovaly. */}
      {!jeObal && (
        <p className="hp-meta mt-6 text-center">{t('Máš podnik?')} <Link href="/login" className={ODKAZ}>{t('Přihlásit se do správy podniku')}</Link></p>
      )}
    </Vstup>
  );
}

/** Obrazovka vstupu (předloha A 06): na telefonu balíček karet, titulek, věta a formulář pod sebou;
 *  na počítači balíček vlevo a titulek s formulářem vpravo. Formulář leží na plátně, žádná karta. */
function Vstup({ titulek, uvod, balicek = false, children }: { titulek: string; uvod: string; balicek?: boolean; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[440px] md:max-w-[980px] md:grid md:grid-cols-[minmax(0,1fr)_400px] md:gap-14 lg:gap-20 md:items-center md:min-h-[min(620px,calc(100dvh-240px))]">
      <div className={balicek ? 'pt-1 md:pt-0' : 'hidden md:block'}><BalicekVstup /></div>
      <div className="min-w-0">
        <h1 className={`hp-titulek ${balicek ? 'mt-5' : 'mt-2'} md:mt-0 md:!text-[40px]`}>{titulek}</h1>
        <p className="hp-text mt-2.5 mb-6 text-[color:var(--hp-muted)] text-pretty">{uvod}</p>
        {children}
      </div>
    </div>
  );
}
