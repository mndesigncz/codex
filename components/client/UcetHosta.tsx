'use client';

// Účet hosta: souhlas s novinkami PO PODNICÍCH (opt-in a odhlášení), upozornění v telefonu,
// stažení vlastních dat, právní odkazy a smazání účtu. Kotva #ucet z menu v hlavičce.
//
// Novinky a akce chodí jen od podniku, kterému to host výslovně povolil (Apple 4.5.4, GDPR čl. 7,
// zákon 480/2004): výchozí je NE, zapnout i vypnout jde kdykoli a u každého podniku zvlášť
// (spuštění, balík G; souhlasy jsou v tabulce consents, app/api/client/account/souhlasy).
// Před migrací tabulky zůstává původní jeden přepínač „od podniků“.
// Systémové povolení oznámení v nativní aplikaci se žádá až tady, v kontextu, ne při startu.

import { useCallback, useEffect, useId, useState } from 'react';
import { Switch } from '../ui';
import { Icon } from '../Icons';
import { Monogram, NadpisSekce, Seznam, Radek } from './penezenka';
import { firma, identifikace } from '@/lib/firma';
import { ODKAZY_PRAVNI, cestaDokumentu } from '@/lib/pravni/odkazy';
import SmazatUcet from '../ucet/SmazatUcet';
import ZamekAplikace from '../ucet/ZamekAplikace';
import { jeNativni, nativniMost, stavNativnihoPushe } from '@/lib/nativni/most';
import { ulozZAdresy } from '@/lib/stahni';
import { useJazyk, useT } from '@/lib/i18n/client';

interface SouhlasPodniku { teamId: number; podnik: string; slug: string | null; push: boolean; email: boolean }

export default function UcetHosta({ novinky, novinkyEmail = true, onFlash, cast }: { novinky: boolean; novinkyEmail?: boolean; onFlash: (m: string) => void; /** Profil: jen oznámení, nebo jen soukromí (export, provozovatel, smazání). */ cast?: 'oznameni' | 'soukromi' }) {
  const t = useT('klient-host');
  const [souhlas, setSouhlas] = useState(novinky);
  const [email, setEmail] = useState(novinkyEmail);
  const [pushZapnut, setPushZapnut] = useState(false);
  const [pushOdmitnut, setPushOdmitnut] = useState(false);
  const [nativni, setNativni] = useState(false);
  // Souhlasy po podnicích; null = ještě se načítají, `dostupne: false` = starý jeden přepínač.
  const [podniky, setPodniky] = useState<SouhlasPodniku[] | null>(null);
  const [poPodnicich, setPoPodnicich] = useState(true);
  const [ukladam, setUkladam] = useState<string | null>(null);
  const [stahuji, setStahuji] = useState(false);
  const [stazeno, setStazeno] = useState<'' | 'stazeno' | 'sdileno' | 'nejde'>('');
  useEffect(() => { setSouhlas(novinky); }, [novinky]);
  useEffect(() => { setEmail(novinkyEmail); }, [novinkyEmail]);
  useEffect(() => {
    if (!jeNativni()) return;
    setNativni(true);
    Promise.all([stavNativnihoPushe(), nativniMost()]).then(([s, most]) => { setPushZapnut(s === 'granted' && !most?.pushVypnuto()); setPushOdmitnut(s === 'denied'); });
  }, []);

  const nactiSouhlasy = useCallback(async () => {
    try {
      const r = await fetch('/api/client/account/souhlasy', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const d = await r.json();
      // Po podnicích jen s výslovným `dostupne: true`; cokoli jiného (starší server, výpadek tabulky) = původní přepínač.
      setPoPodnicich(d.dostupne === true);
      setPodniky(Array.isArray(d.podniky) ? d.podniky : []);
    } catch {
      // Bez seznamu (výpadek) zůstane původní přepínač, ať jde novinky aspoň vypnout.
      setPoPodnicich(false); setPodniky([]);
    }
  }, []);
  useEffect(() => { void nactiSouhlasy(); }, [nactiSouhlasy]);

  // Souhlas s novinkami dává smysl jen s povolenými oznámeními: zeptáme se hned, v kontextu.
  const zeptejSeNaPush = async () => {
    if (!nativni || pushZapnut) return;
    const p = (await (await nativniMost())?.zapniPush()) ?? 'nedostupny';
    setPushZapnut(p === 'granted'); setPushOdmitnut(p === 'denied');
  };

  const zmenPodnik = async (x: SouhlasPodniku, typ: 'novinky_push' | 'novinky_email', v: boolean) => {
    const klic = `${x.teamId}:${typ}`;
    if (ukladam) return;
    setUkladam(klic);
    // Hned ukázat novou polohu přepínače; při chybě se vrátí.
    const pred = podniky;
    setPodniky(ps => (ps ?? []).map(p => p.teamId !== x.teamId ? p
      : typ === 'novinky_push' ? { ...p, push: v, email: v ? p.email : false } : { ...p, email: v, push: v ? true : p.push }));
    try {
      const r = await fetch('/api/client/account/souhlasy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: x.teamId, typ, stav: v }) });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setPodniky(ps => (ps ?? []).map(p => p.teamId === x.teamId ? { ...p, push: d.push === true, email: d.email === true } : p));
      onFlash(typ === 'novinky_push'
        ? (v ? t('Novinky od {podnik} zapnuté.', { podnik: x.podnik }) : t('Novinky od {podnik} vypnuté.', { podnik: x.podnik }))
        : (v ? t('E-maily od {podnik} zapnuté.', { podnik: x.podnik }) : t('E-maily od {podnik} vypnuté.', { podnik: x.podnik })));
      if (v) await zeptejSeNaPush();
    } catch {
      setPodniky(pred);
      onFlash(t('Nastavení se nepodařilo uložit.'));
    } finally { setUkladam(null); }
  };

  const zmenSouhlas = async (v: boolean) => {
    setSouhlas(v);
    try {
      const r = await fetch('/api/client/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ novinky: v }) });
      if (!r.ok) throw new Error();
      onFlash(v ? t('Novinky od podniků zapnuté.') : t('Novinky od podniků vypnuté.'));
      if (v) await zeptejSeNaPush();
    } catch {
      // Nepovedlo se uložit: přepínač se vrátí, ať neukazuje souhlas, který server nezná.
      setSouhlas(!v);
      onFlash(t('Nastavení se nepodařilo uložit.'));
    }
  };

  // E-maily od podniků jdou vypnout zvlášť; oznámení v aplikaci zůstanou. Stejné dělá odkaz „Odhlásit“ v e-mailu.
  const zmenEmail = async (v: boolean) => {
    setEmail(v);
    try {
      const r = await fetch('/api/client/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ novinkyEmail: v }) });
      if (!r.ok) throw new Error();
      onFlash(v ? t('E-maily od podniků zapnuté.') : t('E-maily od podniků vypnuté.'));
    } catch {
      setEmail(!v);
      onFlash(t('Nastavení se nepodařilo uložit.'));
    }
  };

  const zmenPush = async (v: boolean) => {
    if (!v) {
      // Smaže token na serveru: oznámení přestanou chodit hned (systémové povolení zůstává, jde znovu zapnout).
      setPushZapnut(false); await (await nativniMost())?.vypniPush();
      onFlash(t('Upozornění v telefonu vypnutá.'));
      return;
    }
    const p = (await (await nativniMost())?.zapniPush()) ?? 'nedostupny';
    setPushZapnut(p === 'granted'); setPushOdmitnut(p === 'denied');
  };

  // GDPR čl. 15 a 20: všechno, co o hostovi vedeme, jako JSON. V obalu jde soubor do sdílení (lib/stahni).
  const stahnout = async () => {
    setStahuji(true); setStazeno('');
    try { setStazeno(await ulozZAdresy('/api/client/account/export', 'managero-client-moje-data.json')); }
    finally { setStahuji(false); }
  };
  // Stažení dat jako řádek na skle (jamka, titulek, popis); stav pod ním pro odečítač.
  const exportBlok = (
    <div data-export-hosta>
      <Seznam>
        <li>
          <button type="button" onClick={() => { if (!stahuji) void stahnout(); }} aria-busy={stahuji} className="hp-radek">
            <span className="hp-jamka" aria-hidden><Icon name="download" size={18} strokeWidth={1.6} /></span>
            <span className="hp-radek-telo">
              <span className="hp-silny block">{t('Stáhnout moje data')}</span>
              <span className="hp-meta block mt-0.5 text-pretty">{t('Soubor JSON se vším, co o tobě v podnicích vedeme: členství, body a jejich historie, razítka, kredit, kupony, objednávky, rezervace, hodnocení a souhlasy.')}</span>
            </span>
            {stahuji && <span className="spinner shrink-0" aria-hidden />}
          </button>
        </li>
      </Seznam>
      <p role="status" aria-live="polite" className="hp-meta mt-1.5 px-1 min-h-[1.25rem]">
        {stazeno === 'stazeno' ? t('Soubor je stažený.') : stazeno === 'sdileno' ? t('Soubor je připravený ke sdílení.') : ''}
      </p>
      {stazeno === 'nejde' && <p role="alert" className="note note-danger">{t('Data se nepodařilo stáhnout. Zkus to za chvíli znovu.')}</p>}
    </div>
  );
  // Smazání účtu je sdílená komponenta s vlastním nadpisem a linkou nahoře: tady leží na skle bez linky.
  const soukromi = (
    <>
      {exportBlok}
      <PravniSeznam />
      <div className="lgx hp-sklo mt-4 p-4 sm:p-5 [&>section]:!mt-0 [&>section]:!pt-0 [&>section]:!border-0">
        <SmazatUcet jeHost vzhledHosta />
      </div>
    </>
  );

  // Profil hosta (přestavba): oznámení a soukromí jsou dvě sekce pod sebou; `cast` vybere jednu.
  if (cast === 'soukromi') return (
    <section id="soukromi" aria-labelledby="h-soukromi-hosta" className="scroll-mt-24">
      <NadpisSekce id="h-soukromi-hosta" titulek={t('Soukromí a data')} />
      {soukromi}
    </section>
  );

  return (
    <section id="ucet" aria-labelledby="h-ucet-hosta" className="scroll-mt-24">
      <NadpisSekce id="h-ucet-hosta" titulek={cast === 'oznameni' ? t('Oznámení a novinky') : t('Oznámení a soukromí')} />
      {nativni && (
        <Seznam className="mb-4">
          <RadekPrepinac titulek={t('Upozornění v telefonu')} checked={pushZapnut} onChange={zmenPush} ikona="bell"
            popis={pushOdmitnut ? t('Oznámení jsou v systému vypnutá. Povolte je v nastavení telefonu.') : t('Potvrzení rezervace, stav objednávky.')} />
          <li className="px-4"><ul className="list-none"><ZamekAplikace /></ul></li>
        </Seznam>
      )}

      {poPodnicich ? (
        <div data-souhlasy-podniku>
          <h3 className="hp-silny px-1">{t('Novinky a akce od podniků')}</h3>
          <p className="hp-meta mt-0.5 mb-3 px-1 text-pretty">{t('U každého podniku zvlášť. Nepovinné, jen s tvým souhlasem a kdykoli jde vypnout.')}</p>
          <Seznam>
            {podniky === null ? (
              <li className="hp-radek"><span className="hp-meta" aria-busy="true">{t('Načítám…')}</span></li>
            ) : podniky.length === 0 ? (
              <li className="hp-radek"><span className="hp-jamka" aria-hidden><Icon name="bell" size={18} strokeWidth={1.6} /></span>
                <span className="hp-meta text-pretty">{t('Zatím nejsi členem žádného podniku. Novinky si zapneš, až se k nějakému přidáš.')}</span></li>
            ) : podniky.map(x => (
              <li key={x.teamId}>
                <RadekPrepinac as="div" titulek={x.podnik} checked={x.push} disabled={ukladam != null}
                  vlevo={<Monogram nazev={x.podnik} klic={x.slug} />}
                  onChange={v => void zmenPodnik(x, 'novinky_push', v)}
                  popis={x.push ? (x.email ? t('Oznámení v aplikaci i e-mail') : t('Jen oznámení v aplikaci')) : t('Novinky nechodí')} />
                {x.push && (
                  <RadekPrepinac as="div" className="!pl-[66px] !min-h-[52px] !py-2" titulek={t('Také e-mailem')} checked={x.email} disabled={ukladam != null}
                    onChange={v => void zmenPodnik(x, 'novinky_email', v)} />
                )}
              </li>
            ))}
          </Seznam>
        </div>
      ) : (
        <Seznam>
          <RadekPrepinac titulek={t('Novinky a akce od podniků')} checked={souhlas} onChange={zmenSouhlas} ikona="mail"
            popis={t('Zprávy od podniků, kde jsi členem. Nepovinné, jen s tvým souhlasem a kdykoli jde vypnout.')} />
          {souhlas && (
            <RadekPrepinac titulek={t('E-maily od podniků')} checked={email} onChange={zmenEmail} className="!pl-[68px]"
              popis={t('Novinky ti přijdou i e-mailem. Odhlásit se jde i odkazem přímo v e-mailu.')} />
          )}
        </Seznam>
      )}

      {cast !== 'oznameni' && <div className="mt-6">{soukromi}</div>}
    </section>
  );
}

/** Řádek nastavení na skle (směr A): jamka nebo monogram, titulek 15/600 s popisem a přepínač vpravo.
 *  Klepnutí na text přepíná taky; přístupný název nese jen titulek, popis jde jako popis. */
function RadekPrepinac({ titulek, popis, checked, onChange, disabled, ikona, vlevo, as: Tag = 'li', className = '' }: {
  titulek: React.ReactNode; popis?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
  ikona?: string; vlevo?: React.ReactNode; as?: 'li' | 'div'; className?: string;
}) {
  const uid = useId();
  const obsah = (
    <div className={`hp-radek ${className}`}>
      {vlevo ?? (ikona ? <span className="hp-jamka" aria-hidden><Icon name={ikona} size={18} strokeWidth={1.6} /></span> : null)}
      <label htmlFor={`${uid}-p`} className={`hp-radek-telo ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <span id={`${uid}-n`} className="hp-silny block">{titulek}</span>
        {popis && <span id={`${uid}-h`} className="hp-meta block mt-0.5 text-pretty">{popis}</span>}
      </label>
      <Switch id={`${uid}-p`} checked={checked} onChange={onChange} disabled={disabled} labelledBy={`${uid}-n`} describedBy={popis ? `${uid}-h` : undefined} />
    </div>
  );
  return Tag === 'li' ? <li>{obsah}</li> : obsah;
}

/** Právní dokumenty jako jeden řádkový seznam (smazání účtu je karta pod ním, ne další odkaz)
 *  a pod ním provozovatel jednou větou (§ 435 OZ). */
function PravniSeznam() {
  const jazyk = useJazyk().jazyk === 'cs' ? 'cs' : 'en';
  const f = firma({});
  const odkazy = ODKAZY_PRAVNI.filter(o => ['soukromi', 'podminky', 'podpora'].includes(o.klic));
  return (
    <div className="mt-1" data-provozovatel>
      <Seznam>
        {odkazy.map(o => <Radek key={o.klic} ikona={o.klic === 'podpora' ? 'info' : 'book'} titulek={o[jazyk]} href={cestaDokumentu(o.klic, jazyk)} />)}
      </Seznam>
      <p className="hp-meta mt-2 px-1 text-pretty">{identifikace(f, jazyk)}</p>
    </div>
  );
}
