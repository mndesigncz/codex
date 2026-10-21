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

import { useEffect, useId, useState } from 'react';
import { cerstvePredaniPohledu, stavZPredani, udalostPredani } from '@/lib/predaniPohledu';
import { usePathname } from 'next/navigation';
import {
  Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, Menu, Modal, Segmented, Skeleton, Textarea, Toast, type ChipTone, type MenuItem,
} from './ui';
import NahlasitOkno from './moderace/NahlasitOkno';
import { Poznamky } from './Poznamky';
import { MAX_DELKA_DUVODU, urlPoctuPoznamek, urlPoznamek, vyberPoctyPoznamek } from '@/lib/poznamky';
import { PlochaWidgetu } from './widgety/PlochaWidgetu';
import { useDataWidgetu, obnovDataWidgetu } from './widgety/useDataWidgetu';
import { useSmi } from './widgety/NavigaceKontext';
import { URL_NAPADY, Hlas } from './widgety/oblasti/napady';
import { apiMessage, okJson } from '@/lib/api';
import { vyberPodnety, prepniHlas, type DataPodnetu, type Podnet } from '@/lib/ukolyPrehled';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { useLocale } from './employer/jazyk';


const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

// Stavy v pořadí, jak vedení podnět posouvá. Tón je stav (DP §2.1): nový čeká,
// naplánovaný je informace, hotový v pořádku, zamítnutý tlumený.
const statusMeta = (t: PrekladFn): Record<string, { label: string; tone: ChipTone }> => ({
  new: { label: t('Nový'), tone: 'wait' },
  planned: { label: t('Naplánováno'), tone: 'info' },
  done: { label: t('Hotovo'), tone: 'ok' },
  declined: { label: t('Zamítnuto'), tone: 'muted' },
});
type IdStavu = 'new' | 'planned' | 'done' | 'declined';
const statusFlow = (t: PrekladFn): { id: IdStavu; label: string }[] => [
  { id: 'new', label: t('Nový') },
  { id: 'planned', label: t('Naplánovat') },
  { id: 'done', label: t('Hotovo') },
  { id: 'declined', label: t('Zamítnout') },
];

const STAVY_FILTRU = ['new', 'planned', 'done', 'declined'] as const;

const filtry = (t: PrekladFn): { id: string; label: string }[] => [
  { id: 'all', label: t('Vše') },
  { id: 'new', label: t('Nové') },
  { id: 'planned', label: t('Naplánované') },
  { id: 'done', label: t('Hotové') },
  { id: 'declined', label: t('Zamítnuté') },
];

const relDate = (iso: string, t: PrekladFn, loc: string) => {
  const d = new Date(iso);
  // Chybějící nebo poškozené datum se nesmí ukázat jako „Invalid Date" —
  // radši nic než hláška z prohlížeče.
  if (!iso || Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const day = 86400000;
  if (diff < day && d.getDate() === new Date().getDate()) return t('dnes');
  if (diff < 2 * day) return t('včera');
  if (diff < 7 * day) return t('před {n} dny', { n: Math.floor(diff / day) });
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'long' });
};

export default function SuggestionsBoard() {
  const t = useT('sprava');
  const loc = useLocale();
  const zamestnanec = (usePathname() ?? '').startsWith('/employee');
  const smi = useSmi();
  const data = useDataWidgetu<DataPodnetu>(URL_NAPADY, vyberPodnety);
  const items = data.data?.podnety ?? [];
  const spravuje = !!data.data?.spravuje;
  const meId = data.data?.meId ?? null;
  const pridava = smi('napady.pridat');
  const doPlanovani = spravuje && smi('planovani.upravit');
  // Filtr z widgetu („Nové nápady" → stav:new): čte se při připojení i za běhu, viz lib/predaniPohledu.ts.
  const [filter, setFilter] = useState(() => stavZPredani(cerstvePredaniPohledu('suggestions'), STAVY_FILTRU) ?? 'all');
  useEffect(() => {
    const naPredani = (e: Event) => { const f = stavZPredani((e as CustomEvent).detail, STAVY_FILTRU); if (f) setFilter(f); };
    window.addEventListener(udalostPredani('suggestions'), naPredani);
    return () => window.removeEventListener(udalostPredani('suggestions'), naPredani);
  }, []);
  const [sort, setSort] = useState<'new' | 'votes'>('new');
  // Telefon: pás stavů je za tlačítkem „Filtry · N" (vzor Rozvrhu z kola 5) — vodorovně
  // odjížděl za okraj. Zapnutý filtr ho nechá vidět, ať jde zrušit druhým klepnutím.
  const [filtryTel, setFiltryTel] = useState(false);
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
  // Moderace (Apple 1.2): cizí podnět jde nahlásit vedení.
  const [nahlasit, setNahlasit] = useState<number | null>(null);
  const [mazu, setMazu] = useState(false);
  // Zamítnutí s důvodem (kolo 7): Segmented na „Zamítnout" otevře okno místo okamžitého
  // PATCH; důvod jde v témže požadavku, server ho uloží jako poznámku a pošle autorovi.
  const [zamitani, setZamitani] = useState<Podnet | null>(null);
  const [duvod, setDuvod] = useState('');
  const [zamitam, setZamitam] = useState(false);
  const [chybaZamitnuti, setChybaZamitnuti] = useState<string | null>(null);
  // Poznámky pod podnětem: sbalené, počty pro všechny řádky jedním dotazem.
  const [otevrenePoznamky, setOtevrenePoznamky] = useState<ReadonlySet<number>>(() => new Set());
  const urlPoctu = urlPoctuPoznamek('suggestion', items.map(x => x.id));
  const pocty = useDataWidgetu<Record<number, number>>(urlPoctu, vyberPoctyPoznamek);
  const id = useId();

  const zmen = (f: (list: Podnet[]) => Podnet[]) => data.set(prev => (prev ? { ...prev, podnety: f(prev.podnety) } : prev!));

  const submit = async () => {
    setErr('');
    if (!title.trim()) { setErr(t('Napiš krátký název podnětu.')); return; }
    setSubmitting(true);
    try {
      await fetch(URL_NAPADY, { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify({ title: title.trim(), content: content.trim() }) }).then(okJson);
      setTitle(''); setContent(''); setComposing(false);
      data.reload();
      setZprava(zamestnanec ? t('Podnět je odeslaný — vedení ho uvidí.') : t('Podnět je přidaný.'));
    } catch (e) { setErr(apiMessage(e, t('Podnět se nepodařilo odeslat.'))); }
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
      setAkceChyba(apiMessage(e, t('Hlas se nepodařilo uložit.')));
    }
  };

  const setStatus = async (s: Podnet, status: string) => {
    if (s.status === status) return;
    if (status === 'declined') { setZamitani(s); setDuvod(''); setChybaZamitnuti(null); return; }
    setAkceChyba(null);
    zmen(list => list.map(x => (x.id === s.id ? { ...x, status } : x)));
    try {
      await fetch(`${URL_NAPADY}/${s.id}`, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ status }) }).then(okJson);
      data.reload();
    } catch (e) {
      zmen(list => list.map(x => (x.id === s.id ? { ...x, status: s.status } : x)));
      setAkceChyba(apiMessage(e, t('Stav se nepodařilo změnit.')));
    }
  };

  const zamitnout = async () => {
    const s = zamitani;
    if (!s || zamitam) return;
    const reason = duvod.trim();
    setZamitam(true);
    setChybaZamitnuti(null);
    try {
      await fetch(`${URL_NAPADY}/${s.id}`, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ status: 'declined', ...(reason ? { reason } : {}) }) }).then(okJson);
      zmen(list => list.map(x => (x.id === s.id ? { ...x, status: 'declined' } : x)));
      setZamitani(null);
      setDuvod('');
      data.reload();
      if (reason) {
        if (urlPoctu) obnovDataWidgetu(urlPoctu);
        obnovDataWidgetu(urlPoznamek('suggestion', s.id));
      }
      setZprava(reason ? t('Podnět je zamítnutý, důvod dostal autor.') : t('Podnět je zamítnutý.'));
    } catch (e) {
      // Okno zůstane otevřené i s napsaným důvodem — nic se neztratí.
      setChybaZamitnuti(apiMessage(e, t('Stav se nepodařilo změnit.')));
    } finally {
      setZamitam(false);
    }
  };

  const prepniPoznamky = (sid: number) => {
    setOtevrenePoznamky(prev => {
      const dalsi = new Set(prev);
      if (dalsi.has(sid)) {
        dalsi.delete(sid);
        // Po sbalení se počet v tlačítku srovná s tím, co se mezitím napsalo.
        if (urlPoctu) obnovDataWidgetu(urlPoctu);
      } else dalsi.add(sid);
      return dalsi;
    });
  };

  const sendToPlanning = async (s: Podnet) => {
    setAkceChyba(null);
    try {
      await fetch(`${URL_NAPADY}/${s.id}`, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ toPlanning: true }) }).then(okJson);
      data.reload();
      obnovDataWidgetu('/api/planning');
      setZprava(t('„{nazev}" je na tabuli v Plánování.', { nazev: s.title }));
    } catch (e) { setAkceChyba(apiMessage(e, t('Do plánování se to nepodařilo přesunout.'))); }
  };

  const saveEdit = async () => {
    if (!editing || !editTitle.trim()) return;
    setSavingEdit(true);
    try {
      await fetch(`${URL_NAPADY}/${editing.id}`, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ title: editTitle.trim(), content: editContent.trim() }) }).then(okJson);
      setEditing(null);
      data.reload();
    } catch (e) { setAkceChyba(apiMessage(e, t('Úpravu se nepodařilo uložit.'))); setEditing(null); }
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
      setZprava(t('Podnět je smazaný.'));
    } catch (e) { setAkceChyba(apiMessage(e, t('Podnět se nepodařilo smazat.'))); }
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
        ? [{ label: t('Do plánování'), icon: 'kanban', hint: t('Založí kartu na tabuli a označí podnět jako naplánovaný.'), onClick: () => void sendToPlanning(s) }] : []),
      ...(!mine ? [{ label: t('Nahlásit podnět'), icon: 'warning', onClick: () => setNahlasit(s.id) }] : []),
      ...(mine ? [{ label: t('Upravit'), icon: 'pencil', onClick: () => { setEditing(s); setEditTitle(s.title); setEditContent(s.content ?? ''); } }] : []),
      ...(spravuje || mine ? [{ label: t('Smazat podnět…'), icon: 'trash', danger: true, onClick: () => setMazani(s) }] : []),
    ];
  };

  const pocetFiltru = filter !== 'all' ? 1 : 0;
  const ukazPas = filtryTel || pocetFiltru > 0;
  const nastroj = (
    <div className="space-y-4">
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {/* v4 (P2, P10): na telefonu „Filtry" pružný díl řady (s řazením na pravé hraně), ne osamělé vlevo;
              toolbar stránky je jedna řada 44 (dřív 36). */}
          <div className="sm:hidden flex-1 min-w-0">
            <Button variant="secondary" className="w-full" aria-expanded={ukazPas} aria-controls={`${id}-pas`} onClick={() => setFiltryTel(v => !v)}>
              {pocetFiltru > 0 ? t('Filtry · {n}', { n: pocetFiltru }) : t('Filtry')}
            </Button>
          </div>
          <div id={`${id}-pas`} className={`flex gap-1.5 overflow-x-auto scrollbar-thin scroll-fade-x -mx-1 px-1 py-0.5 min-w-0 flex-1 ${ukazPas ? 'max-sm:order-last max-sm:basis-full' : 'max-sm:hidden'}`}
            role="group" aria-label={t('Filtr podle stavu')}>
            {filtry(t).map(f => {
              const cnt = f.id === 'all' ? items.length : (counts[f.id] ?? 0);
              return (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(filter === f.id && f.id !== 'all' ? 'all' : f.id)}
                  className={`filter-pill tap-target-sm shrink-0 ${filter === f.id ? 'seg-on' : 'seg-off glass'}`}>
                  {f.label}{cnt > 0 && <span className={filter === f.id ? 'text-white/60' : 'text-black/45'}> · {cnt}</span>}
                </button>
              );
            })}
          </div>
          {items.length > 2 && (
            <Menu size="lg" icon="swap" label={t('Řazení: {druh}', { druh: sort === 'votes' ? t('nejvíc hlasů') : t('od nejnovějších') })} className="shrink-0" items={[
              { label: t('Od nejnovějších'), icon: sort === 'new' ? 'check' : 'clock', onClick: () => setSort('new') },
              { label: t('Nejvíc hlasů'), icon: sort === 'votes' ? 'check' : 'trend', onClick: () => setSort('votes') },
            ]} />
          )}
        </div>
      )}

      {akceChyba && <p className="note note-danger text-sm" role="alert">{akceChyba}</p>}

      {data.error && !data.data ? (
        <Card><ErrorState title={t('Nápady se nenačetly')} onRetry={data.reload} detail={data.error} /></Card>
      ) : data.loading ? (
        <Card aria-busy className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14 w-2/3" /></Card>
      ) : shown.length === 0 ? (
        <Card>
          {items.length === 0
            ? <EmptyState illustration="napady" title={t('Zatím žádný nápad')} hint={t('Cokoli, co by v podniku šlo líp — nová položka do nabídky, jiný postup, oprava. Kdo napíše první, začíná.')}
              action={pridava ? <Button variant="secondary" icon="plus" onClick={() => { setComposing(true); setErr(''); }}>{t('Přidat podnět')}</Button> : undefined} />
            : <EmptyState compact icon="bulb" title={t('V této kategorii nic není')} />}
        </Card>
      ) : (
        <Card pad="none" className="px-5">
          <ul className="list">
            {shown.map(s => {
              const meta = statusMeta(t)[s.status] ?? statusMeta(t).new;
              const mine = meId != null && s.authorId === meId;
              const polozky = akce(s);
              const poznamkyOtevrene = otevrenePoznamky.has(s.id);
              const pocetPoznamek = pocty.data?.[s.id] ?? 0;
              return (
                <li key={s.id} className="list-row items-start">
                  <Hlas podnet={s} onClick={() => void toggleVote(s)} zamceno={!pridava} />
                  {/* v4 (V4): stav, posun stavu i poznámky na ose textu (ne pod hlasem), rozestup 8;
                      „···" na pravé hraně. Dřív segment přes celý řádek od levého okraje pod hlasem. */}
                  <div className="min-w-0 flex-1 sloupec sloupec-2">
                    {/* „···" v řádku titulu, ne jako sloupec řádku: obsah pod titulem (segment stavu, poznámky)
                        pak sahá až na R — dřív končil 48 px před ní a segment ořízl „Hotovo". */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="t-card min-w-0 flex-1 break-words">{s.title}</h3>
                      <Chip tone={meta.tone} size="sm" className="shrink-0 mt-0.5">{meta.label}</Chip>
                      {polozky.length > 0 && <Menu size="sm" label={t('Další akce: {nazev}', { nazev: s.title })} items={polozky} className="shrink-0 -my-1" />}
                    </div>
                    {s.content && <p className="text-sm text-black/60 -mt-1 whitespace-pre-wrap break-words text-pretty">{s.content}</p>}
                    <p className="flex items-center gap-1.5 text-[13px] text-black/55 min-w-0">
                      <Avatar emoji={s.authorAvatar} size="xs" ring={false} />
                      <span className="truncate min-w-0">{s.authorName ?? t('Neznámý')}{mine ? ' (ty)' : ''}</span>
                      {relDate(s.createdAt, t, loc) && <><span aria-hidden className="text-black/40">·</span><span className="whitespace-nowrap">{relDate(s.createdAt, t, loc)}</span></>}
                    </p>
                    {/* Posun podnětu — jen kdo podněty spravuje (server to tak pustí). Čtyři stavy se
                        na telefonu nevejdou celé: segment je pak posuvný pás mezi osou textu a R. */}
                    {spravuje && (
                      <Segmented size="sm" ariaLabel={t('Stav podnětu {nazev}', { nazev: s.title })} value={(statusFlow(t).some(x => x.id === s.status) ? s.status : 'new') as IdStavu}
                        onChange={v => void setStatus(s, v)} options={statusFlow(t).map(x => ({ id: x.id, label: x.label }))} />
                    )}
                    {/* Vlákno pod podnětem (kolo 7): odpověď vedení, důvod zamítnutí, doplnění od autora. */}
                    <div className="-mt-3 -mb-1 flex">
                      <Button variant="ghost" size="sm" icon="chat" className="-ml-3"
                        aria-expanded={poznamkyOtevrene} aria-controls={poznamkyOtevrene ? `${id}-pozn-${s.id}` : undefined} onClick={() => prepniPoznamky(s.id)}>
                        {pocetPoznamek ? t('Poznámky ({n})', { n: pocetPoznamek }) : t('Poznámky')}
                      </Button>
                    </div>
                    {poznamkyOtevrene && (
                      <div id={`${id}-pozn-${s.id}`} className="min-w-0 pb-1">
                        <Poznamky typ="suggestion" id={s.id} />
                      </div>
                    )}
                  </div>
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
          title: t('Nápady'),
          subtitle: spravuje
            ? (novych > 0 ? t('Na posouzení čeká {n, plural, one {# podnět} few {# podněty} other {# podnětů}}. Přidej se hlasem nebo posuň nápad dál.', { n: novych }) : t('Podněty od týmu — co by lidem usnadnilo práci. Přidej se hlasem nebo posuň nápad dál.'))
            : t('Máš nápad, co by šlo zlepšit? Přidej podnět a vedení ho uvidí. Hlasem podpoříš nápady ostatních.'),
          hintId: 'suggestionsboard',
          primary: pridava ? <Button onClick={() => { setComposing(true); setErr(''); }} variant="accent" icon="plus">{t('Přidat podnět')}</Button> : undefined,
        }}
        nastroj={nastroj}
      />

      {composing && (
        <Modal open onClose={() => setComposing(false)} size="md" title={t('Nový podnět')}
          subtitle={zamestnanec ? t('Uvidí ho vedení a kolegové můžou hlasovat.') : undefined}
          footer={<>
            <Button variant="secondary" onClick={() => setComposing(false)}>{t('Zrušit')}</Button>
            <Button variant="primary" iconAfter="send" loading={submitting} onClick={submit}>{t('Odeslat podnět')}</Button>
          </>}>
          <div className="space-y-3">
            {err && <p className="note note-danger text-sm" role="alert">{err}</p>}
            <Field id={`${id}-nazev`} label={t('Co navrhuješ?')}>
              <Input id={`${id}-nazev`} value={title} onChange={e => setTitle(e.target.value)} maxLength={160} autoFocus placeholder={t('Např. Přidat druhý mlýnek na kávu')} />
            </Field>
            <Field id={`${id}-popis`} label={t('Vysvětli to blíž')} hint={t('Nepovinné — proč to pomůže, jak by to mělo fungovat.')}>
              <Textarea id={`${id}-popis`} value={content} onChange={e => setContent(e.target.value)} rows={4} maxLength={2000} />
            </Field>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={t('Upravit podnět')} size="sm"
          footer={<>
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('Zrušit')}</Button>
            <Button variant="primary" icon="check" loading={savingEdit} disabled={!editTitle.trim()} onClick={saveEdit}>{t('Uložit')}</Button>
          </>}>
          <div className="space-y-3">
            <Field id={`${id}-e-nazev`} label={t('Název')}>
              <Input id={`${id}-e-nazev`} value={editTitle} onChange={e => setEditTitle(e.target.value)} maxLength={200} autoFocus />
            </Field>
            <Field id={`${id}-e-popis`} label={t('Popis')} hint={t('Nepovinné.')}>
              <Textarea id={`${id}-e-popis`} value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} maxLength={2000} />
            </Field>
          </div>
        </Modal>
      )}
      {nahlasit != null && (
        <NahlasitOkno kind="napad" refId={nahlasit} onClose={() => setNahlasit(null)}
          onDone={(z) => { setNahlasit(null); setZprava(z); }} />
      )}
      {mazani && (
        <Modal open onClose={() => setMazani(null)} title={t('Smazat podnět?')} size="sm"
          footer={<>
            <Button variant="secondary" onClick={() => setMazani(null)}>{t('Zrušit')}</Button>
            <Button variant="danger-solid" loading={mazu} onClick={remove}>{t('Smazat')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{t('„{nazev}" zmizí i s hlasy. Vrátit to nepůjde.', { nazev: mazani.title })}</p>
        </Modal>
      )}
      {zamitani && (
        <Modal open onClose={() => setZamitani(null)} title={t('Proč zamítnout?')} size="sm"
          subtitle={zamitani.title}
          footer={<>
            <Button variant="secondary" onClick={() => setZamitani(null)}>{t('Zrušit')}</Button>
            <Button variant="danger-solid" loading={zamitam} onClick={() => { void zamitnout(); }}>{t('Zamítnout')}</Button>
          </>}>
          <div className="space-y-3">
            <Field id={`${id}-duvod`} label={t('Důvod (uvidí autor)')} hint={t('Nepovinné — přijde autorovi v oznámení a zůstane v poznámkách u podnětu.')}>
              <Textarea id={`${id}-duvod`} value={duvod} onChange={e => setDuvod(e.target.value)} rows={3} maxLength={MAX_DELKA_DUVODU} autoFocus
                placeholder={t('Např. Dobrý nápad, ale až po sezóně.')} />
            </Field>
            {chybaZamitnuti && <p className="note note-danger text-sm" role="alert">{chybaZamitnuti}</p>}
          </div>
        </Modal>
      )}
      <Toast message={zprava} onClose={() => setZprava(null)} />
    </>
  );
}
