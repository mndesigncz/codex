'use client';

// Widgety oblasti „Úkoly" — komponenty (kolo 68, spec §2.5, §6.1).
//
// Vlastník v kole 69: balík B6a (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/ukoly.ts;
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — hlídá to test AK-20 v scripts/testy/k68-widgety.ts.
//
// Kontrakt (spec §2.6): komponenta dostane WidgetProps (instance, velikost, nastaveni,
// nahled), kreslí se vždy v obalu <Widget> z ../Widget, data bere jen přes useDataWidgetu
// (URL null, dokud neplatí brána z registru a useSmi pro pole), navigaci přes useNavigace.
// Soubor se stahuje líně, až když je widget oblasti na ploše (registr.ts).
//
// Co tu je (kolo 68):
//  - ukoly.dnes — nástupce dlaždice „Moje úkoly" z Domů zaměstnance (průhledný
//    <button glass-card>, číslo 30 px, jen počet) a čísla „Aktivní úkoly" z Přehledu:
//    malý „Zbývá N", střední pět úkolů s odškrtnutím přímo na ploše, velký všechno
//    dnešní; co je po termínu, je nahoře. Odškrtnout cizí úkol jde jen s ukoly.plnit,
//    celý tým jen s ukoly.zobrazit_tym — stejně jako to pustí /api/tasks.

import { useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Chip, ListRow, Stat } from '../../ui';
import { Icon } from '../../Icons';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { Widget, type StavNacteni } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { useOpravneni } from '../../role/useOpravneni';
import { apiMessage, okJson } from '@/lib/api';
import { pragueToday } from '@/lib/pragueTime';

// ---------------------------------------------------------------------------
// Pomocníci (záměrně v souboru — oblast je samostatný líný kus s jedním vlastníkem)
// ---------------------------------------------------------------------------

const RELACE_NACITA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

/**
 * Id přihlášeného — „moje" úkoly jsou ty s `assignedTo` = já. Kontrakt widgetu
 * uživatele nenese; do načtení relace drží `stav` widget na kostře.
 */
function useJa(): { id: number | null; stav: StavNacteni | null } {
  const { data, status, update } = useSession();
  if (status === 'loading') return { id: null, stav: RELACE_NACITA };
  const id = Number((data?.user as { id?: unknown } | undefined)?.id);
  if (Number.isFinite(id) && id > 0) return { id, stav: null };
  return { id: null, stav: { data: null, error: 'Nevím, kdo je přihlášený — obnov stránku.', loading: false, reload: () => { void update(); } } };
}

const den = (v: unknown): string => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : '');
const denKratce = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });

// ---------------------------------------------------------------------------
// Úkoly na dnes
// ---------------------------------------------------------------------------

interface Ukol {
  id: number;
  title: string;
  status: string;
  dueDate: string | null;
  assignedTo: number | null;
  createdBy: number | null;
  assigneeName: string | null;
  source: string | null;
}

function vyberUkoly(raw: any): Ukol[] {
  if (!Array.isArray(raw)) throw new Error('Úkoly přišly v nečekaném tvaru.');
  return raw.map((t: any) => ({
    id: Number(t.id),
    title: String(t.title ?? ''),
    status: String(t.status ?? 'pending'),
    dueDate: den(t.dueDate) || null,
    assignedTo: t.assignedTo == null ? null : Number(t.assignedTo),
    createdBy: t.createdBy == null ? null : Number(t.createdBy),
    assigneeName: t.assigneeName ?? null,
    source: t.source ?? null,
  }));
}

type Rozsah = 'moje' | 'moje_a_volne' | 'tym';
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

/**
 * Kulaté zaškrtávátko: hotovo = limetkové kolečko s fajfkou (stav, ne akce),
 * jako Checklist. Cizí úkol bez ukoly.plnit má zaškrtávátko zašedlé — i odečítač
 * pak slyší „nedostupné", ne tlačítko, které po stisku skončí chybou.
 */
function Zaskrtnuti({ hotovo, nazev, onClick, zamceno, ceka }: { hotovo: boolean; nazev: string; onClick: () => void; zamceno: boolean; ceka: boolean }) {
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

function UkolyDnes({ velikost, nastaveni, nahled }: WidgetProps<{ rozsah?: string }>) {
  const ja = useJa();
  const smi = useSmi();
  const nav = useNavigace();
  const { role } = useOpravneni();
  const data = useDataWidgetu(ja.id != null ? '/api/tasks' : null, vyberUkoly);
  const [chyba, setChyba] = useState<string | null>(null);
  const [probiha, setProbiha] = useState<ReadonlySet<number>>(() => new Set());
  // Odškrtnuté v téhle chvíli zůstanou v seznamu (jako hotové), dokud se plocha
  // nenačte znovu — úkol by jinak zmizel pod prstem a nešlo by ho vrátit.
  const [odskrtnute, setOdskrtnute] = useState<ReadonlySet<number>>(() => new Set());
  const puvodniStav = useRef(new Map<number, string>());

  // Volba „Celý tým" bez ukoly.zobrazit_tym neexistuje (spec §2.3) — widget ji ignoruje.
  const chtene = (['moje', 'moje_a_volne', 'tym'] as const).includes(nastaveni.rozsah as Rozsah) ? nastaveni.rozsah as Rozsah : 'moje_a_volne';
  const rozsah: Rozsah = chtene === 'tym' && !smi('ukoly.zobrazit_tym') ? 'moje_a_volne' : chtene;
  // Sdílený tablet plní úkoly za toho, kdo je u něj přihlášený (KioskShiftGate);
  // bez té brány by se splnění připsalo tabletu. Tam je widget jen ke čtení.
  const naTabletu = role?.typ === 'kiosk';

  const { radky, zbyva, poTerminu } = useMemo(() => {
    const dnes = pragueToday();
    const moje = (t: Ukol) => ja.id != null && t.assignedTo === ja.id;
    const vRozsahu = (data.data ?? []).filter(t =>
      rozsah === 'tym' ? true : rozsah === 'moje' ? moje(t) : moje(t) || t.assignedTo == null);
    const vidim = vRozsahu.filter(t => t.status !== 'done' || odskrtnute.has(t.id));
    const po = vidim.filter(t => t.dueDate && t.dueDate < dnes);
    const dnesni = vidim.filter(t => !t.dueDate || t.dueDate === dnes);
    const vse = [...po, ...dnesni];
    return {
      radky: vse,
      zbyva: vse.filter(t => t.status !== 'done').length,
      poTerminu: po.filter(t => t.status !== 'done').length,
    };
  }, [data.data, rozsah, ja.id, odskrtnute]);

  /** Smí divák úkol odškrtnout? Vlastní, pro kohokoli a svoje zadané každý; cizí jen s ukoly.plnit (jako PATCH /api/tasks). */
  const smiOdskrtnout = (t: Ukol) => !nahled && !naTabletu && ja.id != null
    && (t.assignedTo === ja.id || t.assignedTo == null || t.createdBy === ja.id || smi('ukoly.plnit'));

  const prepni = async (t: Ukol) => {
    if (!smiOdskrtnout(t) || probiha.has(t.id)) return;
    const hotovo = t.status !== 'done';
    if (hotovo) puvodniStav.current.set(t.id, t.status);
    const novy = hotovo ? 'done' : (puvodniStav.current.get(t.id) ?? 'pending');
    setChyba(null);
    setProbiha(p => new Set(p).add(t.id));
    setOdskrtnute(p => new Set(p).add(t.id));
    data.set(prev => (prev ?? []).map(x => (x.id === t.id ? { ...x, status: novy } : x)));
    try {
      await fetch('/api/tasks', { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ id: t.id, status: novy }) }).then(okJson);
      // Srovná i ostatní widgety a náhledy nad /api/tasks (sdílená mezipaměť).
      data.reload();
    } catch (e) {
      data.set(prev => (prev ?? []).map(x => (x.id === t.id ? { ...x, status: t.status } : x)));
      setChyba(apiMessage(e, 'Úkol se nepodařilo uložit — zkus to znovu.'));
    } finally {
      setProbiha(p => { const n = new Set(p); n.delete(t.id); return n; });
    }
  };

  const S = velikost === 'S';
  const L = velikost === 'L';
  const zobrazene = L ? radky : radky.slice(0, 5);
  const dnes = pragueToday();

  return (
    <Widget
      nacteni={ja.stav ?? data}
      doplnek={!S && zbyva > 0 ? <Chip tone={poTerminu > 0 ? 'bad' : 'muted'} size="sm">{zbyva.toLocaleString('cs-CZ')}</Chip> : undefined}
      odkaz={S ? undefined : { popisek: 'Úkoly', pohled: 'tasks' }}
      otevrit={S && !nahled && nav.smiPohled('tasks') ? () => nav.onNavigate('tasks') : undefined}
      prazdno={(S ? zbyva === 0 : radky.length === 0) ? <p className="t-meta">Na dnešek nic nezbývá.</p> : undefined}
    >
      {S ? (
        <Stat label="Zbývá" value={zbyva.toLocaleString('cs-CZ')}
          note={poTerminu > 0 ? <span className="text-bad-ink">{poTerminu.toLocaleString('cs-CZ')} po termínu</span> : 'na dnešek'} />
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
              const muze = smiOdskrtnout(t);
              return (
                <ListRow key={t.id}
                  lead={<Zaskrtnuti hotovo={hotovo} nazev={t.title} zamceno={!muze} ceka={probiha.has(t.id)} onClick={() => prepni(t)} />}
                  title={<span className={hotovo ? 'text-black/45' : undefined}>{t.title}</span>}
                  meta={meta || undefined}
                  right={pozde && !hotovo ? <Chip tone="bad" size="sm">Po termínu</Chip> : undefined}
                />
              );
            })}
          </ul>
          {!L && radky.length > 5 && <p className="t-meta mt-2">…a dalších {(radky.length - 5).toLocaleString('cs-CZ')}</p>}
          {chyba && <p className="note note-danger mt-3" role="alert">{chyba}</p>}
        </>
      )}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'ukoly.dnes': UkolyDnes,
};
