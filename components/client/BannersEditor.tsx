'use client';

// Promo bannery podniku (Vzhled → Bannery): akce a oznámení, které host uvidí
// jako karusel nahoře na stránce podniku. Seznam s přepínačem aktivní, řazením,
// náhledem a formulářem pro nový nebo upravený banner. Pravidla (https odkazy,
// délky, platnost) hlídá lib/bannery.ts na serveru i tady. Aktivní se hostům
// ukáže nejvýš pět, podle pořadí.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Card, Chip, ErrorState, Field, Input, Select, Skeleton, Switch, Textarea } from '../ui';
import PromoBanners from './PromoBanners';
import { pragueToday } from '@/lib/pragueTime';
import { LINK_KINDS, LINK_LABELS, MAX_AKTIVNICH, MAX_BANNERU, presunBanner, procNeukazuje, validujBanner, vyberAktivni } from '@/lib/bannery';

interface Row {
  id: number; title: string; text: string; image_url: string | null; link_kind: string; link_ref: string | null;
  active: boolean; valid_since: string | null; valid_until: string | null; position: number;
}
const PRAZDNY = { title: '', text: '', image_url: '', link_kind: 'none', link_ref: '', valid_since: '', valid_until: '', active: true };
type Draft = typeof PRAZDNY;

export default function BannersEditor({ toast, upload, accent }: { toast: (m: string) => void; upload: (f: File) => Promise<string>; accent: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: number | null; d: Draft } | null>(null);
  const [busy, setBusy] = useState('');
  const dnes = useMemo(() => pragueToday(), []);

  const load = useCallback(() => {
    setError(null);
    fetch('/api/client/admin/banners')
      .then(r => { if (!r.ok) throw new Error(`Server odpověděl ${r.status}`); return r.json(); })
      .then(d => { setRows(d.banners ?? []); setEvents(d.events ?? []); })
      .catch((e: any) => setError(e?.message || 'Načtení se nepovedlo'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (method: string, body?: any, query = '') => {
    const r = await fetch(`/api/client/admin/banners${query}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Uložení se nepovedlo.');
    return d;
  };

  const prepni = async (b: Row, active: boolean) => {
    setRows(rs => rs && rs.map(x => x.id === b.id ? { ...x, active } : x));
    try { await call('PATCH', { id: b.id, active }); }
    catch (e: any) { toast(e.message); load(); }
  };
  const posun = async (id: number, smer: -1 | 1) => {
    if (!rows) return;
    const ids = presunBanner(rows.map(r => r.id), id, smer);
    const byId = new Map(rows.map(r => [r.id, r]));
    setRows(ids.map(i => byId.get(i)!));
    try { await call('PATCH', { order: ids }); }
    catch (e: any) { toast(e.message); load(); }
  };
  const smaz = async (b: Row) => {
    if (!window.confirm(`Smazat banner „${b.title}“?`)) return;
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
      setEdit(null); toast(edit.id == null ? 'Banner přidán.' : 'Banner uložen.');
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
  const ukazuji = new Set(vyberAktivni(rows, dnes).map(r => r.id));
  const nahled = edit && validujBanner(edit.d);

  return (
    <Card className="space-y-4" aria-labelledby="h-bannery">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 id="h-bannery" className="t-card">Bannery</h2>
          <p className="t-meta mt-0.5">Akce a oznámení nahoře na stránce podniku. Hosté uvidí nejvýš {MAX_AKTIVNICH} aktivních, v zadaném pořadí.</p>
        </div>
        <Button type="button" size="sm" variant="secondary" icon="plus" className="whitespace-nowrap" disabled={rows.length >= MAX_BANNERU || !!edit}
          onClick={() => setEdit({ id: null, d: { ...PRAZDNY } })}>Nový banner</Button>
      </div>

      {rows.length === 0 && !edit && <p className="t-meta">Zatím žádný banner. Přidej třeba oznámení o nové akci nebo slevě.</p>}

      {rows.length > 0 && (
        <ul className="list" aria-label="Seznam bannerů">
          {rows.map((b, i) => {
            const proc = procNeukazuje(b, dnes);
            const skryty = !proc && !ukazuji.has(b.id);
            return (
              <li key={b.id} className="list-row flex-wrap gap-y-2" data-banner-row={b.id}>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-semibold leading-tight truncate">{b.title}</p>
                  <p className="t-meta mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>{LINK_LABELS[b.link_kind as keyof typeof LINK_LABELS] ?? 'Bez odkazu'}</span>
                    {(b.valid_since || b.valid_until) && <span className="tabular-nums">{b.valid_since ?? '…'} – {b.valid_until ?? '…'}</span>}
                    {proc ? <Chip tone="muted" size="sm">{proc}</Chip>
                      : skryty ? <Chip tone="wait" size="sm">nad limit {MAX_AKTIVNICH}</Chip>
                      : <Chip tone="ok" size="sm">vidí se</Chip>}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" aria-label={`Posunout „${b.title}“ výš`} disabled={i === 0} onClick={() => posun(b.id, -1)}
                    className="tap-target-sm h-9 w-9 grid place-items-center rounded-full hover:bg-black/[0.06] disabled:opacity-30"><Icon name="chevron" size={15} className="rotate-180" /></button>
                  <button type="button" aria-label={`Posunout „${b.title}“ níž`} disabled={i === rows.length - 1} onClick={() => posun(b.id, 1)}
                    className="tap-target-sm h-9 w-9 grid place-items-center rounded-full hover:bg-black/[0.06] disabled:opacity-30"><Icon name="chevron" size={15} /></button>
                  <Switch checked={b.active} onChange={v => prepni(b, v)} label={`Banner „${b.title}“ aktivní`} />
                  <button type="button" aria-label={`Upravit „${b.title}“`} disabled={!!edit}
                    onClick={() => setEdit({ id: b.id, d: { title: b.title, text: b.text ?? '', image_url: b.image_url ?? '', link_kind: b.link_kind, link_ref: b.link_ref ?? '', valid_since: b.valid_since ?? '', valid_until: b.valid_until ?? '', active: b.active } })}
                    className="tap-target-sm h-9 w-9 grid place-items-center rounded-full hover:bg-black/[0.06] disabled:opacity-30"><Icon name="pencil" size={15} /></button>
                  <button type="button" aria-label={`Smazat „${b.title}“`} onClick={() => smaz(b)}
                    className="tap-target-sm h-9 w-9 grid place-items-center rounded-full hover:bg-black/[0.06]"><Icon name="trash" size={15} /></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {edit && (
        <div className="well p-4 space-y-4" role="group" aria-label={edit.id == null ? 'Nový banner' : 'Úprava banneru'}>
          <Field id="bn-title" label="Nadpis"><Input id="bn-title" value={edit.d.title} maxLength={80} placeholder="Páteční degustace" onChange={e => setEdit({ ...edit, d: { ...edit.d, title: e.target.value } })} /></Field>
          <Field id="bn-text" label="Text" hint="Pár vět, nejvýš 300 znaků."><Textarea id="bn-text" rows={2} maxLength={300} value={edit.d.text} onChange={e => setEdit({ ...edit, d: { ...edit.d, text: e.target.value } })} /></Field>

          <div>
            <p className="field-label">Obrázek (nepovinný)</p>
            <div className="flex items-center gap-3 flex-wrap">
              {edit.d.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={edit.d.image_url} alt="" className="h-14 w-24 rounded-xl object-cover border border-black/[0.08]" />
              )}
              <input id="bn-img" type="file" accept="image/*" className="hidden" aria-label="Obrázek banneru"
                onChange={e => { const f = e.target.files?.[0]; if (f) nahrat(f); e.target.value = ''; }} />
              <Button type="button" size="sm" variant="secondary" icon="upload" loading={busy === 'img'} onClick={() => document.getElementById('bn-img')?.click()}>{edit.d.image_url ? 'Změnit' : 'Nahrát'}</Button>
              {edit.d.image_url && <Button type="button" size="sm" variant="danger" onClick={() => setEdit({ ...edit, d: { ...edit.d, image_url: '' } })}>Odebrat</Button>}
              <span className="t-meta">Na šířku, aspoň 1200 px.</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="bn-kind" label="Kam banner vede">
              <Select id="bn-kind" value={edit.d.link_kind} onChange={e => setEdit({ ...edit, d: { ...edit.d, link_kind: e.target.value, link_ref: '' } })}>
                {LINK_KINDS.map(k => <option key={k} value={k}>{LINK_LABELS[k]}</option>)}
              </Select>
            </Field>
            {edit.d.link_kind === 'url' && (
              <Field id="bn-ref" label="Webový odkaz" hint="Jen odkazy začínající https://.">
                <Input id="bn-ref" type="url" inputMode="url" value={edit.d.link_ref} placeholder="https://" onChange={e => setEdit({ ...edit, d: { ...edit.d, link_ref: e.target.value } })} />
              </Field>
            )}
            {edit.d.link_kind === 'event' && (
              <Field id="bn-ref" label="Akce" hint={events.length === 0 ? 'Nejdřív založ veřejnou akci.' : undefined}>
                <Select id="bn-ref" value={edit.d.link_ref} onChange={e => setEdit({ ...edit, d: { ...edit.d, link_ref: e.target.value } })}>
                  <option value="">Vyber akci</option>
                  {events.map((ev: any) => <option key={ev.id} value={String(ev.id)}>{ev.title} · {String(ev.date).slice(0, 10)}</option>)}
                </Select>
              </Field>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="bn-od" label="Platí od" hint="Nepovinné."><Input id="bn-od" type="date" value={edit.d.valid_since} onChange={e => setEdit({ ...edit, d: { ...edit.d, valid_since: e.target.value } })} /></Field>
            <Field id="bn-do" label="Platí do" hint="Nepovinné. Po tomhle dni se banner sám přestane ukazovat."><Input id="bn-do" type="date" value={edit.d.valid_until} onChange={e => setEdit({ ...edit, d: { ...edit.d, valid_until: e.target.value } })} /></Field>
          </div>

          <div>
            <p className="field-label">Náhled</p>
            {nahled && nahled.ok ? (
              <PromoBanners accent={accent || '#C8F542'} loyaltyOn onGoTab={() => {}}
                banners={[{ id: -1, title: nahled.hodnoty.title, text: nahled.hodnoty.text, imageUrl: nahled.hodnoty.image_url, linkKind: nahled.hodnoty.link_kind, linkRef: nahled.hodnoty.link_ref }]} />
            ) : <p className="t-meta">{nahled && !nahled.ok ? nahled.chyba : ''}</p>}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button type="button" variant="accent" loading={busy === 'save'} onClick={ulozit}>{edit.id == null ? 'Přidat banner' : 'Uložit banner'}</Button>
            <Button type="button" variant="secondary" onClick={() => setEdit(null)}>Zrušit</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
