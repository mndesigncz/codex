'use client';

// Skladová položka upravená tam, kde na ni narazíš — v receptuře.
//
// Bez tohohle vypadá práce takhle: v receptuře zjistíš, že vodce chybí velikost
// balení, odejdeš do skladu, najdeš ji, opravíš, vrátíš se, znovu najdeš
// produkt. Panel řeší přesně ta pole, která receptura potřebuje, a k tomu
// pojmenované díly — „panák 0,04 l" se definuje jednou a pak se jen vybírá.

import { useId, useState } from 'react';
import { Icon } from '../Icons';
import { useCost, useSymbol } from '../CurrencyProvider';
import { cenaDoPole, cenaZFormulare } from '@/lib/cena';
import { Button, Field, Input, Label } from '../ui';
import { tg } from '@/lib/i18n/stav';
import { useT } from '@/lib/i18n/client';

export type Portion = { name: string; amount: number };

/** Číslo z pole, které bere i desetinnou čárku. */
const num = (s: string | number) => Number(String(s).replace(',', '.')) || 0;

export default function ItemInlineEdit({ item, onSaved, onClose }: {
  item: any;
  onSaved: (patch: any) => void;
  onClose: () => void;
}) {
  // Cena za jednotku obsahu bývá pod jednou měnovou jednotkou (0,025 Kč za g) —
  // useCost přidá desetinná místa, kde by se jinak ukázala nula.
  const t = useT('sklad');
  const cost = useCost();
  const symbol = useSymbol();
  const uid = useId();
  const [packageSize, setPackageSize] = useState(item.packageSize != null ? String(item.packageSize) : '');
  const [contentUnit, setContentUnit] = useState(item.contentUnit ?? '');
  const [unitCost, setUnitCost] = useState(cenaDoPole(item.unitCost));
  const [portions, setPortions] = useState<{ name: string; amount: string }[]>(
    Array.isArray(item.portions) && item.portions.length
      ? item.portions.map((p: any) => ({ name: String(p.name ?? ''), amount: String(p.amount ?? '') }))
      : [],
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const perUnit = num(packageSize) > 0 && num(unitCost) > 0
    ? num(unitCost) / num(packageSize) : null;

  const save = async () => {
    // Cena smí mít haléře; text, který cena není, se neuloží jako nula.
    const cena = cenaZFormulare(unitCost);
    if (!cena.ok) { setErr(t('Cena musí být číslo, třeba 4,99.')); return; }
    setSaving(true); setErr('');
    const payload = {
      packageSize: packageSize === '' ? null : num(packageSize),
      contentUnit: contentUnit.trim() || null,
      unitCost: cena.hodnota,
      portions: portions
        .filter(p => p.name.trim() && num(p.amount) > 0)
        .map(p => ({ name: p.name.trim(), amount: num(p.amount) })),
    };
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onSaved({ ...item, ...payload });
        onClose();
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ? tg(d.error) : t('Uložení se nepodařilo.'));
      }
    } catch { setErr(t('Uložení se nepodařilo.')); }
    setSaving(false);
  };

  return (
    <div className="well p-4 space-y-3 rise-in">
      {/* Neutrální jamka s nadpisem (kolo 69, audit Receptur) — dřív limetkový
          rámeček a limetkový štítek verzálkami, limetka jako ozdoba. */}
      <h3 className="t-card flex items-center gap-2">
        <Icon name="box" size={15} className="text-black/40" /> {t('Úprava skladové položky')} · {item.name}
      </h3>

      {/* Kolo 69: pole a tlačítka z ui (Field, Input, Button) místo ručních
          štítků 11 px, glass pilulek a limetkového textu „Přidat díl"
          (DP §6.16). Odebrání dílu je ikonové tlačítko 44 px s popiskem
          „Odebrat díl …" — dřív cíl ~23 px a odečítač hlásil „Zavřít". */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Field id={`${uid}-baleni`} label={t('Velikost balení')}>
          <Input id={`${uid}-baleni`} value={packageSize} onChange={e => setPackageSize(e.target.value)}
            inputMode="decimal" placeholder="0,7" />
        </Field>
        <Field id={`${uid}-jednotka`} label={t('Jednotka obsahu')}>
          <Input id={`${uid}-jednotka`} value={contentUnit} onChange={e => setContentUnit(e.target.value)}
            placeholder={t('l / kg / ks')} />
        </Field>
        <Field id={`${uid}-cena`} label={t('Cena za balení')}>
          <Input id={`${uid}-cena`} value={unitCost} onChange={e => setUnitCost(e.target.value)}
            inputMode="decimal" placeholder={symbol} />
        </Field>
      </div>
      {perUnit != null && (
        <p className="t-meta">
          {t('Vychází na')} <b className="text-[#16181A]">{cost(perUnit)}</b> {t('za {jednotka}', { jednotka: contentUnit || t('jednotku') })}.
        </p>
      )}

      {/* Pojmenované díly — definuj jednou, pak se v recepturách jen vybírají. */}
      <div className="space-y-2">
        <Label>{t('Dílčí díly')}</Label>
        <p className="t-meta -mt-1">{t('Pojmenované porce, které pak v receptuře jen vybereš.')}</p>
        {portions.map((p, idx) => {
          const jmeno = p.name.trim() || `${idx + 1}`;
          return (
            <div key={idx} className="flex items-center gap-2">
              <Input value={p.name} placeholder={t('panák')} aria-label={t('Název dílu {n}', { n: idx + 1 })}
                onChange={e => setPortions(list => list.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                className="flex-1 min-w-0" />
              <Input value={p.amount} placeholder="0,04" inputMode="decimal" aria-label={t('Množství dílu {jmeno}', { jmeno })}
                onChange={e => setPortions(list => list.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
                className="!w-24 text-center" />
              <span className="t-meta w-8 shrink-0">{contentUnit || item.unit}</span>
              <Button variant="ghost" size="sm" iconOnly icon="close" className="tap-target-sm shrink-0" aria-label={t('Odebrat díl {jmeno}', { jmeno })}
                onClick={() => setPortions(list => list.filter((_, i) => i !== idx))} />
            </div>
          );
        })}
        <Button variant="secondary" size="sm" icon="plus" onClick={() => setPortions(list => [...list, { name: '', amount: '' }])}>
          {t('Přidat díl')}
        </Button>
      </div>

      {err && <p className="note note-danger" role="alert">{err}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" loading={saving} onClick={save}>{t('Uložit položku')}</Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>{t('Zrušit')}</Button>
      </div>
    </div>
  );
}
