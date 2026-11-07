'use client';

// Odměny › Výzvy (směr A): rozdělané razítkové karty jako řádky seznamu na skle s limetkovou
// lištou pokroku, pod nimi Úrovně po podnicích — zasunutá inkoustová karta s úrovní a slevou
// a pod ní řádek s tím, co do další úrovně chybí (skutečný postup, žádný odhad).

import { InkoustovaKarta, Monogram, NadpisSekce, PrazdnyStav, Radek, Seznam } from '../../penezenka';
import PostupSvetly from './PostupSvetly';
import { useCesta } from '../cesty';
import { useT } from '@/lib/i18n/client';
import { tierForMember } from '@/lib/clientSlots';
import { formatMoney } from '@/lib/money';

export default function Vyzvy({ clenstvi }: { clenstvi: any[] }) {
  const t = useT('klient-host');
  const cesta = useCesta();
  const karty: { klic: string; slug: string; podnik: string; logoUrl: string | null; titul: string; odmena: string; hotovo: number; cil: number }[] = [];
  for (const m of clenstvi) {
    for (const k of (m.campaigns ?? []).filter((c: any) => Number(c.required) > 0 && !c.finishedForever)) {
      karty.push({
        klic: `k-${m.slug}-${k.id}`, slug: String(m.slug), podnik: String(m.name ?? ''), logoUrl: m.logoUrl || null,
        titul: k.name || t('Razítková karta'), odmena: k.reward ? t('Odměna: {odmena}', { odmena: k.reward }) : '',
        hotovo: Math.min(Number(k.stamps) || 0, Number(k.required)), cil: Number(k.required),
      });
    }
  }
  const urovne = clenstvi.map(m => {
    const lv = tierForMember({ visits: Number(m.visits), spend: Number(m.spend), lastVisitAt: m.lastVisitAt }, m.tiers);
    const hodnota = lv.unit === 'spend' ? Number(m.spend) || 0 : Number(m.visits) || 0;
    const chybi = lv.nextAt ? Math.max(0, lv.nextAt - hodnota) : 0;
    return { m, lv, hodnota, chybi };
  });

  if (!karty.length && !urovne.length) {
    return (
      <div className="lgx hp-sklo">
        <PrazdnyStav titulek={t('Žádná rozdělaná výzva')} text={t('Razítkové karty a cesta k vyšší úrovni se ukážou, až se přidáš k podniku.')} />
      </div>
    );
  }

  return (
    <div>
      {karty.length > 0 && (
        <Seznam ariaLabel={t('Rozdělané karty')}>
          {karty.map(r => (
            <Radek key={r.klic} href={cesta(`/client/${r.slug}`)} nahoru
              vlevo={<Monogram nazev={r.podnik} klic={r.slug} logoUrl={r.logoUrl} velikost={36} />}
              titulek={r.titul}
              popis={
                <>
                  <span className="block truncate">{[r.podnik, r.odmena].filter(Boolean).join(' · ')}</span>
                  <PostupSvetly podil={r.hotovo / Math.max(1, r.cil)} className="mt-2.5" />
                </>
              }
              vpravo={<span className="hp-silny hp-num">{r.hotovo} / {r.cil}</span>}
            />
          ))}
        </Seznam>
      )}

      {urovne.length > 0 && (
        <section aria-labelledby="odm-urovne">
          <NadpisSekce id="odm-urovne" titulek={t('Úrovně')} className={karty.length ? '' : '!mt-0'} />
          <ul className="flex flex-col gap-4">
            {urovne.map(({ m, lv, hodnota, chybi }) => (
              <li key={m.slug}>
                <InkoustovaKarta varianta="zasunuta" nazev={String(m.name ?? '')} klic={m.slug} logoUrl={m.logoUrl || null}
                  popis={t(lv.label)} hodnota={lv.discount > 0 ? t('sleva {n} %', { n: lv.discount }) : ''}
                  href={cesta(`/client/${m.slug}`)} />
                <Seznam className="mt-2">
                  {lv.nextAt && lv.nextLabel ? (
                    <Radek ikona="award" nahoru
                      titulek={t('Úroveň {uroven}', { uroven: t(lv.nextLabel) })}
                      popis={
                        <>
                          <span className="block">{lv.unit === 'spend'
                            ? t('ještě {castka} útraty', { castka: formatMoney(chybi, m.currency ?? 'CZK') })
                            : t('ještě {n, plural, one {# návštěva} few {# návštěvy} other {# návštěv}}', { n: chybi })}</span>
                          <PostupSvetly podil={hodnota / Math.max(1, lv.nextAt)} className="mt-2.5" />
                        </>
                      }
                      vpravo={lv.unit === 'spend' ? undefined : <span className="hp-silny hp-num">{hodnota} / {lv.nextAt}</span>}
                    />
                  ) : (
                    <Radek ikona="award" titulek={t('Máš nejvyšší úroveň')} popis={t('Výš už to nejde. Díky, že chodíš.')} />
                  )}
                </Seznam>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
