'use client';

// Okno „Upravit člena“ v Zákaznících: ruční úprava bodů, kreditu nebo kumulované útraty.
// Body jsou odměna, kredit jsou peníze hosta u podniku (proto vlastní oprávnění
// vernost.kredit_upravit) a útrata určuje úroveň. Okno před uložením ukáže, kolik bude mít
// host po úpravě, a odepsat víc, než host má, nenechá — server to hlídá taky. Každá úprava
// jde do historie změn s důvodem.

import { useState } from 'react';
import { Button, Field, Input, Modal, Segmented, Textarea } from '../../ui';
import { useMoney, useSymbol } from '../../CurrencyProvider';
import { apiMessage, okJson } from '@/lib/api';
import { cisloCs } from '@/lib/bodyPravidla';

export interface UpravovanyClen { id: number; name: string; points: number; credit?: number; spend?: number }
type Co = 'body' | 'kredit' | 'utrata';

const MAX = 100000;

export function UpravaClenaOkno({ clen, smiBody, smiKredit, oznam, onHotovo, onZavrit }: {
  clen: UpravovanyClen; smiBody: boolean; smiKredit: boolean;
  oznam: (text: string, ton?: 'ok' | 'bad') => void; onHotovo: () => void; onZavrit: () => void;
}) {
  const money = useMoney();
  const symbol = useSymbol();
  const [co, setCo] = useState<Co>(smiBody ? 'body' : 'kredit');
  const [delta, setDelta] = useState('');
  const [poznamka, setPoznamka] = useState('');
  const [ukladam, setUkladam] = useState(false);

  const moznosti = [
    ...(smiBody ? [{ id: 'body', label: 'Body' }] : []),
    ...(smiKredit ? [{ id: 'kredit', label: 'Kredit' }] : []),
    ...(smiBody ? [{ id: 'utrata', label: 'Útrata' }] : []),
  ];
  const stav = co === 'body' ? clen.points : co === 'kredit' ? (clen.credit ?? 0) : (clen.spend ?? 0);
  const fmt = (n: number) => (co === 'body' ? `${cisloCs(n)} b.` : money(n));
  const cislo = /^-?\d+$/.test(delta.trim()) ? parseInt(delta, 10) : NaN;
  let chyba: string | undefined;
  if (delta.trim() !== '') {
    if (!Number.isFinite(cislo)) chyba = 'Zadej celé číslo, třeba 50 nebo -20.';
    else if (cislo === 0) chyba = 'Nula nic nezmění.';
    else if (Math.abs(cislo) > MAX) chyba = `Nejvíc ${cisloCs(MAX)} najednou.`;
    else if (cislo < 0 && -cislo > stav) chyba = co === 'utrata'
      ? `Útrata je teď ${fmt(stav)}, pod nulu nejde.`
      : `${clen.name} má jen ${fmt(stav)}, víc odepsat nejde.`;
  }
  const platne = Number.isFinite(cislo) && cislo !== 0 && !chyba;

  const uloz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!platne) return;
    setUkladam(true);
    try {
      const r = await fetch('/api/client/admin/loyalty', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: clen.id, delta: cislo, note: poznamka, ...(co === 'kredit' ? { what: 'credit' } : co === 'utrata' ? { what: 'spend' } : {}) }),
      }).then(okJson);
      oznam(co === 'utrata' ? `${clen.name}: útrata teď ${money(r.spend)}.`
        : co === 'kredit' ? `${clen.name}: kredit teď ${money(r.credit)}.`
        : `${clen.name}: teď ${r.points} bodů.`);
      onHotovo(); onZavrit();
    } catch (err) { oznam(apiMessage(err, 'Úpravu se nepodařilo uložit.'), 'bad'); }
    setUkladam(false);
  };

  const nazev = co === 'body' ? 'Body' : co === 'kredit' ? 'Kredit' : 'Útrata';
  return (
    <Modal open onClose={onZavrit} size="sm" title={`${nazev} pro ${clen.name}`}
      subtitle={`Teď ${co === 'body' ? 'má' : co === 'kredit' ? 'má' : 'je'} ${fmt(stav)}`}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button type="submit" form="body-okno" variant="primary" loading={ukladam} disabled={!platne}>Uložit</Button>
      </>}>
      <form id="body-okno" onSubmit={uloz} className="space-y-4">
        {moznosti.length > 1 && (
          <Segmented options={moznosti} value={co} onChange={v => { setCo(v as Co); setDelta(''); }} size="sm" ariaLabel="Co upravit" />
        )}
        <Field id="body-delta" error={chyba}
          label={co === 'utrata' ? 'O kolik upravit útratu' : co === 'kredit' ? `O kolik upravit kredit (${symbol})` : 'Kolik bodů'}
          hint={co === 'utrata' ? 'Útrata určuje úroveň, když podnik počítá úrovně podle útraty. Kladné číslo přičte, záporné odečte.'
            : co === 'kredit' ? 'Kredit jsou peníze hosta u podniku. Kladné číslo přičte, záporné odečte.'
            : 'Kladné číslo přičte, záporné odečte.'}>
          <Input id="body-delta" type="number" inputMode="numeric" autoFocus min={-MAX} max={MAX} className="!w-36"
            value={delta} onChange={e => setDelta(e.target.value)} />
        </Field>
        {platne && <p role="status" aria-live="polite" className="text-sm text-black/65">Po úpravě: <b className="tabular-nums">{fmt(stav)} → {fmt(stav + cislo)}</b></p>}
        <Field id="body-proc" label="Proč" hint="Uvidíš to v deníku člena a v historii změn. Nepovinné.">
          <Textarea id="body-proc" rows={2} maxLength={120} value={poznamka} onChange={e => setPoznamka(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
