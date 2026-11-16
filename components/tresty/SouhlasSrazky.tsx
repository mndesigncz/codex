'use client';

// Souhlas se srážkou ze mzdy (kolo 96, docs/TRESTY-PENIZE.md 4.5): karta v detailu trestu, když srážka
// nebo náhrada škody čeká na souhlas zaměstnance. Bez souhlasu se nic nestrhne (dohoda o srážkách ze mzdy).
//
//  - celé znění dohody tak, jak ho poslal server (item.penize.srazky[].zneni) — žádné zkracování;
//  - „Souhlasím se srážkou X" pošle přesně to znění; když se mezitím změnilo (409 + nové `zneni`),
//    ukáže nové znění s upozorněním a nechá potvrdit znovu;
//  - „Nesouhlasím" otevře nepovinné „proč" (do 300 znaků) a „Odeslat nesouhlas"; vedení dostane push.
// Po odpovědi se obnoví tresty, srážky i výplaty (obnovPenize) — karta zmizí a srážka ukáže stav.
// Tón: věcně, bez vykřičníků; primární akce jedna (Souhlasím), Nesouhlasím je stejně dosažitelné, ne schované.

import { useEffect, useId, useState } from 'react';
import { Button, Field, Textarea, Well } from '../ui';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { apiMessage } from '@/lib/api';
import { MAX_DELKA_POZNAMKY } from '@/lib/tresty';
import type { SrazkaTrestu } from '@/lib/trestyPenize';
import { nesouhlasSeSrazkou } from '../tresty-penize/data';
import { souhlasimSeSrazkou } from './data';
import { VETA_DLOUHY_DUVOD, VETA_ZMENENE_ZNENI, validujDuvod } from './logika';

/** Věty serveru k souhlasu / nesouhlasu přeložené výslovně (check-i18n je vidí jen jako t('…')). */
export function prelozHlaskuSrazky(t: PrekladFn, veta: string): string {
  switch (veta) {
    case VETA_ZMENENE_ZNENI: return t('Znění dohody se mezitím změnilo — přečti si ho znovu.');
    case VETA_DLOUHY_DUVOD: return t('Vyjádření je moc dlouhé (nejvýš 300 znaků).');
    case 'Srážka už nečeká na souhlas.': return t('Srážka už nečeká na souhlas.');
    case 'Trest je zrušený — srážka už neplatí.': return t('Trest je zrušený — srážka už neplatí.');
    case 'Souhlasit se srážkou může jen ten, koho se týká.': return t('Souhlasit se srážkou může jen ten, koho se týká.');
    case 'Srážka nenalezena.': return t('Srážka nenalezena.');
    default: return veta;
  }
}

export function SouhlasSeSrazkou({ srazka, nahled = false, onHotovo }: {
  srazka: SrazkaTrestu;
  /** Galerie / náhled: tlačítka nic neodešlou. */
  nahled?: boolean;
  /** Po uložení (souhlas i nesouhlas): věta do Toastu. */
  onHotovo: (veta: string) => void;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const idNadpisu = useId();
  const [noveZneni, setNoveZneni] = useState<string | null>(null);
  const [nesouhlas, setNesouhlas] = useState(false);
  const [duvod, setDuvod] = useState('');
  const [chyba, setChyba] = useState<string | null>(null);
  const [ukladam, setUkladam] = useState<'souhlas' | 'nesouhlas' | null>(null);

  // Jiná srážka = čisté čtení. Nové znění ze serveru (po přenačtení) přebije to z 409, jen když se liší.
  useEffect(() => { setNoveZneni(null); setNesouhlas(false); setDuvod(''); setChyba(null); setUkladam(null); }, [srazka.id]);
  useEffect(() => { if (noveZneni && srazka.zneni === noveZneni) setNoveZneni(null); }, [srazka.zneni, noveZneni]);
  const zneni = noveZneni ?? srazka.zneni;
  const castka = money(srazka.castka);

  const souhlas = async () => {
    if (!zneni || ukladam || nahled) return;
    setUkladam('souhlas');
    setChyba(null);
    try {
      const v = await souhlasimSeSrazkou(srazka.id, zneni);
      if (!v.ok) {
        setNoveZneni(v.zneni);
        setChyba(prelozHlaskuSrazky(t, v.chyba));
      } else {
        onHotovo(t('Souhlas uložen — srážka se uplatní ve výplatě.'));
      }
    } catch (e) {
      setChyba(prelozHlaskuSrazky(t, apiMessage(e, t('Souhlas se neuložil — zkontroluj připojení.'))));
    }
    setUkladam(null);
  };

  const odesliNesouhlas = async () => {
    if (ukladam || nahled) return;
    const v = validujDuvod(duvod);
    if (!v.ok) { setChyba(prelozHlaskuSrazky(t, v.chyba)); return; }
    setUkladam('nesouhlas');
    setChyba(null);
    try {
      await nesouhlasSeSrazkou(srazka.id, v.duvod ?? undefined);
      onHotovo(t('Nesouhlas odeslán — vedení se ti ozve.'));
    } catch (e) {
      setChyba(prelozHlaskuSrazky(t, apiMessage(e, t('Nesouhlas se neodeslal — zkontroluj připojení.'))));
    }
    setUkladam(null);
  };

  const zmeneno = noveZneni != null;
  return (
    <section className="card-wait border rounded-2xl p-4 space-y-3" aria-labelledby={idNadpisu} data-souhlas-srazky={srazka.id}>
      <div className="space-y-1">
        <h3 id={idNadpisu} className="text-[15px] font-semibold leading-snug text-[#16181A] text-pretty">
          {srazka.druh === 'nahrada' ? t('Souhlasíš s náhradou škody {castka}?', { castka }) : t('Souhlasíš se srážkou {castka}?', { castka })}
        </h3>
        <p className="t-meta text-pretty">
          {srazka.splatky > 1
            ? t('Strhne se ve {n} splátkách, až když souhlasíš. Bez souhlasu se ze mzdy nic nestrhne.', { n: srazka.splatky })
            : t('Strhne se z výplaty, až když souhlasíš. Bez souhlasu se ze mzdy nic nestrhne.')}
        </p>
      </div>

      {zmeneno && (
        <p className="note note-wait flex items-start gap-2 text-pretty" role="status" data-zneni-zmeneno>
          <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
          <span>{t('Znění se mezitím změnilo — přečti si nové a potvrď znovu.')}</span>
        </p>
      )}

      <div>
        <p className="field-label">{t('Dohoda o srážce ze mzdy')}</p>
        <Well pad="sm">
          {/* Celé znění, jak ho server uloží k souhlasu — nezkracovat (právní text, zůstává česky). */}
          <blockquote className="text-sm leading-relaxed text-[#16181A] whitespace-pre-line break-words text-pretty" lang="cs" data-zneni>
            {zneni ?? t('Znění dohody se nenačetlo — zavři okno a otevři ho znovu.')}
          </blockquote>
        </Well>
      </div>

      {nesouhlas && (
        <Field id={`duvod-${srazka.id}`} label={t('Proč nesouhlasíš (nepovinné)')}
          hint={<span className="flex justify-between gap-2"><span>{t('Vedení to uvidí.')}</span><span className="tabular-nums shrink-0" aria-live="polite">{duvod.length}/{MAX_DELKA_POZNAMKY}</span></span>}>
          <Textarea id={`duvod-${srazka.id}`} value={duvod} rows={3} maxLength={MAX_DELKA_POZNAMKY} autoFocus
            onChange={e => { setDuvod(e.target.value); if (chyba) setChyba(null); }}
            placeholder={t('Např. mlýnek byl rozbitý už předtím.')} data-duvod-nesouhlasu />
        </Field>
      )}

      {chyba && <p className="note note-danger text-sm text-pretty" role="alert" data-chyba-souhlasu>{chyba}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {nesouhlas ? (
          <>
            <Button variant="secondary" onClick={() => { setNesouhlas(false); setChyba(null); }} disabled={ukladam != null}>{t('Zpět')}</Button>
            <Button variant="secondary" icon="send" loading={ukladam === 'nesouhlas'} disabled={nahled} onClick={() => void odesliNesouhlas()} data-odeslat-nesouhlas>
              {t('Odeslat nesouhlas')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" icon="close" onClick={() => { setNesouhlas(true); setChyba(null); }} disabled={nahled || ukladam != null} data-nesouhlasim>
              {t('Nesouhlasím')}
            </Button>
            <Button variant="primary" icon="check" loading={ukladam === 'souhlas'} disabled={nahled || !zneni} onClick={() => void souhlas()} data-souhlasim>
              {t('Souhlasím se srážkou {castka}', { castka })}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

export default SouhlasSeSrazkou;
