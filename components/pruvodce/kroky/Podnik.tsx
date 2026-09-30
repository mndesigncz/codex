'use client';

import { Chip, Field, Input, Segmented, Select, Well } from '@/components/ui';
import { useJazyk, useT } from '@/lib/i18n/client';
import { CURRENCIES, LOCALES, formatMoney } from '@/lib/money';
import { NAZEV_ZEME, ZEME, ZEME_ID, type Zeme } from '@/lib/pruvodce/typy';
import { JAZYK_NAZEV } from '@/lib/i18n/config';
import type { KrokProps } from './spolecne';

// Název, adresa, země. Země předvyplní měnu, formát čísel a začátek týdne
// (jde je přepsat); „Jiná země" nic nemění a měna se volí ručně. Jazyk je
// dnes jen čeština, takže se nenabízí výběr, který by nic nedělal.

export default function Podnik({ odp, zmen, info, chybaPole }: KrokProps) {
  const t = useT('pruvodce');
  const { jazyk } = useJazyk();
  const mena = odp.mena ?? info.currency;
  const format = odp.formatCisel ?? info.locale;
  const tyden = odp.zacatekTydne ?? (info.week_start === 0 ? 0 : 1);
  const zeme = odp.zeme ?? 'CZ';
  // Ukázka částky: živě, stejnou funkcí jako zbytek aplikace.
  let ukazka = '';
  try { ukazka = formatMoney(1500, mena, format); } catch { ukazka = '1 500'; }

  const zmenZemi = (z: Zeme) => {
    const p = ZEME[z];
    zmen(p ? { zeme: z, mena: p.mena, formatCisel: p.locale, zacatekTydne: p.zacatekTydne } : { zeme: z });
  };

  return (
    <div className="space-y-4">
      <Field id="pv-nazev" label={t('Název podniku')} error={chybaPole?.pole === 'nazev' ? chybaPole.text : undefined}>
        <Input id="pv-nazev" value={odp.nazev ?? ''} maxLength={80} autoComplete="organization" enterKeyHint="next"
          onChange={e => zmen({ nazev: e.target.value })} placeholder={t('Například Kavárna Na rohu')}
          aria-invalid={chybaPole?.pole === 'nazev' || undefined} />
      </Field>
      <Field id="pv-adresa" label={t('Ulice a město')} hint={t('Nepovinné. Adresa se zobrazí jen tobě a v nastavení podniku.')}>
        <Input id="pv-adresa" value={odp.adresa ?? ''} maxLength={200} autoComplete="street-address" enterKeyHint="next"
          onChange={e => zmen({ adresa: e.target.value })} placeholder={t('Vinohradská 12, Praha')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pv-zeme" label={t('Země')}>
          <Select id="pv-zeme" value={zeme} onChange={e => zmenZemi(e.target.value as Zeme)}>
            {ZEME_ID.map(z => <option key={z} value={z}>{t(NAZEV_ZEME[z])}</option>)}
          </Select>
        </Field>
        <Field id="pv-mena" label={t('Měna')}>
          <Select id="pv-mena" value={mena} onChange={e => zmen({ mena: e.target.value })}>
            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </Select>
        </Field>
        <Field id="pv-format" label={t('Formát čísel')}>
          <Select id="pv-format" value={format} onChange={e => zmen({ formatCisel: e.target.value })}>
            {LOCALES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </Select>
        </Field>
        <div className="min-w-0">
          <span className="field-label" id="pv-tyden-popisek">{t('Týden začíná')}</span>
          <Segmented ariaLabel={t('Týden začíná')} value={tyden === 0 ? 'ne' : 'po'} size="sm"
            options={[{ id: 'po', label: t('V pondělí') }, { id: 'ne', label: t('V neděli') }]}
            onChange={id => zmen({ zacatekTydne: id === 'ne' ? 0 : 1 })} />
        </div>
      </div>
      <Well className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-meta">{t('Takhle budou v aplikaci vypadat částky:')} <strong className="text-[#16181A]" data-ukazka-castky>{ukazka}</strong></p>
        <p className="flex items-center gap-2 t-meta">{t('Jazyk')} <Chip tone="ink" size="sm">{JAZYK_NAZEV[jazyk]}</Chip></p>
      </Well>
      <p className="t-meta">{t('Další jazyky připravujeme. Měna a formát čísel se nastaví podle země a jde je změnit.')}</p>
    </div>
  );
}
