'use client';

// Návrhy trestů z dat (kolo 10, balík V) — část widgetu Tresty v týmu: pozdní příchod,
// manko v uzávěrce, výtka z hodnocení směny za posledních 14 dní. U každého „Dát trest"
// (okno předvyplněné z návrhu — volající) a „Zahodit" (POST /api/tresty/navrhy { klic };
// zahozený návrh se už nenabídne). Jen s tresty.udelit — bez něj se návrhy ani nečtou.

import React, { useState } from 'react';
import { URL_NAVRHY_TRESTU, type NavrhTrestu } from '@/lib/tresty';
import { apiMessage, okJson } from '@/lib/api';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { Avatar, Button, ListRow, Toast } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { obnovTresty } from './data';

/** „Pozdní příchod o 18 min" / „Manko v uzávěrce 340 Kč" / „Výtka z hodnocení: …" (přeložené). */
export function popisNavrhu(t: PrekladFn, n: NavrhTrestu, money: (x: number) => string): string {
  if (n.druh === 'pozde') return t('Pozdní příchod o {n} min', { n: n.minuty ?? 0 });
  if (n.druh === 'manko') return t('Manko v uzávěrce {castka}', { castka: money(n.castka ?? 0) });
  return n.poznamka ? t('Výtka z hodnocení: {text}', { text: n.poznamka }) : t('Výtka z hodnocení směny');
}

export function NavrhyTrestu({ navrhy, onDat, nahled = false }: {
  navrhy: readonly NavrhTrestu[];
  onDat: (n: NavrhTrestu) => void;
  nahled?: boolean;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const [zahazuji, setZahazuji] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad'; id: number } | null>(null);
  const zahodit = async (n: NavrhTrestu) => {
    setZahazuji(n.klic);
    try {
      await fetch(URL_NAVRHY_TRESTU, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ klic: n.klic }) }).then(okJson);
      obnovTresty();
      setToast({ text: t('Návrh zahozený — už se nenabídne.'), tone: 'ok', id: Date.now() });
    } catch (e) {
      setToast({ text: apiMessage(e, t('Návrh se nepodařilo zahodit.')), tone: 'bad', id: Date.now() });
    } finally {
      setZahazuji(null);
    }
  };
  const akce = (n: (typeof navrhy)[number]) => (
    <>
      <Button variant="secondary" size="sm" icon="warning" className="tap-target" disabled={zahazuji === n.klic}
        aria-label={t('Dát trest: {jmeno}', { jmeno: n.userName })} onClick={() => onDat(n)}>{t('Dát trest')}</Button>
      <Button variant="ghost" size="sm" className="tap-target" loading={zahazuji === n.klic}
        aria-label={t('Zahodit návrh: {jmeno}', { jmeno: n.userName })} onClick={() => { void zahodit(n); }}>{t('Zahodit')}</Button>
    </>
  );
  return (
    <>
      <ul className="list" data-navrhy-trestu>
        {navrhy.map(n => (
          <ListRow key={n.klic}
            lead={<Avatar emoji={n.userAvatar} name={n.userName} size="sm" />}
            title={n.userName || t('Člen týmu')}
            meta={fmtDatum(n.day, { jazyk: t.jazyk, styl: 'denKratce' })}
            detail={<span className="block text-[#16181A]">{popisNavrhu(t, n, money)}</span>}
            // v4 (P12): na telefonu je pár akcí ½ + ½ na ose textu — ListRow to dělá sám.
            actions={nahled ? undefined : akce(n)} />
        ))}
      </ul>
      <Toast message={toast?.text ?? null} tone={toast?.tone} id={toast?.id} onClose={() => setToast(null)} />
    </>
  );
}

export default NavrhyTrestu;
