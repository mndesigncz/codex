'use client';

// Provoz podniku — měna, formát čísel, začátek týdne, země, jazyk podniku, formát
// času, cíl mzdových nákladů a návrh podle země (kolo 6, balík B3).
//
// Dřív karta v Nastavení týmu → Podnik, zatímco název, adresa a IČO byly v Nastavení
// → Profil podniku: dvě místa pro nastavení jednoho podniku a ani jedno nevědělo
// o druhém. Teď je obojí v Profilu podniku (SekcePodnik) a karta se jen přestěhovala —
// ukládání po jednom poli (`prepni('biz', …)`, optimisticky s návratem při chybě)
// a oprávnění z kola 67 zůstávají: měnu, formáty a jazyk mění podnik.nastaveni,
// cíl mezd finance.nastaveni (stejně jako na serveru, PATCH /api/teams).
//
// Data přes useDataWidgetu('/api/teams'), stejnou adresu jako Tým a widgety týmu,
// takže po uložení se překreslí všude. Texty zůstávají ve slovníku `tym`, odkud přišly.

import { useState } from 'react';
import { Button, Field, Input, Select, Skeleton, Toast } from '../ui';
import { ErrorState } from '../ui/ErrorState';
import { useDataWidgetu, obnovDataWidgetu } from '../widgety/useDataWidgetu';
import { useOpravneni } from '../role/useOpravneni';
import { useT } from '@/lib/i18n/client';
import { apiMessage, okJson } from '@/lib/api';
import { CURRENCIES, LOCALES } from '@/lib/money';
import { JAZYKY, JAZYK_NAZEV, cistyJazyk } from '@/lib/i18n/config';
import { ZEME, PREDVOLBY_ZEMI, predvolbaProZemi, navrhNastaveni } from '@/lib/i18n/zeme';

const URL_TYM = '/api/teams';

interface Provoz {
  currency?: string;
  locale?: string;
  week_start?: number;
  labor_target_pct?: number | null;
  margin_target_pct?: number | null;
  country?: string | null;
  default_lang?: string;
  time_format?: string;
  timezone?: string;
}

function vyberProvoz(raw: any): Provoz {
  const x = raw?.team;
  if (!x || typeof x !== 'object') throw new Error('Podnik přišel v nečekaném tvaru.'); // i18n-ok
  return {
    currency: x.currency, locale: x.locale, week_start: x.week_start, labor_target_pct: x.labor_target_pct ?? null, margin_target_pct: x.margin_target_pct ?? null,
    country: x.country ?? null, default_lang: x.default_lang, time_format: x.time_format, timezone: x.timezone,
  };
}

export default function ProvozPodniku() {
  const t = useT('tym');
  const { ma } = useOpravneni();
  const data = useDataWidgetu<Provoz>(URL_TYM, vyberProvoz);
  const team = data.data;
  const smiPodnik = ma('podnik.nastaveni');
  const smiCil = ma('finance.nastaveni');

  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [cilMezd, setCilMezd] = useState<string | null>(null);
  const [cilMarze, setCilMarze] = useState<string | null>(null);
  const [ukladam, setUkladam] = useState(false);

  /** PATCH /api/teams s optimistickým zápisem (a návratem při chybě). Hotovo říká až odpověď serveru. */
  const prepni = async (telo: Record<string, unknown>, lokalne: Partial<Provoz>, hotovo: string) => {
    const puvodni = data.data;
    if (puvodni) data.set({ ...puvodni, ...lokalne });
    setUkladam(true);
    try {
      await fetch(URL_TYM, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo) }).then(okJson);
      setToast({ text: hotovo, tone: 'ok' });
      obnovDataWidgetu(URL_TYM);
    } catch (e) {
      if (puvodni) data.set(puvodni);
      setToast({ text: apiMessage(e, t('Nastavení se nepodařilo uložit.')), tone: 'bad' });
    } finally {
      setUkladam(false);
    }
  };
  const ulozeno = t('Nastavení provozu je uložené.');

  if (data.error) return <section className="card p-5"><ErrorState compact title={t('Nastavení se nepodařilo načíst')} detail={data.error} onRetry={data.reload} /></section>;
  if (!team) return <Skeleton className="h-72 rounded-3xl" />;

  const navrh = (() => {
    const p = predvolbaProZemi(team.country);
    const n = navrhNastaveni(team.country);
    if (!p || !n || !smiPodnik) return null;
    const shoda = (team.currency ?? 'CZK') === n.currency && (team.locale ?? 'cs-CZ') === n.locale && (team.week_start ?? 1) === n.weekStart
      && (cistyJazyk(team.default_lang) ?? 'cs') === n.defaultLang && (team.time_format === '12' ? '12' : '24') === n.timeFormat;
    return (
      <div className="well mt-6 p-4 space-y-2" role="group" aria-label={t('Návrh podle země')}>
        <p className="text-sm font-semibold text-[#16181A]">{t('Návrh pro zemi {zeme}', { zeme: p.nazev })}</p>
        <p className="t-meta text-pretty">
          {t('Jazyk {jazyk}, měna {mena}, formát čísel {locale}, týden od {den}, {hodiny} hodin.', { jazyk: JAZYK_NAZEV[p.jazyk], mena: p.mena, locale: p.locale, den: p.zacatekTydne === 1 ? t('pondělí') : t('neděle'), hodiny: p.hodiny })}{' '}
          {t('Sazby DPH {sazby} (návrh k ověření, aplikace z nich nic nepočítá).', { sazby: p.dph.map(d => `${d.sazba} %`).join(' / ') })}
        </p>
        {shoda
          ? <p className="t-meta">{t('Nastavení už návrhu odpovídá.')}</p>
          : <Button variant="secondary" size="sm" className="w-full mt-1" loading={ukladam}
              onClick={() => prepni(n, { default_lang: n.defaultLang, currency: n.currency, locale: n.locale, week_start: n.weekStart, time_format: n.timeFormat, timezone: n.timezone }, t('Návrh podle země je použitý.'))}>
              {t('Předvyplnit podle země')}
            </Button>}
      </div>
    );
  })();

  return (
    <>
      {/* Stejná karta jako profil a prahy nad ní (card p-5 = 16/20, nadpis t-card bez ikony). */}
      <section className="card p-5" aria-labelledby="nast-provoz-t">
        <h2 id="nast-provoz-t" className="t-card">{t('Provoz podniku')}</h2>
        <p className="t-meta mt-1">{t('Měna, formát čísel a cíle — přizpůsob aplikaci svému podniku.')}</p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="tym-mena" label={t('Měna')}>
            <Select id="tym-mena" value={team.currency ?? 'CZK'} disabled={ukladam || !smiPodnik}
              onChange={e => prepni({ currency: e.target.value }, { currency: e.target.value }, ulozeno)}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </Select>
          </Field>
          <Field id="tym-jazyk" label={t('Formát čísel a měny')}>
            <Select id="tym-jazyk" value={team.locale ?? 'cs-CZ'} disabled={ukladam || !smiPodnik}
              onChange={e => prepni({ locale: e.target.value }, { locale: e.target.value }, ulozeno)}>
              {LOCALES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </Select>
          </Field>
          <Field id="tym-tyden" label={t('Začátek týdne')}>
            <Select id="tym-tyden" value={String(team.week_start ?? 1)} disabled={ukladam || !smiPodnik}
              onChange={e => prepni({ weekStart: Number(e.target.value) }, { week_start: Number(e.target.value) }, ulozeno)}>
              <option value="1">{t('Pondělí')}</option>
              <option value="0">{t('Neděle')}</option>
            </Select>
          </Field>
          {/* Lokalizace podniku (kolo 76): země jen předvyplňuje návrhy, nic nezamyká a nic netvrdí o právu. */}
          <Field id="tym-zeme" label={t('Země')} hint={t('Návrh podle země. Zkontroluj si to s účetním.')}>
            <Select id="tym-zeme" value={team.country ?? ''} disabled={ukladam || !smiPodnik}
              onChange={e => prepni({ country: e.target.value || null }, { country: e.target.value || null }, ulozeno)}>
              <option value="">{t('Nevybráno')}</option>
              {ZEME.map(z => <option key={z} value={z}>{PREDVOLBY_ZEMI[z].nazev}</option>)}
            </Select>
          </Field>
          <Field id="tym-jazyk-podniku" label={t('Jazyk podniku')} hint={t('Výchozí jazyk nových členů, e-mailů dodavatelům a lístku pro hosty.')}>
            <Select id="tym-jazyk-podniku" value={cistyJazyk(team.default_lang) ?? 'cs'} disabled={ukladam || !smiPodnik}
              onChange={e => prepni({ defaultLang: e.target.value }, { default_lang: e.target.value }, ulozeno)}>
              {JAZYKY.map(j => <option key={j} value={j} lang={j}>{JAZYK_NAZEV[j]}</option>)}
            </Select>
          </Field>
          <Field id="tym-cas" label={t('Formát času')}>
            <Select id="tym-cas" value={team.time_format === '12' ? '12' : '24'} disabled={ukladam || !smiPodnik}
              onChange={e => prepni({ timeFormat: e.target.value }, { time_format: e.target.value }, ulozeno)}>
              <option value="24">{t('24 hodin (14:30)')}</option>
              <option value="12">{t('12 hodin (2:30 PM)')}</option>
            </Select>
          </Field>
          {/* Pásmo přes celou šířku: po něm jdou dva cíle vedle sebe (devět polí ve dvou sloupcích by nechalo sirotka). */}
          <Field id="tym-pasmo" className="sm:col-span-2" label={t('Časové pásmo')} hint={t('Pro Česko, Slovensko, Německo, Rakousko a Polsko je stejné jako v Praze. Jiná pásma aplikace zatím nepodporuje.')}>
            <Input id="tym-pasmo" readOnly value={t('Střední Evropa (Praha, Berlín, Varšava)')} />
          </Field>
          <Field id="tym-cil" label={t('Cíl mzdových nákladů (%)')} hint={t('Podíl mezd na tržbách — Mzdy za období ukážou, jestli jste v cíli.')}>
            <Input id="tym-cil" type="number" inputMode="numeric" min={0} max={100} placeholder="30" disabled={ukladam || !smiCil}
              value={cilMezd ?? (team.labor_target_pct != null ? String(team.labor_target_pct) : '')}
              onChange={e => setCilMezd(e.target.value)}
              onBlur={() => {
                if (cilMezd === null) return;
                const v = cilMezd.trim() === '' ? null : Math.max(0, Math.min(100, Math.round(Number(cilMezd))));
                setCilMezd(null);
                if ((team.labor_target_pct ?? null) !== v) void prepni({ laborTargetPct: v }, { labor_target_pct: v }, ulozeno);
              }} />
          </Field>
          {/* Cílová marže (kolo 7): Receptury podle ní barví a řadí, rady o marži s ní počítají. Prázdné = výchozí 65 %. */}
          <Field id="tym-cil-marze" label={t('Cílová marže na položku (%)')} hint={t('Marže položky menu po surovinách — Receptury podle ní barví a filtrují „Pod cílem". Prázdné = 65 %.')}>
            <Input id="tym-cil-marze" type="number" inputMode="numeric" min={1} max={95} placeholder="65" disabled={ukladam || !smiCil}
              value={cilMarze ?? (team.margin_target_pct != null ? String(team.margin_target_pct) : '')}
              onChange={e => setCilMarze(e.target.value)}
              onBlur={() => {
                if (cilMarze === null) return;
                const v = cilMarze.trim() === '' || !Number.isFinite(Number(cilMarze)) ? null : Math.max(1, Math.min(95, Math.round(Number(cilMarze))));
                setCilMarze(null);
                if ((team.margin_target_pct ?? null) !== v) void prepni({ marginTargetPct: v }, { margin_target_pct: v }, ulozeno);
              }} />
          </Field>
        </div>
        {/* Předvyplnění podle země: ukáže, co navrhne, a změní to až po kliknutí. DPH jen jako informace k ověření; appka z něj nic nepočítá. */}
        {navrh}
      </section>
      <Toast message={toast?.text ?? null} tone={toast?.tone ?? 'ok'} onClose={() => setToast(null)} />
    </>
  );
}
