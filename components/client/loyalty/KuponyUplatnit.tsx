'use client';

// Uplatnění kuponu u kasy: kód od hosta → náhled (co kupon dává, komu patří, proč nejde)
// → potvrzení s částkou účtenky. Varování (útrata pod minimem, 18+) obsluha musí potvrdit;
// uplatnění se zapíše s ní, částkou i potvrzenými varováními. Bez částky se kupon uplatní,
// ale do přehledu útraty nevstoupí.

import { useEffect, useRef, useState } from 'react';
import { Button, Card, Chip, Field, Input, Modal } from '../../ui';
import { useMoney, useSymbol } from '../../CurrencyProvider';
import { czDay } from '@/lib/clientSlots';
import { apiMessage, j } from './kuponyForm';

/** Částka z pole (desetinná čárka i tečka); prázdné = neznámá, nesmysl = null s chybou. */
function cistaCastka(raw: string): { hodnota: number | null; chyba?: string } {
  const s = raw.trim();
  if (!s) return { hodnota: null };
  const n = Number(s.replace(',', '.').replace(/\s/g, ''));
  if (!Number.isFinite(n) || n < 0) return { hodnota: null, chyba: 'Částka musí být číslo, třeba 189 nebo 189,50.' };
  return { hodnota: n };
}

export default function KuponyUplatnit({ toast, onDone }: { toast: (m: string) => void; onDone: () => void }) {
  const money = useMoney();
  const symbol = useSymbol();
  const [kod, setKod] = useState('');
  const [busy, setBusy] = useState<'' | 'nahled' | 'uplatnit'>('');
  const [nahled, setNahled] = useState<any | null>(null);
  const [castka, setCastka] = useState('');
  const [chyba, setChyba] = useState('');
  const poradi = useRef(0);
  const c = cistaCastka(castka);

  const nacti = async (code: string, hodnota: number | null) => {
    const d = await j('/api/client/admin/redeem', { method: 'POST', body: JSON.stringify({ code, preview: true, orderValue: hodnota ?? '' }) });
    return d;
  };

  const otevri = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kod.trim()) return;
    setBusy('nahled'); setChyba('');
    try { setNahled(await nacti(kod, null)); setCastka(''); }
    catch (err) { toast(apiMessage(err, 'Kupon se nepodařilo načíst.')); }
    setBusy('');
  };

  // Částka se mění → varování se přepočítají na serveru (jedna pravda o pravidlech).
  useEffect(() => {
    if (!nahled || c.chyba) return;
    const n = ++poradi.current;
    const t = setTimeout(() => {
      nacti(nahled.code, c.hodnota)
        .then(d => { if (n === poradi.current) setNahled(d); })
        .catch(err => { if (n === poradi.current) setChyba(apiMessage(err, 'Varování se nepodařilo přepočítat.')); });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castka]);

  const zavri = () => { poradi.current++; setNahled(null); setCastka(''); setChyba(''); };

  const uplatni = async () => {
    if (!nahled || c.chyba) return;
    setBusy('uplatnit'); setChyba('');
    try {
      const r = await j('/api/client/admin/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: nahled.code, orderValue: c.hodnota ?? '', confirm: (nahled.warnings?.length ?? 0) > 0 }),
      });
      toast(`Uplatněno: ${r.title}${r.benefit ? ` (${r.benefit})` : ''} · ${r.customer}.`);
      setKod(''); zavri(); onDone();
    } catch (err: any) {
      // Server si o potvrzení řekl (varování se objevilo po poslední kontrole): ukaž ho a nech obsluhu potvrdit znovu.
      if (err?.data?.needsConfirm) { setNahled({ ...nahled, warnings: err.data.warnings ?? [], needsConfirm: true }); setChyba('Zkontroluj varování a potvrď uplatnění.'); }
      else setChyba(apiMessage(err, 'Kupon se nepodařilo uplatnit.'));
    }
    setBusy('');
  };

  const varovani: string[] = Array.isArray(nahled?.warnings) ? nahled.warnings : [];
  return (
    <>
      <Card as="form" className="space-y-3" onSubmit={otevri}>
        <h2 className="t-card">Uplatnit kupon</h2>
        <p className="t-meta">Host ukáže kód ze své kartičky nebo QR. Kupon jde uplatnit jednou; před uplatněním uvidíš, co dává a jestli nejsou varování.</p>
        <Field id="c-code" label="Kód od hosta"><Input id="c-code" value={kod} onChange={e => setKod(e.target.value.toUpperCase())} placeholder="ABC-123" className="font-mono tracking-widest" autoComplete="off" /></Field>
        <Button type="submit" variant="primary" icon="check" loading={busy === 'nahled'} disabled={!kod.trim()}>Zkontrolovat kupon</Button>
      </Card>
      {nahled && (
        <Modal open onClose={zavri} size="sm" title={nahled.title}
          subtitle={nahled.customer}
          footer={<>
            <Button variant="secondary" onClick={zavri}>Zavřít</Button>
            <Button variant="primary" icon="check" loading={busy === 'uplatnit'} disabled={!nahled.usable || !!c.chyba}
              onClick={uplatni}>{varovani.length ? 'Uplatnit i přesto' : 'Uplatnit'}</Button>
          </>}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {nahled.benefit && <Chip tone="ok">{nahled.benefit}</Chip>}
              {(nahled.badges ?? []).map((b: string) => <Chip key={b} tone="muted" size="sm">{b}</Chip>)}
            </div>
            {nahled.description && <p className="text-sm text-black/65 text-pretty">{nahled.description}</p>}
            <p className="t-meta">
              {nahled.claimedAt ? `Vydáno ${czDay(String(nahled.claimedAt).slice(0, 10))}` : ''}
              {nahled.validUntil ? ` · platí do ${czDay(nahled.validUntil)}` : ''}
            </p>
            {nahled.problem && <p role="alert" className="note note-danger text-sm px-3 py-2">{nahled.problem}</p>}
            {nahled.usable && (
              <Field id="c-castka" label={`Částka účtenky (${symbol}), nepovinné`} error={c.chyba}
                hint={nahled.minOrderValue ? `Kupon platí od ${money(Number(nahled.minOrderValue))}.` : 'Zapíše se k uplatnění a vstoupí do přehledu útraty.'}>
                <Input id="c-castka" type="text" inputMode="decimal" value={castka} onChange={e => setCastka(e.target.value)} className="!w-36 text-right tabular-nums" placeholder="189" autoComplete="off" />
              </Field>
            )}
            {nahled.usable && varovani.length > 0 && (
              <ul role="alert" className="note note-wait text-sm px-3 py-2 space-y-1">
                {varovani.map((v: string) => <li key={v}>{v}</li>)}
              </ul>
            )}
            {chyba && <p role="alert" className="note note-danger text-sm px-3 py-2">{chyba}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
