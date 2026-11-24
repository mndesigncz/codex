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
  /** Až proud předá prohlížeči poslední bajt a zavře se (audit, log). Při zrušení stahování se nevolá. */
  poDokonceni?: (s: Souhrn, chybejici: string[]) => void;
}

export function proudPodkladu(data: DataExportu, o: VolbyZipu): ReadableStream<Uint8Array> {
  const fronta: Uint8Array[] = [];
  let chyba: unknown = null;
  let konec = false;
  let hotovo: { souhrn: Souhrn; chybejici: string[] } | null = null;
  // Čtečka právě stahované fotky: při zrušení proudu se zruší i ona, ať se stahování z úložiště zastaví.
  let aktivniCteni: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let zruseno = false;
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
      if (zruseno) return;
      let zdroj: ReadableStream<Uint8Array> | Uint8Array | null = null;
      try { zdroj = await o.otevri(foto.uploadId); } catch { zdroj = null; }
      if (zruseno) { if (zdroj && !(zdroj instanceof Uint8Array)) zdroj.cancel().catch(() => {}); return; }
      if (!zdroj) { chybiUrl.push(foto.url); chybejici.push(foto.cesta); continue; }
      const f = new ZipPassThrough(foto.cesta);
      zip.add(f);
      if (zdroj instanceof Uint8Array) { f.push(zdroj, true); yield; continue; }
      const cteni = zdroj.getReader();
      aktivniCteni = cteni;
      try {
        for (;;) {
          const { done, value } = await cteni.read();
          if (zruseno) return;
          if (done) break;
          if (value?.length) { f.push(value, false); yield; }
        }
      } catch {
        if (zruseno) return;
        // Spojení s úložištěm spadlo uprostřed: soubor se uzavře (ZIP zůstane platný) a v PRECTI-ME bude, že je neúplný.
        chybejici.push(`${foto.cesta} (neúplná)`); // i18n-ok (obsah pro účetní)
      } finally {
        aktivniCteni = null;
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
    hotovo = { souhrn, chybejici };
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
      if (fronta.length) {
        // Poslední kusy se jen předají; zavře se až v dalším pull, tj. když si je prohlížeč odebral.
        while (fronta.length) ctrl.enqueue(fronta.shift()!);
        return;
      }
      if (konec) {
        ctrl.close();
        // Audit až po zavření proudu — ne ve chvíli, kdy je ZIP jen dopsaný v paměti.
        if (hotovo) { const h = hotovo; hotovo = null; try { o.poDokonceni?.(h.souhrn, h.chybejici); } catch { /* audit export neshodí */ } }
      }
    },
    async cancel(duvod) {
      zruseno = true;
      // Zrušit čtečku z úložiště (ne jen uvolnit zámek) — jinak by stahování z Blobu běželo dál.
      const c = aktivniCteni;
      aktivniCteni = null;
      if (c) { try { await c.cancel(duvod); } catch { /* už zavřená */ } }
      try { await it.return(undefined); } catch { /* nic */ }
    },
  });
}
