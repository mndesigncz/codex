'use client';

// Přehled uplatnění kuponů s ROI: kolik se vydalo a uplatnilo, průměrná útrata
// s kuponem, doba do uplatnění, propadlé neuplatněné kódy, odhad slev a poslední
// uplatnění s obsluhou. Data počítá app/api/client/admin/coupons/prehled.

import { Card, EmptyState, ErrorState, ListRow, Skeleton, Stat, StatRow } from '../../ui';
import { useLoad } from '../../ui/useLoad';
import { useMoney } from '../../CurrencyProvider';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { dobaPopis } from '@/lib/kuponyPrehled';

const cislo = (n: number) => n.toLocaleString('cs');

export default function KuponyPrehled({ obnov }: { obnov?: number }) {
  const money = useMoney();
  const { data: d, error, reload } = useLoad<any>(`/api/client/admin/coupons/prehled?n=${obnov ?? 0}`);
  if (error) return <ErrorState title="Přehled uplatnění se nenačetl" onRetry={reload} detail={error} compact />;
  if (!d) return <Skeleton className="h-40" />;
  const c = d.celkem ?? {};
  const kupony: any[] = Array.isArray(d.kupony) ? d.kupony : [];
  const posledni: any[] = Array.isArray(d.posledni) ? d.posledni : [];
  if (!Number(c.vydano)) {
    return (
      <Card aria-labelledby="kp-prehled">
        <h2 id="kp-prehled" className="t-card">Přehled uplatnění</h2>
        <EmptyState icon="chart" title="Zatím se nic nevydalo" hint="Jakmile si hosté začnou kupony brát a obsluha je uplatňovat, uvidíš tady, co to přináší." compact />
      </Card>
    );
  }
  return (
    <Card pad="none" aria-labelledby="kp-prehled">
      <div className="px-5 pt-4">
        <h2 id="kp-prehled" className="t-card">Přehled uplatnění</h2>
        <p className="t-meta mt-0.5 max-w-[70ch]">
          Útrata a odhad slev se počítají z částky účtenky, kterou obsluha zapíše při uplatnění. Bez ní se kupon uplatní, ale do průměru nevstoupí.
        </p>
      </div>
      <div className="px-5 pt-3 pb-4">
        <StatRow>
          <Stat label="Vydáno" value={cislo(Number(c.vydano))} note={`${cislo(Number(c.otevrene))} čeká na uplatnění`} />
          <Stat label="Uplatněno" value={cislo(Number(c.uplatneno))} note={c.miraUplatneni == null ? undefined : `${c.miraUplatneni} % vydaných`} />
          <Stat label="Průměrná útrata" value={c.prumernaUtrata == null ? '—' : money(Number(c.prumernaUtrata))} note={c.sUtratou ? `z ${cislo(Number(c.sUtratou))} účtenek` : 'obsluha částku nezapsala'} />
          <Stat label="Doba do uplatnění" value={dobaPopis(c.medianHodin)} note="medián od vydání" />
          <Stat label="Propadlo" value={cislo(Number(c.propadle))} note="neuplatněno do konce platnosti" />
          <Stat label="Odhad slev" value={money(Number(c.odhadSlevy) || 0)} note={c.celkemUtrata ? `při útratě ${money(Number(c.celkemUtrata))}` : undefined} />
        </StatRow>
        {d.zkraceno && <p className="t-meta mt-2">Počítá se z posledních {cislo(20000)} vydaných kódů.</p>}
      </div>
      {kupony.length > 0 && (
        <ul className="list px-5 border-t border-black/[0.06]">
          {kupony.map(k => (
            <ListRow key={k.id}
              title={<span className="truncate">{k.title}</span>}
              meta={[
                `vydáno ${k.vydano}×, uplatněno ${k.uplatneno}×${k.miraUplatneni == null ? '' : ` (${k.miraUplatneni} %)`}`,
                k.prumernaUtrata == null ? null : `průměrná útrata ${money(Number(k.prumernaUtrata))}`,
                k.uplatneno > 0 ? `obvykle uplatněn za ${dobaPopis(k.medianHodin)}` : null,
                k.propadle > 0 ? `propadlo ${k.propadle}` : null,
              ].filter(Boolean).join(' · ')} />
          ))}
        </ul>
      )}
      {posledni.length > 0 && (
        <div className="px-5 pb-4 pt-3 border-t border-black/[0.06]">
          <p className="field-label">Poslední uplatnění</p>
          <ul className="list">
            {posledni.map(p => (
              <ListRow key={p.id}
                title={<span className="truncate">{p.title}</span>}
                meta={[p.host, p.obsluha ? `obsluha ${p.obsluha}` : null, p.order_value == null ? null : `účtenka ${money(Number(p.order_value))}`, dbTimeDayHM(p.redeemed_at)].filter(Boolean).join(' · ')} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
