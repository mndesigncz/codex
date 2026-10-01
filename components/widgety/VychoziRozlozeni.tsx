'use client';

// Nastavení → Stránky: výchozí rozložení podniku (kolo 68, spec §3.8).
//
// Vedení tu určí, jakou plochu uvidí nový člověk (celé vedení, všichni
// zaměstnanci, tablet, nebo jen jedna role) a případně ji zamkne. Plocha se
// skládá úplně stejně jako u sebe — stejná lišta, galerie a nastavení —
// jen widgety jsou schematické, bez dat: správce vidí, co kde bude, ale
// data jiných lidí mu neprotečou a náhled nepošle jediný datový dotaz.
//
// Seznam nabízí jen stránky, které už plochu mají (`aktivni`); tablet jen
// tomu, kdo tablet spravuje (kiosk.spravovat nebo podnik.nastaveni).

import { useEffect, useId, useState } from 'react';
import { Button, Card, Field, ListRow, PageHeader, Select, Skeleton, SwitchRow } from '../ui';
import type { DefiniceStranky, IdStranky, OdpovedVychozi, Rozhrani, Rozsah } from '@/lib/widgety/typy';
import { stranka as najdiStranku, strankyRozhrani } from '@/lib/widgety/stranky';
import { jeSpravceStranky } from '@/lib/widgety/rozlozeni';
import { apiMessage, okJson } from '@/lib/api';
import { parseDbTime } from '@/lib/pragueTime';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { useOpravneni } from '../role/useOpravneni';
import { PlochaWidgetu } from './PlochaWidgetu';
import { useRozlozeni } from './useRozlozeni';

const SKUPINY: readonly Rozhrani[] = ['vedeni', 'zamestnanec', 'kiosk'];

/** Název skupiny stránek (typ rozhraní). */
function nazevSkupiny(t: PrekladFn, rozhrani: Rozhrani): string {
  if (rozhrani === 'vedeni') return t('Vedení');
  if (rozhrani === 'zamestnanec') return t('Zaměstnanci');
  return t('Tablet');
}

/** „Upraveno 12. 9. · zamčeno" — datum v pražském čase, věta bez velkého písmene uprostřed. */
function popisVychoziho(d: OdpovedVychozi, t: PrekladFn): string {
  if (d.zdroj === 'aplikace') return t('Výchozí z aplikace');
  const kdy = parseDbTime(d.upraveno);
  const datum = kdy ? fmtDatum(kdy, { jazyk: t.jazyk, styl: 'kratce' }) : null;
  return [datum ? t('Upraveno {datum}', { datum }) : t('Upraveno'), d.zamceno ? t('zamčeno') : null].filter(Boolean).join(' · ');
}

function RadekStranky({ stranka, onUpravit }: { stranka: DefiniceStranky; onUpravit: () => void }) {
  const t = useT('widgety');
  const [info, setInfo] = useState<OdpovedVychozi | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  useEffect(() => {
    let zije = true;
    fetch(`/api/rozlozeni/vychozi?stranka=${encodeURIComponent(stranka.id)}&rozsah=${encodeURIComponent(`typ:${stranka.rozhrani}`)}`, { cache: 'no-store' })
      .then(okJson)
      .then(d => { if (zije) setInfo(d); })
      .catch(e => { if (zije) setChyba(apiMessage(e, t('Stav se nenačetl.'))); });
    return () => { zije = false; };
  }, [stranka.id, stranka.rozhrani]);
  return (
    <ListRow
      title={t(stranka.nazev)}
      meta={info ? popisVychoziho(info, t) : chyba ?? t('Načítám…')}
      actions={<Button variant="secondary" size="sm" onClick={onUpravit}>{t('Upravit')}</Button>}
    />
  );
}

function EditorVychoziho({ stranka, onZpet }: { stranka: DefiniceStranky; onZpet: () => void }) {
  const uid = useId();
  const t = useT('widgety');
  const [rozsah, setRozsah] = useState<Rozsah>(`typ:${stranka.rozhrani}`);
  const r = useRozlozeni(stranka.id, { rozsah });
  const zpet = () => { void r.ulozHned().finally(onZpet); };
  const idVyberu = `${uid}-pro-koho`;
  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" icon="chevron" className="-ml-2 [&>svg]:rotate-90" onClick={zpet}>{t('Zpět na stránky')}</Button>
      <div className="grid gap-4 sm:grid-cols-2 items-end">
        <Field id={idVyberu} label={t('Pro koho')} hint={t('Role má přednost před typem: kdo má výchozí pro svou roli, dostane to.')}>
          <Select id={idVyberu} value={rozsah} onChange={e => setRozsah(e.target.value as Rozsah)} disabled={!r.rozsahy.length}>
            {r.rozsahy.length
              ? r.rozsahy.map(x => <option key={x.id} value={x.id}>{`${x.id.startsWith('role:#') ? x.nazev : t(x.nazev)} (${x.clenu})`}</option>)
              : <option value={rozsah}>{t('Načítám…')}</option>}
          </Select>
        </Field>
      </div>
      <Card pad="none" className="px-5">
        <ul className="list">
          <SwitchRow title={t('Zamknout', undefined, 'rozlozeni')} hint={t('Ostatní si stránku nepřestaví. Svoje úpravy dostanou zpátky, až zámek zrušíš.')}
            checked={r.zamceno} disabled={r.nacteni !== 'ok'} onChange={r.nastavZamceno} />
        </ul>
      </Card>
      <PlochaWidgetu
        stranka={stranka.id}
        rezim="vychozi"
        rizeni={r}
        onHotovo={onZpet}
        hlavicka={{
          as: 'h2',
          title: `${t(stranka.nazev)} · ${nazevSkupiny(t, stranka.rozhrani)}`,
          subtitle: t('Widgety jsou jen schematicky — každý v nich uvidí svoje data a jen to, na co má oprávnění.'),
        }}
      />
    </div>
  );
}

export default function VychoziRozlozeni() {
  const { opravneni, nacteno } = useOpravneni();
  const t = useT('widgety');
  const [upravuji, setUpravuji] = useState<IdStranky | null>(null);
  const upravovana = upravuji ? najdiStranku(upravuji) : undefined;
  if (upravovana) return <EditorVychoziho stranka={upravovana} onZpet={() => setUpravuji(null)} />;

  // Do načtení oprávnění se nic nenabízí — vedení se správou podniku vidí vše,
  // správce tabletu jen tablet (server by jinou stránku odmítl 403).
  const skupiny = SKUPINY
    .filter(rozhrani => nacteno && jeSpravceStranky(opravneni, { rozhrani }))
    .map(rozhrani => ({ rozhrani, stranky: strankyRozhrani(rozhrani, true) }))
    .filter(s => s.stranky.length > 0);

  return (
    <div className="space-y-5">
      <PageHeader as="h2" title={t('Rozložení stránek')}
        subtitle={t('Výchozí plocha pro nové lidi a tablet. Každý si ji pak upraví po svém, pokud ji nezamkneš.')} />
      {!nacteno ? (
        <Card><div className="space-y-3"><Skeleton className="h-5 w-40 rounded-full" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div></Card>
      ) : skupiny.length === 0 ? (
        <p className="t-meta">{t('Zatím tu není žádná stránka, jejíž plochu bys mohl nastavit.')}</p>
      ) : (
        <Card pad="none" className="px-5">
          {skupiny.map((s, i) => (
            <section key={s.rozhrani} aria-labelledby={`stranky-${s.rozhrani}`} className={i > 0 ? 'border-t border-[var(--surface-line)]' : ''}>
              <h3 id={`stranky-${s.rozhrani}`} className="t-label pt-4 pb-1">{nazevSkupiny(t, s.rozhrani)}</h3>
              <ul className="list">
                {s.stranky.map(st => <RadekStranky key={st.id} stranka={st} onUpravit={() => setUpravuji(st.id)} />)}
              </ul>
            </section>
          ))}
        </Card>
      )}
    </div>
  );
}
