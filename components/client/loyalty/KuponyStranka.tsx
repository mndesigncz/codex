'use client';

// Kupony v plné síle (kolo 81): katalog s filtry stavů (aktivní / koncepty /
// naplánované / archiv), hledání, hromadné akce nad výběrem, export CSV, uplatnění
// kódu u kasy s náhledem, editor s náhledem pohledem hosta, přehled uplatnění,
// historie změn, duplikace, poslání členům a uvítací kupon pro stávající členy.
// Oprávnění: katalog a editor kupony.spravovat, uplatnění kódu kupony.uplatnit.

import { useMemo, useState } from 'react';
import {
  BulkBar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, SearchField, Segmented, SelectBox, Skeleton, Switch, useLoad, useSelection,
} from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { czDay } from '@/lib/clientSlots';
import { czCount } from '@/lib/czech';
import { apiMessage } from '@/lib/api';
import { obsahuje } from '@/lib/hledani';
import { kodKuponu, duvodNeKupon } from '@/lib/kuponQr';
import { hodnotyKuponu, STAV_KUPONU_POPISEK } from '@/lib/kuponyPravidla';
import { j, stahni, STAV_TON } from './kuponyUi';
import KuponEditor, { prazdnyKupon, kuponNaFormular, type FormKuponu, type Polozka } from './KuponEditor';
import KuponNahled from './KuponNahled';
import KuponDetail from './KuponDetail';
import KuponyOdeslat from './KuponyOdeslat';
import KuponUplatnit from './KuponUplatnit';

const KUPON = { one: 'kupon', few: 'kupony', many: 'kuponů' };
const KOD = { one: 'neuplatněný kód', few: 'neuplatněné kódy', many: 'neuplatněných kódů' };
const KUS = { one: 'kus', few: 'kusy', many: 'kusů' };
type Filtr = 'vse' | 'aktivni' | 'koncept' | 'naplanovano' | 'archiv';

const jeVeFiltru = (c: any, f: Filtr) =>
  f === 'archiv' ? c.stav === 'archiv'
    : f === 'koncept' ? c.stav === 'koncept'
    : f === 'naplanovano' ? c.stav === 'naplanovano'
    : f === 'aktivni' ? c.stav === 'aktivni'
    : c.stav !== 'archiv';

export default function KuponyStranka({ toast }: { toast: (m: string) => void }) {
  const { ma } = useOpravneni();
  const spravuje = ma('kupony.spravovat');
  const uplatni = ma('kupony.uplatnit');
  const { data: d, error, reload } = useLoad<{ coupons: any[]; groups: any[]; polozky: Polozka[] }>(
    spravuje ? '/api/client/admin/coupons' : null,
    raw => ({ coupons: Array.isArray(raw?.coupons) ? raw.coupons : [], groups: Array.isArray(raw?.groups) ? raw.groups : [], polozky: Array.isArray(raw?.polozky) ? raw.polozky : [] }),
  );
  const [form, setForm] = useState<FormKuponu | null>(null);
  const [filtr, setFiltr] = useState<Filtr>('vse');
  const [q, setQ] = useState('');
  const [code, setCode] = useState('');
  const [kodChyba, setKodChyba] = useState('');
  const [uplatnuji, setUplatnuji] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [mazu, setMazu] = useState<any | null>(null);
  const [mazuHromadne, setMazuHromadne] = useState(false);
  const [detail, setDetail] = useState<{ c: any; cast: 'prehled' | 'historie' } | null>(null);
  const [nahled, setNahled] = useState<any | null>(null);
  const [odeslat, setOdeslat] = useState<{ c: any; zdroj: 'send' | 'welcome' } | null>(null);
  const sel = useSelection<number>();

  const coupons = d?.coupons ?? [];
  const polozky = d?.polozky ?? [];
  const viditelne = useMemo(() => coupons.filter(c => jeVeFiltru(c, filtr) && (!q.trim() || obsahuje(c.title, q) || obsahuje(c.description ?? '', q))), [coupons, filtr, q]);
  const pocty = useMemo(() => Object.fromEntries((['vse', 'aktivni', 'koncept', 'naplanovano', 'archiv'] as Filtr[]).map(f => [f, coupons.filter(c => jeVeFiltru(c, f)).length])), [coupons]);

  const zmena = async (c: any, body: any, hlaska: string) => {
    setBusy(`${c.id}`);
    try { await j('/api/client/admin/coupons', { method: 'PATCH', body: JSON.stringify({ id: c.id, ...body }) }); if (hlaska) toast(hlaska); reload(); }
    catch (e) { toast(apiMessage(e, 'Změna se nepovedla.')); }
    setBusy('');
  };
  const duplikuj = async (c: any) => {
    setBusy(`${c.id}`);
    try { await j('/api/client/admin/coupons', { method: 'POST', body: JSON.stringify({ duplicateOf: c.id }) }); toast('Kopie je v konceptech. Uprav ji a zveřejni.'); setFiltr('koncept'); reload(); }
    catch (e) { toast(apiMessage(e, 'Kupon se nepodařilo zkopírovat.')); }
    setBusy('');
  };
  const smaz = async (c: any) => {
    try { await j(`/api/client/admin/coupons?id=${c.id}`, { method: 'DELETE' }); toast('Kupon smazán.'); reload(); }
    catch (e) { toast(apiMessage(e, 'Kupon se nepodařilo smazat.')); }
  };
  const hromadne = async (action: string, hlaska: (r: any) => string) => {
    const ids = Array.from(sel.selected);
    setBusy('hromadne');
    try {
      const r = await j('/api/client/admin/coupons', { method: 'PATCH', body: JSON.stringify({ ids, action }) });
      toast(hlaska(r)); sel.exit(); reload();
    } catch (e) { toast(apiMessage(e, 'Hromadná změna se nepovedla.')); }
    setBusy('');
  };
  const odeslatKod = (e: React.FormEvent) => {
    e.preventDefault();
    const k = kodKuponu(code);
    if (!k) { setKodChyba(duvodNeKupon(code)); return; }
    setKodChyba(''); setUplatnuji(k);
  };
  const upravit = (c: any) => setForm(kuponNaFormular(c));
  const radekProNahled = (c: any) => ({
    ...hodnotyKuponu(c), id: c.id, issued: c.issued, item_name: c.itemName,
    excluded_item_names: (c.excludedItems ?? []).map((id: number) => polozky.find(p => p.id === id)?.name).filter(Boolean),
  });

  // --- editor ---
  if (form && d) {
    return <KuponEditor key={form.id ?? 'novy'} vychozi={form} groups={d.groups} polozky={polozky} toast={toast}
      onZpet={() => setForm(null)} onUlozeno={m => { toast(m); setForm(null); reload(); }} />;
  }

  const menuProKupon = (c: any) => [
    { label: 'Upravit…', icon: 'pencil', onClick: () => upravit(c) },
    { label: 'Náhled pohledem hosta', icon: 'search', onClick: () => setNahled(c) },
    ...(c.stav === 'aktivni' || c.stav === 'naplanovano' ? [{ label: 'Poslat členům…', icon: 'send', onClick: () => setOdeslat({ c, zdroj: 'send' as const }) }] : []),
    ...((c.stav === 'aktivni' || c.stav === 'naplanovano') && c.welcome ? [{ label: 'Uvítací pro stávající členy…', icon: 'users', hint: 'Dostanou ho i ti, kdo už v klubu jsou.', onClick: () => setOdeslat({ c, zdroj: 'welcome' as const }) }] : []),
    { label: 'Uplatnění a historie', icon: 'chart', onClick: () => setDetail({ c, cast: 'prehled' }) },
    { label: 'Historie změn', icon: 'clock', onClick: () => setDetail({ c, cast: 'historie' }) },
    { label: 'Duplikovat', icon: 'copy', onClick: () => { void duplikuj(c); } },
    c.stav === 'archiv'
      ? { label: 'Obnovit z archivu', icon: 'undo', onClick: () => { void zmena(c, { status: 'live' }, 'Kupon je zpět.'); } }
      : { label: 'Archivovat', icon: 'archive', onClick: () => { void zmena(c, { status: 'archived' }, 'Kupon je v archivu. Host ho nevidí, vydané kódy dál platí.'); } },
    { label: 'Smazat…', icon: 'trash', danger: true, onClick: () => setMazu(c) },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 items-start">
      {uplatni && (
        <Card as="form" className="space-y-3" onSubmit={odeslatKod}>
          <h2 className="t-card">Uplatnit kupon</h2>
          <p className="t-meta">Host ukáže kód ze své kartičky nebo QR. Uvidíš, co kupon dává, zadáš útratu a u 18+ potvrdíš věk. Kupon jde uplatnit jednou.</p>
          <Field id="c-code" label="Kód od hosta" error={kodChyba}>
            <Input id="c-code" value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setKodChyba(''); }} placeholder="ABC-123" className="font-mono tracking-widest" autoComplete="off" autoCapitalize="characters" />
          </Field>
          <Button type="submit" variant="primary" icon="search" disabled={!code.trim()}>Zobrazit kupon</Button>
        </Card>
      )}
      {spravuje && (
        <Card pad="none" aria-labelledby="v-kupony" className={uplatni ? '' : 'lg:col-span-2'}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
            <h2 id="v-kupony" className="t-card">Katalog kuponů</h2>
            <div className="flex items-center gap-2">
              {coupons.length > 0 && <Button size="sm" variant="ghost" icon="download" onClick={() => stahni('/api/client/admin/coupons?export=csv')}>CSV</Button>}
              {coupons.length > 0 && <Button size="sm" variant="ghost" icon="download" onClick={() => stahni('/api/client/admin/coupons/prehled?export=csv')}>Vydané kódy (CSV)</Button>}
              <Button size="sm" variant="secondary" icon="plus" onClick={() => setForm(prazdnyKupon())} disabled={!d}>Nový kupon</Button>
            </div>
          </div>
          {error ? <div className="p-5"><ErrorState title="Kupony se nenačetly" onRetry={reload} detail={error} /></div>
            : !d ? <div className="p-5"><Skeleton className="h-40" /></div>
            : coupons.length === 0 ? (
              <div className="px-5 pb-5"><EmptyState icon="gift" title="Zatím žádný kupon" hint="Založ první — třeba slevu 15 % pro Zlaté hosty nebo uvítací dezert zdarma." compact
                action={<Button size="sm" variant="primary" icon="plus" onClick={() => setForm(prazdnyKupon())}>Založit první kupon</Button>} /></div>
            ) : (
              <>
                <div className="px-5 pt-3 flex flex-wrap items-center gap-3">
                  <Segmented value={filtr} onChange={v => { setFiltr(v as Filtr); sel.exit(); }} size="sm" ariaLabel="Stav kuponů"
                    options={([['vse', 'Vše'], ['aktivni', 'Aktivní'], ['koncept', 'Koncepty'], ['naplanovano', 'Naplánované'], ['archiv', 'Archiv']] as [Filtr, string][])
                      .filter(([id]) => id === 'vse' || id === filtr || pocty[id] > 0)
                      .map(([id, label]) => ({ id, label: `${label} (${pocty[id]})` }))} />
                  <SearchField className="w-full max-w-xs" value={q} onChange={setQ} storageKey="kupony" placeholder="Hledat kupon" ariaLabel="Hledat kupon" />
                </div>
                {viditelne.length === 0 ? (
                  <div className="px-5 pb-5"><EmptyState icon="search" compact title={q ? 'Žádný takový kupon' : 'V téhle části nic není'}
                    hint={q ? 'Zkus jiné slovo, nebo zruš hledání.' : 'Přepni filtr, nebo založ nový kupon.'}
                    action={<Button size="sm" variant="secondary" onClick={() => { setQ(''); setFiltr('vse'); }}>Zobrazit vše</Button>} /></div>
                ) : (
                  <ul className="list px-5">
                    {viditelne.map((c: any) => {
                      const zbyva = c.totalLimit ? Math.max(0, c.totalLimit - c.issued) : null;
                      return (
                        <ListRow key={c.id} className={c.stav === 'aktivni' || c.stav === 'naplanovano' ? '' : 'opacity-60'}
                          lead={<SelectBox checked={sel.has(c.id)} onChange={() => sel.toggle(c.id)} label={`Vybrat kupon ${c.title}`} />}
                          title={<span className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <span className="truncate">{c.title}</span>
                            {c.benefit && <Chip tone="muted" size="sm">{c.benefit}</Chip>}
                            {c.stav !== 'aktivni' && <Chip tone={STAV_TON[c.stav as keyof typeof STAV_TON]} size="sm">{STAV_KUPONU_POPISEK[c.stav as keyof typeof STAV_KUPONU_POPISEK]}</Chip>}
                            {c.welcome && <Chip tone="muted" size="sm">uvítací</Chip>}
                          </span>}
                          meta={[
                            c.costPoints > 0 ? `${c.costPoints} b.` : 'zdarma', ...(c.badges ?? []),
                            c.validSince && c.stav === 'naplanovano' ? `od ${czDay(c.validSince)}` : null,
                            c.validUntil ? `do ${czDay(c.validUntil)}` : null,
                            zbyva != null ? `zbývá ${czCount(zbyva, KUS)} z ${c.totalLimit}` : null,
                            c.dailyLimit ? `${c.dailyLimit} uplatnění denně` : null,
                            `vzato ${c.claimed}×, uplatněno ${c.redeemed}×`,
                          ].filter(Boolean).join(' · ')}
                          actions={<>
                            {(c.stav === 'aktivni' || c.stav === 'pozastaveno') && (
                              <Switch checked={c.active !== false} disabled={busy === `${c.id}`} onChange={v => { void zmena(c, { active: v }, ''); }} label={`Aktivní: ${c.title}`} />
                            )}
                            {c.stav === 'koncept' && <Button size="sm" variant="secondary" disabled={busy === `${c.id}`} onClick={() => { void zmena(c, { status: 'live' }, 'Kupon je zveřejněný.'); }}>Zveřejnit</Button>}
                            <Menu size="sm" label={`Další akce s kuponem ${c.title}`} items={menuProKupon(c)} />
                          </>} />
                      );
                    })}
                  </ul>
                )}
              </>
            )}
        </Card>
      )}
      <BulkBar count={sel.count} totalLabel={`Vybrat vše (${viditelne.length})`} onSelectAll={() => sel.selectAll(viditelne.map(c => c.id))} onExit={sel.exit}
        actions={[
          { label: 'Zapnout', icon: 'check', disabled: busy === 'hromadne', onClick: () => { void hromadne('aktivovat', r => `Zapnuto: ${czCount(r.hotovo, KUPON)}.`); } },
          { label: 'Pozastavit', disabled: busy === 'hromadne', onClick: () => { void hromadne('pozastavit', r => `Pozastaveno: ${czCount(r.hotovo, KUPON)}.`); } },
          { label: filtr === 'archiv' ? 'Obnovit' : 'Archivovat', disabled: busy === 'hromadne', onClick: () => { void hromadne(filtr === 'archiv' ? 'obnovit' : 'archivovat', r => `${filtr === 'archiv' ? 'Obnoveno' : 'Archivováno'}: ${czCount(r.hotovo, KUPON)}.`); } },
          { label: 'Smazat', icon: 'trash', danger: true, disabled: busy === 'hromadne', onClick: () => setMazuHromadne(true) },
        ]} />

      {mazu && (mazu.openClaims > 0 ? (
        <Modal open onClose={() => setMazu(null)} size="sm" title={`Kupon „${mazu.title}" smazat nejde`}
          footer={<>
            <Button variant="secondary" onClick={() => setMazu(null)}>Zrušit</Button>
            <Button variant="primary" onClick={() => { const c = mazu; setMazu(null); void zmena(c, { status: 'archived' }, 'Kupon je v archivu. Host ho nevidí, vydané kódy dál platí.'); }}>Archivovat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Hosté drží {czCount(mazu.openClaims, KOD)}, smazáním by přestaly jít uplatnit. Kupon archivuj: nový si ho nikdo nevezme a vydané kódy platí dál. Smazat ho půjde, až je všichni uplatní.</p>
        </Modal>
      ) : (
        <Modal open onClose={() => setMazu(null)} size="sm" title={`Smazat kupon „${mazu.title}"?`}
          footer={<>
            <Button variant="secondary" onClick={() => setMazu(null)}>Zrušit</Button>
            <Button variant="danger-solid" onClick={() => { const c = mazu; setMazu(null); void smaz(c); }}>Smazat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Nikdo ho teď nedrží, takže ho jde smazat bez následků. Přehled už uplatněných kódů s ním zmizí.</p>
        </Modal>
      ))}
      {mazuHromadne && (
        <Modal open onClose={() => setMazuHromadne(false)} size="sm" title={`Smazat ${czCount(sel.count, KUPON)}?`}
          footer={<>
            <Button variant="secondary" onClick={() => setMazuHromadne(false)}>Zrušit</Button>
            <Button variant="danger-solid" onClick={() => { setMazuHromadne(false); void hromadne('smazat', r => `Smazáno: ${czCount(r.hotovo, KUPON)}.${r.preskoceno ? ` Přeskočeno ${r.preskoceno}: hosté drží jejich kódy, ty archivuj.` : ''}`); }}>Smazat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Kupony, jejichž kódy hosté ještě drží, se přeskočí. Smazané nejdou vrátit.</p>
        </Modal>
      )}
      {detail && <KuponDetail kupon={detail.c} vychoziCast={detail.cast} onZavrit={() => setDetail(null)} />}
      {nahled && (
        <Modal open onClose={() => setNahled(null)} size="md" title={nahled.title} subtitle="Náhled pohledem hosta"
          footer={<Button variant="primary" onClick={() => setNahled(null)}>Zavřít</Button>}>
          <KuponNahled radek={radekProNahled(nahled)} />
        </Modal>
      )}
      {odeslat && <KuponyOdeslat couponId={odeslat.c.id} zdroj={odeslat.zdroj} onZavrit={() => setOdeslat(null)} oznam={(t) => toast(t)} onOdeslano={reload} />}
      {uplatnuji && <KuponUplatnit kod={uplatnuji} onZavrit={() => setUplatnuji(null)} onHotovo={m => { toast(m); setCode(''); reload(); }} />}
    </div>
  );
}
