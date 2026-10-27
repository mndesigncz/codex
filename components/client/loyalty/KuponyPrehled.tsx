'use client';

// Přehled uplatnění kuponů s ROI: kolik se vydalo a uplatnilo, průměrná útrata
// s kuponem, doba do uplatnění, propadlé neuplatněné kódy, odhad slev a poslední
// uplatnění s obsluhou. Data počítá app/api/client/admin/coupons/prehled.

import { Card, EmptyState, ErrorState, ListRow, Skeleton, Stat, StatRow } from '../../ui';
import { useLoad } from '../../ui/useLoad';
import { useMoney } from '../../CurrencyProvider';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { useT, type PrekladFn } from '@/lib/i18n/client';

const cislo = (n: number) => n.toLocaleString('cs');
/** Doba do uplatnění v jazyce uživatele (jako dobaPopis z lib/kuponyPrehled). */
function dobaPopis(hodin: number | null, t: PrekladFn): string {
  if (hodin == null) return '—';
  if (hodin < 1) return t('{n} min', { n: Math.max(1, Math.round(hodin * 60)) });
  if (hodin < 48) return t('{n, plural, one {# hodina} few {# hodiny} other {# hodin}}', { n: Math.round(hodin) });
  return t('{n, plural, one {# den} few {# dny} other {# dní}}', { n: Math.round(hodin / 24) });
}

export default function KuponyPrehled({ obnov }: { obnov?: number }) {
  const money = useMoney();
  const t = useT('sprava');
  const { data: d, error, reload } = useLoad<any>(`/api/client/admin/coupons/prehled?n=${obnov ?? 0}`);
  if (error) return <ErrorState title={t('Přehled uplatnění se nenačetl')} onRetry={reload} detail={error} compact />;
  if (!d) return <Skeleton className="h-40" />;
  const c = d.celkem ?? {};
  const kupony: any[] = Array.isArray(d.kupony) ? d.kupony : [];
  const posledni: any[] = Array.isArray(d.posledni) ? d.posledni : [];
  if (!Number(c.vydano)) {
    return (
      <Card aria-labelledby="kp-prehled">
        <h2 id="kp-prehled" className="t-card">{t('Přehled uplatnění')}</h2>
        <EmptyState icon="chart" title={t('Zatím se nic nevydalo')} hint={t('Jakmile si hosté začnou kupony brát a obsluha je uplatňovat, uvidíš tady, co to přináší.')} compact />
      </Card>
    );
  }
  return (
    <Card pad="none" aria-labelledby="kp-prehled">
      <div className="px-5 pt-4">
        <h2 id="kp-prehled" className="t-card">{t('Přehled uplatnění')}</h2>
        <p className="t-meta mt-0.5 max-w-[70ch]">
          {t('Útrata a odhad slev se počítají z částky účtenky, kterou obsluha zapíše při uplatnění. Bez ní se kupon uplatní, ale do průměru nevstoupí.')}
        </p>
      </div>
      <div className="px-5 pt-3 pb-4">
        <StatRow>
          <Stat label={t('Vydáno')} value={cislo(Number(c.vydano))} note={t('{n} čeká na uplatnění', { n: cislo(Number(c.otevrene)) })} />
          <Stat label={t('Uplatněno')} value={cislo(Number(c.uplatneno))} note={c.miraUplatneni == null ? undefined : t('{n} % vydaných', { n: c.miraUplatneni })} />
          <Stat label={t('Průměrná útrata')} value={c.prumernaUtrata == null ? '—' : money(Number(c.prumernaUtrata))} note={c.sUtratou ? t('z {n} účtenek', { n: cislo(Number(c.sUtratou)) }) : t('obsluha částku nezapsala')} />
          <Stat label={t('Doba do uplatnění')} value={dobaPopis(c.medianHodin, t)} note={t('medián od vydání')} />
          <Stat label={t('Propadlo')} value={cislo(Number(c.propadle))} note={t('neuplatněno do konce platnosti')} />
          <Stat label={t('Odhad slev')} value={money(Number(c.odhadSlevy) || 0)} note={c.celkemUtrata ? t('při útratě {castka}', { castka: money(Number(c.celkemUtrata)) }) : undefined} />
        </StatRow>
        {d.zkraceno && <p className="t-meta mt-2">{t('Počítá se z posledních {n} vydaných kódů.', { n: cislo(20000) })}</p>}
      </div>
      {kupony.length > 0 && (
        <ul className="list px-5 border-t border-black/[0.06]">
          {kupony.map(k => (
            <ListRow key={k.id}
              title={<span className="truncate">{k.title}</span>}
              meta={[
                `${t('vydáno {n}×, uplatněno {m}×', { n: k.vydano, m: k.uplatneno })}${k.miraUplatneni == null ? '' : ` (${k.miraUplatneni} %)`}`,
                k.prumernaUtrata == null ? null : t('průměrná útrata {castka}', { castka: money(Number(k.prumernaUtrata)) }),
                k.uplatneno > 0 ? t('obvykle uplatněn za {doba}', { doba: dobaPopis(k.medianHodin, t) }) : null,
                k.propadle > 0 ? t('propadlo {n}', { n: k.propadle }) : null,
              ].filter(Boolean).join(' · ')} />
          ))}
        </ul>
      )}
      {posledni.length > 0 && (
        <div className="px-5 pb-4 pt-3 border-t border-black/[0.06]">
          <p className="field-label">{t('Poslední uplatnění')}</p>
          <ul className="list">
            {posledni.map(p => (
              <ListRow key={p.id}
                title={<span className="truncate">{p.title}</span>}
                meta={[p.host, p.obsluha ? t('obsluha {jmeno}', { jmeno: p.obsluha }) : null, p.order_value == null ? null : t('účtenka {castka}', { castka: money(Number(p.order_value)) }), dbTimeDayHM(p.redeemed_at)].filter(Boolean).join(' · ')} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
