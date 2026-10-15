'use client';

// Nová plastová karta u kasy: karta ještě nikomu nepatří, obsluha ji přiřadí hostovi.
// Buď vyhledá existujícího hosta (jméno, telefon, e-mail — členové podniku, mimo ně jen
// přesný e-mail), nebo založí hosta bez aplikace (jméno, telefon a e-mail nepovinně).
// Po přiřazení rodič kartu načte znovu a pokračuje se jako u každé jiné karty (razítko, body).
//
// Sdílí ho Kartička hosta (CardScan) i Čtečka u kasy (CteckaKasa). Serverová část:
// /api/client/cards/hoste a /api/client/cards/aktivace (lib/kartyFyzickeDb.ts).

import { useEffect, useRef, useState } from 'react';
import { Button, Input, ListRow } from '../ui';
import { okJson, apiMessage } from '@/lib/api';
import { overNovehoHosta } from '@/lib/kartyFyzicke';

interface Nalezeny { id: number; name: string; kontakt: string | null; clen: boolean; body: number; bezAplikace: boolean }

export default function KartickaAktivace({ kod, velke = false, onHotovo, onZrusit }: {
  kod: string;
  /** Čtečka u kasy má velká tlačítka (prst u kasy, tablet). */
  velke?: boolean;
  onHotovo: (zprava: string, host: { id: number; name: string }) => void;
  onZrusit: () => void;
}) {
  const [rezim, setRezim] = useState<'najit' | 'novy'>('najit');
  const [q, setQ] = useState('');
  const [hoste, setHoste] = useState<Nalezeny[] | null>(null);
  const [hledam, setHledam] = useState(false);
  const [jmeno, setJmeno] = useState('');
  const [telefon, setTelefon] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<number | 'novy' | null>(null);
  const [err, setErr] = useState('');
  const posledni = useRef(0);
  const vel = velke ? 'lg' : 'md';

  // Hledání s krátkou prodlevou; starší odpověď nepřepíše novější.
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setHoste(null); setHledam(false); return; }
    const id = ++posledni.current;
    setHledam(true);
    const t = setTimeout(() => {
      fetch(`/api/client/cards/hoste?q=${encodeURIComponent(text)}`).then(okJson)
        .then(x => { if (id === posledni.current) { setHoste(Array.isArray(x?.hoste) ? x.hoste : []); setErr(''); } })
        .catch(e => { if (id === posledni.current) { setHoste(null); setErr(apiMessage(e, 'Hledání se nepovedlo.')); } })
        .finally(() => { if (id === posledni.current) setHledam(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const prirad = async (telo: object, klic: number | 'novy') => {
    setBusy(klic); setErr('');
    try {
      const x = await fetch('/api/client/cards/aktivace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kod, ...telo }) }).then(okJson);
      onHotovo(String(x.message ?? 'Karta je přiřazená.'), x.customer);
    } catch (e) { setErr(apiMessage(e, 'Kartu se nepodařilo přiřadit.')); }
    setBusy(null);
  };

  const zalozit = (e: React.FormEvent) => {
    e.preventDefault();
    const h = overNovehoHosta({ jmeno, telefon, email });
    if (!h.ok) { setErr(h.chyba); return; }
    void prirad({ novy: { jmeno, telefon, email } }, 'novy');
  };

  return (
    <div className="space-y-3" data-testid="karta-aktivace">
      <div className="min-w-0">
        <p className="t-label mb-0.5">Nová karta</p>
        <p className="text-lg font-bold font-mono tracking-wider">{kod}</p>
        <p className="t-meta mt-0.5 text-pretty">Karta ještě nikomu nepatří. Přiřaď ji hostovi, který ji právě dostal. Pak funguje jako kartička v aplikaci.</p>
      </div>
      {/* Dvě tlačítka místo přepínače: u kasy je prst a cíl musí mít aspoň 44 px. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Komu kartu přiřadit">
        <Button size={vel} variant={rezim === 'najit' ? 'primary' : 'secondary'} icon="search" aria-pressed={rezim === 'najit'} onClick={() => { setRezim('najit'); setErr(''); }}>Najít hosta</Button>
        <Button size={vel} variant={rezim === 'novy' ? 'primary' : 'secondary'} icon="plus" aria-pressed={rezim === 'novy'} onClick={() => { setRezim('novy'); setErr(''); }}>Nový host bez aplikace</Button>
      </div>

      {rezim === 'najit' ? (
        <div className="space-y-2">
          <label htmlFor="ka-hledat" className="field-label">Jméno, telefon nebo e-mail</label>
          <Input id="ka-hledat" type="search" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" enterKeyHint="search"
            placeholder="Třeba Jana nebo 777 123 456" className={velke ? '!h-12' : ''} />
          {hledam && <p className="t-meta" role="status">Hledám…</p>}
          {hoste && !hledam && hoste.length === 0 && (
            <p className="t-meta text-pretty">Nikoho takového mezi členy nemáme. Host s aplikací, který tu ještě nebyl, se najde podle celého e-mailu. Jinak ho založ jako nového.</p>
          )}
          {hoste && hoste.length > 0 && (
            <ul className="list" aria-label="Nalezení hosté">
              {hoste.map(h => (
                <ListRow key={h.id} title={h.name}
                  meta={[h.kontakt, h.clen ? `člen · ${h.body} b.` : 'zatím není členem', h.bezAplikace ? 'bez aplikace' : null].filter(Boolean).join(' · ')}
                  actions={<Button size={vel} variant="primary" loading={busy === h.id} disabled={busy != null} onClick={() => prirad({ customerId: h.id }, h.id)}>Přiřadit</Button>} />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <form onSubmit={zalozit} className="space-y-3" noValidate>
          <div>
            <label htmlFor="ka-jmeno" className="field-label">Jméno hosta</label>
            <Input id="ka-jmeno" value={jmeno} onChange={e => setJmeno(e.target.value)} autoComplete="off" maxLength={80} required className={velke ? '!h-12' : ''} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ka-tel" className="field-label">Telefon (nepovinné)</label>
              <Input id="ka-tel" type="tel" inputMode="tel" value={telefon} onChange={e => setTelefon(e.target.value)} autoComplete="off" maxLength={24} className={velke ? '!h-12' : ''} />
            </div>
            <div>
              <label htmlFor="ka-email" className="field-label">E-mail (nepovinné)</label>
              <Input id="ka-email" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" autoCapitalize="off" maxLength={160} className={velke ? '!h-12' : ''} />
            </div>
          </div>
          <p className="t-meta text-pretty">Host nepotřebuje aplikaci: body a razítka sbírá na kartu. Až si ji v aplikaci připojí (Moje → Mám plastovou kartu), převezme je. S e-mailem se do účtu dostane i přes Zapomenuté heslo.</p>
          <Button type="submit" size={vel} variant="primary" icon="plus" block loading={busy === 'novy'} disabled={busy != null}>Založit a přiřadit kartu</Button>
        </form>
      )}

      {err && <p role="alert" className="note note-danger">{err}</p>}
      <Button size={vel} variant="ghost" onClick={onZrusit}>Zrušit</Button>
    </div>
  );
}
