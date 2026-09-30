'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, PersonChip, Segmented, Well } from '@/components/ui';
import { Icon } from '@/components/Icons';
import { apiMessage, ApiError, okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';
import { POZICE } from '@/lib/pruvodce/predvolby';
import { NAZEV_VELIKOSTI, VELIKOSTI_TYMU, type VelikostTymu } from '@/lib/pruvodce/typy';
import { vypadaJakoEmail } from '@/lib/emailAdresa';
import type { KrokProps } from './spolecne';

// Tým: velikost, pozice pozvaných, pozvánky a kód pro připojení.
//
// Pozvánky se posílají HNED (POST /api/invitations), ne při sestavení
// podniku: jsou to skutečné e-maily s vlastním stavem. E-mailové adresy se
// nikam neukládají, průvodce si pamatuje jen počet. Plný tým na tarifu
// Zdarma (403) není chyba, ale informace s odkazem na předplatné; krok to
// neblokuje.

type Stav = 'posilam' | 'odeslano' | 'odkaz' | 'plno' | 'chyba';
interface Pozvany { email: string; stav: Stav; odkaz?: string; zprava?: string }

export default function Tym({ odp, zmen, info }: KrokProps) {
  const t = useT('pruvodce');
  // Výchozí pozice se překládá jen pro zobrazení; do odpovědí se ukládá jen to, co člověk opravdu napsal.
  const pozice = odp.tym?.pozice ?? t(POZICE[odp.typ ?? 'jine']);
  const [pole, setPole] = useState('');
  const [chybaPole, setChybaPole] = useState('');
  const [pozvani, setPozvani] = useState<Pozvany[]>([]);
  const [zkopirovano, setZkopirovano] = useState<string | null>(null);
  const odeslane = useRef(new Set<string>());

  // Počet pozvaných (bez adres) se do odpovědí zapíše, až se stav pozvánek usadí.
  const pocet = pozvani.filter(p => p.stav === 'odeslano' || p.stav === 'odkaz').length;
  useEffect(() => {
    if (pocet !== (odp.tym?.pozvanych ?? 0) && (pocet > 0 || pozvani.length > 0)) zmen({ tym: { ...odp.tym, pozvanych: pocet } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pocet]);

  const pozvat = async () => {
    const email = pole.trim().toLowerCase();
    if (!email) return;
    if (!vypadaJakoEmail(email)) { setChybaPole(t('E-mail nevypadá správně.')); return; }
    if (odeslane.current.has(email)) { setChybaPole(t('Tenhle e-mail už je na seznamu.')); return; }
    setChybaPole('');
    odeslane.current.add(email);
    setPole('');
    setPozvani(l => [...l, { email, stav: 'posilam' }]);
    let nove: Pozvany;
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, jobTitle: pozice }),
      });
      const d = await okJson(res);
      nove = d.emailSent ? { email, stav: 'odeslano' } : { email, stav: 'odkaz', odkaz: `${window.location.origin}${d.path}` };
    } catch (e) {
      // 403 = tým je na tarifu Zdarma plný; ostatní chyby se říkají větou serveru.
      if (e instanceof ApiError && e.status === 403) nove = { email, stav: 'plno', zprava: t('Zdarma jsou v týmu nejvýš tři lidé. S Pro jich může být kolik chceš.') };
      else { nove = { email, stav: 'chyba', zprava: apiMessage(e, t('Pozvánka se neodeslala.')) }; odeslane.current.delete(email); }
    }
    setPozvani(l => l.map(p => (p.email === email ? nove : p)));
  };

  const zkopiruj = async (text: string, klic: string) => {
    try { await navigator.clipboard.writeText(text); setZkopirovano(klic); setTimeout(() => setZkopirovano(k => (k === klic ? null : k)), 2000); }
    catch { setZkopirovano(null); }
  };

  const odeslo = pozvani.filter(p => p.stav === 'odeslano').length;
  const plno = pozvani.some(p => p.stav === 'plno');
  const odeslaloText = odeslo > 0 ? t('{n, plural, one {# pozvánka odešla} few {# pozvánky odešly} other {# pozvánek odešlo}}', { n: odeslo }) : '';

  return (
    <div className="space-y-5">
      <div>
        <span className="field-label">{t('Kolik vás bude', undefined, 'tym')}</span>
        <Segmented ariaLabel={t('Velikost týmu')} size="sm" value={odp.tym?.velikost ?? 'mali'}
          options={VELIKOSTI_TYMU.map(v => ({ id: v, label: t(NAZEV_VELIKOSTI[v]) }))}
          onChange={(v: VelikostTymu) => zmen({ tym: { ...odp.tym, velikost: v } })} />
      </div>

      <Field id="pv-pozice" label={t('Pozice pozvaných')} hint={t('Jak se bude pozvaným říkat v týmu. Jde změnit u každého zvlášť.')}>
        <Input id="pv-pozice" value={pozice} maxLength={40} autoComplete="off" onChange={e => zmen({ tym: { ...odp.tym, pozice: e.target.value } })} />
      </Field>

      <div>
        <Field id="pv-email" label={t('Pozvat e-mailem')} error={chybaPole || undefined}
          hint={t('Napiš adresu a stiskni Enter. Pozvánka odejde hned, můžeš jich poslat víc.')}>
          <div className="flex gap-2">
            <Input id="pv-email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="send"
              value={pole} placeholder="jmeno@firma.cz" aria-invalid={chybaPole ? true : undefined}
              onChange={e => { setPole(e.target.value); if (chybaPole) setChybaPole(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void pozvat(); } }} />
            <Button variant="secondary" onClick={() => void pozvat()} disabled={!pole.trim()} icon="send" aria-label={t('Poslat pozvánku')} iconOnly />
          </div>
        </Field>

        {pozvani.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label={t('Pozvaní')}>
            {pozvani.map(p => (
              <li key={p.email} className="rise-in min-w-0 max-w-full">
                <PersonChip name={p.email} tone={p.stav === 'odeslano' ? 'ok' : p.stav === 'chyba' ? 'bad' : p.stav === 'plno' || p.stav === 'odkaz' ? 'wait' : 'muted'}
                  meta={p.stav === 'posilam' ? t('odesílám') : p.stav === 'odeslano' ? t('odesláno') : p.stav === 'odkaz' ? t('pošli odkaz') : undefined} />
              </li>
            ))}
          </ul>
        )}
        <p className="sr-only" aria-live="polite">{odeslaloText}</p>
        {odeslo > 0 && <p className="t-meta mt-2" data-odeslano>{odeslaloText}.</p>}

        {pozvani.filter(p => p.stav === 'odkaz').map(p => {
          // Věta s tučnou adresou: překlad nese značku {email}, tu nahradí <strong>.
          const [pred, po] = t('E-mail pro {email} se nepodařilo odeslat. Pošli mu tenhle odkaz sám:', { email: '\u0001' }).split('\u0001');
          return (
            <p key={p.email} className="note note-wait mt-3 text-[13px]">
              {pred}<strong>{p.email}</strong>{po}{' '}
              <button type="button" onClick={() => void zkopiruj(p.odkaz!, p.email)} className="tap-target-sm font-semibold underline underline-offset-2" data-kopirovat-odkaz>
                {zkopirovano === p.email ? t('Zkopírováno') : t('Zkopírovat odkaz')}
              </button>
            </p>
          );
        })}
        {plno && (
          <p className="note note-wait mt-3 text-[13px]" data-plny-tym>
            {t('Zdarma jsou v týmu nejvýš tři lidé. S Pro jich může být kolik chceš.')}{' '}
            <a href="/employer/overview?view=settings" className="tap-target-sm font-semibold underline underline-offset-2">{t('Předplatné najdeš v Nastavení')}</a>
            {'. '}{t('Kód pro připojení můžeš poslat dál, až to bude možné.')}
          </p>
        )}
        {pozvani.filter(p => p.stav === 'chyba').map(p => (
          <p key={p.email} role="alert" className="note note-danger mt-3 text-[13px]">{p.email}: {p.zprava}</p>
        ))}
      </div>

      {info.kod && (
        <Well className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="t-label">{t('Kód pro připojení')}</p>
            <p className="mt-1 text-[28px] font-bold leading-tight tracking-[0.25em] text-[#16181A]" data-kod>{info.kod}</p>
            <p className="t-meta mt-1">{t('Kdo ho zadá na stránce Připojit se k týmu, přidá se k tobě.')}</p>
          </div>
          <Button variant="secondary" size="sm" icon={zkopirovano === 'kod' ? 'check' : 'copy'} onClick={() => void zkopiruj(info.kod!, 'kod')}>
            {zkopirovano === 'kod' ? t('Zkopírováno') : t('Zkopírovat kód')}
          </Button>
        </Well>
      )}
      {!info.kod && <p className="t-meta flex items-center gap-1.5"><Icon name="info" size={14} />{t('Kód pro připojení najdeš později v Nastavení týmu.')}</p>}
    </div>
  );
}
