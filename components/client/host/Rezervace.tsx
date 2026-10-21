'use client';

// Rezervace jako jedna obrazovka čipů (koncept B 7, audit C §6 5): kolik vás bude (krokovač),
// den jako čip (Dnes, Zítra, Čt 23. …), volné časy jako čipy ze skutečné dostupnosti
// (GET /api/client/b/[slug]/sloty — kapacita stolů a rezervace; obsazené přeškrtnuté),
// příležitost (nepovinné čipy) a poznámka. Tlačítko opakuje volbu („Rezervovat 19:30 · 2 osoby“).
// Po odeslání potvrzení s „Přidat do kalendáře“.

import { useEffect, useState } from 'react';
import { Icon } from '../../Icons';
import { Modal } from '../../ui';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { okJson } from '@/lib/api';
import { buildIcs, downloadIcs } from '@/lib/ics';
import { dayPlus, pragueHM } from '@/lib/pragueTime';
import { slotsFor, nejdriveDnes, type OpeningHours } from '@/lib/clientSlots';
import { obnovHosta } from './data';
import { useCesta } from './cesty';

interface Sloty { den: string; osob: number; kapacita: boolean; sloty: { cas: string; volno: boolean }[]; dny: { den: string; otevreno: boolean }[] }
const PRILEZITOSTI = ['Narozeniny', 'Rande', 'Pracovní', 'S dětmi'] as const; // i18n-ok: klíče slovníku, překládá se při vykreslení

export default function Rezervace({ slug, nazev, adresa, maxOsob, dnes, prihlasen, hodiny, krok = 30, dopredu = 30, onClose, onHotovo }: {
  slug: string; nazev: string; adresa: string; maxOsob: number; dnes: string; prihlasen: boolean;
  /** Otevírací doba podniku: náhradní časy, když server dostupnost nevrátí (výpadek) — pak bez „volné“. */
  hodiny?: OpeningHours | null; krok?: number; dopredu?: number;
  onClose: () => void; onHotovo: (zprava: string) => void;
}) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const cesta = useCesta();
  const [osob, setOsob] = useState(2);
  const [den, setDen] = useState(dnes);
  const [cas, setCas] = useState('');
  const [prilezitost, setPrilezitost] = useState<string>('');
  const [pozn, setPozn] = useState('');
  const [sloty, setSloty] = useState<Sloty | null>(null);
  const [nacitam, setNacitam] = useState(true);
  const [chyba, setChyba] = useState('');
  const [busy, setBusy] = useState(false);
  const [hotovo, setHotovo] = useState<{ potvrzeno: boolean } | null>(null);

  useEffect(() => {
    let zivy = true;
    setNacitam(true); setChyba('');
    // Náhrada bez serveru: časy z otevírací doby (a předstih pro dnešek), kapacita neznámá.
    const zHodin = (): Sloty => ({
      den, osob, kapacita: false,
      sloty: slotsFor(hodiny, den, krok, den === dnes ? nejdriveDnes(pragueHM()) : undefined).map(cas => ({ cas, volno: true })),
      dny: Array.from({ length: Math.min(dopredu, 13) + 1 }, (_, i) => dayPlus(dnes, i)).map(d => ({ den: d, otevreno: slotsFor(hodiny, d, krok).length > 0 })),
    });
    fetch(`/api/client/b/${encodeURIComponent(slug)}/sloty?den=${den}&osob=${osob}`, { cache: 'no-store' }).then(okJson).then((odpoved: Sloty) => {
      if (!zivy) return;
      const x = Array.isArray(odpoved?.sloty) ? odpoved : zHodin();
      setSloty(x);
      // Vybraný čas zůstane, jen když je pořád volný; jinak první volný.
      setCas(c => (x.sloty ?? []).some(s => s.cas === c && s.volno) ? c : ((x.sloty ?? []).find(s => s.volno)?.cas ?? ''));
    }).catch(() => {
      if (!zivy) return;
      const x = zHodin();
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
    const note = [prilezitost ? t(prilezitost) : '', pozn.trim()].filter(Boolean).join(' · ').slice(0, 300);
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

  return (
    <Modal open onClose={onClose} size="md" className="h-vyjed" title={hotovo ? (hotovo.potvrzeno ? t('Rezervace potvrzena') : t('Rezervace odeslána')) : t('Rezervovat stůl')} subtitle={nazev}>

        {hotovo ? (
          <div>
            <div className="card p-4 flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#C8F542] text-[#16181A]" aria-hidden><Icon name="calendarCheck" size={20} /></span>
              <div className="min-w-0">
                <p className="text-[16px] font-semibold cz-sentence">{nazevDne(den)} {cas} · {t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: osob })}</p>
                <p className="t-meta mt-0.5">{hotovo.potvrzeno ? t('Podnik s tebou počítá.') : t('Podnik ji potvrdí. Dáme ti vědět v Aktivitě.')}</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button type="button" onClick={doKalendare} className="btn btn-secondary !h-[52px] min-w-0"><Icon name="calendar" size={16} />{t('Do kalendáře')}</button>
              <button type="button" onClick={onClose} className="btn btn-primary !h-[52px] min-w-0">{t('Hotovo')}</button>
            </div>
            <a href={cesta('/client/me/aktivita')} className="mt-3 block text-center text-sm font-medium text-black/60 tap-target-sm py-2">{t('Zobrazit v Aktivitě')}</a>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 min-h-[44px]">
              <p className="flex-1 text-[15px] font-semibold" id="r-osob">{t('Kolik vás bude')}</p>
              <button type="button" aria-label={t('Méně')} onClick={() => setOsob(o => Math.max(1, o - 1))} disabled={osob <= 1} className="tap-target btn-icon disabled:opacity-40"><Icon name="minus" size={16} /></button>
              <span className="w-8 text-center text-[20px] font-semibold tabular-nums" aria-live="polite" aria-labelledby="r-osob">{osob}</span>
              <button type="button" aria-label={t('Více')} onClick={() => setOsob(o => Math.min(maxOsob, o + 1))} disabled={osob >= maxOsob} className="tap-target btn-icon disabled:opacity-40"><Icon name="plus" size={16} /></button>
            </div>

            <p className="mt-5 text-[15px] font-semibold">{t('Den')}</p>
            <div className="mt-2.5 -mx-5 sm:-mx-6 px-5 sm:px-6 flex gap-2 overflow-x-auto scroll-fade-x pb-1" role="radiogroup" aria-label={t('Den')}>
              {dny.map(d => (
                <button key={d.den} type="button" role="radio" aria-checked={den === d.den} disabled={!d.otevreno && d.den !== dnes} onClick={() => setDen(d.den)} className="h-cip h-cas shrink-0 cz-sentence">{nazevDne(d.den)}</button>
              ))}
            </div>

            <p className="mt-5 text-[15px] font-semibold">{sloty?.kapacita === false ? t('Časy') : den === dnes ? t('Volné časy dnes') : t('Volné časy')}</p>
            <div className="mt-2.5 min-h-[100px]" aria-busy={nacitam}>
              {nacitam && !sloty ? (
                <div className="grid grid-cols-4 gap-2" aria-hidden>{Array.from({ length: 8 }).map((_, i) => <span key={i} className="h-11 rounded-[14px] bg-black/[0.05] animate-pulse" />)}</div>
              ) : (sloty?.sloty ?? []).length === 0 ? (
                <p className="t-meta py-3">{den === dnes ? t('Dnes už se nedá rezervovat, vyber zítřek.') : t('V tento den je zavřeno.')}</p>
              ) : (
                <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t('Čas')}>
                  {sloty!.sloty.map(s => (
                    <button key={s.cas} type="button" role="radio" aria-checked={cas === s.cas} disabled={!s.volno} onClick={() => setCas(s.cas)}
                      className="h-cip h-cas !px-1 min-w-0" aria-label={s.volno ? s.cas : t('{cas} — obsazeno', { cas: s.cas })}>{s.cas}</button>
                  ))}
                </div>
              )}
              {sloty && sloty.sloty.length > 0 && !sloty.sloty.some(s => s.volno) && <p className="mt-2 t-meta">{t('Tenhle den je plno. Zkus jiný den nebo menší skupinu.')}</p>}
            </div>

            <p className="mt-5 text-[15px] font-semibold">{t('Příležitost')} <span className="t-meta font-normal">· {t('nepovinné')}</span></p>
            <div className="mt-2.5 flex gap-2 flex-wrap">
              {PRILEZITOSTI.map(p => <button key={p} type="button" aria-pressed={prilezitost === p} onClick={() => setPrilezitost(x => x === p ? '' : p)} className="h-cip tap-target-sm">{t(p)}</button>)}
            </div>
            <label htmlFor="r-pozn" className="sr-only">{t('Poznámka')}</label>
            <input id="r-pozn" value={pozn} onChange={e => setPozn(e.target.value)} maxLength={240} placeholder={t('Poznámka: alergie, kočárek, u okna…')} className="field mt-3" />

            {chyba && <p role="alert" className="mt-3 note note-danger">{chyba}</p>}
            <button type="button" onClick={() => void odeslat()} disabled={busy || (!cas && prihlasen)} className="mt-5 btn btn-accent w-full !h-[52px] disabled:opacity-50">
              {busy ? t('Odesílám…') : !prihlasen ? t('Přihlásit se a rezervovat') : cas ? t('Rezervovat {cas} · {n, plural, one {# osoba} few {# osoby} other {# osob}}', { cas, n: osob }) : t('Vyber čas')}
            </button>
          </>
        )}
    </Modal>
  );
}
