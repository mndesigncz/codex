'use client';

// Kupony: katalog (aktuální / koncepty / archiv), editor s náhledem pohledem hosta,
// poslání hostům, duplikace, uplatnění u kasy a přehled uplatnění s ROI.
// Promo kódy jsou vedle (KuponyPromo). Pravidla: lib/coupons, lib/kuponyPravidla, lib/kuponyPole.

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, ListRow, Menu, Modal, Segmented, Skeleton, Switch, type ChipTone } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { czDay } from '@/lib/clientSlots';
import { czCount, type CzNoun } from '@/lib/czech';
import { STAV_POPISKY, type StavKuponu } from '@/lib/kuponyPravidla';
import { apiMessage, duplikujKupon, j, kuponNaForm, prazdnyKupon, stahni, type FormKupon } from './kuponyForm';
import KuponyEditor from './KuponyEditor';
import KuponyNahled from './KuponyNahled';
import KuponyOdeslat from './KuponyOdeslat';
import KuponyPrehled from './KuponyPrehled';
import KuponyUplatnit from './KuponyUplatnit';
import KuponyHistorie from './KuponyHistorie';

const KOD: CzNoun = { one: 'kód', few: 'kódy', many: 'kódů' };
const KUS: CzNoun = { one: 'kus', few: 'kusy', many: 'kusů' };
const KUPON: CzNoun = { one: 'kupon', few: 'kupony', many: 'kuponů' };
const TON: Record<StavKuponu, ChipTone> = {
  aktivni: 'ok', naplanovano: 'info', koncept: 'muted', vypnuto: 'muted', vyprselo: 'bad', vyprodano: 'wait', archiv: 'muted',
};
type Filtr = 'aktualni' | 'koncepty' | 'archiv';

export default function Kupony({ toast }: { toast: (m: string) => void }) {
  const spravuje = useOpravneni().ma('kupony.spravovat');
  const uplatni = useOpravneni().ma('kupony.uplatnit');
  const [list, setList] = useState<any[] | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [chyba, setChyba] = useState<string | null>(null);
  const [form, setForm] = useState<FormKupon | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [filtr, setFiltr] = useState<Filtr>('aktualni');
  const [mazu, setMazu] = useState<any | null>(null);
  const [posilam, setPosilam] = useState<any | null>(null);
  const [nahled, setNahled] = useState<any | null>(null);
  const [obnov, setObnov] = useState(0);
  const [historie, setHistorie] = useState<any | null>(null);
  // Hromadný výběr: zaškrtnuté kupony se dají najednou zapnout, pozastavit, archivovat, vrátit nebo smazat.
  const [vybiram, setVybiram] = useState(false);
  const [vybrane, setVybrane] = useState<number[]>([]);

  // Katalog čte jen správce (API chce kupony.spravovat); uplatnění kódu jde i bez něj.
  const load = useCallback(() => {
    if (!spravuje) { setList([]); return; }
    setChyba(null);
    j('/api/client/admin/coupons')
      .then(d => { setList(d.coupons ?? []); setGroups(d.groups ?? []); })
      .catch(e => setChyba(apiMessage(e, 'Kupony se nepodařilo načíst.')));
  }, [spravuje]);
  useEffect(() => { load(); }, [load]);
  const obnovVse = () => { load(); setObnov(n => n + 1); };

  const uloz = async (jakoKoncept: boolean) => {
    if (!form) return;
    setBusy(jakoKoncept ? 'draft' : 'save');
    try {
      await j('/api/client/admin/coupons', { method: form.id ? 'PATCH' : 'POST', body: JSON.stringify({ ...form, draft: jakoKoncept }) });
      toast(jakoKoncept ? 'Koncept uložen. Hosté ho zatím nevidí.' : form.id && !form.draft ? 'Kupon uložen.' : form.id ? 'Kupon zveřejněn.' : 'Kupon založen.');
      setForm(null); obnovVse();
    } catch (e) { toast(apiMessage(e, 'Kupon se nepodařilo uložit.')); }
    setBusy('');
  };
  const zmen = async (c: any, patch: Record<string, unknown>, hlaska: string) => {
    setBusy('zmena:' + c.id);
    try { await j('/api/client/admin/coupons', { method: 'PATCH', body: JSON.stringify({ id: c.id, ...patch }) }); toast(hlaska); obnovVse(); }
    catch (e) { toast(apiMessage(e, 'Změna se nepovedla.')); }
    setBusy('');
  };
  const smaz = async (c: any, force: boolean) => {
    setBusy('smazat');
    try {
      const r = await j(`/api/client/admin/coupons?id=${c.id}${force ? '&force=1' : ''}`, { method: 'DELETE' });
      toast(r.zruseno ? `Kupon smazán, ${czCount(r.zruseno, KOD)} zrušeno.` : 'Kupon smazán.');
      setMazu(null); setForm(null); obnovVse();
    } catch (e) { toast(apiMessage(e, 'Kupon se nepodařilo smazat.')); setMazu(null); obnovVse(); }
    setBusy('');
  };

  const hromadne = async (action: 'zapnout' | 'pozastavit' | 'archivovat' | 'obnovit' | 'smazat') => {
    if (!vybrane.length) return;
    setBusy('hromadne');
    try {
      const r = await j('/api/client/admin/coupons', { method: 'PATCH', body: JSON.stringify({ ids: vybrane, action }) });
      toast(`Hotovo: ${czCount(r.hotovo, KUPON)}${r.preskoceno ? `, ${r.preskoceno} přeskočeno${action === 'smazat' ? ' (hosté je drží nebo uplatnili, archivuj je)' : ''}` : ''}.`);
      setVybrane([]); setVybiram(false); obnovVse();
    } catch (e) { toast(apiMessage(e, 'Hromadná změna se nepovedla.')); }
    setBusy('');
  };

  if (chyba) return <ErrorState title="Kupony se nenačetly" onRetry={load} detail={chyba} />;
  if (list === null) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-48" /></div>;

  if (form) return <KuponyEditor form={form} setForm={setForm} groups={groups} busy={busy === 'save' || busy === 'draft' ? busy : ''} onSave={uloz} onZpet={() => setForm(null)} />;

  const pocet = (f: Filtr) => list.filter(c => f === 'archiv' ? c.archived : f === 'koncepty' ? c.draft && !c.archived : !c.draft && !c.archived).length;
  const videt = list.filter(c => filtr === 'archiv' ? c.archived : filtr === 'koncepty' ? c.draft && !c.archived : !c.draft && !c.archived);

  const akce = (c: any) => {
    const stav: StavKuponu = c.stav;
    return [
      { label: 'Upravit…', icon: 'pencil', onClick: () => setForm(kuponNaForm(c)) },
      { label: 'Náhled pro hosta', icon: 'search', onClick: () => setNahled(kuponNaForm(c)) },
      ...(stav === 'koncept' ? [{ label: 'Zveřejnit', icon: 'check', hint: 'Hosté ho uvidí a mohou si ho vzít.', onClick: () => { void zmen(c, { draft: false }, 'Kupon zveřejněn.'); } }] : []),
      ...(!c.draft && !c.archived && stav !== 'vyprselo' && c.active ? [{ label: 'Poslat hostům…', icon: 'send', hint: 'Hostovi, skupině, nebo všem členům.', onClick: () => setPosilam(c) }] : []),
      { label: 'Duplikovat', icon: 'copy', hint: 'Vznikne koncept, který si upravíš.', onClick: () => setForm(duplikujKupon(c)) },
      { label: 'Historie změn…', icon: 'clock', hint: 'Kdo a kdy kupon založil, upravil nebo rozeslal.', onClick: () => setHistorie(c) },
      c.archived
        ? { label: 'Vrátit z archivu', icon: 'undo', onClick: () => { void zmen(c, { archived: false }, 'Kupon je zpět mezi aktuálními.'); } }
        : { label: 'Archivovat', icon: 'archive', hint: 'Hosté ho už neuvidí, vydané kódy zůstanou platné.', onClick: () => { void zmen(c, { archived: true }, 'Kupon archivován.'); } },
      { label: 'Smazat…', icon: 'trash', danger: true, onClick: () => setMazu(c) },
    ];
  };

  const mazuOtevrene = mazu ? Math.max(0, Number(mazu.claimed) - Number(mazu.redeemed)) : 0;
  const mazuUplatnene = mazu ? Number(mazu.redeemed) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 items-start">
        {uplatni && <KuponyUplatnit toast={toast} onDone={obnovVse} />}
        {spravuje && (
          <Card pad="none" aria-labelledby="v-kupony" className={uplatni ? '' : 'lg:col-span-2'}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
              <h2 id="v-kupony" className="t-card">Katalog kuponů</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Menu size="sm" label="Exportovat kupony do CSV" items={[
                  { label: 'Katalog kuponů (CSV)', icon: 'download', onClick: () => stahni('/api/client/admin/coupons?export=kupony') },
                  { label: 'Vydané kódy (CSV)', icon: 'download', hint: 'Kdo kód dostal, kdy ho uplatnil, za kolik, kdo ho uplatnil.', onClick: () => stahni('/api/client/admin/coupons?export=claimy') },
                ]} />
                {videt.length > 0 && <Button size="sm" variant="ghost" onClick={() => { setVybiram(v => !v); setVybrane([]); }}>{vybiram ? 'Hotovo' : 'Vybrat'}</Button>}
                <Button size="sm" variant="secondary" icon="plus" onClick={() => setForm(prazdnyKupon())}>Nový kupon</Button>
              </div>
            </div>
            {vybiram && (
              <div className="px-5 pt-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Hromadné akce s kupony">
                <span className="t-meta mr-1">{vybrane.length ? `Vybráno: ${czCount(vybrane.length, KUPON)}` : 'Zaškrtni kupony'}</span>
                {filtr === 'archiv'
                  ? <Button size="sm" variant="secondary" disabled={!vybrane.length} loading={busy === 'hromadne'} onClick={() => { void hromadne('obnovit'); }}>Vrátit z archivu</Button>
                  : <>
                    <Button size="sm" variant="secondary" disabled={!vybrane.length} loading={busy === 'hromadne'} onClick={() => { void hromadne('zapnout'); }}>Zapnout</Button>
                    <Button size="sm" variant="secondary" disabled={!vybrane.length} loading={busy === 'hromadne'} onClick={() => { void hromadne('pozastavit'); }}>Pozastavit</Button>
                    <Button size="sm" variant="secondary" disabled={!vybrane.length} loading={busy === 'hromadne'} onClick={() => { void hromadne('archivovat'); }}>Archivovat</Button>
                  </>}
                <Button size="sm" variant="danger" disabled={!vybrane.length} loading={busy === 'hromadne'} onClick={() => { void hromadne('smazat'); }}>Smazat nepoužité</Button>
              </div>
            )}
            <div className="px-5 pt-3">
              <Segmented size="sm" ariaLabel="Které kupony ukázat" value={filtr} onChange={setFiltr} options={[
                { id: 'aktualni', label: `Aktuální (${pocet('aktualni')})` },
                { id: 'koncepty', label: `Koncepty (${pocet('koncepty')})` },
                { id: 'archiv', label: `Archiv (${pocet('archiv')})` },
              ]} />
            </div>
            {videt.length === 0 ? (
              <div className="px-5 pb-5 pt-2">
                {filtr === 'aktualni' && <EmptyState icon="gift" title="Zatím žádný kupon" hint="Založ první — třeba slevu 15 % pro Zlaté hosty nebo uvítací dezert zdarma." compact />}
                {filtr === 'koncepty' && <EmptyState icon="pencil" title="Žádný koncept" hint="Rozepsaný kupon, který hosté zatím nevidí, najdeš tady. Uložíš ho tlačítkem „Uložit jako koncept“." compact />}
                {filtr === 'archiv' && <EmptyState icon="archive" title="Archiv je prázdný" hint="Kupony, které už nechceš nabízet, ale chceš si je pamatovat, patří sem." compact />}
              </div>
            ) : (
              <ul className="list px-5">
                {videt.map((c: any) => {
                  const stav: StavKuponu = c.stav;
                  return (
                    <ListRow key={c.id} className={c.active && !c.archived ? '' : 'opacity-70'}
                      lead={vybiram ? <input type="checkbox" className="h-5 w-5 accent-[#16181A]" aria-label={`Vybrat kupon ${c.title}`} checked={vybrane.includes(c.id)}
                        onChange={() => setVybrane(v => (v.includes(c.id) ? v.filter(x => x !== c.id) : [...v, c.id]))} /> : undefined}
                      title={<span className="flex items-center gap-1.5 min-w-0"><span className="truncate">{c.title}</span>{c.benefit && <Chip tone="muted" size="sm">{c.benefit}</Chip>}</span>}
                      meta={[
                        c.costPoints > 0 ? `${c.costPoints} b.` : 'zdarma', ...(c.badges ?? []),
                        c.validSince && stav === 'naplanovano' ? `od ${czDay(c.validSince)}` : null,
                        c.validUntil ? `do ${czDay(c.validUntil)}` : null,
                        c.maxTotal ? `zbývá ${czCount(Number(c.remaining ?? 0), KUS)} z ${c.maxTotal}` : null,
                        c.dailyLimit ? `${c.dailyLimit}× denně` : null,
                        `vzato ${c.claimed}×, uplatněno ${c.redeemed}×`,
                      ].filter(Boolean).join(' · ')}
                      aside={<span className="flex items-center gap-1">
                        {c.welcome && <Chip tone="info" size="sm">uvítací</Chip>}
                        {stav !== 'aktivni' && <Chip tone={TON[stav]} size="sm">{STAV_POPISKY[stav]}</Chip>}
                      </span>}
                      actions={<>
                        {!c.draft && !c.archived && <Switch checked={!!c.active} disabled={busy === 'zmena:' + c.id} onChange={() => { void zmen(c, { active: !c.active }, c.active ? 'Kupon vypnut.' : 'Kupon zapnut.'); }} label={`Aktivní: ${c.title}`} />}
                        <Menu size="sm" label={`Další akce s kuponem ${c.title}`} items={akce(c)} />
                      </>} />
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>
      {spravuje && <KuponyPrehled obnov={obnov} />}

      {nahled && (
        <Modal open onClose={() => setNahled(null)} size="sm" title="Náhled pro hosta" footer={<Button variant="secondary" onClick={() => setNahled(null)}>Zavřít</Button>}>
          <KuponyNahled f={nahled} />
        </Modal>
      )}
      {historie && <KuponyHistorie kupon={historie} onZavrit={() => setHistorie(null)} />}
      {posilam && <KuponyOdeslat kupon={posilam} groups={groups} onZavrit={() => setPosilam(null)} oznam={toast} onHotovo={obnovVse} />}
      {mazu && (
        <Modal open onClose={() => setMazu(null)} size="sm" title={`Smazat kupon „${mazu.title}"?`}
          footer={<>
            <Button variant="secondary" onClick={() => setMazu(null)}>Nechat být</Button>
            {mazuUplatnene > 0 || mazuOtevrene > 0
              ? <Button variant="secondary" icon="archive" loading={busy === 'zmena:' + mazu.id} onClick={() => { const c = mazu; setMazu(null); void zmen(c, { archived: true }, 'Kupon archivován.'); }}>Archivovat</Button>
              : null}
            {mazuUplatnene === 0 && <Button variant="danger-solid" loading={busy === 'smazat'} onClick={() => { void smaz(mazu, mazuOtevrene > 0); }}>
              {mazuOtevrene > 0 ? 'Zrušit nevyzvednuté a smazat' : 'Smazat'}
            </Button>}
          </>}>
          <div className="space-y-2 text-sm text-black/70 text-pretty">
            {mazuUplatnene > 0 && <p>Hosté tenhle kupon už uplatnili {mazuUplatnene}×. Smazáním bys ztratil historii a přehled uplatnění, proto ho radši archivuj: hosté ho přestanou vidět a statistiky zůstanou.</p>}
            {mazuUplatnene === 0 && mazuOtevrene > 0 && (<>
              <p>Hosté drží {czCount(mazuOtevrene, KOD)}, které ještě nikdo neuplatnil.</p>
              <p><strong>Archivovat</strong>: nikdo si ho nevezme znovu, ale vydané kódy dál platí.</p>
              <p><strong>Zrušit nevyzvednuté a smazat</strong>: kódy zmizí a hostům se vrátí body, které za ně utratili. Nejde to vrátit zpět.</p>
            </>)}
            {mazuUplatnene === 0 && mazuOtevrene === 0 && <p>Nikdo ho nedrží ani neuplatnil. Smazání nejde vrátit zpět.</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
