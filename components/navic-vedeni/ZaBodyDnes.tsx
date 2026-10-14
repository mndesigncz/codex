'use client';

// Dnešek „Úkolů za body" pro vedení (kolo 11, balík V): kdo si co vzal a kdo co splnil,
// kolik míst zbývá a co čeká na uznání. Části sdílí widget „Úkoly za body dnes"
// (odmeny.za_body_tymu) a část „Za body" v Úkolech (SpravaNabidky s `dnesni`).
// Data: GET /api/navic/ukoly?scope=team (useUkolyZaBody) a čekající zápisy
// z /api/navic?scope=team&status=ceka (stejná adresa jako fronta „Čeká na tebe").

import React, { useState } from 'react';
import type { Navic, UkolNavic } from '@/lib/navic';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { Chip, ListRow, PersonChip, Toast } from '../ui';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import { NavicRadek, textOdmeny } from './NavicRadek';
import { UznatNavic, type AkceNavic } from './UznatNavic';
import { textOpakovani, textVolna } from './popisyZaBody';
import type { SouhrnZaBody } from './zaBody';

/** „3 úkoly · 1 volný · 2 vzato · 1 hotovo · až +60 b" (prázdné části se vynechají). */
export function textSouhrnuZaBody(t: PrekladFn, s: SouhrnZaBody): string {
  return [
    t('{n, plural, one {# úkol} few {# úkoly} other {# úkolů}}', { n: s.pocet }),
    s.pocet > 0 ? (s.volne > 0 ? t('{n, plural, one {# volný} few {# volné} other {# volných}}', { n: s.volne }) : t('vše obsazeno')) : null,
    s.vzato > 0 ? t('{n} vzato', { n: s.vzato }) : null,
    s.hotovo > 0 ? t('{n} hotovo', { n: s.hotovo }) : null,
    s.body > 0 ? t('až +{n} b', { n: s.body }) : null,
  ].filter(Boolean).join(' · ');
}

/** Kdo má úkol dnes: pilulky „Eva · vzato" / „Jakub · hotovo", nebo tichá věta. */
export function LideUkolu({ u }: { u: UkolNavic }) {
  const t = useT('widgety');
  if (!u.kdo.length) return <span className="block">{t('Zatím si ho nikdo nevzal.')}</span>;
  return (
    <span className="mt-1 flex flex-wrap gap-1" data-za-body-lide>
      {u.kdo.map(k => (
        <PersonChip key={k.userId} size="sm" name={k.name || t('Člen týmu')} tone={k.stav === 'hotovo' ? 'ok' : 'info'}
          meta={k.stav === 'hotovo' ? t('hotovo') : t('vzato')} />
      ))}
    </span>
  );
}

/** Chip obsazenosti: „1 z 2 volné", „Kdokoli", „Obsazeno". */
export function ChipVolna({ u }: { u: UkolNavic }) {
  const t = useT('widgety');
  const v = textVolna(t, u);
  return <Chip tone={v.plno ? 'muted' : u.nabidka.capacity == null ? 'muted' : 'ok'} size="sm">{v.text}</Chip>;
}

/** Řádek dnešního úkolu za body: název, opakování · +20 b, kdo ho má a kolik míst zbývá. */
export function RadekUkoluDnes({ u }: { u: UkolNavic }) {
  const t = useT('widgety');
  const money = useMoney();
  const n = u.nabidka;
  return (
    <ListRow
      lead={<span aria-hidden className="well grid h-9 w-9 shrink-0 place-items-center text-black/55"><Icon name="tag" size={16} /></span>}
      title={n.title}
      meta={[textOpakovani(t, n), `+${n.points} b`, n.bonusCzk ? money(n.bonusCzk) : null].filter(Boolean).join(' · ')}
      detail={<LideUkolu u={u} />}
      right={<ChipVolna u={u} />} />
  );
}

/**
 * Čekající zápisy z úkolů za body s Uznat / Odmítnout (stávající okno UznatNavic).
 * Bez zápisů nekreslí nic. `nahled` = galerie: tlačítka se nekreslí.
 */
export function FrontaZaBody({ items, smiUznat, strop }: { items: readonly Navic[]; smiUznat: boolean; strop?: number }) {
  const t = useT('widgety');
  const money = useMoney();
  const [rozhoduji, setRozhoduji] = useState<{ z: Navic; akce: AkceNavic } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  if (!items.length && !toast) return null;
  const videt = strop != null ? items.slice(0, strop) : items;
  return (
    <div data-za-body-fronta>
      {items.length > 0 && (
        <>
          <p className="t-label">{t('Čeká na uznání')}</p>
          <ul className="list">
            {videt.map(z => (
              <NavicRadek key={z.id} z={z} smiUznat={smiUznat}
                onUznat={x => setRozhoduji({ z: x, akce: 'uznat' })} onOdmitnout={x => setRozhoduji({ z: x, akce: 'odmitnout' })} />
            ))}
          </ul>
          {items.length > videt.length && (
            <p className="t-meta mt-1">{t('…a {n, plural, one {# další} few {# další} other {# dalších}}', { n: items.length - videt.length })}</p>
          )}
        </>
      )}
      {rozhoduji && (
        <UznatNavic zapis={rozhoduji.z} akce={rozhoduji.akce} onClose={() => setRozhoduji(null)}
          onHotovo={(item, akce) => setToast(akce === 'uznat' ? t('Uznáno: {odmena}', { odmena: textOdmeny(t, item, money) }) : t('Odmítnuto.'))} />
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
