'use client';

// Zablokovaní uživatelé — seznam s odblokováním (Nastavení, Zabezpečení). Zablokovat jde
// v chatu u zprávy; jejich zprávy se blokujícímu nezobrazují, dokud je neodblokuje.

import { useEffect, useState } from 'react';
import { Button } from '../ui';
import { okJson } from '@/lib/api';

interface Zablokovany { id: number; name: string; avatar: string | null }

export default function Zablokovani() {
  const [radky, setRadky] = useState<Zablokovany[] | null>(null);
  const [chyba, setChyba] = useState('');

  useEffect(() => {
    fetch('/api/blocks').then(okJson).then(d => setRadky(Array.isArray(d.blocked) ? d.blocked : [])).catch(() => setRadky([]));
  }, []);

  const odblokovat = async (u: Zablokovany) => {
    setChyba('');
    try {
      const r = await fetch('/api/blocks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: u.id }) });
      if (!r.ok) throw new Error();
      setRadky(prev => (prev ?? []).filter(x => x.id !== u.id));
    } catch { setChyba('Odblokovat se nepodařilo. Zkuste to znovu.'); }
  };

  // Bez zablokovaných není co ukazovat: prázdná karta by jen přidávala šum.
  if (!radky || radky.length === 0) return null;
  return (
    <section className="card p-6 space-y-3 mt-6" aria-labelledby="h-zablokovani">
      <div>
        <h2 id="h-zablokovani" className="t-section">Zablokovaní uživatelé</h2>
        <p className="t-meta mt-1">Jejich zprávy v chatu nevidíte. Odblokováním se zase zobrazí.</p>
      </div>
      {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
      <ul className="list">
        {radky.map(u => (
          <li key={u.id} className="list-row">
            <span className="min-w-0 flex-1 truncate">{u.avatar ?? '👤'} {u.name}</span>
            <Button size="sm" variant="secondary" onClick={() => odblokovat(u)}>Odblokovat</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
