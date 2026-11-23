'use client';

// Peníze u trestu v seznamech vedení (kolo 96, sada V): řádek trestu (TrestRadek) ukáže srážky
// a náhrady se stavem souhlasu (čeká na souhlas / uplatněno / nesouhlasí / zrušeno), komu stržené
// peníze přejdou (záskok) a že jde o hromadný trest. Okna akcí: Snížit srážku, Zrušit srážku,
// Znovu požádat o souhlas (po nesouhlasu) a Změnit záskok — volá je useAkceTrestu (AkceTrestu.tsx).
// Fronta „Nesouhlasí se srážkou" pro widget Tresty v týmu je tu taky (FrontaSrazek).
//
// Texty jen přes t(); částky v měně podniku (useMoney). Akce z components/tresty-penize/data.ts
// (jádro) po úspěchu samy obnoví tresty, srážky i výplaty.

import React, { useState } from 'react';
import { stavSrazky, type SrazkaTrestu } from '@/lib/trestyPenize';
import type { Trest } from '@/lib/tresty';
import { apiMessage, okJson } from '@/lib/api';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { pragueToday } from '@/lib/pragueTime';
import { Avatar, Button, Chip, Field, Input, ListRow, Modal } from '../ui';
import { useMoney, useSymbol } from '../CurrencyProvider';
import {
  obnovPenize, snizSrazku, urlSrazek, urlVyberu, useSrazky, useVyberLidi, zrusSrazku, znovuOSouhlas, type RadekSrazky,
} from '../tresty-penize/data';
import { obnovTresty } from './data';
import { NadPlochou } from './DatTrest';
import { prelozHlaskuTrestu } from './hlasky';
import { platnePrevody, platneSrazky, prazdnePenize, teloZaskoku, type FormularPenez } from './penize';
import { SekceZaskoku } from './PenizeVOkne';

/** „Náhrada škody 2 000 Kč" / „Srážka 500 Kč · 3 výplaty" (přeložené). */
export function textSrazky(t: PrekladFn, s: Pick<SrazkaTrestu, 'druh' | 'castka' | 'splatky'>, money: (n: number) => string): string {
  const co = s.druh === 'nahrada' ? t('Náhrada škody {castka}', { castka: money(s.castka) }) : t('Srážka {castka}', { castka: money(s.castka) });
  return s.splatky > 1 ? `${co} · ${t('{n} výplat', { n: s.splatky })}` : co;
}

/** Chip stavu srážky (tón a přeložený text). */
export function ChipSrazky({ stav }: { stav: SrazkaTrestu['stav'] }) {
  const t = useT('widgety');
  const s = stavSrazky(stav);
  return <Chip tone={s.tone} size="sm">{prelozHlaskuTrestu(t, s.text)}</Chip>;
}

/** Peněžní řádky v detailu trestu: srážky se stavem, nesouhlas, záskok, dávka. */
export function PenizeVRadku({ x, davka }: { x: Trest; davka?: number }) {
  const t = useT('widgety');
  const money = useMoney();
  const srazky = platneSrazky(x.penize);
  const prevody = platnePrevody(x.penize);
  if (!srazky.length && !prevody.length && !(davka && davka > 1) && !x.batchId) return null;
  return (
    <span className="mt-1 block space-y-1" data-trest-penize-radek>
      {srazky.map(s => (
        <span key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1" data-srazka={s.id} data-srazka-stav={s.stav}>
          <span className="tabular-nums text-[#16181A]">{textSrazky(t, s, money)}</span>
          <ChipSrazky stav={s.stav} />
          {s.stav === 'nesouhlas' && s.nesouhlasDuvod && <span className="block w-full text-black/60">{t('Nesouhlasí: {text}', { text: s.nesouhlasDuvod })}</span>}
        </span>
      ))}
      {prevody.length > 0 && (
        <span className="block text-black/60 tabular-nums" data-trest-zaskok-radek>
          {t('Přejde: {komu}', { komu: prevody.map(p => `${p.userName ?? t('kolega')} ${money(p.castka)}`).join(', ') })}
        </span>
      )}
      {x.batchId ? (
        <span className="block text-black/55" data-trest-davka={x.batchId}>
          {davka && davka > 1 ? t('Hromadný trest · {n} lidí', { n: davka }) : t('Hromadný trest')}
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Okna akcí nad srážkou a záskokem
// ---------------------------------------------------------------------------

/** Snížit srážku (zvýšit nejde — přidá se nová) nebo ji zrušit s nepovinnou poznámkou. */
export function UpravaSrazky({ x, s, akce, onClose, onHotovo, nadOkny = false }: {
  x: Pick<Trest, 'userName' | 'text'>;
  s: Pick<SrazkaTrestu, 'id' | 'druh' | 'castka' | 'splatky' | 'stav'>;
  akce: 'snizit' | 'zrusit';
  onClose: () => void;
  onHotovo?: (text: string) => void;
  nadOkny?: boolean;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const symbol = useSymbol();
  const [castka, setCastka] = useState(String(Math.max(0, s.castka - 1)));
  const [pozn, setPozn] = useState('');
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const uloz = async () => {
    if (ukladam) return;
    const n = Number(castka);
    if (akce === 'snizit' && !(Number.isInteger(n) && n > 0 && n < s.castka)) { setChyba(t('Nová částka musí být menší než {castka} a víc než 0.', { castka: money(s.castka) })); return; }
    setUkladam(true); setChyba(null);
    try {
      if (akce === 'snizit') await snizSrazku(s.id, n);
      else await zrusSrazku(s.id, pozn.trim() || undefined);
      onHotovo?.(akce === 'snizit' ? t('Srážka snížena na {castka}.', { castka: money(n) }) : t('Srážka zrušená — nic se nestrhne.'));
      onClose();
    } catch (e) {
      setChyba(prelozHlaskuTrestu(t, apiMessage(e, t('Nepodařilo se uložit.'))));
    } finally {
      setUkladam(false);
    }
  };
  return (
    <NadPlochou>
      <Modal open onClose={onClose} size="sm" nadOkny={nadOkny} title={akce === 'snizit' ? t('Snížit srážku') : t('Zrušit srážku')} subtitle={x.userName}
        footer={<>
          <Button variant="secondary" onClick={onClose}>{t('Zpět')}</Button>
          <Button variant={akce === 'zrusit' ? 'danger-solid' : 'primary'} loading={ukladam} onClick={() => { void uloz(); }}>
            {akce === 'snizit' ? t('Snížit') : t('Zrušit srážku')}
          </Button>
        </>}>
        <div className="sloupec sloupec-4" data-uprava-srazky={akce}>
          <p className="well px-3 py-2 text-sm text-[#16181A] text-pretty">{x.text}</p>
          <p className="text-sm text-black/70 tabular-nums">{textSrazky(t, s, money)}</p>
          {akce === 'snizit' ? (
            <Field id="srazka-nova" label={t('Nová částka')} hint={t('Zvýšit nejde — na zbytek přidej novou srážku.')} error={chyba}>
              <div className="relative">
                <Input id="srazka-nova" type="number" inputMode="numeric" min={1} max={s.castka - 1} step={1} value={castka} autoFocus
                  onChange={e => { setCastka(e.target.value.replace(/\D/g, '')); setChyba(null); }} className="tabular-nums pr-12" />
                <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
              </div>
            </Field>
          ) : (
            <>
              <p className="text-sm text-black/70 text-pretty">{t('Nic se nestrhne a kolegům, kterým měla částka přejít, se převod přepočítá. {jmeno} dostane oznámení.', { jmeno: x.userName })}</p>
              <Field id="srazka-poznamka" label={t('Důvod (nepovinný)')}>
                <Input id="srazka-poznamka" value={pozn} maxLength={200} onChange={e => setPozn(e.target.value)} />
              </Field>
              {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
            </>
          )}
        </div>
      </Modal>
    </NadPlochou>
  );
}

/** Změnit, komu přejdou stržené peníze (PATCH /api/tresty/[id] { zaskok }). */
export function ZmenitZaskok({ x, onClose, onHotovo, nadOkny = false }: {
  x: Trest;
  onClose: () => void;
  onHotovo?: (text: string) => void;
  nadOkny?: boolean;
}) {
  const t = useT('widgety');
  const symbol = useSymbol();
  const z = x.penize?.zaskok;
  const [f, setF] = useState<FormularPenez>(() => prazdnePenize({
    zaskokKomu: z?.komu ?? 'podnik', zaskokZpusob: z?.zpusob ?? 'rovne',
    zaskokLide: z?.komu === 'lide' ? platnePrevody(x.penize).filter(p => p.userId).map(p => ({ userId: p.userId!, castka: String(p.castka) })) : [],
  }));
  const vyber = useVyberLidi(urlVyberu(x.day, x.closingId));
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const uloz = async () => {
    if (ukladam) return;
    if (f.zaskokKomu === 'lide' && !f.zaskokLide.length) { setChyba(prelozHlaskuTrestu(t, 'Vyber, kdo to napravil.')); return; }
    setUkladam(true); setChyba(null);
    try {
      await fetch(`/api/tresty/${x.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teloZaskoku(f)) }).then(okJson);
      obnovTresty();
      obnovPenize();
      onHotovo?.(t('Uloženo — stržené peníze půjdou, kam jsi vybral(a).'));
      onClose();
    } catch (e) {
      setChyba(prelozHlaskuTrestu(t, apiMessage(e, t('Nepodařilo se uložit.'))));
    } finally {
      setUkladam(false);
    }
  };
  return (
    <NadPlochou>
      <Modal open onClose={onClose} size="md" nadOkny={nadOkny} title={t('Změnit záskok')} subtitle={x.userName}
        footer={<>
          <Button variant="secondary" onClick={onClose}>{t('Zpět')}</Button>
          <Button variant="primary" icon="check" loading={ukladam} onClick={() => { void uloz(); }}>{t('Uložit')}</Button>
        </>}>
        <div className="sloupec sloupec-4" data-zmenit-zaskok>
          <p className="well px-3 py-2 text-sm text-[#16181A] text-pretty">{x.text}</p>
          <SekceZaskoku f={f} zmen={zm => { setF(p => ({ ...p, ...zm })); setChyba(null); }} vyber={vyber.data} vyberNacita={vyber.loading}
            potrestani={[x.userId]} den={x.day} closingId={x.closingId} symbol={symbol} ceka={!!x.penize?.srazky.some(s => s.stav === 'ceka')} />
          <p className="t-meta text-pretty">{t('Dosavadní převody se zruší. Co už přešlo v uzavřeném období, zůstane — rozdíl se srovná v dalším.')}</p>
          {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
        </div>
      </Modal>
    </NadPlochou>
  );
}

/** Po nesouhlasu: požádat znovu (PATCH { znovu: true }) — vrací text toastu. */
export async function pozadejZnovu(t: PrekladFn, s: Pick<SrazkaTrestu, 'id'>, jmeno: string): Promise<{ text: string; tone: 'ok' | 'bad' }> {
  try {
    await znovuOSouhlas(s.id);
    return { text: t('Požádáno znovu — {jmeno} dostal(a) oznámení.', { jmeno }), tone: 'ok' };
  } catch (e) {
    return { text: prelozHlaskuTrestu(t, apiMessage(e, t('Nepodařilo se uložit.'))), tone: 'bad' };
  }
}

// ---------------------------------------------------------------------------
// Fronta nesouhlasů se srážkou (widget Tresty v týmu)
// ---------------------------------------------------------------------------

/** URL fronty nesouhlasů — stejná ve widgetu i v „Čeká na tebe" (jedna mezipaměť). */
export const URL_SRAZKY_NESOUHLAS = urlSrazek({ scope: 'team', stav: 'nesouhlas' });

export function FrontaSrazek({ zapnuto, nahled = false, onToast }: {
  /** Jen s finance.mzdy (GET scope=team jinak 403). */
  zapnuto: boolean;
  nahled?: boolean;
  onToast: (x: { text: string; tone: 'ok' | 'bad' }) => void;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const data = useSrazky(zapnuto ? URL_SRAZKY_NESOUHLAS : null);
  const [pracuji, setPracuji] = useState<number | null>(null);
  const [rusim, setRusim] = useState<RadekSrazky | null>(null);
  const items = (data.data ?? []).filter(s => s.stav === 'nesouhlas' && s.trestPlati);
  if (!zapnuto || !items.length) return null;
  const znovu = async (s: RadekSrazky) => {
    setPracuji(s.id);
    onToast(await pozadejZnovu(t, s, s.userName));
    setPracuji(null);
  };
  return (
    <div className="sloupec sloupec-1" data-fronta-srazek>
      <p className="t-label">{t('Nesouhlasí se srážkou')}</p>
      <ul className="list">
        {items.map(s => (
          <ListRow key={s.id}
            lead={<Avatar emoji={s.userAvatar} name={s.userName} size="sm" />}
            title={s.userName || t('Člen týmu')}
            meta={[fmtDatum(s.day || pragueToday(), { jazyk: t.jazyk, styl: 'denKratce' }), s.text].filter(Boolean).join(' · ')}
            detail={<>
              <span className="block tabular-nums text-[#16181A]">{textSrazky(t, s, money)}</span>
              {s.nesouhlasDuvod && <span className="block text-black/60">{t('Nesouhlasí: {text}', { text: s.nesouhlasDuvod })}</span>}
            </>}
            actions={nahled ? undefined : <>
              <Button variant="secondary" size="sm" className="tap-target" loading={pracuji === s.id} disabled={pracuji === s.id}
                aria-label={t('Znovu požádat o souhlas: {jmeno}', { jmeno: s.userName })} onClick={() => { void znovu(s); }}>{t('Znovu požádat')}</Button>
              <Button variant="ghost" size="sm" className="tap-target" disabled={pracuji === s.id}
                aria-label={t('Zrušit srážku: {jmeno}', { jmeno: s.userName })} onClick={() => setRusim(s)}>{t('Zrušit srážku')}</Button>
            </>} />
        ))}
      </ul>
      {rusim && <UpravaSrazky x={{ userName: rusim.userName, text: rusim.text }} s={rusim} akce="zrusit" onClose={() => setRusim(null)}
        onHotovo={text => onToast({ text, tone: 'ok' })} />}
    </div>
  );
}
