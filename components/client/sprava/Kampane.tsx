'use client';

// Kampaně → Zprávy (kolo 92, koncept B „F"): seznam odeslaných a naplánovaných zpráv s výsledkem
// a nová kampaň ve třech krocích v okně:
//   1. Komu  — uložené publikum (všichni, chování, úroveň, skupina, kombinace) s počtem a živým
//              „dostane N z M" (souhlas s novinkami, kanál, blokace) ze serveru;
//   2. Co    — nadpis, text, kanál, příloha (kupon / promo kód), kam host přijde; vedle náhled
//              v telefonu hosta;
//   3. Kontrola — shrnutí, odeslat hned nebo naplánovat, zkouška jen sobě.
// Výsledek je jen z reálných dat (/api/client/admin/broadcast): kolik příjemců přišlo k nám do 7 dní
// po odeslání proti 7 dnům předtím, doručení a e-maily. Otevření ani tržbu nemáme, tak je neukazujeme.
// Pravidla (limit pět zpráv denně, 90 dní dopředu, délky) hlídá server stejně jako dřív
// (lib/zpravyPravidla.ts); úprava naplánované zprávy jde stejným průvodcem.

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Modal, Rada, Segmented, Select, Skeleton, Textarea, useLoad, VolbaRadek } from '../../ui';
import { Icon } from '../../Icons';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { dbTimeDayHM, dbTimeHM, parseDbTime, pragueDayOf } from '@/lib/pragueTime';
import { SEGMENTY, jeSegment } from '@/lib/segmenty';
import { ZPRAV_DENNE, TITLE_MAX, BODY_MAX, type PrilohaZpravy } from '@/lib/zpravyPravidla';
import { KANALY_ZPRAVY, posilaEmail, posilaPush, type DosahZpravy, type KanalyZpravy } from '@/lib/zpravyKanaly';
import { ctiKombinaci, stitekKombinace } from '@/lib/skupinyPravidla';
import { apiMessage, okJson } from '@/lib/api';
import { useSirka } from '@/lib/klientSprava/useSirka';
import { j, type Hlaska } from '../import/typy';
import ZpravyNahled from '../loyalty/ZpravyNahled';
import { DraftNote } from '../../ui/DraftNote';
import { useDraft } from '@/lib/useDraft';
import KombinaceVyber from '../loyalty/KombinaceVyber';

const clen = (t: PrekladFn, n: number) => t('{n, plural, one {# člen} few {# členové} other {# členů}}', { n });
const clenovi = (t: PrekladFn, n: number) => t('{n, plural, one {# členovi} few {# členům} other {# členům}}', { n });
const hoste = (t: PrekladFn, n: number) => t('{n, plural, one {# host} few {# hosté} other {# hostů}}', { n });
const emailu = (t: PrekladFn, n: number) => t('{n, plural, one {# e-mail} few {# e-maily} other {# e-mailů}}', { n });
const MIX = '__mix__';
const KROKY = ['Komu', 'Co', 'Kontrola'] as const; // i18n-ok: id kroků, popisky v nazevKroku
const nazevKroku = (t: PrekladFn, k: (typeof KROKY)[number]) => (k === 'Komu' ? t('Komu') : k === 'Co' ? t('Co') : t('Kontrola')); // i18n-ok: porovnání s id kroku

/** Název publika pro historii kampaní (jako stitekPublika z lib/segmenty, jen v jazyce uživatele). */
function stitekPublikaT(a: string, nazevSkupiny: string | null, t: PrekladFn): string | null {
  if (a === 'selection') return t('vybraní hosté');
  const s = SEGMENTY.find(x => x.id === a);
  if (s) { const l = t(s.label); return l.charAt(0).toLowerCase() + l.slice(1); }
  if (a === 'tier:silver') return t('stříbrní a výš');
  if (a === 'tier:gold' || a === 'gold') return t('zlatí hosté');
  if (a === 'tier:platinum') return t('platinoví');
  if (a.startsWith('group:')) return nazevSkupiny ? t('skupina {nazev}', { nazev: nazevSkupiny }) : t('skupina');
  return null;
}
/** Věta o dosahu před odesláním (jako vetaDosahu z lib/zpravyKanaly, jen v jazyce uživatele). */
function vetaDosahuT(d: DosahZpravy, kanal: KanalyZpravy, t: PrekladFn): string {
  if (d.publikum === 0) return t('V tomhle výběru teď nikdo není.');
  const casti: string[] = [];
  if (posilaPush(kanal)) casti.push(t('oznámení dostane {kdo}', { kdo: clen(t, d.push) }));
  if (posilaEmail(kanal)) casti.push(t('e-mail dostane {kdo}', { kdo: clen(t, d.email) }));
  const zbytek = d.bezSouhlasu > 0 ? ` ${t('{kdo} nesouhlasí se zprávami, těm nepřijde nic.', { kdo: clen(t, d.bezSouhlasu) })}` : '';
  return `${t('Ve výběru je {kdo}', { kdo: clen(t, d.publikum) })}: ${casti.join(', ')}.${zbytek}`;
}

const PRAZDNA = { title: '', body: '', audience: 'all', kombinace: '', linkKind: 'page', scheduledAt: '', priloha: '', channels: 'push' as KanalyZpravy, kdy: 'hned' as 'hned' | 'pozdeji' };
type Zprava = typeof PRAZDNA;

const cile = (t: PrekladFn): { id: string; label: string }[] => [
  { id: 'page', label: t('Stránka podniku') },
  { id: 'loyalty', label: t('Věrnost a kupony') },
  { id: 'order', label: t('Objednávka od stolu') },
  { id: 'me', label: t('Jeho karta') },
];

function casCesky(lokalni: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(lokalni);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]} ${m[4]}` : lokalni;
}
function doPoleCasu(v: unknown): string {
  const d = parseDbTime(v as string);
  return d ? `${pragueDayOf(d)}T${dbTimeHM(v as string)}` : '';
}
function prilohaZpravy(d: any, volba: string): PrilohaZpravy | null {
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

interface Publikum { id: string; label: string; pocet: number; skupina: string }

export default function Kampane({ oznam, otevritNovou }: { oznam: Hlaska; otevritNovou: number }) {
  const t = useT('sprava');
  const { data: d, error, reload } = useLoad<any>('/api/client/admin/broadcast', raw => ({ ...raw, history: Array.isArray(raw?.history) ? raw.history : [] }));
  const [pruvodce, setPruvodce] = useState<{ f: Zprava; editId: number | null } | null>(null);
  const [rusim, setRusim] = useState<any | null>(null);
  const tabulka = useSirka(768);
  useEffect(() => { if (otevritNovou > 0) setPruvodce({ f: PRAZDNA, editId: null }); }, [otevritNovou]);

  const publika = useMemo<Publikum[]>(() => !d ? [] : [
    { id: 'all', label: t('Všichni členové'), pocet: d.members ?? 0, skupina: '' },
    ...SEGMENTY.map(x => ({ id: x.id, label: t(x.label), pocet: d.segments?.[x.id] ?? 0, skupina: t('Podle chování') })),
    { id: 'tier:silver', label: t('Stříbrní a výš'), pocet: d.silver ?? 0, skupina: t('Podle úrovně') },
    { id: 'tier:gold', label: t('Zlatí a výš'), pocet: d.gold ?? 0, skupina: t('Podle úrovně') },
    ...(d.platinum != null ? [{ id: 'tier:platinum', label: t('Platinoví hosté'), pocet: d.platinum, skupina: t('Podle úrovně') }] : []),
    ...(d.groups ?? []).map((g: any) => ({ id: `group:${g.id}`, label: t('Skupina {nazev}', { nazev: g.name }), pocet: Number(g.members) || 0, skupina: t('Podle skupiny') })),
  ], [d, t]);

  if (error) return <ErrorState title={t('Kampaně se nenačetly')} onRetry={reload} detail={error} />;
  if (!d) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-48" /></div>;

  const komu = (a: string) => {
    const k = ctiKombinaci(a, { skupiny: true });
    const skupina = /^group:(\d+)$/.exec(a);
    const nazev = skupina ? (d.groups ?? []).find((x: any) => String(x.id) === skupina[1])?.name ?? null : null;
    return k ? stitekKombinace(k, Object.fromEntries((d.groups ?? []).map((x: any) => [x.id, x.name]))) : (stitekPublikaT(a, nazev, t) ?? t('všichni členové'));
  };
  const upravit = (h: any) => {
    const aud = String(h.audience ?? 'all');
    const jeMix = !!ctiKombinaci(aud, { skupiny: true });
    let volba = h.coupon_id ? `coupon:${h.coupon_id}` : h.promo_id ? `promo:${h.promo_id}` : '';
    if (volba && !prilohaZpravy(d, volba)) { oznam(t('Připojený kupon nebo promo kód už neplatí, ze zprávy se odebral.'), 'bad'); volba = ''; }
    setPruvodce({
      editId: Number(h.id),
      f: {
        title: String(h.title ?? ''), body: String(h.body ?? ''), audience: jeMix ? MIX : aud, kombinace: jeMix ? aud : '',
        linkKind: String(h.link_kind ?? 'page'), scheduledAt: doPoleCasu(h.scheduled_at), priloha: volba,
        channels: (KANALY_ZPRAVY.some(k => k.id === h.channels) ? h.channels : 'push') as KanalyZpravy, kdy: 'pozdeji',
      },
    });
  };
  const zrusit = async (h: any) => {
    try { await j(`/api/client/admin/broadcast?id=${h.id}`, { method: 'DELETE' }); oznam(t('Kampaň zrušena.')); reload(); }
    catch (err) { oznam(apiMessage(err, t('Kampaň se nepodařilo zrušit.')), 'bad'); reload(); }
  };

  const odeslane = d.history.filter((h: any) => h.status !== 'scheduled');
  const naplanovane = d.history.filter((h: any) => h.status === 'scheduled');
  const kanalText = (k: string) => t(KANALY_ZPRAVY.find(x => x.id === k)?.label ?? 'Oznámení v aplikaci');
  /** Stav e-mailů odeslané kampaně (dávky, neúspěchy) — jen u kanálu s e-mailem. */
  const emailInfo = (h: any): string | null => {
    const kn = String(h.channels ?? 'push');
    if (kn === 'push') return null;
    const celkem = Number(h.email_total) || 0, pos = Number(h.email_pos) || 0;
    if (celkem === 0) return t('e-mail nikomu');
    if (pos < celkem) return t('e-maily se odesílají ({n} z {celkem})', { n: pos, celkem });
    return `${t('{kolik} odesláno', { kolik: emailu(t, Number(h.email_sent) || 0) })}${Number(h.email_failed) > 0 ? `, ${t('{kolik} se nepodařilo', { kolik: emailu(t, Number(h.email_failed)) })}` : ''}`;
  };

  return (
    <div className="space-y-5">
      {d.history.length === 0 ? (
        <Card>
          <EmptyState icon="send" title={t('Zatím žádná kampaň')}
            hint={t('Vyber hosty, napiš pár vět a pošli. Uvidíš, kolik z nich do týdne přišlo.')}
            action={<Button variant="primary" icon="plus" onClick={() => setPruvodce({ f: PRAZDNA, editId: null })}>{t('Nová kampaň')}</Button>} />
        </Card>
      ) : (
        <>
          {naplanovane.length > 0 && (
            <Card pad="none" aria-labelledby="kp-plan">
              <h2 id="kp-plan" className="t-card px-4 sm:px-5 pt-4">{t('Naplánované')}</h2>
              <ul className="list px-4 sm:px-5">
                {naplanovane.map((h: any) => {
                  const poCase = parseDbTime(h.scheduled_at) != null && parseDbTime(h.scheduled_at)!.getTime() <= Date.now();
                  return (
                    <ListRow key={h.id} title={h.title}
                      meta={`${t('odejde {kdy}', { kdy: dbTimeDayHM(h.scheduled_at) })} · ${komu(String(h.audience ?? ''))} · ${kanalText(String(h.channels ?? 'push'))}`}
                      right={<Chip tone="wait" size="sm">{poCase ? t('Čeká na limit') : t('Naplánováno')}</Chip>}
                      actions={<>
                        <Button size="sm" variant="secondary" aria-label={t('Upravit kampaň {nazev}', { nazev: h.title })} onClick={() => upravit(h)}>{t('Upravit')}</Button>
                        <Button size="sm" variant="ghost" aria-label={t('Zrušit kampaň {nazev}', { nazev: h.title })} onClick={() => setRusim(h)}>{t('Zrušit')}</Button>
                      </>} />
                  );
                })}
              </ul>
            </Card>
          )}
          {odeslane.length > 0 && (
            <Card pad="none" aria-labelledby="kp-odeslane">
              <div className="px-4 sm:px-5 pt-4">
                <h2 id="kp-odeslane" className="t-card">{t('Odeslané')}</h2>
                <p className="t-meta mt-0.5">{t('Přišli = příjemci, kteří byli u kasy do 7 dní po odeslání. V závorce týden předtím.')}</p>
              </div>
              {/* Monitor: tabulka s čísly na pravé hraně; telefon: řádky seznamu (hodnota vpravo, P15). */}
              {tabulka ? <div className="px-5 pt-2 pb-2">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="t-label text-left">
                      <th className="font-medium py-2 pr-3">{t('Kampaň')}</th>
                      <th className="font-medium py-2 pr-3">{t('Publikum')}</th>
                      <th className="font-medium py-2 pr-3">{t('Kanál')}</th>
                      <th className="font-medium py-2 pr-3 text-right">{t('Doručeno')}</th>
                      <th className="font-medium py-2 text-right">{t('Přišli do 7 dní')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {odeslane.map((h: any) => {
                      const po = Number(h.visits_after) || 0, pred = Number(h.visits_before) || 0;
                      return (
                        <tr key={h.id} className="border-t border-black/[0.06] align-top">
                          <td className="py-3 pr-3 min-w-0"><p className="font-medium text-[15px] leading-snug">{h.title}</p><p className="t-meta">{dbTimeDayHM(h.sent_at)}</p></td>
                          <td className="py-3 pr-3 text-black/70">{komu(String(h.audience ?? ''))}</td>
                          <td className="py-3 pr-3 text-black/70">{kanalText(String(h.channels ?? 'push'))}{emailInfo(h) && <span className="block t-meta">{emailInfo(h)}</span>}</td>
                          <td className="py-3 pr-3 text-right">{Number(h.recipients) || 0}{Number(h.muted) > 0 && <span className="block t-meta">{t('{n} bez souhlasu', { n: Number(h.muted) })}</span>}</td>
                          <td className="py-3 text-right font-semibold">
                            {po}{pred > 0 && <span className="font-normal text-black/55"> ({pred})</span>}
                            {h.still_running && <span className="block t-meta font-normal">{t('měří se')}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div> : (
              <ul className="list px-4">
                {odeslane.map((h: any) => {
                  const po = Number(h.visits_after) || 0, pred = Number(h.visits_before) || 0;
                  return (
                    <ListRow key={h.id} title={h.title}
                      meta={[dbTimeDayHM(h.sent_at), komu(String(h.audience ?? '')), t('doručeno {n}', { n: Number(h.recipients) || 0 }), emailInfo(h)].filter(Boolean).join(' · ')}
                      value={t('{n} přišlo', { n: po })} valueMeta={pred > 0 ? t('předtím {n}', { n: pred }) : h.still_running ? t('měří se') : undefined} />
                  );
                })}
              </ul>)}
            </Card>
          )}
        </>
      )}
      {pruvodce && (
        <Pruvodce d={d} publika={publika} start={pruvodce.f} editId={pruvodce.editId} oznam={oznam}
          onZavrit={() => setPruvodce(null)} onHotovo={() => { setPruvodce(null); reload(); }} />
      )}
      {rusim && (
        <Modal open onClose={() => setRusim(null)} size="sm" title={t('Zrušit naplánovanou kampaň?')}
          footer={<>
            <Button variant="secondary" onClick={() => setRusim(null)}>{t('Nechat')}</Button>
            <Button variant="danger-solid" onClick={() => { const h = rusim; setRusim(null); void zrusit(h); }}>{t('Zrušit kampaň')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{t('„{nazev}" neodejde. Chceš ji jen změnit? Použij Upravit.', { nazev: rusim.title })}</p>
        </Modal>
      )}
    </div>
  );
}

// ---- Průvodce: Komu · Co · Kontrola ------------------------------------------------

function Pruvodce({ d, publika, start, editId, oznam, onZavrit, onHotovo }: {
  d: any; publika: Publikum[]; start: Zprava; editId: number | null; oznam: Hlaska; onZavrit: () => void; onHotovo: () => void;
}) {
  const t = useT('sprava');
  const [krok, setKrok] = useState(0);
  const [f, setF] = useState<Zprava>(start);
  // Rozepsaná NOVÁ kampaň přežije přechod jinam i zavření průvodce (jako dřív rozeslání ve Zprávách):
  // jde stovkám hostů, píše se rozmyšleně. Úprava naplánované kampaně koncept nemá.
  const koncept = useDraft('rozeslani', f, setF, { vychozi: PRAZDNA, aktivni: editId === null, upravujeSe: editId !== null });
  const [busy, setBusy] = useState(false);
  const [testuji, setTestuji] = useState(false);
  const [dosah, setDosah] = useState<{ pocet: number; souhlas: number; dosah: DosahZpravy | null } | null>(null);
  const publikum = f.audience === MIX ? f.kombinace : f.audience;
  const kanal = f.channels;

  // Živý počet: kolik z publika zprávu opravdu dostane zvoleným kanálem (souhlas, e-mail, blokace).
  useEffect(() => {
    if (!publikum) { setDosah(null); return; }
    let zije = true;
    setDosah(null);
    const c = setTimeout(() => {
      fetch(`/api/client/admin/broadcast?dosah=${encodeURIComponent(publikum)}&kanal=${kanal}`).then(okJson)
        .then(r => { if (zije) setDosah({ pocet: Number(r.pocet) || 0, souhlas: Number(r.souhlas) || 0, dosah: r.dosah ?? null }); })
        .catch(() => { if (zije) setDosah(null); });
    }, 200);
    return () => { zije = false; clearTimeout(c); };
  }, [publikum, kanal]);

  const vybrane = publika.find(p => p.id === f.audience);
  const target = f.audience === MIX ? (dosah?.pocet ?? 0) : (vybrane?.pocet ?? 0);
  const dostane = dosah?.dosah ? (kanal !== 'email' ? dosah.dosah.push : 0) + (kanal !== 'push' ? dosah.dosah.email : 0) : (dosah?.souhlas ?? null);
  const naplanovano = f.kdy === 'pozdeji' && !!f.scheduledAt && new Date(f.scheduledAt).getTime() > Date.now() + 60_000;
  const odeslanoDnes = Number(d?.limit?.odeslano) || 0;
  const limitVycerpan = odeslanoDnes >= (Number(d?.limit?.max) || ZPRAV_DENNE);
  const priloha = prilohaZpravy(d, f.priloha);
  const segmentInfo = jeSegment(f.audience) ? SEGMENTY.find(x => x.id === f.audience) : null;

  const telo = (extra: Record<string, unknown> = {}) => ({
    title: f.title, body: f.body, audience: publikum || 'all', linkKind: f.linkKind, scheduledAt: f.kdy === 'pozdeji' ? (f.scheduledAt || null) : null, channels: f.channels,
    couponId: f.priloha.startsWith('coupon:') ? Number(f.priloha.slice(7)) : null,
    promoId: f.priloha.startsWith('promo:') ? Number(f.priloha.slice(6)) : null,
    ...extra,
  });
  const odeslat = async () => {
    setBusy(true);
    try {
      if (editId !== null) {
        await j('/api/client/admin/broadcast', { method: 'PATCH', body: JSON.stringify(telo({ id: editId })) });
        oznam(t('Změny uloženy. Kampaň odejde v novém čase.'));
      } else {
        const r = await j('/api/client/admin/broadcast', { method: 'POST', body: JSON.stringify(telo()) });
        if (r.scheduled) oznam(t('Kampaň je naplánovaná. Do odeslání jde upravit nebo zrušit.'));
        else {
          const zt = Number(r.ztlumeno) || 0;
          oznam(`${t('Odesláno {komu}.', { komu: clenovi(t, Number(r.doruceno) || 0) })}${zt ? ` ${t('{kdo} má novinky vypnuté.', { kdo: hoste(t, zt) })}` : ''}`);
        }
        koncept.hotovo();
      }
      onHotovo();
    } catch (err) { oznam(apiMessage(err, t('Kampaň se nepodařilo odeslat.')), 'bad'); }
    setBusy(false);
  };
  const zkouska = async () => {
    setTestuji(true);
    try {
      const r = await j('/api/client/admin/broadcast', { method: 'POST', body: JSON.stringify(telo({ action: 'test', scheduledAt: null })) });
      const emailSelhal = !!r.email && !r.email.sent;
      oznam(emailSelhal && !r.push ? t('Zkouška nedorazila: {duvod}.', { duvod: r.email.error ?? t('e-mail se neodeslal') }) : t('Zkouška odešla jen tobě.'), emailSelhal ? 'bad' : 'ok');
    } catch (err) { oznam(apiMessage(err, t('Zkoušku se nepodařilo odeslat.')), 'bad'); }
    setTestuji(false);
  };

  const muzeDal = krok === 0 ? !!publikum && target > 0
    : krok === 1 ? !!f.title.trim()
    : (f.kdy === 'hned' ? !limitVycerpan || editId !== null : naplanovano);
  const vetaPublika = !publikum ? t('Vyber, komu kampaň půjde.')
    : target === 0 ? t('V tomhle výběru teď nikdo není.')
    : dosah?.dosah ? vetaDosahuT(dosah.dosah, kanal, t)
    : `${t('Ve výběru je {kdo}', { kdo: clen(t, target) })}.`;

  const skupiny = [...new Set(publika.map(p => p.skupina))];
  return (
    <Modal open onClose={onZavrit} size="lg"
      title={editId !== null ? t('Upravit kampaň') : krok === 0 ? t('Komu to pošleme') : krok === 1 ? t('Co jim napíšeme') : t('Zkontroluj a pošli')}
      footer={<>
        {krok === 0 ? <Button variant="secondary" onClick={onZavrit}>{t('Zrušit')}</Button> : <Button variant="secondary" icon="arrowLeft" onClick={() => setKrok(k => k - 1)}>{t('Zpět')}</Button>}
        {krok < 2
          ? <Button variant="primary" disabled={!muzeDal} onClick={() => setKrok(k => k + 1)}>{krok === 0 ? t('Pokračovat k textu') : t('Pokračovat ke kontrole')}</Button>
          : <Button variant="primary" icon="send" loading={busy} disabled={!muzeDal} onClick={() => { void odeslat(); }}>
              {editId !== null ? t('Uložit změny') : naplanovano ? t('Naplánovat') : t('Poslat {komu}', { komu: clenovi(t, dostane ?? target) })}
            </Button>}
      </>}>
      {editId === null && <div className="mb-4 empty:hidden"><DraftNote koncept={koncept} co="rozepsané rozeslání" /* i18n-ok: id věty, překládá DraftNote */ /></div>}
      {/* Ukazatel kroků: tři díly přes šířku (P2), hotové a aktuální inkoustem. */}
      <ol className="grid grid-cols-3 gap-2 mb-6" aria-label={t('Kroky kampaně')}>
        {KROKY.map((k, i) => (
          <li key={k} aria-current={i === krok ? 'step' : undefined} className="min-w-0">
            <span className={`block h-1 rounded-full ${i <= krok ? 'bg-[#16181A]' : 'bg-black/10'}`} />
            <span className={`block mt-1.5 text-[13px] font-medium ${i === krok ? 'text-[#16181A]' : 'text-black/50'}`}>{nazevKroku(t, k)}</span>
          </li>
        ))}
      </ol>

      {krok === 0 && (
        <div className="space-y-5">
          {skupiny.map(sk => (
            <div key={sk || 'vse'} className="space-y-2">
              {sk && <p className="t-label">{sk}</p>}
              <div className="space-y-2" role="group" aria-label={sk || t('Všichni')}>
                {publika.filter(p => p.skupina === sk).map(p => (
                  <VolbaRadek key={p.id} vybrano={f.audience === p.id} onClick={() => setF({ ...f, audience: p.id })}
                    titul={p.label} hodnota={p.pocet} disabled={p.pocet === 0 && f.audience !== p.id} />
                ))}
              </div>
            </div>
          ))}
          <div className="space-y-2">
            <p className="t-label">{t('Složitější výběr')}</p>
            <VolbaRadek vybrano={f.audience === MIX} onClick={() => setF({ ...f, audience: MIX })} titul={t('Kombinace podmínek…')} ikona="settings" />
            {f.audience === MIX && (
              <KombinaceVyber idPrefix="kp-mix" moznosti={publika.filter(p => p.id !== 'all')} value={f.kombinace}
                onChange={k => setF(cur => (cur.kombinace === k ? cur : { ...cur, kombinace: k }))} />
            )}
          </div>
          <p className={target > 0 ? 'text-sm text-black/70' : 'note note-wait'} aria-live="polite">
            {vetaPublika}{segmentInfo ? ` ${t(segmentInfo.popis)}` : ''}
          </p>
        </div>
      )}

      {krok === 1 && (
        <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,16rem)] items-start">
          <div className="sloupec sloupec-4 min-w-0">
            <Field id="kp-title" label={t('Nadpis')} hint={t('{n} z {max} znaků', { n: f.title.length, max: TITLE_MAX })}>
              <Input id="kp-title" value={f.title} autoFocus onChange={e => setF({ ...f, title: e.target.value })} placeholder={t('Tento týden dvojitá razítka')} maxLength={TITLE_MAX} />
            </Field>
            <Field id="kp-body" label={t('Text')} hint={t('{n} z {max} znaků', { n: f.body.length, max: BODY_MAX })}>
              <Textarea id="kp-body" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} placeholder={t('Dlouho jsme se neviděli. Do neděle u nás máš dvojitá razítka.')} maxLength={BODY_MAX} rows={4} />
            </Field>
            <Field label={t('Kudy')} hint={t(KANALY_ZPRAVY.find(k => k.id === kanal)?.popis ?? '')}>
              <Segmented size="sm" ariaLabel={t('Kanál kampaně')} value={kanal} onChange={v => setF({ ...f, channels: v })}
                options={KANALY_ZPRAVY.map(k => ({ id: k.id, label: t(k.label) }))} />
            </Field>
            {d.prilohy && (
              <Field id="kp-priloha" label={t('Připojit kupon nebo promo kód')}>
                <Select id="kp-priloha" value={f.priloha} onChange={e => setF({ ...f, priloha: e.target.value, linkKind: e.target.value && f.linkKind === 'page' ? 'loyalty' : f.linkKind })}>
                  <option value="">{t('Bez přílohy')}</option>
                  {(d.prilohy.kupony ?? []).length > 0 && <optgroup label={t('Kupony')}>{d.prilohy.kupony.map((k: any) => <option key={k.id} value={`coupon:${k.id}`}>{k.title}</option>)}</optgroup>}
                  {(d.prilohy.promoKody ?? []).length > 0 && <optgroup label={t('Promo kódy')}>{d.prilohy.promoKody.map((p: any) => <option key={p.id} value={`promo:${p.id}`}>{p.code} · {p.title}</option>)}</optgroup>}
                </Select>
              </Field>
            )}
            <Field id="kp-link" label={t('Kam host po klepnutí přijde')}>
              <Select id="kp-link" value={f.linkKind} onChange={e => setF({ ...f, linkKind: e.target.value })}>
                {cile(t).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="min-w-0">
            <p className="t-label mb-2">{t('Náhled v telefonu hosta')}</p>
            <ZpravyNahled nazev={d.nazevPodniku} title={f.title || t('Nadpis kampaně')} body={f.body} priloha={priloha} linkKind={f.linkKind} oznameni={kanal !== 'email'} email={kanal !== 'push'} />
          </div>
        </div>
      )}

      {krok === 2 && (
        <div className="space-y-5">
          <ul className="list">
            <ListRow title={t('Komu')} meta={f.audience === MIX ? t('kombinace podmínek') : vybrane?.label} value={dostane ?? target} valueMeta={dostane != null && dostane !== target ? t('z {n}', { n: target }) : undefined} />
            <ListRow title={t('Kanál')} meta={t(KANALY_ZPRAVY.find(k => k.id === kanal)?.label ?? '')} />
            <ListRow title={f.title} meta={f.body || t('Bez textu')} />
            {priloha && <ListRow title={t('Příloha')} meta={priloha.kupon ? t('Kupon {nazev}', { nazev: priloha.kupon.title }) : priloha.promo ? t('Promo kód {kod}', { kod: priloha.promo.code }) : ''} />}
          </ul>
          <p className="text-sm text-black/70" aria-live="polite">{vetaPublika}</p>
          <div className="space-y-3">
            <p className="field-label">{t('Kdy')}</p>
            <Segmented ariaLabel={t('Kdy kampaň odejde')} value={f.kdy} onChange={v => setF({ ...f, kdy: v })}
              options={[{ id: 'hned', label: t('Hned') }, { id: 'pozdeji', label: t('Naplánovat') }]} />
            {f.kdy === 'pozdeji' && (
              <Field id="kp-at" label={t('Odeslat v')} hint={t('Pražský čas, nejdál 90 dní dopředu.')}>
                <Input id="kp-at" type="datetime-local" value={f.scheduledAt} onChange={e => setF({ ...f, scheduledAt: e.target.value })} />
              </Field>
            )}
            <p className={limitVycerpan && f.kdy === 'hned' ? 'note note-wait' : 't-meta'}>
              {limitVycerpan
                ? t('Dnes už odešlo {n} zpráv. Naplánuj kampaň na zítra.', { n: ZPRAV_DENNE })
                : naplanovano ? t('Odejde {kdy}. Do té doby jde upravit nebo zrušit.', { kdy: casCesky(f.scheduledAt) })
                : t('Dnes odesláno {n} z {max}. Odeslanou kampaň už vzít zpátky nejde.', { n: odeslanoDnes, max: d.limit?.max ?? ZPRAV_DENNE })}
            </p>
          </div>
          <Rada vyska="m">
            <Button variant="secondary" icon="bell" loading={testuji} disabled={!f.title.trim()} onClick={() => { void zkouska(); }}>{t('Poslat zkušebně sobě')}</Button>
          </Rada>
          <p className="t-meta flex items-start gap-1.5"><Icon name="info" size={14} className="mt-0.5 shrink-0" />{t('Výsledek uvidíš v seznamu: kolik příjemců přišlo do 7 dní.')}</p>
        </div>
      )}
    </Modal>
  );
}
