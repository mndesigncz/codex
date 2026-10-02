'use client';

// Razítkové kartičky ve správě: seznam se stavem (koncept, naplánováno, běží,
// pozastaveno, skončila, archiv), řazení, duplikace, statistiky, export CSV,
// ruční razítka a editor s náhledem. Smazání s nasbíranými razítky se bez
// potvrzení nikdy neprovede — doporučená cesta je archiv.

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, ListRow, Menu, Modal, Segmented, Skeleton, Switch } from '../../ui';
import type { ChipTone } from '../../ui';
import { useMoney } from '../../CurrencyProvider';
import { useOpravneni } from '../../role/useOpravneni';
import { apiMessage, okJson } from '@/lib/api';
import { czCount, type CzNoun } from '@/lib/czech';
import { czDatum, popisOkna, STAV_POPISEK, type StavKampane } from '@/lib/razitkaPravidla';
import KampanEditor, { kampanDoFormulare, prazdnaKampan, type FormKampane } from './KampanEditor';
import KampanStatistiky from './KampanStatistiky';
import RucniRazitka from './RucniRazitka';

const RAZITKO: CzNoun = { one: 'razítko', few: 'razítka', many: 'razítek' };
const HOST: CzNoun = { one: 'host', few: 'hosté', many: 'hostů' };
const RULE_NAME: Record<string, string> = { visit: 'za návštěvu', products: 'za položky', min_value: 'za útratu' };
const REPEAT_NAME: Record<string, string> = { one_day: 'další od dalšího dne', one_week: 'další po týdnu', one_month: 'další od 1. dne měsíce', one_time: 'jen jednou' };
const TON: Record<StavKampane, ChipTone> = { live: 'ok', scheduled: 'info', draft: 'muted', paused: 'wait', ended: 'muted', archived: 'muted' };

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, init ? { headers: { 'Content-Type': 'application/json' }, ...init } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e: any = new Error(d.error || 'Nepovedlo se.'); e.data = d; throw e; }
  return d;
}

export default function StampsAdmin({ toast }: { toast: (m: string) => void }) {
  const { ma } = useOpravneni();
  const meni = ma('vernost.kampane');
  const smiRucne = ma('vernost.upravit_body');
  const money = useMoney();
  const [list, setList] = useState<any[] | null>(null);
  const [chybaNacteni, setChybaNacteni] = useState('');
  const [pohled, setPohled] = useState<'aktualni' | 'archiv'>('aktualni');
  const [form, setForm] = useState<FormKampane | null>(null);
  const [chyba, setChyba] = useState('');
  const [busy, setBusy] = useState('');
  const [mazu, setMazu] = useState<any | null>(null);
  const [archivuji, setArchivuji] = useState<any | null>(null);
  const [stat, setStat] = useState<any | null>(null);
  const [rucne, setRucne] = useState<any | null>(null);

  const load = useCallback(() => {
    setChybaNacteni('');
    return fetch('/api/client/admin/stamps').then(okJson).then(d => setList(d.campaigns ?? [])).catch(e => { setChybaNacteni(apiMessage(e, 'Kartičky se nepodařilo načíst.')); setList(l => l ?? []); });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const ulozit = async (jako: 'koncept' | 'spustit' | 'ulozit') => {
    if (!form) return;
    setBusy(jako); setChyba('');
    try {
      const body = JSON.stringify({
        ...form, minValue: form.minValue === '' ? null : Number(form.minValue),
        draft: jako === 'koncept' ? true : jako === 'spustit' ? false : form.draft,
        active: jako === 'spustit' ? true : form.active,
      });
      await j('/api/client/admin/stamps', { method: form.id ? 'PATCH' : 'POST', body });
      toast(jako === 'koncept' ? 'Koncept uložen.' : form.id ? 'Kartička uložena.' : 'Kartička založena.');
      setForm(null); void load();
    } catch (e) { setChyba(apiMessage(e, 'Kartičku se nepodařilo uložit.')); }
    setBusy('');
  };
  const akce = async (c: any, action: string, hotovo: string, extra: Record<string, unknown> = {}) => {
    setBusy(`${action}:${c.id}`);
    try { await j('/api/client/admin/stamps', { method: 'PATCH', body: JSON.stringify({ id: c.id, action, ...extra }) }); toast(hotovo); await load(); }
    catch (e) { toast(apiMessage(e, 'Změna se nepovedla.')); }
    setBusy('');
  };
  const duplikuj = async (c: any) => {
    setBusy(`dup:${c.id}`);
    try { await j('/api/client/admin/stamps', { method: 'POST', body: JSON.stringify({ action: 'duplicate', id: c.id }) }); toast('Kopie je v konceptech. Uprav ji a spusť.'); await load(); }
    catch (e) { toast(apiMessage(e, 'Kartičku se nepodařilo duplikovat.')); }
    setBusy('');
  };
  const smaz = async (c: any) => {
    try { await j(`/api/client/admin/stamps?id=${c.id}&force=1`, { method: 'DELETE' }); toast('Kartička smazána.'); setForm(null); void load(); }
    catch (e) { toast(apiMessage(e, 'Kartičku se nepodařilo smazat.')); }
  };
  const stahni = (url: string) => { window.location.assign(url); };

  if (list === null) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-48" /></div>;
  if (chybaNacteni && !list.length) return <ErrorState title="Kartičky se nenačetly" hint={chybaNacteni} onRetry={() => { void load(); }} />;

  // --- editor ---
  if (form) {
    return (
      <div className="max-w-5xl">
        <KampanEditor form={form} onChange={setForm} onZpet={() => { setForm(null); setChyba(''); }} onUlozit={ulozit} busy={busy} chyba={chyba} />
      </div>
    );
  }

  const archiv = list.filter(c => c.stav === 'archived');
  const aktualni = list.filter(c => c.stav !== 'archived');
  const zobrazene = pohled === 'archiv' ? archiv : aktualni;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <p className="t-meta max-w-[60ch]">Kartiček může běžet víc vedle sebe — třeba „10+1 dýmka" a „5+1 čaj". Razítka z účtenky připisuje obsluha u kasy jedním klepnutím.</p>
        <div className="flex items-center gap-2 flex-wrap">
          {archiv.length > 0 && <Segmented size="sm" ariaLabel="Aktuální nebo archiv" value={pohled} onChange={v => setPohled(v as 'aktualni' | 'archiv')}
            options={[{ id: 'aktualni', label: 'Aktuální', count: aktualni.length }, { id: 'archiv', label: 'Archiv', count: archiv.length }]} />}
          {meni && <Button variant="secondary" icon="plus" onClick={() => { setChyba(''); setForm(prazdnaKampan()); }}>Nová kartička</Button>}
        </div>
      </div>
      {chybaNacteni && <p role="alert" className="note note-danger">{chybaNacteni} <button type="button" className="underline" onClick={() => { void load(); }}>Zkusit znovu</button></p>}
      {zobrazene.length === 0 ? (
        <Card>
          <EmptyState icon="check" compact
            title={pohled === 'archiv' ? 'Archiv je prázdný' : 'Zatím žádná kartička'}
            hint={pohled === 'archiv' ? 'Archivované kartičky tu zůstanou i s postupem hostů.' : 'Založ první — třeba „každá desátá dýmka zdarma“. Hosté ji uvidí na tvé stránce hned.'}
            action={pohled === 'aktualni' && meni ? <Button variant="primary" icon="plus" onClick={() => { setChyba(''); setForm(prazdnaKampan()); }}>Založit první kartičku</Button> : undefined} />
        </Card>
      ) : (
        <Card pad="none">
          <ul className="list px-5">
            {zobrazene.map((c: any, i: number) => {
              const stav = c.stav as StavKampane;
              const okno = popisOkna(c);
              const rada = [
                `${czCount(Number(c.required_stamps) || 0, RAZITKO)} ${RULE_NAME[c.rule_type] ?? ''}${c.rule_type === 'products' && (c.stampItems?.length || c.stampSections?.length) ? `: ${[...c.stampSections.map((x: any) => `kategorie ${x.name}`), ...c.stampItems.map((x: any) => x.name)].join(', ')}` : ''}${c.rule_type === 'min_value' && c.min_value ? ` od ${money(c.min_value)}` : ''}`,
                `odměna ${c.reward_title || '—'}`,
                `${czCount(Number(c.collectors) || 0, HOST)} sbírá · ${c.completions}× dokončeno`,
                okno ? `platí ${okno}` : '',
                c.valid_since && stav === 'scheduled' ? `začíná ${czDatum(c.valid_since)}` : c.valid_till ? `do ${czDatum(c.valid_till)}` : '',
                c.max_completions > 0 ? `max ${c.max_completions}× na hosta` : '',
                c.daily_cap > 0 ? `${c.daily_cap}/den` : '',
                REPEAT_NAME[c.repeat_mode] ?? '',
                c.combinable === false ? 'nekombinuje se' : '',
              ].filter(Boolean).join(' · ');
              const bezi = stav === 'live' || stav === 'paused' || stav === 'scheduled';
              return (
                <ListRow key={c.id} className={stav === 'live' || stav === 'scheduled' ? '' : 'opacity-70'}
                  title={<span className="flex items-center gap-2 min-w-0"><span className="truncate">{c.name}</span><Chip tone={TON[stav]} size="sm">{STAV_POPISEK[stav]}</Chip></span>}
                  meta={rada}
                  actions={meni ? (
                    <>
                      {bezi && <Switch checked={c.active} disabled={busy === `toggle:${c.id}`} onChange={v => { void akce(c, 'toggle', v ? 'Kartička běží.' : 'Kartička pozastavena.', { active: v }); }} label={`Běží: ${c.name}`} />}
                      {stav === 'draft' && <Button size="sm" variant="secondary" loading={busy === `publish:${c.id}`} onClick={() => { void akce(c, 'publish', 'Kartička běží.'); }}>Spustit</Button>}
                      <Menu size="sm" label={`Další akce s kartičkou ${c.name}`} items={[
                        { label: 'Upravit…', icon: 'pencil', onClick: () => { setChyba(''); setForm(kampanDoFormulare(c)); } },
                        { label: 'Statistiky…', icon: 'chart', onClick: () => setStat(c) },
                        ...(smiRucne && stav !== 'archived' ? [{ label: 'Razítka ručně…', icon: 'plus', onClick: () => setRucne(c) }] : []),
                        { label: 'Exportovat hosty (CSV)', icon: 'download', onClick: () => stahni(`/api/client/admin/stamps?export=${c.id}`) },
                        { label: 'Exportovat deník razítek (CSV)', icon: 'download', onClick: () => stahni(`/api/client/admin/stamps?export=${c.id}&udalosti=1`) },
                        { label: 'Duplikovat', icon: 'copy', onClick: () => { void duplikuj(c); } },
                        ...(pohled === 'aktualni' ? [
                          { label: 'Posunout nahoru', icon: 'chevron', disabled: i === 0, onClick: () => { void akce(c, 'move', 'Pořadí změněno.', { direction: 'up' }); } },
                          { label: 'Posunout dolů', icon: 'chevron', disabled: i === zobrazene.length - 1, onClick: () => { void akce(c, 'move', 'Pořadí změněno.', { direction: 'down' }); } },
                        ] : []),
                        stav === 'archived'
                          ? { label: 'Vrátit z archivu', icon: 'undo', onClick: () => { void akce(c, 'restore', 'Vráceno z archivu jako koncept.'); } }
                          : { label: 'Archivovat…', icon: 'archive', onClick: () => setArchivuji(c) },
                        { label: 'Smazat natrvalo…', icon: 'trash', danger: true, onClick: () => setMazu(c) },
                      ]} />
                    </>
                  ) : <Chip tone={c.active ? 'ok' : 'muted'} size="sm">{c.active ? 'Běží' : 'Vypnutá'}</Chip>} />
              );
            })}
          </ul>
        </Card>
      )}
      <p className="t-meta max-w-[75ch]">Razítka připíše obsluha u kasy: buď „razítko za návštěvu", nebo výběrem účtenky hosta (případně ručně zadanými položkami) — z toho se pravidla vyhodnotí sama. Za plnou kartu dostane host kupon s kódem.</p>
      {archivuji && (
        <Modal open onClose={() => setArchivuji(null)} size="sm" title={`Archivovat „${archivuji.name}"?`}
          footer={<>
            <Button variant="secondary" onClick={() => setArchivuji(null)}>Zrušit</Button>
            <Button variant="primary" onClick={() => { const c = archivuji; setArchivuji(null); void akce(c, 'archive', 'Kartička je v archivu.'); }}>Archivovat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Kartička zmizí hostům i z kasy, ale postup hostů ({czCount(Number(archivuji.collectors) || 0, HOST)}), vydané odměny i historie zůstanou. Z archivu ji jde kdykoli vrátit.</p>
        </Modal>
      )}
      {mazu && (
        <Modal open onClose={() => setMazu(null)} size="sm" title={`Smazat „${mazu.name}" natrvalo?`}
          footer={<>
            <Button variant="secondary" onClick={() => setMazu(null)}>Zrušit</Button>
            {mazu.stav !== 'archived' && <Button variant="secondary" onClick={() => { const c = mazu; setMazu(null); setArchivuji(c); }}>Radši archivovat</Button>}
            <Button variant="danger-solid" onClick={() => { const c = mazu; setMazu(null); void smaz(c); }}>Smazat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">
            {Number(mazu.collectors) > 0
              ? `Rozsbíraná razítka a dokončené karty (${czCount(Number(mazu.collectors), HOST)}) i historie razítek zmizí a nejde to vrátit. Vydané kupony zůstanou. Archiv postup zachová.`
              : 'Kartička nemá žádné razítko hostů. Vydané kupony zůstanou.'}
          </p>
        </Modal>
      )}
      {stat && <KampanStatistiky kampan={stat} onZavrit={() => setStat(null)} />}
      {rucne && <RucniRazitka kampan={rucne} onZavrit={() => setRucne(null)} onHotovo={m => { setRucne(null); toast(m); void load(); }} />}
    </div>
  );
}
