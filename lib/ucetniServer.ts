// Podklady pro účetní — serverové kroky sdílené routami /api/ucetni/* a cronem.
//
// ZIP se skládá až při stažení (z aplikace i z odkazu), nikde se neukládá.
// Odkaz pro účetní je podepsaný (lib/ucetniOdkaz) a nese verzi odkazů podniku;
// e-mail nese jen odkaz a součty (lib/email sendUcetniEmail).

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { audit } from './audit';
import { odkazovyZaklad, sendUcetniEmail } from './email';
import { menaZRadku } from './mena';
import { podpisoveTajemstvi } from './tajemstvi';
import { celyMesic, naplanujFotky, nazevZipu, spocitejSouhrn, textVarovani, type DataExportu, type Souhrn } from './ucetniExport';
import { nactiDataExportu, nactiPodnik, otevriSoubor } from './ucetniExportDb';
import { proudPodkladu } from './ucetniZip';
import { cestaOdkazuUcetni, podepisOdkazUcetni, PLATNOST_ODKAZU_UCETNI_DNI } from './ucetniOdkaz';

const sql = neon(process.env.DATABASE_URL!);

/** Hlavička Content-Disposition s českým názvem (ASCII záloha + UTF-8). */
function priloha(nazev: string): string {
  const ascii = nazev.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nazev)}`;
}

/** Streamovaná odpověď se ZIPem podkladů. null = podnik neexistuje. */
export async function odpovedSeZipem(teamId: number, od: string, doD: string, o: { mzdy: boolean; kdo: number | null; zdroj: 'aplikace' | 'odkaz' }): Promise<NextResponse | null> {
  const data = await nactiDataExportu(teamId, od, doD, { mzdy: o.mzdy });
  if (!data) return null;
  const nazev = nazevZipu(data.podnik.nazev, od, doD);
  const proud = proudPodkladu(data, {
    vygenerovano: new Date().toISOString(),
    otevri: id => otevriSoubor(teamId, id),
    poDokonceni: (s, chybi) => {
      audit(teamId, o.kdo, o.zdroj === 'odkaz' ? 'ucetni.stazeni_odkazem' : 'ucetni.export', 'team', teamId,
        `${od} – ${doD} · ${s.fotky.celkem} fotek${chybi.length ? ` · ${chybi.length} chybí` : ''}${o.mzdy ? ' · s výplatami' : ''}`); // i18n-ok (detail auditu)
    },
  });
  return new NextResponse(proud as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': priloha(nazev),
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Náhled pro obrazovku: souhrn bez stahování fotek. */
export async function nahledPodkladu(teamId: number, od: string, doD: string, mzdy: boolean): Promise<{ data: DataExportu; souhrn: Souhrn } | null> {
  const data = await nactiDataExportu(teamId, od, doD, { mzdy });
  if (!data) return null;
  return { data, souhrn: spocitejSouhrn(data, naplanujFotky(data)) };
}

/** Podepsaný odkaz pro účetní (celá adresa) s aktuální verzí odkazů podniku. */
export async function vytvorOdkaz(teamId: number, od: string, doD: string, mzdy: boolean): Promise<{ url: string; vyprsi: string } | null> {
  const podnik = await nactiPodnik(teamId);
  if (!podnik) return null;
  let tajemstvi: string;
  try { tajemstvi = podpisoveTajemstvi(); } catch { return null; }
  const ted = new Date();
  const token = podepisOdkazUcetni({ teamId, od, do: doD, mzdy, verze: podnik.verze }, tajemstvi, ted);
  if (!token) return null;
  return { url: `${odkazovyZaklad()}${cestaOdkazuUcetni(token)}`, vyprsi: new Date(ted.getTime() + PLATNOST_ODKAZU_UCETNI_DNI * 86400000).toISOString() };
}

const MESICE_CS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']; // i18n-ok (e-mail účetní česky)

/** „říjen 2026" pro celý měsíc, jinak „2026-10-01 – 2026-10-15". */
export function popisObdobi(od: string, doD: string): string {
  const m = celyMesic(od, doD);
  return m ? `${MESICE_CS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : `${od} – ${doD}`;
}

/** Řádky souhrnu do e-mailu (jen čísla, žádná jména). */
export function radkyEmailu(s: Souhrn, mena: string): [string, string][] {
  const m = menaZRadku(mena);
  const r: [string, string][] = [];
  // i18n-ok (e-mail účetní česky)
  if (s.uzaverky.pocet) r.push(['Tržby podle uzávěrek', m.price(s.uzaverky.celkem)], ['— hotově / kartou', `${m.price(s.uzaverky.hotove)} / ${m.price(s.uzaverky.kartou)}`]); // i18n-ok
  if (s.pokladna) r.push(['Tržby z pokladny', m.price(s.pokladna.celkem)]); // i18n-ok
  if (s.pokladna) for (const x of s.pokladna.dph) r.push([`DPH ${String(x.sazba).replace('.', ',')} %`, m.price(x.dph)]); // i18n-ok
  r.push([`Účtenky (${s.uctenky.pocet})`, m.price(s.uctenky.soucet)]); // i18n-ok
  r.push([`Příjemky (${s.prijemky.pocet})`, m.price(s.prijemky.soucet)]); // i18n-ok
  if (s.uzaverky.vydaje) r.push(['Výdaje z kasy', m.price(s.uzaverky.vydaje)]); // i18n-ok
  if (s.vyplaty) r.push(['Výplaty', m.price(s.vyplaty.soucet + s.uzaverky.vyplatyZKasy)]); // i18n-ok
  r.push(['Fotky dokladů', String(s.fotky.celkem)]); // i18n-ok
  return r;
}

export type VysledekOdeslani = { ok: true; komu: string } | { ok: false; status: number; chyba: string };

/** Pošle účetní e-mail s odkazem na podklady za období. */
export async function posliUcetni(teamId: number, od: string, doD: string, mzdy: boolean, kdo: number | null): Promise<VysledekOdeslani> {
  const podnik = await nactiPodnik(teamId);
  if (!podnik) return { ok: false, status: 404, chyba: 'Podnik nenalezen.' };
  if (!podnik.email) return { ok: false, status: 400, chyba: 'Nejdřív vyplň e-mail účetní.' };
  const n = await nahledPodkladu(teamId, od, doD, mzdy);
  const odkaz = await vytvorOdkaz(teamId, od, doD, mzdy);
  if (!n || !odkaz) return { ok: false, status: 503, chyba: 'Odkaz se teď nepodařilo vytvořit. Zkus to za chvíli znovu.' };
  // Odpověď účetní má jít vedení podniku (majiteli), ne na odesílací adresu.
  let replyTo: string | null = null;
  try {
    const [r] = await sql`SELECT u.email FROM teams t JOIN users u ON u.id = t.owner_id WHERE t.id = ${teamId}`;
    replyTo = r?.email ? String(r.email) : null;
  } catch { /* bez odpovědi */ }
  const res = await sendUcetniEmail(podnik.email, {
    podnik: podnik.nazev, obdobi: popisObdobi(od, doD), url: odkaz.url, dni: PLATNOST_ODKAZU_UCETNI_DNI,
    radky: radkyEmailu(n.souhrn, podnik.mena), varovani: n.souhrn.varovani.map(textVarovani), replyTo,
  });
  if (!res.sent) return { ok: false, status: 502, chyba: 'E-mail účetní se nepodařilo odeslat. Zkontroluj adresu, nebo pošli odkaz jinak.' };
  audit(teamId, kdo, 'ucetni.poslano', 'team', teamId, `${od} – ${doD}${mzdy ? ' · s výplatami' : ''}${kdo == null ? ' · automaticky' : ''}`); // i18n-ok (detail auditu)
  return { ok: true, komu: podnik.email };
}
