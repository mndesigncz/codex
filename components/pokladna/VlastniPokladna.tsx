'use client';

// Vlastní pokladna v designu Manageru (Stripe Checkout Sessions, ui_mode 'elements').
//
// Stripe kreslí jen platební pole (Payment Element: karta, Apple Pay / Google Pay,
// Klarna… podle toho, co účet Stripe nabízí) — karta nikdy neprojde naším kódem.
// Všechno ostatní je naše: e-mail účtu (jen ke čtení, zákazník Stripe už existuje),
// povinné IČO, DIČ pro plátce DPH, slevový kód, shrnutí „dnes / první platba“,
// souhlas s obchodními podmínkami, chybové hlášky a stav načítání.
//
// Platba: naše kontrola (IČO s kontrolním součtem, souhlas) → DIČ do relace
// (updateTaxIdInfo) → server zapíše IČO a souhlas do relace a na faktury
// (PATCH /api/billing/checkout uvnitř runServerUpdate) → confirm. 3D Secure řeší
// Stripe v okně, přesměruje se jen u metod, které to potřebují (return_url =
// ?billing=success). Proč IČO a souhlas nejdou přes Stripe: lib/pokladnaRezim.ts.
//
// Tlačítko „Zaplatit / Začít zkušební dobu“ je v patičce okna (CheckoutModal), ať je
// na telefonu vždycky po ruce; volá `zaplatit()` přes ref a stav dostává přes `onStav`.

import Link from 'next/link';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Stripe, StripeCheckoutElementsSdk, StripeCheckoutLoadActionsSuccess, StripeCheckoutSession } from '@stripe/stripe-js';
import { Icon } from '../Icons';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { useJazyk, useT } from '@/lib/i18n/client';
import { tg } from '@/lib/i18n/stav';
import { fmtDatum } from '@/lib/i18n/format';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';
import { formatMoney } from '@/lib/money';
import { platneIco } from '@/lib/icoPokladna';
import { cestaDokumentu } from '@/lib/pravni/odkazy';
import { vzhledPokladny, pismaPokladny } from '@/lib/pokladnaVzhled';
import { useTheme } from '../ThemeProvider';

export type DataPokladny = { clientSecret: string; ico: string | null; firma: string; souhlas: boolean; trial: boolean };
export type StavPaticky = { pripraveno: boolean; placeni: boolean; text: string };
export type PokladnaHandle = { zaplatit: () => void };

/** DIČ s předponou státu (CZ12345678, SK1234567890, DE123456789…); přesný tvar ověří Stripe. */
const DIC = /^[A-Z]{2}[0-9A-Z]{2,13}$/;

const VlastniPokladna = forwardRef<PokladnaHandle, {
  stripe: Stripe;
  data: DataPokladny;
  onStav: (s: StavPaticky) => void;
  onHotovo: () => void;
  /** Pokladnu nejde načíst (relace vypršela, Stripe nedostupný): okno ukáže chybu. */
  onChybaNacteni: (zprava: string) => void;
}>(function VlastniPokladna({ stripe, data, onStav, onHotovo, onChybaNacteni }, ref) {
  const t = useT('predplatne');
  const { jazyk } = useJazyk();
  const { theme } = useTheme();
  const tRef = useRef(t); tRef.current = t;
  const platbaRef = useRef<HTMLDivElement>(null);
  const icoRef = useRef<HTMLInputElement>(null);
  const souhlasRef = useRef<HTMLInputElement>(null);
  const sdk = useRef<StripeCheckoutElementsSdk | null>(null);
  const akce = useRef<StripeCheckoutLoadActionsSuccess | null>(null);
  const [session, setSession] = useState<StripeCheckoutSession | null>(null);
  const [polePripravena, setPolePripravena] = useState(false);
  const [ico, setIco] = useState(data.ico ?? '');
  const [chybaIco, setChybaIco] = useState('');
  const [dicOtevrene, setDicOtevrene] = useState(false);
  const [dic, setDic] = useState('');
  const [firma, setFirma] = useState(data.firma);
  const [chybaDic, setChybaDic] = useState('');
  const [kodOtevreny, setKodOtevreny] = useState(false);
  const [kod, setKod] = useState('');
  const [chybaKodu, setChybaKodu] = useState('');
  const [kodBezi, setKodBezi] = useState(false);
  const [souhlas, setSouhlas] = useState(false);
  const [chybaSouhlasu, setChybaSouhlasu] = useState('');
  const [chyba, setChyba] = useState('');
  const [placeni, setPlaceni] = useState(false);
  const chybyRef = useRef<HTMLParagraphElement>(null);

  // Pokladna Stripe: jedna relace na otevření okna. Vzhled a písmo z našich tokenů.
  useEffect(() => {
    let ziva = true;
    const c = stripe.initCheckoutElementsSdk({
      clientSecret: data.clientSecret,
      elementsOptions: { appearance: vzhledPokladny(theme), fonts: pismaPokladny(window.location.origin), loader: 'never' },
    });
    sdk.current = c;
    c.on('change', s => { if (ziva) setSession(s); });
    const pe = c.createPaymentElement({ layout: { type: 'accordion', defaultCollapsed: false, spacedAccordionItems: true, radios: 'if_multiple' } });
    pe.on('ready', () => { if (ziva) setPolePripravena(true); });
    pe.on('loaderror', () => { if (ziva) onChybaNacteni(tRef.current('Platební pole se nepodařilo načíst. Zkuste to znovu.')); });
    if (platbaRef.current) pe.mount(platbaRef.current);
    c.loadActions().then(r => {
      if (!ziva) return;
      if (r.type === 'error') { onChybaNacteni(tRef.current('Pokladnu se nepodařilo otevřít.')); return; }
      akce.current = r.actions;
      setSession(r.actions.getSession());
    }, () => { if (ziva) onChybaNacteni(tRef.current('Pokladnu se nepodařilo otevřít.')); });
    return () => {
      ziva = false;
      try { pe.destroy(); } catch { /* už odpojené */ }
      sdk.current = null; akce.current = null;
    };
    // Motiv se mění přes changeAppearance níž, ne novou relací.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe, data.clientSecret]);

  useEffect(() => { sdk.current?.changeAppearance(vzhledPokladny(theme)); }, [theme]);

  // Částky ze Stripe (po slevě, po zkušební době) v našem formátu peněz. Stripe chce, aby
  // pokladna celkovou částku ukazovala (confirm jinak selže), a ta se čte právě tady.
  const penize = (minor: number | undefined) => {
    if (!session || minor == null) return '';
    const delitel = session.minorUnitsAmountDivisor || 100;
    return formatMoney(minor / delitel, session.currency.toUpperCase(), LOCALE_PRO_JAZYK[jazyk], minor % delitel ? 2 : 0);
  };
  const dnes = penize(session?.total.total.minorUnitsAmount);
  const trial = session?.recurring?.trial ?? null;
  const dalsi = penize(session?.recurring?.dueNext.total.minorUnitsAmount);
  const datumPrvni = trial ? fmtDatum(new Date(trial.trialEnd * 1000), { jazyk, styl: 'dlouze' }) : '';
  const rocne = session?.recurring?.interval === 'year';
  const sleva = session?.discountAmounts?.[0] ?? null;
  const pripraveno = !!session && polePripravena && !!akce.current;
  const textTlacitka = trial ? t('Začít zkušební dobu') : dnes ? t('Zaplatit {castka}', { castka: dnes }) : t('Zaplatit');

  useEffect(() => { onStav({ pripraveno, placeni, text: textTlacitka }); }, [pripraveno, placeni, textTlacitka, onStav]);

  const pouzijKod = async () => {
    const a = akce.current; const k = kod.trim();
    if (!a) return;
    if (!k) { setChybaKodu(t('Zadejte slevový kód.')); return; }
    setKodBezi(true); setChybaKodu('');
    try {
      const r = await a.applyPromotionCode(k);
      if (r.type === 'error') setChybaKodu(r.error.code === 'invalidCode' ? t('Tenhle slevový kód neplatí nebo už vypršel.') : t('Slevový kód se nepodařilo použít.'));
      else { setKod(''); setKodOtevreny(false); }
    } catch { setChybaKodu(t('Slevový kód se nepodařilo použít.')); }
    finally { setKodBezi(false); }
  };
  const odeberKod = async () => {
    const a = akce.current; if (!a) return;
    setKodBezi(true);
    try { await a.removePromotionCode(); } catch { /* sleva zůstane, jde zkusit znovu */ }
    finally { setKodBezi(false); }
  };

  const zaplatit = async () => {
    const a = akce.current;
    if (!a || !session || placeni) return;
    setChyba('');
    const cisteIco = platneIco(ico);
    const cisteDic = dic.replace(/[\s-]+/g, '').toUpperCase();
    let prvniChyba: HTMLElement | null = null;
    if (!cisteIco) {
      setChybaIco(ico.trim() ? t('IČO nesedí: má 8 číslic a platný kontrolní součet.') : t('Vyplňte IČO podniku. Předplatné objednává podnik.'));
      prvniChyba ??= icoRef.current;
    } else setChybaIco('');
    if (dicOtevrene && cisteDic && !DIC.test(cisteDic)) { setChybaDic(t('DIČ zadejte i s předponou státu, třeba CZ12345678.')); }
    else setChybaDic('');
    if (data.souhlas && !souhlas) {
      setChybaSouhlasu(t('Bez souhlasu s obchodními podmínkami předplatné objednat nejde.'));
      prvniChyba ??= souhlasRef.current;
    } else setChybaSouhlasu('');
    if (!cisteIco || (dicOtevrene && cisteDic && !DIC.test(cisteDic)) || (data.souhlas && !souhlas)) { prvniChyba?.focus(); return; }

    setPlaceni(true);
    try {
      // DIČ (nepovinné) jde na fakturu přes Stripe: tax_id_collection relace + jméno firmy.
      if (dicOtevrene && cisteDic) {
        const r = await a.updateTaxIdInfo({ taxId: { type: 'eu_vat', value: cisteDic }, businessName: (firma.trim() || data.firma).slice(0, 150) });
        if (r.type === 'error') { setChybaDic(r.error.code === 'invalidTaxId' ? t('DIČ nemá správný tvar, třeba CZ12345678.') : r.error.message); return; }
      }
      // IČO a souhlas zapíše server do relace a na faktury (karta tudy nejde).
      let chybaServeru = '';
      const sr = await a.runServerUpdate(async () => {
        const res = await fetch('/api/billing/checkout', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, ico: cisteIco, souhlas: data.souhlas ? souhlas : false }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          chybaServeru = d?.error ? tg(d.error) : t('Platbu se nepodařilo připravit. Zkuste to znovu.');
          throw new Error(chybaServeru);
        }
      });
      if (chybaServeru) { setChyba(chybaServeru); return; }
      if (sr.type === 'error') { setChyba(t('Platbu se nepodařilo připravit. Zkuste to znovu.')); return; }
      // 3D Secure ukáže Stripe přímo v okně; přesměruje jen metoda, která to potřebuje.
      const r = await a.confirm({ redirect: 'if_required' });
      if (r.type === 'error') {
        setChyba(r.error.code === 'paymentFailed'
          ? t('Platba neprošla: {duvod}', { duvod: r.error.message })
          : (r.error.message || t('Zkontrolujte platební údaje.')));
        return;
      }
      onHotovo();
    } catch {
      setChyba(t('Platbu se nepodařilo dokončit. Zkuste to znovu.'));
    } finally {
      setPlaceni(false);
    }
  };
  useImperativeHandle(ref, () => ({ zaplatit: () => { void zaplatit(); } }));

  // Chyba platby se má přečíst a být vidět, i když je okno odscrollované nahoru.
  useEffect(() => { if (chyba) chybyRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [chyba]);

  const odkazPodminek = cestaDokumentu('obchodni-podminky', jazyk === 'cs' ? 'cs' : 'en');

  return (
    <div className="relative" data-vlastni-pokladna aria-busy={!pripraveno || undefined}>
      {!pripraveno && (
        <div className="absolute inset-0 z-10 min-h-[420px] rounded-2xl well flex flex-col items-center justify-center gap-3">
          <div className="spinner" />
          <p className="text-sm text-black/45">{t('Připravujeme bezpečnou platbu…')}</p>
        </div>
      )}
      <div className={`grid gap-6 ${pripraveno ? '' : 'invisible'}`}>
        {/* Účet: e-mail ze zákazníka Stripe — faktury chodí sem, v pokladně se nemění. */}
        {session?.email && (
          <div className="flex items-center gap-3 min-w-0">
            <span className="btn-icon pointer-events-none" aria-hidden><Icon name="mail" size={15} /></span>
            <div className="min-w-0">
              <p className="t-label">{t('Faktury a potvrzení na e-mail')}</p>
              <p className="text-sm font-medium text-[#16181A] truncate" data-email-pokladny>{session.email}</p>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          <h4 className="t-card">{t('Platební údaje')}</h4>
          <div ref={platbaRef} className="min-h-[220px]" data-platebni-pole />
        </div>

        <div className="grid gap-4">
          <h4 className="t-card">{t('Fakturační údaje')}</h4>
          <Field id="pokladna-ico" label={t('IČO podniku')} error={chybaIco || undefined}
            hint={!chybaIco ? t('Předplatné objednává podnik. IČO bude na faktuře.') : undefined}>
            <Input id="pokladna-ico" ref={icoRef} inputMode="numeric" autoComplete="off" maxLength={11} value={ico}
              aria-invalid={chybaIco ? true : undefined}
              onChange={e => { setIco(e.target.value); if (chybaIco) setChybaIco(''); }}
              onBlur={() => { if (ico.trim() && !platneIco(ico)) setChybaIco(t('IČO nesedí: má 8 číslic a platný kontrolní součet.')); }} />
          </Field>
          {!dicOtevrene ? (
            <Button variant="ghost" size="sm" icon="plus" className="justify-self-start -ml-3" onClick={() => setDicOtevrene(true)}>{t('Jsem plátce DPH, přidat DIČ')}</Button>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="pokladna-dic" label={t('DIČ')} error={chybaDic || undefined}>
                <Input id="pokladna-dic" autoComplete="off" placeholder="CZ12345678" value={dic}
                  onChange={e => { setDic(e.target.value); if (chybaDic) setChybaDic(''); }} />
              </Field>
              <Field id="pokladna-firma" label={t('Název firmy na faktuře')}>
                <Input id="pokladna-firma" autoComplete="organization" value={firma} onChange={e => setFirma(e.target.value)} />
              </Field>
            </div>
          )}
        </div>

        {/* Slevový kód: kód ověří Stripe (applyPromotionCode), chyba je naše. */}
        <div className="grid gap-3">
          {sleva ? (
            <div className="flex items-center justify-between gap-3 min-w-0">
              <p className="text-sm text-[#16181A] min-w-0 truncate">
                <Icon name="check" size={14} className="inline -mt-0.5 mr-1.5 text-[#5B7A08]" />
                {t('Slevový kód {kod} je použitý', { kod: sleva.promotionCode || sleva.displayName })}
              </p>
              <Button variant="ghost" size="sm" onClick={odeberKod} loading={kodBezi}>{t('Odebrat')}</Button>
            </div>
          ) : !kodOtevreny ? (
            <Button variant="ghost" size="sm" icon="plus" className="justify-self-start -ml-3" onClick={() => setKodOtevreny(true)}>{t('Mám slevový kód')}</Button>
          ) : (
            <Field id="pokladna-kod" label={t('Slevový kód')} error={chybaKodu || undefined}>
              <div className="flex gap-2">
                <Input id="pokladna-kod" autoComplete="off" autoCapitalize="characters" value={kod} className="min-w-0 flex-1"
                  onChange={e => { setKod(e.target.value); if (chybaKodu) setChybaKodu(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void pouzijKod(); } }} />
                <Button variant="secondary" size="lg" className="shrink-0" onClick={pouzijKod} loading={kodBezi}>{t('Použít')}</Button>
              </div>
            </Field>
          )}
        </div>

        {/* Shrnutí platby: částky a datum první platby ze Stripe (po slevě, podle zkušební doby). */}
        <dl className="grid gap-2 rounded-2xl well px-4 py-3 text-sm" data-shrnuti-platby>
          {sleva && (
            <div className="flex justify-between gap-3">
              <dt className="text-black/60">{t('Sleva')}</dt>
              <dd className="tabular-nums text-[#16181A]">−{penize(sleva.minorUnitsAmount)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="font-semibold text-[#16181A]">{t('Dnes zaplatíte')}</dt>
            <dd className="font-semibold tabular-nums text-[#16181A]" data-dnes>{dnes}</dd>
          </div>
          {trial ? (
            <div className="flex justify-between gap-3">
              <dt className="text-black/60">{t('První platba {datum}', { datum: datumPrvni })}</dt>
              <dd className="tabular-nums text-[#16181A]" data-prvni-platba>{dalsi}</dd>
            </div>
          ) : session?.recurring ? (
            <div className="flex justify-between gap-3">
              <dt className="text-black/60">{rocne ? t('Pak každý rok') : t('Pak každý měsíc')}</dt>
              <dd className="tabular-nums text-[#16181A]">{dalsi}</dd>
            </div>
          ) : null}
        </dl>

        {data.souhlas && (
          <div className="grid gap-1">
            <label htmlFor="pokladna-souhlas" className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5 text-sm text-black/75">
              <input id="pokladna-souhlas" ref={souhlasRef} type="checkbox" checked={souhlas}
                onChange={e => { setSouhlas(e.target.checked); if (e.target.checked) setChybaSouhlasu(''); }}
                aria-invalid={chybaSouhlasu ? true : undefined} aria-describedby={chybaSouhlasu ? 'pokladna-souhlas-chyba' : undefined}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#16181A]" />
              <span className="text-pretty">{t('Souhlasím s obchodními podmínkami a s tím, že se předplatné obnovuje automaticky, dokud ho nezruším.')}</span>
            </label>
            <p className="pl-8 text-xs text-black/55">
              <Link href={odkazPodminek} target="_blank" rel="noopener noreferrer" className="tap-target-sm inline-flex items-center font-medium underline underline-offset-2">{t('Obchodní podmínky')}</Link>
            </p>
            {chybaSouhlasu && <p id="pokladna-souhlas-chyba" role="alert" className="note note-danger px-3 py-2 text-sm">{chybaSouhlasu}</p>}
          </div>
        )}

        {chyba && <p ref={chybyRef} role="alert" className="note note-danger" data-chyba-platby>{chyba}</p>}

        <p className="flex items-start gap-2 text-xs text-black/50">
          <Icon name="lock" size={13} className="shrink-0 mt-px" />
          <span>{t('Platbu zpracovává Stripe. Údaje karty nikdy neprojdou serverem Managero.')}</span>
        </p>
      </div>
    </div>
  );
});

export default VlastniPokladna;
