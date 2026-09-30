'use client';

// Cíl odkazu z e-mailu „Potvrďte smazání účtu“. Smaže až kliknutí na tlačítko
// (POST), ne otevření stránky: náhledy odkazů v e-mailu by jinak smazaly účet
// bez vědomí člověka.

import { useState } from 'react';
import Link from 'next/link';

export default function PotvrditSmazani({ token }: { token: string }) {
  const [stav, setStav] = useState<'cekam' | 'bezi' | 'hotovo'>('cekam');
  const [chyba, setChyba] = useState('');

  const smazat = async () => {
    setChyba(''); setStav('bezi');
    try {
      const r = await fetch('/api/account/delete-confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setChyba(d.error || 'Účet se nepodařilo smazat.'); setStav('cekam'); return; }
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
        <Link href="/" className="btn btn-secondary mt-6 tap-target">Na úvod</Link>
      </div>
    );
  }
  return (
    <div className="card p-6 max-w-md w-full">
      <h1 className="t-page">Opravdu smazat účet?</h1>
      <p className="t-meta mt-3 text-pretty">Smaže se profil, věrnostní karta, členství, kupony a oznámení zařízení. Nejde to vrátit. Záznamy, které podnik vede ze zákona (směny, docházka), zůstanou bez vašeho jména.</p>
      {chyba && <p role="alert" className="note note-danger mt-4">{chyba}</p>}
      <div className="mt-6 flex flex-wrap gap-2.5">
        <button type="button" onClick={smazat} disabled={stav === 'bezi'} className="btn btn-primary tap-target disabled:opacity-50">{stav === 'bezi' ? 'Mažu…' : 'Ano, smazat účet'}</button>
        <Link href="/" className="btn btn-secondary tap-target">Ne, nechat</Link>
      </div>
    </div>
  );
}
