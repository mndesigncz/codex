// Apple Wallet: balíček .pkpass (zip: pass.json, manifest.json, signature, ikony).
//
// manifest.json drží SHA-1 každého souboru, `signature` je PKCS#7 detached podpis
// manifestu certifikátem Pass Type ID (s přiloženým certifikátem Apple WWDR).
// Podepisuje node-forge, zip skládá fflate, PNG ikony zapisuje lib/walletPng.
//
// Omezení: pass se po přidání do Wallet sám neaktualizuje. Apple obnovu bodů tlačí
// přes vlastní web service (webServiceURL, registrace zařízení, APNs push), kterou
// tu nemáme; karta v telefonu proto ukazuje stav z okamžiku přidání. QR s kódem karty
// se nemění, takže skenování u kasy funguje vždy a obsluha vidí aktuální body ze
// serveru. Aktuální stav se do telefonu dostane smazáním a novým přidáním karty.
// Bez účtu Apple Developer se to nedá ověřit na zařízení; struktura je podle
// dokumentace PassKit a podpis ověřuje test přes `openssl smime -verify`.

import { createHash } from 'node:crypto';
import forge from 'node-forge';
import { zipSync, strToU8 } from 'fflate';
import { barvaRgb, bezpecnaBarva, POPISKY_KARTY, razitkaText, seriove, textNaBarve, urovenVJazyce, zkrat, type DataKarty } from './walletKarta.ts';
import { pngIkona } from './walletPng.ts';
import type { AppleKonfig } from './walletKonfig.ts';

const rgb = (hex: string) => { const [r, g, b] = barvaRgb(hex); return `rgb(${r}, ${g}, ${b})`; };

/** Obsah pass.json (věrnostní karta, typ storeCard). */
export function passJson(cfg: Pick<AppleKonfig, 'passTypeId' | 'teamId'>, d: DataKarty) {
  const p = POPISKY_KARTY[d.jazyk];
  const pozadi = bezpecnaBarva(d.barva);
  const popredi = textNaBarve(pozadi);
  const uroven = d.uroven ? urovenVJazyce(d.uroven, d.jazyk) : '';
  const barcode = { format: 'PKBarcodeFormatQR', message: d.kod, messageEncoding: 'iso-8859-1', altText: d.kod };
  return {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeId,
    teamIdentifier: cfg.teamId,
    serialNumber: seriove(d),
    organizationName: zkrat(d.podnik, 60),
    description: `${p.karta} — ${zkrat(d.podnik, 60)}`,
    logoText: zkrat(d.podnik, 30),
    backgroundColor: rgb(pozadi),
    foregroundColor: rgb(popredi),
    labelColor: rgb(popredi),
    barcodes: [barcode],
    barcode, // starší iOS (pod 9) čte jen jednotné číslo
    storeCard: {
      primaryFields: [{ key: 'body', label: p.body, value: Math.max(0, Math.round(d.body)) }],
      secondaryFields: [
        { key: 'razitka', label: p.razitka, value: razitkaText(d) },
        ...(uroven ? [{ key: 'uroven', label: p.uroven, value: uroven }] : []),
      ],
      auxiliaryFields: [{ key: 'host', label: p.host, value: zkrat(d.host, 60) }],
      backFields: [
        { key: 'kod', label: p.kod, value: d.kod },
        ...(d.odkaz ? [{ key: 'odkaz', label: p.odkaz, value: d.odkaz, attributedValue: `<a href="${d.odkaz.replace(/"/g, '%22')}">${p.odkaz}</a>` }] : []),
      ],
    },
  };
}

/** Přečte .p12: certifikát Pass Type ID a jeho privátní klíč. Při špatném heslu či souboru vyhodí chybu. */
export function nactiP12(p12Base64: string, heslo: string): { cert: forge.pki.Certificate; klic: forge.pki.PrivateKey } {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(Buffer.from(p12Base64, 'base64').toString('binary')));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, heslo);
  const certy = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map(b => b.cert).filter(Boolean) as forge.pki.Certificate[];
  const klice = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ].map(b => b.key).filter(Boolean) as forge.pki.PrivateKey[];
  if (!certy.length || !klice.length) throw new Error('V .p12 chybí certifikát nebo klíč.');
  return { cert: certy[0], klic: klice[0] };
}

/** Odpojený (detached) podpis PKCS#7 v DER; zprostředkující certifikát Apple WWDR se přikládá. */
export function podepisManifest(manifest: Uint8Array, cfg: Pick<AppleKonfig, 'p12Base64' | 'heslo' | 'wwdrPem'>): Uint8Array {
  const { cert, klic } = nactiP12(cfg.p12Base64, cfg.heslo);
  const wwdr = forge.pki.certificateFromPem(cfg.wwdrPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(Buffer.from(manifest).toString('binary'));
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key: klic as forge.pki.rsa.PrivateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as any },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
}

/** Hotový .pkpass. Ikony jsou vykreslené z barvy podniku (logo z adresy se nestahuje, ať karta nezávisí na cizím serveru). */
export function sestavPkpass(cfg: AppleKonfig, d: DataKarty): Uint8Array {
  const pozadi = bezpecnaBarva(d.barva);
  const popredi = textNaBarve(pozadi);
  const soubory: Record<string, Uint8Array> = {
    'pass.json': strToU8(JSON.stringify(passJson(cfg, d))),
    'icon.png': pngIkona(29, pozadi, popredi),
    'icon@2x.png': pngIkona(58, pozadi, popredi),
    'icon@3x.png': pngIkona(87, pozadi, popredi),
    'logo.png': pngIkona(50, pozadi, popredi),
    'logo@2x.png': pngIkona(100, pozadi, popredi),
  };
  const manifestObj: Record<string, string> = {};
  for (const [jmeno, data] of Object.entries(soubory)) manifestObj[jmeno] = createHash('sha1').update(data).digest('hex');
  const manifest = strToU8(JSON.stringify(manifestObj));
  return zipSync({ ...soubory, 'manifest.json': manifest, signature: podepisManifest(manifest, cfg) }, { level: 6 });
}
