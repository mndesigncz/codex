'use client';

// Dodavatelé (Sklad › „···" › Dodavatelé) — vytaženo z Inventory.tsx (kolo 7, R7-6).
//
// Do kola 6 okno umělo jen jméno a e-mail: telefon a poznámku API vracelo,
// ale nebylo kam je napsat (stav `phone` bez pole) a „Upravit e-mail" byla
// jediná úprava. Majitel se navíc nedozvěděl, kolik položek od dodavatele
// vede ani kdy u něj naposledy objednal. Teď:
//  - formulář přidání i úprava mají všechna čtyři pole (PATCH /api/suppliers je umí),
//  - řádek: e-mail · telefon (telefon jako odkaz tel: s dotykovou plochou 44 px),
//    poznámka, počet položek skladu s tímhle dodavatelem a „poslední objednávka před …",
//  - „Objednat" otevře nákupní seznam s předvybraným dodavatelem (jen když od něj něco vedeme).
// Útrata za měsíc a seznam objednávek sem záměrně nepatří (Finance, widget Objednávky).
//
// Počet položek bere z položek, které Sklad už má načtené (prop), poslední
// objednávku z /api/orders přes useDataWidgetu — stejná URL jako widget
// Objednávky, takže na stránce Sklad je to tatáž odpověď z mezipaměti.

import { useMemo, useState } from 'react';
import { Button, Chip, EmptyState, Field, Input, ListRow, Menu, Modal, Well, Rada } from '../ui';
import { useT } from '@/lib/i18n/client';
import { pragueDaySafe, pragueToday } from '@/lib/pragueTime';
import { dnuOd, polozekUDodavatelu, posledniObjednavkaDodavatelu, type PolozkaSkladu } from '@/lib/skladPrehled';
import { useDataWidgetu } from '../widgety/useDataWidgetu';

export interface Dodavatel {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  note?: string | null;
  zOrganizace?: boolean;
  sdileno?: boolean;
}

export interface PotvrzeniDodavatele { titulek: string; text: string; akce: string; provest: () => Promise<void> | void }

interface Formular { name: string; email: string; phone: string; note: string }
const PRAZDNY: Formular = { name: '', email: '', phone: '', note: '' };

/** Čtyři pole dodavatele — stejná pro přidání i úpravu; na telefonu pod sebou. */
function PoleDodavatele({ f, setF, idZaklad, autoFocus }: { f: Formular; setF: (f: Formular) => void; idZaklad: string; autoFocus?: boolean }) {
  const t = useT('sprava');
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field id={`${idZaklad}-nazev`} label={t('Název dodavatele')}>
        <Input id={`${idZaklad}-nazev`} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={120} autoFocus={autoFocus} />
      </Field>
      <Field id={`${idZaklad}-email`} label={t('E-mail pro objednávky')}>
        <Input id={`${idZaklad}-email`} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="objednavky@dodavatel.cz"
          type="email" inputMode="email" autoComplete="off" maxLength={200} />
      </Field>
      <Field id={`${idZaklad}-telefon`} label={t('Telefon')}>
        <Input id={`${idZaklad}-telefon`} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="+420 777 000 111"
          type="tel" inputMode="tel" autoComplete="off" maxLength={40} />
      </Field>
      <Field id={`${idZaklad}-poznamka`} label={t('Poznámka')}>
        <Input id={`${idZaklad}-poznamka`} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} maxLength={300}
          placeholder={t('Např. objednávky do čtvrtka, dováží v pátek')} />
      </Field>
    </div>
  );
}

const telo = (f: Formular) => ({ name: f.name.trim(), email: f.email.trim() || null, phone: f.phone.trim() || null, note: f.note.trim() || null });

export default function DodavateleOkno({ suppliers, polozky, smiUpravit, smiObjednavky, onClose, onChanged, onObjednat, potvrdit }: {
  suppliers: Dodavatel[];
  /** Položky skladu, které Sklad už má — z nich se počítá „12 položek" (vazba je jméno dodavatele). */
  polozky: readonly PolozkaSkladu[];
  /** dodavatele.upravit — bez něj se seznam jen čte. */
  smiUpravit: boolean;
  /** nakup.zobrazit — bez něj se poslední objednávka neptá (GET /api/orders by odpověděl 403). */
  smiObjednavky: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  /** Zavře okno a otevře nákupní seznam s předvybraným dodavatelem. */
  onObjednat: (dodavatel: string) => void;
  potvrdit: (p: PotvrzeniDodavatele) => void;
}) {
  const t = useT('sprava');
  const [novy, setNovy] = useState<Formular>(PRAZDNY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Formulář přidání je sbalený za tlačítkem — na telefonu by čtyři pole odsunula seznam pod ohyb.
  // Bez dodavatelů je rozbalený rovnou (není co číst, jen co přidat).
  const [pridavam, setPridavam] = useState(suppliers.length === 0);
  const [upravuji, setUpravuji] = useState<{ id: number; f: Formular } | null>(null);
  const [ukladam, setUkladam] = useState(false);

  const pocty = useMemo(() => polozekUDodavatelu(polozky), [polozky]);
  const objednavky = useDataWidgetu<Record<string, string>>(smiObjednavky ? '/api/orders' : null, posledniObjednavkaDodavatelu);
  const dnes = pragueToday();
  const posledni = (jmeno: string): string | null => {
    const kdy = objednavky.data?.[jmeno.trim()];
    if (!kdy) return null;
    const n = dnuOd(pragueDaySafe(kdy), dnes);
    return n === 0 ? t('poslední objednávka dnes') : t('poslední objednávka před {n, plural, one {# dnem} few {# dny} other {# dny}}', { n });
  };

  const pridat = async () => {
    if (!novy.name.trim()) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo(novy)) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || t('Uložení se nepodařilo.')); }
      setNovy(PRAZDNY);
      setPridavam(false);
      await onChanged();
    } catch (e) { setErr(e instanceof Error && e.message ? e.message : t('Uložení se nepodařilo.')); }
    setBusy(false);
  };

  const ulozit = async () => {
    if (!upravuji || !upravuji.f.name.trim()) return;
    setUkladam(true); setErr('');
    try {
      const res = await fetch('/api/suppliers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: upravuji.id, ...telo(upravuji.f) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || t('Dodavatele se nepodařilo uložit.')); }
      setUpravuji(null);
      await onChanged();
    } catch (e) { setErr(e instanceof Error && e.message ? e.message : t('Dodavatele se nepodařilo uložit.')); }
    setUkladam(false);
  };

  return (
    <Modal open onClose={onClose} size="lg" title={t('Dodavatelé')}
      subtitle={t('S vyplněným e-mailem jde objednávka poslat rovnou z nákupního seznamu. Jméno dodavatele u položek vybíráš našeptávačem.')}>
      <div className="space-y-4">
        {err && <p className="note note-danger" role="alert">{err}</p>}
        {smiUpravit && (pridavam ? (
          <form className="well p-4 space-y-3" aria-label={t('Nový dodavatel')} onSubmit={e => { e.preventDefault(); void pridat(); }}>
            <PoleDodavatele f={novy} setF={setNovy} idZaklad="sklad-dod" autoFocus={suppliers.length > 0} />
            {/* Pár akcí ½ + ½ ve výšce pole okna (P12) — dřív obsahové šířky vlevo (od sm) / pod sebou (telefon). */}
            <Rada vyska="l">
              {suppliers.length > 0 && (
                <Button type="button" variant="secondary" disabled={busy} onClick={() => { setPridavam(false); setNovy(PRAZDNY); }}>{t('Zrušit', undefined, 'dialog')}</Button>
              )}
              <Button type="submit" variant="primary" icon="plus" loading={busy} disabled={!novy.name.trim()}>{t('Přidat dodavatele')}</Button>
            </Rada>
          </form>
        ) : (
          <Button variant="secondary" size="lg" icon="plus" className="w-full" onClick={() => setPridavam(true)}>{t('Nový dodavatel')}</Button>
        ))}

        {suppliers.length === 0 ? (
          <EmptyState illustration="sklad" title={t('Zatím žádný dodavatel')} hint={t('S dodavatelem u položky pošleš objednávku e-mailem rovnou z nákupního seznamu.')} compact />
        ) : (
          <ul className="list" aria-label={t('Seznam dodavatelů')}>
            {suppliers.map(sp => {
              const n = pocty[sp.name.trim()] ?? 0;
              const kdy = posledni(sp.name);
              if (upravuji?.id === sp.id) {
                return (
                  <li key={sp.id} className="py-3">
                    <Well className="space-y-3">
                      <PoleDodavatele f={upravuji.f} setF={f => setUpravuji({ id: sp.id, f })} idZaklad={`sklad-dod-${sp.id}`} autoFocus />
                      <Rada vyska="l">
                        <Button variant="secondary" disabled={ukladam} onClick={() => setUpravuji(null)}>{t('Zrušit', undefined, 'dialog')}</Button>
                        <Button variant="primary" loading={ukladam} disabled={!upravuji.f.name.trim()} onClick={ulozit}>{t('Uložit')}</Button>
                      </Rada>
                    </Well>
                  </li>
                );
              }
              return (
                <li key={sp.id}>
                  <ListRow as="div"
                    title={<>
                      {sp.name}
                      {sp.zOrganizace && <Chip tone="muted" size="sm" className="ml-1.5 align-middle">{t('z organizace')}</Chip>}
                      {sp.sdileno && <Chip tone="info" size="sm" className="ml-1.5 align-middle">{t('sdíleno')}</Chip>}
                    </>}
                    meta={<>
                      <span className={sp.email ? '' : 'text-wait-ink'}>{sp.email ?? t('bez e-mailu')}</span>
                      {sp.phone && <>{' · '}<a href={`tel:${sp.phone.replace(/[^\d+]/g, '')}`} className="tap-target underline decoration-black/25 underline-offset-2 tabular-nums"
                        aria-label={t('Zavolat {nazev}: {telefon}', { nazev: sp.name, telefon: sp.phone })}>{sp.phone}</a></>}
                    </>}
                    detail={sp.note || kdy ? (
                      <>
                        {sp.note && <span className="block break-words">{sp.note}</span>}
                        {kdy && <span className="block">{kdy}</span>}
                      </>
                    ) : undefined}
                    // Počet i nula: „0 položek" řekne, proč u dodavatele není Objednat.
                    right={<Chip tone="muted" size="sm">{t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n })}</Chip>}
                    // Jen „···" (bez Objednat) zůstane na telefonu v prvním řádku vedle jména, ne samo v prázdném řádku.
                    akceVRadku={n === 0}
                    actions={(n > 0 || (smiUpravit && !sp.zOrganizace)) ? (
                      <>
                        {n > 0 && (
                          <Button variant="secondary" size="sm" icon="cart" className="tap-target" onClick={() => onObjednat(sp.name)}
                            aria-label={t('Objednat od {nazev}', { nazev: sp.name })}>{t('Objednat')}</Button>
                        )}
                        {smiUpravit && !sp.zOrganizace && (
                          <Menu size="sm" label={t('Další akce: {nazev}', { nazev: sp.name })} items={[
                            { label: t('Upravit…'), icon: 'pencil', onClick: () => setUpravuji({ id: sp.id, f: { name: sp.name, email: sp.email ?? '', phone: sp.phone ?? '', note: sp.note ?? '' } }) },
                            { label: t('Smazat dodavatele…'), icon: 'trash', danger: true, onClick: () => potvrdit({
                              titulek: t('Smazat dodavatele „{nazev}"?', { nazev: sp.name }),
                              text: t('U položek zůstane jeho jméno jako text, jen z něj nepůjde poslat objednávka e-mailem.'),
                              akce: t('Smazat dodavatele'),
                              provest: async () => {
                                const res = await fetch(`/api/suppliers?id=${sp.id}`, { method: 'DELETE' }).catch(() => null);
                                if (res?.ok) await onChanged();
                                else setErr(t('Dodavatele se nepodařilo smazat.'));
                              },
                            }) },
                          ]} />
                        )}
                      </>
                    ) : undefined}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
