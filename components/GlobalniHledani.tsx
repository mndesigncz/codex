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
import { obsahujeNekde, proHledani } from '@/lib/hledani';
import { vyberUkoly, jeHotovy, type Ukol } from '@/lib/ukolyPrehled';
import { jeAktivni, type PolozkaSkladu } from '@/lib/skladPrehled';
import { URL_NAVODY, vyberNavody } from '@/lib/navodyPrehled';
import { URL_POSTUPY, vyberPostupy } from '@/lib/postupyPrehled';
import type { AkceHledani } from '@/components/widgety/akceHledani';

const URL_UKOLY = '/api/tasks';
const URL_SKLAD = '/api/inventory';
const URL_TYM = '/api/teams';
const NEJVIC_NA_SKUPINU = 5;

export interface StrankaHledani { id: string; label: string; icon: string }
interface Clovek { id: number; name: string; role: string }

type Vysledek =
  | { druh: 'stranka'; klic: string; ikona: string; titulek: string; podtitulek?: string; stranka: string; arg?: string }
  | { druh: 'clovek'; klic: string; ikona: string; titulek: string; podtitulek?: string; id: number };

export function GlobalniHledani({ open, onClose, stranky, akce = [], onStranka, hledatUkoly = false, hledatSklad = false, hledatLidi = false, hledatNavody = false, hledatPostupy = false, onOsoba, jeUkolyStranka = 'tasks', jeSkladStranka = 'inventory' }: {
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
  /** Otevře profil člověka (jen když ho divák smí vidět). */
  onOsoba?: (id: number) => void;
  jeUkolyStranka?: string;
  jeSkladStranka?: string;
}) {
  const t = useT('widgety');
  const [q, setQ] = useState('');
  const [aktivni, setAktivni] = useState(0);
  const vstup = useRef<HTMLInputElement>(null);
  const seznamRef = useRef<HTMLUListElement>(null);

  const ukoly = useDataWidgetu<Ukol[]>(open && hledatUkoly ? URL_UKOLY : null, vyberUkoly);
  const sklad = useDataWidgetu<PolozkaSkladu[]>(open && hledatSklad ? URL_SKLAD : null, raw => (Array.isArray(raw) ? raw : []).filter(p => p && jeAktivni(p)));
  const navody = useDataWidgetu(open && hledatNavody ? URL_NAVODY : null, vyberNavody);
  const postupy = useDataWidgetu(open && hledatPostupy ? URL_POSTUPY : null, vyberPostupy);
  const lide = useDataWidgetu<Clovek[]>(open && hledatLidi ? URL_TYM : null, raw => (Array.isArray(raw?.members) ? raw.members : []).filter((m: Clovek) => m.role === 'employee' || m.role === 'employer'));

  useEffect(() => { if (open) { setQ(''); setAktivni(0); } }, [open]);

  const dotaz = proHledani(q);
  const skupiny = useMemo(() => {
    const out: { id: string; nadpis: string; polozky: Vysledek[] }[] = [];
    const strankyNalezene = stranky.filter(s => obsahujeNekde(dotaz, s.label)).slice(0, dotaz ? NEJVIC_NA_SKUPINU : 8)
      .map<Vysledek>(s => ({ druh: 'stranka', klic: `s-${s.id}`, ikona: s.icon, titulek: s.label, stranka: s.id }));
    if (strankyNalezene.length) out.push({ id: 'stranky', nadpis: t('Stránky'), polozky: strankyNalezene });
    if (dotaz) {
      // Paleta akcí: hledá se v názvu, umístění i synonymech („kasa" najde Nastavení › Pokladna i Novou uzávěrku).
      const a = akce.filter(x => obsahujeNekde(dotaz, t(x.nazev), t(x.kde), x.nazev, x.kde, ...x.slova)).slice(0, NEJVIC_NA_SKUPINU)
        .map<Vysledek>(x => ({ druh: 'stranka', klic: `a-${x.id}`, ikona: x.ikona, titulek: t(x.nazev), podtitulek: t(x.kde), stranka: x.stranka, arg: x.arg }));
      if (a.length) out.push({ id: 'akce', nadpis: t('Akce a nastavení'), polozky: a });
      const u = (ukoly.data ?? []).filter(x => obsahujeNekde(dotaz, x.title, x.description, x.assigneeName)).sort((a, b) => Number(jeHotovy(a)) - Number(jeHotovy(b)))
        .slice(0, NEJVIC_NA_SKUPINU).map<Vysledek>(x => ({ druh: 'stranka', klic: `u-${x.id}`, ikona: 'check', titulek: x.title,
          podtitulek: [jeHotovy(x) ? t('Hotovo') : x.dueDate ? new Date(`${x.dueDate}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' }) : '', x.assigneeName ?? ''].filter(Boolean).join(' · '),
          stranka: jeUkolyStranka, arg: `ukol:${x.id}` }));
      if (u.length) out.push({ id: 'ukoly', nadpis: t('Úkoly'), polozky: u });
      const s = (sklad.data ?? []).filter(x => obsahujeNekde(dotaz, x.name, x.category, x.supplier)).slice(0, NEJVIC_NA_SKUPINU)
        .map<Vysledek>(x => ({ druh: 'stranka', klic: `p-${x.id}`, ikona: 'box', titulek: x.name, podtitulek: [x.category, `${x.quantity}${x.unit ? ` ${x.unit}` : ''}`].filter(Boolean).join(' · '),
          stranka: jeSkladStranka, arg: x.category ?? undefined }));
      if (s.length) out.push({ id: 'sklad', nadpis: t('Sklad'), polozky: s });
      const n = (navody.data ?? []).filter(x => (x as { approved?: boolean }).approved !== false && obsahujeNekde(dotaz, x.title, (x as { content?: string }).content)).slice(0, NEJVIC_NA_SKUPINU)
        .map<Vysledek>(x => ({ druh: 'stranka', klic: `n-${x.id}`, ikona: 'book', titulek: x.title, stranka: 'guides', arg: String(x.id) }));
      if (n.length) out.push({ id: 'navody', nadpis: t('Návody'), polozky: n });
      const po = (postupy.data?.postupy ?? []).filter(x => x.approved !== false && obsahujeNekde(dotaz, x.name, x.description)).slice(0, NEJVIC_NA_SKUPINU)
        .map<Vysledek>(x => ({ druh: 'stranka', klic: `po-${x.id}`, ikona: 'clipboard', titulek: x.name, podtitulek: Array.isArray(x.items) ? t('{n, plural, one {# krok} few {# kroky} other {# kroků}}', { n: x.items.length }) : undefined, stranka: 'procedures', arg: String(x.id) }));
      if (po.length) out.push({ id: 'postupy', nadpis: t('Postupy'), polozky: po });
      const l = (lide.data ?? []).filter(x => obsahujeNekde(dotaz, x.name)).slice(0, NEJVIC_NA_SKUPINU)
        .map<Vysledek>(x => ({ druh: 'clovek', klic: `l-${x.id}`, ikona: 'user', titulek: x.name, podtitulek: x.role === 'employer' ? t('Vedení') : t('Tým'), id: x.id }));
      if (l.length) out.push({ id: 'lide', nadpis: t('Lidé'), polozky: l });
    }
    return out;
  }, [dotaz, stranky, akce, ukoly.data, sklad.data, navody.data, postupy.data, lide.data, jeUkolyStranka, jeSkladStranka, t]);

  const plocha = skupiny.flatMap(g => g.polozky);
  const nacitam = dotaz !== '' && (ukoly.loading || sklad.loading || navody.loading || postupy.loading || lide.loading);
  useEffect(() => { setAktivni(0); }, [dotaz]);
  useEffect(() => { seznamRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [aktivni]);

  const vyber = (v: Vysledek | undefined) => {
    if (!v) return;
    onClose();
    if (v.druh === 'clovek') onOsoba?.(v.id);
    else onStranka(v.stranka, v.arg);
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
            placeholder={t('Stránka, akce, úkol, položka skladu, člověk…')} maxLength={80} enterKeyHint="go"
            className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-[#16181A] placeholder:text-black/40 focus:outline-none" />
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
