'use client';

// „S tebou: Anna · Tomáš 12:00–20:00" — kdo je s tebou na směně (lib/rozvrhPrehled kolegoveKeSmene).
// Čas se ukáže jen tomu, kdo nestojí přesně stejně jako ty; víc než tři jména se sloučí do „+N".
import type { Kolega } from '@/lib/rozvrhPrehled';
import { useT } from '@/lib/i18n/client';

const NEJVIC_JMEN = 3;

export function KolegoveSmeny({ kolegove, hotovo }: { kolegove: readonly Kolega[]; hotovo: boolean }) {
  const t = useT('widgety');
  if (!hotovo) return null;
  if (kolegove.length === 0) return <span className="text-black/45">{t('Zatím nikdo další')}</span>;
  const videt = kolegove.slice(0, NEJVIC_JMEN);
  const zbyva = kolegove.length - videt.length;
  return (
    <span>
      <span className="text-black/45">{t('S tebou')}: </span>
      {videt.map((k, i) => (
        <span key={`${k.id}-${k.od}`}>
          {i > 0 && <span aria-hidden className="text-black/30"> · </span>}
          <span className="font-medium text-[#16181A]">{k.jmeno ?? t('Kolega')}</span>
          {!k.stejne && <> <span className="tabular-nums text-black/55">{k.od}–{k.do}</span></>}
        </span>
      ))}
      {zbyva > 0 && <span className="text-black/55"> {t('a {n, plural, one {# další} few {# další} other {# dalších}}', { n: zbyva })}</span>}
    </span>
  );
}
