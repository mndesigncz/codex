'use client';

// Pravidelné (pevné) náklady podniku — nájem, energie, pojištění, software… (kolo 81).
//
// Výsledek měsíce ve Financích dřív počítal jen tržby − nákupy − mzdy, takže
// kavárna s nájmem 40 000 Kč byla „v plusu" i v měsíci, který nájem nevydělal.
// Tady si vedení napíše řádky, které platí každý měsíc; /api/finance je odečte
// (summary.net) a Souhrn měsíce ukáže výsledek po nich.
//
// Kreslí se v okně z Financí (··· → Pravidelné náklady…) a po sloučení i
// v Nastavení → Podnik (jednořádkový mount dodá koordinátor do SekcePodnik).
// Data přes useDataWidgetu('/api/teams'), ať se po uložení obnoví všude.

import { useEffect, useState } from 'react';
import { apiMessage, okJson } from '@/lib/api';
import {
  castkaNakladuZPole, cistePevneNaklady, pevneNakladyZDb, soucetPevnychNakladu,
  MAX_NAZEV_NAKLADU, MAX_PEVNYCH_NAKLADU, type PevnyNaklad,
} from '@/lib/financeWidgety';
import { useT } from '@/lib/i18n/client';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { Button, EmptyState, ErrorState, Field, Input, ListRow, Skeleton, Toast } from '../ui';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';

export const URL_PODNIKU = '/api/teams';

/** Z odpovědi /api/teams jen pevné náklady; chybějící blok podniku je chyba tvaru, ne „žádné náklady". */
export function vyberPevneNaklady(raw: any): PevnyNaklad[] {
  if (!raw || typeof raw !== 'object' || !raw.team || typeof raw.team !== 'object') throw new Error('Podnik přišel v nečekaném tvaru.'); // i18n-ok
  return pevneNakladyZDb(raw.team.fixed_costs);
}

export default function PevneNaklady({ onUlozeno }: { onUlozeno?: () => void }) {
  const t = useT('sprava');
  const money = useMoney();
  const symbol = useSymbol();
  const data = useDataWidgetu(URL_PODNIKU, vyberPevneNaklady);
  const [radky, setRadky] = useState<PevnyNaklad[] | null>(null);
  const [nazev, setNazev] = useState('');
  const [castka, setCastka] = useState('');
  const [chybaPole, setChybaPole] = useState('');
  const [ukladam, setUkladam] = useState(false);
  const [toast, setToast] = useState<{ text: string; ton?: 'bad'; id: number } | null>(null);

  // Rozpracovaná kopie vzniká jednou z načtených dat; po uložení se přepíše tím, co server vrátil.
  useEffect(() => { if (data.data && radky === null) setRadky(data.data); }, [data.data, radky]);

  const seznam = radky ?? data.data ?? [];
  const ulozene = data.data ?? [];
  // Vyplněný, ale nepřidaný řádek se při Uložit přidá sám — na telefonu se „Přidat" snadno přeskočí
  // a řádek by se potichu ztratil.
  const rozepsano = nazev.trim() !== '' || castka.trim() !== '';
  const zmeneno = rozepsano || JSON.stringify(seznam) !== JSON.stringify(ulozene);
  const soucet = soucetPevnychNakladu(seznam);
  const plno = seznam.length >= MAX_PEVNYCH_NAKLADU;

  /** Přidá rozepsaný řádek; vrátí nový seznam, nebo null, když pole nesedí (chyba je pod nimi). */
  const pridat = (): PevnyNaklad[] | null => {
    const jmeno = nazev.trim();
    const n = castkaNakladuZPole(castka);
    if (!jmeno) { setChybaPole(t('Napiš, za co se platí — třeba Nájem.')); return null; }
    if (n == null) { setChybaPole(t('Částka musí být číslo od nuly.')); return null; }
    if (plno) { setChybaPole(t('Nejvýš {n} řádků.', { n: MAX_PEVNYCH_NAKLADU })); return null; }
    setChybaPole('');
    const novy = [...seznam, { name: jmeno.slice(0, MAX_NAZEV_NAKLADU), amount: n }];
    setRadky(novy);
    setNazev(''); setCastka('');
    return novy;
  };

  const odebrat = (i: number) => setRadky(seznam.filter((_, j) => j !== i));

  const ulozit = async () => {
    const kUlozeni = rozepsano ? pridat() : seznam;
    if (!kUlozeni) return;
    const ciste = cistePevneNaklady(kUlozeni);
    if (!ciste) { setToast({ text: t('Pravidelné náklady nejsou v pořádku — zkontroluj názvy a částky.'), ton: 'bad', id: Date.now() }); return; }
    setUkladam(true);
    try {
      await fetch(URL_PODNIKU, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixedCosts: ciste }),
      }).then(okJson);
      setRadky(ciste);
      obnovDataWidgetu(URL_PODNIKU);
      // Výsledek měsíce se počítá na serveru — zobrazený měsíc Financí obnoví volající (onUlozeno).
      setToast({ text: t('Pravidelné náklady uloženy: {castka} měsíčně.', { castka: money(soucetPevnychNakladu(ciste)) }), id: Date.now() });
      onUlozeno?.();
    } catch (e) {
      setToast({ text: apiMessage(e, t('Uložení se nepodařilo.')), ton: 'bad', id: Date.now() });
    } finally { setUkladam(false); }
  };

  if (data.error && !data.data) {
    return <ErrorState compact title={t('Pravidelné náklady se nenačetly')} detail={data.error} onRetry={data.reload} />;
  }
  if (data.loading && !data.data) {
    return <div className="space-y-2" aria-busy><Skeleton className="h-12" /><Skeleton className="h-12 w-2/3" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="t-meta text-pretty">{t('Co platíš každý měsíc bez ohledu na tržbu: nájem, energie, pojištění, software. Výsledek měsíce ve Financích je po jejich odečtení.')}</p>

      {seznam.length === 0 ? (
        <EmptyState compact icon="coins" title={t('Zatím žádné pevné náklady')}
          hint={t('Přidej první řádek níž — třeba Nájem a částku za měsíc.')} />
      ) : (
        <ul className="list">
          {seznam.map((r, i) => (
            <ListRow key={`${r.name}-${i}`} title={r.name}
              value={<span className="tabular-nums">{money(r.amount)}</span>}
              actions={<Button variant="ghost" size="sm" iconOnly icon="trash" className="tap-target" aria-label={t('Odebrat {nazev}', { nazev: r.name })} onClick={() => odebrat(i)} />} />
          ))}
          <ListRow title={<span className="font-semibold">{t('Celkem za měsíc')}</span>}
            value={<span className="tabular-nums font-semibold">{money(soucet)}</span>} />
        </ul>
      )}

      {/* Přidání řádku: název a částka vedle sebe (pružný + 7–9 rem), Přidat na telefonu pod nimi přes
          celou šířku, od sm na konci řady. v4: pole i tlačítko 44, žádné pole v půlce (P2, P7). */}
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] sm:grid-cols-[minmax(0,1fr)_9rem_auto] gap-x-2 gap-y-3 items-end">
        <Field id="pevne-nazev" label={t('Název')}>
          <Input id="pevne-nazev" value={nazev} maxLength={MAX_NAZEV_NAKLADU} placeholder={t('Nájem, energie…')} autoComplete="off"
            disabled={plno} onChange={e => setNazev(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); pridat(); } }} />
        </Field>
        <Field id="pevne-castka" label={t('Za měsíc ({symbol})', { symbol })}>
          <Input id="pevne-castka" value={castka} inputMode="decimal" className="text-right tabular-nums" placeholder="0" autoComplete="off"
            disabled={plno} onChange={e => setCastka(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); pridat(); } }} />
        </Field>
        <Button variant="secondary" icon="plus" className="col-span-2 sm:col-span-1" disabled={plno} onClick={pridat}>{t('Přidat')}</Button>
      </div>
      {chybaPole && <p role="alert" className="note note-danger">{chybaPole}</p>}
      {plno && <p className="t-meta">{t('Nejvýš {n} řádků.', { n: MAX_PEVNYCH_NAKLADU })}</p>}

      <Button variant="accent" className="w-full" loading={ukladam} disabled={!zmeneno} onClick={ulozit}>{t('Uložit')}</Button>
      {toast && <Toast key={toast.id} id={toast.id} message={toast.text} tone={toast.ton} onClose={() => setToast(null)} />}
    </div>
  );
}
