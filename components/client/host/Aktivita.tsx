'use client';

// Aktivita (audit C §6, 7): jedno místo pro to, co podniky hostovi poslaly a co se mu stalo —
// +razítko a body u kasy, připravená a uplatněná odměna, potvrzení a změny rezervací, stav
// objednávky, novinky (jen od podniků se souhlasem), odpovědi na hodnocení a „Jak to bylo?“.
// Dřív to bylo rozházené: novinky v bočním sloupci stránky podniku, historie dvakrát, odpovědi
// a hodnocení na Moje. Filtr podle podniku čipy; otevření schránky vynuluje odznak v doku.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../Icons';
import { Skeleton, EmptyState, ErrorState } from '../../ui';
import { LogoPodniku } from '../karta/KartaPodniku';
import { useCesta } from './cesty';
import { useHostShell } from '../ClientShell';
import { obnovHosta } from './data';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { okJson } from '@/lib/api';
import { RES_STATUS } from '@/lib/clientSlots';
import { pragueToday, pragueDaySafe, pragueHM, dayPlus } from '@/lib/pragueTime';

interface Polozka {
  id: string; typ: string; at: string; slug: string; podnik: string; accent: string | null;
  delta?: number; zustatek?: number; karta?: { nazev: string; razitka?: number; cil: number }; nazev?: string;
  stav?: string; date?: string; time?: string; party?: number; odkaz?: { rezervace?: number };
  titul?: string; text?: string | null; hodnoceni?: number; poznamka?: string | null; ref?: string; kind?: string;
}

export default function Aktivita() {
  const t = useT('klient-host');
  const { setNeprecteno } = useHostShell();
  const [d, setD] = useState<{ polozky: Polozka[]; videno: string | null } | null>(null);
  const [chyba, setChyba] = useState('');
  const [filtr, setFiltr] = useState<string>('');
  const nacti = () => {
    setChyba('');
    fetch('/api/client/me/aktivita', { cache: 'no-store' }).then(okJson).then(x => {
      setD({ polozky: Array.isArray(x?.polozky) ? x.polozky : [], videno: x?.videno ?? null });
      // Schránka je otevřená: odznak pryč (zvýraznění nových zůstane, dokud host neodejde).
      fetch('/api/client/me/aktivita', { method: 'POST' }).then(() => setNeprecteno(0)).catch(() => {});
    }).catch(() => setChyba(t('Aktivita se nenačetla. Zkontroluj připojení.')));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(nacti, []);
  const podniky = useMemo(() => {
    const m = new Map<string, Polozka>();
    for (const p of d?.polozky ?? []) if (!m.has(p.slug)) m.set(p.slug, p);
    return Array.from(m.values());
  }, [d]);
  const vybrane = (d?.polozky ?? []).filter(p => !filtr || p.slug === filtr);
  const dnes = pragueToday();
  const skupiny: { nazev: string; polozky: Polozka[] }[] = [
    { nazev: t('Dnes'), polozky: vybrane.filter(p => pragueDaySafe(p.at) === dnes) },
    { nazev: t('Tento týden'), polozky: vybrane.filter(p => { const den = pragueDaySafe(p.at) ?? ''; return den < dnes && den > dayPlus(dnes, -7); }) },
    { nazev: t('Dříve'), polozky: vybrane.filter(p => (pragueDaySafe(p.at) ?? '') <= dayPlus(dnes, -7)) },
  ].filter(s => s.polozky.length);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="t-page">{t('Aktivita')}</h1>
      {podniky.length > 1 && (
        <div className="mt-4 -mx-4 min-[360px]:-mx-5 sm:mx-0 px-4 min-[360px]:px-5 sm:px-0 flex gap-2 overflow-x-auto scroll-fade-x pb-1" role="radiogroup" aria-label={t('Podnik')}>
          <button type="button" role="radio" aria-checked={!filtr} onClick={() => setFiltr('')} className="h-cip shrink-0 tap-target-sm">{t('Všechno')}</button>
          {podniky.map(p => (
            <button key={p.slug} type="button" role="radio" aria-checked={filtr === p.slug} onClick={() => setFiltr(p.slug)} className="h-cip shrink-0 tap-target-sm">{p.podnik}</button>
          ))}
        </div>
      )}
      <div className="mt-5">
        {chyba && !d ? <ErrorState title={t('Aktivita se nenačetla')} hint={chyba} onRetry={nacti} />
          : !d ? <div className="space-y-3"><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /></div>
          : !skupiny.length ? <EmptyState icon="bell" title={t('Zatím klid')} hint={t('Razítka, potvrzení rezervací a novinky od podniků se ukážou tady.')} />
          : (
            <div className="space-y-6">
              {skupiny.map(s => (
                <section key={s.nazev} aria-label={s.nazev}>
                  <h2 className="t-label mb-2">{s.nazev}</h2>
                  <ul className="card list px-4 sm:px-5">
                    {s.polozky.map(p => <Radek key={p.id} p={p} nove={!!d.videno && p.at > d.videno && p.typ !== 'hodnotit'} onHodnoceno={id => setD(x => x ? { ...x, polozky: x.polozky.filter(y => y.id !== id) } : x)} />)}
                  </ul>
                </section>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

function Radek({ p, nove, onHodnoceno }: { p: Polozka; nove: boolean; onHodnoceno: (id: string) => void }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const cesta = useCesta();
  const den = pragueDaySafe(p.at);
  const kdy = den === pragueToday() ? pragueHM(new Date(p.at)) : den ? fmtDatum(den, { jazyk, styl: 'kratce' }) : '';
  let ikona = 'bell'; let limetka = false; let titul = ''; let text: React.ReactNode = null; let href: string | null = null;
  switch (p.typ) {
    case 'razitko':
      ikona = 'check'; limetka = true;
      titul = p.karta?.razitka != null && p.karta.cil ? t('+{n, plural, one {# razítko} few {# razítka} other {# razítek}} · {stav}', { n: p.delta ?? 1, stav: `${p.karta.razitka}/${p.karta.cil}` }) : t('+{n, plural, one {# razítko} few {# razítka} other {# razítek}}', { n: p.delta ?? 1 });
      href = cesta(`/client/${p.slug}`); break;
    case 'body':
      ikona = 'sparkle';
      titul = (p.delta ?? 0) > 0 ? t('+{n} bodů', { n: p.delta ?? 0 }) : t('{n} b. za odměnu', { n: p.delta ?? 0 });
      break;
    case 'kredit': ikona = 'coins'; titul = (p.delta ?? 0) > 0 ? t('Kredit připsán') : t('Kredit uplatněn'); break;
    case 'odmena': ikona = 'gift'; limetka = true; titul = t('Odměna připravena: {odmena}', { odmena: p.nazev ?? '' }); href = cesta('/client/me/odmeny'); break;
    case 'uplatneno': ikona = 'check'; titul = t('Uplatněno: {odmena}', { odmena: p.nazev ?? '' }); break;
    case 'rezervace': {
      ikona = 'calendar';
      const st = RES_STATUS[p.stav ?? ''] ?? RES_STATUS.requested;
      titul = p.stav === 'confirmed' ? t('Rezervace potvrzena') : p.stav === 'declined' ? t('Rezervaci podnik nepřijal') : p.stav === 'cancelled' ? t('Rezervace zrušena') : t(st.label);
      text = p.date ? <>{fmtDatum(p.date, { jazyk, styl: 'denKratce' })} · {p.time} · {t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: p.party ?? 1 })}</> : null;
      href = cesta(`/client/${p.slug}?tab=reserve${p.odkaz?.rezervace ? `&rezervace=${p.odkaz.rezervace}` : ''}`); break;
    }
    case 'objednavka':
      ikona = 'cup';
      titul = p.stav === 'confirmed' ? t('Objednávka se připravuje') : p.stav === 'done' ? t('Objednávka hotová') : p.stav === 'declined' ? t('Objednávku podnik nepřijal') : t('Objednávka čeká na obsluhu');
      href = cesta(`/client/${p.slug}?tab=order`); break;
    case 'novinka': ikona = 'inbox'; titul = p.titul ?? t('Novinka'); text = p.text; href = cesta(`/client/${p.slug}`); break;
    case 'odpoved':
      ikona = 'chat'; titul = t('Odpověď na tvoje hodnocení');
      text = <span className="block"><span className="block">„{p.text}“</span>{p.poznamka ? <span className="block mt-1 text-black/50">{t('Tvoje hodnocení: {n} z 5 · {pozn}', { n: p.hodnoceni ?? 0, pozn: p.poznamka })}</span> : null}</span>;
      break;
    case 'hodnotit': return <Hodnotit p={p} onHotovo={() => onHodnoceno(p.id)} />;
  }
  const obsah = (
    <>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${limetka ? 'bg-[#C8F542] text-[#16181A]' : 'bg-black/[0.05]'}`} aria-hidden><Icon name={ikona} size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-pretty">{titul}</span>
        {text && <span className="block text-sm text-black/70 mt-0.5 text-pretty">{text}</span>}
        <span className="block t-meta mt-0.5 truncate">{p.podnik}{kdy ? ` · ${kdy}` : ''}</span>
      </span>
      {nove && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#C8F542] ring-2 ring-black/60" aria-label={t('Nové')} />}
      {href && <Icon name="chevronRight" size={18} className="mt-2.5 shrink-0 text-black/40" />}
    </>
  );
  return (
    <li>
      {href ? <Link href={href} className="flex items-start gap-3 py-3.5 min-h-[64px]">{obsah}</Link> : <div className="flex items-start gap-3 py-3.5 min-h-[64px]">{obsah}</div>}
    </li>
  );
}

/** „Jak to bylo v …?“ — hvězdy rovnou v řádku, nepovinná poznámka, nic víc. */
function Hodnotit({ p, onHotovo }: { p: Polozka; onHotovo: () => void }) {
  const t = useT('klient-host');
  const [hvezdy, setHvezdy] = useState(0);
  const [pozn, setPozn] = useState('');
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const odeslat = async () => {
    if (!hvezdy) { setChyba(t('Vyber hvězdičky.')); return; }
    setBusy(true); setChyba('');
    try {
      const r = await fetch('/api/client/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: p.ref, rating: hvezdy, note: pozn }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setChyba(x.error ? t(x.error) : t('Nepovedlo se.')); return; }
      onHotovo(); void obnovHosta();
    } catch { setChyba(t('Nepovedlo se — vypadlo připojení.')); }
    finally { setBusy(false); }
  };
  return (
    <li className="py-4">
      <div className="flex items-start gap-3">
        <LogoPodniku nazev={p.podnik} barva={p.accent} velikost={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug">{t('Jak to bylo?')}</p>
          <p className="t-meta mt-0.5">{p.podnik} · {p.kind === 'order' ? t('objednávka od stolu') : t('rezervace')}</p>
          <div className="mt-2 flex items-center gap-0.5" role="radiogroup" aria-label={t('Hodnocení')}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" role="radio" aria-checked={hvezdy === n} aria-label={t('{n} z 5', { n })} onClick={() => setHvezdy(n)}
                className={`tap-target-sm h-10 w-10 rounded-full grid place-items-center transition ${n <= hvezdy ? 'text-[#16181A]' : 'text-black/25 hover:text-black/45'}`}><Icon name="star" size={24} /></button>
            ))}
          </div>
          {hvezdy > 0 && (
            <div className="mt-2 flex gap-2">
              <input value={pozn} onChange={e => setPozn(e.target.value)} placeholder={t('Pár slov, když chceš')} aria-label={t('Poznámka k hodnocení')} maxLength={500} className="field flex-1 min-w-0" />
              <button type="button" onClick={() => void odeslat()} disabled={busy} className="btn btn-primary shrink-0 disabled:opacity-50">{busy ? '…' : t('Odeslat')}</button>
            </div>
          )}
          {chyba && <p role="alert" className="mt-2 text-sm text-bad-ink">{chyba}</p>}
        </div>
      </div>
    </li>
  );
}
