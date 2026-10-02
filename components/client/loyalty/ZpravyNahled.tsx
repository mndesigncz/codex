'use client';

// Náhled zprávy: jak ji uvidí host na telefonu. Stejné složení textu jako server
// (lib/zpravyPravidla.textOznameni), takže řádek s kuponem nebo promo kódem
// v náhledu odpovídá tomu, co opravdu přijde.

import { Icon } from '../../Icons';
import { Well } from '../../ui';
import { textOznameni, type PrilohaZpravy } from '@/lib/zpravyPravidla';

const CIL: Record<string, string> = {
  page: 'Stránka podniku',
  loyalty: 'Věrnost a kupony',
  order: 'Objednávka od stolu',
  me: 'Jeho kartička (Moje)',
};

export default function ZpravyNahled({ nazev, title, body, priloha, linkKind, zkouska = false }: {
  nazev: string | null;
  title: string;
  body: string;
  priloha?: PrilohaZpravy | null;
  linkKind: string;
  zkouska?: boolean;
}) {
  const t = textOznameni(title.trim() || 'Nadpis zprávy', body, priloha);
  const prazdne = !title.trim();
  return (
    <Well className="space-y-2" aria-label="Náhled zprávy">
      <p className="t-label">Takhle ji uvidí host</p>
      <div className="rounded-2xl glass-strong p-3.5 flex items-start gap-3">
        <span className="shrink-0 h-9 w-9 rounded-xl bg-[#16181A] text-[#C8F542] grid place-items-center" aria-hidden="true">
          <Icon name="bell" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-black/50 truncate">{nazev || 'Tvůj podnik'} · teď</p>
          <p className={`text-[15px] font-semibold leading-snug break-words ${prazdne ? 'text-black/40' : 'text-[#16181A]'}`}>{zkouska && !prazdne ? `[Zkouška] ${t.title}` : t.title}</p>
          {t.body && <p className="text-sm text-black/70 whitespace-pre-line break-words mt-0.5">{t.body}</p>}
        </div>
      </div>
      <p className="t-meta">Po klepnutí otevře: {CIL[linkKind] ?? CIL.page}.</p>
    </Well>
  );
}
