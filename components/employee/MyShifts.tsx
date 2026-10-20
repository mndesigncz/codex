'use client';

// Moje směny (vedení i zaměstnanec) — plocha s widgety a nadcházející směny
// jako hlavní nástroj (kolo 69, balík B1, spec §6.2).
//
// Do kola 68 tu natvrdo stály tři karty-dlaždice s číslem 30 px a limetkovým
// proužkem, „Kdo má směnu" (TeamSchedule), modré pilulky schváleného volna,
// seznam nadcházejících směn s dnešním řádkem tónovaným limetkou a minulé
// směny s „★ 4/5". Každý blok si volal vlastní fetch (/api/shifts,
// /api/timeoff, /api/rewards) a výpadek skončil prázdnem, které vypadalo jako
// „žádné směny". Bloky jsou teď widgety (components/widgety/oblasti/
// moje-smeny.tsx a rozvrh.tsx) se svým dotazem; tady zůstal seznam
// nadcházejících směn s exportem do kalendáře a nabídkou směny do burzy —
// ta dřív žila ve zvláštní kartě pod stránkou (ShiftSwap) a člověk musel
// směnu hledat podruhé.
//
// Seznam bere /api/shifts?employeeId přes useDataWidgetu, ne vlastním
// fetchem: widgety Moje směny v číslech a Minulé směny čtou tutéž URL, takže
// je to na stránku jeden dotaz a po schválené výměně se srovná všechno naráz.
//
// Vedení i zaměstnanec mají stejnou komponentu, ale jinou stránku plochy
// (vedeni.moje_smeny / zamestnanec.moje_smeny) — pozná se podle cesty
// (/employer vs /employee), protože layouty patří jinému balíku a props
// nepředávají.

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button, Card, Chip, EmptyState, ErrorState, Field, ListRow, Modal, Skeleton, Textarea } from '../ui';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import { useTymSmeny } from '../widgety/useTymSmeny';
import { KolegoveSmeny } from '../widgety/KolegoveSmeny';
import { Icon } from '../Icons';
import { apiMessage, okJson } from '@/lib/api';
import { buildIcs, downloadIcs } from '@/lib/ics';
import { dayPlus, pragueToday } from '@/lib/pragueTime';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum, fmtHM } from '@/lib/i18n/format';
import {
  UDALOST_ZMENA, den, hm, kategorieBarvy, kolegoveKeSmene, nadchazejiciSmeny, popisekTypu,
  type MojeSmena, type NabidkaSmeny,
} from '@/lib/rozvrhPrehled';

interface Props {
  user: { id?: string; name?: string | null };
}

const URL_BURZA = '/api/shifts/offers';
/** Kolik nadcházejících směn ukázat, než se seznam rozbalí. */
const NA_ZACATEK = 8;

function vyberSmeny(raw: any): MojeSmena[] {
  if (!Array.isArray(raw)) throw new Error('Směny přišly v nečekaném tvaru.'); // i18n-ok: technická hláška
  return raw;
}
function vyberBurzu(raw: any): NabidkaSmeny[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.offers)) throw new Error('Burza přišla v nečekaném tvaru.'); // i18n-ok: technická hláška
  return raw.offers;
}

export default function MyShifts({ user }: Props) {
  const t = useT('zamestnanec');
  const { jazyk } = useJazyk();
  const zamestnanec = (usePathname() ?? '').startsWith('/employee');
  const smi = useSmi();
  const userId = parseInt(user.id ?? '0');
  const urlSmen = userId ? `/api/shifts?employeeId=${userId}` : null;
  const smeny = useDataWidgetu(urlSmen, vyberSmeny);
  // Burza jen s rozvrh.burza (jde podniku vypnout) — stejná URL jako widget Výměny směn.
  const smiBurza = smi('rozvrh.burza');
  const burza = useDataWidgetu(smiBurza ? URL_BURZA : null, vyberBurzu);
  const [vse, setVse] = useState(false);
  const [nabidnout, setNabidnout] = useState<MojeSmena | null>(null);
  const [poznamka, setPoznamka] = useState('');
  const [odesilam, setOdesilam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hotovo, setHotovo] = useState<string | null>(null);

  // Schválená výměna ve widgetu přepsala směnu — seznam se obnoví.
  useEffect(() => {
    if (!urlSmen) return;
    const zmena = () => obnovDataWidgetu(urlSmen);
    window.addEventListener(UDALOST_ZMENA, zmena);
    return () => window.removeEventListener(UDALOST_ZMENA, zmena);
  }, [urlSmen]);

  const dnes = pragueToday();
  // V češtině malými písmeny uprostřed věty („po 28. 9.“); cizí jazyky zkratku dne nelowercasují.
  const denVeVete = (d: string) => (jazyk === 'cs' ? denKratce(d).toLowerCase() : denKratce(d));
  const denKratce = (d: string) => (d === dnes ? t('Dnes') : d === dayPlus(dnes, 1) ? t('Zítra') : fmtDatum(d, { jazyk, styl: 'denKratce' }));
  const nadchazejici = useMemo(() => nadchazejiciSmeny(smeny.data ?? [], dnes), [smeny.data, dnes]);
  // Směny, které už v burze visí (nabídnuté nebo převzaté a čekají) — podruhé nabídnout nejdou.
  const vBurze = useMemo(() => new Set((burza.data ?? [])
    .filter(o => o.status === 'open' || o.status === 'claimed').map(o => Number(o.shiftId))), [burza.data]);

  // Směny do kalendáře. Soubor skládá `lib/ics` — dřív se lepil ručně a chyběl
  // mu `DTSTAMP` i popis pásma, takže ho Outlook odmítl.
  const exportIcs = () => {
    const ics = buildIcs(nadchazejici.map(s => ({
      uid: `managero-shift-${s.id}@managero`,
      date: den(s.date),
      startTime: hm(s.startTime ?? s.start_time) || '08:00',
      endTime: hm(s.endTime ?? s.end_time) || '16:00',
      summary: `${popisekTypu(s)} — Managero`,
      // Poznámka vedení ke směně (kolo 7) jde i do kalendáře — tam se na směnu člověk dívá ráno.
      description: [s.startTime && s.endTime ? `${hm(s.startTime)}–${hm(s.endTime)}` : '', s.note ?? ''].filter(Boolean).join(' · ') || null,
    })), '-//Managero//Smeny//CS');
    downloadIcs('moje-smeny.ics', ics);
  };

  const odeslatNabidku = async () => {
    if (!nabidnout) return;
    setOdesilam(true); setChyba(null);
    try {
      const res = await fetch(URL_BURZA, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId: nabidnout.id, note: poznamka.trim() || undefined }),
      });
      await okJson(res);
      obnovDataWidgetu(URL_BURZA);
      setHotovo(t('Směna {den} je v burze. Kolegové dostali upozornění.', { den: denVeVete(den(nabidnout.date)) }));
      setNabidnout(null); setPoznamka('');
    } catch (e) {
      setChyba(apiMessage(e, t('Směnu se nepodařilo nabídnout — zkus to znovu.')));
    }
    setOdesilam(false);
  };

  const ukaz = vse ? nadchazejici : nadchazejici.slice(0, NA_ZACATEK);
  // S kým mám směnu: tým se bere za zobrazené směny (nejvýš dva měsíce); bez rozvrh.nahled se neptá.
  const tym = useTymSmeny(smi('rozvrh.nahled'), [den(ukaz[0]?.date).slice(0, 7), den(ukaz[ukaz.length - 1]?.date).slice(0, 7)]);
  const nastroj = (
    <Card as="section" aria-labelledby="nadchazejici-smeny">
      <h2 id="nadchazejici-smeny" className="t-card">{t('Nadcházející směny')}</h2>
      <div className="mt-3">
        {hotovo && (
          <p className="note note-ok text-sm mb-3 flex items-start justify-between gap-3" role="status">
            <span>{hotovo}</span>
            <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={t('Zavřít')} className="shrink-0 -my-1.5" onClick={() => setHotovo(null)} />
          </p>
        )}
        {smeny.error ? (
          <ErrorState compact title={t('Směny se nenačetly')} onRetry={smeny.reload} detail={smeny.error} className="!py-3" />
        ) : smeny.loading || !urlSmen ? (
          <div className="space-y-2" aria-busy>
            <Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12 w-2/3" />
          </div>
        ) : nadchazejici.length === 0 ? (
          <EmptyState compact illustration="smeny" title={t('Žádné nadcházející směny')}
            hint={t('Jakmile vedení zveřejní rozvrh, uvidíš tu svoje směny.')} />
        ) : (
          <>
            <ul className="list">
              {ukaz.map(s => {
                const kat = kategorieBarvy(s.typeColor);
                const d = den(s.date);
                const nabidnuto = vBurze.has(Number(s.id));
                return (
                  <ListRow key={s.id}
                    // v4 (V4, P15): stavový čip patří k titulku, akce má pevnou šířku (a prázdný řádek stejně
                    // široké místo) — časy jsou svislý sloupec u pravé hrany ve všech řádcích.
                    title={<span className="flex items-center gap-2 min-w-0"><span className="cz-sentence truncate">{denKratce(d)}</span>
                      {nabidnuto ? <Chip tone="info" size="sm" className="shrink-0">{t('V burze')}</Chip> : d === dnes ? <Chip tone="ok" size="sm" className="shrink-0">{t('Dnes')}</Chip> : null}</span>}
                    meta={<>
                      <span aria-hidden className={`inline-block h-2 w-2 rounded-full align-middle mr-1.5 ${kat ? `cat-dot-${kat}` : 'bg-black/15'}`} />
                      {popisekTypu(s)}
                    </>}
                    // Instrukce vedení ke směně (kolo 7: „Otevíráš sám, klíče u Petry") nad tím, s kým směnu máš.
                    detail={s.note || tym.zapnuto ? <>
                      {s.note && (
                        <span className="flex items-start gap-1.5 text-[#16181A]" data-poznamka-smeny>
                          <Icon name="chat" size={13} className="shrink-0 mt-0.5 text-black/45" />
                          <span className="min-w-0 text-pretty">{s.note}</span>
                        </span>
                      )}
                      {tym.zapnuto && <span className="block"><KolegoveSmeny kolegove={kolegoveKeSmene(s, tym.smeny)} hotovo={tym.hotovo} /></span>}
                    </> : undefined}
                    value={`${fmtHM(s.startTime ?? s.start_time)}–${fmtHM(s.endTime ?? s.end_time)}`}
                    // Jediná akce směny rovnou jako tlačítko (audit kola 6, Z10) — u zaměstnance i vedení:
                    // „···" s jednou položkou stálo tři klepnutí a dvě vrstvy za to, co se z telefonu
                    // dělá nejčastěji. Okno s poznámkou zůstává (nabídnout = dvě klepnutí).
                    actions={smiBurza ? (!nabidnuto ? (
                      <Button variant="secondary" size="sm" icon="handover" className="max-sm:!w-9 max-sm:!px-0 sm:w-32"
                        aria-label={t('Nabídnout do burzy směnu {den}', { den: denVeVete(d) })}
                        title={t('Kolega si ji může vzít, vedení výměnu schválí.')}
                        onClick={() => { setNabidnout(s); setPoznamka(''); setChyba(null); }}>
                        <span className="max-sm:sr-only">{t('Nabídnout')}</span>
                      </Button>
                    ) : <span aria-hidden className="block w-9 sm:w-32 shrink-0" />) : undefined}
                  />
                );
              })}
            </ul>
            {nadchazejici.length > NA_ZACATEK && (
              <Button variant="ghost" size="sm" className="mt-2" icon={vse ? 'chevron' : 'chevronRight'} aria-expanded={vse} onClick={() => setVse(v => !v)}>
                {vse ? t('Ukázat méně') : t('Zobrazit všechny ({n})', { n: nadchazejici.length })}
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );

  const muzeExport = nadchazejici.length > 0;
  return (
    <>
      <PlochaWidgetu
        stranka={zamestnanec ? 'zamestnanec.moje_smeny' : 'vedeni.moje_smeny'}
        hlavicka={{
          title: t('Moje směny'),
          subtitle: nadchazejici.length ? t('Před sebou máš {n, plural, one {# směna} few {# směny} other {# směn}}.', { n: nadchazejici.length }) : t('Co tě čeká a co už máš odpracované.'),
          hintId: 'myshifts',
          secondary: muzeExport ? <Button variant="secondary" icon="download" onClick={exportIcs}>{t('Do kalendáře')}</Button> : undefined,
          menu: muzeExport ? [{ label: t('Do kalendáře (.ics)'), icon: 'download', onClick: exportIcs, hint: t('Nadcházející směny do Google, Apple nebo Outlook kalendáře.') }] : undefined,
        }}
        nastroj={nastroj}
      />
      {nabidnout && (
        <Modal open onClose={() => setNabidnout(null)} size="sm" title={t('Nabídnout směnu do burzy')}
          subtitle={<span className="cz-sentence">{denKratce(den(nabidnout.date))} · {fmtHM(nabidnout.startTime ?? nabidnout.start_time)}–{fmtHM(nabidnout.endTime ?? nabidnout.end_time)}</span>}
          footer={<>
            <Button variant="secondary" onClick={() => setNabidnout(null)}>{t('Zrušit')}</Button>
            <Button variant="primary" icon="handover" loading={odesilam} onClick={odeslatNabidku}>{t('Nabídnout')}</Button>
          </>}>
          <Field id="burza-poznamka" label={t('Proč směnu nabízíš?')} hint={t('Nepovinné — kolegové to uvidí u nabídky.')}>
            <Textarea id="burza-poznamka" rows={2} maxLength={160} value={poznamka} onChange={e => setPoznamka(e.target.value)} />
          </Field>
          {chyba && <p className="note note-danger text-sm mt-3" role="alert">{chyba}</p>}
        </Modal>
      )}
    </>
  );
}
