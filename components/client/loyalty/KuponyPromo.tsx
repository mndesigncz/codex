'use client';

// Promo kódy: jednotlivě i dávkou (N kódů s předponou, export do CSV), úprava,
// mazání a rozpad použití po dnech. Host kód zadá na stránce podniku a dostane body
// nebo kupon (app/api/client/b/[slug]/promo). Pravidla a CSV: lib/promoKody.

import { useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, Segmented, Select, Skeleton, Switch, type ChipTone } from '../../ui';
import { useLoad } from '../../ui/useLoad';
import { useOpravneni } from '../../role/useOpravneni';
import { czDay } from '@/lib/clientSlots';
import { czCount, type CzNoun } from '@/lib/czech';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { cistiKod, MAX_DAVKA, STAV_PROMO_POPISKY, zkontrolujDavku, zkontrolujPromo, type StavPromo } from '@/lib/promoKody';
import { ulozSoubor } from '@/lib/stahni';
import { apiMessage, j } from './kuponyForm';

const KOD: CzNoun = { one: 'kód', few: 'kódy', many: 'kódů' };
const POUZITI: CzNoun = { one: 'použití', few: 'použití', many: 'použití' };
const TON: Record<StavPromo, ChipTone> = { aktivni: 'ok', vypnuto: 'muted', vyprselo: 'bad', vycerpano: 'wait' };

const PRAZDNY = { code: '', title: '', points: 50, coupon_id: '', max_uses: '', valid_until: '', prefix: '', count: '20' };
type Formular = typeof PRAZDNY;

/** Pole odměny a limitů, společná pro nový kód, dávku i úpravu. */
function PoleOdmeny({ f, set, kupony, pf }: { f: Formular; set: (p: Partial<Formular>) => void; kupony: any[]; pf: string }) {
  return (<>
    <Field id={`${pf}-title`} label="Název"><Input id={`${pf}-title`} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Jarní leták" maxLength={80} /></Field>
    <div className="grid grid-cols-2 gap-4">
      <Field id={`${pf}-pts`} label="Bodů"><Input id={`${pf}-pts`} type="number" inputMode="numeric" min={0} max={10000} value={f.points} onChange={e => set({ points: parseInt(e.target.value || '0', 10) })} /></Field>
      <Field id={`${pf}-coupon`} label="Kupon navíc">
        <Select id={`${pf}-coupon`} value={f.coupon_id} onChange={e => set({ coupon_id: e.target.value })}>
          <option value="">Žádný</option>{kupony.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
      </Field>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <Field id={`${pf}-max`} label="Nejvýš použití"><Input id={`${pf}-max`} type="number" inputMode="numeric" min={1} value={f.max_uses} onChange={e => set({ max_uses: e.target.value })} placeholder="bez limitu" /></Field>
      <Field id={`${pf}-until`} label="Platí do"><Input id={`${pf}-until`} type="date" value={f.valid_until} onChange={e => set({ valid_until: e.target.value })} /></Field>
    </div>
  </>);
}

export default function PromoKody({ oznam }: { oznam: (text: string, ton?: 'ok' | 'bad') => void }) {
  const spravuje = useOpravneni().ma('kupony.spravovat');
  const { data: d, error, reload } = useLoad<{ promos: any[] }>(spravuje ? '/api/client/admin/promos' : null, raw => ({ promos: Array.isArray(raw?.promos) ? raw.promos : [] }));
  const { data: kupony } = useLoad<any[]>(spravuje ? '/api/client/admin/coupons' : null, raw => (Array.isArray(raw?.coupons) ? raw.coupons.filter((c: any) => !c.draft && !c.archived) : []));
  const [rezim, setRezim] = useState<'jeden' | 'davka'>('jeden');
  const [f, setF] = useState<Formular>(PRAZDNY);
  const [busy, setBusy] = useState('');
  const [uprav, setUprav] = useState<(Formular & { id: number; kod: string }) | null>(null);
  const [mazu, setMazu] = useState<any | null>(null);
  const [mazuDavku, setMazuDavku] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ promo: any; data: any | null; chyba: string | null } | null>(null);
  const [pokus, setPokus] = useState(false);
  if (!spravuje) return null;

  const set = (p: Partial<Formular>) => setF({ ...f, ...p });
  const tvar = (x: Formular) => ({ title: x.title, points: x.points, coupon_id: x.coupon_id, max_uses: x.max_uses, valid_until: x.valid_until });
  const chybaForm = (() => {
    const v = zkontrolujPromo(tvar(f));
    if ('chyba' in v) return v.chyba;
    if (rezim === 'davka') { const dv = zkontrolujDavku({ count: f.count, prefix: f.prefix }); return 'chyba' in dv ? dv.chyba : null; }
    return cistiKod(f.code).length < 3 ? 'Kód musí mít aspoň 3 znaky (písmena a číslice).' : null;
  })();

  const vytvor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chybaForm) { setPokus(true); return; }
    setBusy('novy');
    try {
      if (rezim === 'davka') {
        const r = await j('/api/client/admin/promos', { method: 'POST', body: JSON.stringify({ ...f, davka: true }) });
        oznam(`Vytvořeno ${czCount(r.vytvoreno, KOD)}. Dávku si stáhneš v menu u kódu jako CSV.`);
      } else {
        await j('/api/client/admin/promos', { method: 'POST', body: JSON.stringify(f) });
        oznam(`Kód ${cistiKod(f.code)} je aktivní.`);
      }
      setF(PRAZDNY); setPokus(false); reload();
    } catch (err) { oznam(apiMessage(err, 'Kód se nepodařilo vytvořit.'), 'bad'); }
    setBusy('');
  };
  const prepni = async (p: any) => {
    try { await j('/api/client/admin/promos', { method: 'PATCH', body: JSON.stringify({ id: p.id, active: !p.active }) }); reload(); }
    catch (err) { oznam(apiMessage(err, 'Změna se nepovedla.'), 'bad'); }
  };
  const ulozUpravu = async () => {
    if (!uprav) return;
    const v = zkontrolujPromo(tvar(uprav));
    if ('chyba' in v) { oznam(v.chyba, 'bad'); return; }
    setBusy('uprava');
    try {
      await j('/api/client/admin/promos', { method: 'PATCH', body: JSON.stringify({ id: uprav.id, ...tvar(uprav) }) });
      oznam(`Kód ${uprav.kod} upraven.`); setUprav(null); reload();
    } catch (err) { oznam(apiMessage(err, 'Kód se nepodařilo upravit.'), 'bad'); }
    setBusy('');
  };
  const smaz = async (p: any) => {
    try { await j(`/api/client/admin/promos?id=${p.id}`, { method: 'DELETE' }); oznam(`Kód ${p.code} smazán.`); reload(); }
    catch (err) { oznam(apiMessage(err, 'Kód se nepodařilo smazat.'), 'bad'); }
  };
  const smazNepouzite = async (batch: string) => {
    try {
      const r = await j(`/api/client/admin/promos?batch=${encodeURIComponent(batch)}`, { method: 'DELETE' });
      oznam(r.smazano ? `Smazáno ${czCount(r.smazano, KOD)} z dávky.` : 'V dávce nebyl žádný nepoužitý kód.'); reload();
    } catch (err) { oznam(apiMessage(err, 'Dávku se nepodařilo smazat.'), 'bad'); }
  };
  const stahni = async (batch: string | null) => {
    try {
      const r = await fetch(`/api/client/admin/promos/export${batch ? `?batch=${encodeURIComponent(batch)}` : ''}`);
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Export se nepovedl.'); }
      const v = await ulozSoubor(batch ? `promo-kody-${batch}.csv` : 'promo-kody.csv', await r.text(), 'text/csv');
      if (v === 'nejde') oznam('Soubor se v téhle aplikaci nepodařilo uložit.', 'bad');
    } catch (err) { oznam(apiMessage(err, 'Export se nepovedl.'), 'bad'); }
  };
  const otevriDetail = (p: any) => {
    setDetail({ promo: p, data: null, chyba: null });
    j(`/api/client/admin/promos/${p.id}`)
      .then(data => setDetail(x => (x && x.promo.id === p.id ? { ...x, data } : x)))
      .catch(err => setDetail(x => (x && x.promo.id === p.id ? { ...x, chyba: apiMessage(err, 'Rozpad se nepodařilo načíst.') } : x)));
  };

  if (error) return <ErrorState title="Promo kódy se nenačetly" onRetry={reload} detail={error} />;
  if (!d || !kupony) return <Skeleton className="h-48" />;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 items-start">
        <Card as="form" className="grid gap-4" onSubmit={vytvor}>
          <div>
            <h2 className="t-card">Nový promo kód</h2>
            <p className="t-meta mt-0.5">Kód na letáku, účtence nebo v příspěvku. Host ho zadá na tvé stránce a dostane body nebo kupon, každý host jednou.</p>
          </div>
          <Segmented size="sm" ariaLabel="Kolik kódů vytvořit" value={rezim} onChange={r => { setRezim(r); setPokus(false); }}
            options={[{ id: 'jeden', label: 'Jeden kód' }, { id: 'davka', label: 'Dávka kódů' }]} />
          {rezim === 'jeden'
            ? <Field id="pr-code" label="Kód" hint="Jen písmena a číslice, bez diakritiky."><Input id="pr-code" value={f.code} onChange={e => set({ code: cistiKod(e.target.value) })} placeholder="JARO26" className="font-mono tracking-widest" autoComplete="off" /></Field>
            : (
              <div className="grid grid-cols-2 gap-4">
                <Field id="pr-prefix" label="Předpona" hint="Třeba LETAK. Zbytek se doplní náhodně."><Input id="pr-prefix" value={f.prefix} onChange={e => set({ prefix: cistiKod(e.target.value).slice(0, 8) })} placeholder="LETAK" className="font-mono tracking-widest" autoComplete="off" /></Field>
                <Field id="pr-count" label={`Počet (nejvýš ${MAX_DAVKA})`}><Input id="pr-count" type="number" inputMode="numeric" min={1} max={MAX_DAVKA} value={f.count} onChange={e => set({ count: e.target.value })} /></Field>
              </div>
            )}
          <PoleOdmeny f={f} set={set} kupony={kupony} pf="pr" />
          {rezim === 'davka' && <p className="t-meta">Kódy z dávky jsou jednorázové, dokud u „Nejvýš použití“ nenapíšeš jiné číslo. Hotovou dávku stáhneš jako CSV.</p>}
          {pokus && chybaForm && <p role="alert" className="note note-danger text-sm px-3 py-2">{chybaForm}</p>}
          <Button type="submit" variant="primary" icon="plus" loading={busy === 'novy'}>{rezim === 'davka' ? 'Vytvořit dávku' : 'Vytvořit kód'}</Button>
        </Card>
        <Card pad="none" aria-labelledby="pr-kody">
          <div className="flex items-center justify-between gap-3 px-5 pt-4">
            <h2 id="pr-kody" className="t-card">Promo kódy</h2>
            {d.promos.length > 0 && <Button size="sm" variant="ghost" icon="download" onClick={() => { void stahni(null); }}>CSV všech</Button>}
          </div>
          {d.promos.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState icon="tag" title="Zatím žádný promo kód" hint="Vytvoř první. Krátký a snadno opsatelný funguje nejlíp; na tisk přes letáky se hodí dávka jednorázových kódů." compact /></div>
          ) : (
            <ul className="list px-5">
              {d.promos.map((p: any) => (
                <ListRow key={p.id} className={p.active ? '' : 'opacity-60'}
                  title={<span className="flex items-center gap-1.5 min-w-0"><span className="font-mono tracking-widest truncate">{p.code}</span><span className="text-black/50 truncate">· {p.title}</span></span>}
                  meta={[
                    [Number(p.points) > 0 ? `${p.points} b.` : null, p.coupon_title ? `kupon ${p.coupon_title}` : null].filter(Boolean).join(' + ') || 'bez odměny',
                    `použito ${p.uses}×${p.max_uses ? ` z ${p.max_uses}` : ''}`,
                    p.valid_until ? `do ${czDay(p.valid_until)}` : null,
                    p.batch ? `dávka ${p.batch}` : null,
                  ].filter(Boolean).join(' · ')}
                  aside={p.stav !== 'aktivni' ? <Chip tone={TON[p.stav as StavPromo] ?? 'muted'} size="sm">{STAV_PROMO_POPISKY[p.stav as StavPromo] ?? p.stav}</Chip> : undefined}
                  actions={<>
                    <Switch label={`Aktivní: ${p.code}`} checked={!!p.active} onChange={() => { void prepni(p); }} />
                    <Menu size="sm" label={`Další akce s kódem ${p.code}`} items={[
                      { label: 'Rozpad použití', icon: 'chart', onClick: () => otevriDetail(p) },
                      { label: 'Upravit…', icon: 'pencil', onClick: () => setUprav({ code: p.code, kod: p.code, id: Number(p.id), title: p.title, points: Number(p.points) || 0, coupon_id: p.coupon_id ? String(p.coupon_id) : '', max_uses: p.max_uses ? String(p.max_uses) : '', valid_until: p.valid_until ?? '', prefix: '', count: '' }) },
                      ...(p.batch ? [
                        { label: 'Stáhnout dávku (CSV)', icon: 'download', onClick: () => { void stahni(p.batch); } },
                        { label: 'Smazat nepoužité z dávky…', icon: 'trash', danger: true, onClick: () => setMazuDavku(p.batch) },
                      ] : []),
                      { label: 'Smazat…', icon: 'trash', danger: true, onClick: () => setMazu(p) },
                    ]} />
                  </>} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {uprav && (
        <Modal open onClose={() => setUprav(null)} size="sm" title={`Upravit kód ${uprav.kod}`}
          subtitle="Samotný kód se nemění, protože může být vytištěný. Mění se odměna a limity."
          footer={<>
            <Button variant="secondary" onClick={() => setUprav(null)}>Zrušit</Button>
            <Button variant="primary" loading={busy === 'uprava'} onClick={ulozUpravu}>Uložit</Button>
          </>}>
          <div className="grid gap-4">
            <PoleOdmeny f={uprav} set={p => setUprav({ ...uprav, ...p })} kupony={kupony} pf="pe" />
          </div>
        </Modal>
      )}
      {mazu && (
        <Modal open onClose={() => setMazu(null)} size="sm" title={`Smazat kód ${mazu.code}?`}
          footer={<>
            <Button variant="secondary" onClick={() => setMazu(null)}>Nechat být</Button>
            <Button variant="danger-solid" onClick={() => { const p = mazu; setMazu(null); void smaz(p); }}>Smazat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">
            {Number(mazu.uses) > 0 ? `Kód už host použil ${czCount(Number(mazu.uses), POUZITI)}; odměny, které dostali, zůstanou. ` : ''}
            Kdo ho zadá po smazání, uvidí „Tenhle kód neplatí“. Chceš ho jen dočasně zastavit? Vypni ho přepínačem.
          </p>
        </Modal>
      )}
      {mazuDavku && (
        <Modal open onClose={() => setMazuDavku(null)} size="sm" title="Smazat nepoužité kódy z dávky?"
          footer={<>
            <Button variant="secondary" onClick={() => setMazuDavku(null)}>Nechat být</Button>
            <Button variant="danger-solid" onClick={() => { const b = mazuDavku; setMazuDavku(null); void smazNepouzite(b); }}>Smazat nepoužité</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Smažou se jen kódy, které nikdo nepoužil. Použité zůstanou, ať máš přehled, kdo co dostal.</p>
        </Modal>
      )}
      {detail && (
        <Modal open onClose={() => setDetail(null)} size="md" title={`Použití kódu ${detail.promo.code}`} subtitle={detail.promo.title}
          footer={<Button variant="secondary" onClick={() => setDetail(null)}>Zavřít</Button>}>
          {detail.chyba ? <ErrorState compact title="Rozpad se nenačetl" detail={detail.chyba} onRetry={() => otevriDetail(detail.promo)} />
            : !detail.data ? <Skeleton className="h-32" />
            : detail.data.celkem === 0 ? <EmptyState icon="tag" title="Kód zatím nikdo nepoužil" hint="Jakmile ho host zadá, uvidíš tady kdy a kolikrát." compact />
            : (
              <div className="space-y-4">
                <p className="text-sm">Celkem <strong>{czCount(detail.data.celkem, POUZITI)}</strong>{detail.promo.max_uses ? ` z ${detail.promo.max_uses}` : ''}.</p>
                <div>
                  <p className="field-label">Po dnech</p>
                  <ul className="list">
                    {detail.data.poDnech.map((r: any) => <ListRow key={r.den} title={czDay(r.den)} value={`${r.pocet}×`} />)}
                  </ul>
                </div>
                <div>
                  <p className="field-label">Poslední použití</p>
                  <ul className="list">
                    {detail.data.posledni.map((u: any, i: number) => <ListRow key={i} title={u.name || 'Host'} meta={dbTimeDayHM(u.usedAt)} />)}
                  </ul>
                </div>
              </div>
            )}
        </Modal>
      )}
    </>
  );
}
