'use client';

// Inventura: count the shelf item by item against the frozen snapshot, then
// let the employer write the differences back in one confirmed step.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import ShrinkageReport from './ShrinkageReport';
import { okJson } from '@/lib/api';
import { tg } from '@/lib/i18n/stav';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';
import { polozekTxt, rozdilTxt } from './texty';
import { pocetDoPole, pocetZPole } from '@/lib/inventura';
import { Button, Chip, ListRow, Modal, Skeleton } from '../ui';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

type Row = {
  itemId: number; name: string; category: string | null; unit: string;
  expected: number; counted: number | null;
  /** Položky s balením mají ještě načaté balení — to se počítá zvlášť. */
  packageSize?: number | null; contentUnit?: string | null;
  expectedOpen?: number | null; countedOpen?: number | null;
  unitCost?: number | null;
};
type Take = { id: number; status: string; data: Row[]; createdAt: string; completedAt: string | null };

/**
 * Tři samostatná oprávnění místo jednoho „isEmployer" (kolo 69): server
 * zahájení a zrušení pouští s `inventura.spravovat`, zápis rozdílů s
 * `inventura.dokoncit` a report ztrát s `finance.ztraty`. Vlastní role může
 * mít jen některé z nich — jeden příznak pro všechno jí buď schoval tlačítko,
 * na které má právo, nebo ukázal takové, které server odmítne.
 */
export default function StocktakeModal({ smiZahajit, smiDokoncit, smiZtraty, onClose, onApplied }: {
  /** inventura.spravovat — zahájit a zrušit inventuru. */
  smiZahajit: boolean;
  /** inventura.dokoncit — zapsat rozdíly do skladu. */
  smiDokoncit: boolean;
  /** finance.ztraty — report ztrát z minulých inventur. */
  smiZtraty: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const t = useT('sklad');
  const { jazyk } = useJazyk();
  const fmt = (n: number) => round3(n).toLocaleString(LOCALE_PRO_JAZYK[jazyk], { maximumFractionDigits: 3 });
  const [open, setOpen] = useState<Take | null>(null);
  const [history, setHistory] = useState<Take[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  // Zrušení inventury se potvrzuje v okně (dřív confirm()).
  const [confirmCancel, setConfirmCancel] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCounts = useRef<Record<string, number | null>>({});
  const pendingOpens = useRef<Record<string, number | null>>({});
  // Text, který člověk zrovna píše (klíč `c<id>` = počet, `o<id>` = zbytek
  // v načatém). Pole se nesmí při každém úhozu překreslit z rozparsovaného
  // čísla: z „0," by zmizela čárka a „0,68" by skončilo jako 68.
  const [texty, setTexty] = useState<Record<string, string>>({});
  // Smí se počet zapsat s desetinami? Rozhoduje sloupec ve skladu (server).
  const [desetinne, setDesetinne] = useState(false);

  const load = async () => {
    try {
      const d = await fetch('/api/stocktake').then(okJson);
      setOpen(d.open ?? null);
      setHistory(Array.isArray(d.history) ? d.history : []);
      setDesetinne(d.mnozstviDesetinne === true);
      if (d.notMigrated) setErr(t('Inventura bude dostupná po dokončení migrace (/api/init).'));
    } catch { setErr(t('Inventuru se nepodařilo načíst.')); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const start = async () => {
    setBusy(true); setErr('');
    const res = await fetch('/api/stocktake', { method: 'POST' }).catch(() => null);
    setBusy(false);
    if (res?.ok) { const d = await res.json(); setOpen(d.open); }
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error ? tg(d.error) : t('Inventuru se nepodařilo zahájit.')); }
  };

  // Debounced batched save — counting is rapid-fire typing on a tablet.
  const flush = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const counts = pendingCounts.current;
      const opens = pendingOpens.current;
      pendingCounts.current = {};
      pendingOpens.current = {};
      const res = await fetch('/api/stocktake', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: open!.id, counts, opens }),
      }).catch(() => null);
      if (!res?.ok) setErr(t('Počty se neuložily — zkontroluj připojení.'));
      else setErr('');
    }, 600);
  };

  /** Proč se text v poli nedá zapsat (`cislo` = není číslo, `cele` = desetiny u počtu na celé); jinak null. */
  const chybaPole = (klic: string): 'cislo' | 'cele' | null => {
    const raw = texty[klic];
    if (raw === undefined) return null;
    const p = pocetZPole(raw, klic.startsWith('o') || desetinne);
    return p.ok ? null : p.duvod;
  };
  const neplatnych = Object.keys(texty).filter(k => chybaPole(k) !== null).length;

  const setCount = (itemId: number, raw: string) => {
    if (!open) return;
    setTexty(t => ({ ...t, ['c' + itemId]: raw }));
    // Nečitelný text a desetiny tam, kde se počítá na celé, se NEposílají —
    // dřív se tiše zaokrouhlily a inventura zapsala rozdíl, který neexistuje.
    // Pole ukáže chybu a dokončit inventuru nejde, dokud se nespraví.
    const p = pocetZPole(raw, desetinne);
    if (!p.ok) return;
    const counted = p.hodnota;
    setOpen(o => o && { ...o, data: o.data.map(r => r.itemId === itemId ? { ...r, counted } : r) });
    pendingCounts.current[String(itemId)] = counted;
    flush();
  };

  /** Zbytek v načatém balení — 0,68 l zůstane 0,68 l. */
  const setOpenAmount = (itemId: number, raw: string) => {
    if (!open) return;
    setTexty(t => ({ ...t, ['o' + itemId]: raw }));
    const p = pocetZPole(raw, true);
    if (!p.ok) return;
    const countedOpen = p.hodnota;
    setOpen(o => o && { ...o, data: o.data.map(r => r.itemId === itemId ? { ...r, countedOpen } : r) });
    pendingOpens.current[String(itemId)] = countedOpen;
    flush();
  };

  /** Po opuštění pole se platný text nahradí normalizovaným číslem; chybný zůstane vidět. */
  const opustPole = (klic: string) => {
    if (chybaPole(klic) !== null) return;
    setTexty(t => { const k = { ...t }; delete k[klic]; return k; });
  };

  const complete = async () => {
    if (!open || neplatnych > 0) return;
    setBusy(true); setErr('');
    // flush pending counts along with completion
    const res = await fetch('/api/stocktake', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: open.id, counts: pendingCounts.current, opens: pendingOpens.current, complete: true }),
    }).catch(() => null);
    pendingCounts.current = {};
    pendingOpens.current = {};
    setBusy(false); setConfirmDone(false);
    if (res?.ok) {
      const d = await res.json().catch(() => ({}));
      setOpen(null);
      await load();
      onApplied();
      setErr('');
      setDoneMsg(t('Hotovo — spočítáno: {polozky}, zapsáno: {rozdily}.', { polozky: polozekTxt(t, d.applied ?? 0), rozdily: rozdilTxt(t, d.diffs ?? 0) }));
    } else {
      const d = res ? await res.json().catch(() => ({})) : {};
      setErr(d.error ? tg(d.error) : t('Dokončení se nepodařilo.'));
    }
  };
  const [doneMsg, setDoneMsg] = useState('');
  /** Kterou inventuru rozebírá report — výchozí je poslední. */
  const [selected, setSelected] = useState<number | null>(null);

  const cancel = async () => {
    if (!open) return;
    setConfirmCancel(false);
    const res = await fetch('/api/stocktake', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: open.id, cancel: true }),
    }).catch(() => null);
    if (res?.ok) setOpen(null);
  };

  const grouped = useMemo(() => {
    if (!open) return [] as [string, Row[]][];
    const map = new Map<string, Row[]>();
    open.data.forEach(r => {
      const k = r.category ?? t('Bez kategorie');
      (map.get(k) ?? map.set(k, []).get(k)!).push(r);
    });
    return Array.from(map.entries());
  }, [open, t]);

  const countedN = open ? open.data.filter(r => r.counted != null || r.countedOpen != null).length : 0;
  const diffN = open ? open.data.filter(r =>
    (r.counted != null && r.counted !== r.expected) ||
    (r.countedOpen != null && r.countedOpen !== (r.expectedOpen ?? 0))).length : 0;

  const plural = (n: number) => rozdilTxt(t, n);

  // Jedno okno z ui (DP §3.10) místo ručního překryvu; úvod bez karty v okně,
  // „Zahájit" je potvrzení v okně = primary, ne limetka.
  return (
    <Modal open onClose={onClose} size="lg" title={t('Inventura skladu')}
      subtitle={open ? t('Zahájena {datum}', { datum: new Date(open.createdAt).toLocaleDateString(LOCALE_PRO_JAZYK[jazyk], { day: 'numeric', month: 'long' }) }) : t('Spočítat skutečné stavy a zapsat rozdíly.')}>
      <div className="space-y-4">
        {err && <p className="note note-danger" role="alert">{err}</p>}
        {doneMsg && <p className="note note-ok" role="status">{doneMsg}</p>}

        {loading ? (
          <div className="space-y-2" aria-busy>
            <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10 w-2/3" />
          </div>
        ) : !open ? (
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="t-meta">{t('Projdi sklad položku po položce a spočítej skutečné stavy. Rozdíly proti evidenci se po potvrzení zapíšou a uloží do historie položek.')}</p>
              {smiZahajit ? (
                <Button variant="primary" icon="clipboard" onClick={start} loading={busy}>{t('Zahájit inventuru')}</Button>
              ) : (
                <p className="t-meta">{t('Inventuru zahajuje vedení — pak může počítat kdokoli.')}</p>
              )}
            </div>
            {smiZtraty && history.length > 0 && (
              <ShrinkageReport stocktakeId={selected ?? undefined} />
            )}

            {history.length > 0 && (
              <section aria-labelledby="inventura-historie">
                <p id="inventura-historie" className="t-label">{t('Minulé inventury')}</p>
                <ul className="list mt-1">
                  {history.map(h => {
                    const counted = h.data.filter(r => r.counted != null || r.countedOpen != null);
                    const diffs = counted.filter(r =>
                      (r.counted != null && r.counted !== r.expected) ||
                      (r.countedOpen != null && r.countedOpen !== (r.expectedOpen ?? 0)));
                    const vybrana = (selected ?? history[0]?.id) === h.id;
                    return (
                      <li key={h.id} className={vybrana ? 'bg-black/[0.04] rounded-xl' : ''}>
                        <ListRow as="div"
                          title={h.completedAt ? fmtDatum(h.completedAt, { jazyk, styl: 'dlouze' }) : '—'}
                          meta={t('{n} spočítáno', { n: counted.length })}
                          right={<Chip tone={diffs.length ? 'wait' : 'ok'} size="sm">{diffs.length ? plural(diffs.length) : t('vše sedělo')}</Chip>}
                          onClick={() => setSelected(h.id)} />
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="sticky top-0 z-10 glass-strong rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#16181A] tabular-nums" aria-live="polite">
                {t('{n}/{celkem} spočítáno', { n: countedN, celkem: open.data.length })}
                {diffN > 0 && <span className="text-wait-ink"> · {plural(diffN)}</span>}
                {neplatnych > 0 && <span className="text-bad-ink"> · {t('{n, plural, one {# pole k opravě} few {# pole k opravě} other {# polí k opravě}}', { n: neplatnych })}</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {smiZahajit && (
                  confirmCancel ? (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => setConfirmCancel(false)}>{t('Nechat běžet')}</Button>
                      <Button variant="danger-solid" size="sm" onClick={cancel}>{t('Zahodit napočítané')}</Button>
                    </>
                  ) : (
                    <Button variant="danger" size="sm" onClick={() => { setConfirmDone(false); setConfirmCancel(true); }}>{t('Zrušit inventuru')}</Button>
                  )
                )}
                {smiDokoncit && !confirmCancel && (
                  confirmDone ? (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => setConfirmDone(false)}>{t('Ještě ne')}</Button>
                      <Button variant="danger-solid" size="sm" loading={busy} onClick={complete}>
                        {diffN > 0 ? t('Zapsat {rozdily}', { rozdily: plural(diffN) }) : t('Zapsat')}
                      </Button>
                    </>
                  ) : (
                    <Button variant="primary" size="sm" disabled={countedN === 0 || neplatnych > 0} onClick={() => setConfirmDone(true)}>
                      {t('Dokončit a zapsat')}
                    </Button>
                  )
                )}
              </div>
            </div>

            {grouped.map(([cat, rows]) => (
              <section key={cat} aria-label={cat}>
                <p className="t-label">{cat}</p>
                <ul className="list mt-1">
                  {rows.map(r => {
                    const diff = r.counted != null ? round3(r.counted - r.expected) : null;
                    const chybaPocet = chybaPole('c' + r.itemId);
                    const chybaZbytek = chybaPole('o' + r.itemId);
                    const pkg = Number(r.packageSize) || 0;
                    const openDiff = r.countedOpen != null ? round3(r.countedOpen - (r.expectedOpen ?? 0)) : null;
                    return (
                      <li key={r.itemId} className="py-2.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="w-full sm:w-auto sm:flex-1 min-w-0 text-sm text-[#16181A] truncate">{r.name}</span>
                          <span className="sm:hidden flex-1" />
                          <span className="shrink-0 text-xs text-black/55 tabular-nums whitespace-nowrap">{t('evid. {mnozstvi} {jednotka}', { mnozstvi: r.expected, jednotka: r.unit })}</span>
                          <input
                            inputMode={desetinne ? 'decimal' : 'numeric'}
                            aria-label={t('Spočítáno — {nazev} ({jednotka})', { nazev: r.name, jednotka: r.unit })}
                            aria-invalid={chybaPocet ? true : undefined}
                            value={texty['c' + r.itemId] ?? pocetDoPole(r.counted)}
                            onChange={e => setCount(r.itemId, e.target.value)}
                            onBlur={() => opustPole('c' + r.itemId)}
                            placeholder="—"
                            className="field !w-20 shrink-0 text-right tabular-nums"
                          />
                          <Rozdil n={diff} text={diff == null ? '' : diff > 0 ? `+${fmt(diff)}` : fmt(diff)} />
                        </div>
                        {chybaPocet && (
                          <p className="text-xs text-bad-ink mt-1" role="alert">
                            {chybaPocet === 'cele'
                              ? t('Tahle položka se eviduje v celých {jednotka} — zapiš celé číslo. Desetiny jdou jen u položky s velikostí balení, jako zbytek v načatém.', { jednotka: r.unit })
                              : t('Zapiš číslo, třeba 2.')}
                          </p>
                        )}
                        {pkg > 0 && (
                          <div className="flex items-center gap-3 pl-4 mt-1.5">
                            <span className="min-w-0 flex-1 text-xs text-black/55 truncate">
                              {t('Zbytek v načatém balení')}
                              <span className="hidden sm:inline"> {t('(z {balení} {jednotka})', { 'balení': pkg, jednotka: r.contentUnit || 'l' })}</span>
                            </span>
                            <span className="shrink-0 text-xs text-black/55 tabular-nums whitespace-nowrap">
                              {t('evid. {mnozstvi} {jednotka}', { mnozstvi: fmt(r.expectedOpen ?? 0), jednotka: r.contentUnit || '' })}
                            </span>
                            <input
                              inputMode="decimal"
                              aria-label={t('Zbytek v načatém — {nazev}', { nazev: r.name })}
                              aria-invalid={chybaZbytek ? true : undefined}
                              value={texty['o' + r.itemId] ?? pocetDoPole(r.countedOpen)}
                              onChange={e => setOpenAmount(r.itemId, e.target.value)}
                              onBlur={() => opustPole('o' + r.itemId)}
                              placeholder="—"
                              className="field !w-20 shrink-0 text-right tabular-nums"
                            />
                            <Rozdil n={openDiff} text={openDiff == null ? '' : openDiff > 0 ? `+${fmt(openDiff)}` : fmt(openDiff)} />
                          </div>
                        )}
                        {chybaZbytek && <p className="text-xs text-bad-ink mt-1 pl-4" role="alert">{t('Zapiš číslo, třeba 0,68.')}</p>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Rozdíl proti evidenci: sedí = ikona fajfky (dřív znak ✓), jinak číslo. */
function Rozdil({ n, text }: { n: number | null; text: string }) {
  const t = useT('sklad');
  return (
    <span className={`w-12 shrink-0 flex justify-end text-xs font-semibold tabular-nums ${n === 0 ? 'text-ok-ink' : 'text-wait-ink'}`}>
      {n == null ? null : n === 0 ? <><Icon name="check" size={14} /><span className="sr-only">{t('sedí')}</span></> : text}
    </span>
  );
}
