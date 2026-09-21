// Fotografie prodejní stránky — jeden seznam, ze kterého berou všechny sekce.
//
// Proč to není jen `<img src>` roztroušené po Landing.tsx: každá fotka musí
// nést čtyři věci najednou a všechny čtyři se zapomínají zvlášť.
//  - `w`/`h`: bez nich stránka při načtení poskočí, protože prohlížeč do
//    poslední chvíle neví, kolik místa má fotce nechat.
//  - `blur`: šestnáctipixelový náhled v datové adrese. Místo šedé díry je
//    hned barva, která tam doopravdy bude. Stojí to pár set bajtů.
//  - `alt`: popis toho, co na fotce je. Ne „fotka kavárny" — to odečítači
//    obrazovky neřekne nic, co by nevěděl z nadpisu vedle.
//  - `podnik`: štítek do pásu podniků. Fotka a její jméno musí zůstat
//    u sebe, jinak se to při přeházení pásu rozejde.
//
// Zdroj: vygenerovaná dokumentární fotografie, jedna sada, jedna paleta.
// Nejsou to skuteční zákazníci a stránka to nikde netvrdí — žádná jména
// podniků, žádné uvozovky, žádná loga, která nemáme.

export interface Fotka {
  src: string;
  w: number;
  h: number;
  alt: string;
  podnik: string;
  /** Rozmazaný náhled 16 px na šířku, datová adresa. */
  blur: string;
}

export const FOTO = {
  kavarna: {
    src: '/brand/landing/foto/kavarna.webp',
    w: 1344, h: 768,
    alt: 'Barista za dřevěným barem malé kavárny, ranní světlo z okna',
    podnik: 'Kavárna',
    blur: 'data:image/webp;base64,UklGRmwAAABXRUJQVlA4IGAAAADQAQCdASoQAAkAA4BaJQBdgB4jG6Lw+AD+4pwiIhJOQQCqrmZh5qxan0g7LQ9r7HRIRVvdfb4B2MrGMSMevWRTkju/TMM75/+waSzyYmXZ7fjH9vcZNfFhN90jjvgAAAA=',
  },
  barista: {
    src: '/brand/landing/foto/barista.webp',
    w: 896, h: 1216,
    alt: 'Ruce baristy utahují kávu v páce, nad ní stoupá pára',
    podnik: 'Espresso bar',
    blur: 'data:image/webp;base64,UklGRrYAAABXRUJQVlA4IKoAAADwAwCdASoQABYAPu1iqU2ppaOiMAgBMB2JYwDA3YzkUuYucpesnChAAP7R6D1B0FqXvfnPxbUvv+c5kvv7vnOSxI/YZ51zrU+Z9qHf2iGPEeZsK/zxX21WH4pfY+Lke4tE+O7J+LFqN2MdcOVd65mi8n5IutUj1LupmcR/pkPFb0Nn1CFIocbSmQdckMQCIjGb8B+qVdKxJUWK/foSjyo4ctGzTszDQDgAAA==',
  },
  kuchyn: {
    src: '/brand/landing/foto/kuchyn.webp',
    w: 1216, h: 896,
    alt: 'Kuchař dokončuje talíř na výdejním pultu bistra během servisu',
    podnik: 'Bistro',
    blur: 'data:image/webp;base64,UklGRnoAAABXRUJQVlA4IG4AAADwAQCdASoQAAwAA4BaJagCdAYsi+uIpgAA9nIX/2een9Tv+p1ek6vNtvmXKnw4KrL48rT4miDIoe+eQSsfgCiDGqAV9li5MlI/B/DjE3S8rOQlkJZ3hpNeY2ydWBnGnBsAlbxaivwCkdS9peAAAA==',
  },
  bar: {
    src: '/brand/landing/foto/bar.webp',
    w: 1216, h: 896,
    alt: 'Barman míchá drink za tmavým barem, v pozadí podsvícené lahve',
    podnik: 'Koktejlový bar',
    blur: 'data:image/webp;base64,UklGRnIAAABXRUJQVlA4IGYAAAAwAgCdASoQAAwAA4BaJQBOj+AC4Xih3jirgAD+g+v0SrktLXYJ/gduiW4u6YFLXXYnADRf4vbKlZMHmRPimYUlcPNeLATm0qk+SC5SjCMZcXj758AUnatevxIvJ0y+aui+LnakAAA=',
  },
  pekarna: {
    src: '/brand/landing/foto/pekarna.webp',
    w: 896, h: 1216,
    alt: 'Pekař skládá bochníky kváskového chleba do dřevěné vitríny',
    podnik: 'Pekárna',
    blur: 'data:image/webp;base64,UklGRrwAAABXRUJQVlA4ILAAAACwBACdASoQABYAPu1iqU2ppaOiMAgBMB2JYwC/PagBni/R3tUVHgDZ1o2vgvEgAP5FMHSfF/bDOQPpySgQxfqacN6zKuQgWyFWzMQDtq4peKov6myL2ICjyyOrzrwREq9KEcEOYWNE4ITEIbJgbhzjjtrbqBWn4Tg/zZTDfTQnJhO+n9LPp+23LHL/Dy+OFe7gGCtR1E3BZN4UOlEsg81aHQFh+7YdNvxS6NrDAVIAAA==',
  },
  tym: {
    src: '/brand/landing/foto/tym.webp',
    w: 1344, h: 768,
    alt: 'Čtyři lidé v zástěrách se domlouvají u konce baru před otevřením',
    podnik: 'Tým před otevřením',
    blur: 'data:image/webp;base64,UklGRmoAAABXRUJQVlA4IF4AAAAQAgCdASoQAAkAA4BaJZQCdAEC2NUN1tZkAP3CEXvoNLh2T9ClIjimSsiOa0/4zw1859Adfpza5nsj3xHkwJTFvMdP/o1FCUUPMcgbodXuyeniRZ1nxGZGjEplgAAA',
  },
  tablet: {
    src: '/brand/landing/foto/tablet.webp',
    w: 1216, h: 896,
    alt: 'Tablet ve stojánku na dubovém baru vedle mlýnku na kávu',
    podnik: 'Tablet za barem',
    blur: 'data:image/webp;base64,UklGRm4AAABXRUJQVlA4IGIAAAAwAgCdASoQAAwAA4BaJaACsAEWXUmOHCCkyAD+9J8qPhz3Dr8Qh4XmVdrS9YAV12xGPKAwf2fi+DNyjv1k0wSErrgO0xD6qv+69KBEfGWLfjJ4FWNVzD98ctX+EhQCDtnAAA==',
  },
  host: {
    src: '/brand/landing/foto/host.webp',
    w: 896, h: 1216,
    alt: 'Host u mramorového stolku drží telefon nad kartičkou s QR kódem',
    podnik: 'Host u stolu',
    blur: 'data:image/webp;base64,UklGRqAAAABXRUJQVlA4IJQAAAAwBACdASoQABYAPu1iqU2ppaOiMAgBMB2JQBdmUABbdi6Zp+5a3iGZEgAA+n/lKrXUNDcSaNIa/nEwf/zfSxuzvILEOtshf9PRjYIdenX5oAft4erDzbW/+IV/cytPtVdbetfOPHpJ8avf9Ud3IGj6cOifNy2oEC2OZOt6xfv9bUbw9HfnCyxfnOd2lZgqPPueAAAA',
  },
} satisfies Record<string, Fotka>;

export type FotoId = keyof typeof FOTO;

/** Pořadí pásu podniků — kavárnou začíná, tabletem nekončí. */
export const PAS: FotoId[] = ['kavarna', 'pekarna', 'kuchyn', 'bar', 'barista', 'tym', 'host', 'tablet'];
