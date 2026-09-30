// Fotografie průvodce — jedna tabulka, ze které berou všechny kroky.
//
// Proč ne holé `<img src>`: každá fotka musí nést rozměr (jinak stránka při
// načtení poskočí), rozmazaný náhled (místo šedé díry je hned barva, která tam
// doopravdy bude), popis toho, co na ní je (ne „fotka kavárny"), a `sizes`
// (bez nich si telefon stáhne největší variantu). Blur náhledy jsou 16 px
// široké webp v datové adrese, generované `sharp`em z hotových souborů.
// Fotky jsou z jedné kampaně (dokumentární, denní světlo) a žádná nenese nápis.

export interface FotkaPruvodce {
  src: string;
  w: number;
  h: number;
  alt: string;
  /** Krátký popisek pod fotkou na počítači. */
  popisek: string;
  blur: string;
}

export const FOTKY = {
  kavarna: {
    src: '/brand/onboarding/kavarna.webp',
    w: 960, h: 723,
    alt: 'Baristka utírá dřevěný bar kavárny, vedle ní hrnek a espresso stroj',
    popisek: 'Kavárna',
    blur: 'data:image/webp;base64,UklGRmgAAABXRUJQVlA4IFwAAAAwAgCdASoQAAwAA4BaJYgCdAYtVOeTj+qI4AD+6KeamZT/lr2xDrTJ1L/fNMDtTvuQrR57/ugbngH51GobwhYiHafn16Ew+B+lUKCWjdc0vCn1p4PBGsrj4jwAAA==',
  },
  restaurace: {
    src: '/brand/onboarding/restaurace.webp',
    w: 960, h: 723,
    alt: 'Číšník srovnává prostřený stůl v restauraci, na stole sklenice a ubrousky',
    popisek: 'Restaurace',
    blur: 'data:image/webp;base64,UklGRmYAAABXRUJQVlA4IFoAAAAwAgCdASoQAAwAA4BaJQBOgCPqVIX80vUfgAD+BPEmRfYdjqBfTlQwcM/gwjZd891dTv9EEmQ/IX7VnWwnkFXHFe3ic+t7PvXinw7mzJ0q+z+JtJW5jOVlIAA=',
  },
  bar: {
    src: '/brand/onboarding/bar.webp',
    w: 960, h: 723,
    alt: 'Barmanka přelévá koktejl z šejkru do sklenice s limetkou za barovým pultem',
    popisek: 'Bar',
    blur: 'data:image/webp;base64,UklGRmQAAABXRUJQVlA4IFgAAACQAQCdASoQAAwAA4BaJQBOgBCXWlAA/vEg7hQ2IvR+HZEvaqAFd1NE5S+BhFjJcNUx7eWwwloS/lJwwQG/4LmaEZAn73R56JhQFaKk6tXMxTtI04mTsMAA',
  },
  pekarna: {
    src: '/brand/onboarding/pekarna.webp',
    w: 960, h: 723,
    alt: 'Pekařka vykládá na polici čerstvé bochníky chleba v pekárně',
    popisek: 'Pekárna',
    blur: 'data:image/webp;base64,UklGRmoAAABXRUJQVlA4IF4AAAAwAgCdASoQAAwAA4BaJQBOgMYOwP0laVPcAAD+yppkIM+zbo6paP/3K4h8Y0VGsJ1i0SGRMMLipjrqHJaPLgLT6yQntZUnvJSi5cAcmRb3gC3r4W1Xh7Tvn9H0RgAA',
  },
  caj: {
    src: '/brand/onboarding/caj.webp',
    w: 960, h: 723,
    alt: 'Žena nalévá zelený čaj ze skleněné konvičky, před ní čajový set',
    popisek: 'Čajový podnik',
    blur: 'data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAAAQAgCdASoQAAwAA4BaJZQC7ADRLLhQlzWAAP6bjJQCCn+kaT+FQpmx446P5ABUUt7vpYTW0uQsbkVFXMtFHCJYEb0CU+nZsn+WR0W1sm3TL0MvFMjAAA==',
  },
  foodtruck: {
    src: '/brand/onboarding/foodtruck.webp',
    w: 960, h: 723,
    alt: 'Kuchař ve stánku podává zákaznici papírový sáček při západu slunce',
    popisek: 'Stánek nebo foodtruck',
    blur: 'data:image/webp;base64,UklGRm4AAABXRUJQVlA4IGIAAAAQAgCdASoQAAwAA4BaJZgCdAYsPS+I/DkAAP7smhp8YI9dfoXHv5LIb1EotLPLx796pk6OO/k0QEA5IoGvjOqmX9Cl7BzIQUYJkQZ3QUp1bBLjwO2OnxVFtxixXw2uWj2gAA==',
  },
  doba: {
    src: '/brand/onboarding/doba.webp',
    w: 960, h: 723,
    alt: 'Ruka odemyká klíčem skleněné dveře kavárny, uvnitř ranní světlo a bar',
    popisek: 'Otevírací doba',
    blur: 'data:image/webp;base64,UklGRmoAAABXRUJQVlA4IF4AAAAwAgCdASoQAAwAA4BaJZACdAD8GyvQDiVgAAD+7bM1ShzNuQKNZxxiG/KFJHd/cbOPfqsW/Y8BLG0BsQXo/giFLQNC5uS++DoFmdf0/3qgbb6BxPDdD7ssTBcnAAAA',
  },
  majitel: {
    src: '/brand/landing/v2/majitel.webp',
    w: 1400, h: 830,
    alt: 'Majitelka kavárny u baru pracuje s tabletem a usmívá se',
    popisek: 'Vítej',
    blur: 'data:image/webp;base64,UklGRmYAAABXRUJQVlA4IFoAAABQAgCdASoQAAkAA4BaJQBdgMXcwP9zcsHJ/wAA/soy0zPV3mtYa2UQWsac8VQADTSDrPET94BuATAPIBBvRCVeyIJqa7YwffXKr3Xp0JYQ8G3TuQdcVUkAAAA=',
  },
  tym: {
    src: '/brand/landing/v2/tym.webp',
    w: 1400, h: 830,
    alt: 'Tři členové týmu se nad telefonem radují u baru kavárny',
    popisek: 'Tým',
    blur: 'data:image/webp;base64,UklGRmYAAABXRUJQVlA4IFoAAAAwAgCdASoQAAkAA4BaJQBOgO4Fvw1iuU8kAAD+yS0pdjAFIL7Y7EdqEdeuWVotRFfsdWfxfJSDkByZBiaXRDlyhF1GHIYNTZHfymaUN1UL7Sb4Afd62CbAAAA=',
  },
  uzaverka: {
    src: '/brand/landing/v2/uzaverka.webp',
    w: 1400, h: 830,
    alt: 'Obsluha po zavření počítá hotovost u baru, vedle stojí tablet',
    popisek: 'Uzávěrky',
    blur: 'data:image/webp;base64,UklGRkoAAABXRUJQVlA4ID4AAADwAQCdASoQAAkAA4BaJQBOgB7HnX4Rg0AA/u+KD17PP9LLilyKQlRGbhag+gtm6UASfoELMl3PNo6mMj6AAA==',
  },
  porada: {
    src: '/brand/landing/v2/porada.webp',
    w: 1400, h: 830,
    alt: 'Dva lidé u kulatého stolku společně plánují na tabletu',
    popisek: 'Plánování',
    blur: 'data:image/webp;base64,UklGRmAAAABXRUJQVlA4IFQAAAAQAgCdASoQAAkAA4BaJQBdg7QARQbaItgAAP64AUNCc6gJ7YFnYgMY/bOg6TmL2Q5iOt4RDyJYUbegnazeSI1a/k5j2dokg7mPuSEe7ktr8gYAAAA=',
  },
  sklad: {
    src: '/brand/landing/v2/sklad.webp',
    w: 1400, h: 830,
    alt: 'Pracovnice ve skladu s tabletem kontroluje regály se zásobami',
    popisek: 'Sklad',
    blur: 'data:image/webp;base64,UklGRloAAABXRUJQVlA4IE4AAAAQAgCdASoQAAkAA4BaJZwAD4/PNLWGPRgAAP7s85vjD8DxFlYig7OffY0iYUztnqOiIzuGMjNmoN9EQ8iP3a77wyfYCG2ZmX14ccatsAA=',
  },
  telefon: {
    src: '/brand/landing/v2/telefon.webp',
    w: 800, h: 1430,
    alt: 'Ruka drží telefon s aplikací nad stolem s kávou',
    popisek: 'Aplikace v telefonu',
    blur: 'data:image/webp;base64,UklGRtAAAABXRUJQVlA4IMQAAAAQBQCdASoQAB0APu1iqU2ppaOiMAgBMB2JZQC/P2gJEDsBrRWCdIZHY8Ohxa0jx+JgAP7GUdorMY/5yXeEYrFAcVUMOVocRi88/QGk1vdF5JzssJWXWYeBopXA9LfSBdNV8UuakoBhFGQY7/wSuI75/xwFF0NR4p1WKtGYnorKV3NDON/SD8fgpqmRj7iDmDCxRN5MFR53BBapXqkfGYnK1ASR89+4+8sFWOVnbo/3vuBxXAL13vJhkqcC7Q1iiU3geAAA',
  },
  host: {
    src: '/brand/landing/foto/host.webp',
    w: 896, h: 1216,
    alt: 'Host u mramorového stolku drží telefon nad kartičkou s QR kódem',
    popisek: 'Hosté',
    blur: 'data:image/webp;base64,UklGRqAAAABXRUJQVlA4IJQAAAAQBACdASoQABYAPu1iqU2ppaOiMAgBMB2JQBdmUAS34f8iPkfTVE14SAD6f+UqtNJXgFpzRgVxYuUED8d8wN/qQF8w9ks3x7Y3OlvkUO+CGmWiNqneKF/RQ2Qp1wBq9ijU+jy+ba5Z7QSZFHNU+RQkDSHxw2kdcPH8zkg5pKGxajaBJzUvncSgfa4rDdqFG+L3wAAA',
  },
} as const satisfies Record<string, FotkaPruvodce>;

export type IdFotky = keyof typeof FOTKY;
