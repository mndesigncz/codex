'use client';

// Přihlášení do správy platformy (admin.managero.app).
//
// Dva kroky v jedné kartě: e-mail + heslo účtu Managero → šestimístný kód
// z autentizační aplikace. Při prvním přihlášení (nebo po resetu) se mezi ně
// vloží nastavení: QR kód a klíč k ručnímu opisu, potvrzené prvním kódem.
// Stav mezi kroky drží server v krátké cookie (app/api/sprava/*); tady je jen
// formulář. Po úspěchu celé načtení `/` — ne router.push: layout správy musí
// znovu přečíst cookie a nic z přihlašovací obrazovky nemá zůstat v paměti.

import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '@/components/Icons';
import { Field, Input, Button } from '@/components/ui';

type Krok =
  | { druh: 'heslo' }
  | { druh: 'kod' }
  | { druh: 'nastaveni'; qr: string; klic: string; uri: string };

const OBECNA = 'Přihlášení se nepovedlo.';

async function posli(cesta: string, telo: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const r = await fetch(cesta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo), credentials: 'same-origin' });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, data: data && typeof data === 'object' ? data : {} };
  } catch {
    return { ok: false, data: { error: 'Server neodpovídá. Zkontroluj připojení a zkus to znovu.' } };
  }
}

export default function PrihlaseniSpravy() {
  const [krok, setKrok] = useState<Krok>({ druh: 'heslo' });
  const [email, setEmail] = useState('');
  const [heslo, setHeslo] = useState('');
  const [kod, setKod] = useState('');
  const [chyba, setChyba] = useState<string | null>(null);
  const [ceka, setCeka] = useState(false);
  const kodRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (krok.druh !== 'heslo') kodRef.current?.focus(); }, [krok.druh]);

  const odeslatHeslo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ceka) return;
    setCeka(true); setChyba(null);
    const r = await posli('/api/sprava/prihlaseni', { email, heslo });
    setCeka(false);
    if (!r.ok) { setChyba(String(r.data.error ?? OBECNA)); return; }
    setHeslo('');
    if (r.data.krok === 'nastaveni') setKrok({ druh: 'nastaveni', qr: String(r.data.qr ?? ''), klic: String(r.data.klic ?? ''), uri: String(r.data.uri ?? '') });
    else setKrok({ druh: 'kod' });
  };

  const odeslatKod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ceka) return;
    setCeka(true); setChyba(null);
    const r = await posli('/api/sprava/kod', { kod: kod.replace(/\s/g, '') });
    if (!r.ok) {
      setCeka(false);
      setKod('');
      setChyba(String(r.data.error ?? OBECNA));
      // Krok vypršel (5 min): zpátky na heslo, kód by už nikam nevedl.
      if (/vypršelo/.test(String(r.data.error ?? ''))) setKrok({ druh: 'heslo' });
      return;
    }
    window.location.assign('/');
  };

  const zpet = () => { setKrok({ druh: 'heslo' }); setKod(''); setChyba(null); };

  return (
    <main className="min-h-[100dvh] grid place-items-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 sm:p-7">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <span className="t-card">Správa platformy</span>
        </div>

        {krok.druh === 'heslo' && (
          <form className="mt-6 space-y-4" onSubmit={odeslatHeslo} noValidate>
            <p className="t-meta">Přihlas se svým účtem Managero. Pak opíšeš kód z autentizační aplikace.</p>
            <Field id="sprava-email" label="E-mail">
              <Input id="sprava-email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false}
                value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </Field>
            <Field id="sprava-heslo" label="Heslo">
              <Input id="sprava-heslo" type="password" autoComplete="current-password" value={heslo} onChange={e => setHeslo(e.target.value)} required />
            </Field>
            {chyba && <p role="alert" className="text-sm text-[var(--bad-ink)]">{chyba}</p>}
            <Button type="submit" variant="accent" className="w-full" loading={ceka} disabled={!email || !heslo}>Pokračovat</Button>
          </form>
        )}

        {krok.druh === 'nastaveni' && (
          <form className="mt-6 space-y-4" onSubmit={odeslatKod} noValidate>
            <p className="t-meta">První přihlášení: naskenuj QR kód autentizační aplikací (Google Authenticator, 1Password, Authy…) a opiš kód, který ukáže.</p>
            <div className="mx-auto w-48 h-48 rounded-2xl overflow-hidden border border-black/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={krok.qr} alt="QR kód pro autentizační aplikaci" width={176} height={176} className="w-full h-full" />
            </div>
            <div>
              <p className="t-meta">Nebo klíč ručně:</p>
              <p className="mt-1 font-mono text-sm break-words select-all" data-klic>{krok.klic}</p>
            </div>
            <KodPole hodnota={kod} zmena={setKod} pole={kodRef} />
            {chyba && <p role="alert" className="text-sm text-[var(--bad-ink)]">{chyba}</p>}
            <Button type="submit" variant="accent" className="w-full" loading={ceka} disabled={kod.replace(/\s/g, '').length !== 6}>Potvrdit a přihlásit</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={zpet}>Zpět</Button>
          </form>
        )}

        {krok.druh === 'kod' && (
          <form className="mt-6 space-y-4" onSubmit={odeslatKod} noValidate>
            <p className="t-meta">Opiš šestimístný kód z autentizační aplikace.</p>
            <KodPole hodnota={kod} zmena={setKod} pole={kodRef} />
            {chyba && <p role="alert" className="text-sm text-[var(--bad-ink)]">{chyba}</p>}
            <Button type="submit" variant="accent" className="w-full" loading={ceka} disabled={kod.replace(/\s/g, '').length !== 6}>Přihlásit</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={zpet}>Zpět</Button>
          </form>
        )}
      </div>
    </main>
  );
}

function KodPole({ hodnota, zmena, pole }: { hodnota: string; zmena: (v: string) => void; pole: React.RefObject<HTMLInputElement | null> }) {
  return (
    <Field id="sprava-kod" label="Kód z aplikace">
      <Input id="sprava-kod" ref={pole} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7}
        className="text-center font-mono tracking-[0.3em] text-lg"
        value={hodnota} onChange={e => zmena(e.target.value.replace(/[^\d ]/g, ''))} required />
    </Field>
  );
}
