'use client';

// Jedno pole nastavení widgetu (kolo 68, spec §2.3).
//
// Schéma v katalogu říká, CO se dá nastavit; tady je jediné místo, které
// říká, JAK to vypadá — ať „Kategorie" u Docházejících zásob a „Které
// fronty" u Čeká na tebe vypadají jako každé jiné pole v aplikaci (Field,
// Segmented, Select, Input, SwitchRow z components/ui) a ne jako dvacet
// ručních variant po widgetech.

import { useId, useMemo, useState } from 'react';
import { Button, Field, Input, Segmented, Select, SwitchRow } from '../../ui';
import type { MoznostNastaveni, PoleNastaveni as Pole, Smi, ZdrojNastaveni } from '@/lib/widgety/typy';
import { MAX_POPISEK_ODKAZU } from '@/lib/widgety/konstanty';
import { useDataWidgetu } from '../useDataWidgetu';
import { navigaceCile, rozeberCil, slozCil, useNavigace, type CilOdkazu } from '../NavigaceKontext';
import { viditelneMoznosti } from '../registr';

type Hodnoty = Record<string, unknown>;

interface Volba { id: string | number; nazev: string }

/** Odkud pole typu `zdroj` bere možnosti a kdo se na ně smí ptát (brána GET routy). */
const ZDROJE: Record<Exclude<ZdrojNastaveni, 'pohledy'>, { url: string; klic: string | string[] | null; vyber: (raw: any) => Volba[] }> = {
  'sklad.kategorie': {
    url: '/api/inventory/categories', klic: 'sklad.zobrazit',
    vyber: raw => {
      const rows: any[] = Array.isArray(raw) ? raw : [];
      // Podkategorie s rodičem („Sirupy / Ovocné") — dvě „Ovocné" pod různými rodiči se jinak nerozliší.
      return rows.map(r => {
        const rodic = r.parentId != null ? rows.find(x => x.id === r.parentId) : null;
        return { id: r.id, nazev: rodic ? `${rodic.name} / ${r.name}` : String(r.name ?? '') };
      }).filter(v => v.nazev);
    },
  },
  postupy: {
    url: '/api/procedures', klic: 'postupy.zobrazit',
    vyber: raw => (Array.isArray(raw?.procedures) ? raw.procedures : []).map((p: any) => ({ id: p.id, nazev: String(p.name ?? '') })).filter((v: Volba) => v.nazev),
  },
  navody: {
    url: '/api/guides', klic: 'navody.zobrazit',
    vyber: raw => (Array.isArray(raw?.guides) ? raw.guides : []).map((g: any) => ({ id: g.id, nazev: String(g.title ?? '') })).filter((v: Volba) => v.nazev),
  },
  clenove: {
    url: '/api/teams', klic: null,
    vyber: raw => (Array.isArray(raw?.members) ? raw.members : []).map((m: any) => ({ id: m.id, nazev: String(m.name ?? '') })).filter((v: Volba) => v.nazev),
  },
  dodavatele: {
    url: '/api/suppliers', klic: ['dodavatele.zobrazit', 'sklad.zobrazit'],
    vyber: raw => (Array.isArray(raw?.suppliers) ? raw.suppliers : []).map((s: any) => ({ id: s.id, nazev: String(s.name ?? '') })).filter((v: Volba) => v.nazev),
  },
};

/** Ikony dlaždice-odkazu: dvanáct předvoleb z Icons.tsx (spec §2.3) a jejich jména pro odečítač. */
export const IKONY_ODKAZU: readonly { id: string; nazev: string }[] = [
  { id: 'overview', nazev: 'Přehled' }, { id: 'calendar', nazev: 'Kalendář' }, { id: 'box', nazev: 'Krabice' },
  { id: 'check', nazev: 'Fajfka' }, { id: 'clipboard', nazev: 'Podložka' }, { id: 'book', nazev: 'Kniha' },
  { id: 'trend', nazev: 'Graf' }, { id: 'coins', nazev: 'Mince' }, { id: 'users', nazev: 'Lidé' },
  { id: 'chat', nazev: 'Bublina' }, { id: 'cup', nazev: 'Hrnek' }, { id: 'star', nazev: 'Hvězda' },
];

/** Výchozí ikona podle druhu cíle, když si člověk žádnou nevybral. */
const IKONA_DRUHU: Record<CilOdkazu['druh'], string> = { pohled: 'overview', kategorie: 'box', postup: 'clipboard', navod: 'book' };

export function PoleNastaveni({ pole, hodnoty, onZmena, smi }: {
  pole: Pole;
  /** Rozepsané hodnoty celého widgetu (doplněné výchozími). */
  hodnoty: Hodnoty;
  /** Změna jednoho nebo víc klíčů (odkaz mění cil, popisek i ikonu naráz). */
  onZmena: (zmena: Hodnoty) => void;
  smi: Smi;
}) {
  const uid = useId();
  const id = `${uid}-${pole.klic}`;
  const napoveda = pole.napoveda;

  switch (pole.typ) {
    case 'vyber': {
      const moznosti = viditelneMoznosti(pole.moznosti, smi);
      const hodnota = typeof hodnoty[pole.klic] === 'string' ? (hodnoty[pole.klic] as string) : pole.vychozi;
      // Do čtyř voleb přepínač (vidíš všechny naráz), víc voleb do výběru.
      if (moznosti.length <= 4) {
        return (
          <Field label={pole.nazev} hint={napoveda}>
            <Segmented size="sm" ariaLabel={pole.nazev} value={hodnota}
              onChange={v => onZmena({ [pole.klic]: v })}
              options={moznosti.map(m => ({ id: m.id, label: m.nazev }))} />
          </Field>
        );
      }
      return (
        <Field id={id} label={pole.nazev} hint={napoveda}>
          <Select id={id} value={hodnota} onChange={e => onZmena({ [pole.klic]: e.target.value })}>
            {moznosti.map(m => <option key={m.id} value={m.id}>{m.nazev}</option>)}
          </Select>
        </Field>
      );
    }
    case 'vicevyber':
      return <PoleVicevyber pole={pole} hodnoty={hodnoty} onZmena={onZmena} smi={smi} />;
    case 'cislo': {
      const hodnota = typeof hodnoty[pole.klic] === 'number' ? (hodnoty[pole.klic] as number) : pole.vychozi;
      return (
        <Field id={id} label={pole.jednotka ? `${pole.nazev} (${pole.jednotka})` : pole.nazev}
          hint={napoveda ?? `Od ${pole.min} do ${pole.max}.`}>
          <Input id={id} type="number" inputMode="numeric" min={pole.min} max={pole.max} step={pole.krok ?? 1}
            className="!w-full sm:!w-32" value={Number.isFinite(hodnota) ? hodnota : ''}
            onChange={e => {
              const n = Number(e.target.value);
              if (e.target.value !== '' && Number.isFinite(n)) onZmena({ [pole.klic]: Math.min(pole.max, Math.max(pole.min, n)) });
            }} />
        </Field>
      );
    }
    case 'prepinac':
      return (
        <SwitchRow as="div" title={pole.nazev} hint={napoveda} className="!py-1"
          checked={hodnoty[pole.klic] === true} onChange={v => onZmena({ [pole.klic]: v })} />
      );
    case 'text': {
      const hodnota = typeof hodnoty[pole.klic] === 'string' ? (hodnoty[pole.klic] as string) : pole.vychozi;
      return (
        <Field id={id} label={pole.nazev} hint={napoveda}>
          <Input id={id} value={hodnota} maxLength={pole.maxDelka} onChange={e => onZmena({ [pole.klic]: e.target.value })} />
        </Field>
      );
    }
    case 'zdroj':
      return <PoleZdroj pole={pole} hodnoty={hodnoty} onZmena={onZmena} smi={smi} id={id} />;
    case 'odkaz':
      return <PoleOdkazu hodnoty={hodnoty} onZmena={onZmena} smi={smi} idZaklad={id} />;
  }
}

export default PoleNastaveni;

// ---------------------------------------------------------------------------

function PoleVicevyber({ pole, hodnoty, onZmena, smi }: {
  pole: Extract<Pole, { typ: 'vicevyber' }>; hodnoty: Hodnoty; onZmena: (z: Hodnoty) => void; smi: Smi;
}) {
  const moznosti = viditelneMoznosti(pole.moznosti, smi);
  const ulozeno = hodnoty[pole.klic];
  const vybrane: string[] = Array.isArray(ulozeno) ? ulozeno.filter((x): x is string => typeof x === 'string')
    : ulozeno === 'vse' ? pole.moznosti.map(m => m.id) : [];
  const prepni = (m: MoznostNastaveni, zapnout: boolean) => {
    // Volby, které divák nevidí (bez oprávnění), zůstanou, jak byly — jinak
    // by přepnutí jedné fronty potichu vyřadilo fronty jiného správce.
    const nove = pole.moznosti.map(x => x.id).filter(x => (x === m.id ? zapnout : vybrane.includes(x)));
    onZmena({ [pole.klic]: nove });
  };
  return (
    <fieldset className="min-w-0">
      <legend className="field-label">{pole.nazev}</legend>
      {pole.napoveda && <p className="t-meta -mt-1 mb-1">{pole.napoveda}</p>}
      <ul className="list">
        {moznosti.map(m => (
          <SwitchRow key={m.id} title={m.nazev} checked={vybrane.includes(m.id)} onChange={v => prepni(m, v)} />
        ))}
      </ul>
    </fieldset>
  );
}

function PoleZdroj({ pole, hodnoty, onZmena, smi, id }: {
  pole: Extract<Pole, { typ: 'zdroj' }>; hodnoty: Hodnoty; onZmena: (z: Hodnoty) => void; smi: Smi; id: string;
}) {
  const nav = useNavigace();
  const zdroj = pole.zdroj === 'pohledy' ? null : ZDROJE[pole.zdroj];
  // Na možnosti se ptá jen ten, komu je server dá — jinak by pole skončilo 403.
  const smiZdroj = !!zdroj && (zdroj.klic == null || smi(zdroj.klic));
  const data = useDataWidgetu<Volba[]>(smiZdroj ? zdroj!.url : null, zdroj?.vyber);
  const volby: Volba[] = pole.zdroj === 'pohledy'
    ? nav.pohledy.filter(p => nav.smiPohled(p.id)).map(p => ({ id: p.id, nazev: p.label }))
    : data.data ?? [];
  const hodnota = hodnoty[pole.klic];
  const vybrano = hodnota == null ? '' : String(hodnota);
  const prazdne = pole.prazdne ?? 'Nic nevybráno';
  if (pole.zdroj !== 'pohledy' && !smiZdroj) return null;
  if (data.error) {
    return (
      <Field label={pole.nazev}>
        <p className="note note-danger flex items-center justify-between gap-3" role="alert">
          <span>Možnosti se nenačetly.</span>
          <Button variant="secondary" size="sm" icon="refresh" onClick={data.reload}>Zkusit znovu</Button>
        </p>
      </Field>
    );
  }
  return (
    <Field id={id} label={pole.nazev} hint={pole.napoveda}>
      <Select id={id} value={vybrano} disabled={data.loading}
        onChange={e => {
          const v = e.target.value;
          const volba = volby.find(x => String(x.id) === v);
          onZmena({ [pole.klic]: v === '' ? null : volba ? volba.id : v });
        }}>
        <option value="">{data.loading ? 'Načítám…' : prazdne}</option>
        {volby.map(v => <option key={String(v.id)} value={String(v.id)}>{v.nazev}</option>)}
        {/* Uložená volba, která už neexistuje (smazaná kategorie), se neztratí potichu. */}
        {vybrano && !data.loading && !volby.some(v => String(v.id) === vybrano) && (
          <option value={vybrano}>Už neexistuje</option>
        )}
      </Select>
    </Field>
  );
}

/**
 * Widget Odkaz: kam vede (záložka z navigace role, kategorie skladu, postup
 * nebo návod), popisek a ikona. Postup a návod se ukládají podle id, ne podle
 * názvu — přejmenování odkaz nerozbije a proklik je rovnou otevře.
 */
function PoleOdkazu({ hodnoty, onZmena, smi, idZaklad }: {
  hodnoty: Hodnoty; onZmena: (z: Hodnoty) => void; smi: Smi; idZaklad: string;
}) {
  const nav = useNavigace();
  const cil = rozeberCil(hodnoty.cil);
  const druhy = useMemo(() => ([
    { id: 'pohled', label: 'Záložka' },
    ...(nav.smiPohled('inventory') && smi('sklad.zobrazit') ? [{ id: 'kategorie', label: 'Kategorie skladu' }] : []),
    ...(nav.smiPohled('procedures') && smi('postupy.zobrazit') ? [{ id: 'postup', label: 'Postup' }] : []),
    ...(nav.smiPohled('guides') && smi('navody.zobrazit') ? [{ id: 'navod', label: 'Návod' }] : []),
  ] as { id: CilOdkazu['druh']; label: string }[]), [nav, smi]);
  const [druh, setDruh] = useState<CilOdkazu['druh']>(cil && druhy.some(d => d.id === cil.druh) ? cil.druh : 'pohled');

  const kategorie = useDataWidgetu<Volba[]>(druh === 'kategorie' ? ZDROJE['sklad.kategorie'].url : null, raw =>
    (Array.isArray(raw) ? raw : []).map((r: any) => ({ id: String(r.name ?? ''), nazev: String(r.name ?? '') })).filter((v: Volba) => v.nazev));
  const postupy = useDataWidgetu<Volba[]>(druh === 'postup' ? ZDROJE.postupy.url : null, ZDROJE.postupy.vyber);
  const navody = useDataWidgetu<Volba[]>(druh === 'navod' ? ZDROJE.navody.url : null, ZDROJE.navody.vyber);

  const volby: Volba[] = druh === 'pohled'
    ? nav.pohledy.filter(p => nav.smiPohled(p.id)).map(p => ({ id: p.id, nazev: p.label }))
    : (druh === 'kategorie' ? kategorie : druh === 'postup' ? postupy : navody).data ?? [];
  const nacitam = druh !== 'pohled' && (druh === 'kategorie' ? kategorie : druh === 'postup' ? postupy : navody).loading;

  const vybrano = !cil || cil.druh !== druh ? ''
    : cil.druh === 'pohled' ? cil.pohled
    : cil.druh === 'kategorie' ? cil.nazev
    : String(cil.id ?? '');
  const popisek = typeof hodnoty.popisek === 'string' ? hodnoty.popisek : '';
  const ikona = typeof hodnoty.ikona === 'string' ? hodnoty.ikona : '';

  const vyberCil = (hodnota: string) => {
    if (!hodnota) { onZmena({ cil: undefined }); return; }
    const volba = volby.find(v => String(v.id) === hodnota);
    const novy: CilOdkazu = druh === 'pohled' ? { druh, pohled: hodnota }
      : druh === 'kategorie' ? { druh, nazev: hodnota }
      : { druh, id: Number(hodnota), nazev: null };
    const staryNazev = volby.find(v => String(v.id) === vybrano)?.nazev ?? '';
    const zmena: Hodnoty = { cil: slozCil(novy) };
    // Popisek, který člověk nepsal sám, jde s cílem (ne „Sklad" u odkazu na postup).
    if (!popisek || popisek === staryNazev) zmena.popisek = (volba?.nazev ?? '').slice(0, MAX_POPISEK_ODKAZU);
    if (!ikona) zmena.ikona = druh === 'pohled' ? nav.pohledy.find(p => p.id === hodnota)?.icon ?? IKONA_DRUHU.pohled : IKONA_DRUHU[druh];
    onZmena(zmena);
  };

  const idCile = `${idZaklad}-cil`;
  const idPopisku = `${idZaklad}-popisek`;
  const cilNavigace = cil ? navigaceCile(cil) : null;
  return (
    <div className="space-y-4">
      {druhy.length > 1 && (
        <Field label="Kam vede">
          <Segmented size="sm" ariaLabel="Kam vede" value={druh} wrap
            onChange={d => { setDruh(d); onZmena({ cil: undefined }); }}
            options={druhy} />
        </Field>
      )}
      <Field id={idCile} label={druh === 'pohled' ? 'Záložka' : druh === 'kategorie' ? 'Kategorie' : druh === 'postup' ? 'Postup' : 'Návod'}
        hint={cilNavigace && !nav.smiPohled(cilNavigace.pohled) ? 'Na tuhle část aplikace tvoje role nemá — dlaždice se nezobrazí.' : undefined}>
        <Select id={idCile} value={vybrano} disabled={nacitam} onChange={e => vyberCil(e.target.value)}>
          <option value="">{nacitam ? 'Načítám…' : 'Vyber…'}</option>
          {volby.map(v => <option key={String(v.id)} value={String(v.id)}>{v.nazev}</option>)}
        </Select>
      </Field>
      <Field id={idPopisku} label="Popisek" hint={`Nejvýš ${MAX_POPISEK_ODKAZU} znaků.`}>
        <Input id={idPopisku} value={popisek} maxLength={MAX_POPISEK_ODKAZU} onChange={e => onZmena({ popisek: e.target.value })} />
      </Field>
      <fieldset className="min-w-0">
        <legend className="field-label">Ikona</legend>
        <div className="flex flex-wrap gap-1.5">
          {IKONY_ODKAZU.map(i => (
            // Vybraná ikona je inkoustová pilulka — „vybráno" vypadá v celé aplikaci stejně.
            <Button key={i.id} size="sm" iconOnly icon={i.id} aria-label={`Ikona: ${i.nazev}`} aria-pressed={ikona === i.id}
              variant={ikona === i.id ? 'primary' : 'ghost'} onClick={() => onZmena({ ikona: i.id })} />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
