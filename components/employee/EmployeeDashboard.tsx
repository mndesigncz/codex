'use client';

// Domů zaměstnance (kolo 68, spec §5.4, §6.1 krok C) — jen plocha s widgety.
//
// Objednávky od stolu, výroba, píchačky, nástěnka, nejbližší směna a další
// bloky jsou widgety v components/widgety/oblasti/*. Každý se ptá jen na
// svoje data a až po načtení oprávnění, místo devíti dotazů najednou při
// každém otevření. „Upravit" se ukáže jen tomu, kdo si smí plochu upravit
// (rozhoduje <PlochaWidgetu> podle zámku a role).
//
// Navigaci z widgetů dodává NavigaceKontext v EmployeeLayout.

import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useHlavickaPrehledu } from '../useHlavickaPrehledu';

interface Props {
  user: { name?: string | null };
}

export default function EmployeeDashboard({ user }: Props) {
  const { title, subtitle } = useHlavickaPrehledu(user.name);
  return <PlochaWidgetu stranka="zamestnanec.domu" hlavicka={{ title, subtitle }} />;
}
