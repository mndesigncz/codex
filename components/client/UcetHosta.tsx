'use client';

// Účet hosta: souhlas s novinkami PO PODNICÍCH (opt-in a odhlášení), upozornění v telefonu,
// stažení vlastních dat, právní odkazy a smazání účtu. Kotva #ucet z menu v hlavičce.
//
// Novinky a akce chodí jen od podniku, kterému to host výslovně povolil (Apple 4.5.4, GDPR čl. 7,
// zákon 480/2004): výchozí je NE, zapnout i vypnout jde kdykoli a u každého podniku zvlášť
// (spuštění, balík G; souhlasy jsou v tabulce consents, app/api/client/account/souhlasy).
// Před migrací tabulky zůstává původní jeden přepínač „od podniků“.
// Systémové povolení oznámení v nativní aplikaci se žádá až tady, v kontextu, ne při startu.

import { useCallback, useEffect, useState } from 'react';
import { Button, SwitchRow } from '../ui';
import ProvozovatelInfo from '../pravni/ProvozovatelInfo';
import SmazatUcet from '../ucet/SmazatUcet';
import ZamekAplikace from '../ucet/ZamekAplikace';
import { jeNativni, nativniMost, stavNativnihoPushe } from '@/lib/nativni/most';
import { ulozZAdresy } from '@/lib/stahni';
import { useT } from '@/lib/i18n/client';

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
  const exportBlok = (linka: boolean) => (
    <div className={linka ? 'mt-5 pt-4 border-t border-black/[0.07]' : 'mt-3'} data-export-hosta>
      <h3 className="t-card">{t('Stáhnout moje data')}</h3>
      <p className="t-meta mt-0.5 text-pretty">{t('Soubor JSON se vším, co o tobě v podnicích vedeme: členství, body a jejich historie, razítka, kredit, kupony, objednávky, rezervace, hodnocení a souhlasy.')}</p>
      <Button variant="secondary" icon="download" className="mt-3 w-full justify-center" loading={stahuji} onClick={stahnout}>{t('Stáhnout moje data')}</Button>
      <p role="status" aria-live="polite" className="t-meta mt-1.5 min-h-[1.25rem]">
        {stazeno === 'stazeno' ? t('Soubor je stažený.') : stazeno === 'sdileno' ? t('Soubor je připravený ke sdílení.') : ''}
      </p>
      {stazeno === 'nejde' && <p role="alert" className="note note-danger">{t('Data se nepodařilo stáhnout. Zkus to za chvíli znovu.')}</p>}
    </div>
  );

  // Profil hosta (přestavba): oznámení a soukromí jsou dvě sekce pod sebou; `cast` vybere jednu.
  if (cast === 'soukromi') return (
    <section id="soukromi" aria-labelledby="h-soukromi-hosta" className="card p-4 sm:p-5 scroll-mt-24">
      <h2 id="h-soukromi-hosta" className="t-section">{t('Soukromí a data')}</h2>
      {exportBlok(false)}
      <ProvozovatelInfo className="mt-3 text-sm text-black/60" />
      <SmazatUcet jeHost />
    </section>
  );

  return (
    <section id="ucet" aria-labelledby="h-ucet-hosta" className="card p-4 sm:p-5 scroll-mt-24">
      <h2 id="h-ucet-hosta" className="t-section">{cast === 'oznameni' ? t('Oznámení a novinky') : t('Oznámení a soukromí')}</h2>
      {nativni && (
        <ul className="list mt-2">
          <SwitchRow title={t('Upozornění v telefonu')} checked={pushZapnut} onChange={zmenPush}
            hint={pushOdmitnut ? t('Oznámení jsou v systému vypnutá. Povolte je v nastavení telefonu.') : t('Potvrzení rezervace, stav objednávky.')} />
          <ZamekAplikace />
        </ul>
      )}

      {poPodnicich ? (
        <div className="mt-4" data-souhlasy-podniku>
          <h3 className="t-card">{t('Novinky a akce od podniků')}</h3>
          <p className="t-meta mt-0.5 text-pretty">{t('U každého podniku zvlášť. Nepovinné, jen s tvým souhlasem a kdykoli jde vypnout.')}</p>
          {podniky === null ? (
            <p className="t-meta mt-3" aria-busy="true">{t('Načítám…')}</p>
          ) : podniky.length === 0 ? (
            <p className="t-meta mt-3 text-pretty">{t('Zatím nejsi členem žádného podniku. Novinky si zapneš, až se k nějakému přidáš.')}</p>
          ) : (
            <ul className="list mt-1">
              {podniky.map(x => (
                <li key={x.teamId} className="py-1">
                  <SwitchRow as="div" title={x.podnik} checked={x.push} disabled={ukladam != null}
                    onChange={v => void zmenPodnik(x, 'novinky_push', v)}
                    hint={x.push ? (x.email ? t('Oznámení v aplikaci i e-mail') : t('Jen oznámení v aplikaci')) : t('Novinky nechodí')} />
                  {x.push && (
                    <SwitchRow as="div" className="pl-4 !py-1.5 !min-h-[2.75rem]" title={t('Také e-mailem')} checked={x.email} disabled={ukladam != null}
                      onChange={v => void zmenPodnik(x, 'novinky_email', v)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <ul className="list mt-2">
          <SwitchRow title={t('Novinky a akce od podniků')} checked={souhlas} onChange={zmenSouhlas}
            hint={t('Zprávy od podniků, kde jsi členem. Nepovinné, jen s tvým souhlasem a kdykoli jde vypnout.')} />
          {souhlas && (
            <SwitchRow title={t('E-maily od podniků')} checked={email} onChange={zmenEmail}
              hint={t('Novinky ti přijdou i e-mailem. Odhlásit se jde i odkazem přímo v e-mailu.')} />
          )}
        </ul>
      )}

      {cast !== 'oznameni' && <>
        {exportBlok(true)}
        <ProvozovatelInfo className="mt-3 text-sm text-black/60" />
        <SmazatUcet jeHost />
      </>}
    </section>
  );
}
