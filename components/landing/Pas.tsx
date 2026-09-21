import Image from 'next/image';
import { FOTO, PAS } from './foto';

// Pás podniků pod hero. Osm fotek, které jedou zleva doprava donekonečna.
//
// Není to dekorace: úkolem téhle stránky je za tři vteřiny říct, pro koho
// Managero je. Věta „pro kavárny, restaurace a bary" to řekne slovy, pás to
// ukáže — a ukázat je rychlejší.
//
// Žádný JavaScript. Posun je CSS animace, zastavení pod myší a při fokusu
// taky. Druhá kopie fotek existuje jen proto, aby smyčka nenavazovala
// skokem; pro odečítač obrazovky je schovaná, jinak by přečetl osm podniků
// dvakrát za sebou a znělo by to jako chyba.
export default function Pas() {
  const polozky = PAS.map(id => FOTO[id]);
  return (
    <div className="pas-obal py-2" aria-label="Podniky, pro které je Managero" role="group">
      <div className="pas-radek gap-4 sm:gap-5">
        {[0, 1].map(kopie => (
          <div key={kopie} className="flex gap-4 sm:gap-5 pr-4 sm:pr-5" aria-hidden={kopie === 1 || undefined}>
            {polozky.map(f => (
              <figure key={f.src} className="relative shrink-0 w-44 sm:w-60 lg:w-72">
                <div className="foto-ramec aspect-[4/3]">
                  <Image
                    src={f.src}
                    alt={kopie === 0 ? f.alt : ''}
                    width={f.w}
                    height={f.h}
                    sizes="(max-width: 640px) 11rem, (max-width: 1024px) 15rem, 18rem"
                    placeholder="blur"
                    blurDataURL={f.blur}
                    loading="lazy"
                  />
                </div>
                <figcaption className="mt-2 text-xs font-semibold tracking-wide text-black/50">{f.podnik}</figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
