// Moderace uživatelského obsahu (Apple 1.2, Google Play UGC): nahlášení,
// blokace uživatele, skrytí blokovaných. Čisté, bez databáze
// (testy: scripts/testy/k77-ucet.ts). Jediný import: čistý lib/firma.ts (e-mail provozovatele).
//
// Kde uživatelský obsah vzniká: chat (zprávy, přílohy) a nápady týmu. Je to
// uzavřená pracovní skupina jednoho podniku (členy přidává vedení), ne veřejná
// síť, takže stačí: podmínky se zákazem nevhodného obsahu, nahlášení, blokace,
// smazání zprávy a pohled vedení na nahlášené. Hostovský obsah (poznámka
// k rezervaci, hodnocení) vidí jen podnik, žádný host-host obsah není.
// Nové nahlášení jde navíc provozovateli platformy (eskalace níž, /admin/nahlaseni).

import { firma } from './firma.ts';

export type DruhObsahu = 'zprava' | 'napad';

export const DUVODY: { id: string; nazev: string }[] = [
  { id: 'urazlive', nazev: 'Urážlivé nebo nenávistné' },
  { id: 'obtezujici', nazev: 'Obtěžování' },
  { id: 'spam', nazev: 'Spam nebo reklama' },
  { id: 'nevhodne', nazev: 'Nevhodný obsah' },
  { id: 'jine', nazev: 'Jiný důvod' },
];

export const nazevDuvodu = (id: string): string => DUVODY.find(d => d.id === id)?.nazev ?? 'Jiný důvod';

export type VstupNahlaseni =
  | { ok: true; kind: DruhObsahu; refId: number; reason: string; detail: string | null }
  | { ok: false; error: string };

/** Zkontroluje tělo požadavku na nahlášení; co nesedí, vrátí česky. */
export function platneNahlaseni(b: unknown): VstupNahlaseni {
  const x = (b ?? {}) as Record<string, unknown>;
  const kind = x.kind === 'zprava' || x.kind === 'napad' ? x.kind : null;
  if (!kind) return { ok: false, error: 'Neznámý druh obsahu.' };
  const refId = Number(x.refId);
  if (!Number.isInteger(refId) || refId <= 0) return { ok: false, error: 'Neplatný obsah.' };
  const reason = String(x.reason ?? '');
  if (!DUVODY.some(d => d.id === reason)) return { ok: false, error: 'Vyberte důvod nahlášení.' };
  const detail = typeof x.detail === 'string' && x.detail.trim() ? x.detail.trim().slice(0, 500) : null;
  return { ok: true, kind, refId, reason, detail };
}

/** Zpráva nebo nápad tak, jak se uloží do nahlášení: zkrácený opis, ať vedení vidí, co se hlásí, i po smazání. */
export function opisObsahu(text: string | null | undefined, priloha?: string | null): string {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (t) return t.length > 300 ? `${t.slice(0, 297)}…` : t;
  return priloha ? '[příloha]' : '';
}

export type AkceNahlaseni = 'odstranit' | 'vyreseno' | 'zamitnout';
export type StavNahlaseni = 'open' | 'removed' | 'resolved' | 'dismissed';

export function stavPoAkci(akce: unknown): StavNahlaseni | null {
  if (akce === 'odstranit') return 'removed';
  if (akce === 'vyreseno') return 'resolved';
  if (akce === 'zamitnout') return 'dismissed';
  return null;
}

/** Zprávy zablokovaných autorů se nezobrazí; vlastní zprávy se nikdy neskrývají. */
export function vyfiltrujZablokovane<T extends { senderId: number }>(zpravy: readonly T[], zablokovani: ReadonlySet<number>, ja?: number): T[] {
  if (zablokovani.size === 0) return [...zpravy];
  return zpravy.filter(z => z.senderId === ja || !zablokovani.has(z.senderId));
}

/** Kdo smí smazat zprávu: autor, nebo ten, kdo smí odebírat členy (moderace). */
export function smiSmazatZpravu(v: { meId: number; autorId: number; moderator: boolean }): boolean {
  return v.meId === v.autorId || v.moderator;
}

/** Blokovat jde jiného člověka, ne sebe. */
export function smiZablokovat(meId: number, cilId: number): boolean {
  return Number.isInteger(cilId) && cilId > 0 && cilId !== meId;
}

// ---- Eskalace na provozovatele platformy ------------------------------------------------
//
// Podmínky slibují, že hlášení vyřídíme do 24 hodin. Vedení podniku nahlášení dostane hned,
// jenže to je stejný podnik, jehož člen obsah napsal, a o víkendu nemusí nikdo reagovat.
// Proto jde každé nové nahlášení zároveň provozovateli (e-mail z prostředí) a správce platformy
// ho vidí ve správě (/admin/nahlaseni) se lhůtou; vyřídit ho tam může i on.

/** Lhůta na vyřízení nahlášení (podmínky, lib/pravni/texty.ts). */
export const LHUTA_NAHLASENI_HODIN = 24;

const JE_EMAIL = /^[^@\s{}<>,;]+@[^@\s{}<>,;]+\.[^@\s{}<>,;]+$/;

/**
 * Kam poslat upozornění provozovateli: `MODERACE_EMAIL`, jinak e-mail podpory provozovatele
 * z lib/firma.ts (výchozí podpora@managero.app, přebíjí ho `FIRMA_EMAIL_PODPORY`).
 * Dřív se četla jen proměnná `FIRMA_EMAIL_PODPORY` — od 2026-10-21 má firma.ts výchozí údaje
 * a proměnná není povinná, takže bez ní by nahlášení z chatu i oznámení podle DSA (čl. 16)
 * provozovateli potichu nechodila. Zástupné pole (`{{EMAIL_PODPORY}}`) ani nesmysl se nepoužije.
 */
export function kontaktModerace(env: Record<string, string | undefined>): string | null {
  for (const kandidat of [env.MODERACE_EMAIL, firma(env).emailPodpory]) {
    const v = String(kandidat ?? '').trim();
    if (JE_EMAIL.test(v)) return v;
  }
  return null;
}

export type StavLhuty = { stav: 'vyrizeno' } | { stav: 'v_lhute'; zbyvaHodin: number } | { stav: 'po_lhute'; poHodin: number };

/**
 * Kde je nahlášení vůči lhůtě. `stariHodin` počítá databáze (`NOW() - created_at`), ať se do toho
 * nepletou časové zóny sloupce bez zóny.
 */
export function stavLhuty(status: string, stariHodin: number | null): StavLhuty {
  if (status !== 'open') return { stav: 'vyrizeno' };
  const h = Number(stariHodin);
  if (!Number.isFinite(h)) return { stav: 'po_lhute', poHodin: 0 };
  const zbyva = LHUTA_NAHLASENI_HODIN - h;
  if (zbyva > 0) return { stav: 'v_lhute', zbyvaHodin: Math.max(1, Math.ceil(zbyva)) };
  return { stav: 'po_lhute', poHodin: Math.floor(-zbyva) };
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * E-mail provozovateli o novém nahlášení. Schválně BEZ obsahu zprávy a bez jmen: soukromá
 * zpráva nemá ležet v cizí schránce. Obsah (opis) uvidí správce po přihlášení ve správě.
 */
export function emailEskalace(v: { id: number; podnik: string; druh: DruhObsahu; duvod: string; odkaz: string }): { subject: string; html: string } {
  const co = v.druh === 'zprava' ? 'zpráva v chatu' : 'nápad';
  return {
    subject: `Nahlášený obsah #${v.id}: ${nazevDuvodu(v.duvod)} (${v.podnik})`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#F1F4EC;color:#16181A;border-radius:20px;">
        <h1 style="font-size:20px;margin:0 0 8px;">Nové nahlášení obsahu</h1>
        <p style="color:#5c6353;font-size:14px;margin:0 0 6px;">Podnik: <b>${esc(v.podnik)}</b></p>
        <p style="color:#5c6353;font-size:14px;margin:0 0 6px;">Co: ${esc(co)} · důvod: ${esc(nazevDuvodu(v.duvod))}</p>
        <p style="color:#5c6353;font-size:14px;">Slíbili jsme vyřízení do ${LHUTA_NAHLASENI_HODIN} hodin. Vedení podniku o nahlášení ví; když ho nevyřídí, vyřiď ho ve správě platformy.</p>
        <a href="${esc(v.odkaz)}" style="display:inline-block;margin-top:8px;background:#C8F542;color:#16181A;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold;">Otevřít nahlášení</a>
        <p style="color:#8a917f;font-size:12px;margin-top:22px;">Obsah zprávy v e-mailu schválně není. Uvidíš ho po přihlášení správce.</p>
      </div>`,
  };
}
