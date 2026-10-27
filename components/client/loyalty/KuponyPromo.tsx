'use client';

// Promo kódy: jednotlivě i dávkou (N kódů s předponou, export do CSV), úprava,
// mazání a rozpad použití po dnech. Host kód zadá na stránce podniku a dostane body
// nebo kupon (app/api/client/b/[slug]/promo). Pravidla a CSV: lib/promoKody.

import { useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, Segmented, Select, Skeleton, Switch, type ChipTone } from '../../ui';
import { useLoad } from '../../ui/useLoad';
import { useOpravneni } from '../../role/useOpravneni';
import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { cistiKod, MAX_DAVKA, STAV_PROMO_POPISKY, zkontrolujDavku, zkontrolujPromo, type StavPromo } from '@/lib/promoKody';
import { ulozSoubor } from '@/lib/stahni';
import { apiMessage, j } from './kuponyForm';

const kodu = (t: PrekladFn, n: number) => t('{n, plural, one {# kód} few {# kódy} other {# kódů}}', { n });
const pouziti = (t: PrekladFn, n: number) => t('{n, plural, one {# použití} few {# použití} other {# použití}}', { n });
const TON: Record<StavPromo, ChipTone> = { aktivni: 'ok', vypnuto: 'muted', vyprselo: 'bad', vycerpano: 'wait' };

const PRAZDNY = { code: '', title: '', points: 50, coupon_id: '', max_uses: '', valid_until: '', prefix: '', count: '20' };
type Formular = typeof PRAZDNY;

/** Pole odměny a limitů, společná pro nový kód, dávku i úpravu. */
function PoleOdmeny({ f, set, kupony, pf }: { f: Formular; set: (p: Partial<Formular>) => void; kupony: any[]; pf: string }) {
  const t = useT('sprava');
  return (<>
    <Field id={`${pf}-title`} label={t('Název')}><Input id={`${pf}-title`} value={f.title} onChange={e => set({ title: e.target.value })} placeholder={t('Jarní leták')} maxLength={80} /></Field>
    <div className="grid grid-cols-2 gap-4">
      <Field id={`${pf}-pts`} label={t('Bodů')}><Input id={`${pf}-pts`} type="number" inputMode="numeric" min={0} max={10000} value={f.points} onChange={e => set({ points: parseInt(e.target.value || '0', 10) })} /></Field>
      <Field id={`${pf}-coupon`} label={t('Kupon navíc')}>
        <Select id={`${pf}-coupon`} value={f.coupon_id} onChange={e => set({ coupon_id: e.target.value })}>
          <option value="">{t('Žádný')}</option>{kupony.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
      </Field>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <Field id={`${pf}-max`} label={t('Nejvýš použití')}><Input id={`${pf}-max`} type="number" inputMode="numeric" min={1} value={f.max_uses} onChange={e => set({ max_uses: e.target.value })} placeholder={t('bez limitu')} /></Field>
      <Field id={`${pf}-until`} label={t('Platí do')}><Input id={`${pf}-until`} type="date" value={f.valid_until} onChange={e => set({ valid_until: e.target.value })} /></Field>
    </div>
  </>);
}

export default function PromoKody({ oznam }: { oznam: (text: string, ton?: 'ok' | 'bad') => void }) {
  const spravuje = useOpravneni().ma('kupony.spravovat');
  const t = useT('sprava');
  const { jazyk } = useJazyk();
  const den = (x: string) => fmtDatum(x, { jazyk, styl: 'denKratce' });
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
    return cistiKod(f.code).length < 3 ? t('Kód musí mít aspoň 3 znaky (písmena a číslice).') : null;
  })();

  const vytvor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chybaForm) { setPokus(true); return; }
    setBusy('novy');
    try {
      if (rezim === 'davka') {
        const r = await j('/api/client/admin/promos', { method: 'POST', body: JSON.stringify({ ...f, davka: true }) });
        oznam(t('Vytvořeno {kolik}. Dávku si stáhneš v menu u kódu jako CSV.', { kolik: kodu(t, r.vytvoreno) }));
      } else {
        await j('/api/client/admin/promos', { method: 'POST', body: JSON.stringify(f) });
        oznam(t('Kód {kod} je aktivní.', { kod: cistiKod(f.code) }));
      }
      setF(PRAZDNY); setPokus(false); reload();
    } catch (err) { oznam(apiMessage(err, t('Kód se nepodařilo vytvořit.')), 'bad'); }
    setBusy('');
  };
  const prepni = async (p: any) => {
    try { await j('/api/client/admin/promos', { method: 'PATCH', body: JSON.stringify({ id: p.id, active: !p.active }) }); reload(); }
    catch (err) { oznam(apiMessage(err, t('Změna se nepovedla.')), 'bad'); }
  };
  const ulozUpravu = async () => {
    if (!uprav) return;
    const v = zkontrolujPromo(tvar(uprav));
    if ('chyba' in v) { oznam(v.chyba, 'bad'); return; }
    setBusy('uprava');
    try {
      await j('/api/client/admin/promos', { method: 'PATCH', body: JSON.stringify({ id: uprav.id, ...tvar(uprav) }) });
      oznam(t('Kód {kod} upraven.', { kod: uprav.kod })); setUprav(null); reload();
    } catch (err) { oznam(apiMessage(err, t('Kód se nepodařilo upravit.')), 'bad'); }
    setBusy('');
  };
  const smaz = async (p: any) => {
    try { await j(`/api/client/admin/promos?id=${p.id}`, { method: 'DELETE' }); oznam(t('Kód {kod} smazán.', { kod: p.code })); reload(); }
    catch (err) { oznam(apiMessage(err, t('Kód se nepodařilo smazat.')), 'bad'); }
  };
  const smazNepouzite = async (batch: string) => {
    try {
      const r = await j(`/api/client/admin/promos?batch=${encodeURIComponent(batch)}`, { method: 'DELETE' });
      oznam(r.smazano ? t('Smazáno {kolik} z dávky.', { kolik: kodu(t, r.smazano) }) : t('V dávce nebyl žádný nepoužitý kód.')); reload();
    } catch (err) { oznam(apiMessage(err, t('Dávku se nepodařilo smazat.')), 'bad'); }
  };
  const stahni = async (batch: string | null) => {
    try {
      const r = await fetch(`/api/client/admin/promos/export${batch ? `?batch=${encodeURIComponent(batch)}` : ''}`);
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || t('Export se nepovedl.')); }
      const v = await ulozSoubor(batch ? `promo-kody-${batch}.csv` : 'promo-kody.csv', await r.text(), 'text/csv');
      if (v === 'nejde') oznam(t('Soubor se v téhle aplikaci nepodařilo uložit.'), 'bad');
    } catch (err) { oznam(apiMessage(err, t('Export se nepovedl.')), 'bad'); }
  };
  const otevriDetail = (p: any) => {
    setDetail({ promo: p, data: null, chyba: null });
    j(`/api/client/admin/promos/${p.id}`)
      .then(data => setDetail(x => (x && x.promo.id === p.id ? { ...x, data } : x)))
      .catch(err => setDetail(x => (x && x.promo.id === p.id ? { ...x, chyba: apiMessage(err, t('Rozpad se nepodařilo načíst.')) } : x)));
  };

  if (error) return <ErrorState title={t('Promo kódy se nenačetly')} onRetry={reload} detail={error} />;
  if (!d || !kupony) return <Skeleton className="h-48" />;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 items-start">
        <Card as="form" className="grid gap-4" onSubmit={vytvor}>
          <div>
            <h2 className="t-card">{t('Nový promo kód')}</h2>
            <p className="t-meta mt-0.5">{t('Kód na letáku, účtence nebo v příspěvku. Host ho zadá na tvé stránce a dostane body nebo kupon, každý host jednou.')}</p>
          </div>
          <Segmented size="sm" ariaLabel={t('Kolik kódů vytvořit')} value={rezim} onChange={r => { setRezim(r); setPokus(false); }}
            options={[{ id: 'jeden', label: t('Jeden kód') }, { id: 'davka', label: t('Dávka kódů') }]} />
          {rezim === 'jeden'
            ? <Field id="pr-code" label={t('Kód')} hint={t('Jen písmena a číslice, bez diakritiky.')}><Input id="pr-code" value={f.code} onChange={e => set({ code: cistiKod(e.target.value) })} placeholder="JARO26" className="font-mono tracking-widest" autoComplete="off" /></Field>
            : (
              <div className="grid grid-cols-2 gap-4">
                <Field id="pr-prefix" label={t('Předpona')} hint={t('Třeba LETAK. Zbytek se doplní náhodně.')}><Input id="pr-prefix" value={f.prefix} onChange={e => set({ prefix: cistiKod(e.target.value).slice(0, 8) })} placeholder="LETAK" className="font-mono tracking-widest" autoComplete="off" /></Field>
                <Field id="pr-count" label={t('Počet (nejvýš {n})', { n: MAX_DAVKA })}><Input id="pr-count" type="number" inputMode="numeric" min={1} max={MAX_DAVKA} value={f.count} onChange={e => set({ count: e.target.value })} /></Field>
              </div>
            )}
          <PoleOdmeny f={f} set={set} kupony={kupony} pf="pr" />
          {rezim === 'davka' && <p className="t-meta">{t('Kódy z dávky jsou jednorázové, dokud u „Nejvýš použití“ nenapíšeš jiné číslo. Hotovou dávku stáhneš jako CSV.')}</p>}
          {pokus && chybaForm && <p role="alert" className="note note-danger text-sm px-3 py-2">{chybaForm}</p>}
          <Button type="submit" variant="primary" icon="plus" loading={busy === 'novy'}>{rezim === 'davka' ? t('Vytvořit dávku') : t('Vytvořit kód')}</Button>
        </Card>
        <Card pad="none" aria-labelledby="pr-kody">
          <div className="flex items-center justify-between gap-3 px-5 pt-4">
            <h2 id="pr-kody" className="t-card">{t('Promo kódy')}</h2>
            {d.promos.length > 0 && <Button size="sm" variant="ghost" icon="download" onClick={() => { void stahni(null); }}>{t('CSV všech')}</Button>}
          </div>
          {d.promos.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState icon="tag" title={t('Zatím žádný promo kód')} hint={t('Vytvoř první. Krátký a snadno opsatelný funguje nejlíp; na tisk přes letáky se hodí dávka jednorázových kódů.')} compact /></div>
          ) : (
            <ul className="list px-5">
              {d.promos.map((p: any) => (
                <ListRow key={p.id} className={p.active ? '' : 'opacity-60'}
                  title={<span className="flex items-center gap-1.5 min-w-0"><span className="font-mono tracking-widest truncate">{p.code}</span><span className="text-black/50 truncate">· {p.title}</span></span>}
                  meta={[
                    [Number(p.points) > 0 ? t('{n} b.', { n: p.points }) : null, p.coupon_title ? t('kupon {nazev}', { nazev: p.coupon_title }) : null].filter(Boolean).join(' + ') || t('bez odměny'),
                    p.max_uses ? t('použito {n}× z {max}', { n: p.uses, max: p.max_uses }) : t('použito {n}×', { n: p.uses }),
                    p.valid_until ? t('do {den}', { den: den(p.valid_until) }) : null,
                    p.batch ? t('dávka {nazev}', { nazev: p.batch }) : null,
                  ].filter(Boolean).join(' · ')}
                  aside={p.stav !== 'aktivni' ? <Chip tone={TON[p.stav as StavPromo] ?? 'muted'} size="sm">{STAV_PROMO_POPISKY[p.stav as StavPromo] ? t(STAV_PROMO_POPISKY[p.stav as StavPromo]) : p.stav}</Chip> : undefined}
                  actions={<>
                    <Switch label={t('Aktivní: {nazev}', { nazev: p.code })} checked={!!p.active} onChange={() => { void prepni(p); }} />
                    <Menu size="sm" label={t('Další akce s kódem {kod}', { kod: p.code })} items={[
                      { label: t('Rozpad použití'), icon: 'chart', onClick: () => otevriDetail(p) },
                      { label: t('Upravit…'), icon: 'pencil', onClick: () => setUprav({ code: p.code, kod: p.code, id: Number(p.id), title: p.title, points: Number(p.points) || 0, coupon_id: p.coupon_id ? String(p.coupon_id) : '', max_uses: p.max_uses ? String(p.max_uses) : '', valid_until: p.valid_until ?? '', prefix: '', count: '' }) },
                      ...(p.batch ? [
                        { label: t('Stáhnout dávku (CSV)'), icon: 'download', onClick: () => { void stahni(p.batch); } },
                        { label: t('Smazat nepoužité z dávky…'), icon: 'trash', danger: true, onClick: () => setMazuDavku(p.batch) },
                      ] : []),
                      { label: t('Smazat…'), icon: 'trash', danger: true, onClick: () => setMazu(p) },
                    ]} />
                  </>} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {uprav && (
        <Modal open onClose={() => setUprav(null)} size="sm" title={t('Upravit kód {kod}', { kod: uprav.kod })}
          subtitle={t('Samotný kód se nemění, protože může být vytištěný. Mění se odměna a limity.')}
          footer={<>
            <Button variant="secondary" onClick={() => setUprav(null)}>{t('Zrušit')}</Button>
            <Button variant="primary" loading={busy === 'uprava'} onClick={ulozUpravu}>{t('Uložit')}</Button>
          </>}>
          <div className="grid gap-4">
            <PoleOdmeny f={uprav} set={p => setUprav({ ...uprav, ...p })} kupony={kupony} pf="pe" />
          </div>
        </Modal>
      )}
      {mazu && (
        <Modal open onClose={() => setMazu(null)} size="sm" title={t('Smazat kód {kod}?', { kod: mazu.code })}
          footer={<>
            <Button variant="secondary" onClick={() => setMazu(null)}>{t('Nechat být')}</Button>
            <Button variant="danger-solid" onClick={() => { const p = mazu; setMazu(null); void smaz(p); }}>{t('Smazat')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">
            {Number(mazu.uses) > 0 ? `${t('Kód už host použil {kolik}; odměny, které dostali, zůstanou.', { kolik: pouziti(t, Number(mazu.uses)) })} ` : ''}
            {t('Kdo ho zadá po smazání, uvidí „Tenhle kód neplatí“. Chceš ho jen dočasně zastavit? Vypni ho přepínačem.')}
          </p>
        </Modal>
      )}
      {mazuDavku && (
        <Modal open onClose={() => setMazuDavku(null)} size="sm" title={t('Smazat nepoužité kódy z dávky?')}
          footer={<>
            <Button variant="secondary" onClick={() => setMazuDavku(null)}>{t('Nechat být')}</Button>
            <Button variant="danger-solid" onClick={() => { const b = mazuDavku; setMazuDavku(null); void smazNepouzite(b); }}>{t('Smazat nepoužité')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{t('Smažou se jen kódy, které nikdo nepoužil. Použité zůstanou, ať máš přehled, kdo co dostal.')}</p>
        </Modal>
      )}
      {detail && (
        <Modal open onClose={() => setDetail(null)} size="md" title={t('Použití kódu {kod}', { kod: detail.promo.code })} subtitle={detail.promo.title}
          footer={<Button variant="secondary" onClick={() => setDetail(null)}>{t('Zavřít')}</Button>}>
          {detail.chyba ? <ErrorState compact title={t('Rozpad se nenačetl')} detail={detail.chyba} onRetry={() => otevriDetail(detail.promo)} />
            : !detail.data ? <Skeleton className="h-32" />
            : detail.data.celkem === 0 ? <EmptyState icon="tag" title={t('Kód zatím nikdo nepoužil')} hint={t('Jakmile ho host zadá, uvidíš tady kdy a kolikrát.')} compact />
            : (
              <div className="space-y-4">
                <p className="text-sm">{t('Celkem')} <strong>{pouziti(t, detail.data.celkem)}</strong>{detail.promo.max_uses ? ` ${t('z {n}', { n: detail.promo.max_uses })}` : ''}.</p>
                <div>
                  <p className="field-label">{t('Po dnech')}</p>
                  <ul className="list">
                    {detail.data.poDnech.map((r: any) => <ListRow key={r.den} title={den(r.den)} value={`${r.pocet}×`} />)}
                  </ul>
                </div>
                <div>
                  <p className="field-label">{t('Poslední použití')}</p>
                  <ul className="list">
                    {detail.data.posledni.map((u: any, i: number) => <ListRow key={i} title={u.name || t('Host')} meta={dbTimeDayHM(u.usedAt)} />)}
                  </ul>
                </div>
              </div>
            )}
        </Modal>
      )}
    </>
  );
}
