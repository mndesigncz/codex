'use client';

// Okno uplatnění kuponu u kasy: kód od hosta → náhled (co kupon dává, komu patří, proč nejde)
// → potvrzení s částkou účtenky. Varování (útrata pod minimem, 18+) obsluha musí potvrdit;
// uplatnění se zapíše s ní, částkou i potvrzenými varováními. Bez částky se kupon uplatní,
// ale do přehledu útraty nevstoupí. Používá ho záložka Kupony (pole „Kód od hosta“) i čtečky
// u kasy (Kartička hosta, Čtečka), takže uplatnění kuponu s podmínkami má všude stejnou cestu.

import { useEffect, useRef, useState } from 'react';
import { Button, Chip, ErrorState, Field, Input, Modal, Skeleton } from '../../ui';
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

export default function KuponUplatnitOkno({ kod, onZavrit, onHotovo }: {
  kod: string; onZavrit: () => void; onHotovo: (zprava: string) => void;
}) {
  const money = useMoney();
  const symbol = useSymbol();
  const [nahled, setNahled] = useState<any | null>(null);
  const [chybaNacteni, setChybaNacteni] = useState('');
  const [pokus, setPokus] = useState(0);
  const [busy, setBusy] = useState(false);
  const [castka, setCastka] = useState('');
  const [chyba, setChyba] = useState('');
  const poradi = useRef(0);
  const c = cistaCastka(castka);

  const nacti = (hodnota: number | null) => j('/api/client/admin/redeem', { method: 'POST', body: JSON.stringify({ code: kod, preview: true, orderValue: hodnota ?? '' }) });

  useEffect(() => {
    let zrusit = false;
    setNahled(null); setChybaNacteni('');
    nacti(null).then(d => { if (!zrusit) setNahled(d); }).catch(e => { if (!zrusit) setChybaNacteni(apiMessage(e, 'Kupon se nepodařilo načíst.')); });
    return () => { zrusit = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kod, pokus]);

  // Částka se mění → varování se přepočítají na serveru (jedna pravda o pravidlech).
  useEffect(() => {
    if (!nahled || c.chyba) return;
    const n = ++poradi.current;
    const t = setTimeout(() => {
      nacti(c.hodnota)
        .then(d => { if (n === poradi.current) setNahled(d); })
        .catch(err => { if (n === poradi.current) setChyba(apiMessage(err, 'Varování se nepodařilo přepočítat.')); });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castka]);

  const uplatni = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!nahled || !nahled.usable || c.chyba || busy) return;
    setBusy(true); setChyba('');
    try {
      const r = await j('/api/client/admin/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: nahled.code, orderValue: c.hodnota ?? '', confirm: (nahled.warnings?.length ?? 0) > 0 }),
      });
      onHotovo(`Uplatněno: ${r.title}${r.benefit ? ` (${r.benefit})` : ''} · ${r.customer}.${r.badges?.length ? ` Zkontroluj: ${r.badges.join(', ')}.` : ''}`);
      onZavrit();
    } catch (err: any) {
      // Server si o potvrzení řekl (varování se objevilo po poslední kontrole): ukaž ho a nech obsluhu potvrdit znovu.
      if (err?.data?.needsConfirm) { setNahled({ ...nahled, warnings: err.data.warnings ?? [], needsConfirm: true }); setChyba('Zkontroluj varování a potvrď uplatnění.'); }
      else setChyba(apiMessage(err, 'Kupon se nepodařilo uplatnit.'));
    }
    setBusy(false);
  };

  const varovani: string[] = Array.isArray(nahled?.warnings) ? nahled.warnings : [];
  return (
    <Modal open onClose={onZavrit} size="sm" title={nahled?.title ?? 'Uplatnit kupon'} subtitle={nahled?.customer ?? <span className="font-mono">{kod}</span>}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zavřít</Button>
        <Button type="submit" form="kupon-uplatnit" variant="primary" icon="check" loading={busy} disabled={!nahled?.usable || !!c.chyba}>{varovani.length ? 'Uplatnit i přesto' : 'Uplatnit'}</Button>
      </>}>
      {chybaNacteni ? <ErrorState title="Kupon se nenačetl" onRetry={() => setPokus(p => p + 1)} detail={chybaNacteni} />
        : !nahled ? <Skeleton className="h-32" />
        : (
          <form id="kupon-uplatnit" data-testid="kupon-uplatnit" onSubmit={uplatni} className="space-y-3">
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
          </form>
        )}
    </Modal>
  );
}
