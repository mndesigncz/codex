'use client';

// Věrnost → Program (kolo 92, audit C §7 „Věrnost = jedna stránka", koncept B „C"): celý věrnostní
// program na jedné obrazovce se živým náhledem karty hosta vpravo. Vlevo věty, ne formuláře:
//   Jak hosté sbírají (razítka a/nebo body) · Odměny (žebříček: políčko / body → odměna) ·
//   Úrovně · Pravidla navíc (akce a bonusy, všechna vypnutá, dokud je podnik nezapne).
// Každý řádek má „Upravit", který otevře podrobný editor (části Body a úrovně, Razítka, Akce
// a bonusy) — ty zůstávají beze změny, ať se neztratí žádná funkce. Náhled je tatáž karta,
// jakou host vidí v aplikaci (NahledKarty = re-export components/client/karta/KartaPodniku).
//
// Čísla v náhledu jsou ukázka stavu (host se 3 razítky), označená jako ukázka; nic se
// nevymýšlí o skutečných hostech.

import { useState } from 'react';
import { Button, Card, Chip, ErrorState, ListRow, Segmented, Skeleton, useLoad } from '../../ui';
import { Icon } from '../../Icons';
import { czCount, type CzNoun } from '@/lib/czech';
import { useMoney } from '../../CurrencyProvider';
import { KartaPodniku, RamTelefonu, RazitkaMrizka } from './NahledKarty';

const RAZITKO: CzNoun = { one: 'razítko', few: 'razítka', many: 'razítek' };
const NAVSTEVA: CzNoun = { one: 'návštěvu', few: 'návštěvy', many: 'návštěv' };
/** Kolik razítek má hostovská karta v náhledu (ukázka, ne skutečný host). */
const UKAZKA_RAZITEK = 3;

type Cast = 'points' | 'stamps' | 'bonus';

interface Data { p: any; kampane: any[]; kupony: any[] }

function popisPravidla(c: any, money: (n: number) => string): string {
  if (c.rule_type === 'min_value') return `${c.min_value_multiple ? 'za každých' : 'za útratu od'} ${money(Number(c.min_value) || 0)}`;
  if (c.rule_type === 'items') return 'za vybrané položky';
  return 'za každou návštěvu';
}

export default function ProgramVernosti({ otevri, bonusy }: {
  /** Otevře podrobný editor části (Body a úrovně, Razítka, Akce a bonusy). */
  otevri: (c: Cast) => void;
  /** Akce a bonusy (pravidla navíc) — stávající seznam se zapínači, vložený do stránky. */
  bonusy: React.ReactNode;
}) {
  const money = useMoney();
  const profil = useLoad<any>('/api/client/admin/profile', raw => { if (!raw?.profile) throw new Error('Profil podniku se nepodařilo přečíst'); return raw.profile; });
  const raz = useLoad<any[]>('/api/client/admin/stamps', raw => (Array.isArray(raw?.campaigns) ? raw.campaigns : []));
  const kup = useLoad<any[]>('/api/client/admin/coupons', raw => (Array.isArray(raw?.coupons) ? raw.coupons : []));
  const [pohled, setPohled] = useState<'clen' | 'necelen'>('clen');
  const [nahled, setNahled] = useState(false);
  if (profil.error) return <ErrorState title="Program se nenačetl" onRetry={profil.reload} detail={profil.error} />;
  if (!profil.data || !raz.data) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  const d: Data = { p: profil.data, kampane: raz.data.filter(c => c.status !== 'archived'), kupony: kup.data ?? [] };
  const p = d.p;
  const aktivni = d.kampane.filter(c => c.active);
  const hlavni = aktivni.find(c => c.rule_type === 'visit') ?? aktivni[0] ?? null;
  const zaBody = d.kupony.filter(k => Number(k.cost_points) > 0 && k.active !== false && !k.archived).sort((a, b) => Number(a.cost_points) - Number(b.cost_points));
  const bodyZa100 = Number(p.points_per_100) || 0;
  const urovne = [
    { label: 'Stříbrný host', od: Number(p.silver_at) || 0, sleva: Number(p.silver_discount) || 0 },
    { label: 'Zlatý host', od: Number(p.gold_at) || 0, sleva: Number(p.gold_discount) || 0 },
    { label: 'Platinový host', od: Number(p.platinum_at) || 0, sleva: Number(p.platinum_discount) || 0 },
  ].filter(u => u.od > 0);
  const podleUtraty = p.tier_by === 'spend';
  const nazev = String(p.team_name || 'Tvůj podnik');
  const cil = Number(hlavni?.required_stamps) || 0;
  const milniky: { at: number; title: string }[] = Array.isArray(hlavni?.milestones) ? hlavni.milestones : [];
  const zebricek = [
    ...milniky.map(m => ({ kde: `${m.at}. razítko`, co: m.title, pozn: 'mezi-odměna' })),
    ...(hlavni ? [{ kde: `${cil}. razítko`, co: String(hlavni.reward_title || 'Odměna'), pozn: hlavni.name }] : []),
    ...zaBody.map(k => ({ kde: `${k.cost_points} b.`, co: String(k.title), pozn: 'za body' })),
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
      <div className="space-y-5 min-w-0">
        <Card pad="none" aria-labelledby="pv-sber">
          <div className="px-4 sm:px-5 pt-4">
            <h2 id="pv-sber" className="t-card">Jak hosté sbírají</h2>
            <p className="t-meta mt-0.5">{!p.loyalty_on ? 'Věrnost je vypnutá. Hosté zatím nic nesbírají.' : 'Razítka a body můžou běžet souběžně.'}</p>
          </div>
          <ul className="list px-4 sm:px-5">
            <ListRow lead={<span className="h-10 w-10 rounded-full bg-black/[0.045] grid place-items-center"><Icon name="check" size={18} /></span>}
              title="Razítka"
              meta={aktivni.length
                ? aktivni.map(c => `${c.name}: ${czCount(Number(c.required_stamps) || 0, RAZITKO)} ${popisPravidla(c, money)}`).join(' · ')
                : 'Žádná razítková karta neběží.'}
              actions={<Button size="sm" variant="secondary" aria-label={aktivni.length ? 'Upravit razítka' : 'Založit razítkovou kartu'} onClick={() => otevri('stamps')}>{aktivni.length ? 'Upravit' : 'Založit'}</Button>} />
            <ListRow lead={<span className="h-10 w-10 rounded-full bg-black/[0.045] grid place-items-center"><Icon name="coins" size={18} /></span>}
              title="Body"
              meta={bodyZa100 > 0 ? `${bodyZa100} b. za každých ${money(100)} útraty${Number(p.cashback_pct) > 0 ? ` · ${p.cashback_pct} % zpět jako kredit` : ''}` : 'Body se nesbírají.'}
              actions={<Button size="sm" variant="secondary" aria-label="Upravit body" onClick={() => otevri('points')}>Upravit</Button>} />
          </ul>
        </Card>

        <Card pad="none" aria-labelledby="pv-odmeny">
          <div className="px-4 sm:px-5 pt-4">
            <h2 id="pv-odmeny" className="t-card">Odměny na kartě</h2>
            <p className="t-meta mt-0.5">Co host dostane a kdy. Odměnu uplatní na kartě u kasy, bez opisování kódu.</p>
          </div>
          {zebricek.length === 0 ? (
            <p className="t-meta px-4 sm:px-5 pb-4 pt-2">Zatím žádná odměna. Založ razítkovou kartu nebo kupon za body.</p>
          ) : (
            <ul className="list px-4 sm:px-5">
              {zebricek.map((o, i) => (
                <ListRow key={i} lead={<span className="w-20 shrink-0 text-[15px] font-semibold tabular-nums">{o.kde}</span>} title={o.co} meta={o.pozn} />
              ))}
            </ul>
          )}
        </Card>

        <Card pad="none" aria-labelledby="pv-urovne">
          <div className="px-4 sm:px-5 pt-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="pv-urovne" className="t-card">Úrovně</h2>
              <p className="t-meta mt-0.5">{podleUtraty ? 'Podle útraty.' : 'Podle počtu návštěv.'} Host vidí, kolik mu chybí do další.</p>
            </div>
            <Button size="sm" variant="secondary" aria-label="Upravit úrovně" onClick={() => otevri('points')}>Upravit</Button>
          </div>
          {urovne.length === 0 ? <p className="t-meta px-4 sm:px-5 pb-4 pt-2">Úrovně nejsou nastavené.</p> : (
            <ul className="list px-4 sm:px-5">
              {urovne.map(u => (
                <ListRow key={u.label} title={u.label} meta={podleUtraty ? `od ${money(u.od)} útraty` : `od ${u.od}. návštěvy`}
                  value={u.sleva > 0 ? `−${u.sleva} %` : undefined} valueMeta={u.sleva > 0 ? 'sleva' : undefined} />
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-2">
          <div>
            <h2 className="t-card">Pravidla navíc</h2>
            <p className="t-meta mt-0.5">Dvojitá razítka, šťastná hodina. Všechna jsou vypnutá, dokud je nezapneš.</p>
          </div>
          {bonusy}
        </div>
      </div>

      <aside className="max-lg:order-first lg:sticky lg:top-4 space-y-3 min-w-0" aria-label="Náhled pro hosta">
        {/* Telefon: náhled nahoře, sbalený (rám telefonu by odsunul program o obrazovku). */}
        <Button variant="secondary" icon={nahled ? 'chevronUp' : 'chevron'} className="w-full lg:hidden" aria-expanded={nahled} onClick={() => setNahled(v => !v)}>
          {nahled ? 'Skrýt náhled' : 'Náhled karty hosta'}
        </Button>
        <div className={nahled ? 'space-y-3' : 'space-y-3 max-lg:hidden'}>
        <div className="flex items-center justify-between gap-3">
          <p className="t-label">Náhled · tak to uvidí host</p>
          <Chip tone="muted" size="sm">ukázka</Chip>
        </div>
        <Segmented size="sm" ariaLabel="Náhled pro člena nebo nečlena" value={pohled} onChange={setPohled}
          options={[{ id: 'clen', label: 'Člen' }, { id: 'necelen', label: 'Nečlen' }]} />
        <RamTelefonu>
          <div className="p-4 space-y-4">
            <p className="text-[22px] font-bold tracking-[-0.02em]">{pohled === 'clen' ? 'Karta' : nazev}</p>
            {pohled === 'clen' ? (
              hlavni && cil > 0 ? (
                <KartaPodniku nazev={nazev} logoUrl={p.logo_url || null} barva={p.accent || null} podtitul={hlavni.name}
                  cislo={`${UKAZKA_RAZITEK} / ${cil}`} jednotka="razítek"
                  veta={`Ještě ${czCount(cil - UKAZKA_RAZITEK, RAZITKO)} a ${String(hlavni.reward_title || 'odměna').toLowerCase()} je od nás.`}>
                  <div className="mt-4"><RazitkaMrizka pocet={UKAZKA_RAZITEK} cil={cil} popis={`${UKAZKA_RAZITEK} z ${cil} razítek`} /></div>
                </KartaPodniku>
              ) : (
                <KartaPodniku nazev={nazev} logoUrl={p.logo_url || null} barva={p.accent || null} podtitul="Body"
                  cislo={bodyZa100 > 0 ? 120 : 0} jednotka="b." veta={zaBody[0] ? `Za ${zaBody[0].cost_points} b. ${String(zaBody[0].title).toLowerCase()}.` : 'Body za útratu.'} />
              )
            ) : (
              <KartaPodniku nazev={nazev} logoUrl={p.logo_url || null} barva={p.accent || null} podtitul="Staň se členem"
                cislo={Number(p.welcome_points) > 0 ? `+${p.welcome_points}` : hlavni ? cil : bodyZa100}
                jednotka={Number(p.welcome_points) > 0 ? 'bodů hned' : hlavni ? 'políček na kartě' : `b. za ${money(100)}`}
                veta={hlavni ? `${hlavni.reward_title || 'Odměna'} za ${czCount(cil, NAVSTEVA)}.` : 'Sbírej body za každou útratu.'} />
            )}
            {zebricek.length > 0 && (
              <div className="rounded-[var(--r-md)] bg-white shadow-[0_0_0_1px_var(--surface-line)]">
                <p className="t-label px-4 sm:px-5 pt-3">Co za to dostaneš</p>
                <ul className="list px-4 sm:px-5">
                  {zebricek.slice(0, 4).map((o, i) => <li key={i} className="flex items-center gap-3 py-2 text-[13px] min-w-0"><span className="w-[4.5rem] shrink-0 font-semibold tabular-nums whitespace-nowrap">{o.kde}</span><span className="truncate">{o.co}</span></li>)}
                </ul>
              </div>
            )}
            <div aria-hidden className="h-11 rounded-full bg-[#C8F542] grid place-items-center text-[15px] font-semibold on-accent">{pohled === 'clen' ? 'Ukázat kartu' : 'Přidat se'}</div>
          </div>
        </RamTelefonu>
        </div>
      </aside>
    </div>
  );
}
