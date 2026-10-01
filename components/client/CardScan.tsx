'use client';

// Kartička u kasy. Obsluha opíše osm znaků nebo naskenuje QR kamerou
// (kde prohlížeč umí BarcodeDetector), uvidí hosta a jedním klepnutím dá
// razítko za návštěvu, body za útratu, nebo uplatní kupon, který host má.
//
// Kolo 69 (B8): jamka místo karty, úroveň, sleva a kredit jako Chip (dřív
// ruční pilulky, sleva tmavá s limetkovým textem), účty z pokladny jako
// filter-pill, kupony jako seznam (dřív limetkové řádky), štítky t-label,
// chyba `.note note-danger`, „Jiný host" jako tlačítko.

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Chip, Input, ListRow, Well } from '../ui';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { czCount, type CzNoun } from '@/lib/czech';
import { kodKarty } from '@/lib/nativni/most';

const NAVSTEVA: CzNoun = { one: 'návštěva', few: 'návštěvy', many: 'návštěv' };
const fmt = (raw: string) => { const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c; };

export default function CardScan({ onToast, onChange }: { onToast: (m: string) => void; onChange?: () => void }) {
  const money = useMoney();
  const symbol = useSymbol();
  const [code, setCode] = useState('');
  const [hit, setHit] = useState<any | null>(null);
  const [amount, setAmount] = useState('');
  const [bill, setBill] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [cam, setCam] = useState(false);
  // Nativní skener z obalu (window.manageroNative, components/NativeBridge): na iPhonu
  // BarcodeDetector není, nativní ML Kit skener ano. Most se nahlásí až po hydrataci.
  const [nativni, setNativni] = useState(false);
  useEffect(() => {
    const zjisti = () => setNativni(!!window.manageroNative?.skenujQr);
    zjisti();
    window.addEventListener('managero:nativni-pripraveno', zjisti);
    return () => window.removeEventListener('managero:nativni-pripraveno', zjisti);
  }, []);
  const canScan = nativni || (typeof window !== 'undefined' && 'BarcodeDetector' in window);
  const skenujNativne = async () => {
    setErr('');
    const text = await window.manageroNative?.skenujQr();
    if (text == null) return; // zrušeno
    const kod = kodKarty(text);
    if (!kod) { setErr('Tohle není karta hosta. Opiš kód ručně.'); return; }
    void lookup(kod);
  };

  const lookup = async (c: string) => {
    const norm = c.replace(/[^A-Z0-9]/g, '');
    if (norm.length < 8) { setErr('Kód má osm znaků.'); return; }
    setBusy('lookup'); setErr('');
    try {
      const r = await fetch(`/api/client/staff/scan?code=${encodeURIComponent(norm)}`);
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'Nepovedlo se.');
      setHit(x); setCode(fmt(norm));
    } catch (e: any) { setErr(e.message); setHit(null); }
    setBusy('');
  };
  const act = async (action: 'stamp' | 'points' | 'credit' | 'bill') => {
    setBusy(action); setErr('');
    try {
      const r = await fetch('/api/client/staff/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, action, amount: Number(amount) || 0, billId: action === 'bill' ? bill : undefined }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'Nepovedlo se.');
      onToast(x.message); setHit((h: any) => ({ ...h, ...x })); setAmount(''); setBill(null); onChange?.();
    } catch (e: any) { setErr(e.message); }
    setBusy('');
  };
  const redeem = async (couponCode: string) => {
    setBusy('redeem:' + couponCode); setErr('');
    try {
      const r = await fetch('/api/client/admin/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: couponCode }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'Nepovedlo se.');
      onToast(`Uplatněno: ${x.title}${x.benefit ? ` (${x.benefit})` : ''}.${x.badges?.length ? ` Zkontroluj: ${x.badges.join(', ')}.` : ''}`);
      setHit((h: any) => ({ ...h, openCoupons: (h.openCoupons ?? []).filter((c: any) => c.code !== couponCode) }));
    } catch (e: any) { setErr(e.message); }
    setBusy('');
  };
  const reset = () => { setHit(null); setCode(''); setErr(''); setAmount(''); setBill(null); };

  return (
    // Jamka, ne karta: kartička se kreslí uvnitř karty (widget Objednávky od
    // stolu, příjem na tabletu) a karta v kartě se nedělá (DP §3.2).
    <Well pad="md" as="div" className="space-y-3" aria-labelledby="h-scan" role="group">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 id="h-scan" className="t-card flex items-center gap-2"><Icon name="card" size={17} className="text-black/40" />Kartička hosta</h3>
        {hit && <Button variant="ghost" size="sm" className="sm:ml-auto" onClick={reset}>Jiný host</Button>}
      </div>
      {!hit ? (
        <form onSubmit={e => { e.preventDefault(); lookup(code); }} className="flex gap-2 flex-wrap">
          <Input aria-label="Kód kartičky" value={code} onChange={e => setCode(fmt(e.target.value))} placeholder="ABCD-EFGH" autoCapitalize="characters" autoComplete="off" inputMode="text"
            className="font-mono tracking-[0.2em] flex-1 basis-40 uppercase !w-auto" />
          <Button type="submit" variant="primary" icon="search" loading={busy === 'lookup'}>Najít</Button>
          {canScan && <Button type="button" variant="secondary" icon="camera" onClick={() => (nativni ? void skenujNativne() : setCam(v => !v))}>{cam ? 'Zavřít kameru' : 'Skenovat'}</Button>}
        </form>
      ) : (
        <div className="space-y-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-tight truncate text-[#16181A]">{hit.customer.name}</p>
            <p className="t-meta tabular-nums mt-0.5">{hit.member
              ? (hit.campaigns?.length > 0 ? `${hit.points} b. · ${czCount(hit.visits, NAVSTEVA)}` : `${hit.points} b. · ${hit.stamps}/${hit.rules?.stampTarget || '–'} razítek · ${czCount(hit.visits, NAVSTEVA)}`)
              : 'Ještě není členem. Prvním razítkem se stane.'}</p>
          </div>
          {hit.member && (hit.discount > 0 || hit.credit > 0 || hit.levelLabel !== 'Člen') && (
            <div className="flex flex-wrap items-center gap-1.5">
              {hit.levelLabel && hit.levelLabel !== 'Člen' && <Chip tone={hit.tier === 'silver' ? 'muted' : 'ink'} size="sm">{hit.levelLabel}</Chip>}
              {hit.discount > 0 && <Chip tone="ok" size="sm">Sleva {hit.discount} %{hit.discountSource === 'skupina' && hit.discountName ? ` (${hit.discountName})` : ''}</Chip>}
              {hit.credit > 0 && <Chip tone="ok" size="sm" icon="card">Kredit {money(hit.credit)}</Chip>}
              {hit.nextTierAt && <span className="t-meta">do „{hit.nextTierLabel}" ještě {hit.nextTierUnit === 'spend' ? money(Math.max(0, hit.nextTierAt - (hit.spend ?? 0))) : czCount(Math.max(0, hit.nextTierAt - hit.visits), NAVSTEVA)}</span>}
            </div>
          )}
          {hit.campaigns?.length > 0 && (
            <ul className="list">
              {hit.campaigns.map((cp: any) => (
                <li key={cp.id} className="list-row flex-col items-stretch gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold min-w-0 truncate">{cp.name}</p>
                    <p className="text-[13px] font-semibold tabular-nums text-black/60 shrink-0">{cp.stamps}/{cp.required}</p>
                  </div>
                  <div className="flex gap-1" aria-hidden>
                    {Array.from({ length: Math.min(cp.required, 12) }).map((_, i) => (
                      <span key={i} className={`h-1.5 flex-1 rounded-full ${i < cp.stamps ? 'bg-[#C8F542]' : 'bg-black/[0.08]'}`} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Tmavé, ne limetka: kartička žije uvnitř widgetu a na ploše je limetka jen „Hotovo" v úpravách. */}
            <Button variant="primary" icon="check" loading={busy === 'stamp'}
              disabled={hit.stampedToday || (!hit.rules?.stampTarget && !hit.campaigns?.some((cp: any) => cp.ruleType === 'visit'))}
              onClick={() => act('stamp')}>
              {hit.stampedToday ? 'Dnes razítko už má' : 'Razítko za návštěvu'}
            </Button>
            <form onSubmit={e => { e.preventDefault(); act('points'); }} className="flex gap-2">
              <Input aria-label={`Útrata v ${symbol}`} type="number" inputMode="numeric" min={0} step={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder={`Útrata ${symbol}`} className="!w-32 text-center" />
              <Button type="submit" variant="secondary" loading={busy === 'points'} disabled={!hit.rules?.pointsPer100 || !amount}>Body</Button>
            </form>
          </div>
          {hit.bills?.length > 0 && (
            <div>
              <p className="t-label mb-1.5">Dnešní účty z pokladny</p>
              <div className="flex flex-wrap gap-1.5">
                {hit.bills.map((bl: any) => (
                  <button key={bl.bill_id} type="button" aria-pressed={bill === bl.bill_id}
                    onClick={() => { const on = bill === bl.bill_id; setBill(on ? null : bl.bill_id); setAmount(on ? '' : String(Math.round(Number(bl.final_price)))); }}
                    className={`filter-pill tap-target-sm tabular-nums ${bill === bl.bill_id ? 'seg-on' : 'seg-off glass'}`}>
                    {money(Math.round(Number(bl.final_price)))}
                  </button>
                ))}
              </div>
              {bill && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <Button size="sm" variant="primary" icon="check" loading={busy === 'bill'} onClick={() => act('bill')}>Připsat z účtenky</Button>
                  <p className="t-meta">Razítka podle položek účtu + body a kredit z částky. Jde to jen jednou na účtenku.</p>
                </div>
              )}
            </div>
          )}
          {hit.credit > 0 && (
            <form onSubmit={e => { e.preventDefault(); act('credit'); }} className="flex gap-2 items-center">
              <Input aria-label="Kolik kreditu uplatnit" type="number" inputMode="numeric" min={1} max={hit.credit} value={amount} onChange={e => setAmount(e.target.value)} placeholder={`Max ${hit.credit}`} className="!w-32 text-center" />
              <Button type="submit" variant="secondary" icon="card" loading={busy === 'credit'} disabled={!amount}>Uplatnit kredit</Button>
            </form>
          )}
          {(hit.affordable?.length ?? 0) > 0 && (
            <p className="t-meta">Za body teď dosáhne na: {hit.affordable.map((a: any) => `${a.title} (${a.cost_points} b.)`).join(', ')}. Kupon si vezme sám na své stránce.</p>
          )}
          {hit.rules?.pointsPer100 > 0 && <p className="t-meta">{hit.rules.pointsPer100} b. za každých 100 {symbol}{hit.rules.cashbackPct > 0 ? ` a ${hit.rules.cashbackPct} % zpět jako kredit` : ''}. Razítko nejvýš jedno denně.</p>}
          {hit.openCoupons?.length > 0 && (
            <div>
              <p className="t-label mb-1">Kupony k uplatnění</p>
              <ul className="list">
                {hit.openCoupons.map((c: any) => (
                  <ListRow key={c.code} title={c.title} meta={<span className="font-mono">{c.code}</span>}
                    actions={<Button size="sm" variant="secondary" loading={busy === 'redeem:' + c.code} onClick={() => redeem(c.code)}>Uplatnit</Button>} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {cam && !hit && <Camera onCode={c => { setCam(false); lookup(c); }} onError={m => { setCam(false); setErr(m); }} />}
      {err && <p role="alert" className="note note-danger">{err}</p>}
    </Well>
  );
}

/** Živý náhled kamery a čtení QR každých 300 ms. Jen kde je BarcodeDetector. */
function Camera({ onCode, onError }: { onCode: (c: string) => void; onError: (m: string) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let stream: MediaStream | null = null; let timer: any; let done = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (ref.current) { ref.current.srcObject = stream; await ref.current.play(); }
        const det = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        timer = setInterval(async () => {
          if (done || !ref.current) return;
          try {
            const codes = await det.detect(ref.current);
            const v = codes?.[0]?.rawValue;
            if (v && /^[A-Z0-9]{8}$/.test(String(v).toUpperCase().replace(/[^A-Z0-9]/g, ''))) { done = true; onCode(String(v).toUpperCase()); }
          } catch { /* další snímek */ }
        }, 300);
      } catch { onError('Kamera není k dispozici. Opiš kód ručně.'); }
    })();
    return () => { done = true; clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, [onCode, onError]);
  return <video ref={ref} muted playsInline className="w-full max-w-sm aspect-square object-cover rounded-2xl bg-black/80" aria-label="Náhled kamery" />;
}
