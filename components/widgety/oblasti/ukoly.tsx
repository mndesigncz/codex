'use client';

// Widgety oblasti „Úkoly" — komponenty (kolo 68 a 69, spec §2.5, §2.6 a §6.3).
//
// Vlastník v kole 69: balík B6a (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/ukoly.ts,
// výpočty (po termínu, podle lidí, splněno dnes) v lib/ukolyPrehled.ts; tady je jen
// kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'` v katalogu —
// test AK-20 v scripts/testy/k68-widgety.ts klíče čte z textu, proto bez spreadu.
//
// Kontrakt (spec §2.6): komponenta dostane WidgetProps (instance, velikost, nastaveni,
// nahled), kreslí se vždy v obalu <Widget> z ../Widget, data bere jen přes useDataWidgetu
// (URL null, dokud neplatí brána z registru a useSmi pro pole), navigaci přes useNavigace.
// Všechny widgety čtou jeden /api/tasks — sdílená mezipaměť, jeden dotaz i s nástrojem
// Úkolů pod nimi; odškrtnutí ve widgetu obnoví seznam v nástroji a naopak.
//
// Co tu je:
//  - ukoly.dnes (kolo 68) — dnešní úkoly s odškrtnutím; co je po termínu, je nahoře.
//  - ukoly.po_terminu — kolik je po termínu (S) a čí (M). Celý tým jen s ukoly.zobrazit_tym
//    (tak to pustí i /api/tasks), jinak moje a pro kohokoli.
//  - ukoly.podle_lidi — kolik má kdo aktivních a po termínu; klepnutí filtruje seznam
//    v nástroji (na jiné stránce otevře Úkoly už vyfiltrované).
//  - ukoly.tyden — týdenní tabule (TaskWeekBoard), přetahuje se jen vlastní zadané nebo
//    s ukoly.upravit, odškrtává se jen dnešek a dřív.
//  - ukoly.splneno_dnes — co dnes kdo dokončil (completedAt z API, kolo 69).

import { useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Chip, ListRow, Stat } from '../../ui';
import { Icon } from '../../Icons';
import TaskWeekBoard from '../../TaskWeekBoard';
import { useCurrency } from '../../CurrencyProvider';
import type { KomponentaWidgetu, Navigace, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { Widget, type StavNacteni } from '../Widget';
import { useDataWidgetu, type StavDat } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { useOpravneni } from '../../role/useOpravneni';
import { apiMessage, okJson } from '@/lib/api';
import { pragueToday, pragueHM } from '@/lib/pragueTime';
import { czCount, czForm, DEN, type CzNoun } from '@/lib/czech';
import {
  vyberUkoly, vRozsahu, poTerminu, podleLidi, splnenoDnes, jeCiziUkol, type Ukol, type RozsahUkolu,
} from '@/lib/ukolyPrehled';

// ---------------------------------------------------------------------------
// Pomocníci (záměrně v souboru — oblast je samostatný líný kus s jedním vlastníkem)
// ---------------------------------------------------------------------------

/** Tutéž adresu čtou nástroje Úkolů (TaskManager, Tasks) — jeden dotaz na stránku. */
export const URL_UKOLY = '/api/tasks';

/**
 * Filtr seznamu Úkolů podle člověka z widgetu Úkoly podle lidí. Nástroj na
 * téže stránce ho přijme synchronně (`detail.prijato`); jinde widget uloží
 * přání do sessionStorage a otevře Úkoly — layout argument pohledu tasks nenese
 * (patří jinému balíku), nástroj si ho při připojení přečte sám.
 */
export const UDALOST_FILTR_UKOLU = 'managero:filtr-ukolu';
export const KLIC_FILTRU_UKOLU = 'managero-ukoly-filtr';

const RELACE_NACITA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };
const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

export const UKOL: CzNoun = { one: 'úkol', few: 'úkoly', many: 'úkolů' };
const cislo = (n: number) => n.toLocaleString('cs-CZ');
const aDalsich = (n: number) => `…a dalších ${cislo(n)}`;

/**
 * Id přihlášeného — „moje" úkoly jsou ty s `assignedTo` = já. Kontrakt widgetu
 * uživatele nenese; do načtení relace drží `stav` widget na kostře.
 */
export function useJa(): { id: number | null; stav: StavNacteni | null } {
  const { data, status, update } = useSession();
  if (status === 'loading') return { id: null, stav: RELACE_NACITA };
  const id = Number((data?.user as { id?: unknown } | undefined)?.id);
  if (Number.isFinite(id) && id > 0) return { id, stav: null };
  return { id: null, stav: { data: null, error: 'Nevím, kdo je přihlášený — obnov stránku.', loading: false, reload: () => { void update(); } } };
}

/**
 * Brána widgetu: všechny klíče z `vse` a aspoň jeden z `nektere`, až po
 * načtení oprávnění. Samotné `ma()` před načtením vrací ANO a dotaz by
 * odešel dřív, než víme, jestli divák na data má. Když /api/teams/mine
 * selže, rozhodl už server — widget je na ploše jen tehdy, když ho vrátil.
 */
function useBrana(id: string): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  const o = widget(id)?.opravneni ?? { vse: [], nektere: [] };
  if (!nacteno) return { ok: chyba, ceka: !chyba };
  const ok = o.vse.every(k => ma(k)) && (o.nektere.length === 0 || o.nektere.some(k => ma(k)));
  return { ok, ceka: false };
}

const denKratce = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

/** Otevře Úkoly vyfiltrované na člověka (null = pro kohokoli). */
function filtrujUkoly(nav: Navigace, kdo: number | null) {
  const detail: Record<string, unknown> = { kdo, prijato: false };
  window.dispatchEvent(new CustomEvent(UDALOST_FILTR_UKOLU, { detail }));
  if (detail.prijato) return;
  try { sessionStorage.setItem(KLIC_FILTRU_UKOLU, kdo == null ? 'volne' : String(kdo)); } catch { /* soukromé okno: otevře se bez filtru */ }
  nav.onNavigate('tasks');
}

/**
 * Kulaté zaškrtávátko: hotovo = limetkové kolečko s fajfkou (stav, ne akce),
 * jako Checklist. Cizí úkol bez ukoly.plnit má zaškrtávátko zašedlé — i odečítač
 * pak slyší „nedostupné", ne tlačítko, které po stisku skončí chybou.
 */
export function Zaskrtnuti({ hotovo, nazev, onClick, zamceno, ceka }: { hotovo: boolean; nazev: string; onClick: () => void; zamceno: boolean; ceka: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={hotovo} aria-label={nazev} aria-busy={ceka || undefined}
      disabled={zamceno} onClick={onClick}
      // fokus-kontrast: obrys fokusu musí být vidět i kolem limetkového (zaškrtnutého) kolečka.
      className={`tap-target fokus-kontrast grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        hotovo ? 'bg-[#C8F542] on-accent' : 'border-2 border-black/15 hover:bg-black/[0.05]'}`}>
      {hotovo && <Icon name="check" size={13} strokeWidth={2.6} />}
    </button>
  );
}

/**
 * Odškrtávání z widgetu: optimisticky, se srovnáním ostatních widgetů po
 * odpovědi a vrácením při chybě. Sdílený tablet plní úkoly za toho, kdo je
 * u něj přihlášený (KioskShiftGate) — bez té brány by se splnění připsalo
 * tabletu, proto tam widget jen čte.
 */
function useOdskrtavani(data: StavDat<Ukol[]>, ja: number | null, nahled: boolean) {
  const smi = useSmi();
  const { role } = useOpravneni();
  const [chyba, setChyba] = useState<string | null>(null);
  const [probiha, setProbiha] = useState<ReadonlySet<number>>(() => new Set());
  const puvodniStav = useRef(new Map<number, string>());
  const naTabletu = role?.typ === 'kiosk';

  /** Vlastní, pro kohokoli a svoje zadané každý; cizí jen s ukoly.plnit (jako PATCH /api/tasks). */
  const smiOdskrtnout = (t: Ukol) => !nahled && !naTabletu && ja != null && (!jeCiziUkol(t, ja) || smi('ukoly.plnit'));

  const prepni = async (t: Ukol, hotovo = t.status !== 'done') => {
    if (!smiOdskrtnout(t) || probiha.has(t.id)) return false;
    if (hotovo) puvodniStav.current.set(t.id, t.status);
    const novy = hotovo ? 'done' : (puvodniStav.current.get(t.id) ?? 'pending');
    setChyba(null);
    setProbiha(p => new Set(p).add(t.id));
    data.set(prev => (prev ?? []).map(x => (x.id === t.id ? { ...x, status: novy } : x)));
    try {
      await fetch(URL_UKOLY, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ id: t.id, status: novy }) }).then(okJson);
      // Srovná i ostatní widgety a nástroj nad /api/tasks (sdílená mezipaměť).
      data.reload();
      return true;
    } catch (e) {
      data.set(prev => (prev ?? []).map(x => (x.id === t.id ? { ...x, status: t.status } : x)));
      setChyba(apiMessage(e, 'Úkol se nepodařilo uložit — zkus to znovu.'));
      return false;
    } finally {
      setProbiha(p => { const n = new Set(p); n.delete(t.id); return n; });
    }
  };
  return { chyba, setChyba, probiha, smiOdskrtnout, prepni };
}

// ---------------------------------------------------------------------------
// Úkoly na dnes
// ---------------------------------------------------------------------------

function UkolyDnes({ velikost, nastaveni, nahled }: WidgetProps<{ rozsah?: string }>) {
  const ja = useJa();
  const smi = useSmi();
  const nav = useNavigace();
  const data = useDataWidgetu<Ukol[]>(ja.id != null ? URL_UKOLY : null, vyberUkoly);
  const o = useOdskrtavani(data, ja.id, nahled);
  // Odškrtnuté v téhle chvíli zůstanou v seznamu (jako hotové), dokud se plocha
  // nenačte znovu — úkol by jinak zmizel pod prstem a nešlo by ho vrátit.
  const [odskrtnute, setOdskrtnute] = useState<ReadonlySet<number>>(() => new Set());

  // Volba „Celý tým" bez ukoly.zobrazit_tym neexistuje (spec §2.3) — widget ji ignoruje.
  const chtene = (['moje', 'moje_a_volne', 'tym'] as const).includes(nastaveni.rozsah as RozsahUkolu) ? nastaveni.rozsah as RozsahUkolu : 'moje_a_volne';
  const rozsah: RozsahUkolu = chtene === 'tym' && !smi('ukoly.zobrazit_tym') ? 'moje_a_volne' : chtene;

  const { radky, zbyva, poTerminuN } = useMemo(() => {
    const dnes = pragueToday();
    const vidim = vRozsahu(data.data ?? [], rozsah, ja.id).filter(t => t.status !== 'done' || odskrtnute.has(t.id));
    const po = vidim.filter(t => t.dueDate && t.dueDate < dnes);
    const dnesni = vidim.filter(t => !t.dueDate || t.dueDate === dnes);
    const vse = [...po, ...dnesni];
    return {
      radky: vse,
      zbyva: vse.filter(t => t.status !== 'done').length,
      poTerminuN: po.filter(t => t.status !== 'done').length,
    };
  }, [data.data, rozsah, ja.id, odskrtnute]);

  const S = velikost === 'S';
  const L = velikost === 'L';
  const zobrazene = L ? radky : radky.slice(0, 5);
  const dnes = pragueToday();

  return (
    <Widget
      nacteni={ja.stav ?? data}
      doplnek={!S && zbyva > 0 ? <Chip tone={poTerminuN > 0 ? 'bad' : 'muted'} size="sm">{cislo(zbyva)}</Chip> : undefined}
      odkaz={S ? undefined : { popisek: 'Úkoly', pohled: 'tasks' }}
      otevrit={S && !nahled && nav.smiPohled('tasks') ? () => nav.onNavigate('tasks') : undefined}
      prazdno={(S ? zbyva === 0 : radky.length === 0) ? <p className="t-meta">Na dnešek nic nezbývá.</p> : undefined}
    >
      {S ? (
        <Stat label="Zbývá" value={cislo(zbyva)}
          note={poTerminuN > 0 ? <span className="text-bad-ink">{cislo(poTerminuN)} po termínu</span> : 'na dnešek'} />
      ) : (
        <>
          <ul className="list">
            {zobrazene.map(t => {
              const hotovo = t.status === 'done';
              const pozde = !!t.dueDate && t.dueDate < dnes;
              const meta = [
                t.assignedTo == null ? 'Pro kohokoli'
                  : rozsah === 'tym' && t.assignedTo !== ja.id ? t.assigneeName : null,
                pozde ? `termín ${denKratce(t.dueDate!)}` : null,
                // Odškrtnutí výrobního úkolu naskladní dávku a odepíše suroviny (API).
                t.source === 'production' ? 'výroba — naskladní dávku' : null,
              ].filter(Boolean).join(' · ');
              return (
                <ListRow key={t.id}
                  lead={<Zaskrtnuti hotovo={hotovo} nazev={t.title} zamceno={!o.smiOdskrtnout(t)} ceka={o.probiha.has(t.id)}
                    onClick={() => { setOdskrtnute(p => new Set(p).add(t.id)); void o.prepni(t); }} />}
                  title={<span className={hotovo ? 'text-black/45' : undefined}>{t.title}</span>}
                  meta={meta || undefined}
                  right={pozde && !hotovo ? <Chip tone="bad" size="sm">Po termínu</Chip> : undefined}
                />
              );
            })}
          </ul>
          {!L && radky.length > 5 && <p className="t-meta mt-2">{aDalsich(radky.length - 5)}</p>}
          {o.chyba && <p className="note note-danger mt-3" role="alert">{o.chyba}</p>}
        </>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Úkoly po termínu
// ---------------------------------------------------------------------------

function PoTerminu({ velikost, nahled }: WidgetProps) {
  const ja = useJa();
  const smi = useSmi();
  const nav = useNavigace();
  const def = widget('ukoly.po_terminu');
  const data = useDataWidgetu<Ukol[]>(ja.id != null ? URL_UKOLY : null, vyberUkoly);
  // Celý tým jen s ukoly.zobrazit_tym (pole `cely_tym`); bez něj by stejně přišly
  // jen moje a pro kohokoli — widget to říká i v poznámce, ať číslo neklame.
  const celyTym = smi(def?.opravneni.pole?.cely_tym ?? 'ukoly.zobrazit_tym');
  const dnes = pragueToday();
  const vse = useMemo(() => poTerminu(vRozsahu(data.data ?? [], celyTym ? 'tym' : 'moje_a_volne', ja.id), dnes), [data.data, celyTym, ja.id, dnes]);
  const moje = vse.filter(t => t.assignedTo === ja.id).length;
  const S = velikost === 'S';

  return (
    <Widget
      nacteni={ja.stav ?? data}
      doplnek={!S && vse.length > 0 ? <Chip tone="bad" size="sm">{cislo(vse.length)}</Chip> : undefined}
      odkaz={S ? undefined : { popisek: 'Úkoly', pohled: 'tasks' }}
      otevrit={S && !nahled && nav.smiPohled('tasks') ? () => nav.onNavigate('tasks') : undefined}
      prazdno={vse.length === 0 ? <p className="t-meta">Nic není po termínu.</p> : undefined}
    >
      {S ? (
        <Stat label="Po termínu" value={cislo(vse.length)}
          note={celyTym ? (moje > 0 ? `${cislo(moje)} tvoje` : 'v celém týmu') : 'tvoje a pro kohokoli'} />
      ) : (
        <>
          <ul className="list">
            {vse.slice(0, 5).map(t => (
              <ListRow key={t.id} title={t.title}
                meta={[t.assignedTo == null ? 'Pro kohokoli' : t.assignedTo === ja.id ? 'Ty' : (t.assigneeName ?? 'Bez jména'), `termín ${denKratce(t.dueDate!)}`].join(' · ')}
                right={<Chip tone="bad" size="sm">{czCount(dniZpozdeni(t.dueDate!, dnes), DEN)}</Chip>} />
            ))}
          </ul>
          {vse.length > 5 && <p className="t-meta mt-2">{aDalsich(vse.length - 5)}</p>}
        </>
      )}
    </Widget>
  );
}

/** Kolik dní je úkol po termínu (termín včera = 1 den). */
function dniZpozdeni(termin: string, dnes: string): number {
  return Math.max(1, Math.round((Date.parse(`${dnes}T12:00:00Z`) - Date.parse(`${termin}T12:00:00Z`)) / 86400000));
}

// ---------------------------------------------------------------------------
// Úkoly podle lidí
// ---------------------------------------------------------------------------

function PodleLidi({ nahled }: WidgetProps) {
  const nav = useNavigace();
  const { ok, ceka } = useBrana('ukoly.podle_lidi');
  const data = useDataWidgetu<Ukol[]>(ok ? URL_UKOLY : null, vyberUkoly);
  const dnes = pragueToday();
  const lide = useMemo(() => podleLidi(data.data ?? [], dnes), [data.data, dnes]);
  const klikaci = !nahled && nav.smiPohled('tasks');

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      kostra="seznam"
      odkaz={{ popisek: 'Úkoly', pohled: 'tasks' }}
      prazdno={lide.length === 0 ? <p className="t-meta">Nikdo nemá nic rozpracovaného.</p> : undefined}
    >
      <ul className="list">
        {lide.slice(0, 6).map(r => (
          <li key={r.id ?? 'volne'}>
            <ListRow as="div" title={r.jmeno}
              meta={r.poTerminu > 0 ? <span className="text-bad-ink">{cislo(r.poTerminu)} po termínu</span> : 'nic po termínu'}
              value={cislo(r.aktivni)} valueMeta={czForm(r.aktivni, UKOL)}
              onClick={klikaci ? () => filtrujUkoly(nav, r.id) : undefined} />
          </li>
        ))}
      </ul>
      {lide.length > 6 && <p className="t-meta mt-2">{aDalsich(lide.length - 6)}</p>}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Úkoly na týden
// ---------------------------------------------------------------------------

function Tyden({ nahled }: WidgetProps) {
  const ja = useJa();
  const smi = useSmi();
  const def = widget('ukoly.tyden');
  const { weekStart } = useCurrency();
  const data = useDataWidgetu<Ukol[]>(ja.id != null ? URL_UKOLY : null, vyberUkoly);
  const o = useOdskrtavani(data, ja.id, nahled);
  const celyTym = smi(def?.opravneni.pole?.cely_tym ?? 'ukoly.zobrazit_tym');
  const presunCizi = smi(def?.opravneni.pole?.['akce:presunout_cizi'] ?? 'ukoly.upravit');
  const ukoly = useMemo(() => vRozsahu(data.data ?? [], celyTym ? 'tym' : 'moje_a_volne', ja.id), [data.data, celyTym, ja.id]);
  const dnes = pragueToday();
  const [chybaPresunu, setChybaPresunu] = useState<string | null>(null);

  const presun = async (t: Ukol, datum: string) => {
    setChybaPresunu(null);
    data.set(prev => (prev ?? []).map(x => (x.id === t.id ? { ...x, dueDate: datum } : x)));
    try {
      await fetch(URL_UKOLY, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ id: t.id, move: true, dueDate: datum }) }).then(okJson);
      data.reload();
    } catch (e) {
      data.set(prev => (prev ?? []).map(x => (x.id === t.id ? { ...x, dueDate: t.dueDate } : x)));
      setChybaPresunu(apiMessage(e, 'Úkol se nepodařilo přesunout.'));
    }
  };

  const podle = (t: { id: number }) => ukoly.find(x => x.id === t.id);
  return (
    <Widget nacteni={ja.stav ?? data} kostra="graf" odkaz={{ popisek: 'Úkoly', pohled: 'tasks' }}>
      <TaskWeekBoard tasks={ukoly} weekStart={weekStart}
        // Budoucí úkol se odškrtnout nedá — v nástroji by se ptal „Tohle není dnešní úkol",
        // widget okno nemá, tak ho radši nepustí (splní se v den termínu nebo v Úkolech).
        canComplete={t => { const u = podle(t); return !!u && o.smiOdskrtnout(u) && (!u.dueDate || u.dueDate <= dnes); }}
        onComplete={(t, hotovo) => { const u = podle(t); if (u) void o.prepni(u, hotovo); }}
        labelFor={t => { const u = podle(t); return !u ? '' : u.assignedTo == null ? 'Pro kohokoli' : celyTym && u.assignedTo !== ja.id ? (u.assigneeName ?? '') : ''; }}
        onMove={nahled ? undefined : (t, datum) => { const u = podle(t); if (u) void presun(u, datum); }}
        canMove={t => { const u = podle(t); return !!u && (u.createdBy === ja.id || presunCizi); }} />
      {(o.chyba || chybaPresunu) && <p className="note note-danger mt-3" role="alert">{o.chyba ?? chybaPresunu}</p>}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Splněno dnes
// ---------------------------------------------------------------------------

function SplnenoDnes({ velikost }: WidgetProps) {
  const { ok, ceka } = useBrana('ukoly.splneno_dnes');
  const data = useDataWidgetu<Ukol[]>(ok ? URL_UKOLY : null, vyberUkoly);
  const dnes = pragueToday();
  const hotove = useMemo(() => splnenoDnes(data.data ?? [], dnes), [data.data, dnes]);
  const cas = (t: Ukol) => { const d = new Date(String(t.completedAt)); return Number.isNaN(d.getTime()) ? '' : pragueHM(d); };
  const S = velikost === 'S';
  const posledni = hotove[0];

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      doplnek={!S && hotove.length > 0 ? <Chip tone="ok" size="sm">{cislo(hotove.length)}</Chip> : undefined}
      odkaz={S ? undefined : { popisek: 'Úkoly', pohled: 'tasks' }}
      prazdno={hotove.length === 0 ? <p className="t-meta">Dnes zatím nikdo nic nesplnil.</p> : undefined}
    >
      {S ? (
        <Stat label="Splněno" value={cislo(hotove.length)}
          note={posledni ? `naposledy ${posledni.completedByName ?? 'někdo'} v ${cas(posledni)}` : undefined} />
      ) : (
        <>
          <ul className="list">
            {hotove.slice(0, 5).map(t => (
              <ListRow key={t.id} title={t.title} meta={t.completedByName ?? 'Bez jména'} value={cas(t)} />
            ))}
          </ul>
          {hotove.length > 5 && <p className="t-meta mt-2">{aDalsich(hotove.length - 5)}</p>}
        </>
      )}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'ukoly.dnes': UkolyDnes,
  'ukoly.po_terminu': PoTerminu,
  'ukoly.podle_lidi': PodleLidi,
  'ukoly.tyden': Tyden,
  'ukoly.splneno_dnes': SplnenoDnes,
};
