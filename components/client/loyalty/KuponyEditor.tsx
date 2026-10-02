'use client';

// Editor kuponu: výhoda, komu platí, kdy platí (i přes půlnoc), limity (na hosta,
// celkem, denně), 18+, uvítací kupon, koncept. Vedle formuláře je živý náhled
// pohledem hosta. Kontrola je tatáž jako na serveru (lib/kuponyPole), takže chybu
// správce uvidí dřív, než formulář odešle.

import { useEffect, useState } from 'react';
import { Button, Card, Field, Input, Segmented, SwitchRow } from '../../ui';
import { useSymbol } from '../../CurrencyProvider';
import { normalizujKupon, zkontrolujKupon } from '@/lib/kuponyPole';
import { jeNocniOkno } from '@/lib/kuponyPravidla';
import { czCount, type CzNoun } from '@/lib/czech';
import KuponyNahled from './KuponyNahled';
import { DNY_TYDNE, TIER_VOLBY, type FormKupon } from './kuponyForm';
import { VyberPolozek, VyberKategorii } from './KampanEditor';
import { okJson } from '@/lib/api';

const KUS: CzNoun = { one: 'kus', few: 'kusy', many: 'kusů' };

/** Přepínací filtr (vícenásobný výběr), vybraný je inkoustový. */
function Volba({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`filter-pill tap-target-sm ${on ? 'seg-on' : 'seg-off glass'}`}>
      {children}
    </button>
  );
}

export default function KuponyEditor({ form, setForm, groups, busy, onSave, onZpet }: {
  form: FormKupon; setForm: (f: FormKupon) => void; groups: any[];
  busy: '' | 'save' | 'draft'; onSave: (jakoKoncept: boolean) => void; onZpet: () => void;
}) {
  const symbol = useSymbol();
  const [pokus, setPokus] = useState(false);
  // Položky a kategorie nabídky: pro kupon vázaný na položku a pro vyloučení (načtou se jednou při otevření editoru).
  const [polozky, setPolozky] = useState<{ id: number; name: string; board: string; paired: boolean }[]>([]);
  const [sekce, setSekce] = useState<{ id: number; name: string; board: string }[]>([]);
  useEffect(() => {
    fetch('/api/menu').then(okJson).then(d => {
      const flat: any[] = []; const sec: any[] = [];
      for (const b of d.boards ?? []) for (const s of b.sections ?? []) {
        sec.push({ id: s.id, name: s.title ?? s.name, board: b.name });
        for (const i of s.items ?? []) flat.push({ id: i.id, name: i.name, board: b.name, paired: !!i.posProductId });
      }
      setPolozky(flat); setSekce(sec);
    }).catch(() => {});
  }, []);
  const f = form;
  const set = (patch: Partial<FormKupon>) => setForm({ ...f, ...patch });
  const flip = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const chyba = zkontrolujKupon(normalizujKupon(f), f);
  const uloz = (koncept: boolean) => {
    // Koncept smí být rozepsaný (stačí název); zveřejnění chce kupon úplný.
    if (!koncept && chyba) { setPokus(true); return; }
    if (koncept && !f.title.trim()) { setPokus(true); return; }
    onSave(koncept);
  };
  const jeKoncept = f.draft;
  const nocni = jeNocniOkno(f.hourFrom, f.hourTill);
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" icon="undo" onClick={onZpet}>Zpět na kupony</Button>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-start">
        <Card className="space-y-4 min-w-0">
          <div>
            <h2 className="t-card">{f.id ? `Upravit „${f.title || '…'}"` : 'Nový kupon'}</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Host si ho vezme za body na tvé stránce; dostane kód a obsluha ho uplatní u kasy. Můžeš ho taky poslat hostům napřímo.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-4">
            <Field id="cp-title" label="Název"><Input id="cp-title" value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Dezert k čaji zdarma" maxLength={80} /></Field>
            <Field id="cp-cost" label="Cena v bodech"><Input id="cp-cost" type="number" inputMode="numeric" min={0} max={100000} value={f.costPoints} onChange={e => set({ costPoints: parseInt(e.target.value || '0', 10) })} /></Field>
          </div>
          <Field id="cp-desc" label="Popis"><Input id="cp-desc" value={f.description} onChange={e => set({ description: e.target.value })} placeholder="Jeden dezert z vitríny podle výběru." maxLength={200} /></Field>
          <div>
            <p className="field-label">Co kupon dává</p>
            <Segmented options={[
              { id: 'percent', label: 'Sleva %' }, { id: 'amount', label: `Sleva ${symbol}` }, { id: 'free_item', label: 'Zdarma' },
              { id: 'xy', label: 'X+Y' }, { id: 'text', label: 'Vlastní' },
            ]} value={f.benefitKind} onChange={v => set({ benefitKind: v })} size="sm" ariaLabel="Výhoda kuponu" />
            <div className="mt-3 flex flex-wrap items-end gap-4">
              {f.benefitKind === 'percent' && (
                <Field id="cp-pct" label="Sleva %"><Input id="cp-pct" type="number" inputMode="numeric" min={1} max={100} className="!w-24 text-center" value={f.percentOff} onChange={e => set({ percentOff: e.target.value })} placeholder="15" /></Field>
              )}
              {f.benefitKind === 'amount' && (
                <Field id="cp-amt" label={`Sleva ${symbol}`}><Input id="cp-amt" type="number" inputMode="numeric" min={1} max={100000} className="!w-24 text-center" value={f.amountOff} onChange={e => set({ amountOff: e.target.value })} placeholder="50" /></Field>
              )}
              {f.benefitKind === 'xy' && (<>
                <Field id="cp-xb" label="Koupí (X)"><Input id="cp-xb" type="number" inputMode="numeric" min={1} max={50} className="!w-24 text-center" value={f.xyBuy} onChange={e => set({ xyBuy: e.target.value })} placeholder="2" /></Field>
                <Field id="cp-xf" label="Zdarma (Y)"><Input id="cp-xf" type="number" inputMode="numeric" min={1} max={50} className="!w-24 text-center" value={f.xyFree} onChange={e => set({ xyFree: e.target.value })} /></Field>
              </>)}
              {f.benefitKind === 'free_item' && <p className="t-meta pb-2">Položka zdarma — co přesně, řekni v názvu kuponu.</p>}
              {f.benefitKind === 'text' && <p className="t-meta pb-2">Výhoda je v názvu a popisu — obsluha ji vyřídí podle nich.</p>}
              <Field id="cp-min" label={`Min. útrata (${symbol})`}><Input id="cp-min" type="number" inputMode="numeric" min={0} max={100000} className="!w-28 text-center" value={f.minOrderValue} onChange={e => set({ minOrderValue: e.target.value })} placeholder="—" /></Field>
            </div>
            <p className="t-meta mt-1.5">Minimální útrata: obsluha při uplatnění dostane varování, když je účtenka pod ní.</p>
            {f.benefitKind !== 'text' && (polozky.length > 0 || f.menuItemId) && (
              <Field id="cp-item" label="Platí jen na položku" hint="Volitelné. Host i obsluha uvidí „Zdarma: Dezert dne“ nebo „Sleva 20 % na Dezert dne“.">
                <select id="cp-item" className="field" value={f.menuItemId} onChange={e => set({ menuItemId: e.target.value })}>
                  <option value="">Bez vazby na položku</option>
                  {polozky.map(i => <option key={i.id} value={i.id}>{i.name} ({i.board})</option>)}
                  {f.menuItemId && !polozky.some(i => String(i.id) === f.menuItemId) && <option value={f.menuItemId}>Položka č. {f.menuItemId}</option>}
                </select>
              </Field>
            )}
            {f.benefitKind !== 'text' && (polozky.length > 0 || f.excludedItems.length + f.excludedSections.length > 0) && (
              <details className="well px-4 py-3 mt-3" open={f.excludedItems.length + f.excludedSections.length > 0}>
                <summary className="cursor-pointer text-sm font-semibold">Vyloučené položky a kategorie{f.excludedItems.length + f.excludedSections.length > 0 ? ` (${f.excludedItems.length + f.excludedSections.length})` : ''}</summary>
                <div className="mt-3 space-y-4">
                  <VyberPolozek id="cp-excl-items" items={polozky} value={f.excludedItems} onChange={v => set({ excludedItems: v })} label="Na tyhle položky kupon neplatí"
                    hint="Připomínka pro hosta i obsluhu (štítek „mimo …“). Slevu z účtenky kasa automaticky nepočítá, obsluha ji uplatní ručně." />
                  <VyberKategorii sections={sekce} value={f.excludedSections} onChange={v => set({ excludedSections: v })} label="Na tyhle kategorie kupon neplatí" />
                </div>
              </details>
            )}
          </div>
          <div className="border-t border-black/[0.06] pt-4">
            <p className="field-label">Pro koho platí</p>
            <div className="flex flex-wrap gap-1.5">
              {TIER_VOLBY.map(t => <Volba key={t.id} on={f.targetTiers.includes(t.id)} onClick={() => set({ targetTiers: flip(f.targetTiers, t.id) })}>{t.label}</Volba>)}
            </div>
            {groups.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {groups.map((g: any) => <Volba key={g.id} on={f.targetGroups.includes(g.id)} onClick={() => set({ targetGroups: flip(f.targetGroups, g.id) })}>{g.name} ({g.members})</Volba>)}
              </div>
            )}
            <p className="t-meta mt-1.5">Nic nevybráno = platí všem členům. Skupiny hostů se spravují v Body a úrovně.</p>
          </div>
          <div className="border-t border-black/[0.06] pt-4 space-y-3">
            <p className="field-label">Kdy platí</p>
            <div className="flex flex-wrap gap-1.5">
              {DNY_TYDNE.map(d => <Volba key={d.d} on={f.daysOfWeek.includes(d.d)} onClick={() => set({ daysOfWeek: flip(f.daysOfWeek, d.d) })}>{d.l}</Volba>)}
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-4">
              <Field id="cp-hf" label="Od hodiny"><Input id="cp-hf" type="time" value={f.hourFrom} onChange={e => set({ hourFrom: e.target.value })} /></Field>
              <Field id="cp-ht" label="Do hodiny"><Input id="cp-ht" type="time" value={f.hourTill} onChange={e => set({ hourTill: e.target.value })} /></Field>
              <Field id="cp-vs" label="Platí od"><Input id="cp-vs" type="date" value={f.validSince} onChange={e => set({ validSince: e.target.value })} /></Field>
              <Field id="cp-vu" label="Platí do"><Input id="cp-vu" type="date" value={f.validUntil} onChange={e => set({ validUntil: e.target.value })} /></Field>
            </div>
            <p className="t-meta">
              Žádný den nevybraný = platí každý den. Prázdné hodiny = celý den.
              {nocni && ` Okno ${f.hourFrom}–${f.hourTill} jde přes půlnoc; část po půlnoci patří k předchozímu dni.`}
            </p>
          </div>
          <div className="border-t border-black/[0.06] pt-4 space-y-3">
            <p className="field-label">Limity</p>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-4">
              <Field id="cp-per" label="Nejvýš na hosta"><Input id="cp-per" type="number" inputMode="numeric" min={0} max={100} className="sm:!w-24 text-center" value={f.perCustomer} onChange={e => set({ perCustomer: parseInt(e.target.value || '0', 10) })} /></Field>
              <Field id="cp-cd" label="Znovu až za (dní)"><Input id="cp-cd" type="number" inputMode="numeric" min={0} max={365} className="sm:!w-24 text-center" value={f.cooldownDays} onChange={e => set({ cooldownDays: parseInt(e.target.value || '0', 10) })} /></Field>
              <Field id="cp-mt" label="Kusů celkem"><Input id="cp-mt" type="number" inputMode="numeric" min={1} max={1000000} className="sm:!w-28 text-center" value={f.maxTotal} onChange={e => set({ maxTotal: e.target.value })} placeholder="bez limitu" /></Field>
              <Field id="cp-dl" label="Uplatnění za den"><Input id="cp-dl" type="number" inputMode="numeric" min={1} max={100000} className="sm:!w-28 text-center" value={f.dailyLimit} onChange={e => set({ dailyLimit: e.target.value })} placeholder="bez limitu" /></Field>
            </div>
            <p className="t-meta">
              0 nebo prázdné = bez omezení. Na hosta počítá vyzvednutí, „znovu až za“ čas od posledního. „Kusů celkem“ je počet vydaných kódů,
              „za den“ počet uplatnění u kasy v pražském dni.{f.id && f.issued > 0 ? ` Už vydáno: ${czCount(f.issued, KUS)}.` : ''}
            </p>
            <ul className="list">
              <SwitchRow title="Jen 18+" hint="Podle data narození v profilu hosta; obsluha u kasy dostane připomenutí zkontrolovat doklad." checked={f.adultOnly} onChange={v => set({ adultOnly: v })} />
              <SwitchRow title="Uvítací kupon" hint="Nový člen ho dostane sám při vstupu do podniku. Stávajícím členům ho pošleš ručně: Další akce → Poslat hostům." checked={f.welcome} onChange={v => set({ welcome: v })} />
            </ul>
          </div>
          {pokus && (chyba || !f.title.trim()) && <p role="alert" className="note note-danger text-sm px-3 py-2">{chyba ?? 'Kupon potřebuje název.'}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onZpet}>Zrušit</Button>
            {(jeKoncept || !f.id) && <Button variant="secondary" loading={busy === 'draft'} disabled={busy === 'save'} onClick={() => uloz(true)}>Uložit jako koncept</Button>}
            <Button variant="primary" loading={busy === 'save'} disabled={busy === 'draft'} onClick={() => uloz(false)}>{jeKoncept && f.id ? 'Zveřejnit' : f.id ? 'Uložit kupon' : 'Založit kupon'}</Button>
          </div>
        </Card>
        <KuponyNahled f={f} className="lg:sticky lg:top-4" />
      </div>
    </div>
  );
}
