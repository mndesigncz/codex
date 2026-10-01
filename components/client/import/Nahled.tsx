'use client';

// Krok 3: co se importuje (souhrn z prevedRadky), co se přeskočí, dotaz na server (nic se nezapisuje) a volby.

import { Button, Chip, ErrorState, Field, Input, Select, Skeleton, Stat, StatRow, SwitchRow, Well } from '../../ui';
import { Icon } from '../../Icons';
import { useSymbol } from '../../CurrencyProvider';
import type { ChybaRadku, VysledekRozboru } from '@/lib/importKarticka';
import { souhrnImportu } from '@/lib/importKarticka';
import { cislo, MAX_DAVKA, type KampanRazitek, type NahledDavky, type StavNacteni, type Volby } from './typy';

const MAX_CHYB_V_TABULCE = 20;
const MAX_UPOZORNENI = 50;

export default function Nahled({
  rozbor, souhrn, maSkupinuSloupec, maRazitkaSloupec, server, onServerZnovu, kampane, onKampaneZnovu, volby, setVolby, onStahnoutChyby,
}: {
  rozbor: VysledekRozboru;
  souhrn: ReturnType<typeof souhrnImportu>;
  maSkupinuSloupec: boolean;
  maRazitkaSloupec: boolean;
  server: StavNacteni<NahledDavky>;
  onServerZnovu: () => void;
  kampane: StavNacteni<KampanRazitek[]>;
  onKampaneZnovu: () => void;
  volby: Volby;
  setVolby: (v: Volby) => void;
  onStahnoutChyby: () => void;
}) {
  const symbol = useSymbol();
  const chyby: ChybaRadku[] = rozbor.chyby;
  const nastav = (cast: Partial<Volby>) => setVolby({ ...volby, ...cast });
  const razitkaBezKampane = souhrn.razitka > 0 && volby.kampan === '';
  const seznamKampani = kampane.stav === 'ok' ? kampane.data : [];
  const pocetNova = Math.max(1, Math.min(50, Math.round(Number(volby.novaPocet) || 0)));

  return (
    <div className="space-y-5 min-w-0">
      {souhrn.clenu === 0 ? (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-[var(--bad-bg)] text-[var(--bad-ink)] p-3 text-sm">
          <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
          <span className="min-w-0 text-pretty">Z tabulky nevyšel žádný člen. Vraťte se o krok zpět a zkontrolujte sloupec s e-mailem.</span>
        </div>
      ) : (
        <section aria-label="Souhrn importu">
          <StatRow>
            <Stat label="Členů" value={cislo(souhrn.clenu)} />
            <Stat label="Bodů" value={cislo(souhrn.body)} />
            <Stat label="Kreditu" value={cislo(souhrn.kredit)} unit={symbol} />
            <Stat label="Razítek" value={cislo(souhrn.razitka)} note={souhrn.sRazitky ? `u ${cislo(souhrn.sRazitky)} členů` : undefined} />
          </StatRow>
          {souhrn.skupiny.length > 0 && (
            <div className="mt-4">
              <p className="t-label">Skupiny, které se založí</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {souhrn.skupiny.map(s => <Chip key={s.nazev} tone="info" size="sm">{s.nazev} · {cislo(s.pocet)}</Chip>)}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Co server najde: nic se nezapisuje. */}
      <section aria-label="Kontrola proti účtům v aplikaci" aria-live="polite" className="min-w-0">
        <h4 className="text-sm font-semibold text-[#16181A]">Kontrola účtů</h4>
        {server.stav === 'nacita' || server.stav === 'nic' ? (
          <div className="mt-2 space-y-2" aria-busy><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /></div>
        ) : server.stav === 'chyba' ? (
          <ErrorState compact title={server.status === 403 ? 'K importu chybí oprávnění Import členů' : 'Kontrola se nepovedla'}
            hint={server.status === 403 ? 'Požádejte vedení, ať vám oprávnění „Import členů“ přidá v nastavení rolí.' : server.zprava}
            onRetry={server.status === 403 ? undefined : onServerZnovu} />
        ) : (
          <>
            <ul className="mt-2 space-y-1 text-sm text-black/75">
              <li>Nových účtů: <strong>{cislo(server.data.noveUcty)}</strong></li>
              <li>Hostů, kteří už v aplikaci mají účet: <strong>{cislo(server.data.existujiciHoste)}</strong></li>
              <li>Už jsou členy tohoto podniku: <strong>{cislo(server.data.uzJsouClenove)}</strong></li>
              <li>E-mail patří zaměstnanci nebo vedení: <strong>{cislo(server.data.cizi)}</strong>{server.data.cizi > 0 && <span className="text-black/50"> (ti se přeskočí)</span>}</li>
            </ul>
            {souhrn.clenu > MAX_DAVKA && (
              <p className="mt-1.5 text-xs text-black/50 text-pretty">Kontrola platí pro prvních {cislo(MAX_DAVKA)} členů souboru, zbytek se počítá až při importu.</p>
            )}
          </>
        )}
      </section>

      {chyby.length > 0 && (
        <section aria-label="Přeskočené řádky" className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[#16181A]">Přeskočené řádky: {cislo(chyby.length)}</h4>
            <Button size="sm" variant="secondary" icon="download" onClick={onStahnoutChyby}>Stáhnout chyby (CSV)</Button>
          </div>
          <div className="mt-2 min-w-0 overflow-x-auto rounded-2xl border border-[var(--surface-line)]" tabIndex={0} role="region" aria-label="Přeskočené řádky">
            <table className="w-full text-sm min-w-[22rem]">
              <thead><tr className="text-left text-xs text-black/55">
                <th scope="col" className="px-3 py-2 font-medium">Řádek</th>
                <th scope="col" className="px-3 py-2 font-medium">Důvod</th>
                <th scope="col" className="px-3 py-2 font-medium">Hodnota</th>
              </tr></thead>
              <tbody>
                {chyby.slice(0, MAX_CHYB_V_TABULCE).map((c, i) => (
                  <tr key={i} className="border-t border-[var(--surface-line)] align-top">
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{c.radek}</td>
                    <td className="px-3 py-2 min-w-[12rem]">{c.duvod}</td>
                    <td className="px-3 py-2 break-all text-black/60">{c.hodnota ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {chyby.length > MAX_CHYB_V_TABULCE && (
            <p className="mt-1.5 text-xs text-black/50">Ukázáno prvních {MAX_CHYB_V_TABULCE}, všechny jsou v souboru ke stažení.</p>
          )}
        </section>
      )}

      {rozbor.upozorneni.length > 0 && (
        <details className="rounded-2xl border border-[var(--surface-line)] px-4 py-1 min-w-0">
          <summary className="tap-target-sm cursor-pointer select-none py-3 text-sm font-semibold text-[#16181A]">
            Upozornění ({cislo(rozbor.upozorneni.length)})
          </summary>
          <p className="text-xs text-black/50 pb-2">Řádky se importují, jen konkrétní hodnota se nezapíše nebo se upraví.</p>
          <ul className="pb-3 space-y-1 text-sm text-black/70">
            {rozbor.upozorneni.slice(0, MAX_UPOZORNENI).map((u, i) => (
              <li key={i} className="text-pretty"><span className="tabular-nums text-black/45">Řádek {u.radek}:</span> {u.text}</li>
            ))}
          </ul>
          {rozbor.upozorneni.length > MAX_UPOZORNENI && <p className="pb-3 text-xs text-black/50">… a dalších {cislo(rozbor.upozorneni.length - MAX_UPOZORNENI)}.</p>}
        </details>
      )}

      {/* Volby */}
      <section aria-label="Volby importu" className="space-y-4 min-w-0">
        <h4 className="text-sm font-semibold text-[#16181A]">Volby</h4>

        <Field id="import-existujici" label="Členové, kteří už v podniku jsou"
          hint="Účet hosta se nikdy nepřepisuje (jméno, telefon zůstanou). Mění se jen jeho zůstatky v tomto podniku.">
          <Select className="min-h-11" id="import-existujici" value={volby.existujici} onChange={e => nastav({ existujici: e.target.value === 'nastavit' ? 'nastavit' : 'preskocit' })}>
            <option value="preskocit">Přeskočit (nechat, jak jsou)</option>
            <option value="nastavit">Nastavit zůstatky ze souboru</option>
          </Select>
        </Field>

        <Field id="import-kampan" label="Razítka"
          hint={!maRazitkaSloupec ? 'Soubor nemá sloupec s razítky, takže se nic nepřenáší.' : undefined}>
          <Select className="min-h-11" id="import-kampan" value={volby.kampan} onChange={e => nastav({ kampan: e.target.value })}>
            <option value="">Nepřenášet razítka</option>
            {seznamKampani.map(k => <option key={k.id} value={String(k.id)}>{k.name}</option>)}
            <option value="nova">Založit novou kampaň ({pocetNova} razítek)</option>
          </Select>
        </Field>
        {kampane.stav === 'nacita' && <p className="text-xs text-black/50" role="status">Načítám kampaně razítek…</p>}
        {kampane.stav === 'chyba' && (
          <p className="text-xs text-[var(--wait-ink)] text-pretty" role="status">
            Kampaně razítek se nepodařilo načíst ({kampane.zprava}).{' '}
            <button type="button" className="tap-target-sm underline underline-offset-2" onClick={onKampaneZnovu}>Zkusit znovu</button>
          </p>
        )}
        {volby.kampan === 'nova' && (
          <Well className="grid gap-3 sm:grid-cols-2">
            <Field id="import-nova-pocet" label="Razítek na kartě" hint="1 až 50.">
              <Input className="min-h-11" id="import-nova-pocet" type="number" inputMode="numeric" min={1} max={50} value={volby.novaPocet}
                onChange={e => nastav({ novaPocet: e.target.value })} />
            </Field>
            <Field id="import-nova-odmena" label="Odměna za plnou kartu" hint="Např. káva zdarma.">
              <Input className="min-h-11" id="import-nova-odmena" value={volby.novaOdmena} maxLength={160} placeholder="Káva zdarma"
                onChange={e => nastav({ novaOdmena: e.target.value })} />
            </Field>
            <p className="sm:col-span-2 text-xs text-black/55 text-pretty">Kampaň „Karta z Kartičky“ se založí při spuštění importu.</p>
          </Well>
        )}
        {razitkaBezKampane && (
          <div role="status" className="flex items-start gap-2 rounded-2xl bg-[var(--wait-bg)] text-[var(--wait-ink)] p-3 text-sm">
            <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
            <span className="min-w-0 text-pretty">Soubor obsahuje razítka ({cislo(souhrn.razitka)}), ale není vybraná kampaň. Razítka se nepřenesou.</span>
          </div>
        )}

        {maSkupinuSloupec && (
          <ul className="list">
            <SwitchRow title="Zařadit do skupin podle sloupce Skupina" checked={volby.skupiny} onChange={v => nastav({ skupiny: v })}
              hint="Chybějící skupiny se založí a členové se do nich zařadí." />
          </ul>
        )}
      </section>

      <Well className="text-sm text-black/65 space-y-1">
        <p className="font-medium text-[#16181A]">Jak se importovaní členové dostanou ke kartě</p>
        <p className="text-pretty">
          Importovaný člen má nepoužitelné heslo a nemá souhlas se zprávami (kontakt ze souboru není souhlas).
          Přihlásí se přes „Zapomenuté heslo“ se stejným e-mailem a svoji kartu uvidí podle e-mailu.
        </p>
      </Well>
    </div>
  );
}
