'use client';

// Promo bannery podniku (Vzhled → Bannery): akce a oznámení, které host uvidí jako karusel nahoře na
// stránce podniku. Seznam s přepínačem aktivní, řazením, duplikací, archivem a statistikou za 30 dní
// (zobrazení, prokliky, proklikovost), formulář s cílením (komu se banner ukáže), odkazem na konkrétní kupon
// nebo razítkovou kartu a náhledem. Pravidla (https odkazy, délky, platnost, cílení) hlídá lib/bannery.ts
// na serveru i tady. Aktivní se hostovi ukáže nejvýš pět, podle pořadí, po uplatnění cílení.
// Komponenta správy: texty natvrdo česky (bez t()).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../Icons';
import { Button, Card, Chip, ErrorState, Field, Input, Select, Skeleton, Switch, SwitchRow, Textarea } from '../../ui';
import PromoBanners from '../PromoBanners';
import { okJson, apiMessage } from '@/lib/api';
import { czCount, type CzNoun } from '@/lib/czech';
import { pragueToday } from '@/lib/pragueTime';
import {
  CILE, CIL_LABELS, LINK_KINDS, LINK_LABELS, MAX_AKTIVNICH, MAX_BANNERU, popisCile, presunBanner, procNeukazuje, validujBanner, vyberAktivni,
  type SouhrnBanneru,
} from '@/lib/bannery';

interface Row {
  id: number; title: string; text: string; image_url: string | null; link_kind: string; link_ref: string | null;
  active: boolean; valid_since: string | null; valid_until: string | null; position: number;
  target_kind?: string | null; target_ref?: string | null; archived?: boolean | null;
}
const PRAZDNY = { title: '', text: '', image_url: '', link_kind: 'none', link_ref: '', valid_since: '', valid_until: '', active: true, target_kind: 'all', target_ref: '' };
type Draft = typeof PRAZDNY;

const ZOBRAZENI: CzNoun = { one: 'zobrazení', few: 'zobrazení', many: 'zobrazení' };
const PROKLIK: CzNoun = { one: 'proklik', few: 'prokliky', many: 'prokliků' };

const iconBtn = 'tap-target-sm h-9 w-9 grid place-items-center rounded-full hover:bg-black/[0.06] disabled:opacity-30';

export default function BanneryEditor({ toast, upload, accent }: { toast: (m: string) => void; upload: (f: File) => Promise<string>; accent: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [urovne, setUrovne] = useState<Record<string, string>>({});
  const [stat, setStat] = useState<Record<string, SouhrnBanneru>>({});
  const [dni, setDni] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: number | null; d: Draft } | null>(null);
  const [busy, setBusy] = useState('');
  const dnes = useMemo(() => pragueToday(), []);

  const load = useCallback(() => {
    setError(null);
    fetch('/api/client/admin/banners').then(okJson)
      .then(d => {
        setRows(d.banners ?? []); setEvents(d.events ?? []); setCoupons(d.coupons ?? []); setCampaigns(d.campaigns ?? []);
        setGroups(d.groups ?? []); setUrovne(d.urovne ?? {}); setStat(d.statistiky ?? {}); setDni(d.dniStatistiky ?? 30);
      })
      .catch((e: any) => setError(apiMessage(e, 'Načtení se nepovedlo')));
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (method: string, body?: any, query = '') => {
    const r = await fetch(`/api/client/admin/banners${query}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Uložení se nepovedlo.');
    return d;
  };

  const aktivni = (rows ?? []).filter(r => !r.archived);
  const archiv = (rows ?? []).filter(r => r.archived);

  const prepni = async (b: Row, active: boolean) => {
    setRows(rs => rs && rs.map(x => x.id === b.id ? { ...x, active } : x));
    try { await call('PATCH', { id: b.id, active }); }
    catch (e: any) { toast(e.message); load(); }
  };
  /** Pořadí se posílá celé (aktivní podle seznamu, archivované za nimi): server odmítne neúplný seznam. */
  const poslatPoradi = async (ids: number[]) => {
    const byId = new Map((rows ?? []).map(r => [r.id, r]));
    setRows(ids.map(i => byId.get(i)!).filter(Boolean));
    try { await call('PATCH', { order: ids }); }
    catch (e: any) { toast(e.message); load(); }
  };
  const posun = (id: number, smer: -1 | 1) => {
    const ids = presunBanner(aktivni.map(r => r.id), id, smer);
    void poslatPoradi([...ids, ...archiv.map(r => r.id)]);
  };
  const duplikuj = async (b: Row) => {
    setBusy(`dup${b.id}`);
    try { const d = await call('PATCH', { id: b.id, action: 'duplicate' }); setRows(rs => [...(rs ?? []), d.banner]); toast('Kopie je hotová jako koncept. Uprav ji a zapni.'); }
    catch (e: any) { toast(e.message); }
    setBusy('');
  };
  const archivuj = async (b: Row, archive: boolean) => {
    setBusy(`arch${b.id}`);
    try {
      const d = await call('PATCH', { id: b.id, action: archive ? 'archive' : 'restore' });
      setRows(rs => rs && rs.map(x => x.id === b.id ? d.banner : x));
      toast(archive ? 'Banner je v archivu.' : 'Banner je zpátky jako koncept. Zapni ho přepínačem.');
    } catch (e: any) { toast(e.message); }
    setBusy('');
  };
  const smaz = async (b: Row) => {
    if (!window.confirm(`Smazat banner „${b.title}“? Smaže se i jeho statistika.`)) return;
    try { await call('DELETE', undefined, `?id=${b.id}`); setRows(rs => rs && rs.filter(x => x.id !== b.id)); toast('Banner smazán.'); }
    catch (e: any) { toast(e.message); }
  };
  const ulozit = async () => {
    if (!edit) return;
    const v = validujBanner(edit.d);
    if (!v.ok) { toast(v.chyba); return; }
    setBusy('save');
    try {
      const body = { ...edit.d, image_url: edit.d.image_url || null };
      const d = edit.id == null ? await call('POST', body) : await call('PATCH', { id: edit.id, ...body });
      setRows(rs => {
        const list = rs ?? [];
        return edit.id == null ? [...list, d.banner] : list.map(x => x.id === edit.id ? d.banner : x);
      });
      setEdit(null); toast(edit.id == null ? (edit.d.active ? 'Banner přidán.' : 'Koncept uložen.') : 'Banner uložen.');
    } catch (e: any) { toast(e.message); }
    setBusy('');
  };
  const nahrat = async (f: File) => {
    setBusy('img');
    try { const u = await upload(f); setEdit(e => e && { ...e, d: { ...e.d, image_url: u } }); }
    catch (e: any) { toast(e.message); }
    setBusy('');
  };

  if (error) return <ErrorState title="Bannery se nenačetly" onRetry={load} detail={error} />;
  if (!rows) return <Skeleton className="h-32" />;
  const ukazuji = new Set(vyberAktivni(aktivni, dnes).map(r => r.id));
  const nahled = edit && validujBanner(edit.d);
  const nazvy = { skupiny: Object.fromEntries(groups.map((g: any) => [Number(g.id), String(g.name)])), urovne };
  const upravit = (b: Row) => setEdit({ id: b.id, d: {
    title: b.title, text: b.text ?? '', image_url: b.image_url ?? '', link_kind: b.link_kind, link_ref: b.link_ref ?? '',
    valid_since: b.valid_since ?? '', valid_until: b.valid_until ?? '', active: b.active, target_kind: b.target_kind ?? 'all', target_ref: b.target_ref ?? '',
  } });

  const radek = (b: Row, i: number, pocet: number, vArchivu: boolean) => {
    const proc = procNeukazuje(b, dnes);
    const skryty = !proc && !ukazuji.has(b.id);
    const s = stat[String(b.id)];
    return (
      <li key={b.id} className="list-row flex-wrap gap-y-2" data-banner-row={b.id}>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-sm font-semibold leading-tight truncate">{b.title}</p>
          <p className="t-meta mt-0.5 flex flex-wrap items-center gap-1.5">
            <span>{LINK_LABELS[b.link_kind as keyof typeof LINK_LABELS] ?? 'Bez odkazu'}</span>
            {(b.valid_since || b.valid_until) && <span className="tabular-nums">{b.valid_since ?? '…'} – {b.valid_until ?? '…'}</span>}
            {b.target_kind && b.target_kind !== 'all' && <Chip tone="info" size="sm">{popisCile(b, nazvy)}</Chip>}
            {proc ? <Chip tone="muted" size="sm">{proc}</Chip>
              : skryty ? <Chip tone="wait" size="sm">nad limit {MAX_AKTIVNICH}</Chip>
              : <Chip tone="ok" size="sm">vidí se</Chip>}
          </p>
          <p className="t-meta mt-0.5 tabular-nums" data-banner-stat={b.id}>
            {s ? `${czCount(s.zobrazeni, ZOBRAZENI)} · ${czCount(s.kliky, PROKLIK)}${s.zobrazeni > 0 ? ` · ${String(s.proklikovost).replace('.', ',')} %` : ''}` : 'Zatím bez zobrazení'}
            <span className="text-black/40"> (posledních {dni} dní)</span>
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
          {!vArchivu && <>
            <button type="button" aria-label={`Posunout „${b.title}“ výš`} disabled={i === 0} onClick={() => posun(b.id, -1)} className={iconBtn}><Icon name="chevron" size={15} className="rotate-180" /></button>
            <button type="button" aria-label={`Posunout „${b.title}“ níž`} disabled={i === pocet - 1} onClick={() => posun(b.id, 1)} className={iconBtn}><Icon name="chevron" size={15} /></button>
            <Switch checked={b.active} onChange={v => prepni(b, v)} label={`Banner „${b.title}“ aktivní`} />
            <button type="button" aria-label={`Upravit „${b.title}“`} disabled={!!edit} onClick={() => upravit(b)} className={iconBtn}><Icon name="pencil" size={15} /></button>
            <button type="button" aria-label={`Duplikovat „${b.title}“`} disabled={!!edit || busy === `dup${b.id}` || aktivni.length >= MAX_BANNERU} onClick={() => duplikuj(b)} className={iconBtn}><Icon name="copy" size={15} /></button>
            <button type="button" aria-label={`Archivovat „${b.title}“`} disabled={busy === `arch${b.id}`} onClick={() => archivuj(b, true)} className={iconBtn}><Icon name="archive" size={15} /></button>
          </>}
          {vArchivu && <Button size="sm" variant="secondary" loading={busy === `arch${b.id}`} disabled={aktivni.length >= MAX_BANNERU} onClick={() => archivuj(b, false)}>Vrátit z archivu</Button>}
          <button type="button" aria-label={`Smazat „${b.title}“`} onClick={() => smaz(b)} className={iconBtn}><Icon name="trash" size={15} /></button>
        </div>
      </li>
    );
  };

  const d = edit?.d;
  const nastav = (zmena: Partial<Draft>) => setEdit(e => e && { ...e, d: { ...e.d, ...zmena } });

  return (
    <Card className="space-y-4" aria-labelledby="h-bannery">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 id="h-bannery" className="t-card">Bannery</h2>
          <p className="t-meta mt-0.5">Akce a oznámení nahoře na stránce podniku. Host uvidí nejvýš {MAX_AKTIVNICH} aktivních, v zadaném pořadí, a jen ty, které jsou pro něj (podle cílení).</p>
        </div>
        <Button type="button" size="sm" variant="secondary" icon="plus" className="whitespace-nowrap" disabled={aktivni.length >= MAX_BANNERU || !!edit}
          onClick={() => setEdit({ id: null, d: { ...PRAZDNY } })}>Nový banner</Button>
      </div>

      {aktivni.length === 0 && !edit && <p className="t-meta">Zatím žádný banner. Přidej třeba oznámení o nové akci nebo slevě.</p>}

      {aktivni.length > 0 && <ul className="list" aria-label="Seznam bannerů">{aktivni.map((b, i) => radek(b, i, aktivni.length, false))}</ul>}

      {archiv.length > 0 && (
        <details className="group">
          <summary className="tap-target-sm inline-flex items-center gap-2 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none">
            <Icon name="chevron" size={15} className="transition-transform group-open:rotate-180" />Archiv ({archiv.length})
          </summary>
          <ul className="list mt-2" aria-label="Archivované bannery">{archiv.map((b, i) => radek(b, i, archiv.length, true))}</ul>
        </details>
      )}

      {edit && d && (
        <div className="well p-4 space-y-4" role="group" aria-label={edit.id == null ? 'Nový banner' : 'Úprava banneru'}>
          <Field id="bn-title" label="Nadpis"><Input id="bn-title" value={d.title} maxLength={80} placeholder="Páteční degustace" onChange={e => nastav({ title: e.target.value })} /></Field>
          <Field id="bn-text" label="Text" hint="Pár vět, nejvýš 300 znaků."><Textarea id="bn-text" rows={2} maxLength={300} value={d.text} onChange={e => nastav({ text: e.target.value })} /></Field>

          <div>
            <p className="field-label">Obrázek (nepovinný)</p>
            <div className="flex items-center gap-3 flex-wrap">
              {d.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.image_url} alt="" className="h-14 w-24 rounded-xl object-cover border border-black/[0.08]" />
              )}
              <input id="bn-img" type="file" accept="image/*" className="hidden" aria-label="Obrázek banneru"
                onChange={e => { const f = e.target.files?.[0]; if (f) nahrat(f); e.target.value = ''; }} />
              <Button type="button" size="sm" variant="secondary" icon="upload" loading={busy === 'img'} onClick={() => document.getElementById('bn-img')?.click()}>{d.image_url ? 'Změnit' : 'Nahrát'}</Button>
              {d.image_url && <Button type="button" size="sm" variant="danger" onClick={() => nastav({ image_url: '' })}>Odebrat</Button>}
              <span className="t-meta">Na šířku, aspoň 1200 px.</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="bn-kind" label="Kam banner vede">
              <Select id="bn-kind" value={d.link_kind} onChange={e => nastav({ link_kind: e.target.value, link_ref: '' })}>
                {LINK_KINDS.map(k => <option key={k} value={k}>{LINK_LABELS[k]}</option>)}
              </Select>
            </Field>
            {d.link_kind === 'url' && (
              <Field id="bn-ref" label="Webový odkaz" hint="Jen odkazy začínající https://.">
                <Input id="bn-ref" type="url" inputMode="url" value={d.link_ref} placeholder="https://" onChange={e => nastav({ link_ref: e.target.value })} />
              </Field>
            )}
            {d.link_kind === 'event' && (
              <Field id="bn-ref" label="Akce" hint={events.length === 0 ? 'Nejdřív založ veřejnou akci.' : undefined}>
                <Select id="bn-ref" value={d.link_ref} onChange={e => nastav({ link_ref: e.target.value })}>
                  <option value="">Vyber akci</option>
                  {events.map((ev: any) => <option key={ev.id} value={String(ev.id)}>{ev.title} · {String(ev.date).slice(0, 10)}</option>)}
                </Select>
              </Field>
            )}
            {d.link_kind === 'coupon' && (
              <Field id="bn-ref" label="Kupon" hint={coupons.length === 0 ? 'Žádný kupon za body zatím není. Banner otevře záložku Věrnost.' : 'Bez výběru banner jen otevře záložku Věrnost.'}>
                <Select id="bn-ref" value={d.link_ref} onChange={e => nastav({ link_ref: e.target.value })}>
                  <option value="">Všechny kupony</option>
                  {coupons.map((c: any) => <option key={c.id} value={String(c.id)}>{c.title}</option>)}
                </Select>
              </Field>
            )}
            {d.link_kind === 'campaign' && (
              <Field id="bn-ref" label="Razítková karta" hint={campaigns.length === 0 ? 'Nejdřív založ razítkovou kartu ve Věrnosti.' : undefined}>
                <Select id="bn-ref" value={d.link_ref} onChange={e => nastav({ link_ref: e.target.value })}>
                  <option value="">Vyber kartu</option>
                  {campaigns.map((c: any) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </Select>
              </Field>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="bn-cil" label="Komu se ukáže">
              <Select id="bn-cil" value={d.target_kind} onChange={e => nastav({ target_kind: e.target.value, target_ref: '' })}>
                {CILE.map(k => <option key={k} value={k}>{CIL_LABELS[k]}</option>)}
              </Select>
            </Field>
            {d.target_kind === 'level' && (
              <Field id="bn-cil-ref" label="Úroveň">
                <Select id="bn-cil-ref" value={d.target_ref} onChange={e => nastav({ target_ref: e.target.value })}>
                  <option value="">Vyber úroveň</option>
                  {Object.entries(urovne).map(([id, nazev]) => <option key={id} value={id}>{nazev}</option>)}
                </Select>
              </Field>
            )}
            {d.target_kind === 'group' && (
              <Field id="bn-cil-ref" label="Skupina" hint={groups.length === 0 ? 'Skupiny hostů založíš ve Věrnosti.' : undefined}>
                <Select id="bn-cil-ref" value={d.target_ref} onChange={e => nastav({ target_ref: e.target.value })}>
                  <option value="">Vyber skupinu</option>
                  {groups.map((g: any) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                </Select>
              </Field>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="bn-od" label="Platí od" hint="Nepovinné."><Input id="bn-od" type="date" value={d.valid_since} onChange={e => nastav({ valid_since: e.target.value })} /></Field>
            <Field id="bn-do" label="Platí do" hint="Nepovinné. Po tomhle dni se banner sám přestane ukazovat."><Input id="bn-do" type="date" value={d.valid_until} onChange={e => nastav({ valid_until: e.target.value })} /></Field>
          </div>

          <SwitchRow as="div" title="Ukazovat hostům" hint="Vypnuto = koncept: uložený, ale hostům se neukáže." checked={d.active} onChange={v => nastav({ active: v })} className="!py-0" />

          <div>
            <p className="field-label">Náhled</p>
            {nahled && nahled.ok ? (
              <>
                <PromoBanners accent={accent || '#C8F542'} loyaltyOn onGoTab={() => {}}
                  banners={[{ id: -1, title: nahled.hodnoty.title, text: nahled.hodnoty.text, imageUrl: nahled.hodnoty.image_url, linkKind: nahled.hodnoty.link_kind, linkRef: nahled.hodnoty.link_ref }]} />
                <p className="t-meta mt-2">Uvidí: {popisCile({ target_kind: nahled.hodnoty.target_kind, target_ref: nahled.hodnoty.target_ref }, nazvy).toLowerCase()}.
                  {procNeukazuje({ id: 0, active: nahled.hodnoty.active, valid_since: nahled.hodnoty.valid_since, valid_until: nahled.hodnoty.valid_until }, dnes) ? ' Teď se ale hostům neukazuje (vypnutý nebo mimo platnost).' : ''}</p>
              </>
            ) : <p className="t-meta">{nahled && !nahled.ok ? nahled.chyba : ''}</p>}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button type="button" variant="accent" loading={busy === 'save'} onClick={ulozit}>{edit.id == null ? (d.active ? 'Přidat banner' : 'Uložit koncept') : 'Uložit banner'}</Button>
            <Button type="button" variant="secondary" onClick={() => setEdit(null)}>Zrušit</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
