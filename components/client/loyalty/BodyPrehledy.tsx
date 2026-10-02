'use client';

// Přehledy věrnosti (Věrnost → Přehled): závazek vůči hostům, odkud se berou body a kdo
// je nejvěrnější. Export deníku do CSV pro účetní nebo vlastní rozbor. Čísla počítá server
// (lib/bodyPrehledy.ts) z deníku, členství a kuponů; dny jsou pražské.

import { useState } from 'react';
import { Button, Card, EmptyState, ErrorState, ListRow, Segmented, Skeleton, Stat, StatRow, useLoad } from '../../ui';
import { useMoney } from '../../CurrencyProvider';
import { useOpravneni } from '../../role/useOpravneni';
import { apiMessage, okText } from '@/lib/api';
import { ulozSoubor, HLASKA_NEJDE_ULOZIT } from '@/lib/stahni';
import { pragueToday, dayPlus } from '@/lib/pragueTime';
import { czCount, type CzNoun } from '@/lib/czech';
import { czDay } from '@/lib/clientSlots';
import { cisloCs } from '@/lib/bodyPravidla';
import type { PrehledBodu } from '@/lib/bodyPrehledy';

const DNU: { id: string; label: string; dnu: number }[] = [
  { id: '7', label: '7 dní', dnu: 7 },
  { id: '30', label: '30 dní', dnu: 30 },
  { id: '90', label: '90 dní', dnu: 90 },
  { id: '365', label: 'Rok', dnu: 365 },
];
const RAZENI = [
  { id: 'utrata', label: 'Útrata' },
  { id: 'body', label: 'Body' },
  { id: 'navstevy', label: 'Návštěvy' },
];
const POHYB: CzNoun = { one: 'pohyb', few: 'pohyby', many: 'pohybů' };
const HOST: CzNoun = { one: 'host', few: 'hosté', many: 'hostů' };
const NAVSTEVA: CzNoun = { one: 'návštěva', few: 'návštěvy', many: 'návštěv' };

const cs = cisloCs;

export function BodyPrehledy({ toast }: { toast: (m: string) => void }) {
  const money = useMoney();
  const { ma } = useOpravneni();
  const smiExport = ma('vernost.pravidla');
  const [dnu, setDnu] = useState('30');
  const [razeni, setRazeni] = useState('utrata');
  const [exportuji, setExportuji] = useState(false);
  const pocet = DNU.find(d => d.id === dnu)?.dnu ?? 30;
  const doo = pragueToday();
  const od = dayPlus(doo, -(pocet - 1));
  const url = `/api/client/admin/loyalty/prehled?${new URLSearchParams({ od, do: doo, razeni })}`;
  const { data: d, error, reload } = useLoad<PrehledBodu>(url, raw => {
    if (!raw?.zavazek || !Array.isArray(raw?.zdroje) || !Array.isArray(raw?.top)) throw new Error('Přehled má nečekaný tvar');
    return raw as PrehledBodu;
  });

  const exportuj = async () => {
    setExportuji(true);
    try {
      const text = await fetch(`/api/client/admin/loyalty/export?${new URLSearchParams({ od, do: doo })}`).then(okText);
      const v = await ulozSoubor(`denik-vernosti-${od}-${doo}.csv`, text, 'text/csv;charset=utf-8');
      if (v === 'nejde') toast(HLASKA_NEJDE_ULOZIT);
    } catch (e) { toast(apiMessage(e, 'Export se nepovedl.')); }
    setExportuji(false);
  };

  if (error && !d) return <ErrorState title="Přehledy se nenačetly" onRetry={reload} detail={error} />;
  if (!d) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-48" /></div>;
  const z = d.zavazek;
  return (
    <div className="space-y-4">
      <Card className="space-y-4" aria-labelledby="pv-zavazek">
        <div>
          <h2 id="pv-zavazek" className="t-card">Závazek vůči hostům</h2>
          <p className="t-meta mt-0.5 max-w-[70ch]">Kredit je dluh podniku v penězích: host ho může kdykoli utratit u kasy. Body se mění na odměny, jejich hodnota se jen odhaduje.</p>
        </div>
        <StatRow>
          <Stat label="Kredit hostů" value={money(z.credit)} note={`${czCount(z.membersWithCredit, HOST)} s kreditem`} />
          <Stat label="Body v oběhu" value={cs(z.points)} unit="b." note={`${czCount(z.membersWithPoints, HOST)} s body`} />
          <Stat label="Odhad hodnoty bodů" value={z.pointsValue == null ? '—' : money(z.pointsValue)}
            note={z.pointValue == null ? 'Chybí kupon za body s pevnou slevou' : `1 bod ≈ ${money(Math.round(z.pointValue * 100) / 100)}`} />
        </StatRow>
        {z.pointValue == null && <p className="t-meta max-w-[70ch]">Hodnotu bodu odhadujeme z kuponů za body s pevnou slevou v penězích. Kupon se slevou v procentech nebo „X+Y“ se do odhadu nepočítá.</p>}
      </Card>

      <Card pad="none" aria-labelledby="pv-zdroje">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <h2 id="pv-zdroje" className="t-card">Odkud se berou body</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented options={DNU.map(x => ({ id: x.id, label: x.label }))} value={dnu} onChange={setDnu} size="sm" ariaLabel="Období přehledu" />
            {smiExport && <Button size="sm" variant="secondary" icon="download" loading={exportuji} onClick={exportuj}>Export deníku (CSV)</Button>}
          </div>
        </div>
        {d.zdroje.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState icon="gift" compact title="V tomto období se nehýbaly žádné body" hint="Body se objeví s první návštěvou u kasy, objednávkou nebo ruční úpravou." /></div>
        ) : (
          <ul className="list px-5">
            {d.zdroje.map(r => (
              <ListRow key={r.id} title={r.label} meta={czCount(r.n, POHYB)}
                value={<span className="text-ok-ink">{r.given > 0 ? `+${cs(r.given)}` : '0'}</span>}
                valueMeta={r.spent > 0 ? `−${cs(r.spent)} b.` : 'b.'} />
            ))}
          </ul>
        )}
        <p className="t-meta px-5 pb-4 pt-2">Za období od {czDay(od)} do dneška, podle pražských dnů. Export obsahuje celý deník včetně kreditu.</p>
      </Card>

      <Card pad="none" aria-labelledby="pv-top">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <h2 id="pv-top" className="t-card">Nejvěrnější hosté</h2>
          <Segmented options={RAZENI} value={razeni} onChange={setRazeni} size="sm" ariaLabel="Řazení hostů" />
        </div>
        {d.top.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState icon="users" compact title="Zatím žádní členové" hint="Hosté se objeví, jakmile se přidají k podniku." /></div>
        ) : (
          <ul className="list px-5">
            {d.top.map((h, i) => (
              <ListRow key={h.id} lead={<span className="w-6 text-sm font-semibold tabular-nums text-black/45">{i + 1}.</span>} title={h.name}
                meta={[czCount(h.visits, NAVSTEVA), h.spend > 0 ? `útrata ${money(h.spend)}` : null].filter(Boolean).join(' · ')}
                value={<>{cs(h.points)} <span className="text-xs font-medium text-black/50">b.</span></>}
                valueMeta={h.credit > 0 ? `kredit ${money(h.credit)}` : undefined} />
            ))}
          </ul>
        )}
        <p className="t-meta px-5 pb-4 pt-2">Za celou dobu členství. Jména vidíš, protože smíš do věrnosti; e-maily jsou v Zákaznících.</p>
      </Card>
    </div>
  );
}
