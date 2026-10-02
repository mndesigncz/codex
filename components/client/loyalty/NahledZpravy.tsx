'use client';

// Náhled „pohledem hosta“: jak zpráva vypadne v telefonu a v e-mailu. Texty jsou stejné jako v odesílaném
// e-mailu (patička z lib/i18n/email.ts), takže to, co vidíš, je to, co člen dostane.

import { Icon } from '../../Icons';
import { emailText } from '@/lib/i18n/email';

export function NahledZpravy({ podnik, title, body, kuponNazev, promoKod, oznameni = true, email = false }: {
  podnik: string;
  title: string;
  body?: string;
  kuponNazev?: string | null;
  promoKod?: string | null;
  oznameni?: boolean;
  email?: boolean;
}) {
  const telo = (body ?? '').trim();
  const tit = title.trim();
  if (!tit && !telo) {
    return <p className="t-meta">Napiš nadpis a uvidíš, jak zpráva vypadá u hosta.</p>;
  }
  return (
    <div className="grid gap-3" aria-label="Náhled zprávy pohledem hosta">
      {oznameni && (
        <div className="rounded-2xl border border-black/10 bg-white/70 p-3.5 flex gap-3 items-start shadow-sm" role="group" aria-label="Oznámení v telefonu">
          <span className="shrink-0 h-9 w-9 rounded-xl bg-[#16181A] text-[#C8F542] grid place-items-center"><Icon name="bell" size={17} /></span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-black/45 uppercase tracking-wide">{podnik} · teď</p>
            <p className="text-sm font-semibold text-balance break-words">{tit || 'Bez nadpisu'}</p>
            {(telo || promoKod) && <p className="text-[13px] text-black/65 mt-0.5 break-words whitespace-pre-line">{telo}{promoKod ? `${telo ? ' ' : ''}Kód: ${promoKod}` : ''}</p>}
          </div>
        </div>
      )}
      {email && (
        <div className="rounded-2xl border border-black/10 bg-white p-4 text-left shadow-sm" role="group" aria-label="E-mail">
          <p className="text-[12px] text-black/45">{podnik}</p>
          <p className="text-lg font-bold tracking-tight mt-1 text-balance break-words">{tit || 'Bez nadpisu'}</p>
          {telo && <p className="text-sm text-black/80 mt-2 leading-relaxed break-words whitespace-pre-line">{telo}</p>}
          {kuponNazev && <p className="mt-3 rounded-xl bg-[#F1F4EC] px-3 py-2 text-sm"><strong>{kuponNazev}</strong><br /><span className="text-black/55">{emailText('novinkyKupon', 'cs')}</span></p>}
          {promoKod && <p className="mt-3 rounded-xl bg-[#F1F4EC] px-3 py-2 text-sm">{emailText('novinkyPromo', 'cs', { kod: promoKod })}</p>}
          <p className="mt-4"><span className="inline-block rounded-full bg-[#C8F542] px-5 py-2.5 text-sm font-bold text-[#16181A]">{emailText('novinkyOtevrit', 'cs')} →</span></p>
          <p className="mt-4 border-t border-black/10 pt-3 text-[11px] leading-snug text-black/45">
            {emailText('novinkyPaticka', 'cs', { podnik })} <span className="underline">{emailText('novinkyOdhlasit', 'cs')}</span>
          </p>
        </div>
      )}
      {!oznameni && !email && <p className="t-meta">Vyber, kudy zpráva půjde.</p>}
    </div>
  );
}

export default NahledZpravy;
