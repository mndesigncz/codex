'use client';

// Čtečka u kasy → host po načtení karty (kolo 92, koncept B „B", reference Loopy 11b/2–4).
// Jedna obrazovka, dvě akce: kdo to je (jméno, úroveň, kolikátá návštěva, kdy byl naposledy),
// stav karty (karta hosta jako v jeho aplikaci, barva podniku jen na dlaždici loga), co si host sám vybral k uplatnění (záměr z aplikace hosta, kontrakt
// HOST ↔ SPRÁVA §2a), kolik razítek za tuhle návštěvu (−/+, výchozí 1 podle pravidla) a jedna
// kombinovaná akce „Uplatnit … a přidat razítko". Druhá akce je jen razítko.
//
// Kombinace jde dvěma existujícími cestami, obě s auditem: razítko přes POST /api/client/staff/scan
// (client_scan_actions, deník razítek), uplatnění přes POST /api/client/admin/redeem (redeemed_by,
// audit client.kupon.uplatnen; varování kuponu potvrdí obsluha v okně jako dřív). Razítka navíc
// (+2, +3) jdou ruční úpravou s důvodem (stamps/member, audit client.stamps.adjust) — jen s právem
// vernost.razitka_upravit.

import { Avatar, Button, Chip } from '../../ui';
import { Icon } from '../../Icons';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { poslediNavsteva } from '@/lib/ctecka';
import { KartaPodniku, RazitkaMrizka } from './NahledKarty';

/** poslediNavsteva (lib/ctecka) v jazyce uživatele: „dnes", „včera", „před 3 dny". */
function posledniNavstevaT(iso: string, t: PrekladFn): string {
  const s = poslediNavsteva(iso);
  if (s === 'dnes') return t('dnes');
  if (s === 'včera') return t('včera'); // i18n-ok: porovnání s výstupem poslediNavsteva
  const n = Number(/\d+/.exec(s)?.[0]);
  if (Number.isFinite(n) && n > 0) return t('{n, plural, one {před # dnem} few {před # dny} other {před # dny}}', { n });
  return t('poprvé u nás');
}
const razitek = (t: PrekladFn, n: number) => t('{n, plural, one {# razítko} few {# razítka} other {# razítek}}', { n });

export interface ZamerCtecky { claimId: number; code: string; title: string; benefit: string | null; fromStamps: boolean }

/** Hlavní karta (razítka za návštěvu), na kterou jde razítko z čtečky: první kampaň za návštěvy, jinak první vůbec. */
export function hlavniKampan(h: any): any | null {
  const k: any[] = Array.isArray(h?.campaigns) ? h.campaigns : [];
  return k.find(c => c.ruleType === 'visit' && c.platiTed !== false && !c.hotovoNavzdy) ?? k.find(c => c.ruleType === 'visit') ?? null;
}

export default function CteckaHost({ h, nazevPodniku, busy, pocet, setPocet, smiRazitko, smiKupon, smiNavic, onRazitko, onKombinace, onJiny }: {
  h: any;
  nazevPodniku: string;
  busy: string;
  /** Kolik razítek za tuhle návštěvu (1–3). */
  pocet: number;
  setPocet: (n: number) => void;
  smiRazitko: boolean;
  smiKupon: boolean;
  /** Smí přidat razítka navíc ruční úpravou (vernost.razitka_upravit). */
  smiNavic: boolean;
  onRazitko: () => void;
  onKombinace: (zamer: ZamerCtecky) => void;
  onJiny: () => void;
}) {
  const t = useT('sprava');
  const kampan = hlavniKampan(h);
  const zamer: ZamerCtecky | null = h.zamer && typeof h.zamer === 'object' ? h.zamer : null;
  const cil = Number(kampan?.required) || Number(h.rules?.stampTarget) || 0;
  const maRazitek = kampan ? Number(kampan.stamps) || 0 : Number(h.stamps) || 0;
  const meta = h.member
    ? [h.levelLabel && h.tier !== 'bronze' ? h.levelLabel : null, t('{n} b.', { n: h.points ?? 0 }), h.visits ? t('{n}. návštěva', { n: h.visits + 1 }) : t('první návštěva'), h.lastVisit ? t('naposledy {kdy}', { kdy: posledniNavstevaT(h.lastVisit, t) }) : null].filter(Boolean).join(' · ')
    : t('Ještě není členem tohoto podniku.');
  const lzeRazitko = smiRazitko && !h.stampedToday && (!!kampan || Number(h.rules?.stampTarget) > 0) && kampan?.platiTed !== false;
  const kRazitku = h.stampedToday ? t('Dnes razítko už má') : pocet > 1 ? t('Přidat {razitek}', { razitek: razitek(t, pocet) }) : t('Jen přidat razítko');
  const pripraveno = (h.openCoupons ?? []).find((c: any) => c.fromStamps)?.title ?? null;
  return (
    <div className="sloupec sloupec-4 min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        <Avatar name={h.customer?.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold leading-tight break-words text-[#16181A]">{h.customer?.name}</p>
          <p className="t-meta tabular-nums mt-0.5">{meta}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onJiny}>{t('Jiný host')}</Button>
      </div>
      {h.member && (h.discount > 0 || h.credit > 0 || h.birthdayToday) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {h.discount > 0 && <Chip tone="ok" size="sm">{t('Sleva {n} %', { n: h.discount })}{h.discountSource === 'skupina' && h.discountName ? ` (${h.discountName})` : h.discountSource === 'uroven' ? ` (${t('úroveň')})` : ''}</Chip>}
          {h.credit > 0 && <Chip tone="ok" size="sm" icon="card">{t('Kredit {n}', { n: h.credit })}</Chip>}
          {h.birthdayToday && <Chip tone="info" size="sm" icon="gift">{t('Má dnes narozeniny')}</Chip>}
        </div>
      )}

      {h.member && kampan && cil > 0 && (
        <KartaPodniku nazev={nazevPodniku} barva={h.accent ?? kampan.color ?? null} podtitul={kampan.name}
          cislo={`${maRazitek} / ${cil}`} jednotka={t('razítek')} pripraveno={pripraveno ? t('Připraveno') : null}
          veta={maRazitek >= cil ? t('Karta je plná, odměna je připravená.') : t('Ještě {razitek} do odměny „{odmena}".', { razitek: razitek(t, cil - maRazitek), odmena: kampan.reward ?? t('odměna') })}
          ariaLabel={t('{karta}: {n} z {cil} razítek', { karta: kampan.name, n: maRazitek, cil })}>
          <div className="mt-4"><RazitkaMrizka pocet={maRazitek} cil={cil} popis={t('{n} z {cil} razítek', { n: maRazitek, cil })} /></div>
        </KartaPodniku>
      )}

      {zamer && (
        <div className="rounded-[var(--r-md)] border-2 border-[#C8F542] bg-[#C8F542]/10 px-4 py-3 flex items-start gap-3" data-testid="ctecka-zamer">
          <span className="mt-0.5 h-5 w-5 rounded-full bg-[#C8F542] grid place-items-center shrink-0"><Icon name="check" size={12} /></span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-snug">{t('Host chce uplatnit: {co}', { co: zamer.title })}</p>
            <p className="t-meta">{[zamer.benefit, zamer.fromStamps ? t('odměna za plnou kartu') : null, t('vybral v aplikaci před chvílí')].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      )}

      {lzeRazitko && smiNavic && (
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">{t('Razítek za tuto návštěvu')}</p>
            <p className="t-meta">{t('Pravidlo: 1 razítko za návštěvu')}{pocet > 1 ? `, ${t('navíc se zapíše s důvodem')}` : ''}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="lg" variant="secondary" iconOnly icon="minus" aria-label={t('O razítko méně')} disabled={pocet <= 1} onClick={() => setPocet(pocet - 1)} />
            <span className="w-6 text-center text-lg font-bold tabular-nums" aria-live="polite">{pocet}</span>
            <Button size="lg" variant="secondary" iconOnly icon="plus" aria-label={t('O razítko víc')} disabled={pocet >= 3} onClick={() => setPocet(pocet + 1)} />
          </div>
        </div>
      )}

      {/* Dvě akce nad sebou (koncept B): hlavní kombinovaná limetkou, druhá šedá. */}
      <div className="sloupec sloupec-2">
        {zamer && smiKupon && (
          <Button size="lg" variant="accent" icon="check" className="w-full" loading={busy === 'kombinace'}
            onClick={() => onKombinace(zamer)} data-testid="ctecka-kombinace">
            {lzeRazitko ? t('Uplatnit {co} a přidat {razitek}', { co: zamer.title.toLowerCase(), razitek: pocet > 1 ? razitek(t, pocet) : t('razítko') }) : t('Uplatnit {co}', { co: zamer.title.toLowerCase() })}
          </Button>
        )}
        {/* Razítko bez platné karty (mimo okno, dnes už má) zůstává vidět zakázané — důvod říká karta níž. */}
        {h.member && smiRazitko && (!!kampan || Number(h.rules?.stampTarget) > 0 || (h.campaigns ?? []).length > 0) && (
          <Button size="lg" variant={zamer ? 'secondary' : 'primary'} icon="check" className="w-full" loading={busy === 'stamp'}
            disabled={!lzeRazitko} onClick={onRazitko}>
            {zamer || h.stampedToday ? kRazitku : pocet > 1 ? t('Přidat {razitek}', { razitek: razitek(t, pocet) }) : t('Razítko za návštěvu')}
          </Button>
        )}
      </div>
    </div>
  );
}
