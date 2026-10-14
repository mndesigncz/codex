'use client';

// Widget „Moje tresty" (moje-smeny.tresty, kolo 10 — balík Z): co mi vedení vytklo,
// co za to bylo a jestli jsem to potvrdil(a). Vlastní tresty vidí každý člen bez
// oprávnění (vedení svoje vlastní; tým má widget odmeny.tresty_tymu balíku V).
//
//  - S: „1 trest k potvrzení" + nejnovější nepotvrzený (text, dopad) a „Beru na
//    vědomí"; bez nepotvrzených „Tento měsíc bez trestů" / „2 tresty · −30 b".
//    Na Přehledu (Domů) se malá karta bez nepotvrzených v klidu nekreslí vůbec
//    (prazdno={null} — stejný mechanismus jako Zpětná vazba na Odměnách): nahoře
//    stojí jen tehdy, když je co potvrdit;
//  - M: posledních 5 (nepotvrzené a sporné nahoře), řádek: text, den · položka
//    sazebníku · kdo dal, chip stavu, dopad „−10 b · krácení 300";
//  - L: souhrn měsíce, Segmented Vše / Platné / Zrušené a celý seznam; měsíc přepíná
//    rychlý filtr v hlavičce (`obdobi` z katalogu).
// Zrušené mají přeškrtnutý dopad a „Zrušeno: <poznámka>". Klepnutí na řádek otevře
// DetailTrestu. Data: GET /api/tresty (vlastní, 90 dní — pokryje tento i minulý
// měsíc celý), jedna odpověď pro všechny velikosti i okno (useDataTresty).
// Metadata v lib/widgety/katalog/moje-smeny.ts, registrace v
// components/widgety/oblasti/moje-smeny.tsx (KOMPONENTY).

import { useMemo, useState } from 'react';
import { Button, EmptyState, ListRow, Segmented, Toast } from '../ui';
import { Widget, useWidget } from '../widgety/Widget';
import { useMoney } from '../CurrencyProvider';
import type { WidgetProps } from '@/lib/widgety/typy';
import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum, fmtMesic } from '@/lib/i18n/format';
import { pragueToday } from '@/lib/pragueTime';
import { apiMessage, okJson } from '@/lib/api';
import { minulyMesic } from '@/lib/odmenyPrehled';
import { URL_TRESTY, souhrnTrestu, urlTresty, type SouhrnTrestu, type Trest } from '@/lib/tresty';
import { filtrujTresty, nepotvrzene, poctyFiltru, trestyMesice, type FiltrTrestu } from './logika';
import { StavTrestuChip, bodyDolu, dopadTrestu } from './kusy';
import { obnovTresty, useDataTresty } from './data';
import { DetailTrestu } from './DetailTrestu';

/** Kolik řádků ukáže střední karta. */
const RADKU_M = 5;

export function TrestyWidget({ velikost, nastaveni, nahled }: WidgetProps<{ obdobi?: 'tento' | 'minuly' }>) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const money = useMoney();
  const { pohledStranky } = useWidget();
  const dnes = pragueToday();
  const vcera = pragueToday(-1);
  const tentoMesic = dnes.slice(0, 7);
  const minuly = nastaveni.obdobi === 'minuly';
  const mesic = minuly ? minulyMesic(tentoMesic) : tentoMesic;
  const data = useDataTresty(urlTresty());
  const vse = useMemo(() => data.data?.items ?? [], [data.data]);
  const items = useMemo(() => trestyMesice(vse, mesic), [vse, mesic]);
  const souhrn = useMemo(() => souhrnTrestu(vse, mesic), [vse, mesic]);
  const kPotvrzeni = useMemo(() => nepotvrzene(vse), [vse]);
  const [otevreny, setOtevreny] = useState<number | null>(null);
  const [filtr, setFiltr] = useState<FiltrTrestu>('vse');
  const [potvrzuji, setPotvrzuji] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad'; id: number } | null>(null);
  const nazevMesice = fmtMesic(mesic, { jazyk });
  const detail = otevreny != null ? vse.find(x => x.id === otevreny) ?? null : null;

  const denKratce = (d: string) => (d === dnes ? t('Dnes') : d === vcera ? t('Včera') : fmtDatum(d, { jazyk, styl: 'denKratce' }));

  const beruNaVedomi = async (tr: Trest) => {
    if (nahled || potvrzuji) return;
    setPotvrzuji(true);
    try {
      await fetch(`${URL_TRESTY}/${tr.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seen: true }) }).then(okJson);
      setToast({ text: t('Vzato na vědomí.'), tone: 'ok', id: Date.now() });
      obnovTresty();
    } catch (e) {
      setToast({ text: apiMessage(e, t('Potvrzení se neuložilo — zkontroluj připojení.')), tone: 'bad', id: Date.now() });
    }
    setPotvrzuji(false);
  };

  const okna = (
    <>
      <DetailTrestu trest={detail} vsechny={vse} nahled={nahled} onClose={() => setOtevreny(null)} />
      <Toast message={toast?.text ?? null} tone={toast?.tone} id={toast?.id} onClose={() => setToast(null)} />
    </>
  );

  if (velikost === 'S') {
    const prvni = kPotvrzeni[0] ?? null;
    // Přehled (Domů): nahoře jen tehdy, když je co potvrdit — jinak se v klidu nekreslí.
    const skryt = pohledStranky === 'home' && !!data.data && !prvni;
    return (
      <>
        <Widget nacteni={data} kostra="text" prazdno={skryt ? null : undefined}>
          {prvni ? (
            <div className="space-y-2" data-tresty-k-potvrzeni={kPotvrzeni.length}>
              <p className="t-label">{t('{n, plural, one {# trest k potvrzení} few {# tresty k potvrzení} other {# trestů k potvrzení}}', { n: kPotvrzeni.length })}</p>
              <button type="button" onClick={() => setOtevreny(prvni.id)} disabled={nahled}
                className="block w-full min-w-0 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542]">
                <span className="block text-[15px] font-medium leading-snug text-[#16181A] line-clamp-3 break-words text-pretty">{prvni.text}</span>
                <span className="block t-meta mt-0.5 tabular-nums">
                  <span className="cz-sentence inline-block">{denKratce(prvni.day)}</span> · {dopadTrestu(t, prvni, money)}
                </span>
              </button>
              <Button variant="primary" block icon="check" loading={potvrzuji} disabled={nahled} onClick={() => void beruNaVedomi(prvni)} className="w-full justify-center" data-beru-na-vedomi>
                {t('Beru na vědomí')}
              </Button>
            </div>
          ) : (
            <div data-tresty-souhrn-s>
              <p className="t-label cz-sentence">{nazevMesice}</p>
              <p className="mt-1 text-[17px] font-semibold leading-snug text-[#16181A] text-pretty tabular-nums">
                {souhrn.pocet === 0
                  ? (minuly ? t('Minulý měsíc bez trestů') : t('Tento měsíc bez trestů'))
                  : souhrnKratce(t, souhrn, money)}
              </p>
            </div>
          )}
        </Widget>
        {okna}
      </>
    );
  }

  const L = velikost === 'L';
  const pocty = poctyFiltru(items);
  const videt = L ? filtrujTresty(items, filtr) : items.slice(0, RADKU_M);

  // Vyjádření jen ve velké kartě: střední se nad 300 px zkracuje pod „Zobrazit vše" a dva řádky
  // vlastního textu by vytlačily nepotvrzené tresty pod odlesk (vyjádření nese i detail).
  const radek = (tr: Trest) => {
    const zruseno = tr.status === 'zruseno';
    return (
      <ListRow key={tr.id} onClick={() => setOtevreny(tr.id)}
        title={<span className="block whitespace-normal text-pretty line-clamp-2 break-words">{tr.text}</span>}
        meta={<>
          <span className="cz-sentence inline-block">{denKratce(tr.day)}</span>
          {tr.typeTitle && <> · {tr.typeTitle}</>}
          {tr.givenByName && <> · {t('dal(a) {jmeno}', { jmeno: tr.givenByName })}</>}
        </>}
        detail={zruseno ? (tr.cancelNote ? t('Zrušeno: {poznamka}', { poznamka: tr.cancelNote }) : undefined)
          : L && tr.response ? t('Tvoje vyjádření: {text}', { text: tr.response.length > 90 ? `${tr.response.slice(0, 90)}…` : tr.response }) : undefined}
        right={<StavTrestuChip trest={tr} />}
        value={<span className={zruseno ? 'line-through text-black/45' : undefined} data-dopad>{tr.points ? bodyDolu(t, tr.points) : tr.bonusCut ? `−${money(tr.bonusCut)}` : t('Napomenutí')}</span>}
        valueMeta={tr.points && tr.bonusCut ? <span className={zruseno ? 'line-through' : undefined}>{t('krácení {castka}', { castka: money(tr.bonusCut) })}</span>
          : !tr.points && tr.bonusCut ? t('krácení prémie') : undefined} />
    );
  };

  const prazdnoText = minuly ? t('Minulý měsíc bez trestů.') : t('Tento měsíc bez trestů.');

  return (
    <>
      <Widget nacteni={data}
        prazdno={data.data && items.length === 0 ? (
          <EmptyState compact illustration="odmeny" title={minuly ? t('Minulý měsíc bez trestů') : t('Tento měsíc bez trestů')}
            hint={t('Když vedení něco vytkne, uvidíš to tady a potvrdíš, že o tom víš.')} />
        ) : undefined}>
        <div className="space-y-3" data-tresty-widget={velikost}>
          {L && <p className="t-meta tabular-nums text-pretty" data-tresty-souhrn><span className="cz-sentence inline-block">{nazevMesice}</span>: {souhrnDlouze(t, souhrn, money)}</p>}
          {L && (
            <Segmented size="sm" ariaLabel={t('Stav')} value={filtr} onChange={setFiltr}
              options={[{ id: 'vse', label: t('Vše') }, { id: 'plati', label: t('Platné'), count: pocty.plati }, { id: 'zruseno', label: t('Zrušené'), count: pocty.zruseno }]} />
          )}
          {videt.length > 0 ? (
            <ul className="list" data-tresty-seznam>{videt.map(radek)}</ul>
          ) : (
            <p className="t-meta">{L ? t('Žádný trest v tomhle stavu.') : prazdnoText}</p>
          )}
          {!L && items.length > videt.length && <p className="t-meta">{t('…a {n, plural, one {# další} few {# další} other {# dalších}}', { n: items.length - videt.length })}</p>}
        </div>
      </Widget>
      {okna}
    </>
  );
}

/** Malá karta bez nepotvrzených: „2 tresty · −30 b" (napomenutí bez bodů jen počtem). */
function souhrnKratce(t: PrekladFn, s: SouhrnTrestu, money: (n: number) => string): string {
  const casti = [t('{n, plural, one {# trest} few {# tresty} other {# trestů}}', { n: s.pocet })];
  if (s.body) casti.push(bodyDolu(t, s.body));
  if (s.kraceni) casti.push(t('krácení {castka}', { castka: money(s.kraceni) }));
  return casti.join(' · ');
}

/** Souhrn měsíce ve velké kartě: „2 tresty · −30 b · krácení 300 · 1 napomenutí · 1 zrušený". */
function souhrnDlouze(t: PrekladFn, s: SouhrnTrestu, money: (n: number) => string): string {
  if (s.pocet === 0 && s.zrusenych === 0) return t('bez trestů');
  const casti = [souhrnKratce(t, s, money)];
  if (s.napomenuti) casti.push(t('z toho napomenutí: {n}', { n: s.napomenuti }));
  if (s.zrusenych) casti.push(t('{n, plural, one {# zrušený} few {# zrušené} other {# zrušených}}', { n: s.zrusenych }));
  return casti.join(' · ');
}

export default TrestyWidget;
