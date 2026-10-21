'use client';

// Kolo 8 (R8-2, tablet):
//  - pauza přes výběr člověka a PIN jako příchod a odchod (POST /api/attendance, action 'break_start' /
//    'break_end'; /api/attendance/pauza je jen pro vlastní Píchačky a tablet odmítá). V okně člověka na směně
//    jsou tři velká tlačítka Pauza / Odpíchnout odchod / Zpět (≥ 48 px), na pauze Konec pauzy / Odchod / Zpět;
//    dlaždice i řádek nesou „pauza 8 min";
//  - tablet píchá i bez internetu: pás nahoře „Bez internetu — píchnutí se uloží a odešlou samy", PIN se ověří
//    proti otisku z posledního připojení (bcrypt hash, jen účet tabletu ho z API dostane), píchnutí jde do fronty
//    v localStorage s časem tabletu a klíčem a po připojení dávkou na POST /api/attendance/sync. Rozpis na
//    obrazovce se podle fronty hned přepíše (lib/kioskOffline.rosterSFrontou), poslední rozpis se pamatuje,
//    ať zamčený tablet bez sítě nabídne lidi k příchodu.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, ListRow, MenuItemButton, MenuPanel, Modal, SearchField, Stat, StatRow, Toast } from '../ui';
import { useNavigace } from '../widgety/NavigaceKontext';
import { usePopover } from '@/lib/usePopover';
import { useT } from '@/lib/i18n/client';
import { fmtHM } from '@/lib/i18n/format';
import { parseDbTime, dbTimeHM, pragueToday } from '@/lib/pragueTime';
import { hodinyMinuty } from '@/lib/dochazkaPrehled';
import {
  PRAH_HLEDANI_ROSTERU, rozdelRoster, hledejVRosteru, zpozdeniPrichodu, minutPoPlanu, souhrnOdchodu, SOUHRN_ZAVRIT_S, type SouhrnOdchodu,
} from '@/lib/kioskPrehled';
import { nextActiveId, IDLE_MS, ACTING_MAX_AGE_S, ACTING_OBNOVA_MS, obnovitCookie } from '@/lib/kioskIdentity';
import bcrypt from 'bcryptjs';
import { novyKlic } from '@/lib/idempotenceKlic';
import { tecekPinu, pinKompletni, poSpatnemPinu, zbyvaPauza, type StavPokusu } from '@/lib/pinTabletu';
import { duvodProcNeOffline, poSynchronizaci, pridejDoFronty, rosterSFrontou, zastaraleVeFronte, type AkceFronty, type PolozkaFronty } from '@/lib/kioskOffline';
import { useMoney } from '../CurrencyProvider';
import { apiMessage, okJson } from '@/lib/api';
import { URL_NAVIC, type NabidkaNavic } from '@/lib/navic';
import { NabidkaChipy } from '../navic/NabidkaChipy';
import { ZapsatNavic } from '../navic/ZapsatNavic';
import { obnovNavic, urlNavicMine, urlUkolyZaBody, useDataNavic, useUkolyZaBody } from '../navic/data';
import { nastavOsobuTabletu } from '../navic/osobaTabletu';
import { UkolyZaBody } from '../navic/UkolyZaBody';

export interface RosterMember {
  id: number;
  name: string;
  avatar?: string | null;
  hasPin: boolean;
  /** Délka PINu (4–6), když ji server zná; jinak tečky rostou s psaním (lib/pinTabletu). */
  pinDelka?: number | null;
  openSince: string | null;
  /** Od kdy běží pauza (záznam po pauze ještě bez konce); na pauze je openSince null. */
  breakSince?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
}

/** Co se na tabletu píchá: příchod, odchod, začátek a konec pauzy. */
export type AkceTabletu = 'in' | 'out' | 'break_start' | 'break_end';

export interface ActivePerson {
  id: number;
  name: string;
  avatar: string;
}

const LS_ACTIVE = 'managero-kiosk-active';
const LS_ACTIVE_OLD = 'pangea-kiosk-active';
/** Fronta píchnutí bez internetu, otisky PINů z posledního připojení a poslední rozpis (kolo 8). */
const LS_FRONTA = 'managero-kiosk-fronta';
const LS_OTISKY = 'managero-kiosk-otisky';
const LS_ROZPIS = 'managero-kiosk-rozpis';
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

const nactiJson = <T,>(klic: string, vychozi: T): T => {
  try { const raw = localStorage.getItem(klic); return raw ? (JSON.parse(raw) as T) : vychozi; } catch { return vychozi; }
};
const ulozJson = (klic: string, v: unknown) => { try { localStorage.setItem(klic, JSON.stringify(v)); } catch { /* soukromé okno */ } };

/** Chyba sítě (fetch spadl dřív, než server odpověděl) — ne odmítnutí serverem. */
const jeVypadekSite = (e: unknown) => e instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine);
// The active person is mirrored into a cookie so server routes can attribute
// work to them even for shared components that post their own request bodies
// (the procedure runner, for example). Server side it is only ever honoured for
// a kiosk session whose target is clocked in — see app/api/tasks/route.ts.
const ACTING_COOKIE = 'managero-kiosk-acting';
// Šestnáct hodin tu bývalo „jedna dlouhá směna". Jenže tablet u baru není
// něčí telefon: identita v něm nedrží proto, že ji člověk potvrdil, ale
// proto, že nikdo nesáhl na tlačítko. Hodina je pojistka pro zavřený tablet;
// dokud je stránka otevřená a někoho drží, cookie se obnovuje (dotykem
// i časovačem níž), aby zápisy bez actingAs nespadly na účet tabletu.
const ACTING_MAX_AGE = ACTING_MAX_AGE_S;
// Práh nečinnosti a celé pravidlo „kdo se zapisuje" žijí v `lib/kioskIdentity`,
// ať se dají otestovat bez prohlížeče.

function writeActingCookie(id: number | null) {
  try {
    document.cookie = id
      ? `${ACTING_COOKIE}=${id}; path=/; max-age=${ACTING_MAX_AGE}; SameSite=Lax`
      : `${ACTING_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } catch { /* cookies disabled — the client still sends actingAs in bodies */ }
}

/** Tikající „teď". Vrací 0, dokud stránka nenaskočí v prohlížeči.
 *
 *  Brát Date.now() rovnou při renderu znamená, že server vykreslí jiný čas než
 *  prohlížeč — hydratace se rozejde, React zahodí celý serverový strom a
 *  překreslí ho znovu. Na iPadu to bylo vidět jako probliknutí při každém
 *  otevření. Nula je srozumitelné „ještě nevím" a komponenty na ni umí čekat. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function elapsed(fromIso: string, now: number) {
  // now === 0 znamená „prohlížeč se ještě neozval" — bez tohohle by se první
  // snímek pokusil odečíst čas od nuly a ukázal by nesmysl.
  if (!now) return '—';
  const from = parseDbTime(fromIso)?.getTime();
  if (from == null) return '—';
  const secs = Math.max(0, Math.round((now - from) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

const timeOf = (iso: string) => dbTimeHM(iso);

/** Kolik minut běží pauza (0, dokud prohlížeč nezná „teď"). */
function minutPauzy(breakSince: string | null | undefined, now: number): number {
  const od = parseDbTime(breakSince ?? null)?.getTime();
  return now && od != null ? Math.max(0, Math.floor((now - od) / 60000)) : 0;
}

interface KioskShiftValue {
  roster: RosterMember[];
  onShift: RosterMember[];
  offShift: RosterMember[];
  loading: boolean;
  /** První načtení rozpisu selhalo — obrazovka nesmí tvrdit, že tým je prázdný. */
  loadFailed: boolean;
  activeId: number | null;
  active: ActivePerson | null;
  /**
   * Kdo si tuhle práci připíše. Když to tablet neví, zeptá se a počká;
   * `null` znamená „člověk výběr zavřel" — pak se nesmí zapsat nic.
   *
   * Práce se na sdíleném tabletu nikdy nepřipisuje odhadem: mzdy i podpisy
   * pod zavíracím postupem stojí na tom, že tam je jméno toho, kdo to udělal.
   */
  requireActive: () => Promise<ActivePerson | null>;
  selectPerson: (id: number) => void;
  punch: (member: RosterMember) => void;
  reload: () => Promise<void>;
  /** Souhrn směny toho, kdo právě odpíchl odchod (okno „díky za směnu"); null = nic. */
  souhrn: { id: number; jmeno: string; data: SouhrnOdchodu } | null;
  zavriSouhrn: () => void;
  /** Tablet je bez internetu (prohlížeč to hlásí, nebo poslední načtení rozpisu spadlo na síti). */
  offline: boolean;
  /** Píchnutí, která čekají na odeslání. */
  fronta: PolozkaFronty[];
  /** Je k člověku otisk PINu pro ověření bez internetu? */
  maOtisk: (id: number) => boolean;
  /** Ověří PIN proti otisku (bez internetu). */
  overPinOffline: (id: number, pin: string) => Promise<boolean>;
  /** Zařadí píchnutí do fronty (bez internetu) a hned přepíše rozpis na obrazovce. */
  zaradDoFronty: (member: RosterMember, action: AkceFronty, pinOvereno: boolean) => void;
}

/** Co PunchDialog předá po úspěšném zápisu — odpověď POST /api/attendance. */
export interface VysledekPichnuti {
  entry?: { clockIn?: string | null; clockOut?: string | null } | null;
  closingDone?: boolean | null;
}

const Ctx = createContext<KioskShiftValue | null>(null);

export function useKioskShift(): KioskShiftValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useKioskShift must be used within a KioskShiftProvider');
  return v;
}

export function KioskShiftProvider({ children }: { children: React.ReactNode }) {
  const t = useT('kiosk');
  const [rosterZeServeru, setRosterZeServeru] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  // Bez internetu (kolo 8): fronta píchnutí, otisky PINů a stav sítě.
  const [fronta, setFronta] = useState<PolozkaFronty[]>([]);
  const frontaRef = useRef<PolozkaFronty[]>([]);
  const otisky = useRef<Record<string, string>>({});
  const [online, setOnline] = useState(true);
  const [sitSpadla, setSitSpadla] = useState(false);
  const odesilam = useRef(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [punching, setPunching] = useState<RosterMember | null>(null);
  // Souhrn po odchodu (kolo 7): místo toastu „nezapomeň na uzávěrku" okno s příchodem,
  // odchodem a odpracovaným časem. Kreslí ho SouhrnPoOdchodu uvnitř navigace tabletu
  // (KioskShell), aby „Vyplnit uzávěrku" mohlo přepnout záložku.
  const [souhrn, setSouhrn] = useState<{ id: number; jmeno: string; data: SouhrnOdchodu } | null>(null);
  // Hlášení tabletu jde přes sdílený Toast (role=status, dole uprostřed).
  // `id` odliší dvě stejná hlášení po sobě, jinak by druhé dostalo zbytek času prvního.
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'bad'; id: number } | null>(null);
  const now = useNow();
  const [loadFailed, setLoadFailed] = useState(false);
  /** Kdy se naposled někdo tabletu dotkl — podle toho se pozná nečinnost. */
  const touchedAt = useRef(0);
  /** Kdy se naposled zapsala cookie identity a pro koho — dotyky ji obnovují nanejvýš po půl minutě. */
  const cookieZapsana = useRef(0);
  const activeIdRef = useRef<number | null>(null);
  activeIdRef.current = activeId;
  const zapisCookie = useCallback((id: number | null) => {
    cookieZapsana.current = Date.now();
    writeActingCookie(id);
  }, []);

  const reload = useCallback(async () => {
    try {
      // `res.ok` se musí kontrolovat zvlášť: `fetch` vyhodí výjimku jen
      // když spojení vůbec nevznikne. Odpověď 500 se doručí úspěšně a bez
      // téhle kontroly vypadá jako platná data s prázdným rozpisem —
      // tedy přesně ta tichá lež, kvůli které se tohle opravuje.
      const res = await fetch('/api/attendance');
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      if (Array.isArray(d.roster)) {
        // Otisky PINů (jen účet tabletu je dostane) zůstanou v úložišti pro píchání bez internetu;
        // do stavu ani na obrazovku nejdou. Rozpis se pamatuje pro zamčený tablet bez sítě.
        const nove: Record<string, string> = {};
        const cisty: RosterMember[] = (d.roster as (RosterMember & { offlinePin?: string | null })[]).map(({ offlinePin, ...m }) => {
          if (offlinePin) nove[String(m.id)] = String(offlinePin);
          return m;
        });
        otisky.current = nove;
        ulozJson(LS_OTISKY, nove);
        ulozJson(LS_ROZPIS, cisty);
        setRosterZeServeru(cisty);
      }
      setLoadFailed(false);
      setSitSpadla(false);
    } catch (e) {
      // Při výpadku necháme na obrazovce poslední známý rozpis — na tabletu
      // za barem je lepší mít staré jméno než prázdno. Jenomže když selže
      // hned to první načtení, žádné staré jméno není a obrazovka pak psala
      // „Zatím tu nikdo není — zaměstnance přidá vedení". To je lež: tým
      // v aplikaci je, jen k němu tablet nedosáhl, a obsluha místo
      // zkontrolování wifi volala šéfovi.
      setLoadFailed(true);
      if (jeVypadekSite(e)) {
        setSitSpadla(true);
        // Bez sítě a bez rozpisu (tablet se právě zapnul): poslední známý rozpis z úložiště.
        setRosterZeServeru(r => (r.length ? r : nactiJson<RosterMember[]>(LS_ROZPIS, [])));
      }
    }
    setLoading(false);
  }, []);

  // Fronta a otisky z úložiště (po obnovení stránky), stav sítě z prohlížeče.
  useEffect(() => {
    otisky.current = nactiJson<Record<string, string>>(LS_OTISKY, {});
    const f = nactiJson<PolozkaFronty[]>(LS_FRONTA, []);
    frontaRef.current = f; setFronta(f);
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const ulozFrontu = useCallback((f: PolozkaFronty[]) => { frontaRef.current = f; setFronta(f); ulozJson(LS_FRONTA, f); }, []);
  const offline = !online || sitSpadla;

  useEffect(() => { reload(); }, [reload]);
  // Keep in sync with the employer app and any second tablet.
  useEffect(() => { const t = setInterval(reload, 20000); return () => clearInterval(t); }, [reload]);

  // Rozpis na obrazovce = rozpis ze serveru přepsaný frontou: kdo si bez internetu píchl příchod, je na směně hned.
  const roster = useMemo(() => rosterSFrontou(rosterZeServeru, fronta), [rosterZeServeru, fronta]);
  // Na pauze je člověk pořád na směně (tablet zůstává odemčený, práce se mu připisuje).
  const onShift = useMemo(() => roster.filter(m => m.openSince || m.breakSince), [roster]);
  const offShift = useMemo(() => roster.filter(m => !m.openSince && !m.breakSince), [roster]);

  // Restore the last active person after a tablet refresh.
  useEffect(() => {
    try {
      const raw = (localStorage.getItem(LS_ACTIVE) ?? localStorage.getItem(LS_ACTIVE_OLD));
      const id = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(id)) setActiveId(id);
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  // Kdo se zapisuje, musí být někdo, kdo je opravdu na směně — a nesmí to
  // být odhad. Dřív se tady sahalo po `onShift[0]`, tedy po tom, kdo byl
  // v rozpisu první: když Anně skončila směna, tablet se tiše stal Bobem
  // a všechno, co kdokoli dál odklikal, šlo na Bobovo jméno.
  //
  // Jeden člověk na směně odhad není, to je fakt. Dva a víc znamená, že se
  // tablet musí zeptat.
  useEffect(() => {
    if (!hydrated || loading) return;
    const next = nextActiveId({
      prev: activeId,
      onShift: onShift.map(m => m.id),
      idleFor: touchedAt.current ? Date.now() - touchedAt.current : 0,
    });
    if (next !== activeId) setActiveId(next);
  }, [hydrated, loading, onShift, activeId]);

  // Nečinnost identitu zahodí. Tablet za barem drží jméno jen proto, že na
  // něj nikdo nesáhl — ne proto, že by ho někdo potvrdil. Po deseti minutách
  // je pravděpodobnější, že u něj stojí někdo jiný.
  useEffect(() => {
    const bump = () => {
      const t = Date.now();
      touchedAt.current = t;
      // Obnova cookie ještě před požadavkem, který dotyk spustí: po hodině
      // ticha (jediný člověk na směně, nikdo nic nezapisoval) by jinak první
      // zápis bez actingAs spadl na účet tabletu.
      if (activeIdRef.current != null && obnovitCookie(cookieZapsana.current, t)) zapisCookie(activeIdRef.current);
    };
    bump();
    window.addEventListener('pointerdown', bump, true);
    window.addEventListener('keydown', bump, true);
    return () => {
      window.removeEventListener('pointerdown', bump, true);
      window.removeEventListener('keydown', bump, true);
    };
  }, [zapisCookie]);
  useEffect(() => {
    if (onShift.length < 2 || activeId == null) return;
    const t = setInterval(() => {
      if (Date.now() - touchedAt.current > IDLE_MS) setActiveId(null);
    }, 30000);
    return () => clearInterval(t);
  }, [onShift.length, activeId]);


  useEffect(() => {
    if (!hydrated) return;
    try {
      if (activeId != null) localStorage.setItem(LS_ACTIVE, String(activeId));
      else localStorage.removeItem(LS_ACTIVE);
    } catch { /* ignore */ }
    zapisCookie(activeId);
  }, [hydrated, activeId, zapisCookie]);

  // Cookie zrcadlí, koho tablet drží: dokud někoho drží, obnovuje se sama.
  // Dřív se zapsala jen při změně osoby, a tak po hodině vypršela, i když
  // hlavička dál psala „Zapisuje se jako …" — postupy, ±1 ve skladu a zbytky
  // pak tiše šly na účet tabletu.
  useEffect(() => {
    if (!hydrated || activeId == null) return;
    const t = setInterval(() => zapisCookie(activeIdRef.current), ACTING_OBNOVA_MS);
    return () => clearInterval(t);
  }, [hydrated, activeId, zapisCookie]);

  const active = useMemo<ActivePerson | null>(() => {
    const m = onShift.find(x => x.id === activeId);
    return m ? { id: m.id, name: m.name, avatar: m.avatar || '👤' } : null;
  }, [onShift, activeId]);

  // `requireActive` se volá z obslužné funkce, kde by `active` z closure už
  // mohlo být staré — držíme ho v refu.
  const activeRef = useRef<ActivePerson | null>(null);
  const [asking, setAsking] = useState<((who: ActivePerson | null) => void) | null>(null);
  const requireActive = useCallback((): Promise<ActivePerson | null> => {
    const now = activeRef.current;
    if (now) { touchedAt.current = Date.now(); return Promise.resolve(now); }
    return new Promise<ActivePerson | null>(resolve => setAsking(() => resolve));
  }, []);

  const showFlash = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => {
    setFlash({ text, tone, id: Date.now() });
  }, []);

  useEffect(() => { activeRef.current = active; }, [active]);
  // Kolo 11: widget „Úkoly za body" na Směně ukazuje úkoly vybraného člověka — přes malé úložiště
  // (components/navic/osobaTabletu), ať widget nemusí tahat tenhle soubor (bcrypt, fronta) ani provider.
  const vyzadejOsobu = useCallback(async () => { const a = await requireActive(); return a ? { id: a.id, jmeno: a.name } : null; }, [requireActive]);
  useEffect(() => { nastavOsobuTabletu(active ? { id: active.id, jmeno: active.name } : null, vyzadejOsobu); }, [active, vyzadejOsobu]);
  useEffect(() => () => nastavOsobuTabletu(null, null), []);

  // ---- Bez internetu: fronta a její odeslání ----
  const maOtisk = useCallback((id: number) => !!otisky.current[String(id)], []);
  const overPinOffline = useCallback(async (id: number, pin: string) => {
    const otisk = otisky.current[String(id)];
    if (!otisk) return false;
    // bcryptjs je v balíku tabletu napevno: dynamický import by bez internetu neměl odkud stáhnout kus kódu.
    return bcrypt.compare(pin, otisk);
  }, []);
  const zaradDoFronty = useCallback((member: RosterMember, action: AkceFronty, pinOvereno: boolean) => {
    ulozFrontu(pridejDoFronty(frontaRef.current, { klic: novyKlic(), employeeId: member.id, jmeno: member.name, action, cas: new Date().toISOString(), pinOvereno }));
  }, [ulozFrontu]);
  const odesliFrontu = useCallback(async () => {
    const f = frontaRef.current;
    if (!f.length || odesilam.current) return;
    odesilam.current = true;
    try {
      const { platne, zastarale } = zastaraleVeFronte(f, Date.now());
      if (zastarale.length) {
        ulozFrontu(platne);
        showFlash(t('{n, plural, one {# píchnutí je starší než den} few {# píchnutí jsou starší než den} other {# píchnutí je starších než den}} — doplň je ručně v Docházce: {kdo}', { n: zastarale.length, kdo: [...new Set(zastarale.map(z => z.jmeno))].join(', ') }), 'bad');
      }
      if (!platne.length) return;
      const res = await fetch('/api/attendance/sync', { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify({ pichnuti: platne }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showFlash(d?.error || t('Frontu píchnutí se nepodařilo odeslat.'), 'bad'); return; }
      const { zbyva, doruceno, odmitnuto } = poSynchronizaci(platne, Array.isArray(d?.vysledky) ? d.vysledky : []);
      ulozFrontu(zbyva);
      if (odmitnuto.length) showFlash(t('Server odmítl {n} píchnutí: {co}', { n: odmitnuto.length, co: odmitnuto.map(o => `${o.jmeno} — ${o.error}`).join('; ') }), 'bad');
      else if (doruceno) showFlash(t('{n, plural, one {# píchnutí odesláno} few {# píchnutí odeslána} other {# píchnutí odesláno}} po výpadku.', { n: doruceno }), 'ok');
      await reload();
    } catch { /* síť pořád není — zkusí se při dalším připojení */ }
    finally { odesilam.current = false; }
  }, [ulozFrontu, showFlash, reload, t]);
  // Jakmile je síť (událost prohlížeče, nebo rozpis zase prošel), fronta se odešle.
  useEffect(() => { if (online && !sitSpadla && fronta.length) void odesliFrontu(); }, [online, sitSpadla, fronta.length, odesliFrontu]);

  const value: KioskShiftValue = {
    roster, onShift, offShift, loading, loadFailed, activeId, active,
    requireActive,
    selectPerson: setActiveId,
    punch: setPunching,
    reload,
    souhrn,
    zavriSouhrn: () => setSouhrn(null),
    offline, fronta, maOtisk, overPinOffline, zaradDoFronty,
  };

  const answer = (who: ActivePerson | null) => {
    if (who) { setActiveId(who.id); touchedAt.current = Date.now(); }
    asking?.(who);
    setAsking(null);
  };

  return (
    <Ctx.Provider value={value}>
      {/* Pás nahoře při výpadku (role=status, ať ho odečítač ohlásí): co se stane s píchnutím a kolik jich čeká. */}
      {offline && (
        <p role="status" data-offline-pas className="note note-wait flex items-center gap-2 mb-3">
          <Icon name="warning" size={16} className="shrink-0" />
          <span className="text-pretty">
            {t('Bez internetu — píchnutí se uloží a odešlou samy.')}
            {fronta.length > 0 && <> {t('({n, plural, one {# čeká} few {# čekají} other {# čeká}})', { n: fronta.length })}</>}
          </span>
        </p>
      )}
      {!offline && fronta.length > 0 && (
        <p role="status" data-offline-pas className="note note-info flex items-center gap-2 mb-3">
          <Icon name="refresh" size={16} className="shrink-0" />
          <span>{t('Odesílají se píchnutí z výpadku ({n})…', { n: fronta.length })}</span>
        </p>
      )}
      {children}
      {/* Tablet se ptá místo aby hádal. Zavřít jde — ale pak se nic nezapíše,
          protože zápis pod cizí jméno je horší než žádný zápis. */}
      {asking && (
        <Modal open onClose={() => answer(null)} title={t('Kdo teď u tabletu stojí?')}
          subtitle={t('Pod tímhle jménem se práce zapíše.')} size="lg">
          <PersonPicker
            members={onShift}
            onPick={m => answer({ id: m.id, name: m.name, avatar: m.avatar || '👤' })}
            emptyText={t('Nikdo není na směně. Nejdřív se odpíchni.')}
          />
        </Modal>
      )}
      {/* Dřív ručně psaný limetkový proužek nahoře bez role=status — odečítač
          o zapomenuté uzávěrce ani o přepnuté identitě nic neřekl (DP §3.17).
          Obě hlášení jsou varování, ne oslava, proto tón „bad" a 8 s na přečtení. */}
      <Toast message={flash?.text ?? null} tone={flash?.tone} id={flash?.id} ms={8000} onClose={() => setFlash(null)} />
      {punching && (
        <PunchDialog
          member={punching}
          now={now}
          onClose={() => setPunching(null)}
          onDone={(action, member, vysledek, msg) => {
            setPunching(null);
            // Kdo právě přišel, ten teď u tabletu stojí. Jenže tohle je
            // přepnutí cizí identity — když předtím byl vybraný někdo jiný,
            // musí to být vidět, ne se stát potichu za jeho zády.
            const switchedFrom = action === 'in' && activeId != null && activeId !== member.id
              ? (onShift.find(m => m.id === activeId)?.name ?? null)
              : null;
            if (action === 'in') { setActiveId(member.id); touchedAt.current = Date.now(); }
            if (!offline) reload();
            if (action === 'out') {
              // Shift summary jako Homebase / Square: „8:02–15:34 · 7 h 32 min" a cesta k uzávěrce.
              // Bez čitelné odpovědi (starší server) aspoň dřívější varování o uzávěrce.
              const data = souhrnOdchodu(vysledek?.entry, vysledek?.closingDone);
              if (data) setSouhrn({ id: member.id, jmeno: member.name, data });
              else if (vysledek?.closingDone === false) showFlash(t('{jmeno}: odchod zaznamenán — nezapomeň vyplnit uzávěrku směny!', { jmeno: member.name }), 'bad');
            }
            if (msg) showFlash(msg, 'bad');
            if (switchedFrom) showFlash(t('Zapisuje se teď jako {jmeno}, ne {predtim}. Přepni nahoře u jména, jestli to není tak.', { jmeno: member.name, predtim: switchedFrom }), 'bad');
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/**
 * Everything behind the gate is only reachable once somebody is on shift, so
 * the tablet always knows whose account to record work under.
 */
export function KioskShiftGate({ children }: { children: React.ReactNode }) {
  const { loading, onShift } = useKioskShift();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <div className="h-10 w-10 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
      </div>
    );
  }
  if (onShift.length === 0) return <LockScreen />;
  return <>{children}</>;
}

function LockScreen() {
  const t = useT('kiosk');
  const { roster, punch, loadFailed, reload } = useKioskShift();
  const [picking, setPicking] = useState(false);

  return (
    <div className="flex-1 flex items-start justify-center pt-4 sm:pt-8 pb-6">
      {/* Nadpisy jsou h2: h1 má obrazovka (hlavička plochy Směna, nebo skrytý
          nadpis tabletu na ostatních záložkách) — dva h1 by odečítač zmátly. */}
      <div className="card w-full max-w-3xl p-8 sm:p-10 text-center">
        {/* Když se rozpis nenačetl, nemá smysl nabízet „Jsem na směně" —
            výběr osoby by byl prázdný. Místo něj rovnou chyba a opakování. */}
        {!picking && loadFailed && roster.length === 0 ? (
          <ErrorState
            title={t('Rozpis se nenačetl')}
            hint={t('Tablet se nedostal na server — zkontroluj připojení. Lidé v týmu tam jsou, jen je odsud teď není vidět.')}
            onRetry={() => { void reload(); }}
          />
        ) : !picking ? (
          <>
            {/* v3: klidný symbol v šedém kruhu (jako EmptyState), ne inkoustová dlaždice
                s limetkou — limetka patří jediné akci pod textem. */}
            <div className="mx-auto h-20 w-20 rounded-full bg-black/[0.05] text-black/50 grid place-items-center">
              <Icon name="clock" size={38} />
            </div>
            <h2 className="t-page mt-6 text-balance">{t('Tablet čeká na směnu')}</h2>
            <p className="text-black/50 mt-3 max-w-md mx-auto leading-relaxed">
              {t('Odemkne se, jakmile se někdo přihlásí na směnu. Všechno, co pak na tabletu uděláš, se zapíše pod tvoje jméno.')}
            </p>
            {/* Jediná akce zamčeného tabletu → jediná limetka (DP §3.1). */}
            <Button variant="accent" size="lg" icon="play" className="mt-8" onClick={() => setPicking(true)}>
              {t('Jsem na směně')}
            </Button>
            {roster.length === 0 && (
              <EmptyState illustration="tym" title={t('Zatím tu nikdo není')} hint={t('Zaměstnance přidá vedení v aplikaci v Nastavení týmu — pak se tady odpíchnou.')} compact />
            )}
          </>
        ) : (
          <>
            <h2 className="t-page text-balance">{t('Kdo přichází na směnu?')}</h2>
            <p className="t-meta mt-2">{t('Ťukni na sebe a zaznamenej příchod.')}</p>
            <div className="mt-7">
              <PersonPicker
                members={roster}
                onPick={punch}
                emptyText={t('Zatím žádní zaměstnanci. Přidej je v aplikaci vedení (Nastavení týmu).')}
              />
            </div>
            <Button variant="secondary" size="lg" className="mt-7" onClick={() => setPicking(false)}>
              {t('Zpět')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Big tap-target grid of people — used on the lock screen, for late arrivals
 * and for „Kdo teď u tabletu stojí?".
 *
 * Od kola 6 (B4): nejdřív „Dnes na rozpisu" (podle začátku směny), pak
 * „Ostatní" abecedně — vedení bez směny je až dole, brigádník, který dnes
 * nastupuje, nahoře. Od devíti lidí hledací pole; bez autofocusu, tablet je
 * sdílený a klávesnice by vyjela každému, kdo jde kolem. Řadí se tady na
 * klientu: roster z /api/attendance čtou i widgety vedení, ORDER BY se nemění.
 */
export function PersonPicker({ members, onPick, emptyText }: {
  members: RosterMember[];
  onPick: (m: RosterMember) => void;
  emptyText: string;
}) {
  const t = useT('kiosk');
  const now = useNow(60000);
  const [dotaz, setDotaz] = useState('');
  const hledani = members.length >= PRAH_HLEDANI_ROSTERU;
  const nalezeni = useMemo(() => (hledani ? hledejVRosteru(members, dotaz) : members), [members, dotaz, hledani]);
  const { naRozpisu, ostatni } = useMemo(() => rozdelRoster(nalezeni), [nalezeni]);
  if (members.length === 0) {
    return <p className="t-meta py-6">{emptyText}</p>;
  }
  // Bez rozpisu na dnešek by nadpis „Ostatní" nad všemi jen mátl.
  const skupiny = naRozpisu.length > 0;
  const mrizka = (lide: RosterMember[]) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
      {lide.map(m => (
        // Jamka, ne karta: výběr leží v kartě zamykací obrazovky nebo „Kdo teď
        // pracuje" a karta v kartě se nedělá (DP §3.9). Velká plocha zůstává —
        // u baru se ťuká na délku paže. Na pauze dlaždice zešedne.
        <button
          type="button"
          key={m.id}
          onClick={() => onPick(m)}
          data-na-pauze={m.breakSince && !m.openSince ? '' : undefined}
          className={`well p-5 text-left min-h-[112px] hover:bg-black/[0.05] active:scale-[0.98] transition ${m.breakSince && !m.openSince ? 'opacity-70' : ''}`}
        >
          <Avatar emoji={m.avatar} size="xl" ring={false} />
          {/* Dvě řádky místo „Karolína Šť…": na telefonu jsou dlaždice dvě vedle sebe. */}
          <span className="block t-card mt-3 line-clamp-2 break-words">{m.name}</span>
          {m.openSince ? (
            <span className="block text-sm font-semibold text-ok-ink mt-0.5">{t('Na směně')}</span>
          ) : m.breakSince ? (
            <span className="block text-sm font-semibold text-black/55 mt-0.5 tabular-nums">{t('pauza {n} min', { n: minutPauzy(m.breakSince, now) })}</span>
          ) : m.shiftStart ? (
            <span className="block t-meta tabular-nums mt-0.5">{t('Dnes {od}–{do}', { od: fmtHM(m.shiftStart), do: fmtHM(m.shiftEnd) })}</span>
          ) : (
            <span className="block t-meta mt-0.5">{t('Mimo směnu')}</span>
          )}
        </button>
      ))}
    </div>
  );
  return (
    <div className="space-y-4 text-left">
      {hledani && (
        <SearchField value={dotaz} onChange={setDotaz} placeholder={t('Hledat jméno…')} ariaLabel={t('Hledat jméno…')} />
      )}
      {nalezeni.length === 0 ? (
        <EmptyState icon="search" compact title={t('Nikdo takový')} hint={t('Zkus jméno napsat jinak.')} />
      ) : skupiny ? (
        <>
          <section aria-labelledby="kiosk-skupina-rozpis">
            <h3 id="kiosk-skupina-rozpis" className="t-label mb-2.5">{t('Dnes na rozpisu')}</h3>
            {mrizka(naRozpisu)}
          </section>
          {ostatni.length > 0 && (
            <section aria-labelledby="kiosk-skupina-ostatni">
              <h3 id="kiosk-skupina-ostatni" className="t-label mb-2.5">{t('Ostatní')}</h3>
              {mrizka(ostatni)}
            </section>
          )}
        </>
      ) : mrizka(ostatni)}
    </div>
  );
}

/**
 * „Kdo teď pracuje" — nástroj plochy Směna: pod koho se práce na tabletu
 * zapisuje, přepnutí jedním ťuknutím, odchod a další příchod.
 *
 * Do kola 68 to byly bílé karty lidí v bílé kartě (DP §1.3). Teď jedna karta
 * a v ní `.list`: jméno, jak dlouho je kdo na směně, stav vpravo. Kdo se
 * zapisuje, nese stavový chip, ne limetkový rámeček — limetka na obrazovce
 * patří jen hlavní akci.
 */
export function WhoIsWorking() {
  const t = useT('kiosk');
  const { onShift, offShift, activeId, selectPerson, punch } = useKioskShift();
  const [adding, setAdding] = useState(false);
  // Řádek ukazuje délku v minutách, ne vteřinách — stačí tik za minutu
  // (PunchDialog dál tiká po sekundě, tam se odečítá čas odchodu).
  const now = useNow(60000);
  const dnes = pragueToday();

  return (
    <Card as="section" aria-labelledby="kiosk-kdo-pracuje">
      {/* v4 (P2): na telefonu akce pod titulem přes celou šířku (ne zalomená vlevo v půlce), od sm vpravo v řádku. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 id="kiosk-kdo-pracuje" className="t-card flex items-center gap-2 min-w-0">
          <Icon name="clock" size={17} className="shrink-0 text-black/40" />
          <span className="truncate">{t('Kdo teď pracuje')}</span>
        </h2>
        {/* Na tabletu u baru cíle nejméně 44 px (DESIGN.md, Kiosk) — proto md, ne sm. */}
        <Button variant="secondary" icon={adding ? 'close' : 'plus'} aria-expanded={adding} className="w-full sm:w-auto" onClick={() => setAdding(v => !v)}>
          {adding ? t('Zavřít') : t('Další příchod')}
        </Button>
      </div>

      <ul className="list mt-3">
        {onShift.map(m => {
          const isActive = m.id === activeId;
          // Plán proti skutečnosti: od kolika · jak dlouho · plán do. Po plánu
          // chip „wait", bez rozpisu chip „info" — vedle stavu „Zapisuje se".
          const naPauze = !m.openSince && !!m.breakSince;
          const od = parseDbTime(m.openSince ?? m.breakSince)?.getTime();
          const doba = now && od != null ? hodinyMinuty(now - od) : '—';
          const poPlanu = naPauze ? null : minutPoPlanu(dnes, m.shiftStart, m.shiftEnd, now);
          return (
            // akceVRadku: na telefonu zůstane ikona odchodu v prvním řádku u jména
            // a chipy s „Přepnout" jdou pod něj — jinak by odchod skončil sám na třetím řádku.
            <ListRow
              key={m.id}
              akceVRadku
              lead={<Avatar emoji={m.avatar} size="md" ring={false} />}
              title={m.name}
              meta={<span className="tabular-nums">
                {naPauze ? t('na pauze od {cas}', { cas: dbTimeHM(m.breakSince) }) : <>{t('od {cas}', { cas: dbTimeHM(m.openSince) })} · {doba}</>}
                {m.shiftEnd && <span className="hidden md:inline"> · {t('plán do {cas}', { cas: fmtHM(m.shiftEnd) })}</span>}
              </span>}
              right={<span className="flex flex-wrap items-center justify-end gap-2">
                {naPauze && <Chip tone="muted" icon="cup" className="tabular-nums">{t('pauza {n} min', { n: minutPauzy(m.breakSince, now) })}</Chip>}
                {poPlanu != null && <Chip tone="wait" icon="clock" className="tabular-nums">{t('po plánu +{n} min', { n: poPlanu })}</Chip>}
                {!m.shiftStart && <Chip tone="info">{t('bez rozpisu')}</Chip>}
                {isActive
                  ? <Chip tone="ok" icon="check">{t('Zapisuje se')}</Chip>
                  : <Button variant="secondary" onClick={() => selectPerson(m.id)} aria-label={t('Zapisovat jako {jmeno}', { jmeno: m.name })}>{t('Přepnout')}</Button>}
              </span>}
              actions={naPauze ? (
                <Button variant="ghost" iconOnly icon="play" title={t('Konec pauzy – {jmeno}', { jmeno: m.name })}
                  aria-label={t('Konec pauzy – {jmeno}', { jmeno: m.name })} onClick={() => punch(m)} />
              ) : (
                <>
                  {/* Pauza je vidět rovnou v řádku, ne až v okně — „najít funkci je hardcore". Obě otevřou totéž okno. */}
                  <Button variant="ghost" iconOnly icon="cup" title={t('Pauza – {jmeno}', { jmeno: m.name })}
                    aria-label={t('Pauza – {jmeno}', { jmeno: m.name })} onClick={() => punch(m)} />
                  <Button variant="ghost" iconOnly icon="logout" title={t('Odchod – {jmeno}', { jmeno: m.name })}
                    aria-label={t('Odchod – {jmeno}', { jmeno: m.name })} onClick={() => punch(m)} />
                </>
              )}
            />
          );
        })}
      </ul>

      {adding && (
        <div className="mt-4 pt-4 border-t border-black/[0.06]">
          <p className="t-meta mb-3">{t('Kdo dále nastupuje na směnu?')}</p>
          <PersonPicker
            members={offShift}
            onPick={m => { setAdding(false); punch(m); }}
            emptyText={t('Všichni z týmu už jsou na směně.')}
          />
        </div>
      )}
    </Card>
  );
}

/** Header chip: who the tablet is recording as, plus a one-tap switcher. */
export function ActivePersonChip() {
  const t = useT('kiosk');
  const { active, onShift, requireActive } = useKioskShift();

  // Bez vybraného člověka se dřív odznak prostě nevykreslil — u baru to
  // vypadalo, že tablet nikoho nezapisuje, a přitom stačilo ťuknout na úkol
  // a zapsal se pod tablet. Místo prázdna se tedy ptáme.
  if (!active) {
    if (onShift.length === 0) return null;
    return (
      <button type="button" onClick={() => { void requireActive(); }}
        className="flex items-center gap-2.5 rounded-full border border-transparent bg-wait/[0.14] pl-3.5 pr-4 py-2 min-h-[44px] hover:bg-wait/20 transition">
        <Icon name="warning" size={17} className="text-wait-ink shrink-0" />
        <span className="text-left leading-tight">
          <span className="hidden sm:block t-label">{t('Zapisuje se jako')}</span>
          <span className="block font-bold text-[#16181A] text-sm">{t('Kdo jsi?')}</span>
        </span>
      </button>
    );
  }
  return <PrepinacOsoby active={active} onShift={onShift} />;
}

/**
 * Čip „Zapisuje se jako" s nabídkou lidí na směně. Dřív vlastní div s neviditelnou
 * vrstvou přes obrazovku: Escape ho nezavřel, šipky nechodily a fokus se po
 * zavření ztratil (DP §3.9). Teď sdílený MenuPanel s usePopover — stejné
 * chování jako menu „···". Vybraný člověk nese fajfku a aria-checked, ne
 * limetkový podklad (limetka na obrazovce patří jen hlavní akci).
 *
 * Audit K02/B11: s jedním člověkem na směně byl čip tlačítko, které po klepnutí
 * nedělalo nic. Teď nabídka vždy něco umí — kromě lidí na směně i „Přidat příchod"
 * (kolega přichází: vybere se a píchne PINem, vzor Square Team „Clock in"). Když
 * na směně je jen jeden člověk a nikdo další v týmu, je čip jen štítek (ne tlačítko).
 */
function PrepinacOsoby({ active, onShift }: { active: ActivePerson; onShift: RosterMember[] }) {
  const [open, setOpen] = useState(false);
  const [pridat, setPridat] = useState(false);
  const t = useT('kiosk');
  const { offShift, selectPerson, punch } = useKioskShift();
  const pop = usePopover(open, setOpen, { focusFirst: true, arrowKeys: true });
  const lzePrepnout = onShift.length > 1;
  const lzePridat = offShift.length > 0;
  const interaktivni = lzePrepnout || lzePridat;
  // max-w-full + min-w-0: na telefonu se čip zúží (jméno se zkrátí „…") a nepřeleze hodiny vedle.
  const tvar = 'flex items-center gap-2.5 rounded-full pl-2.5 pr-4 py-2 min-h-[44px] max-w-full min-w-0';
  const vzhled = `btn-secondary ${tvar} transition`;
  const obsah = (
    <>
      <Avatar emoji={active.avatar} size="sm" ring={false} />
      <span className="text-left leading-tight min-w-0 flex-1">
        {/* Na telefonu popisek ustoupí jménu — 49 px na „Eva Testová" nestačilo. */}
        <span className="hidden sm:block t-label">{t('Zapisuje se jako')}</span>
        <span className="block font-bold text-[#16181A] text-sm truncate max-w-[7rem] sm:max-w-[11rem]">{active.name}</span>
      </span>
    </>
  );

  // Jediný člověk v celém týmu: není co přepnout ani koho přidat — štítek, ne tlačítko.
  if (!interaktivni) {
    return (
      <div className={`glass ${tvar}`} data-cip-osoby="stitek">
        {obsah}
      </div>
    );
  }

  return (
    <div ref={pop.ref} className="relative min-w-0 max-w-full">
      <button
        type="button"
        ref={pop.triggerRef}
        onClick={() => setOpen(v => !v)}
        onKeyDown={pop.onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        // v3: šedá pilulka (jako sekundární tlačítko), ne limetkový nádech — limetka
        // na obrazovce patří jen hlavní akci; kdo se zapisuje, nese avatar a jméno.
        className={vzhled}
      >
        {obsah}
        <Icon name="chevron" size={15} className="shrink-0 text-black/35" />
      </button>

      {open && (
        <MenuPanel ref={pop.panelRef} onKeyDown={pop.onPanelKeyDown} aria-label={t('Zapisovat jako')}
          className="absolute right-0 top-full mt-2 w-64 origin-top-right">
          {onShift.map(m => {
            const vybrany = m.id === active.id;
            return (
              <button
                type="button"
                key={m.id}
                role="menuitemradio"
                aria-checked={vybrany}
                onClick={() => { selectPerson(m.id); pop.close(); }}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 min-h-[52px] text-left transition-colors hover:bg-black/[0.05]"
              >
                <Avatar emoji={m.avatar} size="md" ring={false} />
                <span className={`text-[#16181A] truncate flex-1 ${vybrany ? 'font-bold' : 'font-medium'}`}>{m.name}</span>
                {vybrany && <Icon name="check" size={16} className="shrink-0 text-[#16181A]" />}
              </button>
            );
          })}
          {lzePridat && (
            <MenuItemButton icon="plus" label={t('Přidat příchod')} hint={t('Kolega přichází na směnu')}
              oddelit={onShift.length > 0 ? true : undefined} className="min-h-[52px]"
              onClick={() => { pop.close(); setPridat(true); }} />
          )}
        </MenuPanel>
      )}

      {pridat && (
        <Modal open onClose={() => setPridat(false)} size="sm" title={t('Kdo přichází?')} subtitle={t('Vyber se a odpíchni příchod PINem.')}>
          <PersonPicker
            members={offShift}
            onPick={m => { setPridat(false); punch(m); }}
            emptyText={t('Všichni z týmu už jsou na směně.')}
          />
        </Modal>
      )}
    </div>
  );
}

// Špatné PINy po lidech, přes zavření okna: pět za sebou = 30 s pauza (lib/pinTabletu).
// Hlavně pro tablet bez internetu — online hlídá pokusy přísněji server.
const spatnePiny = new Map<number, StavPokusu>();

export function PunchDialog({ member, now, onClose, onDone }: {
  member: RosterMember;
  now: number;
  onClose: () => void;
  onDone: (action: AkceTabletu, member: RosterMember, vysledek?: VysledekPichnuti, flashMsg?: string) => void;
}) {
  const t = useT('kiosk');
  const { offline, maOtisk, overPinOffline, zaradDoFronty } = useKioskShift();
  const on = !!member.openSince;
  // Na pauze: záznam po pauze bez konce — okno nabídne Konec pauzy, nebo rovnou odchod.
  const naPauze = !on && !!member.breakSince;
  // PIN i při odchodu: server ho u action=out vyžaduje (app/api/attendance/route.ts,
  // `isKiosk && (empPinHash || emp.pin)`), takže bez číselníku odchod člověka
  // s PINem končil „Nesprávný PIN". A podepsat odchod za kolegu je stejná lež
  // jako podepsat mu příchod. Pauza (kolo 8) chce PIN ze stejného důvodu.
  const needPin = member.hasPin;
  const [pin, setPin] = useState('');
  // Jak příchod sedí na rozpis — jen chip, nic se neblokuje (server posílá
  // vedení upozornění od stejných 10 minut).
  const rozpis = !on && !naPauze ? zpozdeniPrichodu(pragueToday(), member.shiftStart, now) : null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pinChybi = needPin && !pinKompletni(member.pinDelka, pin.length);
  // Pauza po pěti špatných PINech: odpočet si okno tiká samo (prop `now` jde jen po minutách).
  const [ted, setTed] = useState(() => Date.now());
  const pauza = needPin ? zbyvaPauza(spatnePiny.get(member.id), ted) : 0;
  useEffect(() => {
    if (!pauza) return;
    const i = setInterval(() => setTed(Date.now()), 1000);
    return () => clearInterval(i);
  }, [pauza > 0]);
  const spatnyPin = () => {
    const s = poSpatnemPinu(spatnePiny.get(member.id), Date.now());
    spatnePiny.set(member.id, s);
    setTed(Date.now());
    setPin('');
    // Během pauzy mluví odpočet níž (živě); po ní nezůstane stará věta.
    setErr(s.zamcenoDo > Date.now() ? '' : t('Nesprávný PIN'));
  };
  const zablokovano = pinChybi || pauza > 0;
  // Známá délka PINu = víc číslic se ani nenapíše; jinak nejvýš 6.
  const maxPin = tecekPinu(member.pinDelka, 6);

  /** Bez internetu: PIN proti otisku z posledního připojení, píchnutí do fronty. Pauza bez sítě nejde. */
  const offlinePichnuti = async (action: AkceTabletu): Promise<boolean> => {
    if (action !== 'in' && action !== 'out') { setErr(t('Pauza bez internetu nejde zapsat — zkus to, až bude tablet online.')); return false; }
    if (duvodProcNeOffline(member, maOtisk(member.id))) { setErr(t('Bez internetu nejde ověřit PIN — zkus to, až bude tablet online.')); return false; }
    if (needPin && !(await overPinOffline(member.id, pin))) { spatnyPin(); return false; }
    zaradDoFronty(member, action, needPin);
    onDone(action, member, undefined, action === 'in'
      ? t('{jmeno}: příchod uložený v tabletu — odešle se sám, až bude internet.', { jmeno: member.name })
      : t('{jmeno}: odchod uložený v tabletu — odešle se sám, až bude internet.', { jmeno: member.name }));
    return true;
  };

  const submit = async (action: AkceTabletu) => {
    if (needPin && zbyvaPauza(spatnePiny.get(member.id), Date.now()) > 0) return;
    setErr(''); setBusy(true);
    try {
      if (offline) { await offlinePichnuti(action); return; }
      const res = await fetch('/api/attendance', {
        method: 'POST', headers: JSON_HLAVICKA,
        body: JSON.stringify({ employeeId: member.id, action, pin: needPin ? pin : undefined }),
      });
      const d = await res.json();
      if (res.ok) {
        spatnePiny.delete(member.id);
        // Odpověď nese entry (clockIn, clockOut) a closingDone — handler z nich složí souhrn směny
        // a bez uzávěrky varuje; pauza (break_start/break_end) souhrn nemá.
        onDone(action, member, { entry: d.entry ?? null, closingDone: typeof d.closingDone === 'boolean' ? d.closingDone : null });
      } else if (needPin && res.status === 403 && d.error === 'Nesprávný PIN') { // i18n-ok (hláška serveru, porovnání)
        spatnyPin();
      } else {
        setErr(d.error || t('Nepodařilo se zaznamenat.'));
        setPin('');
      }
    } catch (e) {
      // Síť spadla uprostřed: ještě to zkusit uložit do fronty, ne jen říct „Chyba serveru".
      if (jeVypadekSite(e)) { try { await offlinePichnuti(action); } catch { setErr(t('Chyba serveru.')); } }
      else setErr(t('Chyba serveru.'));
    } finally { setBusy(false); }
  };

  // Sdílené okno místo ručně psaného překryvu (zákaz č. 23): Escape, past
  // fokusu, vyjetí zdola na telefonu a DiscardGuard má Modal sám.
  // Tlačítka na tabletu: tři velká (≥ 48 px) — Zpět a Pauza vedle sebe, odchod přes celou šířku,
  // ať se „Odpíchnout odchod" nikdy nezalomí ani na 390 px. Potvrzení v okně je `primary`
  // (DP §3.1: limetka patří obrazovce, ne modálu), odchod `danger-solid` — ukončuje směnu.
  const paticka = naPauze ? (
    <div className="grid grid-cols-2 gap-2 w-full">
      <Button variant="secondary" size="lg" className="!h-14" onClick={onClose}>{t('Zpět')}</Button>
      <Button variant="danger-solid" size="lg" className="!h-14" disabled={zablokovano || busy} onClick={() => submit('out')}>{t('Odpíchnout odchod')}</Button>
      <Button variant="primary" size="lg" icon="play" className="col-span-2 !h-14" loading={busy} disabled={zablokovano} onClick={() => submit('break_end')}>{t('Konec pauzy')}</Button>
    </div>
  ) : on ? (
    <div className="grid grid-cols-2 gap-2 w-full">
      <Button variant="secondary" size="lg" className="!h-14" onClick={onClose}>{t('Zpět')}</Button>
      <Button variant="secondary" size="lg" icon="cup" className="!h-14" disabled={zablokovano || busy} onClick={() => submit('break_start')}>{t('Pauza')}</Button>
      <Button variant="danger-solid" size="lg" icon="logout" className="col-span-2 !h-14" loading={busy} disabled={zablokovano} onClick={() => submit('out')}>{t('Odpíchnout odchod')}</Button>
    </div>
  ) : (
    <>
      <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>{t('Zpět')}</Button>
      <Button variant="primary" size="lg" className="flex-1" loading={busy} disabled={zablokovano} onClick={() => submit('in')}>{t('Odpíchnout příchod')}</Button>
    </>
  );
  return (
    <Modal open onClose={onClose} size="sm" title={member.name}
      subtitle={on
        ? t('Na směně od {cas} · {doba}', { cas: timeOf(member.openSince!), doba: elapsed(member.openSince!, now) })
        : naPauze
          ? t('Na pauze od {cas} · {doba}', { cas: timeOf(member.breakSince!), doba: elapsed(member.breakSince!, now) })
          : t('Zaznamenej příchod na směnu')}
      footer={paticka}>
      <div className="text-center">
        <Avatar emoji={member.avatar} size="xl" ring={false} />
        {offline && <p className="note note-wait text-sm mt-3 text-left" role="status">{t('Tablet je bez internetu. Píchnutí se uloží a odešle samo, až bude síť.')}</p>}
        {!on && !naPauze && member.shiftStart && (
          <p className="mt-2 flex flex-wrap justify-center gap-1.5">
            <Chip tone="info" icon="calendar" className="tabular-nums">{t('Dnes máš směnu {od}–{do}', { od: fmtHM(member.shiftStart), do: fmtHM(member.shiftEnd) })}</Chip>
            {rozpis?.druh === 'pozde' && <Chip tone="wait" icon="clock" className="tabular-nums">{t('Přicházíš o {n} min později', { n: rozpis.min })}</Chip>}
            {rozpis?.druh === 'brzy' && <Chip tone="info" icon="clock" className="tabular-nums">{t('Směna začíná za {n} min', { n: rozpis.min })}</Chip>}
          </p>
        )}

        {needPin && (
          <div className="mt-5">
            <p className="t-meta mb-3">{on ? t('Zadej PIN pro odchod') : naPauze ? t('Zadej PIN pro konec pauzy nebo odchod') : t('Zadej PIN pro příchod')}</p>
            {/* Tečky nesou délku PINu i pro odečítač (role=img s popisem). */}
            <div className="flex justify-center gap-2 mb-3" role="img" aria-label={t('Zadáno číslic: {n}', { n: pin.length })}>
              {Array.from({ length: tecekPinu(member.pinDelka, pin.length) }, (_, i) => i).map(i => (
                <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'bg-[#C8F542] ring-1 ring-black/15' : 'bg-black/15'}`} />
              ))}
            </div>
            {/* Klávesy jsou sdílená tlačítka (zákaz č. 1), číslice 18 px z řady (T13).
                Smazání je ikona s popiskem, ne znak backspace, který odečítač přečte jako nesmysl. */}
            <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
              {['1','2','3','4','5','6','7','8','9'].map(k => (
                <Button key={k} variant="secondary" size="lg" className="text-lg tabular-nums"
                  onClick={() => setPin(p => (p.length < maxPin ? p + k : p))}>{k}</Button>
              ))}
              <span />
              <Button variant="secondary" size="lg" className="text-lg tabular-nums"
                onClick={() => setPin(p => (p.length < maxPin ? p + '0' : p))}>0</Button>
              <Button variant="secondary" size="lg" iconOnly icon="undo" aria-label={t('Smazat číslici')} title={t('Smazat číslici')}
                className="w-full" disabled={pin.length === 0} onClick={() => setPin(p => p.slice(0, -1))} />
            </div>
          </div>
        )}

        {pauza > 0
          ? <p role="alert" className="text-sm text-bad-ink mt-4 tabular-nums">{t('Moc špatných PINů. Zkus to za {n} s.', { n: pauza })}</p>
          : err && <p role="alert" className="text-sm text-bad-ink mt-4">{err}</p>}
      </div>
    </Modal>
  );
}

/**
 * Okno „{jméno}, díky za směnu" po odpíchnutí odchodu (kolo 7, R7-7). Člověk si u baru
 * zkontroluje hodiny kvůli mzdě — Příchod · Odchod · Odpracováno čitelné z metru (Stat 28 px,
 * dvě čísla vedle sebe a odpracovaný čas přes celý řádek). Chybí-li uzávěrka, Chip
 * „Uzávěrka chybí" a hlavní akce vede rovnou na záložku Uzávěrka.
 *
 * Sdílený tablet (DESIGN „Sdílený tablet a identita"): okno se po 20 s zavře samo a odpočet
 * je vidět; jakmile se kdokoli tabletu dotkne, odpočet se zastaví — někdo u něj stojí a čte.
 * Kreslí se uvnitř NavigaceKontext tabletu (KioskShell), ne v KioskShiftProvider: tam by
 * useNavigace() vedla nikam.
 */
export function SouhrnPoOdchodu() {
  const t = useT('kiosk');
  const nav = useNavigace();
  const money = useMoney();
  const { souhrn, zavriSouhrn } = useKioskShift();
  const [zbyva, setZbyva] = useState(SOUHRN_ZAVRIT_S);
  const [zastaveno, setZastaveno] = useState(false);
  const otevreno = souhrn != null;
  // Kolo 9 (N1): „Udělal(a) jsi dnes něco navíc?" — pilulky nabídky zapíšou jedním klepnutím za toho,
  // kdo právě odešel (actingAs = jeho id, nikdy bez něj), „Napsat…" otevře okno s klávesnicí tabletu.
  // Nabídka se načte až s otevřeným souhrnem (jedna odpověď /api/navic za vybraného člověka).
  const navic = useDataNavic(souhrn ? urlNavicMine(souhrn.id) : null);
  // Kolo 11: úkoly za body toho, kdo odešel (UkolyZaBody s actingAs, jen „Hotovo" — po směně se nic nebere).
  // Holé pilulky z /api/navic zůstávají jen jako záloha, kdyby /api/navic/ukoly nic nevrátilo (starší server, chyba).
  const zaBody = useUkolyZaBody(souhrn ? urlUkolyZaBody(souhrn.id) : null);
  const ukolyZaBody = zaBody.data ?? [];
  const [navicOkno, setNavicOkno] = useState(false);
  const [navicZapisuji, setNavicZapisuji] = useState<number | null>(null);
  const [navicHotovo, setNavicHotovo] = useState<string | null>(null);
  const [navicChyba, setNavicChyba] = useState<string | null>(null);
  const dnes = pragueToday();
  const zapisZNabidky = async (n: NabidkaNavic) => {
    if (!souhrn || navicZapisuji != null) return;
    setNavicZapisuji(n.id);
    setNavicChyba(null);
    setZastaveno(true);
    try {
      const d = await fetch(URL_NAVIC, {
        method: 'POST', headers: JSON_HLAVICKA,
        body: JSON.stringify({ text: n.title, offerId: n.id, day: dnes, actingAs: souhrn.id }),
      }).then(okJson);
      const uznano = d?.item?.status === 'uznano';
      setNavicHotovo(uznano ? t('Zapsáno a uznáno: +{n} b. Díky!', { n: Number(d?.item?.points) || n.points }) : t('Zapsáno, díky! Vedení to uzná.'));
      obnovNavic();
    } catch (e) {
      setNavicChyba(apiMessage(e, t('Zápis se neuložil.')));
    }
    setNavicZapisuji(null);
  };

  // Nové okno = nový odpočet (dva odchody po sobě).
  useEffect(() => { setZbyva(SOUHRN_ZAVRIT_S); setZastaveno(false); setNavicHotovo(null); setNavicChyba(null); setNavicOkno(false); }, [souhrn]);
  useEffect(() => {
    if (!otevreno || zastaveno) return;
    const tik = setInterval(() => setZbyva(n => n - 1), 1000);
    return () => clearInterval(tik);
  }, [otevreno, zastaveno, souhrn]);
  useEffect(() => { if (otevreno && !zastaveno && zbyva <= 0) zavriSouhrn(); }, [otevreno, zastaveno, zbyva, zavriSouhrn]);
  // Dotyk kdekoli na tabletu (i mimo okno) odpočet zastaví.
  useEffect(() => {
    if (!otevreno || zastaveno) return;
    const stop = () => setZastaveno(true);
    window.addEventListener('pointerdown', stop, true);
    window.addEventListener('keydown', stop, true);
    return () => { window.removeEventListener('pointerdown', stop, true); window.removeEventListener('keydown', stop, true); };
  }, [otevreno, zastaveno]);

  if (!souhrn) return null;
  const { data } = souhrn;
  const kUzaverce = data.chybiUzaverka && nav.smiPohled('closing');
  return (
    <Modal open onClose={zavriSouhrn} size="sm" title={t('{jmeno}, díky za směnu', { jmeno: souhrn.jmeno })}
      footer={kUzaverce ? <>
        <Button variant="secondary" size="lg" className="flex-1" onClick={zavriSouhrn}>{t('Hotovo')}</Button>
        <Button variant="primary" size="lg" icon="trend" className="flex-1" onClick={() => { zavriSouhrn(); nav.onNavigate('closing'); }}>{t('Vyplnit uzávěrku')}</Button>
      </> : (
        <Button variant="primary" size="lg" className="flex-1" onClick={zavriSouhrn}>{t('Hotovo')}</Button>
      )}>
      <div data-souhrn-odchodu>
        <StatRow podleKarty>
          <Stat label={t('Příchod')} value={data.prichod} />
          <Stat label={t('Odchod')} value={data.odchod} note={data.presPulnoc ? t('další den') : undefined} />
          <Stat label={t('Odpracováno')} value={data.odpracovano} />
        </StatRow>
        {data.chybiUzaverka && (
          <p className="mt-4 flex flex-wrap items-center gap-2">
            <Chip tone="wait" icon="warning">{t('Uzávěrka chybí')}</Chip>
            <span className="t-meta text-pretty">{t('Za tuhle směnu ještě není vyplněná.')}</span>
          </p>
        )}
        {navic.data?.smi.zapsat !== false && (
          <div className="mt-4 pt-4 border-t border-[var(--surface-line)]" data-navic-tablet>
            {navicHotovo ? (
              <p className="note note-ok flex items-center gap-2" role="status"><Icon name="check" size={17} className="shrink-0" />{navicHotovo}</p>
            ) : (
              <>
                <p className="t-card">{t('Udělal(a) jsi dnes něco navíc?')}</p>
                {ukolyZaBody.length > 0 ? (
                  <>
                    <p className="t-meta mt-0.5 text-pretty">{t('Úkoly za body: klepni na Hotovo u toho, co jsi udělal(a), nebo napiš vlastní věc.')}</p>
                    <div className="mt-2" data-za-body-tablet>
                      <UkolyZaBody ukoly={ukolyZaBody} actingAs={souhrn.id} jmeno={souhrn.jmeno} poOdchodu velke
                        onZapsano={item => { setZastaveno(true); setNavicHotovo(item.status === 'uznano' ? t('Zapsáno a uznáno: +{n} b. Díky!', { n: item.points ?? 0 }) : t('Zapsáno, díky! Vedení to uzná.')); }} />
                    </div>
                  </>
                ) : <p className="t-meta mt-0.5 text-pretty">{t('Klepni na položku, nebo to napiš — vedení to uvidí a může to ocenit.')}</p>}
                {ukolyZaBody.length === 0 && navic.data && navic.data.nabidka.length > 0 && (
                  <NabidkaChipy className="mt-3" nabidka={navic.data.nabidka} dnesniZapisy={navic.data.items.filter(z => z.day === dnes)}
                    vybrane={navicZapisuji} onVyber={n => void zapisZNabidky(n)} money={money} velke />
                )}
                <Button variant="secondary" size="lg" icon="pencil" className="mt-3" loading={navicZapisuji != null}
                  onClick={() => { setZastaveno(true); setNavicOkno(true); }}>{t('Napsat…')}</Button>
                {navicChyba && <p className="note note-danger text-sm mt-3" role="alert">{navicChyba}</p>}
              </>
            )}
          </div>
        )}
        <p className="mt-4 t-meta tabular-nums" aria-live="off">
          {zastaveno ? t('Okno zůstane otevřené, dokud ho nezavřeš.') : t('Zavře se samo za {n} s', { n: Math.max(0, zbyva) })}
        </p>
      </div>
      <ZapsatNavic open={navicOkno} onClose={() => setNavicOkno(false)} actingAs={souhrn.id} jmeno={souhrn.jmeno} predvolby={{ day: dnes }}
        onUlozeno={item => setNavicHotovo(item.status === 'uznano' ? t('Zapsáno a uznáno: +{n} b. Díky!', { n: item.points ?? 0 }) : t('Zapsáno, díky! Vedení to uzná.'))} />
    </Modal>
  );
}
