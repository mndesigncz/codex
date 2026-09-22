import { Scena, type ScenaId } from './FeatureScenes';

// Stěna obrazovek — celá aplikace najednou, v prostoru.
//
// Jedna obrazovka v hero řekne, že produkt existuje. Tři vedle sebe řeknou,
// že je to CELÝ provoz: sklad, kasa a peníze — tři věci, které se v podniku
// jinak vedou ve třech sešitech. Karty stojí v perspektivě jako na stole
// a při scrollu se narovnají do roviny; kdo scrolluje, „přijde k nim blíž".
//
// Pohyb řídí scroll přímo v CSS (`animation-timeline: view()`), ne skript:
// prohlížeč, který to neumí, dostane karty jen lehce natočené a stojící —
// a to je pořád správný obrázek. Stejně jako ostatní ukázky jsou to živé
// komponenty aplikace, ne screenshoty; když se změní vzhled aplikace,
// změní se i stěna.
const KARTY: { id: ScenaId; popisek: string; uhel: number }[] = [
  { id: 'sklad', popisek: 'Sklad hlídá minima a objedná', uhel: 16 },
  { id: 'uzaverky', popisek: 'Uzávěrka sedí na korunu', uhel: 0 },
  { id: 'finance', popisek: 'Finance měsíce na jednom místě', uhel: -16 },
];

export default function Stena() {
  return (
    <div className="stena mt-10 grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 items-end">
      {KARTY.map((k, i) => (
        <figure key={k.id} className={`stena-karta ${i === 1 ? 'md:-mt-8' : ''}`} style={{ ['--uhel' as string]: k.uhel }}>
          <div className="zarizeni-plocha rounded-[1.75rem] bg-[#16181A] p-2">
            <div className="rounded-[1.35rem] overflow-hidden bg-[#F3F4F0]">
              <Scena id={k.id} />
            </div>
          </div>
          <figcaption className="mt-3 text-center text-sm font-semibold text-black/60">{k.popisek}</figcaption>
        </figure>
      ))}
    </div>
  );
}
