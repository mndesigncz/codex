'use client';

// Okno „Nový úkol za body" / „Upravit úkol za body" (kolo 9 jako položka nabídky navíc,
// kolo 11 přepracované na volitelný úkol s vlastním opakováním — balík V).
//
// Pole: název, popis, body (krokovač ±5), prémie v měně podniku, Opakování (Kdykoli ·
// Jednorázově · Každý den · Vybrané dny s chipy Po–Ne · Jednou týdně · Jednou měsíčně ·
// Každých N dní od data), platnost od–do, Kolik lidí v termínu (prázdné = kdokoli),
// Kolikrát jeden člověk, Komu (všem / vybraným lidem z /api/teams), přepínače Fotka
// povinná, Uznat automaticky a Nabízet. Dole věta náhledu („Po, St · 1 člověk · +20 b ·
// uzná se samo"), ať je vidět, co lidé uvidí. Validace stejná jako na serveru
// (validujNabidku z lib/navic) — hláška se ukáže před odesláním.
// POST /api/navic/offers (nový) / PATCH { id, … } (úprava).

import React, { useState } from 'react';
import { MAX_BODU, MAX_DELKA_NAZVU, MAX_DELKA_POZNAMKY, MAX_PREMIE, URL_NABIDKA_NAVIC, validujNabidku, type NabidkaNavic, type OpakovaniNabidky } from '@/lib/navic';
import { apiMessage, okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';
import { pragueToday } from '@/lib/pragueTime';
import { Button, Field, Input, Modal, Segmented, Select, SwitchRow, Textarea } from '../ui';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { obnovNavic } from './data';
import { prelozHlaskuNavic } from './hlasky';
import { NadPlochou } from './UznatNavic';
import { formularZNabidky, krokBoduUkolu, prepniDen, teloFormulare, type FormularZaBody } from './zaBody';
import { denKratce, vetaNahledu } from './popisyZaBody';

interface Clen { id: number; jmeno: string }
const vyberCleny = (raw: unknown): Clen[] => (Array.isArray((raw as { members?: unknown } | null)?.members) ? (raw as { members: any[] }).members : [])
  .map(m => ({ id: Number(m?.id), jmeno: String(m?.name ?? '') }))
  .filter(m => Number.isFinite(m.id) && m.id > 0 && m.jmeno)
  .sort((a, b) => a.jmeno.localeCompare(b.jmeno, 'cs'));

const DNY_TYDNE = [1, 2, 3, 4, 5, 6, 7] as const;

export function NabidkaNavicOkno({ polozka, predvyplneno, onClose, onHotovo, nadOkny = false }: {
  /** Upravovaný úkol; bez něj se zakládá nový. */
  polozka?: NabidkaNavic | null;
  /** Název a popis z běžného „Nový úkol" (volba „Volitelný — kdo chce, za body"). */
  predvyplneno?: { nazev?: string; popis?: string };
  onClose: () => void;
  onHotovo?: (offer: NabidkaNavic, nova: boolean) => void;
  nadOkny?: boolean;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const symbol = useSymbol();
  const nova = !polozka;
  const [f, setF] = useState<FormularZaBody>(() => formularZNabidky(polozka, predvyplneno));
  const zmen = (zmena: Partial<FormularZaBody>) => setF(x => ({ ...x, ...zmena }));
  const lide = useDataWidgetu(f.jenVybranym ? '/api/teams' : null, vyberCleny);
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const moznosti: { id: OpakovaniNabidky; label: string }[] = [
    { id: 'kdykoli', label: t('Kdykoli') },
    { id: 'jednou', label: t('Jednorázově') },
    { id: 'denne', label: t('Každý den') },
    { id: 'dny', label: t('Vybrané dny') },
    { id: 'tydne', label: t('Jednou týdně') },
    { id: 'mesicne', label: t('Jednou měsíčně') },
    { id: 'interval', label: t('Každých N dní') },
  ];
  const napovedaOpakovani: Record<OpakovaniNabidky, string> = {
    kdykoli: t('Dá se vzít kterýkoli den, dokud úkol platí.'),
    jednou: t('Jediný termín za celou platnost — kdo ho splní, ten ho má.'),
    denne: t('Každý den znovu; kolik lidí a kolikrát platí pro každý den.'),
    dny: t('Jen ve vybrané dny v týdnu.'),
    tydne: t('Jednou za týden (pondělí až neděle).'),
    mesicne: t('Jednou za měsíc.'),
    interval: t('Každých pár dní od zvoleného dne.'),
  };
  const zmenOpakovani = (o: OpakovaniNabidky) => {
    // „Každých N dní" se počítá od dne „platí od" — bez něj ho server odmítne, tak ať je předvyplněný dnešek.
    zmen({ opakovani: o, ...(o === 'interval' && !f.od ? { od: pragueToday() } : {}) });
  };

  /** Tělo pro server z formuláře (pole, která opakování nepotřebuje, jdou prázdná). */
  const telo = () => teloFormulare(f);
  const uloz = async () => {
    if (ukladam) return;
    // Stejná pravidla jako server: hlášku ukázat hned, bez cesty na server.
    if (f.jenVybranym && f.komu.length === 0) { setChyba(t('Vyber aspoň jednoho člověka, nebo nech úkol pro všechny.')); return; }
    const v = validujNabidku(telo());
    if (!v.ok) { setChyba(prelozHlaskuNavic(t, v.chyba)); return; }
    setUkladam(true); setChyba(null);
    try {
      const d = await fetch(URL_NABIDKA_NAVIC, {
        method: nova ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nova ? v.nabidka : { id: polozka!.id, ...v.nabidka }),
      }).then(okJson);
      obnovNavic();
      onHotovo?.((d?.offer ?? { id: polozka?.id ?? 0, ...v.nabidka, createdAt: '' }) as NabidkaNavic, nova);
      onClose();
    } catch (e) {
      setChyba(apiMessage(e, t('Úkol za body se nepodařilo uložit.')));
    } finally {
      setUkladam(false);
    }
  };

  const bodyCislo = Number(f.body) || 0;
  return (
    <NadPlochou>
      <Modal open onClose={onClose} size="md" nadOkny={nadOkny} title={nova ? t('Nový úkol za body') : t('Upravit úkol za body')}
        subtitle={t('Volitelný úkol — kdo chce, vezme si ho a dostane body.')}
        footer={<>
          <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
          <Button type="submit" form="nabidka-navic" variant="primary" icon="check" loading={ukladam} disabled={!f.nazev.trim()}>{nova ? t('Vypsat úkol') : t('Uložit')}</Button>
        </>}>
        <form id="nabidka-navic" className="space-y-4" data-nabidka-navic-okno onSubmit={e => { e.preventDefault(); void uloz(); }}>
          <Field id="nabidka-nazev" label={t('Co se má udělat')}>
            <Input id="nabidka-nazev" value={f.nazev} onChange={e => zmen({ nazev: e.target.value })} maxLength={MAX_DELKA_NAZVU} placeholder={t('Např. vytřít sklad a chodbu')} autoFocus={!f.nazev} />
          </Field>
          <Field id="nabidka-popis" label={t('Popis (nepovinný)')} hint={t('Co přesně to znamená — člověk to uvidí u úkolu.')}>
            <Textarea id="nabidka-popis" rows={2} value={f.popis} onChange={e => zmen({ popis: e.target.value })} maxLength={MAX_DELKA_POZNAMKY} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="nabidka-body" label={t('Body')} hint={t('0–{max}', { max: MAX_BODU })}>
              <div className="flex items-center gap-1.5">
                <Button variant="secondary" size="sm" iconOnly icon="minus" className="tap-target shrink-0" aria-label={t('Méně bodů')} disabled={bodyCislo <= 0}
                  onClick={() => zmen({ body: String(krokBoduUkolu(f.body, -1, MAX_BODU)) })} />
                <Input id="nabidka-body" type="number" inputMode="numeric" min={0} max={MAX_BODU} step={1} value={f.body}
                  onChange={e => zmen({ body: e.target.value.replace(/\D/g, '') })} className="min-w-0 text-center tabular-nums" />
                <Button variant="secondary" size="sm" iconOnly icon="plus" className="tap-target shrink-0" aria-label={t('Víc bodů')} disabled={bodyCislo >= MAX_BODU}
                  onClick={() => zmen({ body: String(krokBoduUkolu(f.body, 1, MAX_BODU)) })} />
              </div>
            </Field>
            <Field id="nabidka-premie" label={t('Prémie')} hint={t('Nepovinná; jde do výplaty.')}>
              <div className="relative">
                <Input id="nabidka-premie" type="number" inputMode="numeric" min={0} max={MAX_PREMIE} step={1} value={f.premie}
                  onChange={e => zmen({ premie: e.target.value.replace(/\D/g, '') })} className="tabular-nums pr-10" />
                <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
              </div>
            </Field>
          </div>

          <Field id="nabidka-opakovani" label={t('Opakování')} hint={napovedaOpakovani[f.opakovani]}>
            <Select id="nabidka-opakovani" value={f.opakovani} onChange={e => zmenOpakovani(e.target.value as OpakovaniNabidky)}>
              {moznosti.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </Select>
          </Field>
          {f.opakovani === 'dny' && (
            <fieldset className="min-w-0" data-nabidka-dny>
              <legend className="field-label">{t('Které dny')}</legend>
              <div className="flex flex-wrap gap-1.5">
                {DNY_TYDNE.map(d => {
                  const on = f.dny.includes(d);
                  return (
                    <button key={d} type="button" aria-pressed={on} onClick={() => zmen({ dny: prepniDen(f.dny, d) })}
                      className={`filter-pill tap-target min-w-[2.75rem] justify-center ${on ? 'seg-on' : 'seg-off glass'}`}>{denKratce(t, d)}</button>
                  );
                })}
              </div>
            </fieldset>
          )}
          {f.opakovani === 'interval' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field id="nabidka-interval" label={t('Každých kolik dní')} hint={t('2–90')}>
                <Input id="nabidka-interval" type="number" inputMode="numeric" min={2} max={90} step={1} value={f.interval}
                  onChange={e => zmen({ interval: e.target.value.replace(/\D/g, '') })} className="tabular-nums" />
              </Field>
              <Field id="nabidka-od" label={t('Počítá se od')}>
                <Input id="nabidka-od" type="date" value={f.od} onChange={e => zmen({ od: e.target.value, ...(f.do && e.target.value && f.do < e.target.value ? { do: e.target.value } : {}) })} className="appearance-none min-w-0" />
              </Field>
              <Field id="nabidka-do" label={t('Platí do')} hint={t('Nepovinné.')} className="col-span-2 sm:col-span-1">
                <Input id="nabidka-do" type="date" value={f.do} min={f.od || undefined} onChange={e => zmen({ do: e.target.value })} className="appearance-none min-w-0" />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field id="nabidka-od" label={t('Platí od')}>
                <Input id="nabidka-od" type="date" value={f.od} onChange={e => zmen({ od: e.target.value, ...(f.do && e.target.value && f.do < e.target.value ? { do: e.target.value } : {}) })} className="appearance-none min-w-0" />
              </Field>
              <Field id="nabidka-do" label={t('Platí do')}>
                <Input id="nabidka-do" type="date" value={f.do} min={f.od || undefined} onChange={e => zmen({ do: e.target.value })} className="appearance-none min-w-0" />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field id="nabidka-kapacita" label={t('Kolik lidí')} hint={t('V jednom termínu; prázdné = kdokoli.')}>
              <Input id="nabidka-kapacita" type="number" inputMode="numeric" min={1} max={50} step={1} value={f.kapacita} placeholder={t('Kdokoli')}
                onChange={e => zmen({ kapacita: e.target.value.replace(/\D/g, '') })} className="tabular-nums" />
            </Field>
            <Field id="nabidka-limit" label={t('Kolikrát jeden člověk')} hint={t('V jednom termínu; prázdné = bez limitu.')}>
              <Input id="nabidka-limit" type="number" inputMode="numeric" min={1} max={50} step={1} value={f.limit} placeholder={t('Bez limitu')}
                onChange={e => zmen({ limit: e.target.value.replace(/\D/g, '') })} className="tabular-nums" />
            </Field>
          </div>

          <fieldset className="min-w-0" data-nabidka-komu>
            <legend className="field-label">{t('Komu')}</legend>
            <Segmented size="sm" ariaLabel={t('Komu')} value={f.jenVybranym ? 'vybrani' : 'vsichni'}
              onChange={v => zmen({ jenVybranym: v === 'vybrani' })}
              options={[{ id: 'vsichni', label: t('Všem') }, { id: 'vybrani', label: t('Vybraným lidem') }]} />
            {f.jenVybranym && (
              <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label={t('Vybraní lidé')}>
                {lide.loading && !lide.data ? <p className="t-meta">{t('Načítám členy…')}</p>
                  : lide.error ? <p className="note note-wait text-sm">{lide.error}</p>
                  : (lide.data ?? []).map(m => {
                    const on = f.komu.includes(m.id);
                    return (
                      <button key={m.id} type="button" aria-pressed={on}
                        onClick={() => zmen({ komu: on ? f.komu.filter(x => x !== m.id) : [...f.komu, m.id] })}
                        className={`filter-pill tap-target max-w-full ${on ? 'seg-on' : 'seg-off glass'}`}><span className="truncate">{m.jmeno}</span></button>
                    );
                  })}
              </div>
            )}
          </fieldset>

          <ul className="list">
            <SwitchRow title={t('Fotka povinná')} hint={t('Bez fotky nepůjde úkol odevzdat jako hotový.')} checked={f.fotka} onChange={v => zmen({ fotka: v })} />
            <SwitchRow title={t('Uznat automaticky')} hint={t('Splněný úkol se uzná sám, bez fronty — body připíše hned.')} checked={f.auto} onChange={v => zmen({ auto: v })} />
            <SwitchRow title={t('Nabízet')} hint={t('Vypnutý úkol lidé nevidí; zápisy k němu zůstávají.')} checked={f.aktivni} onChange={v => zmen({ aktivni: v })} />
          </ul>

          <div className="well px-3 py-2.5" data-nabidka-nahled>
            <p className="t-label">{t('Lidé uvidí')}</p>
            <p className="mt-0.5 text-sm font-semibold text-[#16181A] text-pretty">{f.nazev.trim() || t('Úkol za body')}</p>
            <p className="t-meta text-pretty">{vetaNahledu(t, f, money)}</p>
          </div>
          {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
        </form>
      </Modal>
    </NadPlochou>
  );
}

export default NabidkaNavicOkno;
