'use client';

import { KODY_ALERGENU, KODY_STITKU, ALERGENY, STITKY, type KodAlergenu, type KodStitku } from '@/lib/alergeny';

// Výběr alergenů (14 skupin podle nařízení EU 1169/2011) a štítků jídla.
//
// Čtrnáct přepínacích čipů (aria-pressed), na telefonu ve dvou sloupcích,
// každý s cílem 44 px. Vybraný čip je inkoustový (chip-ink), ne limetkový:
// jednu plnou limetku na obrazovce drží „Uložit". Editor je správa, takže mluví
// česky; hostovi se názvy posílají v jeho jazyce ze serveru (lib/alergeny.ts).
//
// Důležité pro právo: prázdný výběr NEZNAMENÁ „bez alergenů", jen „nevyplněno".
// Host u takové položky neuvidí nic a pod lístkem stojí věta „zeptejte se obsluhy".

export default function AlergenyPicker({ alergeny, stitky, onAlergeny, onStitky, disabled = false }: {
  alergeny: number[];
  stitky: string[];
  onAlergeny: (kody: KodAlergenu[]) => void;
  onStitky: (kody: KodStitku[]) => void;
  disabled?: boolean;
}) {
  const vybrane = new Set(alergeny);
  const vybraneStitky = new Set(stitky);

  const prepni = (kod: KodAlergenu) => {
    const dalsi = new Set(vybrane);
    if (dalsi.has(kod)) dalsi.delete(kod); else dalsi.add(kod);
    onAlergeny(KODY_ALERGENU.filter(k => dalsi.has(k)));
  };
  const prepniStitek = (kod: KodStitku) => {
    const dalsi = new Set(vybraneStitky);
    if (dalsi.has(kod)) dalsi.delete(kod); else dalsi.add(kod);
    onStitky(KODY_STITKU.filter(k => dalsi.has(k)));
  };

  const cip = (zapnuto: boolean) =>
    `chip ${zapnuto ? 'chip-ink' : 'chip-muted'} w-full min-h-[44px] justify-start text-left whitespace-normal leading-snug cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`;

  return (
    <div className="space-y-5">
      <div>
        <p className="t-label mb-2">Alergeny</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Alergeny položky">
          {KODY_ALERGENU.map(k => (
            <button key={k} type="button" disabled={disabled} aria-pressed={vybrane.has(k)} onClick={() => prepni(k)} className={cip(vybrane.has(k))}>
              <span className="tabular-nums font-semibold shrink-0">{k}</span>
              <span className="min-w-0">{ALERGENY[k].cs}</span>
            </button>
          ))}
        </div>
        <p className="t-meta mt-2 text-pretty">
          Prázdný výběr neznamená „bez alergenů“, jen že nejsou vyplněné. Host u takové položky nic neuvidí a pod lístkem najde větu, ať se zeptá obsluhy.
        </p>
      </div>

      <div>
        <p className="t-label mb-2">Štítky</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Štítky položky">
          {KODY_STITKU.map(k => (
            <button key={k} type="button" disabled={disabled} aria-pressed={vybraneStitky.has(k)} onClick={() => prepniStitek(k)} className={cip(vybraneStitky.has(k))}>
              {STITKY[k].cs}
            </button>
          ))}
        </div>
        <p className="t-meta mt-2 text-pretty">Označ jen to, čeho jsi si jistý. Štítky „Vegan“ a „Bez lepku“ jsou tvrzení pro hosta.</p>
      </div>
    </div>
  );
}
