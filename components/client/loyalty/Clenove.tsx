'use client';

// Členové klubu: hledání, filtry (úroveň, skupina, segment, stav), řazení, stránkování, výběr a hromadné akce
// (skupina, body, kupon, zpráva), export do CSV, hledání a sloučení duplicit, detail s poznámkou, blokací
// a celou historií. Telefon a e-mail vidí jen ti, kdo smí kontakty.

import { useEffect, useMemo, useState } from 'react';
import { BulkBar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Modal, SearchField, Segmented, Select, SelectBox, Skeleton, Textarea, useLoad, useSelection } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { useMoney } from '../../CurrencyProvider';
import { czCount } from '@/lib/czech';
import { SEGMENTY } from '@/lib/segmenty';
import { adresaDotazu, dotazClenu, NA_STRANU, pocetFiltru, pocetStran, RAZENI_CLENU, STAVY_FILTR, telefonCitelne, type DotazClenu } from '@/lib/clenoveSeznam';
import { apiMessage, okJson } from '@/lib/api';
import { PRECHOD_TLACITKO, useImportKarticky } from '../PrechodZKarticky';
import { cislo, CLEN, denCesky, j, stahniZAdresy, type Hlaska } from './spolecne';
import ClenDetail from './ClenDetail';
import Duplicity from './Duplicity';
import HromadneOkno, { MAX_ZPRAVA_VYBER, type AkceVyberu } from './HromadneAkce';
import KombinaceVyber from './KombinaceVyber';

interface ClenRadek {
  id: number; name: string; email?: string; phone?: string | null; points: number; stamps: number; visits: number;
  joined_at: string; last_visit_at: string | null; reservations: number; open_coupons: number; blocked?: boolean; note?: string | null; novinky?: boolean;
  spend?: number; level?: string; level_label?: string; discount?: number; discount_source?: 'uroven' | 'skupina' | null; discount_name?: string | null;
}

const UROVNE = [
  { id: '', label: 'Všechny úrovně' }, { id: 'bronze', label: 'Člen' }, { id: 'silver', label: 'Stříbrný' }, { id: 'gold', label: 'Zlatý' }, { id: 'platinum', label: 'Platinový' },
];
const MIX = '__mix__';
const MOZNOSTI_KOMBINACE = [
  ...SEGMENTY.map(s => ({ id: s.id, label: s.label, skupina: 'Podle chování' })),
  { id: 'tier:silver', label: 'Stříbrní a výš', skupina: 'Podle úrovně' }, { id: 'tier:gold', label: 'Zlatí a výš', skupina: 'Podle úrovně' }, { id: 'tier:platinum', label: 'Platinoví hosté', skupina: 'Podle úrovně' },
];

export default function Clenove({ oznam, hledat = '' }: { oznam: Hlaska; hledat?: string }) {
  const money = useMoney();
  const { ma: smi } = useOpravneni();
  const upravujeBody = smi('vernost.upravit_body');
  const vidiDenik = smi('vernost.zobrazit');
  // Skupiny člena bydlí ve stejné jamce jako deník, ale nesmí na věrnosti záviset.
  const meniSkupiny = smi('zakaznici.skupiny');
  const spravuje = smi('zakaznici.sprava_clenu');
  const smiZpravy = smi('zakaznici.zpravy');
  const smiKupony = smi('kupony.spravovat');
  const rozbali = vidiDenik || meniSkupiny || spravuje;

  const [q, setQ] = useState(hledat);
  useEffect(() => { setQ(hledat); }, [hledat]);
  // Hledání se ptá serveru (výsledky přes celou databázi) — s krátkou prodlevou, ať se neptá na každé písmeno.
  const [dotazText, setDotazText] = useState(hledat);
  useEffect(() => { const t = setTimeout(() => setDotazText(q), q ? 250 : 0); return () => clearTimeout(t); }, [q]);
  const [razeni, setRazeni] = useState('aktivita');
  const [uroven, setUroven] = useState('');
  const [skupina, setSkupina] = useState('');
  const [segmentTyp, setSegmentTyp] = useState('');
  const [mix, setMix] = useState('');
  const [stav, setStav] = useState('');
  const [strana, setStrana] = useState(1);
  const [naStranu, setNaStranu] = useState(NA_STRANU);
  const [filtryOtevrene, setFiltryOtevrene] = useState(false);
  const segment = segmentTyp === MIX ? mix : segmentTyp;

  const dotaz: DotazClenu = useMemo(() => dotazClenu({ q: dotazText, sort: razeni, strana: String(strana), naStranu: String(naStranu), uroven, skupina, segment, stav }), [dotazText, razeni, strana, naStranu, uroven, skupina, segment, stav]);
  // Změna hledání nebo filtru začíná zase první stranou.
  useEffect(() => { setStrana(1); }, [dotazText, razeni, uroven, skupina, segment, stav, naStranu]);
  const { data: d, error, reload } = useLoad<{ customers: ClenRadek[]; total: number }>(
    adresaDotazu(dotaz),
    raw => ({ customers: Array.isArray(raw?.customers) ? raw.customers : [], total: Number(raw?.total) || 0 }),
  );
  const { data: skupinyData } = useLoad<{ id: number; name: string; archived: boolean }[]>('/api/client/admin/groups', raw => (Array.isArray(raw?.groups) ? raw.groups : []));
  const imp = useImportKarticky(oznam, reload);
  const smiImport = imp.smi;
  const vyber = useSelection<number>();
  const [otevreny, setOtevreny] = useState<number | null>(null);
  const [upravuji, setUpravuji] = useState<{ c: ClenRadek; delta: string; poznamka: string; co: 'body' | 'utrata' } | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [akce, setAkce] = useState<AkceVyberu | null>(null);
  const [duplicity, setDuplicity] = useState(false);
  const [bere, setBere] = useState(false);
  const [exportuji, setExportuji] = useState(false);

  const pocetF = pocetFiltru(dotaz);
  const zrusFiltry = () => { setUroven(''); setSkupina(''); setSegmentTyp(''); setMix(''); setStav(''); setQ(''); };
  const stran = pocetStran(d?.total ?? 0, naStranu);
  const aktivniFiltr = pocetF > 0 || !!dotazText;
  const nacitani = d === null && !error;

  const ulozBody = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upravuji) return;
    const delta = parseInt(upravuji.delta, 10);
    if (!delta) return;
    setUkladam(true);
    try {
      const utrata = upravuji.co === 'utrata';
      const r = await j('/api/client/admin/loyalty', { method: 'POST', body: JSON.stringify({ customerId: upravuji.c.id, delta, note: upravuji.poznamka, ...(utrata ? { what: 'spend' } : {}) }) });
      oznam(utrata ? `${upravuji.c.name}: útrata teď ${money(r.spend)}.` : `${upravuji.c.name}: teď ${r.points} bodů.`);
      setUpravuji(null); reload();
    } catch (err) { oznam(apiMessage(err, 'Body se nepodařilo upravit.'), 'bad'); }
    setUkladam(false);
  };
  const vyberVse = async () => {
    setBere(true);
    try {
      const r = await fetch(adresaDotazu({ ...dotaz, strana: 1 }, { format: 'ids' })).then(okJson);
      vyber.selectAll((r.ids ?? []).map(Number));
      if ((r.total ?? 0) > (r.ids ?? []).length) oznam(`Vybrala se prvních ${cislo((r.ids ?? []).length)} z ${cislo(r.total)}. Zúži filtr, ať vybereš všechny.`, 'bad');
    } catch (err) { oznam(apiMessage(err, 'Výběr se nepodařilo načíst.'), 'bad'); }
    setBere(false);
  };
  const exportuj = async () => {
    setExportuji(true);
    const r = await stahniZAdresy(adresaDotazu({ ...dotaz, strana: 1 }, { format: 'csv' }), 'clenove.csv');
    oznam(r.zprava, r.ok ? 'ok' : 'bad');
    setExportuji(false);
  };
  const ids = Array.from(vyber.selected);
  const akceVyberu = [
    ...(meniSkupiny ? [{ label: 'Do skupiny', onClick: () => setAkce('skupina_pridat'), icon: 'users' }, { label: 'Ze skupiny', onClick: () => setAkce('skupina_odebrat') }] : []),
    ...(upravujeBody ? [{ label: 'Body', onClick: () => setAkce('body') }] : []),
    ...(smiKupony ? [{ label: 'Kupon', onClick: () => setAkce('kupon') }] : []),
    ...(smiZpravy ? [{ label: 'Zpráva', onClick: () => setAkce('zprava'), primary: true, icon: 'send', disabled: ids.length > MAX_ZPRAVA_VYBER }] : []),
  ];
  const muzeVybirat = akceVyberu.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <SearchField className="w-full max-w-sm" value={q} onChange={setQ} storageKey="hoste" placeholder={smi('zakaznici.kontakty') ? 'Jméno, e-mail nebo telefon' : 'Jméno'} ariaLabel="Hledat zákazníka" />
        <Select aria-label="Řazení členů" className="!w-auto" value={razeni} onChange={e => setRazeni(e.target.value)}>
          {RAZENI_CLENU.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </Select>
        <Button size="sm" variant="secondary" icon="filter" aria-expanded={filtryOtevrene} onClick={() => setFiltryOtevrene(v => !v)}>Filtry{pocetF ? ` (${pocetF})` : ''}</Button>
        {d && <p className="t-meta tabular-nums" aria-live="polite">{czCount(d.total, CLEN)}{aktivniFiltr ? ' podle hledání a filtrů' : ''}</p>}
        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          {muzeVybirat && <Button size="sm" variant={vyber.selecting ? 'primary' : 'secondary'} icon="check" aria-pressed={vyber.selecting} onClick={() => (vyber.selecting ? vyber.exit() : vyber.start())}>{vyber.selecting ? 'Hotovo' : 'Vybrat'}</Button>}
          <Button size="sm" variant="secondary" icon="download" loading={exportuji} onClick={() => { void exportuj(); }}>Export CSV</Button>
          {spravuje && <Button size="sm" variant="secondary" icon="users" onClick={() => setDuplicity(true)}>Duplicity</Button>}
          {smiImport && <Button size="sm" variant="secondary" icon="upload" onClick={imp.otevri}>{PRECHOD_TLACITKO}</Button>}
        </div>
      </div>

      {filtryOtevrene && (
        <Card className="grid gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field id="cf-uroven" label="Úroveň"><Select id="cf-uroven" value={uroven} onChange={e => setUroven(e.target.value)}>{UROVNE.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}</Select></Field>
            <Field id="cf-skupina" label="Skupina">
              <Select id="cf-skupina" value={skupina} onChange={e => setSkupina(e.target.value)}>
                <option value="">Všechny skupiny</option>
                {(skupinyData ?? []).map(g => <option key={g.id} value={String(g.id)}>{g.name}{g.archived ? ' (archiv)' : ''}</option>)}
              </Select>
            </Field>
            <Field id="cf-segment" label="Chování">
              <Select id="cf-segment" value={segmentTyp} onChange={e => setSegmentTyp(e.target.value)}>
                <option value="">Bez omezení</option>
                {SEGMENTY.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                <option value={MIX}>Kombinace podmínek…</option>
              </Select>
            </Field>
            <Field id="cf-stav" label="Stav"><Select id="cf-stav" value={stav} onChange={e => setStav(e.target.value)}><option value="">Všichni</option>{STAVY_FILTR.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
          </div>
          {segmentTyp === MIX && <KombinaceVyber idPrefix="cf-mix" moznosti={MOZNOSTI_KOMBINACE} value={mix} onChange={setMix} />}
          {segmentTyp && segmentTyp !== MIX && <p className="t-meta">{SEGMENTY.find(x => x.id === segmentTyp)?.popis}</p>}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="ghost" disabled={!aktivniFiltr} onClick={zrusFiltry}>Zrušit hledání a filtry</Button>
          </div>
        </Card>
      )}

      {error ? <ErrorState title="Členové se nenačetli" onRetry={reload} detail={error} />
        : nacitani ? <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        : d && d.customers.length === 0 ? (
          <Card><EmptyState icon="users" compact title={aktivniFiltr ? 'Nikdo takový' : 'Zatím žádní členové'}
            hint={aktivniFiltr ? 'Zkus jiné hledání nebo zruš filtry.' : smiImport ? 'Přidají se sami na tvé stránce pro hosty. Máš členy v Kartičce? Přeneseš je i s body a razítky.' : 'Přidají se sami na tvé stránce pro hosty.'}
            action={aktivniFiltr ? <Button size="sm" variant="secondary" onClick={zrusFiltry}>Zrušit hledání a filtry</Button> : smiImport ? <Button size="sm" variant="secondary" icon="upload" onClick={imp.otevri}>{PRECHOD_TLACITKO}</Button> : undefined} /></Card>
        ) : d && (
          <Card pad="none">
            <ul className="list px-5">
              {d.customers.map(c => {
                const urovenId = c.level ?? 'bronze';
                return (
                  <li key={c.id}>
                    <ListRow as="div"
                      lead={vyber.selecting ? <SelectBox checked={vyber.has(c.id)} onChange={() => vyber.toggle(c.id)} label={`Vybrat ${c.name}`} /> : undefined}
                      title={<span className="flex items-center gap-2 min-w-0"><span className="truncate">{c.name}</span>
                        {c.blocked && <Chip tone="bad" size="sm">Zablokovaný</Chip>}
                        {urovenId !== 'bronze' && <Chip tone={urovenId === 'silver' ? 'muted' : 'ink'} size="sm">{c.level_label ?? 'Člen'}</Chip>}
                        {Number(c.discount) > 0 && <Chip tone="ok" size="sm">{`Sleva ${c.discount} %${c.discount_source === 'skupina' && c.discount_name ? ` (${c.discount_name})` : ''}`}</Chip>}
                        {c.note && <Chip tone="muted" size="sm">Poznámka</Chip>}</span>}
                      meta={[c.email, c.phone ? telefonCitelne(c.phone) : null, `člen od ${denCesky(c.joined_at)}`, c.last_visit_at ? `naposledy ${denCesky(c.last_visit_at)}` : 'zatím nebyl u kasy'].filter(Boolean).join(' · ')}
                      value={<>{cislo(c.points)} <span className="text-xs font-medium text-black/50">b.</span></>}
                      valueMeta={`${c.stamps} raz. · ${c.visits} návšt.${Number(c.spend) > 0 ? ` · ${money(Number(c.spend))}` : ''}`}
                      aside={<>{c.reservations} rez.{c.open_coupons ? ` · ${c.open_coupons} kup.` : ''}</>}
                      actions={(upravujeBody || rozbali) ? (
                        <>
                          {upravujeBody && <Button size="sm" variant="secondary" onClick={() => setUpravuji({ c, delta: '', poznamka: '', co: 'body' })} aria-label={`Upravit body: ${c.name}`}>Body ±</Button>}
                          {rozbali && <Button size="sm" variant="ghost" aria-expanded={otevreny === c.id} onClick={() => setOtevreny(otevreny === c.id ? null : c.id)}>{otevreny === c.id ? 'Skrýt' : vidiDenik ? 'Deník' : meniSkupiny ? 'Skupiny' : 'Detail'}</Button>}
                        </>
                      ) : undefined} />
                    {otevreny === c.id && <ClenDetail clen={c} oznam={oznam} vidiDenik={vidiDenik} onZmena={reload} />}
                  </li>
                );
              })}
            </ul>
            {stran > 1 && (
              <div className="flex items-center justify-center gap-3 px-5 py-3 border-t border-black/5 flex-wrap">
                <Button size="sm" variant="secondary" disabled={strana <= 1} onClick={() => setStrana(s => Math.max(1, s - 1))}>Předchozí</Button>
                <span className="t-meta tabular-nums" aria-live="polite">Strana {strana} z {stran}</span>
                <Button size="sm" variant="secondary" disabled={strana >= stran} onClick={() => setStrana(s => Math.min(stran, s + 1))}>Další</Button>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 px-5 pb-3">
              <label htmlFor="cl-na-stranu" className="t-meta">Na stránku</label>
              <Select id="cl-na-stranu" className="!w-auto" value={String(naStranu)} onChange={e => setNaStranu(Number(e.target.value))}>
                {[25, 50, 100, 200].map(n => <option key={n} value={String(n)}>{n}</option>)}
              </Select>
            </div>
          </Card>
        )}
      {vyber.selecting && (
        <BulkBar count={vyber.count} totalLabel={d && d.total > vyber.count ? `${bere ? 'Načítám…' : `Vybrat všech ${cislo(d.total)}`}` : undefined} onSelectAll={() => { void vyberVse(); }} onExit={vyber.exit}
          actions={akceVyberu}
          note={ids.length > MAX_ZPRAVA_VYBER ? `Zpráva jde nejvýš ${cislo(MAX_ZPRAVA_VYBER)} vybraným.` : undefined} />
      )}
      {akce && <HromadneOkno akce={akce} ids={ids} oznam={oznam} onZavrit={() => setAkce(null)} onHotovo={() => { setAkce(null); vyber.exit(); reload(); }} />}
      {duplicity && <Duplicity oznam={oznam} onZavrit={() => setDuplicity(false)} onSlouceno={reload} />}
      {imp.okno}
      {upravuji && (
        <Modal open onClose={() => setUpravuji(null)} size="sm" title={`Body pro ${upravuji.c.name}`}
          subtitle={upravuji.co === 'utrata' ? `Útrata teď ${money(Number(upravuji.c.spend) || 0)}` : `Teď má ${cislo(upravuji.c.points)} b.`}
          footer={<>
            <Button variant="secondary" onClick={() => setUpravuji(null)}>Zrušit</Button>
            <Button type="submit" form="body-okno" variant="primary" loading={ukladam} disabled={!parseInt(upravuji.delta, 10)}>Uložit</Button>
          </>}>
          <form id="body-okno" onSubmit={ulozBody} className="space-y-4">
            <Segmented options={[{ id: 'body', label: 'Body' }, { id: 'utrata', label: 'Útrata' }]} value={upravuji.co} onChange={v => setUpravuji({ ...upravuji, co: v as 'body' | 'utrata' })} size="sm" ariaLabel="Co upravit" />
            <Field id="body-delta" label={upravuji.co === 'utrata' ? 'O kolik upravit útratu' : 'Kolik bodů'} hint={upravuji.co === 'utrata' ? 'Útrata určuje úroveň, když podnik počítá úrovně podle útraty. Kladné číslo přičte, záporné odečte.' : 'Kladné číslo přičte, záporné odečte.'}>
              <Input id="body-delta" type="number" inputMode="numeric" autoFocus min={-100000} max={100000} className="!w-36"
                value={upravuji.delta} onChange={e => setUpravuji({ ...upravuji, delta: e.target.value })} />
            </Field>
            <Field id="body-proc" label="Proč" hint="Uvidíš to v deníku člena. Nepovinné.">
              <Textarea id="body-proc" rows={2} maxLength={200} value={upravuji.poznamka} onChange={e => setUpravuji({ ...upravuji, poznamka: e.target.value })} />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  );
}
