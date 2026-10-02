'use client';

// Krok 2: který sloupec souboru je které pole. Předvyplněno z navrhniMapovani, člověk jen zkontroluje.

import { Chip, Label, Select } from '../../ui';
import { Icon } from '../../Icons';
import { POLE, type PoleImportu } from '@/lib/importKarticka';

export type VolbaSloupce = PoleImportu | '';

const NAZEV_POLE = new Map<string, string>(POLE.map(p => [p.id, p.popis]));

/** Pole, na která míří víc sloupců (zapíše se první z nich). */
export function dvojitaPole(sloupcePole: VolbaSloupce[]): PoleImportu[] {
  const pocet = new Map<PoleImportu, number>();
  for (const f of sloupcePole) if (f) pocet.set(f, (pocet.get(f) ?? 0) + 1);
  return [...pocet.entries()].filter(([, n]) => n > 1).map(([f]) => f);
}

export default function Sloupce({ hlavicka, radky, sloupcePole, onPole }: {
  hlavicka: string[];
  radky: string[][];
  sloupcePole: VolbaSloupce[];
  onPole: (sloupec: number, pole: VolbaSloupce) => void;
}) {
  const chybiEmail = !sloupcePole.includes('email');
  const dvojita = dvojitaPole(sloupcePole);
  const ukazka = radky.slice(0, 5);
  // Pole v pořadí, v jakém se v náhledu ukáží: jen ta, která jsou namapovaná; u dvojitých první sloupec.
  const sloupceNahledu = POLE.map(p => ({ pole: p, i: sloupcePole.indexOf(p.id) })).filter(x => x.i >= 0);

  return (
    <div className="space-y-5 min-w-0">
      <p className="text-sm text-black/65 text-pretty">
        Zkontroluj, co je který sloupec. Navrhli jsme to podle názvů; co nepoznáme, nastavíš jedním výběrem.
        Povinný je jen e-mail.
      </p>

      {chybiEmail && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-[var(--bad-bg)] text-[var(--bad-ink)] p-3 text-sm">
          <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
          <span className="min-w-0 text-pretty">Chybí sloupec s e-mailem. Bez něj nejde pokračovat: podle e-mailu se člen najde a může se přihlásit.</span>
        </div>
      )}
      {dvojita.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-2xl bg-[var(--wait-bg)] text-[var(--wait-ink)] p-3 text-sm">
          <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
          <span className="min-w-0 text-pretty">
            Víc sloupců míří na totéž pole ({dvojita.map(f => NAZEV_POLE.get(f)).join(', ')}). Použije se jen první z nich.
          </span>
        </div>
      )}

      <ul className="list" aria-label="Sloupce souboru">
        {hlavicka.map((h, i) => {
          const vzorek = ukazka.map(r => r[i]).find(v => v && v.trim()) ?? '';
          const dup = !!sloupcePole[i] && dvojita.includes(sloupcePole[i] as PoleImportu);
          return (
            <li key={i} className="py-3 grid gap-2 sm:grid-cols-2 sm:items-center min-w-0">
              <div className="min-w-0">
                <Label htmlFor={`import-sloupec-${i}`} className="!mb-0.5 !text-[#16181A] !font-semibold truncate">
                  {h.trim() || `Sloupec ${i + 1}`}
                </Label>
                <p className="text-xs text-black/50 truncate">{vzorek ? <>např. {vzorek.slice(0, 40)}</> : 'bez hodnot v ukázce'}</p>
              </div>
              <div className="min-w-0 flex items-center gap-2">
                <Select id={`import-sloupec-${i}`} className="min-h-11 min-w-0" value={sloupcePole[i] ?? ''}
                  onChange={e => onPole(i, e.target.value as VolbaSloupce)}>
                  <option value="">nepoužít</option>
                  {POLE.map(p => <option key={p.id} value={p.id}>{p.popis}</option>)}
                </Select>
                {dup && <Chip tone="wait" size="sm" className="shrink-0">dvakrát</Chip>}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-[#16181A]">Náhled prvních {ukazka.length} řádků</h4>
        {sloupceNahledu.length === 0 ? (
          <p className="mt-2 text-sm text-black/55">Zatím není vybraný žádný sloupec.</p>
        ) : (
          <div className="mt-2 min-w-0 overflow-x-auto rounded-2xl border border-[var(--surface-line)]" tabIndex={0} role="region" aria-label="Náhled tabulky">
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="text-left text-xs text-black/55">
                  {sloupceNahledu.map(x => <th key={x.pole.id} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">{x.pole.popis}</th>)}
                </tr>
              </thead>
              <tbody>
                {ukazka.map((r, ri) => (
                  <tr key={ri} className="border-t border-[var(--surface-line)]">
                    {sloupceNahledu.map(x => <td key={x.pole.id} className="px-3 py-2 whitespace-nowrap max-w-[16rem] truncate">{r[x.i] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
