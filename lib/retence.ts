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
  /** Podnik se zrušeným předplatným a bez aktivity se smaže tolik dní po konci předplatného. */
  zrusenyPodnikDni: 90,
  /** Strop na jeden běh cronu (ať se vejde do časového limitu funkce); zbytek dojede příště. */
  davkaHostu: 200,
  davkaPodniku: 5,
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
  /** Podnik, jehož předplatné skončilo před tímto okamžikem. */
  podnikKonecPred: Date;
}

export function hraniceRetence(ted: Date, r: typeof RETENCE = RETENCE): HraniceRetence {
  const neaktivniPred = minusMesice(ted, r.neaktivniHostMesicu);
  return {
    neaktivniPred,
    upozornitPred: new Date(neaktivniPred.getTime() + r.upozorneniPredemDni * DEN),
    auditPred: minusMesice(ted, r.auditLogLet * 12),
    oznameniPred: new Date(ted.getTime() - r.oznameniDni * DEN),
    podnikKonecPred: new Date(ted.getTime() - r.zrusenyPodnikDni * DEN),
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
  podniky: { kSmazani: number; smazano: number; ukazkaId: number[] };
  chyby: string[];
}

export function prazdnySouhrn(rezim: 'nahled' | 'ostry', h: HraniceRetence): SouhrnRetence {
  return {
    rezim,
    hranice: Object.fromEntries(Object.entries(h).map(([k, d]) => [k, (d as Date).toISOString()])) as Record<keyof HraniceRetence, string>,
    hoste: { poLhute: 0, upozornit: 0, anonymizovat: 0, cekat: 0, upozorneno: 0, anonymizovano: 0, chyb: 0, ukazkaId: [] },
    auditLog: { kSmazani: 0, smazano: 0 },
    oznameni: { kSmazani: 0, smazano: 0 },
    podniky: { kSmazani: 0, smazano: 0, ukazkaId: [] },
    chyby: [],
  };
}
