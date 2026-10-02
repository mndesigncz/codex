'use client';

// Historie hosta: body, razítka, kredit a kupony jedním seznamem, po stránkách (Načíst další).
// Server (api/client/me/historie) vrací jen druh záznamu, čísla a název kuponu, nikdy interní poznámku podniku.
// `slug` zúží historii na jeden podnik (stránka podniku); bez něj jsou všechny moje podniky (Moje).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../Icons';
import { EmptyState, ErrorState, Skeleton } from '../../ui';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { formatMoney } from '@/lib/money';
import { okJson, apiMessage } from '@/lib/api';
import { pragueDaySafe } from '@/lib/pragueTime';
import type { TypZaznamu } from '@/lib/hostPrehled';

interface Polozka {
  key: string; typ: TypZaznamu; at: string; points: number; credit: number; title: string | null;
  business: string; slug: string | null; currency: string;
}

function HostHistorie({ slug, showBusiness = false }: { slug?: string; showBusiness?: boolean }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const [polozky, setPolozky] = useState<Polozka[] | null>(null);
  const [dalsi, setDalsi] = useState(false);
  const [strana, setStrana] = useState(1);
  const [chyba, setChyba] = useState('');
  const [nacitam, setNacitam] = useState(false);
  // Odpověď na starší dotaz (rychlé klepání, přepnutí podniku) se zahodí.
  const poradi = useRef(0);

  const nacti = useCallback((s: number, nova: boolean) => {
    const moje = ++poradi.current;
    setNacitam(true); setChyba('');
    const u = new URLSearchParams({ strana: String(s) });
    if (slug) u.set('slug', slug);
    return fetch(`/api/client/me/historie?${u}`).then(okJson).then(d => {
      if (moje !== poradi.current) return;
      setPolozky(p => (nova || !p ? d.polozky : [...p, ...d.polozky.filter((x: Polozka) => !p.some(y => y.key === x.key))]));
      setDalsi(!!d.dalsi); setStrana(s);
    }).catch(e => { if (moje === poradi.current) setChyba(apiMessage(e, t('Historii se nepodařilo načíst.'))); })
      .finally(() => { if (moje === poradi.current) setNacitam(false); });
  }, [slug, t]);
  useEffect(() => { setPolozky(null); void nacti(1, true); }, [nacti]);

  const popis = (p: Polozka): string => {
    switch (p.typ) {
      case 'stamp': return t('Razítko');
      case 'points_earned': return t('Body za návštěvu nebo útratu');
      case 'points_spent_coupon': return p.title ? t('Kupon za body: {kupon}', { kupon: p.title }) : t('Kupon za body');
      case 'points_returned': return t('Vrácené body za kupon');
      case 'points_expired': return t('Propadlé body');
      case 'welcome': return t('Uvítací body');
      case 'birthday': return t('Dárek k narozeninám');
      case 'referral': return t('Body za pozvaného kamaráda');
      case 'reactivation': return t('Body za návrat');
      case 'manual_plus': return t('Body od podniku');
      case 'manual_minus': return t('Úprava bodů');
      case 'cashback': return t('Kredit z útraty');
      case 'credit_spent': return t('Kredit uplatněn');
      case 'reward_coupon': return t('Odměna za razítka: {kupon}', { kupon: p.title ?? '' });
      case 'coupon_used': return t('Kupon uplatněn: {kupon}', { kupon: p.title ?? '' });
      default: return t('Jiný záznam v historii');
    }
  };
  const hodnota = (p: Polozka): string => {
    const casti: string[] = [];
    if (p.points !== 0) casti.push(`${p.points > 0 ? '+' : '−'}${t('{n} b.', { n: Math.abs(p.points) })}`);
    if (p.credit !== 0) casti.push(`${p.credit > 0 ? '+' : '−'}${formatMoney(Math.abs(p.credit), p.currency)}`);
    return casti.join(' · ');
  };

  if (chyba && !polozky) return <ErrorState compact title={t('Historie se nenačetla')} hint={chyba} onRetry={() => { void nacti(1, true); }} />;
  if (!polozky) return <div className="space-y-2" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>;
  if (polozky.length === 0) return <EmptyState compact icon="clock" title={t('Zatím tu nic není')} hint={t('Jakmile získáš body, razítko nebo kupon, uvidíš to tady.')} />;
  return (
    <div>
      <ul className="divide-y divide-black/[0.06]">
        {polozky.map(p => {
          const h = hodnota(p);
          const dne = pragueDaySafe(p.at);
          return (
            <li key={p.key} className="py-2.5 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight text-pretty break-words">{popis(p)}</p>
                <p className="text-xs text-black/50 mt-0.5 truncate">{[dne ? fmtDatum(dne, { jazyk, styl: 'cislo' }) : '', showBusiness ? p.business : ''].filter(Boolean).join(' · ')}</p>
              </div>
              {h && <p className={`shrink-0 text-sm font-semibold tabular-nums ${p.points < 0 || p.credit < 0 ? 'text-black/55' : ''}`}>{h}</p>}
            </li>
          );
        })}
      </ul>
      {chyba && <p role="alert" className="mt-2 text-sm text-bad-ink">{chyba}</p>}
      {dalsi && (
        <button type="button" disabled={nacitam} onClick={() => { void nacti(strana + 1, false); }}
          className="tap-target mt-3 inline-flex items-center justify-center btn btn-secondary btn-sm active:scale-[0.98] disabled:opacity-50 transition">
          {nacitam ? '…' : t('Načíst další')}
        </button>
      )}
    </div>
  );
}

/**
 * Složený oddíl „Historie bodů a kuponů“: seznam se stahuje až po prvním rozbalení, ne při každém otevření stránky
 * (host ho většinou nepotřebuje a zbytečně by to zatěžovalo server).
 */
export default function HostHistorieOddil({ slug, showBusiness = false, className = '' }: { slug?: string; showBusiness?: boolean; className?: string }) {
  const t = useT('klient-host');
  const [otevreno, setOtevreno] = useState(false);
  return (
    <details className={`group ${className}`} onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open) setOtevreno(true); }}>
      <summary className="tap-target-sm inline-flex items-center gap-2 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none">
        <Icon name="chevron" size={15} className="transition-transform group-open:rotate-180" />{t('Historie bodů a kuponů')}
      </summary>
      <div className="mt-3 max-w-xl">{otevreno && <HostHistorie slug={slug} showBusiness={showBusiness} />}</div>
    </details>
  );
}
