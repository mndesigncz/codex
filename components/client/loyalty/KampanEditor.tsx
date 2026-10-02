'use client';

// Editor razítkové kampaně: základ, za co se razítko dává (položky, kategorie,
// vyloučené), odměna, limity, kdy platí a vzhled karty s živým náhledem
// pohledem hosta. Ukládá se jako koncept nebo rovnou jako běžící kampaň.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Chip, Field, Input, ListRow, Modal, Segmented, SwitchRow, Textarea, Well } from '../../ui';
import { Icon, type IconName } from '../../Icons';
import { useSymbol } from '../../CurrencyProvider';
import { okJson } from '@/lib/api';
import { obsahuje } from '@/lib/hledani';
import { useResultKeys } from '@/lib/useResultKeys';
import { IKONY_KARTY, DNY_TYDNE, popisOkna, type KartaHosta } from '@/lib/razitkaPravidla';
import KartaRazitek from './KartaRazitek';

export interface Odkaz { itemId: number; name: string }
export interface OdkazSekce { sectionId: number; name: string }

export interface FormKampane {
  id: number | null; name: string; description: string; conditions: string; active: boolean; draft: boolean;
  validSince: string; validTill: string; requiredStamps: number; ruleType: string;
  stampItems: Odkaz[]; stampSections: OdkazSekce[]; excludedItems: Odkaz[]; excludedSections: OdkazSekce[];
  minValue: string; minValueMultiple: boolean; onePerOrder: boolean;
  rewardTitle: string; rewardItems: Odkaz[];
  daysToFinish: number; daysToRedeem: number; repeatMode: string; stackCards: boolean;
  maxCompletions: number; dailyCap: number; validDays: number[]; hourFrom: string; hourTill: string;
  combinable: boolean; cardColor: string; cardIcon: string; cardImage: string;
}

export const prazdnaKampan = (): FormKampane => ({
  id: null, name: '', description: '', conditions: '', active: true, draft: false,
  validSince: '', validTill: '', requiredStamps: 10, ruleType: 'visit',
  stampItems: [], stampSections: [], excludedItems: [], excludedSections: [],
  minValue: '', minValueMultiple: false, onePerOrder: false,
  rewardTitle: '', rewardItems: [],
  daysToFinish: 0, daysToRedeem: 0, repeatMode: 'immediately', stackCards: true,
  maxCompletions: 0, dailyCap: 0, validDays: [], hourFrom: '', hourTill: '',
  combinable: true, cardColor: '', cardIcon: '', cardImage: '',
});

/** Řádek ze serveru (GET /api/client/admin/stamps) do formuláře. */
export function kampanDoFormulare(c: any): FormKampane {
  return {
    id: c.id, name: c.name ?? '', description: c.description ?? '', conditions: c.conditions ?? '',
    active: c.active !== false, draft: c.draft === true,
    validSince: c.valid_since ? String(c.valid_since).slice(0, 10) : '', validTill: c.valid_till ? String(c.valid_till).slice(0, 10) : '',
    requiredStamps: Number(c.required_stamps) || 10, ruleType: c.rule_type ?? 'visit',
    stampItems: c.stampItems ?? [], stampSections: c.stampSections ?? [], excludedItems: c.excludedItems ?? [], excludedSections: c.excludedSections ?? [],
    minValue: c.min_value == null ? '' : String(c.min_value), minValueMultiple: c.min_value_multiple === true, onePerOrder: c.one_per_order === true,
    rewardTitle: c.reward_title ?? '', rewardItems: c.rewardItems ?? [],
    daysToFinish: Number(c.days_to_finish) || 0, daysToRedeem: Number(c.days_to_redeem) || 0,
    repeatMode: c.repeat_mode ?? 'immediately', stackCards: c.stack_cards !== false,
    maxCompletions: Number(c.max_completions) || 0, dailyCap: Number(c.daily_cap) || 0,
    validDays: Array.isArray(c.valid_days) ? c.valid_days.map(Number) : [], hourFrom: c.hour_from ?? '', hourTill: c.hour_till ?? '',
    combinable: c.combinable !== false, cardColor: c.card_color ?? '', cardIcon: c.card_icon ?? '', cardImage: c.card_image ?? '',
  };
}

const RULE_OPTS = [
  { id: 'visit', label: 'Za návštěvu' },
  { id: 'products', label: 'Za položky' },
  { id: 'min_value', label: 'Za útratu' },
];
const REPEAT_OPTS = [
  { id: 'immediately', label: 'hned' },
  { id: 'one_day', label: 'od dalšího dne' },
  { id: 'one_week', label: 'po týdnu' },
  { id: 'one_month', label: 'od 1. dne dalšího měsíce' },
  { id: 'one_time', label: 'jen jednou' },
];
const BARVY = ['#C8F542', '#E8A33D', '#D9644A', '#7C9A6B', '#4A7DBF', '#9B6BAE', '#16181A'];
const IKONA_NAZEV: Record<string, string> = {
  star: 'Hvězda', cup: 'Hrnek', gift: 'Dárek', leaf: 'List', fire: 'Plamen', award: 'Odznak', coins: 'Mince', sparkle: 'Jiskra', music: 'Hudba', sun: 'Slunce', tag: 'Štítek', card: 'Karta',
};

async function nahrajObrazek(f: File): Promise<string> {
  const { compressImage } = await import('@/lib/clientImage');
  const fd = new FormData();
  fd.append('file', await compressImage(f));
  const r = await fetch('/api/upload', { method: 'POST', body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Nahrání se nepovedlo.');
  const id = String(d.url ?? '').match(/(\d+)$/)?.[1];
  if (!id) throw new Error('Soubor se nahrál, ale nevrátil adresu.');
  return `/api/client/img/${id}`;
}

/** Výběr položek nabídky: hledání a vybrané jako odebratelné štítky. */
export function VyberPolozek({ items, value, onChange, label: lb, hint, id }: {
  items: { id: number; name: string; board: string; paired: boolean }[];
  value: Odkaz[]; onChange: (v: Odkaz[]) => void; label: string; hint?: string; id: string;
}) {
  const [q, setQ] = useState('');
  const pickInput = useRef<HTMLInputElement>(null);
  const pickList = useRef<HTMLUListElement>(null);
  const pickKeys = useResultKeys(pickList, pickInput, { onEscape: () => setQ('') });
  const chosen = new Set(value.map(v => v.itemId));
  const needle = q.trim().toLowerCase();
  const found = needle ? items.filter(i => !chosen.has(i.id) && obsahuje(i.name, needle)).slice(0, 6) : [];
  const unpaired = items.length > 0 && value.some(v => items.find(i => i.id === v.itemId)?.paired === false);
  return (
    <div>
      <label htmlFor={id} className="field-label">{lb}</label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(v => (
            <button key={v.itemId} type="button" aria-label={`Odebrat ${v.name}`} onClick={() => onChange(value.filter(x => x.itemId !== v.itemId))}
              className="filter-pill tap-target-sm seg-on inline-flex items-center gap-1.5">
              {v.name}<Icon name="close" size={12} className="opacity-60" />
            </button>
          ))}
        </div>
      )}
      <Input id={id} ref={pickInput} onKeyDown={pickKeys.onInputKeyDown}
        value={q} onChange={e => setQ(e.target.value)} placeholder={items.length ? 'Hledej v nabídce…' : 'Nabídka je prázdná — nejdřív ji založ v Menu'} disabled={!items.length} autoComplete="off" />
      {found.length > 0 && (
        <Well className="mt-1.5 !p-0 overflow-hidden">
          <ul ref={pickList} onKeyDown={pickKeys.onListKeyDown} className="list px-3">
            {found.map(i => (
              <ListRow key={i.id} title={i.name} meta={i.board} onClick={() => { onChange([...value, { itemId: i.id, name: i.name }]); setQ(''); pickInput.current?.focus(); }}
                right={!i.paired ? <Chip tone="wait" size="sm">bez pokladny</Chip> : undefined} chevron={false} />
            ))}
          </ul>
        </Well>
      )}
      {needle && !found.length && items.length > 0 && <p className="t-meta mt-1.5">Nic takového v nabídce není.</p>}
      {hint && <p className="t-meta mt-1.5">{hint}</p>}
      {unpaired && <p className="text-[13px] text-wait-ink mt-1.5">Některé vybrané položky nejsou spárované s pokladnou — z účtenky se za ně razítko nepřipíše, jen ručně u kasy.</p>}
    </div>
  );
}

/** Výběr celých kategorií nabídky (sekcí) jako přepínací štítky. */
export function VyberKategorii({ sections, value, onChange, label: lb, hint }: {
  sections: { id: number; name: string; board: string }[];
  value: OdkazSekce[]; onChange: (v: OdkazSekce[]) => void; label: string; hint?: string;
}) {
  const on = new Set(value.map(v => v.sectionId));
  if (!sections.length) return null;
  return (
    <div>
      <p className="field-label">{lb}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={lb}>
        {sections.map(s => {
          const vybrano = on.has(s.id);
          return (
            <button key={s.id} type="button" aria-pressed={vybrano}
              onClick={() => onChange(vybrano ? value.filter(v => v.sectionId !== s.id) : [...value, { sectionId: s.id, name: s.name }])}
              className={`filter-pill tap-target-sm ${vybrano ? 'seg-on' : 'seg-off glass'}`}>{s.name}</button>
          );
        })}
      </div>
      {hint && <p className="t-meta mt-1.5">{hint}</p>}
    </div>
  );
}

/** Karta tak, jak ji uvidí host, ze současného stavu formuláře. */
function nahledKarty(f: FormKampane): KartaHosta {
  const okno = f.validDays.length > 0 || (f.hourFrom && f.hourTill);
  return {
    id: f.id ?? 0, name: f.name, description: f.description, conditions: f.conditions,
    required: f.requiredStamps, reward: f.rewardTitle, rewardItems: f.rewardItems.map(x => x.name), ruleType: f.ruleType as any,
    stamps: Math.min(3, Math.max(0, f.requiredStamps - 1)), completed: 0,
    color: f.cardColor || null, icon: f.cardIcon || null, image: f.cardImage || null,
    okno: okno ? { days: f.validDays, from: f.hourFrom && f.hourTill ? f.hourFrom : null, till: f.hourFrom && f.hourTill ? f.hourTill : null } : null,
    expired: false, expiredStamps: 0, finishBy: null, daysLeft: null, nextCardFrom: null, finishedForever: false, validTill: f.validTill || null,
  };
}

export default function KampanEditor({ form, onChange, onZpet, onUlozit, busy, chyba }: {
  form: FormKampane; onChange: (f: FormKampane) => void; onZpet: () => void;
  onUlozit: (jako: 'koncept' | 'spustit' | 'ulozit') => void; busy: string; chyba: string;
}) {
  const symbol = useSymbol();
  const [polozky, setPolozky] = useState<{ id: number; name: string; board: string; paired: boolean }[]>([]);
  const [sekce, setSekce] = useState<{ id: number; name: string; board: string }[]>([]);
  const [nabidkaChyba, setNabidkaChyba] = useState(false);
  const [nahravam, setNahravam] = useState(false);
  const [obrChyba, setObrChyba] = useState('');
  const [potvrdZpet, setPotvrdZpet] = useState(false);
  const puvodni = useRef(JSON.stringify(form));
  const souborRef = useRef<HTMLInputElement>(null);
  const f = form;
  const set = (patch: Partial<FormKampane>) => onChange({ ...f, ...patch });
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
  const rozepsano = JSON.stringify(form) !== puvodni.current;

  useEffect(() => {
    // Položky a kategorie nabídky přes všechny desky najednou — až při úpravě.
    fetch('/api/menu').then(okJson).then(d => {
      const flat: any[] = []; const sec: any[] = [];
      for (const b of d.boards ?? []) for (const s of b.sections ?? []) {
        sec.push({ id: s.id, name: s.title ?? s.name, board: b.name });
        for (const i of s.items ?? []) flat.push({ id: i.id, name: i.name, board: b.name, paired: !!i.posProductId });
      }
      setPolozky(flat); setSekce(sec); setNabidkaChyba(false);
    }).catch(() => setNabidkaChyba(true));
  }, []);

  const zpet = () => { if (rozepsano) setPotvrdZpet(true); else onZpet(); };
  const okno = popisOkna({ valid_days: f.validDays, hour_from: f.hourFrom || null, hour_till: f.hourTill || null });
  const nahled = useMemo(() => nahledKarty(f), [f]);
  const jeKoncept = f.draft || f.id == null;

  return (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onUlozit(f.draft ? 'koncept' : 'ulozit'); }}>
      <Button type="button" variant="ghost" size="sm" icon="undo" onClick={zpet}>Zpět na kartičky</Button>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-4 items-start">
        <Card className="space-y-5 min-w-0">
          <div>
            <h2 className="t-card">{f.id ? `Upravit „${f.name || '…'}"` : 'Nová kartička'}</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Za plnou kartu dostane host kupon s kódem — obsluha ho uplatní u kasy. Vpravo vidíš, jak kartu uvidí host.</p>
          </div>

          <section className="space-y-4" aria-labelledby="sc-h-zaklad">
            <h3 id="sc-h-zaklad" className="t-label">Základ</h3>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-4">
              <Field id="sc-name" label="Název" hint="Hosté ho vidí na kartě i na kuponu.">
                <Input id="sc-name" value={f.name} onChange={e => set({ name: e.target.value })} placeholder="10 + 1 dýmka zdarma" maxLength={120} autoComplete="off" />
              </Field>
              <Field id="sc-req" label="Razítek do odměny" hint="1 až 50.">
                <Input id="sc-req" type="number" inputMode="numeric" min={1} max={50} value={f.requiredStamps} onChange={e => set({ requiredStamps: num(e.target.value, 1, 50) })} />
              </Field>
            </div>
            <Field id="sc-desc" label="Popis pro hosta" hint={`Krátká věta pod názvem karty. Zbývá ${200 - f.description.length} znaků.`}>
              <Input id="sc-desc" value={f.description} onChange={e => set({ description: e.target.value })} placeholder="Každá desátá dýmka je na nás." maxLength={200} />
            </Field>
            <Field id="sc-cond" label="Podmínky" hint={`Host je uvidí pod kartou v rozbalovací části „Podmínky“. Zbývá ${600 - f.conditions.length} znaků.`}>
              <Textarea id="sc-cond" rows={3} value={f.conditions} onChange={e => set({ conditions: e.target.value })} placeholder="Neplatí s jinými slevami. Razítko dostaneš jen při platbě u stolu." maxLength={600} />
            </Field>
          </section>

          <section className="border-t border-black/[0.06] pt-4 space-y-3" aria-labelledby="sc-h-za-co">
            <h3 id="sc-h-za-co" className="t-label">Za co se razítko připisuje</h3>
            <Segmented options={RULE_OPTS} value={f.ruleType} onChange={v => set({ ruleType: v })} size="sm" ariaLabel="Pravidlo razítka" />
            {f.ruleType === 'visit' && <p className="t-meta">Jedno razítko za návštěvu — obsluha ho dá při načtení kartičky u kasy, nejvýš jedno denně.</p>}
            {f.ruleType === 'products' && (
              <div className="space-y-4">
                <VyberPolozek id="sc-items" items={polozky} value={f.stampItems} onChange={v => set({ stampItems: v })} label="Položky, které dávají razítko"
                  hint="Razítko za každý kus z účtenky. Obsluha u kasy zvolí účtenku hosta a razítka se připíší sama." />
                <VyberKategorii sections={sekce} value={f.stampSections} onChange={v => set({ stampSections: v })} label="Nebo celé kategorie"
                  hint="Razítko dostane každá položka z vybrané kategorie, i ta, kterou přidáš do nabídky později." />
                <ul className="list">
                  <SwitchRow title="Nejvýš jedno razítko z jedné účtenky" checked={f.onePerOrder} onChange={v => set({ onePerOrder: v })} />
                </ul>
              </div>
            )}
            {f.ruleType === 'min_value' && (
              <div className="space-y-3">
                <Field id="sc-min" label={`Útrata od (${symbol})`} hint="Razítko za účtenku aspoň na tuhle částku.">
                  <Input id="sc-min" type="number" inputMode="numeric" min={1} max={1000000} className="!w-36" value={f.minValue} onChange={e => set({ minValue: e.target.value })} placeholder="300" />
                </Field>
                <ul className="list">
                  <SwitchRow title={`Razítko za každý násobek částky (600 ${symbol} = 2 razítka)`} checked={f.minValueMultiple} onChange={v => set({ minValueMultiple: v })} />
                </ul>
              </div>
            )}
            {f.ruleType !== 'visit' && (
              <details className="well px-4 py-3" open={f.excludedItems.length + f.excludedSections.length > 0}>
                <summary className="cursor-pointer text-sm font-semibold">Vyloučené položky a kategorie{f.excludedItems.length + f.excludedSections.length > 0 ? ` (${f.excludedItems.length + f.excludedSections.length})` : ''}</summary>
                <div className="mt-3 space-y-4">
                  <VyberPolozek id="sc-excl-items" items={polozky} value={f.excludedItems} onChange={v => set({ excludedItems: v })} label="Tyhle položky razítko nedají"
                    hint={f.ruleType === 'min_value' ? 'Jejich cena se z útraty odečte (když ji pokladna u účtenky pošle).' : 'I kdyby jinak patřily mezi vybrané položky nebo kategorie.'} />
                  <VyberKategorii sections={sekce} value={f.excludedSections} onChange={v => set({ excludedSections: v })} label="Tyhle kategorie razítko nedají" />
                </div>
              </details>
            )}
            {nabidkaChyba && <p role="alert" className="text-[13px] text-bad-ink">Nabídku se nepodařilo načíst, položky a kategorie nejdou vybrat. Zkontroluj připojení a otevři úpravu znovu.</p>}
          </section>

          <section className="border-t border-black/[0.06] pt-4 space-y-4" aria-labelledby="sc-h-odmena">
            <h3 id="sc-h-odmena" className="t-label">Odměna</h3>
            <Field id="sc-rew" label="Odměna za plnou kartu" hint="Název kuponu, který host dostane.">
              <Input id="sc-rew" value={f.rewardTitle} onChange={e => set({ rewardTitle: e.target.value })} placeholder="Dýmka zdarma" maxLength={160} />
            </Field>
            <VyberPolozek id="sc-rew-items" items={polozky} value={f.rewardItems} onChange={v => set({ rewardItems: v })} label="Položky odměny (volitelné)"
              hint="Vypíšou se na kuponu a na kartě hosta, ať obsluha ví, co vydat." />
            <Field id="sc-red" label="Dní na uplatnění odměny" hint="0 = bez omezení. Po lhůtě kupon propadne.">
              <Input id="sc-red" type="number" inputMode="numeric" min={0} max={365} className="!w-28" value={f.daysToRedeem} onChange={e => set({ daysToRedeem: num(e.target.value, 0, 365) })} />
            </Field>
          </section>

          <section className="border-t border-black/[0.06] pt-4 space-y-4" aria-labelledby="sc-h-limity">
            <h3 id="sc-h-limity" className="t-label">Limity</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field id="sc-fin" label="Dní na nasbírání" hint="Od prvního razítka karty. 0 = bez omezení.">
                <Input id="sc-fin" type="number" inputMode="numeric" min={0} max={365} value={f.daysToFinish} onChange={e => set({ daysToFinish: num(e.target.value, 0, 365) })} />
              </Field>
              <Field id="sc-max" label="Karet na hosta" hint="Kolik karet smí dokončit. 0 = bez omezení.">
                <Input id="sc-max" type="number" inputMode="numeric" min={0} max={1000} value={f.maxCompletions} onChange={e => set({ maxCompletions: num(e.target.value, 0, 1000) })} />
              </Field>
              <Field id="sc-cap" label="Razítek za den" hint="Nejvýš na hosta za den. 0 = bez omezení.">
                <Input id="sc-cap" type="number" inputMode="numeric" min={0} max={50} value={f.dailyCap} onChange={e => set({ dailyCap: num(e.target.value, 0, 50) })} />
              </Field>
            </div>
            <div>
              <p className="field-label">Další karta po dokončení</p>
              <Segmented options={REPEAT_OPTS} value={f.repeatMode} onChange={v => set({ repeatMode: v })} size="sm" ariaLabel="Opakování karty" />
              <p className="t-meta mt-1.5">{f.repeatMode === 'immediately' ? 'Host může začít další kartu hned.'
                : f.repeatMode === 'one_day' ? 'Další kartu jde sbírat od následujícího kalendářního dne (pražského).'
                : f.repeatMode === 'one_week' ? 'Další kartu jde sbírat o sedm dní po dokončení předchozí.'
                : f.repeatMode === 'one_month' ? 'Další kartu jde sbírat od 1. dne následujícího měsíce, ne za třicet dní.'
                : 'Po prvním dokončení už host kartu znovu nesbírá.'}</p>
            </div>
            <ul className="list">
              <SwitchRow title="Přebytek razítek se přenáší do další karty" checked={f.stackCards} onChange={v => set({ stackCards: v })} />
              <SwitchRow title="Účtenka smí dát razítko i jiným kartičkám" checked={f.combinable} onChange={v => set({ combinable: v })} />
            </ul>
            <p className="t-meta">{f.stackCards ? 'Víc razítek najednou přeteče na další kartu.' : 'Bez přenosu se razítka nad plnou kartu nepřipíšou — obsluha to uvidí v hlášce.'}{' '}
              {f.combinable ? '' : 'Když účtenka patří téhle kartičce, ostatní z ní razítko nedostanou (rozhoduje pořadí v seznamu).'}</p>
          </section>

          <section className="border-t border-black/[0.06] pt-4 space-y-4" aria-labelledby="sc-h-kdy">
            <h3 id="sc-h-kdy" className="t-label">Kdy platí</h3>
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <Field id="sc-since" label="Platí od"><Input id="sc-since" type="date" value={f.validSince} onChange={e => set({ validSince: e.target.value })} /></Field>
              <Field id="sc-till" label="Platí do"><Input id="sc-till" type="date" value={f.validTill} onChange={e => set({ validTill: e.target.value })} /></Field>
            </div>
            <p className="t-meta">Prázdné = běží pořád. Hodí se pro sezónní kartičky; po skončení host uvidí, že kartička skončila.</p>
            <div>
              <p className="field-label">Dny v týdnu</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dny v týdnu, kdy se razítko dává">
                {DNY_TYDNE.map((d, i) => {
                  const den = i + 1; const on = f.validDays.includes(den);
                  return (
                    <button key={d} type="button" aria-pressed={on} onClick={() => set({ validDays: on ? f.validDays.filter(x => x !== den) : [...f.validDays, den].sort((a, b) => a - b) })}
                      className={`filter-pill tap-target-sm ${on ? 'seg-on' : 'seg-off glass'}`}>{d}</button>
                  );
                })}
              </div>
              <p className="t-meta mt-1.5">Nic nevybráno = každý den.</p>
            </div>
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <Field id="sc-hf" label="Hodiny od"><Input id="sc-hf" type="time" value={f.hourFrom} onChange={e => set({ hourFrom: e.target.value })} /></Field>
              <Field id="sc-ht" label="Hodiny do"><Input id="sc-ht" type="time" value={f.hourTill} onChange={e => set({ hourTill: e.target.value })} /></Field>
            </div>
            <p className="t-meta">{okno ? `Razítko se bude dávat jen: ${okno}. Pražský čas; okno přes půlnoc (22:00–02:00) platí večer i ráno.` : 'Prázdné = celý den. Vyplň obě pole, aby okno platilo.'}</p>
          </section>

          <section className="border-t border-black/[0.06] pt-4 space-y-4" aria-labelledby="sc-h-vzhled">
            <h3 id="sc-h-vzhled" className="t-label">Vzhled karty</h3>
            <div>
              <p className="field-label">Barva</p>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Barva karty">
                {BARVY.map(b => (
                  <button key={b} type="button" aria-label={`Barva ${b}`} aria-pressed={f.cardColor === b} onClick={() => set({ cardColor: f.cardColor === b ? '' : b })}
                    className={`h-8 w-8 rounded-full border ${f.cardColor === b ? 'ring-2 ring-offset-2 ring-[#16181A]' : 'border-black/10'}`} style={{ backgroundColor: b }} />
                ))}
                <input type="color" aria-label="Vlastní barva karty" value={f.cardColor || '#C8F542'} onChange={e => set({ cardColor: e.target.value })} className="h-8 w-10 rounded-lg border border-black/10 bg-transparent p-0.5" />
                {f.cardColor && <Button type="button" size="sm" variant="ghost" onClick={() => set({ cardColor: '' })}>Bez barvy</Button>}
              </div>
            </div>
            <div>
              <p className="field-label">Ikona razítka</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ikona razítka">
                {IKONY_KARTY.map(ik => (
                  <button key={ik} type="button" aria-pressed={f.cardIcon === ik} aria-label={IKONA_NAZEV[ik]} title={IKONA_NAZEV[ik]} onClick={() => set({ cardIcon: f.cardIcon === ik ? '' : ik })}
                    className={`tap-target-sm h-10 w-10 rounded-xl border flex items-center justify-center ${f.cardIcon === ik ? 'seg-on' : 'seg-off glass'}`}><Icon name={ik as IconName} size={18} /></button>
                ))}
              </div>
            </div>
            <div>
              <p className="field-label">Obrázek na pozadí (volitelné)</p>
              <input ref={souborRef} type="file" accept="image/*" className="hidden" aria-label="Obrázek karty" onChange={async e => {
                const file = e.target.files?.[0]; e.target.value = '';
                if (!file) return;
                setNahravam(true); setObrChyba('');
                try { set({ cardImage: await nahrajObrazek(file) }); }
                catch (err: any) { setObrChyba(err?.message || 'Nahrání se nepovedlo.'); }
                setNahravam(false);
              }} />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="secondary" icon="upload" loading={nahravam} onClick={() => souborRef.current?.click()}>{f.cardImage ? 'Změnit obrázek' : 'Nahrát obrázek'}</Button>
                {f.cardImage && <Button type="button" size="sm" variant="danger" onClick={() => set({ cardImage: '' })}>Odebrat</Button>}
              </div>
              <p className="t-meta mt-1.5">Přes obrázek se položí tmavý filtr, aby byl text čitelný. Barva se pak nepoužije.</p>
              {obrChyba && <p role="alert" className="text-[13px] text-bad-ink mt-1.5">{obrChyba}</p>}
            </div>
          </section>

          {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={zpet}>Zrušit</Button>
            {jeKoncept && <Button type="button" variant="secondary" loading={busy === 'koncept'} onClick={() => onUlozit('koncept')}>Uložit jako koncept</Button>}
            {jeKoncept
              ? <Button type="button" variant="primary" loading={busy === 'spustit'} onClick={() => onUlozit('spustit')}>{f.id ? 'Uložit a spustit' : 'Založit a spustit'}</Button>
              : <Button type="submit" variant="primary" loading={busy === 'ulozit'}>Uložit kartičku</Button>}
          </div>
        </Card>
        <aside className="lg:sticky lg:top-4 space-y-2" aria-label="Náhled karty">
          <p className="t-label">Náhled pohledem hosta</p>
          <div className="well p-4"><KartaRazitek karta={nahled} nahled /></div>
          <p className="t-meta">Takhle bude karta vypadat na stránce podniku a v Moje (ukázka se třemi razítky).</p>
        </aside>
      </div>
      <Modal open={potvrdZpet} onClose={() => setPotvrdZpet(false)} size="sm" title="Zahodit rozepsané změny?"
        footer={<>
          <Button type="button" variant="secondary" onClick={() => setPotvrdZpet(false)}>Pokračovat v úpravě</Button>
          <Button type="button" variant="danger-solid" onClick={() => { setPotvrdZpet(false); onZpet(); }}>Zahodit</Button>
        </>}>
        <p className="text-sm text-black/70 text-pretty">Změny v kartičce jsi neuložil. Když se vrátíš, zmizí.</p>
      </Modal>
    </form>
  );
}
