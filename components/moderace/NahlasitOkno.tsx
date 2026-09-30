'use client';

// Okno „Nahlásit“ — společné pro zprávy v chatu a nápady. Vybere se důvod, volitelně
// se připíše pár slov; nahlášení uvidí vedení podniku (Nastavení, Nahlášený obsah).
// Bez přihlášení to neodejde (server), offline se to řekne poctivě.

import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { DUVODY, type DruhObsahu } from '@/lib/moderace';

export default function NahlasitOkno({ kind, refId, onClose, onDone }: {
  kind: DruhObsahu;
  refId: number;
  onClose: () => void;
  onDone: (zprava: string) => void;
}) {
  const [duvod, setDuvod] = useState('');
  const [detail, setDetail] = useState('');
  const [bezi, setBezi] = useState(false);
  const [chyba, setChyba] = useState('');

  const odeslat = async () => {
    setChyba(''); setBezi(true);
    try {
      const r = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, refId, reason: duvod, detail }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setChyba(d.error || 'Nahlášení se nepodařilo odeslat.'); return; }
      onDone('Děkujeme, nahlášení uvidí vedení podniku.');
    } catch {
      setChyba('Nahlášení se nepodařilo odeslat. Zkontrolujte připojení.');
    } finally { setBezi(false); }
  };

  return (
    <Modal open onClose={onClose} size="sm" title="Nahlásit obsah" subtitle="Nahlášení uvidí vedení podniku. Autor se to nedozví."
      footer={<>
        <Button variant="secondary" onClick={onClose}>Zrušit</Button>
        <Button variant="primary" loading={bezi} disabled={!duvod} onClick={odeslat}>Nahlásit</Button>
      </>}>
      <fieldset className="grid gap-2">
        <legend className="field-label">Důvod</legend>
        {DUVODY.map(d => (
          <label key={d.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 border border-black/[0.08] cursor-pointer has-[:checked]:border-[#16181A]">
            <input type="radio" name="duvod" value={d.id} checked={duvod === d.id} onChange={() => setDuvod(d.id)} className="h-4 w-4 accent-[#16181A]" />
            <span className="text-sm">{d.nazev}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-4">
        <label htmlFor="nahlasit-detail" className="field-label">Poznámka (nepovinné)</label>
        <textarea id="nahlasit-detail" rows={2} maxLength={500} value={detail} onChange={e => setDetail(e.target.value)} className="field resize-none" />
      </div>
      {chyba && <p role="alert" className="note note-danger mt-3">{chyba}</p>}
    </Modal>
  );
}
