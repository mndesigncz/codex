'use client';

// Zprávy členům: psaní, náhled „jak to uvidí host", zkouška jen sobě, naplánování,
// úprava naplánované zprávy a historie s účinkem. Dřív to byla funkce Rozeslani
// v ClientAdmin.tsx, která umět jen odeslat nebo zrušit.
//
// Pravidla (lib/zpravyPravidla.ts): nadpis do 80 a text do 300 znaků, plánovat jde
// nejvýš 90 dní dopředu a čas se bere jako pražský, denní limit pěti zpráv se
// spotřebuje až při odeslání, ke zprávě jde připojit jen existující kupon nebo promo
// kód (uplatnění řeší stávající logika). Host dostane zprávu, jen když má zapnuté
// novinky — proto se u publika ukazuje, kolika členům zpráva opravdu dojde.

import { useEffect, useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Modal, Select, Skeleton, Textarea, useLoad } from '../../ui';
import { DraftNote } from '../../ui/DraftNote';
import { czCount, type CzNoun } from '@/lib/czech';
import { dbTimeDayHM, dbTimeHM, parseDbTime, pragueDayOf } from '@/lib/pragueTime';
import { SEGMENTY, jeSegment, stitekPublika } from '@/lib/segmenty';
import { vetaUcinku, ZPRAV_DENNE, TITLE_MAX, BODY_MAX, type PrilohaZpravy } from '@/lib/zpravyPravidla';
import { apiMessage, okJson } from '@/lib/api';
import { useDraft } from '@/lib/useDraft';
import { j, type Hlaska } from '../import/typy';
import ZpravyNahled from './ZpravyNahled';

const CLEN: CzNoun = { one: 'člen', few: 'členové', many: 'členů' };
const CLENOVI: CzNoun = { one: 'členovi', few: 'členům', many: 'členům' };
const CLENA: CzNoun = { one: 'člena', few: 'členy', many: 'členů' };
const HOST: CzNoun = { one: 'host', few: 'hosté', many: 'hostů' };

const PRAZDNA_ZPRAVA = { title: '', body: '', audience: 'all', linkKind: 'page', scheduledAt: '', priloha: '' };
type Zprava = typeof PRAZDNA_ZPRAVA;

/** „2026-10-05T14:00" → „5. 10. 2026 14:00" (čas je pražský, bez převodu přes zónu prohlížeče). */
function casCesky(lokalni: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(lokalni);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]} ${m[4]}` : lokalni;
}

/** Čas z databáze do pole datetime-local v pražském čase. */
function doPoleCasu(v: unknown): string {
  const d = parseDbTime(v as string);
  return d ? `${pragueDayOf(d)}T${dbTimeHM(v as string)}` : '';
}

function priloha(d: any, volba: string): PrilohaZpravy | null {
  if (volba.startsWith('coupon:')) {
    const k = d?.prilohy?.kupony?.find((x: any) => `coupon:${x.id}` === volba);
    return k ? { kupon: { title: String(k.title) } } : null;
  }
  if (volba.startsWith('promo:')) {
    const p = d?.prilohy?.promoKody?.find((x: any) => `promo:${x.id}` === volba);
    return p ? { promo: { code: String(p.code), title: String(p.title) } } : null;
  }
  return null;
}

export default function ZpravyRozeslani({ oznam }: { oznam: Hlaska }) {
  const [f, setF] = useState<Zprava>(PRAZDNA_ZPRAVA);
  const [editId, setEditId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [testuji, setTestuji] = useState(false);
  const [potvrdit, setPotvrdit] = useState(false);
  const [rusim, setRusim] = useState<any | null>(null);
  const [dosah, setDosah] = useState<{ pocet: number; souhlas: number } | null>(null);
  // Rozeslání jde stovkám zákazníků, takže se text píše rozmyšleně —
  // a o to víc mrzí, když ho spolkne přechod na jinou záložku.
  const koncept = useDraft('rozeslani', f, setF, { vychozi: PRAZDNA_ZPRAVA, aktivni: editId === null, upravujeSe: editId !== null });
  const { data: d, error, reload } = useLoad<any>('/api/client/admin/broadcast', raw => ({ ...raw, history: Array.isArray(raw?.history) ? raw.history : [] }));

  // Kolik z vybraného publika zprávu opravdu dostane (jen ti, kdo mají zapnuté novinky).
  useEffect(() => {
    let zije = true;
    setDosah(null);
    const t = setTimeout(() => {
      fetch(`/api/client/admin/broadcast?dosah=${encodeURIComponent(f.audience)}`).then(okJson)
        .then(r => { if (zije) setDosah({ pocet: Number(r.pocet) || 0, souhlas: Number(r.souhlas) || 0 }); })
        .catch(() => { if (zije) setDosah(null); });
    }, 200);
    return () => { zije = false; clearTimeout(t); };
  }, [f.audience]);

  const target = !d ? 0 : jeSegment(f.audience) ? (d.segments?.[f.audience] ?? 0)
    : f.audience === 'tier:silver' ? (d.silver ?? 0)
    : f.audience === 'tier:gold' || f.audience === 'gold' ? (d.gold ?? 0)
    : f.audience === 'tier:platinum' ? (d.platinum ?? 0)
    : f.audience.startsWith('group:') ? (d.groups?.find((g: any) => `group:${g.id}` === f.audience)?.members ?? 0)
    : (d.members ?? 0);
  const segmentInfo = SEGMENTY.find(x => x.id === f.audience);
  const naplanovano = !!f.scheduledAt && new Date(f.scheduledAt).getTime() > Date.now() + 60_000;
  const odeslano = Number(d?.limit?.odeslano) || 0;
  const limitVycerpan = odeslano >= (Number(d?.limit?.max) || ZPRAV_DENNE);
  const priloZvolena = d ? priloha(d, f.priloha) : null;
  const nikomu = dosah != null && dosah.pocet > 0 && dosah.souhlas === 0;

  const nahraj = (h: any) => {
    let volba = h.coupon_id ? `coupon:${h.coupon_id}` : h.promo_id ? `promo:${h.promo_id}` : '';
    if (volba && !priloha(d, volba)) {
      oznam('Připojený kupon nebo promo kód už neplatí, ze zprávy se odebral.', 'bad');
      volba = '';
    }
    setF({ title: String(h.title ?? ''), body: String(h.body ?? ''), audience: String(h.audience ?? 'all'), linkKind: String(h.link_kind ?? 'page'), scheduledAt: doPoleCasu(h.scheduled_at), priloha: volba });
    setEditId(Number(h.id));
  };
  const zrusUpravu = () => { setEditId(null); setF(PRAZDNA_ZPRAVA); };

  const telo = (extra: Record<string, unknown> = {}) => ({
    title: f.title, body: f.body, audience: f.audience, linkKind: f.linkKind, scheduledAt: f.scheduledAt || null,
    couponId: f.priloha.startsWith('coupon:') ? Number(f.priloha.slice(7)) : null,
    promoId: f.priloha.startsWith('promo:') ? Number(f.priloha.slice(6)) : null,
    ...extra,
  });

  const odeslat = async () => {
    setBusy(true);
    try {
      if (editId !== null) {
        await j('/api/client/admin/broadcast', { method: 'PATCH', body: JSON.stringify(telo({ id: editId })) });
        oznam('Změny uloženy. Zpráva odejde v novém čase.');
        setEditId(null);
      } else {
        const r = await j('/api/client/admin/broadcast', { method: 'POST', body: JSON.stringify(telo()) });
        if (r.scheduled) oznam('Zpráva je naplánovaná. Odejde ve svůj čas a do té doby jde upravit nebo zrušit.');
        else {
          const zt = Number(r.ztlumeno) || 0;
          oznam(`Odesláno ${czCount(Number(r.doruceno) || 0, CLENOVI)}.${zt ? ` ${czCount(zt, HOST)} má novinky vypnuté, těm zpráva nedošla.` : ''}`);
        }
      }
      koncept.hotovo(); setF(PRAZDNA_ZPRAVA); reload();
    } catch (err) { oznam(apiMessage(err, 'Zprávu se nepodařilo odeslat.'), 'bad'); reload(); }
    setBusy(false);
  };
  const zkouska = async () => {
    setTestuji(true);
    try {
      await j('/api/client/admin/broadcast', { method: 'POST', body: JSON.stringify(telo({ action: 'test', scheduledAt: null })) });
      oznam('Zkouška odeslaná jen tobě. Mrkni do oznámení nebo do telefonu.');
    } catch (err) { oznam(apiMessage(err, 'Zkoušku se nepodařilo odeslat.'), 'bad'); }
    setTestuji(false);
  };
  const zrusit = async (h: any) => {
    try { await j(`/api/client/admin/broadcast?id=${h.id}`, { method: 'DELETE' }); oznam('Zpráva zrušena.'); if (editId === Number(h.id)) zrusUpravu(); reload(); }
    catch (err) { oznam(apiMessage(err, 'Zprávu se nepodařilo zrušit.'), 'bad'); reload(); }
  };

  if (error) return <ErrorState title="Zprávy se nenačetly" onRetry={reload} detail={error} />;
  if (!d) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-48" /></div>;
  const komu = (a: string) => stitekPublika(a);
  const smiPrilohy = !!d.prilohy;
  const mozneOdeslat = !!target && !!f.title.trim() && (naplanovano || editId !== null || !limitVycerpan);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        <Card as="form" className="grid gap-4" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (mozneOdeslat) setPotvrdit(true); }}>
          <div>
            <h2 className="t-card">{editId !== null ? 'Úprava naplánované zprávy' : 'Nová zpráva'}</h2>
            {editId !== null && <p className="t-meta mt-0.5">Měníš zprávu, která ještě neodešla. <button type="button" className="underline" onClick={zrusUpravu}>Zahodit úpravy</button></p>}
          </div>
          {editId === null && <DraftNote koncept={koncept} co="rozepsané rozeslání" />}
          <Field id="bc-title" label="Nadpis" hint={`${f.title.length} z ${TITLE_MAX} znaků`}>
            <Input id="bc-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Nový čaj z jarní sklizně" maxLength={TITLE_MAX} />
          </Field>
          <Field id="bc-body" label="Text" hint={`${f.body.length} z ${BODY_MAX} znaků`}>
            <Textarea id="bc-body" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} placeholder="Tento týden ochutnávka zdarma ke každé konvici." maxLength={BODY_MAX} rows={3} />
          </Field>
          <Field id="bc-aud" label="Komu">
            <Select id="bc-aud" value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })}>
              <option value="all">Všem členům ({d.members ?? 0})</option>
              <optgroup label="Podle chování">
                {SEGMENTY.map(x => <option key={x.id} value={x.id}>{x.label} ({d.segments?.[x.id] ?? 0})</option>)}
              </optgroup>
              <optgroup label="Podle úrovně">
                <option value="tier:silver">Stříbrným a výš ({d.silver ?? 0})</option>
                <option value="tier:gold">Zlatým a výš ({d.gold ?? 0})</option>
                {d.platinum != null && <option value="tier:platinum">Platinovým hostům ({d.platinum})</option>}
              </optgroup>
              {(d.groups ?? []).length > 0 && (
                <optgroup label="Podle skupiny">
                  {(d.groups ?? []).map((g: any) => <option key={g.id} value={`group:${g.id}`}>Skupina {g.name} ({g.members})</option>)}
                </optgroup>
              )}
            </Select>
          </Field>
          <p className={target && !nikomu ? 'text-sm text-black/70' : 'note note-wait'} aria-live="polite">
            {!target
              ? `Teď to nedostane nikdo, ve výběru jsou 0 členů.${segmentInfo ? ` ${segmentInfo.popis}` : ''} Zkus jiný výběr, nebo pošli zprávu všem členům.`
              : nikomu
                ? `Ve výběru je ${czCount(target, CLEN)}, ale nikdo z nich nemá zapnuté novinky. Zpráva by nikam nedorazila.`
                : `Ve výběru je ${czCount(target, CLEN)}.${dosah ? ` Zprávu dostane ${czCount(dosah.souhlas, CLEN)}, ostatní si novinky nezapnuli.` : ''}${segmentInfo ? ` ${segmentInfo.popis}` : ''}`}
          </p>
          {smiPrilohy && (
            <Field id="bc-priloha" label="Připojit kupon nebo promo kód" hint="Vybereš jen existující. Uplatnění řeší kupony a promo kódy, zpráva host odkáže do Věrnosti.">
              <Select id="bc-priloha" value={f.priloha} onChange={e => setF({ ...f, priloha: e.target.value, linkKind: e.target.value && f.linkKind === 'page' ? 'loyalty' : f.linkKind })}>
                <option value="">Bez přílohy</option>
                {(d.prilohy.kupony ?? []).length > 0 && (
                  <optgroup label="Kupony">{d.prilohy.kupony.map((k: any) => <option key={k.id} value={`coupon:${k.id}`}>{k.title}</option>)}</optgroup>
                )}
                {(d.prilohy.promoKody ?? []).length > 0 && (
                  <optgroup label="Promo kódy">{d.prilohy.promoKody.map((p: any) => <option key={p.id} value={`promo:${p.id}`}>{p.code} · {p.title}</option>)}</optgroup>
                )}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="bc-link" label="Kam zpráva vezme">
              <Select id="bc-link" value={f.linkKind} onChange={e => setF({ ...f, linkKind: e.target.value })}>
                <option value="page">Na stránku podniku</option>
                <option value="loyalty">Na věrnost a kupony</option>
                <option value="order">Na objednávku od stolu</option>
                <option value="me">Na jeho kartičku (Moje)</option>
              </Select>
            </Field>
            <Field id="bc-at" label={editId !== null ? 'Odeslat v' : 'Odeslat (prázdné = hned)'} hint="Pražský čas, nejdál 90 dní dopředu.">
              <Input id="bc-at" type="datetime-local" value={f.scheduledAt} onChange={e => setF({ ...f, scheduledAt: e.target.value })} />
            </Field>
          </div>
          <p className={limitVycerpan && !naplanovano ? 'note note-wait' : 't-meta'}>
            {limitVycerpan
              ? `Dnes už odešlo ${ZPRAV_DENNE} zpráv, víc jich členům neposílej. Naplánuj zprávu na zítra.`
              : `Dnes odesláno ${odeslano} z ${d.limit?.max ?? ZPRAV_DENNE}. Naplánovaná zpráva se do limitu počítá až při odeslání.`}
            {' '}Zpráva se objeví i v Novinkách na tvé stránce pro hosty, ale jen když míří na všechny členy.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button type="submit" variant="primary" icon="send" loading={busy} disabled={!mozneOdeslat}>
              {editId !== null ? 'Uložit změny'
                : naplanovano ? `Naplánovat pro ${czCount(target, CLENA)}`
                : `Poslat ${czCount(target, CLENOVI)}`}
            </Button>
            <Button type="button" variant="secondary" icon="bell" loading={testuji} disabled={!f.title.trim()} onClick={() => { void zkouska(); }}>Poslat zkušebně sobě</Button>
          </div>
        </Card>
        <ZpravyNahled nazev={d.nazevPodniku} title={f.title} body={f.body} priloha={priloZvolena} linkKind={f.linkKind} />
      </div>
      <Card pad="none" aria-labelledby="bc-odeslane">
        <h2 id="bc-odeslane" className="t-card px-5 pt-4">Odeslané a naplánované</h2>
        {d.history.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState icon="mail" title="Zatím nic odeslaného" hint="První zpráva půjde všem, kdo se k podniku přidali. Než ji pošleš, vyzkoušej ji sám sobě." compact /></div>
        ) : (
          <>
            <ul className="list px-5">
              {d.history.map((h: any) => {
                const ucinek = h.status !== 'scheduled'
                  ? vetaUcinku(Number(h.visits_after) || 0, Number(h.visits_before) || 0, !!h.still_running, n => czCount(n, CLEN))
                  : null;
                const ceka = h.status === 'scheduled';
                const poCase = ceka && parseDbTime(h.scheduled_at) != null && parseDbTime(h.scheduled_at)!.getTime() <= Date.now();
                const muted = Number(h.muted) || 0;
                return (
                  <ListRow key={h.id} title={h.title}
                    meta={[
                      ceka ? `odejde ${dbTimeDayHM(h.scheduled_at)}` : `${dbTimeDayHM(h.sent_at)} · doručeno ${czCount(Number(h.recipients) || 0, CLENOVI)}${muted ? `, ${czCount(muted, HOST)} bez souhlasu` : ''}`,
                      komu(String(h.audience ?? '')), ucinek,
                    ].filter(Boolean).join(' · ')}
                    right={ceka ? <Chip tone="wait" size="sm">{poCase ? 'Čeká na limit' : 'Naplánováno'}</Chip> : undefined}
                    actions={ceka ? (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => nahraj(h)}>Upravit</Button>
                        <Button size="sm" variant="ghost" onClick={() => setRusim(h)}>Zrušit</Button>
                      </>
                    ) : undefined} />
                );
              })}
            </ul>
            <p className="t-meta px-5 pb-4 pt-1">Srovnání je po kalendářních dnech: sedm dní po dni odeslání proti sedmi dnům před ním, jen skutečné návštěvy a objednávky. Neříká, že za návštěvu může zpráva — říká, jestli se po ní něco pohnulo.</p>
          </>
        )}
      </Card>
      {potvrdit && (
        <Modal open onClose={() => setPotvrdit(false)} size="sm" title={editId !== null ? 'Uložit změny?' : naplanovano ? 'Naplánovat zprávu?' : 'Poslat zprávu?'}
          footer={<>
            <Button variant="secondary" onClick={() => setPotvrdit(false)}>Zpět</Button>
            <Button variant="primary" icon="send" onClick={() => { setPotvrdit(false); void odeslat(); }}>{editId !== null ? 'Uložit' : naplanovano ? 'Naplánovat' : 'Poslat'}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">
            „{f.title}" dostane až {czCount(dosah?.souhlas ?? target, CLEN)}{naplanovano ? ` ${casCesky(f.scheduledAt)}` : ' hned'}. {naplanovano ? 'Do odeslání jde zpráva upravit nebo zrušit.' : 'Odeslanou zprávu už vzít zpátky nejde.'}
          </p>
        </Modal>
      )}
      {rusim && (
        <Modal open onClose={() => setRusim(null)} size="sm" title="Zrušit naplánovanou zprávu?"
          footer={<>
            <Button variant="secondary" onClick={() => setRusim(null)}>Nechat</Button>
            <Button variant="danger-solid" onClick={() => { const h = rusim; setRusim(null); void zrusit(h); }}>Zrušit zprávu</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">„{rusim.title}" neodejde. Text se nezachová. Chceš ho jen změnit? Použij Upravit.</p>
        </Modal>
      )}
    </div>
  );
}
