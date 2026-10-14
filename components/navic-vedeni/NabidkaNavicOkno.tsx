'use client';

// Okno položky nabídky „Co se dá udělat navíc" (kolo 9, balík V): Nová položka /
// Upravit. Název, popis, body, prémie v měně podniku, přepínač „Uznat automaticky",
// platnost od–do, limit za den, aktivní. Validace stejná jako na serveru
// (validujNabidku z lib/navic) — hláška se ukáže před odesláním.
// POST /api/navic/offers (nová) / PATCH { id, … } (úprava).

import React, { useState } from 'react';
import { MAX_BODU, MAX_DELKA_NAZVU, MAX_DELKA_POZNAMKY, MAX_PREMIE, URL_NABIDKA_NAVIC, validujNabidku, type NabidkaNavic } from '@/lib/navic';
import { apiMessage, okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';
import { Button, Field, Input, Modal, Switch, Textarea } from '../ui';
import { useSymbol } from '../CurrencyProvider';
import { obnovNavic } from './data';
import { prelozHlaskuNavic } from './hlasky';

export function NabidkaNavicOkno({ polozka, onClose, onHotovo }: {
  /** Upravovaná položka; bez ní se zakládá nová. */
  polozka?: NabidkaNavic | null;
  onClose: () => void;
  onHotovo?: (offer: NabidkaNavic, nova: boolean) => void;
}) {
  const t = useT('widgety');
  const symbol = useSymbol();
  const nova = !polozka;
  const [nazev, setNazev] = useState(polozka?.title ?? '');
  const [popis, setPopis] = useState(polozka?.description ?? '');
  const [body, setBody] = useState(String(polozka?.points ?? 10));
  const [premie, setPremie] = useState(polozka?.bonusCzk ? String(polozka.bonusCzk) : '');
  const [auto, setAuto] = useState(polozka?.autoApprove ?? false);
  const [aktivni, setAktivni] = useState(polozka?.active ?? true);
  const [od, setOd] = useState(polozka?.validFrom ?? '');
  const [doDne, setDoDne] = useState(polozka?.validTo ?? '');
  const [limit, setLimit] = useState(polozka?.maxPerDay ? String(polozka.maxPerDay) : '');
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const telo = () => ({
    title: nazev, description: popis.trim() || null, points: body === '' ? 0 : Number(body), bonusCzk: premie === '' ? null : Number(premie),
    autoApprove: auto, active: aktivni, validFrom: od || null, validTo: doDne || null, maxPerDay: limit === '' ? null : Number(limit),
  });
  const uloz = async () => {
    if (ukladam) return;
    // Stejná pravidla jako server: hlášku ukázat hned, bez cesty na server.
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
      setChyba(apiMessage(e, t('Položku se nepodařilo uložit.')));
    } finally {
      setUkladam(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="md" title={nova ? t('Nová položka nabídky') : t('Upravit položku nabídky')}
      subtitle={t('Co se dá udělat navíc a kolik za to je.')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
        <Button type="submit" form="nabidka-navic" variant="primary" icon="check" loading={ukladam} disabled={!nazev.trim()}>{nova ? t('Přidat do nabídky') : t('Uložit')}</Button>
      </>}>
      <form id="nabidka-navic" className="space-y-3" data-nabidka-navic-okno onSubmit={e => { e.preventDefault(); void uloz(); }}>
        <Field id="nabidka-nazev" label={t('Co se má udělat')}>
          <Input id="nabidka-nazev" value={nazev} onChange={e => setNazev(e.target.value)} maxLength={MAX_DELKA_NAZVU} placeholder={t('Např. vytřít sklad a chodbu')} autoFocus />
        </Field>
        <Field id="nabidka-popis" label={t('Popis (nepovinný)')} hint={t('Co přesně to znamená — člověk to uvidí u položky.')}>
          <Textarea id="nabidka-popis" rows={2} value={popis} onChange={e => setPopis(e.target.value)} maxLength={MAX_DELKA_POZNAMKY} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="nabidka-body" label={t('Body')} hint={t('0–{max}', { max: MAX_BODU })}>
            <Input id="nabidka-body" type="number" inputMode="numeric" min={0} max={MAX_BODU} step={1} value={body}
              onChange={e => setBody(e.target.value.replace(/\D/g, ''))} className="tabular-nums" />
          </Field>
          <Field id="nabidka-premie" label={t('Prémie')} hint={t('Nepovinná; jde do výplaty.')}>
            <div className="relative">
              <Input id="nabidka-premie" type="number" inputMode="numeric" min={0} max={MAX_PREMIE} step={1} value={premie}
                onChange={e => setPremie(e.target.value.replace(/\D/g, ''))} className="tabular-nums pr-10" />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="nabidka-od" label={t('Platí od')}>
            <Input id="nabidka-od" type="date" value={od} onChange={e => { setOd(e.target.value); if (doDne && e.target.value && doDne < e.target.value) setDoDne(e.target.value); }} className="appearance-none min-w-0" />
          </Field>
          <Field id="nabidka-do" label={t('Platí do')}>
            <Input id="nabidka-do" type="date" value={doDne} min={od || undefined} onChange={e => setDoDne(e.target.value)} className="appearance-none min-w-0" />
          </Field>
        </div>
        <Field id="nabidka-limit" label={t('Nejvýš za den na člověka')} hint={t('Prázdné = bez limitu; 1–50.')}>
          <Input id="nabidka-limit" type="number" inputMode="numeric" min={1} max={50} step={1} value={limit}
            onChange={e => setLimit(e.target.value.replace(/\D/g, ''))} className="!w-full sm:!w-32 tabular-nums" />
        </Field>
        <ul className="list">
          <li className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span id="nabidka-auto-n" className="block text-sm font-semibold text-[#16181A]">{t('Uznat automaticky')}</span>
              <span className="block text-xs text-black/45 mt-0.5 text-pretty">{t('Zápis z téhle položky se uzná sám, bez fronty — body připíše hned.')}</span>
            </span>
            <Switch checked={auto} onChange={setAuto} labelledBy="nabidka-auto-n" />
          </li>
          <li className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span id="nabidka-aktivni-n" className="block text-sm font-semibold text-[#16181A]">{t('Nabízet')}</span>
              <span className="block text-xs text-black/45 mt-0.5 text-pretty">{t('Vypnutá položka v nabídce není, zápisy k ní zůstávají.')}</span>
            </span>
            <Switch checked={aktivni} onChange={setAktivni} labelledBy="nabidka-aktivni-n" />
          </li>
        </ul>
        {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
      </form>
    </Modal>
  );
}

export default NabidkaNavicOkno;
