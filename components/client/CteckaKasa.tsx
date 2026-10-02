'use client';

// Čtečka u kasy. Hardwarová čtečka QR a čárových kódů (USB, Bluetooth) se tváří
// jako klávesnice: napíše kód a Enter nebo Tab. Tahle obrazovka ten kód zachytí
// odkudkoli na stránce, pozná druh (karta hosta, kupon, poukaz) a rovnou ho načte.
//
// Po načtení hosta je na jedné obrazovce VŠE aktivní: úroveň a sleva, body a kredit,
// rozdělané razítkové karty, kupony k uplatnění, kupony za body i poslední návštěva.
// Po akci krátké potvrzení a návrat na „Čekám na další kartu" (nastavitelné).
//
// Čistá logika (rozpoznání kódu, dvojitý sken, rychlost psaní) je v lib/ctecka.ts.
// Karta se čte i zapisuje stejnými routami jako Kartička hosta (CardScan):
// /api/client/staff/scan a /api/client/admin/redeem.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Chip, Input, ListRow, Segmented, Well } from '../ui';
import { useOpravneni } from '../role/useOpravneni';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { czCount, type CzNoun } from '@/lib/czech';
import { ApiError, okJson, apiMessage, isOffline } from '@/lib/api';
import {
  rozpoznejKod, ocistiVstupCtecky, jeDvojitySken, psalaCtecka, pridejDoHistorie, navratSekundy, navratPopisek,
  poslediNavsteva, NAVRAT_MOZNOSTI, type ZaznamHistorie,
} from '@/lib/ctecka';
import { formatujPriPsani } from '@/lib/poukazy';
import { useKlicAkce, hlavickyAkce, UpozorneniRazitek, RazitkoKarty, RucniPolozky, StornoRazitek } from './loyalty/RazitkaKasa';

const NAVSTEVA: CzNoun = { one: 'návštěva', few: 'návštěvy', many: 'návštěv' };
const RAZITKO: CzNoun = { one: 'razítko', few: 'razítka', many: 'razítek' };
const KLIC_NAVRAT = 'managero-ctecka-navrat';
const KLIC_ZVUK = 'managero-ctecka-zvuk';
/** Mezera mezi znaky, po které se rozepsaný kód zahodí jako zbytek. */
const ZAPOMEN_PO_MS = 1500;
/** Čtečka bez Enteru na konci: po této pauze se rozpoznaný kód odešle sám. */
const PAUZA_BEZ_ENTERU_MS = 160;

type Faze =
  | { druh: 'ceka' }
  | { druh: 'nacitam'; popis: string }
  | { druh: 'chyba'; text: string }
  | { druh: 'host'; kod: string; data: any }
  | { druh: 'kupon'; data: any }
  | { druh: 'poukaz'; data: any };

const cist = (klic: string): string | null => { try { return localStorage.getItem(klic); } catch { return null; } };
const psat = (klic: string, v: string) => { try { localStorage.setItem(klic, v); } catch { /* soukromé okno */ } };

const dvou = (n: number) => String(n).padStart(2, '0');
/** Čas načtení na hodinách zařízení (ne z databáze): 14:05:09. */
const casZaznamu = (ms: number) => { const d = new Date(ms); return `${dvou(d.getHours())}:${dvou(d.getMinutes())}:${dvou(d.getSeconds())}`; };

/** Pole, do kterého se píše rukou (ne naše skryté pole čtečky). */
const jeRucniPole = (el: Element | null, skryte: Element | null): boolean =>
  !!el && el !== skryte && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);

export default function CteckaKasa() {
  const money = useMoney();
  const symbol = useSymbol();
  const op = useOpravneni();
  const smiKartu = op.ma('vernost.karta');
  const smiBody = op.ma('vernost.body_z_castky');
  const smiKredit = op.ma('vernost.platba_kreditem');
  const smiKupon = op.ma('kupony.uplatnit');
  const smiPoukaz = op.ma('poukazy.uplatnit');

  const [faze, setFaze] = useState<Faze>({ druh: 'ceka' });
  const [potvrzeni, setPotvrzeni] = useState<{ text: string; ok: boolean } | null>(null);
  const [historie, setHistorie] = useState<ZaznamHistorie[]>([]);
  const [busy, setBusy] = useState('');
  const [castka, setCastka] = useState('');
  const [poukazCastka, setPoukazCastka] = useState('');
  const [rucne, setRucne] = useState('');
  const [navrat, setNavrat] = useState(8);
  const [zvuk, setZvuk] = useState(true);
  const [zustat, setZustat] = useState(false);
  const [zbyva, setZbyva] = useState<number | null>(null);
  const [aktivni, setAktivni] = useState(true);
  const [offline, setOffline] = useState(false);
  const [mene, setMene] = useState(false);

  const pole = useRef<HTMLInputElement>(null);
  const buf = useRef({ text: '', casy: [] as number[], posledni: 0, rucniPole: false });
  const posledniSken = useRef<{ kod: string; cas: number } | null>(null);
  const bezi = useRef(false);
  const fronta = useRef<string | null>(null);
  const idHistorie = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const poukazRef = useRef<string | null>(null);
  const klicAkce = useKlicAkce();
  const [upoz, setUpoz] = useState<{ expiredCount?: number; lost?: number } | null>(null);
  const zvukRef = useRef(true);
  zvukRef.current = zvuk;

  // Uložená nastavení a „méně pohybu" až po hydrataci (server o nich neví).
  useEffect(() => {
    setNavrat(navratSekundy(cist(KLIC_NAVRAT)));
    setZvuk(cist(KLIC_ZVUK) !== '0');
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const zjisti = () => setMene(mq.matches);
    zjisti();
    mq.addEventListener?.('change', zjisti);
    setOffline(!navigator.onLine);
    return () => mq.removeEventListener?.('change', zjisti);
  }, []);

  /** Jemné pípnutí: výš a krátce = hotovo, níž a delší = chyba. Bez zvuku, když je vypnutý. */
  const pipni = useCallback((ok: boolean) => {
    if (!zvukRef.current) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      audio.current ??= new AC();
      const c = audio.current!;
      if (c.state === 'suspended') void c.resume();
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'sine'; o.frequency.value = ok ? 880 : 220;
      const t = c.currentTime; const dl = ok ? 0.12 : 0.28;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dl);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dl + 0.02);
    } catch { /* zvuk je bonus, nikdy chyba */ }
  }, []);

  const zapis = (popis: string, ok: boolean, kod?: string) =>
    setHistorie(h => pridejDoHistorie(h, { id: ++idHistorie.current, cas: Date.now(), popis, ok, kod }));

  const ohlas = (text: string, ok: boolean) => { setPotvrzeni({ text, ok }); pipni(ok); };

  /** Zpět na „Čekám na další kartu". */
  const dalsi = useCallback(() => {
    setFaze({ druh: 'ceka' }); setPotvrzeni(null); setUpoz(null); setCastka(''); setPoukazCastka(''); setZustat(false); setZbyva(null); poukazRef.current = null;
    posledniSken.current = null;
    setTimeout(() => pole.current?.focus({ preventScroll: true }), 0);
  }, []);

  // Odpočet po úspěšné akci. Chyba návrat nespouští: obsluha ji má přečíst.
  useEffect(() => {
    if (!potvrzeni?.ok || zustat || navrat <= 0) { setZbyva(null); return; }
    setZbyva(navrat);
    const t = setInterval(() => setZbyva(z => (z == null ? z : z - 1)), 1000);
    return () => clearInterval(t);
  }, [potvrzeni, zustat, navrat]);
  useEffect(() => { if (zbyva === 0) dalsi(); }, [zbyva, dalsi]);

  const chyba = (e: unknown, kodCoMa: string): string => {
    if (e instanceof ApiError && e.status === 404 && kodCoMa === 'karta') return 'Takovou kartičku neznáme.';
    if (e instanceof ApiError && e.status === 403) return e.message;
    return isOffline(e) ? 'Bez připojení. Zkus to znovu, až bude síť.' : apiMessage(e, 'Nepovedlo se.');
  };

  /** Načte jeden kód ze čtečky (nebo z ručního pole): rozpozná druh a podle něj zavolá API. */
  const nacti = async (raw: string) => {
    const r = rozpoznejKod(raw);
    if (r.typ === 'prazdny') return;
    const klic = r.typ === 'cizi' ? 'x:' + ocistiVstupCtecky(raw).toUpperCase() : r.kod;
    const ted = Date.now();
    // Dvojitý sken téhož kódu do 2 s se zahodí (čtečka často čte dvakrát, host drží kartu u čtečky).
    if (jeDvojitySken(posledniSken.current, klic, ted)) return;
    posledniSken.current = { kod: klic, cas: ted };
    // Souběh: dokud běží dotaz, další kód čeká (jen poslední); stará odpověď tak nepřepíše novější.
    if (bezi.current) { fronta.current = raw; return; }
    bezi.current = true;
    setPotvrzeni(null); setZustat(false); setCastka(''); setPoukazCastka(''); poukazRef.current = null;
    try {
      if (r.typ === 'cizi') {
        const text = /^[A-Za-z0-9 -]+$/.test(ocistiVstupCtecky(raw)) ? 'Kód kartičky má osm znaků, kód kuponu šest.' : 'Tohle není QR z Managera (kartička, kupon ani poukaz).';
        setFaze({ druh: 'chyba', text }); zapis(text, false); pipni(false);
      } else if (r.typ === 'karta') {
        if (!smiKartu) { const t = 'Pracovat s kartičkou hosta nemáš povoleno.'; setFaze({ druh: 'chyba', text: t }); zapis(t, false); pipni(false); }
        else {
          setFaze({ druh: 'nacitam', popis: 'Načítám kartičku' });
          try {
            const d = await fetch(`/api/client/staff/scan?code=${encodeURIComponent(r.kod)}`).then(okJson);
            setFaze({ druh: 'host', kod: r.kod, data: d }); zapis(d.customer?.name ?? r.kod, true, r.kod); pipni(true);
          } catch (e) { const t = chyba(e, 'karta'); setFaze({ druh: 'chyba', text: t }); zapis(t, false); pipni(false); }
        }
      } else if (r.typ === 'kupon') {
        if (!smiKupon) { const t = 'Uplatňovat kupony nemáš povoleno.'; setFaze({ druh: 'chyba', text: t }); zapis(t, false); pipni(false); }
        else {
          setFaze({ druh: 'nacitam', popis: 'Načítám kupon' });
          try {
            const d = await fetch('/api/client/admin/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: r.kod, preview: true }) }).then(okJson);
            setFaze({ druh: 'kupon', data: d }); zapis(`Kupon ${d.title}`, true, r.kod); pipni(!d.problem);
          } catch (e) { const t = chyba(e, 'kupon'); setFaze({ druh: 'chyba', text: t }); zapis(t, false); pipni(false); }
        }
      } else {
        if (!smiPoukaz) { const t = 'Uplatňovat poukazy nemáš povoleno.'; setFaze({ druh: 'chyba', text: t }); zapis(t, false); pipni(false); }
        else {
          setFaze({ druh: 'nacitam', popis: 'Načítám poukaz' });
          try {
            const d = await fetch(`/api/client/admin/vouchers/redeem?code=${encodeURIComponent(r.kod)}`).then(okJson);
            setFaze({ druh: 'poukaz', data: d.poukaz }); zapis(`Poukaz ${r.kod}`, true, r.kod); pipni(true);
          } catch (e) { const t = chyba(e, 'poukaz'); setFaze({ druh: 'chyba', text: t }); zapis(t, false); pipni(false); }
        }
      }
    } finally {
      bezi.current = false;
      const dalsiKod = fronta.current; fronta.current = null;
      if (dalsiKod) { posledniSken.current = null; void nactiRef.current(dalsiKod); }
    }
  };
  const nactiRef = useRef(nacti);
  nactiRef.current = nacti;

  // ---- Zachytávání čtečky: jedna cesta pro skryté pole, tlačítka i volnou plochu ----
  useEffect(() => {
    const skryte = () => pole.current;
    let casovac: ReturnType<typeof setTimeout> | undefined;
    const vymaz = () => { buf.current = { text: '', casy: [], posledni: 0, rucniPole: false }; };
    const odesli = (text: string) => { vymaz(); void nactiRef.current(text); };
    const pridej = (znak: string, rucni: boolean) => {
      const ted = Date.now(); const b = buf.current;
      if (b.posledni && ted - b.posledni > ZAPOMEN_PO_MS) vymaz();
      const bb = buf.current;
      bb.text += znak; bb.casy.push(ted); bb.posledni = ted; bb.rucniPole = rucni;
      clearTimeout(casovac);
      // Čtečka bez Enteru na konci: rozpoznaný kód po krátké pauze odešleme. Ručně psané pole se neřeší.
      if (!rucni) casovac = setTimeout(() => {
        const t = buf.current;
        if (t.text.length >= 6 && psalaCtecka(t.casy) && rozpoznejKod(t.text).typ !== 'cizi') odesli(t.text);
      }, PAUZA_BEZ_ENTERU_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const cil = e.target as Element | null;
      const rucni = jeRucniPole(cil, skryte());
      if (e.key.length === 1) {
        // Mimo ruční pole se znak vezme sem (Enter na zaostřeném tlačítku by jinak „klikl" místo odeslání kódu).
        if (!rucni) e.preventDefault();
        pridej(e.key, rucni);
        return;
      }
      if (e.key !== 'Enter' && e.key !== 'Tab') return;
      const b = buf.current;
      if (!b.text) return;
      if (rucni) {
        // V ručním poli smí Enter odeslat formulář, ale rychlý příval znaků je čtečka: vrátíme poli původní text.
        if (b.text.length >= 6 && psalaCtecka(b.casy)) {
          e.preventDefault();
          const el = cil as HTMLInputElement;
          const cim = b.text;
          if (typeof el.value === 'string' && el.value.endsWith(cim)) {
            const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            set?.call(el, el.value.slice(0, el.value.length - cim.length));
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          odesli(cim);
        } else vymaz();
        return;
      }
      e.preventDefault();
      odesli(b.text);
    };
    window.addEventListener('keydown', onKey, true);

    // Zaostření se vrací: po ztrátě do „nikam", po klepnutí na tlačítko i po návratu do okna.
    const fokus = () => {
      const el = skryte(); const a = document.activeElement;
      if (el && a !== el && (!a || a === document.body || !jeRucniPole(a, el))) el.focus({ preventScroll: true });
    };
    const poZtrate = (e: FocusEvent) => { if (!e.relatedTarget) setTimeout(fokus, 0); };
    const poKlepnuti = () => setTimeout(fokus, 0);
    const naOknoZpet = () => { setAktivni(true); fokus(); };
    const naOknoPryc = () => setAktivni(false);
    const naViditelnost = () => { if (document.visibilityState === 'visible') naOknoZpet(); else naOknoPryc(); };
    const zapni = () => setOffline(false); const vypni = () => setOffline(true);
    const stav = () => setAktivni(document.hasFocus());
    document.addEventListener('focusout', poZtrate);
    document.addEventListener('click', poKlepnuti);
    window.addEventListener('focus', naOknoZpet);
    window.addEventListener('blur', naOknoPryc);
    document.addEventListener('visibilitychange', naViditelnost);
    window.addEventListener('online', zapni); window.addEventListener('offline', vypni);
    const iv = setInterval(() => { fokus(); stav(); }, 1500);
    fokus(); stav();
    return () => {
      clearTimeout(casovac); clearInterval(iv);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusout', poZtrate);
      document.removeEventListener('click', poKlepnuti);
      window.removeEventListener('focus', naOknoZpet);
      window.removeEventListener('blur', naOknoPryc);
      document.removeEventListener('visibilitychange', naViditelnost);
      window.removeEventListener('online', zapni); window.removeEventListener('offline', vypni);
    };
  }, []);

  /** Rezerva pro klávesnice, které neposílají `key` (Android, IME): znaky přijdou jen jako vstup do pole. */
  const poVstupu = (e: React.FormEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    e.currentTarget.value = '';
    if (!v) return;
    const ted = Date.now(); const b = buf.current;
    for (const z of v) { b.text += z; b.casy.push(ted); }
    b.posledni = ted;
    if (rozpoznejKod(b.text).typ !== 'cizi') { const t = b.text; buf.current = { text: '', casy: [], posledni: 0, rucniPole: false }; void nactiRef.current(t); }
  };

  // ---- Akce u hosta ----
  const akce = async (action: 'stamp' | 'points' | 'credit' | 'bill' | 'join' | 'storno' | 'items', extra: { amount?: number; billId?: string; items?: { itemId: number; qty: number }[] } = {}) => {
    if (faze.druh !== 'host') return;
    const kod = faze.kod;
    setBusy(action + (extra.billId ?? ''));
    // Idempotency-Key: stejná akce při opakování po výpadku sítě = stejný klíč, server ji připíše jednou.
    const telo = { code: kod, action, amount: extra.amount ?? 0, billId: extra.billId, items: extra.items };
    const klic = klicAkce.klic(JSON.stringify(telo));
    try {
      const x = await fetch('/api/client/staff/scan', { method: 'POST', headers: hlavickyAkce(klic), body: JSON.stringify(telo) }).then(okJson);
      klicAkce.hotovo();
      setFaze(f => f.druh === 'host' && f.kod === kod ? { ...f, data: { ...f.data, ...x, bills: extra.billId ? (f.data.bills ?? []).filter((b: any) => b.bill_id !== extra.billId) : f.data.bills } } : f);
      setCastka('');
      // Vypršelá karta a razítka, která se nevešla, zůstávají vidět i po návratu na „Čekám“ (do dalšího hosta).
      setUpoz({ expiredCount: x.expiredCount, lost: x.lost });
      ohlas(x.message, true); zapis(x.message, true, kod);
    } catch (e) {
      klicAkce.pochybe(e instanceof ApiError ? e.status : null);
      ohlas(chyba(e, 'karta'), false);
    }
    setBusy('');
  };
  const uplatniKupon = async (kod: string, jenPoukazanyKupon = false) => {
    setBusy('kupon:' + kod);
    try {
      const x = await fetch('/api/client/admin/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: kod }) }).then(okJson);
      const text = `Uplatněno: ${x.title}${x.benefit ? ` (${x.benefit})` : ''}.${x.badges?.length ? ` Zkontroluj: ${x.badges.join(', ')}.` : ''}`;
      if (jenPoukazanyKupon) setFaze({ druh: 'ceka' });
      else setFaze(f => f.druh === 'host' ? { ...f, data: { ...f.data, openCoupons: (f.data.openCoupons ?? []).filter((c: any) => c.code !== kod) } } : f);
      ohlas(text, true); zapis(text, true);
    } catch (e) { ohlas(chyba(e, 'kupon'), false); }
    setBusy('');
  };
  const uplatniPoukaz = async (hodnota: number) => {
    if (faze.druh !== 'poukaz') return;
    const p = faze.data;
    setBusy('poukaz');
    try {
      poukazRef.current ??= (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(36).slice(2)}`);
      const x = await fetch('/api/client/admin/vouchers/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: p.code, amount: hodnota, ref: poukazRef.current }) }).then(okJson);
      poukazRef.current = null;
      setFaze({ druh: 'poukaz', data: x.poukaz }); setPoukazCastka('');
      const text = x.opakovani ? `Už uplatněno: ${money(x.castka)}.` : `Uplatněno ${money(x.castka)}. Na poukazu zbývá ${money(x.poukaz.balance)}.`;
      ohlas(text, true); zapis(text, true);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status < 500) poukazRef.current = null;
      ohlas(chyba(e, 'poukaz'), false);
    }
    setBusy('');
  };

  const nastavNavrat = (v: string) => { const s = navratSekundy(v); setNavrat(s); psat(KLIC_NAVRAT, String(s)); };
  const prepniZvuk = () => { const v = !zvuk; setZvuk(v); psat(KLIC_ZVUK, v ? '1' : '0'); if (v) pipni(true); };

  const stav = offline ? { tone: 'bad' as const, text: 'Bez připojení' }
    : !aktivni ? { tone: 'wait' as const, text: 'Čtečka neposlouchá, klepni do okna' }
    : { tone: 'ok' as const, text: 'Čtečka připravena' };

  const h = faze.druh === 'host' ? faze.data : null;
  const rucneRozpoznano = rozpoznejKod(rucne).typ;
  const cislo = Number(castka);
  const poukazOk = faze.druh === 'poukaz' && Number.isInteger(Number(poukazCastka)) && Number(poukazCastka) >= 1 && Number(poukazCastka) <= faze.data.balance;

  return (
    <div className="space-y-3 min-w-0" data-testid="ctecka">
      {/* Skryté pole čtečky: vždy zaostřené, nikdy nevidět. `fixed`, ať nenafoukne dokument. */}
      <input ref={pole} type="text" aria-label="Pole čtečky kódů" autoFocus autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="none"
        tabIndex={-1} onInput={poVstupu} data-testid="ctecka-pole"
        className="fixed left-0 top-0 h-px w-px opacity-0 pointer-events-none" />

      <div className="flex items-center gap-2 flex-wrap">
        <Chip tone={stav.tone} size="sm" icon={offline ? 'warning' : 'card'}><span data-testid="ctecka-stav">{stav.text}</span></Chip>
        <Button size="sm" variant="ghost" aria-pressed={zvuk} onClick={prepniZvuk} icon={zvuk ? 'bell' : 'close'} className="sm:ml-auto">{zvuk ? 'Zvuk zapnutý' : 'Zvuk vypnutý'}</Button>
      </div>

      {/* Potvrzení po akci a odpočet návratu. Živá oblast, ať ji odečítač přečte. */}
      <div role={potvrzeni && !potvrzeni.ok ? 'alert' : 'status'} aria-live="polite">
        {potvrzeni && (
          <div className={`note ${potvrzeni.ok ? 'note-ok' : 'note-danger'} space-y-2`} data-testid="ctecka-potvrzeni">
            <p className="font-semibold break-words">{potvrzeni.text}</p>
            {potvrzeni.ok && zbyva != null && (
              <div className="space-y-1.5">
                <p className="text-[13px]">Čekám na další kartu za {zbyva} s.</p>
                <div className="h-1 rounded-full bg-black/10 overflow-hidden" aria-hidden>
                  <div className="h-full bg-[#16181A]/60 rounded-full" style={{ width: `${Math.max(0, Math.min(100, (zbyva / navrat) * 100))}%`, transition: mene ? 'none' : 'width 1s linear' }} />
                </div>
              </div>
            )}
            {potvrzeni.ok && (
              <div className="flex gap-2 flex-wrap">
                {zbyva != null && <Button size="lg" variant="secondary" onClick={() => setZustat(true)}>Zůstat u hosta</Button>}
                <Button size="lg" variant="primary" onClick={dalsi}>Další karta</Button>
              </div>
            )}
          </div>
        )}
        {potvrzeni?.ok && <UpozorneniRazitek expiredCount={upoz?.expiredCount} lost={upoz?.lost} />}
      </div>

      <Well pad="md" as="div" className="space-y-4" aria-label="Načtený kód" role="group">
        {faze.druh === 'ceka' && (
          <div className="text-center py-6 space-y-2" data-testid="ctecka-ceka">
            <Icon name="card" size={36} className="mx-auto text-black/30" />
            <p className="text-lg font-semibold">Čekám na další kartu</p>
            <p className="t-meta">Přilož ke čtečce kartičku hosta, kupon nebo poukaz. Čtečka se musí tvářit jako klávesnice a na konci poslat Enter. Nastav jí anglické rozložení, ať se číslice přečtou správně.</p>
          </div>
        )}
        {faze.druh === 'nacitam' && <p className="text-center py-6 t-meta" role="status">{faze.popis}…</p>}
        {faze.druh === 'chyba' && (
          <div className="space-y-3" data-testid="ctecka-chyba">
            <p role="alert" className="note note-danger font-semibold break-words">{faze.text}</p>
            <Button size="lg" variant="primary" onClick={dalsi}>Čekám na další kartu</Button>
          </div>
        )}

        {faze.druh === 'host' && h && (
          <div className="space-y-4" data-testid="ctecka-host">
            <div className="min-w-0">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-bold leading-tight break-words text-[#16181A]">{h.customer.name}</p>
                  <p className="t-meta tabular-nums mt-0.5">
                    {h.member ? `${h.points} b. · ${czCount(h.visits, NAVSTEVA)} · naposledy ${poslediNavsteva(h.lastVisit)}` : 'Ještě není členem tohoto podniku.'}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={dalsi}>Jiný host</Button>
              </div>
              {h.member && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {h.levelLabel && <Chip tone={h.tier === 'silver' ? 'muted' : 'ink'} size="sm">{h.levelLabel}</Chip>}
                  {h.discount > 0 && <Chip tone="ok" size="sm">Sleva {h.discount} %{h.discountSource === 'skupina' && h.discountName ? ` (${h.discountName})` : h.discountSource === 'uroven' ? ' (úroveň)' : ''}</Chip>}
                  {h.credit > 0 && <Chip tone="ok" size="sm" icon="card">Kredit {money(h.credit)}</Chip>}
                  {h.birthdayToday && <Chip tone="info" size="sm" icon="gift">Má dnes narozeniny</Chip>}
                  {h.stampedToday && <Chip tone="muted" size="sm" icon="check">Dnes už razítko</Chip>}
                </div>
              )}
            </div>

            {!h.member && (
              <div className="space-y-2">
                <p className="note note-wait">Host není členem tohoto podniku. Přidej ho jedním klepnutím, nebo mu rovnou dej razítko.</p>
                <Button size="lg" variant="primary" icon="plus" block loading={busy === 'join'} onClick={() => akce('join')}>Přidat jako člena</Button>
              </div>
            )}

            {/* Nejčastější akce nahoře: razítko, účtenky, body z částky. */}
            <div className="space-y-2">
              <Button size="lg" variant="primary" icon="check" block loading={busy === 'stamp'}
                disabled={h.stampedToday || (!h.rules?.stampTarget && !h.campaigns?.some((c: any) => c.ruleType === 'visit')) || (h.campaigns?.some((c: any) => c.ruleType === 'visit') && !h.campaigns.some((c: any) => c.ruleType === 'visit' && c.platiTed !== false))}
                onClick={() => akce('stamp')}>
                {h.stampedToday ? 'Dnes razítko už má' : 'Razítko za návštěvu'}
              </Button>
              {h.bills?.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {h.bills.map((bl: any) => (
                    <Button key={bl.bill_id} size="lg" variant="secondary" icon="receipt" loading={busy === 'bill' + bl.bill_id} disabled={bl.awarded} onClick={() => akce('bill', { billId: bl.bill_id })}>
                      {bl.awarded ? `Účtenka ${money(Math.round(Number(bl.final_price)))} už je připsaná` : `Připsat z účtenky ${money(Math.round(Number(bl.final_price)))}`}
                    </Button>
                  ))}
                </div>
              )}
              {smiBody && (h.rules?.pointsPer100 > 0 || h.campaigns?.some((c: any) => c.ruleType === 'min_value')) && (
                <form onSubmit={e => { e.preventDefault(); if (cislo > 0) void akce('points', { amount: cislo }); }} className="flex gap-2">
                  <Input aria-label={`Útrata v ${symbol}`} type="number" inputMode="numeric" min={0} step={1} value={castka} onChange={e => setCastka(e.target.value)} placeholder={`Útrata ${symbol}`} className="!w-36 text-center !h-12" />
                  <Button type="submit" size="lg" variant="secondary" loading={busy === 'points'} disabled={!(cislo > 0)}>Body z částky</Button>
                </form>
              )}
              {smiKredit && h.credit > 0 && (
                <form onSubmit={e => { e.preventDefault(); if (cislo >= 1) void akce('credit', { amount: cislo }); }} className="flex gap-2">
                  <Input aria-label="Kolik kreditu uplatnit" type="number" inputMode="numeric" min={1} max={h.credit} value={castka} onChange={e => setCastka(e.target.value)} placeholder={`Max ${h.credit}`} className="!w-36 text-center !h-12" />
                  <Button type="submit" size="lg" variant="secondary" icon="card" loading={busy === 'credit'} disabled={!(cislo >= 1)}>Uplatnit kredit</Button>
                </form>
              )}
            </div>

            {h.openCoupons?.length > 0 && (
              <div>
                <p className="t-label mb-1">Kupony k uplatnění</p>
                <ul className="list">
                  {h.openCoupons.map((c: any) => (
                    <ListRow key={c.code} title={c.title}
                      meta={<>{c.fromStamps ? 'Odměna za plnou kartu' : c.benefit}{c.validUntil ? ` · platí do ${c.validUntil}` : ''} · <span className="font-mono">{c.code}</span></>}
                      actions={<Button size="lg" variant="secondary" loading={busy === 'kupon:' + c.code} disabled={!smiKupon} onClick={() => uplatniKupon(c.code)}>Uplatnit</Button>} />
                  ))}
                </ul>
              </div>
            )}

            <RazitkoKarty campaigns={h.campaigns ?? []} />
            {h.member && (
              <>
                <RucniPolozky polozky={h.polozky ?? []} busy={busy === 'items'} onPripsat={items => akce('items', { items })} />
                <StornoRazitek posledni={h.posledniAkce ?? null} busy={busy === 'storno'} onStorno={() => akce('storno')} />
              </>
            )}
            {!h.campaigns?.length && h.member && h.rules?.stampTarget > 0 && (
              <p className="t-meta tabular-nums">Razítka {h.stamps}/{h.rules.stampTarget}{h.rules.stampReward ? ` do odměny „${h.rules.stampReward}"` : ''}.</p>
            )}

            {h.affordable?.length > 0 && (
              <div>
                <p className="t-label mb-1">Za body teď dosáhne na</p>
                <ul className="list">
                  {h.affordable.map((a: any) => <ListRow key={a.id} title={a.title} value={`${a.cost_points} b.`} />)}
                </ul>
                <p className="t-meta mt-1">Kupon si vezme sám na své stránce, pak ho uvidíš tady.</p>
              </div>
            )}
            {h.member && h.nextTierAt && (
              <p className="t-meta">Do úrovně „{h.nextTierLabel}" ještě {h.nextTierUnit === 'spend' ? money(Math.max(0, h.nextTierAt - (h.spend ?? 0))) : czCount(Math.max(0, h.nextTierAt - h.visits), NAVSTEVA)}.</p>
            )}
          </div>
        )}

        {faze.druh === 'kupon' && (
          <div className="space-y-3" data-testid="ctecka-kupon">
            <div className="min-w-0">
              <p className="t-label mb-0.5">Kupon</p>
              <p className="text-lg font-bold leading-tight break-words">{faze.data.title}</p>
              {faze.data.benefit && <p className="t-meta mt-0.5">{faze.data.benefit}</p>}
              <p className="t-meta mt-1">Drží ho: <span className="font-semibold text-[#16181A]">{faze.data.customer}</span> · kód <span className="font-mono">{faze.data.code}</span></p>
            </div>
            {(faze.data.badges?.length > 0 || faze.data.validUntil) && (
              <div className="flex flex-wrap gap-1.5">
                {(faze.data.badges ?? []).map((b: string) => <Chip key={b} tone="muted" size="sm">{b}</Chip>)}
                {faze.data.validUntil && <Chip tone="muted" size="sm">do {faze.data.validUntil}</Chip>}
              </div>
            )}
            {faze.data.problem && <p role="alert" className="note note-danger">{faze.data.problem}</p>}
            <div className="flex gap-2 flex-wrap">
              <Button size="lg" variant="primary" icon="check" loading={busy === 'kupon:' + faze.data.code} disabled={!faze.data.usable} onClick={() => uplatniKupon(faze.data.code, true)}>Uplatnit</Button>
              <Button size="lg" variant="secondary" onClick={dalsi}>Zrušit</Button>
            </div>
          </div>
        )}

        {faze.druh === 'poukaz' && (
          <div className="space-y-3" data-testid="ctecka-poukaz">
            <div className="min-w-0">
              <p className="t-label mb-0.5">Dárkový poukaz</p>
              <p className="text-lg font-bold font-mono tracking-wider">{faze.data.code}</p>
              <p className="text-2xl font-bold tabular-nums leading-tight mt-1">{money(faze.data.balance)}</p>
              <p className="t-meta tabular-nums">z {money(faze.data.value_amount)}{faze.data.valid_until ? ` · platí do ${faze.data.valid_until}` : ''}{faze.data.recipient_name ? ` · pro ${faze.data.recipient_name}` : ''}</p>
            </div>
            {faze.data.stav === 'active' ? (
              <form onSubmit={e => { e.preventDefault(); if (poukazOk) void uplatniPoukaz(Number(poukazCastka)); }} className="flex flex-wrap items-center gap-2">
                <Input aria-label={`Částka k uplatnění v ${symbol}`} type="number" inputMode="numeric" min={1} max={faze.data.balance} step={1} value={poukazCastka}
                  onChange={e => { setPoukazCastka(e.target.value); poukazRef.current = null; }} placeholder={`Max ${faze.data.balance}`} className="!w-36 text-center !h-12" />
                <Button type="submit" size="lg" variant="primary" icon="check" loading={busy === 'poukaz'} disabled={!poukazOk}>Uplatnit</Button>
                <Button type="button" size="lg" variant="secondary" disabled={busy === 'poukaz'} onClick={() => { setPoukazCastka(String(faze.data.balance)); poukazRef.current = null; void uplatniPoukaz(faze.data.balance); }}>Celý zůstatek</Button>
              </form>
            ) : (
              <p className="note note-wait">{faze.data.stav === 'expired' ? 'Platnost poukazu skončila, uplatnit ho nejde.' : faze.data.stav === 'used' ? 'Poukaz je vyčerpaný.' : 'Poukaz je zrušený.'}</p>
            )}
            <Button size="lg" variant="secondary" onClick={dalsi}>Jiný kód</Button>
          </div>
        )}
      </Well>

      {/* Ruční zadání: když čtečka nečte nebo host ukazuje kód na displeji. */}
      <form onSubmit={e => { e.preventDefault(); const t = rucne; setRucne(''); void nactiRef.current(t); }} className="flex gap-2 flex-wrap">
        <Input aria-label="Kód opsaný ručně" value={rucne} onChange={e => setRucne(/[^A-Za-z0-9 -]/.test(e.target.value) ? e.target.value.slice(0, 200) : formatujPriPsani(e.target.value).slice(0, 12))}
          placeholder="Opsat kód ručně" autoCapitalize="characters" autoComplete="off" className="font-mono tracking-[0.15em] flex-1 basis-40 uppercase !w-auto !h-12" />
        <Button type="submit" size="lg" variant="secondary" icon="search" disabled={rucneRozpoznano === 'prazdny'}>Najít</Button>
      </form>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="t-label">Návrat na čekání</span>
        <Segmented size="sm" ariaLabel="Za jak dlouho se po akci vrátit na čekání" value={String(navrat)} onChange={nastavNavrat}
          options={NAVRAT_MOZNOSTI.map(s => ({ id: String(s), label: navratPopisek(s) }))} />
      </div>

      {historie.length > 0 && (
        <div data-testid="ctecka-historie">
          <p className="t-label mb-1">Poslední načtení</p>
          <ul className="list">
            {historie.map(z => (
              <ListRow key={z.id} title={<span className="break-words">{z.popis}</span>}
                meta={casZaznamu(z.cas)}
                right={<Chip tone={z.ok ? 'ok' : 'bad'} size="sm">{z.ok ? 'Načteno' : 'Chyba'}</Chip>}
                actions={z.ok && z.kod ? <Button size="sm" variant="ghost" onClick={() => { posledniSken.current = null; void nactiRef.current(z.kod!); }}>Znovu</Button> : undefined} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
