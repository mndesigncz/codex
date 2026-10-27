'use client';

// Uplatnění kuponu v záložce Kupony: kód od hosta → okno s náhledem a potvrzením
// (KuponUplatnitOkno, stejné jako ve čtečkách u kasy).

import { useState } from 'react';
import { Button, Card, Field, Input } from '../../ui';
import KuponUplatnitOkno from './KuponUplatnitOkno';
import { useT } from '@/lib/i18n/client';

export default function KuponyUplatnit({ toast, onDone }: { toast: (m: string) => void; onDone: () => void }) {
  const t = useT('sprava');
  const [kod, setKod] = useState('');
  const [okno, setOkno] = useState<string | null>(null);
  return (
    <>
      <Card as="form" className="space-y-3" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (kod.trim()) setOkno(kod); }}>
        <h2 className="t-card">{t('Uplatnit kupon')}</h2>
        <p className="t-meta">{t('Host ukáže kód ze své kartičky nebo QR. Kupon jde uplatnit jednou; před uplatněním uvidíš, co dává a jestli nejsou varování.')}</p>
        <Field id="c-code" label={t('Kód od hosta')}><Input id="c-code" value={kod} onChange={e => setKod(e.target.value.toUpperCase())} placeholder="ABC-123" className="font-mono tracking-widest" autoComplete="off" /></Field>
        <Button type="submit" variant="primary" icon="check" className="w-full" disabled={!kod.trim()}>{t('Zkontrolovat kupon')}</Button>
      </Card>
      {okno && <KuponUplatnitOkno kod={okno} onZavrit={() => setOkno(null)} onHotovo={m => { toast(m); setKod(''); onDone(); }} />}
    </>
  );
}
