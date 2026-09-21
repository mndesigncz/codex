import { Scena, type ScenaId } from './FeatureScenes';

// Produkt v prostoru.
//
// „3D" na téhle stránce už jednou bylo — hrnek — a neprodávalo, protože
// návštěvník nekupuje hrnek. Tohle je jiné 3D: SKUTEČNÁ obrazovka aplikace
// (tatáž scéna, která se přehrává v ukázce funkcí níž) posazená do tabletu
// s tenkým rámem, lehce natočená a vznášející se nad fotkou podniku.
// Nula bajtů modelu, nula WebGL — perspektiva je CSS. A hlavně: je vidět,
// co se prodává, a hýbe se to tak, jak se to hýbe v aplikaci.
export default function Zarizeni({ scena, className = '' }: { scena: ScenaId; className?: string }) {
  return (
    <div className={`zarizeni-scena ${className}`}>
      <div className="zarizeni rounded-[1.75rem] bg-[#16181A] p-2">
        <div className="rounded-[1.35rem] overflow-hidden bg-[#F3F4F0]">
          <Scena id={scena} />
        </div>
      </div>
    </div>
  );
}
