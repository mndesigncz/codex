'use client';

// Rezervace přímo na stránce podniku (směr A, předloha 04): skleněná karta s krokovačem osob
// (kruhy 36, cíl 44), den a volné časy jako čipy ze skutečné dostupnosti (GET /api/client/b/[slug]/sloty
// — kapacita stolů a rezervace; obsazené přeškrtnuté a zakázané), příležitost a poznámka. Limetkové
// tlačítko opakuje volbu („Rezervovat · dnes v 19:00“). Po odeslání potvrzení s „Do kalendáře“.

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../Icons';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { okJson } from '@/lib/api';
import { buildIcs, downloadIcs } from '@/lib/ics';
import { dayPlus, pragueHM } from '@/lib/pragueTime';
import { slotsFor, nejdriveDnes, type OpeningHours } from '@/lib/clientSlots';
import { obnovHosta } from './data';
import { useCesta } from './cesty';
import './podnik/podnik.css';

interface Sloty { den: string; osob: number; kapacita: boolean; sloty: { cas: string; volno: boolean }[]; dny: { den: string; otevreno: boolean }[] }
const PRILEZITOSTI = ['Narozeniny', 'Rande', 'Pracovní', 'S dětmi'] as const; // i18n-ok: klíče slovníku, překládá se při vykreslení

export default function Rezervace({ slug, nazev, adresa, maxOsob, dnes, prihlasen, hodiny, krok = 30, dopredu = 30, onClose, onHotovo }: {
  slug: string; nazev: string; adresa: string; maxOsob: number; dnes: string; prihlasen: boolean;
  /** Otevírací doba podniku: náhradní časy, když server dostupnost nevrátí (výpadek) — pak bez „volné“. */
  hodiny?: OpeningHours | null; krok?: number; dopredu?: number;
  onClose?: () => void; onHotovo: (zprava: string) => void;
}) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const cesta = useCesta();
  const [osob, setOsob] = useState(2);
  const [den, setDen] = useState(dnes);
  const [cas, setCas] = useState('');
  const [prilezitost, setPrilezitost] = useState<string>('');
  // Doslovné t('…'), ať kontrola slovníků příležitosti vidí (hodnota v PRILEZITOSTI je česká).
  const popisPrilezitosti = (p: string) => ({ Narozeniny: t('Narozeniny'), Rande: t('Rande'), Pracovní: t('Pracovní'), 'S dětmi': t('S dětmi') } as Record<string, string>)[p] ?? p; // i18n-ok: klíče jsou hodnoty PRILEZITOSTI
  const [pozn, setPozn] = useState('');
  const [sloty, setSloty] = useState<Sloty | null>(null);
  const [nacitam, setNacitam] = useState(true);
  const [chyba, setChyba] = useState('');
  const [busy, setBusy] = useState(false);
  const [hotovo, setHotovo] = useState<{ potvrzeno: boolean } | null>(null);
  // Den vybral host sám? Dokud ne, prázdný dnešek se sám posune na první den s volným časem.
  const vybralDen = useRef(false);

  useEffect(() => {
    let zivy = true;
    setNacitam(true); setChyba('');
    // Náhrada bez serveru: časy z otevírací doby (a předstih pro dnešek), kapacita neznámá.
    const zHodin = (): Sloty => ({
      den, osob, kapacita: false,
      sloty: slotsFor(hodiny, den, krok, den === dnes ? nejdriveDnes(pragueHM()) : undefined).map(cas => ({ cas, volno: true })),
      dny: Array.from({ length: Math.min(dopredu, 13) + 1 }, (_, i) => dayPlus(dnes, i)).map(d => ({ den: d, otevreno: slotsFor(hodiny, d, krok).length > 0 })),
    });
    // Dnes už nic volného a host den nevybíral: předvybrat první další otevřený den (zpravidla Zítra).
    const posunNaVolny = (x: Sloty) => {
      if (vybralDen.current || den !== dnes || (x.sloty ?? []).some(s => s.volno)) return false;
      const dalsi = (x.dny ?? []).find(d => d.den > dnes && d.otevreno);
      if (!dalsi) return false;
      vybralDen.current = true;
      setDen(dalsi.den);
      return true;
    };
    fetch(`/api/client/b/${encodeURIComponent(slug)}/sloty?den=${den}&osob=${osob}`, { cache: 'no-store' }).then(okJson).then((odpoved: Sloty) => {
      if (!zivy) return;
      const x = Array.isArray(odpoved?.sloty) ? odpoved : zHodin();
      if (posunNaVolny(x)) return;
      setSloty(x);
      // Vybraný čas zůstane, jen když je pořád volný; jinak první volný.
      setCas(c => (x.sloty ?? []).some(s => s.cas === c && s.volno) ? c : ((x.sloty ?? []).find(s => s.volno)?.cas ?? ''));
    }).catch(() => {
      if (!zivy) return;
      const x = zHodin();
      if (posunNaVolny(x)) return;
      setSloty(x);
      setCas(c => x.sloty.some(s => s.cas === c) ? c : (x.sloty[0]?.cas ?? ''));
    }).finally(() => { if (zivy) setNacitam(false); });
    return () => { zivy = false; };
  }, [slug, den, osob, hodiny, krok, dopredu, dnes]);

  const dny = sloty?.dny?.length ? sloty.dny : Array.from({ length: 7 }, (_, i) => ({ den: dayPlus(dnes, i), otevreno: true }));
  const nazevDne = (d: string) => d === dnes ? t('Dnes') : d === dayPlus(dnes, 1) ? t('Zítra') : fmtDatum(d, { jazyk, styl: 'denKratce' });

  const odeslat = async () => {
    if (!prihlasen) { window.location.href = `/client/login?next=${encodeURIComponent('/client/' + slug + '?tab=reserve')}`; return; }
    if (!cas) { setChyba(t('Vyber čas.')); return; }
    setBusy(true); setChyba('');
    const note = [prilezitost ? popisPrilezitosti(prilezitost) : '', pozn.trim()].filter(Boolean).join(' · ').slice(0, 300);
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(slug)}/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: den, time: cas, party: osob, note }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setChyba(x.error ? t(x.error) : t('Rezervace se nepovedla.')); if (r.status === 409) setSloty(s => s ? { ...s } : s); return; }
      const potvrzeno = x.reservation?.status === 'confirmed';
      setHotovo({ potvrzeno });
      onHotovo(potvrzeno ? t('Rezervace je potvrzená. Těšíme se na tebe.') : t('Rezervace odeslána. Podnik ji potvrdí.'));
      void obnovHosta();
    } catch {
      setChyba(t('Rezervace neodešla — vypadlo připojení. Zkus to prosím znovu.'));
    } finally { setBusy(false); }
  };

  const doKalendare = () => {
    const ics = buildIcs([{ uid: `managero-rez-${slug}-${den}-${cas}@managero`, date: den, startTime: cas, endTime: null, summary: `${nazev} — ${t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: osob })}`, location: adresa || nazev, description: null }], '-//Managero//Rezervace//CS');
    downloadIcs(`rezervace-${den}.ics`, ics);
  };

  const tlacitko = busy ? t('Odesílám…') : !prihlasen ? t('Přihlásit se a rezervovat')
    : !cas ? t('Vyber čas')
    : den === dnes ? t('Rezervovat · dnes v {cas}', { cas })
    : den === dayPlus(dnes, 1) ? t('Rezervovat · zítra v {cas}', { cas })
    : t('Rezervovat · {den} v {cas}', { den: fmtDatum(den, { jazyk, styl: 'denKratce' }), cas });
  const dalsi = () => { setHotovo(null); setCas(''); setPozn(''); setPrilezitost(''); onClose?.(); };

  if (hotovo) return (
    <div className="lgx hp-sklo hpp-rez" role="status">
      <div className="flex items-center gap-3">
        <span className="hp-jamka" aria-hidden><Icon name="calendarCheck" size={18} strokeWidth={1.6} /></span>
        <div className="min-w-0">
          <p className="hp-silny">{hotovo.potvrzeno ? t('Rezervace potvrzena') : t('Rezervace odeslána')}</p>
          <p className="hp-meta mt-0.5 cz-sentence">{nazevDne(den)} {cas} · {t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: osob })}</p>
        </div>
      </div>
      <p className="hp-meta mt-3">{hotovo.potvrzeno ? t('Podnik s tebou počítá.') : t('Podnik ji potvrdí. Dáme ti vědět v Aktivitě.')}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={doKalendare} className="hp-btn lgx hp-btn-sklo hp-btn-stredni min-w-0"><Icon name="calendar" size={16} strokeWidth={1.6} />{t('Do kalendáře')}</button>
        <button type="button" onClick={dalsi} className="hp-btn hp-btn-inkoust hp-btn-stredni min-w-0">{t('Hotovo')}</button>
      </div>
      <a href={cesta('/client/me/aktivita')} className="mt-2 block text-center hp-meta tap-target py-2">{t('Zobrazit v Aktivitě')}</a>
    </div>
  );

  return (
    <div className="lgx hp-sklo hpp-rez">
      <div className="flex items-center justify-between gap-3 min-h-[44px]">
        <p className="hp-silny min-w-0" id={`r-osob-${slug}`}>{t('Kolik vás bude')}</p>
        <div className="hpp-krokovac">
          <button type="button" aria-label={t('Méně')} onClick={() => setOsob(o => Math.max(1, o - 1))} disabled={osob <= 1}><Icon name="minus" size={16} strokeWidth={1.8} /></button>
          <span className="hp-h2 hp-num" aria-live="polite" aria-labelledby={`r-osob-${slug}`}>{osob}</span>
          <button type="button" aria-label={t('Více')} onClick={() => setOsob(o => Math.min(maxOsob, o + 1))} disabled={osob >= maxOsob}><Icon name="plus" size={16} strokeWidth={1.8} /></button>
        </div>
      </div>
      <div className="hpp-cara" aria-hidden />

      <div className="hpp-dny overflow-x-auto scroll-fade-x" role="radiogroup" aria-label={t('Den')}>
        {dny.map(d => (
          <button key={d.den} type="button" role="radio" aria-checked={den === d.den} disabled={!d.otevreno && d.den !== dnes} onClick={() => { vybralDen.current = true; setDen(d.den); }} className="hp-cip cz-sentence">{nazevDne(d.den)}</button>
        ))}
      </div>

      <div className={`mt-3 ${nacitam && !sloty ? 'min-h-[92px]' : ''}`} aria-busy={nacitam}>
        {nacitam && !sloty ? (
          <div className="hpp-casy" aria-hidden>{Array.from({ length: 8 }).map((_, i) => <span key={i} className="h-10 rounded-full bg-[var(--hp-well)] animate-pulse" />)}</div>
        ) : (sloty?.sloty ?? []).length === 0 ? (
          <p className="hp-meta py-3">{den === dnes ? t('Dnes už se nedá rezervovat, vyber zítřek.') : t('V tento den je zavřeno.')}</p>
        ) : (
          <div className="hpp-casy" role="radiogroup" aria-label={sloty?.kapacita === false ? t('Časy') : den === dnes ? t('Volné časy dnes') : t('Volné časy')}>
            {sloty!.sloty.map(s => (
              <button key={s.cas} type="button" role="radio" aria-checked={cas === s.cas} disabled={!s.volno} onClick={() => setCas(s.cas)}
                className="hp-cip min-w-0" aria-label={s.volno ? s.cas : t('{cas} — obsazeno', { cas: s.cas })}>{s.cas}</button>
            ))}
          </div>
        )}
        {sloty && sloty.sloty.length > 0 && !sloty.sloty.some(s => s.volno) && <p className="mt-2 hp-meta">{t('Tenhle den je plno. Zkus jiný den nebo menší skupinu.')}</p>}
      </div>

      <p className="mt-4 hp-meta">{t('Příležitost')} · {t('nepovinné')}</p>
      <div className="mt-2 hpp-cipy">
        {PRILEZITOSTI.map(p => <button key={p} type="button" aria-pressed={prilezitost === p} onClick={() => setPrilezitost(x => x === p ? '' : p)} className="hp-cip">{popisPrilezitosti(p)}</button>)}
      </div>
      <label htmlFor={`r-pozn-${slug}`} className="sr-only">{t('Poznámka')}</label>
      <div className="hp-pole mt-3">
        <input id={`r-pozn-${slug}`} value={pozn} onChange={e => setPozn(e.target.value)} maxLength={240} placeholder={t('Poznámka: alergie, kočárek, u okna…')} className="hpp-poznamka" />
      </div>

      {chyba && <p role="alert" className="mt-3 note note-danger">{chyba}</p>}
      <button type="button" onClick={() => void odeslat()} disabled={busy || (!cas && prihlasen)} className="mt-4 hp-btn hp-btn-limetka hp-btn-blok" data-rezervovat>
        {tlacitko}
      </button>
      {prihlasen && <p className="hp-meta text-center mt-2.5 text-pretty">{t('Potvrzení uvidíš v Aktivitě.')}</p>}
    </div>
  );
}
