'use client';

// Rychlé přidání úkolu jedním řádkem: napíšeš „Objednat mléko zítra", Enter a hotovo (vzor Todoist, Things).
// Datum se čte z konce řádku (dnes, zítra, pozítří, v pátek, za 3 dny), bez data je to dnes. Plný formulář (popis, kroky,
// opakování, priorita) zůstává za tlačítkem „Nový úkol"; tohle je pro úkol, který se řekne jednou větou.

import { useState } from 'react';
import { Button } from '../ui';
import { Icon } from '../Icons';
import { useT } from '@/lib/i18n/client';
import { aktualniJazyk } from '@/lib/i18n/stav';
import { rozborRychlehoUkolu } from '@/lib/ukolyFiltr';

export function RychlePridani({ dnes, onPridat, className = '', kratce = false }: {
  dnes: string;
  /** Vedle hledání a „Filtry" (v3): krátký zástupný text, příklad by se v užším poli usekl. */
  kratce?: boolean;
  /** Vytvoří úkol; vyhodí chybu se srozumitelnou zprávou, když se nepovede. */
  onPridat: (title: string, dueDate: string) => Promise<void>;
  className?: string;
}) {
  const t = useT('widgety');
  const loc = aktualniJazyk();
  const [text, setText] = useState('');
  const [ceka, setCeka] = useState(false);
  const [chyba, setChyba] = useState('');
  const rozbor = text.trim() ? rozborRychlehoUkolu(text, dnes) : null;
  const denPopis = (d: string) => (d === dnes ? t('dnes') : new Date(`${d}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'numeric' }));

  const odeslat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rozbor || ceka) return;
    setCeka(true); setChyba('');
    try { await onPridat(rozbor.title, rozbor.dueDate); setText(''); }
    catch (err) { setChyba(err instanceof Error ? err.message : t('Úkol se nepodařilo přidat.')); }
    setCeka(false);
  };

  return (
    <form onSubmit={odeslat} className={className} aria-label={t('Rychlé přidání úkolu')}>
      <div className="flex items-center gap-2 rounded-full glass pl-4 pr-1.5 focus-within:ring-2 focus-within:ring-[#C8F542]">
        <Icon name="plus" size={16} className="shrink-0 text-black/45" />
        <input value={text} onChange={e => setText(e.target.value)} maxLength={200} enterKeyHint="done"
          aria-label={t('Přidat úkol')} placeholder={kratce ? t('Přidat úkol…') : t('Přidat úkol… (např. Objednat mléko zítra)')} title={kratce ? t('Např. Objednat mléko zítra') : undefined}
          className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-[#16181A] placeholder:text-black/45 dark:placeholder:text-white/40 focus:outline-none" />
        {rozbor && <Button type="submit" variant="secondary" size="sm" loading={ceka}>{t('Přidat')}</Button>}
      </div>
      {rozbor && <p className="t-meta mt-1.5 pl-4" aria-live="polite">{t('Termín: {den}', { den: denPopis(rozbor.dueDate) })}</p>}
      {chyba && <p className="note note-danger mt-2 text-sm" role="alert">{chyba}</p>}
    </form>
  );
}
