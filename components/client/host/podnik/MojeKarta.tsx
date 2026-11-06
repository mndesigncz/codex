'use client';

// „Moje karta“ na stránce podniku (směr A): zmenšená přední inkoustová karta bez monogramu
// (jméno podniku je hned nad ní), vpravo „QR u kasy“ — klepnutí otevře U kasy s kartou tohoto
// podniku. Velké tenké číslo razítek (nebo bodů), lišta razítek a pod kartou tiché věty:
// platnost, co propadá, další úroveň. Nečlen dostane vstup do členství s limetkovým CTA.

import { Icon } from '../../../Icons';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum, fmtDenVTydnu } from '@/lib/i18n/format';
import { formatMoney } from '@/lib/money';
import { InkoustovaKarta } from '../../penezenka';
import { useUKasy } from '../UKasy';

/** 2026-11-12 na „12. 11." (pořadí den, měsíc platí pro všechny jazyky stránky). */
function denKratce(den: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(den);
  return m ? `${Number(m[3])}. ${Number(m[2])}.` : den;
}

export function MojeKarta({ b, me, coupons }: { b: any; me: any; coupons: any[] }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const { otevri } = useUKasy();
  const datum = (x: string) => fmtDatum(x, { jazyk, styl: 'kratce' });
  const kampane: any[] = (me.campaigns ?? []).filter((c: any) => Number(c.required) > 0);
  const popis = [
    me.levelLabel ? `${t(me.levelLabel)}${me.discount > 0 ? ` · ${me.discountSource === 'skupina' && me.discountName ? t('sleva {n} % ({skupina})', { n: me.discount, skupina: me.discountName }) : t('sleva {n} %', { n: me.discount })}` : ''}` : '',
    t('{n} b.', { n: me.points ?? 0 }),
    me.credit > 0 ? t('{castka} kreditu', { castka: formatMoney(me.credit, b.currency) }) : '',
  ].filter(Boolean).join(' · ');
  const qr = <>{t('QR u kasy')}<Icon name="chevronRight" size={16} strokeWidth={1.6} /></>;
  const ukaz = () => otevri(String(b.slug));

  const upozorneni = (
    <>
      {me.expiring && <p className="hp-meta hpp-varuje">{t('{n, plural, one {# bod propadne} few {# body propadnou} other {# bodů propadne}} do {kdy}', { n: me.expiring.points, kdy: denKratce(me.expiring.till) })}</p>}
      {me.creditExpiring && <p className="hp-meta hpp-varuje">{t('Kredit {castka} propadne do {kdy}', { castka: formatMoney(me.creditExpiring.amount, b.currency), kdy: denKratce(me.creditExpiring.till) })}</p>}
      {me.levelDegraded && <p className="hp-meta">{t('Úroveň je dočasně snížená, dlouho jsme tě neviděli. Stačí přijít.')}</p>}
      {me.nextTierAt && <p className="hp-meta">{me.nextTierUnit === 'spend' ? t('do „{level}“ ještě {castka}', { level: t(me.nextTierLabel), castka: formatMoney(Math.max(0, me.nextTierAt - (me.spend ?? 0)), b.currency) }) : t('do „{level}“ ještě {n, plural, one {# návštěva} few {# návštěvy} other {# návštěv}}', { level: t(me.nextTierLabel), n: Math.max(0, me.nextTierAt - me.visits) })}</p>}
    </>
  );

  if (!kampane.length) {
    const razitka = b.stampTarget > 0 && !(me.campaigns?.length);
    // Body: postup k nejbližší odměně za body, kterou host ještě nemá.
    const dalsi = (coupons ?? []).map((c: any) => ({ c, cena: Number(c.cost_points) || 0 })).filter(x => x.cena > Number(me.points ?? 0)).sort((a, b2) => a.cena - b2.cena)[0];
    return (
      <div>
        <InkoustovaKarta varianta="predni" className="hpp-moje" bezMonogramu klic={b.slug} nazev={t('Moje karta')} popis={popis} hodnota={qr} onClick={ukaz}
          cislo={razitka ? me.stamps : me.points} z={razitka ? `/ ${b.stampTarget}` : t('b.')}
          stitek={razitka ? (b.stampReward || undefined) : dalsi ? `${t('chybí {n} b.', { n: dalsi.cena - Number(me.points ?? 0) })} · ${dalsi.c.title}` : undefined}
          razitka={razitka ? { pocet: me.stamps, cil: b.stampTarget, popis: t('{stamps} z {target} razítek', { stamps: me.stamps, target: b.stampTarget }) } : null}
          postup={!razitka && dalsi ? { podil: Number(me.points ?? 0) / dalsi.cena, popis: t('chybí {n} b.', { n: dalsi.cena - Number(me.points ?? 0) }) } : null} />
        <div className="hpp-moje-pozn">{upozorneni}</div>
      </div>
    );
  }
  // Hotová odměna z razítek (nevyzvednutá): dárek na kartě svítí a štítek řekne obojí (jako Domů a U kasy).
  const hotove: any[] = (me.claims ?? []).filter((c: any) => c.kind === 'stamps' && !c.redeemed_at);
  return (
    <div className="space-y-3">
      {kampane.map(k => {
        const zbyva = Math.max(0, k.required - k.stamps);
        const odmena = k.reward || t('odměna');
        const ceka = hotove.some((c: any) => kampane.length === 1 || String(c.title) === String(k.reward));
        return (
          <div key={k.id} id={`karta-${k.id}`} className="scroll-mt-24">
            <InkoustovaKarta varianta="predni" className="hpp-moje" bezMonogramu klic={b.slug} onClick={ukaz}
              nazev={kampane.length > 1 && k.name ? k.name : t('Moje karta')} popis={popis} hodnota={qr}
              cislo={k.stamps} z={`/ ${k.required}`}
              stitek={ceka ? (zbyva > 0 ? t('Odměna čeká · další za {n}', { n: zbyva }) : t('Odměna čeká'))
                : zbyva > 0 ? t('ještě {n, plural, one {# razítko} few {# razítka} other {# razítek}} · {odmena}', { n: zbyva, odmena }) : t('Karta je plná — {odmena} je připravená', { odmena })}
              razitka={{ pocet: k.stamps, cil: k.required, ceka, popis: [t('{name}: {stamps} z {required} razítek', { name: k.name, stamps: k.stamps, required: k.required }), ceka ? t('Odměna čeká') : ''].filter(Boolean).join(', ') }} />
            <div className="hpp-moje-pozn">
              {k.validTill && <p className="hp-meta">{t('Karta platí do {datum}.', { datum: datum(k.validTill) })}</p>}
              {k.expired && <p role="status" className="hp-meta hpp-varuje">{t('Rozdělaná karta vypršela, {n, plural, one {# razítko propadlo} few {# razítka propadla} other {# razítek propadlo}}. Další razítko začne novou kartu.', { n: k.expiredStamps })}</p>}
              {!k.expired && k.finishBy && k.stamps > 0 && <p className="hp-meta hpp-varuje">{k.daysLeft === 0 ? t('Dosbírej kartu dnes, jinak razítka propadnou.') : t('Dosbírej kartu do {datum}, jinak razítka propadnou.', { datum: datum(k.finishBy) })}</p>}
              {k.nextCardFrom && <p className="hp-meta">{t('Další kartu jde sbírat od {datum}.', { datum: datum(k.nextCardFrom) })}</p>}
              {k.finishedForever && <p className="hp-meta">{k.limit > 1 ? t('Limit karet je splněný ({n}×).', { n: k.limit }) : t('Tuhle kartu už máš dokončenou, další se nesbírá.')}</p>}
              {k.okno && (k.okno.days?.length || k.okno.from) && <p className="hp-meta">{t('Razítko dává jen {kdy}.', { kdy: [k.okno.days?.length ? k.okno.days.map((x: number) => fmtDenVTydnu(x - 1, { jazyk })).join(', ') : '', k.okno.from && k.okno.till ? `${k.okno.from}–${k.okno.till}` : ''].filter(Boolean).join(', ') })}</p>}
              {k.conditions && (
                <details className="hp-meta">
                  <summary className="cursor-pointer font-semibold tap-target inline-block min-h-[44px] leading-[44px] text-[var(--hp-fg)]">{t('Podmínky')}</summary>
                  <p className="whitespace-pre-line text-pretty">{k.conditions}</p>
                </details>
              )}
            </div>
          </div>
        );
      })}
      <div className="hpp-moje-pozn">{upozorneni}</div>
    </div>
  );
}

/** Vstup do členství: co host dostane hned, limetkové „Stát se členem“ a dobrovolné novinky. */
export function VstupDoClenstvi({ b, kampan, joining, chciNovinky, setChciNovinky, onJoin }: {
  b: any; kampan: any | null; joining: boolean; chciNovinky: boolean; setChciNovinky: (v: boolean) => void; onJoin: () => void;
}) {
  const t = useT('klient-host');
  return (
    <div className="lgx hp-sklo hpp-vstup" data-vstup-clenstvi>
      <div className="flex items-start gap-3">
        <span className="hp-jamka" aria-hidden><Icon name="gift" size={18} strokeWidth={1.6} /></span>
        <div className="min-w-0">
          <p className="hp-silny">{b.welcomePoints > 0 ? t('Přidej se a dostaneš hned {n} bodů', { n: b.welcomePoints }) : t('Přidej se a sbírej razítka a body')}</p>
          <p className="hp-meta mt-1 text-pretty">
            {kampan ? t('{n, plural, one {# razítko} few {# razítka} other {# razítek}} a {odmena} je tvoje. Kód ukážeš u kasy, nic dalšího.', { n: kampan.required, odmena: kampan.reward || t('odměna') })
              : t('{body} bodů za každých {castka} útraty. Kód ukážeš u kasy, nic dalšího.', { body: b.pointsPer100, castka: formatMoney(100, b.currency) })}
          </p>
        </div>
      </div>
      <button type="button" onClick={onJoin} disabled={joining} className="mt-4 hp-btn hp-btn-limetka hp-btn-blok"><Icon name="plus" size={16} strokeWidth={1.8} />{t('Stát se členem')}</button>
      {/* Souhlas s novinkami je dobrovolný a po podnicích: výchozí NE, jde změnit v profilu. */}
      <label className="mt-1 min-h-[44px] flex items-center gap-2.5 hp-meta cursor-pointer select-none">
        <input type="checkbox" checked={chciNovinky} onChange={e => setChciNovinky(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#16181A] dark:accent-[#EDF2E4]" />
        <span className="min-w-0 break-words">{t('Chci novinky od {podnik}', { podnik: b.name })}</span>
      </label>
    </div>
  );
}
