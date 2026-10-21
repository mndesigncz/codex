'use client';

// Detail člena pod řádkem seznamu: skupiny (klepnutím přidat / odebrat), interní
// poznámky personálu a deník bodů s časovou osou. Dřív to bylo v ClientAdmin.tsx.
// Oprávnění: skupiny zakaznici.skupiny, poznámky zakaznici.poznamky, deník vernost.zobrazit.

import { useCallback, useEffect, useState } from 'react';
import { Avatar, Button, Chip, IconButton, ListRow, Rada, Skeleton, Stat, StatRow, Textarea, Well, useLoad } from '../../ui';
import { tonBarvy } from '@/lib/clenoveFiltr';
import { prumernyUcet, predKolika, stitkyHosta } from '@/lib/klientSprava/segmentyHostu';
import { varovaniHosta } from '@/lib/klientPrehled';
import { cislo } from '@/lib/klientSprava/format';
import { useOpravneni } from '../../role/useOpravneni';
import { useMoney } from '../../CurrencyProvider';
import { casovaOsa, zbyvaDoUrovne, zbyvaDoOdmeny, type UdalostOsy } from '@/lib/clenPrehled';
import { vyberRezervaceHosta } from '@/lib/klientPrehled';
import { NEDORAZENI_LIMIT } from '@/lib/clientSlots';
import { czCount, type CzNoun } from '@/lib/czech';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { apiMessage, okJson } from '@/lib/api';
import { NOTE_MAX } from '@/lib/poznamkyHosta';
import { j, type Hlaska } from '../import/typy';
import RazitkaClen from './RazitkaClen';
import { HistorieClena, SpravaClena } from './ClenSprava';
import { denCesky } from './datum';

const NAVSTEVA: CzNoun = { one: 'návštěva', few: 'návštěvy', many: 'návštěv' };
const REZERVACE: CzNoun = { one: 'rezervace', few: 'rezervace', many: 'rezervací' };
const POPISEK_DRUHU: Record<string, string> = { body: 'Body', kupon: 'Kupon', poukaz: 'Poukaz', objednavka: 'Objednávka' };

export { denCesky };

/** Deník bodů, skupiny a poznámky člena — jamka pod řádkem. */
export default function DetailClena({ customerId, jmeno, zablokovany = false, oznam, vidiDenik, onZmena }: {
  customerId: number; jmeno: string; zablokovany?: boolean; oznam: Hlaska; vidiDenik: boolean; onZmena: () => void;
}) {
  const money = useMoney();
  const { ma: smi } = useOpravneni();
  const [celaHistorie, setCelaHistorie] = useState(false);
  // Přehled hosta jen s vernost.zobrazit — bez něj by GET skončil 403 (widget bez oprávnění nevolá).
  const { data: pr } = useLoad<any>(vidiDenik ? `/api/client/admin/loyalty?customerId=${customerId}&detail=1` : null,
    raw => ({ ...raw, osa: casovaOsa({ ledger: raw?.ledger, claims: raw?.claims, vouchers: raw?.vouchers, orders: raw?.orders }, money), kampane: Array.isArray(raw?.kampane) ? raw.kampane : [] }));
  const zbyva = pr?.uroven && pr?.clen ? zbyvaDoUrovne(pr.uroven, pr.uroven.unit === 'spend' ? pr.clen.spend : pr.clen.visits, money) : null;
  const razitka = pr ? zbyvaDoOdmeny(pr.kampane) : [];
  return (
    <Well className="mb-3 space-y-3">
      <SkupinyClena customerId={customerId} oznam={oznam} prazdne={!vidiDenik && !smi('zakaznici.poznamky')} />
      {smi('rezervace.zobrazit') && <RezervaceClena customerId={customerId} />}
      {vidiDenik && <RazitkaClen customerId={customerId} oznam={oznam} />}
      {smi('zakaznici.poznamky') && <PoznamkyClena customerId={customerId} oznam={oznam} />}
      {smi('zakaznici.sprava_clenu') && <SpravaClena clen={{ id: customerId, name: jmeno, blocked: zablokovany }} oznam={oznam} onZmena={onZmena} />}
      {!vidiDenik ? null
        : pr === null ? <Skeleton className="h-10" />
        : (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium">{pr.uroven?.label ?? 'Člen'} · {pr.clen.points} b.{pr.clen.credit > 0 ? ` · kredit ${money(pr.clen.credit)}` : ''}</p>
              <p className="t-meta">
                {pr.clen.last_visit_at ? `Naposledy tu byl ${denCesky(pr.clen.last_visit_at)}` : 'Zatím tu nebyl'}
                {` · člen od ${denCesky(pr.clen.joined_at)} · ${czCount(pr.clen.visits, NAVSTEVA)}`}
                {pr.clen.spend > 0 ? ` · celkem ${money(pr.clen.spend)}` : ''}
              </p>
              {zbyva && <p className="t-meta">{zbyva}</p>}
              {razitka.map(r => <p key={r} className="t-meta">{r}</p>)}
            </div>
            <Button size="sm" variant="ghost" aria-expanded={celaHistorie} onClick={() => setCelaHistorie(v => !v)}>{celaHistorie ? 'Skrýt celou historii' : 'Celá historie'}</Button>
            {celaHistorie && <HistorieClena customerId={customerId} />}
            {pr.osa.length === 0 ? <p className="t-meta">Zatím žádná historie.</p> : (
              <ul className="list" aria-label="Časová osa hosta">
                {pr.osa.map((u: UdalostOsy, i: number) => (
                  <ListRow key={`${u.druh}-${u.at}-${i}`} title={u.titulek} meta={[dbTimeDayHM(u.at), u.meta].filter(Boolean).join(' · ')}
                    right={<Chip tone="muted" size="sm">{POPISEK_DRUHU[u.druh]}</Chip>} />
                ))}
              </ul>
            )}
          </>
        )}
    </Well>
  );
}

/** Řádek seznamu hostů, jak ho profil potřebuje (podmnožina ClenRadek z ClenoveSprava). */
export interface HostProfilu {
  id: number; name: string; email?: string; points: number; stamps: number; visits: number; spend?: number; credit?: number;
  joined_at: string; last_visit_at: string | null; open_coupons: number; level?: string; level_label?: string;
  skupiny?: { id: number; name: string; color: string | null }[]; has_birthday_month?: boolean; blocked?: boolean;
}

/**
 * Profil hosta (kolo 92, koncept B „D", audit C §7): CRM na jedné obrazovce. Kdo to je (štítky
 * automatické i ruční, alergie z poznámek), tři čísla jeho hodnoty, akce (Napsat, Body ±, Kupon),
 * poslední poznámka pro kolegy a jedna časová osa všeho, co se s ním dělo (body, razítka, kupony,
 * poukazy, objednávky). Pod tím rezervace, razítka, skupiny, poznámky a správa člena — tytéž
 * části jako dřív v rozbalovacím „Deníku", jen pohromadě. Na počítači panel vedle seznamu,
 * na telefonu okno zdola (volá ClenoveSprava).
 */
export function ProfilHosta({ host, oznam, vidiDenik, onZmena, onZavrit, akce, vOkne = false }: {
  host: HostProfilu; oznam: Hlaska; vidiDenik: boolean; onZmena: () => void;
  /** V okně nese jméno titulek okna — v profilu se neopakuje. */
  vOkne?: boolean;
  /** Křížek v hlavičce panelu (na telefonu ho kreslí okno). */
  onZavrit?: () => void;
  /** Akce profilu (Napsat, Body ±, Kupon) — jen ty, na které má divák oprávnění. */
  akce: { label: string; icon: string; onClick: () => void }[];
}) {
  const money = useMoney();
  const { ma: smi } = useOpravneni();
  const ted = new Date();
  const { data: pr } = useLoad<any>(vidiDenik ? `/api/client/admin/loyalty?customerId=${host.id}&detail=1` : null,
    raw => ({ ...raw, osa: casovaOsa({ ledger: raw?.ledger, claims: raw?.claims, vouchers: raw?.vouchers, orders: raw?.orders }, money), kampane: Array.isArray(raw?.kampane) ? raw.kampane : [] }));
  const { data: pozn } = useLoad<{ notes: Poznamka[] }>(smi('zakaznici.poznamky') ? `/api/client/admin/notes?customerId=${host.id}` : null,
    raw => ({ notes: Array.isArray(raw?.notes) ? raw.notes : [] }));
  const varovani = pozn ? varovaniHosta(pozn.notes.map(n => n.body)) : null;
  const posledniPoznamka = pozn?.notes[0] ?? null;
  const stitky = stitkyHosta(host, ted);
  const prumer = prumernyUcet(host.spend, host.visits);
  const zbyva = pr?.uroven && pr?.clen ? zbyvaDoUrovne(pr.uroven, pr.uroven.unit === 'spend' ? pr.clen.spend : pr.clen.visits, money) : null;
  const razitka = pr ? zbyvaDoOdmeny(pr.kampane) : [];
  const sg = host.skupiny ?? [];
  return (
    <div className="sloupec sloupec-6 min-w-0" data-profil-hosta={host.id}>
      <div className="flex items-start gap-3 min-w-0">
        <Avatar name={host.name} size="lg" />
        <div className="min-w-0 flex-1">
          {!vOkne && <h2 className="t-section leading-tight break-words">{host.name}</h2>}
          <p className={vOkne ? 't-meta mt-2' : 't-meta mt-1'}>{`členem od ${denCesky(host.joined_at)} · naposledy ${predKolika(host.last_visit_at, ted)}`}</p>
        </div>
        {onZavrit && <IconButton icon="close" size="sm" aria-label="Zavřít profil" onClick={onZavrit} />}
      </div>

      {(stitky.length > 0 || (host.level && host.level !== 'bronze') || host.has_birthday_month || varovani || sg.length > 0 || host.blocked) && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Štítky hosta">
          {host.blocked && <Chip tone="bad" size="sm">Zablokovaný</Chip>}
          {stitky.map(s => <Chip key={s.text} tone={s.ton} size="sm">{s.text}</Chip>)}
          {host.level && host.level !== 'bronze' && <Chip tone={host.level === 'silver' ? 'muted' : 'ink'} size="sm">{host.level_label}</Chip>}
          {varovani && <Chip tone="bad" size="sm" icon="warning">{varovani.length > 28 ? `${varovani.slice(0, 26)}…` : varovani}</Chip>}
          {host.has_birthday_month && <Chip tone="info" size="sm" icon="gift">Narozeniny tento měsíc</Chip>}
          {sg.map(g => <Chip key={g.id} tone={tonBarvy(g.color)} size="sm">{g.name}</Chip>)}
        </div>
      )}

      <StatRow>
        <Stat label="Návštěvy" value={host.visits} />
        <Stat label="Útrata" value={Number(host.spend) > 0 ? money(Number(host.spend)) : '–'} note={prumer != null ? `Ø ${money(prumer)}` : undefined} />
        <Stat label="Body" value={cislo(host.points)} note={host.stamps ? `${host.stamps} razítek` : undefined} />
      </StatRow>

      {akce.length > 0 && (
        <Rada vyska="s">
          {akce.map(a => <Button key={a.label} size="sm" variant="secondary" icon={a.icon} onClick={a.onClick}>{a.label}</Button>)}
        </Rada>
      )}

      {posledniPoznamka && (
        <p className="well rounded-[var(--r-md)] px-4 py-3 text-sm text-black/75 text-pretty">
          „{posledniPoznamka.body}“<span className="t-meta"> · {[posledniPoznamka.autor, dbTimeDayHM(posledniPoznamka.created_at)].filter(Boolean).join(', ')}</span>
        </p>
      )}

      {vidiDenik && (
        <section aria-labelledby={`osa-${host.id}`} className="space-y-3">
          <div>
            <h3 id={`osa-${host.id}`} className="t-card">Historie</h3>
            {(zbyva || razitka.length > 0) && <p className="t-meta mt-0.5">{[zbyva, ...razitka].filter(Boolean).join(' · ')}</p>}
          </div>
          {pr === null ? <Skeleton className="h-24" />
            : pr.osa.length === 0 ? <p className="t-meta">Zatím žádná historie.</p>
            : (
              <ol className="relative space-y-4 pl-6 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-black/10" aria-label="Časová osa hosta">
                {pr.osa.slice(0, 12).map((u: UdalostOsy, i: number) => (
                  <li key={`${u.druh}-${u.at}-${i}`} className="relative min-w-0">
                    <span aria-hidden className={`absolute -left-6 top-1 h-[11px] w-[11px] rounded-full border-2 ${i === 0 ? 'bg-[#C8F542] border-[#16181A]' : 'bg-white border-black/30'}`} />
                    <p className="text-[15px] font-medium leading-snug break-words">{u.titulek}</p>
                    <p className="t-meta">{[dbTimeDayHM(u.at), u.meta, POPISEK_DRUHU[u.druh]].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
              </ol>
            )}
        </section>
      )}

      <Well className="space-y-4">
        {smi('rezervace.zobrazit') && <RezervaceClena customerId={host.id} />}
        {vidiDenik && <RazitkaClen customerId={host.id} oznam={oznam} />}
        <SkupinyClena customerId={host.id} oznam={oznam} />
        {smi('zakaznici.poznamky') && <PoznamkyClena customerId={host.id} oznam={oznam} />}
        {vidiDenik && <HistorieRozbal customerId={host.id} />}
        {smi('zakaznici.sprava_clenu') && <SpravaClena clen={{ id: host.id, name: host.name, blocked: host.blocked === true }} oznam={oznam} onZmena={onZmena} />}
      </Well>
    </div>
  );
}

/** Celá historie po částech (návštěvy, body, útraty, kupony…) — dlouhá, proto až na požádání. */
function HistorieRozbal({ customerId }: { customerId: number }) {
  const [otevrena, setOtevrena] = useState(false);
  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" className="w-full" aria-expanded={otevrena} onClick={() => setOtevrena(v => !v)}>{otevrena ? 'Skrýt celou historii' : 'Celá historie po částech'}</Button>
      {otevrena && <HistorieClena customerId={customerId} />}
    </div>
  );
}

/**
 * Kolo 8 (R8-7): „Nedorazil 2× z 9 rezervací" — host, který nepřišel, se tu pozná dřív, než se
 * zase přihlásí. Jen se rezervace.zobrazit; bez rezervací se nic nekreslí.
 */
function RezervaceClena({ customerId }: { customerId: number }) {
  const { data: r } = useLoad(`/api/client/admin/reservations?customer=${customerId}`, vyberRezervaceHosta);
  if (!r || r.celkem === 0) return null;
  return (
    <div>
      <p className="t-label mb-1.5">Rezervace</p>
      <p className="text-sm font-medium tabular-nums flex items-center gap-2 flex-wrap">
        {r.nedorazeni > 0
          ? <><span>Nedorazil {r.nedorazeni}× z {czCount(r.celkem, REZERVACE)}</span><Chip tone="bad" size="sm">{r.nedorazeni}× nedorazil</Chip></>
          : <span>{czCount(r.celkem, REZERVACE)}, vždy dorazil</span>}
      </p>
      <p className="t-meta">
        {r.probehlo > 0 ? `${czCount(r.probehlo, REZERVACE)} proběhlo` : 'Zatím žádná neproběhla'}
        {r.posledni ? ` · naposledy ${denCesky(r.posledni)}` : ''}
        {r.nedorazeni >= NEDORAZENI_LIMIT ? ' · další rezervace se mu nepotvrdí sama' : ''}
      </p>
    </div>
  );
}

/** Štítky skupin u člena: klepnutím se host do skupiny přidá / odebere. Jen se zakaznici.skupiny. Dynamické skupiny řídí pravidla, ty jsou jen k přečtení. */
function SkupinyClena({ customerId, oznam, prazdne = false }: { customerId: number; oznam: Hlaska; prazdne?: boolean }) {
  const { ma: smi } = useOpravneni();
  const meni = smi('zakaznici.skupiny');
  const [skupiny, setSkupiny] = useState<{ id: number; name: string; color: string | null; dynamic: boolean }[] | null>(null);
  const [moje, setMoje] = useState<number[]>([]);
  const [busy, setBusy] = useState(0);
  const load = useCallback(() => fetch(`/api/client/admin/groups?customerId=${customerId}`).then(okJson)
    .then(d => { setSkupiny(d.groups ?? []); setMoje(d.customerGroupIds ?? []); }).catch(() => setSkupiny([])), [customerId]);
  useEffect(() => { load(); }, [load]);
  // Bez deníku je jamka jen pro skupiny — prázdná by jen zmizela, tak řekne proč.
  if (skupiny === null) return prazdne ? <Skeleton className="h-8" /> : null;
  if (skupiny.length === 0) return prazdne ? <p className="t-meta">Zatím žádné skupiny. Založíš je ve Věrnosti.</p> : null;
  const prepni = async (g: { id: number; name: string }) => {
    const je = moje.includes(g.id);
    setBusy(g.id);
    try {
      await j('/api/client/admin/groups', { method: 'PATCH', body: JSON.stringify({ id: g.id, [je ? 'remove' : 'add']: [customerId] }) });
      setMoje(je ? moje.filter(x => x !== g.id) : [...moje, g.id]);
    } catch (err) { oznam(apiMessage(err, 'Skupinu se nepodařilo změnit.'), 'bad'); }
    setBusy(0);
  };
  return (
    <div>
      <p className="t-label mb-1.5">Skupiny</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {skupiny.map(g => (
          <button key={g.id} type="button" onClick={() => { void prepni(g); }} disabled={!meni || g.dynamic || busy === g.id} aria-pressed={moje.includes(g.id)}
            title={g.dynamic ? 'Dynamická skupina: členy určují pravidla' : undefined}
            className={`filter-pill tap-target-sm ${moje.includes(g.id) ? 'seg-on' : 'seg-off glass'}`}>
            {g.name}{g.dynamic ? ' (auto)' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Poznamka { id: number; body: string; created_at: string; autor: string | null }

/** Interní poznámky k hostovi. Host je nevidí; zápis i smazání jde do protokolu změn. */
function PoznamkyClena({ customerId, oznam }: { customerId: number; oznam: Hlaska }) {
  const { data: d, error, reload } = useLoad<{ notes: Poznamka[] }>(`/api/client/admin/notes?customerId=${customerId}`,
    raw => ({ notes: Array.isArray(raw?.notes) ? raw.notes : [] }));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const pridej = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      await j('/api/client/admin/notes', { method: 'POST', body: JSON.stringify({ customerId, body: t }) });
      setText(''); reload();
    } catch (err) { oznam(apiMessage(err, 'Poznámku se nepodařilo uložit.'), 'bad'); }
    setBusy(false);
  };
  const smaz = async (n: Poznamka) => {
    try { await j(`/api/client/admin/notes?id=${n.id}`, { method: 'DELETE' }); reload(); }
    catch (err) { oznam(apiMessage(err, 'Poznámku se nepodařilo smazat.'), 'bad'); }
  };
  return (
    <div>
      <p className="t-label mb-1.5">Poznámky pro personál</p>
      {error ? <p className="note note-wait">Poznámky se nenačetly. <button type="button" className="underline" onClick={reload}>Zkusit znovu</button></p>
        : d === null ? <Skeleton className="h-8" />
        : (
          <>
            {d.notes.length === 0 ? <p className="t-meta mb-2">Zatím nic. Host poznámky nevidí.</p> : (
              <ul className="list mb-2" aria-label="Poznámky k hostovi">
                {d.notes.map(n => (
                  <ListRow key={n.id} title={<span className="whitespace-normal break-words font-normal">{n.body}</span>}
                    meta={[dbTimeDayHM(n.created_at), n.autor].filter(Boolean).join(' · ')}
                    actions={<Button size="sm" variant="ghost" icon="trash" aria-label="Smazat poznámku" onClick={() => { void smaz(n); }}>Smazat</Button>} />
                ))}
              </ul>
            )}
            <form onSubmit={pridej} className="flex gap-2 items-end flex-wrap">
              <Textarea aria-label="Nová poznámka" rows={2} maxLength={NOTE_MAX} value={text} onChange={e => setText(e.target.value)}
                placeholder="Třeba: nesnáší mléko, domluvená oslava v pátek" className="flex-1 basis-56" />
              <Button type="submit" size="sm" variant="secondary" icon="plus" loading={busy} disabled={!text.trim()}>Přidat</Button>
            </form>
          </>
        )}
    </div>
  );
}
