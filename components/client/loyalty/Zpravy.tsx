'use client';

// Zprávy členům: oznámení v aplikaci a e-mail, publikum (úroveň, skupina, segment, kombinace), kupon nebo
// promo kód v příloze, náhled pohledem hosta, zkouška sobě, úprava naplánované zprávy a historie s doručením.

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Modal, Segmented, Select, Skeleton, Textarea, useLoad } from '../../ui';
import { DraftNote } from '../../ui/DraftNote';
import { czCount } from '@/lib/czech';
import { SEGMENTY, stitekPublika } from '@/lib/segmenty';
import { ctiKombinaci, stitekKombinace } from '@/lib/skupinyPravidla';
import { KANALY_ZPRAVY, vetaDosahu, type DosahZpravy, type KanalyZpravy } from '@/lib/zpravyKanaly';
import { apiMessage, okJson } from '@/lib/api';
import { useDraft } from '@/lib/useDraft';
import { dbTimeDayHM, parseDbTime } from '@/lib/pragueTime';
import { casZPole, CLEN, CLENOVI, EMAIL, j, type Hlaska } from './spolecne';
import KombinaceVyber from './KombinaceVyber';
import NahledZpravy from './NahledZpravy';
import Potvrdit from './Potvrdit';

const MIX = '__mix__';
const PRAZDNA = { title: '', body: '', audience: 'all', kombinace: '', linkKind: 'page', scheduledAt: '', channels: 'push' as KanalyZpravy, couponId: '', promoCode: '', vybrani: [] as number[] };
type Formular = typeof PRAZDNA;

/** ISO čas na hodnotu pole datetime-local (místní čas prohlížeče). */
function naMistniCas(v: unknown): string {
  const d = parseDbTime(v as any);
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Zpravy({ oznam, podnik = 'Tvůj podnik' }: { oznam: Hlaska; podnik?: string }) {
  const [f, setF] = useState<Formular>(PRAZDNA);
  const [busy, setBusy] = useState(false);
  const [zkousim, setZkousim] = useState(false);
  const [potvrdit, setPotvrdit] = useState(false);
  const [rusim, setRusim] = useState<any | null>(null);
  const [upravuji, setUpravuji] = useState<number | null>(null);
  const [dosah, setDosah] = useState<DosahZpravy | null>(null);
  const [dosahChyba, setDosahChyba] = useState(false);
  // Rozeslání jde stovkám zákazníků, takže se text píše rozmyšleně — a o to víc mrzí, když ho spolkne přechod na jinou záložku.
  const koncept = useDraft('rozeslani', f, setF, { vychozi: PRAZDNA });
  const { data: d, error, reload } = useLoad<any>('/api/client/admin/broadcast', raw => ({ ...raw, history: Array.isArray(raw?.history) ? raw.history : [], kupony: raw?.kupony ?? [], promo: raw?.promo ?? [], groups: raw?.groups ?? [] }));

  const publikum = f.audience === MIX ? f.kombinace : f.audience;
  const kanal = f.channels;
  const jeVyber = f.audience === 'vybrani';

  // Dosah: kolik lidí zprávu opravdu dostane přes zvolený kanál. Dotaz se zdrží, ať se neptá na každé písmeno kombinace.
  useEffect(() => {
    if (!d || !publikum) { setDosah(null); return; }
    let zije = true;
    setDosahChyba(false);
    const t = setTimeout(() => {
      const q = new URLSearchParams({ nahled: '1', audience: publikum, channels: kanal });
      if (jeVyber) q.set('vybrani', f.vybrani.join(','));
      fetch(`/api/client/admin/broadcast?${q}`).then(okJson)
        .then(r => { if (zije) setDosah(r.dosah ?? null); })
        .catch(() => { if (zije) { setDosah(null); setDosahChyba(true); } });
    }, 250);
    return () => { zije = false; clearTimeout(t); };
  }, [d, publikum, kanal, jeVyber, f.vybrani]);

  const moznostiKombinace = useMemo(() => !d ? [] : [
    ...SEGMENTY.map(s => ({ id: s.id, label: s.label, pocet: d.segments?.[s.id] ?? 0, skupina: 'Podle chování' })),
    { id: 'tier:silver', label: 'Stříbrní a výš', pocet: d.silver ?? 0, skupina: 'Podle úrovně' },
    { id: 'tier:gold', label: 'Zlatí a výš', pocet: d.gold ?? 0, skupina: 'Podle úrovně' },
    ...(d.platinum != null ? [{ id: 'tier:platinum', label: 'Platinoví hosté', pocet: d.platinum, skupina: 'Podle úrovně' }] : []),
    ...(d.groups ?? []).map((g: any) => ({ id: `group:${g.id}`, label: `Skupina ${g.name}`, pocet: g.members, skupina: 'Podle skupiny' })),
  ], [d]);

  const segmentInfo = SEGMENTY.find(x => x.id === f.audience);
  const naplanovano = !!f.scheduledAt && new Date(f.scheduledAt).getTime() > Date.now();
  const posilaPush = kanal !== 'email';
  const posilaMail = kanal !== 'push';
  const kuponNazev = d?.kupony.find((k: any) => String(k.id) === f.couponId)?.title ?? null;
  const telo = () => ({
    title: f.title, body: f.body, audience: publikum || 'all', linkKind: f.linkKind, scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : '',
    channels: f.channels, couponId: f.couponId || undefined, promoCode: f.promoCode || undefined, vybrani: jeVyber ? f.vybrani : undefined,
  });
  const dosazeni = dosah ? (posilaPush ? dosah.push : 0) + (posilaMail ? dosah.email : 0) : null;
  const pripraveno = !!f.title.trim() && !!publikum && (dosah ? dosah.publikum > 0 : true);
  const vetaPoctu = dosah ? vetaDosahu(dosah, kanal, n => czCount(n, CLEN)) : dosahChyba ? 'Dosah se nepodařilo spočítat. Zpráva jde odeslat i tak.' : publikum ? 'Počítám dosah…' : 'Vyber, komu zprávu poslat.';

  const reset = () => { koncept.hotovo(); setF(PRAZDNA); setUpravuji(null); };
  const odeslat = async () => {
    setBusy(true);
    try {
      if (upravuji != null) {
        await j('/api/client/admin/broadcast', { method: 'PATCH', body: JSON.stringify({ id: upravuji, ...telo() }) });
        oznam('Změny jsou uložené. Zpráva odejde ve svůj čas.');
      } else {
        const r = await j('/api/client/admin/broadcast', { method: 'POST', body: JSON.stringify(telo()) });
        oznam(r.scheduled ? 'Zpráva je naplánovaná — odejde ve svůj čas.' : `Odesláno ${czCount(r.broadcast.recipients, CLENOVI)}.`);
      }
      reset(); reload();
    } catch (err) { oznam(apiMessage(err, 'Zprávu se nepodařilo odeslat.'), 'bad'); }
    setBusy(false);
  };
  const zkouska = async () => {
    setZkousim(true);
    try {
      const r = await j('/api/client/admin/broadcast', { method: 'POST', body: JSON.stringify({ ...telo(), akce: 'test', scheduledAt: '' }) });
      const casti: string[] = [];
      if (r.push) casti.push('do aplikace');
      if (r.email) casti.push(r.email.sent ? `e-mailem na ${r.adresa}` : `e-mail se neodeslal: ${r.email.error ?? 'neznámá chyba'}`);
      oznam(r.email && !r.email.sent && !r.push ? `Zkouška nedorazila: ${r.email.error ?? 'e-mail se neodeslal'}.` : `Zkouška ti odešla ${casti.join(' a ')}.`, r.email && !r.email.sent ? 'bad' : 'ok');
    } catch (err) { oznam(apiMessage(err, 'Zkoušku se nepodařilo poslat.'), 'bad'); }
    setZkousim(false);
  };
  const zrusit = async (h: any) => {
    try { await j(`/api/client/admin/broadcast?id=${h.id}`, { method: 'DELETE' }); oznam('Zpráva zrušena.'); if (upravuji === h.id) reset(); reload(); }
    catch (err) { oznam(apiMessage(err, 'Zprávu se nepodařilo zrušit.'), 'bad'); }
  };
  const upravit = (h: any) => {
    const aud = String(h.audience ?? 'all');
    const jeMix = !!ctiKombinaci(aud, { skupiny: true });
    setF({
      title: String(h.title ?? ''), body: String(h.body ?? ''), audience: jeMix ? MIX : aud, kombinace: jeMix ? aud : '', linkKind: String(h.link_kind ?? 'page'),
      scheduledAt: naMistniCas(h.scheduled_at), channels: (h.channels as KanalyZpravy) ?? 'push', couponId: h.coupon_id ? String(h.coupon_id) : '', promoCode: String(h.promo_code ?? ''),
      vybrani: Array.isArray(h.audience_ids) ? h.audience_ids.map(Number) : [],
    });
    setUpravuji(Number(h.id));
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  if (error) return <ErrorState title="Zprávy se nenačetly" onRetry={reload} detail={error} />;
  if (!d) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-48" /></div>;
  const komu = (h: any) => {
    const a = String(h.audience ?? '');
    const g = d.groups.find((x: any) => `group:${x.id}` === a);
    if (a === 'vybrani') return `vybraní členové (${Array.isArray(h.audience_ids) ? h.audience_ids.length : 0})`;
    const k = ctiKombinaci(a, { skupiny: true });
    if (k) return stitekKombinace(k, Object.fromEntries(d.groups.map((x: any) => [x.id, x.name])));
    return stitekPublika(a, g?.name);
  };
  const doruceni = (h: any) => {
    if (h.status === 'scheduled') return null;
    const casti: string[] = [];
    const kn = String(h.channels ?? 'push');
    if (kn !== 'email') casti.push(`oznámení ${czCount(Number(h.push_count) || 0, CLEN)}`);
    if (kn !== 'push') {
      const celkem = Number(h.email_total) || 0, pos = Number(h.email_pos) || 0;
      const ok = Number(h.email_sent) || 0, chyb = Number(h.email_failed) || 0;
      casti.push(celkem === 0 ? 'e-mail nikomu (nikdo nesplnil podmínky)'
        : pos < celkem ? `e-maily se ještě odesílají (${pos} z ${celkem})`
        : `${czCount(ok, EMAIL)} odesláno${chyb > 0 ? `, ${czCount(chyb, EMAIL)} se nepodařilo` : ''}`);
    }
    if ((Number(h.no_consent) || 0) > 0) casti.push(`${czCount(Number(h.no_consent), CLEN)} bez souhlasu`);
    return casti.join(' · ');
  };
  const kanalInfo = KANALY_ZPRAVY.find(k => k.id === kanal);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 items-start">
      <div className="grid gap-4 min-w-0">
        <Card as="form" className="grid gap-4" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (pripraveno) setPotvrdit(true); }}>
          <div className="flex items-start gap-2">
            <h2 className="t-card flex-1">{upravuji != null ? 'Úprava naplánované zprávy' : 'Nová zpráva'}</h2>
            {upravuji != null && <Button size="sm" variant="ghost" onClick={reset}>Zahodit úpravy</Button>}
          </div>
          {upravuji == null && <DraftNote koncept={koncept} co="rozepsané rozeslání" />}
          <Field id="bc-title" label="Nadpis" hint={`${f.title.length} z 80 znaků`}>
            <Input id="bc-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Nový čaj z jarní sklizně" maxLength={80} autoComplete="off" />
          </Field>
          <Field id="bc-body" label="Text" hint={`${f.body.length} z 300 znaků. Nepovinné.`}>
            <Textarea id="bc-body" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} placeholder="Tento týden ochutnávka zdarma ke každé konvici." maxLength={300} rows={3} />
          </Field>
          <Field label="Kudy" hint={kanalInfo?.popis}>
            <Segmented size="sm" ariaLabel="Kanál zprávy" value={kanal} onChange={v => setF({ ...f, channels: v })}
              options={KANALY_ZPRAVY.map(k => ({ id: k.id, label: k.label }))} />
          </Field>
          <Field id="bc-aud" label="Komu">
            {jeVyber ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Chip tone="ink">Vybraní členové ({f.vybrani.length})</Chip>
                <span className="t-meta">Výběr z těch, které jsi označil v seznamu členů.</span>
              </div>
            ) : (
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
                    {(d.groups ?? []).map((g: any) => <option key={g.id} value={`group:${g.id}`}>Skupina {g.name} ({g.members}){g.dynamic ? ' · dynamická' : ''}</option>)}
                  </optgroup>
                )}
                <optgroup label="Složitější výběr">
                  <option value={MIX}>Kombinace podmínek…</option>
                </optgroup>
              </Select>
            )}
          </Field>
          {f.audience === MIX && <KombinaceVyber idPrefix="bc-mix" moznosti={moznostiKombinace} value={f.kombinace} onChange={k => setF(cur => (cur.kombinace === k ? cur : { ...cur, kombinace: k }))} />}
          <p className={dosah && dosah.publikum === 0 ? 'note note-wait' : 'text-sm text-black/70'} aria-live="polite">
            {vetaPoctu}{segmentInfo ? ` ${segmentInfo.popis}` : ''}
            {dosah && dosah.publikum > 0 && dosazeni === 0 ? ' Nikdo z nich teď zprávu nedostane. Zkus jiný kanál nebo výběr.' : ''}
            {dosah && dosah.blokovanych > 0 ? ` ${czCount(dosah.blokovanych, CLEN)} je zablokovaných, těm zprávy nechodí.` : ''}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="bc-kupon" label="Přiložit kupon" hint="Každý člen ve výběru ho dostane mezi své kupony, i bez souhlasu se zprávami.">
              <Select id="bc-kupon" value={f.couponId} onChange={e => setF({ ...f, couponId: e.target.value })}>
                <option value="">Bez kuponu</option>
                {d.kupony.map((k: any) => <option key={k.id} value={String(k.id)}>{k.title}</option>)}
              </Select>
            </Field>
            <Field id="bc-promo" label="Přiložit promo kód" hint="Kód se připíše do textu zprávy.">
              <Select id="bc-promo" value={f.promoCode} onChange={e => setF({ ...f, promoCode: e.target.value })}>
                <option value="">Bez kódu</option>
                {d.promo.map((k: any) => <option key={k.code} value={k.code}>{k.code} · {k.title}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="bc-link" label="Kam zpráva vezme">
              <Select id="bc-link" value={f.linkKind} onChange={e => setF({ ...f, linkKind: e.target.value })}>
                <option value="page">Na stránku podniku</option>
                <option value="loyalty">Na věrnost a kupony</option>
                <option value="order">Na objednávku od stolu</option>
                <option value="me">Na jeho kartičku (Moje)</option>
              </Select>
            </Field>
            <Field id="bc-at" label="Odeslat (prázdné = hned)" hint="Čas podle tvých hodin. Nejvýš 90 dní dopředu.">
              <Input id="bc-at" type="datetime-local" value={f.scheduledAt} onChange={e => setF({ ...f, scheduledAt: e.target.value })} />
            </Field>
          </div>
          <p className="t-meta">Zpráva se objeví i v Novinkách na tvé stránce pro hosty. Nejvýš pět zpráv za den, zkouška sobě se nepočítá.</p>
          <div className="flex gap-2 flex-wrap">
            <Button type="submit" variant="primary" icon="send" loading={busy} disabled={!pripraveno} className="flex-1 min-w-[12rem]">
              {upravuji != null ? 'Uložit změny'
                : naplanovano ? `Naplánovat pro ${czCount(dosah?.publikum ?? 0, { one: 'člena', few: 'členy', many: 'členů' })}`
                : `Poslat ${czCount(dosah?.publikum ?? 0, CLENOVI)}`}
            </Button>
            <Button type="button" variant="secondary" icon="mail" loading={zkousim} disabled={!f.title.trim()} onClick={() => { void zkouska(); }}>Poslat zkoušku sobě</Button>
          </div>
        </Card>
        <Card className="grid gap-3" aria-labelledby="bc-nahled">
          <h2 id="bc-nahled" className="t-card">Jak to uvidí host</h2>
          <NahledZpravy podnik={podnik} title={f.title} body={f.body} oznameni={posilaPush} email={posilaMail} kuponNazev={kuponNazev} promoKod={f.promoCode || null} />
        </Card>
      </div>
      <Card pad="none" aria-labelledby="bc-odeslane">
        <h2 id="bc-odeslane" className="t-card px-5 pt-4">Odeslané a naplánované</h2>
        {d.history.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState icon="mail" title="Zatím nic odeslaného" hint="První zpráva půjde všem, kdo se k podniku přidali a souhlasili s novinkami. Napiš ji vlevo, nejdřív si ji pošli jako zkoušku." compact /></div>
        ) : (
          <>
            <ul className="list px-5">
              {d.history.map((h: any) => {
                const po = Number(h.visits_after) || 0, pred = Number(h.visits_before) || 0, rozdil = po - pred;
                const ucinek = h.status !== 'scheduled' && (po > 0 || pred > 0)
                  ? `${h.still_running ? 'zatím ' : ''}${czCount(po, CLEN)} u kasy do 7 dní${pred > 0 ? `, předtím ${pred}` : ''}${rozdil !== 0 ? ` (${rozdil > 0 ? '+' : ''}${rozdil})` : ''}`
                  : null;
                return (
                  <ListRow key={h.id} title={h.title}
                    meta={[h.status === 'scheduled' ? `odejde ${dbTimeDayHM(h.scheduled_at)}` : `${dbTimeDayHM(h.sent_at)} · ${czCount(Number(h.recipients) || 0, CLEN)}`, komu(h), doruceni(h), ucinek].filter(Boolean).join(' · ')}
                    right={h.status === 'scheduled' ? <Chip tone="wait" size="sm">Naplánováno</Chip> : undefined}
                    actions={h.status === 'scheduled' ? <>
                      <Button size="sm" variant="ghost" onClick={() => upravit(h)} aria-label={`Upravit zprávu ${h.title}`}>Upravit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRusim(h)} aria-label={`Zrušit zprávu ${h.title}`}>Zrušit</Button>
                    </> : undefined} />
                );
              })}
            </ul>
            <p className="t-meta px-5 pb-4 pt-1">Srovnání sedmi dní po a před odesláním počítá jen návštěvy u kasy, jen mezi příjemci té zprávy. Neříká, že za návštěvu může zpráva — říká, jestli se po ní něco pohnulo.</p>
          </>
        )}
      </Card>
      {potvrdit && (
        <Modal open onClose={() => setPotvrdit(false)} size="sm" title={upravuji != null ? 'Uložit změny zprávy?' : naplanovano ? 'Naplánovat zprávu?' : 'Poslat zprávu?'}
          footer={<>
            <Button variant="secondary" onClick={() => setPotvrdit(false)}>Zpět k úpravě</Button>
            <Button type="submit" form="bc-potvrdit" variant="primary" icon="send">{upravuji != null ? 'Uložit' : naplanovano ? 'Naplánovat' : 'Poslat'}</Button>
          </>}>
          <form id="bc-potvrdit" onSubmit={e => { e.preventDefault(); setPotvrdit(false); void odeslat(); }} className="grid gap-2">
            <p className="text-sm text-black/70 text-pretty">
              „{f.title}" dostane {czCount(dosah?.publikum ?? 0, CLEN)}{naplanovano ? ` ${casZPole(f.scheduledAt)}` : upravuji != null ? '' : ' hned'}.
              {dosah ? ` ${vetaDosahu(dosah, kanal, n => czCount(n, CLEN))}` : ''}
              {kuponNazev ? ` Přiložený kupon: ${kuponNazev}.` : ''}
            </p>
            {upravuji == null && <p className="text-sm text-black/70">Odeslanou zprávu už vzít zpátky nejde.</p>}
          </form>
        </Modal>
      )}
      {rusim && (
        <Potvrdit title="Zrušit naplánovanou zprávu?" akce="Zrušit zprávu" onZavrit={() => setRusim(null)}
          text={`„${rusim.title}" neodejde. Text se nezachová.`} onPotvrdit={() => { const h = rusim; setRusim(null); void zrusit(h); }} />
      )}
    </div>
  );
}
