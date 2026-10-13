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

import { useState, useEffect, useMemo, useCallback, useId, useRef } from 'react';
import { Icon } from '../Icons';
import {
  Button, Card, Chip, EmptyState, ErrorState, Field, Input, Modal, Segmented, Select, SelectBox, Skeleton, SwitchRow, Textarea, Toast, runBulk,
} from '../ui';
import { useCurrency } from '../CurrencyProvider';
import { TaskChecklist, ChecklistItem } from '../TaskChecklist';
import TaskWeekBoard from '../TaskWeekBoard';
import { PersonLink } from './ProfileLinkProvider';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import { URL_UKOLY, UDALOST_FILTR_UKOLU, KLIC_FILTRU_UKOLU, Zaskrtnuti, useTedHM } from '../widgety/oblasti/ukoly';
import { pragueToday } from '@/lib/pragueTime';
import { apiMessage, okJson } from '@/lib/api';
import { useDraft } from '@/lib/useDraft';
import { DraftNote } from '../ui/DraftNote';
import { vyberUkoly, rozdelPoDnech, jeCiziUkol, splnenoDnes, stavPoOdskrtnuti, chceFotku, prazdnyFormularUkolu, type FormularUkolu, type StavZapisu, type Ukol } from '@/lib/ukolyPrehled';
import { VYCHOZI_FILTR, filtrujBezStavu, filtrujUkoly, poctyStavu, seradUkoly, statistikaUkolu, rozborPredani, cerstvePredani, poCase, UDALOST_PREDANI_UKOLU, type FiltrUkolu } from '@/lib/ukolyFiltr';
import { UkolDetail } from '../ukoly/UkolDetail';
import { PrilozFoto } from '../ukoly/PrilozFoto';
import { UkolyFiltry, type ClovekFiltru } from '../ukoly/UkolyFiltry';
import { UkolySouhrn } from '../ukoly/UkolySouhrn';
import { RychlePridani } from '../ukoly/RychlePridani';
import { UkolyMesic } from '../ukoly/UkolyMesic';
import { UkolyPrehled } from '../ukoly/UkolyPrehled';
import { oznamZmenuPovinnych, ChipPredUzaverkou } from '../PredUzaverkou';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtHM } from '@/lib/i18n/format';
import { sUzlem, VLOZ } from './jazyk';
import { useLocale } from './jazyk';

interface Member { id: number; name: string; role: string }

const PRIORITIES = [
  { id: 'low', label: 'Nízká' }, // i18n-ok (popisky překládá priority(t))
  { id: 'medium', label: 'Střední' }, // i18n-ok
  { id: 'high', label: 'Vysoká' }, // i18n-ok
] as const;
const prioDot = (p: string) => p === 'high' ? 'bg-bad' : p === 'medium' ? 'bg-wait' : 'bg-[#C8F542]';
const priority = (t: PrekladFn): { id: 'low' | 'medium' | 'high'; label: string }[] => [
  { id: 'low', label: t('Nízká') }, { id: 'medium', label: t('Střední') }, { id: 'high', label: t('Vysoká') },
];
const prioritaText = (t: PrekladFn): Record<string, string> => ({ high: t('vysoká'), medium: t('střední'), low: t('nízká') });

// Prázdný formulář je v lib/ukolyPrehled.ts: stejný tvar zapisuje Plánování
// („Založit úkol z karty") jako koncept — jinak by ho slouceni v lib/draft nepřijalo.
const emptyForm = prazdnyFormularUkolu;
type Form = FormularUkolu;

const vyberCleny = (raw: any): Member[] =>
  (Array.isArray(raw?.members) ? raw.members : []).filter((m: Member) => m.role === 'employee' || m.role === 'employer');

const denDlouze = (d: string, loc: string) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
const denKratce = (d: string, loc: string) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'numeric' });
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

export default function TaskManager({ user }: { user: { id?: string | number } }) {
  const loc = useLocale();
  const t = useT('sprava');
  const opakovaniText = (r?: string | null) => r === 'daily' ? t('Denně') : r === 'weekdays' ? t('Pracovní dny') : r === 'weekly' ? t('Týdně') : null;
  const moznostiOpakovani = [{ value: '', label: t('Neopakovat') }, { value: 'daily', label: t('Denně') }, { value: 'weekdays', label: t('Pracovní dny') }, { value: 'weekly', label: t('Týdně') }];
  const ja = Number(user.id) || null;
  const smi = useSmi();
  const data = useDataWidgetu<Ukol[]>(URL_UKOLY, vyberUkoly);
  const clenoveData = useDataWidgetu<Member[]>('/api/teams', vyberCleny);
  const tasks = useMemo(() => data.data ?? [], [data.data]);
  const members = clenoveData.data ?? [];
  const zadava = smi('ukoly.zadavat');
  // Zámek uzávěrky nastaví jen vedení — server příznak bez těchhle práv ignoruje.
  const smiPovinny = zadava || smi('ukoly.upravit');

  // Padesát úkolů napříč osmi lidmi a jediné, co šlo, bylo číst je podle
  // data. „Co má dneska Eva" nešlo zjistit jinak než očima přes celý seznam.
  // 'volne' = úkoly pro kohokoli (widget Úkoly podle lidí na ně umí kliknout).
  const [filtr, setFiltr] = useState<FiltrUkolu>(VYCHOZI_FILTR);
  const who = filtr.kdo;
  const setWho = useCallback((kdo: FiltrUkolu['kdo'] | ((w: FiltrUkolu['kdo']) => FiltrUkolu['kdo'])) =>
    setFiltr(f => ({ ...f, kdo: typeof kdo === 'function' ? kdo(f.kdo) : kdo })), []);
  const [view, setView] = useState<'list' | 'week' | 'month' | 'prehled'>('list');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Kolo 7: zadání víc lidem, kde část POSTů selhala — komu se nezadalo (formulář zůstane otevřený jen s nimi).
  const [castecne, setCastecne] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSeries, setEditingSeries] = useState(false);
  const [akceChyba, setAkceChyba] = useState<string | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);
  // Omylem odškrtnutý úkol jde vrátit z toastu; vlastní toast, ať se nepletou ostatní zprávy.
  const [hotovyUkol, setHotovyUkol] = useState<{ uk: Ukol; id: number } | null>(null);
  // Okna místo confirm(): mazání a splnění úkolu, který není na dnešek.
  const [mazani, setMazani] = useState<Ukol | null>(null);
  const [mazu, setMazu] = useState(false);
  const [mimoDen, setMimoDen] = useState<Ukol | null>(null);
  // Kolo 7: úkol, který chce fotku jako důkaz — okno Přilož fotku před splněním.
  const [fotoUkol, setFotoUkol] = useState<Ukol | null>(null);
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

  // Předání z widgetu (Po termínu → rovnou záložka Po termínu): po přechodu z uloženého, na otevřené stránce z události.
  useEffect(() => {
    const pouzij = (arg: string | null) => {
      const r = rozborPredani(arg);
      if (r.stav) { setFiltr(f => ({ ...f, stav: r.stav! })); setView('list'); }
      if (r.ukolId != null) { setView('list'); setFiltr(VYCHOZI_FILTR); setDetailId(r.ukolId); }
      if (r.pohled) setView(r.pohled);
    };
    const a = cerstvePredani();
    if (a) pouzij(a);
    const naUdalost = (e: Event) => pouzij((e as CustomEvent<string>).detail);
    window.addEventListener(UDALOST_PREDANI_UKOLU, naUdalost);
    return () => window.removeEventListener(UDALOST_PREDANI_UKOLU, naUdalost);
  }, []);

  const [showLater, setShowLater] = useState(false);
  const { weekStart } = useCurrency();
  const today = pragueToday();
  const weekAhead = pragueToday(7);
  // Pražské „teď" pro štítek „po čase" (dnešní úkol, jehož čas termínu minul).
  const ted = useTedHM();

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  /** Rychlé přidání jedním řádkem: úkol pro kohokoli (kdo smí zadávat) nebo pro mě, s termínem z řádku. */
  const rychle = async (title: string, dueDate: string) => {
    await fetch(URL_UKOLY, {
      method: 'POST', headers: JSON_HLAVICKA,
      body: JSON.stringify({ title, description: null, priority: 'medium', assignedTo: zadava ? null : ja, dueDate, recurrence: null, checklist: [] }),
    }).then(okJson).catch(e => { throw new Error(apiMessage(e, t('Úkol se nepodařilo vytvořit.'))); });
    data.reload();
    oznamZmenuPovinnych();
    setZprava(t('Úkol je zadaný.'));
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setEditingSeries(false); setForm(emptyForm()); setError(''); setCastecne(null); };
  const openNew = (dueDate = '') => {
    setEditingId(null); setEditingSeries(false);
    setForm({ ...emptyForm(), dueDate, assignedTo: zadava ? '' : String(ja ?? '') });
    setShowForm(true); setError(''); setCastecne(null);
  };
  /** Zakládá se úkol a smí se zadat komukoli → výběr víc lidí (pás pilulek nebo seznam se zaškrtáváním). */
  const vyberVic = zadava && editingId == null;
  const proKohokoli = vyberVic ? form.komu.length === 0 : form.assignedTo === '';
  const prepniKomu = (id: number) => setForm(f => {
    const k = String(id);
    return { ...f, komu: f.komu.includes(k) ? f.komu.filter(x => x !== k) : [...f.komu, k] };
  });
  // Posuvný pás lidí: vyblednutý pravý okraj jen tehdy, když je ještě co posouvat (jako CategoryNav).
  const pasLidi = useRef<HTMLDivElement>(null);
  const konecPasu = (el: HTMLElement) => el.classList.toggle('at-end', el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  useEffect(() => { if (pasLidi.current) konecPasu(pasLidi.current); }, [showForm, vyberVic, members.length]);

  /** Úpravy pustí server autorovi a s ukoly.upravit; mazání autorovi a s ukoly.mazat. */
  const smiUpravit = (uk: Ukol) => uk.createdBy === ja || smi('ukoly.upravit');
  const smiSmazat = (uk: Ukol) => uk.createdBy === ja || smi('ukoly.mazat');
  const smiSplnit = (uk: Ukol) => !jeCiziUkol(uk, ja) || smi('ukoly.plnit');

  // Open the form pre-filled to edit an existing task.
  const openEdit = (uk: Ukol) => {
    if (!smiUpravit(uk)) return;
    setEditingId(uk.id);
    setEditingSeries(!!uk.seriesId);
    setForm({
      ...emptyForm(),
      title: uk.title, description: uk.description ?? '',
      assignedTo: uk.assignedTo == null ? '' : String(uk.assignedTo),
      priority: uk.priority, dueDate: uk.dueDate ?? '', dueTime: uk.dueTime ?? '',
      recurrence: uk.recurrence ?? '', checklist: uk.checklist ?? [],
      requireBeforeClosing: uk.requireBeforeClosing === true,
      requirePhoto: uk.requirePhoto === true,
    });
    setShowForm(true); setError(''); setCastecne(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError(t('Zadej název úkolu.')); return; }
    if (proKohokoli && !form.dueDate) { setError(t('U úkolu pro kohokoli vyber den (termín).')); return; }
    // Zámek patří dni — bez termínu i opakování by úkol nezamkl nikdy nic (server vrátí totéž).
    if (smiPovinny && form.requireBeforeClosing && !form.dueDate && !form.recurrence && !editingSeries) {
      setError(t('Povinný úkol potřebuje den nebo opakování.')); return;
    }
    setSaving(true);
    setCastecne(null);
    const lide = vyberVic ? form.komu.map(Number).filter(Number.isFinite) : [];
    const spolecne = {
      title: form.title.trim(), description: form.description.trim() || null, priority: form.priority,
      assignedTo: vyberVic ? (lide.length === 1 ? lide[0] : null) : form.assignedTo === '' ? null : parseInt(form.assignedTo),
      dueDate: form.dueDate || null,
      // Čas bez dne server odmítne — pole je bez data zamčené, tady jen pojistka.
      dueTime: form.dueDate && form.dueTime ? form.dueTime : null,
      recurrence: form.recurrence || null,
      // Bez práva se příznak neposílá vůbec: úprava od autora bez práva ho pak na serveru nechá, jak byl.
      ...(smiPovinny ? { requireBeforeClosing: form.requireBeforeClosing, requirePhoto: form.requirePhoto } : {}),
    };
    // Kolo 7: víc lidí najednou = úkol každému zvlášť (Connecteam „Assign to"). Požadavky
    // jdou naráz (runBulk), každý s kontrolou res.ok; co se nepovede, se řekne jménem.
    if (lide.length > 1) {
      const telo = { ...spolecne, checklist: form.checklist.filter(i => i.text.trim()).map(i => ({ text: i.text.trim(), done: false })) };
      const { done, failed } = await runBulk(lide, id =>
        fetch(URL_UKOLY, { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify({ ...telo, assignedTo: id }) }).then(okJson));
      if (done.length > 0) { data.reload(); oznamZmenuPovinnych(); }
      if (failed.length === 0) {
        koncept.hotovo(); closeForm();
        setZprava(t('{n, plural, one {Úkol je zadaný # člověku} few {Úkol je zadaný # lidem} other {Úkol je zadaný # lidem}}', { n: done.length }));
      } else {
        // Formulář zůstane jen s těmi, komu se úkol nezadal — „Vytvořit úkol" pak zkusí jen je.
        const jmena = failed.map(id => memberById.get(id)?.name.split(' ')[0] ?? String(id)).join(', ');
        setForm(f => ({ ...f, komu: failed.map(String) }));
        setCastecne(t('Nezadalo se {n} z {celkem}: {komu}', { n: failed.length, celkem: lide.length, komu: jmena }));
      }
      setSaving(false);
      return;
    }
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
      // Změna příznaku mění zámek dnešní uzávěrky — otevřený formulář uzávěrky se přepočítá.
      oznamZmenuPovinnych();
      setZprava(novy ? t('Úkol je zadaný.') : t('Změny úkolu jsou uložené.'));
    } catch (err) {
      setError(apiMessage(err, editingId ? t('Úkol se nepodařilo upravit.') : t('Úkol se nepodařilo vytvořit.')));
    }
    setSaving(false);
  };

  /** Zápis s optimistickou změnou a vrácením při chybě (seznam, tabule i widgety nad /api/tasks). */
  const zapis = useCallback(async (zmena: (ts: Ukol[]) => Ukol[], telo: Record<string, unknown>, chyba: string, naChybu?: (zprava: string) => void) => {
    setAkceChyba(null);
    const puvodni = data.data;
    data.set(prev => zmena(prev ?? []));
    try {
      await fetch(URL_UKOLY, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify(telo) }).then(okJson);
      data.reload();
      // Splnění i přesun na jiný den mění zámek uzávěrky — otevřený formulář se přepočítá.
      oznamZmenuPovinnych();
      return true;
    } catch (e) {
      data.set(() => puvodni ?? []);
      // Okno (Přilož fotku) ukáže chybu u sebe; jinak hláška nad seznamem.
      if (naChybu) naChybu(apiMessage(e, chyba)); else setAkceChyba(apiMessage(e, chyba));
      return false;
    }
  }, [data]);

  // Drag a card to another day → change that occurrence's due date.
  const moveTask = (uk: Ukol, date: string) =>
    zapis(ts => ts.map(x => (x.id === uk.id ? { ...x, dueDate: date } : x)), { id: uk.id, move: true, dueDate: date }, t('Úkol se nepodařilo přesunout.'));

  // Kolo 7: Čeká / Probíhá / Hotovo jako u zaměstnance — vedení teď stav i nastaví (Začít v detailu).
  const setStatus = (uk: Ukol, status: StavZapisu) =>
    zapis(ts => ts.map(x => (x.id === uk.id ? { ...x, status } : x)), { id: uk.id, status }, t('Změnu stavu se nepodařilo uložit.'));

  // Toggle done — úkol, který není na dnešek, se napřed zeptá oknem (dřív confirm()).
  const completeTask = (uk: Ukol, done: boolean) => {
    if (!smiSplnit(uk)) return;
    if (done && uk.dueDate && uk.dueDate !== today) { setMimoDen(uk); return; }
    // Kolo 7: úkol „jen s fotkou" se odškrtne až v okně Přilož fotku (server bez fotky vrátí 400).
    if (done && chceFotku(uk)) { setFotoUkol(uk); return; }
    void setStatus(uk, stavPoOdskrtnuti(done, uk.status)).then(ok => {
      // Výrobní úkol už dávku naskladnil — „Vrátit" by jen lhalo, že se to vrátilo.
      if (ok && done && uk.source !== 'production') setHotovyUkol(h => ({ uk, id: (h?.id ?? 0) + 1 }));
    });
  };

  /** Splnění s fotkou z okna Přilož fotku: vrátí hlášku chyby (zůstane v okně), nebo null. */
  const splnitSFotkou = async (uk: Ukol, url: string): Promise<string | null> => {
    let chyba: string | null = null;
    const ok = await zapis(ts => ts.map(x => (x.id === uk.id ? { ...x, status: 'done', completionPhoto: url } : x)),
      { id: uk.id, status: 'done', completionPhotoUrl: url }, t('Změnu stavu se nepodařilo uložit.'), z => { chyba = z; });
    if (ok) { setFotoUkol(null); setHotovyUkol(h => ({ uk, id: (h?.id ?? 0) + 1 })); }
    return chyba;
  };

  const remove = async () => {
    const uk = mazani;
    if (!uk) return;
    setMazu(true);
    try {
      await fetch(`${URL_UKOLY}?id=${uk.id}`, { method: 'DELETE' }).then(okJson);
      // Smazání opakovaného úkolu zruší celou sérii — i nadcházející výskyty.
      data.set(prev => (prev ?? []).filter(x => (uk.seriesId ? x.seriesId !== uk.seriesId : x.id !== uk.id)));
      data.reload();
      setZprava(uk.seriesId ? t('Opakovaný úkol je smazaný i s nadcházejícími.') : t('Úkol je smazaný.'));
      setMazani(null);
    } catch (e) {
      setAkceChyba(apiMessage(e, t('Úkol se nepodařilo smazat.')));
      setMazani(null);
    }
    setMazu(false);
  };

  const saveChecklist = (uk: Ukol, next: ChecklistItem[]) =>
    zapis(ts => ts.map(x => (x.id === uk.id ? { ...x, checklist: next } : x)), { id: uk.id, checklist: next }, t('Kontrolní seznam se nepodařilo uložit.'));
  const toggleChecklistItem = (uk: Ukol, index: number) =>
    saveChecklist(uk, uk.checklist.map((it, i) => (i === index ? { ...it, done: !it.done } : it)));
  /** Odškrtnout nebo odškrtnutí zrušit u celého seznamu jedním požadavkem. */
  const toggleChecklistAll = (uk: Ukol, done: boolean) => saveChecklist(uk, uk.checklist.map(it => ({ ...it, done })));

  // Create-form checklist editing helpers.
  const addChecklistLine = () => setForm(f => ({ ...f, checklist: [...f.checklist, { text: '', done: false }] }));
  const insertChecklistLine = (i: number) => setForm(f => { const n = [...f.checklist]; n.splice(i + 1, 0, { text: '', done: false }); return { ...f, checklist: n }; });
  const setChecklistLine = (i: number, text: string) => setForm(f => ({ ...f, checklist: f.checklist.map((it, idx) => idx === i ? { ...it, text } : it) }));
  const removeChecklistLine = (i: number) => setForm(f => ({ ...f, checklist: f.checklist.filter((_, idx) => idx !== i) }));

  // Filtry kromě stavu platí pro všechny pohledy; záložka stavu jen pro seznam.
  const bezStavu = useMemo(() => seradUkoly(filtrujBezStavu(tasks, filtr), filtr.razeni), [tasks, filtr]);
  const forWho = bezStavu;
  const pocty = useMemo(() => poctyStavu(tasks, filtr, today, weekAhead), [tasks, filtr, today, weekAhead]);
  const plochySeznam = filtr.stav !== 'vse' || filtr.razeni !== 'termin';
  const vSeznamu = useMemo(() => filtrujUkoly(tasks, filtr, today, weekAhead), [tasks, filtr, today, weekAhead]);
  const skupiny = rozdelPoDnech(forWho, today, weekAhead);
  const lideFiltru = useMemo(() => {
    const out: ClovekFiltru[] = [];
    const volne = tasks.filter(uk => uk.assignedTo == null).length;
    if (volne > 0) out.push({ id: 'volne', label: t('Kdokoli'), n: volne });
    for (const m of members) { const n = tasks.filter(uk => uk.assignedTo === m.id).length; if (n > 0) out.push({ id: m.id, label: m.name.split(' ')[0], n }); }
    return out;
  }, [tasks, members, t]);
  const detail = detailId != null ? tasks.find(x => x.id === detailId) ?? null : null;
  const hodnotyKarty = useMemo(() => {
    const tyden = statistikaUkolu(tasks, pragueToday(-6), today, today);
    return { otevrene: tasks.filter(x => x.status !== 'done').length, poTerminu: poctyStavu(tasks, VYCHOZI_FILTR, today, weekAhead).po_terminu,
      dnesHotovo: tasks.filter(x => x.dueDate === today && x.status === 'done').length, dnesCelkem: tasks.filter(x => x.dueDate === today).length, tyden: tyden.splneno, uspesnost: tyden.uspesnostPct };
  }, [tasks, today, weekAhead]);
  const labelFor = (uk: Ukol) => uk.teamTask ? t('Kdokoli') : (uk.assignedTo != null ? (memberById.get(uk.assignedTo)?.name ?? uk.assigneeName ?? '') : '');

  const renderRow = (uk: Ukol) => {
    const kdo = uk.teamTask ? t('Kdokoli') : (uk.assigneeName ?? memberById.get(uk.assignedTo!)?.name ?? t('Neznámý'));
    const done = uk.status === 'done';
    // Budoucí výskyty ještě neplatí → tlumeně, dokud nepřijde jejich den.
    const inactive = !done && !!uk.dueDate && uk.dueDate > today;
    const opakovani = opakovaniText(uk.recurrence);
    return (
      <li key={uk.id} className="list-row items-start">
        <span className="shrink-0 pt-0.5">
          <Zaskrtnuti hotovo={done} nazev={uk.title} zamceno={!smiSplnit(uk)} ceka={false} onClick={() => completeTask(uk, !done)} />
        </span>
        <div className={`min-w-0 flex-1 ${inactive ? 'opacity-60' : ''}`}>
          <p className="flex items-start gap-1.5">
            <span className={`mt-[7px] w-2 h-2 rounded-full shrink-0 ${prioDot(uk.priority)}`} aria-hidden />
            <span className="sr-only">{t('Priorita {uroven}.', { uroven: prioritaText(t)[uk.priority] ?? t('střední') })}</span>
            <button type="button" onClick={() => setDetailId(uk.id)} aria-haspopup="dialog" title={t('Otevřít detail úkolu')}
              className={`min-w-0 text-left font-medium text-[15px] leading-snug line-clamp-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] rounded ${done ? 'text-black/45' : 'text-[#16181A]'}`}>{uk.title}</button>
          </p>
          {uk.description && <p className="text-[13px] text-black/55 mt-0.5 line-clamp-1 text-pretty">{uk.description}</p>}
          <div className="text-[13px] text-black/55 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="min-w-0">
              {uk.assignedTo != null ? <PersonLink id={uk.assignedTo}>{kdo}</PersonLink> : kdo}
              {uk.dueDate ? ` · ${denKratce(uk.dueDate, loc)}` : ''}
              {uk.dueDate && uk.dueTime ? ` · ${fmtHM(uk.dueTime)}` : ''}
              {done && uk.completedByName ? <>  · {t('splnil')} <PersonLink id={uk.completedBy}>{uk.completedByName}</PersonLink></> : ''}
            </span>
            {/* Kolo 7: „Probíhá" i ve správcovském seznamu — dřív ho viděl jen zaměstnanec a detail. */}
            {uk.status === 'in_progress' && !done && <Chip tone="info" size="sm">{t('Probíhá')}</Chip>}
            {poCase(uk, today, ted) && <Chip tone="bad" size="sm">{t('po čase')}</Chip>}
            {uk.source === 'production' && <Chip tone="info" size="sm" icon="leaf">{t('Výroba')}</Chip>}
            {opakovani && <Chip tone="muted" size="sm" icon="refresh">{opakovani}</Chip>}
            {uk.requireBeforeClosing && <ChipPredUzaverkou />}
            {/* Kolo 7: fotka jako důkaz — nehotový „chce fotku", hotový „s fotkou". */}
            {uk.requirePhoto && !done && !uk.completionPhoto && <Chip tone="muted" size="sm" icon="camera">{t('chce fotku')}</Chip>}
            {done && uk.completionPhoto && <Chip tone="muted" size="sm" icon="camera">{t('s fotkou')}</Chip>}
            {/* Vedení odsud vidí, podle čeho obsluha vyrábí — a jedním ťuknutím je v tom návodu. */}
            {uk.sourceMeta?.guideId && (
              <a href={`/employer/overview?view=guides&guide=${uk.sourceMeta.guideId}`} className="btn btn-ghost btn-sm -my-1">
                <Icon name="book" size={15} className="shrink-0" />
                <span className="truncate max-w-[12rem]">{uk.sourceMeta.guideTitle ?? t('Návod')}</span>
              </a>
            )}
          </div>
          {uk.checklist.length > 0 && (
            // Body checklistu smí odškrtnout jen ten, kdo smí splnit úkol (u checklistu platí na serveru stejné
            // `allowed` jako u stavu), jinak by optimistická změna skončila 403 a vrácením.
            <TaskChecklist items={uk.checklist} onToggle={smiSplnit(uk) ? i => toggleChecklistItem(uk, i) : undefined}
              onToggleAll={smiSplnit(uk) ? d => toggleChecklistAll(uk, d) : undefined} />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {smiUpravit(uk) && <Button variant="ghost" size="sm" iconOnly icon="pencil" aria-label={t('Upravit úkol {nazev}', { nazev: uk.title })} onClick={() => openEdit(uk)} />}
          {smiSmazat(uk) && <Button variant="ghost" size="sm" iconOnly icon="trash" className="hover:!text-[var(--bad-ink)]" aria-label={t('Smazat úkol {nazev}', { nazev: uk.title })} onClick={() => setMazani(uk)} />}
        </div>
      </li>
    );
  };

  const section = (title: string, list: Ukol[], tone = '') =>
    list.length > 0 && (
      <section className="space-y-2" aria-label={title}>
        <h2 className={`t-label ${tone}`}>{title} ({list.length.toLocaleString(loc)})</h2>
        <Card pad="none" className="px-5"><ul className="list">{list.map(renderRow)}</ul></Card>
      </section>
    );

  const idForm = useId();
  const fid = (k: string) => `${idForm}-${k}`;

  const nastroj = (
    <div className="space-y-6">
      {view === 'list' && !showForm && <RychlePridani dnes={today} onPridat={rychle} />}

      {/* Na telefonu je souhrn dne v podtitulku hlavičky (V11) — tady by byl další řádek nad prvním úkolem. */}
      {tasks.length > 0 && view !== 'prehled' && (
        <div className="max-md:hidden">
          <UkolySouhrn hotovo={hodnotyKarty.dnesHotovo} celkem={hodnotyKarty.dnesCelkem} poTerminu={hodnotyKarty.poTerminu}
            onPoTerminu={() => { setView('list'); setFiltr(f => ({ ...f, stav: 'po_terminu' })); }} />
        </div>
      )}

      {tasks.length > 0 && view !== 'prehled' && (
        <UkolyFiltry filtr={filtr} onChange={setFiltr} pocty={pocty} skrytStav={view !== 'list'} lide={lideFiltru} />
      )}

      {showForm && (
        <Card as="form" pad="lg" onSubmit={save} className="space-y-4" aria-labelledby={fid('nadpis')}>
          <h2 id={fid('nadpis')} className="t-section">{editingId ? t('Upravit úkol') : t('Nový úkol')}</h2>
          <DraftNote koncept={koncept} co="rozepsaný úkol" />{/* i18n-ok: druh konceptu je identifikátor, větu překládá DraftNote */}
          <Field id={fid('nazev')} label={t('Název úkolu')}>
            <Input id={fid('nazev')} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={t('Např. Umýt okna')} autoFocus maxLength={200} />
          </Field>
          <Field id={fid('popis')} label={t('Popis')} hint={t('Nepovinné.')}>
            <Textarea id={fid('popis')} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
          </Field>
          {vyberVic ? (
            // Kolo 7: jeden úkol víc lidem. „Kdokoli" je výlučná; lidi se zapínají a vypínají.
            // Do deseti lidí pás pilulek (na telefonu jede do strany uvnitř sebe), nad deset
            // zaškrtávací seznam s vlastním posuvem, ať pás neroste do nekonečna.
            <fieldset className="min-w-0">
              <legend className="field-label">{t('Kdo úkol udělá')}</legend>
              {members.length <= 10 ? (
                <div ref={pasLidi} onScroll={e => konecPasu(e.currentTarget)}
                  className="flex gap-1.5 overflow-x-auto overscroll-x-contain scrollbar-none scroll-fade-x -mx-1 px-1 py-2.5 -my-1.5 sm:flex-wrap sm:overflow-visible sm:[mask-image:none] sm:[-webkit-mask-image:none]">
                  <button type="button" aria-pressed={form.komu.length === 0} onClick={() => setForm(f => ({ ...f, komu: [] }))}
                    className={`filter-pill tap-target ${form.komu.length === 0 ? 'seg-on' : 'seg-off glass'}`}>{t('Kdokoli')}</button>
                  {members.map(m => {
                    const on = form.komu.includes(String(m.id));
                    return (
                      <button key={m.id} type="button" aria-pressed={on} onClick={() => prepniKomu(m.id)}
                        className={`filter-pill tap-target ${on ? 'seg-on' : 'seg-off glass'}`}>{m.name}</button>
                    );
                  })}
                </div>
              ) : (
                <ul className="list well px-3 max-h-[16.5rem] overflow-y-auto overscroll-contain" aria-label={t('Kdo úkol udělá')}>
                  {[{ id: null as number | null, name: t('Kdokoli') }, ...members].map(m => {
                    const on = m.id == null ? form.komu.length === 0 : form.komu.includes(String(m.id));
                    const prepni = () => (m.id == null ? setForm(f => ({ ...f, komu: [] })) : prepniKomu(m.id));
                    return (
                      // Řádek i zaškrtávátko přepínají totéž (vzor KopieZPodniku); klik na zaškrtávátko neprobublá.
                      <li key={m.id ?? 'kdokoli'} className="list-row cursor-pointer" onClick={e => { if ((e.target as HTMLElement).closest('button')) return; prepni(); }}>
                        <SelectBox checked={on} onChange={prepni} label={m.name} />
                        <span className="min-w-0 flex-1 truncate text-[15px] text-[#16181A]" aria-hidden>{m.name}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-1.5 text-xs text-black/50">
                {proKohokoli ? t('Úkol na daný den — splní ho kdokoli z týmu.')
                  : form.komu.length > 1 ? t('Každý dostane vlastní úkol ({n, plural, one {# člověk} few {# lidé} other {# lidí}}).', { n: form.komu.length })
                  : t('Úkol pro konkrétního člověka.')}
              </p>
            </fieldset>
          ) : (
            <Field id={fid('kdo')} label={t('Kdo úkol udělá')}
              hint={proKohokoli ? t('Úkol na daný den — splní ho kdokoli z týmu.') : t('Úkol pro konkrétního člověka.')}>
              <Select id={fid('kdo')} value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}>
                {/* Úkol pro kohokoli nebo pro kolegu zadá jen ten, kdo smí úkoly zadávat (jako POST /api/tasks). */}
                {zadava && <option value="">{t('Kdokoli (podle dne)')}</option>}
                {zadava ? members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)
                  : <option value={String(ja ?? '')}>{t('Já')}</option>}
              </Select>
            </Field>
          )}
          {/* Termín a čas jsou dvojice — sdílí řádek i na telefonu (DESIGN: Dvojice polí sdílí řádek). */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Field id={fid('termin')} label={editingSeries ? t('Termín (od kdy)') : t('Termín')}
              hint={editingSeries ? undefined : proKohokoli ? t('Povinné u úkolu pro kohokoli.') : t('Nepovinné.')}>
              <Input id={fid('termin')} type="date" value={form.dueDate}
                onChange={e => { const v = e.target.value; setForm(f => ({ ...f, dueDate: v, dueTime: v ? f.dueTime : '' })); }} />
            </Field>
            <Field id={fid('cas')} label={t('Do kdy (nepovinné)')} hint={form.dueDate ? undefined : t('Nejdřív vyber den.')}>
              <Input id={fid('cas')} type="time" value={form.dueTime} disabled={!form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueTime: e.target.value }))} />
            </Field>
          </div>
          {editingSeries && (
            <p className="note note-info text-sm">
              {sUzlem(t('Jde o opakovaný úkol. Název, popis a priorita se změní u všech výskytů. Změna termínu, opakování, přiřazení nebo kroků {tucne} — hotové a minulé zůstanou beze změny.', { tucne: VLOZ }), <strong>{t('přepíše všechny budoucí výskyty')}</strong>)}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0">
              <p className="field-label" id={fid('prio')}>{t('Priorita')}</p>
              <Segmented size="sm" ariaLabel={t('Priorita')} value={form.priority as typeof PRIORITIES[number]['id']}
                onChange={v => setForm(f => ({ ...f, priority: v }))} options={priority(t).map(p => ({ id: p.id, label: p.label }))} />
            </div>
            <Field id={fid('opak')} label={t('Opakování')}
              hint={form.recurrence ? t('Dopředu se připraví nejbližší výskyty; po splnění se neobnoví hned.') : undefined}>
              <Select id={fid('opak')} value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}>
                {moznostiOpakovani.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </div>
          {smiPovinny && (
            <ul className="list">
              <SwitchRow title={<span className="inline-flex items-center gap-1.5"><Icon name="lock" size={15} className="shrink-0 text-black/55" />{t('Vyžadovat před uzávěrkou')}</span>}
                hint={t('Dokud nebude hotový, uzávěrka dne zůstane zamčená. Počítá se jen výskyt na daný den a jen pro lidi na směně.')}
                checked={form.requireBeforeClosing} onChange={v => setForm(f => ({ ...f, requireBeforeClosing: v }))} />
              <SwitchRow title={<span className="inline-flex items-center gap-1.5"><Icon name="camera" size={15} className="shrink-0 text-black/55" />{t('Vyžadovat fotku při splnění')}</span>}
                hint={t('Úkol půjde odškrtnout až s fotkou z telefonu nebo tabletu — uvidíš ji v detailu úkolu.')}
                checked={form.requirePhoto} onChange={v => setForm(f => ({ ...f, requirePhoto: v }))} />
            </ul>
          )}

          <fieldset className="min-w-0">
            <legend className="field-label">{t('Kontrolní seznam')} <span className="text-black/45 font-normal">{t('— nepovinné')}</span></legend>
            <div className="space-y-2">
              {form.checklist.map((it, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input value={it.text} onChange={e => setChecklistLine(i, e.target.value)} aria-label={t('Bod {n}', { n: i + 1 })} placeholder={t('Bod {n}', { n: i + 1 })} maxLength={300} />
                  <Button variant="ghost" size="sm" iconOnly icon="plus" aria-label={t('Vložit bod za bod {n}', { n: i + 1 })} onClick={() => insertChecklistLine(i)} />
                  <Button variant="ghost" size="sm" iconOnly icon="minus" aria-label={t('Odebrat bod {n}', { n: i + 1 })} onClick={() => removeChecklistLine(i)} />
                </div>
              ))}
              <Button variant="secondary" size="sm" icon="plus" onClick={addChecklistLine}>{t('Přidat bod')}</Button>
            </div>
          </fieldset>

          {error && <p className="note note-danger text-sm" role="alert">{error}</p>}
          {castecne && <p className="note note-wait text-sm" role="alert">{castecne}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" loading={saving}>{editingId ? t('Uložit změny') : t('Vytvořit úkol')}</Button>
            <Button variant="secondary" onClick={closeForm}>{t('Zrušit')}</Button>
          </div>
        </Card>
      )}

      {akceChyba && <p className="note note-danger text-sm" role="alert">{akceChyba}</p>}

      {data.error && !data.data ? (
        <Card><ErrorState title={t('Úkoly se nenačetly')} onRetry={data.reload} detail={data.error} /></Card>
      ) : data.loading ? (
        <Card aria-busy className="space-y-2">
          <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10 w-2/3" />
        </Card>
      ) : view === 'prehled' ? (
        <UkolyPrehled ukoly={bezStavu} dnes={today} lidi onOtevri={uk => setDetailId(uk.id)} />
      ) : view === 'month' ? (
        <UkolyMesic ukoly={bezStavu} dnes={today} zacatekTydne={weekStart === 0 ? 0 : 1} radek={renderRow} onNovy={zadava ? d => openNew(d) : undefined} />
      ) : view === 'week' ? (
        <TaskWeekBoard tasks={forWho} weekStart={weekStart}
          onComplete={(uk, done) => { const u = tasks.find(x => x.id === uk.id); if (u) completeTask(u, done); }}
          canComplete={uk => { const u = tasks.find(x => x.id === uk.id); return !!u && smiSplnit(u); }}
          labelFor={uk => { const u = tasks.find(x => x.id === uk.id); return u ? labelFor(u) : ''; }}
          onOpen={uk => { const u = tasks.find(x => x.id === uk.id); if (u) openEdit(u); }}
          onMove={(uk, date) => { const u = tasks.find(x => x.id === uk.id); if (u) void moveTask(u, date); }}
          canMove={uk => { const u = tasks.find(x => x.id === uk.id); return !!u && smiUpravit(u); }}
          onAddForDay={d => openNew(d)} />
      ) : tasks.length === 0 ? (
        <Card>
          <EmptyState illustration="ukoly" title={t('Zatím žádné úkoly')}
            hint={t('Zadej, co se má udělat a kdy — jednorázově nebo každý den. Tým to uvidí v přehledu i na tabletu.')}
            action={<Button variant="secondary" icon="plus" onClick={() => openNew()}>{t('Nový úkol')}</Button>} />
        </Card>
      ) : forWho.length === 0 ? (
        <Card><EmptyState compact icon="check" title={t('Tady nic není')} hint={t('Zruš filtr a uvidíš úkoly všech.')}
          action={<Button variant="secondary" size="sm" onClick={() => setFiltr(VYCHOZI_FILTR)}>{t('Zobrazit všechny')}</Button>} /></Card>
      ) : plochySeznam ? (
        vSeznamu.length === 0
          ? <Card><EmptyState compact icon="search" title={t('Nic nevyhovuje filtrům')} hint={t('Zkus jiný stav, hledání nebo zruš filtry.')}
              action={<Button variant="secondary" size="sm" onClick={() => setFiltr({ ...VYCHOZI_FILTR, kdo: filtr.kdo })}>{t('Zrušit filtry')}</Button>} /></Card>
          : <Card pad="none" className="px-5"><ul className="list" aria-label={t('Úkoly')}>{vSeznamu.map(renderRow)}</ul></Card>
      ) : (
        <div className="space-y-6">
          {section(t('Po termínu'), skupiny.poTerminu, 'text-bad-ink')}
          {section(t('Dnes'), skupiny.dnes)}
          {section(t('Tento týden'), skupiny.tentoTyden)}
          {skupiny.pozdeji.length > 0 && (
            showLater ? section(t('Později'), skupiny.pozdeji) : (
              <Button variant="ghost" size="sm" iconAfter="chevron" onClick={() => setShowLater(true)}>
                {t('Zobrazit další úkoly ({n})', { n: skupiny.pozdeji.length.toLocaleString(loc) })}
              </Button>
            )
          )}
          {section(t('Hotové'), skupiny.hotove)}
        </div>
      )}
    </div>
  );

  const nehotovych = tasks.filter(uk => uk.status !== 'done' && (!uk.dueDate || uk.dueDate <= today)).length;
  const podtitul = data.data && nehotovych > 0 ? t('Na dnešek a po termínu: {n, plural, one {# úkol} few {# úkoly} other {# úkolů}}.', { n: nehotovych }) : t('Úkoly na den nebo pro konkrétní lidi — a jejich plnění.');
  // Telefon (V11): souhrn dne „Dnes 2 z 5 hotovo · 1 po termínu" je podtitulek — nad prvním úkolem tak
  // zůstane jen rychlé přidání, filtry a pás stavů. Na monitoru zůstává řádek s pruhem v nástroji.
  const souhrnDne = [
    hodnotyKarty.dnesCelkem > 0 ? t('Dnes {hotovo} z {celkem} hotovo', { hotovo: hodnotyKarty.dnesHotovo, celkem: hodnotyKarty.dnesCelkem }) : null,
    hodnotyKarty.poTerminu > 0 ? t('{n} po termínu', { n: hodnotyKarty.poTerminu }) : null,
  ].filter(Boolean).join(' · ');
  const novyUkol = () => (showForm && !editingId ? closeForm() : openNew());
  return (
    <>
      <PlochaWidgetu
        stranka="vedeni.ukoly"
        hlavicka={{
          title: t('Úkoly'),
          subtitle: data.data && tasks.length > 0 && view !== 'prehled' && souhrnDne
            ? <><span className="md:hidden">{souhrnDne}</span><span className="max-md:hidden">{podtitul}</span></>
            : podtitul,
          hintId: 'taskmanager',
          primary: <Button variant="accent" icon="plus" onClick={novyUkol}>{t('Nový úkol')}</Button>,
          // Na telefonu jedna cesta k přidání: rychlé pole „Přidat úkol…" nad seznamem. Plný formulář je
          // v „···" — hlavička bez limetky se složí do jednoho řádku a první úkol vyjede o 68 px výš.
          primaryTelefon: null,
          menuTelefon: [{ label: t('Nový úkol'), icon: 'plus', onClick: novyUkol }],
          aside: <Segmented size="sm" ariaLabel={t('Zobrazení')} value={view} onChange={setView}
            options={[{ id: 'list', label: t('Seznam') }, { id: 'week', label: t('Týden') }, { id: 'month', label: t('Měsíc') }, { id: 'prehled', label: t('Přehled') }]} />,
        }}
        nastroj={nastroj}
      />
      {detail && (
        <UkolDetail ukol={detail} dnes={today} onClose={() => setDetailId(null)}
          kdo={detail.assignedTo != null ? <PersonLink id={detail.assignedTo}>{detail.assigneeName ?? memberById.get(detail.assignedTo)?.name ?? t('Neznámý')}</PersonLink> : t('Kdokoli')}
          navodHref={detail.sourceMeta?.guideId ? `/employer/overview?view=guides&guide=${detail.sourceMeta.guideId}` : undefined}
          zamceno={!smiSplnit(detail)}
          onSplnit={done => { if (done && ((detail.dueDate && detail.dueDate !== today) || chceFotku(detail))) setDetailId(null); completeTask(detail, done); }}
          onStav={smiSplnit(detail) ? s => void setStatus(detail, s) : undefined}
          onUpravit={smiUpravit(detail) ? () => { setDetailId(null); openEdit(detail); } : undefined}
          onSmazat={smiSmazat(detail) ? () => { setDetailId(null); setMazani(detail); } : undefined}
          onOdlozit={smiUpravit(detail) ? den => { setDetailId(null); void moveTask(detail, den); setZprava(t('Úkol je odložený na {den}.', { den: denKratce(den, loc) })); } : undefined}
          onChecklist={smiSplnit(detail) ? i => toggleChecklistItem(detail, i) : undefined}
          onChecklistVse={smiSplnit(detail) ? d => toggleChecklistAll(detail, d) : undefined} />
      )}
      {mazani && (
        <Modal open onClose={() => setMazani(null)} size="sm" title={mazani.seriesId ? t('Smazat opakovaný úkol?') : t('Smazat úkol?')}
          footer={<>
            <Button variant="secondary" onClick={() => setMazani(null)}>{t('Zrušit')}</Button>
            <Button variant="danger-solid" loading={mazu} onClick={remove}>{t('Smazat')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">
            {mazani.seriesId ? t('„{nazev}" se smaže i se všemi nadcházejícími výskyty.', { nazev: mazani.title }) : t('„{nazev}" zmizí ze seznamu i z přehledu týmu.', { nazev: mazani.title })}
          </p>
        </Modal>
      )}
      {mimoDen && (
        <Modal open onClose={() => setMimoDen(null)} size="sm" title={t('Tohle není dnešní úkol')}
          footer={<>
            <Button variant="secondary" onClick={() => setMimoDen(null)}>{t('Zrušit')}</Button>
            <Button variant="primary" icon="check" onClick={() => { const uk = mimoDen; setMimoDen(null); if (chceFotku(uk)) setFotoUkol(uk); else void setStatus(uk, 'done'); }}>{t('Označit jako hotové')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty"><span className="cz-sentence">{t('„{nazev}" má termín {den}.', { nazev: mimoDen.title, den: denDlouze(mimoDen.dueDate!, loc) })}</span> {t('Opravdu ho označit jako hotový už teď?')}</p>
        </Modal>
      )}
      {fotoUkol && <PrilozFoto nazev={fotoUkol.title} onClose={() => setFotoUkol(null)} onHotovo={url => splnitSFotkou(fotoUkol, url)} />}
      <Toast message={zprava} onClose={() => setZprava(null)} />
      <Toast message={hotovyUkol ? t('Úkol je hotový.') : null} id={hotovyUkol?.id} onClose={() => setHotovyUkol(null)}
        action={hotovyUkol ? { label: t('Vrátit'), onClick: () => { const u = hotovyUkol.uk; setHotovyUkol(null); void setStatus(u, stavPoOdskrtnuti(false, u.status)); } } : undefined} />
    </>
  );
}
