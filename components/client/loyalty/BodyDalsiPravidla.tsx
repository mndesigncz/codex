'use client';

// Doplňková pravidla bodů ve Věrnosti → Body a úrovně: jak se body zaokrouhlují, od jaké
// útraty se dávají, strop na účtenku, co se nepočítá (kredit, poukaz, vybrané položky)
// a po jaké době bez návštěvy se úroveň snižuje. Pole drží rodič (jeden formulář,
// jedno „Uložit"); tady je jen vzhled a nápověda. Kontrolu dělá lib/bodyPravidla.ts,
// stejná funkce jako na serveru.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Chip, Field, Input, ListRow, Segmented, SwitchRow, Well } from '../../ui';
import { Icon } from '../../Icons';
import { useSymbol } from '../../CurrencyProvider';
import { okJson } from '@/lib/api';
import { obsahuje } from '@/lib/hledani';
import { useResultKeys } from '@/lib/useResultKeys';
import { ZAOKROUHLENI, MAX_VYLOUCENYCH_POLOZEK, MAX_MIN_UTRATA, MAX_STROP_BODU, MAX_MESICU_NEAKTIVITY, vylouceneZProfilu, type VylouceneZboziPolozka } from '@/lib/bodyPravidla';

interface PolozkaNabidky { id: number; name: string; board: string; paired: boolean }

/** Výběr položek nabídky, které se do bodů nepočítají (dárkové karty, tabák, balené zboží). */
function VyloucenePolozky({ value, onChange, disabled }: { value: VylouceneZboziPolozka[]; onChange: (v: VylouceneZboziPolozka[]) => void; disabled: boolean }) {
  const [q, setQ] = useState('');
  const [nabidka, setNabidka] = useState<PolozkaNabidky[] | null>(null);
  const [chyba, setChyba] = useState(false);
  const vstup = useRef<HTMLInputElement>(null);
  const seznam = useRef<HTMLUListElement>(null);
  const klavesy = useResultKeys(seznam, vstup, { onEscape: () => setQ('') });
  useEffect(() => {
    let alive = true;
    fetch('/api/menu').then(okJson).then(d => {
      if (!alive) return;
      const plochy: PolozkaNabidky[] = [];
      for (const b of d.boards ?? []) for (const s of b.sections ?? []) for (const i of s.items ?? []) {
        plochy.push({ id: Number(i.id), name: String(i.name ?? ''), board: String(b.name ?? ''), paired: !!i.posProductId });
      }
      setNabidka(plochy);
    }).catch(() => { if (alive) { setNabidka([]); setChyba(true); } });
    return () => { alive = false; };
  }, []);
  const vybrane = new Set(value.map(v => v.itemId));
  const hledane = q.trim().toLowerCase();
  const nalezene = useMemo(
    () => (hledane && nabidka ? nabidka.filter(i => !vybrane.has(i.id) && obsahuje(i.name, hledane)).slice(0, 6) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hledane, nabidka, value],
  );
  const bezPokladny = nabidka && value.some(v => nabidka.find(i => i.id === v.itemId)?.paired === false);
  const plno = value.length >= MAX_VYLOUCENYCH_POLOZEK;
  return (
    <div>
      <p className="field-label">Položky, za které se body nedávají</p>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(v => (
            <button key={v.itemId} type="button" disabled={disabled} aria-label={`Znovu počítat body za: ${v.name}`}
              onClick={() => onChange(value.filter(x => x.itemId !== v.itemId))}
              className="filter-pill tap-target-sm seg-on inline-flex items-center gap-1.5">
              {v.name}<Icon name="close" size={12} className="opacity-60" />
            </button>
          ))}
        </div>
      )}
      <Input ref={vstup} onKeyDown={klavesy.onInputKeyDown} value={q} onChange={e => setQ(e.target.value)} aria-label="Hledat položku, za kterou se body nedávají"
        disabled={disabled || plno || !nabidka?.length}
        placeholder={plno ? `Nejvíc ${MAX_VYLOUCENYCH_POLOZEK} položek` : nabidka === null ? 'Načítám nabídku…' : nabidka.length ? 'Hledej v nabídce…' : 'Nabídka je prázdná'} />
      {nalezene.length > 0 && (
        <Well className="mt-1.5 !p-0 overflow-hidden">
          <ul ref={seznam} onKeyDown={klavesy.onListKeyDown} className="list px-3">
            {nalezene.map(i => (
              <ListRow key={i.id} title={i.name} meta={i.board} chevron={false}
                onClick={() => { onChange([...value, { itemId: i.id, name: i.name }]); setQ(''); }}
                right={!i.paired ? <Chip tone="wait" size="sm">bez pokladny</Chip> : undefined} />
            ))}
          </ul>
        </Well>
      )}
      {chyba && <p className="text-[13px] text-wait-ink mt-1.5">Nabídku se nepodařilo načíst — vybrané položky zůstávají, nové teď přidat nejdou.</p>}
      <p className="t-meta mt-1.5">Odečtou se z účtenky načtené z pokladny. Platí jen pro položky spárované s pokladnou a jen u připsání z účtenky.</p>
      {bezPokladny && <p className="text-[13px] text-wait-ink mt-1.5">Některé vybrané položky nejsou spárované s pokladnou — z účtenky se za ně nic neodečte.</p>}
    </div>
  );
}

export function BodyDalsiPravidla({ p, setP, meni, chyby }: {
  p: any; setP: (p: any) => void; meni: boolean; chyby: Record<string, string>;
}) {
  const symbol = useSymbol();
  const zaokrouhleni = ZAOKROUHLENI.find(z => z.id === p.points_round) ?? ZAOKROUHLENI[0];
  const vylouceno = vylouceneZProfilu(p.points_exclude_items);
  const nastav = (pole: string) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [pole]: e.target.value });
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="t-card">Jak se body počítají</h2>
        <p className="t-meta mt-0.5 max-w-[70ch]">Tahle pravidla platí u kasy, u objednávek z aplikace i v náhledu níž. Bez nastavení se body dávají jen za plné stovky.</p>
      </div>
      <div>
        <p className="field-label">Zaokrouhlení</p>
        <Segmented options={ZAOKROUHLENI.map(z => ({ id: z.id, label: z.label }))} value={zaokrouhleni.id}
          onChange={v => { if (meni) setP({ ...p, points_round: v }); }} size="sm" ariaLabel="Zaokrouhlení bodů" />
        <p className="t-meta mt-1.5 max-w-[70ch]">{zaokrouhleni.hint}</p>
        {chyby.points_round && <p role="alert" className="mt-1.5 text-xs text-[var(--bad-ink)]">{chyby.points_round}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id="b-min" label={`Body od útraty (${symbol})`} hint="Pod touto částkou host body nedostane. 0 = bez minima." error={chyby.points_min_spend}>
          <Input id="b-min" type="number" inputMode="numeric" min={0} max={MAX_MIN_UTRATA} disabled={!meni} className="!w-32" value={p.points_min_spend ?? 0} onChange={nastav('points_min_spend')} />
        </Field>
        <Field id="b-cap" label="Nejvíc bodů z jedné účtenky" hint="Ochrana před omylem a zneužitím velkých účtů. 0 = bez stropu." error={chyby.points_cap_per_bill}>
          <Input id="b-cap" type="number" inputMode="numeric" min={0} max={MAX_STROP_BODU} disabled={!meni} className="!w-32" value={p.points_cap_per_bill ?? 0} onChange={nastav('points_cap_per_bill')} />
        </Field>
      </div>
      <ul className="list">
        <SwitchRow title="Kredit a poukaz bez bodů" checked={p.points_exclude_prepaid !== false} disabled={!meni}
          hint="Z části účtu zaplacené kreditem nebo dárkovým poukazem se body ani cashback nepočítají — jinak by host sbíral odměnu z odměny. Obsluha částku zadá u kasy."
          onChange={v => setP({ ...p, points_exclude_prepaid: v })} />
      </ul>
      <VyloucenePolozky value={vylouceno} disabled={!meni} onChange={v => setP({ ...p, points_exclude_items: v })} />
    </Card>
  );
}

/** Snížení úrovně po pauze — patří pod úrovně hostů. */
export function BodyNeaktivita({ p, setP, meni, chyby }: {
  p: any; setP: (p: any) => void; meni: boolean; chyby: Record<string, string>;
}) {
  const nastav = (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, tier_inactive_months: e.target.value });
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="t-card">Úroveň po delší pauze</h2>
        <p className="t-meta mt-0.5 max-w-[70ch]">Host, který dlouho nepřišel, může o stupeň klesnout (Platinový na Zlatého, Zlatý na Stříbrného). Návštěvy ani útrata se nemažou, s první další návštěvou se úroveň vrátí sama.</p>
      </div>
      <Field id="b-neakt" label="Snížit po (měsících bez návštěvy)" hint="0 = úroveň se nikdy nesnižuje. Hostovi, u kterého neznáme poslední návštěvu, se úroveň nesnižuje." error={chyby.tier_inactive_months}>
        <Input id="b-neakt" type="number" inputMode="numeric" min={0} max={MAX_MESICU_NEAKTIVITY} disabled={!meni} className="!w-28" value={p.tier_inactive_months ?? 0} onChange={nastav} />
      </Field>
      <p className="t-meta max-w-[70ch]">Když host postoupí na vyšší úroveň, dostane oznámení v aplikaci. Snížení se neoznamuje.</p>
    </Card>
  );
}
