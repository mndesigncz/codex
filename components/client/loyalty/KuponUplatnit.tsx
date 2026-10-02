'use client';

// Uplatnění kuponu u kasy s náhledem: obsluha uvidí, co kupon dává a komu patří,
// zadá útratu (povinně, když má kupon minimální útratu; jinak nepovinně pro přehled
// přínosu) a u kuponu 18+ potvrdí občanku, když host nemá datum narození. Uplatní se
// až tlačítkem; částka a obsluha se zapíšou.

import { useEffect, useState } from 'react';
import { Button, Chip, ErrorState, Field, Input, Modal, Skeleton, SwitchRow } from '../../ui';
import { useSymbol, useMoney } from '../../CurrencyProvider';
import { apiMessage } from '@/lib/api';
import { j } from './kuponyUi';

export default function KuponUplatnit({ kod, onZavrit, onHotovo }: {
  kod: string; onZavrit: () => void; onHotovo: (zprava: string) => void;
}) {
  const symbol = useSymbol();
  const money = useMoney();
  const [n, setN] = useState<any | null>(null);
  const [chybaNacteni, setChybaNacteni] = useState('');
  const [amount, setAmount] = useState('');
  const [vek, setVek] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const [pokus, setPokus] = useState(0);

  useEffect(() => {
    let zrusit = false;
    setN(null); setChybaNacteni('');
    j('/api/client/admin/redeem', { method: 'POST', body: JSON.stringify({ code: kod, preview: true }) })
      .then(d => { if (!zrusit) setN(d); })
      .catch(e => { if (!zrusit) setChybaNacteni(apiMessage(e, 'Kupon se nepodařilo načíst.')); });
    return () => { zrusit = true; };
  }, [kod, pokus]);

  const potrebujeCastku = n?.needsAmount === true;
  const castkaOk = !potrebujeCastku || (amount.trim() !== '' && Number(amount) >= Number(n?.minOrderValue ?? 0));
  const vekOk = !(n?.needsAgeCheck) || vek;
  const lzeUplatnit = !!n && n.usable && !n.nezletily && castkaOk && vekOk;

  const uplatni = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!lzeUplatnit || busy) return;
    setBusy(true); setChyba('');
    try {
      const r = await j('/api/client/admin/redeem', { method: 'POST', body: JSON.stringify({ code: kod, amount: amount.trim() === '' ? undefined : amount, ageChecked: vek }) });
      onHotovo(`Uplatněno: ${r.title}${r.benefit ? ` (${r.benefit})` : ''} · ${r.customer}.${r.badges?.length ? ` Zkontroluj: ${r.badges.join(', ')}.` : ''}`);
      onZavrit();
    } catch (err) { setChyba(apiMessage(err, 'Kupon se nepodařilo uplatnit.')); }
    setBusy(false);
  };

  return (
    <Modal open onClose={onZavrit} size="sm" title="Uplatnit kupon" subtitle={<span className="font-mono">{kod}</span>}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button type="submit" form="kupon-uplatnit" variant="primary" icon="check" loading={busy} disabled={!lzeUplatnit}>Uplatnit</Button>
      </>}>
      {chybaNacteni ? <ErrorState title="Kupon se nenačetl" onRetry={() => setPokus(p => p + 1)} detail={chybaNacteni} />
        : !n ? <Skeleton className="h-32" />
        : (
          <form id="kupon-uplatnit" onSubmit={uplatni} className="space-y-4" data-testid="kupon-uplatnit">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight text-[#16181A] break-words">{n.title}</p>
              {n.benefit && <p className="t-meta mt-0.5">{n.benefit}</p>}
              {n.description && <p className="t-meta mt-0.5 break-words">{n.description}</p>}
              <p className="t-meta mt-1">Drží ho: <span className="font-semibold text-[#16181A]">{n.customer}</span></p>
            </div>
            {n.badges?.length > 0 && <div className="flex flex-wrap gap-1.5">{n.badges.map((b: string) => <Chip key={b} tone="muted" size="sm">{b}</Chip>)}</div>}
            {n.problem && <p role="alert" className="note note-danger">{n.problem}</p>}
            {n.nezletily && <p role="alert" className="note note-danger">Host je nezletilý. Kupon 18+ mu uplatnit nejde.</p>}
            {!n.problem && !n.nezletily && (
              <>
                <Field id="ku-castka" label={`Útrata hosta (${symbol})`}
                  hint={potrebujeCastku ? `Povinné: kupon platí od ${money(Number(n.minOrderValue))}.` : 'Nepovinné. Zapíše se do přehledu uplatnění.'}>
                  <Input id="ku-castka" type="number" inputMode="numeric" min={0} autoFocus className="!w-40" value={amount} onChange={e => setAmount(e.target.value)} placeholder={potrebujeCastku ? String(n.minOrderValue) : '—'} />
                </Field>
                {n.needsAgeCheck && (
                  <SwitchRow as="div" title="Ověřil(a) jsem věk"
                    hint="Host nemá v profilu datum narození. Zkontroluj občanku: musí mu být aspoň 18 let." checked={vek} onChange={setVek} />
                )}
              </>
            )}
            {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
          </form>
        )}
    </Modal>
  );
}
