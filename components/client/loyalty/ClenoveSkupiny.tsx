'use client';

// Skupiny hostů („štamgasti", „firemní večery") ve Věrnosti: název, popis a barva,
// přejmenování, vlastní sleva, členové skupiny s exportem a dynamické skupiny
// podle pravidel (nepřišli N dní, útrata od X, narozeniny tento měsíc). Členy do ruční
// skupiny přidává vedení v Zákaznících (po jednom i hromadně z filtru); kupony na
// skupiny jdou cílit v jejich editoru. Člen ve víc skupinách (a s úrovní) bere vždy
// nejvyšší slevu, nikdy součet. Dřív funkce Groups v LoyaltyTabs.tsx s jediným
// políčkem pro název.

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Modal, Segmented, Skeleton, Textarea, useLoad } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { useMoney, useSymbol } from '../../CurrencyProvider';
import { czCount, type CzNoun } from '@/lib/czech';
import { apiMessage, okJson, okText } from '@/lib/api';
import { ulozSoubor } from '@/lib/stahni';
import { BARVY_SKUPIN, chybaPravidel, popisPravidel, tonBarvy, MAX_NEAKTIVNI_DNI, type PravidlaSkupiny } from '@/lib/clenoveFiltr';
import { j } from '../import/typy';
import SkupinyImport from './SkupinyImport';

const HOST: CzNoun = { one: 'host', few: 'hosté', many: 'hostů' };

interface Skupina {
  id: number; name: string; description: string | null; color: string | null; discount_pct: number; members: number;
  rules: PravidlaSkupiny | null; dynamic: boolean; archived?: boolean;
}

interface Formular {
  id: number | null; name: string; description: string; color: string; discount: string;
  dynamic: boolean; quietDays: string; spendOver: string; birthdayMonth: boolean;
}

const PRAZDNY: Formular = { id: null, name: '', description: '', color: '', discount: '', dynamic: false, quietDays: '', spendOver: '', birthdayMonth: false };

const naFormular = (g: Skupina): Formular => ({
  id: g.id, name: g.name, description: g.description ?? '', color: g.color ?? '', discount: g.discount_pct ? String(g.discount_pct) : '',
  dynamic: g.dynamic, quietDays: g.rules?.quietDays ? String(g.rules.quietDays) : '', spendOver: g.rules?.spendOver ? String(g.rules.spendOver) : '', birthdayMonth: !!g.rules?.birthdayMonth,
});

const pravidlaZFormulare = (f: Formular): PravidlaSkupiny | null => {
  if (!f.dynamic) return null;
  return {
    ...(Number(f.quietDays) > 0 ? { quietDays: Number(f.quietDays) } : {}),
    ...(Number(f.spendOver) > 0 ? { spendOver: Number(f.spendOver) } : {}),
    ...(f.birthdayMonth ? { birthdayMonth: true } : {}),
  };
};

export default function ClenoveSkupiny({ toast }: { toast: (m: string, ton?: 'ok' | 'bad') => void }) {
  const meni = useOpravneni().ma('zakaznici.skupiny');
  const smiImport = useOpravneni().ma('zakaznici.kontakty');
  const money = useMoney();
  const { data: d, error, reload } = useLoad<{ groups: Skupina[] }>('/api/client/admin/groups', raw => ({ groups: Array.isArray(raw?.groups) ? raw.groups : [] }));
  const [form, setForm] = useState<Formular | null>(null);
  const [mazu, setMazu] = useState<Skupina | null>(null);
  const [clenove, setClenove] = useState<Skupina | null>(null);
  const [import_, setImport] = useState<Skupina | null>(null);
  const [archiv, setArchiv] = useState(false);
  const [busy, setBusy] = useState('');

  // Sleva skupiny se ukládá po opuštění pole; 0 = skupina je jen štítek.
  const ulozSlevu = async (g: Skupina, hodnota: string) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(hodnota) || 0)));
    if (n === (Number(g.discount_pct) || 0)) return;
    setBusy('sleva:' + g.id);
    try { await j('/api/client/admin/groups', { method: 'PATCH', body: JSON.stringify({ id: g.id, discount_pct: n }) }); reload(); toast(`Sleva skupiny ${g.name}: ${n} %.`); }
    catch (err) { toast(apiMessage(err, 'Slevu se nepodařilo uložit.'), 'bad'); reload(); }
    setBusy('');
  };
  // Archiv: skupina zmizí z nabídek (zprávy, kupony), členové i historie zůstanou.
  const archivuj = async (g: Skupina, archived: boolean) => {
    setBusy('arch:' + g.id);
    try { await j('/api/client/admin/groups', { method: 'PATCH', body: JSON.stringify({ id: g.id, archived }) }); reload(); toast(archived ? `Skupina ${g.name} je v archivu.` : `Skupina ${g.name} je zpátky.`); }
    catch (err) { toast(apiMessage(err, 'Skupinu se nepodařilo přesunout.'), 'bad'); }
    setBusy('');
  };
  const smaz = async (g: Skupina) => {
    setBusy('del:' + g.id);
    try { await j(`/api/client/admin/groups?id=${g.id}`, { method: 'DELETE' }); reload(); toast(`Skupina ${g.name} je smazaná.`); }
    catch (err) { toast(apiMessage(err, 'Skupinu se nepodařilo smazat.'), 'bad'); }
    setBusy('');
  };

  return (
    <Card className="space-y-3" aria-labelledby="v-skupiny">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="v-skupiny" className="t-card">Skupiny hostů</h2>
          <p className="t-meta mt-0.5 max-w-[70ch]">Vlastní štítky mimo úrovně — „štamgasti", „firemní večery". Ruční skupinu plníš v Zákaznících, i hromadně podle filtru. Dynamická skupina se plní sama podle pravidel. Kupony na skupiny cílíš v jejich editoru. Skupina může mít i vlastní slevu: člen ve víc skupinách (a s úrovní) bere vždy nejvyšší z nich, nikdy součet.</p>
        </div>
        {d?.groups.some(g => g.archived) && <Button size="sm" variant="ghost" aria-pressed={archiv} onClick={() => setArchiv(v => !v)}>{archiv ? 'Skrýt archiv' : 'Ukázat archiv'}</Button>}
        {meni && <Button size="sm" variant="secondary" icon="plus" onClick={() => setForm({ ...PRAZDNY })}>Nová skupina</Button>}
      </div>
      {error ? <ErrorState title="Skupiny se nenačetly" detail={error} onRetry={reload} />
        : d === null ? <Skeleton className="h-16" />
        : d.groups.length === 0 ? <EmptyState icon="users" compact title="Zatím žádná skupina" hint={meni ? 'Založ první: třeba Štamgasti, nebo dynamickou „Nepřišli 60 dní".' : 'Skupiny zakládá vedení.'} />
        : (
          <ul className="list">
            {d.groups.filter(g => archiv || !g.archived).map(g => (
              <ListRow key={g.id}
                title={<span className="flex items-center gap-2 min-w-0"><span className="truncate">{g.name}</span><Chip tone={tonBarvy(g.color)} size="sm">{g.dynamic ? 'Dynamická' : 'Ruční'}</Chip>{g.archived && <Chip tone="muted" size="sm">Archiv</Chip>}</span>}
                meta={[czCount(Number(g.members) || 0, HOST), Number(g.discount_pct) > 0 ? `sleva ${g.discount_pct} %` : null, g.dynamic ? popisPravidel(g.rules, money) : null, g.description].filter(Boolean).join(' · ')}
                actions={<>
                  <Button size="sm" variant="secondary" onClick={() => setClenove(g)}>Členové</Button>
                  {meni && (
                    <>
                      <label htmlFor={`sk-${g.id}`} className="inline-flex items-center gap-1.5 text-xs text-black/60">Sleva v %
                        <Input id={`sk-${g.id}`} key={`${g.id}:${g.discount_pct}`} type="number" min={0} max={100} className="!w-20" aria-label={`Sleva v % pro skupinu ${g.name}`}
                          defaultValue={Number(g.discount_pct) || 0} disabled={busy === 'sleva:' + g.id}
                          onBlur={e => { void ulozSlevu(g, e.target.value); }} />
                      </label>
                      {!g.dynamic && !g.archived && smiImport && <Button size="sm" variant="ghost" icon="upload" aria-label={`Přidat členy z CSV do skupiny ${g.name}`} onClick={() => setImport(g)}>Z CSV</Button>}
                      <Button size="sm" variant="ghost" loading={busy === 'arch:' + g.id} aria-label={`${g.archived ? 'Vrátit z archivu' : 'Archivovat'} skupinu ${g.name}`} onClick={() => { void archivuj(g, !g.archived); }}>{g.archived ? 'Vrátit' : 'Archiv'}</Button>
                      <Button size="sm" variant="ghost" aria-label={`Upravit skupinu ${g.name}`} onClick={() => setForm(naFormular(g))}>Upravit</Button>
                      <Button size="sm" variant="ghost" icon="trash" aria-label={`Smazat skupinu ${g.name}`} loading={busy === 'del:' + g.id} onClick={() => setMazu(g)}>Smazat</Button>
                    </>
                  )}
                </>} />
            ))}
          </ul>
        )}
      {import_ && <SkupinyImport skupina={import_} oznam={toast} onZavrit={() => { setImport(null); reload(); }} />}
      {form && <SkupinaOkno vychozi={form} toast={toast} onZavrit={() => setForm(null)} onHotovo={() => { setForm(null); reload(); }} />}
      {clenove && <ClenoveSkupinyOkno skupina={clenove} meni={meni} toast={toast} onZavrit={() => { setClenove(null); reload(); }} />}
      {mazu && (
        <Modal open onClose={() => setMazu(null)} size="sm" title={`Smazat skupinu „${mazu.name}"?`}
          footer={<>
            <Button variant="secondary" onClick={() => setMazu(null)}>Zrušit</Button>
            <Button variant="danger-solid" onClick={() => { const g = mazu; setMazu(null); void smaz(g); }}>Smazat skupinu</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Hosté v ní zůstanou, jen přijdou o štítek{Number(mazu.discount_pct) > 0 ? ` a o slevu ${mazu.discount_pct} %` : ''}. Kupony cílené jen na tuhle skupinu přestanou nikomu fungovat.</p>
        </Modal>
      )}
    </Card>
  );
}

/** Založení a úprava skupiny: název, popis, barva, sleva a (volitelně) pravidla dynamické skupiny. */
function SkupinaOkno({ vychozi, toast, onZavrit, onHotovo }: { vychozi: Formular; toast: (m: string, ton?: 'ok' | 'bad') => void; onZavrit: () => void; onHotovo: () => void }) {
  const money = useMoney();
  const symbol = useSymbol();
  const [f, setF] = useState<Formular>(vychozi);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const novy = f.id === null;
  const pravidla = pravidlaZFormulare(f);
  const chybaPr = f.dynamic ? chybaPravidel(pravidla) : null;
  const menilaSeNaDynamickou = !novy && f.dynamic && !vychozi.dynamic;
  const ulozit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { setChyba('Zadej název skupiny.'); return; }
    if (chybaPr) { setChyba(chybaPr); return; }
    setBusy(true); setChyba('');
    try {
      const telo = {
        name: f.name.trim(), description: f.description.trim(), color: f.color || null,
        discount_pct: f.discount === '' ? 0 : Number(f.discount),
        rules: pravidla,
      };
      if (novy) await j('/api/client/admin/groups', { method: 'POST', body: JSON.stringify(telo) });
      else await j('/api/client/admin/groups', { method: 'PATCH', body: JSON.stringify({ id: f.id, ...telo }) });
      toast(novy ? `Skupina ${telo.name} je založená.` : `Skupina ${telo.name} je uložená.`);
      onHotovo();
    } catch (err) { setChyba(apiMessage(err, 'Skupinu se nepodařilo uložit.')); }
    setBusy(false);
  };
  return (
    <Modal open onClose={onZavrit} size="md" title={novy ? 'Nová skupina' : `Skupina ${vychozi.name}`}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button type="submit" form="skupina-okno" variant="primary" loading={busy} disabled={!f.name.trim()}>Uložit</Button>
      </>}>
      <form id="skupina-okno" onSubmit={ulozit} className="space-y-4">
        <Field id="sk-nazev" label="Název">
          <Input id="sk-nazev" autoFocus maxLength={60} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Štamgasti" />
        </Field>
        <Field id="sk-popis" label="Popis" hint="Jen pro tebe a tým, host ho nevidí.">
          <Textarea id="sk-popis" rows={2} maxLength={200} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
        </Field>
        <div>
          <p className="field-label">Barva štítku</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Barva štítku">
            <button type="button" aria-pressed={!f.color} onClick={() => setF({ ...f, color: '' })} className={`filter-pill tap-target-sm ${!f.color ? 'seg-on' : 'seg-off glass'}`}>Bez barvy</button>
            {BARVY_SKUPIN.map(b => (
              <button key={b.id} type="button" aria-pressed={f.color === b.id} aria-label={b.label} onClick={() => setF({ ...f, color: b.id })}
                className={`tap-target-sm rounded-full p-0.5 border ${f.color === b.id ? 'border-black/60' : 'border-transparent'}`}>
                <Chip tone={b.tone} size="sm">{b.label}</Chip>
              </button>
            ))}
          </div>
        </div>
        <Field id="sk-sleva" label="Sleva skupiny (%)" hint="0 = skupina je jen štítek. Člen bere nejvyšší z úrovně a skupin.">
          <Input id="sk-sleva" type="number" min={0} max={100} className="!w-28" value={f.discount} onChange={e => setF({ ...f, discount: e.target.value })} />
        </Field>
        <div className="space-y-2">
          <p className="field-label">Kdo do skupiny patří</p>
          <Segmented options={[{ id: 'rucni', label: 'Vybírám ručně' }, { id: 'dynamicka', label: 'Podle pravidel' }]} value={f.dynamic ? 'dynamicka' : 'rucni'}
            onChange={v => setF({ ...f, dynamic: v === 'dynamicka' })} size="sm" ariaLabel="Druh skupiny" />
          {f.dynamic && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="sk-quiet" label="Nepřišli aspoň (dní)" hint="Bez návštěvy se počítá od přidání do klubu.">
                  <Input id="sk-quiet" type="number" inputMode="numeric" min={1} max={MAX_NEAKTIVNI_DNI} placeholder="třeba 60" value={f.quietDays} onChange={e => setF({ ...f, quietDays: e.target.value })} />
                </Field>
                <Field id="sk-spend" label={`Útrata od (${symbol})`} hint="Celková útrata za celou dobu.">
                  <Input id="sk-spend" type="number" inputMode="numeric" min={1} placeholder="třeba 2000" value={f.spendOver} onChange={e => setF({ ...f, spendOver: e.target.value })} />
                </Field>
              </div>
              <button type="button" aria-pressed={f.birthdayMonth} onClick={() => setF({ ...f, birthdayMonth: !f.birthdayMonth })}
                className={`filter-pill tap-target-sm ${f.birthdayMonth ? 'seg-on' : 'seg-off glass'}`}>Mají narozeniny tento měsíc</button>
              <p className={chybaPr ? 'note note-wait' : 't-meta'}>{chybaPr ?? `Do skupiny patří hosté, na které platí všechna zapnutá pravidla naráz: ${popisPravidel(pravidla, money).toLowerCase()}. Členy přepočítáme při každém otevření a každou noc.`}</p>
              {menilaSeNaDynamickou && <p className="note note-wait">Současní členové se nahradí podle pravidel.</p>}
            </div>
          )}
          {!f.dynamic && !novy && vychozi.dynamic && <p className="t-meta">Po uložení zůstanou současní členové a dál je půjde měnit ručně.</p>}
        </div>
        {chyba && <p role="alert" className="note note-wait">{chyba}</p>}
      </form>
    </Modal>
  );
}

/** Kdo ve skupině je: stránkovaný seznam, odebrání (u ruční skupiny) a export do CSV. */
function ClenoveSkupinyOkno({ skupina, meni, toast, onZavrit }: { skupina: Skupina; meni: boolean; toast: (m: string, ton?: 'ok' | 'bad') => void; onZavrit: () => void }) {
  const { ma } = useOpravneni();
  const money = useMoney();
  const [rows, setRows] = useState<{ id: number; name: string; email?: string; points: number; visits: number }[] | null>(null);
  const [total, setTotal] = useState(0);
  const [dalsi, setDalsi] = useState<number | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verze, setVerze] = useState(0);
  const url = (offset: number) => `/api/client/admin/customers?group=${skupina.id}&sort=jmeno&limit=50&offset=${offset}`;
  useEffect(() => {
    let zije = true;
    setChyba(null);
    fetch(url(0)).then(okJson).then(r => { if (zije) { setRows(r.customers ?? []); setTotal(Number(r.total) || 0); setDalsi(r.nextOffset ?? null); } })
      .catch(e => { if (zije) setChyba(apiMessage(e, 'Členy skupiny se nepodařilo načíst.')); });
    return () => { zije = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skupina.id, verze]);
  const vic = async () => {
    if (dalsi == null) return;
    setBusy(true);
    try {
      const r = await fetch(url(dalsi)).then(okJson);
      setRows(p => [...(p ?? []), ...(r.customers ?? [])]); setDalsi(r.nextOffset ?? null);
    } catch (e) { toast(apiMessage(e, 'Další členy se nepodařilo načíst.'), 'bad'); }
    setBusy(false);
  };
  const odeber = useCallback(async (id: number) => {
    try { await j('/api/client/admin/groups', { method: 'PATCH', body: JSON.stringify({ id: skupina.id, remove: [id] }) }); setVerze(v => v + 1); }
    catch (e) { toast(apiMessage(e, 'Hosta se nepodařilo odebrat.'), 'bad'); }
  }, [skupina.id, toast]);
  const exportuj = async () => {
    setBusy(true);
    try {
      const text = await fetch(`/api/client/admin/customers?group=${skupina.id}&sort=jmeno&format=csv`).then(okText);
      const r = await ulozSoubor(`skupina-${skupina.name}.csv`, text, 'text/csv;charset=utf-8');
      if (r !== 'nejde') toast('Export skupiny je uložený.');
    } catch (e) { toast(apiMessage(e, 'Export se nepodařil.'), 'bad'); }
    setBusy(false);
  };
  return (
    <Modal open onClose={onZavrit} size="lg" title={`Členové skupiny ${skupina.name}`} subtitle={rows ? czCount(total, HOST) : undefined}
      footer={<>
        {ma('zakaznici.export') && <Button variant="secondary" icon="download" loading={busy && rows !== null && dalsi === null} disabled={!rows || total === 0} onClick={() => { void exportuj(); }}>Export CSV</Button>}
        <Button variant="primary" onClick={onZavrit}>Hotovo</Button>
      </>}>
      {chyba ? <ErrorState title="Členové se nenačetli" detail={chyba} onRetry={() => setVerze(v => v + 1)} />
        : rows === null ? <Skeleton className="h-24" />
        : rows.length === 0 ? <EmptyState icon="users" compact title="Skupina je zatím prázdná"
            hint={skupina.dynamic ? 'Zatím na pravidla nikdo nesedí.' : 'Hosty do ní přidáš v Zákaznících: vyber je zaškrtnutím nebo podle filtru.'} />
        : (
          <>
            <ul className="list">
              {rows.map(c => (
                <ListRow key={c.id} title={c.name} meta={c.email ?? undefined} value={<>{c.points.toLocaleString('cs-CZ')} <span className="text-xs font-medium text-black/50">b.</span></>}
                  actions={meni && !skupina.dynamic ? <Button size="sm" variant="ghost" onClick={() => { void odeber(c.id); }} aria-label={`Odebrat ze skupiny: ${c.name}`}>Odebrat</Button> : undefined} />
              ))}
            </ul>
            {dalsi != null && <div className="pt-3"><Button size="sm" variant="secondary" loading={busy} onClick={() => { void vic(); }}>Načíst další</Button></div>}
            {skupina.dynamic && <p className="t-meta pt-3">Členy určují pravidla ({popisPravidel(skupina.rules, money).toLowerCase()}), ručně se neodebírají.</p>}
          </>
        )}
    </Modal>
  );
}
