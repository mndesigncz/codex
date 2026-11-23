// ZIP s podklady pro účetní jako proud — nikdy celý v paměti.
//
// fflate `Zip`: fotky (JPEG, PNG, PDF jsou už zkomprimované) jdou přes
// `ZipPassThrough` po kouscích tak, jak přicházejí z úložiště; texty (CSV,
// PRECTI-ME) přes `ZipDeflate`. Proud je „pull": další fotka se začne číst až
// ve chvíli, kdy si prohlížeč odebral předchozí data (tlak zpět po souborech).
// Fotka, kterou nejde načíst, export neshodí — zapíše se do PRECTI-ME
// a sloupec „Soubor" u ní řekne „chybí".
//
// Zdroj fotek se předává (`otevri`), takže modul nemá databázi a test ho pustí
// s falešnými daty (scripts/testy/ucetni-export.ts).

import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import { csvListu, naplanujFotky, precteMe, sestavListy, spocitejSouhrn, type DataExportu, type Souhrn } from './ucetniExport.ts';
import { zapisXlsx } from './xlsx.ts';

export type OtevriSoubor = (uploadId: number) => Promise<ReadableStream<Uint8Array> | Uint8Array | null>;

export interface VolbyZipu {
  otevri: OtevriSoubor;
  /** Čas vytvoření do PRECTI-ME (ISO). */
  vygenerovano: string;
  /** Po dopsání posledního bajtu (audit, log). */
  poDokonceni?: (s: Souhrn, chybejici: string[]) => void;
}

export function proudPodkladu(data: DataExportu, o: VolbyZipu): ReadableStream<Uint8Array> {
  const fronta: Uint8Array[] = [];
  let chyba: unknown = null;
  let konec = false;
  const zip = new Zip((err, kus, posledni) => {
    if (err) { chyba = err; return; }
    if (kus.length) fronta.push(kus);
    if (posledni) konec = true;
  });

  const pridejText = (cesta: string, text: string) => {
    const f = new ZipDeflate(cesta, { level: 6 });
    zip.add(f);
    f.push(strToU8(text), true);
  };

  async function* kroky(): AsyncGenerator<void> {
    const plan = naplanujFotky(data);
    const chybiUrl: string[] = [];
    const chybejici: string[] = [];
    for (const foto of plan.fotky) {
      let zdroj: ReadableStream<Uint8Array> | Uint8Array | null = null;
      try { zdroj = await o.otevri(foto.uploadId); } catch { zdroj = null; }
      if (!zdroj) { chybiUrl.push(foto.url); chybejici.push(foto.cesta); continue; }
      const f = new ZipPassThrough(foto.cesta);
      zip.add(f);
      if (zdroj instanceof Uint8Array) { f.push(zdroj, true); yield; continue; }
      const cteni = zdroj.getReader();
      try {
        for (;;) {
          const { done, value } = await cteni.read();
          if (done) break;
          if (value?.length) { f.push(value, false); yield; }
        }
      } catch {
        // Spojení s úložištěm spadlo uprostřed: soubor se uzavře (ZIP zůstane platný) a v PRECTI-ME bude, že je neúplný.
        chybejici.push(`${foto.cesta} (neúplná)`); // i18n-ok (obsah pro účetní)
      } finally {
        try { cteni.releaseLock(); } catch { /* už uvolněno */ }
      }
      f.push(new Uint8Array(0), true);
      yield;
    }
    const souhrn = spocitejSouhrn(data, plan, chybiUrl);
    const listy = sestavListy(data, plan, souhrn, { chybiVUlozisti: chybiUrl });
    for (const l of listy) { pridejText(l.soubor, csvListu(l)); yield; }
    // Sešit je sám ZIP — znovu ho komprimovat nemá smysl.
    const xlsx = new ZipPassThrough('podklady.xlsx');
    zip.add(xlsx);
    xlsx.push(zapisXlsx(listy), true);
    yield;
    pridejText('PRECTI-ME.txt', precteMe(data, souhrn, listy, { vygenerovano: o.vygenerovano, chybejici }));
    zip.end();
    o.poDokonceni?.(souhrn, chybejici);
  }

  const it = kroky();
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        while (!fronta.length && !konec && !chyba) {
          const r = await it.next();
          if (r.done) break;
        }
      } catch (e) { chyba = e; }
      if (chyba) { ctrl.error(chyba); return; }
      while (fronta.length) ctrl.enqueue(fronta.shift()!);
      if (konec) ctrl.close();
    },
    async cancel() { try { await it.return(undefined); } catch { /* nic */ } },
  });
}
