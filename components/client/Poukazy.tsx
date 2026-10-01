'use client';

// Dárkové poukazy (podzáložka Věrnost → Poukazy): seznam s hledáním a filtrem stavu, nový poukaz nebo dávka,
// detail s historií uplatnění, uplatnění částky (i „celý zůstatek“), zrušení s potvrzením, vrácení omylu,
// prodloužení platnosti, tisk karty s QR kódem a export CSV.
//
// Poukaz je peněžní (zůstatek v celých jednotkách měny podniku, uplatní se na víckrát), kupon ne.
// Oprávnění: poukazy.zobrazit (seznam), poukazy.spravovat (vytvářet, rušit, upravovat, export),
// poukazy.uplatnit (odečíst částku). Zůstatek se mění jen na serveru, atomicky (viz lib/poukazyDb.ts).
// Komponenta Client adminu: texty natvrdo česky (bez t()), jako zbytek správy.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Modal, Segmented, Skeleton, Textarea, Well, type ChipTone } from '../ui';
import { SearchField } from '../ui/SearchField';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { useOpravneni } from '../role/useOpravneni';
import { apiMessage, okJson } from '@/lib/api';
import { czCount } from '@/lib/czech';
import { dbTimeDayHM, pragueToday, dayPlus } from '@/lib/pragueTime';
import { HLASKA_NEJDE_ULOZIT, ulozSoubor } from '@/lib/stahni';
import { openPrint } from '@/lib/printDoc';
import { poukazyKartyHtml, datumCesky, type KartaPoukazu } from '@/lib/poukazyTisk';
import { formatujPriPsani, overKod, STAV_POPISEK, MAX_DAVKA, type StavPoukazu } from '@/lib/poukazy';

interface PoukazRadek {
  id: number; code: string; value_amount: number; balance: number; currency: string; recipient_name: string | null; buyer_name: string | null;
  note: string | null; valid_until: string | null; status: string; created_at: string; stav: StavPoukazu;
}
interface Pouziti { id: number; kind: string; amount: number; balance_after: number | null; by_name: string | null; note: string | null; created_at: string }

const TON: Record<StavPoukazu, ChipTone> = { active: 'ok', used: 'muted', void: 'bad', expired: 'wait' };
const FILTRY: { id: string; label: string }[] = [
  { id: '', label: 'Vše' }, { id: 'active', label: 'Platné' }, { id: 'used', label: 'Vyčerpané' }, { id: 'expired', label: 'Propadlé' }, { id: 'void', label: 'Zrušené' },
];
const DRUH_POPISEK: Record<string, string> = { use: 'Uplatněno', refund: 'Vráceno', void: 'Zrušeno' };

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, init ? { headers: { 'Content-Type': 'application/json' }, ...init } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Nepovedlo se.'), { status: r.status });
  return d;
}

/** Karty na tisk: QR se kreslí až při tisku (knihovna qrcode se načte jen tehdy). */
async function vytisknout(poukazy: KartaPoukazu[], podnik: string): Promise<boolean> {
  const QR = (await import('qrcode')).default;
  const qr: Record<string, string> = {};
  for (const p of poukazy) qr[p.code] = await QR.toString(p.code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return openPrint({
    title: poukazy.length === 1 ? `Dárkový poukaz ${poukazy[0].code}` : `Dárkové poukazy: ${czCount(poukazy.length, POUKAZ)}`,
    body: poukazyKartyHtml(poukazy, podnik, qr), business: podnik,
  });
}

const POUKAZ = { one: 'poukaz', few: 'poukazy', many: 'poukazů' };

export default function Poukazy({ toast }: { toast: (m: string) => void }) {
  const { ma } = useOpravneni();
  const spravuje = ma('poukazy.spravovat');
  const uplatni = ma('poukazy.uplatnit');
  const vidi = ma('poukazy.zobrazit');
  const money = useMoney();
  const [q, setQ] = useState('');
  const [hledej, setHledej] = useState('');
  const [stav, setStav] = useState('');
  const [strana, setStrana] = useState(1);
  const [data, setData] = useState<{ poukazy: PoukazRadek[]; celkem: number; naStranu: number; currency: string } | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [novy, setNovy] = useState(false);
  const [vytvorene, setVytvorene] = useState<PoukazRadek[] | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [kod, setKod] = useState('');
  const [hledam, setHledam] = useState(false);
  const [exportuji, setExportuji] = useState(false);
  const [podnik, setPodnik] = useState('Podnik');

  useEffect(() => {
    // Název podniku na kartu poukazu.
    fetch('/api/client/admin/profile').then(okJson).then(d => { const n = d?.profile?.team_name ?? d?.profile?.name; if (n) setPodnik(String(n)); }).catch(() => {});
  }, []);
  useEffect(() => { const t = setTimeout(() => { setHledej(q); setStrana(1); }, 250); return () => clearTimeout(t); }, [q]);

  const nacti = useCallback(() => {
    const u = new URLSearchParams({ strana: String(strana) });
    if (hledej) u.set('q', hledej);
    if (stav) u.set('stav', stav);
    return j(`/api/client/admin/vouchers?${u}`).then(d => { setData(d); setChyba(null); }).catch(e => setChyba(apiMessage(e, 'Poukazy se nepodařilo načíst.')));
  }, [strana, hledej, stav]);
  useEffect(() => { if (vidi) void nacti(); }, [nacti, vidi]);

  const najdiKod = async (e: React.FormEvent) => {
    e.preventDefault();
    const k = overKod(kod);
    if (!k) { toast('Takový kód poukazu není. Zkontroluj opsané znaky.'); return; }
    setHledam(true);
    try {
      const d = await j(`/api/client/admin/vouchers/redeem?code=${encodeURIComponent(k)}`);
      setKod(''); setDetailId(d.poukaz.id);
    } catch (err) { toast(apiMessage(err, 'Poukaz se nepodařilo najít.')); }
    setHledam(false);
  };

  const exportuj = async () => {
    setExportuji(true);
    try {
      const u = new URLSearchParams({ export: 'csv' });
      if (hledej) u.set('q', hledej);
      if (stav) u.set('stav', stav);
      const r = await fetch(`/api/client/admin/vouchers?${u}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Export se nepovedl.');
      const v = await ulozSoubor('poukazy.csv', await r.text(), 'text/csv;charset=utf-8');
      if (v === 'nejde') toast(HLASKA_NEJDE_ULOZIT);
    } catch (err) { toast(apiMessage(err, 'Export se nepovedl.')); }
    setExportuji(false);
  };

  const stran = data ? Math.max(1, Math.ceil(data.celkem / data.naStranu)) : 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 items-start">
        {uplatni && (
          <Card as="form" className="space-y-3" onSubmit={najdiKod}>
            <h2 className="t-card">Uplatnit poukaz</h2>
            <p className="t-meta">Host ukáže kód z poukazu (DP-XXXX-XXXX) nebo QR. Zadej ho, uvidíš zůstatek a odečteš částku.</p>
            <Field id="pk-kod" label="Kód poukazu">
              <Input id="pk-kod" value={kod} onChange={e => setKod(formatujPriPsani(e.target.value))} placeholder="ABCD-2345" autoComplete="off" autoCapitalize="characters" className="font-mono tracking-widest uppercase" />
            </Field>
            <Button type="submit" variant="primary" icon="search" loading={hledam} disabled={!kod.trim()}>Najít poukaz</Button>
          </Card>
        )}
        {vidi && <Card pad="none" aria-labelledby="pk-nadpis" className={uplatni ? '' : 'lg:col-span-2'}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
            <div className="min-w-0">
              <h2 id="pk-nadpis" className="t-card">Dárkové poukazy</h2>
              {data && <p className="t-meta tabular-nums">{data.celkem} {data.celkem === 1 ? 'poukaz' : data.celkem >= 2 && data.celkem <= 4 ? 'poukazy' : 'poukazů'}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {spravuje && <Button size="sm" variant="secondary" icon="download" loading={exportuji} onClick={exportuj}>Export CSV</Button>}
              {spravuje && <Button size="sm" variant="secondary" icon="plus" onClick={() => setNovy(true)}>Nový poukaz</Button>}
            </div>
          </div>
          <div className="px-5 pt-3 space-y-3">
            <SearchField value={q} onChange={setQ} placeholder="Hledat kód, jméno nebo poznámku" ariaLabel="Hledat poukazy" storageKey="poukazy" />
            <div className="overflow-x-auto -mx-1 px-1">
              <Segmented options={FILTRY} value={stav} onChange={v => { setStav(v); setStrana(1); }} size="sm" ariaLabel="Stav poukazů" />
            </div>
          </div>
          {chyba ? (
            <div className="px-5 py-4"><ErrorState title="Poukazy se nenačetly" hint={chyba} onRetry={() => { void nacti(); }} compact /></div>
          ) : data === null ? (
            <div className="px-5 py-4 space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
          ) : data.poukazy.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState icon="gift" compact
              title={hledej || stav ? 'Nic takového nemáme' : 'Zatím žádný poukaz'}
              hint={hledej || stav ? 'Zkus jiné hledání nebo stav.' : spravuje ? 'Založ první: host dostane kód a QR, obsluha ho uplatní u kasy.' : 'Poukazy zakládá správce.'} /></div>
          ) : (
            <ul className="list px-5 mt-2">
              {data.poukazy.map(p => (
                <ListRow key={p.id} onClick={() => setDetailId(p.id)}
                  title={<span className="flex items-center gap-2 min-w-0"><span className="font-mono tracking-wider truncate">{p.code}</span><Chip tone={TON[p.stav]} size="sm">{STAV_POPISEK[p.stav]}</Chip></span>}
                  meta={[p.recipient_name, p.valid_until ? `do ${datumCesky(p.valid_until)}` : 'bez omezení platnosti', p.note].filter(Boolean).join(' · ')}
                  value={money(p.balance)} valueMeta={p.balance !== p.value_amount ? `z ${money(p.value_amount)}` : undefined} />
              ))}
            </ul>
          )}
          {data && stran > 1 && (
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <Button size="sm" variant="secondary" disabled={strana <= 1} onClick={() => setStrana(s => Math.max(1, s - 1))}>Předchozí</Button>
              <p className="t-meta tabular-nums">Strana {strana} z {stran}</p>
              <Button size="sm" variant="secondary" disabled={strana >= stran} onClick={() => setStrana(s => s + 1)}>Další</Button>
            </div>
          )}
          {data && stran <= 1 && <div className="pb-3" />}
        </Card>}
      </div>

      {novy && <NovyPoukaz toast={toast} onZavrit={() => setNovy(false)} onHotovo={r => { setNovy(false); setVytvorene(r); setStrana(1); void nacti(); }} />}
      {vytvorene && <Vytvorene poukazy={vytvorene} podnik={podnik} toast={toast} onZavrit={() => setVytvorene(null)} onOtevri={id => { setVytvorene(null); setDetailId(id); }} />}
      {detailId != null && <Detail id={detailId} podnik={podnik} toast={toast} spravuje={spravuje} uplatni={uplatni} onZavrit={() => { setDetailId(null); void nacti(); }} onZmena={() => { void nacti(); }} />}
    </div>
  );
}

// ---- Nový poukaz -------------------------------------------------------------------

function NovyPoukaz({ toast, onZavrit, onHotovo }: { toast: (m: string) => void; onZavrit: () => void; onHotovo: (p: PoukazRadek[]) => void }) {
  const symbol = useSymbol();
  const [hodnota, setHodnota] = useState('');
  const [pocet, setPocet] = useState('1');
  const [platnost, setPlatnost] = useState('');
  const [komu, setKomu] = useState('');
  const [kupujici, setKupujici] = useState('');
  const [poznamka, setPoznamka] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const dnes = pragueToday();
  const rok = (n: number) => { const d = new Date(`${dnes}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10); };
  const mesice = (n: number) => { const d = new Date(`${dnes}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

  const uloz = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = Number(hodnota), n = Number(pocet);
    if (!Number.isInteger(h) || h < 1) { setErr('Hodnota je celé číslo větší než nula.'); return; }
    if (!Number.isInteger(n) || n < 1 || n > MAX_DAVKA) { setErr(`Počet kusů je 1 až ${MAX_DAVKA}.`); return; }
    setBusy(true); setErr('');
    try {
      const d = await j('/api/client/admin/vouchers', { method: 'POST', body: JSON.stringify({ value: h, count: n, validUntil: platnost || null, recipient: komu, buyer: kupujici, note: poznamka }) });
      toast(n === 1 ? 'Poukaz založen.' : `Založeno: ${czCount(n, POUKAZ)}.`);
      onHotovo(d.poukazy);
    } catch (e2) { setErr(apiMessage(e2, 'Poukaz se nepodařilo založit.')); }
    setBusy(false);
  };

  return (
    <Modal open onClose={onZavrit} title="Nový poukaz" subtitle="Kód DP-XXXX-XXXX se vygeneruje sám a je jedinečný."
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button type="submit" form="pk-novy" variant="primary" loading={busy}>{Number(pocet) > 1 ? `Založit ${pocet} poukazů` : 'Založit poukaz'}</Button>
      </>}>
      <form id="pk-novy" onSubmit={uloz} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field id="pn-hodnota" label={`Hodnota (${symbol})`}><Input id="pn-hodnota" type="number" inputMode="numeric" min={1} max={1000000} step={1} value={hodnota} onChange={e => setHodnota(e.target.value)} placeholder="500" autoFocus /></Field>
          <Field id="pn-pocet" label="Počet kusů" hint={`Až ${MAX_DAVKA} najednou`}><Input id="pn-pocet" type="number" inputMode="numeric" min={1} max={MAX_DAVKA} step={1} value={pocet} onChange={e => setPocet(e.target.value)} /></Field>
        </div>
        <Field id="pn-platnost" label="Platí do" hint="Prázdné = bez omezení platnosti">
          <Input id="pn-platnost" type="date" min={dnes} value={platnost} onChange={e => setPlatnost(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[{ l: '+6 měsíců', v: mesice(6) }, { l: '+1 rok', v: rok(1) }, { l: '+2 roky', v: rok(2) }, { l: 'Bez omezení', v: '' }].map(o => (
            <button key={o.l} type="button" aria-pressed={platnost === o.v} onClick={() => setPlatnost(o.v)} className={`filter-pill tap-target-sm ${platnost === o.v ? 'seg-on' : 'seg-off glass'}`}>{o.l}</button>
          ))}
        </div>
        <Field id="pn-komu" label="Obdarovaný (nepovinné)"><Input id="pn-komu" value={komu} onChange={e => setKomu(e.target.value)} maxLength={80} placeholder="Jana Nováková" /></Field>
        <Field id="pn-kupujici" label="Kupující (nepovinné)"><Input id="pn-kupujici" value={kupujici} onChange={e => setKupujici(e.target.value)} maxLength={80} /></Field>
        <Field id="pn-poznamka" label="Poznámka (nepovinné)"><Textarea id="pn-poznamka" value={poznamka} onChange={e => setPoznamka(e.target.value)} maxLength={300} rows={2} placeholder="Třeba: zaplaceno převodem, k narozeninám" /></Field>
        {err && <p role="alert" className="note note-danger">{err}</p>}
      </form>
    </Modal>
  );
}

/** Po založení: kódy hned po ruce a tisk celé dávky. */
function Vytvorene({ poukazy, podnik, toast, onZavrit, onOtevri }: { poukazy: PoukazRadek[]; podnik: string; toast: (m: string) => void; onZavrit: () => void; onOtevri: (id: number) => void }) {
  const money = useMoney();
  const [tisk, setTisk] = useState(false);
  const tiskni = async () => {
    setTisk(true);
    try { if (!(await vytisknout(poukazy, podnik))) toast('Tiskové okno se nepustilo. Povol v prohlížeči vyskakovací okna a zkus to znovu.'); }
    catch { toast('Tisk se nepovedl.'); }
    setTisk(false);
  };
  return (
    <Modal open onClose={onZavrit} title={poukazy.length === 1 ? 'Poukaz je hotový' : `Hotovo: ${czCount(poukazy.length, POUKAZ)}`} subtitle="Kódy najdeš kdykoli v seznamu poukazů."
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zavřít</Button>
        <Button variant="primary" icon="print" loading={tisk} onClick={tiskni}>{poukazy.length === 1 ? 'Vytisknout poukaz' : 'Vytisknout všechny'}</Button>
      </>}>
      <ul className="list max-h-[50vh] overflow-y-auto">
        {poukazy.map(p => (
          <ListRow key={p.id} onClick={() => onOtevri(p.id)} title={<span className="font-mono tracking-wider">{p.code}</span>}
            meta={p.valid_until ? `platí do ${datumCesky(p.valid_until)}` : 'bez omezení platnosti'} value={money(p.value_amount)} />
        ))}
      </ul>
    </Modal>
  );
}

// ---- Detail ---------------------------------------------------------------------------

function Detail({ id, podnik, toast, spravuje, uplatni, onZavrit, onZmena }: {
  id: number; podnik: string; toast: (m: string) => void; spravuje: boolean; uplatni: boolean; onZavrit: () => void; onZmena: () => void;
}) {
  const money = useMoney();
  const symbol = useSymbol();
  const [p, setP] = useState<PoukazRadek | null>(null);
  const [hist, setHist] = useState<Pouziti[]>([]);
  const [chyba, setChyba] = useState<string | null>(null);
  const [castka, setCastka] = useState('');
  const [poznamkaUplatneni, setPoznamkaUplatneni] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [platnost, setPlatnost] = useState('');
  const [poznamka, setPoznamka] = useState('');
  const [rusim, setRusim] = useState(false);
  const [vracim, setVracim] = useState<Pouziti | null>(null);
  // Jedna záměrná akce = jedno ref: opakování po výpadku sítě se neodečte dvakrát.
  const ref = useRef<string | null>(null);
  const novyRef = () => (ref.current ??= (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(36).slice(2)}`));

  const nacti = useCallback(async () => {
    try {
      const d = await j(`/api/client/admin/vouchers?id=${id}`);
      setP(d.poukaz); setHist(d.historie ?? []); setChyba(null);
      setPlatnost(d.poukaz.valid_until ?? ''); setPoznamka(d.poukaz.note ?? '');
    } catch (e) { setChyba(apiMessage(e, 'Poukaz se nepodařilo načíst.')); }
  }, [id]);
  useEffect(() => { void nacti(); }, [nacti]);

  const uplatniCastku = async (hodnota: number) => {
    if (!p) return;
    setBusy('uplatnit'); setErr('');
    try {
      const d = await j('/api/client/admin/vouchers/redeem', { method: 'POST', body: JSON.stringify({ code: p.code, amount: hodnota, ref: novyRef(), note: poznamkaUplatneni }) });
      ref.current = null;
      toast(d.opakovani ? `Už uplatněno: ${money(d.castka)}.` : `Uplatněno ${money(d.castka)}. Zbývá ${money(d.poukaz.balance)}.`);
      setCastka(''); setPoznamkaUplatneni(''); await nacti(); onZmena();
    } catch (e: any) {
      // Odpověď serveru (4xx) uzavírá pokus; výpadek sítě ref nechá, ať opakování nic neodečte podruhé.
      if (e?.status && e.status < 500) ref.current = null;
      setErr(apiMessage(e, 'Poukaz se nepodařilo uplatnit.'));
    }
    setBusy('');
  };
  const patch = async (telo: object, hotovo: string, klic: string) => {
    setBusy(klic); setErr('');
    try { await j('/api/client/admin/vouchers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...telo }) }); toast(hotovo); await nacti(); onZmena(); }
    catch (e) { setErr(apiMessage(e, 'Změna se nepovedla.')); }
    setBusy('');
  };
  const tiskni = async () => {
    if (!p) return;
    setBusy('tisk');
    try { if (!(await vytisknout([p], podnik))) toast('Tiskové okno se nepustilo. Povol v prohlížeči vyskakovací okna a zkus to znovu.'); }
    catch { toast('Tisk se nepovedl.'); }
    setBusy('');
  };

  const mozeUplatnit = !!p && p.stav === 'active';
  const cislo = Number(castka);
  const castkaOk = Number.isInteger(cislo) && cislo >= 1 && !!p && cislo <= p.balance;

  return (
    <Modal open onClose={onZavrit} size="lg" title={p ? <span className="font-mono tracking-wider">{p.code}</span> : 'Poukaz'}>
      {chyba ? <ErrorState title="Poukaz se nenačetl" hint={chyba} onRetry={() => { void nacti(); }} compact />
        : !p ? <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-32" /></div>
        : (
          // data-transient: pole v detailu (částka, poznámka, platnost) se ukládají tlačítkem a okno zůstává otevřené;
          // hlídač rozepsaného (useModal) by po uložení dál hlásil „rozepsáno“ a při zavření se ptal zbytečně.
          <div className="space-y-4" data-transient>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1"><Chip tone={TON[p.stav]}>{STAV_POPISEK[p.stav]}</Chip>
                  <span className="t-meta">{p.valid_until ? `platí do ${datumCesky(p.valid_until)}` : 'bez omezení platnosti'}</span></div>
                <p className="text-3xl font-bold tabular-nums leading-tight">{money(p.balance)}</p>
                <p className="t-meta tabular-nums">z {money(p.value_amount)}{p.recipient_name ? ` · pro ${p.recipient_name}` : ''}{p.buyer_name ? ` · kupuje ${p.buyer_name}` : ''}</p>
              </div>
              {spravuje && <Button size="sm" variant="secondary" icon="print" loading={busy === 'tisk'} onClick={tiskni}>Vytisknout poukaz</Button>}
            </div>

            {uplatni && (
              <Well pad="md" as="div">
                <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (castkaOk) void uplatniCastku(cislo); }}>
                <p className="t-label">Uplatnit částku</p>
                {mozeUplatnit ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input aria-label={`Částka k uplatnění v ${symbol}`} type="number" inputMode="numeric" min={1} max={p.balance} step={1} value={castka}
                        onChange={e => { setCastka(e.target.value); ref.current = null; }} placeholder={`Max ${p.balance}`} className="!w-36 text-center" />
                      <Button type="submit" variant="primary" icon="check" loading={busy === 'uplatnit'} disabled={!castkaOk}>Uplatnit</Button>
                      <Button type="button" variant="secondary" disabled={busy === 'uplatnit'} onClick={() => { setCastka(String(p.balance)); ref.current = null; void uplatniCastku(p.balance); }}>Celý zůstatek ({money(p.balance)})</Button>
                    </div>
                    <Input aria-label="Poznámka k uplatnění" value={poznamkaUplatneni} onChange={e => setPoznamkaUplatneni(e.target.value)} maxLength={200} placeholder="Poznámka (třeba číslo účtenky)" />
                  </>
                ) : <p className="t-meta">{p.stav === 'expired' ? 'Platnost poukazu skončila. Správce ji může prodloužit.' : p.stav === 'used' ? 'Poukaz je vyčerpaný.' : 'Poukaz je zrušený.'}</p>}
                </form>
              </Well>
            )}
            {err && <p role="alert" className="note note-danger">{err}</p>}

            {spravuje && p.stav !== 'void' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Field id="pd-platnost" label="Platí do" hint="Prázdné = bez omezení">
                    <Input id="pd-platnost" type="date" min={pragueToday()} value={platnost} onChange={e => setPlatnost(e.target.value)} />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" loading={busy === 'platnost'} disabled={platnost === (p.valid_until ?? '')}
                      onClick={() => patch({ validUntil: platnost || null }, 'Platnost uložena.', 'platnost')}>Uložit platnost</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPlatnost(dayPlus(p.valid_until && p.valid_until > pragueToday() ? p.valid_until : pragueToday(), 365))}>+1 rok</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Field id="pd-poznamka" label="Poznámka"><Textarea id="pd-poznamka" value={poznamka} onChange={e => setPoznamka(e.target.value)} maxLength={300} rows={2} /></Field>
                  <Button size="sm" variant="secondary" loading={busy === 'poznamka'} disabled={poznamka === (p.note ?? '')} onClick={() => patch({ note: poznamka }, 'Poznámka uložena.', 'poznamka')}>Uložit poznámku</Button>
                </div>
              </div>
            )}
            {!spravuje && p.note && <p className="t-meta">{p.note}</p>}

            <div>
              <p className="t-label mb-1">Historie</p>
              {hist.length === 0 ? <p className="t-meta">Zatím se nic neuplatnilo.</p> : (
                <ul className="list">
                  {hist.map(h => (
                    <ListRow key={h.id} title={DRUH_POPISEK[h.kind] ?? h.kind}
                      meta={[dbTimeDayHM(h.created_at), h.by_name, h.note].filter(Boolean).join(' · ')}
                      value={`${h.kind === 'use' || h.kind === 'void' ? '−' : '+'}${money(h.amount)}`} valueMeta={h.balance_after != null ? `zbývá ${money(h.balance_after)}` : undefined}
                      actions={spravuje && h.kind === 'use' && p.stav !== 'void' ? <Button size="sm" variant="ghost" onClick={() => setVracim(h)}>Vrátit</Button> : undefined} />
                  ))}
                </ul>
              )}
            </div>

            {spravuje && p.stav !== 'void' && (
              <div className="pt-1"><Button size="sm" variant="danger" icon="trash" onClick={() => setRusim(true)}>Zrušit poukaz…</Button></div>
            )}
          </div>
        )}

      {rusim && p && (
        <Modal open onClose={() => setRusim(false)} size="sm" title="Zrušit poukaz?"
          footer={<>
            <Button variant="secondary" onClick={() => setRusim(false)}>Ponechat</Button>
            <Button variant="danger-solid" onClick={() => { setRusim(false); void patch({ action: 'void' }, 'Poukaz zrušen.', 'zrusit'); }}>Zrušit poukaz</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Poukaz {p.code} přestane platit a zbývajících {money(p.balance)} propadne. Vrátit se to nedá, jen založit nový poukaz.</p>
        </Modal>
      )}
      {vracim && p && (
        <Modal open onClose={() => setVracim(null)} size="sm" title="Vrátit uplatněnou částku?"
          footer={<>
            <Button variant="secondary" onClick={() => setVracim(null)}>Ne</Button>
            <Button variant="primary" onClick={() => { const v = vracim; setVracim(null); void patch({ action: 'refund', amount: v.amount, note: 'Storno uplatnění' }, `Vráceno ${money(v.amount)}.`, 'vratit'); }}>Vrátit {money(vracim.amount)}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Použij při omylu: částka se vrátí na poukaz a zapíše do historie. Zůstatek nikdy nepřeroste původní hodnotu.</p>
        </Modal>
      )}
    </Modal>
  );
}
