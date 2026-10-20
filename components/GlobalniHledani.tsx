'use client';

// Globální hledání (Ctrl/⌘ K): jedno okno, které najde stránku aplikace, úkol, položku skladu nebo člověka z týmu a rovnou tam
// vede. Standard moderních aplikací (Linear, Notion, Slack) — dřív se hledalo pokaždé zvlášť na stránce, kde člověk zrovna je.
// Data se načtou až po otevření a přes sdílenou mezipaměť widgetů, takže hledání nepřidá dotazy, které stránka už nedělá.
// Co člověk smí vidět, říkají předané příznaky (layout je bere z oprávnění), ne tohle okno.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons';
import { Modal } from './ui';
import { useDataWidgetu } from './widgety/useDataWidgetu';
import { useT } from '@/lib/i18n/client';
import { datumZDotazu, obsahujeNekde, proHledani } from '@/lib/hledani';
import { vyberUkoly, jeHotovy, type Ukol } from '@/lib/ukolyPrehled';
import { jeAktivni, type PolozkaSkladu } from '@/lib/skladPrehled';
import { URL_NAVODY, vyberNavody } from '@/lib/navodyPrehled';
import { URL_POSTUPY, vyberPostupy } from '@/lib/postupyPrehled';
import { KLIC_DEN, UDALOST_DEN, denUzaverky, jeHlavni, type RadekUzaverky } from '@/lib/uzaverkyPrehled';
import { pragueToday } from '@/lib/pragueTime';
import type { AkceHledani } from '@/components/widgety/akceHledani';

const URL_UKOLY = '/api/tasks';
const URL_SKLAD = '/api/inventory';
const URL_TYM = '/api/teams';
// Kolo 8: hosté, rezervace, receptury, menu a uzávěrky — tytéž adresy jako widgety (sdílená mezipaměť).
const URL_HOSTE = '/api/client/admin/customers';
const URL_REZERVACE = '/api/client/admin/reservations?range=upcoming';
const URL_RECEPTURY = '/api/pos/products';
const URL_MENU = '/api/menu';
const URL_UZAVERKY = '/api/closings';
const NEJVIC_NA_SKUPINU = 5;
/** Hosté se hledají na serveru: až od dvou znaků a s odstupem, ne po každém písmenu. */
const HOSTE_OD_ZNAKU = 2;
const ODSTUP_MS = 250;

export interface StrankaHledani { id: string; label: string; icon: string }
interface Clovek { id: number; name: string; role: string }
interface Host { id: number; name: string; email: string | null; phone: string | null; visits: number }
interface Rezervace { id: number; date: string; time: string | null; jmeno: string; telefon: string | null; party: number; stul: string | null }
interface Produkt { productId: string; name: string; category: string; receptura: boolean }
interface PolozkaMenu { id: number; name: string; sekce: string; deska: string }

const vyberHosty = (raw: any): Host[] => (Array.isArray(raw?.customers) ? raw.customers : []).map((c: any) => ({
  id: Number(c.id), name: String(c.name ?? ''), email: typeof c.email === 'string' ? c.email : null, phone: typeof c.phone === 'string' ? c.phone : null, visits: Number(c.visits) || 0,
})).filter((h: Host) => h.name);
const vyberRezervace = (raw: any): Rezervace[] => (Array.isArray(raw?.reservations) ? raw.reservations : []).map((r: any) => ({
  id: Number(r.id), date: String(r.date ?? '').slice(0, 10), time: typeof r.time === 'string' ? r.time : null,
  jmeno: String(r.customer_name ?? r.guest_name ?? ''), telefon: typeof r.customer_phone === 'string' ? r.customer_phone : null,
  party: Number(r.party) || 0, stul: typeof r.table_name === 'string' ? r.table_name : null,
})).filter((r: Rezervace) => r.jmeno && r.date);
const vyberProdukty = (raw: any): Produkt[] => {
  const sRecepturou = new Set((Array.isArray(raw?.recipes) ? raw.recipes : []).map((r: any) => String(r.productId)));
  return (Array.isArray(raw?.products) ? raw.products : []).map((p: any) => ({
    productId: String(p.productId ?? ''), name: String(p.name ?? ''), category: String(p.category ?? ''), receptura: sRecepturou.has(String(p.productId)),
  })).filter((p: Produkt) => p.productId && p.name);
};
const vyberMenu = (raw: any): PolozkaMenu[] => (Array.isArray(raw?.boards) ? raw.boards : []).flatMap((b: any) =>
  (Array.isArray(b?.sections) ? b.sections : []).flatMap((s: any) =>
    (Array.isArray(s?.items) ? s.items : []).map((i: any) => ({ id: Number(i.id), name: String(i.name ?? ''), sekce: String(s.title ?? ''), deska: String(b.name ?? '') }))))
  .filter((i: PolozkaMenu) => i.name);
const vyberUzaverky = (raw: any): RadekUzaverky[] => (Array.isArray(raw?.closings) ? raw.closings : []).filter((c: any) => c && c.date && jeHlavni(c));

/** Odložená hodnota (hledání hostů na serveru nesmí střílet po každém písmenu). */
function useOdlozene<T>(hodnota: T, ms: number): T {
  const [v, setV] = useState(hodnota);
  useEffect(() => { const c = setTimeout(() => setV(hodnota), ms); return () => clearTimeout(c); }, [hodnota, ms]);
  return v;
}

type Vysledek =
  | { druh: 'stranka'; klic: string; ikona: string; titulek: string; podtitulek?: string; stranka: string; arg?: string }
  | { druh: 'clovek'; klic: string; ikona: string; titulek: string; podtitulek?: string; id: number }
  | { druh: 'uzaverka'; klic: string; ikona: string; titulek: string; podtitulek?: string; den: string };

export function GlobalniHledani({ open, onClose, stranky, akce = [], onStranka, hledatUkoly = false, hledatSklad = false, hledatLidi = false, hledatNavody = false, hledatPostupy = false,
  hledatHosty = false, hledatRezervace = false, hledatReceptury = false, hledatMenu = false, hledatUzaverky = false, onOsoba, jeUkolyStranka = 'tasks', jeSkladStranka = 'inventory' }: {
  open: boolean;
  onClose: () => void;
  /** Akce a nastavení (lib/akceHledani), které divák smí: Export docházky, Nastavení › Pokladna… */
  akce?: AkceHledani[];
  /** Stránky, které divák smí otevřít (z navigace layoutu). */
  stranky: readonly StrankaHledani[];
  onStranka: (stranka: string, arg?: string) => void;
  hledatUkoly?: boolean;
  hledatSklad?: boolean;
  hledatLidi?: boolean;
  hledatNavody?: boolean;
  hledatPostupy?: boolean;
  /** Hosté (zakaznici.zobrazit): jméno, telefon, e-mail → Managero client › Hosté. */
  hledatHosty?: boolean;
  /** Nadcházející rezervace podle jména hosta (rezervace.zobrazit) → den v Rezervacích. */
  hledatRezervace?: boolean;
  /** Produkty z kasy (receptury.zobrazit) → editor receptury. */
  hledatReceptury?: boolean;
  /** Položky menu pro hosty (menu.zobrazit) → editor menu. */
  hledatMenu?: boolean;
  /** Uzávěrky podle dne („3.10.", „včera", „pátek") nebo autora (uzaverky.zobrazit_vse) → den v Uzávěrkách. */
  hledatUzaverky?: boolean;
  /** Otevře profil člověka (jen když ho divák smí vidět). */
  onOsoba?: (id: number) => void;
  jeUkolyStranka?: string;
  jeSkladStranka?: string;
}) {
  const t = useT('widgety');
  const [q, setQ] = useState('');
  const [aktivni, setAktivni] = useState(0);
  // Skupiny rozbalené přes „Zobrazit všechny (12)".
  const [rozbalene, setRozbalene] = useState<Set<string>>(new Set());
  const vstup = useRef<HTMLInputElement>(null);
  const seznamRef = useRef<HTMLUListElement>(null);

  const ukoly = useDataWidgetu<Ukol[]>(open && hledatUkoly ? URL_UKOLY : null, vyberUkoly);
  const sklad = useDataWidgetu<PolozkaSkladu[]>(open && hledatSklad ? URL_SKLAD : null, raw => (Array.isArray(raw) ? raw : []).filter(p => p && jeAktivni(p)));
  const navody = useDataWidgetu(open && hledatNavody ? URL_NAVODY : null, vyberNavody);
  const postupy = useDataWidgetu(open && hledatPostupy ? URL_POSTUPY : null, vyberPostupy);
  const lide = useDataWidgetu<Clovek[]>(open && hledatLidi ? URL_TYM : null, raw => (Array.isArray(raw?.members) ? raw.members : []).filter((m: Clovek) => m.role === 'employee' || m.role === 'employer'));
  const dotaz = proHledani(q);
  const dotazHostu = useOdlozene(dotaz.length >= HOSTE_OD_ZNAKU ? dotaz : '', ODSTUP_MS);
  const hoste = useDataWidgetu<Host[]>(open && hledatHosty && dotazHostu ? `${URL_HOSTE}?q=${encodeURIComponent(dotazHostu)}&limit=20` : null, vyberHosty);
  const rezervace = useDataWidgetu<Rezervace[]>(open && hledatRezervace ? URL_REZERVACE : null, vyberRezervace);
  const produkty = useDataWidgetu<Produkt[]>(open && hledatReceptury ? URL_RECEPTURY : null, vyberProdukty);
  const menu = useDataWidgetu<PolozkaMenu[]>(open && hledatMenu ? URL_MENU : null, vyberMenu);
  const uzaverky = useDataWidgetu<RadekUzaverky[]>(open && hledatUzaverky ? URL_UZAVERKY : null, vyberUzaverky);

  useEffect(() => { if (open) { setQ(''); setAktivni(0); setRozbalene(new Set()); } }, [open]);

  const datum = (den: string) => new Date(`${den}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' });
  const skupiny = useMemo(() => {
    const out: { id: string; nadpis: string; polozky: Vysledek[]; celkem: number }[] = [];
    // Skupina nejvýš s pěti řádky; „Zobrazit všechny (12)" ji rozbalí. Všechno se počítá před ořezem.
    const pridej = (id: string, nadpis: string, vse: Vysledek[], strop = NEJVIC_NA_SKUPINU) => {
      if (!vse.length) return;
      out.push({ id, nadpis, polozky: rozbalene.has(id) ? vse : vse.slice(0, strop), celkem: vse.length });
    };
    const strankyNalezene = stranky.filter(s => obsahujeNekde(dotaz, s.label))
      .map<Vysledek>(s => ({ druh: 'stranka', klic: `s-${s.id}`, ikona: s.icon, titulek: s.label, stranka: s.id }));
    pridej('stranky', t('Stránky'), strankyNalezene, dotaz ? NEJVIC_NA_SKUPINU : 8);
    if (dotaz) {
      // Paleta akcí: hledá se v názvu, umístění i synonymech („kasa" najde Nastavení › Pokladna i Novou uzávěrku).
      pridej('akce', t('Akce a nastavení'), akce.filter(x => obsahujeNekde(dotaz, t(x.nazev), t(x.kde), x.nazev, x.kde, ...x.slova))
        .map<Vysledek>(x => ({ druh: 'stranka', klic: `a-${x.id}`, ikona: x.ikona, titulek: t(x.nazev), podtitulek: t(x.kde), stranka: x.stranka, arg: x.arg })));
      pridej('ukoly', t('Úkoly'), (ukoly.data ?? []).filter(x => obsahujeNekde(dotaz, x.title, x.description, x.assigneeName)).sort((a, b) => Number(jeHotovy(a)) - Number(jeHotovy(b)))
        .map<Vysledek>(x => ({ druh: 'stranka', klic: `u-${x.id}`, ikona: 'check', titulek: x.title,
          podtitulek: [jeHotovy(x) ? t('Hotovo') : x.dueDate ? datum(x.dueDate) : '', x.assigneeName ?? ''].filter(Boolean).join(' · '),
          stranka: jeUkolyStranka, arg: `ukol:${x.id}` })));
      pridej('sklad', t('Sklad'), (sklad.data ?? []).filter(x => obsahujeNekde(dotaz, x.name, x.category, x.supplier))
        .map<Vysledek>(x => ({ druh: 'stranka', klic: `p-${x.id}`, ikona: 'box', titulek: x.name, podtitulek: [x.category, `${x.quantity}${x.unit ? ` ${x.unit}` : ''}`].filter(Boolean).join(' · '),
          stranka: jeSkladStranka, arg: x.category ?? undefined })));
      // Hosté (kolo 8): server už hledá podle jména, telefonu a — s právem na kontakty — e-mailu; tady se jen kreslí.
      pridej('hoste', t('Hosté'), (dotazHostu && dotazHostu === dotaz ? hoste.data ?? [] : [])
        .map<Vysledek>(h => ({ druh: 'stranka', klic: `h-${h.id}`, ikona: 'user', titulek: h.name,
          podtitulek: [h.phone, h.email, h.visits ? t('{n, plural, one {# návštěva} few {# návštěvy} other {# návštěv}}', { n: h.visits }) : ''].filter(Boolean).join(' · '),
          stranka: 'klient:customers', arg: `clen:${h.id}` })));
      // Rezervace: jméno hosta nebo telefon v nadcházejících rezervacích → den v Rezervacích.
      pridej('rezervace', t('Rezervace'), (rezervace.data ?? []).filter(r => obsahujeNekde(dotaz, r.jmeno, r.telefon))
        .map<Vysledek>(r => ({ druh: 'stranka', klic: `r-${r.id}`, ikona: 'calendar', titulek: r.jmeno,
          podtitulek: [`${datum(r.date)}${r.time ? ` ${r.time}` : ''}`, r.party ? t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: r.party }) : '', r.stul].filter(Boolean).join(' · '),
          stranka: 'klient:reservations', arg: `den:${r.date}` })));
      // Receptury: produkt z kasy → editor receptury (i bez receptury: tam se založí).
      pridej('receptury', t('Receptury'), (produkty.data ?? []).filter(x => obsahujeNekde(dotaz, x.name, x.category)).sort((a, b) => Number(b.receptura) - Number(a.receptura))
        .map<Vysledek>(x => ({ druh: 'stranka', klic: `re-${x.productId}`, ikona: 'clipboard', titulek: x.name,
          podtitulek: [x.category, x.receptura ? '' : t('Bez receptury')].filter(Boolean).join(' · '), stranka: 'recipes', arg: x.productId })));
      pridej('menu', t('Menu'), (menu.data ?? []).filter(x => obsahujeNekde(dotaz, x.name, x.sekce))
        .map<Vysledek>(x => ({ druh: 'stranka', klic: `m-${x.id}`, ikona: 'cup', titulek: x.name, podtitulek: [x.sekce, x.deska].filter(Boolean).join(' · '), stranka: 'klient:menu', arg: `polozka:${x.id}` })));
      pridej('navody', t('Návody'), (navody.data ?? []).filter(x => (x as { approved?: boolean }).approved !== false && obsahujeNekde(dotaz, x.title, (x as { content?: string }).content))
        .map<Vysledek>(x => ({ druh: 'stranka', klic: `n-${x.id}`, ikona: 'book', titulek: x.title, stranka: 'guides', arg: String(x.id) })));
      pridej('postupy', t('Postupy'), (postupy.data?.postupy ?? []).filter(x => x.approved !== false && obsahujeNekde(dotaz, x.name, x.description))
        .map<Vysledek>(x => ({ druh: 'stranka', klic: `po-${x.id}`, ikona: 'clipboard', titulek: x.name, podtitulek: Array.isArray(x.items) ? t('{n, plural, one {# krok} few {# kroky} other {# kroků}}', { n: x.items.length }) : undefined, stranka: 'procedures', arg: String(x.id) })));
      // Uzávěrky: den z dotazu („3.10.", „včera", „pátek"), jinak autor nebo akce; nejnovější první.
      const den = datumZDotazu(dotaz, pragueToday());
      pridej('uzaverky', t('Uzávěrky'), (uzaverky.data ?? []).filter(c => (den ? denUzaverky(c) === den : obsahujeNekde(dotaz, c.author_name, c.event_title, c.shift_label)))
        .sort((a, b) => denUzaverky(b).localeCompare(denUzaverky(a)))
        .map<Vysledek>(c => ({ druh: 'uzaverka', klic: `z-${c.id}`, ikona: 'coins', titulek: `${t('Uzávěrka')} ${datum(denUzaverky(c))}`,
          podtitulek: [c.author_name, c.shift_label, c.event_title].filter(Boolean).join(' · '), den: denUzaverky(c) })));
      pridej('lide', t('Lidé'), (lide.data ?? []).filter(x => obsahujeNekde(dotaz, x.name))
        .map<Vysledek>(x => ({ druh: 'clovek', klic: `l-${x.id}`, ikona: 'user', titulek: x.name, podtitulek: x.role === 'employer' ? t('Vedení') : t('Tým'), id: x.id })));
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dotaz, dotazHostu, rozbalene, stranky, akce, ukoly.data, sklad.data, navody.data, postupy.data, lide.data, hoste.data, rezervace.data, produkty.data, menu.data, uzaverky.data, jeUkolyStranka, jeSkladStranka, t]);

  const plocha = skupiny.flatMap(g => g.polozky);
  const nacitam = dotaz !== '' && (ukoly.loading || sklad.loading || navody.loading || postupy.loading || lide.loading || hoste.loading || rezervace.loading || produkty.loading || menu.loading || uzaverky.loading);
  useEffect(() => { setAktivni(0); }, [dotaz]);
  useEffect(() => { seznamRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [aktivni]);

  const vyber = (v: Vysledek | undefined) => {
    if (!v) return;
    onClose();
    if (v.druh === 'clovek') { onOsoba?.(v.id); return; }
    if (v.druh === 'uzaverka') {
      // Stejná cesta jako z kalendáře uzávěrek: nástroj na téže stránce den přijme hned
      // (událost, `prijato`), jinak si ho vyzvedne po přechodu ze sessionStorage.
      const detail = { hodnota: v.den, prijato: false };
      window.dispatchEvent(new CustomEvent(UDALOST_DEN, { detail }));
      if (!detail.prijato) {
        try { sessionStorage.setItem(KLIC_DEN, v.den); } catch { /* soukromé okno: Uzávěrky se otevřou bez filtru */ }
        onStranka('reports');
      }
      return;
    }
    onStranka(v.stranka, v.arg);
  };
  const klavesa = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAktivni(i => Math.min(plocha.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAktivni(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); vyber(plocha[aktivni]); }
  };

  if (!open) return null;
  let poradi = -1;
  return (
    <Modal open onClose={onClose} size="md" title={t('Hledat v aplikaci')} nadOkny>
      <div className="space-y-3" onKeyDown={klavesa}>
        <div className="flex items-center gap-2 rounded-full glass pl-4 pr-3 focus-within:ring-2 focus-within:ring-[#C8F542]">
          <Icon name="search" size={16} className="shrink-0 text-black/45" />
          {/* data-transient: dotaz není rozepsaný text, který by se měl chránit před zavřením okna */}
          <input ref={vstup} data-transient autoFocus value={q} onChange={e => setQ(e.target.value)} role="combobox" aria-expanded aria-controls="globalni-hledani-vysledky" aria-autocomplete="list"
            aria-activedescendant={plocha[aktivni] ? `gh-${plocha[aktivni].klic}` : undefined} aria-label={t('Hledat v aplikaci')}
            placeholder={t('Stránka, akce, úkol, host, receptura, uzávěrka…')} maxLength={80} enterKeyHint="go"
            className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-[#16181A] placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none" />
        </div>
        <div id="globalni-hledani-vysledky" role="listbox" aria-label={t('Výsledky hledání')} className="max-h-[50vh] overflow-y-auto scrollbar-thin -mx-1 px-1">
          {skupiny.map(g => (
            <section key={g.id} aria-label={g.nadpis} className="mb-2">
              <h4 className="t-label px-2 pb-1 pt-2">{g.nadpis}</h4>
              <ul ref={g.id === skupiny[0]?.id ? seznamRef : undefined} className="space-y-0.5">
                {g.polozky.map(v => {
                  poradi += 1;
                  const je = poradi === aktivni;
                  const mojePoradi = poradi;
                  return (
                    <li key={v.klic} id={`gh-${v.klic}`} role="option" aria-selected={je}>
                      <button type="button" tabIndex={-1} onMouseEnter={() => setAktivni(mojePoradi)} onClick={() => vyber(v)}
                        className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${je ? 'bg-black/[0.06]' : 'hover:bg-black/[0.03]'}`}>
                        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-black/[0.05] text-black/60"><Icon name={v.ikona} size={16} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-[#16181A]">{v.titulek}</span>
                          {v.podtitulek && <span className="block truncate text-[13px] text-black/50">{v.podtitulek}</span>}
                        </span>
                        <Icon name="chevronRight" size={14} className="shrink-0 text-black/30" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {g.celkem > g.polozky.length && (
                <button type="button" tabIndex={-1} onClick={() => setRozbalene(r => new Set(r).add(g.id))}
                  className="mt-0.5 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-black/60 hover:bg-black/[0.03] transition-colors">
                  <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center"><Icon name="chevron" size={14} /></span>
                  {t('Zobrazit všechny ({n})', { n: g.celkem })}
                </button>
              )}
            </section>
          ))}
          {dotaz && plocha.length === 0 && !nacitam && <p className="t-meta px-2 py-6 text-center">{t('Nic nenalezeno pro „{q}".', { q: q.trim() })}</p>}
          {nacitam && plocha.length === 0 && <p className="t-meta px-2 py-6 text-center">{t('Hledám…')}</p>}
        </div>
        <p className="t-meta hidden md:block px-1">{t('↑ ↓ vybírají, Enter otevře, Esc zavře.')}</p>
      </div>
    </Modal>
  );
}

/** Ctrl/⌘ K otevře a zavře hledání; vrací stav a jeho přepínač. */
export function useZkratkaHledani(): { otevreno: boolean; setOtevreno: (v: boolean) => void } {
  const [otevreno, setOtevreno] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setOtevreno(v => !v); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return { otevreno, setOtevreno };
}
