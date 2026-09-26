'use client';

// Nápady: podněty týmu na vylepšení, hlasování a posun od „Nový" po „Hotovo".
//
// Kolo 69 (balík B6a): stránka je plocha s widgety — u vedení (vedeni.napady)
// i u zaměstnance (zamestnanec.napady); tatáž komponenta pozná stránku podle
// adresy. Hlavička jde do PlochaWidgetu, tahle komponenta kreslí nástroj:
// filtr, řazení a seznam. Data čte přes useDataWidgetu z téže adresy jako
// widgety Nové podněty a Nejžádanější nápady, takže hlas daný nahoře se hned
// ukáže i v seznamu a stránka se ptá jednou.
//
// Z auditu (final_sorted, obsah-kontrola): Nový podnět byl ručně psané okno vedle
// <Modal> o pár řádků níž → obě okna jsou Modal s popisky polí; stav ručně míchaným
// štítkem s hex barvami → Chip; posun podnětu ručními pilulkami → Segmented; akce
// holým textem „→ Do plánování" → Menu s ikonami; mazání přes confirm() → okno;
// náhradní emoji 👤 → Avatar; na telefonu se pás filtrů ořízl vedle řazení → řazení
// je samostatné Menu vedle pásu, pás se posouvá sám.

import { useId, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, Menu, Modal, Segmented, Skeleton, Textarea, Toast, type ChipTone, type MenuItem,
} from './ui';
import { PlochaWidgetu } from './widgety/PlochaWidgetu';
import { useDataWidgetu, obnovDataWidgetu } from './widgety/useDataWidgetu';
import { useSmi } from './widgety/NavigaceKontext';
import { URL_NAPADY, Hlas } from './widgety/oblasti/napady';
import { apiMessage, okJson } from '@/lib/api';
import { czCount, type CzNoun } from '@/lib/czech';
import { vyberPodnety, prepniHlas, type DataPodnetu, type Podnet } from '@/lib/ukolyPrehled';

const PODNET: CzNoun = { one: 'podnět', few: 'podněty', many: 'podnětů' };
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

// Stavy v pořadí, jak vedení podnět posouvá. Tón je stav (DP §2.1): nový čeká,
// naplánovaný je informace, hotový v pořádku, zamítnutý tlumený.
const STATUS_META: Record<string, { label: string; tone: ChipTone }> = {
  new: { label: 'Nový', tone: 'wait' },
  planned: { label: 'Naplánováno', tone: 'info' },
  done: { label: 'Hotovo', tone: 'ok' },
  declined: { label: 'Zamítnuto', tone: 'muted' },
};
const STATUS_FLOW = [
  { id: 'new', label: 'Nový' },
  { id: 'planned', label: 'Naplánovat' },
  { id: 'done', label: 'Hotovo' },
  { id: 'declined', label: 'Zamítnout' },
] as const;
type IdStavu = typeof STATUS_FLOW[number]['id'];

const FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'Vše' },
  { id: 'new', label: 'Nové' },
  { id: 'planned', label: 'Naplánované' },
  { id: 'done', label: 'Hotové' },
  { id: 'declined', label: 'Zamítnuté' },
];

const relDate = (iso: string) => {
  const d = new Date(iso);
  // Chybějící nebo poškozené datum se nesmí ukázat jako „Invalid Date" —
  // radši nic než hláška z prohlížeče.
  if (!iso || Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const day = 86400000;
  if (diff < day && d.getDate() === new Date().getDate()) return 'dnes';
  if (diff < 2 * day) return 'včera';
  if (diff < 7 * day) return `před ${Math.floor(diff / day)} dny`;
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' });
};

export default function SuggestionsBoard() {
  const zamestnanec = (usePathname() ?? '').startsWith('/employee');
  const smi = useSmi();
  const data = useDataWidgetu<DataPodnetu>(URL_NAPADY, vyberPodnety);
  const items = data.data?.podnety ?? [];
  const spravuje = !!data.data?.spravuje;
  const meId = data.data?.meId ?? null;
  const pridava = smi('napady.pridat');
  const doPlanovani = spravuje && smi('planovani.upravit');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<'new' | 'votes'>('new');
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [akceChyba, setAkceChyba] = useState<string | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);
  // Autor upravuje svůj podnět; mazání přes okno (dřív confirm()).
  const [editing, setEditing] = useState<Podnet | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [mazani, setMazani] = useState<Podnet | null>(null);
  const [mazu, setMazu] = useState(false);
  const id = useId();

  const zmen = (f: (list: Podnet[]) => Podnet[]) => data.set(prev => (prev ? { ...prev, podnety: f(prev.podnety) } : prev!));

  const submit = async () => {
    setErr('');
    if (!title.trim()) { setErr('Napiš krátký název podnětu.'); return; }
    setSubmitting(true);
    try {
      await fetch(URL_NAPADY, { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify({ title: title.trim(), content: content.trim() }) }).then(okJson);
      setTitle(''); setContent(''); setComposing(false);
      data.reload();
      setZprava(zamestnanec ? 'Podnět je odeslaný — vedení ho uvidí.' : 'Podnět je přidaný.');
    } catch (e) { setErr(apiMessage(e, 'Podnět se nepodařilo odeslat.')); }
    setSubmitting(false);
  };

  const toggleVote = async (s: Podnet) => {
    setAkceChyba(null);
    zmen(list => prepniHlas(list, s.id));
    try {
      await fetch(`${URL_NAPADY}/${s.id}`, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ toggleVote: true }) }).then(okJson);
      data.reload();
    } catch (e) {
      zmen(list => prepniHlas(list, s.id));
      setAkceChyba(apiMessage(e, 'Hlas se nepodařilo uložit.'));
    }
  };

  const setStatus = async (s: Podnet, status: string) => {
    if (s.status === status) return;
    setAkceChyba(null);
    zmen(list => list.map(x => (x.id === s.id ? { ...x, status } : x)));
    try {
      await fetch(`${URL_NAPADY}/${s.id}`, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ status }) }).then(okJson);
      data.reload();
    } catch (e) {
      zmen(list => list.map(x => (x.id === s.id ? { ...x, status: s.status } : x)));
      setAkceChyba(apiMessage(e, 'Stav se nepodařilo změnit.'));
    }
  };

  const sendToPlanning = async (s: Podnet) => {
    setAkceChyba(null);
    try {
      await fetch(`${URL_NAPADY}/${s.id}`, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ toPlanning: true }) }).then(okJson);
      data.reload();
      obnovDataWidgetu('/api/planning');
      setZprava(`„${s.title}" je na tabuli v Plánování.`);
    } catch (e) { setAkceChyba(apiMessage(e, 'Do plánování se to nepodařilo přesunout.')); }
  };

  const saveEdit = async () => {
    if (!editing || !editTitle.trim()) return;
    setSavingEdit(true);
    try {
      await fetch(`${URL_NAPADY}/${editing.id}`, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ title: editTitle.trim(), content: editContent.trim() }) }).then(okJson);
      setEditing(null);
      data.reload();
    } catch (e) { setAkceChyba(apiMessage(e, 'Úpravu se nepodařilo uložit.')); setEditing(null); }
    setSavingEdit(false);
  };

  const remove = async () => {
    const s = mazani;
    if (!s) return;
    setMazu(true);
    try {
      await fetch(`${URL_NAPADY}/${s.id}`, { method: 'DELETE' }).then(okJson);
      zmen(list => list.filter(x => x.id !== s.id));
      data.reload();
      setZprava('Podnět je smazaný.');
    } catch (e) { setAkceChyba(apiMessage(e, 'Podnět se nepodařilo smazat.')); }
    setMazani(null);
    setMazu(false);
  };

  const counts = items.reduce((a, s) => { a[s.status] = (a[s.status] ?? 0) + 1; return a; }, {} as Record<string, number>);
  const base = filter === 'all' ? items : items.filter(s => s.status === filter);
  // Hlasy jsou na kartě to největší číslo a hlavní obsah celé nástěnky —
  // a přesto se podle nich dřív nedalo řadit. Pořadí ze serveru je podle stavu a data.
  const shown = sort === 'votes' ? [...base].sort((a, b) => b.votes - a.votes) : base;

  const akce = (s: Podnet): MenuItem[] => {
    const mine = meId != null && s.authorId === meId;
    return [
      ...(doPlanovani && s.status !== 'planned' && s.status !== 'done'
        ? [{ label: 'Do plánování', icon: 'kanban', hint: 'Založí kartu na tabuli a označí podnět jako naplánovaný.', onClick: () => void sendToPlanning(s) }] : []),
      ...(mine ? [{ label: 'Upravit', icon: 'pencil', onClick: () => { setEditing(s); setEditTitle(s.title); setEditContent(s.content ?? ''); } }] : []),
      ...(spravuje || mine ? [{ label: 'Smazat podnět…', icon: 'trash', danger: true, onClick: () => setMazani(s) }] : []),
    ];
  };

  const nastroj = (
    <div className="space-y-4">
      {items.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin scroll-fade-x -mx-1 px-1 py-0.5 min-w-0 flex-1" role="group" aria-label="Filtr podle stavu">
            {FILTERS.map(f => {
              const cnt = f.id === 'all' ? items.length : (counts[f.id] ?? 0);
              return (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
                  className={`filter-pill tap-target-sm shrink-0 ${filter === f.id ? 'seg-on' : 'seg-off glass'}`}>
                  {f.label}{cnt > 0 && <span className={filter === f.id ? 'text-white/60' : 'text-black/45'}> · {cnt}</span>}
                </button>
              );
            })}
          </div>
          {items.length > 2 && (
            <Menu size="sm" icon="swap" label={`Řazení: ${sort === 'votes' ? 'nejvíc hlasů' : 'od nejnovějších'}`} className="shrink-0" items={[
              { label: 'Od nejnovějších', icon: sort === 'new' ? 'check' : 'clock', onClick: () => setSort('new') },
              { label: 'Nejvíc hlasů', icon: sort === 'votes' ? 'check' : 'trend', onClick: () => setSort('votes') },
            ]} />
          )}
        </div>
      )}

      {akceChyba && <p className="note note-danger text-sm" role="alert">{akceChyba}</p>}

      {data.error && !data.data ? (
        <Card><ErrorState title="Nápady se nenačetly" onRetry={data.reload} detail={data.error} /></Card>
      ) : data.loading ? (
        <Card aria-busy className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14 w-2/3" /></Card>
      ) : shown.length === 0 ? (
        <Card>
          {items.length === 0
            ? <EmptyState illustration="napady" title="Zatím žádný nápad" hint="Cokoli, co by v podniku šlo líp — nová položka do nabídky, jiný postup, oprava. Kdo napíše první, začíná."
              action={pridava ? <Button variant="secondary" icon="plus" onClick={() => { setComposing(true); setErr(''); }}>Přidat podnět</Button> : undefined} />
            : <EmptyState compact icon="bulb" title="V této kategorii nic není" />}
        </Card>
      ) : (
        <Card pad="none" className="px-5">
          <ul className="list">
            {shown.map(s => {
              const meta = STATUS_META[s.status] ?? STATUS_META.new;
              const mine = meId != null && s.authorId === meId;
              const polozky = akce(s);
              return (
                <li key={s.id} className="list-row items-start">
                  <Hlas podnet={s} onClick={() => void toggleVote(s)} zamceno={!pridava} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="t-card min-w-0 break-words">{s.title}</h3>
                      <Chip tone={meta.tone} size="sm" className="shrink-0">{meta.label}</Chip>
                    </div>
                    {s.content && <p className="text-sm text-black/60 mt-1 whitespace-pre-wrap break-words text-pretty">{s.content}</p>}
                    <p className="flex items-center gap-1.5 mt-2 text-[13px] text-black/55 min-w-0">
                      <Avatar emoji={s.authorAvatar} size="xs" ring={false} />
                      <span className="truncate min-w-0">{s.authorName ?? 'Neznámý'}{mine ? ' (ty)' : ''}</span>
                      {relDate(s.createdAt) && <><span aria-hidden className="text-black/40">·</span><span className="whitespace-nowrap">{relDate(s.createdAt)}</span></>}
                    </p>
                    {/* Posun podnětu — jen kdo podněty spravuje (server to tak pustí). */}
                    {spravuje && (
                      <div className="mt-3">
                        <Segmented size="sm" ariaLabel={`Stav podnětu ${s.title}`} value={(STATUS_FLOW.some(x => x.id === s.status) ? s.status : 'new') as IdStavu}
                          onChange={v => void setStatus(s, v)} options={STATUS_FLOW.map(x => ({ id: x.id, label: x.label }))} />
                      </div>
                    )}
                  </div>
                  {polozky.length > 0 && <Menu size="sm" label={`Další akce: ${s.title}`} items={polozky} className="shrink-0 -my-1" />}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );

  const novych = counts.new ?? 0;
  return (
    <>
      <PlochaWidgetu
        stranka={zamestnanec ? 'zamestnanec.napady' : 'vedeni.napady'}
        hlavicka={{
          title: 'Nápady',
          subtitle: spravuje
            ? (novych > 0 ? `Na posouzení čeká ${czCount(novych, PODNET)}. Přidej se hlasem nebo posuň nápad dál.` : 'Podněty od týmu — co by lidem usnadnilo práci. Přidej se hlasem nebo posuň nápad dál.')
            : 'Máš nápad, co by šlo zlepšit? Přidej podnět a vedení ho uvidí. Hlasem podpoříš nápady ostatních.',
          hintId: 'suggestionsboard',
          primary: pridava ? <Button onClick={() => { setComposing(true); setErr(''); }} variant="accent" icon="plus">Přidat podnět</Button> : undefined,
        }}
        nastroj={nastroj}
      />

      {composing && (
        <Modal open onClose={() => setComposing(false)} size="md" title="Nový podnět"
          subtitle={zamestnanec ? 'Uvidí ho vedení a kolegové můžou hlasovat.' : undefined}
          footer={<>
            <Button variant="secondary" onClick={() => setComposing(false)}>Zrušit</Button>
            <Button variant="primary" iconAfter="send" loading={submitting} onClick={submit}>Odeslat podnět</Button>
          </>}>
          <div className="space-y-3">
            {err && <p className="note note-danger text-sm" role="alert">{err}</p>}
            <Field id={`${id}-nazev`} label="Co navrhuješ?">
              <Input id={`${id}-nazev`} value={title} onChange={e => setTitle(e.target.value)} maxLength={160} autoFocus placeholder="Např. Přidat druhý mlýnek na kávu" />
            </Field>
            <Field id={`${id}-popis`} label="Vysvětli to blíž" hint="Nepovinné — proč to pomůže, jak by to mělo fungovat.">
              <Textarea id={`${id}-popis`} value={content} onChange={e => setContent(e.target.value)} rows={4} maxLength={2000} />
            </Field>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title="Upravit podnět" size="sm"
          footer={<>
            <Button variant="secondary" onClick={() => setEditing(null)}>Zrušit</Button>
            <Button variant="primary" icon="check" loading={savingEdit} disabled={!editTitle.trim()} onClick={saveEdit}>Uložit</Button>
          </>}>
          <div className="space-y-3">
            <Field id={`${id}-e-nazev`} label="Název">
              <Input id={`${id}-e-nazev`} value={editTitle} onChange={e => setEditTitle(e.target.value)} maxLength={200} autoFocus />
            </Field>
            <Field id={`${id}-e-popis`} label="Popis" hint="Nepovinné.">
              <Textarea id={`${id}-e-popis`} value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} maxLength={2000} />
            </Field>
          </div>
        </Modal>
      )}
      {mazani && (
        <Modal open onClose={() => setMazani(null)} title="Smazat podnět?" size="sm"
          footer={<>
            <Button variant="secondary" onClick={() => setMazani(null)}>Zrušit</Button>
            <Button variant="danger-solid" loading={mazu} onClick={remove}>Smazat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">„{mazani.title}" zmizí i s hlasy. Vrátit to nepůjde.</p>
        </Modal>
      )}
      <Toast message={zprava} onClose={() => setZprava(null)} />
    </>
  );
}
