'use client';

// Odměny › Historie (směr A): co host kdy získal a uplatnil, řádky seznamu na skle s ikonou
// v jamce, popisem (den · podnik) a hodnotou vpravo tabulárními číslicemi („+1 razítko“,
// „+40 b.“, „uplatněno“). Po stránkách přes „Načíst další“ (GET /api/client/me/historie?strana=).

import { useCallback, useEffect, useState } from 'react';
import { Skeleton, ErrorState } from '../../../ui';
import { PrazdnyStav, Radek, Seznam } from '../../penezenka';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { formatMoney } from '@/lib/money';
import { okJson } from '@/lib/api';
import { pragueDaySafe } from '@/lib/pragueTime';

interface PolozkaHistorie { key: string; typ: string; at: string; points: number; credit: number; title: string | null; business: string; currency: string }

const IKONA: Record<string, string> = {
  stamp: 'check', points_earned: 'star', welcome: 'star', referral: 'star', reactivation: 'star', manual_plus: 'star', manual_minus: 'star',
  points_spent_coupon: 'tag', points_returned: 'refresh', points_expired: 'clock', birthday: 'gift',
  cashback: 'coins', credit_spent: 'coins', reward_coupon: 'gift', coupon_used: 'gift', coupon_redeemed: 'gift',
};

export default function Historie() {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const [polozky, setPolozky] = useState<PolozkaHistorie[] | null>(null);
  const [dalsi, setDalsi] = useState(false);
  const [strana, setStrana] = useState(1);
  const [nacitam, setNacitam] = useState(false);
  const [chyba, setChyba] = useState('');
  const nacti = useCallback((s: number) => {
    setChyba(''); setNacitam(true);
    fetch(`/api/client/me/historie?strana=${s}`, { cache: 'no-store' }).then(okJson).then(x => {
      setPolozky(p => [...(s === 1 ? [] : p ?? []), ...(Array.isArray(x?.polozky) ? x.polozky : [])]); setDalsi(!!x?.dalsi); setStrana(s);
    }).catch(() => setChyba(t('Historii se nepodařilo načíst.'))).finally(() => setNacitam(false));
  }, [t]);
  useEffect(() => { nacti(1); }, [nacti]);

  const popis = (p: PolozkaHistorie): string => {
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
      case 'coupon_used': case 'coupon_redeemed': return t('Kupon uplatněn: {kupon}', { kupon: p.title ?? '' });
      default: return t('Jiný záznam v historii');
    }
  };
  const hodnota = (p: PolozkaHistorie): string => {
    const casti = [
      p.points ? `${p.points > 0 ? '+' : '−'}${t('{n} b.', { n: Math.abs(p.points) })}` : '',
      p.credit ? `${p.credit > 0 ? '+' : '−'}${formatMoney(Math.abs(p.credit), p.currency)}` : '',
    ].filter(Boolean);
    if (casti.length) return casti.join(' · ');
    if (p.typ === 'stamp') return t('+{n, plural, one {# razítko} few {# razítka} other {# razítek}}', { n: 1 });
    if (p.typ === 'coupon_used' || p.typ === 'coupon_redeemed' || p.typ === 'credit_spent') return t('uplatněno');
    return '';
  };

  if (chyba && !polozky) return <ErrorState compact title={t('Historie se nenačetla')} hint={chyba} onRetry={() => nacti(1)} />;
  if (!polozky) return <div className="space-y-2"><Skeleton className="h-16 rounded-[22px]" /><Skeleton className="h-16 rounded-[22px]" /><Skeleton className="h-16 rounded-[22px]" /></div>;
  if (!polozky.length) {
    return (
      <div className="lgx hp-sklo">
        <PrazdnyStav titulek={t('Zatím tu nic není')} text={t('Jakmile získáš body, razítko nebo kupon, uvidíš to tady.')} />
      </div>
    );
  }
  return (
    <div>
      <Seznam ariaLabel={t('Historie')}>
        {polozky.map(p => {
          const den = pragueDaySafe(p.at);
          const h = hodnota(p);
          const minus = p.points < 0 || p.credit < 0;
          return (
            <Radek key={p.key} ikona={IKONA[p.typ] ?? 'clock'}
              titulek={popis(p)}
              popis={<span className="block truncate">{[den ? fmtDatum(den, { jazyk, styl: 'cislo' }) : '', p.business].filter(Boolean).join(' · ')}</span>}
              vpravo={h ? <span className={`hp-silny hp-num whitespace-nowrap ${minus || h === t('uplatněno') ? '!font-medium text-[color:var(--hp-muted)]' : ''}`}>{h}</span> : undefined}
            />
          );
        })}
      </Seznam>
      {chyba && <p role="alert" className="mt-3 text-sm text-bad-ink">{chyba}</p>}
      {dalsi && (
        <button type="button" onClick={() => nacti(strana + 1)} disabled={nacitam} className="mt-3 hp-btn lgx hp-btn-sklo hp-btn-blok">
          {nacitam ? '…' : t('Načíst další')}
        </button>
      )}
    </div>
  );
}
