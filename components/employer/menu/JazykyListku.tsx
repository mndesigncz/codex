'use client';

import { useState } from 'react';
import { Button, Chip, Modal, Segmented, SwitchRow } from '../../ui';
import { JAZYKY, JAZYK_NAZEV, type Jazyk } from '@/lib/i18n/config';
import { chybiPreklad, type JazykyListku as Langs } from '@/lib/menu';
import { Icon } from '../../Icons';

// Jazyky lístku: které jazyky host smí zvolit, který je výchozí, a přepínač
// „co právě upravuju". Výchozí jazyk = texty v polích lístku (běžná editace);
// ostatní jazyky se překládají ve zvláštním seznamu (PrekladListku), kde stojí
// výchozí text šedě a prázdné pole znamená „použije se výchozí".
//
// Jedna limetka na obrazovce zůstává u „Uložit" v editoru; tady žádná není.

export default function JazykyListku({ langs, upravLangs, editace, setEditace, deska, zamceno }: {
  langs: Langs;
  upravLangs: (nove: Langs) => void;
  /** Jazyk, který se právě překládá, nebo null = výchozí (běžná editace). */
  editace: Jazyk | null;
  setEditace: (j: Jazyk | null) => void;
  deska: Parameters<typeof chybiPreklad>[0];
  zamceno: boolean;
}) {
  const [otevreno, setOtevreno] = useState(false);
  // Rozpracovaný výběr v okně; uloží se do lístku až tlačítkem v okně.
  const [zapnute, setZapnute] = useState<Set<Jazyk>>(new Set(langs.nabizet));
  const [vychozi, setVychozi] = useState<Jazyk>(langs.vychozi);

  const otevri = () => { setZapnute(new Set(langs.nabizet)); setVychozi(langs.vychozi); setOtevreno(true); };
  const potvrd = () => {
    const nabizet = JAZYKY.filter(j => j === vychozi || zapnute.has(j));
    upravLangs({ vychozi, nabizet: [vychozi, ...nabizet.filter(j => j !== vychozi)] });
    if (editace && !nabizet.includes(editace)) setEditace(null);
    setOtevreno(false);
  };

  const viceJazyku = langs.nabizet.length > 1;
  const preklady = langs.nabizet.filter(j => j !== langs.vychozi);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="t-card flex items-center gap-2"><Icon name="globe" size={17} className="shrink-0 text-black/40" />Jazyky lístku</h2>
          <p className="t-meta mt-1 text-pretty">
            {viceJazyku
              ? `Host si vybere z: ${langs.nabizet.map(j => JAZYK_NAZEV[j]).join(', ')}. Výchozí je ${JAZYK_NAZEV[langs.vychozi]}.`
              : `Lístek je jen v jazyce ${JAZYK_NAZEV[langs.vychozi]}. Přidej další a host si u lístku uvidí přepínač jazyka.`}
          </p>
        </div>
        {!zamceno && <Button variant="secondary" size="sm" className="shrink-0" onClick={otevri}>Nastavit jazyky</Button>}
      </div>

      {viceJazyku && (
        <>
          <Segmented ariaLabel="Jazyk, který upravuješ"
            value={editace ?? langs.vychozi}
            options={langs.nabizet.map(j => ({ id: j, label: j === langs.vychozi ? `${JAZYK_NAZEV[j]} (výchozí)` : JAZYK_NAZEV[j] }))}
            onChange={(j) => setEditace(j === langs.vychozi ? null : j)} />
          <div className="flex flex-wrap gap-2" aria-live="polite">
            {preklady.map(j => {
              const chybi = chybiPreklad(deska, j);
              return chybi > 0
                ? <Chip key={j} tone="wait" size="sm">{JAZYK_NAZEV[j]}: {chybi} bez překladu</Chip>
                : <Chip key={j} tone="ok" size="sm" icon="check">{JAZYK_NAZEV[j]}: přeloženo</Chip>;
            })}
          </div>
          <p className="t-meta text-pretty">
            Chybí-li překlad, hostovi se ukáže výchozí text. Cena a „vyprodáno“ jsou pro všechny jazyky stejné.
          </p>
        </>
      )}

      <Modal open={otevreno} onClose={() => setOtevreno(false)} size="sm" title="Jazyky lístku"
        subtitle="Které jazyky smí host zvolit. Překlady textů doplníš po uložení v seznamu jazyků."
        footer={<>
          <Button variant="secondary" onClick={() => setOtevreno(false)}>Zrušit</Button>
          <Button variant="primary" onClick={potvrd}>Použít</Button>
        </>}>
        <ul className="list">
          {JAZYKY.map(j => (
            <SwitchRow key={j} title={JAZYK_NAZEV[j]} hint={j === vychozi ? 'Výchozí jazyk lístku' : undefined}
              checked={j === vychozi || zapnute.has(j)} disabled={j === vychozi}
              onChange={(v) => setZapnute(z => { const n = new Set(z); if (v) n.add(j); else n.delete(j); return n; })} />
          ))}
        </ul>
        <div className="mt-4">
          <p className="t-label mb-2">Výchozí jazyk</p>
          <Segmented ariaLabel="Výchozí jazyk lístku" value={vychozi} size="sm"
            options={JAZYKY.map(j => ({ id: j, label: JAZYK_NAZEV[j] }))}
            onChange={(j) => { setVychozi(j); setZapnute(z => new Set(z).add(j)); }} />
          <p className="t-meta mt-2 text-pretty">
            Texty, které máš v lístku napsané teď, se berou jako výchozí jazyk. Změna výchozího jazyka je hlavně pro lístek, který už píšeš jinak než česky.
          </p>
        </div>
      </Modal>
    </div>
  );
}
