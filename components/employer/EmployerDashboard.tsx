'use client';

// Přehled vedení (kolo 68, spec §5.4, §6.1 krok C) — jen plocha s widgety.
//
// Dřív tu bylo 650 řádků: dvanáct bloků psaných ručně, vlastní načítání
// všeho najednou, editor se šipkami ▲▼ a rozložení společné pro celé vedení
// podniku, které se po 403 potichu vrátilo (nález N6). Každý blok je teď
// widget v components/widgety/oblasti/* s vlastním dotazem za vlastním
// oprávněním; pořadí, velikosti a úpravy (podržení, vlnění, galerie) řeší
// <PlochaWidgetu> a osobní rozložení z /api/rozlozeni.
//
// Navigaci z widgetů (onNavigate, smiPohled) dodává NavigaceKontext
// v EmployerLayout, takže plocha sama žádné props navigace nepotřebuje.

import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useHlavickaPrehledu } from '../useHlavickaPrehledu';

interface Props {
  user: { name?: string | null };
}

export default function EmployerDashboard({ user }: Props) {
  const { title, subtitle } = useHlavickaPrehledu(user.name);
  // Vpravo jen „Upravit" (přidá ho plocha sama) — v klidu na přehledu žádná
  // limetka (DP §1.5), limetkou je až „Hotovo" v režimu úprav.
  return <PlochaWidgetu stranka="vedeni.prehled" hlavicka={{ title, subtitle }} />;
}
