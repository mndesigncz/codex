'use client';

import { useEffect, useState } from 'react';
import { Button, Field, Input, Select, Skeleton } from '../ui';
import { ErrorState } from '../ui/ErrorState';
import { useLoad } from '../ui/useLoad';
import { useOpravneni } from '../role/useOpravneni';
import ProvozPodniku from './ProvozPodniku';
import { useT } from '@/lib/i18n/client';
import { okJson } from '@/lib/api';
import { TYPY } from '@/lib/pruvodce/typy';
import { cistyDic, cistyIco, cistyPrah, pragySedi } from '@/lib/podnikProfil';

// Nastavení → Profil podniku: jeden domov pro nastavení podniku (kolo 6, balík B3).
//  - profil (podnik.nastaveni): název, typ, adresa, IČO a DIČ — údaje k zobrazení (doklady),
//    aplikace z nich nic nepočítá; server (PATCH /api/teams) tvar ověřuje znovu;
//  - výchozí prahy skladu (nízký a kritický stav, mění sklad.kategorie);
//  - Provoz podniku (měna, formát čísel, týden, země, jazyk, čas, cíl mezd) — dřív karta
//    v Nastavení týmu → Podnik, kam odsud vedl jen odkaz (ProvozPodniku.tsx);
//  - Pravidelné náklady (nájem, energie…) — místo pro kartu balíku Finance (`pravidelneNaklady`).

interface Podnik {
  name: string; business_type: string | null; address: string | null; ico: string | null; dic: string | null;
  low_stock_default: number | null; critical_stock_default: number | null; ico_dic_ok: boolean;
}

export default function SekcePodnik({ pravidelneNaklady }: {
  /** Pravidelné náklady podniku (components/settings/PevneNaklady.tsx z balíku Finance); bez nich se sekce nekreslí. */
  pravidelneNaklady?: React.ReactNode;
} = {}) {
  const t = useT('spolecne');
  const { ma } = useOpravneni();
  // Profil a prahy patří podnik.nastaveni; Provoz ukáže i roli, která smí jen cíl mezd (finance.nastaveni).
  const smiProfil = ma('podnik.nastaveni');
  const podnik = useLoad<Podnik>(smiProfil ? '/api/teams' : null, raw => {
    const x = raw?.team;
    if (!x || typeof x !== 'object') throw new Error('tvar');
    return {
      name: String(x.name ?? ''), business_type: x.business_type ?? null, address: x.address ?? null, ico: x.ico ?? null, dic: x.dic ?? null,
      low_stock_default: x.low_stock_default ?? null, critical_stock_default: x.critical_stock_default ?? null, ico_dic_ok: x.ico_dic_ok === true,
    };
  });

  const [nazev, setNazev] = useState('');
  const [typ, setTyp] = useState('');
  const [adresa, setAdresa] = useState('');
  const [ico, setIco] = useState('');
  const [dic, setDic] = useState('');
  const [nizky, setNizky] = useState('');
  const [kriticky, setKriticky] = useState('');
  const [zprava, setZprava] = useState<{ kde: 'profil' | 'prahy'; ok: boolean; text: string } | null>(null);
  const [uklada, setUklada] = useState<'' | 'profil' | 'prahy'>('');

  // Formulář se naplní, až když data dorazí (a po každém novém načtení).
  useEffect(() => {
    const d = podnik.data;
    if (!d) return;
    setNazev(d.name); setTyp(d.business_type ?? ''); setAdresa(d.address ?? ''); setIco(d.ico ?? ''); setDic(d.dic ?? '');
    setNizky(d.low_stock_default != null ? String(d.low_stock_default) : ''); setKriticky(d.critical_stock_default != null ? String(d.critical_stock_default) : '');
  }, [podnik.data]);

  const patch = async (kde: 'profil' | 'prahy', body: Record<string, unknown>, hotovo: string) => {
    setUklada(kde); setZprava(null);
    try {
      const r = await fetch('/api/teams', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      await okJson(r);
      setZprava({ kde, ok: true, text: hotovo });
      podnik.reload();
    } catch {
      setZprava({ kde, ok: false, text: t('Uložení se nepovedlo. Zkontroluj údaje a zkus to znovu.') });
    } finally {
      setUklada('');
    }
  };

  const icoDic = podnik.data?.ico_dic_ok === true;
  const ulozProfil = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nazev.trim()) { setZprava({ kde: 'profil', ok: false, text: t('Název podniku nesmí být prázdný.') }); return; }
    if (icoDic && cistyIco(ico) === undefined) { setZprava({ kde: 'profil', ok: false, text: t('IČO není platné. Má mít osm číslic se správnou kontrolní číslicí.') }); return; }
    if (icoDic && cistyDic(dic) === undefined) { setZprava({ kde: 'profil', ok: false, text: t('DIČ není platné. Začíná kódem země a má jen písmena a číslice, třeba CZ12345678.') }); return; }
    void patch('profil', {
      name: nazev.trim(), address: adresa.trim(),
      // Bez sloupců v databázi by se údaj tiše nezapsal a formulář by lhal, že je uložený.
      ...(icoDic ? { ico: cistyIco(ico) ?? '', dic: cistyDic(dic) ?? '' } : {}),
      // Typ podniku se nemaže: bez výběru se nepošle.
      ...(typ ? { businessType: typ } : {}),
    }, t('Profil podniku je uložený.'));
  };

  const ulozPrahy = (e: React.FormEvent) => {
    e.preventDefault();
    const n = cistyPrah(nizky); const k = cistyPrah(kriticky);
    if (n === undefined || k === undefined) { setZprava({ kde: 'prahy', ok: false, text: t('Prahy musí být celá čísla od nuly.') }); return; }
    if (!pragySedi(n, k)) { setZprava({ kde: 'prahy', ok: false, text: t('Kritický práh nesmí být vyšší než práh nízkých zásob.') }); return; }
    void patch('prahy', { lowStockDefault: n, criticalStockDefault: k }, t('Prahy skladu jsou uložené.'));
  };

  const naklady = pravidelneNaklady != null && pravidelneNaklady !== false && (
    <section className="card p-5 sloupec sloupec-3" aria-labelledby="nast-p-naklady-t">
      <h2 id="nast-p-naklady-t" className="t-card">{t('Pravidelné náklady')}</h2>
      {pravidelneNaklady}
    </section>
  );
  if (!smiProfil) return <div className="space-y-6"><ProvozPodniku />{naklady}</div>;
  if (podnik.error) return <section className="card p-5"><ErrorState compact title={t('Profil podniku se nepodařilo načíst')} detail={podnik.error} onRetry={podnik.reload} /></section>;
  if (podnik.loading) return <Skeleton className="h-72 rounded-3xl" />;

  const smiPrahy = ma('sklad.kategorie');
  // Typ uložený mimo nabídku (starší data) zůstane vybraný, ať ho formulář nepřepíše.
  const typMimoNabidku = typ && !TYPY.some(x => x.id === typ);
  const hlaska = (kde: 'profil' | 'prahy') => zprava && zprava.kde === kde && (
    <p role={zprava.ok ? 'status' : 'alert'} className={`note ${zprava.ok ? 'note-ok' : 'note-danger'}`}>{zprava.text}</p>
  );

  return (
    <div className="space-y-6">
      <form onSubmit={ulozProfil} className="card p-5 sloupec sloupec-6" aria-labelledby="nast-profil-t">
        <div>
          <h2 id="nast-profil-t" className="t-card">{t('Profil podniku')}</h2>
          <p className="t-meta mt-1">{t('Základní údaje o podniku. IČO a DIČ se jen uloží a zobrazí; aplikace je neověřuje v registrech.')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="nast-p-nazev" label={t('Název podniku')} className="sm:col-span-2">
            <Input id="nast-p-nazev" value={nazev} maxLength={80} onChange={e => setNazev(e.target.value)} />
          </Field>
          <Field id="nast-p-typ" label={t('Typ podniku')}>
            <Select id="nast-p-typ" value={typ} onChange={e => setTyp(e.target.value)}>
              <option value="">{t('Nevybráno')}</option>
              {TYPY.map(x => <option key={x.id} value={x.id}>{t(x.nazev)}</option>)}
              {typMimoNabidku && <option value={typ}>{typ}</option>}
            </Select>
          </Field>
          <Field id="nast-p-adresa" label={t('Adresa')}>
            <Input id="nast-p-adresa" value={adresa} maxLength={200} autoComplete="street-address" onChange={e => setAdresa(e.target.value)} />
          </Field>
          <Field id="nast-p-ico" label={t('IČO')}>
            <Input id="nast-p-ico" value={ico} inputMode="numeric" maxLength={12} disabled={!icoDic} onChange={e => setIco(e.target.value)} />
          </Field>
          <Field id="nast-p-dic" label={t('DIČ')}>
            <Input id="nast-p-dic" value={dic} maxLength={16} autoCapitalize="characters" disabled={!icoDic} onChange={e => setDic(e.target.value)} />
          </Field>
        </div>
        {!icoDic && <p className="t-meta -mt-4">{t('IČO a DIČ půjdou uložit po aktualizaci databáze.')}</p>}
        {hlaska('profil')}
        {/* v4 (P2, P13): akce formuláře přes celou šířku karty, 16 pod obsahem. */}
        <Button type="submit" variant="accent" className="w-full -mt-2" loading={uklada === 'profil'}>{t('Uložit profil')}</Button>
      </form>

      <form onSubmit={ulozPrahy} className="card p-5 sloupec sloupec-6" aria-labelledby="nast-prahy-t">
        <div>
          <h2 id="nast-prahy-t" className="t-card">{t('Výchozí prahy skladu')}</h2>
          <p className="t-meta mt-1">{t('Pod tímhle množstvím se položka bez vlastního limitu označí jako nízká, resp. kritická. Platí pro nové položky a položky bez vlastního nastavení.')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="nast-p-nizky" label={t('Nízký stav')}>
            <Input id="nast-p-nizky" type="number" inputMode="numeric" min={0} step={1} value={nizky} disabled={!smiPrahy} onChange={e => setNizky(e.target.value)} />
          </Field>
          <Field id="nast-p-kriticky" label={t('Kritický stav')}>
            <Input id="nast-p-kriticky" type="number" inputMode="numeric" min={0} step={1} value={kriticky} disabled={!smiPrahy} onChange={e => setKriticky(e.target.value)} />
          </Field>
        </div>
        {!smiPrahy && <p className="t-meta -mt-4">{t('Prahy skladu mění jen ten, kdo smí spravovat kategorie skladu.')}</p>}
        {hlaska('prahy')}
        {/* Jediná limetka plochy je Uložit profil (DESIGN); prahy jsou vedlejší formulář. */}
        <Button type="submit" variant="primary" className="w-full -mt-2" loading={uklada === 'prahy'} disabled={!smiPrahy}>{t('Uložit prahy')}</Button>
      </form>

      {/* Měna, formát čísel, země, jazyk, čas a cíl mezd — dřív v Nastavení týmu, sem vedl jen odkaz. */}
      <ProvozPodniku />

      {/* Pravidelné náklady (nájem, energie…): kartu dodá balík Finance — components/settings/PevneNaklady.tsx,
          klíč finance.nastaveni — přes `pravidelneNaklady`. */}
      {naklady}
    </div>
  );
}
