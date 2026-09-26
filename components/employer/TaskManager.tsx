'use client';

// Úkoly (vedení): co se má udělat, kdo to udělá a do kdy.
//
// Kolo 69 (balík B6a): stránka je plocha s widgety. Hlavička jde do PlochaWidgetu,
// tahle komponenta kreslí nástroj — filtr podle lidí, formulář úkolu a seznam po
// dnech nebo týdenní tabuli. Data čte přes useDataWidgetu z téže adresy jako widgety
// (Po termínu, Podle lidí, Splněno dnes…), takže stránka se ptá jednou a odškrtnutí
// dole i nahoře se srovná samo.
//
// Z auditu (obsah-kontrola, final_sorted): confirm() u mazání a u splnění mimo den
// termínu je teď okno, formulář je z polí `Field` (priorita přes Segmented, žádné
// ruční pilulky ani limetkový box), akce řádku jsou Button s ikonou z Icons.tsx
// a aria-label, štítky úkolu Chip, odkaz na návod ghost tlačítko a „Zobrazit další
// úkoly" bez šipky v textu. Tlačítka Upravit a Smazat se ukážou, jen když je server
// pustí (autor, ukoly.upravit, ukoly.mazat) — dřív klik skončil tichým návratem.

import { useState, useEffect, useMemo, useCallback, useId } from 'react';
import { Icon } from '../Icons';
import {
  Button, Card, Chip, EmptyState, ErrorState, Field, Input, Modal, Segmented, Select, Skeleton, Textarea, Toast,
} from '../ui';
import { useCurrency } from '../CurrencyProvider';
import { TaskChecklist, recurrenceLabel, RECURRENCE_OPTIONS, ChecklistItem } from '../TaskChecklist';
import TaskWeekBoard from '../TaskWeekBoard';
import { PersonLink } from './ProfileLinkProvider';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import { URL_UKOLY, UDALOST_FILTR_UKOLU, KLIC_FILTRU_UKOLU, UKOL, Zaskrtnuti } from '../widgety/oblasti/ukoly';
import { pragueToday } from '@/lib/pragueTime';
import { apiMessage, okJson } from '@/lib/api';
import { useDraft } from '@/lib/useDraft';
import { DraftNote } from '../ui/DraftNote';
import { czCount } from '@/lib/czech';
import { vyberUkoly, rozdelPoDnech, jeCiziUkol, type Ukol } from '@/lib/ukolyPrehled';

interface Member { id: number; name: string; role: string }

const PRIORITIES = [
  { id: 'low', label: 'Nízká' },
  { id: 'medium', label: 'Střední' },
  { id: 'high', label: 'Vysoká' },
] as const;
const prioDot = (p: string) => p === 'high' ? 'bg-bad' : p === 'medium' ? 'bg-wait' : 'bg-black/20';
const PRIORITA: Record<string, string> = { high: 'vysoká', medium: 'střední', low: 'nízká' };

const emptyForm = () => ({ title: '', description: '', assignedTo: '', priority: 'medium', dueDate: '', recurrence: '', checklist: [] as ChecklistItem[] });
type Form = ReturnType<typeof emptyForm>;

const vyberCleny = (raw: any): Member[] =>
  (Array.isArray(raw?.members) ? raw.members : []).filter((m: Member) => m.role === 'employee' || m.role === 'employer');

const denDlouze = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
const denKratce = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

export default function TaskManager({ user }: { user: { id?: string | number } }) {
  const ja = Number(user.id) || null;
  const smi = useSmi();
  const data = useDataWidgetu<Ukol[]>(URL_UKOLY, vyberUkoly);
  const clenoveData = useDataWidgetu<Member[]>('/api/teams', vyberCleny);
  const tasks = useMemo(() => data.data ?? [], [data.data]);
  const members = clenoveData.data ?? [];
  const zadava = smi('ukoly.zadavat');

  // Padesát úkolů napříč osmi lidmi a jediné, co šlo, bylo číst je podle
  // data. „Co má dneska Eva" nešlo zjistit jinak než očima přes celý seznam.
  // 'volne' = úkoly pro kohokoli (widget Úkoly podle lidí na ně umí kliknout).
  const [who, setWho] = useState<number | 'all' | 'volne'>('all');
  const [view, setView] = useState<'list' | 'week'>('list');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSeries, setEditingSeries] = useState(false);
  const [akceChyba, setAkceChyba] = useState<string | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);
  // Okna místo confirm(): mazání a splnění úkolu, který není na dnešek.
  const [mazani, setMazani] = useState<Ukol | null>(null);
  const [mazu, setMazu] = useState(false);
  const [mimoDen, setMimoDen] = useState<Ukol | null>(null);
  // Záložky v aplikaci jsou `?view=`, takže odchod na Rozvrh formulář
  // odmontuje. Do kola 37 to znamenalo psát úkol znovu.
  const koncept = useDraft('ukoly', form, setForm, {
    vychozi: emptyForm(), aktivni: showForm, upravujeSe: editingId != null,
  });
  // Rozepsaný úkol otevře formulář sám. Koncept, který není vidět, je
  // totéž co ztracený — uživatel by ho nehledal a psal znovu.
  useEffect(() => { if (koncept.cekaKoncept) setShowForm(true); }, [koncept.cekaKoncept]);

  // Filtr z widgetu Úkoly podle lidí: na téže stránce událostí, odjinud přes sessionStorage.
  useEffect(() => {
    const nastav = (kdo: unknown) => setWho(kdo == null || kdo === 'volne' ? 'volne' : Number(kdo) || 'all');
    try {
      const ulozeno = sessionStorage.getItem(KLIC_FILTRU_UKOLU);
      if (ulozeno) { sessionStorage.removeItem(KLIC_FILTRU_UKOLU); nastav(ulozeno); }
    } catch { /* soukromé okno */ }
    const naUdalost = (e: Event) => {
      const d = (e as CustomEvent<{ kdo: number | null; prijato: boolean }>).detail;
      d.prijato = true;
      setView('list');
      nastav(d.kdo);
    };
    window.addEventListener(UDALOST_FILTR_UKOLU, naUdalost);
    return () => window.removeEventListener(UDALOST_FILTR_UKOLU, naUdalost);
  }, []);

  const [showLater, setShowLater] = useState(false);
  const { weekStart } = useCurrency();
  const today = pragueToday();
  const weekAhead = pragueToday(7);

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  const closeForm = () => { setShowForm(false); setEditingId(null); setEditingSeries(false); setForm(emptyForm()); setError(''); };
  const openNew = (dueDate = '') => {
    setEditingId(null); setEditingSeries(false);
    setForm({ ...emptyForm(), dueDate, assignedTo: zadava ? '' : String(ja ?? '') });
    setShowForm(true); setError('');
  };

  /** Úpravy pustí server autorovi a s ukoly.upravit; mazání autorovi a s ukoly.mazat. */
  const smiUpravit = (t: Ukol) => t.createdBy === ja || smi('ukoly.upravit');
  const smiSmazat = (t: Ukol) => t.createdBy === ja || smi('ukoly.mazat');
  const smiSplnit = (t: Ukol) => !jeCiziUkol(t, ja) || smi('ukoly.plnit');

  // Open the form pre-filled to edit an existing task.
  const openEdit = (t: Ukol) => {
    if (!smiUpravit(t)) return;
    setEditingId(t.id);
    setEditingSeries(!!t.seriesId);
    setForm({
      title: t.title, description: t.description ?? '',
      assignedTo: t.assignedTo == null ? '' : String(t.assignedTo),
      priority: t.priority, dueDate: t.dueDate ?? '',
      recurrence: t.recurrence ?? '', checklist: t.checklist ?? [],
    });
    setShowForm(true); setError('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError('Zadej název úkolu.'); return; }
    if (form.assignedTo === '' && !form.dueDate) { setError('U úkolu pro kohokoli vyber den (termín).'); return; }
    setSaving(true);
    const spolecne = {
      title: form.title.trim(), description: form.description.trim() || null, priority: form.priority,
      assignedTo: form.assignedTo === '' ? null : parseInt(form.assignedTo),
      dueDate: form.dueDate || null,
      recurrence: form.recurrence || null,
    };
    try {
      // Úprava: všechno jde změnit jako při založení. U opakovaného úkolu server
      // přepíše budoucí výskyty, když se změní termín, přiřazení nebo kroky.
      await fetch(URL_UKOLY, {
        method: editingId ? 'PATCH' : 'POST', headers: JSON_HLAVICKA,
        body: JSON.stringify(editingId
          ? { id: editingId, edit: true, ...spolecne, checklist: form.checklist.filter(i => i.text.trim()).map(i => ({ text: i.text.trim(), done: !!i.done })) }
          : { ...spolecne, checklist: form.checklist.filter(i => i.text.trim()).map(i => ({ text: i.text.trim(), done: false })) }),
      }).then(okJson);
      const novy = !editingId;
      koncept.hotovo(); closeForm();
      // Znovu načíst: opakovaný úkol si na serveru vygeneruje nejbližší výskyty.
      data.reload();
      setZprava(novy ? 'Úkol je zadaný.' : 'Změny úkolu jsou uložené.');
    } catch (err) {
      setError(apiMessage(err, editingId ? 'Úkol se nepodařilo upravit.' : 'Úkol se nepodařilo vytvořit.'));
    }
    setSaving(false);
  };

  /** Zápis s optimistickou změnou a vrácením při chybě (seznam, tabule i widgety nad /api/tasks). */
  const zapis = useCallback(async (zmena: (ts: Ukol[]) => Ukol[], telo: Record<string, unknown>, chyba: string) => {
    setAkceChyba(null);
    const puvodni = data.data;
    data.set(prev => zmena(prev ?? []));
    try {
      await fetch(URL_UKOLY, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify(telo) }).then(okJson);
      data.reload();
    } catch (e) {
      data.set(() => puvodni ?? []);
      setAkceChyba(apiMessage(e, chyba));
    }
  }, [data]);

  // Drag a card to another day → change that occurrence's due date.
  const moveTask = (t: Ukol, date: string) =>
    zapis(ts => ts.map(x => (x.id === t.id ? { ...x, dueDate: date } : x)), { id: t.id, move: true, dueDate: date }, 'Úkol se nepodařilo přesunout.');

  const setStatus = (t: Ukol, done: boolean) => {
    const status = done ? 'done' : 'pending';
    return zapis(ts => ts.map(x => (x.id === t.id ? { ...x, status } : x)), { id: t.id, status }, 'Změnu stavu se nepodařilo uložit.');
  };

  // Toggle done — úkol, který není na dnešek, se napřed zeptá oknem (dřív confirm()).
  const completeTask = (t: Ukol, done: boolean) => {
    if (!smiSplnit(t)) return;
    if (done && t.dueDate && t.dueDate !== today) { setMimoDen(t); return; }
    void setStatus(t, done);
  };

  const remove = async () => {
    const t = mazani;
    if (!t) return;
    setMazu(true);
    try {
      await fetch(`${URL_UKOLY}?id=${t.id}`, { method: 'DELETE' }).then(okJson);
      // Smazání opakovaného úkolu zruší celou sérii — i nadcházející výskyty.
      data.set(prev => (prev ?? []).filter(x => (t.seriesId ? x.seriesId !== t.seriesId : x.id !== t.id)));
      data.reload();
      setZprava(t.seriesId ? 'Opakovaný úkol je smazaný i s nadcházejícími.' : 'Úkol je smazaný.');
      setMazani(null);
    } catch (e) {
      setAkceChyba(apiMessage(e, 'Úkol se nepodařilo smazat.'));
      setMazani(null);
    }
    setMazu(false);
  };

  const saveChecklist = (t: Ukol, next: ChecklistItem[]) =>
    zapis(ts => ts.map(x => (x.id === t.id ? { ...x, checklist: next } : x)), { id: t.id, checklist: next }, 'Kontrolní seznam se nepodařilo uložit.');
  const toggleChecklistItem = (t: Ukol, index: number) =>
    saveChecklist(t, t.checklist.map((it, i) => (i === index ? { ...it, done: !it.done } : it)));
  /** Odškrtnout nebo odškrtnutí zrušit u celého seznamu jedním požadavkem. */
  const toggleChecklistAll = (t: Ukol, done: boolean) => saveChecklist(t, t.checklist.map(it => ({ ...it, done })));

  // Create-form checklist editing helpers.
  const addChecklistLine = () => setForm(f => ({ ...f, checklist: [...f.checklist, { text: '', done: false }] }));
  const insertChecklistLine = (i: number) => setForm(f => { const n = [...f.checklist]; n.splice(i + 1, 0, { text: '', done: false }); return { ...f, checklist: n }; });
  const setChecklistLine = (i: number, text: string) => setForm(f => ({ ...f, checklist: f.checklist.map((it, idx) => idx === i ? { ...it, text } : it) }));
  const removeChecklistLine = (i: number) => setForm(f => ({ ...f, checklist: f.checklist.filter((_, idx) => idx !== i) }));

  const forWho = who === 'all' ? tasks : who === 'volne' ? tasks.filter(t => t.assignedTo == null) : tasks.filter(t => t.assignedTo === who);
  const skupiny = rozdelPoDnech(forWho, today, weekAhead);
  const labelFor = (t: Ukol) => t.teamTask ? 'Kdokoli' : (t.assignedTo != null ? (memberById.get(t.assignedTo)?.name ?? t.assigneeName ?? '') : '');

  const renderRow = (t: Ukol) => {
    const kdo = t.teamTask ? 'Kdokoli' : (t.assigneeName ?? memberById.get(t.assignedTo!)?.name ?? 'Neznámý');
    const done = t.status === 'done';
    // Budoucí výskyty ještě neplatí → tlumeně, dokud nepřijde jejich den.
    const inactive = !done && !!t.dueDate && t.dueDate > today;
    const opakovani = recurrenceLabel(t.recurrence);
    return (
      <li key={t.id} className="list-row items-start">
        <span className="shrink-0 pt-0.5">
          <Zaskrtnuti hotovo={done} nazev={t.title} zamceno={!smiSplnit(t)} ceka={false} onClick={() => completeTask(t, !done)} />
        </span>
        <div className={`min-w-0 flex-1 ${inactive ? 'opacity-60' : ''}`}>
          <p className="flex items-start gap-1.5">
            <span className={`mt-[7px] w-2 h-2 rounded-full shrink-0 ${prioDot(t.priority)}`} aria-hidden />
            <span className="sr-only">Priorita {PRIORITA[t.priority] ?? 'střední'}.</span>
            <span className={`font-medium text-[15px] leading-snug line-clamp-2 ${done ? 'text-black/45' : 'text-[#16181A]'}`}>{t.title}</span>
          </p>
          <div className="text-[13px] text-black/55 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="min-w-0">
              {t.assignedTo != null ? <PersonLink id={t.assignedTo}>{kdo}</PersonLink> : kdo}
              {t.dueDate ? ` · ${denKratce(t.dueDate)}` : ''}
              {done && t.completedByName ? <> · splnil <PersonLink id={t.completedBy}>{t.completedByName}</PersonLink></> : ''}
            </span>
            {t.source === 'production' && <Chip tone="info" size="sm" icon="leaf">Výroba</Chip>}
            {opakovani && <Chip tone="muted" size="sm" icon="refresh">{opakovani}</Chip>}
            {/* Vedení odsud vidí, podle čeho obsluha vyrábí — a jedním ťuknutím je v tom návodu. */}
            {t.sourceMeta?.guideId && (
              <a href={`/employer/overview?view=guides&guide=${t.sourceMeta.guideId}`} className="btn btn-ghost btn-sm -my-1">
                <Icon name="book" size={15} className="shrink-0" />
                <span className="truncate max-w-[12rem]">{t.sourceMeta.guideTitle ?? 'Návod'}</span>
              </a>
            )}
          </div>
          {t.checklist.length > 0 && (
            <TaskChecklist items={t.checklist} onToggle={i => toggleChecklistItem(t, i)} onToggleAll={d => toggleChecklistAll(t, d)} />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {smiUpravit(t) && <Button variant="ghost" size="sm" iconOnly icon="pencil" aria-label={`Upravit úkol ${t.title}`} onClick={() => openEdit(t)} />}
          {smiSmazat(t) && <Button variant="ghost" size="sm" iconOnly icon="trash" className="hover:!text-[var(--bad-ink)]" aria-label={`Smazat úkol ${t.title}`} onClick={() => setMazani(t)} />}
        </div>
      </li>
    );
  };

  const section = (title: string, list: Ukol[], tone = '') =>
    list.length > 0 && (
      <section className="space-y-2" aria-label={title}>
        <h2 className={`t-label ${tone}`}>{title} ({list.length.toLocaleString('cs-CZ')})</h2>
        <Card pad="none" className="px-5"><ul className="list">{list.map(renderRow)}</ul></Card>
      </section>
    );

  const idForm = useId();
  const fid = (k: string) => `${idForm}-${k}`;

  const nastroj = (
    <div className="space-y-6">
      {/* Filtr podle člověka. Ukáže se, až když je koho filtrovat. */}
      {members.length > 1 && tasks.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin scroll-fade-x -mx-1 px-1 py-0.5" role="group" aria-label="Filtr podle člověka">
          <button type="button" aria-pressed={who === 'all'} onClick={() => setWho('all')}
            className={`filter-pill tap-target-sm ${who === 'all' ? 'seg-on' : 'seg-off glass'}`}>
            Všichni · {tasks.length}
          </button>
          {tasks.some(t => t.assignedTo == null) && (
            <button type="button" aria-pressed={who === 'volne'} onClick={() => setWho(w => (w === 'volne' ? 'all' : 'volne'))}
              className={`filter-pill tap-target-sm ${who === 'volne' ? 'seg-on' : 'seg-off glass'}`}>
              Kdokoli · {tasks.filter(t => t.assignedTo == null).length}
            </button>
          )}
          {members.map(m => {
            const n = tasks.filter(t => t.assignedTo === m.id).length;
            if (n === 0) return null;
            return (
              <button key={m.id} type="button" aria-pressed={who === m.id} onClick={() => setWho(w => (w === m.id ? 'all' : m.id))}
                className={`filter-pill tap-target-sm ${who === m.id ? 'seg-on' : 'seg-off glass'}`}>
                {m.name.split(' ')[0]} · {n}
              </button>
            );
          })}
        </div>
      )}

      {showForm && (
        <Card as="form" pad="lg" onSubmit={save} className="space-y-4" aria-labelledby={fid('nadpis')}>
          <h2 id={fid('nadpis')} className="t-section">{editingId ? 'Upravit úkol' : 'Nový úkol'}</h2>
          <DraftNote koncept={koncept} co="rozepsaný úkol" />
          <Field id={fid('nazev')} label="Název úkolu">
            <Input id={fid('nazev')} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Např. Umýt okna" autoFocus maxLength={200} />
          </Field>
          <Field id={fid('popis')} label="Popis" hint="Nepovinné.">
            <Textarea id={fid('popis')} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id={fid('kdo')} label="Kdo úkol udělá"
              hint={form.assignedTo === '' ? 'Úkol na daný den — splní ho kdokoli z týmu.' : 'Úkol pro konkrétního člověka.'}>
              <Select id={fid('kdo')} value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}>
                {/* Úkol pro kohokoli nebo pro kolegu zadá jen ten, kdo smí úkoly zadávat (jako POST /api/tasks). */}
                {zadava && <option value="">Kdokoli (podle dne)</option>}
                {zadava ? members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)
                  : <option value={String(ja ?? '')}>Já</option>}
              </Select>
            </Field>
            <Field id={fid('termin')} label={editingSeries ? 'Termín (od kdy)' : 'Termín'}
              hint={editingSeries ? undefined : form.assignedTo === '' ? 'Povinné u úkolu pro kohokoli.' : 'Nepovinné.'}>
              <Input id={fid('termin')} type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </Field>
          </div>
          {editingSeries && (
            <p className="note note-info text-sm">
              Jde o opakovaný úkol. Název, popis a priorita se změní u všech výskytů. Změna termínu, opakování, přiřazení nebo kroků <strong>přepíše všechny budoucí výskyty</strong> — hotové a minulé zůstanou beze změny.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0">
              <p className="field-label" id={fid('prio')}>Priorita</p>
              <Segmented size="sm" ariaLabel="Priorita" value={form.priority as typeof PRIORITIES[number]['id']}
                onChange={v => setForm(f => ({ ...f, priority: v }))} options={PRIORITIES.map(p => ({ id: p.id, label: p.label }))} />
            </div>
            <Field id={fid('opak')} label="Opakování"
              hint={form.recurrence ? 'Dopředu se připraví nejbližší výskyty; po splnění se neobnoví hned.' : undefined}>
              <Select id={fid('opak')} value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}>
                {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </div>

          <fieldset className="min-w-0">
            <legend className="field-label">Kontrolní seznam <span className="text-black/45 font-normal">— nepovinné</span></legend>
            <div className="space-y-2">
              {form.checklist.map((it, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input value={it.text} onChange={e => setChecklistLine(i, e.target.value)} aria-label={`Bod ${i + 1}`} placeholder={`Bod ${i + 1}`} maxLength={300} />
                  <Button variant="ghost" size="sm" iconOnly icon="plus" aria-label={`Vložit bod za bod ${i + 1}`} onClick={() => insertChecklistLine(i)} />
                  <Button variant="ghost" size="sm" iconOnly icon="minus" aria-label={`Odebrat bod ${i + 1}`} onClick={() => removeChecklistLine(i)} />
                </div>
              ))}
              <Button variant="secondary" size="sm" icon="plus" onClick={addChecklistLine}>Přidat bod</Button>
            </div>
          </fieldset>

          {error && <p className="note note-danger text-sm" role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" loading={saving}>{editingId ? 'Uložit změny' : 'Vytvořit úkol'}</Button>
            <Button variant="secondary" onClick={closeForm}>Zrušit</Button>
          </div>
        </Card>
      )}

      {akceChyba && <p className="note note-danger text-sm" role="alert">{akceChyba}</p>}

      {data.error && !data.data ? (
        <Card><ErrorState title="Úkoly se nenačetly" onRetry={data.reload} detail={data.error} /></Card>
      ) : data.loading ? (
        <Card aria-busy className="space-y-2">
          <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10 w-2/3" />
        </Card>
      ) : view === 'week' ? (
        <TaskWeekBoard tasks={forWho} weekStart={weekStart}
          onComplete={(t, done) => { const u = tasks.find(x => x.id === t.id); if (u) completeTask(u, done); }}
          canComplete={t => { const u = tasks.find(x => x.id === t.id); return !!u && smiSplnit(u); }}
          labelFor={t => { const u = tasks.find(x => x.id === t.id); return u ? labelFor(u) : ''; }}
          onOpen={t => { const u = tasks.find(x => x.id === t.id); if (u) openEdit(u); }}
          onMove={(t, date) => { const u = tasks.find(x => x.id === t.id); if (u) void moveTask(u, date); }}
          canMove={t => { const u = tasks.find(x => x.id === t.id); return !!u && smiUpravit(u); }}
          onAddForDay={d => openNew(d)} />
      ) : tasks.length === 0 ? (
        <Card>
          <EmptyState illustration="ukoly" title="Zatím žádné úkoly"
            hint="Zadej, co se má udělat a kdy — jednorázově nebo každý den. Tým to uvidí v přehledu i na tabletu."
            action={<Button variant="secondary" icon="plus" onClick={() => openNew()}>Nový úkol</Button>} />
        </Card>
      ) : forWho.length === 0 ? (
        <Card><EmptyState compact icon="check" title="Tady nic není" hint="Zruš filtr a uvidíš úkoly všech."
          action={<Button variant="secondary" size="sm" onClick={() => setWho('all')}>Zobrazit všechny</Button>} /></Card>
      ) : (
        <div className="space-y-6">
          {section('Po termínu', skupiny.poTerminu, 'text-bad-ink')}
          {section('Dnes', skupiny.dnes)}
          {section('Tento týden', skupiny.tentoTyden)}
          {skupiny.pozdeji.length > 0 && (
            showLater ? section('Později', skupiny.pozdeji) : (
              <Button variant="ghost" size="sm" iconAfter="chevron" onClick={() => setShowLater(true)}>
                Zobrazit další úkoly ({skupiny.pozdeji.length.toLocaleString('cs-CZ')})
              </Button>
            )
          )}
          {section('Hotové', skupiny.hotove)}
        </div>
      )}
    </div>
  );

  const nehotovych = tasks.filter(t => t.status !== 'done' && (!t.dueDate || t.dueDate <= today)).length;
  return (
    <>
      <PlochaWidgetu
        stranka="vedeni.ukoly"
        hlavicka={{
          title: 'Úkoly',
          subtitle: data.data && nehotovych > 0 ? `Na dnešek a po termínu: ${czCount(nehotovych, UKOL)}.` : 'Úkoly na den nebo pro konkrétní lidi — a jejich plnění.',
          hintId: 'taskmanager',
          primary: <Button variant="accent" icon="plus" onClick={() => (showForm && !editingId ? closeForm() : openNew())}>Nový úkol</Button>,
          aside: <Segmented size="sm" ariaLabel="Zobrazení" value={view} onChange={setView}
            options={[{ id: 'list', label: 'Seznam' }, { id: 'week', label: 'Týden' }]} />,
        }}
        nastroj={nastroj}
      />
      {mazani && (
        <Modal open onClose={() => setMazani(null)} size="sm" title={mazani.seriesId ? 'Smazat opakovaný úkol?' : 'Smazat úkol?'}
          footer={<>
            <Button variant="secondary" onClick={() => setMazani(null)}>Zrušit</Button>
            <Button variant="danger-solid" loading={mazu} onClick={remove}>Smazat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">
            {mazani.seriesId ? <>„{mazani.title}" se smaže i se všemi nadcházejícími výskyty.</> : <>„{mazani.title}" zmizí ze seznamu i z přehledu týmu.</>}
          </p>
        </Modal>
      )}
      {mimoDen && (
        <Modal open onClose={() => setMimoDen(null)} size="sm" title="Tohle není dnešní úkol"
          footer={<>
            <Button variant="secondary" onClick={() => setMimoDen(null)}>Zrušit</Button>
            <Button variant="primary" icon="check" onClick={() => { const t = mimoDen; setMimoDen(null); void setStatus(t, true); }}>Označit jako hotové</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty"><span className="cz-sentence">„{mimoDen.title}" má termín {denDlouze(mimoDen.dueDate!)}.</span> Opravdu ho označit jako hotový už teď?</p>
        </Modal>
      )}
      <Toast message={zprava} onClose={() => setZprava(null)} />
    </>
  );
}
