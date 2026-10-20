'use client';

// Správa „Úkolů za body" (kolo 9 jako nabídka „Co se dá udělat navíc", kolo 11 přepracovaná
// na volitelné úkoly s opakováním — balík V). Stejná komponenta je v Odměnách › Navíc
// (s odkazem „Otevřít v Úkolech ›") a v Úkolech › Za body. Seznam úkolů (opakování,
// body, prémie, kolik lidí, komu, uznává se samo, s fotkou, platnost, vypnuto), Nový úkol
// za body / Upravit (NabidkaNavicOkno), Vypnout / Zapnout nabízení jedním klepnutím
// v „···", Smazat = archivace s potvrzením v okně. Bez navic.nabidka jen ke čtení
// (server položky pošle i tomu, kdo smí navíc zapisovat nebo vidět tým).

import React, { useState } from 'react';
import { Icon } from '../Icons';
import { URL_NABIDKA_NAVIC, urlNavic, type NabidkaNavic } from '@/lib/navic';
import { apiMessage, okJson } from '@/lib/api';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { pragueToday } from '@/lib/pragueTime';
import { Button, Card, Chip, EmptyState, ErrorState, ListRow, Menu, Modal, Skeleton, Toast } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { useNavigace, useSmi } from '../widgety/NavigaceKontext';
import { URL_UKOLY_TYMU, obnovNavic, useNabidkaNavic, useNavic, useUkolyZaBody } from './data';
import { stavNabidky } from './logika';
import { NabidkaNavicOkno, vyberCleny } from './NabidkaNavicOkno';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { metaUkolu, podrobnostiUkolu } from './popisyZaBody';
import { ARG_ZA_BODY, cekajiciZUkolu, souhrnZaBody } from './zaBody';
import { ChipVolna, FrontaZaBody, LideUkolu, textSouhrnuZaBody } from './ZaBodyDnes';

/** „Každý den · +20 b · 300 Kč" — meta řádku úkolu za body (zachováno pro starší volající). */
export function metaNabidky(t: PrekladFn, n: NabidkaNavic, money: (x: number) => string): string {
  return metaUkolu(t, n, money);
}

export function SpravaNabidky({ dnesni = false, onNovy }: {
  /**
   * V Úkolech › Za body: u každého úkolu i dnešek (kdo ho vzal / splnil, kolik míst zbývá),
   * nad seznamem souhrn dne a čekající zápisy z úkolů za body s Uznat / Odmítnout.
   * Bez něj (Odměny › Navíc) má karta odkaz „Otevřít v Úkolech ›" — tam to vedení hledá.
   */
  dnesni?: boolean;
  /** Nový úkol otevírá rodič (Úkoly: i z hlavičky a z běžného „Nový úkol"); bez něj vlastní okno. */
  onNovy?: () => void;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const nav = useNavigace();
  const data = useNabidkaNavic(URL_NABIDKA_NAVIC);
  const dnes = pragueToday();
  const polozky = data.data?.nabidka ?? [];
  const smi = data.data?.smiSpravovat === true;
  const [okno, setOkno] = useState<{ polozka: NabidkaNavic | null } | null>(null);
  const [mazani, setMazani] = useState<NabidkaNavic | null>(null);
  const [mazu, setMazu] = useState(false);
  const [prepinam, setPrepinam] = useState<number | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const vidiUkoly = !dnesni && nav.smiPohled('tasks');
  const smiOpr = useSmi();
  const dnesData = useUkolyZaBody(dnesni && smiOpr('navic.zobrazit_tym') ? URL_UKOLY_TYMU : null);
  const cekajici = useNavic(dnesni && smiOpr('navic.zobrazit_tym') ? urlNavic({ scope: 'team', status: 'ceka' }) : null);
  const dnesniUkoly = new Map((dnesData.data?.ukoly ?? []).map(u => [u.nabidka.id, u]));
  const fronta = cekajiciZUkolu(cekajici.data?.items ?? []);
  const novy = () => (onNovy ? onNovy() : setOkno({ polozka: null }));
  // Jména u „jen Eva, Jakub" — /api/teams jen tehdy, když nějaký úkol je určený vybraným lidem.
  const clenove = useDataWidgetu(polozky.some(n => n.targetUsers.length > 0) ? '/api/teams' : null, vyberCleny);
  const jmena = new Map((clenove.data ?? []).map(c => [c.id, c.jmeno]));

  const smazat = async () => {
    if (!mazani || mazu) return;
    setMazu(true); setChyba(null);
    try {
      await fetch(`${URL_NABIDKA_NAVIC}?id=${mazani.id}`, { method: 'DELETE' }).then(okJson);
      setToast(t('Úkol „{nazev}" je smazaný.', { nazev: mazani.title }));
      setMazani(null);
      obnovNavic();
    } catch (e) {
      setChyba(apiMessage(e, t('Úkol se nepodařilo smazat.')));
      setMazani(null);
    } finally {
      setMazu(false);
    }
  };
  /** Vypnout / zapnout nabízení bez otevírání okna (PATCH jen `active` — ostatní pole server nechá). */
  const prepniAktivni = async (n: NabidkaNavic) => {
    if (prepinam) return;
    setPrepinam(n.id); setChyba(null);
    try {
      await fetch(URL_NABIDKA_NAVIC, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id, active: !n.active }) }).then(okJson);
      setToast(n.active ? t('Úkol „{nazev}" se už nenabízí.', { nazev: n.title }) : t('Úkol „{nazev}" se zase nabízí.', { nazev: n.title }));
      obnovNavic();
    } catch (e) {
      setChyba(apiMessage(e, t('Změna se neuložila.')));
    } finally {
      setPrepinam(null);
    }
  };
  const chipStavu = (n: NabidkaNavic) => {
    const s = stavNabidky(n, dnes);
    if (s === 'vypnuta') return <Chip tone="muted" size="sm">{t('Vypnuto')}</Chip>;
    if (s === 'prosla') return <Chip tone="bad" size="sm">{t('Prošlá')}</Chip>;
    if (s === 'zacne') return <Chip tone="wait" size="sm">{t('Začne {den}', { den: fmtDatum(n.validFrom!, { jazyk: t.jazyk, styl: 'kratce' }) })}</Chip>;
    return null;
  };

  return (
    <Card aria-labelledby="nabidka-navic-titulek" data-sprava-nabidky>
      {/* Hlavička = titul + nejvýš proklik vpravo (V1); „Nový úkol za body" je akce karty na jejím konci
          L→R × 44 (P17) — dřív se na telefonu zalomila pod titul jako osamělé tlačítko 165 px. */}
      <div className="flex items-center justify-between gap-2 min-h-[var(--h-s)]">
        <h2 id="nabidka-navic-titulek" className="t-card flex min-w-0 items-center gap-2">
          <Icon name="tag" size={17} className="shrink-0 text-black/40" />
          <span className="truncate">{t('Úkoly za body')}</span>
        </h2>
        {vidiUkoly && (
          <Button variant="ghost" size="sm" iconAfter="chevronRight" className="tap-target shrink-0 !pr-0" onClick={() => nav.onNavigate('tasks', ARG_ZA_BODY)}>{t('Otevřít v Úkolech')}</Button>
        )}
      </div>
      {/* V Úkolech totéž říká podtitulek hlavičky — na telefonu by tu byly čtyři řádky navíc nad seznamem. */}
      {!dnesni && <p className="t-meta mt-1 text-pretty">{t('Volitelné úkoly s body — kdo chce, vezme si úkol („Beru si"), splní ho a dostane body. Opakování nastavíš sám: jednou, každý den, vybrané dny, týdně, měsíčně nebo každých pár dní.')}</p>}
      {dnesni && dnesData.data && (dnesData.data.ukoly.length > 0 || fronta.length > 0) && (
        <div className="mt-3 space-y-3">
          <p className="t-meta" data-za-body-souhrn>{t('Dnes')}: {textSouhrnuZaBody(t, souhrnZaBody(dnesData.data.ukoly))}</p>
          <FrontaZaBody items={fronta} smiUznat={smiOpr('navic.uznat')} />
        </div>
      )}
      {data.error ? (
        <ErrorState compact title={t('Úkoly za body se nenačetly')} onRetry={data.reload} detail={data.error} className="mt-3" />
      ) : data.loading ? (
        <div className="mt-4 space-y-2" aria-busy>{[0, 1].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : polozky.length === 0 ? (
        <EmptyState compact icon="tag" title={t('Zatím žádný úkol za body')}
          hint={smi ? t('Vypiš první — třeba „Vytřít sklad · +20 b · každý pátek".') : t('Vedení zatím nic nevypsalo.')} className="mt-2"
          action={smi ? <Button variant="secondary" size="sm" icon="plus" onClick={novy}>{t('Nový úkol za body')}</Button> : undefined} />
      ) : (
        <>
        {dnesni && fronta.length > 0 && <p className="t-label mt-4">{t('Všechny úkoly za body')}</p>}
        <ul className={`list ${dnesni && fronta.length > 0 ? '' : 'mt-3'}`} data-sprava-seznam>
          {polozky.map(n => (
            <ListRow key={n.id} akceVRadku
              lead={<span aria-hidden className="well grid h-9 w-9 shrink-0 place-items-center text-black/55"><Icon name="tag" size={16} /></span>}
              title={n.title}
              meta={metaUkolu(t, n, money)}
              detail={dnesni ? (
                <>
                  <span className="block">{[n.description, podrobnostiUkolu(t, n, jmena)].filter(Boolean).join(' — ')}</span>
                  {dnesniUkoly.get(n.id) ? <LideUkolu u={dnesniUkoly.get(n.id)!} /> : null}
                </>
              ) : [n.description, podrobnostiUkolu(t, n, jmena)].filter(Boolean).join(' — ') || undefined}
              right={chipStavu(n) ?? (dnesni && dnesniUkoly.get(n.id) ? <ChipVolna u={dnesniUkoly.get(n.id)!} /> : dnesni && dnesData.data && n.active ? <Chip tone="muted" size="sm">{t('Dnes ne')}</Chip> : undefined)}
              // `!flex-none`: na telefonu `.list-actions:only-child > :first-child` natáhne první prvek ocasu přes
              // řádek a „···" by stálo vlevo pod textem; takhle drží vpravo (jako Switch v Katalogu odměn).
              actions={smi ? (
                <span className="!flex-none">
                  <Menu size="sm" label={t('Upravit nebo smazat úkol {nazev}', { nazev: n.title })} items={[
                    { label: t('Upravit…'), icon: 'pencil', onClick: () => setOkno({ polozka: n }) },
                    { label: n.active ? t('Přestat nabízet') : t('Znovu nabízet'), icon: n.active ? 'archive' : 'undo', onClick: () => { void prepniAktivni(n); } },
                    { label: t('Smazat…'), icon: 'trash', danger: true, onClick: () => setMazani(n) },
                  ]} />
                </span>
              ) : undefined} />
          ))}
        </ul>
        </>
      )}
      {chyba && <p className="note note-danger mt-3" role="alert">{chyba}</p>}
      {smi && polozky.length > 0 && !data.error && (
        <Button variant="secondary" icon="plus" className="tap-target mt-4 w-full" onClick={novy}>{t('Nový úkol za body')}</Button>
      )}
      {okno && (
        <NabidkaNavicOkno polozka={okno.polozka} onClose={() => setOkno(null)}
          onHotovo={(_o, nova) => setToast(nova ? t('Úkol za body je vypsaný.') : t('Úkol za body je upravený.'))} />
      )}
      {mazani && (
        <Modal open onClose={() => setMazani(null)} size="sm" title={t('Smazat úkol „{nazev}"?', { nazev: mazani.title })}
          footer={<>
            <Button variant="secondary" onClick={() => setMazani(null)}>{t('Zrušit')}</Button>
            <Button variant="danger-solid" onClick={() => { void smazat(); }} loading={mazu}>{t('Smazat')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{t('Lidé ho přestanou vidět; zápisy, které na něj ukazují, zůstanou i s jeho názvem. Chceš ho jen dočasně schovat? Dej „Přestat nabízet".')}</p>
        </Modal>
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Card>
  );
}

export default SpravaNabidky;
