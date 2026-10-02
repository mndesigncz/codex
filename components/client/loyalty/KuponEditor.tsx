'use client';

// Editor kuponu v plné síle: výhoda (% / částka / zdarma / X+Y strukturovaně),
// vázání na položku nabídky, vyloučené položky a kategorie, komu platí, kdy
// platí (i přes půlnoc), limity (kusy, uplatnění za den, na hosta), 18+, uvítací
// kupon, koncept a živý náhled pohledem hosta. Enter uloží, Escape se vrátí
// (s otázkou, když je co ztratit).

import { useMemo, useState } from 'react';
import { Button, Card, Field, Input, Modal, Segmented, Select, SwitchRow } from '../../ui';
import { useSymbol } from '../../CurrencyProvider';
import { hodnotyKuponu, kontrolaKuponu } from '@/lib/kuponyPravidla';
import { czCount } from '@/lib/czech';
import { apiMessage } from '@/lib/api';
import { j, Volba, TIER_OPTS, DOW } from './kuponyUi';
import KuponNahled from './KuponNahled';

export interface Polozka { id: number; name: string; category: string }

export const prazdnyKupon = () => ({
  id: null as number | null, title: '', description: '', costPoints: 100, active: true, status: 'live',
  benefitKind: 'percent', percentOff: '', amountOff: '', xyBuy: '', xyFree: '1',
  minOrderValue: '', targetTiers: [] as string[], targetGroups: [] as number[],
  perCustomer: 0, cooldownDays: 0, daysOfWeek: [] as number[], hourFrom: '', hourTill: '',
  adultOnly: false, welcome: false, validSince: '', validUntil: '',
  totalLimit: '', dailyLimit: '', menuItemId: '' as number | '', excludedItems: [] as number[], excludedCategories: [] as string[],
});
export type FormKuponu = ReturnType<typeof prazdnyKupon>;

export function kuponNaFormular(c: any): FormKuponu {
  return {
    id: c.id, title: c.title ?? '', description: c.description ?? '',
    costPoints: Number(c.costPoints) || 0, active: c.active !== false, status: c.status ?? 'live',
    benefitKind: c.benefitKind ?? 'text',
    percentOff: c.percentOff == null ? '' : String(c.percentOff),
    amountOff: c.amountOff == null ? '' : String(c.amountOff),
    xyBuy: c.xyBuy == null ? '' : String(c.xyBuy), xyFree: c.xyFree == null ? '1' : String(c.xyFree),
    minOrderValue: c.minOrderValue == null ? '' : String(c.minOrderValue),
    targetTiers: c.targetTiers ?? [], targetGroups: c.targetGroups ?? [],
    perCustomer: Number(c.perCustomer) || 0, cooldownDays: Number(c.cooldownDays) || 0,
    daysOfWeek: c.daysOfWeek ?? [], hourFrom: c.hourFrom ?? '', hourTill: c.hourTill ?? '',
    adultOnly: c.adultOnly === true, welcome: c.welcome === true,
    validSince: c.validSince ? String(c.validSince).slice(0, 10) : '',
    validUntil: c.validUntil ? String(c.validUntil).slice(0, 10) : '',
    totalLimit: c.totalLimit == null ? '' : String(c.totalLimit),
    dailyLimit: c.dailyLimit == null ? '' : String(c.dailyLimit),
    menuItemId: c.menuItemId == null ? '' : Number(c.menuItemId),
    excludedItems: c.excludedItems ?? [], excludedCategories: c.excludedCategories ?? [],
  };
}

const flip = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
const MISTO = { one: 'položka', few: 'položky', many: 'položek' };

export default function KuponEditor({ vychozi, groups, polozky, onUlozeno, onZpet, toast }: {
  vychozi: FormKuponu; groups: any[]; polozky: Polozka[];
  onUlozeno: (zprava: string) => void; onZpet: () => void; toast: (m: string) => void;
}) {
  const symbol = useSymbol();
  const [f, setF] = useState<FormKuponu>(vychozi);
  const [puvodni] = useState(() => JSON.stringify(vychozi));
  const [busy, setBusy] = useState<'' | 'save' | 'draft'>('');
  const [zahodit, setZahodit] = useState(false);
  const [chyba, setChyba] = useState('');
  const set = (patch: Partial<FormKuponu>) => { setF(prev => ({ ...prev, ...patch })); setChyba(''); };
  const zmeneno = JSON.stringify(f) !== puvodni;
  const kategorie = useMemo(() => Array.from(new Set(polozky.map(p => p.category).filter(Boolean))), [polozky]);
  const jmenoPolozky = (id: number) => polozky.find(p => p.id === id)?.name ?? `č. ${id}`;
  const hodnoty = hodnotyKuponu(f);
  const chybaHodnot = kontrolaKuponu(hodnoty);
  const radek = { ...hodnoty, id: f.id ?? 0, item_name: f.menuItemId ? jmenoPolozky(Number(f.menuItemId)) : null, excluded_item_names: f.excludedItems.map(jmenoPolozky) };
  const pres = !!(f.hourFrom && f.hourTill && f.hourFrom > f.hourTill);

  const zpet = () => { if (zmeneno) setZahodit(true); else onZpet(); };
  const uloz = async (status: 'draft' | 'live' | null) => {
    if (chybaHodnot) { setChyba(chybaHodnot); return; }
    setBusy(status === 'draft' ? 'draft' : 'save'); setChyba('');
    try {
      const body = { ...f, status: status ?? f.status };
      await j('/api/client/admin/coupons', { method: f.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      onUlozeno(status === 'draft' ? 'Koncept uložen. Host ho nevidí.' : f.id ? 'Kupon uložen.' : 'Kupon založen.');
    } catch (e) { const m = apiMessage(e, 'Kupon se nepodařilo uložit.'); setChyba(m); toast(m); }
    setBusy('');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-start">
      <div className="space-y-4 min-w-0 max-w-3xl">
        <Button variant="ghost" size="sm" icon="undo" onClick={zpet}>Zpět na kupony</Button>
        <Card as="form" className="space-y-4" onSubmit={(e: React.FormEvent) => { e.preventDefault(); void uloz(null); }}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('[role="dialog"]')) { e.preventDefault(); zpet(); } }}>
          <div>
            <h2 className="t-card">{f.id ? `Upravit „${f.title || '…'}"` : 'Nový kupon'}</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Host si ho vezme za body na tvé stránce; dostane kód a obsluha ho uplatní u kasy. Koncept host nevidí, dokud ho nezveřejníš.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-4">
            <Field id="cp-title" label="Název" hint={`${f.title.length}/80 znaků`}><Input id="cp-title" autoFocus={!f.id} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Dezert k čaji zdarma" maxLength={80} /></Field>
            <Field id="cp-cost" label="Cena v bodech" hint="0 = zdarma"><Input id="cp-cost" type="number" inputMode="numeric" min={0} max={100000} value={f.costPoints} onChange={e => set({ costPoints: parseInt(e.target.value || '0', 10) })} /></Field>
          </div>
          <Field id="cp-desc" label="Popis" hint={`${f.description.length}/200 znaků`}><Input id="cp-desc" value={f.description} onChange={e => set({ description: e.target.value })} placeholder="Jeden dezert z vitríny podle výběru." maxLength={200} /></Field>

          <div className="border-t border-black/[0.06] pt-4 space-y-3">
            <p className="field-label">Co kupon dává</p>
            <Segmented options={[
              { id: 'percent', label: 'Sleva %' }, { id: 'amount', label: `Sleva ${symbol}` }, { id: 'free_item', label: 'Zdarma' },
              { id: 'xy', label: 'X+Y' }, { id: 'text', label: 'Vlastní' },
            ]} value={f.benefitKind} onChange={v => set({ benefitKind: v })} size="sm" ariaLabel="Výhoda kuponu" />
            <div className="flex flex-wrap items-end gap-4">
              {f.benefitKind === 'percent' && (
                <Field id="cp-pct" label="Sleva (%)" hint="1 až 100"><Input id="cp-pct" type="number" inputMode="numeric" min={1} max={100} className="!w-24 text-center" value={f.percentOff} onChange={e => set({ percentOff: e.target.value })} placeholder="15" /></Field>
              )}
              {f.benefitKind === 'amount' && (
                <Field id="cp-amt" label={`Sleva (${symbol})`}><Input id="cp-amt" type="number" inputMode="numeric" min={1} max={100000} className="!w-24 text-center" value={f.amountOff} onChange={e => set({ amountOff: e.target.value })} placeholder="50" /></Field>
              )}
              {f.benefitKind === 'xy' && (<>
                <Field id="cp-xb" label="Host koupí (X)" hint="kusů"><Input id="cp-xb" type="number" inputMode="numeric" min={1} max={50} className="!w-24 text-center" value={f.xyBuy} onChange={e => set({ xyBuy: e.target.value })} placeholder="2" /></Field>
                <Field id="cp-xf" label="Zdarma (Y)" hint="kusů navíc"><Input id="cp-xf" type="number" inputMode="numeric" min={1} max={50} className="!w-24 text-center" value={f.xyFree} onChange={e => set({ xyFree: e.target.value })} /></Field>
                {Number(f.xyBuy) > 0 && <p className="t-meta pb-2" aria-live="polite">Host koupí {Number(f.xyBuy)}, dostane {Math.max(1, Number(f.xyFree) || 1)} zdarma ({Number(f.xyBuy)}+{Math.max(1, Number(f.xyFree) || 1)}).</p>}
              </>)}
              {f.benefitKind === 'free_item' && <p className="t-meta pb-2 max-w-[48ch]">Vyber položku nabídky níž, nebo řekni v názvu kuponu, co je zdarma.</p>}
              {f.benefitKind === 'text' && <p className="t-meta pb-2 max-w-[48ch]">Výhoda je v názvu a popisu — obsluha ji vyřídí podle nich.</p>}
              <Field id="cp-min" label={`Min. útrata (${symbol})`} hint="Obsluha ji při uplatnění zadá"><Input id="cp-min" type="number" inputMode="numeric" min={0} max={100000} className="!w-28 text-center" value={f.minOrderValue} onChange={e => set({ minOrderValue: e.target.value })} placeholder="—" /></Field>
            </div>
            {polozky.length > 0 ? (
              <Field id="cp-item" label="Platí jen na položku" hint="Nepovinné. Výhoda se pak týká jen vybrané položky z tvé nabídky.">
                <Select id="cp-item" value={f.menuItemId === '' ? '' : String(f.menuItemId)} onChange={e => set({ menuItemId: e.target.value ? Number(e.target.value) : '' })}>
                  <option value="">Celá útrata</option>
                  {kategorie.map(k => (
                    <optgroup key={k} label={k}>{polozky.filter(p => p.category === k).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                  ))}
                </Select>
              </Field>
            ) : <p className="t-meta">Kupon jde svázat s položkou nabídky, jakmile ji máš v Nabídce.</p>}
          </div>

          {(kategorie.length > 0 || polozky.length > 0) && (
            <div className="border-t border-black/[0.06] pt-4 space-y-3">
              <p className="field-label">Co kupon nezahrnuje</p>
              {kategorie.length > 0 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Vyloučené kategorie">
                  {kategorie.map(k => <Volba key={k} on={f.excludedCategories.includes(k)} onClick={() => set({ excludedCategories: flip(f.excludedCategories, k) })}>{k}</Volba>)}
                </div>
              )}
              {polozky.length > 0 && (
                <Field id="cp-excl" label="Vyloučit položku" hint={f.excludedItems.length ? undefined : 'Třeba alkohol nebo akční zboží.'}>
                  <Select id="cp-excl" value="" onChange={e => { const id = Number(e.target.value); if (id) set({ excludedItems: Array.from(new Set([...f.excludedItems, id])) }); }}>
                    <option value="">Přidat položku…</option>
                    {polozky.filter(p => !f.excludedItems.includes(p.id) && p.id !== f.menuItemId).map(p => <option key={p.id} value={p.id}>{p.category ? `${p.category} — ` : ''}{p.name}</option>)}
                  </Select>
                </Field>
              )}
              {f.excludedItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5" role="list" aria-label={`Vyloučené ${czCount(f.excludedItems.length, MISTO)}`}>
                  {f.excludedItems.map(id => (
                    <span key={id} role="listitem" className="filter-pill seg-on inline-flex items-center gap-1">
                      {jmenoPolozky(id)}
                      <button type="button" aria-label={`Odebrat z vyloučených: ${jmenoPolozky(id)}`} className="tap-target-sm -mr-1 px-1" onClick={() => set({ excludedItems: f.excludedItems.filter(x => x !== id) })}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <p className="t-meta">Vyloučené věci se připomenou obsluze při uplatnění a hostovi na kartě kuponu.</p>
            </div>
          )}

          <div className="border-t border-black/[0.06] pt-4">
            <p className="field-label">Pro koho platí</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Úrovně hostů">
              {TIER_OPTS.map(t => <Volba key={t.id} on={f.targetTiers.includes(t.id)} onClick={() => set({ targetTiers: flip(f.targetTiers, t.id) })}>{t.label}</Volba>)}
            </div>
            {groups.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2" role="group" aria-label="Skupiny hostů">
                {groups.map((g: any) => <Volba key={g.id} on={f.targetGroups.includes(g.id)} onClick={() => set({ targetGroups: flip(f.targetGroups, g.id) })}>{g.name} ({g.members})</Volba>)}
              </div>
            )}
            <p className="t-meta mt-1.5">Nic nevybráno = platí všem členům. Skupiny hostů se spravují v Body a úrovně.</p>
          </div>

          <div className="border-t border-black/[0.06] pt-4 space-y-3">
            <p className="field-label">Kdy platí</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dny v týdnu">
              {DOW.map(d => <Volba key={d.d} on={f.daysOfWeek.includes(d.d)} onClick={() => set({ daysOfWeek: flip(f.daysOfWeek, d.d) })}>{d.l}</Volba>)}
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-4">
              <Field id="cp-hf" label="Od hodiny"><Input id="cp-hf" type="time" value={f.hourFrom} onChange={e => set({ hourFrom: e.target.value })} /></Field>
              <Field id="cp-ht" label="Do hodiny"><Input id="cp-ht" type="time" value={f.hourTill} onChange={e => set({ hourTill: e.target.value })} /></Field>
              <Field id="cp-vs" label="Platí od"><Input id="cp-vs" type="date" value={f.validSince} onChange={e => set({ validSince: e.target.value })} /></Field>
              <Field id="cp-vu" label="Platí do"><Input id="cp-vu" type="date" value={f.validUntil} onChange={e => set({ validUntil: e.target.value })} /></Field>
            </div>
            <p className="t-meta">
              Žádný den nevybraný = platí každý den. Prázdné hodiny = celý den.
              {pres ? ` Hodiny ${f.hourFrom}–${f.hourTill} platí přes půlnoc: večer i po půlnoci do rána.` : ' Pro noční okno zadej třeba od 22:00 do 02:00.'}
              {' '}Kupon s datem „od" v budoucnu je naplánovaný a host ho uvidí od toho dne.
            </p>
          </div>

          <div className="border-t border-black/[0.06] pt-4 space-y-3">
            <p className="field-label">Limity</p>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-4">
              <Field id="cp-per" label="Nejvýš na hosta" hint="0 = bez limitu"><Input id="cp-per" type="number" inputMode="numeric" min={0} max={100} className="sm:!w-28 text-center" value={f.perCustomer} onChange={e => set({ perCustomer: parseInt(e.target.value || '0', 10) })} /></Field>
              <Field id="cp-cd" label="Znovu až za (dní)" hint="0 = hned"><Input id="cp-cd" type="number" inputMode="numeric" min={0} max={365} className="sm:!w-28 text-center" value={f.cooldownDays} onChange={e => set({ cooldownDays: parseInt(e.target.value || '0', 10) })} /></Field>
              <Field id="cp-tot" label="Celkem kusů" hint="Prázdné = bez limitu"><Input id="cp-tot" type="number" inputMode="numeric" min={1} max={1000000} className="sm:!w-28 text-center" value={f.totalLimit} onChange={e => set({ totalLimit: e.target.value })} placeholder="—" /></Field>
              <Field id="cp-day" label="Uplatnění za den" hint="Prázdné = bez limitu"><Input id="cp-day" type="number" inputMode="numeric" min={1} max={100000} className="sm:!w-28 text-center" value={f.dailyLimit} onChange={e => set({ dailyLimit: e.target.value })} placeholder="—" /></Field>
            </div>
            <p className="t-meta">Limit na hosta počítá vyzvednutí, cooldown čas od posledního. Celkem kusů je počet vydaných kódů, uplatnění za den hlídá obsluha u kasy.</p>
            <ul className="list">
              <SwitchRow title="Jen 18+" hint="Podle data narození v profilu hosta. Kdo ho nemá vyplněné, kupon nevezme; u kasy obsluha ověří občanku." checked={f.adultOnly} onChange={v => set({ adultOnly: v })} />
              <SwitchRow title="Uvítací kupon" hint="Nový člen ho dostane sám při vstupu do podniku (úrovně, 18+ a limit kusů se hlídají). Stávajícím členům ho pošleš ručně v Poslat kupon." checked={f.welcome} onChange={v => set({ welcome: v })} />
            </ul>
          </div>

          {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
          {!chyba && chybaHodnot && f.title && <p className="t-meta text-wait-ink" role="status">{chybaHodnot}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={zpet}>Zrušit</Button>
            {(f.status === 'draft' || !f.id) && <Button type="button" variant="secondary" loading={busy === 'draft'} onClick={() => { void uloz('draft'); }}>Uložit jako koncept</Button>}
            <Button type="submit" variant="primary" loading={busy === 'save'}>{f.status === 'draft' ? 'Zveřejnit' : f.id ? 'Uložit kupon' : 'Založit kupon'}</Button>
          </div>
        </Card>
      </div>
      <div className="xl:sticky xl:top-4 min-w-0"><KuponNahled radek={radek} /></div>
      {zahodit && (
        <Modal open onClose={() => setZahodit(false)} size="sm" title="Zahodit změny?"
          footer={<>
            <Button variant="secondary" onClick={() => setZahodit(false)}>Pokračovat v úpravě</Button>
            <Button variant="danger-solid" onClick={onZpet}>Zahodit</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Změny na kuponu nejsou uložené. Když se vrátíš, zmizí.</p>
        </Modal>
      )}
    </div>
  );
}
