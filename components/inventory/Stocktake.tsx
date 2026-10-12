'use client';

// Inventura: spočítat regál položku po položce proti zmrazenému snímku a pak
// jedním potvrzením zapsat rozdíly do skladu.
//
// Kolo 82 — „zápis zbytků má být na první dobrou": počítací list (count sheet)
// jako v MarketMan nebo Craftable. Každý řádek má jedno velké pole s jednotkou
// přímo v něm, krokovač ±, tlačítko „Sedí" (stejné jako v evidenci — většina
// položek sedí a psát totéž číslo znovu je práce navíc) a rozdíl hned vedle.
// Nahoře pruh postupu a filtr kategorií (regál se počítá po regálech), „jen
// nespočítané" na konec. Před zapsáním souhrn: co ubylo, co přibylo, v penězích
// (lib/mnozstvi.souhrnInventury) — dřív jen „Zapsat 3 rozdíly" bez čísel.
//
// Dřív: pole 80 px bez jednotky, jednotka jen v „evid. 8 l" vlevo, bez ±, bez
// filtru, na telefonu se název, evidence, pole a rozdíl lámaly do dvou řádků.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import ShrinkageReport from './ShrinkageReport';
import PoleMnozstvi from './PoleMnozstvi';
import { okJson } from '@/lib/api';
import { tg } from '@/lib/i18n/stav';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';
import { polozekTxt, rozdilTxt } from './texty';
import { pocetDoPole, pocetZPole } from '@/lib/inventura';
import { fmtAmount } from '@/lib/packaging';
import {
  souhrnInventury, rozdilRadku, kategorieInventury, filtrujInventuru, type RadekInventury, type PolozkaSouhrnu,
} from '@/lib/mnozstvi';
import { useMoney } from '../CurrencyProvider';
import { Button, Chip, ListRow, Modal, Skeleton, Stat, StatRow, Well } from '../ui';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

type Row = RadekInventury;
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
  const money = useMoney();
  const fmt = (n: number) => round3(n).toLocaleString(LOCALE_PRO_JAZYK[jazyk], { maximumFractionDigits: 3 });
  const [open, setOpen] = useState<Take | null>(null);
  const [history, setHistory] = useState<Take[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  // Zrušení inventury se potvrzuje v okně (dřív confirm()).
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Filtr: kategorie (undefined = všechny, null = bez kategorie) a jen nespočítané.
  const [kategorie, setKategorie] = useState<string | null | undefined>(undefined);
  const [jenNespocitane, setJenNespocitane] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCounts = useRef<Record<string, number | null>>({});
  const pendingOpens = useRef<Record<string, number | null>>({});
  const souhrnRef = useRef<HTMLDivElement>(null);
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

  /** „Sedí": spočítáno = evidence (i zbytek v načatém). Jedno klepnutí místo opisování čísla. */
  const sedi = (r: Row) => {
    setTexty(t => { const k = { ...t }; delete k['c' + r.itemId]; delete k['o' + r.itemId]; return k; });
    setCount(r.itemId, pocetDoPole(r.expected));
    if (Number(r.packageSize) > 0) setOpenAmount(r.itemId, pocetDoPole(r.expectedOpen ?? 0));
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

  const kategorieSeznam = useMemo(() => (open ? kategorieInventury(open.data) : []), [open]);
  const viditelne = useMemo(() => (open ? filtrujInventuru(open.data, { kategorie, jenNespocitane }) : []), [open, kategorie, jenNespocitane]);
  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    viditelne.forEach(r => {
      const k = r.category ?? t('Bez kategorie');
      (map.get(k) ?? map.set(k, []).get(k)!).push(r);
    });
    return Array.from(map.entries());
  }, [viditelne, t]);
  const souhrn = useMemo(() => souhrnInventury(open?.data ?? []), [open]);
  const countedN = souhrn.spocitano;
  const diffN = souhrn.rozdilu;
  const celkem = open ? open.data.length : 0;
  const pocetVKategorii = (k: string | null) => (open ? open.data.filter(r => (r.category ?? null) === k).length : 0);

  const plural = (n: number) => rozdilTxt(t, n);
  const otevritSouhrn = () => {
    setConfirmCancel(false); setConfirmDone(true);
    requestAnimationFrame(() => souhrnRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

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
            {/* Lišta postupu: kolik je spočítáno, pruh, a tlačítka. Lepí se k horní hraně okna. */}
            <div className="sticky top-0 z-10 glass-strong rounded-2xl px-4 py-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#16181A] tabular-nums" aria-live="polite">
                  {t('{n}/{celkem} spočítáno', { n: countedN, celkem })}
                  {diffN > 0 && <span className="text-wait-ink"> · {plural(diffN)}</span>}
                  {neplatnych > 0 && <span className="text-bad-ink"> · {t('{n, plural, one {# pole k opravě} few {# pole k opravě} other {# polí k opravě}}', { n: neplatnych })}</span>}
                </p>
                {!confirmDone && (
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
                      <Button variant="primary" size="sm" disabled={countedN === 0 || neplatnych > 0} onClick={otevritSouhrn}>
                        {t('Dokončit a zapsat')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden" role="progressbar" aria-label={t('Spočítáno')}
                aria-valuemin={0} aria-valuemax={celkem} aria-valuenow={countedN}>
                <div className="h-full rounded-full bg-[#16181A] transition-[width]" style={{ width: `${celkem ? Math.round((countedN / celkem) * 100) : 0}%` }} />
              </div>
            </div>

            {/* Souhrn před zapsáním: co ubylo, co přibylo, za kolik. Tady se pozná překlep (−48 místo −4). */}
            {confirmDone && (
              <div ref={souhrnRef} className="scroll-mt-24">
                <Souhrn s={souhrn} money={money} fmt={fmt} busy={busy} onZpet={() => setConfirmDone(false)} onZapsat={complete} />
              </div>
            )}

            {/* Filtr: regál po regálu; „jen nespočítané" na konec, ať se nic nepřeskočí. */}
            {(kategorieSeznam.length > 1 || countedN > 0) && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Filtr inventury')}>
                {kategorieSeznam.length > 1 && (
                  <>
                    <button type="button" aria-pressed={kategorie === undefined} onClick={() => setKategorie(undefined)}
                      className={`filter-pill tap-target-sm ${kategorie === undefined ? 'seg-on' : 'seg-off glass'}`}>
                      {t('Vše')}<span className={`ml-1 tabular-nums ${kategorie === undefined ? 'text-white/60' : 'text-black/45'}`}>{celkem}</span>
                    </button>
                    {kategorieSeznam.map(k => (
                      <button key={k ?? '∅'} type="button" aria-pressed={kategorie === k} onClick={() => setKategorie(kategorie === k ? undefined : k)}
                        className={`filter-pill tap-target-sm max-w-full ${kategorie === k ? 'seg-on' : 'seg-off glass'}`}>
                        <span className="truncate">{k ?? t('Bez kategorie')}</span>
                        <span className={`ml-1 tabular-nums ${kategorie === k ? 'text-white/60' : 'text-black/45'}`}>{pocetVKategorii(k)}</span>
                      </button>
                    ))}
                  </>
                )}
                {countedN > 0 && countedN < celkem && (
                  <button type="button" aria-pressed={jenNespocitane} onClick={() => setJenNespocitane(v => !v)}
                    className={`filter-pill tap-target-sm ${jenNespocitane ? 'seg-on' : 'seg-off glass'}`}>
                    {t('Jen nespočítané')}<span className={`ml-1 tabular-nums ${jenNespocitane ? 'text-white/60' : 'text-black/45'}`}>{celkem - countedN}</span>
                  </button>
                )}
              </div>
            )}

            {grouped.length === 0 && (
              <p className="t-meta py-2">{jenNespocitane ? t('Všechno je spočítané.') : t('V téhle kategorii nic není.')}</p>
            )}

            {grouped.map(([cat, rows]) => (
              <section key={cat} aria-label={cat}>
                <p className="t-label">{cat}</p>
                <ul className="list mt-1">
                  {rows.map(r => {
                    const d = rozdilRadku(r);
                    const chybaPocet = chybaPole('c' + r.itemId);
                    const chybaZbytek = chybaPole('o' + r.itemId);
                    const pkg = Number(r.packageSize) || 0;
                    const cu = r.contentUnit || r.unit;
                    const sediCele = r.counted != null && d.ks === 0 && (pkg <= 0 || (r.countedOpen != null && d.obsah === 0));
                    return (
                      <li key={r.itemId} className="py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[#16181A] truncate">{r.name}</p>
                            <p className="t-meta tabular-nums">
                              {t('evidence {mnozstvi} {jednotka}', { mnozstvi: fmt(r.expected), jednotka: r.unit })}
                              {pkg > 0 && <> + {fmt(r.expectedOpen ?? 0)} {cu} {t('v načatém')}</>}
                            </p>
                          </div>
                          <Rozdil n={r.counted != null ? d.ks : null} jednotka={r.unit} fmt={fmt} />
                        </div>
                        <div className="flex items-center gap-2">
                          <PoleMnozstvi
                            id={`inv-c-${r.itemId}`}
                            value={texty['c' + r.itemId] ?? pocetDoPole(r.counted)}
                            onChange={v => setCount(r.itemId, v)}
                            onBlur={() => opustPole('c' + r.itemId)}
                            jednotka={r.unit} desetinne={desetinne} krok={1} velikost="lg" nazev={r.name}
                            ariaLabel={t('Spočítáno — {nazev} ({jednotka})', { nazev: r.name, jednotka: r.unit })}
                            invalid={!!chybaPocet} placeholder="—" className="flex-1 min-w-0"
                          />
                          <Button variant={sediCele ? 'primary' : 'secondary'} icon="check" aria-pressed={sediCele} className="shrink-0"
                            aria-label={t('Sedí s evidencí — {nazev}', { nazev: r.name })} onClick={() => sedi(r)}>
                            {t('Sedí')}
                          </Button>
                        </div>
                        {chybaPocet && (
                          <p className="text-xs text-bad-ink" role="alert">
                            {chybaPocet === 'cele'
                              ? t('Tahle položka se eviduje v celých {jednotka} — zapiš celé číslo. Desetiny jdou jen u položky s velikostí balení, jako zbytek v načatém.', { jednotka: r.unit })
                              : t('Zapiš číslo, třeba 2.')}
                          </p>
                        )}
                        {pkg > 0 && (
                          <div className="flex items-center gap-2 pl-1">
                            <label htmlFor={`inv-o-${r.itemId}`} className="t-meta shrink-0 min-w-0 truncate max-w-[9rem]">
                              {t('Načaté balení ({velikost} {jednotka})', { velikost: fmtAmount(pkg), jednotka: cu })}
                            </label>
                            <PoleMnozstvi
                              id={`inv-o-${r.itemId}`}
                              value={texty['o' + r.itemId] ?? pocetDoPole(r.countedOpen)}
                              onChange={v => setOpenAmount(r.itemId, v)}
                              onBlur={() => opustPole('o' + r.itemId)}
                              jednotka={cu} desetinne invalid={!!chybaZbytek} placeholder="—" className="flex-1 min-w-0"
                            />
                            <Rozdil n={r.countedOpen != null ? d.obsah : null} jednotka={cu} fmt={fmt} />
                          </div>
                        )}
                        {chybaZbytek && <p className="text-xs text-bad-ink pl-1" role="alert">{t('Zapiš číslo, třeba 0,68.')}</p>}
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

/** Rozdíl proti evidenci: sedí = fajfka, jinak „+2 l" / „−1 lahev" v jantaru; nespočítáno = nic. */
function Rozdil({ n, jednotka, fmt }: { n: number | null; jednotka: string; fmt: (n: number) => string }) {
  const t = useT('sklad');
  if (n == null) return null;
  if (n === 0) return <Chip tone="ok" size="sm" className="shrink-0"><Icon name="check" size={11} /> {t('sedí')}</Chip>;
  return <Chip tone="wait" size="sm" className="shrink-0 tabular-nums">{n > 0 ? `+${fmt(n)}` : `−${fmt(Math.abs(n))}`} {jednotka}</Chip>;
}

/** Souhrn před zapsáním: ubylo / přibylo / v penězích, řádek po řádku. */
function Souhrn({ s, money, fmt, busy, onZpet, onZapsat }: {
  s: ReturnType<typeof souhrnInventury>; money: (n: number) => string; fmt: (n: number) => string;
  busy: boolean; onZpet: () => void; onZapsat: () => void;
}) {
  const t = useT('sklad');
  const radek = (p: PolozkaSouhrnu) => {
    const zmeny: string[] = [];
    if (p.ks !== 0) zmeny.push(`${fmt(p.expected)} → ${fmt(p.counted ?? p.expected)} ${p.jednotka}`);
    if (p.obsah != null && p.obsah !== 0) zmeny.push(`${t('načaté')} ${fmt(p.expectedOpen ?? 0)} → ${fmt(p.countedOpen ?? 0)} ${p.jednotkaObsahu ?? ''}`);
    const hlavni = p.ks !== 0 ? p.ks : (p.obsah ?? 0);
    const jedn = p.ks !== 0 ? p.jednotka : (p.jednotkaObsahu ?? p.jednotka);
    const ubyva = hlavni < 0;
    return (
      <ListRow key={p.itemId} as="li" title={p.name} meta={zmeny.join(' · ')}
        value={<span className={ubyva ? 'text-bad-ink' : 'text-ok-ink'}>{ubyva ? '−' : '+'}{fmt(Math.abs(hlavni))} {jedn}</span>}
        valueMeta={p.hodnota != null ? `${p.hodnota > 0 ? '+' : ''}${money(p.hodnota)}` : undefined} />
    );
  };
  return (
    <Well className="space-y-3" role="region" aria-labelledby="inv-souhrn">
      <h3 id="inv-souhrn" className="t-card">{s.rozdilu > 0 ? t('Před zapsáním zkontroluj rozdíly') : t('Všechno spočítané sedí')}</h3>
      {s.rozdilu === 0 ? (
        <p className="t-meta">{t('Sklad se nezmění, inventura se jen uzavře a uloží do historie.')}</p>
      ) : (
        <>
          <StatRow>
            <Stat label={t('Ubylo')} value={<span className={s.ubylo.length ? 'text-bad-ink' : ''}>{s.ubylo.length}</span>}
              note={s.sCenami ? money(s.hodnotaUbylo) : polozekTxt(t, s.ubylo.length)} />
            <Stat label={t('Přibylo')} value={s.pribylo.length} note={s.sCenami ? `+${money(s.hodnotaPribylo)}` : polozekTxt(t, s.pribylo.length)} />
            {s.sCenami && (
              <Stat label={t('Rozdíl v penězích')} value={<span className={s.saldo < 0 ? 'text-bad-ink' : ''}>{s.saldo > 0 ? '+' : ''}{money(s.saldo)}</span>}
                note={s.bezCeny > 0 ? t('{n, plural, one {# položka bez ceny} few {# položky bez ceny} other {# položek bez ceny}}', { n: s.bezCeny }) : t('podle cen ve skladu')} />
            )}
          </StatRow>
          <ul className="list">{[...s.ubylo, ...s.pribylo].map(radek)}</ul>
        </>
      )}
      {s.nespocitano > 0 && (
        <p className="t-meta">{t('{n, plural, one {# nespočítaná položka zůstane} few {# nespočítané položky zůstanou} other {# nespočítaných položek zůstane}} beze změny.', { n: s.nespocitano })}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onZpet}>{t('Ještě ne')}</Button>
        <Button variant="primary" icon="check" loading={busy} onClick={onZapsat}>
          {s.rozdilu > 0 ? t('Zapsat {rozdily}', { rozdily: rozdilTxt(t, s.rozdilu) }) : t('Uzavřít inventuru')}
        </Button>
      </div>
    </Well>
  );
}
