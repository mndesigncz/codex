import Image from 'next/image';
import { FOTO, type FotoId } from './foto';

// Jedna fotka v rámu. Existuje proto, aby se čtyři věci nedaly zapomenout
// na žádném z devíti míst, kde se na stránce fotka objeví: rozměr (jinak
// stránka při načtení poskočí), rozmazaný náhled, popis pro odečítač
// obrazovky a `sizes` (bez něj si prohlížeč stáhne největší variantu i na
// telefon).
//
// Paralaxa je zapnutá ve výchozím stavu, protože fotka, která se při
// scrollu ani nehne, působí jako nalepený obrázek — přesně ta výtka, kvůli
// které odsud zmizel 3D hrnek. Vypíná se tam, kde je fotka malá nebo kde
// je na ní posazený text: pohyb pod textem se špatně čte.
export default function Foto({
  id, pomer = 'aspect-[4/3]', className = '', sizes, priority = false, paralax = true, prekryv,
}: {
  id: FotoId;
  /** Tailwindový poměr stran rámu. */
  pomer?: string;
  className?: string;
  sizes: string;
  priority?: boolean;
  paralax?: boolean;
  /** Ztmavení pod text posazený na fotku. */
  prekryv?: string;
}) {
  const f = FOTO[id];
  return (
    <div className={`foto-ramec ${paralax ? 'paralax' : ''} ${pomer} ${className}`}>
      <Image
        src={f.src}
        alt={f.alt}
        width={f.w}
        height={f.h}
        sizes={sizes}
        placeholder="blur"
        blurDataURL={f.blur}
        priority={priority}
        loading={priority ? undefined : 'lazy'}
      />
      {prekryv && <div className={`absolute inset-0 ${prekryv}`} aria-hidden />}
    </div>
  );
}
