'use client';

// Filtry úkolů: hledání, záložky stavu s počty (Vše / Po termínu / Dnes / Tento týden / Později / Hotové)
// a panel „Filtry" (priorita, druh úkolu, dny v týdnu termínu, řazení). Člověk se vybírá zvlášť u volajícího.
// Počty u záložek počítá lib/ukolyFiltr.ts při ostatních filtrech, takže sedí se seznamem pod nimi.
//
// Kompaktní podoba na telefonu (`kompaktniNaTelefonu`, Úkoly zaměstnance — audit kola 6, Z3): ovládání
// je jeden řádek jako u Rozvrhu — vlevo slot volajícího (přepínač Seznam/Týden/Měsíc), vpravo lupa
// a „Filtry · n". Pole hledání se rozbalí pod řádek až po klepnutí na lupu (nebo když je co hledat)
// a záložky stavu se kreslí jen u delšího seznamu nebo se zapnutým stavem. První úkol tak začíná
// na první obrazovce, ne pod čtyřmi řádky ovládání. Od md beze změny.

import { useRef, useState } from 'react';
import { Button, Segmented, SearchField } from '../ui';
import { Icon } from '../Icons';
import { useT } from '@/lib/i18n/client';
import { aktualniJazyk } from '@/lib/i18n/stav';
import {
  VYCHOZI_FILTR, pocetFiltru, type FiltrUkolu, type PoctyStavu, type PrioritaUkolu, type RazeniUkolu, type StavUkolu, type ZdrojUkolu,
} from '@/lib/ukolyFiltr';

export interface ClovekFiltru { id: number | 'volne'; label: string; n: number }

export function UkolyFiltry({ filtr, onChange, pocty, skrytStav = false, lide = [], className = '', kompaktniNaTelefonu = false, pilulkyNaTelefonu = true, vlevoNaTelefonu }: {
  filtr: FiltrUkolu;
  onChange: (f: FiltrUkolu) => void;
  pocty: PoctyStavu;
  /** Týden a měsíc ukazují úkoly podle dnů, takže záložky stavu tam nedávají smysl. */
  skrytStav?: boolean;
  /** Lidé, podle kterých jde filtrovat (jen vedení, které vidí úkoly celého týmu). */
  lide?: ClovekFiltru[];
  className?: string;
  /** Telefon (pod md): hledání sbalené do lupy, ovládání v jednom řádku. */
  kompaktniNaTelefonu?: boolean;
  /** Kompaktně: kreslit na telefonu záložky stavu i bez zapnutého stavu (volající je vypne u krátkého seznamu). */
  pilulkyNaTelefonu?: boolean;
  /** Kompaktně: obsah na začátek řádku, jen na telefonu (od md ho volající kreslí jinde). */
  vlevoNaTelefonu?: React.ReactNode;
}) {
  const t = useT('widgety');
  const loc = aktualniJazyk();
  const [otevreno, setOtevreno] = useState(false);
  // Hledání sbalené do lupy zůstane rozbalené, dokud je co hledat.
  const [hledaniOtevreno, setHledaniOtevreno] = useState(false);
  const radekRef = useRef<HTMLDivElement>(null);
  // Pole je v DOM pořád (jen schované), takže autoFocus by nezabral — fokus se dá ručně, až se ukáže.
  const otevriHledani = () => { setHledaniOtevreno(true); requestAnimationFrame(() => radekRef.current?.querySelector('input')?.focus()); };
  const hledaniSbalene = kompaktniNaTelefonu && !hledaniOtevreno && !filtr.hledat;
  const pilulkyJenOdMd = kompaktniNaTelefonu && !pilulkyNaTelefonu && filtr.stav === 'vse';
  const kdoZapnuto = lide.length > 0 && filtr.kdo !== 'all';
  const n = pocetFiltru(filtr) + (kdoZapnuto ? 1 : 0);
  const kdoJmeno = lide.find(l => l.id === filtr.kdo)?.label ?? '';
  const nastav = (cast: Partial<FiltrUkolu>) => onChange({ ...filtr, ...cast });
  const jmenoDne = (i: number) => new Date(`2024-01-0${i + 1}T12:00:00`).toLocaleDateString(loc, { weekday: 'short' });

  const stavy: { id: StavUkolu; label: string }[] = [
    { id: 'vse', label: t('Vše') },
    { id: 'po_terminu', label: t('Po termínu') },
    { id: 'dnes', label: t('Dnes') },
    { id: 'tyden', label: t('Tento týden') },
    { id: 'pozdeji', label: t('Později') },
    { id: 'bez_terminu', label: t('Bez termínu') },
    { id: 'hotove', label: t('Hotové') },
  ];
  // Prázdné záložky se neukazují (kromě „Zbývá" a zvolené), ať lišta nemá sedm čísel s nulou.
  const viditelne = stavy.filter(s => s.id === 'vse' || s.id === filtr.stav || pocty[s.id] > 0);

  const prio: { id: PrioritaUkolu; label: string }[] = [{ id: 'high', label: t('Vysoká') }, { id: 'medium', label: t('Střední') }, { id: 'low', label: t('Nízká') }];
  const prepniPrioritu = (p: PrioritaUkolu) => nastav({ priorita: filtr.priorita.includes(p) ? filtr.priorita.filter(x => x !== p) : [...filtr.priorita, p] });
  const prepniDen = (i: number) => nastav({ dny: filtr.dny.includes(i) ? filtr.dny.filter(x => x !== i) : [...filtr.dny, i].sort() });

  return (
    <div className={`space-y-3 ${className}`} role="group" aria-label={t('Filtry úkolů')}>
      <div ref={radekRef} className={`flex items-center gap-2 min-w-0 ${kompaktniNaTelefonu ? 'max-md:flex-wrap' : ''}`}
        // Prázdné hledání se po odchodu z pole (mimo jeho našeptávač) zase sbalí do lupy.
        onBlur={kompaktniNaTelefonu ? (e => {
          const kam = e.relatedTarget as HTMLElement | null;
          if (!filtr.hledat && !kam?.closest('[role=combobox], [role=listbox]')) setHledaniOtevreno(false);
        }) : undefined}>
        {kompaktniNaTelefonu && vlevoNaTelefonu && <div className="md:hidden min-w-0 shrink">{vlevoNaTelefonu}</div>}
        {/* Na telefonu v kompaktní podobě jde pole na vlastní řádek pod ovládání (order-last + celá šířka). */}
        <SearchField value={filtr.hledat} onChange={v => nastav({ hledat: v })} placeholder={t('Hledat v úkolech…')} ariaLabel={t('Hledat v úkolech')}
          storageKey="ukoly"
          className={`min-w-0 flex-1 ${kompaktniNaTelefonu ? 'max-md:order-last max-md:basis-full' : ''} ${hledaniSbalene ? 'max-md:hidden' : ''}`} />
        {hledaniSbalene && (
          <Button variant="secondary" size="sm" iconOnly icon="search" aria-label={t('Hledat v úkolech')} aria-expanded={false}
            className="md:hidden ml-auto shrink-0" onClick={otevriHledani} />
        )}
        <Button variant="secondary" size="sm" aria-expanded={otevreno} onClick={() => setOtevreno(o => !o)}
          className={`shrink-0 ${kompaktniNaTelefonu && !hledaniSbalene ? 'max-md:ml-auto' : ''}`}>
          {t('Filtry')}{n > 0 ? ` · ${n}` : ''}
        </Button>
      </div>

      {!skrytStav && <div className={`flex gap-1.5 overflow-x-auto scrollbar-thin scroll-fade-x -mx-1 px-1 py-0.5 ${pilulkyJenOdMd ? 'max-md:hidden' : ''}`} role="group" aria-label={t('Stav úkolů')}>
        {viditelne.map(s => (
          <button key={s.id} type="button" aria-pressed={filtr.stav === s.id} onClick={() => nastav({ stav: s.id })}
            className={`filter-pill tap-target-sm shrink-0 ${filtr.stav === s.id ? 'seg-on' : 'seg-off glass'}`}>
            {s.label} · {pocty[s.id]}
          </button>
        ))}
      </div>}

      {kdoZapnuto && (
        <button type="button" onClick={() => nastav({ kdo: 'all' })} aria-label={t('Zrušit filtr: {kdo}', { kdo: kdoJmeno })}
          className="filter-pill tap-target-sm seg-on inline-flex items-center gap-1.5 self-start">
          {kdoJmeno}<Icon name="close" size={12} />
        </button>
      )}

      {otevreno && (
        <div className="well px-4 py-3 space-y-3">
          {lide.length > 1 && (
            <div className="space-y-1.5">
              <p className="t-label">{t('Komu úkol patří')}</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Komu úkol patří')}>
                <button type="button" aria-pressed={filtr.kdo === 'all'} onClick={() => nastav({ kdo: 'all' })}
                  className={`filter-pill tap-target-sm ${filtr.kdo === 'all' ? 'seg-on' : 'seg-off glass'}`}>{t('Všichni')}</button>
                {lide.map(l => (
                  <button key={String(l.id)} type="button" aria-pressed={filtr.kdo === l.id} onClick={() => nastav({ kdo: filtr.kdo === l.id ? 'all' : l.id })}
                    className={`filter-pill tap-target-sm ${filtr.kdo === l.id ? 'seg-on' : 'seg-off glass'}`}>{l.label} · {l.n}</button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <p className="t-label">{t('Priorita')}</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Priorita')}>
              {prio.map(p => (
                <button key={p.id} type="button" aria-pressed={filtr.priorita.includes(p.id)} onClick={() => prepniPrioritu(p.id)}
                  className={`filter-pill tap-target-sm ${filtr.priorita.includes(p.id) ? 'seg-on' : 'seg-off glass'}`}>{p.label}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="t-label">{t('Druh úkolu')}</p>
            <Segmented size="sm" ariaLabel={t('Druh úkolu')} value={filtr.zdroj} onChange={(z: ZdrojUkolu) => nastav({ zdroj: z })}
              options={[{ id: 'vse', label: t('Všechny') }, { id: 'rucni', label: t('Ručně zadané') }, { id: 'vyroba', label: t('Výroba') }, { id: 'opakovane', label: t('Opakované') }, { id: 'povinne', label: t('Před uzávěrkou') }]} />
          </div>
          <div className="space-y-1.5">
            <p className="t-label">{t('Termín připadá na')}</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Dny v týdnu')}>
              {Array.from({ length: 7 }, (_, i) => (
                <button key={i} type="button" aria-pressed={filtr.dny.includes(i)} onClick={() => prepniDen(i)}
                  className={`filter-pill tap-target-sm ${filtr.dny.includes(i) ? 'seg-on' : 'seg-off glass'}`}>{jmenoDne(i)}</button>
              ))}
              <Button variant="ghost" size="sm" onClick={() => nastav({ dny: [0, 1, 2, 3, 4] })}>{t('Pracovní dny')}</Button>
              <Button variant="ghost" size="sm" onClick={() => nastav({ dny: [5, 6] })}>{t('Víkend')}</Button>
              {filtr.dny.length > 0 && <Button variant="ghost" size="sm" onClick={() => nastav({ dny: [] })}>{t('Všechny dny')}</Button>}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="t-label">{t('Řadit podle')}</p>
            <Segmented size="sm" ariaLabel={t('Řadit podle')} value={filtr.razeni} onChange={(r: RazeniUkolu) => nastav({ razeni: r })}
              options={[{ id: 'termin', label: t('Termínu') }, { id: 'priorita', label: t('Priority') }, { id: 'nazev', label: t('Názvu') }, { id: 'nejnovejsi', label: t('Nejnovější') }]} />
          </div>
          {(n > 0 || filtr.hledat || filtr.stav !== 'vse') && (
            <Button variant="ghost" size="sm" icon="close" onClick={() => onChange({ ...VYCHOZI_FILTR })}>{t('Zrušit filtry')}</Button>
          )}
        </div>
      )}
    </div>
  );
}
