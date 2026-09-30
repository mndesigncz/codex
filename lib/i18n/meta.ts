// Krátké texty do <head> a manifestu, které nejdou přes slovník sekce:
// generateMetadata a manifest.ts běží mimo komponenty a potřebují jen pár vět.
//
// Čeština je v lib/web.ts (SITE_POPIS) a v manifestu; tady jsou ostatní jazyky.
// Překlad je strojový (viz `_meta.json`); věta je záměrně obecná, bez slibu,
// který by se musel právně ověřovat.

import type { Jazyk } from './config.ts';

/** Popis aplikace do <meta name="description"> v jazycích mimo češtinu. */
export const POPIS_APLIKACE: Record<Exclude<Jazyk, 'cs'>, string> = {
  en: 'Run a small business in one app: shift rota and attendance, cash closing, stock and recipes, tasks, chat and a loyalty programme for guests.',
  de: 'Einen kleinen Betrieb in einer App führen: Dienstplan und Zeiterfassung, Kassenabschluss, Lager und Rezepte, Aufgaben, Chat und ein Treueprogramm für Gäste.',
  sk: 'Správa malého podniku v jednej aplikácii: rozvrh zmien a dochádzka, uzávierky, sklad a receptúry, úlohy, chat aj vernostný program pre hostí.',
  pl: 'Prowadzenie małego lokalu w jednej aplikacji: grafik zmian i ewidencja czasu, zamknięcie kasy, magazyn i receptury, zadania, czat oraz program lojalnościowy dla gości.',
};

/** Popis do manifestu PWA (krátký). Čeština je výchozí hodnota manifestu. */
export const POPIS_MANIFESTU: Record<Jazyk, string> = {
  cs: 'Systém pro správu podniku',
  en: 'Business management system',
  de: 'System zur Betriebsverwaltung',
  sk: 'Systém na správu podniku',
  pl: 'System zarządzania lokalem',
};
