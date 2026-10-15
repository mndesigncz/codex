// Kam poslat člověka po přihlášení (spuštění, balík S).
//
// Odkaz na zálohu, pozvánka nebo upozornění z e-mailu otevřou stránku, která
// chce přihlášení. Dřív se po přihlášení skončilo vždy na úvodu a odkaz z
// e-mailu se musel otevřít znovu. Teď si přihlášení pamatuje `callbackUrl`
// (tvar, který posílá NextAuth) nebo `next` (tvar hostovské části).
//
// Pustí se jen cesta v téhle aplikaci. NextAuth sám posílá absolutní adresu
// (`http://host/employer`), ta projde jen se stejným původem; cizí doména,
// `//zly.cz`, `javascript:` a zpětná lomítka skončí na výchozí stránce.
// Návrat na samotné přihlášení nebo do /api/auth by byl kruh.

import { mistniCesta } from './bezpecnaUrl.ts';

const ZAKAZANE = /^\/(login|api\/auth)(\/|\?|#|$)/;

export function navratPoPrihlaseni(raw: unknown, puvod: string | null | undefined, vychozi = '/'): string {
  let s = String(raw ?? '').trim();
  if (!s || s.length > 2000) return vychozi;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    // Absolutní adresa: jen stejný původ (tak ji skládá NextAuth).
    let u: URL;
    try { u = new URL(s); } catch { return vychozi; }
    if (!puvod || u.origin !== puvod || !/^https?:$/.test(u.protocol)) return vychozi;
    s = `${u.pathname}${u.search}${u.hash}`;
  }
  const cesta = mistniCesta(s, '');
  if (!cesta || ZAKAZANE.test(cesta)) return vychozi;
  return cesta;
}

/** Odkaz na přihlášení, které po sobě vrátí na `cesta` (už ověřenou místní cestu). */
export function prihlaseniSNavratem(cesta: string, prihlaseni = '/login'): string {
  const c = navratPoPrihlaseni(cesta, null, '');
  return c && c !== '/' ? `${prihlaseni}?callbackUrl=${encodeURIComponent(c)}` : prihlaseni;
}
