'use client';

// Cíl odkazu z e-mailu „Potvrďte smazání účtu“. Smaže až kliknutí na tlačítko
// (POST), ne otevření stránky: náhledy odkazů v e-mailu by jinak smazaly účet
// bez vědomí člověka.

import { useState } from 'react';
import Link from 'next/link';

export default function PotvrditSmazani({ token }: { token: string }) {
  const [stav, setStav] = useState<'cekam' | 'bezi' | 'hotovo'>('cekam');
  const [chyba, setChyba] = useState('');
  // Vlastník podniku: server vrátí 409 s vysvětlením a stránka si vyžádá heslo a slovo SMAZAT.
  const [podnik, setPodnik] = useState<string | null>(null);
  const [heslo, setHeslo] = useState('');
  const [potvrzeni, setPotvrzeni] = useState('');
  const [varovani, setVarovani] = useState<string[]>([]);

  const smazat = async () => {
    setChyba(''); setStav('bezi');
    try {
      const r = await fetch('/api/account/delete-confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...(podnik ? { smazatPodnik: true, password: heslo, potvrzeni } : {}) }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409 && (d.kod === 'VLASTNIK_S_CLENY' || d.kod === 'VLASTNIK_PODNIKU')) { setPodnik(String(d.error)); setStav('cekam'); return; }
      if (!r.ok) { setChyba(d.error || 'Účet se nepodařilo smazat.'); setStav('cekam'); return; }
      setVarovani(Array.isArray(d.varovani) ? d.varovani : []);
      setStav('hotovo');
    } catch {
      setChyba('Účet se nepodařilo smazat. Zkontrolujte připojení a zkuste to znovu.');
      setStav('cekam');
    }
  };

  if (stav === 'hotovo') {
    return (
      <div className="card p-6 max-w-md w-full text-center">
        <h1 className="t-page">Účet je smazaný</h1>
        <p className="t-meta mt-3 text-pretty">Osobní údaje jsme odstranili. Děkujeme, že jste Managero používali.</p>
        {varovani.map(v => <p key={v} role="status" className="note mt-3 text-pretty">{v}</p>)}
        <Link href="/" className="btn btn-secondary mt-6 tap-target">Na úvod</Link>
      </div>
    );
  }
  return (
    <div className="card p-6 max-w-md w-full">
      <h1 className="t-page">Opravdu smazat účet?</h1>
      {podnik && (
        <div className="mt-4 grid gap-3">
          <p role="alert" className="note note-danger text-pretty">{podnik}</p>
          <div>
            <label htmlFor="sp-heslo" className="field-label">Heslo</label>
            <input id="sp-heslo" type="password" autoComplete="current-password" value={heslo} onChange={e => setHeslo(e.target.value)} className="field" />
            <p className="t-meta mt-1 text-pretty">Heslo neznáte? Nejdřív si ho obnovte přes Zapomenuté heslo a pak se sem vraťte odkazem z nového e-mailu.</p>
          </div>
          <div>
            <label htmlFor="sp-smazat" className="field-label">Pro smazání podniku napište SMAZAT</label>
            <input id="sp-smazat" value={potvrzeni} onChange={e => setPotvrzeni(e.target.value)} autoComplete="off" autoCapitalize="characters" className="field" />
          </div>
        </div>
      )}
      <p className="t-meta mt-3 text-pretty">Smaže se profil, věrnostní karta, členství, kupony a oznámení zařízení. Nejde to vrátit. Záznamy, které podnik vede ze zákona (směny, docházka), zůstanou bez vašeho jména.</p>
      {chyba && <p role="alert" className="note note-danger mt-4">{chyba}</p>}
      <div className="mt-6 flex flex-wrap gap-2.5">
        <button type="button" onClick={smazat} disabled={stav === 'bezi' || (podnik !== null && (!heslo || potvrzeni.trim() !== 'SMAZAT'))} className="btn btn-primary tap-target disabled:opacity-50">{stav === 'bezi' ? 'Mažu…' : podnik ? 'Smazat podnik i účet' : 'Ano, smazat účet'}</button>
        <Link href="/" className="btn btn-secondary tap-target">Ne, nechat</Link>
      </div>
    </div>
  );
}
