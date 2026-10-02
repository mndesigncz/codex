'use client';

// Skupiny hostů: název, popis, barva, archiv, ruční nebo dynamická (podle pravidla), členové skupiny
// s hledáním, odebráním a přidáním, hromadné přidání z CSV, export a vlastní sleva skupiny.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, SearchField, Select, Skeleton, Textarea, type MenuItem } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { czCount } from '@/lib/czech';
import { SEGMENTY } from '@/lib/segmenty';
import { BARVY_SKUPIN, MAX_NAZEV_SKUPINY, MAX_POPIS_SKUPINY } from '@/lib/skupinyPravidla';
import { csvNenalezenych } from '@/lib/clenoveSeznam';
import { apiMessage, okJson } from '@/lib/api';
import { cislo, CLEN, NAVSTEVA, RADEK, denCesky, j, stahniZAdresy, ulozCsv, type Hlaska } from './spolecne';
import KombinaceVyber from './KombinaceVyber';
import Potvrdit from './Potvrdit';

interface Skupina {
  id: number; name: string; members: number; rule: string | null; archived: boolean;
  description: string | null; color: string | null; discount_pct: number; rule_popis: string | null;
}

const MIX = '__mix__';
const MOZNOSTI_PRAVIDLA = [
  ...SEGMENTY.map(s => ({ id: s.id, label: s.label, skupina: 'Podle chování' })),
  { id: 'tier:silver', label: 'Stříbrní a výš', skupina: 'Podle úrovně' },
  { id: 'tier:gold', label: 'Zlatí a výš', skupina: 'Podle úrovně' },
  { id: 'tier:platinum', label: 'Platinoví hosté', skupina: 'Podle úrovně' },
];

export function BarvaSkupiny({ color, children }: { color: string | null | undefined; children: React.ReactNode }) {
  return <span className={`chip chip-sm ${color ? `cat-${color}` : 'chip-muted'}`}>{children}</span>;
}

export default function Skupiny({ oznam }: { oznam: Hlaska }) {
  const smi = useOpravneni().ma('zakaznici.skupiny');
  const [list, setList] = useState<Skupina[] | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [editor, setEditor] = useState<Skupina | 'nova' | null>(null);
  const [clenove, setClenove] = useState<Skupina | null>(null);
  const [import_, setImport] = useState<Skupina | null>(null);
  const [mazu, setMazu] = useState<Skupina | null>(null);
  const [archivOtevreny, setArchivOtevreny] = useState(false);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => fetch('/api/client/admin/groups').then(okJson)
    .then(d => { setList(Array.isArray(d.groups) ? d.groups : []); setChyba(null); })
    .catch(e => { setChyba(apiMessage(e, 'Skupiny se nenačetly.')); setList(prev => prev ?? []); }), []);
  useEffect(() => { void load(); }, [load]);

  const archivuj = async (g: Skupina, archived: boolean) => {
    setBusy(`arch:${g.id}`);
    try { await j('/api/client/admin/groups', { method: 'PATCH', body: JSON.stringify({ id: g.id, archived }) }); oznam(archived ? `Skupina ${g.name} je v archivu.` : `Skupina ${g.name} je zpátky.`); await load(); }
    catch (err) { oznam(apiMessage(err, 'Skupinu se nepodařilo archivovat.'), 'bad'); }
    setBusy('');
  };
  const smaz = async (g: Skupina) => {
    setBusy(`del:${g.id}`);
    try { await j(`/api/client/admin/groups?id=${g.id}`, { method: 'DELETE' }); oznam(`Skupina ${g.name} je smazaná.`); await load(); }
    catch (err) { oznam(apiMessage(err, 'Skupinu se nepodařilo smazat.'), 'bad'); }
    setBusy('');
  };
  const exportuj = async (g: Skupina) => {
    const r = await stahniZAdresy(`/api/client/admin/groups?id=${g.id}&format=csv`, `skupina-${g.name}.csv`);
    oznam(r.zprava, r.ok ? 'ok' : 'bad');
  };
  const ulozSlevu = async (g: Skupina, hodnota: string) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(hodnota) || 0)));
    if (n === (Number(g.discount_pct) || 0)) return;
    setBusy(`sleva:${g.id}`);
    try { await j('/api/client/admin/groups', { method: 'PATCH', body: JSON.stringify({ id: g.id, discount_pct: n }) }); await load(); oznam(`Sleva skupiny ${g.name}: ${n} %.`); }
    catch (err) { oznam(apiMessage(err, 'Slevu se nepodařilo uložit.'), 'bad'); await load(); }
    setBusy('');
  };

  const aktivni = (list ?? []).filter(g => !g.archived);
  const archiv = (list ?? []).filter(g => g.archived);
  const polozky = (g: Skupina): MenuItem[] => [
    { label: 'Exportovat členy do CSV', icon: 'download', onClick: () => { void exportuj(g); } },
    ...(smi && !g.rule && !g.archived ? [{ label: 'Přidat členy z CSV', icon: 'upload', onClick: () => setImport(g) }] : []),
    ...(smi ? [{ label: g.archived ? 'Vrátit z archivu' : 'Archivovat', icon: 'archive', onClick: () => { void archivuj(g, !g.archived); }, hint: g.archived ? undefined : 'Skupina zmizí z nabídek, členové zůstanou.' }] : []),
    ...(smi ? [{ label: 'Smazat skupinu', icon: 'trash', danger: true, onClick: () => setMazu(g) }] : []),
  ];

  const radek = (g: Skupina) => (
    <ListRow key={g.id}
      lead={<BarvaSkupiny color={g.color}>{g.name.slice(0, 1).toUpperCase()}</BarvaSkupiny>}
      title={<span className="flex items-center gap-2 min-w-0"><span className="truncate">{g.name}</span>{g.rule && <Chip tone="info" size="sm">Dynamická</Chip>}{g.archived && <Chip tone="muted" size="sm">Archiv</Chip>}</span>}
      meta={[czCount(g.members, CLEN), g.rule_popis, g.description, Number(g.discount_pct) > 0 ? `sleva ${g.discount_pct} %` : null].filter(Boolean).join(' · ')}
      actions={<>
        <Button size="sm" variant="secondary" onClick={() => setClenove(g)} aria-label={`Členové skupiny ${g.name}`}>Členové</Button>
        {smi && !g.archived && <Button size="sm" variant="ghost" onClick={() => setEditor(g)} aria-label={`Upravit skupinu ${g.name}`}>Upravit</Button>}
        <Menu size="sm" label={`Další akce se skupinou ${g.name}`} items={polozky(g)} />
      </>} />
  );

  return (
    <Card className="space-y-3" aria-labelledby="v-skupiny">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 id="v-skupiny" className="t-card">Skupiny hostů</h2>
          <p className="t-meta mt-0.5 max-w-[70ch]">Vlastní štítky mimo úrovně — „štamgasti", „firemní večery". Do ruční skupiny hosty přidáš v seznamu členů, ze souboru CSV nebo tady. Dynamická skupina se plní sama podle pravidla, třeba „nepřišli dva měsíce". Skupina může mít i vlastní slevu: člen ve víc skupinách (a s úrovní) bere vždy nejvyšší z nich, nikdy součet.</p>
        </div>
        {smi && <Button size="sm" variant="secondary" icon="plus" onClick={() => setEditor('nova')}>Nová skupina</Button>}
      </div>
      {chyba && list && list.length === 0 ? <ErrorState title="Skupiny se nenačetly" onRetry={() => { void load(); }} detail={chyba} />
        : list === null ? <Skeleton className="h-16" />
        : aktivni.length === 0 && archiv.length === 0 ? (
          <EmptyState icon="users" compact title="Zatím žádná skupina" hint="Skupina je štítek pro hosty, na který jde cílit kupon nebo zpráva. Založ první třeba pro štamgasty."
            action={smi ? <Button size="sm" variant="secondary" icon="plus" onClick={() => setEditor('nova')}>Založit skupinu</Button> : undefined} />
        ) : (
          <>
            {aktivni.length > 0 && (
              <ul className="list">
                {aktivni.map(g => (
                  <div key={g.id}>
                    {radek(g)}
                    {smi && !g.rule && (
                      <div className="pb-2 pl-1">
                        <label htmlFor={`sk-${g.id}`} className="inline-flex items-center gap-1.5 text-xs text-black/60">Sleva v %
                          <Input id={`sk-${g.id}`} key={`${g.id}:${g.discount_pct}`} type="number" inputMode="numeric" min={0} max={100} className="!w-20" aria-label={`Sleva v % pro skupinu ${g.name}`}
                            defaultValue={Number(g.discount_pct) || 0} disabled={busy === `sleva:${g.id}`}
                            onBlur={e => { void ulozSlevu(g, e.target.value); }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                        </label>
                      </div>
                    )}
                  </div>
                ))}
              </ul>
            )}
            {archiv.length > 0 && (
              <div>
                <Button size="sm" variant="ghost" aria-expanded={archivOtevreny} onClick={() => setArchivOtevreny(v => !v)}>{archivOtevreny ? 'Skrýt archiv' : `Archiv (${archiv.length})`}</Button>
                {archivOtevreny && <ul className="list mt-1">{archiv.map(radek)}</ul>}
              </div>
            )}
          </>
        )}
      {editor && <EditorSkupiny skupina={editor === 'nova' ? null : editor} oznam={oznam} onZavrit={() => setEditor(null)} onUlozeno={() => { setEditor(null); void load(); }} />}
      {clenove && <ClenoveSkupiny skupina={clenove} smi={smi} oznam={oznam} onZavrit={() => { setClenove(null); void load(); }} />}
      {import_ && <ImportDoSkupiny skupina={import_} oznam={oznam} onZavrit={() => { setImport(null); void load(); }} />}
      {mazu && (
        <Potvrdit title={`Smazat skupinu „${mazu.name}"?`} akce="Smazat skupinu" busy={busy === `del:${mazu.id}`}
          text={`Hosté v ní zůstanou, jen přijdou o štítek${Number(mazu.discount_pct) > 0 ? ` a o slevu ${mazu.discount_pct} %` : ''}. Kupony a zprávy cílené na tuhle skupinu přestanou nikomu chodit.`}
          onZavrit={() => setMazu(null)} onPotvrdit={() => { const g = mazu; setMazu(null); void smaz(g); }} />
      )}
    </Card>
  );
}

// ---- Založení a úprava ------------------------------------------------------------------

function EditorSkupiny({ skupina, oznam, onZavrit, onUlozeno }: { skupina: Skupina | null; oznam: Hlaska; onZavrit: () => void; onUlozeno: () => void }) {
  const pravidloPuvodni = skupina?.rule ?? '';
  const jeMix = pravidloPuvodni.startsWith('mix:');
  const [name, setName] = useState(skupina?.name ?? '');
  const [popis, setPopis] = useState(skupina?.description ?? '');
  const [barva, setBarva] = useState<string>(skupina?.color ?? '');
  const [typ, setTyp] = useState<string>(jeMix ? MIX : pravidloPuvodni);
  const [mix, setMix] = useState(jeMix ? pravidloPuvodni : '');
  const [sleva, setSleva] = useState(skupina ? String(skupina.discount_pct || 0) : '');
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState('');
  const rule = typ === MIX ? mix : typ;
  const dynamicka = typ !== '';
  const hotovo = !!name.trim() && (typ !== MIX || !!mix);
  const odeslat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hotovo) return;
    setUkladam(true); setChyba('');
    try {
      const telo = { name, description: popis, color: barva || null, rule: dynamicka ? rule : null, discount_pct: dynamicka ? 0 : sleva === '' ? undefined : sleva };
      if (skupina) await j('/api/client/admin/groups', { method: 'PATCH', body: JSON.stringify({ id: skupina.id, ...telo }) });
      else await j('/api/client/admin/groups', { method: 'POST', body: JSON.stringify(telo) });
      oznam(skupina ? `Skupina ${name.trim()} je uložená.` : `Skupina ${name.trim()} je založená.`);
      onUlozeno();
    } catch (err) { setChyba(apiMessage(err, 'Skupinu se nepodařilo uložit.')); }
    setUkladam(false);
  };
  return (
    <Modal open onClose={onZavrit} size="md" title={skupina ? `Upravit skupinu ${skupina.name}` : 'Nová skupina'}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button type="submit" form="skupina-okno" variant="primary" loading={ukladam} disabled={!hotovo}>{skupina ? 'Uložit' : 'Založit'}</Button>
      </>}>
      <form id="skupina-okno" onSubmit={odeslat} className="grid gap-4">
        <Field id="sk-nazev" label="Název" hint={`${name.length} z ${MAX_NAZEV_SKUPINY} znaků`} error={chyba || undefined}>
          <Input id="sk-nazev" autoFocus maxLength={MAX_NAZEV_SKUPINY} value={name} onChange={e => setName(e.target.value)} placeholder="Štamgasti" autoComplete="off" />
        </Field>
        <Field id="sk-popis" label="Popis" hint={`K čemu skupina slouží, ať to za půl roku víš. ${popis.length} z ${MAX_POPIS_SKUPINY} znaků. Nepovinné.`}>
          <Textarea id="sk-popis" rows={2} maxLength={MAX_POPIS_SKUPINY} value={popis} onChange={e => setPopis(e.target.value)} />
        </Field>
        <fieldset>
          <legend className="field-label">Barva štítku</legend>
          <div className="flex items-center gap-2 flex-wrap mt-1" role="radiogroup" aria-label="Barva štítku">
            <button type="button" role="radio" aria-checked={barva === ''} onClick={() => setBarva('')} className={`filter-pill tap-target-sm ${barva === '' ? 'seg-on' : 'seg-off glass'}`}>Bez barvy</button>
            {BARVY_SKUPIN.map(b => (
              <button key={b.id} type="button" role="radio" aria-checked={barva === b.id} aria-label={b.nazev} title={b.nazev} onClick={() => setBarva(b.id)}
                className={`tap-target-sm h-9 w-9 rounded-full border-2 cat-${b.id} ${barva === b.id ? 'ring-2 ring-[#16181A] ring-offset-2' : ''}`}>
                {barva === b.id ? '✓' : ''}
              </button>
            ))}
          </div>
        </fieldset>
        <Field id="sk-typ" label="Kdo je ve skupině" hint={dynamicka ? 'Členy vybírá pravidlo a mění se samo. Ručně se do skupiny nepřidává.' : 'Členy přidáváš sám: v seznamu členů, hromadně nebo ze souboru CSV.'}>
          <Select id="sk-typ" value={typ} onChange={e => setTyp(e.target.value)}>
            <option value="">Ruční výběr — přidávám je sám</option>
            <optgroup label="Dynamická podle jedné podmínky">
              {MOZNOSTI_PRAVIDLA.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </optgroup>
            <optgroup label="Dynamická podle víc podmínek">
              <option value={MIX}>Kombinace podmínek…</option>
            </optgroup>
          </Select>
        </Field>
        {typ === MIX && <KombinaceVyber idPrefix="sk-mix" moznosti={MOZNOSTI_PRAVIDLA} value={mix} onChange={setMix} />}
        <Field id="sk-sleva" label="Sleva skupiny v %" hint={dynamicka ? 'Dynamická skupina slevu mít nemůže, pokladna ji počítá jen ručním skupinám.' : '0 = skupina je jen štítek. Člen ve víc skupinách bere nejvyšší slevu, ne součet.'}>
          <Input id="sk-sleva" type="number" inputMode="numeric" min={0} max={100} className="!w-28" disabled={dynamicka} value={dynamicka ? '0' : sleva} onChange={e => setSleva(e.target.value)} placeholder="0" />
        </Field>
      </form>
    </Modal>
  );
}

// ---- Členové skupiny -----------------------------------------------------------------------

interface ClenSkupiny { id: number; name: string; email?: string | null; phone?: string | null; points: number; visits: number; last_visit_at: string | null; blocked: boolean }

function ClenoveSkupiny({ skupina, smi, oznam, onZavrit }: { skupina: Skupina; smi: boolean; oznam: Hlaska; onZavrit: () => void }) {
  const [q, setQ] = useState('');
  const [dotaz, setDotaz] = useState('');
  const [strana, setStrana] = useState(1);
  const [data, setData] = useState<{ clenove: ClenSkupiny[]; total: number } | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [verze, setVerze] = useState(0);
  const [pridavam, setPridavam] = useState(false);
  const dynamicka = !!skupina.rule;
  useEffect(() => { const t = setTimeout(() => { setDotaz(q); setStrana(1); }, q ? 250 : 0); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    let zije = true;
    setChyba(null);
    fetch(`/api/client/admin/groups?id=${skupina.id}&clenove=1&strana=${strana}&q=${encodeURIComponent(dotaz)}`).then(okJson)
      .then(d => { if (zije) setData({ clenove: Array.isArray(d.clenove) ? d.clenove : [], total: Number(d.total) || 0 }); })
      .catch(e => { if (zije) setChyba(apiMessage(e, 'Členy skupiny se nepodařilo načíst.')); });
    return () => { zije = false; };
  }, [skupina.id, strana, dotaz, verze]);
  const odeber = async (c: ClenSkupiny) => {
    try { await j('/api/client/admin/groups', { method: 'PATCH', body: JSON.stringify({ id: skupina.id, remove: [c.id] }) }); oznam(`${c.name} už ve skupině není.`); setVerze(v => v + 1); }
    catch (err) { oznam(apiMessage(err, 'Člena se nepodařilo odebrat.'), 'bad'); }
  };
  const exportuj = async () => { const r = await stahniZAdresy(`/api/client/admin/groups?id=${skupina.id}&format=csv`, `skupina-${skupina.name}.csv`); oznam(r.zprava, r.ok ? 'ok' : 'bad'); };
  const stran = Math.max(1, Math.ceil((data?.total ?? 0) / 100));
  return (
    <Modal open onClose={onZavrit} size="lg" title={`Členové skupiny ${skupina.name}`}
      subtitle={dynamicka ? `${skupina.rule_popis ?? 'Dynamická skupina'}. Členy počítá pravidlo, ručně se neupravují.` : skupina.description || undefined}
      footer={<>
        <Button variant="secondary" icon="download" onClick={() => { void exportuj(); }}>Export CSV</Button>
        <Button variant="primary" onClick={onZavrit}>Hotovo</Button>
      </>}>
      <div className="grid gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <SearchField className="flex-1 min-w-[12rem]" value={q} onChange={setQ} placeholder="Jméno člena" ariaLabel={`Hledat ve skupině ${skupina.name}`} />
          {data && <p className="t-meta tabular-nums">{czCount(data.total, CLEN)}</p>}
          {smi && !dynamicka && !skupina.archived && <Button size="sm" variant="secondary" icon="plus" onClick={() => setPridavam(v => !v)} aria-expanded={pridavam}>Přidat člena</Button>}
        </div>
        {pridavam && <PridatDoSkupiny skupina={skupina} oznam={oznam} onPridano={() => setVerze(v => v + 1)} />}
        {chyba ? <ErrorState title="Členové se nenačetli" detail={chyba} onRetry={() => setVerze(v => v + 1)} />
          : !data ? <Skeleton className="h-24" />
          : data.clenove.length === 0 ? (
            <EmptyState icon="users" compact title={dotaz ? 'Nikdo takový' : dynamicka ? 'Zatím nikdo nesplňuje pravidlo' : 'Skupina je prázdná'}
              hint={dotaz ? undefined : dynamicka ? 'Až někdo pravidlo splní, objeví se tu sám.' : 'Přidej člena tlačítkem výš, hromadně v seznamu členů, nebo ze souboru CSV.'} />
          ) : (
            <ul className="list">
              {data.clenove.map(c => (
                <ListRow key={c.id}
                  title={<span className="flex items-center gap-2 min-w-0"><span className="truncate">{c.name}</span>{c.blocked && <Chip tone="bad" size="sm">Zablokovaný</Chip>}</span>}
                  meta={[c.email, c.phone, c.last_visit_at ? `naposledy ${denCesky(c.last_visit_at)}` : 'ještě nebyl u kasy'].filter(Boolean).join(' · ')}
                  value={<>{cislo(c.points)} <span className="text-xs font-medium text-black/50">b.</span></>}
                  valueMeta={czCount(c.visits, NAVSTEVA)}
                  actions={smi && !dynamicka ? <Button size="sm" variant="ghost" onClick={() => { void odeber(c); }} aria-label={`Odebrat ${c.name} ze skupiny`}>Odebrat</Button> : undefined} />
              ))}
            </ul>
          )}
        {data && stran > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button size="sm" variant="secondary" disabled={strana <= 1} onClick={() => setStrana(s => s - 1)}>Předchozí</Button>
            <span className="t-meta tabular-nums">Strana {strana} z {stran}</span>
            <Button size="sm" variant="secondary" disabled={strana >= stran} onClick={() => setStrana(s => s + 1)}>Další</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PridatDoSkupiny({ skupina, oznam, onPridano }: { skupina: Skupina; oznam: Hlaska; onPridano: () => void }) {
  const [q, setQ] = useState('');
  const [dotaz, setDotaz] = useState('');
  const [nalezeno, setNalezeno] = useState<any[] | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setDotaz(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    if (dotaz.length < 2) { setNalezeno(null); return; }
    let zije = true;
    setChyba(null);
    fetch(`/api/client/admin/customers?q=${encodeURIComponent(dotaz)}&naStranu=8`).then(okJson)
      .then(d => { if (zije) setNalezeno(Array.isArray(d.customers) ? d.customers : []); })
      .catch(e => { if (zije) setChyba(apiMessage(e, 'Hledání se nepovedlo.')); });
    return () => { zije = false; };
  }, [dotaz]);
  const pridej = async (c: any) => {
    try { await j('/api/client/admin/groups', { method: 'PATCH', body: JSON.stringify({ id: skupina.id, add: [c.id] }) }); oznam(`${c.name} je ve skupině ${skupina.name}.`); onPridano(); }
    catch (err) { oznam(apiMessage(err, 'Člena se nepodařilo přidat.'), 'bad'); }
  };
  return (
    <div className="well grid gap-2">
      <SearchField value={q} onChange={setQ} placeholder="Jméno nebo e-mail člena" ariaLabel="Najít člena k přidání" autoFocus />
      {chyba ? <p className="note note-bad" role="alert">{chyba}</p>
        : nalezeno === null ? <p className="t-meta">Napiš aspoň dvě písmena jména.</p>
        : nalezeno.length === 0 ? <p className="t-meta">Nikdo takový mezi členy není.</p>
        : (
          <ul className="list">
            {nalezeno.map(c => <ListRow key={c.id} title={c.name} meta={[c.email, `${c.points} b.`].filter(Boolean).join(' · ')} actions={<Button size="sm" variant="secondary" onClick={() => { void pridej(c); }} aria-label={`Přidat ${c.name} do skupiny`}>Přidat</Button>} />)}
          </ul>
        )}
    </div>
  );
}

// ---- Hromadné přidání z CSV -----------------------------------------------------------------

interface NahledImportu { nalezeno: number; pridano: number; uBylo: number | null; nenalezeno: { radek: number; hodnota: string; duvod: string }[]; nenalezenoCelkem: number; prazdnych: number; zkraceno: boolean; ukazka: { name: string; podle: string }[]; potvrzeno: boolean }
const PODLE: Record<string, string> = { email: 'podle e-mailu', telefon: 'podle telefonu', jmeno: 'podle jména' };

function ImportDoSkupiny({ skupina, oznam, onZavrit }: { skupina: Skupina; oznam: Hlaska; onZavrit: () => void }) {
  const smiKontakty = useOpravneni().ma('zakaznici.kontakty');
  const [text, setText] = useState('');
  const [soubor, setSoubor] = useState('');
  const [nahled, setNahled] = useState<NahledImportu | null>(null);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const vstup = useRef<HTMLInputElement>(null);
  const nactiSoubor = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 600_000) { setChyba('Soubor je moc velký. Rozděl ho na víc částí.'); return; }
    const r = new FileReader();
    r.onload = () => { setText(String(r.result ?? '')); setSoubor(f.name); setNahled(null); setChyba(''); };
    r.onerror = () => setChyba('Soubor se nepodařilo přečíst.');
    r.readAsText(f, 'utf-8');
  };
  const spust = async (potvrdit: boolean) => {
    setBusy(true); setChyba('');
    try {
      const r: NahledImportu = await j('/api/client/admin/groups/import', { method: 'POST', body: JSON.stringify({ skupina: skupina.id, text, potvrdit }) });
      setNahled(r);
      if (potvrdit) { oznam(`Do skupiny ${skupina.name} přibylo ${czCount(r.pridano, CLEN)}.`); if (r.nenalezenoCelkem === 0) onZavrit(); }
    } catch (err) { setChyba(apiMessage(err, 'Soubor se nepodařilo zpracovat.')); }
    setBusy(false);
  };
  const stahniNenalezene = async () => {
    if (!nahled) return;
    const r = await ulozCsv(`nenalezeni-${skupina.name}.csv`, csvNenalezenych(nahled.nenalezeno));
    oznam(r.zprava, r.ok ? 'ok' : 'bad');
  };
  return (
    <Modal open onClose={onZavrit} size="lg" title={`Přidat členy do skupiny ${skupina.name}`}
      subtitle="Vlož seznam e-mailů, telefonů nebo jmen, nebo vyber soubor CSV. Páruje se podle e-mailu, pak telefonu, pak celého jména."
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>{nahled?.potvrzeno ? 'Hotovo' : 'Zrušit'}</Button>
        {!nahled?.potvrzeno && (nahled && nahled.nalezeno > 0
          ? <Button variant="primary" loading={busy} onClick={() => { void spust(true); }}>Přidat {czCount(nahled.nalezeno, CLEN)}</Button>
          : <Button variant="primary" loading={busy} disabled={!text.trim() || !smiKontakty} onClick={() => { void spust(false); }}>Zkontrolovat</Button>)}
      </>}>
      <div className="grid gap-3">
        {!smiKontakty && <p className="note note-wait">Přidávat členy ze souboru smí jen ten, kdo vidí kontakty hostů.</p>}
        <Field id="imp-text" label="Seznam nebo obsah CSV" hint="Jeden člen na řádek. CSV s hlavičkou E-mail, Telefon, Jméno se pozná samo. Nikdo se nezakládá, jen se přidávají stávající členové.">
          <Textarea id="imp-text" rows={6} value={text} onChange={e => { setText(e.target.value); setNahled(null); setSoubor(''); }} placeholder={'jana@example.cz\n+420 777 123 456\nPetr Novák'} />
        </Field>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={vstup} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" aria-label="Vybrat soubor CSV" onChange={e => nactiSoubor(e.target.files?.[0])} />
          <Button size="sm" variant="secondary" icon="upload" onClick={() => vstup.current?.click()}>Vybrat soubor CSV</Button>
          {soubor && <span className="t-meta truncate">{soubor}</span>}
        </div>
        {chyba && <p className="note note-bad" role="alert">{chyba}</p>}
        {nahled && (
          <div className="well grid gap-2" aria-live="polite">
            <p className="text-sm font-medium">
              {nahled.potvrzeno
                ? `Přidáno ${czCount(nahled.pridano, CLEN)}${nahled.uBylo ? `, ${czCount(nahled.uBylo, CLEN)} už ve skupině bylo` : ''}.`
                : `Nalezeno ${czCount(nahled.nalezeno, CLEN)}${nahled.ukazka.length ? `, třeba ${nahled.ukazka.slice(0, 3).map(u => `${u.name} (${PODLE[u.podle] ?? u.podle})`).join(', ')}` : ''}.`}
            </p>
            {nahled.nenalezenoCelkem > 0 && (
              <>
                <p className="text-sm text-black/70">{czCount(nahled.nenalezenoCelkem, RADEK)} se nepodařilo spárovat:</p>
                <ul className="text-sm text-black/65 grid gap-0.5">
                  {nahled.nenalezeno.slice(0, 6).map(n => <li key={n.radek} className="truncate">Řádek {n.radek}: {n.hodnota || '(prázdný)'} — {n.duvod}</li>)}
                  {nahled.nenalezenoCelkem > 6 && <li>… a dalších {nahled.nenalezenoCelkem - 6}</li>}
                </ul>
                <div><Button size="sm" variant="secondary" icon="download" onClick={() => { void stahniNenalezene(); }}>Stáhnout nenalezené</Button></div>
              </>
            )}
            {nahled.prazdnych > 0 && <p className="t-meta">{czCount(nahled.prazdnych, RADEK)} bez použitelného údaje se přeskočilo.</p>}
            {nahled.zkraceno && <p className="note note-wait">Soubor má víc než 5 000 řádků, zpracovalo se prvních 5 000. Zbytek nahraj zvlášť.</p>}
            {nahled.nalezeno === 0 && !nahled.potvrzeno && <p className="note note-wait">Nikdo se nenašel. Zkontroluj, jestli jsou to členové podniku a jestli sedí e-mail nebo telefon.</p>}
          </div>
        )}
        {nahled?.potvrzeno && nahled.pridano === 0 && <p className="t-meta">Nikdo nepřibyl — všichni nalezení už ve skupině byli.</p>}
      </div>
    </Modal>
  );
}
