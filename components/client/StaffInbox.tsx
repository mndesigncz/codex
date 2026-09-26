'use client';

// Příjem u obsluhy: nové objednávky od stolu a dnešní rezervace. Běží
// v kiosku na baru, v mobilu zaměstnance a jako nástroj stránky Objednávky
// v Managero client. Objednávku je potřeba potvrdit do pár minut, jinak host
// zbytečně čeká — proto se nová hlásí nahlas (pípnutí, počet v záložce)
// a obnovuje se každých dvacet vteřin.
//
// Kolo 69 (B8), z auditu „Klient – Objednávky":
//  - nové objednávky jsou karta se seznamem a počtem v Chipu (dřív jantarový
//    panel a v něm bílé dlaždice — karta v kartě), nadpisy jednou podobou;
//  - „Přijmout" je tmavé `primary` (dřív limetka u každé objednávky),
//    odmítnutí v okně místo confirm(), přijímá a odmítá jen kdo má
//    objednavky.vyridit;
//  - stůl, stav, stav kasy a ověření QR a polohy jsou Chip (dřív čtyři
//    ručně barvené pilulky a odznak stolu s rádiusem mimo škálu);
//  - hlášení o kase je `.note note-wait`, potvrzení akcí jeden Toast dole
//    (dřív limetkový proužek nahoře, druhá kopie té z ClientAdmin).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Card, Chip, EmptyState, ListRow, Menu, Modal, Skeleton, Toast, type ChipTone, type MenuItem } from '../ui';
import CardScan from './CardScan';
import { RES_STATUS } from '@/lib/clientSlots';
import { TON_REZERVACE, type StavRezervace } from '@/lib/klientPrehled';
import { czCount, type CzNoun } from '@/lib/czech';
import { dbTimeHM, parseDbTime } from '@/lib/pragueTime';
import { useMoney } from '../CurrencyProvider';
import { okJson, apiMessage } from '@/lib/api';
import { useOpravneni } from '../role/useOpravneni';

const EVERY_MS = 20 * 1000;

export function useStaffInbox(enabled = true) {
  const [d, setD] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => fetch('/api/client/staff/inbox').then(okJson).then(x => { if (!x.error) { setD(x); setErr(''); } else setErr(x.error); }).catch(e => setErr(apiMessage(e, 'Příjem se nenačetl.'))), []);
  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, EVERY_MS);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [enabled, load]);
  return { d, err, reload: load };
}

const ORDER_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  new: { label: 'Nová', tone: 'wait' }, confirmed: { label: 'Připravuje se', tone: 'ok' }, done: { label: 'Hotovo', tone: 'muted' }, declined: { label: 'Nepřijato', tone: 'muted' },
};
const POS_STATE: Record<string, string> = { NEW: 'v kase čeká na přijetí', CONFIRMED: 'v kase, připravuje se', DISPATCHED: 'v kase vydáno', DECLINED: 'kasa odmítla', SCHEDULING_DELIVERY: 'v kase' };
const PRIJATO_V_KASE = /^(CONFIRMED|ACCEPTED|DISPATCHED|DELIVERED)$/i;
const NOVA_OBJEDNAVKA: CzNoun = { one: 'nová objednávka', few: 'nové objednávky', many: 'nových objednávek' };
const OSOBA: CzNoun = { one: 'osoba', few: 'osoby', many: 'osob' };

/** Jak víme, že host sedí u stolu: QR ze stolu a poloha telefonu. */
function Overeni({ o }: { o: any }) {
  const casti: { text: string; tone: ChipTone; icon: string }[] = [];
  if (o.via_qr) casti.push({ text: 'QR ze stolu', tone: 'ok', icon: 'tag' });
  else if (o.via_qr === false) casti.push({ text: 'bez QR', tone: 'wait', icon: 'tag' });
  if (o.geo_status === 'ok') casti.push({ text: `u podniku${o.geo_distance_m != null ? ` · ${o.geo_distance_m} m` : ''}`, tone: 'ok', icon: 'location' });
  else if (o.geo_status === 'far') casti.push({ text: `daleko · ${o.geo_distance_m} m`, tone: 'bad', icon: 'location' });
  else if (o.geo_status === 'none') casti.push({ text: 'bez polohy', tone: 'wait', icon: 'location' });
  return <>{casti.map(c => <Chip key={c.text} tone={c.tone} size="sm" icon={c.icon}>{c.text}</Chip>)}</>;
}

/** Kde je objednávka v kase — jeden Chip místo čtyř ručně barvených pilulek s tečkou. */
function StavKasy({ o }: { o: any }) {
  const st = String(o.pos_state ?? '');
  if (!o.storyous_order_id) return o.status !== 'declined' ? <Chip tone="wait" size="sm">Není v kase</Chip> : null;
  if (st === 'DECLINED') return <Chip tone="bad" size="sm">Kasa odmítla</Chip>;
  if (PRIJATO_V_KASE.test(st)) return <Chip tone="ok" size="sm" icon="check">Přijato v kase · tiskne se</Chip>;
  return <Chip tone="wait" size="sm">V kase čeká na přijetí</Chip>;
}

/** „před 3 min", starší s časem. Čas z databáze přes parseDbTime — nese UTC bez zóny. */
function kdy(iso: string): string {
  const d = parseDbTime(iso);
  if (!d) return '';
  const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (m < 1) return 'právě teď';
  if (m === 1) return 'před minutou';
  if (m < 60) return `před ${m} min`;
  return `v ${dbTimeHM(iso)}`;
}

// onZmena: po přijetí, hotovu, odmítnutí nebo odeslání do kasy — skořápka Clientu
// podle toho obnoví odznaky „Objednávky N" (jinak by svítily staré až do Přehledu).
export default function StaffInbox({ compact = false, onToast, onZmena }: { compact?: boolean; onToast?: (m: string) => void; onZmena?: () => void }) {
  const { d, err, reload } = useStaffInbox(true);
  // Tlačítka podle `ma` (před načtením oprávnění ANO, rozhoduje server).
  const { ma } = useOpravneni();
  const vyridi = ma('objednavky.vyridit');
  const [busy, setBusy] = useState<number | null>(null);
  const beeped = useRef<Set<number>>(new Set());
  const [hlaska, setHlaska] = useState<string | null>(null);
  const [odmitam, setOdmitam] = useState<any | null>(null);
  const toast = (m: string) => { if (onToast) onToast(m); else setHlaska(m); };

  // Nová objednávka, kterou jsme ještě neviděli → krátké pípnutí (kiosk na baru bývá bez očí).
  useEffect(() => {
    for (const o of d?.orders ?? []) {
      if (o.status === 'new' && !beeped.current.has(o.id)) {
        beeped.current.add(o.id);
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator(); const g = ctx.createGain();
          osc.frequency.value = 880; g.gain.value = 0.04; osc.connect(g); g.connect(ctx.destination);
          osc.start(); osc.stop(ctx.currentTime + 0.18);
        } catch { /* bez zvuku */ }
      }
    }
  }, [d]);

  /* Zkouška spojení s kasou. Nic neposílá — jen projde řetězec článek po
     článku a řekne, kde vázne. Bez toho je jediná odpověď „nevím". */
  const [test, setTest] = useState<any[] | null>(null);
  const [testuji, setTestuji] = useState(false);
  const zkouska = async () => {
    setTestuji(true); setTest(null);
    try {
      const r = await fetch('/api/client/admin/pos-check');
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'Zkouška se nepovedla.');
      setTest(Array.isArray(x.kroky) ? x.kroky : []);
    } catch (e) { toast(apiMessage(e, 'Zkouška se nepovedla.')); }
    setTestuji(false);
  };

  /* Zopakovat odeslání do kasy. Objednávka, kterou pokladna zrovna nevzala,
     se jinak už na terminál nikdy nedostane. */
  const toPos = async (id: number) => {
    setBusy(id);
    try {
      const r = await fetch('/api/client/staff/inbox', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'pos' }) });
      const x = await r.json().catch(() => ({}));
      toast(x.posNote || x.error || (x.ok ? 'Objednávka je v pokladně.' : 'Do pokladny to nešlo.'));
      await reload();
      onZmena?.();
    } catch { toast('Spojení se serverem selhalo.'); }
    setBusy(null);
  };

  const act = async (id: number, status: string) => {
    setBusy(id);
    try {
      const r = await fetch('/api/client/staff/inbox', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'Nepovedlo se.');
      if (x.posNote) toast(x.posNote);
      else if (status === 'done' && x.loyalty?.stamp?.rewarded) toast('Hotovo. Host nasbíral všechna razítka a má odměnu.');
      else if (status === 'done') toast('Hotovo. Body připsány.');
      else if (status === 'declined') toast('Objednávka odmítnuta — host dostane zprávu.');
      else toast('Objednávka přijata.');
      await reload();
      onZmena?.();
    } catch (e) { toast(apiMessage(e, 'Nepovedlo se.')); }
    setBusy(null);
  };

  const toastEl = !onToast ? <Toast message={hlaska} onClose={() => setHlaska(null)} /> : null;
  if (err) return <p className="note note-danger" role="alert">{err}</p>;
  if (!d) return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;
  const orders: any[] = d.orders ?? [];
  const news = orders.filter(o => o.status === 'new');
  const inProgress = orders.filter(o => o.status === 'confirmed');
  const recent = orders.filter(o => ['done', 'declined'].includes(o.status));
  const reservations: any[] = d.reservations ?? [];

  // Řetězec k terminálu. Vypnutá pokladna, nespárovaný stůl a nenavázané
  // položky vypadají v příjmu úplně stejně jako všechno v pořádku — proto
  // se to říká nahoře a jmenovitě.
  const pos = d.pos ?? {};
  const vady: string[] = [];
  if (pos.connected === false) vady.push('Pokladna Storyous není připojená (Nastavení → Pokladna).');
  else {
    if (pos.autoPos === false) vady.push('Automatické odesílání do kasy je vypnuté (Client → Nastavení).');
    if (pos.tables > 0 && pos.tablesPaired === 0) vady.push(`Žádný z ${pos.tables} stolů není spárovaný s pokladnou (Client → Stoly → Načíst z pokladny).`);
    else if (pos.tablesPaired < pos.tables) vady.push(`${pos.tables - pos.tablesPaired} z ${pos.tables} stolů není spárovaných s pokladnou.`);
    if (pos.items > 0 && pos.itemsLinked < pos.items) vady.push(`${pos.items - pos.itemsLinked} z ${pos.items} položek menu nemá produkt v kase (Client → Menu → Tisk na terminálu).`);
  }
  const radek = (o: any) => (
    <RadekObjednavky key={o.id} o={o} busy={busy === o.id} vyridi={vyridi}
      onStav={s => { void act(o.id, s); }} onKasa={() => { void toPos(o.id); }} onOdmitnout={() => setOdmitam(o)} />
  );
  const vysledkyZkousky = test && (
    <ul className="space-y-1.5">
      {test.map((k, i) => (
        <li key={i} className="flex gap-2 text-[13px]">
          <Icon name={k.ok ? 'check' : 'close'} size={14} className={`shrink-0 mt-0.5 ${k.ok ? 'text-ok-ink' : 'text-bad-ink'}`} />
          <span className="min-w-0">
            <span className="font-semibold text-[#16181A]">{k.krok}:</span> <span className="text-black/70">{k.detail}</span>
            {k.kde && <span className="block t-meta mt-0.5">Kde: {k.kde}</span>}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      {!compact && vady.length > 0 && (
        <div className="note note-wait space-y-2" role="status">
          <p className="font-semibold flex items-center gap-2"><Icon name="warning" size={16} className="shrink-0" />Objednávky se nevytisknou na terminálu</p>
          <ul className="space-y-1 list-disc pl-5">{vady.map((v, i) => <li key={i}>{v}</li>)}</ul>
          {vysledkyZkousky}
          <Button size="sm" variant="secondary" icon="refresh" loading={testuji} onClick={() => { void zkouska(); }}>{test ? 'Zkusit znovu' : 'Vyzkoušet spojení s kasou'}</Button>
        </div>
      )}
      {!compact && vady.length === 0 && (
        <div className="space-y-2">
          <Button size="sm" variant="ghost" icon="refresh" loading={testuji} onClick={() => { void zkouska(); }}>
            {testuji ? 'Zkouším spojení s kasou…' : test ? 'Zkusit spojení s kasou znovu' : 'Vyzkoušet spojení s kasou'}
          </Button>
          {test && <Card pad="sm">{vysledkyZkousky}</Card>}
        </div>
      )}
      {/* Vyhledání kartičky je nástroj pro obsluhu u kasy, ne obsah obrazovky —
          jeden řádek, který se rozbalí, když někdo kartičku opravdu drží v ruce. */}
      <details className="group">
        <summary className="tap-target-sm inline-flex items-center gap-2 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none">
          <Icon name="card" size={16} />Kartička hosta u kasy<Icon name="chevron" size={14} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2"><CardScan onToast={toast} onChange={compact ? undefined : reload} /></div>
      </details>
      {news.length > 0 && (
        // Bílá karta s počtem v Chipu: tónovaná plocha by na stránce s „Čeká na tebe" byla druhá (DP §6.3).
        <Card pad="none" aria-labelledby="h-nove">
          <h2 id="h-nove" className="t-card flex items-center gap-2 px-5 pt-4">
            <Icon name="bell" size={17} className="text-wait-ink" />{news.length === 1 ? 'Nová objednávka od stolu' : `${czCount(news.length, NOVA_OBJEDNAVKA)} od stolu`}
            <Chip tone="wait" size="sm">{news.length}</Chip>
          </h2>
          <ul className="list px-5">{news.map(radek)}</ul>
        </Card>
      )}
      {inProgress.length > 0 && (
        <Card pad="none" aria-labelledby="h-priprava">
          <h2 id="h-priprava" className="t-card px-5 pt-4">Připravuje se</h2>
          <ul className="list px-5">{inProgress.map(radek)}</ul>
        </Card>
      )}
      {!compact && reservations.length > 0 && (
        <Card pad="none" aria-labelledby="h-rez">
          <h2 id="h-rez" className="t-card px-5 pt-4">Dnešní rezervace</h2>
          <ul className="list px-5">
            {reservations.map(r => (
              <ListRow key={r.id} value={String(r.time ?? '').slice(0, 5)} title={r.customer_name}
                meta={[czCount(Number(r.party) || 1, OSOBA), r.table_name].filter(Boolean).join(' · ')}
                right={<Chip tone={TON_REZERVACE[r.status as StavRezervace] ?? 'wait'} size="sm">{RES_STATUS[r.status]?.label ?? r.status}</Chip>} />
            ))}
          </ul>
        </Card>
      )}
      {!compact && recent.length > 0 && (
        <details className="group">
          <summary className="tap-target-sm inline-flex items-center gap-2 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none">
            Vyřízené za poslední tři hodiny ({recent.length})<Icon name="chevron" size={14} className="transition-transform group-open:rotate-180" />
          </summary>
          <Card pad="none" className="mt-2"><ul className="list px-5">{recent.map(o => <RadekObjednavky key={o.id} o={o} busy={false} vyridi={false} />)}</ul></Card>
        </details>
      )}
      {!compact && orders.length === 0 && reservations.length === 0 && (
        <Card><EmptyState icon="inbox" title="Nic k vyřízení" hint="Objednávky od stolu a dnešní rezervace se objeví tady." compact /></Card>
      )}
      {odmitam && (
        <Modal open onClose={() => setOdmitam(null)} size="sm" title="Odmítnout objednávku?"
          footer={<>
            <Button variant="secondary" onClick={() => setOdmitam(null)}>Zrušit</Button>
            <Button variant="danger-solid" onClick={() => { const o = odmitam; setOdmitam(null); void act(o.id, 'declined'); }}>Odmítnout</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{odmitam.table_name ? `Host u stolu ${odmitam.table_name}` : 'Host'} dostane zprávu, že objednávka nebyla přijata.</p>
        </Modal>
      )}
      {toastEl}
    </div>
  );
}

function RadekObjednavky({ o, busy, vyridi, onStav, onKasa, onOdmitnout }: {
  o: any; busy: boolean; vyridi: boolean;
  onStav?: (s: 'confirmed' | 'done') => void; onKasa?: () => void; onOdmitnout?: () => void;
}) {
  const money = useMoney();
  const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.new;
  const kasa = !o.storyous_order_id && o.status !== 'declined' && !!onKasa;
  const dalsi: MenuItem[] = vyridi ? [
    ...(kasa ? [{ label: 'Poslat do kasy', icon: 'receipt', onClick: () => onKasa?.() }] : []),
    ...(o.status === 'new' && onOdmitnout ? [{ label: 'Odmítnout…', icon: 'close', danger: true, onClick: onOdmitnout }] : []),
  ] : [];
  const stul = o.table_name ?? 'bez stolu';
  return (
    <li className="list-row items-start flex-wrap sm:flex-nowrap">
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex items-center gap-2 flex-wrap text-[15px] font-medium leading-snug text-[#16181A]">
          <Chip tone="ink" size="sm">{stul}</Chip>
          <span className="truncate">{o.customer_name}</span>
          <span className="t-meta">{kdy(o.created_at)}</span>
        </p>
        <ul className="mt-1.5 text-sm">
          {(o.items ?? []).map((l: any, i: number) => (
            <li key={i} className="flex justify-between gap-3"><span><span className="font-semibold tabular-nums">{l.count}×</span> {l.name}</span><span className="tabular-nums text-black/60">{money(l.price * l.count)}</span></li>
          ))}
        </ul>
        {o.note && <p className="t-meta mt-1">„{o.note}"</p>}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <span className="font-bold tabular-nums mr-1">{money(o.total)}</span>
          <Chip tone={st.tone} size="sm">{st.label}</Chip>
          <Overeni o={o} />
          <StavKasy o={o} />
          {o.pos_state && !PRIJATO_V_KASE.test(String(o.pos_state)) && <span className="t-meta">{POS_STATE[o.pos_state] ?? `kasa: ${o.pos_state}`}</span>}
        </div>
        {o.pos_note && o.status !== 'declined' && !PRIJATO_V_KASE.test(String(o.pos_state ?? '')) && (
          <p className="mt-1 text-[13px] text-wait-ink leading-snug">{o.pos_note}</p>
        )}
      </div>
      {vyridi && onStav && (o.status === 'new' || o.status === 'confirmed' || dalsi.length > 0) && (
        <div className="flex gap-1.5 shrink-0 ml-auto">
          {/* Stůl v přístupném názvu — tři „Přijmout" za sebou by odečítač nerozlišil. */}
          {o.status === 'new' && <Button size="sm" variant="primary" icon="check" loading={busy} onClick={() => onStav('confirmed')} aria-label={`Přijmout: ${stul}, ${o.customer_name}`}>Přijmout</Button>}
          {o.status === 'confirmed' && <Button size="sm" variant="primary" loading={busy} onClick={() => onStav('done')} aria-label={`Hotovo: ${stul}, ${o.customer_name}`}>Hotovo</Button>}
          {dalsi.length > 0 && <Menu size="sm" label={`Další akce s objednávkou ${stul}`} items={dalsi} />}
        </div>
      )}
    </li>
  );
}
