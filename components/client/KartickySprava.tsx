'use client';

// Client → Kartičky: plastové a papírové karty pro hosty bez aplikace.
// Vedení vytiskne dávku (10–500 karet, A4 s kartami 85 × 55 mm a ořezovými značkami),
// rozdá je, obsluha u kasy kartu přiřadí hostovi (CardScan / CteckaKasa → KartickaAktivace).
// Tady je přehled dávek a karet (stav, host), blokace ztracené karty a náhrada novou.
// Server: /api/client/cards (lib/kartyFyzickeDb.ts), tisk /api/client/cards/davky/<id>/tisk.

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, Input, ListRow, Menu, PageHeader, Segmented, Skeleton, Stat, StatRow, type MenuItem } from '../ui';
import Potvrdit from './loyalty/Potvrdit';
import { okJson, apiMessage } from '@/lib/api';
import { otevriNaTisk } from '@/lib/stahni';
import { czCount, type CzNoun } from '@/lib/czech';
import { POCET_MAX, POCET_MIN, POPIS_STAVU, overPocet, type StavKarty } from '@/lib/kartyFyzicke';
import { pragueDaySafe, parseDbTime } from '@/lib/pragueTime';
import { useLoad } from '../ui';

interface Davka { id: number; nazev: string; pocet: number; nove: number; aktivni: number; blokovane: number; created_at: string }
interface Karta { id: number; kod: string; cislo: string; stav: StavKarty; zdroj: 'davka' | 'nahrada' | 'import'; davkaId: number | null; hostId: number | null; host: string | null; bezAplikace: boolean; activated_at: string | null }
interface Data { davky: Davka[]; pocty: Record<StavKarty, number>; zImportu: number; karty: Karta[]; dalsi: boolean; smiSpravovat: boolean }

const KARTA: CzNoun = { one: 'karta', few: 'karty', many: 'karet' };
const TON: Record<StavKarty, 'ok' | 'muted' | 'bad'> = { aktivni: 'ok', nova: 'muted', blokovana: 'bad' };
const NA_STRANKU = 60;

/** Odpověď API → data obrazovky. Ukázka bez endpointu vrací prázdné pole: obrazovka je pak prázdná, ne rozbitá. */
const vyber = (raw: any): Data => ({
  davky: Array.isArray(raw?.davky) ? raw.davky : [],
  pocty: { nova: Number(raw?.pocty?.nova) || 0, aktivni: Number(raw?.pocty?.aktivni) || 0, blokovana: Number(raw?.pocty?.blokovana) || 0 },
  zImportu: Number(raw?.zImportu) || 0,
  karty: Array.isArray(raw?.karty) ? raw.karty : [],
  dalsi: raw?.dalsi === true,
  smiSpravovat: raw?.smiSpravovat === true,
});

const den = (v: string | null) => { const d = parseDbTime(v); const s = d ? pragueDaySafe(d) : ''; return s ? `${Number(s.slice(8, 10))}. ${Number(s.slice(5, 7))}. ${s.slice(0, 4)}` : ''; };
const tiskDavky = (id: number) => otevriNaTisk(`/api/client/cards/davky/${id}/tisk`, `karty-davka-${id}.html`);
const tiskKarty = (id: number) => otevriNaTisk(`/api/client/cards/${id}/tisk`, `karta-${id}.html`);

async function posli(url: string, telo: object) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo) }).then(okJson);
}

/** `vlozene` = část stránky Kupony a poukazy (kolo 92): bez vlastního okraje a nadpisu, tisk dávky jako akce nad statistikou. */
export default function KartickySprava({ oznam, vlozene = false }: { oznam: (text: string, ton?: 'ok' | 'bad') => void; vlozene?: boolean }) {
  const [stav, setStav] = useState<'vse' | StavKarty>('vse');
  const [davka, setDavka] = useState<number | null>(null);
  const [hledat, setHledat] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(hledat.trim()), 300); return () => clearTimeout(t); }, [hledat]);
  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (stav !== 'vse') p.set('stav', stav);
    if (davka) p.set('davka', String(davka));
    if (q) p.set('q', q);
    const s = p.toString();
    return `/api/client/cards${s ? `?${s}` : ''}`;
  }, [stav, davka, q]);
  const { data, error, reload } = useLoad<Data>(url, vyber);
  // „Načíst další“: další stránky se přidávají k první; změna filtru je zahodí.
  const [navic, setNavic] = useState<{ karty: Karta[]; dalsi: boolean } | null>(null);
  useEffect(() => setNavic(null), [url]);
  const [nacitamDalsi, setNacitamDalsi] = useState(false);

  const [nova, setNova] = useState<{ pocet: string; nazev: string } | null>(null);
  const [blokuji, setBlokuji] = useState<Karta | null>(null);
  const [nahrazuji, setNahrazuji] = useState<{ karta: Karta; kod: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [chybaOkna, setChybaOkna] = useState('');

  if (error) return <div className="px-4 min-[360px]:px-5 pt-3 pb-4 sm:p-6"><ErrorState title="Kartičky se nenačetly" onRetry={reload} detail={error} /></div>;
  if (!data) return <div className="px-4 min-[360px]:px-5 pt-3 pb-4 sm:p-6 space-y-4"><Skeleton className="h-24" /><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;

  const karty = [...data.karty, ...(navic?.karty ?? [])];
  const dalsi = navic ? navic.dalsi : data.dalsi;
  const smi = data.smiSpravovat;
  const vybranaDavka = davka ? data.davky.find(d => d.id === davka) : null;
  const celkem = data.pocty.nova + data.pocty.aktivni + data.pocty.blokovana;

  const nactiDalsi = async () => {
    setNacitamDalsi(true);
    try {
      const x = await fetch(`${url}${url.includes('?') ? '&' : '?'}offset=${karty.length}`).then(okJson);
      setNavic(n => ({ karty: [...(n?.karty ?? []), ...(Array.isArray(x?.karty) ? x.karty : [])], dalsi: x?.dalsi === true }));
    } catch (e) { oznam(apiMessage(e, 'Další karty se nenačetly.'), 'bad'); }
    setNacitamDalsi(false);
  };

  const zalozDavku = async () => {
    if (!nova) return;
    const p = overPocet(nova.pocet);
    if (!p.ok) { setChybaOkna(p.chyba); return; }
    setBusy(true); setChybaOkna('');
    try {
      const x = await posli('/api/client/cards', { pocet: p.pocet, nazev: nova.nazev });
      setNova(null); reload();
      oznam(`Dávka je připravená: ${czCount(Number(x.davka?.pocet) || p.pocet, KARTA)}. Otevírám tisk.`);
      if (x.davka?.id) tiskDavky(Number(x.davka.id));
    } catch (e) { setChybaOkna(apiMessage(e, 'Dávku se nepodařilo založit.')); }
    setBusy(false);
  };

  const zablokuj = async () => {
    if (!blokuji) return;
    setBusy(true);
    try {
      const x = await posli(`/api/client/cards/${blokuji.id}`, { akce: 'blokovat' });
      setBlokuji(null); setNavic(null); reload(); oznam(String(x.message ?? 'Karta je zablokovaná.'));
    } catch (e) { setChybaOkna(apiMessage(e, 'Kartu se nepodařilo zablokovat.')); }
    setBusy(false);
  };

  const nahrad = async () => {
    if (!nahrazuji) return;
    setBusy(true); setChybaOkna('');
    try {
      const x = await posli(`/api/client/cards/${nahrazuji.karta.id}`, { akce: 'nahradit', kod: nahrazuji.kod.trim() || undefined });
      setNahrazuji(null); setNavic(null); reload(); oznam(String(x.message ?? 'Karta je nahrazená.'));
      if (x.tisk && x.nova?.id) tiskKarty(Number(x.nova.id));
    } catch (e) { setChybaOkna(apiMessage(e, 'Kartu se nepodařilo nahradit.')); }
    setBusy(false);
  };

  const akceKarty = (k: Karta): MenuItem[] => {
    const out: MenuItem[] = [];
    if (k.stav !== 'blokovana' && k.zdroj !== 'import') out.push({ label: 'Vytisknout znovu', icon: 'print', onClick: () => tiskKarty(k.id) });
    if (k.stav === 'aktivni') out.push({ label: 'Nahradit novou kartou', icon: 'refresh', onClick: () => { setChybaOkna(''); setNahrazuji({ karta: k, kod: '' }); } });
    if (k.stav !== 'blokovana') out.push({ label: 'Zablokovat', icon: 'close', danger: true, onClick: () => { setChybaOkna(''); setBlokuji(k); } });
    return out;
  };

  return (
    <div className={vlozene ? 'space-y-5 max-w-4xl' : 'px-4 min-[360px]:px-5 pt-3 pb-4 sm:p-6 space-y-5 max-w-4xl'}>
      {vlozene
        ? smi && <Button variant="primary" icon="print" className="w-full" onClick={() => { setChybaOkna(''); setNova({ pocet: '50', nazev: '' }); }}>Vytisknout dávku</Button>
        : <PageHeader hintId="clientadmin-karticky" title="Kartičky"
            subtitle="Plastové a papírové karty pro hosty bez aplikace. Vytiskni dávku, rozdej ji a u kasy kartu přiřaď hostovi. Pak funguje jako kartička v aplikaci."
            primary={smi ? <Button variant="accent" icon="print" onClick={() => { setChybaOkna(''); setNova({ pocet: '50', nazev: '' }); }}>Vytisknout dávku</Button> : undefined} />}

      <Card>
        <StatRow>
          <Stat label="Aktivní" value={data.pocty.aktivni} tone="ok" />
          <Stat label="Nepřiřazené" value={data.pocty.nova} />
          <Stat label="Zablokované" value={data.pocty.blokovana} />
        </StatRow>
        {data.zImportu > 0 && <p className="t-meta mt-3">Čísla starých karet z importu Kartičky: {czCount(data.zImportu, KARTA)}. Fungují u kasy dál.</p>}
      </Card>

      {celkem === 0 && data.davky.length === 0 ? (
        <Card>
          <EmptyState icon="card" title="Zatím žádné kartičky"
            hint={smi ? 'Vytiskni první dávku. Karty přiřadíš hostům u kasy, až je naskenuješ v Kartičce hosta nebo na čtečce.' : 'Dávky karet tiskne vedení podniku.'} />
        </Card>
      ) : (
        <>
          {data.davky.length > 0 && (
            <section aria-labelledby="h-davky">
              <h2 id="h-davky" className="t-section mb-2">Dávky</h2>
              <Card pad="none">
                <ul className="list px-5">
                  {data.davky.map(d => (
                    <ListRow key={d.id} title={d.nazev}
                      meta={`${czCount(d.pocet, KARTA)} · ${den(d.created_at)}`}
                      detail={`Aktivní ${d.aktivni} · nepřiřazené ${d.nove}${d.blokovane ? ` · zablokované ${d.blokovane}` : ''}`}
                      actions={<>
                        <Button size="sm" variant="ghost" aria-pressed={davka === d.id} onClick={() => setDavka(davka === d.id ? null : d.id)}>{davka === d.id ? 'Všechny karty' : 'Zobrazit karty'}</Button>
                        {smi && d.nove > 0 && <Button size="sm" variant="secondary" icon="print" onClick={() => tiskDavky(d.id)}>Vytisknout</Button>}
                      </>} />
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <section aria-labelledby="h-karty" className="space-y-2">
            <h2 id="h-karty" className="t-section">Karty{vybranaDavka ? ` · ${vybranaDavka.nazev}` : ''}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented ariaLabel="Stav karet" value={stav} onChange={v => setStav(v)}
                options={[{ id: 'vse', label: 'Vše' }, { id: 'aktivni', label: 'Aktivní' }, { id: 'nova', label: 'Nepřiřazené' }, { id: 'blokovana', label: 'Zablokované' }]} />
              {vybranaDavka && <Button size="sm" variant="ghost" icon="close" onClick={() => setDavka(null)}>Zrušit filtr dávky</Button>}
            </div>
            <label htmlFor="kar-hledat" className="sr-only">Hledat kartu podle kódu nebo hosta</label>
            <Input id="kar-hledat" type="search" value={hledat} onChange={e => setHledat(e.target.value)} placeholder="Kód karty nebo jméno hosta" autoComplete="off" enterKeyHint="search" />
            <Card pad="none">
              {karty.length === 0 ? (
                <p className="t-meta p-4">Žádná karta neodpovídá filtru.</p>
              ) : (
                <ul className="list px-5" data-testid="karty-seznam">
                  {karty.map(k => {
                    const menu = smi ? akceKarty(k) : [];
                    return (
                      <ListRow key={k.id}
                        title={<span className="font-mono tracking-wider">{k.cislo}</span>}
                        meta={k.host
                          ? `${k.host}${k.bezAplikace ? ' · bez aplikace' : ''}${k.zdroj === 'import' ? ' · stará karta' : k.zdroj === 'nahrada' ? ' · náhrada' : ''}${k.activated_at ? ` · od ${den(k.activated_at)}` : ''}`
                          : k.stav === 'blokovana' ? 'Nikomu nepatří' : 'Čeká na přiřazení u kasy'}
                        right={<Chip tone={TON[k.stav]} size="sm">{POPIS_STAVU[k.stav]}</Chip>}
                        akceVRadku
                        actions={menu.length ? <Menu size="sm" label={`Akce s kartou ${k.cislo}`} items={menu} /> : undefined} />
                    );
                  })}
                </ul>
              )}
            </Card>
            {dalsi && <Button variant="secondary" loading={nacitamDalsi} onClick={nactiDalsi} className="w-full justify-center">Načíst další karty</Button>}
          </section>
        </>
      )}

      {nova && (
        <Potvrdit title="Vytisknout dávku karet" akce="Založit a vytisknout" nebezpecne={false} busy={busy} onPotvrdit={zalozDavku} onZavrit={() => setNova(null)}
          text={`Každá karta dostane vlastní kód s QR. Na arch A4 se vejde deset karet ve formátu vizitky (85 × 55 mm) s ořezovými značkami. `}>
          <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-3">
            <div>
              <label htmlFor="kar-pocet" className="field-label">Počet karet</label>
              <Input id="kar-pocet" type="number" inputMode="numeric" step={1} aria-describedby="kar-pocet-rozsah" value={nova.pocet} onChange={e => setNova({ ...nova, pocet: e.target.value })} />
              <p id="kar-pocet-rozsah" className="t-meta mt-1">{POCET_MIN} až {POCET_MAX}</p>
            </div>
            <div>
              <label htmlFor="kar-nazev" className="field-label">Název (nepovinné)</label>
              <Input id="kar-nazev" value={nova.nazev} maxLength={60} placeholder="Třeba Léto 2026" onChange={e => setNova({ ...nova, nazev: e.target.value })} />
            </div>
          </div>
          {chybaOkna && <p role="alert" className="note note-danger">{chybaOkna}</p>}
        </Potvrdit>
      )}

      {blokuji && (
        <Potvrdit title={`Zablokovat kartu ${blokuji.cislo}?`} akce="Zablokovat" busy={busy} onPotvrdit={zablokuj} onZavrit={() => setBlokuji(null)}
          text={blokuji.host
            ? `Karta přestane fungovat. Body a razítka zůstanou hostovi ${blokuji.host} na účtu — novou kartu mu dáš přes Nahradit. Zablokování nejde vrátit.`
            : 'Karta přestane fungovat a nepůjde přiřadit žádnému hostovi. Zablokování nejde vrátit.'}>
          {chybaOkna && <p role="alert" className="note note-danger">{chybaOkna}</p>}
        </Potvrdit>
      )}

      {nahrazuji && (
        <Potvrdit title={`Nahradit kartu ${nahrazuji.karta.cislo}`} akce="Nahradit" nebezpecne={false} busy={busy} onPotvrdit={nahrad} onZavrit={() => setNahrazuji(null)}
          text={`${nahrazuji.karta.host ?? 'Host'} dostane novou kartu se stejnými body a razítky, stará se zablokuje. Opiš kód nepřiřazené karty z krabice, nebo nech pole prázdné a vytiskne se nová karta.`}>
          <div>
            <label htmlFor="kar-nova" className="field-label">Kód nové karty (nepovinné)</label>
            <Input id="kar-nova" value={nahrazuji.kod} onChange={e => setNahrazuji({ ...nahrazuji, kod: e.target.value.toUpperCase().slice(0, 40) })} placeholder="ABCD-EFGH"
              autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono tracking-[0.15em] uppercase" />
          </div>
          {chybaOkna && <p role="alert" className="note note-danger">{chybaOkna}</p>}
        </Potvrdit>
      )}
    </div>
  );
}
