'use client';

// „Co dostaneš“ (směr A): žebříček odměn na skle. Vlevo kolik (10 razítek / 150 bodů), uprostřed
// odměna, vpravo kolik ještě chybí („ještě 3“, „chybí 260“) nebo „Vyměnit“. Nahoře připravené
// odměny s kódem pro kasu. Vpravo u nadpisu odkaz na pravidla věrnosti.

import Link from 'next/link';
import { useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { NadpisSekce, Seznam, Radek, Listek } from '../../penezenka';
import { PlatnostKuponu } from '../../loyalty/HostPlatnost';
import { useCesta } from '../cesty';

function Pocet({ n, jednotka }: { n: React.ReactNode; jednotka: React.ReactNode }) {
  return <span className="hpp-pocet"><span className="hp-silny block">{n}</span><span className="hp-meta">{jednotka}</span></span>;
}

export function CoDostanes({ slug, me, today, campaigns, coupons, signedIn, onDone, onPravidla }: {
  slug: string; me: any; today: string; campaigns: any[]; coupons: any[]; signedIn: boolean; onDone: (m: string) => void; onPravidla: () => void;
}) {
  const t = useT('klient-host');
  const cesta = useCesta();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const claim = async (id: number) => {
    if (!signedIn) { window.location.href = `/client/login?next=${encodeURIComponent('/client/' + slug)}`; return; }
    setBusy(id); setErr('');
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(slug)}/coupons/${id}/claim`, { method: 'POST' });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(x.error ? t(x.error) : t('Kupon se nepodařilo vzít.')); return; }
      onDone(t('Kupon je tvůj. Kód {kod} ukaž u kasy.', { kod: x.code }));
    } catch {
      setErr(t('Kupon se nepodařilo vzít — vypadlo připojení. Zkus to znovu.'));
    } finally { setBusy(null); }
  };
  const mojeKampane = new Map<number, any>((me?.campaigns ?? []).map((c: any) => [Number(c.id), c]));
  const kampane = (campaigns ?? []).filter((c: any) => Number(c.required) > 0);
  const claims: any[] = me?.claims ?? [];
  if (!kampane.length && !(coupons ?? []).length && !claims.length) return null;
  return (
    <section id="odmeny-podniku" aria-labelledby="h-zebricek" className="scroll-mt-24">
      <NadpisSekce id="h-zebricek" titulek={t('Co dostaneš')} vpravo={<button type="button" onClick={onPravidla} className="tap-target">{t('Pravidla')}</button>} />
      {err && <p role="alert" className="mb-3 note note-danger">{err}</p>}
      {claims.length > 0 && (
        // Připravená odměna = lístek s perforací a kódem (stejný jako v Odměnách), ne karta na kartě.
        <ul aria-label={t('Připravené odměny')} className="mb-3 flex flex-col gap-3">
          {claims.map((c: any) => (
            <Listek key={c.id} as="li"
              poznamka={c.kind === 'stamps' ? t('za plnou kartu') : c.kind === 'birthday' ? t('k narozeninám') : t('kupon')}
              titulek={c.title}
              podtitulek={<PlatnostKuponu validUntil={c.valid_until} today={today} />}
              kodPopisek={t('Kód')}
              kod={c.code}
              akce={<Link href={cesta('/client/me/odmeny')} className="hp-btn hp-btn-inkoust hp-btn-stredni shrink-0">{t('Uplatnit')}</Link>} />
          ))}
        </ul>
      )}
      {(kampane.length > 0 || (coupons ?? []).length > 0) && (
        <Seznam>
          {kampane.map((k: any) => {
            const muj = mojeKampane.get(Number(k.id));
            const zbyva = muj ? Math.max(0, Number(k.required) - Number(muj.stamps)) : Number(k.required);
            return (
              <Radek key={`k${k.id}`}
                vlevo={<Pocet n={k.required} jednotka={t('{n, plural, one {razítko} few {razítka} other {razítek}}', { n: Number(k.required) })} />}
                titulek={k.reward || k.name}
                popis={[muj ? t('Za plnou kartu · máš {n}', { n: Number(muj.stamps) }) : t('Za plnou kartu'), k.rewardItems?.length ? k.rewardItems.join(', ') : ''].filter(Boolean).join(' · ')}
                vpravo={muj ? <span className="hp-meta hp-num">{zbyva === 0 ? t('připraveno') : t('ještě {n}', { n: zbyva })}</span> : undefined} />
            );
          })}
          {(coupons ?? []).map((c: any) => {
            const cena = Number(c.cost_points) || 0;
            const can = me?.member && Number(me.points) >= cena && !c.blocked;
            const chybi = me?.member ? Math.max(0, cena - Number(me.points)) : 0;
            const tlacitko = (
              <button type="button" onClick={() => claim(c.id)} disabled={busy === c.id || (signedIn && me?.member && !can)}
                className="hp-btn hp-btn-inkoust hp-btn-male tap-target">{busy === c.id ? '…' : cena ? t('Vyměnit') : t('Vzít si')}</button>
            );
            return (
              <li key={c.id} id={`kupon-${c.id}`} className={`scroll-mt-24 ${c.blocked ? 'opacity-60' : ''}`}>
                <Radek as="div"
                  vlevo={cena === 0 ? <Pocet n={t('zdarma')} jednotka="" /> : <Pocet n={cena} jednotka={t('{n, plural, one {bod} few {body} other {bodů}}', { n: cena })} />}
                  titulek={<>{c.title}{c.benefit ? <span className="ml-2 hp-meta">{c.benefit}</span> : null}</>}
                  popis={(c.description || c.badges?.length || c.valid_until || c.blocked) ? (
                    <>
                      {c.description && <span className="block text-pretty">{c.description}</span>}
                      {(c.badges?.length > 0 || c.valid_until) && (
                        <span className="block">{(c.badges ?? []).join(' · ')}{c.badges?.length > 0 && c.valid_until ? ' · ' : ''}<PlatnostKuponu validUntil={c.valid_until} today={today} /></span>
                      )}
                      {c.blocked && <span className="block">{t(c.blocked)}</span>}
                    </>
                  ) : undefined}
                  vpravo={c.blocked ? undefined : (me?.member && chybi > 0) ? <span className="hp-meta hp-num">{t('chybí {n}', { n: chybi })}</span> : tlacitko} />
              </li>
            );
          })}
        </Seznam>
      )}
    </section>
  );
}
