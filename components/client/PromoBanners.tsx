'use client';

// Promo bannery podniku nahoře na stránce pro hosta: karusel akcí a oznámení.
// Obsah banneru (nadpis, text, obrázek) je data podniku a nepřekládá se, obal
// (tlačítka, popisky) ano. Přístupnost: oblast s popiskem, tlačítka předchozí
// a další, tečky, tlačítko pozastavit; automatické otáčení je jen u hosta bez
// „méně pohybu“, zastaví se při najetí, zaostření i na pokyn. Vidí se vždy
// jeden banner (ostatní jsou skryté), takže stránka nikdy nescrolluje do strany.
// Barvy z palety Managera: banner bez fotky je bílá karta s linkou, tlačítko inkoustové (na fotce
// bílé), vybraná tečka inkoustem. Barva značky podniku sem nepatří (jen dlaždice loga).

import { useEffect, useState } from 'react';
import { Icon } from '../Icons';
import { useT } from '@/lib/i18n/client';
import { httpsOdkaz } from '@/lib/bannery';

export interface PromoBanner {
  id: number; title: string; text: string; imageUrl: string | null; linkKind: string; linkRef: string | null;
}

const DOBA_MS = 7000;

/**
 * Statistika bez osobních údajů: banner se počítá jako zobrazený, když se ukáže, nejvýš jednou za
 * návštěvu stránky (sessionStorage; bez něj jednou za načtení komponenty). Náhled v editoru
 * (bez `slug`) nic neposílá. Výpadek sítě nic nerozbije: statistika není důležitější než stránka.
 */
function posliUdalost(slug: string | undefined, id: number, type: 'view' | 'click') {
  if (!slug || id < 1) return;
  try {
    fetch(`/api/client/b/${encodeURIComponent(slug)}/banner-event`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, type }), keepalive: true,
    }).catch(() => {});
  } catch { /* bez statistiky se dá žít */ }
}
const videno = new Set<string>();
function jednouZobrazen(slug: string | undefined, id: number) {
  if (!slug) return;
  const klic = `banner-view:${slug}:${id}`;
  if (videno.has(klic)) return;
  videno.add(klic);
  try {
    if (window.sessionStorage.getItem(klic)) return;
    window.sessionStorage.setItem(klic, '1');
  } catch { /* soukromé okno: stačí paměť stránky */ }
  posliUdalost(slug, id, 'view');
}

export default function PromoBanners({ banners, loyaltyOn, onGoTab, slug }: {
  banners: PromoBanner[]; loyaltyOn: boolean; onGoTab: (tab: 'menu' | 'loyalty') => void;
  /** Slug podniku zapíná statistiku zobrazení a prokliků; bez něj (náhled v editoru) se nic neposílá. */
  slug?: string;
}) {
  const t = useT('klient-host');
  const [i, setI] = useState(0);
  const [pauza, setPauza] = useState(false);   // pokyn hosta
  const [najeto, setNajeto] = useState(false); // myš nebo zaostření uvnitř
  const [mene, setMene] = useState(true);      // dokud nevíme, nehýbeme
  const n = banners.length;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const zjisti = () => setMene(mq.matches);
    zjisti();
    mq.addEventListener?.('change', zjisti);
    return () => mq.removeEventListener?.('change', zjisti);
  }, []);
  // Zmizel-li banner (obnova dat), index nesmí ukazovat do prázdna.
  useEffect(() => { if (i >= n) setI(0); }, [i, n]);
  useEffect(() => {
    if (n < 2 || mene || pauza || najeto) return;
    const h = setTimeout(() => setI(x => (x + 1) % n), DOBA_MS);
    return () => clearTimeout(h);
  }, [i, n, mene, pauza, najeto]);

  const idx = Math.min(i, Math.max(0, n - 1));
  const idAktualniho = banners[idx]?.id ?? 0;
  useEffect(() => { jednouZobrazen(slug, idAktualniho); }, [slug, idAktualniho]);

  if (n === 0) return null;
  const go = (d: number) => setI(x => (x + d + n) % n);

  return (
    <section aria-roledescription={t('karusel')} aria-label={t('Oznámení podniku')} className="relative"
      onMouseEnter={() => setNajeto(true)} onMouseLeave={() => setNajeto(false)}
      onFocus={() => setNajeto(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setNajeto(false); }}>
      {banners.map((b, k) => (
        <div key={b.id} role="group" aria-roledescription={t('snímek')} aria-label={t('Oznámení {n} z {total}', { n: k + 1, total: n })}
          hidden={k !== idx} data-banner={b.id}>
          <Slide b={b} loyaltyOn={loyaltyOn} onGoTab={onGoTab} onClick={() => posliUdalost(slug, b.id, 'click')} />
        </div>
      ))}
      {n > 1 && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => go(-1)} aria-label={t('Předchozí oznámení')} className="tap-target-sm h-9 w-9 grid place-items-center rounded-full hover:bg-black/[0.06]">
              <Icon name="arrowLeft" size={16} />
            </button>
            <button type="button" onClick={() => go(1)} aria-label={t('Další oznámení')} className="tap-target-sm h-9 w-9 grid place-items-center rounded-full hover:bg-black/[0.06]">
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
          <div className="flex items-center gap-1.5" role="group" aria-label={t('Výběr oznámení')}>
            {banners.map((b, k) => (
              <button key={b.id} type="button" onClick={() => setI(k)} aria-label={t('Oznámení {n} z {total}', { n: k + 1, total: n })} aria-current={k === idx ? 'true' : undefined}
                className="tap-target-sm h-6 w-6 grid place-items-center rounded-full">
                <span className={`block h-2 rounded-full transition-[width] ${k === idx ? 'w-5 h-tecka-on' : 'w-2 bg-black/20'}`} />
              </button>
            ))}
          </div>
          {!mene ? (
            <button type="button" onClick={() => setPauza(p => !p)} aria-pressed={pauza} className="tap-target-sm text-[13px] font-semibold text-black/60 hover:text-black px-2 py-1 rounded-full">
              {pauza ? t('Přehrávat') : t('Pozastavit')}
            </button>
          ) : <span className="w-9" aria-hidden />}
        </div>
      )}
    </section>
  );
}

function Slide({ b, loyaltyOn, onGoTab, onClick }: { b: PromoBanner; loyaltyOn: boolean; onGoTab: (tab: 'menu' | 'loyalty') => void; onClick?: () => void }) {
  const t = useT('klient-host');
  const foto = !!b.imageUrl;
  const url = b.linkKind === 'url' ? httpsOdkaz(b.linkRef) : null;
  const veVernosti = b.linkKind === 'coupon' || b.linkKind === 'campaign';
  const vnitrni = b.linkKind === 'menu' || b.linkKind === 'event' || (veVernosti && loyaltyOn);
  const popisek = b.linkKind === 'menu' ? t('Otevřít nabídku') : b.linkKind === 'coupon' ? (b.linkRef ? t('Ukázat kupon') : t('Ukázat kupony'))
    : b.linkKind === 'campaign' ? t('Ukázat razítkovou kartu') : b.linkKind === 'event' ? t('Zobrazit akce') : t('Zjistit více');
  const otevri = () => {
    onClick?.();
    if (veVernosti) onGoTab('loyalty');
    else onGoTab('menu');
    // Cíl na stránce (kupon, razítková karta, akce) se dohledá až po přepnutí záložky; chybí-li, zůstane se nahoře.
    const cil = b.linkKind === 'event' ? 'h-events' : b.linkKind === 'coupon' && b.linkRef ? `kupon-${b.linkRef}` : b.linkKind === 'campaign' && b.linkRef ? `karta-${b.linkRef}` : null;
    if (cil) setTimeout(() => document.getElementById(cil)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  };
  // Tlačítko banneru je druhá důležitá akce stránky (limetka patří „Stát se členem“): inkoustové, na fotce bílé.
  const cta = `tap-target btn btn-sm !gap-1.5 ${foto ? 'h-cta-foto' : 'btn-primary'}`;
  return (
    <div className={`relative overflow-hidden ${foto ? 'rounded-3xl bg-[#16181A] text-white' : 'card'}`}>
      {foto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.imageUrl!} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {foto && <div className="absolute inset-0 bg-gradient-to-t from-[#16181A]/90 via-[#16181A]/50 to-[#16181A]/10" aria-hidden />}
      <div className={`relative p-5 sm:p-6 flex flex-col gap-2 ${foto ? 'min-h-[11rem] sm:min-h-[13rem] justify-end' : 'min-h-[7rem]'}`}>
        <h2 className="text-xl sm:text-2xl font-bold tracking-[-0.02em] leading-tight text-balance break-words">{b.title}</h2>
        {b.text && <p className={`text-sm sm:text-base leading-snug text-pretty break-words max-w-[60ch] ${foto ? 'text-white/85' : 'text-black/70'}`}>{b.text}</p>}
        {(url || vnitrni) && (
          <div className="mt-1">
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer nofollow" onClick={onClick} className={cta}>
                {popisek}<Icon name="external" size={14} />
              </a>
            ) : (
              <button type="button" onClick={otevri} className={cta}>
                {popisek}<Icon name="chevronRight" size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
