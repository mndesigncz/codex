'use client';

// Nákupní seznam (okno ve Skladu): filtr kategorií, hledání, naléhavost,
// seskupení, řazení, součty a odškrtávání v obchodě.
//
// Co vidíš, to se objedná: filtr platí pro objednávku, e-mail dodavateli,
// kopii, tisk i sdílení. Proto je v patičce počet („Vytvořit objednávku (7)“)
// a nad seznamem věta, kolik položek filtr skrývá. Odškrtnutí je jen pomůcka
// pro obchod: do objednávky se nepromítá, ale kopie, tisk a sdílení vynechají
// to, co už je v košíku.
//
// Nastavení (vynechané kategorie, seskupení, řazení) si okno pamatuje v tomhle
// prohlížeči; odškrtnuté položky platí jen ten den, kdy se v obchodě škrtaly.
// Logika je v lib/nakupSeznam.ts (s testy), tady zbývá jen zobrazení.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Chip, EmptyState, ListRow, Menu, Modal, SearchField, Segmented } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { useT } from '@/lib/i18n/client';
import { useLocale } from './jazyk';
import { openPrint, esc } from '@/lib/printDoc';
import { obnovDataWidgetu } from '../widgety/useDataWidgetu';
import { pragueToday } from '@/lib/pragueTime';
import {
  BEZ, PRAZDNY_FILTR, VYCHOZI_STAV, cenaRadku, druhNalehavosti, filtruj, moznostiKategorii, nactiOdskrtnute, nactiStav,
  odskrtnuteDolu, pocetFiltru, postup, sestavKontext, serializujOdskrtnute, seradit, seskup, souhrn,
  type FiltrNakupu, type KategorieStrom, type Nalehavost, type PolozkaNakupu, type Razeni, type Seskupit, type UlozenyStav,
} from '@/lib/nakupSeznam';

export interface RadekSeznamu extends PolozkaNakupu {
  /** Kolik zbývá na skladě (pro řádek a tisk). */
  zbyva: number;
  /** Pro které vlastní výrobky surovina chybí. */
  naVyrobuJmena: string[];
  supplierUrl?: string | null;
}

const KLIC_STAV = 'managero-nakup-stav';
const KLIC_ODSKRTNUTO = 'managero-nakup-odskrtnuto';
const MAX_PILULEK = 8;

const cti = (klic: string): string | null => { try { return localStorage.getItem(klic); } catch { return null; } };
const ulozit = (klic: string, hodnota: string) => { try { localStorage.setItem(klic, hodnota); } catch { /* soukromý režim: okno funguje i bez paměti */ } };

export default function NakupniSeznamOkno({ polozky, kategorie, dodavatel: dodavatelZVenku = null, suppliers = [], onClose, onOrdered, smiObjednat, smiOdeslat }: {
  polozky: RadekSeznamu[];
  kategorie: KategorieStrom[];
  /** Jen jeden dodavatel (z widgetu Nákupní seznam); jde zrušit chipem. */
  dodavatel?: string | null;
  suppliers?: any[];
  onClose: () => void;
  onOrdered: (createdCount: number, requested: number) => void;
  /** nakup.vytvorit — bez něj jde seznam jen zkopírovat, vytisknout nebo poslat. */
  smiObjednat: boolean;
  /** nakup.odeslat — objednávka e-mailem přímo dodavateli. */
  smiOdeslat: boolean;
}) {
  const loc = useLocale();
  const t = useT('sprava');
  const money = useMoney();
  const ctx = useMemo(() => sestavKontext(kategorie), [kategorie]);
  const dnes = useMemo(() => pragueToday(), []);

  const [stav, setStav] = useState<UlozenyStav>(() => nactiStav(cti(KLIC_STAV)));
  const [hledani, setHledani] = useState('');
  const [dodavatel, setDodavatel] = useState<string | null>(dodavatelZVenku);
  const [odskrtnute, setOdskrtnute] = useState<Set<number>>(() => nactiOdskrtnute(cti(KLIC_ODSKRTNUTO), dnes));
  const [vsechnyPilulky, setVsechnyPilulky] = useState(false);

  useEffect(() => { ulozit(KLIC_STAV, JSON.stringify(stav)); }, [stav]);
  useEffect(() => { ulozit(KLIC_ODSKRTNUTO, serializujOdskrtnute(odskrtnute, dnes)); }, [odskrtnute, dnes]);
  const zmenStav = (cast: Partial<UlozenyStav>) => setStav(s => ({ ...s, ...cast }));

  const filtr: FiltrNakupu = useMemo(() => ({ hledani, vynechane: stav.vynechane, nalehavost: stav.nalehavost, dodavatel }), [hledani, stav.vynechane, stav.nalehavost, dodavatel]);
  const viditelne = useMemo(() => seradit(filtruj(polozky, filtr, ctx), stav.razeni) as RadekSeznamu[], [polozky, filtr, ctx, stav.razeni]);
  const skupiny = useMemo(() => seskup(viditelne, stav.seskupit, ctx).map(s => ({ ...s, polozky: odskrtnuteDolu(s.polozky as RadekSeznamu[], odskrtnute) })), [viditelne, stav.seskupit, ctx, odskrtnute]);

  // Počty u přepínače naléhavosti a u kategorií ukazují, co by filtr dal, když se přepne: ostatní filtry platí.
  const poctyNalehavosti = useMemo(() => {
    const vse = filtruj(polozky, { ...filtr, nalehavost: 'vse' }, ctx);
    return {
      vse: vse.length,
      critical: vse.filter(p => druhNalehavosti(p) === 'critical').length,
      low: vse.filter(p => druhNalehavosti(p) === 'low').length,
      vyroba: vse.filter(p => druhNalehavosti(p) === 'vyroba').length,
      jine: vse.filter(p => druhNalehavosti(p) === 'jine').length,
    };
  }, [polozky, filtr, ctx]);
  const moznosti = useMemo(() => moznostiKategorii(filtruj(polozky, { ...filtr, vynechane: [] }, ctx), stav.vynechane, ctx), [polozky, filtr, ctx, stav.vynechane]);

  const sum = useMemo(() => souhrn(viditelne), [viditelne]);
  const hotovo = postup(viditelne, odskrtnute);
  const skryto = filtruj(polozky, { ...PRAZDNY_FILTR, dodavatel }, ctx).length - viditelne.length;
  const nFiltru = pocetFiltru(filtr) + (dodavatel != null ? 1 : 0);

  const popisKategorie = (nazev: string | null) => nazev ?? t('Bez kategorie');
  const popisNalehavosti = (k: string) => k === 'critical' ? t('Kriticky docházejí') : k === 'low' ? t('Docházejí') : k === 'vyroba' ? t('Chybí na výrobu') : t('Přidáno ručně');
  const popisSkupiny = (klic: string, nazev: string | null): string => {
    if (stav.seskupit === 'dodavatel') return nazev ?? t('Bez dodavatele');
    if (stav.seskupit === 'kategorie') return popisKategorie(nazev);
    if (stav.seskupit === 'nalehavost') return popisNalehavosti(klic);
    return '';
  };

  const zrusFiltry = () => { setHledani(''); setDodavatel(null); zmenStav({ vynechane: [], nalehavost: 'vse' }); };
  const prepniKategorii = (klic: string) => zmenStav({ vynechane: stav.vynechane.includes(klic) ? stav.vynechane.filter(k => k !== klic) : [...stav.vynechane, klic] });
  const prepniOdskrtnuti = (id: number) => setOdskrtnute(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const prepniSkupinu = (klic: string) => zmenStav({ sbalene: stav.sbalene.includes(klic) ? stav.sbalene.filter(k => k !== klic) : [...stav.sbalene, klic] });

  // ---- e-mail dodavateli (jen u seskupení podle dodavatele) ----
  const supplierByName = (name: string) => suppliers.find(sp => sp.name === name) ?? null;
  const [emailing, setEmailing] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const emailGroup = async (supplier: string, list: RadekSeznamu[]) => {
    const sp = supplierByName(supplier);
    if (!sp?.email) return;
    setEmailing(supplier); setEmailMsg(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier, supplierId: sp.id, sendEmail: true,
          items: list.map(i => ({ name: i.name, qty: i.navrh, unit: i.unit, itemId: i.id })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.emailed) setEmailMsg({ text: t('Objednávka odeslána na {email}.', { email: sp.email }), ok: true });
      // Server říká i proč; dřív se tu psalo obecné „nepodařilo se“.
      else if (res.ok) setEmailMsg({ text: d.emailError ? t('Objednávka je vytvořená, ale e-mail neodešel ({chyba}) — pošli ji ručně.', { chyba: d.emailError }) : t('Objednávka je vytvořená, ale e-mail neodešel — pošli ji ručně.'), ok: false });
      else setEmailMsg({ text: d.error || t('Odeslání se nepodařilo.'), ok: false });
      if (res.ok) obnovDataWidgetu('/api/orders');
    } catch { setEmailMsg({ text: t('Odeslání se nepodařilo.'), ok: false }); }
    setEmailing(null);
  };

  // ---- text, kopie, tisk, sdílení: co zbývá koupit (bez odškrtnutého) ----
  const zbyva = useMemo(() => skupiny
    .map(s => ({ ...s, polozky: s.polozky.filter(p => !odskrtnute.has(p.id)) }))
    .filter(s => s.polozky.length > 0), [skupiny, odskrtnute]);
  const pocetZbyva = zbyva.reduce((n, s) => n + s.polozky.length, 0);

  const poznamkaVyroba = (i: RadekSeznamu) => (i.naVyrobuJmena.length > 0 ? t('na výrobu: {seznam}', { seznam: i.naVyrobuJmena.join(', ') }) : '');
  const buildText = () => {
    const date = new Date().toLocaleDateString(loc);
    const lines: string[] = [t('Nákupní seznam – Managero ({datum})', { datum: date })];
    zbyva.forEach(s => {
      const nadpis = popisSkupiny(s.klic, s.nazev);
      lines.push('');
      if (nadpis) lines.push(`${nadpis}:`);
      s.polozky.forEach(i => {
        const proc = poznamkaVyroba(i);
        lines.push(`• ${i.name} — ${t('objednat {mnozstvi} {jednotka} (zbývá {zbyva})', { mnozstvi: i.navrh, jednotka: i.unit ?? '', zbyva: i.zbyva })}${proc ? ` — ${proc}` : ''}`);
      });
    });
    return lines.join('\n');
  };

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildText());
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch { /* schránka nedostupná — tlačítko zůstane „Zkopírovat“ */ }
  };

  // Do velkoobchodu se jde s papírem a tužkou: čtvereček u každé položky je na odškrtání.
  const [printFailed, setPrintFailed] = useState(false);
  const printList = () => {
    const rows = zbyva.map(s => {
      const nadpis = popisSkupiny(s.klic, s.nazev);
      return `
      ${nadpis ? `<h2>${esc(nadpis)}</h2>` : ''}
      <table>
        <thead><tr><th style="width:8mm"></th><th>${esc(t('Položka'))}</th><th class="num">${esc(t('Objednat'))}</th><th class="num">${esc(t('Zbývá'))}</th></tr></thead>
        <tbody>${s.polozky.map(i => `<tr>
          <td><span class="tick"></span></td>
          <td>${esc(i.name)}${i.naVyrobuJmena.length > 0 ? `<div class="note">${esc(poznamkaVyroba(i))}</div>` : ''}</td>
          <td class="num">${esc(i.navrh)} ${esc(i.unit ?? '')}</td>
          <td class="num">${esc(i.zbyva)} ${esc(i.unit ?? '')}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    }).join('');
    const ok = openPrint({
      title: t('Nákupní seznam'),
      subtitle: `${t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: pocetZbyva })} · ${new Date().toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
      body: rows,
    });
    setPrintFailed(!ok);
  };

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const share = async () => {
    try { await navigator.share({ title: t('Nákupní seznam'), text: buildText() }); } catch { /* zrušeno */ }
  };
  const mailto = `mailto:?subject=${encodeURIComponent(t('Objednávka – {datum}', { datum: new Date().toLocaleDateString(loc) }))}&body=${encodeURIComponent(buildText())}`;

  // ---- objednávky: jedna na dodavatele, ze všeho, co filtr nechává ----
  const [ordering, setOrdering] = useState(false);
  const createOrders = async () => {
    if (ordering || viditelne.length === 0) return;
    setOrdering(true);
    let created = 0;
    const poDodavatelich = seskup(viditelne, 'dodavatel', ctx);
    for (const s of poDodavatelich) {
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supplier: s.klic === BEZ ? null : s.nazev,
            items: (s.polozky as RadekSeznamu[]).map(i => ({ name: i.name, qty: i.navrh, unit: i.unit, itemId: i.id })),
          }),
        });
        if (res.ok) created++;
      } catch { /* spočítá se jako nevytvořená */ }
    }
    setOrdering(false);
    onOrdered(created, poDodavatelich.length);
  };

  const razeniMenu = [
    { id: 'nalehavost' as Razeni, label: t('Podle naléhavosti') },
    { id: 'abeceda' as Razeni, label: t('Podle abecedy') },
    { id: 'cena' as Razeni, label: t('Od nejdražší') },
  ];
  const nalehavostMoznosti: { id: Nalehavost; label: string; count: number }[] = [
    { id: 'vse', label: t('Vše'), count: poctyNalehavosti.vse },
    { id: 'critical', label: t('Kritické'), count: poctyNalehavosti.critical },
    { id: 'low', label: t('Dochází'), count: poctyNalehavosti.low },
    ...(poctyNalehavosti.vyroba > 0 || stav.nalehavost === 'vyroba' ? [{ id: 'vyroba' as Nalehavost, label: t('Na výrobu'), count: poctyNalehavosti.vyroba }] : []),
    ...(poctyNalehavosti.jine > 0 || stav.nalehavost === 'jine' ? [{ id: 'jine' as Nalehavost, label: t('Přidáno ručně'), count: poctyNalehavosti.jine }] : []),
  ];
  const seskupitMoznosti: { id: Seskupit; label: string }[] = [
    { id: 'dodavatel', label: t('Dodavatel') },
    { id: 'kategorie', label: t('Kategorie') },
    { id: 'nalehavost', label: t('Naléhavost') },
    { id: 'zadne', label: t('Bez skupin') },
  ];
  const zobrazenePilulky = vsechnyPilulky ? moznosti : moznosti.slice(0, MAX_PILULEK);
  const jenDodavatel = stav.seskupit === 'dodavatel';

  const podtitul = nFiltru > 0 && viditelne.length !== polozky.length
    ? t('{n} z {celkem}', { n: viditelne.length, celkem: polozky.length })
    : t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: polozky.length });

  return (
    <Modal open onClose={onClose} size="lg" title={t('Nákupní seznam')} subtitle={podtitul}
      footer={<div className="flex flex-wrap items-center justify-end gap-2 w-full">
        <Menu label={t('Další možnosti seznamu')} items={[
          { label: t('Vytisknout'), icon: 'print', hint: t('S čtverečky k odškrtání v obchodě. Bez toho, co už je odškrtnuté.'), onClick: printList, disabled: pocetZbyva === 0 },
          { label: t('Poslat e-mailem'), icon: 'mail', hint: t('Otevře e-mail s předvyplněným seznamem.'), onClick: () => { window.location.href = mailto; }, disabled: pocetZbyva === 0 },
          ...(canShare ? [{ label: t('Sdílet'), icon: 'send', onClick: share, disabled: pocetZbyva === 0 }] : []),
          ...(odskrtnute.size > 0 ? [{ label: t('Zrušit odškrtnutí'), icon: 'undo', hint: t('Vrátí všechny položky mezi nekoupené.'), onClick: () => setOdskrtnute(new Set()) }] : []),
        ]} />
        <Button variant="secondary" icon="copy" onClick={copy} disabled={pocetZbyva === 0}>{copied ? t('Zkopírováno') : t('Zkopírovat')}</Button>
        {smiObjednat && (
          <Button variant="primary" loading={ordering} disabled={viditelne.length === 0} onClick={createOrders}>
            {viditelne.length > 0 ? t('Vytvořit objednávku ({n})', { n: viditelne.length }) : t('Vytvořit objednávku')}
          </Button>
        )}
      </div>}>
      <div className="space-y-4">
        {emailMsg && <p className={`note ${emailMsg.ok ? 'note-ok' : 'note-wait'}`} role="status">{emailMsg.text}</p>}
        {printFailed && (
          <p className="note note-wait">
            {t('Tiskové okno prohlížeč zablokoval. Povol vyskakovací okna pro tuhle stránku, nebo si seznam zkopíruj a vytiskni odjinud.')}
          </p>
        )}

        {polozky.length > 0 && (
          <div className="space-y-3" role="search" aria-label={t('Filtr nákupního seznamu')}>
            <SearchField value={hledani} onChange={setHledani} placeholder={t('Hledat v seznamu…')} ariaLabel={t('Hledat v nákupním seznamu')} />

            <Segmented size="sm" ariaLabel={t('Jak naléhavé')} value={stav.nalehavost} onChange={v => zmenStav({ nalehavost: v })}
              options={nalehavostMoznosti.map(o => ({ id: o.id, label: o.label, count: o.count }))} />

            {moznosti.length > 1 && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="t-label">{t('Kategorie')}</p>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => zmenStav({ vynechane: [] })} disabled={stav.vynechane.length === 0}>{t('Všechny')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => zmenStav({ vynechane: moznosti.map(m => m.klic) })} disabled={stav.vynechane.length >= moznosti.length}>{t('Žádná')}</Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Kategorie na seznamu')}>
                  {zobrazenePilulky.map(m => {
                    const zapnuto = !stav.vynechane.includes(m.klic);
                    return (
                      <button key={m.klic} type="button" aria-pressed={zapnuto} onClick={() => prepniKategorii(m.klic)}
                        className={`filter-pill tap-target-sm ${zapnuto ? 'seg-on' : 'seg-off glass'}`}>
                        {popisKategorie(m.nazev)} <span className="tabular-nums opacity-70">{m.pocet}</span>
                      </button>
                    );
                  })}
                  {moznosti.length > MAX_PILULEK && (
                    <button type="button" onClick={() => setVsechnyPilulky(v => !v)} className="filter-pill tap-target-sm seg-off glass">
                      {vsechnyPilulky ? t('Méně') : t('+{n} dalších', { n: moznosti.length - MAX_PILULEK })}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <p className="t-label shrink-0">{t('Seskupit')}</p>
              <Segmented size="sm" ariaLabel={t('Seskupit podle')} value={stav.seskupit} onChange={v => zmenStav({ seskupit: v })} options={seskupitMoznosti} className="min-w-0 flex-1" />
              <Menu label={t('Řazení')} icon="swap" size="sm" align="left" items={razeniMenu.map(r => ({ label: `${stav.razeni === r.id ? '✓ ' : ''}${r.label}`, onClick: () => zmenStav({ razeni: r.id }) }))} />
            </div>

            {dodavatel != null && (
              <div className="flex items-center gap-2">
                <Chip tone="info" size="sm">{t('Dodavatel: {nazev}', { nazev: dodavatel === BEZ ? t('Bez dodavatele') : dodavatel })}</Chip>
                <button type="button" onClick={() => setDodavatel(null)} className="text-xs underline text-black/60">{t('Zobrazit všechny')}</button>
              </div>
            )}
          </div>
        )}

        {polozky.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-live="polite">
            <p className="text-sm font-semibold tabular-nums">{t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: viditelne.length })}</p>
            {sum.kriticke > 0 && <Chip tone="bad" size="sm">{t('{n} kriticky', { n: sum.kriticke })}</Chip>}
            {sum.odhadCeny > 0 && (
              <p className="t-meta">
                {t('odhad {cena}', { cena: money(Math.round(sum.odhadCeny)) })}
                {sum.bezCeny > 0 && ` · ${t('u {n, plural, one {# položky} other {# položek}} chybí cena', { n: sum.bezCeny })}`}
              </p>
            )}
            {nFiltru > 0 && skryto > 0 && <p className="t-meta">{t('Filtr skrývá {n, plural, one {# položku} few {# položky} other {# položek}}.', { n: skryto })}</p>}
            {nFiltru > 0 && <button type="button" onClick={zrusFiltry} className="text-sm underline text-black/70">{t('Zrušit filtry')}</button>}
          </div>
        )}

        {hotovo.hotovo > 0 && (
          <div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <p className="font-medium tabular-nums">{t('V košíku {hotovo} z {celkem}', { hotovo: hotovo.hotovo, celkem: hotovo.celkem })}</p>
              <button type="button" onClick={() => setOdskrtnute(new Set())} className="underline text-black/60 text-xs">{t('Zrušit odškrtnutí')}</button>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-black/[0.08] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={hotovo.celkem} aria-valuenow={hotovo.hotovo} aria-label={t('Kolik z nákupu je v košíku')}>
              <div className="h-full rounded-full bg-[#16181A] transition-[width] duration-200" style={{ width: `${hotovo.celkem ? Math.round((hotovo.hotovo / hotovo.celkem) * 100) : 0}%` }} />
            </div>
          </div>
        )}

        {polozky.length === 0 && (
          <p className="t-meta">{dodavatelZVenku ? t('Od tohoto dodavatele teď nic nechybí.') : t('Teď nic nechybí.')}</p>
        )}
        {polozky.length > 0 && viditelne.length === 0 && (
          <EmptyState compact icon="search" title={t('Filtru neodpovídá žádná položka')}
            hint={t('Zkus jiné hledání, nebo vrať vynechané kategorie.')}
            action={<Button variant="secondary" size="sm" onClick={zrusFiltry}>{t('Zrušit filtry')}</Button>} />
        )}

        {skupiny.map(s => {
          const nadpis = popisSkupiny(s.klic, s.nazev);
          const sbalena = nadpis !== '' && stav.sbalene.includes(s.klic);
          const dodavatelSkupiny = jenDodavatel && s.nazev ? s.nazev : null;
          const cenaSkupiny = s.polozky.reduce((n, p) => n + (cenaRadku(p) ?? 0), 0);
          return (
            <section key={s.klic} aria-label={nadpis || t('Nákupní seznam')}>
              {nadpis !== '' && (
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => prepniSkupinu(s.klic)} aria-expanded={!sbalena}
                    className="flex items-center gap-1.5 min-w-0 text-left py-1">
                    <Icon name="chevron" size={14} className={`shrink-0 text-black/45 transition-transform ${sbalena ? '-rotate-90' : ''}`} />
                    <span className="t-label truncate">{nadpis}</span>
                    <span className="t-meta tabular-nums shrink-0">· {s.polozky.length}{cenaSkupiny > 0 ? ` · ${money(Math.round(cenaSkupiny))}` : ''}</span>
                  </button>
                  {smiOdeslat && dodavatelSkupiny && supplierByName(dodavatelSkupiny)?.email && (
                    <Button variant="secondary" size="sm" icon="send" loading={emailing === dodavatelSkupiny} onClick={() => emailGroup(dodavatelSkupiny, s.polozky as RadekSeznamu[])}>
                      {t('Objednat e-mailem')}
                    </Button>
                  )}
                </div>
              )}
              {!sbalena && (
                <ul className="list mt-1">
                  {(s.polozky as RadekSeznamu[]).map(i => {
                    const druh = druhNalehavosti(i);
                    const vKosiku = odskrtnute.has(i.id);
                    const kat = ctxKategorie(i, ctx);
                    const meta = [
                      t('zbývá {n} {jednotka}', { n: i.zbyva, jednotka: i.unit ?? '' }),
                      stav.seskupit !== 'kategorie' && kat ? kat : null,
                      stav.seskupit !== 'dodavatel' && (i.supplier ?? '').trim() ? (i.supplier ?? '').trim() : null,
                      poznamkaVyroba(i) || null,
                    ].filter(Boolean).join(' · ');
                    return (
                      <ListRow key={i.id}
                        className={vKosiku ? 'opacity-50' : ''}
                        lead={
                          <button type="button" role="checkbox" aria-checked={vKosiku} onClick={() => prepniOdskrtnuti(i.id)}
                            aria-label={vKosiku ? t('Vrátit {nazev} mezi nekoupené', { nazev: i.name }) : t('Označit {nazev} jako koupené', { nazev: i.name })}
                            className="tap-target-sm -m-2 p-2 rounded-full">
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${vKosiku ? 'bg-[#16181A] border-[#16181A] text-white' : 'border-black/30'}`}>
                              {vKosiku && <Icon name="check" size={14} />}
                            </span>
                          </button>
                        }
                        title={<span className={vKosiku ? 'line-through' : ''}>{i.name}</span>}
                        meta={meta}
                        value={<span className="tabular-nums">+{i.navrh} {i.unit}</span>}
                        right={<Chip tone={druh === 'critical' ? 'bad' : druh === 'low' ? 'wait' : 'info'} size="sm">{popisChipu(druh, t)}</Chip>}
                        actions={i.supplierUrl ? (
                          <a href={i.supplierUrl} target="_blank" rel="noopener" className="btn-icon" aria-label={t('Objednat {nazev} u dodavatele', { nazev: i.name })}>
                            <Icon name="external" size={15} />
                          </a>
                        ) : undefined} />
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}

        {!jenDodavatel && smiOdeslat && viditelne.length > 0 && suppliers.some(sp => sp.email) && (
          <p className="t-meta">{t('Objednat e-mailem rovnou dodavateli jde při seskupení podle dodavatele.')}</p>
        )}
      </div>
    </Modal>
  );
}

function popisChipu(druh: 'critical' | 'low' | 'vyroba' | 'jine', t: ReturnType<typeof useT>): string {
  return druh === 'critical' ? t('kriticky') : druh === 'low' ? t('dochází') : druh === 'vyroba' ? t('na výrobu') : t('přidáno');
}

/** Název kategorie k zobrazení u řádku: kořen stromu, ne celá cesta. */
function ctxKategorie(i: PolozkaNakupu, ctx: ReturnType<typeof sestavKontext>): string | null {
  const c = i.categoryId != null ? ctx.koreny.get(i.categoryId) : null;
  return c?.nazev ?? (i.category ? String(i.category).trim() || null : null);
}
