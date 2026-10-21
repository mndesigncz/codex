'use client';

// Nastavení → Předplatné: co podnik má, co může mít a jak za to zaplatit.
// Platba i správa karty běží u Stripe (pokladna a zákaznický portál), tady
// je jen stav, tlačítka, nabídka Max po koupi Pro a affiliate odkaz.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icons';
import { Button, Chip, Segmented, Stat, StatRow } from './ui';
import CheckoutModal from './CheckoutModal';
import {
  PLAN_FEATURES, PLAN_NAMES, PRICES, MAX_EXTRAS, MAX_OFFER_PCT, TRIAL_DAYS, REFERRALS_PER_MONTH,
  vyuziti, limityTarifu, type PlanInfo, type Interval, type CerpaniTarifu, type Vyuziti,
} from '@/lib/plan';
import { okJson, apiMessage } from '@/lib/api';
import { useJazyk, useT } from '@/lib/i18n/client';
import { tg } from '@/lib/i18n/stav';
import { fmtDatum } from '@/lib/i18n/format';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';

type Status = {
  configured: boolean;
  plan: PlanInfo;
  subscription: { status: string | null; interval: string | null; price: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; trialEnd: string | null } | null;
  referral: { code: string | null; link: string | null; thisMonth: number; limit: number; total: number; referredCount: number };
  /** Čerpání limitů tarifu (lidé, sdílené odkazy, podniky v organizaci) — stejná čísla, jaká vymáhá server. */
  usage?: CerpaniTarifu;
};

/**
 * Věta s tučnou částí. Tučný text se do věty vloží jako parametr `{tucne}` a tady se obalí <strong>,
 * takže překladatel vidí celou větu (pády, slovosled) a ve slovníku není žádné HTML.
 */
function VetaSTucnym({ veta, tucne, className }: { veta: (tucne: string) => string; tucne: string; className?: string }) {
  const [pred, po] = veta('\u0001').split('\u0001');
  return <>{pred}<strong className={className}>{tucne}</strong>{po}</>;
}

/**
 * Hodnota tarifu u funkce: fajfka, pomlčka, nebo text („Až 3"). `chip`: v řádku seznamu na
 * telefonu se text ukáže jako tlumený Chip, který se zalamuje — sloupec má jen třetinu šířky.
 */
function Cell({ v, chip = false }: { v: string | boolean; chip?: boolean }) {
  const t = useT('predplatne');
  if (v === true) return <Icon name="check" size={16} className="text-[#5B7A08]" title={t('ano')} />;
  if (v === false) return <span role="img" className="text-black/25" aria-label={t('ne')}>—</span>;
  if (chip) return <Chip size="sm" className="whitespace-normal text-pretty max-w-full">{t(v)}</Chip>;
  return <>{t(v)}</>;
}

/**
 * Poznámka pod číslem čerpání: bez limitu tichý text, zbývá-li jedno místo čekací Chip,
 * nezbývá-li nic Chip „Plno". Dokud je místa dost, nic — číslo „1 / 3" mluví samo.
 */
function StavLimitu({ v, zbyva }: { v: Vyuziti; zbyva: (n: number) => string }) {
  const t = useT('predplatne');
  if (v.stav === 'neomezeno') return <>{t('bez limitu')}</>;
  if (v.stav === 'plno') return <Chip size="sm" tone="bad">{t('Plno')}</Chip>;
  if (v.stav === 'malo') return <Chip size="sm" tone="wait">{zbyva(v.zbyva ?? 0)}</Chip>;
  return null;
}

export default function Billing() {
  const t = useT('predplatne');
  const { jazyk } = useJazyk();
  const czk = (n: number) => `${n.toLocaleString(LOCALE_PRO_JAZYK[jazyk])} Kč`;
  const date = (iso: string | null | undefined) => iso ? fmtDatum(iso, { jazyk, styl: 'dlouze' }) : '';
  // „za 3 dny“ jako celek: předložka a pád se liší podle jazyka (DE „in 3 Tagen“), proto je v klíči i předložka.
  const zaDny = (n: number) => t('za {n, plural, one {# den} few {# dny} other {# dní}}', { n });
  const dny = (n: number) => t('{n, plural, one {# den} few {# dny} other {# dní}}', { n });
  const nazevTarifu = (p: 'free' | 'pro' | 'max') => (p === 'free' ? t('Zdarma') : PLAN_NAMES[p]);
  const planLabel = (p: PlanInfo) => (p.trialing ? t('{plan} — zkušební, zbývá {dny}', { plan: nazevTarifu(p.effective), dny: dny(p.trialDaysLeft) }) : nazevTarifu(p.effective));
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [interval, setInterval_] = useState<Interval>('month');
  const [copied, setCopied] = useState(false);
  // Stav drží kód hlášky, ne přeloženou větu: překládá se při vykreslení, tedy vždy v aktuálním jazyce.
  const [notice, setNotice] = useState<'' | 'success' | 'cancel' | 'upgrade' | 'upgradeSleva'>('');
  const [checkout, setCheckout] = useState<{ plan: 'pro' | 'max'; interval: Interval } | null>(null);

  const load = () => fetch('/api/billing/status').then(okJson)
    .then(d => { if (d?.plan) setSt(d); else setErr(d?.error ? tg(d.error) : t('Nepodařilo se načíst.')); })
    .catch(e => setErr(apiMessage(e, t('Nepodařilo se načíst.'))));
  useEffect(() => {
    load();
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('billing') === 'success') setNotice('success');
      if (q.get('billing') === 'cancel') setNotice('cancel');
    } catch { /* ignore */ }
  }, []);

  const go = async (path: string, body?: any) => {
    setBusy(path); setErr('');
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ? tg(d.error) : t('Nepodařilo se.')); setBusy(''); return; }
      if (d.url) { window.location.href = d.url; return; }
      setBusy(''); await load();
      if (path.endsWith('/upgrade')) setNotice(d.discounted ? 'upgradeSleva' : 'upgrade');
    } catch { setErr(t('Nepodařilo se.')); setBusy(''); }
  };

  const textHlasky = (k: 'success' | 'cancel' | 'upgrade' | 'upgradeSleva') => {
    switch (k) {
      case 'success': return t('Díky! Předplatné je nastavené — stav se propíše během chvíle.');
      case 'cancel': return t('Pokladna byla zavřená bez platby. Kdykoli to jde zkusit znovu.');
      case 'upgradeSleva': return t('Přechod na Max hotový — se slevou 30 % na první platbu.');
      default: return t('Přechod na Max hotový.');
    }
  };

  const plan = st?.plan;
  const active = !!st?.subscription && ['active', 'trialing', 'past_due'].includes(String(st.subscription.status));
  const canTrial = !!plan && !plan.hadSubscription;
  const offerLeft = useMemo(() => {
    if (!plan?.maxOfferUntil) return 0;
    return Math.max(0, Math.ceil((new Date(plan.maxOfferUntil).getTime() - Date.now()) / 86400000));
  }, [plan?.maxOfferUntil]);

  const copy = async () => {
    if (!st?.referral.link) return;
    try { await navigator.clipboard.writeText(st.referral.link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  // Čerpání limitů (Stripe billing portal „Staff accounts 2 of 5"): limity podle tarifu,
  // který podnik právě má — zkušební Pro žádný limit nemá.
  const usage = st?.usage;
  const limity = limityTarifu(plan);
  const lide = usage ? vyuziti(usage.members, limity.members) : null;
  const odkazy = usage ? vyuziti(usage.shareLinks, limity.shareLinks) : null;
  const uLimitu = plan?.effective === 'free' && [lide, odkazy].some(v => v?.stav === 'malo' || v?.stav === 'plno');

  // Nabídka Max po koupi Pro má vlastní (tónovanou) kartu i limetkové tlačítko.
  const nabidkaMax = plan?.effective === 'pro' && active && offerLeft > 0;

  const priceCard = (p: 'pro' | 'max') => {
    const pr = PRICES[p];
    const isCurrent = plan?.effective === p && active;
    // Tónovaná je nejvýš jedna karta — doporučený tarif pro toho, kdo ještě
    // neplatí (DP §3.9). Dřív byly obě tónované (limetková a modrá) a vedle
    // sebe soupeřily.
    const doporuceny = !active && p === 'pro';
    return (
      <div key={p} className={`card p-6 flex flex-col ${doporuceny ? 'card-accent' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="t-card">{PLAN_NAMES[p]}</h3>
          {isCurrent && <Chip size="sm" tone="ok">{t('váš plán')}</Chip>}
          {doporuceny && <Chip size="sm">{t('Doporučujeme')}</Chip>}
        </div>
        {interval === 'year' ? (
          <p className="mt-2"><span className="text-[1.75rem] font-bold tracking-tight tabular-nums text-[#16181A]">{czk(pr.year)}</span> <span className="text-sm text-black/55">{t('ročně')}</span>
            {/* Spočtená úspora (12 × měsíční − roční), ne přeškrtnutá „srovnávací“ cena, která se nikdy neúčtovala (§ 4–5 ZOS). */}
            <span className="block text-[13px] text-black/55">{t('Ušetříte {castka} oproti měsíčnímu placení, vychází na {mesicne} měsíčně.', { castka: czk(12 * pr.month - pr.year), mesicne: czk(Math.round(pr.year / 12)) })}</span></p>
        ) : (
          <p className="mt-2"><span className="text-[1.75rem] font-bold tracking-tight tabular-nums text-[#16181A]">{czk(pr.month)}</span> <span className="text-sm text-black/55">{t('měsíčně')}</span>
            <span className="block text-[13px] text-black/55">{t('za podnik, kdykoli zrušit')}</span></p>
        )}
        <p className="mt-3 text-sm text-black/60">
          {p === 'pro' ? t('Neomezený tým, kiosk, odměny, exporty, měsíční přehled a sdílené menu ve vašich barvách.')
            : t('Vše z Pro a k tomu Managero client (věrnost, rezervace, objednávky od stolu), pokladna Storyous a výroba vlastních produktů.')}
        </p>
        <div className="mt-auto pt-5">
          {isCurrent ? (
            <Button variant="secondary" onClick={() => go('/api/billing/portal')} loading={busy === '/api/billing/portal'}>{t('Spravovat předplatné')}</Button>
          ) : active ? (
            <Button variant={p === 'max' && !nabidkaMax ? 'accent' : 'secondary'} onClick={() => p === 'max' ? go('/api/billing/upgrade') : go('/api/billing/portal')} loading={busy.endsWith(p === 'max' ? '/upgrade' : '/portal')}>
              {p === 'max' ? (offerLeft ? t('Přejít na Max se slevou {pct} %', { pct: MAX_OFFER_PCT }) : t('Přejít na Max')) : t('Změnit na Pro')}
            </Button>
          ) : (
            <Button variant={p === 'pro' ? 'accent' : 'primary'} onClick={() => setCheckout({ plan: p, interval })}>
              {canTrial ? t('Vyzkoušet {n} dní zdarma', { n: TRIAL_DAYS }) : t('Předplatit {plan}', { plan: PLAN_NAMES[p] })}
            </Button>
          )}
          {!active && canTrial && <p className="mt-2 t-meta">{t('Karta se zadá hned, první platba až po {n} dnech. Zrušit jde kdykoli.', { n: TRIAL_DAYS })}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {checkout && (
        <CheckoutModal plan={checkout.plan} interval={checkout.interval} trial={canTrial}
          onClose={() => setCheckout(null)}
          onDone={() => { setCheckout(null); setNotice('success'); setTimeout(load, 1500); setTimeout(load, 6000); }} />
      )}
      {notice && <p className="note note-ok">{textHlasky(notice)}</p>}
      {err && <p className="note note-danger">{err}</p>}
      {st && !st.configured && <p className="note note-wait">{t('Platby ještě nejsou zapnuté — chybí klíče Stripe v nastavení serveru.')}</p>}

      {/* Stav */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="t-card">{t('Váš plán')}</h3>
            <p className="t-meta mt-1">{t('Co váš podnik v Managero aktuálně má.')}</p>
          </div>
          {plan && (
            // Tarif je stav (platí / zdarma), ne informace — info modrá patří odkazům a radám.
            <Chip tone={plan.effective === 'free' ? 'muted' : 'ok'}>{planLabel(plan)}</Chip>
          )}
        </div>
        {lide && odkazy && (
          <div className="mt-5 border-t border-[var(--surface-line)] pt-4">
            <StatRow>
              <Stat label={t('Lidé v týmu')} value={lide.pocet} unit={lide.limit != null ? `/ ${lide.limit}` : undefined}
                note={<StavLimitu v={lide} zbyva={n => t('Zbývá {n, plural, one {# místo} few {# místa} other {# míst}}', { n })} />} />
              <Stat label={t('Sdílené odkazy')} value={odkazy.pocet} unit={odkazy.limit != null ? `/ ${odkazy.limit}` : undefined}
                note={<StavLimitu v={odkazy} zbyva={n => t('Zbývá {n, plural, one {# odkaz} few {# odkazy} other {# odkazů}}', { n })} />} />
              {usage?.teams != null && <Stat label={t('Podniky v organizaci')} value={usage.teams} />}
            </StatRow>
            {/* U limitu cesta ven hned vedle čísla — vedlejší akce; limetka zůstává na kartě tarifu Pro. */}
            {uLimitu && (
              <div className="mt-4">
                <Button variant="secondary" icon="award" className="w-full sm:w-auto justify-center" onClick={() => setCheckout({ plan: 'pro', interval })}>{t('Přejít na Pro')}</Button>
              </div>
            )}
          </div>
        )}
        {plan?.pastDue && (
          <p className="note note-danger mt-4">{t('Poslední platba se nezdařila. Stripe ji zkusí znovu — zkontrolujte kartu přes „Spravovat předplatné“.')}</p>
        )}
        {plan?.trialing && (
          <p className="note note-ok mt-4">
            {st?.subscription
              ? <VetaSTucnym tucne={zaDny(plan.trialDaysLeft)} veta={m => t('Zkušební období končí {tucne} — potom se z karty strhne první platba.', { tucne: m })} />
              : <VetaSTucnym tucne={zaDny(plan.trialDaysLeft)} veta={m => t('Zkušební období končí {tucne} — potom se podnik přepne na plán Zdarma, o data nepřijdete.', { tucne: m })} />}
          </p>
        )}
        {plan?.cancelAt && (
          <p className="note note-wait mt-4">{t('Předplatné je zrušené a skončí {datum}. Do té doby vše funguje; obnovit ho jde v portálu.', { datum: date(plan.cancelAt) })}</p>
        )}
        {active && st?.subscription && !plan?.cancelAt && (
          <p className="t-meta mt-4">
            {st.subscription.interval === 'year'
              ? (plan?.trialing ? t('Roční platba · další první platba {datum}.', { datum: date(st.subscription.currentPeriodEnd) }) : t('Roční platba · další platba {datum}.', { datum: date(st.subscription.currentPeriodEnd) }))
              : (plan?.trialing ? t('Měsíční platba · další první platba {datum}.', { datum: date(st.subscription.currentPeriodEnd) }) : t('Měsíční platba · další platba {datum}.', { datum: date(st.subscription.currentPeriodEnd) }))}
          </p>
        )}
        {active && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" icon="card" onClick={() => go('/api/billing/portal')} loading={busy === '/api/billing/portal'}>{t('Spravovat předplatné')}</Button>
            <span className="self-center t-meta">{t('karta, faktury, změna tarifu, zrušení')}</span>
          </div>
        )}
        {plan?.effective === 'free' && !plan.trialing && (
          <p className="mt-4 text-sm text-black/60 well px-4 py-3">
            <VetaSTucnym className="text-[#16181A]" tucne={t('Zdarma platí napořád')} veta={m => t('Plán {tucne} — směny, uzávěrky, úkoly, chat i sklad bez omezení času, až 3 lidé v týmu.', { tucne: m })} />
          </p>
        )}
      </div>

      {/* Nabídka Max po koupi Pro */}
      {nabidkaMax && (
        <div className="card card-info p-6">
          {/* Štítek nad nadpisem ne (DP §3.3) — doba nabídky jde do chipu vedle. */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="t-section">{t('Max se slevou {pct} % na první platbu', { pct: MAX_OFFER_PCT })}</h3>
              <p className="t-meta mt-1">{t('Nabídka platí ještě {dny}.', { dny: dny(offerLeft) })}</p>
            </div>
            <span className="chip chip-info tabular-nums">{t('{nova} místo {stara}', { nova: interval === 'year' ? czk(Math.round(PRICES.max.year * (1 - MAX_OFFER_PCT / 100))) : czk(Math.round(PRICES.max.month * (1 - MAX_OFFER_PCT / 100))), stara: interval === 'year' ? czk(PRICES.max.year) : czk(PRICES.max.month) })}</span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {MAX_EXTRAS.map(x => <li key={x} className="text-sm text-[#16181A] flex items-center gap-2"><Icon name="check" size={15} className="text-[#0A5CC0] shrink-0" />{t(x)}</li>)}
          </ul>
          <div className="mt-4">
            <Button variant="accent" onClick={() => go('/api/billing/upgrade')} loading={busy === '/api/billing/upgrade'}>{t('Přejít na Max se slevou')}</Button>
          </div>
        </div>
      )}

      {/* Tarify */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="t-section">{t('Tarify')}</h3>
          <Segmented size="sm" ariaLabel={t('Období')} value={interval} onChange={v => setInterval_(v as Interval)}
            options={[{ id: 'month', label: t('Měsíčně') }, { id: 'year', label: t('Ročně · výhodněji') }]} />
        </div>
        {/* Až od lg: v Nastavení je od md boční pás sekcí a obsah je na 768 px široký jako na telefonu — dvě karty vedle sebe by tlačítko „Vyzkoušet" vytlačily z karty. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{priceCard('pro')}{priceCard('max')}</div>
      </div>

      {/* Affiliate */}
      <div className="card p-6">
        <h3 className="t-card">{t('Doporučte Managero a získejte měsíc zdarma')}</h3>
        <p className="t-meta mt-1">
          {t('Když se přes váš odkaz zaregistruje podnik a začne platit, odečteme vám cenu jednoho měsíce z další faktury.')}{' '}
          {t('Nejvýš {n, plural, one {# podnik} few {# podniky} other {# podniků}} za měsíc, napořád.', { n: REFERRALS_PER_MONTH })}
        </p>
        {st?.referral.link ? (
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <input readOnly value={st.referral.link} className="field font-mono text-sm" onFocus={e => e.currentTarget.select()} />
            <Button variant="primary" icon="copy" onClick={copy}>{copied ? t('Zkopírováno') : t('Kopírovat odkaz')}</Button>
          </div>
        ) : <p className="mt-3 t-meta">{t('Odkaz se připravuje…')}</p>}
        {st && (
          <p className="mt-3 text-[13px] text-black/55">
            {t('Tento měsíc {a} / {b} · celkem {mesice} zdarma · přes váš odkaz se zaregistrovalo {c}', { a: st.referral.thisMonth, b: st.referral.limit, mesice: t('{n, plural, one {# měsíc} few {# měsíce} other {# měsíců}}', { n: st.referral.total }), c: st.referral.referredCount })}
          </p>
        )}
      </div>

      {/* Srovnání */}
      <div className="card p-6">
        <h3 className="t-card mb-4">{t('Co je v jakém plánu')}</h3>
        {/* Telefon: funkce pod sebou a pod každou tři úzké sloupce Zdarma / Pro / Max (vzor
            Stripe pricing table). Dřív tabulka s min-w 520 px v posuvném obalu — Pro a Max
            byly na 390 px mimo kartu a tabulkou se muselo tahat do strany. */}
        <ul className="list lg:hidden" aria-label={t('Co je v jakém plánu')}>
          {PLAN_FEATURES.map(f => (
            <li key={f.label} className="py-3">
              <p className="text-sm font-medium text-[#16181A] text-pretty">{t(f.label)}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(['free', 'pro', 'max'] as const).map(p => (
                  <div key={p} className="min-w-0">
                    <p className="t-label">{nazevTarifu(p)}</p>
                    <div className="mt-1 min-h-[1.25rem] flex items-center text-sm text-black/70"><Cell v={f[p]} chip /></div>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {/* Od lg tabulka s pevnými sloupci: první půlka pro název funkce (zalamuje se), zbytek tarifům (na 768 px má obsah Nastavení jen ~360 px). */}
        <table className="hidden lg:table w-full text-sm table-fixed">
          <thead>
            <tr className="text-left t-label">
              <th className="py-2 pr-3 w-1/2">{t('Funkce')}</th>
              <th className="py-2 px-3">{t('Zdarma')}</th>
              <th className="py-2 px-3">Pro</th>
              <th className="py-2 pl-3">Max</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.06]">
            {PLAN_FEATURES.map(f => (
              <tr key={f.label} className="align-top">
                <td className="py-2.5 pr-3 text-[#16181A] text-pretty">{t(f.label)}</td>
                <td className="py-2.5 px-3 text-black/55 text-pretty"><Cell v={f.free} /></td>
                <td className="py-2.5 px-3 text-black/70 text-pretty"><Cell v={f.pro} /></td>
                <td className="py-2.5 pl-3 text-black/70 text-pretty"><Cell v={f.max} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 t-meta">{t('Ceny jsou konečné, provozovatel není plátcem DPH. Fakturu vystaví Stripe a najdete ji v portálu.')}</p>
      </div>
    </div>
  );
}
