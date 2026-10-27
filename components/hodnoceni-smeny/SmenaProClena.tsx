'use client';

// Hodnocení celé směny, jak ho vidí člen osádky (lib/hodnoceniSmeny): hvězdy, co bylo dobře, co příště
// jinak, štítky, fotka a JEHO body (body kolegů ne). Kreslí se ve Zpětné vazbě a v detailu dne
// widgetu Hodnocení mých směn.
import { Chip } from '../ui';
import { Icon } from '../Icons';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { STITKY, popisSmeny } from '@/lib/hodnoceniSmeny';
import type { SmenaVeDni } from '@/lib/odmenyPrehled';

const sZnamenkem = (n: number) => `${n > 0 ? '+' : ''}${n}`;

/** Název štítku směny (literály kvůli slovníkům — klíč je česká věta). */
function nazevStitku(t: PrekladFn, id: string): string {
  switch (id) {
    case 'cistota': return t('Čistota');
    case 'rychlost': return t('Rychlost');
    case 'hoste': return t('Obsluha hostů');
    case 'komunikace': return t('Komunikace');
    case 'priprava': return t('Příprava');
    case 'tym': return t('Týmová práce');
    case 'kasa': return t('Uzávěrka a kasa');
    default: return id;
  }
}

export function SmenaProClena({ s, kompaktni = false }: { s: SmenaVeDni; kompaktni?: boolean }) {
  const t = useT('widgety');
  const stitky = STITKY.filter(x => s.stitky[x.id]);
  const nazev = popisSmeny(s) ?? t('Celý den');
  return (
    <div className="space-y-2" data-smena-pro-clena={s.id}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="t-label mr-1">{t('Celá směna')} · {nazev}</span>
        {s.hvezdy > 0 && <Chip tone="ok" size="sm" icon="star">{s.hvezdy}/5</Chip>}
        {s.kNaprave && <Chip tone="bad" size="sm" icon="warning">{t('K nápravě')}</Chip>}
        {s.mojeBody !== 0 && <Chip tone={s.mojeBody > 0 ? 'ok' : 'bad'} size="sm">{t('Tvoje body {b}', { b: sZnamenkem(s.mojeBody) })}</Chip>}
      </div>
      {s.dobre && (
        <p className="text-sm text-black/75 text-pretty whitespace-pre-line">
          <span className="font-semibold text-ok-ink">{t('Dobře:')}</span> {s.dobre}
        </p>
      )}
      {s.kritika && (
        <p className={`text-sm text-black/75 text-pretty whitespace-pre-line ${kompaktni ? 'line-clamp-3' : ''}`}>
          <span className="font-semibold text-bad-ink">{t('Příště jinak:')}</span> {s.kritika}
        </p>
      )}
      {stitky.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stitky.map(x => (
            <Chip key={x.id} tone={s.stitky[x.id] === 'plus' ? 'ok' : 'bad'} size="sm" icon={s.stitky[x.id] === 'plus' ? 'check' : 'warning'}>{nazevStitku(t, x.id)}</Chip>
          ))}
        </div>
      )}
      {s.mojePoznamka && <p className="text-[13px] text-black/60 text-pretty"><Icon name="user" size={13} className="inline -mt-0.5 mr-1" />{s.mojePoznamka}</p>}
      {s.foto && !kompaktni && (
        <a href={s.foto} target="_blank" rel="noopener noreferrer" className="inline-block rounded-[var(--r-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.foto} alt={t('Fotka ze směny')} loading="lazy" className="h-24 w-auto max-w-full rounded-[var(--r-sm)] object-cover" />
        </a>
      )}
    </div>
  );
}
