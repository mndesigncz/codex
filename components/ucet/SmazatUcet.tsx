'use client';

// „Smazat účet“ — nebezpečná zóna v Nastavení (Managero) a v Profilu (Managero client).
// Apple 5.1.1(v) a Google Play chtějí smazání přímo v aplikaci, ne jen odkazem na web.
//
// Potvrzuje se heslem. Vlastník podniku dostane od serveru vysvětlení (podnik s dalšími
// lidmi nebo podnik, který by smazáním zanikl) a musí napsat SMAZAT, aby smazal podnik
// i s účtem; bez toho se nic nestane. Pravidla jsou na serveru (lib/smazaniUctu.ts).

import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { odhlasit } from '@/lib/odhlaseni';

interface Dopad { kod: string; zprava: string }

export default function SmazatUcet({ jeHost }: { jeHost: boolean }) {
  const [otevreno, setOtevreno] = useState(false);
  const [heslo, setHeslo] = useState('');
  const [potvrzeni, setPotvrzeni] = useState('');
  const [dopad, setDopad] = useState<Dopad | null>(null);
  const [chyba, setChyba] = useState('');
  const [bezi, setBezi] = useState(false);

  const zavrit = () => { setOtevreno(false); setHeslo(''); setPotvrzeni(''); setDopad(null); setChyba(''); };

  const smazat = async () => {
    setChyba(''); setBezi(true);
    try {
      const r = await fetch('/api/account', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: heslo, ...(dopad ? { smazatPodnik: true, potvrzeni } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { await odhlasit({ callbackUrl: jeHost ? '/client' : '/login' }); return; }
      // Vlastník podniku: server řekl, co by se stalo, a čeká na výslovné potvrzení.
      if (r.status === 409 && (d.kod === 'VLASTNIK_S_CLENY' || d.kod === 'VLASTNIK_PODNIKU')) { setDopad({ kod: d.kod, zprava: d.error }); return; }
      setChyba(d.error || 'Účet se nepodařilo smazat.');
    } catch {
      setChyba('Účet se nepodařilo smazat. Zkontrolujte připojení a zkuste to znovu.');
    } finally { setBezi(false); }
  };

  const kSmazani = dopad ? (potvrzeni.trim() === 'SMAZAT' && heslo.length > 0) : heslo.length > 0;

  return (
    <section aria-labelledby="h-smazat-ucet" className="mt-10 pt-6 border-t border-black/[0.08]">
      <h2 id="h-smazat-ucet" className="t-section">Smazat účet</h2>
      <p className="t-meta mt-1.5 max-w-[60ch] text-pretty">
        {jeHost
          ? 'Smaže se profil, věrnostní karta, členství, body, razítka, kupony a hodnocení. Nejde to vrátit. Budoucí rezervace se zruší, vyřízené objednávky zůstanou u podniku bez vašeho jména.'
          : 'Smaže se váš přístup, osobní údaje a členství v podnicích. Směny, docházka a uzávěrky zůstanou podniku bez vašeho jména. Nejde to vrátit.'}
      </p>
      <div className="mt-4">
        <Button variant="danger" icon="trash" onClick={() => setOtevreno(true)}>Smazat účet</Button>
      </div>

      <Modal open={otevreno} onClose={zavrit} size="sm" title={dopad ? 'Smazat i podnik?' : 'Opravdu smazat účet?'}
        subtitle={dopad ? undefined : 'Potvrďte to svým heslem. Nejde to vrátit.'}
        footer={<>
          <Button variant="secondary" onClick={zavrit}>Ne, nechat</Button>
          <Button variant="danger-solid" loading={bezi} disabled={!kSmazani} onClick={smazat}>{dopad ? 'Smazat podnik i účet' : 'Smazat účet'}</Button>
        </>}>
        <div className="grid gap-4">
          {dopad && <p role="alert" className="note note-danger text-pretty">{dopad.zprava}</p>}
          <div>
            <label htmlFor="sm-heslo" className="field-label">Heslo</label>
            <input id="sm-heslo" type="password" autoComplete="current-password" value={heslo} onChange={e => setHeslo(e.target.value)} className="field" />
          </div>
          {dopad && (
            <div>
              <label htmlFor="sm-potvrzeni" className="field-label">Napište SMAZAT</label>
              <input id="sm-potvrzeni" autoComplete="off" autoCapitalize="characters" value={potvrzeni} onChange={e => setPotvrzeni(e.target.value)} className="field" />
              <p className="mt-1.5 t-meta">Zruší se předplatné a smažou se všechna data podniku. Zálohu si stáhněte předem.</p>
            </div>
          )}
          {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
        </div>
      </Modal>
    </section>
  );
}
