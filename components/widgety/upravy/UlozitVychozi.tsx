'use client';

// „Uložit jako výchozí pro…" (kolo 68, spec §3.8).
//
// Vedení si poskládá plochu u sebe a jedním oknem ji dá jako výchozí celému
// vedení, všem zaměstnancům nebo jedné roli — a případně ji zamkne. Uloží
// se to, co je teď na ploše (pořadí, velikosti, nastavení). Widgety, které
// ukládající sám nevidí, server ve výchozím nechá (zachovává skryté), takže
// delegovaný správce bez tržeb nikomu Pokladnu nesmaže.

import { useCallback, useEffect, useId, useState } from 'react';
import { Button, Field, Modal, Select, SwitchRow } from '../../ui';
import type { DefiniceStranky, OdpovedVychozi, PolozkaRozlozeni, Rozsah } from '@/lib/widgety/typy';
import { apiMessage, okJson } from '@/lib/api';

export default function UlozitVychozi({ stranka, polozky, onUlozeno, onZavrit }: {
  stranka: DefiniceStranky;
  /** Aktuální plocha (pořadí, velikosti, nastavení). */
  polozky: readonly PolozkaRozlozeni[];
  onUlozeno: () => void;
  onZavrit: () => void;
}) {
  const uid = useId();
  const [rozsah, setRozsah] = useState<Rozsah>(`typ:${stranka.rozhrani}`);
  const [info, setInfo] = useState<OdpovedVychozi | null>(null);
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);
  const [zamceno, setZamceno] = useState(false);
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const url = (r: Rozsah) => `/api/rozlozeni/vychozi?stranka=${encodeURIComponent(stranka.id)}&rozsah=${encodeURIComponent(r)}`;

  // Verze a zámek cílového rozsahu — zápis nesmí přepsat výchozí, které
  // mezitím změnil někdo jiný (kontrola verze), a zámek se předvyplní.
  const nacti = useCallback((r: Rozsah) => {
    setChybaNacteni(null);
    fetch(url(r), { cache: 'no-store' })
      .then(okJson)
      .then((d: OdpovedVychozi) => { setInfo(d); setZamceno(d.zamceno === true); })
      .catch(e => setChybaNacteni(apiMessage(e, 'Výchozí rozložení se nenačetlo.')));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stranka.id]);
  useEffect(() => { nacti(rozsah); }, [rozsah, nacti]);

  const ulozit = async () => {
    if (!info) return;
    setUkladam(true);
    setChyba(null);
    try {
      const res = await fetch(url(rozsah), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polozky, zamceno, verze: info.verze }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { onUlozeno(); return; }
      if (res.status === 409) {
        if (d?.aktualni) setInfo(d.aktualni);
        setChyba('Výchozí rozložení se mezitím změnilo jinde. Zkontroluj volby a ulož znovu.');
        return;
      }
      setChyba(typeof d?.error === 'string' && d.error ? d.error : 'Výchozí rozložení se nepodařilo uložit.');
    } catch {
      setChyba('Nepodařilo se spojit se serverem. Zkus to znovu.');
    } finally {
      setUkladam(false);
    }
  };

  const rozsahy = info?.rozsahy ?? [];
  const idVyberu = `${uid}-pro-koho`;
  return (
    <Modal open onClose={onZavrit} size="sm" title="Uložit jako výchozí"
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button variant="primary" onClick={ulozit} loading={ukladam} disabled={!info}>Uložit výchozí</Button>
      </>}>
      <div className="space-y-4">
        <Field id={idVyberu} label="Pro koho">
          <Select id={idVyberu} value={rozsah} onChange={e => setRozsah(e.target.value as Rozsah)} disabled={!rozsahy.length}>
            {rozsahy.length
              ? rozsahy.map(r => <option key={r.id} value={r.id}>{`${r.nazev} (${r.clenu})`}</option>)
              : <option value={rozsah}>Načítám…</option>}
          </Select>
        </Field>
        <SwitchRow as="div" title="Zamknout — ostatní si stránku nepřestaví"
          hint="Svoje úpravy dostanou zpátky, až zámek zrušíš." checked={zamceno} onChange={setZamceno} />
        <p className="note note-info">Každý uvidí jen widgety, na které má oprávnění.</p>
        {/* Kopie při zápisu (spec §8): kdo si stránku upravil, výchozí bez zámku neuvidí. */}
        <p className="t-meta text-pretty">Kdo si stránku už upravil po svém, uvidí nové výchozí, až dá „Obnovit výchozí rozložení" — nebo když ho zamkneš.</p>
        {chybaNacteni && (
          <p className="note note-danger flex items-center justify-between gap-3" role="alert">
            <span>{chybaNacteni}</span>
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => nacti(rozsah)}>Zkusit znovu</Button>
          </p>
        )}
        {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
      </div>
    </Modal>
  );
}
