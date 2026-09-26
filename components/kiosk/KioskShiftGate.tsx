'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, ListRow, MenuPanel, Modal, Toast } from '../ui';
import { usePopover } from '@/lib/usePopover';
import { parseDbTime, dbTimeHM } from '@/lib/pragueTime';
import { nextActiveId, IDLE_MS } from '@/lib/kioskIdentity';

export interface RosterMember {
  id: number;
  name: string;
  avatar?: string | null;
  hasPin: boolean;
  openSince: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
}

export interface ActivePerson {
  id: number;
  name: string;
  avatar: string;
}

const LS_ACTIVE = 'managero-kiosk-active';
const LS_ACTIVE_OLD = 'pangea-kiosk-active';
// The active person is mirrored into a cookie so server routes can attribute
// work to them even for shared components that post their own request bodies
// (the procedure runner, for example). Server side it is only ever honoured for
// a kiosk session whose target is clocked in — see app/api/tasks/route.ts.
const ACTING_COOKIE = 'managero-kiosk-acting';
// Šestnáct hodin tu bývalo „jedna dlouhá směna". Jenže tablet u baru není
// něčí telefon: identita v něm nedrží proto, že ji člověk potvrdil, ale
// proto, že nikdo nesáhl na tlačítko. Hodina, obnovovaná každým dotykem,
// odpovídá tomu, jak dlouho u tabletu opravdu někdo stojí.
const ACTING_MAX_AGE = 60 * 60;
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
}

const Ctx = createContext<KioskShiftValue | null>(null);

export function useKioskShift(): KioskShiftValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useKioskShift must be used within a KioskShiftProvider');
  return v;
}

export function KioskShiftProvider({ children }: { children: React.ReactNode }) {
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [punching, setPunching] = useState<RosterMember | null>(null);
  // Hlášení tabletu jde přes sdílený Toast (role=status, dole uprostřed).
  // `id` odliší dvě stejná hlášení po sobě, jinak by druhé dostalo zbytek času prvního.
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'bad'; id: number } | null>(null);
  const now = useNow();
  const [loadFailed, setLoadFailed] = useState(false);
  /** Kdy se naposled někdo tabletu dotkl — podle toho se pozná nečinnost. */
  const touchedAt = useRef(0);

  const reload = useCallback(async () => {
    try {
      // `res.ok` se musí kontrolovat zvlášť: `fetch` vyhodí výjimku jen
      // když spojení vůbec nevznikne. Odpověď 500 se doručí úspěšně a bez
      // téhle kontroly vypadá jako platná data s prázdným rozpisem —
      // tedy přesně ta tichá lež, kvůli které se tohle opravuje.
      const res = await fetch('/api/attendance');
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      if (Array.isArray(d.roster)) setRoster(d.roster);
      setLoadFailed(false);
    } catch {
      // Při výpadku necháme na obrazovce poslední známý rozpis — na tabletu
      // za barem je lepší mít staré jméno než prázdno. Jenomže když selže
      // hned to první načtení, žádné staré jméno není a obrazovka pak psala
      // „Zatím tu nikdo není — zaměstnance přidá vedení". To je lež: tým
      // v aplikaci je, jen k němu tablet nedosáhl, a obsluha místo
      // zkontrolování wifi volala šéfovi.
      setLoadFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  // Keep in sync with the employer app and any second tablet.
  useEffect(() => { const t = setInterval(reload, 20000); return () => clearInterval(t); }, [reload]);

  const onShift = useMemo(() => roster.filter(m => m.openSince), [roster]);
  const offShift = useMemo(() => roster.filter(m => !m.openSince), [roster]);

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
    const bump = () => { touchedAt.current = Date.now(); };
    bump();
    window.addEventListener('pointerdown', bump, true);
    window.addEventListener('keydown', bump, true);
    return () => {
      window.removeEventListener('pointerdown', bump, true);
      window.removeEventListener('keydown', bump, true);
    };
  }, []);
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
    writeActingCookie(activeId);
  }, [hydrated, activeId]);

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

  const value: KioskShiftValue = {
    roster, onShift, offShift, loading, loadFailed, activeId, active,
    requireActive,
    selectPerson: setActiveId,
    punch: setPunching,
    reload,
  };

  const answer = (who: ActivePerson | null) => {
    if (who) { setActiveId(who.id); touchedAt.current = Date.now(); }
    asking?.(who);
    setAsking(null);
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Tablet se ptá místo aby hádal. Zavřít jde — ale pak se nic nezapíše,
          protože zápis pod cizí jméno je horší než žádný zápis. */}
      {asking && (
        <Modal open onClose={() => answer(null)} title="Kdo teď u tabletu stojí?"
          subtitle="Pod tímhle jménem se práce zapíše." size="lg">
          <PersonPicker
            members={onShift}
            onPick={m => answer({ id: m.id, name: m.name, avatar: m.avatar || '👤' })}
            emptyText="Nikdo není na směně. Nejdřív se odpíchni."
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
          onDone={(action, member, msg) => {
            setPunching(null);
            // Kdo právě přišel, ten teď u tabletu stojí. Jenže tohle je
            // přepnutí cizí identity — když předtím byl vybraný někdo jiný,
            // musí to být vidět, ne se stát potichu za jeho zády.
            const switchedFrom = action === 'in' && activeId != null && activeId !== member.id
              ? (onShift.find(m => m.id === activeId)?.name ?? null)
              : null;
            if (action === 'in') { setActiveId(member.id); touchedAt.current = Date.now(); }
            reload();
            if (msg) showFlash(msg, 'bad');
            if (switchedFrom) showFlash(`Zapisuje se teď jako ${member.name}, ne ${switchedFrom}. Přepni nahoře u jména, jestli to není tak.`, 'bad');
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
            title="Rozpis se nenačetl"
            hint="Tablet se nedostal na server — zkontroluj připojení. Lidé v týmu tam jsou, jen je odsud teď není vidět."
            onRetry={() => { void reload(); }}
          />
        ) : !picking ? (
          <>
            <div className="mx-auto h-20 w-20 rounded-3xl bg-[#16181A] text-[#C8F542] grid place-items-center">
              <Icon name="clock" size={38} />
            </div>
            <h2 className="t-page mt-6 text-balance">Tablet čeká na směnu</h2>
            <p className="text-black/50 mt-3 max-w-md mx-auto leading-relaxed">
              Odemkne se, jakmile se někdo přihlásí na směnu. Všechno, co pak na tabletu uděláš,
              se zapíše pod tvoje jméno.
            </p>
            {/* Jediná akce zamčeného tabletu → jediná limetka (DP §3.1). */}
            <Button variant="accent" size="lg" icon="play" className="mt-8" onClick={() => setPicking(true)}>
              Jsem na směně
            </Button>
            {roster.length === 0 && (
              <EmptyState illustration="tym" title="Zatím tu nikdo není" hint="Zaměstnance přidá vedení v aplikaci v Nastavení týmu — pak se tady odpíchnou." compact />
            )}
          </>
        ) : (
          <>
            <h2 className="t-page text-balance">Kdo přichází na směnu?</h2>
            <p className="t-meta mt-2">Ťukni na sebe a zaznamenej příchod.</p>
            <div className="mt-7">
              <PersonPicker
                members={roster}
                onPick={punch}
                emptyText="Zatím žádní zaměstnanci. Přidej je v aplikaci vedení (Nastavení týmu)."
              />
            </div>
            <Button variant="secondary" size="lg" className="mt-7" onClick={() => setPicking(false)}>
              Zpět
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Big tap-target grid of people — used on the lock screen and for late arrivals. */
export function PersonPicker({ members, onPick, emptyText }: {
  members: RosterMember[];
  onPick: (m: RosterMember) => void;
  emptyText: string;
}) {
  if (members.length === 0) {
    return <p className="t-meta py-6">{emptyText}</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
      {members.map(m => (
        // Jamka, ne karta: výběr leží v kartě zamykací obrazovky nebo „Kdo teď
        // pracuje" a karta v kartě se nedělá (DP §3.9). Velká plocha zůstává —
        // u baru se ťuká na délku paže.
        <button
          type="button"
          key={m.id}
          onClick={() => onPick(m)}
          className="well p-5 text-left min-h-[112px] hover:bg-black/[0.05] active:scale-[0.98] transition"
        >
          <Avatar emoji={m.avatar} size="xl" ring={false} />
          <span className="block t-card mt-3 truncate">{m.name}</span>
          {m.openSince ? (
            <span className="block text-sm font-semibold text-ok-ink mt-0.5">Na směně</span>
          ) : m.shiftStart ? (
            <span className="block t-meta tabular-nums mt-0.5">Dnes {m.shiftStart}–{m.shiftEnd}</span>
          ) : (
            <span className="block t-meta mt-0.5">Mimo směnu</span>
          )}
        </button>
      ))}
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
  const { onShift, offShift, activeId, selectPerson, punch } = useKioskShift();
  const [adding, setAdding] = useState(false);
  const now = useNow();

  return (
    <Card as="section" aria-labelledby="kiosk-kdo-pracuje">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="kiosk-kdo-pracuje" className="t-card flex items-center gap-2 min-w-0">
          <Icon name="clock" size={17} className="shrink-0 text-black/40" />
          <span className="truncate">Kdo teď pracuje</span>
        </h2>
        {/* Na tabletu u baru cíle nejméně 44 px (DESIGN.md, Kiosk) — proto md, ne sm. */}
        <Button variant="secondary" icon={adding ? 'close' : 'plus'} aria-expanded={adding} onClick={() => setAdding(v => !v)}>
          {adding ? 'Zavřít' : 'Další příchod'}
        </Button>
      </div>

      <ul className="list mt-3">
        {onShift.map(m => {
          const isActive = m.id === activeId;
          return (
            <ListRow
              key={m.id}
              lead={<Avatar emoji={m.avatar} size="md" ring={false} />}
              title={m.name}
              meta={<span className="tabular-nums">Na směně {elapsed(m.openSince!, now)}</span>}
              right={isActive
                ? <Chip tone="ok" icon="check">Zapisuje se</Chip>
                : <Button variant="secondary" onClick={() => selectPerson(m.id)} aria-label={`Zapisovat jako ${m.name}`}>Přepnout</Button>}
              actions={
                <Button variant="ghost" iconOnly icon="logout" title={`Odchod – ${m.name}`}
                  aria-label={`Odchod – ${m.name}`} onClick={() => punch(m)} />
              }
            />
          );
        })}
      </ul>

      {adding && (
        <div className="mt-4 pt-4 border-t border-black/[0.06]">
          <p className="t-meta mb-3">Kdo dále nastupuje na směnu?</p>
          <PersonPicker
            members={offShift}
            onPick={m => { setAdding(false); punch(m); }}
            emptyText="Všichni z týmu už jsou na směně."
          />
        </div>
      )}
    </Card>
  );
}

/** Header chip: who the tablet is recording as, plus a one-tap switcher. */
export function ActivePersonChip() {
  const { active, onShift, selectPerson, requireActive } = useKioskShift();
  const [open, setOpen] = useState(false);

  // Bez vybraného člověka se dřív odznak prostě nevykreslil — u baru to
  // vypadalo, že tablet nikoho nezapisuje, a přitom stačilo ťuknout na úkol
  // a zapsal se pod tablet. Místo prázdna se tedy ptáme.
  if (!active) {
    if (onShift.length === 0) return null;
    return (
      <button type="button" onClick={() => { void requireActive(); }}
        className="flex items-center gap-2.5 rounded-full glass border border-wait/50 bg-wait/[0.14] pl-3.5 pr-4 py-2 min-h-[44px] hover:bg-wait/20 transition">
        <Icon name="warning" size={17} className="text-wait-ink shrink-0" />
        <span className="text-left leading-tight">
          <span className="hidden sm:block t-label">Zapisuje se jako</span>
          <span className="block font-bold text-[#16181A] text-sm">Kdo jsi?</span>
        </span>
      </button>
    );
  }
  const canSwitch = onShift.length > 1;

  return <PrepinacOsoby active={active} onShift={onShift} canSwitch={canSwitch} selectPerson={selectPerson} />;
}

/**
 * Čip „Zapisuje se jako" s nabídkou lidí na směně. Dřív vlastní div s neviditelnou
 * vrstvou přes obrazovku: Escape ho nezavřel, šipky nechodily a fokus se po
 * zavření ztratil (DP §3.9). Teď sdílený MenuPanel s usePopover — stejné
 * chování jako menu „···". Vybraný člověk nese fajfku a aria-checked, ne
 * limetkový podklad (limetka na obrazovce patří jen hlavní akci).
 */
function PrepinacOsoby({ active, onShift, canSwitch, selectPerson }: {
  active: ActivePerson; onShift: RosterMember[]; canSwitch: boolean; selectPerson: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const pop = usePopover(open, setOpen, { focusFirst: true, arrowKeys: true });

  return (
    <div ref={pop.ref} className="relative">
      <button
        type="button"
        ref={pop.triggerRef}
        onClick={() => canSwitch && setOpen(v => !v)}
        onKeyDown={canSwitch ? pop.onTriggerKeyDown : undefined}
        aria-haspopup={canSwitch ? 'menu' : undefined}
        aria-expanded={canSwitch ? open : undefined}
        className={`flex items-center gap-2.5 rounded-full glass border border-[#C8F542]/45 bg-[#C8F542]/[0.14] pl-2.5 pr-4 py-2 min-h-[44px] transition ${
          canSwitch ? 'hover:bg-[#C8F542]/20' : 'cursor-default'
        }`}
      >
        <Avatar emoji={active.avatar} size="sm" ring={false} />
        <span className="text-left leading-tight min-w-0">
          {/* Na telefonu popisek ustoupí jménu — 49 px na „Eva Testová" nestačilo. */}
          <span className="hidden sm:block t-label">Zapisuje se jako</span>
          <span className="block font-bold text-[#16181A] text-sm truncate max-w-[7rem] sm:max-w-[11rem]">{active.name}</span>
        </span>
        {canSwitch && <Icon name="chevron" size={15} className="text-black/35" />}
      </button>

      {open && canSwitch && (
        <MenuPanel ref={pop.panelRef} onKeyDown={pop.onPanelKeyDown} aria-label="Zapisovat jako"
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
        </MenuPanel>
      )}
    </div>
  );
}

export function PunchDialog({ member, now, onClose, onDone }: {
  member: RosterMember;
  now: number;
  onClose: () => void;
  onDone: (action: 'in' | 'out', member: RosterMember, flashMsg?: string) => void;
}) {
  const on = !!member.openSince;
  const needPin = member.hasPin && !on; // PIN only required to clock in
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: member.id, action: on ? 'out' : 'in', pin: needPin ? pin : undefined }),
      });
      const d = await res.json();
      if (res.ok) {
        if (d.action === 'out' && d.closingDone === false) {
          onDone('out', member, `${member.name}: odchod zaznamenán — nezapomeň vyplnit uzávěrku směny!`);
        } else {
          onDone(on ? 'out' : 'in', member);
        }
      } else {
        setErr(d.error || 'Nepodařilo se zaznamenat.');
        setPin('');
      }
    } catch { setErr('Chyba serveru.'); }
    setBusy(false);
  };

  // Sdílené okno místo ručně psaného překryvu (zákaz č. 23): Escape, past
  // fokusu, vyjetí zdola na telefonu a DiscardGuard má Modal sám.
  return (
    <Modal open onClose={onClose} size="sm" title={member.name}
      subtitle={on
        ? `Na směně od ${timeOf(member.openSince!)} · ${elapsed(member.openSince!, now)}`
        : 'Zaznamenej příchod na směnu'}
      footer={<>
        {/* Potvrzení v okně je `primary` (DP §3.1: limetka patří obrazovce,
            ne modálu), odchod `danger-solid` — ukončuje směnu. */}
        <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>Zpět</Button>
        <Button variant={on ? 'danger-solid' : 'primary'} size="lg" className="flex-1" loading={busy}
          disabled={needPin && pin.length < 4} onClick={submit}>
          {on ? 'Odpíchnout odchod' : 'Odpíchnout příchod'}
        </Button>
      </>}>
      <div className="text-center">
        <Avatar emoji={member.avatar} size="xl" ring={false} />
        {!on && member.shiftStart && (
          <p className="mt-2">
            <Chip tone="info" icon="calendar" className="tabular-nums">Dnes máš směnu {member.shiftStart}–{member.shiftEnd}</Chip>
          </p>
        )}

        {needPin && (
          <div className="mt-5">
            {/* Tečky nesou délku PINu i pro odečítač (role=img s popisem). */}
            <div className="flex justify-center gap-2 mb-3" role="img" aria-label={`Zadáno číslic: ${pin.length}`}>
              {[0, 1, 2, 3].map(i => (
                <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'bg-[#C8F542] ring-1 ring-black/15' : 'bg-black/15'}`} />
              ))}
            </div>
            {/* Klávesy jsou sdílená tlačítka (zákaz č. 1), číslice 18 px z řady (T13).
                Smazání je ikona s popiskem, ne znak backspace, který odečítač přečte jako nesmysl. */}
            <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
              {['1','2','3','4','5','6','7','8','9'].map(k => (
                <Button key={k} variant="secondary" size="lg" className="text-lg tabular-nums"
                  onClick={() => setPin(p => (p.length < 6 ? p + k : p))}>{k}</Button>
              ))}
              <span />
              <Button variant="secondary" size="lg" className="text-lg tabular-nums"
                onClick={() => setPin(p => (p.length < 6 ? p + '0' : p))}>0</Button>
              <Button variant="secondary" size="lg" iconOnly icon="undo" aria-label="Smazat číslici" title="Smazat číslici"
                className="w-full" disabled={pin.length === 0} onClick={() => setPin(p => p.slice(0, -1))} />
            </div>
          </div>
        )}

        {err && <p role="alert" className="text-sm text-bad-ink mt-4">{err}</p>}
      </div>
    </Modal>
  );
}
