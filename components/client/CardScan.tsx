'use client';

// Kartička u kasy. Obsluha opíše osm znaků nebo naskenuje QR kamerou
// (kde prohlížeč umí BarcodeDetector), uvidí hosta a jedním klepnutím dá
// razítko za návštěvu, body za útratu, nebo uplatní kupon, který host má.

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button } from '../ui';
import { Initials } from './ClientShell';

const input = 'w-full rounded-2xl bg-white/70 border border-black/[0.08] px-4 py-2.5 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/60 focus:ring-2 focus:ring-[#C8F542]/25 focus:outline-none transition text-sm';
const fmt = (raw: string) => { const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c; };

export default function CardScan({ onToast, onChange }: { onToast: (m: string) => void; onChange?: () => void }) {
  const [code, setCode] = useState('');
  const [hit, setHit] = useState<any | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [cam, setCam] = useState(false);
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window;

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
  const act = async (action: 'stamp' | 'points') => {
    setBusy(action); setErr('');
    try {
      const r = await fetch('/api/client/staff/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, action, amount: Number(amount) || 0 }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'Nepovedlo se.');
      onToast(x.message); setHit((h: any) => ({ ...h, ...x })); setAmount(''); onChange?.();
    } catch (e: any) { setErr(e.message); }
    setBusy('');
  };
  const redeem = async (couponCode: string) => {
    setBusy('redeem:' + couponCode); setErr('');
    try {
      const r = await fetch('/api/client/admin/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: couponCode }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'Nepovedlo se.');
      onToast(`Uplatněno: ${x.title}.`); setHit((h: any) => ({ ...h, openCoupons: (h.openCoupons ?? []).filter((c: any) => c.code !== couponCode) }));
    } catch (e: any) { setErr(e.message); }
    setBusy('');
  };
  const reset = () => { setHit(null); setCode(''); setErr(''); setAmount(''); };

  return (
    <section aria-labelledby="h-scan" className="rounded-3xl border border-black/[0.06] bg-white/60 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 id="h-scan" className="font-bold tracking-tight flex items-center gap-2"><Icon name="card" size={18} className="text-black/55" />Kartička hosta</h2>
        {hit && <button type="button" onClick={reset} className="tap-target-sm ml-auto text-xs font-semibold text-black/55 hover:text-black">Jiný host</button>}
      </div>
      {!hit ? (
        <form onSubmit={e => { e.preventDefault(); lookup(code); }} className="flex gap-2 flex-wrap">
          <input aria-label="Kód kartičky" value={code} onChange={e => setCode(fmt(e.target.value))} placeholder="ABCD-EFGH" autoCapitalize="characters" autoComplete="off" inputMode="text"
            className={`${input} font-mono tracking-[0.2em] flex-1 basis-40 uppercase`} />
          <Button type="submit" variant="primary" icon="search" loading={busy === 'lookup'}>Najít</Button>
          {canScan && <Button type="button" variant="secondary" icon="camera" onClick={() => setCam(v => !v)}>{cam ? 'Zavřít kameru' : 'Skenovat'}</Button>}
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Initials name={hit.customer.name} size={40} />
            <div className="min-w-0 flex-1">
              <p className="font-bold leading-tight truncate">{hit.customer.name}</p>
              <p className="text-sm text-black/55 tabular-nums">{hit.member ? `${hit.points} b. · ${hit.stamps}/${hit.rules?.stampTarget || '–'} razítek · ${hit.visits} návštěv${hit.levelLabel && hit.levelLabel !== 'Člen' ? ` · ${hit.levelLabel}` : ''}` : 'Ještě není členem. Prvním razítkem se stane.'}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button variant="accent" icon="check" loading={busy === 'stamp'} disabled={hit.stampedToday || !hit.rules?.stampTarget} onClick={() => act('stamp')}>
              {hit.stampedToday ? 'Dnes razítko už má' : 'Razítko za návštěvu'}
            </Button>
            <form onSubmit={e => { e.preventDefault(); act('points'); }} className="flex gap-2">
              <input aria-label="Útrata v Kč" type="number" inputMode="numeric" min={0} step={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder="Útrata Kč" className={`${input} !w-28 text-center`} />
              <Button type="submit" variant="primary" loading={busy === 'points'} disabled={!hit.rules?.pointsPer100 || !amount}>Body</Button>
            </form>
          </div>
          {hit.rules?.pointsPer100 > 0 && <p className="text-xs text-black/50">{hit.rules.pointsPer100} b. za každých 100 Kč. Razítko nejvýš jedno denně.</p>}
          {hit.openCoupons?.length > 0 && (
            <ul className="space-y-1.5">
              {hit.openCoupons.map((c: any) => (
                <li key={c.code} className="flex items-center gap-3 rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/40 px-3.5 py-2">
                  <span className="text-sm font-medium min-w-0 flex-1 truncate">{c.title} <span className="font-mono text-black/55">{c.code}</span></span>
                  <Button size="sm" variant="primary" loading={busy === 'redeem:' + c.code} onClick={() => redeem(c.code)}>Uplatnit</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {cam && !hit && <Camera onCode={c => { setCam(false); lookup(c); }} onError={m => { setCam(false); setErr(m); }} />}
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
    </section>
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
