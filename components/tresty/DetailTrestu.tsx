'use client';

// Okno „Detail trestu" (kolo 10, balík Z): co se stalo, kdy, na které směně nebo
// uzávěrce, položka sazebníku a kolikátá je v měsíci, fotka, kdo trest dal, dopad
// (body dolů, krácení prémie s větou, že jde jen o prémii, ne o mzdu) a stav.
//
// Akce člověka, kterého se trest týká:
//  - „Beru na vědomí" (PATCH { seen: true }) — jen u nepotvrzeného platného trestu;
//  - „Vyjádřit se" — textarea do 500 znaků a přepínač „Nesouhlasím s trestem"
//    (PATCH { response, disagree }); po odeslání je vyjádření vidět s větou
//    „Vedení to uvidí." a jde ho změnit.
// Zrušený trest je jen ke čtení (poznámka ke zrušení, body i krácení se vrátily).
// Rozepsané vyjádření se uklepnutím neztratí: Modal se ptá (DiscardGuard přes useModal).
// Po každé změně obnovTresty() — widget, Odměny i okna vedení se přenačtou.
//
// Tón: věcně, bez vykřičníků; červený je jen chip „Nepotvrzeno".

import { useEffect, useState } from 'react';
import { Button, Chip, Field, ListRow, Modal, SwitchRow, Textarea, Toast, Well } from '../ui';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import { useNavigace } from '../widgety/NavigaceKontext';
import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum, fmtMesic } from '@/lib/i18n/format';
import { apiMessage, okJson } from '@/lib/api';
import { MAX_DELKA_VYJADRENI, URL_TRESTY, jeNapomenuti, vyberTresty, type Trest } from '@/lib/tresty';
import { akceTrestu, poradiVMesici, validujVyjadreni } from './logika';
import { StavTrestuChip, bodyDolu } from './kusy';
import { obnovTresty } from './data';

/** Hlášky validace vyjádření (stejné jako server) přeložené výslovně. */
function prelozChybu(t: PrekladFn, chyba: string): string {
  switch (chyba) {
    case 'Napiš své vyjádření.': return t('Napiš své vyjádření.');
    case 'Vyjádření je moc dlouhé (nejvýš 500 znaků) nebo moc krátké.': return t('Vyjádření je moc dlouhé (nejvýš 500 znaků) nebo moc krátké.');
    default: return chyba;
  }
}

export function DetailTrestu({ trest, onClose, vsechny = [], nahled = false }: {
  /** Otevřený trest; null = okno zavřené. */
  trest: Trest | null;
  onClose: () => void;
  /** Vlastní tresty z téže odpovědi — kvůli „3. v tomto měsíci". */
  vsechny?: readonly Trest[];
  /** Galerie / náhled: jen ke čtení, nic se neodesílá. */
  nahled?: boolean;
}) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const money = useMoney();
  const nav = useNavigace();
  const [mistni, setMistni] = useState<Trest | null>(null);
  const [pisu, setPisu] = useState(false);
  const [text, setText] = useState('');
  const [nesouhlas, setNesouhlas] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [ukladam, setUkladam] = useState<'seen' | 'response' | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad'; id: number } | null>(null);

  // Každé otevření (jiný trest) začíná čtením — ne rozepsaným vyjádřením k jinému trestu.
  const id = trest?.id ?? null;
  useEffect(() => {
    setMistni(null);
    setPisu(false);
    setText('');
    setNesouhlas(false);
    setChyba(null);
    setUkladam(null);
  }, [id]);

  // Odpověď PATCH je čerstvější než seznam, dokud se seznam nepřenačte.
  const tr = trest && mistni?.id === trest.id ? mistni : trest;
  const akce = tr && !nahled ? akceTrestu(tr) : { potvrdit: false, vyjadrit: false };

  const patch = async (telo: Record<string, unknown>, druh: 'seen' | 'response'): Promise<boolean> => {
    if (!tr || ukladam) return false;
    setUkladam(druh);
    setChyba(null);
    try {
      const d = await fetch(`${URL_TRESTY}/${tr.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo) }).then(okJson);
      const item = vyberTresty({ items: [d?.item] })[0];
      if (item) setMistni(item);
      obnovTresty();
      setUkladam(null);
      return true;
    } catch (e) {
      const zprava = apiMessage(e, druh === 'seen' ? t('Potvrzení se neuložilo — zkontroluj připojení.') : t('Vyjádření se neodeslalo — zkontroluj připojení.'));
      if (druh === 'response') setChyba(zprava);
      else setToast({ text: zprava, tone: 'bad', id: Date.now() });
      setUkladam(null);
      return false;
    }
  };

  const beruNaVedomi = async () => {
    if (await patch({ seen: true }, 'seen')) setToast({ text: t('Vzato na vědomí.'), tone: 'ok', id: Date.now() });
  };

  const zacniPsat = () => {
    setText(tr?.response ?? '');
    setNesouhlas(tr?.disputed === true && !tr.disputeHandledAt);
    setChyba(null);
    setPisu(true);
  };

  const odesli = async () => {
    const v = validujVyjadreni(text);
    if (!v.ok) { setChyba(prelozChybu(t, v.chyba)); return; }
    if (await patch({ response: v.text, disagree: nesouhlas }, 'response')) {
      setPisu(false);
      setToast({ text: nesouhlas ? t('Nesouhlas odeslán — vedení ho uvidí.') : t('Vyjádření odesláno — vedení ho uvidí.'), tone: 'ok', id: Date.now() });
    }
  };

  const jdi = (pohled: string) => { onClose(); nav.onNavigate(pohled); };
  const denDlouze = (d: string) => fmtDatum(d, { jazyk, styl: 'denDlouze' });
  const poradi = tr ? poradiVMesici(vsechny, tr) : null;
  const zruseno = tr?.status === 'zruseno';
  const napomenuti = tr ? jeNapomenuti(tr) : false;
  const mesic = tr ? fmtMesic(tr.day.slice(0, 7), { jazyk }) : '';

  const paticka = !tr ? null : pisu ? (
    <>
      <Button variant="secondary" onClick={() => { setPisu(false); setChyba(null); }}>{t('Zrušit')}</Button>
      <Button variant="primary" icon="check" loading={ukladam === 'response'} onClick={() => void odesli()}>{t('Odeslat vyjádření')}</Button>
    </>
  ) : akce.potvrdit ? (
    <>
      <Button variant="secondary" icon="chat" onClick={zacniPsat}>{t('Vyjádřit se')}</Button>
      <Button variant="primary" icon="check" loading={ukladam === 'seen'} onClick={() => void beruNaVedomi()} data-beru-na-vedomi>{t('Beru na vědomí')}</Button>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={onClose}>{t('Zavřít')}</Button>
      {akce.vyjadrit && <Button variant="secondary" icon="chat" onClick={zacniPsat}>{tr.response ? t('Upravit vyjádření') : t('Vyjádřit se')}</Button>}
    </>
  );

  return (
    <>
      <Modal open={tr != null} onClose={onClose} size="md"
        title={tr ? (napomenuti ? t('Napomenutí') : t('Trest')) : ''}
        subtitle={tr ? <span className="cz-sentence block">{denDlouze(tr.day)}</span> : undefined}
        footer={paticka}>
        {tr && (
          <div className="space-y-4" data-detail-trestu={tr.id}>
            <div className="flex flex-wrap items-center gap-2">
              <StavTrestuChip trest={tr} size="md" />
            </div>
            <p className="text-[15px] leading-snug text-[#16181A] whitespace-pre-line break-words text-pretty" data-text-trestu>{tr.text}</p>

            {/* Dopad: body dolů a krácení prémie — vždy s větou, že jde jen o prémii, ne o mzdu. */}
            <Well pad="sm" data-dopad-trestu>
              {napomenuti ? (
                <p className="text-sm text-pretty"><b className="font-semibold">{t('Napomenutí')}</b> — {t('bez bodů a bez krácení prémie.')}</p>
              ) : (
                <ul className="space-y-2">
                  {tr.points > 0 && (
                    <li className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-black/70">{t('Body dolů')}</span>
                      <span className={`text-[15px] font-semibold tabular-nums ${zruseno ? 'line-through text-black/45' : ''}`}>{bodyDolu(t, tr.points)}</span>
                    </li>
                  )}
                  {tr.bonusCut > 0 && (
                    <li>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-black/70">{t('Krácení prémie')}</span>
                        <span className={`text-[15px] font-semibold tabular-nums ${zruseno ? 'line-through text-black/45' : ''}`}>−{money(tr.bonusCut)}</span>
                      </div>
                      <p className="t-meta mt-0.5 text-pretty" data-veta-premie>{t('Krátí se jen prémie za {mesic}, ne mzda.', { mesic })}</p>
                    </li>
                  )}
                </ul>
              )}
              {zruseno && !napomenuti && <p className="t-meta mt-2 text-pretty">{t('Trest je zrušený — body i krácení se vrátily.')}</p>}
            </Well>

            {zruseno && (
              <p className="note note-info text-pretty" data-zruseno>
                {tr.cancelNote ? t('Zrušeno: {poznamka}', { poznamka: tr.cancelNote }) : t('Zrušeno bez poznámky.')}
                {tr.cancelledByName && <span className="block mt-0.5 opacity-80">{t('Zrušil(a) {jmeno}', { jmeno: tr.cancelledByName })}</span>}
              </p>
            )}

            {/* Údaje: štítek vlevo, hodnota vpravo (na telefonu se hodnota zalomí, štítek zůstane). */}
            <dl className="space-y-2 text-sm" data-udaje-trestu>
              {tr.givenByName && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-black/60 shrink-0">{t('Dal(a)')}</dt>
                  <dd className="min-w-0 text-right font-medium break-words">{tr.givenByName}</dd>
                </div>
              )}
              {tr.typeTitle && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-black/60 shrink-0">{t('Položka sazebníku')}</dt>
                  <dd className="min-w-0 text-right font-medium break-words">
                    {tr.typeTitle}
                    {poradi != null && poradi >= 2 && <span className="block t-meta tabular-nums" data-poradi>{t('{n}. v tomto měsíci', { n: poradi })}</span>}
                  </dd>
                </div>
              )}
            </dl>
            {(tr.shiftId != null || tr.closingId != null) && (
              <ul className="list" data-odkazy-trestu>
                {tr.shiftId != null && (
                  nav.smiPohled('my-shifts') && !nahled
                    ? <ListRow title={t('Směna')} meta={<span className="cz-sentence inline-block">{denDlouze(tr.day)}</span>} onClick={() => jdi('my-shifts')} />
                    : <ListRow title={t('Směna')} meta={<span className="cz-sentence inline-block">{denDlouze(tr.day)}</span>} />
                )}
                {tr.closingId != null && (
                  nav.smiPohled('closing') && !nahled
                    ? <ListRow title={t('Uzávěrka')} meta={<span className="cz-sentence inline-block">{denDlouze(tr.day)}</span>} onClick={() => jdi('closing')} />
                    : <ListRow title={t('Uzávěrka')} meta={<span className="cz-sentence inline-block">{denDlouze(tr.day)}</span>} />
                )}
              </ul>
            )}

            {tr.photoUrl && (
              <a href={tr.photoUrl} target="_blank" rel="noreferrer" className="block w-fit rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542]" aria-label={t('Otevřít fotku')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tr.photoUrl} alt={t('Fotka k trestu')} className="block h-28 w-28 rounded-xl object-cover" />
              </a>
            )}

            {/* Vyjádření: po odeslání jeho text a kdo ho uvidí. */}
            {tr.response && !pisu && (
              <div data-vyjadreni>
                <p className="field-label flex flex-wrap items-center gap-2">
                  {t('Tvoje vyjádření')}
                  {tr.disputed && <Chip tone="muted" size="sm">{t('Nesouhlasíš')}</Chip>}
                </p>
                <p className="text-sm whitespace-pre-line break-words text-pretty text-black/80">{tr.response}</p>
                <p className="t-meta mt-1 flex items-start gap-1.5 text-pretty">
                  <Icon name="info" size={13} className="shrink-0 mt-0.5" />
                  <span>{tr.disputeHandledAt ? t('Vedení tvoje vyjádření vidělo — trest platí dál.') : t('Vedení to uvidí.')}</span>
                </p>
              </div>
            )}

            {pisu && (
              <div className="space-y-3" data-psani-vyjadreni>
                <Field id="trest-vyjadreni" label={t('Tvoje vyjádření')} error={chyba}
                  hint={<span className="flex justify-between gap-2"><span>{t('Vedení to uvidí.')}</span><span className="tabular-nums shrink-0" aria-live="polite" data-pocitadlo>{text.length}/{MAX_DELKA_VYJADRENI}</span></span>}>
                  <Textarea id="trest-vyjadreni" value={text} rows={4} maxLength={MAX_DELKA_VYJADRENI} autoFocus
                    onChange={e => { setText(e.target.value); if (chyba) setChyba(null); }}
                    placeholder={t('Jak to vidíš ty — co se stalo a proč.')} />
                </Field>
                <SwitchRow as="div" title={t('Nesouhlasím s trestem')} checked={nesouhlas} onChange={setNesouhlas}
                  hint={t('Vedení dostane oznámení a podívá se na to znovu.')} />
              </div>
            )}
          </div>
        )}
      </Modal>
      <Toast message={toast?.text ?? null} tone={toast?.tone} id={toast?.id} onClose={() => setToast(null)} />
    </>
  );
}

export default DetailTrestu;
