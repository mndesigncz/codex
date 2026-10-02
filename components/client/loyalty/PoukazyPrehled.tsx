'use client';

// Přehled dárkových poukazů pro správce (Věrnost → Poukazy, nad seznamem):
//  · závazek = součet zůstatků platných poukazů (peníze, které podnik ještě dluží hostům),
//  · co brzy propadne a co už propadlo,
//  · prodané a uplatněné hodnoty po měsících (pražské měsíce, posledních 12),
//  · hromadné prodloužení platnosti (náhled, kolika poukazů se to dotkne, pak potvrzení),
//  · nastavení uplatnění: nejmenší a největší částka najednou, nejnižší účet a body za nákup poukazu,
//  · export pro účetnictví (měsíční souhrn a deník pohybů).
// Čísla počítá server (lib/poukazyPrehledDb.ts); tady se jen ukazují. Komponenta správy: texty česky natvrdo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, Field, Input, Modal, Skeleton, StatRow, Stat, SwitchRow } from '../../ui';
import { useMoney, useSymbol } from '../../CurrencyProvider';
import { apiMessage, okJson } from '@/lib/api';
import { czCount, type CzNoun } from '@/lib/czech';
import { fmtMesic } from '@/lib/i18n/format';
import { dayPlus } from '@/lib/pragueTime';
import { datumCesky } from '@/lib/poukazyTisk';
import { normalizujLimity, overNovouPlatnost, jeDatum, type PrehledZavazku, type MesicPrehledu, type LimityUplatneni, type NastaveniPoukazu } from '@/lib/poukazy';
import { PoukazyDalsiNastaveni, PoukazyUcetnictvi } from './PoukazyNastaveni';

const POUKAZ: CzNoun = { one: 'poukaz', few: 'poukazy', many: 'poukazů' };

interface Data { prehled: PrehledZavazku & { brzyDni: number }; mesice: MesicPrehledu[]; limity: LimityUplatneni; currency: string; dnes: string; nastaveni: NastaveniPoukazu; poukazBezBodu: boolean }

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, init ? { headers: { 'Content-Type': 'application/json' }, ...init } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Nepovedlo se.'), { status: r.status });
  return d;
}

/** Měsíc `2026-10` jako „říj 2026“. */
const popisMesice = (m: string) => `${fmtMesic(Number(m.slice(5, 7)), { jazyk: 'cs', styl: 'kratky' })} ${m.slice(0, 4)}`;

export default function PoukazyPrehled({ toast, obnov, onZmena }: { toast: (m: string) => void; obnov: number; onZmena: () => void }) {
  const money = useMoney();
  const [d, setD] = useState<Data | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [prodluzit, setProdluzit] = useState(false);

  const nacti = useCallback(() => fetch('/api/client/admin/vouchers?prehled=1').then(okJson)
    .then((x: Data) => { setD(x); setChyba(null); })
    .catch(e => setChyba(apiMessage(e, 'Přehled poukazů se nepodařilo načíst.'))), []);
  useEffect(() => { void nacti(); }, [nacti, obnov]);

  if (chyba) return <Card><ErrorState compact title="Přehled poukazů se nenačetl" hint={chyba} onRetry={() => { void nacti(); }} /></Card>;
  if (!d) return <Card><div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-32" /></div></Card>;

  const p = d.prehled;
  const maxMesic = Math.max(1, ...d.mesice.flatMap(m => [m.prodano, m.cistoUplatneno]));
  const maDataMesicu = d.mesice.some(m => m.prodano > 0 || m.uplatneno > 0 || m.vraceno > 0);

  return (
    <Card className="space-y-5" aria-labelledby="pk-prehled">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="pk-prehled" className="t-card">Přehled poukazů</h2>
          <p className="t-meta mt-0.5">Závazek je to, co ještě dlužíš hostům: součet zůstatků platných poukazů.</p>
        </div>
        <Button size="sm" variant="secondary" icon="calendar" onClick={() => setProdluzit(true)}>Prodloužit platnost…</Button>
      </div>

      <StatRow>
        <Stat label="Závazek" value={money(p.zavazek)} note={`platných poukazů: ${p.pocetPlatnych}`} icon="coins" tone="info" />
        <Stat label={`Brzy propadne (${p.brzyDni} dní)`} value={czCount(p.brzyPropadne.pocet, POUKAZ)} note={p.brzyPropadne.pocet > 0 ? money(p.brzyPropadne.castka) : 'nic nekončí'} icon="clock" tone={p.brzyPropadne.pocet > 0 ? 'wait' : 'muted'} />
        <Stat label="Propadlo" value={money(p.propadlo)} note={p.pocetPropadlych > 0 ? `poukazů se zůstatkem: ${p.pocetPropadlych}` : 'nic'} icon="warning" tone={p.pocetPropadlych > 0 ? 'bad' : 'muted'} />
      </StatRow>
      {p.vJineMene > 0 && <p className="t-meta">{czCount(p.vJineMene, POUKAZ)} je v jiné měně, než má podnik teď, a do součtů se nepočítá.</p>}

      <div>
        <h3 className="t-label mb-2">Po měsících</h3>
        {!maDataMesicu ? (
          <EmptyState compact icon="chart" title="Zatím tu nic není" hint="Jakmile prodáš a uplatníš první poukaz, uvidíš tady měsíční součty." />
        ) : (
          <>
            <p className="t-meta flex flex-wrap gap-x-4 gap-y-1 mb-2">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#C8F542]" aria-hidden />Prodáno</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#16181A]" aria-hidden />Uplatněno (po vrácení)</span>
            </p>
            <ul className="divide-y divide-[var(--surface-line)]" aria-label="Prodané a uplatněné poukazy po měsících">
              {[...d.mesice].reverse().map(m => (
                <li key={m.mesic} className="py-2" data-mesic={m.mesic}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="font-semibold">{popisMesice(m.mesic)}</span>
                    <span className="t-meta tabular-nums">prodáno {money(m.prodano)}{m.pocetProdanych > 0 ? ` (${czCount(m.pocetProdanych, POUKAZ)})` : ''} · uplatněno {money(m.cistoUplatneno)}</span>
                  </div>
                  <div className="mt-1.5 space-y-1" aria-hidden>
                    <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden"><div className="h-full rounded-full bg-[#C8F542]" style={{ width: `${(m.prodano / maxMesic) * 100}%` }} /></div>
                    <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden"><div className="h-full rounded-full bg-[#16181A]" style={{ width: `${(Math.max(0, m.cistoUplatneno) / maxMesic) * 100}%` }} /></div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Limity limity={d.limity} toast={toast} onUlozeno={l => setD(x => x && { ...x, limity: l })} />
      <PoukazyDalsiNastaveni key={`${d.nastaveni.minUtrata}-${d.nastaveni.bodyZaNakup}`} nastaveni={d.nastaveni} bezBodu={d.poukazBezBodu} toast={toast}
        onUlozeno={n => setD(x => x && { ...x, nastaveni: n, limity: { ...x.limity, minUtrata: n.minUtrata } })} />
      <PoukazyUcetnictvi toast={toast} />

      {prodluzit && <Prodlouzeni dnes={d.dnes} onZavrit={() => setProdluzit(false)}
        onHotovo={(n, presk) => {
          setProdluzit(false);
          toast(n === 0 ? 'Nic se neprodloužilo: poukazy už platí dýl, nebo jsou vyčerpané či zrušené.' : `Prodlouženo: ${czCount(n, POUKAZ)}${presk > 0 ? `, přeskočeno ${presk}` : ''}.`);
          void nacti(); onZmena();
        }} />}
    </Card>
  );
}

// ---- Nastavení uplatnění ----------------------------------------------------------------------

function Limity({ limity, toast, onUlozeno }: { limity: LimityUplatneni; toast: (m: string) => void; onUlozeno: (l: LimityUplatneni) => void }) {
  const symbol = useSymbol();
  const money = useMoney();
  const [min, setMin] = useState(limity.min ? String(limity.min) : '');
  const [max, setMax] = useState(limity.max ? String(limity.max) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const beze = min === (limity.min ? String(limity.min) : '') && max === (limity.max ? String(limity.max) : '');
  const uloz = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = normalizujLimity(min, max);
    if (!v.ok) { setErr(v.chyba); return; }
    setBusy(true); setErr('');
    try { await j('/api/client/admin/vouchers', { method: 'PATCH', body: JSON.stringify({ action: 'limits', min: v.limity.min, max: v.limity.max }) }); onUlozeno(v.limity); toast('Nastavení uplatnění uloženo.'); }
    catch (e2) { setErr(apiMessage(e2, 'Nastavení se nepodařilo uložit.')); }
    setBusy(false);
  };
  return (
    <form onSubmit={uloz} className="space-y-3 border-t border-[var(--surface-line)] pt-4" aria-labelledby="pk-limity">
      <div>
        <h3 id="pk-limity" className="t-label">Uplatnění u kasy</h3>
        <p className="t-meta mt-0.5">
          {limity.min || limity.max
            ? `Teď platí: ${limity.min ? `nejméně ${money(limity.min)}` : 'bez dolního limitu'}, ${limity.max ? `nejvýš ${money(limity.max)} najednou` : 'bez horního limitu'}.`
            : 'Teď bez omezení: obsluha může odečíst libovolnou částku do zůstatku.'} Zbytek poukazu jde vždy uplatnit celý.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="pk-min" label={`Nejmenší uplatnění (${symbol})`} hint="Prázdné = bez limitu">
          <Input id="pk-min" type="number" inputMode="numeric" min={0} step={1} value={min} onChange={e => setMin(e.target.value)} placeholder="Bez limitu" />
        </Field>
        <Field id="pk-max" label={`Největší uplatnění najednou (${symbol})`} hint="Prázdné = bez limitu">
          <Input id="pk-max" type="number" inputMode="numeric" min={0} step={1} value={max} onChange={e => setMax(e.target.value)} placeholder="Bez limitu" />
        </Field>
      </div>
      {err && <p role="alert" className="note note-danger">{err}</p>}
      <Button type="submit" size="sm" variant="secondary" loading={busy} disabled={beze}>Uložit nastavení</Button>
    </form>
  );
}

// ---- Hromadné prodloužení ---------------------------------------------------------------------

function Prodlouzeni({ dnes, onZavrit, onHotovo }: { dnes: string; onZavrit: () => void; onHotovo: (prodlouzeno: number, preskoceno: number) => void }) {
  const money = useMoney();
  const [doDne, setDoDne] = useState(dayPlus(dnes, 30));
  const [novy, setNovy] = useState(dayPlus(dnes, 365));
  const [propadle, setPropadle] = useState(false);
  const [nahled, setNahled] = useState<{ pocet: number; castka: number } | null>(null);
  const [chyba, setChyba] = useState('');
  const [busy, setBusy] = useState(false);
  const poradi = useRef(0);

  // Náhled: kolika poukazů se prodloužení dotkne. Při každé změně pole se zeptá znovu (starší odpověď se zahodí).
  useEffect(() => {
    const dotaz = ++poradi.current;
    const v = overNovouPlatnost(novy, dnes);
    if (!v.ok) { setNahled(null); setChyba(v.chyba); return; }
    if (!jeDatum(doDne)) { setNahled(null); setChyba('Vyber, kterým poukazům končí platnost.'); return; }
    setChyba('');
    const u = new URLSearchParams({ nahled: 'prodlouzeni', novy, doDne, propadle: propadle ? '1' : '0' });
    const t = setTimeout(() => {
      fetch(`/api/client/admin/vouchers?${u}`).then(okJson)
        .then(x => { if (dotaz === poradi.current) setNahled({ pocet: Number(x.pocet) || 0, castka: Number(x.castka) || 0 }); })
        .catch(e => { if (dotaz === poradi.current) { setNahled(null); setChyba(apiMessage(e, 'Náhled se nepodařilo načíst.')); } });
    }, 250);
    return () => clearTimeout(t);
  }, [novy, doDne, propadle, dnes]);

  const potvrd = async () => {
    setBusy(true); setChyba('');
    try {
      const d = await j('/api/client/admin/vouchers', { method: 'PATCH', body: JSON.stringify({ action: 'extend', validUntil: novy, doDne, includeExpired: propadle }) });
      onHotovo(Number(d.prodlouzeno) || 0, Number(d.preskoceno) || 0);
    } catch (e) { setChyba(apiMessage(e, 'Prodloužení se nepovedlo.')); setBusy(false); }
  };

  return (
    <Modal open onClose={onZavrit} size="sm" title="Prodloužit platnost poukazů" subtitle="Platné poukazy se zůstatkem, kterým platnost končí do vybraného dne."
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button variant="primary" loading={busy} disabled={!nahled || nahled.pocet === 0 || !!chyba} onClick={potvrd}>
          {nahled && nahled.pocet > 0 ? `Prodloužit ${czCount(nahled.pocet, POUKAZ)}` : 'Prodloužit'}
        </Button>
      </>}>
      <div className="space-y-4" data-transient>
        <Field id="pp-do" label="Končí nejpozději" hint="Poukazy s platností do tohoto dne (včetně)">
          <Input id="pp-do" type="date" value={doDne} onChange={e => setDoDne(e.target.value)} />
        </Field>
        <Field id="pp-novy" label="Nová platnost do" hint="Musí být později než dnešní konec platnosti">
          <Input id="pp-novy" type="date" min={dnes} value={novy} onChange={e => setNovy(e.target.value)} />
        </Field>
        <SwitchRow as="div" title="Včetně už propadlých" hint="Oživí i poukazy, kterým platnost už skončila a mají zůstatek." checked={propadle} onChange={setPropadle} className="!py-0" />
        {chyba ? <p role="alert" className="note note-danger">{chyba}</p>
          : nahled === null ? <Skeleton className="h-10" />
          : nahled.pocet === 0 ? <p className="note">Tomuhle výběru neodpovídá žádný poukaz.</p>
          : <p className="note" role="status">Dotkne se {czCount(nahled.pocet, POUKAZ)} se zůstatkem {money(nahled.castka)}. Nová platnost: {datumCesky(novy)}.</p>}
      </div>
    </Modal>
  );
}
