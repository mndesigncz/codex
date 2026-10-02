'use client';

// Náhled zprávy: jak ji uvidí host na telefonu. Stejné složení textu jako server
// (lib/zpravyPravidla.textOznameni), takže řádek s kuponem nebo promo kódem
// v náhledu odpovídá tomu, co opravdu přijde. U e-mailového kanálu ukáže i e-mail se
// stejnou patičkou (lib/i18n/email.ts), jakou dostane člen.

import { Icon } from '../../Icons';
import { Well } from '../../ui';
import { textOznameni, type PrilohaZpravy } from '@/lib/zpravyPravidla';
import { emailText } from '@/lib/i18n/email';

const CIL: Record<string, string> = {
  page: 'Stránka podniku',
  loyalty: 'Věrnost a kupony',
  order: 'Objednávka od stolu',
  me: 'Jeho kartička (Moje)',
};

export default function ZpravyNahled({ nazev, title, body, priloha, linkKind, zkouska = false, oznameni = true, email = false }: {
  nazev: string | null;
  title: string;
  body: string;
  priloha?: PrilohaZpravy | null;
  linkKind: string;
  zkouska?: boolean;
  /** Ukázat oznámení v telefonu (výchozí) a/nebo e-mail. */
  oznameni?: boolean;
  email?: boolean;
}) {
  const t = textOznameni(title.trim() || 'Nadpis zprávy', body, priloha);
  const prazdne = !title.trim();
  return (
    <Well className="space-y-2" aria-label="Náhled zprávy">
      <p className="t-label">Takhle ji uvidí host</p>
      {oznameni && <div className="rounded-2xl glass-strong p-3.5 flex items-start gap-3">
        <span className="shrink-0 h-9 w-9 rounded-xl bg-[#16181A] text-[#C8F542] grid place-items-center" aria-hidden="true">
          <Icon name="bell" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-black/50 truncate">{nazev || 'Tvůj podnik'} · teď</p>
          <p className={`text-[15px] font-semibold leading-snug break-words ${prazdne ? 'text-black/40' : 'text-[#16181A]'}`}>{zkouska && !prazdne ? `[Zkouška] ${t.title}` : t.title}</p>
          {t.body && <p className="text-sm text-black/70 whitespace-pre-line break-words mt-0.5">{t.body}</p>}
        </div>
      </div>}
      {email && (
        <div className="rounded-2xl border border-black/10 bg-white p-4 text-left shadow-sm" role="group" aria-label="E-mail">
          <p className="text-[12px] text-black/45">{nazev || 'Tvůj podnik'}</p>
          <p className="text-lg font-bold tracking-tight mt-1 text-balance break-words">{title.trim() || 'Bez nadpisu'}</p>
          {body.trim() && <p className="text-sm text-black/80 mt-2 leading-relaxed break-words whitespace-pre-line">{body.trim()}</p>}
          {priloha?.kupon?.title && <p className="mt-3 rounded-xl bg-[#F1F4EC] px-3 py-2 text-sm"><strong>{priloha.kupon.title}</strong><br /><span className="text-black/55">{emailText('novinkyKupon', 'cs')}</span></p>}
          {priloha?.promo?.code && <p className="mt-3 rounded-xl bg-[#F1F4EC] px-3 py-2 text-sm">{emailText('novinkyPromo', 'cs', { kod: priloha.promo.code })}</p>}
          <p className="mt-4"><span className="inline-block rounded-full bg-[#C8F542] px-5 py-2.5 text-sm font-bold text-[#16181A]">{emailText('novinkyOtevrit', 'cs')} →</span></p>
          <p className="mt-4 border-t border-black/10 pt-3 text-[11px] leading-snug text-black/45">
            {emailText('novinkyPaticka', 'cs', { podnik: nazev || 'Tvůj podnik' })} <span className="underline">{emailText('novinkyOdhlasit', 'cs')}</span>
          </p>
        </div>
      )}
      <p className="t-meta">Po klepnutí otevře: {CIL[linkKind] ?? CIL.page}.</p>
    </Well>
  );
}
