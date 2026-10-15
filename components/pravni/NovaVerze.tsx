'use client';

// Brána nové verze podmínek (spuštění, balík P). Připojená v app/providers.tsx.
//
// Přihlášenému, který nemá odsouhlasenou dnešní verzi podmínek a zásad
// (lib/pravni/verze.ts: VERZE_PODMINEK, VERZE_ZASAD), ukáže okno se zaškrtávátkem;
// „Souhlasím a pokračovat" pošle POST /api/account/souhlas. Týká se i účtů z doby
// před verzováním (verze v databázi chybí) a lidí, které založilo vedení.
//
// Kdy se neptá: sdílený tablet (účet kiosk), veřejné a právní stránky (podmínky si
// musí jít přečíst), ukázka /demo, nepřihlášený. Server se ptá jednou za relaci
// prohlížeče a verzi — výsledek „souhlas je aktuální" si brána pamatuje v sessionStorage.
// Zavřít okno jde (Escape, křížek): v téhle relaci se pak už nevrátí, při příštím
// otevření aplikace ano. Uzavřené okno nic neukládá.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useT } from '@/lib/i18n/client';
import { okJson, apiMessage } from '@/lib/api';
import { jeCestaDema } from '@/lib/demo/cesta';
import { cestaSBranou, klicOvereniSouhlasu, VERZE_PODMINEK } from '@/lib/pravni/verze';
import { fmtDatum } from '@/lib/i18n/format';
import { Button, Modal } from '../ui';
import SouhlasPodminek from './SouhlasPodminek';

const cti = (k: string): string | null => { try { return window.sessionStorage.getItem(k); } catch { return null; } };
const zapis = (k: string, v: string) => { try { window.sessionStorage.setItem(k, v); } catch { /* bez úložiště se zeptá znovu */ } };

export default function NovaVerze() {
  const t = useT('spolecne');
  const cesta = usePathname();
  const { data: session, status } = useSession();
  const user = session?.user as { id?: unknown; role?: unknown } | undefined;
  const id = user?.id != null ? String(user.id) : null;
  const role = typeof user?.role === 'string' ? user.role : null;
  const [ukaz, setUkaz] = useState(false);
  const [souhlas, setSouhlas] = useState(false);
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const bezi = status === 'authenticated' && !!id && role !== 'kiosk' && cestaSBranou(cesta) && !jeCestaDema(cesta);

  useEffect(() => {
    if (!bezi || !id) return;
    const klic = klicOvereniSouhlasu(id);
    if (cti(klic)) return;
    let zruseno = false;
    fetch('/api/account/souhlas', { cache: 'no-store' })
      .then(okJson)
      .then((d: { potreba?: unknown }) => {
        if (zruseno) return;
        if (d?.potreba === true) setUkaz(true);
        else zapis(klic, 'ok');
      })
      // Nepovedené ověření (offline, výpadek) neblokuje práci — zkusí se při další navigaci.
      .catch(() => {});
    return () => { zruseno = true; };
  }, [bezi, id]);

  if (!bezi || !ukaz || !id) return null;

  const pozdeji = () => { zapis(klicOvereniSouhlasu(id), 'pozdeji'); setUkaz(false); };
  const potvrdit = async () => {
    if (!souhlas) { setChyba(t('Bez souhlasu s podmínkami účet založit nejde.')); return; }
    setUkladam(true); setChyba(null);
    try {
      await fetch('/api/account/souhlas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ terms: true }) }).then(okJson);
      zapis(klicOvereniSouhlasu(id), 'ok');
      setUkaz(false);
    } catch (e) {
      setChyba(apiMessage(e, t('Souhlas se nepodařilo uložit. Zkus to znovu.')));
    } finally {
      setUkladam(false);
    }
  };

  return (
    <Modal open onClose={pozdeji} size="md" nadOkny
      title={t('Aktualizovali jsme podmínky')}
      subtitle={t('Platí od {datum}. Než budeš pokračovat, potvrď je prosím.', { datum: fmtDatum(VERZE_PODMINEK, { jazyk: t.jazyk, styl: 'dlouze' }) })}
      footer={<>
        <Button variant="ghost" onClick={() => { void signOut({ callbackUrl: '/' }); }}>{t('Odhlásit se')}</Button>
        <Button variant="primary" icon="check" loading={ukladam} onClick={() => { void potvrdit(); }}>{t('Souhlasím a pokračovat')}</Button>
      </>}>
      <div className="space-y-3" data-nova-verze>
        <p className="text-sm text-black/70 text-pretty">{t('Změny se týkají toho, jaké údaje aplikace zpracovává a jak s nimi zachází. Celé znění najdeš v odkazech níž.')}</p>
        <SouhlasPodminek id="nova-verze-souhlas" checked={souhlas} chyba={chyba}
          onChange={v => { setSouhlas(v); if (v) setChyba(null); }} />
      </div>
    </Modal>
  );
}
