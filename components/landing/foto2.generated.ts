// Vygeneroval scripts/landing-foto.mjs ze souborů v public/brand, neupravovat ručně.
import type { Fotka } from './foto';

export const FOTO_V2 = {
  'v2-majitel': {
    src: '/brand/landing/v2/majitel.webp',
    w: 1400, h: 830,
    alt: "Majitelka kavárny se u dřevěného baru usmívá nad tabletem, vedle stojí limetkový hrnek",
    podnik: "Majitelka",
    blur: 'data:image/webp;base64,UklGRloAAABXRUJQVlA4IE4AAADQAQCdASoQAAkABABoJQBWAMXhuXrHcAD+tqFUZLs3XpMS9LnLQXxSFH3Yab3J7u7mkI5KIvwIcnDqVZzYelvl0jTKIEsMbmmPvk0AAAA=',
  },
  'v2-tym': {
    src: '/brand/landing/v2/tym.webp',
    w: 1400, h: 830,
    alt: "Tři lidé v zástěrách se v kavárně smějí nad telefonem, který jedna z nich drží",
    podnik: "Tým",
    blur: 'data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAADwAQCdASoQAAkABABoJQBOgO4AvClBUgAA/rZNdwjiIBLwG6HzFh5gHEREzz/YvXqwX2WCX2UQPaKs/LDM8iK/Mx03SDmdoPAI0kls6IiadJCeOAAAAA==',
  },
  'v2-sklad': {
    src: '/brand/landing/v2/sklad.webp',
    w: 1400, h: 830,
    alt: "Zaměstnankyně ve skladu mezi regály s mlékem, kávou a sirupy kontroluje zásoby na tabletu",
    podnik: "Sklad",
    blur: 'data:image/webp;base64,UklGRlQAAABXRUJQVlA4IEgAAADwAQCdASoQAAkABABoJZwAArIqFnPtJAAA/uoQYUQfTa7xizPpVCtAqtT381jJ+REXEmZDsQpIMeJQ6EcyVhSAOfFJw68CAAA=',
  },
  'v2-porada': {
    src: '/brand/landing/v2/porada.webp',
    w: 1400, h: 830,
    alt: "Dva zaměstnanci u kulatého stolku v kavárně sedí nad tabletem, jedna z nich na něj ukazuje",
    podnik: "Porada",
    blur: 'data:image/webp;base64,UklGRloAAABXRUJQVlA4IE4AAADQAQCdASoQAAkABABoJQAAU7Z+W8Q27AD+m5vDnvXFd9O/lxIeX0oQLl09BmHeJ8ePB27Eyi0knKQrrYtGD0eRXR+Hbv7czf/3N1cQAAA=',
  },
  'v2-uzaverka': {
    src: '/brand/landing/v2/uzaverka.webp',
    w: 1400, h: 830,
    alt: "Obsluha večer u baru počítá bankovky a mince, vedle stojí tablet ve stojánku",
    podnik: "Uzávěrka",
    blur: 'data:image/webp;base64,UklGRkgAAABXRUJQVlA4IDwAAACwAQCdASoQAAkABABoJQBOgBwva0YIAP7tBSp0TsMHcgrWgVupwhhALP0iX4PH6/+xSjEfEaiX3wmxQAA=',
  },
  'v2-telefon': {
    src: '/brand/landing/v2/telefon.webp',
    w: 800, h: 1430,
    alt: "Ruka drží telefon s aplikací nad stolem v kavárně, vedle šálek kávy",
    podnik: "Telefon",
    blur: 'data:image/webp;base64,UklGRrwAAABXRUJQVlA4ILAAAAAwBACdASoQAB0APxFysFAsJqSisAgBgCIJZQDCgYy8lM7Lf62RMQu94mAA/rMxulaH0JT4nt3TacMBrUFcqiB4twmSuDPDFw9Z4698HdYDlQ11nzM/2rOsV5rMe/RJt0aJp+pq9Ktm9Mz/vBhu+9E9FnpkutK9ihJl2tHLMXyTefFJCiwQfu2l+2PuI8N1KExITL7hfsCxCj3R4eNrTP3dKsdjRaNOSwblMs6yJAAAAA==',
  },
} satisfies Record<string, Fotka>;

/** Typy podniků z průvodce prvním nastavením (výběr v kroku „Založ podnik"). */
export const FOTO_PODNIKY = {
  'podnik-kavarna': {
    src: '/brand/onboarding/kavarna.webp',
    w: 960, h: 723,
    alt: "",
    podnik: "Kavárna",
    blur: 'data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAADwAQCdASoQAAwABABoJYgCdAC7GWWlsUAA/thKOygpHtRSHIrlRLnqr1+5JDNjEeJZ7Swzjyhz4j42HD+CEsPrp+lbVzDKbAndEOfhwQadtejboxpMAA==',
  },
  'podnik-restaurace': {
    src: '/brand/onboarding/restaurace.webp',
    w: 960, h: 723,
    alt: "",
    podnik: "Restaurace",
    blur: 'data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAAAwAgCdASoQAAwABABoJQBOgCPqU9VU1fvSAAD876MFq6rlwdqfSaJBS8sHtne/Mw3onlIw5tncLzzwhXlKLWsLPv6h7F4FphjQ73Zxbj+jqsarmV0AAA==',
  },
  'podnik-bar': {
    src: '/brand/onboarding/bar.webp',
    w: 960, h: 723,
    alt: "",
    podnik: "Bar",
    blur: 'data:image/webp;base64,UklGRmAAAABXRUJQVlA4IFQAAADwAQCdASoQAAwABABoJQBOgB+L787cj9gA/u7wPZrsq1BiopwczqiiABdrWzwaNqvjAo98yGdwpB48z25vw1IZxTRqmuK2GSS/iFv1jrIZB4oaQAA=',
  },
  'podnik-pekarna': {
    src: '/brand/onboarding/pekarna.webp',
    w: 960, h: 723,
    alt: "",
    podnik: "Pekárna",
    blur: 'data:image/webp;base64,UklGRmQAAABXRUJQVlA4IFgAAADwAQCdASoQAAwABABoJQBOgCB/4gAwwIAA/rf9n2g8cDS0GOVPURKCSTMS4vc1tgrdcUmE0VrgTGA9adI9n97TSIImiRsEPVtRpXhRuEK8nnQFKktpUAAA',
  },
  'podnik-caj': {
    src: '/brand/onboarding/caj.webp',
    w: 960, h: 723,
    alt: "",
    podnik: "Čaj a nápoje",
    blur: 'data:image/webp;base64,UklGRloAAABXRUJQVlA4IE4AAADwAQCdASoQAAwABABoJZQC7ADO3WIjSAAA/mwU9nEzKrnuFwgFmqb8kaUC/j1rR8KX/DEZBxbanDL+Pe9bdpb0pJ+6mybdLpOr1lt6AAA=',
  },
  'podnik-foodtruck': {
    src: '/brand/onboarding/foodtruck.webp',
    w: 960, h: 723,
    alt: "",
    podnik: "Food truck",
    blur: 'data:image/webp;base64,UklGRmgAAABXRUJQVlA4IFwAAAAQAgCdASoQAAwABABoJZgCdADQ9ZHi6LoAAP7pqw6lw+Do4wLMjWs0UU9kpUUxQjUZoZzyUCrHcAwtWQnpo0JqYU2tD0mIBvzTl9k7WmxQ3fgLKzm8nu0wq8UAAA==',
  },
} satisfies Record<string, Fotka>;
