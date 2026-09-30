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

import { useCallback, useEffect, useState } from 'react';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import type { PrekladFn } from '@/lib/i18n/client';
import type { Jazyk } from '@/lib/i18n/config';

import { Button, Card, Chip, EmptyState, Field, Input, ListRow, Segmented } from '../ui';
import { useDraft } from '@/lib/useDraft';
import { DraftNote } from '../ui/DraftNote';
import { obnovDataWidgetu } from '../widgety/useDataWidgetu';
type TimeOffType = 'vacation' | 'sick' | 'other';
type TimeOffStatus = 'pending' | 'approved' | 'rejected';

interface TimeOffRequestItem {
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
}

const typeLabels = (t: PrekladFn): Record<TimeOffType, string> => ({
  vacation: t('Dovolená'),
  sick: t('Nemoc'),
  other: t('Jiné'),
});

const statusMeta = (t: PrekladFn): Record<TimeOffStatus, { label: string; tone: 'wait' | 'ok' | 'bad' }> => ({
  pending: { label: t('Čeká'), tone: 'wait' },
  approved: { label: t('Schváleno'), tone: 'ok' },
  rejected: { label: t('Zamítnuto'), tone: 'bad' },
});

function formatRange(fromDate: string, toDate: string, jazyk: Jazyk): string {
  // Řetězec RRRR-MM-DD je kalendářní den (fmtDatum na něj nepoužije časové pásmo).
  const full = (s: string) => fmtDatum(s, { jazyk, styl: 'cislo' });
  if (fromDate === toDate) return full(fromDate);
  if (fromDate.slice(0, 4) === toDate.slice(0, 4)) return `${fmtDatum(fromDate, { jazyk, styl: 'kratce' })} – ${full(toDate)}`;
  return `${full(fromDate)} – ${full(toDate)}`;
}


export default function TimeOffRequest() {
  const t = useT('rozvrh');
  const { jazyk } = useJazyk();
  const TYPE_LABELS = typeLabels(t);
  const STATUS_META = statusMeta(t);
  const [requests, setRequests] = useState<TimeOffRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [type, setType] = useState<TimeOffType>('vacation');
  const [note, setNote] = useState('');
  // Žádost o volno se vyplňuje mezi prací: kouknout do rozvrhu, kdo má
  // směnu, a vrátit se. Do kola 37 to znamenalo vyplňovat znovu.
  const koncept = useDraft('volno', { fromDate, toDate, type, note },
    (v) => { setFromDate(v.fromDate); setToDate(v.toDate); setType(v.type); setNote(v.note); },
    { vychozi: { fromDate: '', toDate: '', type: 'vacation' as TimeOffType, note: '' } });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadErr, setLoadErr] = useState(false);

  // `?mine=1`: vlastní žádosti i pro vedení, kterému by /api/timeoff vrátilo celý tým.
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
  const obnovWidget = () => obnovDataWidgetu('/api/timeoff?mine=1');

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setError(null);
    if (!fromDate || !toDate) {
      setError(t('Vyplň datum od i do.'));
      return;
    }
    if (fromDate > toDate) {
      setError(t('Datum „Od" nesmí být později než datum „Do".'));
      return;
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
        return;
      }
      koncept.hotovo();
      setFromDate('');
      setToDate('');
      setType('vacation');
      setNote('');
      await load();
      obnovWidget();
    } catch {
      setError(t('Žádost se nepodařilo odeslat. Zkus to prosím znovu.'));
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async (id: number) => {
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

  return (
    <Card as="section" aria-labelledby="volno-nadpis" className="space-y-4">
      <div>
        <h2 id="volno-nadpis" className="t-section">{t('Dovolená a volno')}</h2>
        <p className="t-meta mt-0.5">{t('Požádej o volno — vedoucí dostane upozornění a žádost schválí.')}</p>
      </div>

      <div className="space-y-3">
        <DraftNote koncept={koncept} co="rozepsanou žádost" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id="volno-od" label={t('Od')}>
            <Input id="volno-od" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="appearance-none min-w-0" />
          </Field>
          <Field id="volno-do" label={t('Do')}>
            <Input id="volno-do" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="appearance-none min-w-0" />
          </Field>
        </div>

        <Segmented ariaLabel={t('Typ volna')} value={type} onChange={(v) => setType(v as TimeOffType)}
          options={(['vacation', 'sick', 'other'] as TimeOffType[]).map(id => ({ id, label: TYPE_LABELS[id] }))} />

        <Field id="volno-poznamka" label={t('Poznámka')} hint={t('Nepovinné — třeba zkouška nebo svatba.')}>
          <Input id="volno-poznamka" type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>

        {error && <p className="note note-danger text-sm" role="alert">{error}</p>}

        <Button variant="primary" icon="send" block loading={submitting} onClick={submit}>{t('Odeslat žádost')}</Button>
      </div>

      <div className="pt-3 border-t border-black/[0.06]">
        <h3 className="t-card">{t('Moje žádosti')}</h3>
        {loading ? (
          <p className="t-meta mt-2">{t('Načítám…')}</p>
        ) : loadErr ? (
          <p className="note note-danger text-sm mt-2 flex flex-wrap items-center justify-between gap-2" role="alert">
            <span>{t('Žádosti se nenačetly.')}</span>
            <Button variant="secondary" size="sm" onClick={() => { setLoading(true); load(); }}>{t('Zkusit znovu')}</Button>
          </p>
        ) : requests.length === 0 ? (
          <EmptyState illustration="volno" title={t('Zatím žádná žádost o volno')} hint={t('Dovolená, doktor, zkoušky — napiš termín a vedení to uvidí v rozvrhu.')} compact />
        ) : (
          <ul className="list">
            {requests.map((r) => (
              <ListRow key={r.id}
                title={<span className="tabular-nums">{formatRange(r.fromDate, r.toDate, jazyk)}</span>}
                meta={TYPE_LABELS[r.type]}
                right={<Chip tone={STATUS_META[r.status].tone} size="sm">{STATUS_META[r.status].label}</Chip>}
                actions={r.status === 'pending'
                  ? <Button variant="ghost" size="sm" onClick={() => cancelRequest(r.id)}>{t('Zrušit')}</Button>
                  : undefined}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
