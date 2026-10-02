'use client';

// Uplatnění kuponu v záložce Kupony: kód od hosta → okno s náhledem a potvrzením
// (KuponUplatnitOkno, stejné jako ve čtečkách u kasy).

import { useState } from 'react';
import { Button, Card, Field, Input } from '../../ui';
import KuponUplatnitOkno from './KuponUplatnitOkno';

export default function KuponyUplatnit({ toast, onDone }: { toast: (m: string) => void; onDone: () => void }) {
  const [kod, setKod] = useState('');
  const [okno, setOkno] = useState<string | null>(null);
  return (
    <>
      <Card as="form" className="space-y-3" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (kod.trim()) setOkno(kod); }}>
        <h2 className="t-card">Uplatnit kupon</h2>
        <p className="t-meta">Host ukáže kód ze své kartičky nebo QR. Kupon jde uplatnit jednou; před uplatněním uvidíš, co dává a jestli nejsou varování.</p>
        <Field id="c-code" label="Kód od hosta"><Input id="c-code" value={kod} onChange={e => setKod(e.target.value.toUpperCase())} placeholder="ABC-123" className="font-mono tracking-widest" autoComplete="off" /></Field>
        <Button type="submit" variant="primary" icon="check" disabled={!kod.trim()}>Zkontrolovat kupon</Button>
      </Card>
      {okno && <KuponUplatnitOkno kod={okno} onZavrit={() => setOkno(null)} onHotovo={m => { toast(m); setKod(''); onDone(); }} />}
    </>
  );
}
