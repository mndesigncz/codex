'use client';

// Okna hromadných akcí nad vybranými členy: do skupiny / ze skupiny, body, kupon a zpráva.
// Velký výběr se posílá po dávkách (server bere najednou méně), výsledek je jedna věta s počty.

import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Input, Modal, Segmented, Select, Skeleton, Textarea } from '../../ui';
import { czCount } from '@/lib/czech';
import { MAX_HROMADNE_AKCE } from '@/lib/clenoveSeznam';
import { KANALY_ZPRAVY, type KanalyZpravy } from '@/lib/zpravyKanaly';
import { apiMessage, okJson } from '@/lib/api';
import { cislo, BOD, CLEN, CLENOVI, j, type Hlaska } from './spolecne';

export type AkceVyberu = 'skupina_pridat' | 'skupina_odebrat' | 'body' | 'kupon' | 'zprava';
/** Kolik členů smí jedna zpráva zasáhnout (server bere nejvýš tolik v jednom výběru). */
export const MAX_ZPRAVA_VYBER = 2000;

const NAZVY: Record<AkceVyberu, string> = {
  skupina_pridat: 'Přidat do skupiny', skupina_odebrat: 'Odebrat ze skupiny', body: 'Body vybraným', kupon: 'Kupon vybraným', zprava: 'Zpráva vybraným',
};

async function poDavkach(ids: number[], fn: (cast: number[]) => Promise<any>): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += MAX_HROMADNE_AKCE) out.push(await fn(ids.slice(i, i + MAX_HROMADNE_AKCE)));
  return out;
}

export default function HromadneOkno({ akce, ids, oznam, onZavrit, onHotovo }: { akce: AkceVyberu; ids: number[]; oznam: Hlaska; onZavrit: () => void; onHotovo: () => void }) {
  const [skupiny, setSkupiny] = useState<{ id: number; name: string; rule: string | null; archived: boolean }[] | null>(null);
  const [kupony, setKupony] = useState<{ id: number; title: string }[] | null>(null);
  const [chybaNacteni, setChybaNacteni] = useState('');
  const [skupina, setSkupina] = useState('');
  const [delta, setDelta] = useState('');
  const [poznamka, setPoznamka] = useState('');
  const [kupon, setKupon] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kanal, setKanal] = useState<KanalyZpravy>('push');
  const [cas, setCas] = useState('');
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const n = ids.length;

  useEffect(() => {
    let zije = true;
    if (akce === 'skupina_pridat' || akce === 'skupina_odebrat') {
      fetch('/api/client/admin/groups').then(okJson)
        .then(d => { if (zije) setSkupiny((d.groups ?? []).filter((g: any) => !g.rule && !g.archived)); })
        .catch(e => { if (zije) setChybaNacteni(apiMessage(e, 'Skupiny se nenačetly.')); });
    }
    if (akce === 'kupon') {
      fetch('/api/client/admin/coupons').then(okJson)
        .then(d => { if (zije) setKupony((d.coupons ?? []).filter((c: any) => c.active).map((c: any) => ({ id: Number(c.id), title: String(c.title) }))); })
        .catch(e => { if (zije) setChybaNacteni(apiMessage(e, 'Kupony se nenačetly.')); });
    }
    return () => { zije = false; };
  }, [akce]);

  const hotovo = useMemo(() => {
    if (akce === 'skupina_pridat' || akce === 'skupina_odebrat') return !!skupina;
    if (akce === 'body') return !!Math.round(Number(delta));
    if (akce === 'kupon') return !!kupon;
    return !!title.trim() && n <= MAX_ZPRAVA_VYBER;
  }, [akce, skupina, delta, kupon, title, n]);

  const odeslat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hotovo) return;
    setBusy(true); setChyba('');
    try {
      if (akce === 'skupina_pridat' || akce === 'skupina_odebrat') {
        const r = await poDavkach(ids, cast => j('/api/client/admin/customers/hromadne', { method: 'POST', body: JSON.stringify({ akce, ids: cast, skupina: Number(skupina) }) }));
        const zmeneno = r.reduce((s, x) => s + x.zmeneno, 0), uz = r.reduce((s, x) => s + x.uzBylo, 0);
        const g = skupiny?.find(x => String(x.id) === skupina)?.name ?? 'skupina';
        oznam(akce === 'skupina_pridat'
          ? `Do skupiny ${g} přibylo ${czCount(zmeneno, CLEN)}${uz ? `, ${czCount(uz, CLEN)} tam už bylo` : ''}.`
          : `Ze skupiny ${g} odešlo ${czCount(zmeneno, CLEN)}${uz ? `, ${czCount(uz, CLEN)} v ní nebylo` : ''}.`);
      } else if (akce === 'body') {
        const d = Math.round(Number(delta));
        const r = await poDavkach(ids, cast => j('/api/client/admin/customers/hromadne', { method: 'POST', body: JSON.stringify({ akce, ids: cast, delta: d, note: poznamka }) }));
        const up = r.reduce((s, x) => s + x.upraveno, 0), bl = r.reduce((s, x) => s + x.blokovanych, 0);
        oznam(`${d > 0 ? '+' : ''}${czCount(d, BOD)} pro ${czCount(up, { one: 'člena', few: 'členy', many: 'členů' })}.${bl ? ` ${czCount(bl, CLEN)} je zablokovaných, těm se body nepřičetly.` : ''}`);
      } else if (akce === 'kupon') {
        const r = await poDavkach(ids, cast => j('/api/client/admin/customers/hromadne', { method: 'POST', body: JSON.stringify({ akce, ids: cast, couponId: Number(kupon) }) }));
        const pr = r.reduce((s, x) => s + x.pripsano, 0), mel = r.reduce((s, x) => s + x.uMeloUz, 0);
        oznam(`Kupon dostalo ${czCount(pr, CLEN)}${mel ? `, ${czCount(mel, CLEN)} ho už mělo nebo jsou zablokovaní` : ''}.`);
      } else {
        const r = await j('/api/client/admin/customers/hromadne', { method: 'POST', body: JSON.stringify({ akce, ids, title, body, channels: kanal, scheduledAt: cas ? new Date(cas).toISOString() : '', linkKind: 'page' }) });
        oznam(r.scheduled ? 'Zpráva je naplánovaná — odejde ve svůj čas.' : `Odesláno ${czCount(r.broadcast?.recipients ?? n, CLENOVI)}.`);
      }
      onHotovo();
    } catch (err) { setChyba(apiMessage(err, 'Akce se nepovedla.')); }
    setBusy(false);
  };

  const cekame = (akce === 'skupina_pridat' || akce === 'skupina_odebrat') ? skupiny === null : akce === 'kupon' ? kupony === null : false;
  return (
    <Modal open onClose={onZavrit} size="md" title={`${NAZVY[akce]} (${czCount(n, CLEN)})`}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button type="submit" form="hromadne-okno" variant="primary" loading={busy} disabled={!hotovo || cekame}>
          {akce === 'skupina_pridat' ? 'Přidat' : akce === 'skupina_odebrat' ? 'Odebrat' : akce === 'body' ? 'Upravit body' : akce === 'kupon' ? 'Připsat kupon' : cas ? 'Naplánovat' : 'Poslat'}
        </Button>
      </>}>
      <form id="hromadne-okno" onSubmit={odeslat} className="grid gap-4">
        {chybaNacteni && <p className="note note-bad" role="alert">{chybaNacteni}</p>}
        {(akce === 'skupina_pridat' || akce === 'skupina_odebrat') && (cekame ? <Skeleton className="h-10" /> : (
          <Field id="hr-skupina" label="Skupina" hint="Ruční, nearchivované skupiny. Členy dynamické skupiny počítá pravidlo.">
            {skupiny && skupiny.length === 0
              ? <p className="note note-wait">Zatím nemáš žádnou ruční skupinu. Založ ji ve Věrnosti, v části Skupiny.</p>
              : <Select id="hr-skupina" value={skupina} onChange={e => setSkupina(e.target.value)}><option value="">Vyber skupinu…</option>{skupiny?.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}</Select>}
          </Field>
        ))}
        {akce === 'body' && (
          <>
            <Field id="hr-delta" label="Kolik bodů každému" hint="Kladné číslo přičte, záporné odečte (nikdy pod nulu). Zablokovaným se body nepřičtou.">
              <Input id="hr-delta" type="number" inputMode="numeric" autoFocus min={-100000} max={100000} className="!w-36" value={delta} onChange={e => setDelta(e.target.value)} />
            </Field>
            <Field id="hr-proc" label="Proč" hint="Uvidí to každý v deníku. Nepovinné.">
              <Textarea id="hr-proc" rows={2} maxLength={200} value={poznamka} onChange={e => setPoznamka(e.target.value)} />
            </Field>
            {Math.round(Number(delta)) !== 0 && <p className="text-sm text-black/70">Celkem se rozdá {cislo(Math.round(Number(delta)) * n)} b.</p>}
          </>
        )}
        {akce === 'kupon' && (cekame ? <Skeleton className="h-10" /> : (
          <Field id="hr-kupon" label="Kupon" hint="Každý ho dostane mezi své kupony. Kdo ho už má nepoužitý, druhý nedostane. Souhlas se zprávami k tomu není potřeba.">
            {kupony && kupony.length === 0
              ? <p className="note note-wait">Zatím nemáš žádný zapnutý kupon. Založ ho ve Věrnosti, v části Kupony.</p>
              : <Select id="hr-kupon" value={kupon} onChange={e => setKupon(e.target.value)}><option value="">Vyber kupon…</option>{kupony?.map(k => <option key={k.id} value={String(k.id)}>{k.title}</option>)}</Select>}
          </Field>
        ))}
        {akce === 'zprava' && (
          <>
            {n > MAX_ZPRAVA_VYBER && <p className="note note-bad" role="alert">Zpráva jde najednou nejvýš {cislo(MAX_ZPRAVA_VYBER)} vybraným. Zúži výběr filtrem, nebo použij Zprávy → Komu.</p>}
            <Field id="hr-title" label="Nadpis" hint={`${title.length} z 80 znaků`}><Input id="hr-title" autoFocus maxLength={80} value={title} onChange={e => setTitle(e.target.value)} autoComplete="off" /></Field>
            <Field id="hr-body" label="Text" hint={`${body.length} z 300 znaků. Nepovinné.`}><Textarea id="hr-body" rows={3} maxLength={300} value={body} onChange={e => setBody(e.target.value)} /></Field>
            <Field label="Kudy" hint={KANALY_ZPRAVY.find(k => k.id === kanal)?.popis}>
              <Segmented size="sm" ariaLabel="Kanál zprávy" value={kanal} onChange={setKanal} options={KANALY_ZPRAVY.map(k => ({ id: k.id, label: k.label }))} />
            </Field>
            <Field id="hr-cas" label="Odeslat (prázdné = hned)" hint="Dostanou ji jen ti z výběru, kdo souhlasili se zprávami. Počítá se do limitu pěti zpráv za den.">
              <Input id="hr-cas" type="datetime-local" value={cas} onChange={e => setCas(e.target.value)} />
            </Field>
          </>
        )}
        {chyba && <p className="note note-bad" role="alert">{chyba}</p>}
      </form>
    </Modal>
  );
}
