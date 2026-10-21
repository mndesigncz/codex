// Retence osobních údajů (GDPR čl. 5 odst. 1 písm. e — omezení uložení): jak dlouho co držíme
// a kdy se to maže. VŠECHNY lhůty jsou tady, na jednom místě; provedení je v lib/retenceDb.ts
// a cron v app/api/retence (vercel.json).
//
// ⚠ Lhůty jsou návrh k odsouhlasení advokátem (viz hlášení balíku G). Dokud se neschválí, běží
// retence JEN JAKO NÁHLED: bez `RETENCE_ZAPNUTA=1` cron nic nemaže ani neposílá, jen spočítá,
// co by udělal, a zapíše to do tabulky `retence_behy` (správa platformy → Retence).
//
// Čisté, bez databáze (testy: scripts/testy/k90-gdpr-retence.ts). Podpis odkazu „Ponechat účet“
// potřebuje node:crypto, proto se tenhle modul nesmí importovat z prohlížeče.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { podpisoveTajemstvi } from './tajemstvi.ts';

export const RETENCE = {
  /** Host bez aktivity (návštěva, objednávka, rezervace, body, otevření aplikace) tak dlouho se anonymizuje. */
  neaktivniHostMesicu: 24,
  /** Kolik dní před anonymizací dostane host e-mail s možností účet ponechat. */
  upozorneniPredemDni: 30,
  /** Protokol změn podniku (audit_log) starší než tolik let se maže. */
  auditLogLet: 3,
  /** Oznámení v aplikaci (notifications) starší než tolik dní se mažou. */
  oznameniDni: 365,
  /** Podnik se zrušeným předplatným a bez aktivity se smaže tolik dní po konci předplatného (nebo po poslední aktivitě). */
  zrusenyPodnikDni: 90,
  /** První e-mail vlastníkovi a správcům předplatného před smazáním podniku (dny předem). */
  podnikUpozorneniDni: 30,
  /** Druhý e-mail před smazáním podniku (dny předem). */
  podnikDruheUpozorneniDni: 7,
  /** Strop na jeden běh cronu (ať se vejde do časového limitu funkce); zbytek dojede příště. */
  davkaHostu: 200,
  davkaPodniku: 5,
  /** Kolika podnikům jeden běh nejvýš pošle upozornění. */
  davkaUpozorneniPodniku: 50,
  davkaRadku: 5000,
} as const;

/** Ostré mazání jen s výslovným `RETENCE_ZAPNUTA=1`. Cokoli jiného (i „true“) = náhled. */
export function retenceZapnuta(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.RETENCE_ZAPNUTA ?? '').trim() === '1';
}

const DEN = 24 * 60 * 60 * 1000;

/** Datum o `mesicu` měsíců dřív (kalendářně, 31. 3. − 1 měsíc = 28./29. 2.). */
export function minusMesice(d: Date, mesicu: number): Date {
  const x = new Date(d.getTime());
  const den = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() - mesicu);
  const posledni = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(den, posledni));
  return x;
}

export interface HraniceRetence {
  /** Host s poslední aktivitou PŘED tímto okamžikem je neaktivní 24 měsíců (smí se anonymizovat). */
  neaktivniPred: Date;
  /** Host s poslední aktivitou před tímto okamžikem má dostat upozornění (24 měsíců − 30 dní). */
  upozornitPred: Date;
  auditPred: Date;
  oznameniPred: Date;
  /** Podnik, jehož předplatné skončilo (a poslední aktivita proběhla) před tímto okamžikem, je po celé lhůtě. */
  podnikKonecPred: Date;
  /** Podnik s koncem i poslední aktivitou před tímto okamžikem má dostat první upozornění (90 − 30 dní). */
  podnikUpozornitPred: Date;
}

export function hraniceRetence(ted: Date, r: typeof RETENCE = RETENCE): HraniceRetence {
  const neaktivniPred = minusMesice(ted, r.neaktivniHostMesicu);
  return {
    neaktivniPred,
    upozornitPred: new Date(neaktivniPred.getTime() + r.upozorneniPredemDni * DEN),
    auditPred: minusMesice(ted, r.auditLogLet * 12),
    oznameniPred: new Date(ted.getTime() - r.oznameniDni * DEN),
    podnikKonecPred: new Date(ted.getTime() - r.zrusenyPodnikDni * DEN),
    podnikUpozornitPred: new Date(ted.getTime() - (r.zrusenyPodnikDni - r.podnikUpozorneniDni) * DEN),
  };
}

export type KrokHosta = 'nic' | 'upozornit' | 'cekat' | 'anonymizovat';

/**
 * Co s neaktivním hostem. Upozornění platí jen pro neaktivitu, která trvá: když host po upozornění
 * cokoli udělal (nebo klikl na „Ponechat účet“), upozornění propadá a počítá se znovu. Anonymizovat
 * jde až `upozorneniPredemDni` po upozornění a zároveň po celé lhůtě neaktivity.
 */
export function rozhodniHosta(v: { posledniAktivita: Date | null; upozornenoAt: Date | null; ted: Date }, r: typeof RETENCE = RETENCE): KrokHosta {
  const h = hraniceRetence(v.ted, r);
  const akt = v.posledniAktivita;
  if (!akt || akt.getTime() >= h.upozornitPred.getTime()) return 'nic';
  const platneUpozorneni = v.upozornenoAt && v.upozornenoAt.getTime() >= akt.getTime() ? v.upozornenoAt : null;
  if (!platneUpozorneni) return 'upozornit';
  const uplynulo = v.ted.getTime() - platneUpozorneni.getTime() >= r.upozorneniPredemDni * DEN;
  return uplynulo && akt.getTime() < h.neaktivniPred.getTime() ? 'anonymizovat' : 'cekat';
}

/** Den anonymizace pro text upozornění: upozornění + lhůta. */
export function denAnonymizace(upozorneno: Date, r: typeof RETENCE = RETENCE): Date {
  return new Date(upozorneno.getTime() + r.upozorneniPredemDni * DEN);
}

// ---- Zrušený podnik bez aktivity ----------------------------------------------------------

export type KrokPodniku = 'nic' | 'upozornit30' | 'upozornit7' | 'cekat' | 'smazat';

const pozdejsi = (...d: (Date | null | undefined)[]): Date | null =>
  d.reduce<Date | null>((a, b) => (b && (!a || b.getTime() > a.getTime()) ? b : a), null);

/**
 * Co se zrušeným podnikem (předplatné nebo zkouška skončila a nikdo ho neobnovil).
 *
 * Lhůta 90 dní běží od pozdějšího z: konec předplatného, poslední aktivita kohokoli z podniku
 * (přihlášení nebo otevření aplikace, zprávy, úkoly, směny, docházka, uzávěrky, změny…).
 * Smazat jde jen když:
 *  - první upozornění odešlo po poslední aktivitě a aspoň 30 dní předem,
 *  - druhé upozornění odešlo po prvním a aspoň 7 dní předem,
 *  - a celá lhůta neaktivity uplynula.
 * Jakákoli aktivita po upozornění ho zneplatní (počítá se znovu od začátku). Bez konce
 * předplatného v datech se nic nedělá — nemazat naslepo.
 */
export function rozhodniPodnik(
  v: { konec: Date | null; posledniAktivita: Date | null; upozorneno30At: Date | null; upozorneno7At: Date | null; ted: Date },
  r: typeof RETENCE = RETENCE,
): { krok: KrokPodniku; smazatOd: Date | null } {
  if (!v.konec) return { krok: 'nic', smazatOd: null };
  const od = pozdejsi(v.konec, v.posledniAktivita)!;
  const lhuta = new Date(od.getTime() + r.zrusenyPodnikDni * DEN);
  const ted = v.ted.getTime();
  if (ted < lhuta.getTime() - r.podnikUpozorneniDni * DEN) return { krok: 'nic', smazatOd: null };
  const u30 = v.upozorneno30At && v.upozorneno30At.getTime() >= od.getTime() ? v.upozorneno30At : null;
  if (!u30) return { krok: 'upozornit30', smazatOd: pozdejsi(lhuta, new Date(ted + r.podnikUpozorneniDni * DEN)) };
  const zaklad = pozdejsi(lhuta, new Date(u30.getTime() + r.podnikUpozorneniDni * DEN))!;
  const u7 = v.upozorneno7At && v.upozorneno7At.getTime() >= u30.getTime() ? v.upozorneno7At : null;
  if (!u7) {
    return ted >= zaklad.getTime() - r.podnikDruheUpozorneniDni * DEN
      ? { krok: 'upozornit7', smazatOd: pozdejsi(zaklad, new Date(ted + r.podnikDruheUpozorneniDni * DEN)) }
      : { krok: 'cekat', smazatOd: zaklad };
  }
  const smazatOd = pozdejsi(zaklad, new Date(u7.getTime() + r.podnikDruheUpozorneniDni * DEN))!;
  return { krok: ted >= smazatOd.getTime() ? 'smazat' : 'cekat', smazatOd };
}

/**
 * E-mail vlastníkovi a správcům předplatného před smazáním neaktivního zrušeného podniku
 * (30 a 7 dní předem). `datum` je už naformátovaný den smazání. Patičku s provozovatelem
 * přidá lib/email.ts (sPatickouProvozovatele) ke každému e-mailu sama.
 */
export function emailUpozorneniPodniku(v: { podnik: string; jmeno: string; datum: string; druhe: boolean; odkazPrihlaseni: string; odkazData: string }, r: typeof RETENCE = RETENCE): { subject: string; html: string } {
  const p = v.podnik || 'podnik';
  return {
    subject: v.druhe ? `Za ${r.podnikDruheUpozorneniDni} dní smažeme podnik ${p}` : `Podnik ${p} nikdo nepoužívá — ${v.datum} ho smažeme`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:28px;background:#F1F4EC;color:#16181A;border-radius:20px;">
        <h1 style="font-size:20px;margin:0 0 8px;">${v.druhe ? 'Poslední upozornění před smazáním' : 'Chcete si podnik ponechat?'}</h1>
        <p style="color:#5c6353;font-size:14px;">Dobrý den${v.jmeno ? `, ${esc(v.jmeno)}` : ''}. Předplatné podniku ${esc(p)} v Manageru skončilo a od té doby se do podniku nikdo nepřihlásil ani v něm nic nezapsal. Podle obchodních podmínek (čl. 19) podnik, který nikdo nepoužívá, ${r.zrusenyPodnikDni} dní po skončení předplatného smažeme i se všemi daty.</p>
        <p style="color:#16181A;font-size:15px;font-weight:bold;">Podnik smažeme nejdříve ${esc(v.datum)}.</p>
        <p style="color:#5c6353;font-size:14px;">Chcete-li podnik zachovat, stačí se do Manageru přihlásit (nebo ať aplikaci otevře kdokoli z týmu). Smazání se tím zruší. Data si předem můžete stáhnout v Nastavení → Data a soukromí (záloha ve formátu JSON); další data vám na požádání pošle podpora.</p>
        <a href="${esc(v.odkazPrihlaseni)}" style="display:inline-block;margin-top:8px;background:#C8F542;color:#16181A;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold;">Přihlásit se</a>
        <p style="color:#5c6353;font-size:13px;margin-top:16px;"><a href="${esc(v.odkazData)}" style="color:#16181A;">Stáhnout data podniku</a></p>
        <p style="color:#8a917f;font-size:12px;margin-top:22px;">Pokud tlačítko nefunguje, otevřete: ${esc(v.odkazPrihlaseni)}</p>
      </div>`,
  };
}

// ---- Odkaz „Ponechat účet“ ----------------------------------------------------------------

export function tokenPonechani(userId: number, env: Record<string, string | undefined> = process.env): string {
  const id = String(Math.trunc(userId));
  return `${id}.${createHmac('sha256', podpisoveTajemstvi(env)).update(`retence-ponechat:${id}`).digest('hex').slice(0, 24)}`;
}

export function overTokenPonechani(token: unknown, env: Record<string, string | undefined> = process.env): number | null {
  const m = /^(\d{1,9})\.([0-9a-f]{24})$/.exec(String(token ?? ''));
  if (!m) return null;
  const a = Buffer.from(tokenPonechani(Number(m[1]), env).split('.')[1]), b = Buffer.from(m[2]);
  return a.length === b.length && timingSafeEqual(a, b) ? Number(m[1]) : null;
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** E-mail hostovi 30 dní před anonymizací. `datum` je už naformátovaný den (např. 14. 11. 2026). */
export function emailUpozorneni(v: { jmeno: string; datum: string; odkaz: string }): { subject: string; html: string } {
  return {
    subject: 'Váš účet Managero client dlouho nikdo nepoužil',
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:28px;background:#F1F4EC;color:#16181A;border-radius:20px;">
        <h1 style="font-size:20px;margin:0 0 8px;">Chcete si účet ponechat?</h1>
        <p style="color:#5c6353;font-size:14px;">Dobrý den${v.jmeno ? `, ${esc(v.jmeno)}` : ''}. Váš účet v Managero client už dva roky nikdo nepoužil. Osobní údaje zbytečně nedržíme, a proto účet ${esc(v.datum)} anonymizujeme: smaže se jméno, e-mail, telefon, kartička, body, razítka a kupony.</p>
        <p style="color:#5c6353;font-size:14px;">Pokud si ho chcete ponechat, stačí kliknout na tlačítko. Účet zůstane i tehdy, když do té doby navštívíte podnik s kartičkou nebo otevřete aplikaci.</p>
        <a href="${esc(v.odkaz)}" style="display:inline-block;margin-top:8px;background:#C8F542;color:#16181A;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold;">Ponechat účet</a>
        <p style="color:#8a917f;font-size:12px;margin-top:22px;">Pokud tlačítko nefunguje, otevřete: ${esc(v.odkaz)}</p>
      </div>`,
  };
}

/** Souhrn jednoho běhu (náhled i ostrý) — ukládá se do retence_behy a ukazuje ve správě platformy. Jen počty a id, žádné osobní údaje. */
export interface SouhrnRetence {
  rezim: 'nahled' | 'ostry';
  hranice: Record<keyof HraniceRetence, string>;
  hoste: { poLhute: number; upozornit: number; anonymizovat: number; cekat: number; upozorneno: number; anonymizovano: number; chyb: number; ukazkaId: number[] };
  auditLog: { kSmazani: number; smazano: number };
  oznameni: { kSmazani: number; smazano: number };
  podniky: { kSmazani: number; smazano: number; ukazkaId: number[]; upozornit30?: number; upozornit7?: number; cekat?: number; upozorneno?: number; chyb?: number };
  chyby: string[];
}

export function prazdnySouhrn(rezim: 'nahled' | 'ostry', h: HraniceRetence): SouhrnRetence {
  return {
    rezim,
    hranice: Object.fromEntries(Object.entries(h).map(([k, d]) => [k, (d as Date).toISOString()])) as Record<keyof HraniceRetence, string>,
    hoste: { poLhute: 0, upozornit: 0, anonymizovat: 0, cekat: 0, upozorneno: 0, anonymizovano: 0, chyb: 0, ukazkaId: [] },
    auditLog: { kSmazani: 0, smazano: 0 },
    oznameni: { kSmazani: 0, smazano: 0 },
    podniky: { kSmazani: 0, smazano: 0, ukazkaId: [], upozornit30: 0, upozornit7: 0, cekat: 0, upozorneno: 0, chyb: 0 },
    chyby: [],
  };
}
