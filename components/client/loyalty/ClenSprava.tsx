'use client';

// Správa člena a jeho celá historie pod řádkem seznamu (doplněk detailu v ClenoveDetail.tsx):
// blokace, odebrání z klubu a historie po částech (návštěvy, body, útraty, kupony, razítka
// podle kampaní, objednávky, poukazy). Správa jen se zakaznici.sprava_clenu, historie s vernost.zobrazit.

import { useCallback, useEffect, useState } from 'react';
import { Button, Chip, EmptyState, ErrorState, ListRow, Segmented, Skeleton } from '../../ui';
import { useMoney } from '../../CurrencyProvider';
import { czCount, type CzNoun } from '@/lib/czech';
import { DRUHY_DENIKU, zbyvaDoUrovne, zbyvaDoOdmeny } from '@/lib/clenPrehled';
import type { Tier } from '@/lib/clientSlots';
import { apiMessage, okJson } from '@/lib/api';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { j, type Hlaska } from '../import/typy';
import { denCesky } from './datum';
import Potvrdit from './Potvrdit';

const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };
const NAVSTEVA: CzNoun = { one: 'návštěva', few: 'návštěvy', many: 'návštěv' };
const cislo = (n: number) => n.toLocaleString('cs');

type Cast = 'prehled' | 'navstevy' | 'body' | 'utraty' | 'kupony' | 'razitka' | 'objednavky' | 'poukazy';
const STAV_OBJEDNAVKY: Record<string, string> = { new: 'nová', accepted: 'přijatá', preparing: 'v přípravě', ready: 'hotová', done: 'vyřízená', served: 'vyřízená', cancelled: 'zrušená', rejected: 'odmítnutá', confirmed: 'přijatá' };

export interface ClenProSpravu { id: number; name: string; blocked?: boolean }

/** Historie člena: přepínač částí a stránkovaný výpis. */
export function HistorieClena({ customerId }: { customerId: number }) {
  const [cast, setCast] = useState<Cast>('prehled');
  return (
    <div className="space-y-3">
      <Segmented size="sm" ariaLabel="Část historie člena" value={cast} onChange={setCast}
        options={[
          { id: 'prehled', label: 'Přehled' }, { id: 'navstevy', label: 'Návštěvy' }, { id: 'body', label: 'Body' }, { id: 'utraty', label: 'Útraty' },
          { id: 'razitka', label: 'Razítka' }, { id: 'kupony', label: 'Kupony' }, { id: 'objednavky', label: 'Objednávky' }, { id: 'poukazy', label: 'Poukazy' },
        ]} />
      <Historie customerId={customerId} cast={cast} />
    </div>
  );
}

/** Blokace a odebrání člena z klubu (s potvrzením). */
export function SpravaClena({ clen, oznam, onZmena }: { clen: ClenProSpravu; oznam: Hlaska; onZmena: () => void }) {
  const [potvrzeni, setPotvrzeni] = useState<'blokovat' | 'odblokovat' | 'smazat' | null>(null);
  const [busy, setBusy] = useState(false);
  const blokuj = async (blocked: boolean) => {
    setBusy(true);
    try { await j('/api/client/admin/customers', { method: 'PATCH', body: JSON.stringify({ id: clen.id, blocked }) }); oznam(blocked ? `${clen.name} je zablokovaný.` : `${clen.name} je odblokovaný.`); setPotvrzeni(null); onZmena(); }
    catch (err) { oznam(apiMessage(err, 'Blokaci se nepodařilo změnit.'), 'bad'); }
    setBusy(false);
  };
  const smaz = async () => {
    setBusy(true);
    try { const r = await j(`/api/client/admin/customers?id=${clen.id}`, { method: 'DELETE' }); oznam(`${r.name || clen.name} už není členem klubu.`); setPotvrzeni(null); onZmena(); }
    catch (err) { oznam(apiMessage(err, 'Člena se nepodařilo odebrat.'), 'bad'); }
    setBusy(false);
  };
  return (
    <div className="flex gap-2 flex-wrap items-center">
      {clen.blocked
        ? <Button size="sm" variant="secondary" onClick={() => setPotvrzeni('odblokovat')}>Odblokovat</Button>
        : <Button size="sm" variant="ghost" icon="lock" onClick={() => setPotvrzeni('blokovat')}>Zablokovat</Button>}
      <Button size="sm" variant="danger" icon="trash" onClick={() => setPotvrzeni('smazat')}>Odebrat z klubu</Button>
      {potvrzeni === 'blokovat' && (
        <Potvrdit title={`Zablokovat ${clen.name}?`} akce="Zablokovat" busy={busy} onZavrit={() => setPotvrzeni(null)} onPotvrdit={() => { void blokuj(true); }}
          text="Blokovanému členovi se nepřipisují body ani razítka, nedostává zprávy a u kasy se zobrazí upozornění. Co už nasbíral, mu zůstane. Odblokovat ho jde kdykoli." />
      )}
      {potvrzeni === 'odblokovat' && (
        <Potvrdit title={`Odblokovat ${clen.name}?`} akce="Odblokovat" nebezpecne={false} busy={busy} onZavrit={() => setPotvrzeni(null)} onPotvrdit={() => { void blokuj(false); }}
          text="Zase bude sbírat body a razítka a dostávat zprávy, na které kývl." />
      )}
      {potvrzeni === 'smazat' && (
        <Potvrdit title={`Odebrat ${clen.name} z klubu?`} akce="Odebrat z klubu" busy={busy} onZavrit={() => setPotvrzeni(null)} onPotvrdit={() => { void smaz(); }}
          text="Zmizí jeho body, razítka, kupony, deník, poznámky a skupiny v tomhle podniku. Účet hosta zůstane (může být členem jinde) a stejně tak rezervace a objednávky. Vzít to zpět nejde, jen ho znovu přidat s nulou. Jen potřebuješ-li ho umlčet, zvol raději blokaci." />
      )}
    </div>
  );
}

// ---- Historie po částech ---------------------------------------------------------------------------

interface Prehled {
  clen: { points: number; stamps: number; visits: number; spend: number; credit: number; joined_at: string; last_visit_at: string | null; blocked: boolean };
  uroven: Tier;
  pocty: { navstevy: number; body: number; utraty: number; kupony: number; uplatnene: number; objednavky: number; poukazy: number };
  kampane: { id: number; name: string; active: boolean; required: number; stamps: number; completed: number; reward: string; last_stamp_at: string | null; last_completed_at: string | null }[];
}

function Historie({ customerId, cast }: { customerId: number; cast: Cast }) {
  const money = useMoney();
  const [pr, setPr] = useState<Prehled | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [verze, setVerze] = useState(0);
  useEffect(() => {
    let zije = true;
    setChyba(null);
    fetch(`/api/client/admin/customers/historie?id=${customerId}`).then(okJson)
      .then(d => { if (!d?.clen) throw new Error('Historie člena má nečekaný tvar.'); if (zije) setPr(d); })
      .catch(e => { if (zije) setChyba(apiMessage(e, 'Historii člena se nepodařilo načíst.')); });
    return () => { zije = false; };
  }, [customerId, verze]);
  if (chyba) return <ErrorState title="Historie se nenačetla" detail={chyba} onRetry={() => setVerze(v => v + 1)} />;
  if (!pr) return <Skeleton className="h-16" />;
  if (cast === 'prehled') return <PrehledClena pr={pr} money={money} />;
  if (cast === 'razitka') return <Razitka pr={pr} />;
  return <Seznam customerId={customerId} cast={cast} money={money} celkem={pr.pocty[cast as keyof Prehled['pocty']]} />;
}

function PrehledClena({ pr, money }: { pr: Prehled; money: (n: number) => string }) {
  const c = pr.clen;
  const zbyva = zbyvaDoUrovne(pr.uroven, pr.uroven.unit === 'spend' ? c.spend : c.visits, money);
  const radky = zbyvaDoOdmeny(pr.kampane.filter(k => k.active).map(k => ({ name: k.name, required_stamps: k.required, stamps: k.stamps })));
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{pr.uroven.label} · {cislo(c.points)} b.{c.credit > 0 ? ` · kredit ${money(c.credit)}` : ''}</p>
      <p className="t-meta">
        {c.last_visit_at ? `Naposledy tu byl ${denCesky(c.last_visit_at)}` : 'Zatím tu nebyl'}
        {` · člen od ${denCesky(c.joined_at)} · ${czCount(c.visits, NAVSTEVA)}`}
        {c.spend > 0 ? ` · celkem ${money(c.spend)}` : ''}
      </p>
      {zbyva && <p className="t-meta">{zbyva}</p>}
      <p className="t-meta">Kupony: {pr.pocty.kupony}, z toho {pr.pocty.uplatnene} uplatněných · objednávky: {pr.pocty.objednavky} · poukazy: {pr.pocty.poukazy}</p>
      {radky.map(r => <p key={r} className="t-meta">{r}</p>)}
    </div>
  );
}

function Razitka({ pr }: { pr: Prehled }) {
  if (pr.kampane.length === 0) return <EmptyState icon="stamp" compact title="Podnik nemá razítkové kampaně" hint="Kampaně zakládáš ve Věrnosti, v části Razítka." />;
  return (
    <ul className="list" aria-label="Razítka podle kampaní">
      {pr.kampane.map(k => (
        <ListRow key={k.id}
          title={<span className="flex items-center gap-2 min-w-0"><span className="truncate">{k.name}</span>{!k.active && <Chip tone="muted" size="sm">Neběží</Chip>}</span>}
          meta={[k.last_stamp_at ? `poslední razítko ${denCesky(k.last_stamp_at)}` : 'zatím bez razítka', k.completed > 0 ? `dokončeno ${k.completed}×${k.last_completed_at ? `, naposledy ${denCesky(k.last_completed_at)}` : ''}` : null, k.reward || null].filter(Boolean).join(' · ')}
          value={<>{k.stamps} <span className="text-xs font-medium text-black/50">z {k.required}</span></>} />
      ))}
    </ul>
  );
}

function Seznam({ customerId, cast, money, celkem }: { customerId: number; cast: Cast; money: (n: number) => string; celkem: number }) {
  const [polozky, setPolozky] = useState<any[] | null>(null);
  const [dalsi, setDalsi] = useState(false);
  const [offset, setOffset] = useState(0);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacitam, setNacitam] = useState(false);
  const nacti = useCallback((od: number, pridat: boolean) => {
    setNacitam(true); setChyba(null);
    return fetch(`/api/client/admin/customers/historie?id=${customerId}&sekce=${cast}&offset=${od}`).then(okJson)
      .then(d => { setPolozky(prev => (pridat ? [...(prev ?? []), ...d.polozky] : d.polozky)); setDalsi(d.dalsi === true); setOffset(Number(d.offset) || 0); })
      .catch(e => setChyba(apiMessage(e, 'Historii se nepodařilo načíst.')))
      .finally(() => setNacitam(false));
  }, [customerId, cast]);
  useEffect(() => { setPolozky(null); void nacti(0, false); }, [nacti]);
  if (chyba && !polozky) return <ErrorState title="Historie se nenačetla" detail={chyba} onRetry={() => { void nacti(0, false); }} />;
  if (!polozky) return <Skeleton className="h-16" />;
  if (polozky.length === 0) {
    const co: Record<string, string> = { navstevy: 'Zatím žádná návštěva u kasy.', body: 'Zatím žádný pohyb bodů.', utraty: 'Zatím žádná zaznamenaná útrata.', kupony: 'Zatím žádný kupon.', objednavky: 'Zatím žádná objednávka.', poukazy: 'Zatím žádný poukaz.' };
    return <p className="t-meta">{co[cast] ?? 'Nic tu zatím není.'}</p>;
  }
  const radek = (p: any, i: number) => {
    const kdy = dbTimeDayHM(p.at);
    if (cast === 'navstevy') return <ListRow key={i} title={String(p.note || 'Návštěva')} meta={kdy} />;
    if (cast === 'body') {
      const delta = Number(p.delta) || 0, kredit = Number(p.credit_delta) || 0;
      const meta = [delta ? `${delta > 0 ? '+' : ''}${czCount(delta, BOD)}` : null, kredit ? `${kredit > 0 ? '+' : ''}${money(kredit)} kredit` : null].filter(Boolean).join(' · ');
      return <ListRow key={i} title={String(p.note || DRUHY_DENIKU[String(p.kind)] || p.kind)} meta={[kdy, meta].filter(Boolean).join(' · ')} right={<Chip tone="muted" size="sm">{DRUHY_DENIKU[String(p.kind)] ?? String(p.kind)}</Chip>} />;
    }
    if (cast === 'utraty') return <ListRow key={i} title={String(p.note)} meta={kdy} />;
    if (cast === 'kupony') return <ListRow key={i} title={String(p.title)} meta={[`vzal ${denCesky(p.at)}`, p.redeemed_at ? `uplatnil ${denCesky(p.redeemed_at)}` : 'zatím neuplatněný'].join(' · ')} right={<Chip tone={p.redeemed_at ? 'ok' : 'wait'} size="sm">{p.redeemed_at ? 'Uplatněný' : 'Čeká'}</Chip>} />;
    if (cast === 'objednavky') return <ListRow key={i} title={`Objednávka za ${money(Number(p.total) || 0)}`} meta={kdy} right={<Chip tone="muted" size="sm">{STAV_OBJEDNAVKY[String(p.status)] ?? String(p.status ?? '')}</Chip>} />;
    return <ListRow key={i} title={`Poukaz ${p.code ?? ''}`} meta={`${kdy} · ${money(Number(p.value_amount) || 0)}, zbývá ${money(Number(p.balance) || 0)}`} />;
  };
  return (
    <div className="space-y-2">
      <p className="t-meta tabular-nums">{polozky.length} z {celkem}</p>
      <ul className="list" aria-label="Historie člena">{polozky.map(radek)}</ul>
      {chyba && <p className="note note-bad" role="alert">{chyba}</p>}
      {dalsi && <Button size="sm" variant="secondary" loading={nacitam} onClick={() => { void nacti(offset, true); }}>Načíst starší</Button>}
    </div>
  );
}
