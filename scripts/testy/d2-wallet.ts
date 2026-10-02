// Karta hosta v Apple Wallet a Google Wallet (D2): konfigurace, obsah karty,
// .pkpass (zip, manifest, podpis ověřený openssl) a odkaz do Google Wallet (JWT RS256).
// Certifikáty jsou vygenerované testem (self-signed), žádné skutečné klíče.

import type { Testy } from './_testy.ts';
import { generateKeyPairSync } from 'node:crypto';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import forge from 'node-forge';
import { unzipSync, strFromU8 } from 'fflate';
import { jwtVerify, importSPKI } from 'jose';
import { walletKonfigurace, appleKonfig, googleKonfig, pemZEnv } from '../../lib/walletKonfig.ts';
import { bezpecnaBarva, textNaBarve, seriove, razitkaText, zkrat, urovenVJazyce, type DataKarty } from '../../lib/walletKarta.ts';
import { passJson, sestavPkpass } from '../../lib/walletApple.ts';
import { odkazUlozitDoGoogle, loyaltyObjekt, loyaltyTrida, idObjektu, aktualizujGoogleObjekt } from '../../lib/walletGoogle.ts';
import { pngIkona } from '../../lib/walletPng.ts';

const karta: DataKarty = {
  podnik: 'Čajovna U Lípy', host: 'Jana Nováková', kod: 'ABCD-EFGH', teamId: 7, body: 120, razitka: 3, razitkaCil: 10,
  uroven: 'Stříbrný host', barva: '#2a6f4e', logoUrl: 'https://example.cz/logo.png', odkaz: 'https://www.managero.app/client/lipa', jazyk: 'cs',
};

function samopodepsany(jmeno: string, klic: forge.pki.rsa.KeyPair): forge.pki.Certificate {
  const c = forge.pki.createCertificate();
  c.publicKey = klic.publicKey; c.serialNumber = '01';
  c.validity.notBefore = new Date(Date.now() - 86400_000); c.validity.notAfter = new Date(Date.now() + 365 * 86400_000);
  const attrs = [{ name: 'commonName', value: jmeno }];
  c.setSubject(attrs); c.setIssuer(attrs);
  c.sign(klic.privateKey, forge.md.sha256.create());
  return c;
}

export default async function ({ eq, ok }: Testy) {
  // ---- konfigurace: bez klíčů se nic nenabízí ----
  eq('wallet: bez proměnných nic není zapnuté', walletKonfigurace({}), { apple: false, google: false, appleChybi: [], googleChybi: [] });
  const appleEnv = { APPLE_PASS_TYPE_ID: 'pass.x', APPLE_TEAM_ID: 'ABCDE12345', APPLE_PASS_CERT_P12_BASE64: 'AAAA', APPLE_WWDR_CERT_PEM: 'pem' };
  const googleEnv = { GOOGLE_WALLET_ISSUER_ID: '33880', GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: 'a@b.iam.gserviceaccount.com', GOOGLE_WALLET_PRIVATE_KEY: 'k' };
  ok('wallet: Apple zapnutý se všemi proměnnými (heslo smí chybět)', walletKonfigurace(appleEnv).apple && !walletKonfigurace(appleEnv).google);
  ok('wallet: Google zapnutý se všemi proměnnými', walletKonfigurace(googleEnv).google && !walletKonfigurace(googleEnv).apple);
  const pul = walletKonfigurace({ ...appleEnv, APPLE_TEAM_ID: '  ' });
  ok('wallet: napůl nastavený Apple je vypnutý a hlásí, co chybí', !pul.apple && pul.appleChybi.join() === 'APPLE_TEAM_ID');
  eq('wallet: appleKonfig bez konfigurace je null', appleKonfig({}), null);
  eq('wallet: googleKonfig bez konfigurace je null', googleKonfig({}), null);
  eq('wallet: PEM se zalomením psaným jako \\n', pemZEnv('-----BEGIN X-----\\nabc\\n-----END X-----'), '-----BEGIN X-----\nabc\n-----END X-----');

  // ---- čisté pomocné funkce ----
  eq('barva: zkratka #abc se rozepíše', bezpecnaBarva('#abc'), '#AABBCC');
  eq('barva: nesmysl dá výchozí tmavou', bezpecnaBarva('red; evil'), '#16181A');
  eq('barva: na tmavém bílý text', textNaBarve('#16181A'), '#FFFFFF');
  eq('barva: na limetkové tmavý text', textNaBarve('#C8F542'), '#16181A');
  eq('karta: sériové číslo nese kód a podnik', seriove(karta), 'ABCD-EFGH-7');
  eq('karta: razítka s cílem', razitkaText(karta), '3 / 10');
  eq('karta: razítka bez cíle', razitkaText({ razitka: 4, razitkaCil: 0 }), '4');
  eq('karta: zkrácení s třemi tečkami', zkrat('abcdefghij', 5), 'abcd…');
  eq('karta: úroveň v němčině', urovenVJazyce('Zlatý host', 'de'), 'Gold-Gast');
  eq('karta: vlastní úroveň se nepřekládá', urovenVJazyce('VIP', 'de'), 'VIP');
  const png = pngIkona(29, '#2A6F4E', '#FFFFFF');
  ok('png: platná hlavička a rozměr 29', png.subarray(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 29 && png.readUInt32BE(20) === 29);

  // ---- pass.json ----
  const pj = passJson({ passTypeId: 'pass.app.test', teamId: 'ABCDE12345' }, karta);
  eq('pass: QR obsahuje kód karty', pj.barcodes[0], { format: 'PKBarcodeFormatQR', message: 'ABCD-EFGH', messageEncoding: 'iso-8859-1', altText: 'ABCD-EFGH' });
  eq('pass: barva podniku', pj.backgroundColor, 'rgb(42, 111, 78)');
  eq('pass: body jsou hlavní pole', pj.storeCard.primaryFields[0].value, 120);
  eq('pass: úroveň je vidět', pj.storeCard.secondaryFields[1].value, 'Stříbrný host');
  ok('pass: základní úroveň nevypisuje pole úrovně', passJson({ passTypeId: 'p', teamId: 'T' }, { ...karta, uroven: '' }).storeCard.secondaryFields.length === 1);

  // ---- .pkpass: zip, manifest, podpis ----
  const kp = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const cert = samopodepsany('Pass Type ID test', kp);
  const kw = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const wwdr = samopodepsany('WWDR test', kw);
  const p12 = forge.pkcs12.toPkcs12Asn1(kp.privateKey, [cert], 'heslo', { algorithm: '3des' });
  const cfg = {
    passTypeId: 'pass.app.test', teamId: 'ABCDE12345', heslo: 'heslo',
    p12Base64: Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary').toString('base64'),
    wwdrPem: forge.pki.certificateToPem(wwdr),
  };
  const zip = sestavPkpass(cfg, karta);
  const soubory = unzipSync(zip);
  eq('pkpass: obsahuje všechny soubory', Object.keys(soubory).sort(), ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png', 'manifest.json', 'pass.json', 'signature']);
  const manifest = JSON.parse(strFromU8(soubory['manifest.json']));
  const shoda = Object.keys(manifest).every(j => createHash('sha1').update(soubory[j]).digest('hex') === manifest[j]);
  ok('pkpass: manifest sedí (SHA-1 každého souboru)', shoda && Object.keys(manifest).length === 6);
  eq('pkpass: pass.json v balíčku je ten z passJson', JSON.parse(strFromU8(soubory['pass.json'])), JSON.parse(JSON.stringify(passJson(cfg, karta))));
  ok('pkpass: signature je DER (začíná SEQUENCE)', soubory.signature[0] === 0x30);

  // Podpis ověří openssl (detached PKCS#7); řetěz self-signed se nevaliduje (-noverify).
  let opensslK = true;
  try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); } catch { opensslK = false; }
  if (opensslK) {
    const dir = mkdtempSync(join(tmpdir(), 'pkpass-'));
    try {
      writeFileSync(join(dir, 'manifest.json'), soubory['manifest.json']);
      writeFileSync(join(dir, 'signature'), soubory.signature);
      let vysledek = 'selhalo';
      try {
        execFileSync('openssl', ['smime', '-verify', '-inform', 'DER', '-in', join(dir, 'signature'), '-content', join(dir, 'manifest.json'), '-noverify', '-binary', '-out', join(dir, 'out')], { stdio: 'pipe' });
        vysledek = 'ok';
      } catch (e: any) { vysledek = String(e?.stderr ?? e); }
      eq('pkpass: podpis ověří openssl smime -verify', vysledek, 'ok');
      // Změněný manifest podpis nesmí projít.
      writeFileSync(join(dir, 'manifest.json'), strFromU8(soubory['manifest.json']) + ' ');
      let po = 'prosel';
      try { execFileSync('openssl', ['smime', '-verify', '-inform', 'DER', '-in', join(dir, 'signature'), '-content', join(dir, 'manifest.json'), '-noverify', '-binary', '-out', join(dir, 'out2')], { stdio: 'pipe' }); } catch { po = 'zamitnuto'; }
      eq('pkpass: pozměněný manifest podpis neprojde', po, 'zamitnuto');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  } else {
    // Bez openssl aspoň struktura: forge načte PKCS#7 a najde oba certifikáty.
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(Buffer.from(soubory.signature).toString('binary')))) as any;
    ok('pkpass: podpis nese certifikát i WWDR (openssl není k dispozici)', p7.certificates.length === 2);
  }

  // ---- Google Wallet ----
  const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const gcfg = {
    issuerId: '3388000000000000001', email: 'wallet@projekt.iam.gserviceaccount.com',
    privateKeyPem: par.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  };
  const o = loyaltyObjekt(gcfg, karta);
  eq('google: objekt má QR s kódem karty', o.barcode, { type: 'QR_CODE', value: 'ABCD-EFGH', alternateText: 'ABCD-EFGH' });
  eq('google: body jsou zůstatek', o.loyaltyPoints.balance, { int: 120 });
  eq('google: jméno hosta', o.accountName, 'Jana Nováková');
  ok('google: objekt patří třídě podniku', o.classId === loyaltyTrida(gcfg, karta).id && o.id.startsWith(gcfg.issuerId + '.'));
  ok('google: id objektu má jen povolené znaky', /^[0-9]+\.[A-Za-z0-9._-]+$/.test(idObjektu(gcfg, karta)));
  const url = await odkazUlozitDoGoogle(gcfg, karta, 'https://www.managero.app', 1_900_000_000);
  ok('google: odkaz je pay.google.com/gp/v/save/<JWT>', url.startsWith('https://pay.google.com/gp/v/save/') && url.slice(33).split('.').length === 3);
  const jwt = url.slice('https://pay.google.com/gp/v/save/'.length);
  const verejny = await importSPKI(par.publicKey.export({ type: 'spki', format: 'pem' }) as string, 'RS256');
  const { payload, protectedHeader } = await jwtVerify(jwt, verejny, { algorithms: ['RS256'] });
  eq('google: JWT je RS256', protectedHeader.alg, 'RS256');
  eq('google: JWT iss/aud/typ', [payload.iss, payload.aud, payload.typ], [gcfg.email, 'google', 'savetowallet']);
  eq('google: JWT nese třídu i objekt', [(payload as any).payload.loyaltyClasses.length, (payload as any).payload.loyaltyObjects.length], [1, 1]);
  eq('google: aktualizace bez konfigurace se tiše přeskočí', await aktualizujGoogleObjekt(null, karta), false);
}
