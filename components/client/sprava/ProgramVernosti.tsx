'use client';

// Věrnost → Program (kolo 92, audit C §7 „Věrnost = jedna stránka", koncept B „C"): celý věrnostní
// program na jedné obrazovce se živým náhledem karty hosta vpravo. Vlevo věty, ne formuláře:
//   Jak hosté sbírají (razítka a/nebo body) · Odměny (žebříček: políčko / body → odměna) ·
//   Úrovně · Pravidla navíc (akce a bonusy, všechna vypnutá, dokud je podnik nezapne).
// Každý řádek má „Upravit", který otevře podrobný editor (části Body a úrovně, Razítka, Akce
// a bonusy) — ty zůstávají beze změny, ať se neztratí žádná funkce. Náhled je tatáž karta,
// jakou host vidí v aplikaci (NahledKarty = re-export components/client/karta/KartaPodniku).
//
// Čísla v náhledu jsou ukázka stavu (host se 3 razítky), označená jako ukázka; nic se
// nevymýšlí o skutečných hostech.

import { useState } from 'react';
import { Button, Card, Chip, ErrorState, ListRow, Segmented, Skeleton, useLoad } from '../../ui';
import { Icon } from '../../Icons';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { useMoney } from '../../CurrencyProvider';
import { KartaPodniku, RamTelefonu, RazitkaMrizka } from './NahledKarty';

const razitek = (t: PrekladFn, n: number) => t('{n, plural, one {# razítko} few {# razítka} other {# razítek}}', { n });
const zaNavstev = (t: PrekladFn, n: number) => t('{n, plural, one {za # návštěvu} few {za # návštěvy} other {za # návštěv}}', { n });
/** Kolik razítek má hostovská karta v náhledu (ukázka, ne skutečný host). */
const UKAZKA_RAZITEK = 3;

type Cast = 'points' | 'stamps' | 'bonus';

interface Data { p: any; kampane: any[]; kupony: any[] }

function popisPravidla(c: any, money: (n: number) => string, t: PrekladFn): string {
  if (c.rule_type === 'min_value') return c.min_value_multiple ? t('za každých {castka}', { castka: money(Number(c.min_value) || 0) }) : t('za útratu od {castka}', { castka: money(Number(c.min_value) || 0) });
  if (c.rule_type === 'items') return t('za vybrané položky');
  return t('za každou návštěvu');
}

export default function ProgramVernosti({ otevri, bonusy }: {
  /** Otevře podrobný editor části (Body a úrovně, Razítka, Akce a bonusy). */
  otevri: (c: Cast) => void;
  /** Akce a bonusy (pravidla navíc) — stávající seznam se zapínači, vložený do stránky. */
  bonusy: React.ReactNode;
}) {
  const money = useMoney();
  const t = useT('sprava');
  const profil = useLoad<any>('/api/client/admin/profile', raw => { if (!raw?.profile) throw new Error(t('Profil podniku se nepodařilo přečíst')); return raw.profile; });
  const raz = useLoad<any[]>('/api/client/admin/stamps', raw => (Array.isArray(raw?.campaigns) ? raw.campaigns : []));
  const kup = useLoad<any[]>('/api/client/admin/coupons', raw => (Array.isArray(raw?.coupons) ? raw.coupons : []));
  const [pohled, setPohled] = useState<'clen' | 'necelen'>('clen');
  const [nahled, setNahled] = useState(false);
  if (profil.error) return <ErrorState title={t('Program se nenačetl')} onRetry={profil.reload} detail={profil.error} />;
  if (!profil.data || !raz.data) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  const d: Data = { p: profil.data, kampane: raz.data.filter(c => c.status !== 'archived'), kupony: kup.data ?? [] };
  const p = d.p;
  const aktivni = d.kampane.filter(c => c.active);
  const hlavni = aktivni.find(c => c.rule_type === 'visit') ?? aktivni[0] ?? null;
  const zaBody = d.kupony.filter(k => Number(k.cost_points) > 0 && k.active !== false && !k.archived).sort((a, b) => Number(a.cost_points) - Number(b.cost_points));
  const bodyZa100 = Number(p.points_per_100) || 0;
  const urovne = [
    { label: t('Stříbrný host'), od: Number(p.silver_at) || 0, sleva: Number(p.silver_discount) || 0 },
    { label: t('Zlatý host'), od: Number(p.gold_at) || 0, sleva: Number(p.gold_discount) || 0 },
    { label: t('Platinový host'), od: Number(p.platinum_at) || 0, sleva: Number(p.platinum_discount) || 0 },
  ].filter(u => u.od > 0);
  const podleUtraty = p.tier_by === 'spend';
  const nazev = String(p.team_name || t('Tvůj podnik'));
  const cil = Number(hlavni?.required_stamps) || 0;
  const milniky: { at: number; title: string }[] = Array.isArray(hlavni?.milestones) ? hlavni.milestones : [];
  const zebricek = [
    ...milniky.map(m => ({ kde: t('{n}. razítko', { n: m.at }), co: m.title, pozn: t('mezi-odměna') })),
    ...(hlavni ? [{ kde: t('{n}. razítko', { n: cil }), co: String(hlavni.reward_title || t('Odměna')), pozn: hlavni.name }] : []),
    ...zaBody.map(k => ({ kde: t('{n} b.', { n: k.cost_points }), co: String(k.title), pozn: t('za body') })),
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
      <div className="space-y-5 min-w-0">
        <Card pad="none" aria-labelledby="pv-sber">
          <div className="px-4 sm:px-5 pt-4">
            <h2 id="pv-sber" className="t-card">{t('Jak hosté sbírají')}</h2>
            <p className="t-meta mt-0.5">{!p.loyalty_on ? t('Věrnost je vypnutá. Hosté zatím nic nesbírají.') : t('Razítka a body můžou běžet souběžně.')}</p>
          </div>
          <ul className="list px-4 sm:px-5">
            <ListRow lead={<span className="h-10 w-10 rounded-full bg-black/[0.045] grid place-items-center"><Icon name="check" size={18} /></span>}
              title={t('Razítka')}
              meta={aktivni.length
                ? aktivni.map(c => `${c.name}: ${razitek(t, Number(c.required_stamps) || 0)} ${popisPravidla(c, money, t)}`).join(' · ')
                : t('Žádná razítková karta neběží.')}
              actions={<Button size="sm" variant="secondary" aria-label={aktivni.length ? t('Upravit razítka') : t('Založit razítkovou kartu')} onClick={() => otevri('stamps')}>{aktivni.length ? t('Upravit') : t('Založit')}</Button>} />
            <ListRow lead={<span className="h-10 w-10 rounded-full bg-black/[0.045] grid place-items-center"><Icon name="coins" size={18} /></span>}
              title={t('Body')}
              meta={bodyZa100 > 0 ? `${t('{n} b. za každých {castka} útraty', { n: bodyZa100, castka: money(100) })}${Number(p.cashback_pct) > 0 ? ` · ${t('{n} % zpět jako kredit', { n: p.cashback_pct })}` : ''}` : t('Body se nesbírají.')}
              actions={<Button size="sm" variant="secondary" aria-label={t('Upravit body')} onClick={() => otevri('points')}>{t('Upravit')}</Button>} />
          </ul>
        </Card>

        <Card pad="none" aria-labelledby="pv-odmeny">
          <div className="px-4 sm:px-5 pt-4">
            <h2 id="pv-odmeny" className="t-card">{t('Odměny na kartě')}</h2>
            <p className="t-meta mt-0.5">{t('Co host dostane a kdy. Odměnu uplatní na kartě u kasy, bez opisování kódu.')}</p>
          </div>
          {zebricek.length === 0 ? (
            <p className="t-meta px-4 sm:px-5 pb-4 pt-2">{t('Zatím žádná odměna. Založ razítkovou kartu nebo kupon za body.')}</p>
          ) : (
            <ul className="list px-4 sm:px-5">
              {zebricek.map((o, i) => (
                <ListRow key={i} lead={<span className="w-20 shrink-0 text-[15px] font-semibold tabular-nums">{o.kde}</span>} title={o.co} meta={o.pozn} />
              ))}
            </ul>
          )}
        </Card>

        <Card pad="none" aria-labelledby="pv-urovne">
          <div className="px-4 sm:px-5 pt-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="pv-urovne" className="t-card">{t('Úrovně')}</h2>
              <p className="t-meta mt-0.5">{podleUtraty ? t('Podle útraty.') : t('Podle počtu návštěv.')} {t('Host vidí, kolik mu chybí do další.')}</p>
            </div>
            <Button size="sm" variant="secondary" aria-label={t('Upravit úrovně')} onClick={() => otevri('points')}>{t('Upravit')}</Button>
          </div>
          {urovne.length === 0 ? <p className="t-meta px-4 sm:px-5 pb-4 pt-2">{t('Úrovně nejsou nastavené.')}</p> : (
            <ul className="list px-4 sm:px-5">
              {urovne.map(u => (
                <ListRow key={u.label} title={u.label} meta={podleUtraty ? t('od {castka} útraty', { castka: money(u.od) }) : t('od {n}. návštěvy', { n: u.od })}
                  value={u.sleva > 0 ? `−${u.sleva} %` : undefined} valueMeta={u.sleva > 0 ? t('sleva') : undefined} />
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-2">
          <div>
            <h2 className="t-card">{t('Pravidla navíc')}</h2>
            <p className="t-meta mt-0.5">{t('Dvojitá razítka, šťastná hodina. Všechna jsou vypnutá, dokud je nezapneš.')}</p>
          </div>
          {bonusy}
        </div>
      </div>

      <aside className="max-lg:order-first lg:sticky lg:top-4 space-y-3 min-w-0" aria-label={t('Náhled pro hosta')}>
        {/* Telefon: náhled nahoře, sbalený (rám telefonu by odsunul program o obrazovku). */}
        <Button variant="secondary" icon={nahled ? 'chevronUp' : 'chevron'} className="w-full lg:hidden" aria-expanded={nahled} onClick={() => setNahled(v => !v)}>
          {nahled ? t('Skrýt náhled') : t('Náhled karty hosta')}
        </Button>
        <div className={nahled ? 'space-y-3' : 'space-y-3 max-lg:hidden'}>
        <div className="flex items-center justify-between gap-3">
          <p className="t-label">{t('Náhled · tak to uvidí host')}</p>
          <Chip tone="muted" size="sm">{t('ukázka')}</Chip>
        </div>
        <Segmented size="sm" ariaLabel={t('Náhled pro člena nebo nečlena')} value={pohled} onChange={setPohled}
          options={[{ id: 'clen', label: t('Člen') }, { id: 'necelen', label: t('Nečlen') }]} />
        <RamTelefonu>
          <div className="p-4 space-y-4">
            <p className="text-[22px] font-bold tracking-[-0.02em]">{pohled === 'clen' ? t('Karta') : nazev}</p>
            {pohled === 'clen' ? (
              hlavni && cil > 0 ? (
                <KartaPodniku nazev={nazev} logoUrl={p.logo_url || null} barva={p.accent || null} podtitul={hlavni.name}
                  cislo={`${UKAZKA_RAZITEK} / ${cil}`} jednotka={t('razítek')}
                  veta={t('Ještě {razitek} a {odmena} je od nás.', { razitek: razitek(t, cil - UKAZKA_RAZITEK), odmena: String(hlavni.reward_title || t('odměna')).toLowerCase() })}>
                  <div className="mt-4"><RazitkaMrizka pocet={UKAZKA_RAZITEK} cil={cil} popis={t('{n} z {cil} razítek', { n: UKAZKA_RAZITEK, cil })} /></div>
                </KartaPodniku>
              ) : (
                <KartaPodniku nazev={nazev} logoUrl={p.logo_url || null} barva={p.accent || null} podtitul={t('Body')}
                  cislo={bodyZa100 > 0 ? 120 : 0} jednotka={t('b.')} veta={zaBody[0] ? t('Za {n} b. {odmena}.', { n: zaBody[0].cost_points, odmena: String(zaBody[0].title).toLowerCase() }) : t('Body za útratu.')} />
              )
            ) : (
              <KartaPodniku nazev={nazev} logoUrl={p.logo_url || null} barva={p.accent || null} podtitul={t('Staň se členem')}
                cislo={Number(p.welcome_points) > 0 ? `+${p.welcome_points}` : hlavni ? cil : bodyZa100}
                jednotka={Number(p.welcome_points) > 0 ? t('bodů hned') : hlavni ? t('políček na kartě') : t('b. za {castka}', { castka: money(100) })}
                veta={hlavni ? `${hlavni.reward_title || t('Odměna')} ${zaNavstev(t, cil)}.` : t('Sbírej body za každou útratu.')} />
            )}
            {zebricek.length > 0 && (
              <div className="h-sklo !rounded-[var(--r-md)]">
                <p className="t-label px-4 sm:px-5 pt-3">{t('Co za to dostaneš')}</p>
                <ul className="list px-4 sm:px-5">
                  {zebricek.slice(0, 4).map((o, i) => <li key={i} className="flex items-center gap-3 py-2 text-[13px] min-w-0"><span className="w-[4.5rem] shrink-0 font-semibold tabular-nums whitespace-nowrap">{o.kde}</span><span className="truncate">{o.co}</span></li>)}
                </ul>
              </div>
            )}
            <div aria-hidden className="h-11 rounded-full bg-[#C8F542] grid place-items-center text-[15px] font-semibold on-accent">{pohled === 'clen' ? t('Ukázat kartu') : t('Přidat se')}</div>
          </div>
        </RamTelefonu>
        </div>
      </aside>
    </div>
  );
}
