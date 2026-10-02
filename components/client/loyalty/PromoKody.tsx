'use client';

// Promo kódy v plné síle (kolo 81): založení, úprava, dávková generace, hromadné
// zapnutí / vypnutí / smazání, rozpad použití (kdo a kdy), export CSV a náhled
// pohledem hosta. Oprávnění kupony.spravovat.

import { useMemo, useState } from 'react';
import {
  BulkBar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, SearchField, Segmented, Select, SelectBox, Skeleton, Switch, useLoad, useSelection,
} from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { czDay } from '@/lib/clientSlots';
import { czCount } from '@/lib/czech';
import { apiMessage } from '@/lib/api';
import { obsahuje } from '@/lib/hledani';
import { cistyKod, davkaKodu, STAV_PROMO_POPISEK, MAX_DAVKA_KODU } from '@/lib/kuponyPravidla';
import { j, stahni, STAV_PROMO_TON, kdyCesky } from './kuponyUi';
import { PromoNahled } from './KuponNahled';

const KOD = { one: 'kód', few: 'kódy', many: 'kódů' };

const prazdny = () => ({
  id: null as number | null, code: '', title: '', points: 50, coupon_id: '' as number | '', max_uses: '', valid_since: '', valid_until: '', active: true, uses: 0,
  davka: false, pocet: '10', predpona: '',
});
type FormKodu = ReturnType<typeof prazdny>;

export default function PromoKody({ oznam }: { oznam: (text: string, ton?: 'ok' | 'bad') => void }) {
  const spravuje = useOpravneni().ma('kupony.spravovat');
  const { data: d, error, reload } = useLoad<{ promos: any[] }>(spravuje ? '/api/client/admin/promos' : null, raw => ({ promos: Array.isArray(raw?.promos) ? raw.promos : [] }));
  const { data: kupony } = useLoad<any[]>(spravuje ? '/api/client/admin/coupons' : null, raw => (Array.isArray(raw?.coupons) ? raw.coupons.filter((c: any) => c.stav === 'aktivni' || c.stav === 'naplanovano') : []));
  const [f, setF] = useState<FormKodu>(prazdny);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [chyba, setChyba] = useState('');
  const [mazu, setMazu] = useState<any | null>(null);
  const [mazuHromadne, setMazuHromadne] = useState(false);
  const [pouziti, setPouziti] = useState<any | null>(null);
  const sel = useSelection<number>();
  const promos = d?.promos ?? [];
  const viditelne = useMemo(() => promos.filter(p => !q.trim() || obsahuje(p.code, q) || obsahuje(p.title, q)), [promos, q]);
  if (!spravuje) return null;
  const set = (patch: Partial<FormKodu>) => { setF(prev => ({ ...prev, ...patch })); setChyba(''); };
  const kuponNazev = (id: number | '') => (kupony ?? []).find(c => c.id === id)?.title ?? null;

  const uloz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setChyba('');
    try {
      const telo: any = { code: f.code, title: f.title, points: f.points, coupon_id: f.coupon_id || null, max_uses: f.max_uses || null, valid_since: f.valid_since, valid_until: f.valid_until, active: f.active };
      if (f.id) {
        await j('/api/client/admin/promos', { method: 'PATCH', body: JSON.stringify({ id: f.id, ...telo }) });
        oznam(`Kód ${f.code} je uložený.`);
      } else if (f.davka) {
        const r = await j('/api/client/admin/promos', { method: 'POST', body: JSON.stringify({ ...telo, batch: { count: Number(f.pocet), prefix: f.predpona } }) });
        oznam(`Vytvořeno ${czCount(r.pocet, KOD)} s předponou ${cistyKod(f.predpona, 8)}.`);
      } else {
        await j('/api/client/admin/promos', { method: 'POST', body: JSON.stringify(telo) });
        oznam(`Kód ${cistyKod(f.code)} je aktivní.`);
      }
      setF(prazdny()); reload();
    } catch (err) { setChyba(apiMessage(err, 'Kód se nepodařilo uložit.')); }
    setBusy(false);
  };
  const prepni = async (p: any, active: boolean) => {
    try { await j('/api/client/admin/promos', { method: 'PATCH', body: JSON.stringify({ id: p.id, active }) }); reload(); }
    catch (err) { oznam(apiMessage(err, 'Změna se nepovedla.'), 'bad'); }
  };
  const smaz = async (p: any) => {
    try { await j(`/api/client/admin/promos?id=${p.id}`, { method: 'DELETE' }); oznam(`Kód ${p.code} je smazaný.`); reload(); }
    catch (err) { oznam(apiMessage(err, 'Kód se nepodařilo smazat.'), 'bad'); }
  };
  const hromadne = async (action: string, hlaska: (r: any) => string) => {
    try {
      const r = await j('/api/client/admin/promos', { method: 'PATCH', body: JSON.stringify({ ids: Array.from(sel.selected), action }) });
      oznam(hlaska(r)); sel.exit(); reload();
    } catch (err) { oznam(apiMessage(err, 'Hromadná změna se nepovedla.'), 'bad'); }
  };
  const otevriPouziti = async (p: any) => {
    setPouziti({ p, nacitam: true });
    try { const r = await j(`/api/client/admin/promos?uses=${p.id}`); setPouziti({ p, ...r }); }
    catch (err) { setPouziti({ p, chyba: apiMessage(err, 'Použití se nenačetlo.') }); }
  };
  const upravit = (p: any) => setF({
    ...prazdny(), id: p.id, code: p.code, title: p.title, points: Number(p.points) || 0, coupon_id: p.coupon_id ?? '',
    max_uses: p.max_uses ? String(p.max_uses) : '', valid_since: p.valid_since ? String(p.valid_since).slice(0, 10) : '',
    valid_until: p.valid_until ? String(p.valid_until).slice(0, 10) : '', active: p.active !== false, uses: Number(p.uses) || 0,
  });
  const vymysli = () => set({ code: davkaKodu({ prefix: '', pocet: 1, delka: 8 }, new Set(promos.map(p => p.code)))[0] ?? '' });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        <Card as="form" className="grid gap-4" onSubmit={uloz}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Escape' && f.id) { e.preventDefault(); setF(prazdny()); } }}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="t-card">{f.id ? `Upravit kód ${f.code}` : 'Nový promo kód'}</h2>
            {f.id && <Button type="button" size="sm" variant="ghost" icon="undo" onClick={() => setF(prazdny())}>Zrušit úpravu</Button>}
          </div>
          {!f.id && <Segmented options={[{ id: 'jeden', label: 'Jeden kód' }, { id: 'davka', label: 'Dávka kódů' }]} value={f.davka ? 'davka' : 'jeden'} onChange={v => set({ davka: v === 'davka' })} size="sm" ariaLabel="Jeden kód, nebo dávka" />}
          {f.davka && !f.id ? (
            <div className="grid grid-cols-2 gap-4">
              <Field id="pr-pred" label="Předpona" hint="Třeba JARO → JAROK7M2Q"><Input id="pr-pred" value={f.predpona} onChange={e => set({ predpona: cistyKod(e.target.value, 8) })} placeholder="JARO" className="font-mono tracking-widest" maxLength={8} /></Field>
              <Field id="pr-pocet" label="Kolik kódů" hint={`1 až ${MAX_DAVKA_KODU}, každý jednou`}><Input id="pr-pocet" type="number" inputMode="numeric" min={1} max={MAX_DAVKA_KODU} value={f.pocet} onChange={e => set({ pocet: e.target.value })} /></Field>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
              <Field id="pr-code" label="Kód" hint={f.uses > 0 ? 'Kód už někdo použil, přejmenovat ho nejde.' : 'Písmena a číslice, 3 až 16 znaků.'}>
                <Input id="pr-code" value={f.code} disabled={f.uses > 0} onChange={e => set({ code: cistyKod(e.target.value) })} placeholder="JARO26" className="font-mono tracking-widest" maxLength={16} autoComplete="off" />
              </Field>
              {!f.id && <Button type="button" variant="secondary" size="sm" onClick={vymysli}>Vymyslet</Button>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field id="pr-title" label="Název" hint="Vidí ho host po uplatnění"><Input id="pr-title" value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Jarní leták" maxLength={80} /></Field>
            <Field id="pr-pts" label="Bodů" hint="0 = jen kupon"><Input id="pr-pts" type="number" inputMode="numeric" min={0} max={10000} value={f.points} onChange={e => set({ points: parseInt(e.target.value || '0', 10) })} /></Field>
          </div>
          <Field id="pr-coupon" label="Kupon navíc" hint="Host na něj musí mít nárok (úroveň, skupina, 18+), jinak kód nespotřebuje.">
            <Select id="pr-coupon" value={f.coupon_id === '' ? '' : String(f.coupon_id)} onChange={e => set({ coupon_id: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">Žádný</option>{(kupony ?? []).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field id="pr-max" label={f.davka && !f.id ? 'Použití na kód' : 'Nejvýš použití'} hint="Prázdné = bez limitu"><Input id="pr-max" type="number" inputMode="numeric" min={1} value={f.max_uses} onChange={e => set({ max_uses: e.target.value })} placeholder="bez limitu" /></Field>
            <Field id="pr-since" label="Platí od"><Input id="pr-since" type="date" value={f.valid_since} onChange={e => set({ valid_since: e.target.value })} /></Field>
            <Field id="pr-until" label="Platí do"><Input id="pr-until" type="date" value={f.valid_until} onChange={e => set({ valid_until: e.target.value })} /></Field>
          </div>
          {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
          <div className="flex justify-end gap-2">
            <Button type="submit" variant="primary" icon={f.id ? 'check' : 'plus'} loading={busy} disabled={f.davka && !f.id ? f.predpona.length < 2 : !f.code}>
              {f.id ? 'Uložit kód' : f.davka ? 'Vytvořit dávku' : 'Vytvořit kód'}
            </Button>
          </div>
        </Card>
        <PromoNahled code={f.davka && !f.id ? `${f.predpona || 'JARO'}K7M2Q` : f.code} title={f.title} points={f.points} couponTitle={kuponNazev(f.coupon_id)} />
      </div>
      <Card pad="none" aria-labelledby="pr-kody">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <h2 id="pr-kody" className="t-card">Promo kódy</h2>
          {promos.length > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" icon="download" onClick={() => stahni('/api/client/admin/promos?export=csv')}>Kódy (CSV)</Button>
              <Button size="sm" variant="ghost" icon="download" onClick={() => stahni('/api/client/admin/promos?export=uses')}>Použití (CSV)</Button>
            </div>
          )}
        </div>
        {error ? <div className="p-5"><ErrorState title="Promo kódy se nenačetly" onRetry={reload} detail={error} /></div>
          : !d ? <div className="p-5"><Skeleton className="h-32" /></div>
          : promos.length === 0 ? <div className="px-5 pb-5"><EmptyState icon="tag" title="Zatím žádný promo kód" hint="Vytvoř první. Krátký a snadno opsatelný funguje nejlíp." compact /></div>
          : (
            <>
              {promos.length > 5 && <div className="px-5 pt-3"><SearchField className="w-full max-w-xs" value={q} onChange={setQ} storageKey="promo-kody" placeholder="Hledat kód nebo název" ariaLabel="Hledat promo kód" /></div>}
              {viditelne.length === 0 ? <div className="px-5 pb-5"><EmptyState icon="search" compact title="Žádný takový kód" action={<Button size="sm" variant="secondary" onClick={() => setQ('')}>Zrušit hledání</Button>} /></div> : (
                <ul className="list px-5">
                  {viditelne.map((p: any) => (
                    <ListRow key={p.id} className={p.active ? '' : 'opacity-55'}
                      lead={<SelectBox checked={sel.has(p.id)} onChange={() => sel.toggle(p.id)} label={`Vybrat kód ${p.code}`} />}
                      title={<span className="flex items-center gap-1.5 min-w-0 flex-wrap"><span className="font-mono tracking-widest">{p.code}</span><span className="text-black/50 truncate">· {p.title}</span>{p.stav !== 'aktivni' && <Chip tone={STAV_PROMO_TON[p.stav as keyof typeof STAV_PROMO_TON]} size="sm">{STAV_PROMO_POPISEK[p.stav as keyof typeof STAV_PROMO_POPISEK]}</Chip>}</span>}
                      meta={[
                        [Number(p.points) > 0 ? `${p.points} b.` : null, p.coupon_title ? `kupon ${p.coupon_title}` : null].filter(Boolean).join(' + '),
                        `použito ${p.uses}×${p.max_uses ? ` z ${p.max_uses}` : ''}`,
                        p.valid_since ? `od ${czDay(p.valid_since)}` : null, p.valid_until ? `do ${czDay(p.valid_until)}` : null,
                      ].filter(Boolean).join(' · ')}
                      actions={<>
                        <Switch checked={!!p.active} onChange={v => { void prepni(p, v); }} label={`Aktivní: ${p.code}`} />
                        <Menu size="sm" label={`Další akce s kódem ${p.code}`} items={[
                          { label: 'Upravit…', icon: 'pencil', onClick: () => upravit(p) },
                          { label: 'Kdo a kdy ho použil', icon: 'users', onClick: () => { void otevriPouziti(p); } },
                          { label: 'Smazat…', icon: 'trash', danger: true, onClick: () => setMazu(p) },
                        ]} />
                      </>} />
                  ))}
                </ul>
              )}
            </>
          )}
      </Card>
      <BulkBar count={sel.count} totalLabel={`Vybrat vše (${viditelne.length})`} onSelectAll={() => sel.selectAll(viditelne.map(p => p.id))} onExit={sel.exit}
        actions={[
          { label: 'Zapnout', icon: 'check', onClick: () => { void hromadne('aktivovat', r => `Zapnuto: ${czCount(r.hotovo, KOD)}.`); } },
          { label: 'Vypnout', onClick: () => { void hromadne('pozastavit', r => `Vypnuto: ${czCount(r.hotovo, KOD)}.`); } },
          { label: 'Smazat', icon: 'trash', danger: true, onClick: () => setMazuHromadne(true) },
        ]} />
      {mazu && (Number(mazu.uses) > 0 ? (
        <Modal open onClose={() => setMazu(null)} size="sm" title={`Kód ${mazu.code} smazat nejde`}
          footer={<>
            <Button variant="secondary" onClick={() => setMazu(null)}>Zrušit</Button>
            <Button variant="primary" onClick={() => { const p = mazu; setMazu(null); void prepni(p, false); }}>Vypnout kód</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Kód už někdo použil ({mazu.uses}×). Smazáním by zmizela historie. Vypni ho: nikdo další ho nezadá a přehled zůstane.</p>
        </Modal>
      ) : (
        <Modal open onClose={() => setMazu(null)} size="sm" title={`Smazat kód ${mazu.code}?`}
          footer={<>
            <Button variant="secondary" onClick={() => setMazu(null)}>Zrušit</Button>
            <Button variant="danger-solid" onClick={() => { const p = mazu; setMazu(null); void smaz(p); }}>Smazat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Nikdo ho zatím nepoužil. Leták s tímhle kódem pak host zadá do prázdna.</p>
        </Modal>
      ))}
      {mazuHromadne && (
        <Modal open onClose={() => setMazuHromadne(false)} size="sm" title={`Smazat ${czCount(sel.count, KOD)}?`}
          footer={<>
            <Button variant="secondary" onClick={() => setMazuHromadne(false)}>Zrušit</Button>
            <Button variant="danger-solid" onClick={() => { setMazuHromadne(false); void hromadne('smazat', r => `Smazáno: ${czCount(r.hotovo, KOD)}.${r.preskoceno ? ` Přeskočeno ${r.preskoceno}: už je někdo použil, ty vypni.` : ''}`); }}>Smazat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Smažou se jen kódy, které nikdo nepoužil. Použité se přeskočí, ty jde jen vypnout.</p>
        </Modal>
      )}
      {pouziti && (
        <Modal open onClose={() => setPouziti(null)} size="md" title={`Použití kódu ${pouziti.p.code}`} subtitle={pouziti.p.title}
          footer={<><Button variant="secondary" icon="download" onClick={() => stahni(`/api/client/admin/promos?export=uses`)}>Všechna použití (CSV)</Button><Button variant="primary" onClick={() => setPouziti(null)}>Zavřít</Button></>}>
          {pouziti.chyba ? <ErrorState title="Použití se nenačetlo" detail={pouziti.chyba} onRetry={() => { void otevriPouziti(pouziti.p); }} />
            : pouziti.nacitam ? <Skeleton className="h-24" />
            : pouziti.pouziti.length === 0 ? <EmptyState icon="users" compact title="Zatím nikdo" hint="Jakmile host kód zadá, uvidíš tady jeho jméno a čas." />
            : (
              <ul className="list" aria-label="Kdo kód použil">
                {pouziti.pouziti.map((r: any, i: number) => <ListRow key={i} as="li" title={r.host} meta={kdyCesky(r.kdy)} />)}
              </ul>
            )}
        </Modal>
      )}
    </div>
  );
}
