'use client';

// Galerie „Přidat widget" (kolo 68, spec §3.6, DP §5.6).
//
// Nabízí jen to, co divák smí vidět (seznam `dostupne` ze serveru, v klientu
// ještě jednou přes oprávnění) — widget bez oprávnění v galerii není, ani
// zamčený, ani šedý (DP §6.20). Náhledy jsou živé, s divákovými daty, ale
// kreslí se líně, až se položka přiblíží k oknu, a data sdílí s plochou.
// Výběr otevře detail v tomtéž okně (velikost + náhled), ne druhé okno.

import { useCallback, useMemo, useState } from 'react';
import { Button, Chip, Modal, SearchField, Segmented, Well } from '../../ui';
import { MaxBadge, ProBadge } from '../../Pro';
import type { DefiniceStranky, DefiniceWidgetu, PolozkaRozlozeni, Tarif, Velikost } from '@/lib/widgety/typy';
import { OBLASTI, widget as najdiWidget, oblast as najdiOblast } from '@/lib/widgety/katalog';
import { MAX_INSTANCI } from '@/lib/widgety/konstanty';
import { obsahujeNekde } from '@/lib/hledani';
import { Nahled } from '../Nahled';
import { useNavigace } from '../NavigaceKontext';
import { useObal } from '../../ObalProvider';
import { useT, type PrekladFn } from '@/lib/i18n/client';

const velikostSlovne = (t: PrekladFn): Record<Velikost, string> => ({ S: t('Malý'), M: t('Střední'), L: t('Velký') });

interface Skupina { id: string; nazev: string; widgety: DefiniceWidgetu[]; tarifem?: boolean }

export default function GalerieWidgetu({ stranka, nabidka, tarifem, polozky, schematicky, onPridat, onZavrit }: {
  stranka: DefiniceStranky;
  /** Id widgetů, které smí na plochu (už profiltrované podle diváka nebo pro výchozí rozložení). */
  nabidka: readonly string[];
  /** Widgety, na které chybí jen tarif (jen pro toho, kdo smí měnit předplatné). */
  tarifem: readonly { widget: string; tarif: Tarif }[];
  /** Co na ploše už je — kvůli „Na ploše" u widgetů, které smí být jen jednou. */
  polozky: readonly PolozkaRozlozeni[];
  /** Výchozí rozložení: náhledy bez dat. */
  schematicky: boolean;
  onPridat: (widget: string, velikost: Velikost) => void;
  onZavrit: () => void;
}) {
  const nav = useNavigace();
  const t = useT('widgety');
  const slovne = velikostSlovne(t);
  /** Název oblasti v jazyce uživatele (hledání i řazení jede nad přeloženým textem). */
  const tOblast = useCallback((id: string) => { const o = najdiOblast(id); return o ? t(o.nazev) : undefined; }, [t]);
  const { smiPlatby } = useObal();
  const [dotaz, setDotaz] = useState('');
  const [vybrany, setVybrany] = useState<DefiniceWidgetu | null>(null);
  const [velikost, setVelikost] = useState<Velikost>('M');
  const tarifMap = useMemo(() => new Map(tarifem.map(t => [t.widget, t.tarif])), [tarifem]);

  /** Widget, který víckrát být nesmí (nebo už má strop instancí). */
  const plno = (w: DefiniceWidgetu) => {
    const n = polozky.filter(p => p.widget === w.id).length;
    return w.vicekrat ? n >= (w.maxInstanci ?? MAX_INSTANCI) : n > 0;
  };

  const skupiny = useMemo<Skupina[]>(() => {
    const defs = nabidka.map(id => najdiWidget(id)).filter((w): w is DefiniceWidgetu => !!w);
    const vNabidce = new Set(defs.map(w => w.id));
    const doporucene = stranka.doporucene.filter(id => vNabidce.has(id)).map(id => najdiWidget(id)!);
    const jeDoporuceny = new Set(doporucene.map(w => w.id));
    const hleda = dotaz.trim().length > 0;
    const sedi = (w: DefiniceWidgetu) => !hleda || obsahujeNekde(dotaz, t(w.nazev), t(w.popis), tOblast(w.oblast));
    const out: Skupina[] = [];
    // Při hledání by „Doporučené" jen zdvojovalo výsledky pod jejich oblastí.
    if (!hleda && doporucene.length) out.push({ id: 'doporucene', nazev: t('Doporučené pro tuto stránku'), widgety: doporucene });
    for (const o of OBLASTI) {
      const widgety = defs.filter(w => w.oblast === o.id && (hleda || !jeDoporuceny.has(w.id)) && sedi(w));
      if (widgety.length) out.push({ id: o.id, nazev: t(o.nazev), widgety });
    }
    const sTarifem = tarifem.map(t => najdiWidget(t.widget)).filter((w): w is DefiniceWidgetu => !!w && sedi(w));
    // V obalu se widgety „s tarifem“ nenabízejí vůbec: výzva k tarifům je výzva k nákupu.
    if (sTarifem.length && smiPlatby) out.push({ id: 'tarif', nazev: t('S tarifem Pro nebo Max'), widgety: sTarifem, tarifem: true });
    return out;
  }, [nabidka, tarifem, stranka, dotaz, smiPlatby, t, tOblast]);

  const otevrit = (w: DefiniceWidgetu) => {
    setVybrany(w);
    setVelikost(w.velikosti.includes(w.vychoziVelikost) ? w.vychoziVelikost : w.velikosti[0]);
  };

  if (vybrany) {
    const nazevOblasti = tOblast(vybrany.oblast);
    return (
      <Modal open onClose={onZavrit} size="lg" title={t(vybrany.nazev)} subtitle={nazevOblasti}
        footer={<>
          <Button variant="ghost" icon="chevron" className="[&>svg]:rotate-90" onClick={() => setVybrany(null)}>{t('Zpět')}</Button>
          <Button variant="primary" icon="plus" onClick={() => onPridat(vybrany.id, velikost)}>{t('Přidat widget')}</Button>
        </>}>
        <div className="space-y-4">
          <p className="t-meta text-pretty">{t(vybrany.popis)}</p>
          {vybrany.velikosti.length > 1 && (
            <Segmented size="sm" ariaLabel={t('Velikost')} value={velikost} onChange={setVelikost}
              options={vybrany.velikosti.map(v => ({ id: v, label: slovne[v] }))} />
          )}
          <Well pad="sm">
            <Nahled widget={vybrany.id} velikost={velikost} schematicky={schematicky} className="max-h-[22rem]" />
          </Well>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onZavrit} size="lg" title={t('Přidat widget')} subtitle={t(stranka.nazev)}>
      <div className="space-y-5">
        <div data-transient="">
          <SearchField value={dotaz} onChange={setDotaz} storageKey="galerie-widgetu" ariaLabel={t('Hledat widget')} placeholder={t('Hledat widget…')} />
        </div>
        {skupiny.length === 0 && (
          <p className="t-meta">{dotaz.trim() ? t('Takový widget tu není. Zkus jiné slovo.') : t('Na tuhle stránku teď nic dalšího nejde přidat.')}</p>
        )}
        {skupiny.map(s => (
          <section key={s.id} aria-labelledby={`galerie-${s.id}`} className="space-y-2.5">
            <h4 id={`galerie-${s.id}`} className="t-label">{s.nazev}</h4>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {s.widgety.map(w => {
                const tarif = s.tarifem ? tarifMap.get(w.id) ?? 'pro' : null;
                const naPlose = !tarif && plno(w);
                const idPopisu = `galerie-${s.id}-${w.id.replace(/[^a-z0-9]/gi, '-')}-p`;
                return (
                  // Klikací karta přes natažené tlačítko, ne <button> kolem náhledu: v náhledu
                  // jsou tlačítka widgetu (odkaz dál, „Zkusit znovu") a tlačítko v tlačítku
                  // je neplatné HTML, které odečítač přečte jako jeden nesmyslný blok.
                  <li key={w.id} className={`card p-4 relative min-w-0 flex flex-col gap-3 transition-shadow ${naPlose || tarif ? '' : 'hover:shadow-[shadow:var(--shadow-float)]'}`}>
                    <Well pad="sm" className="w-full">
                      {/* Widget s tarifem se ukáže bez dat: náhled by jinak poslal dotaz, který tarif nepustí. */}
                      <Nahled widget={w.id} velikost={w.vychoziVelikost} line schematicky={schematicky || !!tarif} className="max-h-52" />
                    </Well>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="t-card">{t(w.nazev)}</p>
                        <p id={idPopisu} className="t-meta mt-0.5 text-pretty">{t(w.popis)}</p>
                      </div>
                      {naPlose && <Chip tone="muted" size="sm" className="shrink-0">{t('Na ploše')}</Chip>}
                      {tarif && (tarif === 'max' ? <MaxBadge className="shrink-0" /> : <ProBadge className="shrink-0" />)}
                    </div>
                    {tarif ? (
                      // Místo přidání cesta k tarifům — widget, který by na ploše nešel, se nepřidává.
                      <Button variant="ghost" size="sm" iconAfter="chevronRight" className="self-start -ml-2"
                        onClick={() => { onZavrit(); nav.onNavigate('settings', 'billing'); }}>
                        {t('Zobrazit tarify')}
                      </Button>
                    ) : (
                      <button type="button"
                        aria-label={t(w.nazev)}
                        aria-describedby={idPopisu}
                        aria-disabled={naPlose || undefined}
                        title={naPlose ? t('Tenhle widget už na ploše je a víckrát být nemůže.') : undefined}
                        onClick={() => { if (!naPlose) otevrit(w); }}
                        className={`absolute inset-0 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] ${naPlose ? 'cursor-default' : ''}`} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
