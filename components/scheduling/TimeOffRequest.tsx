'use client';

// Žádost o volno (zaměstnanec i vedení pro sebe) — formulář a vlastní žádosti.
//
// Kolo 69 (balík B1): stojí pod plochou Dostupnosti a Mých směn vedení
// (připojují ho layouty jiného balíku). Limetka „Odeslat žádost" byla druhá
// limetka na obrazovce vedle „Odeslat dostupnost" → `primary`. Typ volna je
// Segmented (vybráno = inkoustová pilulka), vlastní žádosti jedna karta
// s `.list` a stav chipem místo ručně obarvených pilulek; zrušení čekající
// žádosti se po chybě vrátí a řekne to (dřív se tiše objevila zpátky).
// Po odeslání se obnoví widget „Moje volno" (stejná data přes /api/timeoff?mine=1).
//
// Kolo 7 (R7-1): na telefonu ležela karta pod celým kalendářem dostupnosti, mimo
// výřez. Zaměstnanec teď žádá tlačítkem „Žádost o volno" v hlavičce Dostupnosti
// (AvailabilitySubmit → `OknoZadostiVolna`, okno zdola) a své žádosti vidí ve
// sbaleném „Moje žádosti (n)" pod kalendářem (`SeznamZadosti`). Kusy jsou proto
// rozebrané: stav formuláře s konceptem (`useFormularVolna` — drží ho volající,
// ať zavřené okno rozepsané neztratí), pole (`PoleVolna`), seznam (`useMojeZadosti`
// + `SeznamZadosti`). Výchozí export je dál karta pro Moje směny vedení.

import { useCallback, useEffect, useState } from 'react';

import { Button, Card, Chip, EmptyState, Field, Input, ListRow, Modal, Segmented } from '../ui';
import { useDraft, type Koncept } from '@/lib/useDraft';
import { DraftNote } from '../ui/DraftNote';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import type { Jazyk } from '@/lib/i18n/config';
import { zbudePoSchvaleni, type NarokDovolene } from '@/lib/dovolena';
type TimeOffType = 'vacation' | 'sick' | 'other';
type TimeOffStatus = 'pending' | 'approved' | 'rejected';

export interface TimeOffRequestItem {
  id: number;
  employeeId: string;
  fromDate: string;
  toDate: string;
  type: TimeOffType;
  note: string | null;
  status: TimeOffStatus;
  createdAt: string;
  employeeName?: string | null;
  employeeAvatar?: string | null;
  /** Důvod rozhodnutí od vedení (kolo 7) — u zamítnuté žádosti „Vedení: …". */
  decisionNote?: string | null;
}

const TYPE_IDS: TimeOffType[] = ['vacation', 'sick', 'other'];

const STATUS_TONE: Record<TimeOffStatus, 'wait' | 'ok' | 'bad'> = {
  pending: 'wait',
  approved: 'ok',
  rejected: 'bad',
};

function formatRange(fromDate: string, toDate: string, jazyk: Jazyk): string {
  const full = (s: string) => fmtDatum(s, { jazyk, styl: 'cislo' });
  if (fromDate === toDate) return full(fromDate);
  if (fromDate.slice(0, 4) === toDate.slice(0, 4)) return `${fmtDatum(fromDate, { jazyk, styl: 'kratce' })} – ${full(toDate)}`;
  return `${full(fromDate)} – ${full(toDate)}`;
}

const URL_MOJE = '/api/timeoff?mine=1';
const obnovWidget = () => obnovDataWidgetu(URL_MOJE);

/** Nárok na dovolenou z GET /api/timeoff?mine=1 (kolo 8); starší server ho neposílá → null. */
export function vyberNarok(raw: any): NarokDovolene | null {
  const n = raw && typeof raw === 'object' ? raw.narok : null;
  if (!n || typeof n !== 'object' || n.dni == null) return null;
  return { rok: Number(n.rok), dni: Number(n.dni), cerpano: Number(n.cerpano) || 0, ceka: Number(n.ceka) || 0, zbyva: Number(n.zbyva) };
}

/** Stejná adresa jako widget Moje volno a seznam žádostí (sdílená mezipaměť) — jeden dotaz pro všechno. */
export function useNarokDovolene(): NarokDovolene | null {
  return useDataWidgetu<NarokDovolene | null>(URL_MOJE, vyberNarok).data ?? null;
}

/**
 * Zůstatek dovolené nad poli žádosti (Homebase: „remaining balance" přímo ve formuláři):
 * chip „Dovolená: zbývá 6 z 20 dní" a po výběru dnů „po schválení zbude 3" — nebo varování,
 * že žádost zůstatek přesahuje (odeslat jde i tak, rozhodne vedení). Jen u typu Dovolená
 * a jen s nastaveným nárokem; nemoc a jiné volno se neodečítají.
 */
export function ZustatekDovolene({ narok, od, doDne, typ }: { narok: NarokDovolene | null; od: string; doDne: string; typ: TimeOffType }) {
  const t = useT('zamestnanec');
  if (!narok || narok.dni == null || narok.zbyva == null || typ !== 'vacation') return null;
  const zbude = zbudePoSchvaleni(narok, od, doDne || od, typ);
  const ton = narok.zbyva > 0 ? 'ok' : narok.zbyva === 0 ? 'wait' : 'bad';
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 t-meta" data-narok-dovolene={narok.zbyva}>
      <Chip tone={ton} size="sm" icon="sun">{t('Dovolená: zbývá {n} z {celkem} dní', { n: narok.zbyva, celkem: narok.dni })}</Chip>
      {zbude != null && (zbude >= 0
        ? <span data-zbude={zbude}>{t('po schválení zbude {n}', { n: zbude })}</span>
        : <span className="text-wait-ink" data-zbude={zbude}>{t('o {n, plural, one {# den} few {# dny} other {# dní}} víc, než zbývá', { n: -zbude })}</span>)}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Formulář
// ---------------------------------------------------------------------------

export interface FormularVolna {
  fromDate: string; setFromDate: (v: string) => void;
  toDate: string; setToDate: (v: string) => void;
  type: TimeOffType; setType: (v: TimeOffType) => void;
  note: string; setNote: (v: string) => void;
  koncept: Koncept;
  error: string | null;
  submitting: boolean;
  /** Odešle žádost; true = prošla (formulář je prázdný a koncept smazaný). */
  submit: () => Promise<boolean>;
  /** Zahodí rozepsané (tlačítko Zrušit v okně). */
  zahodit: () => void;
}

/**
 * Stav formuláře žádosti s konceptem. Drží ho ten, kdo formulář ukazuje — okno
 * se zavírá a otevírá, stav i koncept přežijí. `aktivni` = formulář je vidět
 * (koncept se dosadí a zapisuje jen tehdy); `koncept.cekaKoncept` říká volajícímu,
 * že má okno otevřít, protože tam leží rozepsaná žádost z minula.
 */
export function useFormularVolna({ aktivni = true, onOdeslano }: { aktivni?: boolean; onOdeslano?: () => void } = {}): FormularVolna {
  const t = useT('zamestnanec');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [type, setType] = useState<TimeOffType>('vacation');
  const [note, setNote] = useState('');
  // Žádost o volno se vyplňuje mezi prací: kouknout do rozvrhu, kdo má
  // směnu, a vrátit se. Do kola 37 to znamenalo vyplňovat znovu.
  const koncept = useDraft('volno', { fromDate, toDate, type, note },
    (v) => { setFromDate(v.fromDate); setToDate(v.toDate); setType(v.type); setNote(v.note); },
    { vychozi: { fromDate: '', toDate: '', type: 'vacation' as TimeOffType, note: '' }, aktivni });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const vycisti = () => { setFromDate(''); setToDate(''); setType('vacation'); setNote(''); setError(null); };

  const submit = async (): Promise<boolean> => {
    setError(null);
    if (!fromDate || !toDate) {
      setError(t('Vyplň datum od i do.'));
      return false;
    }
    if (fromDate > toDate) {
      setError(t('Datum „Od" nesmí být později než datum „Do".'));
      return false;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/timeoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate, toDate, type, note: note.trim() || null }),
      });
      if (!res.ok) {
        setError(t('Žádost se nepodařilo odeslat. Zkus to prosím znovu.'));
        return false;
      }
      koncept.hotovo();
      vycisti();
      obnovWidget();
      onOdeslano?.();
      return true;
    } catch {
      setError(t('Žádost se nepodařilo odeslat. Zkus to prosím znovu.'));
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    fromDate, setFromDate, toDate, setToDate, type, setType, note, setNote,
    koncept, error, submitting, submit,
    zahodit: () => { koncept.zahodit(); vycisti(); },
  };
}

/** Pole žádosti (od–do, typ, poznámka) s větou o obnoveném konceptu a chybou. Bez tlačítka odeslání. */
export function PoleVolna({ f }: { f: FormularVolna }) {
  const t = useT('zamestnanec');
  const typLabel = (id: TimeOffType) => (id === 'vacation' ? t('Dovolená') : id === 'sick' ? t('Nemoc') : t('Jiné'));
  const narok = useNarokDovolene();
  return (
    <div className="space-y-3">
      <DraftNote koncept={f.koncept} co="rozepsanou žádost" />{/* i18n-ok: druh konceptu je identifikátor, větu překládá DraftNote */}
      <ZustatekDovolene narok={narok} od={f.fromDate} doDne={f.toDate} typ={f.type} />{/* kolo 8: zůstatek nad poli */}
      {/* Dvojice dat sdílí řádek i na telefonu (DESIGN: dvojice polí grid-cols-2). */}
      <div className="grid grid-cols-2 gap-3">
        <Field id="volno-od" label={t('Od')}>
          <Input id="volno-od" type="date" value={f.fromDate} onChange={(e) => f.setFromDate(e.target.value)} className="appearance-none min-w-0" />
        </Field>
        <Field id="volno-do" label={t('Do')}>
          <Input id="volno-do" type="date" value={f.toDate} min={f.fromDate || undefined} onChange={(e) => f.setToDate(e.target.value)} className="appearance-none min-w-0" />
        </Field>
      </div>

      <Segmented ariaLabel={t('Typ volna')} value={f.type} onChange={(v) => f.setType(v as TimeOffType)}
        options={TYPE_IDS.map(id => ({ id, label: typLabel(id) }))} />

      <Field id="volno-poznamka" label={t('Poznámka')} hint={t('Nepovinné — třeba zkouška nebo svatba.')}>
        <Input id="volno-poznamka" type="text" inputMode="text" enterKeyHint="done" value={f.note} onChange={(e) => f.setNote(e.target.value)} maxLength={300} />
      </Field>

      {f.error && <p className="note note-danger text-sm" role="alert">{f.error}</p>}
    </div>
  );
}

/**
 * Okno „Žádost o volno" (Dostupnost zaměstnance). Na telefonu vyjede zdola (to umí sám Modal),
 * Odeslat žádost je v patičce, ať ho klávesnice nad polem Poznámka neodsune z dosahu.
 * Zrušit rozepsané zahodí (na tlačítku je napsané, co dělá); křížek a Escape se zeptají.
 */
export function OknoZadostiVolna({ f, onClose }: { f: FormularVolna; onClose: () => void }) {
  const t = useT('zamestnanec');
  return (
    <Modal open onClose={onClose} size="md" title={t('Žádost o volno')}
      subtitle={t('Požádej o volno — vedoucí dostane upozornění a žádost schválí.')}
      footer={<>
        <Button variant="secondary" onClick={() => { f.zahodit(); onClose(); }}>{t('Zrušit', undefined, 'dialog')}</Button>
        <Button variant="primary" icon="send" loading={f.submitting} onClick={() => { void f.submit(); }}>{t('Odeslat žádost')}</Button>
      </>}>
      <PoleVolna f={f} />
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Moje žádosti
// ---------------------------------------------------------------------------

export interface MojeZadosti {
  requests: TimeOffRequestItem[];
  loading: boolean;
  loadErr: boolean;
  error: string | null;
  reload: () => void;
  cancel: (id: number) => Promise<void>;
}

/** Vlastní žádosti (`?mine=1`: i pro vedení, kterému by /api/timeoff vrátilo celý tým). `zapnuto` false = nic nenačítá. */
export function useMojeZadosti(zapnuto = true): MojeZadosti {
  const t = useT('zamestnanec');
  const [requests, setRequests] = useState<TimeOffRequestItem[]>([]);
  const [loading, setLoading] = useState(zapnuto);
  const [loadErr, setLoadErr] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/timeoff?mine=1');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRequests(Array.isArray(data.requests) ? data.requests : []);
      setLoadErr(false);
    } catch {
      // Prázdný seznam po výpadku by vypadal jako „žádnou žádost jsi neposlal".
      setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (zapnuto) load(); }, [load, zapnuto]);

  const cancel = async (id: number) => {
    const prev = requests;
    setRequests((rs) => rs.filter((r) => r.id !== id));
    setError(null);
    try {
      const res = await fetch(`/api/timeoff?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      obnovWidget();
    } catch {
      setRequests(prev);
      setError(t('Žádost se nepodařilo zrušit — zkus to znovu.'));
    }
  };

  return { requests, loading, loadErr, error, reload: () => { setLoading(true); load(); }, cancel };
}

/** Seznam vlastních žádostí se stavem; u zamítnuté důvod od vedení. */
export function SeznamZadosti({ z }: { z: MojeZadosti }) {
  const t = useT('zamestnanec');
  const { jazyk } = useJazyk();
  const typLabel = (id: TimeOffType) => (id === 'vacation' ? t('Dovolená') : id === 'sick' ? t('Nemoc') : t('Jiné'));
  const stavLabel = (s: TimeOffStatus) => (s === 'pending' ? t('Čeká') : s === 'approved' ? t('Schváleno') : t('Zamítnuto'));
  if (z.loading) return <p className="t-meta mt-2">{t('Načítám…')}</p>;
  if (z.loadErr) return (
    <p className="note note-danger text-sm mt-2 flex flex-wrap items-center justify-between gap-2" role="alert">
      <span>{t('Žádosti se nenačetly.')}</span>
      <Button variant="secondary" size="sm" onClick={z.reload}>{t('Zkusit znovu')}</Button>
    </p>
  );
  return (
    <>
      {z.error && <p className="note note-danger text-sm mt-2" role="alert">{z.error}</p>}
      {z.requests.length === 0 ? (
        <EmptyState illustration="volno" title={t('Zatím žádná žádost o volno')} hint={t('Dovolená, doktor, zkoušky — napiš termín a vedení to uvidí v rozvrhu.')} compact />
      ) : (
        <ul className="list">
          {z.requests.map((r) => (
            <ListRow key={r.id}
              title={<span className="tabular-nums">{formatRange(r.fromDate, r.toDate, jazyk)}</span>}
              meta={typLabel(r.type)}
              // Proč vedení zamítlo — dřív jen červený chip a vysvětlení až osobně. `detail` se zalamuje.
              detail={r.status === 'rejected' && r.decisionNote ? t('Vedení: {duvod}', { duvod: r.decisionNote }) : undefined}
              right={<Chip tone={STATUS_TONE[r.status]} size="sm">{stavLabel(r.status)}</Chip>}
              actions={r.status === 'pending'
                ? <Button variant="ghost" size="sm" onClick={() => z.cancel(r.id)}>{t('Zrušit')}</Button>
                : undefined}
            />
          ))}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Karta (Moje směny vedení)
// ---------------------------------------------------------------------------

export default function TimeOffRequest() {
  const t = useT('zamestnanec');
  const zadosti = useMojeZadosti();
  const f = useFormularVolna({ onOdeslano: zadosti.reload });

  return (
    <Card as="section" aria-labelledby="volno-nadpis" className="space-y-4">
      <div>
        <h2 id="volno-nadpis" className="t-section">{t('Dovolená a volno')}</h2>
        <p className="t-meta mt-0.5">{t('Požádej o volno — vedoucí dostane upozornění a žádost schválí.')}</p>
      </div>

      <div className="space-y-3">
        <PoleVolna f={f} />
        <Button variant="primary" icon="send" block loading={f.submitting} onClick={() => { void f.submit(); }}>{t('Odeslat žádost')}</Button>
      </div>

      <div className="pt-3 border-t border-black/[0.06]">
        <h3 className="t-card">{t('Moje žádosti')}</h3>
        <SeznamZadosti z={zadosti} />
      </div>
    </Card>
  );
}
