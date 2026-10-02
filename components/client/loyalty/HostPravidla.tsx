'use client';

// „Jak získat body a odměny“: věty z pravidel, která podnik opravdu zapnul (lib/hostPrehled.ts pravidlaZisku).
// Nic, co podnik nenastavil, se nezmiňuje. Bez jediného pravidla se oddíl vůbec neukáže.

import { useT } from '@/lib/i18n/client';
import { formatMoney } from '@/lib/money';
import { pravidlaZisku, urovneSeSlevou, type PravidloZisku } from '@/lib/hostPrehled';

export default function HostPravidla({ b, campaigns }: {
  b: { pointsPer100: number; cashbackPct: number; pointsExpireDays: number; creditExpireDays?: number; welcomePoints?: number; birthdayPoints?: number; referralPoints?: number; pointsOrders?: boolean; pointsPerReservation?: number; voucherPointsPer100?: number; currency: string; tiers?: any };
  campaigns: { name: string; required: number; reward?: string }[];
}) {
  const t = useT('klient-host');
  const pravidla = pravidlaZisku({
    pointsPer100: b.pointsPer100, cashbackPct: b.cashbackPct, pointsExpireDays: b.pointsExpireDays,
    birthdayPoints: b.birthdayPoints ?? 0, referralPoints: b.referralPoints ?? 0,
    pointsOrders: b.pointsOrders, pointsPerReservation: b.pointsPerReservation ?? 0, voucherPointsPer100: b.voucherPointsPer100 ?? 0,
    campaigns: campaigns.map(c => ({ name: c.name, required: c.required, reward: c.reward ?? '' })),
    maUrovneSeSlevou: urovneSeSlevou(b.tiers),
    welcomePoints: b.welcomePoints ?? 0, creditExpireDays: b.creditExpireDays ?? 0, inactiveMonths: b.tiers?.inactiveMonths ?? 0,
  });
  if (pravidla.length === 0) return null;
  const veta = (r: PravidloZisku): string => {
    switch (r.druh) {
      case 'body_za_utratu': return t('Za každých {castka} útraty dostaneš {n, plural, one {# bod} few {# body} other {# bodů}}.', { castka: formatMoney(100, b.currency), n: r.body });
      case 'razitka': return r.odmena
        ? t('Karta „{nazev}“: za {n, plural, one {# razítko} few {# razítka} other {# razítek}} dostaneš {odmena}.', { nazev: r.nazev, n: r.pocet, odmena: r.odmena })
        : t('Karta „{nazev}“: sbírej {n, plural, one {# razítko} few {# razítka} other {# razítek}}.', { nazev: r.nazev, n: r.pocet });
      case 'kredit': return t('{n} % z každé útraty se ti vrací jako kredit.', { n: r.procent });
      case 'narozeniny': return t('Na narozeniny dostaneš {n, plural, one {# bod} few {# body} other {# bodů}}.', { n: r.body });
      case 'pozvanka': return t('Za pozvaného kamaráda dostanete oba {n, plural, one {# bod} few {# body} other {# bodů}}.', { n: r.body });
      case 'urovne': return t('Čím častěji chodíš, tím vyšší úroveň a větší sleva.');
      case 'bez_objednavek': return t('Za objednávky od stolu body nejsou, získáš je u kasy s kartičkou.');
      case 'rezervace': return t('Za rezervaci, na kterou přijdeš, dostaneš {n, plural, one {# bod} few {# body} other {# bodů}}.', { n: r.body });
      case 'poukaz': return t('Za koupi dárkového poukazu dostaneš za každých {castka} {n, plural, one {# bod} few {# body} other {# bodů}}.', { castka: formatMoney(100, b.currency), n: r.body });
      case 'propadani': return t('Body, které nepoužiješ do {n, plural, one {# dne} few {# dnů} other {# dnů}}, propadnou.', { n: r.dny });
      case 'uvitani': return t('Po připojení dostaneš {n, plural, one {# bod} few {# body} other {# bodů}} na uvítanou.', { n: r.body });
      case 'propadani_kreditu': return t('Kredit, který nevyužiješ do {n, plural, one {# dne} few {# dnů} other {# dnů}}, propadne.', { n: r.dny });
      case 'pokles_urovne': return t('Když dlouho nepřijdeš (po {n, plural, one {# měsíci} few {# měsících} other {# měsících}}), úroveň klesne o stupeň.', { n: r.mesice });
    }
  };
  return (
    <section aria-labelledby="h-pravidla" className="mt-5 border-t border-black/[0.06] pt-4">
      <h3 id="h-pravidla" className="text-[11px] font-semibold uppercase tracking-wider text-black/45 mb-2">{t('Jak získat body a odměny')}</h3>
      <ul className="space-y-1.5 text-sm text-black/70">
        {pravidla.map((r, i) => (
          <li key={i} className="flex gap-2"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C8F542]" /><span className="min-w-0 text-pretty break-words">{veta(r)}</span></li>
        ))}
      </ul>
    </section>
  );
}
