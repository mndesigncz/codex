'use client';

// Kartička u kasy. Obsluha opíše osm znaků nebo naskenuje QR kamerou
// (kde prohlížeč umí BarcodeDetector), uvidí hosta a jedním klepnutím dá
// razítko za návštěvu, body za útratu, nebo uplatní kupon, který host má.
//
// Kolo 74: stejná kamera i pole načtou i QR kuponu („managero:coupon:ABC-DEF“,
// nebo opsaný šestimístný kód). Kupon se nejdřív ukáže (název, podmínky,
// platnost, kdo ho drží) a uplatní se až tlačítkem, stejnou cestou jako dřív
// (/api/client/admin/redeem). Cizí QR a karta hosta se řeknou srozumitelně.
//
// Kolo 69 (B8): jamka místo karty, úroveň, sleva a kredit jako Chip (dřív
// ruční pilulky, sleva tmavá s limetkovým textem), účty z pokladny jako
// filter-pill, kupony jako seznam (dřív limetkové řádky), štítky t-label,
// chyba `.note note-danger`, „Jiný host" jako tlačítko.
//
// Kolo 74: druhá cesta „Poukaz“ (s oprávněním poukazy.uplatnit): kód dárkového poukazu opsaný nebo
// naskenovaný → zůstatek a platnost → uplatnění částky nebo celého zůstatku (PoukazKasa níže).

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Chip, Input, ListRow, Segmented, Well } from '../ui';
import { useOpravneni } from '../role/useOpravneni';
import { formatujPriPsani, overKod, STAV_POPISEK, type StavPoukazu } from '@/lib/poukazy';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { czCount, type CzNoun } from '@/lib/czech';
import { rozpoznejQr } from '@/lib/kuponQr';
import OdkazCtecka from './OdkazCtecka';
import KuponUplatnitOkno from './loyalty/KuponUplatnitOkno';
import { useKlicAkce, hlavickyAkce, UpozorneniRazitek, RazitkoKarty, RucniPolozky, StornoRazitek } from './loyalty/RazitkaKasa';

const NAVSTEVA: CzNoun = { one: 'návštěva', few: 'návštěvy', many: 'návštěv' };
const fmt = (raw: string) => { const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c; };

export default function CardScan({ onToast, onChange }: { onToast: (m: string) => void; onChange?: () => void }) {
  const smiPoukaz = useOpravneni().ma('poukazy.uplatnit');
  const [rezim, setRezim] = useState<'karta' | 'poukaz'>('karta');
  const money = useMoney();
  const symbol = useSymbol();
  const [code, setCode] = useState('');
  const [hit, setHit] = useState<any | null>(null);
  const [amount, setAmount] = useState('');
  const [bill, setBill] = useState<string | null>(null);
  // Z účtu zaplacené kreditem nebo poukazem (body z té části se nepočítají, pokud to podnik tak nastavil)
  // a ručně zadané číslo účtenky (bez pokladny: jedno číslo věrnost připíše jen jednou).
  const [predplaceno, setPredplaceno] = useState('');
  const [uctenka, setUctenka] = useState('');
  // Poslední akce (body, kredit) jde vrátit; tlačítko je vidět do dalšího hosta, server hlídá i čas.
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [cam, setCam] = useState(false);
  // Klíč akce (opakování po výpadku sítě se připíše jednou) a upozornění po akci (vypršelá karta, nevešlá razítka).
  const klicAkce = useKlicAkce();
  const [upoz, setUpoz] = useState<{ expiredCount?: number; lost?: number } | null>(null);
  // Náhled kuponu z QR nebo kódu, který obsluha ještě neuplatnila.
  const [cp, setCp] = useState<any | null>(null);
  // Uplatnění jde přes okno s náhledem (útrata, varování, ověření věku): KuponUplatnitOkno.
  const [uplatnuji, setUplatnuji] = useState<{ kod: string; zNahledu: boolean } | null>(null);
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
    void resolve(text);
  };

  /** Text z QR nebo z pole: karta hosta → vyhledání hosta, kupon → náhled kuponu, jinak srozumitelná chyba. */
  const resolve = async (text: string) => {
    const r = rozpoznejQr(text);
    if (r.typ === 'karta') { await lookup(r.kod); return; }
    if (r.typ === 'kupon') { await previewCoupon(r.kod); return; }
    setErr(r.typ === 'prazdny' ? 'Zadej kód kartičky nebo kuponu, nebo naskenuj QR.' : /^[A-Za-z0-9 -]+$/.test(text.trim()) ? 'Kód kartičky má osm znaků, kód kuponu šest.' : 'Tohle není QR z Managera (kartička ani kupon). Opiš kód ručně.');
  };
  const previewCoupon = async (kod: string) => {
    setBusy('lookup'); setErr(''); setCp(null);
    try {
      const r = await fetch('/api/client/admin/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: kod, preview: true }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'Nepovedlo se.');
      setCp(x); setCode(kod);
    } catch (e: any) { setErr(e.message); }
    setBusy('');
  };
  const redeemPreview = () => { if (cp) setUplatnuji({ kod: cp.code, zNahledu: true }); };

  const lookup = async (c: string) => {
    const norm = c.replace(/[^A-Z0-9]/g, '');
    if (norm.length < 8) { setErr('Kód má osm znaků.'); return; }
    setBusy('lookup'); setErr('');
    try {
      const r = await fetch(`/api/client/staff/scan?code=${encodeURIComponent(norm)}`);
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'Nepovedlo se.');
      setHit(x); setCode(fmt(norm)); setUpoz(null);
    } catch (e: any) { setErr(e.message); setHit(null); }
    setBusy('');
  };
  const act = async (action: 'stamp' | 'points' | 'credit' | 'bill' | 'undo' | 'items', extra: { items?: { itemId: number; qty: number }[] } = {}) => {
    setBusy(action); setErr('');
    const telo = {
      code, action, amount: Number(amount) || 0, billId: action === 'bill' ? bill : undefined, items: extra.items,
      prepaid: action === 'points' || action === 'bill' ? Number(predplaceno) || 0 : undefined, receipt: action === 'points' ? uctenka.trim() || undefined : undefined,
    };
    // Stejná akce při opakování = stejný klíč. Server ji podruhé nepřipíše, jen vrátí původní odpověď.
    const klic = klicAkce.klic(JSON.stringify(telo));
    let status: number | null = null;
    try {
      const r = await fetch('/api/client/staff/scan', { method: 'POST', headers: hlavickyAkce(klic), body: JSON.stringify(telo) });
      status = r.status;
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'Nepovedlo se.');
      klicAkce.hotovo();
      onToast(x.message); setHit((h: any) => ({ ...h, ...x })); setAmount(''); setBill(null); setPredplaceno(''); setUctenka(''); setUpoz({ expiredCount: x.expiredCount, lost: x.lost }); onChange?.();
    } catch (e: any) {
      klicAkce.pochybe(status);
      setErr(status == null ? 'Nepodařilo se spojit se serverem. Zkontroluj, jestli akce neprošla, a zkus to znovu — nezdvojí se.' : e.message);
    }
    setBusy('');
  };
  const redeem = (couponCode: string) => setUplatnuji({ kod: couponCode, zNahledu: false });
  const reset = () => { setHit(null); setCp(null); setCode(''); setErr(''); setAmount(''); setBill(null); setPredplaceno(''); setUctenka(''); setUpoz(null); };

  return (
    // Jamka, ne karta: kartička se kreslí uvnitř karty (widget Objednávky od
    // stolu, příjem na tabletu) a karta v kartě se nedělá (DP §3.2).
    <Well pad="md" as="div" className="space-y-3" aria-labelledby="h-scan" role="group">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 id="h-scan" className="t-card flex items-center gap-2"><Icon name="card" size={17} className="text-black/40" />{rezim === 'poukaz' && smiPoukaz ? 'Dárkový poukaz' : 'Kartička hosta'}</h3>
        {smiPoukaz && !hit && <Segmented options={[{ id: 'karta', label: 'Karta' }, { id: 'poukaz', label: 'Poukaz' }]} value={rezim} onChange={v => { setRezim(v as 'karta' | 'poukaz'); setErr(''); setCam(false); }} size="sm" ariaLabel="Co se u kasy vyřizuje" />}
        {!hit && !cp && <OdkazCtecka className="sm:ml-auto" />}
        {hit && <Button variant="ghost" size="sm" className="sm:ml-auto" onClick={reset}>Jiný host</Button>}
        {cp && !hit && <Button variant="ghost" size="sm" className="sm:ml-auto" onClick={reset}>Jiný kód</Button>}
      </div>
      {rezim === 'poukaz' && smiPoukaz ? <PoukazKasa onToast={onToast} onChange={onChange} nativni={nativni} canScan={canScan} /> : !hit && cp ? (
        <div className="space-y-3" data-testid="kupon-nahled">
          <div className="min-w-0">
            <p className="t-label mb-0.5">Kupon</p>
            <p className="text-[15px] font-semibold leading-tight text-[#16181A] break-words">{cp.title}</p>
            {cp.benefit && <p className="t-meta mt-0.5">{cp.benefit}</p>}
            {cp.description && <p className="t-meta mt-0.5 break-words">{cp.description}</p>}
          </div>
          <p className="t-meta">Drží ho: <span className="font-semibold text-[#16181A]">{cp.customer}</span> · kód <span className="font-mono">{cp.code}</span></p>
          {(cp.badges?.length > 0 || cp.validSince || cp.validUntil) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(cp.badges ?? []).map((bd: string) => <Chip key={bd} tone="muted" size="sm">{bd}</Chip>)}
              {(cp.validSince || cp.validUntil) && <Chip tone="muted" size="sm">{cp.validSince ? `od ${cp.validSince}` : ''}{cp.validSince && cp.validUntil ? ' ' : ''}{cp.validUntil ? `do ${cp.validUntil}` : ''}</Chip>}
            </div>
          )}
          {cp.problem && <p role="alert" className="note note-danger">{cp.problem}</p>}
          <div className="flex gap-2 flex-wrap">
            <Button variant="primary" icon="check" disabled={!cp.usable} onClick={redeemPreview}>Uplatnit</Button>
            <Button variant="secondary" onClick={reset}>Zrušit</Button>
          </div>
        </div>
      ) : !hit ? (
        <form onSubmit={e => { e.preventDefault(); void resolve(code); }} className="flex gap-2 flex-wrap">
          <Input aria-label="Kód kartičky nebo kuponu" value={code} onChange={e => setCode(/[^A-Za-z0-9 -]/.test(e.target.value) ? e.target.value.slice(0, 200) : fmt(e.target.value))} placeholder="ABCD-EFGH" autoCapitalize="characters" autoComplete="off" inputMode="text"
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
          <RazitkoKarty campaigns={hit.campaigns ?? []} />
          <UpozorneniRazitek expiredCount={upoz?.expiredCount} lost={upoz?.lost} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Tmavé, ne limetka: kartička žije uvnitř widgetu a na ploše je limetka jen „Hotovo" v úpravách. */}
            <Button variant="primary" icon="check" loading={busy === 'stamp'}
              disabled={hit.stampedToday || (!hit.rules?.stampTarget && !hit.campaigns?.some((cp: any) => cp.ruleType === 'visit')) || (hit.campaigns?.some((cp: any) => cp.ruleType === 'visit') && !hit.campaigns.some((cp: any) => cp.ruleType === 'visit' && cp.platiTed !== false))}
              onClick={() => act('stamp')}>
              {hit.stampedToday ? 'Dnes razítko už má' : 'Razítko za návštěvu'}
            </Button>
            <form onSubmit={e => { e.preventDefault(); act('points'); }} className="flex gap-2">
              <Input aria-label={`Útrata v ${symbol}`} type="number" inputMode="numeric" min={0} step={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder={`Útrata ${symbol}`} className="!w-32 text-center" />
              <Button type="submit" variant="secondary" loading={busy === 'points'} disabled={!(hit.rules?.pointsPer100 || hit.campaigns?.some((cp: any) => cp.ruleType === 'min_value')) || !amount}>Body</Button>
            </form>
          </div>
          {hit.rules?.pointsPer100 > 0 && (
            <details className="group/dopl">
              <summary className="tap-target-sm inline-flex items-center gap-1.5 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none">
                <Icon name="chevron" size={15} className="transition-transform group-open/dopl:rotate-180" />K účtu: kredit nebo poukaz, číslo účtenky
              </summary>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sc-pred" className="field-label">Z toho zaplaceno kreditem nebo poukazem ({symbol})</label>
                  <Input id="sc-pred" type="number" inputMode="numeric" min={0} step={1} value={predplaceno} onChange={e => setPredplaceno(e.target.value)} placeholder="0" className="!w-32" />
                  <p className="t-meta mt-1">{hit.rules?.bodyPravidla?.excludePrepaid === false ? 'Podnik počítá body z celého účtu, i z části zaplacené poukazem.' : 'Z téhle části se body a cashback nepočítají.'}</p>
                </div>
                <div>
                  <label htmlFor="sc-uct" className="field-label">Číslo účtenky (nepovinné)</label>
                  <Input id="sc-uct" value={uctenka} maxLength={40} autoComplete="off" onChange={e => setUctenka(e.target.value)} placeholder="Třeba 2026/0412" className="!w-44" />
                  <p className="t-meta mt-1">Bez pokladny: stejné číslo věrnost podruhé nepřipíše.</p>
                </div>
              </div>
            </details>
          )}
          {hit.bills?.length > 0 && (
            <div>
              <p className="t-label mb-1.5">Dnešní účty z pokladny</p>
              <div className="flex flex-wrap gap-1.5">
                {hit.bills.map((bl: any) => (
                  <button key={bl.bill_id} type="button" aria-pressed={bill === bl.bill_id} disabled={bl.awarded}
                    title={bl.awarded ? 'Z téhle účtenky už věrnost připsala.' : undefined}
                    onClick={() => { const on = bill === bl.bill_id; setBill(on ? null : bl.bill_id); setAmount(on ? '' : String(Math.round(Number(bl.final_price)))); }}
                    className={`filter-pill tap-target-sm tabular-nums ${bill === bl.bill_id ? 'seg-on' : 'seg-off glass'} ${bl.awarded ? 'opacity-50 line-through' : ''}`}>
                    {money(Math.round(Number(bl.final_price)))}{bl.awarded ? ' · připsáno' : ''}
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
          <RucniPolozky polozky={hit.polozky ?? []} busy={busy === 'items'} onPripsat={items => act('items', { items })} />
          <StornoRazitek posledni={hit.posledniAkce ?? null} busy={busy === 'undo'} onStorno={() => act('undo')} />
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
                    actions={<Button size="sm" variant="secondary" onClick={() => redeem(c.code)}>Uplatnit</Button>} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {cam && !hit && !cp && rezim === 'karta' && <Camera onCode={c => { setCam(false); void resolve(c); }} onForeign={() => setErr('Tohle není QR z Managera (kartička ani kupon). Zkus jiný.')} onError={m => { setCam(false); setErr(m); }} />}
      {err && rezim === 'karta' && <p role="alert" className="note note-danger">{err}</p>}
      {uplatnuji && (
        <KuponUplatnitOkno kod={uplatnuji.kod} onZavrit={() => setUplatnuji(null)}
          onHotovo={m => {
            onToast(m);
            if (uplatnuji.zNahledu) { setCp(null); setCode(''); onChange?.(); }
            else setHit((h: any) => ({ ...h, openCoupons: (h.openCoupons ?? []).filter((c: any) => c.code !== uplatnuji.kod) }));
          }} />
      )}
    </Well>
  );
}

/** Kód poukazu z QR: platný `DP-XXXX-XXXX` (i bez pomlček), jinak null. Stabilní funkce, ať se kamera nerestartuje. */
const prijmiPoukaz = (raw: string) => overKod(raw);

/** Živý náhled kamery a čtení QR každých 300 ms. Jen kde je BarcodeDetector. */
function Camera({ onCode, onForeign, onError, prijmi }: { onCode: (c: string) => void; onForeign?: () => void; onError: (m: string) => void; prijmi?: (raw: string) => string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  // Zpětná volání v refu: inline funkce z rodiče by jinak při každém překreslení
  // (třeba po hlášce o cizím QR) vypnula a znovu spustila kameru.
  const cb = useRef({ onCode, onForeign, onError, prijmi });
  cb.current = { onCode, onForeign, onError, prijmi };
  useEffect(() => {
    let stream: MediaStream | null = null; let timer: any; let done = false; let posledniCizi = '';
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
            if (v && cb.current.prijmi) { const k = cb.current.prijmi(String(v)); if (k) { done = true; cb.current.onCode(k); } }
            else if (v) {
              // Karta hosta, nebo kupon (payload / šest znaků); cokoli jiného se jednou ohlásí a kamera čte dál.
              const typ = rozpoznejQr(v).typ;
              if (typ === 'karta' || typ === 'kupon') { done = true; cb.current.onCode(String(v)); }
              else if (String(v) !== posledniCizi) { posledniCizi = String(v); cb.current.onForeign?.(); }
            }
          } catch { /* další snímek */ }
        }, 300);
      } catch { cb.current.onError('Kamera není k dispozici. Opiš kód ručně.'); }
    })();
    return () => { done = true; clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, []);
  return <video ref={ref} muted playsInline className="w-full max-w-sm aspect-square object-cover rounded-2xl bg-black/80" aria-label="Náhled kamery" />;
}

// ---- Poukaz u kasy -----------------------------------------------------------------

interface PoukazNahled { id: number; code: string; value_amount: number; balance: number; currency: string; valid_until: string | null; recipient_name: string | null; stav: StavPoukazu }
const TON_POUKAZU: Record<StavPoukazu, 'ok' | 'muted' | 'bad' | 'wait'> = { active: 'ok', used: 'muted', void: 'bad', expired: 'wait' };
const datumPoukazu = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : d; };

/**
 * Dárkový poukaz: kód (opsaný nebo z QR) → zůstatek a platnost → uplatnění částky. Odečítá server atomicky
 * (`balance >= částka`), tady jen `ref` pro opakování po výpadku sítě: stejná akce se neodečte dvakrát.
 */
function PoukazKasa({ onToast, onChange, nativni, canScan }: { onToast: (m: string) => void; onChange?: () => void; nativni: boolean; canScan: boolean }) {
  const money = useMoney();
  const symbol = useSymbol();
  const [kod, setKod] = useState('');
  const [p, setP] = useState<PoukazNahled | null>(null);
  const [castka, setCastka] = useState('');
  // Nejnižší účet, od kterého jde poukaz uplatnit (nastavení podniku); obsluha pak zadá výši účtu.
  const [minUtrata, setMinUtrata] = useState(0);
  const [ucet, setUcet] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [cam, setCam] = useState(false);
  const ref = useRef<string | null>(null);
  const novyRef = () => (ref.current ??= (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(36).slice(2)}`));

  const najdi = async (raw: string) => {
    const k = overKod(raw);
    if (!k) { setErr('Takový kód poukazu není. Zkontroluj opsané znaky (DP-XXXX-XXXX).'); return; }
    setBusy('najit'); setErr('');
    try {
      const r = await fetch(`/api/client/admin/vouchers/redeem?code=${encodeURIComponent(k)}`);
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'Nepovedlo se.');
      setP(x.poukaz); setKod(formatujPriPsani(k)); setCastka(''); setUcet(''); setMinUtrata(Number(x.limity?.minUtrata) || 0); ref.current = null;
    } catch (e: any) { setErr(e.message); setP(null); }
    setBusy('');
  };
  const skenujNativne = async () => {
    setErr('');
    const text = await window.manageroNative?.skenujQr();
    if (text == null) return;
    const k = overKod(text);
    if (!k) { setErr('Tohle není dárkový poukaz. Opiš kód ručně.'); return; }
    void najdi(k);
  };
  const uplatni = async (hodnota: number) => {
    if (!p) return;
    setBusy('uplatnit'); setErr('');
    try {
      const r = await fetch('/api/client/admin/vouchers/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: p.code, amount: hodnota, ref: novyRef(), bill: ucet === '' ? null : Number(ucet) }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { if (r.status < 500) ref.current = null; if (x.poukaz) setP(x.poukaz); throw new Error(x.error || 'Nepovedlo se.'); }
      ref.current = null;
      // Hned říkáme, co s body: z části účtu zaplacené poukazem se body nepočítají (nastavení podniku).
      onToast(x.opakovani ? `Už uplatněno: ${money(x.castka)}.` : `Uplatněno ${money(x.castka)}. Na poukazu zbývá ${money(x.poukaz.balance)}.${x.bezBodu ? ` Při připsání bodů zadej ${money(x.castka)} jako zaplaceno poukazem.` : ''}`);
      setP(x.poukaz); setCastka(''); setUcet(''); onChange?.();
    } catch (e: any) { setErr(e.message || 'Nepovedlo se.'); }
    setBusy('');
  };
  const cislo = Number(castka);
  const potrebaUcet = minUtrata > 0;
  const ucetOk = !potrebaUcet || (ucet !== '' && Number(ucet) >= minUtrata);
  const castkaOk = !!p && Number.isInteger(cislo) && cislo >= 1 && cislo <= p.balance && ucetOk;

  return (
    <div className="space-y-3">
      {!p ? (
        <form onSubmit={e => { e.preventDefault(); void najdi(kod); }} className="flex gap-2 flex-wrap">
          <Input aria-label="Kód poukazu" value={kod} onChange={e => { setKod(formatujPriPsani(e.target.value)); setErr(''); }} placeholder="ABCD-2345" autoCapitalize="characters" autoComplete="off" inputMode="text"
            className="font-mono tracking-[0.2em] flex-1 basis-40 uppercase !w-auto" />
          <Button type="submit" variant="primary" icon="search" loading={busy === 'najit'}>Najít</Button>
          {canScan && <Button type="button" variant="secondary" icon="camera" onClick={() => (nativni ? void skenujNativne() : setCam(v => !v))}>{cam ? 'Zavřít kameru' : 'Skenovat'}</Button>}
        </form>
      ) : (
        <div className="space-y-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-tight flex items-center gap-2 flex-wrap"><span className="font-mono tracking-wider">{p.code}</span><Chip tone={TON_POUKAZU[p.stav]} size="sm">{STAV_POPISEK[p.stav]}</Chip></p>
            <p className="text-2xl font-bold tabular-nums mt-1 leading-tight">{money(p.balance)}</p>
            <p className="t-meta tabular-nums">z {money(p.value_amount)} · {p.valid_until ? `platí do ${datumPoukazu(p.valid_until)}` : 'bez omezení platnosti'}{p.recipient_name ? ` · pro ${p.recipient_name}` : ''}</p>
          </div>
          {p.stav === 'active' ? (
            <form onSubmit={e => { e.preventDefault(); if (castkaOk) void uplatni(cislo); }} className="flex flex-wrap items-center gap-2">
              {potrebaUcet && (
                <div className="basis-full">
                  <Input aria-label={`Výše účtu v ${symbol}`} type="number" inputMode="numeric" min={0} step={1} value={ucet} onChange={e => { setUcet(e.target.value); ref.current = null; setErr(''); }}
                    placeholder={`Účet alespoň ${minUtrata}`} className="!w-44 text-center" />
                  <p className="t-meta mt-1">Poukaz jde uplatnit u účtu od {money(minUtrata)}. Zadej výši účtu.</p>
                </div>
              )}
              <Input aria-label={`Částka k uplatnění v ${symbol}`} type="number" inputMode="numeric" min={1} max={p.balance} step={1} value={castka}
                onChange={e => { setCastka(e.target.value); ref.current = null; }} placeholder={`Max ${p.balance}`} className="!w-32 text-center" />
              <Button type="submit" variant="primary" icon="check" loading={busy === 'uplatnit'} disabled={!castkaOk}>Uplatnit</Button>
              <Button type="button" variant="secondary" disabled={busy === 'uplatnit' || !ucetOk} onClick={() => { setCastka(String(p.balance)); ref.current = null; void uplatni(p.balance); }}>Celý zůstatek</Button>
            </form>
          ) : (
            <p className="t-meta">{p.stav === 'expired' ? 'Platnost poukazu skončila, uplatnit ho nejde. Prodloužit ho může správce.' : p.stav === 'used' ? 'Poukaz je vyčerpaný.' : 'Poukaz je zrušený.'}</p>
          )}
          <Button variant="ghost" size="sm" onClick={() => { setP(null); setKod(''); setCastka(''); setUcet(''); setMinUtrata(0); setErr(''); ref.current = null; }}>Jiný poukaz</Button>
        </div>
      )}
      {cam && !p && <Camera prijmi={prijmiPoukaz} onCode={c => { setCam(false); void najdi(c); }} onError={m => { setCam(false); setErr(m); }} />}
      {err && <p role="alert" className="note note-danger">{err}</p>}
    </div>
  );
}
