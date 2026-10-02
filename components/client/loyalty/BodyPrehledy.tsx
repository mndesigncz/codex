'use client';

// Přehledy věrnosti (Věrnost → Přehled): závazek v měně, výnosnost, top hosté,
// zdroje bodů a export deníku do CSV. Všechno z deníku, který už vedeme.
//
// Správcovská část: česky napevno.

import { useState } from 'react';
import { Button, Card, EmptyState, ErrorState, Field, Input, ListRow, Segmented, Skeleton, Stat, StatRow, useLoad } from '../../ui';
import { useMoney, useSymbol } from '../../CurrencyProvider';
import { fmtCislo } from '@/lib/i18n/format';
import { apiMessage, okText } from '@/lib/api';
import { czCount, type CzNoun } from '@/lib/czech';
import { czDay } from '@/lib/clientSlots';
import { pragueToday } from '@/lib/pragueTime';

const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };
const CLEN: CzNoun = { one: 'člen', few: 'členové', many: 'členů' };
const NAVSTEVA: CzNoun = { one: 'návštěva', few: 'návštěvy', many: 'návštěv' };
const RADEK: CzNoun = { one: 'řádek', few: 'řádky', many: 'řádků' };

const OBDOBI = [{ id: '7', label: '7 dní' }, { id: '30', label: '30 dní' }, { id: '90', label: '90 dní' }, { id: '365', label: 'Rok' }];
const RAZENI = [{ id: 'utrata', label: 'Podle útraty' }, { id: 'body', label: 'Podle bodů v období' }, { id: 'navstevy', label: 'Podle návštěv' }];

interface Prehled {
  dny: number;
  top: { id: number; name: string; points: number; credit: number; spend: number; visits: number; lastVisit: string | null; utrataObdobi: number; bodyObdobi: number }[];
  zdroje: { zdroj: string; body: number; pocet: number }[];
  vynosnost: { utrata: number; cashbackKredit: number; cashbackBody: number; bodyRozdane: number; storno: number; nakladPct: number | null; zaznamenanoOd: string | null };
  zavazek: { kredit: number; poukazy: number; body: number; clenuSKreditem: number };
}

const cs = (n: number) => fmtCislo(Number(n) || 0, { locale: 'cs' });

/** Export deníku: období a tlačítko. Stahuje přes fetch, aby šla chyba sítě ohlásit větou. */
function ExportDeniku({ toast }: { toast: (m: string) => void }) {
  const [od, setOd] = useState(pragueToday(-30));
  const [doDne, setDoDne] = useState(pragueToday());
  const [bezi, setBezi] = useState(false);
  const chyba = od && doDne && od > doDne ? 'Začátek období musí být před koncem.' : '';
  const stahni = async () => {
    if (chyba || !od || !doDne) return;
    setBezi(true);
    try {
      const { obsah, radku, zkraceno } = await fetch(`/api/client/admin/loyalty/export?od=${od}&do=${doDne}`).then(async r => {
        const t = await okText(r);
        return { obsah: t, radku: Number(r.headers.get('X-Radku')) || 0, zkraceno: r.headers.get('X-Zkraceno') === '1' };
      });
      const url = URL.createObjectURL(new Blob([obsah], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `vernost-denik-${od}_${doDne}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(radku === 0 ? 'V tomhle období v deníku nic není. Soubor má jen hlavičku.' : `Stáhl se deník: ${czCount(radku, RADEK)}.${zkraceno ? ' Je to nejnovějších 50 000, zkrať období.' : ''}`);
    } catch (e) { toast(apiMessage(e, 'Export se nepovedl.')); }
    setBezi(false);
  };
  return (
    <Card className="space-y-4" aria-labelledby="pv-export">
      <div>
        <h2 id="pv-export" className="t-card">Export deníku do CSV</h2>
        <p className="t-meta mt-0.5 max-w-[70ch]">Všechny pohyby bodů a kreditu za období: kdo, kdy, kolik, z jaké útraty a proč. Soubor otevře Excel i Numbers (středník, desetinná čárka, česká diakritika).</p>
      </div>
      <form className="flex flex-wrap items-end gap-4" onSubmit={e => { e.preventDefault(); void stahni(); }}>
        <Field id="pv-od" label="Od" error={chyba || undefined}><Input id="pv-od" type="date" value={od} max={doDne || undefined} onChange={e => setOd(e.target.value)} /></Field>
        <Field id="pv-do" label="Do"><Input id="pv-do" type="date" value={doDne} min={od || undefined} onChange={e => setDoDne(e.target.value)} /></Field>
        <Button type="submit" variant="secondary" icon="download" loading={bezi} disabled={!!chyba || !od || !doDne}>Stáhnout CSV</Button>
      </form>
    </Card>
  );
}

export default function BodyPrehledy({ toast }: { toast: (m: string) => void }) {
  const money = useMoney();
  const symbol = useSymbol();
  const [dny, setDny] = useState('30');
  const [razeni, setRazeni] = useState('utrata');
  const { data: d, error, reload } = useLoad<Prehled>(`/api/client/admin/loyalty/prehledy?dny=${dny}&razeni=${razeni}`);
  const maxBodu = Math.max(1, ...(d?.zdroje ?? []).map(z => z.body));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="t-card">Přehledy</h2>
        <Segmented options={OBDOBI} value={dny} onChange={setDny} size="sm" ariaLabel="Období přehledů" />
      </div>
      {error ? <ErrorState title="Přehledy se nenačetly" onRetry={reload} detail={error} />
        : !d ? <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-56" /></div>
        : (
          <>
            <Card aria-labelledby="pv-zavazek">
              <h3 id="pv-zavazek" className="t-label mb-3">Závazek vůči hostům teď</h3>
              <StatRow>
                <Stat label="Kredit hostů" value={cs(d.zavazek.kredit)} unit={symbol} note={`${czCount(d.zavazek.clenuSKreditem, CLEN)} s kreditem`} />
                <Stat label="Nevyčerpané poukazy" value={cs(d.zavazek.poukazy)} unit={symbol} note="zbývající hodnota" />
                <Stat label="Body v oběhu" value={cs(d.zavazek.body)} note="odměny, které host ještě nevybral" />
              </StatRow>
            </Card>
            <Card aria-labelledby="pv-vynos">
              <h3 id="pv-vynos" className="t-label mb-3">Výnosnost za {OBDOBI.find(o => o.id === dny)?.label.toLowerCase()}</h3>
              <StatRow>
                <Stat label="Útrata členů" value={money(d.vynosnost.utrata)} note="z účtenek, objednávek a částek u kasy" />
                <Stat label="Cashback v kreditu" value={money(d.vynosnost.cashbackKredit)} note={d.vynosnost.nakladPct != null ? `${String(d.vynosnost.nakladPct).replace('.', ',')} % z útraty` : 'bez útrat v období'} />
                <Stat label="Body za útratu" value={cs(d.vynosnost.bodyRozdane)} note={d.vynosnost.cashbackBody > 0 ? `+ ${czCount(d.vynosnost.cashbackBody, BOD)} cashback` : undefined} />
                <Stat label="Vráceno stornem" value={cs(d.vynosnost.storno)} note="bodů za zrušené účtenky" />
              </StatRow>
              <p className="t-meta mt-3 max-w-[70ch]">
                {d.vynosnost.zaznamenanoOd
                  ? `Útrata se eviduje od ${czDay(d.vynosnost.zaznamenanoOd, true)}. Starší připsání se do výnosnosti nepočítají.`
                  : 'Útrata se začne evidovat s prvním připsáním z účtenky, kasy nebo objednávky.'}
              </p>
            </Card>
            <Card pad="none" aria-labelledby="pv-top">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
                <h3 id="pv-top" className="t-card">Top hosté</h3>
                <Segmented options={RAZENI} value={razeni} onChange={setRazeni} size="sm" ariaLabel="Řazení top hostů" />
              </div>
              {d.top.length === 0 ? (
                <div className="px-5 pb-5"><EmptyState icon="users" compact title="Zatím žádní členové" hint="Jakmile se hosté přidají a začnou sbírat body, uvidíš tu ty nejlepší." /></div>
              ) : (
                <ul className="list px-5">
                  {d.top.map((h, i) => (
                    <ListRow key={h.id}
                      title={<span className="flex items-center gap-2 min-w-0"><span className="t-meta tabular-nums w-5 shrink-0">{i + 1}.</span><span className="truncate">{h.name}</span></span>}
                      meta={[`celkem ${money(h.spend)}`, czCount(h.visits, NAVSTEVA), h.credit > 0 ? `kredit ${money(h.credit)}` : null].filter(Boolean).join(' · ')}
                      value={razeni === 'body' ? <>{cs(h.bodyObdobi)} <span className="text-xs font-medium text-black/50">b.</span></> : razeni === 'navstevy' ? cs(h.visits) : money(h.spend)}
                      valueMeta={`v období: ${money(h.utrataObdobi)} · ${czCount(h.bodyObdobi, BOD)}`} />
                  ))}
                </ul>
              )}
            </Card>
            <Card aria-labelledby="pv-zdroje">
              <h3 id="pv-zdroje" className="t-card">Odkud se berou body</h3>
              {d.zdroje.length === 0 ? (
                <EmptyState icon="gift" compact title="V tomto období se body nepřipsaly" hint="Zkus delší období. Body vznikají z účtenek, objednávek, kartičky u kasy a automatik." />
              ) : (
                <ul className="mt-3 space-y-3">
                  {d.zdroje.map(z => (
                    <li key={z.zdroj}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium truncate">{z.zdroj}</span>
                        <span className="text-sm tabular-nums shrink-0">{czCount(z.body, BOD)} <span className="t-meta">· {z.pocet}×</span></span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-black/[0.06] overflow-hidden" role="img" aria-label={`${z.zdroj}: ${czCount(z.body, BOD)}`}>
                        <div className="h-full rounded-full bg-[#16181A]" style={{ width: `${Math.max(2, Math.round((z.body / maxBodu) * 100))}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      <ExportDeniku toast={toast} />
    </div>
  );
}
