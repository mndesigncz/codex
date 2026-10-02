'use client';

// Členové klubu: hledání, filtry (úroveň, skupina, neaktivní N dní, narozeniny tento
// měsíc, otevřený kupon, útrata), řazení, stránkování („Načíst další"), export do CSV,
// výběr hostů a hromadné akce (skupina, bonus bodů, zpráva), úprava bodů, kreditu a útraty
// jednoho hosta, detail s poznámkami, blokací, odebráním z klubu a celou historií a sloučení duplicit. Dřív funkce Clenove v ClientAdmin.tsx se stropem
// 500 řádků a bez filtrů.
//
// Oprávnění: seznam zakaznici.zobrazit, e-mail zakaznici.kontakty, export zakaznici.export,
// skupiny zakaznici.skupiny, body vernost.upravit_body, kredit vernost.kredit_upravit,
// zprávy zakaznici.zpravy, poznámky zakaznici.poznamky.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BulkBar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, SearchField, SelectBox, Select, Skeleton,
  useLoad, useSelection, type BulkAction,
} from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { useMoney, useSymbol } from '../../CurrencyProvider';
import { czCount, type CzNoun } from '@/lib/czech';
import { apiMessage, okJson, okText } from '@/lib/api';
import { ulozSoubor } from '@/lib/stahni';
import {
  PRAZDNY_FILTR, RAZENI, UROVNE_ID, HROMADNA_MAX, filtrNaParametry, pocetFiltru, tonBarvy, type FiltrClenu, type RazeniClenu,
} from '@/lib/clenoveFiltr';
import { PRECHOD_TLACITKO, useImportKarticky } from '../PrechodZKarticky';
import type { Hlaska } from '../import/typy';
import DetailClena, { denCesky } from './ClenoveDetail';
import { UpravaClenaOkno } from './BodyUpravaClena';
import Duplicity from './Duplicity';
import { HromadnaSkupina, HromadnyBonus, HromadnaZprava, type VyberHostu } from './ClenoveHromadne';

const CLEN: CzNoun = { one: 'člen', few: 'členové', many: 'členů' };
const STRANKA = 50;
const UROVNE_POPISKY: Record<string, string> = { bronze: 'Člen', silver: 'Stříbrný host', gold: 'Zlatý host', platinum: 'Platinový host' };

interface ClenRadek {
  id: number; name: string; email?: string; points: number; stamps: number; visits: number;
  joined_at: string; last_visit_at: string | null; reservations: number; open_coupons: number;
  // Úroveň podle režimu podniku a efektivní sleva (nejvyšší z úrovně a slev skupin) — počítá server.
  spend?: number; credit?: number; level_reduced?: boolean; level?: string; level_label?: string; discount?: number; discount_source?: 'uroven' | 'skupina' | null; discount_name?: string | null;
  skupiny?: { id: number; name: string; color: string | null }[]; has_birthday_month?: boolean; blocked?: boolean;
}

interface Stranka { rows: ClenRadek[]; total: number; all: number; hasMore: boolean; nextOffset: number | null }

type Okno = 'skupina' | 'bonus' | 'zprava' | null;

/**
 * Seznam členů s filtry a hromadnými akcemi. `dalsiAkce` je místo pro akce, které
 * dodá jiný okruh (poslat kupon vybraným): přidají se do lišty výběru za ty vlastní.
 */
export default function ClenoveSprava({ oznam, hledat = '', dalsiAkce }: {
  oznam: Hlaska; hledat?: string;
  dalsiAkce?: (vyber: VyberHostu) => BulkAction[];
}) {
  const money = useMoney();
  const symbol = useSymbol();
  const { ma: smi } = useOpravneni();
  const upravujeBody = smi('vernost.upravit_body');
  const upravujeKredit = smi('vernost.kredit_upravit');
  const vidiDenik = smi('vernost.zobrazit');
  // Skupiny člena bydlí ve stejné jamce jako deník, ale nesmí na věrnosti záviset:
  // role se zakaznici.skupiny bez vernost.zobrazit jinde hosta do skupiny nepřidá.
  const meniSkupiny = smi('zakaznici.skupiny');
  const piseZpravy = smi('zakaznici.zpravy');
  const smiExport = smi('zakaznici.export');
  const maPoznamky = smi('zakaznici.poznamky');
  const smiSpravu = smi('zakaznici.sprava_clenu');
  const rozbali = vidiDenik || meniSkupiny || maPoznamky || smiSpravu;

  // Hledání a čísla ve filtrech se ptají serveru s krátkou prodlevou, ať se neptá na každé písmeno.
  const [q, setQ] = useState(hledat);
  useEffect(() => { setQ(hledat); }, [hledat]);
  const [navrh, setNavrh] = useState<FiltrClenu>({ ...PRAZDNY_FILTR, q: hledat });
  const [filtr, setFiltr] = useState<FiltrClenu>({ ...PRAZDNY_FILTR, q: hledat });
  const [razeni, setRazeni] = useState<RazeniClenu>('posledni');
  const [filtryOtevrene, setFiltryOtevrene] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFiltr({ ...navrh, q }), 300);
    return () => clearTimeout(t);
  }, [navrh, q]);

  const dotaz = useMemo(() => {
    const p = filtrNaParametry(filtr);
    p.set('sort', razeni);
    return p.toString();
  }, [filtr, razeni]);

  // ---- seznam se stránkováním ----
  const [d, setD] = useState<Stranka | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [dalsi, setDalsi] = useState(false);
  const [verze, setVerze] = useState(0);
  const pozadavek = useRef(0);
  const reload = useCallback(() => setVerze(v => v + 1), []);
  useEffect(() => {
    const id = ++pozadavek.current;
    setChyba(null);
    fetch(`/api/client/admin/customers?${dotaz}&limit=${STRANKA}`).then(okJson).then(raw => {
      if (id !== pozadavek.current) return;
      setD({ rows: Array.isArray(raw?.customers) ? raw.customers : [], total: Number(raw?.total) || 0, all: Number(raw?.all) || 0, hasMore: !!raw?.hasMore, nextOffset: raw?.nextOffset ?? null });
    }).catch(e => { if (id === pozadavek.current) { setD(null); setChyba(apiMessage(e, 'Členové se nenačetli.')); } });
  }, [dotaz, verze]);
  const nactiDalsi = async () => {
    if (!d || d.nextOffset == null) return;
    const id = pozadavek.current;
    setDalsi(true);
    try {
      const raw = await fetch(`/api/client/admin/customers?${dotaz}&limit=${STRANKA}&offset=${d.nextOffset}`).then(okJson);
      if (id !== pozadavek.current) return;
      setD(p => p && ({ ...p, rows: [...p.rows, ...(Array.isArray(raw?.customers) ? raw.customers : [])], total: Number(raw?.total) || p.total, hasMore: !!raw?.hasMore, nextOffset: raw?.nextOffset ?? null }));
    } catch (e) { oznam(apiMessage(e, 'Další členy se nepodařilo načíst.'), 'bad'); }
    setDalsi(false);
  };

  // Skupiny pro filtr a hromadné přidání.
  const { data: sk, reload: reloadSkupin } = useLoad<{ groups: { id: number; name: string; color: string | null; dynamic: boolean; archived?: boolean; members: number }[] }>(
    '/api/client/admin/groups', raw => ({ groups: Array.isArray(raw?.groups) ? raw.groups : [] }));

  const imp = useImportKarticky(oznam, reload);
  const smiImport = imp.smi;
  const [otevreny, setOtevreny] = useState<number | null>(null);
  const [upravuji, setUpravuji] = useState<ClenRadek | null>(null);
  const [verzeDeniku, setVerzeDeniku] = useState(0);
  const [exportuji, setExportuji] = useState(false);
  const [okno, setOkno] = useState<Okno>(null);
  const [duplicity, setDuplicity] = useState(false);

  // ---- výběr ----
  const sel = useSelection<number>();
  const [vsechny, setVsechny] = useState(false);
  useEffect(() => { sel.exit(); setVsechny(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dotaz]);
  const pocetVyberu = vsechny ? (d?.total ?? 0) : sel.count;
  const vyber: VyberHostu = vsechny ? { filter: filtr, pocet: d?.total ?? 0 } : { ids: [...sel.selected], pocet: sel.count };
  const prepniRadek = (id: number) => {
    if (vsechny && d) { setVsechny(false); sel.selectAll(d.rows.map(r => r.id).filter(x => x !== id)); return; }
    sel.toggle(id);
  };
  const vybratVse = () => {
    if (!d) return;
    if (!d.hasMore) { setVsechny(false); sel.selectAll(d.rows.map(r => r.id)); return; }
    if (d.total > HROMADNA_MAX) { oznam(`Filtr odpovídá ${czCount(d.total, { one: 'hostovi', few: 'hostům', many: 'hostům' })}, najednou jde vybrat nejvýš ${HROMADNA_MAX}. Zúži filtr.`, 'bad'); return; }
    setVsechny(true);
  };
  const hotovoHromadne = () => { setOkno(null); sel.exit(); setVsechny(false); setOtevreny(null); reload(); reloadSkupin(); };

  const akceVyberu: BulkAction[] = [
    ...(meniSkupiny ? [{ label: 'Do skupiny', icon: 'users', primary: true, onClick: () => setOkno('skupina') }] : []),
    ...(upravujeBody ? [{ label: 'Bonus bodů', icon: 'gift', onClick: () => setOkno('bonus') }] : []),
    ...(piseZpravy ? [{ label: 'Zpráva', icon: 'send', onClick: () => setOkno('zprava') }] : []),
    ...(dalsiAkce ? dalsiAkce(vyber) : []),
  ];

  const exportuj = async () => {
    setExportuji(true);
    try {
      const text = await fetch(`/api/client/admin/customers?${dotaz}&format=csv`).then(okText);
      const r = await ulozSoubor('clenove.csv', text, 'text/csv;charset=utf-8');
      if (r !== 'nejde') oznam('Export členů je uložený.');
    } catch (err) { oznam(apiMessage(err, 'Export se nepodařil.'), 'bad'); }
    setExportuji(false);
  };

  const nastavFiltr = (zmena: Partial<FiltrClenu>) => setNavrh(p => ({ ...p, ...zmena }));
  const zrusFiltry = () => { setQ(''); setNavrh({ ...PRAZDNY_FILTR }); setFiltr({ ...PRAZDNY_FILTR }); };
  const pocetPodminek = pocetFiltru(navrh);
  const jeFiltrovano = pocetPodminek > 0 || !!filtr.q;
  const skupiny = sk?.groups ?? [];
  const rucniSkupiny = skupiny.filter(g => !g.dynamic && !g.archived);
  const prazdnaCelkem = d && d.all === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <SearchField className="w-full max-w-sm" value={q} onChange={setQ} storageKey="hoste" placeholder={smi('zakaznici.kontakty') ? 'Jméno nebo e-mail' : 'Jméno'} ariaLabel="Hledat zákazníka" />
        {d && <p className="t-meta tabular-nums" aria-live="polite">{jeFiltrovano ? `${czCount(d.total, CLEN)} z ${d.all}` : czCount(d.total, CLEN)}</p>}
        <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
          <Button size="sm" variant={filtryOtevrene || pocetPodminek ? 'primary' : 'secondary'} icon="grid" aria-expanded={filtryOtevrene} onClick={() => setFiltryOtevrene(v => !v)}>
            {pocetPodminek ? `Filtry (${pocetPodminek})` : 'Filtry'}
          </Button>
          {smiExport && <Button size="sm" variant="secondary" icon="download" loading={exportuji} disabled={!d || d.total === 0} onClick={() => { void exportuj(); }}>Export CSV</Button>}
          {smiImport && <Button size="sm" variant="secondary" icon="upload" onClick={imp.otevri}>{PRECHOD_TLACITKO}</Button>}
          {smiSpravu && <Button size="sm" variant="secondary" icon="users" onClick={() => setDuplicity(true)}>Duplicity</Button>}
        </div>
      </div>

      {filtryOtevrene && (
        <Card className="space-y-4" aria-label="Filtry členů">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field id="cf-razeni" label="Řazení">
              <Select id="cf-razeni" value={razeni} onChange={e => setRazeni(e.target.value as RazeniClenu)}>
                {RAZENI.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </Select>
            </Field>
            <Field id="cf-uroven" label="Úroveň">
              <Select id="cf-uroven" value={navrh.level} onChange={e => nastavFiltr({ level: e.target.value })}>
                <option value="">Všechny úrovně</option>
                {UROVNE_ID.map(u => <option key={u} value={u}>{UROVNE_POPISKY[u]}</option>)}
              </Select>
            </Field>
            <Field id="cf-skupina" label="Skupina">
              <Select id="cf-skupina" value={String(navrh.group || '')} onChange={e => nastavFiltr({ group: Number(e.target.value) || 0 })}>
                <option value="">Všechny skupiny</option>
                {skupiny.map(g => <option key={g.id} value={g.id}>{g.name} ({g.members})</option>)}
              </Select>
            </Field>
            <Field id="cf-quiet" label="Nepřišli aspoň (dní)" hint="Bez návštěvy se počítá od přidání do klubu.">
              <Input id="cf-quiet" type="number" inputMode="numeric" min={1} max={3650} placeholder="třeba 60" value={navrh.quietDays || ''}
                onChange={e => nastavFiltr({ quietDays: Math.max(0, Math.min(3650, Math.floor(Number(e.target.value)) || 0)) })} />
            </Field>
            <Field id="cf-spend" label={`Útrata od (${symbol})`} hint="Celková útrata za celou dobu.">
              <Input id="cf-spend" type="number" inputMode="numeric" min={1} placeholder="třeba 2000" value={navrh.spendOver || ''}
                onChange={e => nastavFiltr({ spendOver: Math.max(0, Math.floor(Number(e.target.value)) || 0) })} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={navrh.birthdayMonth} onClick={() => nastavFiltr({ birthdayMonth: !navrh.birthdayMonth })}
              className={`filter-pill tap-target-sm ${navrh.birthdayMonth ? 'seg-on' : 'seg-off glass'}`}>Narozeniny tento měsíc</button>
            <button type="button" aria-pressed={navrh.openCoupon} onClick={() => nastavFiltr({ openCoupon: !navrh.openCoupon })}
              className={`filter-pill tap-target-sm ${navrh.openCoupon ? 'seg-on' : 'seg-off glass'}`}>Má otevřený kupon</button>
            {jeFiltrovano && <Button size="sm" variant="ghost" onClick={zrusFiltry}>Zrušit filtry</Button>}
          </div>
        </Card>
      )}

      {chyba ? <ErrorState title="Členové se nenačetli" onRetry={reload} detail={chyba} />
        : d === null ? <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        : d.rows.length === 0 ? (
          <Card>
            {prazdnaCelkem ? (
              <EmptyState icon="users" compact title="Zatím žádní členové"
                hint={smiImport ? 'Přidají se sami na tvé stránce pro hosty. Máš členy v Kartičce? Přeneseš je i s body a razítky.' : 'Přidají se sami na tvé stránce pro hosty.'}
                action={smiImport ? <Button size="sm" variant="secondary" icon="upload" onClick={imp.otevri}>{PRECHOD_TLACITKO}</Button> : undefined} />
            ) : (
              <EmptyState icon="users" compact title="Nikdo takový" hint="Zkus uvolnit filtry nebo hledat jinak."
                action={jeFiltrovano ? <Button size="sm" variant="secondary" onClick={zrusFiltry}>Zrušit filtry</Button> : undefined} />
            )}
          </Card>
        ) : (
          <Card pad="none">
            <ul className="list px-5">
              {d.rows.map(c => {
                const uroven = { id: c.level ?? 'bronze', label: c.level_label ?? 'Člen' };
                const sg = c.skupiny ?? [];
                const vybran = vsechny || sel.has(c.id);
                return (
                  <li key={c.id}>
                    <ListRow as="div"
                      lead={(meniSkupiny || upravujeBody || piseZpravy) ? <SelectBox checked={vybran} onChange={() => prepniRadek(c.id)} label={`Vybrat: ${c.name}`} /> : undefined}
                      title={<span className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{c.name}</span>
                        {uroven.id !== 'bronze' && <Chip tone={uroven.id === 'silver' ? 'muted' : 'ink'} size="sm">{uroven.label}</Chip>}
                        {c.level_reduced && <Chip tone="wait" size="sm">snížená po pauze</Chip>}
                        {c.blocked && <Chip tone="bad" size="sm">Zablokovaný</Chip>}
                        {Number(c.discount) > 0 && <Chip tone="ok" size="sm">{`Sleva ${c.discount} %${c.discount_source === 'skupina' && c.discount_name ? ` (${c.discount_name})` : ''}`}</Chip>}
                        {c.has_birthday_month && <Chip tone="info" size="sm" icon="gift">Narozeniny</Chip>}
                        {sg.slice(0, 2).map(g => <Chip key={g.id} tone={tonBarvy(g.color)} size="sm">{g.name}</Chip>)}
                        {sg.length > 2 && <Chip tone="muted" size="sm">{`+${sg.length - 2}`}</Chip>}
                      </span>}
                      meta={[c.email, `člen od ${denCesky(c.joined_at)}`, c.last_visit_at ? `naposledy ${denCesky(c.last_visit_at)}` : 'zatím nebyl'].filter(Boolean).join(' · ')}
                      value={<>{c.points.toLocaleString('cs-CZ')} <span className="text-xs font-medium text-black/50">b.</span></>}
                      valueMeta={`${c.stamps} raz. · ${c.visits} návšt.${Number(c.spend) > 0 ? ` · ${money(Number(c.spend))}` : ''}${Number(c.credit) > 0 ? ` · kredit ${money(Number(c.credit))}` : ''}`}
                      aside={<>{c.reservations} rez.{c.open_coupons ? ` · ${c.open_coupons} kup.` : ''}</>}
                      actions={(upravujeBody || upravujeKredit || rozbali) ? (
                        <>
                          {(upravujeBody || upravujeKredit) && <Button size="sm" variant="secondary" onClick={() => setUpravuji(c)} aria-label={`Upravit body a kredit: ${c.name}`}>{upravujeBody ? 'Body ±' : 'Kredit ±'}</Button>}
                          {rozbali && <Button size="sm" variant="ghost" aria-expanded={otevreny === c.id} onClick={() => setOtevreny(otevreny === c.id ? null : c.id)}>{otevreny === c.id ? 'Skrýt' : vidiDenik ? 'Deník' : maPoznamky ? 'Poznámky' : 'Skupiny'}</Button>}
                        </>
                      ) : undefined} />
                    {otevreny === c.id && <DetailClena key={verzeDeniku} customerId={c.id} jmeno={c.name} zablokovany={c.blocked === true} oznam={oznam} vidiDenik={vidiDenik} onZmena={() => { setOtevreny(null); reload(); }} />}
                  </li>
                );
              })}
            </ul>
            <div className="px-5 py-3 flex items-center gap-3 flex-wrap border-t border-black/5">
              <p className="t-meta tabular-nums">Zobrazeno {d.rows.length} z {d.total}</p>
              {d.hasMore && <Button size="sm" variant="secondary" loading={dalsi} onClick={() => { void nactiDalsi(); }}>Načíst další</Button>}
            </div>
          </Card>
        )}
      {imp.okno}
      {duplicity && <Duplicity oznam={oznam} onZavrit={() => setDuplicity(false)} onSlouceno={() => { setOtevreny(null); reload(); }} />}

      <BulkBar count={pocetVyberu}
        totalLabel={d && pocetVyberu < d.total ? `Vybrat vše (${d.total})` : undefined}
        onSelectAll={vybratVse}
        onExit={() => { sel.exit(); setVsechny(false); }}
        actions={akceVyberu}
        note={vsechny ? 'Vybráni jsou všichni, kdo splňují filtr, i ti, které ještě nevidíš.' : undefined} />

      {okno === 'skupina' && <HromadnaSkupina vyber={vyber} skupiny={rucniSkupiny} oznam={oznam} onZavrit={() => setOkno(null)} onHotovo={hotovoHromadne} />}
      {okno === 'bonus' && <HromadnyBonus vyber={vyber} oznam={oznam} onZavrit={() => setOkno(null)} onHotovo={hotovoHromadne} />}
      {okno === 'zprava' && <HromadnaZprava vyber={vyber} nazevPodniku={null} oznam={oznam} onZavrit={() => setOkno(null)} onHotovo={hotovoHromadne} />}

      {upravuji && (
        <UpravaClenaOkno clen={upravuji} smiBody={upravujeBody} smiKredit={upravujeKredit} oznam={oznam}
          onHotovo={() => { reload(); setVerzeDeniku(v => v + 1); }} onZavrit={() => setUpravuji(null)} />
      )}
    </div>
  );
}
