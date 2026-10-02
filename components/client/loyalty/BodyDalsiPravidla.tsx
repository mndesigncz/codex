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
import {
  ZAOKROUHLENI, MAX_VYLOUCENYCH_POLOZEK, MAX_MIN_UTRATA, MAX_STROP_BODU, MAX_MESICU_NEAKTIVITY, MAX_NASOBIC_UROVNE, MAX_UVITACI_BODY, MAX_DNI_KREDITU, MIN_DNI_KREDITU,
  vylouceneZProfilu, vylouceneSekceZProfilu, uvitaciBody, type VylouceneZboziPolozka, type VylouceneSekce,
} from '@/lib/bodyPravidla';

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

/** Výběr celých kategorií nabídky (sekcí), za které se body nedávají: přepínací štítky. */
function VylouceneKategorie({ value, onChange, disabled }: { value: VylouceneSekce[]; onChange: (v: VylouceneSekce[]) => void; disabled: boolean }) {
  const [sekce, setSekce] = useState<{ id: number; name: string; board: string }[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/menu').then(okJson).then(d => {
      if (!alive) return;
      const plochy: { id: number; name: string; board: string }[] = [];
      for (const b of d.boards ?? []) for (const s of b.sections ?? []) plochy.push({ id: Number(s.id), name: String(s.title ?? s.name ?? ''), board: String(b.name ?? '') });
      setSekce(plochy);
    }).catch(() => { if (alive) setSekce([]); });
    return () => { alive = false; };
  }, []);
  const vybrane = new Set(value.map(v => v.sectionId));
  // Vybrané kategorie, které mezitím z nabídky zmizely, zůstávají vidět a jdou odebrat.
  const zmizele = value.filter(v => sekce && !sekce.some(x => x.id === v.sectionId));
  if (sekce && !sekce.length && !value.length) return null;
  return (
    <div>
      <p className="field-label">Kategorie, za které se body nedávají</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kategorie, za které se body nedávají">
        {(sekce ?? []).map(x => (
          <button key={x.id} type="button" disabled={disabled} aria-pressed={vybrane.has(x.id)}
            onClick={() => onChange(vybrane.has(x.id) ? value.filter(v => v.sectionId !== x.id) : [...value, { sectionId: x.id, name: x.name }])}
            className={`filter-pill tap-target-sm ${vybrane.has(x.id) ? 'seg-on' : 'seg-off glass'}`}>{x.name}</button>
        ))}
        {zmizele.map(v => (
          <button key={v.sectionId} type="button" disabled={disabled} aria-pressed aria-label={`Znovu počítat body za kategorii: ${v.name}`}
            onClick={() => onChange(value.filter(x => x.sectionId !== v.sectionId))} className="filter-pill tap-target-sm seg-on">{v.name}</button>
        ))}
      </div>
      <p className="t-meta mt-1.5">Vyloučí se všechny položky kategorie spárované s pokladnou, i ty, které do ní přidáš později. Odečtou se z účtenky načtené z pokladny.</p>
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
        <Field id="b-cap-den" label="Nejvíc bodů za den na hosta" hint="Součet z útrat za jeden den (pražský). 0 = bez stropu. Nesmí být menší než strop na účtenku." error={chyby.points_cap_per_day}>
          <Input id="b-cap-den" type="number" inputMode="numeric" min={0} max={MAX_STROP_BODU} disabled={!meni} className="!w-32" value={p.points_cap_per_day ?? 0} onChange={nastav('points_cap_per_day')} />
        </Field>
      </div>
      <ul className="list">
        <SwitchRow title="Kredit a poukaz bez bodů" checked={p.points_exclude_prepaid !== false} disabled={!meni}
          hint="Z části účtu zaplacené kreditem nebo dárkovým poukazem se body ani cashback nepočítají — jinak by host sbíral odměnu z odměny. Obsluha částku zadá u kasy."
          onChange={v => setP({ ...p, points_exclude_prepaid: v })} />
      </ul>
      <VyloucenePolozky value={vylouceno} disabled={!meni} onChange={v => setP({ ...p, points_exclude_items: v })} />
      <VylouceneKategorie value={vylouceneSekceZProfilu(p.points_exclude_sections)} disabled={!meni} onChange={v => setP({ ...p, points_exclude_sections: v })} />
    </Card>
  );
}

/** Násobič bodů podle úrovně, uvítací body nového člena a propadání kreditu. */
export function BodyNasobiceKredit({ p, setP, meni, chyby }: {
  p: any; setP: (p: any) => void; meni: boolean; chyby: Record<string, string>;
}) {
  const nastav = (pole: string) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [pole]: e.target.value });
  const hodnota = (pole: string) => String(p[pole] ?? 1).replace('.', ',');
  const uvitaci = p.welcome_points !== undefined && p.welcome_points !== null ? p.welcome_points : uvitaciBody(p);
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="t-card">Úrovně, uvítání a kredit</h2>
        <p className="t-meta mt-0.5 max-w-[70ch]">Vyšší úroveň může dostávat víc bodů. Nový člen dostane uvítací body. Nevyužitý kredit může po čase propadnout.</p>
      </div>
      <div>
        <p className="field-label">Násobič bodů podle úrovně</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field id="b-m-s" label="Stříbrný host" hint="1 = bez násobiče." error={chyby.mult_silver}>
            <Input id="b-m-s" inputMode="decimal" disabled={!meni} className="!w-24" value={hodnota('mult_silver')} onChange={nastav('mult_silver')} />
          </Field>
          <Field id="b-m-g" label="Zlatý host" error={chyby.mult_gold}>
            <Input id="b-m-g" inputMode="decimal" disabled={!meni} className="!w-24" value={hodnota('mult_gold')} onChange={nastav('mult_gold')} />
          </Field>
          <Field id="b-m-p" label="Platinový host" error={chyby.mult_platinum}>
            <Input id="b-m-p" inputMode="decimal" disabled={!meni} className="!w-24" value={hodnota('mult_platinum')} onChange={nastav('mult_platinum')} />
          </Field>
        </div>
        <p className="t-meta mt-1.5 max-w-[70ch]">Násobič 1 až {MAX_NASOBIC_UROVNE}, třeba 1,5. Když běží i bonusová akce, platí vyšší z obou, ne jejich součin. Strop na účtenku a za den platí až po násobiči.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id="b-uvit" label="Uvítací body" hint={`Kolik bodů dostane nový člen. 0 = nic. Bez nastavení platí dřívějších 10 (když podnik dává body za útratu). Nejvýš ${MAX_UVITACI_BODY}.`} error={chyby.welcome_points}>
          <Input id="b-uvit" type="number" inputMode="numeric" min={0} max={MAX_UVITACI_BODY} disabled={!meni} className="!w-28" value={uvitaci} onChange={nastav('welcome_points')} />
        </Field>
        <Field id="b-kredit" label="Kredit propadne po (dnech)" hint={`0 = kredit nepropadá, jinak nejméně ${MIN_DNI_KREDITU} dní. Týden předem se hostu pošle upozornění. Nový kredit se počítá od dne zapnutí.`} error={chyby.credit_expire_days}>
          <Input id="b-kredit" type="number" inputMode="numeric" min={0} max={MAX_DNI_KREDITU} disabled={!meni} className="!w-28" value={p.credit_expire_days ?? 0} onChange={nastav('credit_expire_days')} />
        </Field>
      </div>
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
      <p className="t-meta max-w-[70ch]">Když host postoupí na vyšší úroveň, dostane oznámení v aplikaci. Snížení po pauze se mu oznámí taky.</p>
    </Card>
  );
}
