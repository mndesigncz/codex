'use client';

// Čtečka u kasy → host po načtení karty (kolo 92, koncept B „B", reference Loopy 11b/2–4).
// Jedna obrazovka, dvě akce: kdo to je (jméno, úroveň, kolikátá návštěva, kdy byl naposledy),
// stav karty v barvě podniku, co si host sám vybral k uplatnění (záměr z aplikace hosta, kontrakt
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
import { czCount, type CzNoun } from '@/lib/czech';
import { poslediNavsteva } from '@/lib/ctecka';
import { KartaPodniku, RazitkaMrizka } from './NahledKarty';

const NAVSTEVA: CzNoun = { one: 'návštěva', few: 'návštěvy', many: 'návštěv' };
const RAZITKO: CzNoun = { one: 'razítko', few: 'razítka', many: 'razítek' };

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
  const kampan = hlavniKampan(h);
  const zamer: ZamerCtecky | null = h.zamer && typeof h.zamer === 'object' ? h.zamer : null;
  const cil = Number(kampan?.required) || Number(h.rules?.stampTarget) || 0;
  const razitek = kampan ? Number(kampan.stamps) || 0 : Number(h.stamps) || 0;
  const meta = h.member
    ? [h.levelLabel && h.tier !== 'bronze' ? h.levelLabel : null, `${h.points ?? 0} b.`, h.visits ? `${h.visits + 1}. ${NAVSTEVA.one}` : 'první návštěva', h.lastVisit ? `naposledy ${poslediNavsteva(h.lastVisit)}` : null].filter(Boolean).join(' · ')
    : 'Ještě není členem tohoto podniku.';
  const lzeRazitko = smiRazitko && !h.stampedToday && (!!kampan || Number(h.rules?.stampTarget) > 0) && kampan?.platiTed !== false;
  const kRazitku = h.stampedToday ? 'Dnes razítko už má' : pocet > 1 ? `Přidat ${czCount(pocet, RAZITKO)}` : 'Jen přidat razítko';
  const pripraveno = (h.openCoupons ?? []).find((c: any) => c.fromStamps)?.title ?? null;
  return (
    <div className="sloupec sloupec-4 min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        <Avatar name={h.customer?.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold leading-tight break-words text-[#16181A]">{h.customer?.name}</p>
          <p className="t-meta tabular-nums mt-0.5">{meta}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onJiny}>Jiný host</Button>
      </div>
      {h.member && (h.discount > 0 || h.credit > 0 || h.birthdayToday) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {h.discount > 0 && <Chip tone="ok" size="sm">Sleva {h.discount} %{h.discountSource === 'skupina' && h.discountName ? ` (${h.discountName})` : h.discountSource === 'uroven' ? ' (úroveň)' : ''}</Chip>}
          {h.credit > 0 && <Chip tone="ok" size="sm" icon="card">Kredit {h.credit}</Chip>}
          {h.birthdayToday && <Chip tone="info" size="sm" icon="gift">Má dnes narozeniny</Chip>}
        </div>
      )}

      {h.member && kampan && cil > 0 && (
        <KartaPodniku nazev={nazevPodniku} barva={h.accent ?? kampan.color ?? null} podtitul={kampan.name}
          cislo={`${razitek} / ${cil}`} jednotka="razítek" pripraveno={pripraveno ? 'Připraveno' : null}
          veta={razitek >= cil ? 'Karta je plná, odměna je připravená.' : `Ještě ${czCount(cil - razitek, RAZITKO)} do odměny „${kampan.reward ?? 'odměna'}".`}
          ariaLabel={`${kampan.name}: ${razitek} z ${cil} razítek`}>
          <div className="mt-4"><RazitkaMrizka pocet={razitek} cil={cil} popis={`${razitek} z ${cil} razítek`} /></div>
        </KartaPodniku>
      )}

      {zamer && (
        <div className="rounded-[var(--r-md)] border-2 border-[#C8F542] bg-[#C8F542]/10 px-4 py-3 flex items-start gap-3" data-testid="ctecka-zamer">
          <span className="mt-0.5 h-5 w-5 rounded-full bg-[#C8F542] grid place-items-center shrink-0"><Icon name="check" size={12} /></span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-snug">Host chce uplatnit: {zamer.title}</p>
            <p className="t-meta">{[zamer.benefit, zamer.fromStamps ? 'odměna za plnou kartu' : null, 'vybral v aplikaci před chvílí'].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      )}

      {lzeRazitko && smiNavic && (
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">Razítek za tuto návštěvu</p>
            <p className="t-meta">Pravidlo: 1 razítko za návštěvu{pocet > 1 ? ', navíc se zapíše s důvodem' : ''}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="lg" variant="secondary" iconOnly icon="minus" aria-label="O razítko méně" disabled={pocet <= 1} onClick={() => setPocet(pocet - 1)} />
            <span className="w-6 text-center text-lg font-bold tabular-nums" aria-live="polite">{pocet}</span>
            <Button size="lg" variant="secondary" iconOnly icon="plus" aria-label="O razítko víc" disabled={pocet >= 3} onClick={() => setPocet(pocet + 1)} />
          </div>
        </div>
      )}

      {/* Dvě akce nad sebou (koncept B): hlavní kombinovaná limetkou, druhá šedá. */}
      <div className="sloupec sloupec-2">
        {zamer && smiKupon && (
          <Button size="lg" variant="accent" icon="check" className="w-full" loading={busy === 'kombinace'}
            onClick={() => onKombinace(zamer)} data-testid="ctecka-kombinace">
            {lzeRazitko ? `Uplatnit ${zamer.title.toLowerCase()} a přidat ${pocet > 1 ? czCount(pocet, RAZITKO) : 'razítko'}` : `Uplatnit ${zamer.title.toLowerCase()}`}
          </Button>
        )}
        {/* Razítko bez platné karty (mimo okno, dnes už má) zůstává vidět zakázané — důvod říká karta níž. */}
        {h.member && smiRazitko && (!!kampan || Number(h.rules?.stampTarget) > 0 || (h.campaigns ?? []).length > 0) && (
          <Button size="lg" variant={zamer ? 'secondary' : 'primary'} icon="check" className="w-full" loading={busy === 'stamp'}
            disabled={!lzeRazitko} onClick={onRazitko}>
            {zamer || h.stampedToday ? kRazitku : pocet > 1 ? `Přidat ${czCount(pocet, RAZITKO)}` : 'Razítko za návštěvu'}
          </Button>
        )}
      </div>
    </div>
  );
}
