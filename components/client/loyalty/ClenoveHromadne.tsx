'use client';

// Okna hromadných akcí nad výběrem členů: skupina (přidat / odebrat / nová), bonus bodů
// a zpráva vybraným. Výběr je buď seznam zaškrtnutých, nebo „všichni, kdo splňují filtr"
// (server si je vybere sám a porovná počet, který tu člověk potvrdil). Každé okno drží
// klíč akce: dvojklik ani opakované odeslání nic nezdvojí; po chybě dostane akce klíč nový.
// Kupon vybraným řeší jiný okruh: `dalsiAkce` v ClenoveSprava je na to připravené místo.

import { useRef, useState } from 'react';
import { Button, Field, Input, Modal, Segmented, Select, Textarea } from '../../ui';
import { czCount, type CzNoun } from '@/lib/czech';
import { apiMessage } from '@/lib/api';
import { chybaBonusu, BONUS_CELKEM_MAX, type FiltrClenu } from '@/lib/clenoveFiltr';
import { TITLE_MAX, BODY_MAX } from '@/lib/zpravyPravidla';
import { KANALY_ZPRAVY, type KanalyZpravy } from '@/lib/zpravyKanaly';
import { j, type Hlaska } from '../import/typy';
import ZpravyNahled from './ZpravyNahled';

const HOST: CzNoun = { one: 'hosta', few: 'hosty', many: 'hostů' };
const HOSTU: CzNoun = { one: 'host', few: 'hosté', many: 'hostů' };
const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };

export interface VyberHostu {
  /** Zaškrtnutí hosté, nebo undefined, když je vybráno „vše podle filtru". */
  ids?: number[];
  filter?: FiltrClenu;
  /** Kolik hostů člověk viděl při potvrzení („vše podle filtru"). */
  pocet: number;
}

const novyKlic = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);

/** Tělo požadavku: výběr + klíč akce. */
function vyberDoTela(v: VyberHostu, klic: string): Record<string, unknown> {
  return v.ids ? { ids: v.ids, key: klic } : { filter: v.filter, expected: v.pocet, key: klic };
}

function useAkce(vyber: VyberHostu, oznam: Hlaska, onHotovo: () => void) {
  const klic = useRef(novyKlic());
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const spust = async (telo: Record<string, unknown>, zprava: (r: any) => string): Promise<boolean> => {
    setBusy(true); setChyba('');
    try {
      const r = await j('/api/client/admin/customers/bulk', { method: 'POST', body: JSON.stringify({ ...telo, ...vyberDoTela(vyber, klic.current) }) });
      oznam(zprava(r));
      onHotovo();
      setBusy(false);
      return true;
    } catch (err) {
      // Po chybě je nový pokus nová akce (starý klíč mohl být už přivlastněný).
      klic.current = novyKlic();
      setChyba(apiMessage(err, 'Akce se nepovedla.'));
    }
    setBusy(false);
    return false;
  };
  return { busy, chyba, spust };
}

export function HromadnaSkupina({ vyber, skupiny, oznam, onZavrit, onHotovo }: {
  vyber: VyberHostu;
  /** Jen ruční skupiny (do dynamické se ručně nepřidává). */
  skupiny: { id: number; name: string }[];
  oznam: Hlaska; onZavrit: () => void; onHotovo: () => void;
}) {
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [gid, setGid] = useState<string>(skupiny[0] ? String(skupiny[0].id) : '__nova');
  const [nazev, setNazev] = useState('');
  const vytvorena = useRef<number | null>(null);
  const { busy, chyba, spust } = useAkce(vyber, oznam, onHotovo);
  const nova = gid === '__nova' && mode === 'add';
  const [vlastniChyba, setVlastniChyba] = useState('');
  const potvrd = async (e: React.FormEvent) => {
    e.preventDefault();
    setVlastniChyba('');
    let id = Number(gid);
    if (nova) {
      if (!nazev.trim()) { setVlastniChyba('Zadej název nové skupiny.'); return; }
      if (vytvorena.current == null) {
        try {
          const r = await j('/api/client/admin/groups', { method: 'POST', body: JSON.stringify({ name: nazev.trim() }) });
          vytvorena.current = Number(r.group.id);
        } catch (err) { setVlastniChyba(apiMessage(err, 'Skupinu se nepodařilo založit.')); return; }
      }
      id = vytvorena.current;
    }
    const ok = await spust({ action: 'group', groupId: id, mode }, r => mode === 'remove'
      ? `Ze skupiny odebráno ${czCount(Number(r.zmeneno) || 0, HOST)}.`
      : `Do skupiny přidáno ${czCount(Number(r.zmeneno) || 0, HOST)}${r.preskoceno ? `, ${czCount(Number(r.preskoceno), HOST)} už v ní bylo` : ''}.`);
    if (ok) onZavrit();
  };
  return (
    <Modal open onClose={onZavrit} size="sm" title="Skupina pro vybrané" subtitle={`Vybráno ${czCount(vyber.pocet, HOSTU)}`}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button type="submit" form="hromadna-skupina" variant="primary" loading={busy} disabled={mode === 'remove' && !skupiny.length}>{mode === 'remove' ? 'Odebrat' : 'Přidat'}</Button>
      </>}>
      <form id="hromadna-skupina" onSubmit={potvrd} className="space-y-4">
        <Segmented options={[{ id: 'add', label: 'Přidat do skupiny' }, { id: 'remove', label: 'Odebrat ze skupiny' }]} value={mode} onChange={v => { setMode(v as 'add' | 'remove'); if (v === 'remove' && gid === '__nova') setGid(skupiny[0] ? String(skupiny[0].id) : ''); }} size="sm" ariaLabel="Co se skupinou" />
        {mode === 'remove' && !skupiny.length ? <p className="note note-wait">Zatím není žádná ruční skupina, ze které by šlo hosty odebrat.</p> : (
          <Field id="hs-skupina" label="Skupina">
            <Select id="hs-skupina" value={gid} onChange={e => setGid(e.target.value)}>
              {skupiny.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              {mode === 'add' && <option value="__nova">Nová skupina…</option>}
            </Select>
          </Field>
        )}
        {nova && (
          <Field id="hs-nazev" label="Název nové skupiny" error={vlastniChyba || undefined}>
            <Input id="hs-nazev" autoFocus maxLength={60} value={nazev} onChange={e => setNazev(e.target.value)} placeholder="Třeba Štamgasti z jara" />
          </Field>
        )}
        <p className="t-meta">Dynamické skupiny tu nejsou, členy jim určují pravidla.</p>
        {chyba && <p role="alert" className="note note-wait">{chyba}</p>}
      </form>
    </Modal>
  );
}

export function HromadnyBonus({ vyber, oznam, onZavrit, onHotovo }: { vyber: VyberHostu; oznam: Hlaska; onZavrit: () => void; onHotovo: () => void }) {
  const [delta, setDelta] = useState('');
  const [poznamka, setPoznamka] = useState('');
  const { busy, chyba, spust } = useAkce(vyber, oznam, onHotovo);
  const n = Number(delta);
  const chybaPole = delta === '' ? '' : chybaBonusu(n) ?? (n * vyber.pocet > BONUS_CELKEM_MAX ? 'Celkem by se rozdalo víc než milion bodů. Sniž bonus, nebo zúž výběr.' : '');
  const platne = delta !== '' && !chybaPole;
  const potvrd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!platne) return;
    const ok = await spust({ action: 'points', delta: n, note: poznamka }, r => `Bonus ${czCount(n, BOD)} dostalo ${czCount(Number(r.zmeneno) || 0, HOST)}.`);
    if (ok) onZavrit();
  };
  return (
    <Modal open onClose={onZavrit} size="sm" title="Bonus bodů vybraným" subtitle={`Vybráno ${czCount(vyber.pocet, HOSTU)}`}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button type="submit" form="hromadny-bonus" variant="primary" loading={busy} disabled={!platne}>Připsat body</Button>
      </>}>
      <form id="hromadny-bonus" onSubmit={potvrd} className="space-y-4">
        <Field id="hb-delta" label="Kolik bodů každému" error={chybaPole || undefined} hint="Celé kladné číslo, nejvýš 10 000 na hosta.">
          <Input id="hb-delta" type="number" inputMode="numeric" autoFocus min={1} max={10000} className="!w-36" value={delta} onChange={e => setDelta(e.target.value)} />
        </Field>
        <Field id="hb-proc" label="Proč" hint="Uvidí to host i ty v deníku. Bez textu se zapíše „Bonus od podniku“.">
          <Textarea id="hb-proc" rows={2} maxLength={120} value={poznamka} onChange={e => setPoznamka(e.target.value)} placeholder="Třeba omluva za zavřeno v sobotu" />
        </Field>
        {platne && <p className="text-sm text-black/70">Rozdáš celkem {czCount(n * vyber.pocet, BOD)}. Zpátky to jde vrátit jen ručně u každého hosta zvlášť.</p>}
        {chyba && <p role="alert" className="note note-wait">{chyba}</p>}
      </form>
    </Modal>
  );
}

export function HromadnaZprava({ vyber, nazevPodniku, oznam, onZavrit, onHotovo }: {
  vyber: VyberHostu; nazevPodniku: string | null; oznam: Hlaska; onZavrit: () => void; onHotovo: () => void;
}) {
  const [f, setF] = useState({ title: '', body: '', linkKind: 'page', channels: 'push' as KanalyZpravy });
  const { busy, chyba, spust } = useAkce(vyber, oznam, onHotovo);
  const potvrd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    const ok = await spust({ action: 'message', message: f }, r => {
      const zt = Number(r.ztlumeno) || 0;
      return `Zpráva došla ${czCount(Number(r.zmeneno) || 0, HOST)}.${zt ? ` ${czCount(zt, HOSTU)} má novinky vypnuté, těm nedošla.` : ''}`;
    });
    if (ok) onZavrit();
  };
  return (
    <Modal open onClose={onZavrit} size="md" title="Zpráva vybraným" subtitle={`Vybráno ${czCount(vyber.pocet, HOSTU)}`}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button type="submit" form="hromadna-zprava" variant="primary" icon="send" loading={busy} disabled={!f.title.trim()}>Poslat</Button>
      </>}>
      <form id="hromadna-zprava" onSubmit={potvrd} className="space-y-4">
        <Field id="hz-title" label="Nadpis" hint={`${f.title.length} z ${TITLE_MAX} znaků`}>
          <Input id="hz-title" autoFocus maxLength={TITLE_MAX} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field id="hz-body" label="Text" hint={`${f.body.length} z ${BODY_MAX} znaků`}>
          <Textarea id="hz-body" rows={3} maxLength={BODY_MAX} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
        </Field>
        <Field label="Kudy" hint={KANALY_ZPRAVY.find(k => k.id === f.channels)?.popis}>
          <Segmented size="sm" ariaLabel="Kanál zprávy" value={f.channels} onChange={v => setF({ ...f, channels: v })}
            options={KANALY_ZPRAVY.map(k => ({ id: k.id, label: k.label }))} />
        </Field>
        <Field id="hz-link" label="Kam zpráva vezme">
          <Select id="hz-link" value={f.linkKind} onChange={e => setF({ ...f, linkKind: e.target.value })}>
            <option value="page">Na stránku podniku</option>
            <option value="loyalty">Na věrnost a kupony</option>
            <option value="order">Na objednávku od stolu</option>
            <option value="me">Na jeho kartičku (Moje)</option>
          </Select>
        </Field>
        <ZpravyNahled nazev={nazevPodniku} title={f.title} body={f.body} linkKind={f.linkKind} oznameni={f.channels !== 'email'} email={f.channels !== 'push'} />
        <p className="t-meta">Zpráva dojde jen těm, kdo mají zapnuté novinky (e-mail i adresu), a blokovaným členům nikdy. Počítá se do dnešního limitu pěti zpráv a odeslanou už nejde vzít zpátky.</p>
        {chyba && <p role="alert" className="note note-wait">{chyba}</p>}
      </form>
    </Modal>
  );
}
