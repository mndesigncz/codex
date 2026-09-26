// Widgety oblasti „Tým" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/tym.tsx. Soubor patří balíku B2; převedeno z katalogu
// widgetů jednorázovým skriptem (spec §2.2). V kole 69 jsou hotové všechny widgety oblasti.
//
// Ikony (kolo 69): katalog dal celé oblasti `users`, jenže na stránce Tým má `users` nástroj (Lidé
// v podniku) a tři widgety výchozího rozložení by se opakovaly (AK-19). Pozvánky mají `mail`, Role
// `key`, Chybí sazba `tag` (cenovka = sazba; `coins` mají na Docházce Mzdy za období, se kterými
// se Chybí sazba potkává) a Profil člena `user`.
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/teams → members[{name,avatar,role_nazev,job_title,aktivni_jinde}]
  {
    id: 'tym.clenove',
    oblast: 'tym',
    nazev: 'Tým',
    popis: 'Kolik je v týmu lidí a kdo má jakou roli.',
    ikona: 'users',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.tym'],
    opravneni: { vse: ['tym.zobrazit'], nektere: [], pole: { profil: 'tym.profil', kontakty: 'tym.kontakty' } },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/teams → team.join_code (jen s tym.pozvat); GET /api/invitations →
  // [{email,status,created_at,role}]
  {
    id: 'tym.pozvanky',
    oblast: 'tym',
    nazev: 'Pozvánky',
    popis: 'Kód pro připojení a odeslané pozvánky, které ještě nikdo nepřijal.',
    ikona: 'mail',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.tym'],
    opravneni: { vse: ['tym.pozvat'], nektere: [] },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/roles → system[{nazev,pocet}], vlastni[{nazev,pocet}]
  {
    id: 'tym.role',
    oblast: 'tym',
    nazev: 'Role v podniku',
    popis: 'Kolik lidí má kterou roli (systémové i vlastní).',
    ikona: 'key',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.tym'],
    opravneni: { vse: [], nektere: ['tym.zobrazit', 'tym.role_prirazovat', 'tym.role_spravovat'] },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/teams → members[{name,hourly_rate}] (sazby jen s finance.mzdy)
  {
    id: 'tym.bez_sazby',
    oblast: 'tym',
    nazev: 'Chybí sazba',
    popis: 'Kdo nemá nastavenou hodinovou sazbu — jeho mzdy se nikde nespočítají.',
    ikona: 'tag',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.dochazka', 'vedeni.tym'],
    opravneni: { vse: ['finance.mzdy'], nektere: [], pole: { 'akce:nastavit_sazbu': 'finance.sazby_upravit' } },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/employees/{id}
  {
    id: 'tym.profil_clena',
    oblast: 'tym',
    nazev: 'Profil člena',
    popis: 'Jeden člověk: body, úroveň, směny, hodiny, dochvilnost (sazba a hodnocení podle oprávnění).',
    ikona: 'user',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: [],
    opravneni: {
      vse: ['tym.profil'],
      nektere: [],
      pole: { sazba: 'finance.mzdy', hodnoceni: 'hodnoceni.zobrazit', kontakty: 'tym.kontakty' },
    },
    tarif: 'zdarma',
    nastaveni: [{ klic: 'clen', nazev: 'Člen', typ: 'zdroj', zdroj: 'clenove', vychozi: null }],
    stav: 'hotovo',
  },
];
