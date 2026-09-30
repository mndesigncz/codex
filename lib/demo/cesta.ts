// Rozpoznání trasy veřejné ukázky. Samostatný malý modul bez závislostí:
// importuje ho i kořenový provider (app/providers.tsx), který nesmí táhnout
// celý mock server jen kvůli jedné podmínce.

/** `/demo` a všechno pod ním; `/demonstrace` už ne. */
export function jeCestaDema(pathname: string | null | undefined): boolean {
  return pathname === '/demo' || (pathname?.startsWith('/demo/') ?? false);
}
